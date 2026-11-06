/**
 * Admin audit trail. Rows have no foreign keys so the history survives account deletion.
 * `record` accepts either the shared `db` or a transaction handle so an action and its
 * audit row can commit together.
 */
const crypto = require('crypto');
const db = require('../config/database');
const { utc } = require('./fileService');

const MAX_LIMIT = 100;

/** actor: { id, email } (usually req.user). */
async function record(conn, { actor, action, targetType, targetId = null, targetLabel = null, details = null }) {
  const id = crypto.randomUUID();
  await (conn || db).query(
    `INSERT INTO admin_audit_log (id, actor_id, actor_email, action, target_type, target_id, target_label, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, actor?.id || null, actor?.email || null, action, targetType, targetId ? String(targetId) : null,
      targetLabel ? String(targetLabel).slice(0, 191) : null, details ? JSON.stringify(details) : null, utc()]
  );
  return id;
}

/** Newest first. `before` is the opaque cursor returned as `next_before`. */
async function list({ action, before, limit } = {}) {
  const size = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_LIMIT);
  const where = [];
  const params = [];
  if (action) { where.push('action = ?'); params.push(String(action)); }
  if (before) {
    const [createdAt, id = ''] = String(before).split('|');
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    params.push(createdAt, createdAt, id);
  }
  const { rows } = await db.query(
    `SELECT id, actor_id, actor_email, action, target_type, target_id, target_label, details_json, created_at
     FROM admin_audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC, id DESC LIMIT ${size + 1}`, params);
  const page = rows.slice(0, size);
  const entries = page.map(({ details_json, ...row }) => {
    let details = null;
    try { details = details_json ? JSON.parse(details_json) : null; } catch { details = null; }
    return { ...row, details };
  });
  const last = page[page.length - 1];
  return { entries, next_before: rows.length > size && last ? `${last.created_at}|${last.id}` : null };
}

module.exports = { record, list };
