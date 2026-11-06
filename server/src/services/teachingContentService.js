/**
 * Teaching content management: edit, delete, archive and restore quizzes and
 * performance tasks, plus the "students only see their adviser's content" rule.
 *
 * Gradebook data is never destroyed. A quiz with any attempt can only be archived;
 * a performance task with graded work can only be archived.
 */
const crypto = require('node:crypto');
const db = require('../config/database');
const files = require('./fileService');
const { fail } = require('./enrollmentService');

async function initializeTeachingContentColumns() {
  for (const table of ['quizzes', 'performance_tasks']) {
    try { await db.query(`ALTER TABLE ${table} ADD COLUMN archived_at TIMESTAMP NULL;`); }
    catch { /* Column already exists */ }
  }
}

/** Express handler wrapper. Errors that carry `extra` fields send them in the body. */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(err => {
  if (err && err.extra && err.status) {
    return res.status(err.status).json({ success: false, code: err.code, message: err.message, ...err.extra });
  }
  return next(err);
});
const failWith = (status, message, code, extra) => Object.assign(fail(status, message, code), { extra });

// ---------------------------------------------------------------------------
// Adviser scope (students only see content made by their approved adviser)
// ---------------------------------------------------------------------------
const isStudent = user => user?.role === 'STUDENT';

/** The teacher id a student may see content from, or null (no adviser, or not a student). */
const adviserOf = user => (isStudent(user) ? files.approvedAdviser(user.id) : Promise.resolve(null));

/** True when `createdBy` is visible to the caller. Staff see everything. */
async function canSee(user, createdBy) {
  if (!isStudent(user)) return true;
  const adviser = await files.approvedAdviser(user.id);
  return Boolean(adviser) && adviser === createdBy;
}

