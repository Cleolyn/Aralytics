/**
 * Admin account management: people directory, suspension, instructor revocation and
 * account deletion. Every write records an audit row (see auditLog.js).
 */
const db = require('../config/database');
const files = require('./fileService');
const audit = require('./auditLog');
const { fail } = require('./enrollmentService');

const PAGE_SIZE = 50;
const ROLES = ['STUDENT', 'TEACHER', 'ADMIN'];
const STATUSES = ['ACTIVE', 'SUSPENDED'];
const REVOKED_ENROLLMENT_REASON = "Your adviser's instructor access ended. Ask your new adviser for a class code.";

async function initializeAccountAdminTables() {
  // MySQL lacks IF NOT EXISTS for columns and indexes, so each statement stands alone.
  for (const statement of [
    `ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'`,
    'ALTER TABLE users ADD COLUMN suspended_reason VARCHAR(300) NULL',
    'ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP NULL'
  ]) {
    try { await db.query(statement); } catch { /* column already exists */ }
  }
  await db.query(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id VARCHAR(36) PRIMARY KEY, actor_id VARCHAR(36) NULL, actor_email VARCHAR(191) NULL,
    action VARCHAR(40) NOT NULL, target_type VARCHAR(20) NOT NULL, target_id VARCHAR(64) NULL,
    target_label VARCHAR(191) NULL, details_json TEXT NULL, created_at TIMESTAMP NOT NULL
  )`);
  for (const statement of [
    'CREATE INDEX idx_audit_created ON admin_audit_log (created_at)',
    'CREATE INDEX idx_audit_target ON admin_audit_log (target_id)'
  ]) {
    try { await db.query(statement); } catch { /* index already exists */ }
  }
}

const USER_COLUMNS = `u.id, u.email, u.full_name, u.role, u.status, u.suspended_reason, u.suspended_at, u.created_at`;

async function getUser(id, conn = db) {
  const { rows } = await conn.query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
  return rows[0] || null;
}

async function requireUser(id, conn = db) {
  const user = await getUser(id, conn);
  if (!user) throw fail(404, 'That account was not found. It may already have been deleted.', 'USER_NOT_FOUND');
  return user;
}

/** Name and email used to address a notification; null when the account is gone. */
async function contactOf(id) {
  const { rows } = await db.query('SELECT email, full_name FROM users WHERE id = ?', [id]);
  return rows[0] ? { email: rows[0].email, name: rows[0].full_name || '' } : null;
}

function cleanReason(reason) {
  const text = String(reason ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!text) throw fail(400, 'Enter a reason so the account owner and other admins know why.', 'REASON_REQUIRED');
  return text;
}

function guardSelf(actor, id) {
  if (actor.id === id) throw fail(403, 'You cannot do this to your own account. Ask another admin.', 'CANNOT_TARGET_SELF');
}

/** True when `id` is the only ACTIVE admin left. */
async function isLastActiveAdmin(user, conn = db) {
  if (user.role !== 'ADMIN' || user.status === 'SUSPENDED') return false;
  const { rows } = await conn.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND status != 'SUSPENDED' AND id != ?`, [user.id]);
  return Number(rows[0].count) === 0;
}

