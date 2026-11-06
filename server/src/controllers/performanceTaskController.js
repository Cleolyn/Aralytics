const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const path = require('path');
const storage = require('../services/uploadStorage');
const files = require('../services/fileService');
const notifier = require('../services/notifier');
const { contactOf } = require('../services/accountAdminService');
const uploadRoot = path.resolve(__dirname, '../../uploads/performance-tasks');

/** Adds download_url to submissions the viewer is allowed to open (null otherwise). */
function addDownloadUrls(req, submissions) {
  const legacyAllowed = (item, ctx) => {
    if (req.user.role === 'ADMIN') return true;
    if (req.user.role === 'TEACHER') return files.teacherCanReadSubmission(req.user.id, item.student_id, item.task_id, ctx);
    return item.student_id === req.user.id;
  };
  return files.decorateUrls(files.envOf(req), req.user, submissions, { urlKey: 'file_url', legacyKind: 'performance-tasks', legacyAllowed });
}

const teaching = require('../services/teachingContentService');

/**
 * GET /api/performance-tasks
 * Retrieve performance tasks with optional quarter filtering.
 * Attaches student's own submission if requested by a student.
 */
async function getAllTasks(req, res, next) {
  try {
    const { quarter } = req.query;
    const isStudent = req.user.role === 'STUDENT';
    const userId = req.user.id;

    let query = `
      SELECT pt.*, c.topic_title, c.ilaw_category, c.description as competency_desc,
             u.first_name || ' ' || u.last_name as teacher_name
      FROM performance_tasks pt
      JOIN competencies c ON pt.competency_id = c.id
      JOIN users u ON pt.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (isStudent) {
      // Students see un-archived tasks made by their approved adviser only.
      const scope = await teaching.adviserFilter(req.user, 'pt.created_by');
      query += ` AND pt.archived_at IS NULL${scope.sql}`;
      params.push(...scope.params);
    }
    if (quarter) {
      query += ` AND pt.quarter = ?`;
      params.push(quarter);
    }

    query += ` ORDER BY pt.created_at DESC`;

    const { rows: tasks } = await db.query(query, params);

    // If student, attach their personal submission
    if (isStudent) {
      const { rows: studentSubmissions } = await db.query(
        `SELECT * FROM performance_task_submissions WHERE student_id = ?`,
        [userId]
      );
      await addDownloadUrls(req, studentSubmissions);
      const subMap = new Map();
      studentSubmissions.forEach(sub => subMap.set(sub.task_id, sub));

      const enriched = tasks.map(task => ({
        ...task,
        my_submission: subMap.get(task.id) || null
      }));

      return res.json({ success: true, count: enriched.length, tasks: enriched });
    }

    // If teacher, attach submission counts
    const { rows: subCounts } = await db.query(
      `SELECT task_id, 
              COUNT(*) as total_submissions,
              SUM(CASE WHEN status = 'GRADED' THEN 1 ELSE 0 END) as graded_count,
              SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) as pending_count
       FROM performance_task_submissions
       GROUP BY task_id`
    );
    const countMap = new Map();
    subCounts.forEach(c => countMap.set(c.task_id, c));

    const enriched = tasks.map(task => ({
      ...task,
      stats: countMap.get(task.id) || { total_submissions: 0, graded_count: 0, pending_count: 0 }
    }));

    res.json({ success: true, count: enriched.length, tasks: enriched });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/performance-tasks/:id
 * Retrieve single performance task details.
 */
async function getTaskById(req, res, next) {
  try {
    const { id } = req.params;
    const isStudent = req.user.role === 'STUDENT';
    const userId = req.user.id;

    const { rows: tasks } = await db.query(
      `SELECT pt.*, c.topic_title, c.ilaw_category, c.description as competency_desc,
              u.first_name || ' ' || u.last_name as teacher_name
       FROM performance_tasks pt
       JOIN competencies c ON pt.competency_id = c.id
       JOIN users u ON pt.created_by = u.id
       WHERE pt.id = ? LIMIT 1`,
      [id]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Performance task not found.' });
    }

    const task = tasks[0];

    if (isStudent && (task.archived_at || !(await teaching.canSee(req.user, task.created_by)))) {
      return res.status(404).json({ success: false, message: 'Performance task not found.' });
    }

    if (isStudent) {
      const { rows: subs } = await db.query(
        `SELECT * FROM performance_task_submissions WHERE task_id = ? AND student_id = ? LIMIT 1`,
        [id, userId]
      );
      await addDownloadUrls(req, subs);
      task.my_submission = subs[0] || null;
      return res.json({ success: true, task });
    }

    // Teacher: include all submissions
    const { rows: submissions } = await db.query(
      `SELECT pts.*, 
              u.first_name || ' ' || u.last_name as student_name,
              u.lrn_or_id,
              COALESCE(u.section_id, u.section) as section
       FROM performance_task_submissions pts
       JOIN users u ON pts.student_id = u.id
       WHERE pts.task_id = ?
       ORDER BY pts.submitted_at DESC`,
      [id]
    );

    await addDownloadUrls(req, submissions);
    task.submissions = submissions;
    res.json({ success: true, task });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/performance-tasks
 * Create new performance task (TEACHER only - FR-44)
 */
async function createTask(req, res, next) {
  try {
    const { quarter, competency_id, title, instructions, rubric_criteria, total_points, due_date } = req.body;
    const teacherId = req.user.id;

    if (!quarter || !competency_id || !title || !instructions) {
      return res.status(400).json({
        success: false,
        message: 'quarter, competency_id, title, and instructions are required fields.'
      });
    }

    const taskId = `pt-${uuidv4().slice(0, 8)}`;
    const points = Number(total_points) || 100;

    await db.query(
      `INSERT INTO performance_tasks 
       (id, quarter, competency_id, title, instructions, rubric_criteria, total_points, due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, quarter, competency_id, title, instructions, rubric_criteria || null, points, due_date || null, teacherId]
    );

    const { rows: created } = await db.query(`SELECT * FROM performance_tasks WHERE id = ?`, [taskId]);

    res.status(201).json({
      success: true,
      message: 'Performance task created successfully.',
      task: created[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/performance-tasks/:id/submit
 * Student dropzone submission (FR-43)
 */
async function submitTask(req, res, next) {
  try {
    const { id } = req.params;
    const studentId = req.user.id;
    const { file_name, file_url, file_size_bytes, notes, file_id, file_content_base64 } = req.body;

    if (file_content_base64 !== undefined) {
      return res.status(400).json({ success: false, message: 'Upload the file with POST /api/files, then send its file_id.' });
    }
    if (!file_id && !file_name) {
      return res.status(400).json({
        success: false,
        message: 'file_id is required for submission dropzone.'
      });
    }

    // Verify task exists
    const { rows: tasks } = await db.query(`SELECT id, created_by, archived_at FROM performance_tasks WHERE id = ? LIMIT 1`, [id]);
    if (tasks.length === 0 || !(await teaching.canSee(req.user, tasks[0].created_by))) {
      return res.status(404).json({ success: false, message: 'Performance task not found.' });
    }
    if (tasks[0].archived_at) {
      return res.status(409).json({ success: false, code: 'TASK_ARCHIVED', message: 'This task has been archived and no longer accepts submissions.' });
    }

    const upload = file_id ? await files.requireAttachable(file_id, req.user, 'submission') : null;
    if (upload && upload.task_id !== id) {
      return res.status(400).json({ success: false, message: 'That upload belongs to a different task. Upload the file again.' });
    }
    const effectiveName = upload ? upload.original_name : file_name;
    const effectiveFileUrl = upload ? `/api/files/${upload.id}/content` : (file_url || `/api/performance-tasks/files/${encodeURIComponent(file_name)}`);
    const effectiveSize = upload ? Number(upload.size_bytes) : (Number(file_size_bytes) || 1024 * 500);

    // Upsert submission
    const { rows: existing } = await db.query(
      `SELECT id FROM performance_task_submissions WHERE task_id = ? AND student_id = ? LIMIT 1`,
      [id, studentId]
    );
    let submissionId = existing[0]?.id;

    if (existing.length > 0) {
      await db.query(
        `UPDATE performance_task_submissions
         SET file_name = ?, file_url = ?, file_size_bytes = ?, notes = ?,
             status = 'SUBMITTED', score = NULL, feedback = NULL, graded_at = NULL, submitted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [effectiveName, effectiveFileUrl, effectiveSize, notes || null, submissionId]
      );
    } else {
      submissionId = `pts-${uuidv4().slice(0, 8)}`;
      await db.query(
        `INSERT INTO performance_task_submissions
         (id, task_id, student_id, file_name, file_url, file_size_bytes, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
        [submissionId, id, studentId, effectiveName, effectiveFileUrl, effectiveSize, notes || null]
      );
    }

    // The newest upload replaces any earlier file for this submission.
    if (upload) await files.attach(upload.id, req.user, 'submission', { submissionId, taskId: id });
    await files.deleteForSubmission(files.envOf(req), submissionId, upload?.id);

    const { rows: updated } = await db.query(
      `SELECT * FROM performance_task_submissions WHERE task_id = ? AND student_id = ? LIMIT 1`,
      [id, studentId]
    );

    await addDownloadUrls(req, updated);
    res.json({
      success: true,
      message: 'Performance task output submitted successfully.',
      submission: updated[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/performance-tasks/:id/submissions
 * Teacher queue of submissions for a given task (FR-44)
 */
async function getTaskSubmissions(req, res, next) {
  try {
    const { id } = req.params;

    const { rows: submissions } = await db.query(
      `SELECT pts.*, 
              u.first_name || ' ' || u.last_name as student_name,
              u.lrn_or_id,
              COALESCE(u.section_id, u.section) as section,
              pt.title as task_title,
              pt.total_points,
              pt.rubric_criteria
       FROM performance_task_submissions pts
       JOIN users u ON pts.student_id = u.id
       JOIN performance_tasks pt ON pts.task_id = pt.id
       WHERE pts.task_id = ?
       ORDER BY pts.submitted_at DESC`,
      [id]
    );

    await addDownloadUrls(req, submissions);
    res.json({ success: true, count: submissions.length, submissions });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/performance-tasks/submissions/:id/grade
 * Teacher rubric-based grading and feedback hook (FR-44)
 */
async function gradeSubmission(req, res, next) {
  try {
    const { id } = req.params;
    const { score, feedback } = req.body;

    if (score === undefined || score === null) {
      return res.status(400).json({ success: false, message: 'score is required.' });
    }

    const numericScore = Number(score);
    if (isNaN(numericScore) || numericScore < 0) {
      return res.status(400).json({ success: false, message: 'score must be a non-negative number.' });
    }

    const { rows: sub } = await db.query(
      `SELECT pts.*, pt.total_points FROM performance_task_submissions pts 
       JOIN performance_tasks pt ON pts.task_id = pt.id 
       WHERE pts.id = ? LIMIT 1`,
      [id]
    );

    if (sub.length === 0) {
      return res.status(404).json({ success: false, message: 'Performance task submission not found.' });
    }

    if (numericScore > sub[0].total_points) {
      return res.status(400).json({ success: false, message: `Score cannot exceed ${sub[0].total_points}.` });
    }

    await db.query(
      `UPDATE performance_task_submissions
       SET score = ?, feedback = ?, status = 'GRADED', graded_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [numericScore, feedback || null, id]
    );

    const { rows: updated } = await db.query(
      `SELECT * FROM performance_task_submissions WHERE id = ? LIMIT 1`,
      [id]
    );

    try {
      const student = await contactOf(updated[0].student_id);
      const { rows: tasks } = await db.query('SELECT title FROM performance_tasks WHERE id = ?', [updated[0].task_id]);
      if (student) {
        notifier.notify(req, 'performance_task.graded', {
          to: student.email, name: student.name, task_title: tasks[0]?.title,
          score: numericScore, total_points: sub[0].total_points, feedback: feedback || ''
        });
      }
    } catch (notifyErr) {
      console.error('[NOTIFIER] grade notification skipped:', notifyErr.message);
    }

    res.json({
      success: true,
      message: 'Submission graded successfully and updated in gradebook.',
      submission: updated[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/performance-tasks/files/:filename
 * Authenticated download of actual submitted documents
 */
async function downloadFile(req, res, next) {
  try {
    const { filename } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid file name.' });
    }
    const { rows } = await db.query(
      `SELECT student_id, task_id, file_name FROM performance_task_submissions WHERE file_url = ? LIMIT 1`,
      [`/api/performance-tasks/files/${filename}`]
    );
    // A signed link (req.signedAccess) already proves access; otherwise the viewer must own the
    // submission, teach the student, or have created the task.
    let allowed = Boolean(req.signedAccess);
    if (rows.length && !allowed) {
      const { role, id: userId } = req.user;
      allowed = role === 'ADMIN' || rows[0].student_id === userId ||
        (role === 'TEACHER' && await files.teacherCanReadSubmission(userId, rows[0].student_id, rows[0].task_id));
    }
    if (!rows.length || !allowed) {
      return res.status(404).json({ success: false, message: 'Submission file not found.' });
    }
    const object = await storage.get(req, 'performance-tasks', uploadRoot, filename);
    if (!object) return res.status(404).json({ success: false, message: 'This older submission has no uploaded file. Please submit the actual document.' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.attachment(path.basename(rows[0].file_name));
    res.send(object);
  } catch (err) { next(err); }
}

const updateTask = async (req, res) => res.json({ success: true, task: await teaching.updateTask(req.user, req.params.id, req.body || {}) });
const deleteTask = async (req, res) => {
  const force = ['1', 'true'].includes(String(req.query.force));
  res.json({ success: true, ...(await teaching.deleteTask(files.envOf(req), req.user, req.params.id, { force })) });
};
const archiveTask = async (req, res) => res.json({ success: true, task: await teaching.setTaskArchived(req.user, req.params.id, true) });
const restoreTask = async (req, res) => res.json({ success: true, task: await teaching.setTaskArchived(req.user, req.params.id, false) });

module.exports = {
  updateTask,
  deleteTask,
  archiveTask,
  restoreTask,
  getAllTasks,
  getTaskById,
  createTask,
  submitTask,
  getTaskSubmissions,
  gradeSubmission,
  downloadFile
};