/** SQL fragment + params that limit `column` to the student's adviser. */
async function adviserFilter(user, column) {
  if (!isStudent(user)) return { sql: '', params: [] };
  const adviser = await files.approvedAdviser(user.id);
  return adviser ? { sql: ` AND ${column} = ?`, params: [adviser] } : { sql: ' AND 1 = 0', params: [] };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function assertCanManage(user, row) {
  if (user.role === 'ADMIN' || row.created_by === user.id) return;
  throw fail(403, 'Only the teacher who created this can change it.', 'NOT_OWNER');
}

const text = (value, label, max, { required = false } = {}) => {
  if (typeof value !== 'string' && value != null) throw fail(400, `${label} must be text.`, 'INVALID_INPUT');
  const clean = String(value ?? '').trim();
  if (required && !clean) throw fail(400, `${label} cannot be empty.`, 'INVALID_INPUT');
  if (clean.length > max) throw fail(400, `${label} must be ${max} characters or fewer.`, 'INVALID_INPUT');
  return clean;
};
const positiveInt = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw fail(400, `${label} must be a whole number of 1 or more.`, 'INVALID_INPUT');
  return number;
};
const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------
/** Students who have a submission or attempt on the quiz (a quiz with any is locked). */
async function attemptCount(quizId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT student_id FROM quiz_submissions WHERE quiz_id = ?
       UNION SELECT student_id FROM quiz_attempts WHERE quiz_id = ?
     ) AS attempts`, [quizId, quizId]);
  return Number(rows[0]?.n || 0);
}

/** quiz_id -> attempt count, for list views. */
async function attemptCounts() {
  const { rows } = await db.query(
    `SELECT quiz_id, COUNT(*) AS n FROM (
       SELECT quiz_id, student_id FROM quiz_submissions
       UNION SELECT quiz_id, student_id FROM quiz_attempts
     ) AS attempts GROUP BY quiz_id`);
  return new Map(rows.map(row => [row.quiz_id, Number(row.n)]));
}

async function loadQuiz(id) {
  const { rows } = await db.query('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) throw fail(404, 'That quiz was not found. It may have been deleted.', 'QUIZ_NOT_FOUND');
  return rows[0];
}

async function quizView(id) {
  const quiz = await loadQuiz(id);
  return { ...quiz, attempt_count: await attemptCount(id) };
}

function cleanQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) throw fail(400, 'Add at least one question.', 'INVALID_INPUT');
  return questions.map((q, index) => {
    const label = `Question ${index + 1}`;
    const questionText = text(q?.question_text, `${label} text`, 2000, { required: true });
    if (q?.correct_answer === undefined || q?.correct_answer === null || !String(q.correct_answer).trim()) {
      throw fail(400, `${label} needs a correct answer.`, 'INVALID_INPUT');
    }
    return {
      question_text: questionText,
      question_type: q.question_type || 'MULTIPLE_CHOICE',
      options: q.options ? JSON.stringify(q.options) : null,
      correct_answer: String(q.correct_answer).trim(),
      points: Number(q.points) || 1
    };
  });
}

async function updateQuiz(user, id, body = {}) {
  const quiz = await loadQuiz(id);
  assertCanManage(user, quiz);
  const attempts = await attemptCount(id);

  const locked = [];
  if (attempts > 0) {
    if (has(body, 'questions')) locked.push('questions');
    if (has(body, 'competency_id') && body.competency_id !== quiz.competency_id) locked.push('competency_id');
    if (has(body, 'passing_score') && Number(body.passing_score) !== Number(quiz.passing_score)) locked.push('passing_score');
    if (locked.length) {
      throw failWith(409, 'Students have already taken this quiz, so its questions, topic and passing score can no longer change. You can still edit the title, instructions, time limit and tab-switch limit, or archive the quiz and create a new one.', 'QUIZ_LOCKED', { locked_fields: locked });
    }
  }

  const next = {
    title: has(body, 'title') ? text(body.title, 'Title', 255, { required: true }) : quiz.title,
    instructions: has(body, 'instructions') ? text(body.instructions, 'Instructions', 5000) : quiz.instructions,
    time_limit_minutes: has(body, 'time_limit_minutes') ? positiveInt(body.time_limit_minutes, 'Time limit') : quiz.time_limit_minutes,
    max_blur_limit: has(body, 'max_blur_limit') ? positiveInt(body.max_blur_limit, 'Tab-switch limit') : quiz.max_blur_limit,
    competency_id: quiz.competency_id,
    total_points: quiz.total_points,
    passing_score: quiz.passing_score
  };
  if (has(body, 'competency_id') && body.competency_id !== quiz.competency_id) {
    const { rows } = await db.query('SELECT 1 AS found FROM learning_competencies WHERE id = ? LIMIT 1', [body.competency_id]);
    if (!rows[0]) throw fail(400, 'Choose a valid topic for this quiz.', 'INVALID_INPUT');
    next.competency_id = body.competency_id;
  }
  const questions = has(body, 'questions') ? cleanQuestions(body.questions) : null;
  if (questions) next.total_points = questions.reduce((sum, q) => sum + q.points, 0);
  if (has(body, 'passing_score')) next.passing_score = positiveInt(body.passing_score, 'Passing score');
  else if (questions) next.passing_score = Math.min(Number(quiz.passing_score) || Math.ceil(next.total_points * 0.75), next.total_points);
  if (next.passing_score > next.total_points) throw fail(400, `Passing score cannot be more than the quiz's ${next.total_points} total points.`, 'INVALID_INPUT');

  await db.transaction(async tx => {
    await tx.query(
      `UPDATE quizzes SET title = ?, instructions = ?, time_limit_minutes = ?, max_blur_limit = ?,
         competency_id = ?, total_points = ?, passing_score = ? WHERE id = ?`,
      [next.title, next.instructions, next.time_limit_minutes, next.max_blur_limit, next.competency_id, next.total_points, next.passing_score, id]);
    if (questions) {
      await tx.query('DELETE FROM quiz_questions WHERE quiz_id = ?', [id]);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await tx.query(
          `INSERT INTO quiz_questions (id, quiz_id, question_text, question_type, options_json, correct_answer, points, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [`q-${crypto.randomUUID()}`, id, q.question_text, q.question_type, q.options, q.correct_answer, q.points, i + 1]);
      }
    }
  });
  return quizView(id);
}

async function deleteQuiz(user, id) {
  const quiz = await loadQuiz(id);
  assertCanManage(user, quiz);
  const attempts = await attemptCount(id);
  if (attempts > 0) {
    throw failWith(409, 'Students have already taken this quiz, so it cannot be deleted. Archive it instead to hide it from students and keep the scores.', 'QUIZ_HAS_ATTEMPTS', { attempts });
  }
  await db.transaction(async tx => {
    await tx.query('DELETE FROM quiz_questions WHERE quiz_id = ?', [id]);
    await tx.query('DELETE FROM quizzes WHERE id = ?', [id]);
  });
  return { id };
}

async function setQuizArchived(user, id, archived) {
  const quiz = await loadQuiz(id);
  assertCanManage(user, quiz);
  await db.query('UPDATE quizzes SET archived_at = ?, is_published = ? WHERE id = ?', [archived ? files.utc() : null, archived ? 0 : 1, id]);
  return quizView(id);
}

// ---------------------------------------------------------------------------
// Performance tasks
// ---------------------------------------------------------------------------
async function loadTask(id) {
  const { rows } = await db.query('SELECT * FROM performance_tasks WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) throw fail(404, 'That task was not found. It may have been deleted.', 'TASK_NOT_FOUND');
  return rows[0];
}

async function submissionStats(taskId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'GRADED' THEN 1 ELSE 0 END) AS graded
     FROM performance_task_submissions WHERE task_id = ?`, [taskId]);
  return { submissions: Number(rows[0]?.total || 0), graded: Number(rows[0]?.graded || 0) };
}

async function updateTask(user, id, body = {}) {
  const task = await loadTask(id);
  assertCanManage(user, task);
  const { submissions } = await submissionStats(id);

  if (submissions > 0) {
    const locked = [];
    if (has(body, 'total_points') && Number(body.total_points) !== Number(task.total_points)) locked.push('total_points');
    if (has(body, 'competency_id') && body.competency_id !== task.competency_id) locked.push('competency_id');
    if (has(body, 'quarter') && body.quarter !== task.quarter) locked.push('quarter');
    if (locked.length) {
      throw failWith(409, 'Students have already submitted work for this task, so its points, topic and quarter can no longer change. You can still edit the title, instructions, rubric and due date.', 'TASK_LOCKED', { locked_fields: locked });
    }
  }

  const next = {
    title: has(body, 'title') ? text(body.title, 'Title', 255, { required: true }) : task.title,
    instructions: has(body, 'instructions') ? text(body.instructions, 'Instructions', 5000, { required: true }) : task.instructions,
    rubric_criteria: has(body, 'rubric_criteria') ? (text(body.rubric_criteria, 'Rubric', 5000) || null) : task.rubric_criteria,
    due_date: has(body, 'due_date') ? (body.due_date || null) : task.due_date,
    total_points: task.total_points,
    competency_id: task.competency_id,
    quarter: task.quarter
  };
  if (next.due_date && Number.isNaN(Date.parse(next.due_date))) throw fail(400, 'Enter a valid due date.', 'INVALID_INPUT');
  if (has(body, 'total_points') && Number(body.total_points) !== Number(task.total_points)) next.total_points = positiveInt(body.total_points, 'Total points');
  if (has(body, 'quarter') && body.quarter !== task.quarter) next.quarter = text(body.quarter, 'Quarter', 10, { required: true });
  if (has(body, 'competency_id') && body.competency_id !== task.competency_id) {
    const { rows } = await db.query('SELECT 1 AS found FROM competencies WHERE id = ? LIMIT 1', [body.competency_id]);
    if (!rows[0]) throw fail(400, 'Choose a valid topic for this task.', 'INVALID_INPUT');
    next.competency_id = body.competency_id;
  }

  await db.query(
    `UPDATE performance_tasks SET title = ?, instructions = ?, rubric_criteria = ?, due_date = ?,
       total_points = ?, competency_id = ?, quarter = ? WHERE id = ?`,
    [next.title, next.instructions, next.rubric_criteria, next.due_date, next.total_points, next.competency_id, next.quarter, id]);
  const { rows } = await db.query('SELECT * FROM performance_tasks WHERE id = ?', [id]);
  return rows[0];
}

async function deleteTask(env, user, id, { force = false } = {}) {
  const task = await loadTask(id);
  assertCanManage(user, task);
  const stats = await submissionStats(id);
  if (stats.graded > 0) {
    throw failWith(409, 'Some submissions for this task are already graded, so it cannot be deleted. Archive it instead to hide it from students and keep the grades.', 'TASK_HAS_GRADES', stats);
  }
  if (stats.submissions > 0 && !force) {
    throw failWith(409, 'Students have already submitted work for this task. Delete the submissions too, or archive the task instead.', 'TASK_HAS_SUBMISSIONS', stats);
  }

  let removed = 0;
  const { rows: subs } = await db.query('SELECT id FROM performance_task_submissions WHERE task_id = ?', [id]);
  for (const sub of subs) removed += await files.deleteForSubmission(env, sub.id);
  const { rows: leftovers } = await db.query('SELECT * FROM files WHERE task_id = ?', [id]);
  removed += await files.deleteFiles(env, leftovers);
  await db.transaction(async tx => {
    await tx.query('DELETE FROM performance_task_submissions WHERE task_id = ?', [id]);
    await tx.query('DELETE FROM performance_tasks WHERE id = ?', [id]);
  });
  return { id, removed_files: removed };
}

async function setTaskArchived(user, id, archived) {
  const task = await loadTask(id);
  assertCanManage(user, task);
  await db.query('UPDATE performance_tasks SET archived_at = ? WHERE id = ?', [archived ? files.utc() : null, id]);
  return loadTask(id);
}

module.exports = {
  initializeTeachingContentColumns, wrap,
  adviserOf, canSee, adviserFilter, assertCanManage,
  attemptCount, attemptCounts, updateQuiz, deleteQuiz, setQuizArchived,
  submissionStats, updateTask, deleteTask, setTaskArchived
};