async function listUsers({ q, role, status, page } = {}) {
  const where = [];
  const params = [];
  const term = String(q || '').trim().toLowerCase().slice(0, 100);
  if (term) {
    where.push(`(LOWER(u.email) LIKE ? OR LOWER(COALESCE(u.full_name, '')) LIKE ? OR LOWER(COALESCE(u.lrn_or_id, '')) LIKE ?)`);
    params.push(`%${term}%`, `%${term}%`, `%${term}%`);
  }
  if (role) {
    if (!ROLES.includes(role)) throw fail(400, 'Choose a role: student, teacher, or admin.', 'INVALID_FILTER');
    where.push('u.role = ?'); params.push(role);
  }
  if (status) {
    if (!STATUSES.includes(status)) throw fail(400, 'Choose a status: active or suspended.', 'INVALID_FILTER');
    where.push('u.status = ?'); params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * PAGE_SIZE;
  const { rows } = await db.query(`SELECT ${USER_COLUMNS}, e.status AS enrollment_status, adviser.full_name AS adviser_name
    FROM users u LEFT JOIN enrollment_requests e ON e.user_id = u.id
    LEFT JOIN class_invitations i ON i.id = e.invitation_id LEFT JOIN users adviser ON adviser.id = i.teacher_id
    ${clause} ORDER BY u.created_at DESC, u.id LIMIT ${PAGE_SIZE} OFFSET ${offset}`, params);
  const { rows: total } = await db.query(`SELECT COUNT(*) AS count FROM users u ${clause}`, params);
  return { users: rows, total: Number(total[0].count) };
}

async function suspend(actor, id, reason) {
  guardSelf(actor, id);
  const text = cleanReason(reason);
  return db.transaction(async tx => {
    const user = await requireUser(id, tx);
    if (user.status === 'SUSPENDED') throw fail(409, 'This account is already suspended.', 'ALREADY_SUSPENDED');
    if (await isLastActiveAdmin(user, tx)) throw fail(409, 'This is the last active admin account.', 'LAST_ADMIN');
    await tx.query(`UPDATE users SET status = 'SUSPENDED', suspended_reason = ?, suspended_at = ? WHERE id = ?`, [text, files.utc(), id]);
    await audit.record(tx, { actor, action: 'ACCOUNT_SUSPENDED', targetType: 'USER', targetId: id, targetLabel: user.email, details: { reason: text } });
    return getUser(id, tx);
  });
}

async function unsuspend(actor, id) {
  guardSelf(actor, id);
  return db.transaction(async tx => {
    const user = await requireUser(id, tx);
    if (user.status !== 'SUSPENDED') throw fail(409, 'This account is not suspended.', 'NOT_SUSPENDED');
    await tx.query(`UPDATE users SET status = 'ACTIVE', suspended_reason = NULL, suspended_at = NULL WHERE id = ?`, [id]);
    await audit.record(tx, { actor, action: 'ACCOUNT_UNSUSPENDED', targetType: 'USER', targetId: id, targetLabel: user.email });
    return getUser(id, tx);
  });
}

async function revokeInstructor(actor, id, reason) {
  guardSelf(actor, id);
  const text = cleanReason(reason);
  return db.transaction(async tx => {
    const user = await requireUser(id, tx);
    if (user.role !== 'TEACHER') throw fail(409, 'Only instructor accounts can have instructor access revoked.', 'NOT_INSTRUCTOR');
    const { rows: open } = await tx.query('SELECT COUNT(*) AS count FROM class_invitations WHERE teacher_id = ? AND active = 1', [id]);
    const { rows: students } = await tx.query(`SELECT COUNT(*) AS count FROM enrollment_requests
      WHERE status IN ('PENDING', 'APPROVED') AND invitation_id IN (SELECT id FROM class_invitations WHERE teacher_id = ?)`, [id]);
    await tx.query(`UPDATE users SET role = 'STUDENT', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    await tx.query('UPDATE class_invitations SET active = 0 WHERE teacher_id = ?', [id]);
    await tx.query(`UPDATE enrollment_requests SET status = 'REJECTED', reason = ?, reviewed_at = ?
      WHERE status IN ('PENDING', 'APPROVED') AND invitation_id IN (SELECT id FROM class_invitations WHERE teacher_id = ?)`,
    [REVOKED_ENROLLMENT_REASON, files.utc(), id]);
    await tx.query(`UPDATE instructor_applications SET status = 'REJECTED', reason = ?, reviewed_by = ?, reviewed_at = ? WHERE user_id = ?`,
      [`Instructor access revoked: ${text}`.slice(0, 300), actor.id, files.utc(), id]);
    const result = { user: await getUser(id, tx), closed_invitations: Number(open[0].count), released_students: Number(students[0].count) };
    await audit.record(tx, { actor, action: 'INSTRUCTOR_REVOKED', targetType: 'USER', targetId: id, targetLabel: user.email,
      details: { reason: text, closed_invitations: result.closed_invitations, released_students: result.released_students } });
    return result;
  });
}

async function countOne(sql, params) {
  const { rows } = await db.query(sql, params);
  return Number(rows[0].count);
}

/** Teaching content the account created. Deleting it would destroy other people's gradebook. */
async function ownedContent(id) {
  const content = {
    lessons: await countOne('SELECT COUNT(*) AS count FROM instructional_materials WHERE created_by = ?', [id])
      + await countOne('SELECT COUNT(*) AS count FROM materials WHERE uploaded_by = ?', [id]),
    quizzes: await countOne('SELECT COUNT(*) AS count FROM quizzes WHERE created_by = ?', [id]),
    tasks: await countOne('SELECT COUNT(*) AS count FROM performance_tasks WHERE created_by = ?', [id]),
    classes: await countOne(`SELECT COUNT(*) AS count FROM class_invitations i WHERE i.teacher_id = ?
      AND EXISTS (SELECT 1 FROM enrollment_requests e WHERE e.invitation_id = i.id)`, [id])
  };
  return Object.values(content).some(Boolean) ? content : null;
}

function isClerkMissing(err) {
  return err?.status === 404 || err?.statusCode === 404 || err?.errors?.some?.(e => e.code === 'resource_not_found');
}

async function deleteAccount(actor, id, confirmEmail, { env, clerk, invalidateCache } = {}) {
  const user = await requireUser(id);
  guardSelf(actor, id);
  if (String(confirmEmail || '').trim().toLowerCase() !== String(user.email).toLowerCase()) {
    throw fail(400, `Type the account's email address (${user.email}) exactly to confirm.`, 'EMAIL_MISMATCH');
  }
  if (await isLastActiveAdmin(user)) throw fail(409, 'This is the last active admin account, so it cannot be deleted.', 'LAST_ADMIN');
  const content = await ownedContent(id);
  if (content) {
    const message = user.role === 'TEACHER'
      ? 'This instructor still owns lessons, quizzes, tasks, or classes with students. Revoke instructor access instead.'
      : 'This account still owns lessons, quizzes, tasks, or class records from when it was an instructor, so deleting it would remove other people’s grades. Suspend the account instead.';
    throw Object.assign(fail(409, message,
      'ACCOUNT_OWNS_CONTENT'), { content });
  }

  try {
    await clerk.users.deleteUser(id);
  } catch (err) {
    if (!isClerkMissing(err)) {
      console.error('[ADMIN] Clerk delete failed:', err.message);
      throw fail(502, 'The sign-in provider could not delete this account. Nothing was changed; try again in a moment.', 'CLERK_DELETE_FAILED');
    }
  }
  if (invalidateCache) invalidateCache(id);

  const removedFiles = await files.deleteForOwner(env || {}, id);

  // Optional tables belong to the announcements feature and may not exist yet.
  for (const sql of [
    'DELETE FROM announcement_reads WHERE user_id = ?',
    'DELETE FROM announcement_reads WHERE announcement_id IN (SELECT id FROM announcements WHERE teacher_id = ?)',
    'DELETE FROM announcements WHERE teacher_id = ?'
  ]) {
    try { await db.query(sql, [id]); } catch { /* table not present */ }
  }

  await db.transaction(async tx => {
    const mine = '(SELECT id FROM quiz_submissions WHERE student_id = ?)';
    for (const [sql, params] of [
      ['DELETE FROM security_logs WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE student_id = ?)', [id]],
      ['DELETE FROM quiz_attempts WHERE student_id = ?', [id]],
      [`DELETE FROM quiz_proctoring_logs WHERE submission_id IN ${mine}`, [id]],
      [`DELETE FROM quiz_submission_answers WHERE submission_id IN ${mine}`, [id]],
      [`DELETE FROM remedial_interventions WHERE student_id = ? OR trigger_submission_id IN ${mine}`, [id, id]],
      ['DELETE FROM quiz_submissions WHERE student_id = ?', [id]],
      ['DELETE FROM student_competency_mastery WHERE student_id = ?', [id]],
      ['DELETE FROM interventions WHERE student_id = ?', [id]],
      ['DELETE FROM performance_task_submissions WHERE student_id = ?', [id]],
      ['DELETE FROM material_read_logs WHERE student_id = ?', [id]],
      ['DELETE FROM enrollment_requests WHERE user_id = ?', [id]],
      ['DELETE FROM instructor_applications WHERE user_id = ?', [id]],
      ['DELETE FROM class_invitations WHERE teacher_id = ?', [id]],
      ['DELETE FROM users WHERE id = ?', [id]]
    ]) await tx.query(sql, params);
  });

  await audit.record(db, { actor, action: 'ACCOUNT_DELETED', targetType: 'USER', targetId: id, targetLabel: user.email,
    details: { role: user.role, removed_files: removedFiles } });
  return { id, removed_files: removedFiles };
}

module.exports = {
  initializeAccountAdminTables, listUsers, suspend, unsuspend, revokeInstructor, deleteAccount,
  getUser, contactOf, isLastActiveAdmin, REVOKED_ENROLLMENT_REASON
};
