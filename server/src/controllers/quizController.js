const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

async function getAllQuizzes(req, res, next) {
  try {
    const isTeacher = req.user.role === 'TEACHER';
    const studentId = req.user.id;

    let query = `
      SELECT q.*, lc.melc_code, lc.ilaw_tag, lc.description as competency_desc,
             u.first_name as teacher_first_name, u.last_name as teacher_last_name
      FROM quizzes q
      JOIN learning_competencies lc ON q.competency_id = lc.id
      JOIN users u ON q.created_by = u.id
    `;

    if (!isTeacher) {
      query += ` WHERE q.is_published = 1`;
    }

    query += ` ORDER BY q.created_at DESC`;

    const { rows: quizzes } = await db.query(query);

    // If student, attach submission status for each quiz
    if (!isTeacher) {
      const { rows: submissions } = await db.query(
        `SELECT quiz_id, status, score_obtained, percentage, is_passed, is_flagged_for_cheating, submitted_at
         FROM quiz_submissions WHERE student_id = ?`,
        [studentId]
      );

      const subMap = new Map();
      submissions.forEach((s) => subMap.set(s.quiz_id, s));

      const enriched = quizzes.map((quiz) => ({
        ...quiz,
        submission: subMap.get(quiz.id) || null
      }));

      return res.json({ success: true, quizzes: enriched });
    }

    res.json({ success: true, quizzes });
  } catch (err) {
    next(err);
  }
}

async function getQuizById(req, res, next) {
  try {
    const { id } = req.params;
    const isTeacher = req.user.role === 'TEACHER';

    const { rows: quizRows } = await db.query(
      `SELECT q.*, lc.melc_code, lc.ilaw_tag, lc.description as competency_desc
       FROM quizzes q
       JOIN learning_competencies lc ON q.competency_id = lc.id
       WHERE q.id = ? LIMIT 1`,
      [id]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const quiz = quizRows[0];

    const { rows: questionRows } = await db.query(
      `SELECT id, quiz_id, question_text, question_type, options_json, points, order_index
              ${isTeacher ? ', correct_answer' : ''}
       FROM quiz_questions
       WHERE quiz_id = ?
       ORDER BY order_index ASC`,
      [id]
    );

    const questions = questionRows.map((q) => ({
      ...q,
      options: q.options_json ? JSON.parse(q.options_json) : []
    }));

    // If student, also return current submission status if already started
    let currentSubmission = null;
    if (!isTeacher) {
      const { rows: subRows } = await db.query(
        `SELECT * FROM quiz_submissions WHERE quiz_id = ? AND student_id = ? LIMIT 1`,
        [id, req.user.id]
      );
      if (subRows.length > 0) {
        currentSubmission = subRows[0];
      }
    }

    res.json({
      success: true,
      quiz: {
        ...quiz,
        questions,
        currentSubmission
      }
    });
  } catch (err) {
    next(err);
  }
}

async function createQuiz(req, res, next) {
  try {
    const {
      competency_id,
      title,
      instructions,
      time_limit_minutes,
      passing_score,
      max_blur_limit,
      questions
    } = req.body;

    if (!competency_id || !title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'competency_id, title, and at least one question are required.'
      });
    }

    const quizId = `quiz-${uuidv4()}`;
    const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
    const passScore = Number(passing_score) || Math.ceil(totalPoints * 0.75);

    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO quizzes 
         (id, competency_id, title, instructions, time_limit_minutes, total_points, passing_score, max_blur_limit, is_published, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          quizId,
          competency_id,
          title.trim(),
          instructions || '',
          Number(time_limit_minutes) || 20,
          totalPoints,
          passScore,
          Number(max_blur_limit) || 3,
          req.user.id
        ]
      );

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const questionId = `q-${uuidv4()}`;
        await tx.query(
          `INSERT INTO quiz_questions
           (id, quiz_id, question_text, question_type, options_json, correct_answer, points, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            questionId,
            quizId,
            q.question_text.trim(),
            q.question_type || 'MULTIPLE_CHOICE',
            q.options ? JSON.stringify(q.options) : null,
            String(q.correct_answer).trim(),
            Number(q.points) || 1,
            i + 1
          ]
        );
      }
    });

    res.status(201).json({
      success: true,
      message: 'Assessment created and published successfully.',
      quizId
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllQuizzes,
  getQuizById,
  createQuiz
};
