const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

async function startQuiz(req, res, next) {
  try {
    const { quiz_id } = req.body;
    const studentId = req.user.id;

    if (!quiz_id) {
      return res.status(400).json({ success: false, message: 'quiz_id is required.' });
    }

    // Check if quiz exists and is published
    const { rows: quizRows } = await db.query(
      `SELECT * FROM quizzes WHERE id = ? AND is_published = 1 LIMIT 1`,
      [quiz_id]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Active quiz not found or not published.' });
    }

    // Check existing submission
    const { rows: existingSubmissions } = await db.query(
      `SELECT * FROM quiz_submissions WHERE quiz_id = ? AND student_id = ? LIMIT 1`,
      [quiz_id, studentId]
    );

    if (existingSubmissions.length > 0) {
      const sub = existingSubmissions[0];
      return res.json({
        success: true,
        message: sub.status === 'SUBMITTED' ? 'Quiz already submitted.' : 'Resuming active quiz session.',
        submission: sub
      });
    }

    // Create new submission session
    const submissionId = `sub-${uuidv4()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    await db.query(
      `INSERT INTO quiz_submissions 
       (id, quiz_id, student_id, started_at, score_obtained, percentage, is_passed, blur_count, is_flagged_for_cheating, status)
       VALUES (?, ?, ?, ?, 0, 0.00, 0, 0, 0, 'IN_PROGRESS')`,
      [submissionId, quiz_id, studentId, now]
    );

    const { rows: created } = await db.query(
      `SELECT * FROM quiz_submissions WHERE id = ? LIMIT 1`,
      [submissionId]
    );

    res.status(201).json({
      success: true,
      message: 'Assessment session started successfully.',
      submission: created[0]
    });
  } catch (err) {
    next(err);
  }
}

async function submitQuiz(req, res, next) {
  try {
    const { submission_id, answers } = req.body;
    const studentId = req.user.id;

    if (!submission_id || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: 'submission_id and answers array are required.'
      });
    }

    // 1. Fetch submission and quiz
    const { rows: subRows } = await db.query(
      `SELECT s.*, q.competency_id, q.total_points, q.passing_score, q.max_blur_limit, q.is_post_test, q.intervention_id
       FROM quiz_submissions s
       JOIN quizzes q ON s.quiz_id = q.id
       WHERE s.id = ? AND s.student_id = ? LIMIT 1`,
      [submission_id, studentId]
    );

    if (subRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Valid submission session not found.' });
    }

    const submission = subRows[0];
    if (submission.status === 'SUBMITTED') {
      return res.status(400).json({ success: false, message: 'Quiz has already been submitted.' });
    }

    // 2. Fetch all questions with correct answers
    const { rows: questions } = await db.query(
      `SELECT id, question_type, correct_answer, points 
       FROM quiz_questions WHERE quiz_id = ?`,
      [submission.quiz_id]
    );

    const questionMap = new Map();
    questions.forEach((q) => questionMap.set(q.id, q));

    // 3. Multi-format Score calculation (FR-16: MC, TF, MATCHING, IDENTIFICATION, SITUATIONAL, PISA_LIKE)
    let totalScore = 0;
    const answerRecords = [];

    for (const ans of answers) {
      const q = questionMap.get(ans.question_id);
      if (!q) continue;

      const studentAnsRaw = String(ans.selected_answer || '').trim();
      const correctAnsRaw = String(q.correct_answer || '').trim();
      let isCorrect = false;

      if (q.question_type === 'IDENTIFICATION') {
        const normStudent = studentAnsRaw.toLowerCase().replace(/['".,]/g, '').trim();
        const aliases = correctAnsRaw.split('|').map(s => s.toLowerCase().replace(/['".,]/g, '').trim());
        isCorrect = aliases.includes(normStudent);
      } else if (q.question_type === 'MATCHING') {
        try {
          const studentObj = typeof ans.selected_answer === 'object' ? ans.selected_answer : JSON.parse(studentAnsRaw);
          const correctObj = JSON.parse(correctAnsRaw);
          let allMatch = true;
          const keys = Object.keys(correctObj);
          for (const k of keys) {
            if (String(studentObj[k] || '').trim().toLowerCase() !== String(correctObj[k] || '').trim().toLowerCase()) {
              allMatch = false;
              break;
            }
          }
          isCorrect = allMatch;
        } catch (e) {
          isCorrect = studentAnsRaw.toLowerCase() === correctAnsRaw.toLowerCase();
        }
      } else if (q.question_type === 'TRUE_FALSE') {
        const sNorm = studentAnsRaw.toUpperCase();
        const cNorm = correctAnsRaw.toUpperCase();
        const isTrueEquiv = (v) => v === 'TRUE' || v === 'TAMA' || v === 'T' || v === '1';
        const isFalseEquiv = (v) => v === 'FALSE' || v === 'MALI' || v === 'F' || v === '0';
        isCorrect = (isTrueEquiv(sNorm) && isTrueEquiv(cNorm)) || (isFalseEquiv(sNorm) && isFalseEquiv(cNorm));
      } else {
        // MULTIPLE_CHOICE, SITUATIONAL, PISA_LIKE
        isCorrect = studentAnsRaw.toLowerCase() === correctAnsRaw.toLowerCase();
      }

      const pointsAwarded = isCorrect ? q.points : 0;
      totalScore += pointsAwarded;

      answerRecords.push({
        id: `ans-${uuidv4()}`,
        submission_id,
        question_id: q.id,
        selected_answer: typeof ans.selected_answer === 'object' ? JSON.stringify(ans.selected_answer) : String(ans.selected_answer || ''),
        is_correct: isCorrect ? 1 : 0,
        points_awarded: pointsAwarded
      });
    }


    const totalPossiblePoints = submission.total_points || 1;
    const percentage = Number(((totalScore / totalPossiblePoints) * 100).toFixed(2));
    const isPassed = totalScore >= submission.passing_score ? 1 : 0;
    const isFlagged = submission.blur_count >= submission.max_blur_limit ? 1 : 0;

    // Determine Competency Mastery Tier
    let masteryStatus = 'CRITICAL_INTERVENTION';
    if (percentage >= 80.0) {
      masteryStatus = 'MASTERED';
    } else if (percentage >= 60.0) {
      masteryStatus = 'NEEDS_REINFORCEMENT';
    }

    const needsIntervention = percentage < 75.0;
    let remedialTriggered = false;
    let remedialInterventionId = null;

    // Find best matching remedial material for this competency
    const { rows: remedialMaterials } = await db.query(
      `SELECT id FROM instructional_materials 
       WHERE competency_id = ? 
       ORDER BY created_at ASC LIMIT 1`,
      [submission.competency_id]
    );
    const remedialMaterialId = remedialMaterials.length > 0 ? remedialMaterials[0].id : null;

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Atomic execution: Submissions -> Answers -> Mastery -> Intervention
    await db.transaction(async (tx) => {
      // A. Update submission record
      await tx.query(
        `UPDATE quiz_submissions 
         SET submitted_at = ?, score_obtained = ?, percentage = ?, is_passed = ?, is_flagged_for_cheating = ?, status = 'SUBMITTED'
         WHERE id = ?`,
        [now, totalScore, percentage, isPassed, isFlagged, submission_id]
      );

      // B. Insert answers
      for (const rec of answerRecords) {
        await tx.query(
          `INSERT INTO quiz_submission_answers 
           (id, submission_id, question_id, selected_answer, is_correct, points_awarded)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [rec.id, rec.submission_id, rec.question_id, rec.selected_answer, rec.is_correct, rec.points_awarded]
        );
      }

      // C. Update or Insert student_competency_mastery
      const { rows: existingMastery } = await tx.query(
        `SELECT id FROM student_competency_mastery 
         WHERE student_id = ? AND competency_id = ? LIMIT 1`,
        [studentId, submission.competency_id]
      );

      if (existingMastery.length > 0) {
        await tx.query(
          `UPDATE student_competency_mastery 
           SET mastery_score = ?, mastery_status = ?, last_assessed_at = ?
           WHERE id = ?`,
          [percentage, masteryStatus, now, existingMastery[0].id]
        );
      } else {
        const masteryId = `mst-${uuidv4()}`;
        await tx.query(
          `INSERT INTO student_competency_mastery 
           (id, student_id, competency_id, mastery_score, mastery_status, last_assessed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [masteryId, studentId, submission.competency_id, percentage, masteryStatus, now]
        );
      }

      // D. Automated Intervention Pipeline Trigger (Ways Forward)
      if (needsIntervention) {
        remedialInterventionId = `intv-${uuidv4()}`;
        await tx.query(
          `INSERT INTO remedial_interventions 
           (id, student_id, competency_id, trigger_submission_id, remedial_material_id, status, ilaw_phase, assigned_at)
           VALUES (?, ?, ?, ?, ?, 'ASSIGNED', 'WAYS_FORWARD', ?)`,
          [remedialInterventionId, studentId, submission.competency_id, submission_id, remedialMaterialId, now]
        );
        remedialTriggered = true;
      } else if (isPassed) {
        // Post-test or successful reassessment: Mark existing interventions as completed (FR-37)
        await tx.query(
          `UPDATE remedial_interventions
           SET status = 'COMPLETED', completed_at = ?
           WHERE student_id = ? AND competency_id = ? AND status = 'ASSIGNED'`,
          [now, studentId, submission.competency_id]
        );
        await tx.query(
          `UPDATE interventions
           SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
           WHERE student_id = ? AND competency_id = ? AND status IN ('ASSIGNED', 'RECOMMENDED')`,
          [studentId, submission.competency_id]
        );
      }

    });

    res.json({
      success: true,
      message: 'Assessment completed and streamed directly into gradebook.',
      results: {
        submission_id,
        score_obtained: totalScore,
        total_points: submission.total_points,
        percentage,
        is_passed: Boolean(isPassed),
        blur_count: submission.blur_count,
        is_flagged_for_cheating: Boolean(isFlagged),
        mastery_status: masteryStatus,
        intervention_triggered: remedialTriggered,
        remedial_intervention_id: remedialInterventionId,
        feedback: isPassed
          ? 'Binabati kita! Naipasa mo ang pagtatasa at nakamit ang kasanayan.'
          : 'Kailangan ng dagdag na pagsasanay. Awtomatikong inihanda ang Remedial Modules sa Ways Forward.'
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getSubmissionById(req, res, next) {
  try {
    const { id } = req.params;

    const { rows: subRows } = await db.query(
      `SELECT s.*, q.title as quiz_title, q.total_points, q.passing_score,
              lc.melc_code, lc.description as competency_desc,
              u.first_name, u.last_name, u.lrn_or_id, u.section
       FROM quiz_submissions s
       JOIN quizzes q ON s.quiz_id = q.id
       JOIN learning_competencies lc ON q.competency_id = lc.id
       JOIN users u ON s.student_id = u.id
       WHERE s.id = ? LIMIT 1`,
      [id]
    );

    if (subRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const submission = subRows[0];

    // Check authorization: Student can only view their own
    if (req.user.role === 'STUDENT' && submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to submission.' });
    }

    const { rows: answers } = await db.query(
      `SELECT a.*, q.question_text, q.correct_answer, q.question_type, q.options_json
       FROM quiz_submission_answers a
       JOIN quiz_questions q ON a.question_id = q.id
       WHERE a.submission_id = ?
       ORDER BY q.order_index ASC`,
      [id]
    );

    const { rows: proctorLogs } = await db.query(
      `SELECT * FROM quiz_proctoring_logs 
       WHERE submission_id = ? 
       ORDER BY timestamp ASC`,
      [id]
    );

    res.json({
      success: true,
      submission,
      answers: answers.map((a) => ({
        ...a,
        options: a.options_json ? JSON.parse(a.options_json) : []
      })),
      proctorLogs
    });
  } catch (err) {
    next(err);
  }
}

async function getGradebookData(req, res, next) {
  try {
    const { section, quiz_id } = req.query;

    let query = `
      SELECT s.id as submission_id, s.score_obtained, s.percentage, s.is_passed, 
             s.blur_count, s.is_flagged_for_cheating, s.status, s.submitted_at,
             q.id as quiz_id, q.title as quiz_title, q.total_points, q.passing_score,
             lc.melc_code, lc.ilaw_tag,
             u.id as student_id, u.lrn_or_id, u.first_name, u.last_name, u.section,
             scm.mastery_status
      FROM quiz_submissions s
      JOIN quizzes q ON s.quiz_id = q.id
      JOIN learning_competencies lc ON q.competency_id = lc.id
      JOIN users u ON s.student_id = u.id
      LEFT JOIN student_competency_mastery scm ON scm.student_id = u.id AND scm.competency_id = lc.id
      WHERE s.status = 'SUBMITTED'
    `;
    const params = [];

    if (section) {
      query += ` AND u.section = ?`;
      params.push(section);
    }
    if (quiz_id) {
      query += ` AND q.id = ?`;
      params.push(quiz_id);
    }

    query += ` ORDER BY u.section ASC, u.last_name ASC, s.submitted_at DESC`;

    const { rows: entries } = await db.query(query, params);

    res.json({
      success: true,
      count: entries.length,
      entries
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  startQuiz,
  submitQuiz,
  getSubmissionById,
  getGradebookData
};
