const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

// In-memory debounce cache to reject rapid-fire duplicate blur events within 1.5 seconds
const eventDebounceCache = new Map();

async function logProctoringEvent(req, res, next) {
  try {
    const { submission_id, event_type, duration_unfocused_ms } = req.body;

    if (!submission_id || !event_type) {
      return res.status(400).json({
        success: false,
        message: 'submission_id and event_type are required.'
      });
    }

    const validEvents = ['WINDOW_BLUR', 'TAB_HIDDEN', 'FULLSCREEN_EXIT', 'DEVTOOLS_OPEN'];
    if (!validEvents.includes(event_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid event_type. Allowed: ${validEvents.join(', ')}`
      });
    }

    // Debounce check per submission_id + event_type
    const cacheKey = `${submission_id}_${event_type}`;
    const now = Date.now();
    const lastTimestamp = eventDebounceCache.get(cacheKey) || 0;

    if (now - lastTimestamp < 1500) {
      // Debounced duplicate event
      return res.json({
        success: true,
        debounced: true,
        message: 'Duplicate proctoring event debounced.'
      });
    }
    eventDebounceCache.set(cacheKey, now);

    // Verify submission exists and belongs to current user (if student)
    const { rows: subRows } = await db.query(
      `SELECT s.*, q.max_blur_limit
       FROM quiz_submissions s
       JOIN quizzes q ON s.quiz_id = q.id
       WHERE s.id = ? LIMIT 1`,
      [submission_id]
    );

    if (subRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission session not found.' });
    }

    const submission = subRows[0];
    if (req.user.role === 'STUDENT' && submission.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized submission session.' });
    }

    if (submission.status !== 'IN_PROGRESS') {
      return res.json({
        success: false,
        message: 'Quiz session is already concluded. Events no longer logged.'
      });
    }

    const logId = `proc-${uuidv4()}`;
    const newBlurCount = submission.blur_count + 1;
    const shouldFlag = newBlurCount >= submission.max_blur_limit;

    await db.transaction(async (tx) => {
      // 1. Insert audit log
      await tx.query(
        `INSERT INTO quiz_proctoring_logs 
         (id, submission_id, event_type, duration_unfocused_ms)
         VALUES (?, ?, ?, ?)`,
        [logId, submission_id, event_type, Number(duration_unfocused_ms) || 0]
      );

      // 2. Increment blur counter & update flag status
      await tx.query(
        `UPDATE quiz_submissions 
         SET blur_count = ?, is_flagged_for_cheating = ?
         WHERE id = ?`,
        [newBlurCount, shouldFlag ? 1 : 0, submission_id]
      );
    });

    res.json({
      success: true,
      blur_count: newBlurCount,
      is_flagged_for_cheating: shouldFlag,
      remaining_warnings: Math.max(0, submission.max_blur_limit - newBlurCount),
      message: shouldFlag 
        ? 'Maximum blur limit reached. Session flagged for teacher proctoring review.'
        : `Proctoring event recorded. ${Math.max(0, submission.max_blur_limit - newBlurCount)} warning(s) remaining.`
    });
  } catch (err) {
    next(err);
  }
}

async function getProctoringAuditTrail(req, res, next) {
  try {
    const { submissionId } = req.params;

    const { rows: logs } = await db.query(
      `SELECT * FROM quiz_proctoring_logs 
       WHERE submission_id = ? 
       ORDER BY timestamp DESC`,
      [submissionId]
    );

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  logProctoringEvent,
  getProctoringAuditTrail
};
