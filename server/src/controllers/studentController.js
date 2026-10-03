const db = require('../config/database');
const submissionController = require('./submissionController');
const materialsController = require('./materialsController');
const performanceTaskController = require('./performanceTaskController');

/**
 * 1. Student Personal Dashboard Feed (FR-03, FR-04, FR-06)
 * Returns strictly personal metrics: upcoming quizzes, own score history, and assigned interventions.
 */
async function getStudentDashboard(req, res, next) {
  try {
    const studentId = req.user.id;

    const [quizzesRes, interventionsRes, scoresRes, tasksRes] = await Promise.all([
      db.query(`SELECT id, quarter, title, description, time_limit_minutes, total_points, passing_score FROM quizzes WHERE is_published = 1 AND is_active = 1 ORDER BY quarter ASC, id ASC`),
      db.query(
        `SELECT ri.*, lc.melc_code, lc.description as competency_desc, lc.ilaw_tag,
                m.title as remedial_material_title, m.file_type as remedial_file_type, m.storage_url as remedial_storage_url
         FROM remedial_interventions ri
         JOIN learning_competencies lc ON ri.competency_id = lc.id
         LEFT JOIN instructional_materials m ON ri.remedial_material_id = m.id
         WHERE ri.student_id = ?
         ORDER BY ri.assigned_at DESC`,
        [studentId]
      ),
      db.query(
        `SELECT s.id, s.quiz_id, q.title as quiz_title, s.score_obtained, s.percentage, s.is_passed, s.submitted_at, s.blur_count, s.is_flagged_for_cheating
         FROM quiz_submissions s
         JOIN quizzes q ON s.quiz_id = q.id
         WHERE s.student_id = ? AND s.status = 'SUBMITTED'
         ORDER BY s.submitted_at DESC`,
        [studentId]
      ),
      db.query(
        `SELECT pt.*, pts.id as submission_id, pts.status as submission_status, pts.score, pts.feedback, pts.submitted_at as my_submitted_at
         FROM performance_tasks pt
         LEFT JOIN performance_task_submissions pts ON pt.id = pts.task_id AND pts.student_id = ?
         ORDER BY pt.created_at DESC`,
        [studentId]
      )
    ]);

    res.json({
      success: true,
      role: 'STUDENT',
      student: {
        id: req.user.id,
        email: req.user.email,
        section: req.user.section
      },
      upcoming_quizzes: quizzesRes.rows,
      assigned_interventions: interventionsRes.rows,
      personal_scores: scoresRes.rows,
      performance_tasks: tasksRes.rows
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 2. Student Lessons & Materials View (FR-12, FR-45..46)
 */
async function getStudentLessons(req, res, next) {
  try {
    const { competency_id, file_type } = req.query;
    let query = `
      SELECT m.*, lc.melc_code, lc.ilaw_tag, lc.description as competency_description
      FROM instructional_materials m
      JOIN learning_competencies lc ON m.competency_id = lc.id
      WHERE 1=1
    `;
    const params = [];
    if (competency_id) {
      query += ` AND m.competency_id = ?`;
      params.push(competency_id);
    }
    if (file_type) {
      query += ` AND m.file_type = ?`;
      params.push(file_type.toUpperCase());
    }
    query += ` ORDER BY m.created_at DESC`;

    const { rows: materials } = await db.query(query, params);
    res.json({ success: true, count: materials.length, materials });
  } catch (err) {
    next(err);
  }
}

/**
 * 3. Student Personal Score History (FR-22)
 */
async function getPersonalScores(req, res, next) {
  try {
    const studentId = req.user.id;
    const { rows: scores } = await db.query(
      `SELECT s.*, q.title as quiz_title, q.total_points as quiz_total_points, q.passing_score as quiz_passing_score,
              c.topic_title, c.ilaw_category
       FROM quiz_submissions s
       JOIN quizzes q ON s.quiz_id = q.id
       LEFT JOIN competencies c ON q.competency_id = c.id
       WHERE s.student_id = ? AND s.status = 'SUBMITTED'
       ORDER BY s.submitted_at DESC`,
      [studentId]
    );

    res.json({ success: true, count: scores.length, scores });
  } catch (err) {
    next(err);
  }
}

/**
 * 4. Student Own Submission Detail (FR-22)
 * Strictly verifies that the submission belongs to the requesting student.
 */
async function getOwnSubmissionDetail(req, res, next) {
  try {
    const { id } = req.params;
    const studentId = req.user.id;

    const { rows: subRows } = await db.query(
      `SELECT s.*, q.title as quiz_title, q.total_points, q.passing_score,
              lc.melc_code, lc.description as competency_desc
       FROM quiz_submissions s
       JOIN quizzes q ON s.quiz_id = q.id
       JOIN learning_competencies lc ON q.competency_id = lc.id
       WHERE s.id = ? AND s.student_id = ? LIMIT 1`,
      [id, studentId]
    );

    if (subRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found or unauthorized access to peer submission.'
      });
    }

    const { rows: answers } = await db.query(
      `SELECT a.*, q.question_text, q.question_type, q.options_json
       FROM quiz_submission_answers a
       JOIN quiz_questions q ON a.question_id = q.id
       WHERE a.submission_id = ?
       ORDER BY q.order_index ASC`,
      [id]
    );

    res.json({
      success: true,
      submission: subRows[0],
      answers
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 5. Student Assigned Interventions (Ways Forward) (FR-36, FR-37)
 */
async function getAssignedInterventions(req, res, next) {
  try {
    const studentId = req.user.id;
    const { rows: interventions } = await db.query(
      `SELECT ri.*, lc.melc_code, lc.description as competency_desc, lc.ilaw_tag,
              m.title as remedial_material_title, m.file_type as remedial_file_type, m.storage_url as remedial_storage_url,
              s.score_obtained as trigger_score, s.percentage as trigger_percentage, s.submitted_at as trigger_date
       FROM remedial_interventions ri
       JOIN learning_competencies lc ON ri.competency_id = lc.id
       JOIN quiz_submissions s ON ri.trigger_submission_id = s.id
       LEFT JOIN instructional_materials m ON ri.remedial_material_id = m.id
       WHERE ri.student_id = ?
       ORDER BY ri.assigned_at DESC`,
      [studentId]
    );

    res.json({ success: true, count: interventions.length, interventions });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStudentDashboard,
  getStudentLessons,
  getPersonalScores,
  getOwnSubmissionDetail,
  getAssignedInterventions,
  // Delegated to submissionController (which binds studentId from req.user.id)
  startQuiz: submissionController.startQuiz,
  submitQuiz: submissionController.submitQuiz,
  // Performance task dropzone (binds studentId from req.user.id)
  submitPerformanceTask: performanceTaskController.submitTask,
  // Offline sync (binds studentId from req.user.id)
  syncOfflineReadLogs: materialsController.syncReadLogs
};
