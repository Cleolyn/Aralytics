const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const fs = require('fs/promises');
const path = require('path');
const uploadRoot = path.resolve(__dirname, '../../uploads/performance-tasks');

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

    if (isStudent) {
      const { rows: subs } = await db.query(
        `SELECT * FROM performance_task_submissions WHERE task_id = ? AND student_id = ? LIMIT 1`,
        [id, userId]
      );
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
    const { file_name, file_url, file_size_bytes, notes, file_content_base64 } = req.body;

    if (!file_name) {
      return res.status(400).json({
        success: false,
        message: 'file_name is required for submission dropzone.'
      });
    }

    // Verify task exists
    const { rows: tasks } = await db.query(`SELECT id FROM performance_tasks WHERE id = ? LIMIT 1`, [id]);
    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Performance task not found.' });
    }

    const subId = `pts-${uuidv4().slice(0, 8)}`;
    let effectiveFileUrl = file_url || `/api/performance-tasks/files/${encodeURIComponent(file_name)}`;
    let effectiveSize = Number(file_size_bytes) || 1024 * 500;
    if (file_content_base64 !== undefined) {
      const extension = path.extname(file_name).toLowerCase();
      const allowedExts = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.zip', '.mp4', '.png', '.jpg', '.jpeg'];
      if (!allowedExts.includes(extension) || typeof file_content_base64 !== 'string' ||
          file_content_base64.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file_content_base64)) {
        return res.status(400).json({ success: false, message: 'Choose a valid document, media, or archive file up to 5 MB.' });
      }
      const content = Buffer.from(file_content_base64, 'base64');
      const validHeader = extension === '.pdf'
        ? content.subarray(0, 5).toString() === '%PDF-'
        : ['.docx', '.pptx', '.zip'].includes(extension)
        ? content.subarray(0, 2).toString() === 'PK'
        : content.length > 0;
      if (!content.length || content.length > 5 * 1024 * 1024 || !validHeader) {
        return res.status(400).json({ success: false, message: 'The file is invalid or larger than 5 MB.' });
      }
      const storedName = `${uuidv4()}${extension}`;
      await fs.mkdir(uploadRoot, { recursive: true });
      await fs.writeFile(path.join(uploadRoot, storedName), content, { flag: 'wx' });
      effectiveFileUrl = `/api/performance-tasks/files/${storedName}`;
      effectiveSize = content.length;
    }

    // Upsert submission
    const { rows: existing } = await db.query(
      `SELECT id FROM performance_task_submissions WHERE task_id = ? AND student_id = ? LIMIT 1`,
      [id, studentId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE performance_task_submissions 
         SET file_name = ?, file_url = ?, file_size_bytes = ?, notes = ?, 
             status = 'SUBMITTED', score = NULL, feedback = NULL, graded_at = NULL, submitted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [file_name, effectiveFileUrl, effectiveSize, notes || null, existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO performance_task_submissions 
         (id, task_id, student_id, file_name, file_url, file_size_bytes, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
        [subId, id, studentId, file_name, effectiveFileUrl, effectiveSize, notes || null]
      );
    }

    const { rows: updated } = await db.query(
      `SELECT * FROM performance_task_submissions WHERE task_id = ? AND student_id = ? LIMIT 1`,
      [id, studentId]
    );

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
      `SELECT student_id, file_name FROM performance_task_submissions WHERE file_url = ? LIMIT 1`,
      [`/api/performance-tasks/files/${filename}`]
    );
    if (!rows.length || (req.user.role !== 'TEACHER' && rows[0].student_id !== req.user.id)) {
      return res.status(404).json({ success: false, message: 'Submission file not found.' });
    }
    try { await fs.access(path.join(uploadRoot, filename)); }
    catch { return res.status(404).json({ success: false, message: 'This older submission has no uploaded file. Please submit the actual document.' }); }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(path.join(uploadRoot, filename), path.basename(rows[0].file_name));
  } catch (err) { next(err); }
}

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  submitTask,
  getTaskSubmissions,
  gradeSubmission,
  downloadFile
};
