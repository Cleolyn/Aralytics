/**
 * Class announcements: a teacher posts to the students they advise (approved enrollments
 * under their invitations). Students see only their adviser's posts and keep read markers.
 * An optional attachment is one of the teacher's own ready `personal` files, shared by a
 * signed download link made for the viewer, so no change to file permissions is needed.
 */
const crypto = require('node:crypto');
const db = require('../config/database');
const files = require('./fileService');
const tokens = require('./fileTokens');
const { fail } = require('./enrollmentService');

const MAX_TITLE = 150;
const MAX_BODY = 5000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function initializeAnnouncementTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(36) PRIMARY KEY, teacher_id VARCHAR(36) NOT NULL,
    title VARCHAR(150) NOT NULL, body TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, file_id VARCHAR(36) NULL,
    created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NULL,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL, read_at TIMESTAMP NOT NULL,
    PRIMARY KEY (announcement_id, user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  try { await db.query('CREATE INDEX idx_announcements_teacher ON announcements (teacher_id, created_at)'); } catch { /* already exists */ }
}

const text = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

function parseFields(payload, { partial }) {
  const input = payload || {};
  const out = {};
  if (!partial || input.title !== undefined) {
    const title = text(input.title).replace(/\s+/g, ' ');
    if (!title || title.length > MAX_TITLE) throw fail(400, `Enter a title of 1 to ${MAX_TITLE} characters.`, 'INVALID_ANNOUNCEMENT');
    out.title = title;
  }
  if (!partial || input.body !== undefined) {
    const body = text(input.body);
    if (!body || body.length > MAX_BODY) throw fail(400, `Enter a message of 1 to ${MAX_BODY} characters.`, 'INVALID_ANNOUNCEMENT');
    out.body = body;
  }
  if (input.pinned !== undefined) out.pinned = input.pinned === true || input.pinned === 1 || input.pinned === '1' ? 1 : 0;
  if (input.file_id !== undefined) out.file_id = input.file_id ? String(input.file_id) : null;
  return out;
}

async function assertOwnAttachment(teacher, fileId) {
  const file = await files.getFile(fileId);
  if (!file || file.owner_id !== teacher.id || file.purpose !== 'personal' || file.status !== 'ready') {
    throw fail(400, 'Choose one of your own uploaded files to attach, or remove the attachment.', 'FILE_NOT_FOUND');
  }
}

async function loadOwned(teacher, id) {
  const { rows } = await db.query('SELECT * FROM announcements WHERE id = ? AND teacher_id = ?', [id, teacher.id]);
  if (!rows[0]) throw fail(404, 'Announcement not found.', 'ANNOUNCEMENT_NOT_FOUND');
  return rows[0];
}

/** Turns rows into API objects. `reads` is a Set of announcement ids the viewer has read (students only). */
async function present(env, viewer, rows, reads = new Set()) {
  const found = new Map();
  for (const id of new Set(rows.map(row => row.file_id).filter(Boolean))) {
    const file = await files.getFile(id);
    if (file) found.set(id, file);
  }
  return rows.map(row => {
    const file = row.file_id ? found.get(row.file_id) : null;
    // The file must still exist, be ready and belong to the author; the viewer's access was proved by the caller.
    const usable = file && file.status === 'ready' && file.owner_id === row.teacher_id;
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      pinned: Boolean(Number(row.pinned)),
      created_at: row.created_at,
      updated_at: row.updated_at || null,
      teacher_name: row.teacher_name || null,
      attachment: usable ? {
        id: file.id, name: file.original_name, size: Number(file.size_bytes), content_type: file.content_type,
        download_url: tokens.downloadUrl(env, file, viewer.id)
      } : null,
      read: viewer.role === 'STUDENT' ? reads.has(row.id) : true
    };
  });
}

const SELECT = 'SELECT a.*, u.full_name AS teacher_name FROM announcements a JOIN users u ON u.id = a.teacher_id';
const ORDER = 'ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC';
const UNREAD = `NOT EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?)`;

async function readSet(studentId, ids) {
  const set = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const group = ids.slice(i, i + 50);
    const { rows } = await db.query(`SELECT announcement_id FROM announcement_reads WHERE user_id = ?
      AND announcement_id IN (${group.map(() => '?').join(',')})`, [studentId, ...group]);
    rows.forEach(row => set.add(row.announcement_id));
  }
  return set;
}

async function list(env, user, query = {}) {
  const requested = Number.parseInt(query.limit, 10);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;
  if (user.role === 'TEACHER') {
    const { rows } = await db.query(`${SELECT} WHERE a.teacher_id = ? ${ORDER} LIMIT ${limit}`, [user.id]);
    return { announcements: await present(env, user, rows), unread_count: 0 };
  }
  const adviser = await files.approvedAdviser(user.id);
  if (!adviser) return { announcements: [], unread_count: 0 };
  const { rows } = await db.query(`${SELECT} WHERE a.teacher_id = ? ${ORDER} LIMIT ${limit}`, [adviser]);
  const reads = await readSet(user.id, rows.map(row => row.id));
  const unread = await db.query(`SELECT COUNT(*) AS n FROM announcements a WHERE a.teacher_id = ? AND ${UNREAD}`, [adviser, user.id]);
  return { announcements: await present(env, user, rows, reads), unread_count: Number(unread.rows[0]?.n || 0) };
}

async function recipientEmails(teacherId) {
  const { rows } = await db.query(`SELECT DISTINCT u.email FROM enrollment_requests e
    JOIN class_invitations i ON i.id = e.invitation_id JOIN users u ON u.id = e.user_id
    WHERE i.teacher_id = ? AND e.status = 'APPROVED' AND u.email IS NOT NULL AND COALESCE(u.status, 'ACTIVE') <> 'SUSPENDED'`, [teacherId]);
  return rows.map(row => row.email).filter(Boolean);
}

async function sendEmail(req, teacher, announcement) {
  try {
    const to = await recipientEmails(teacher.id);
    if (!to.length) return;
    const excerpt = announcement.body.length > 200 ? `${announcement.body.slice(0, 197)}...` : announcement.body;
    // Required lazily so whichever notifier is installed is the one used.
    await require('./notifier').notify(req, 'announcement.posted', {
      to, teacher_name: teacher.full_name, title: announcement.title, excerpt
    });
  } catch (error) {
    console.error('[ANNOUNCEMENTS] Email notification failed:', error.message);
  }
}

async function create(req, teacher, payload) {
  const fields = parseFields(payload, { partial: false });
  if (fields.file_id) await assertOwnAttachment(teacher, fields.file_id);
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO announcements (id, teacher_id, title, body, pinned, file_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, teacher.id, fields.title, fields.body, fields.pinned || 0, fields.file_id || null, files.utc()]);
  const { rows } = await db.query(`${SELECT} WHERE a.id = ?`, [id]);
  const [announcement] = await present(files.envOf(req), teacher, rows);
  if (payload?.email_students === true) await sendEmail(req, teacher, { ...announcement, body: fields.body });
  return announcement;
}

async function update(req, teacher, id, payload) {
  const current = await loadOwned(teacher, id);
  const fields = parseFields(payload, { partial: true });
  if (fields.file_id && fields.file_id !== current.file_id) await assertOwnAttachment(teacher, fields.file_id);
  const keys = Object.keys(fields);
  if (keys.length) {
    await db.query(`UPDATE announcements SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...keys.map(key => fields[key]), files.utc(), id]);
  }
  const { rows } = await db.query(`${SELECT} WHERE a.id = ?`, [id]);
  return (await present(files.envOf(req), teacher, rows))[0];
}

async function remove(teacher, id) {
  await loadOwned(teacher, id);
  await db.transaction(async tx => {
    await tx.query('DELETE FROM announcement_reads WHERE announcement_id = ?', [id]);
    await tx.query('DELETE FROM announcements WHERE id = ? AND teacher_id = ?', [id, teacher.id]);
  });
  return id;
}

async function markRead(student, id) {
  const adviser = await files.approvedAdviser(student.id);
  const { rows } = adviser ? await db.query('SELECT id FROM announcements WHERE id = ? AND teacher_id = ?', [id, adviser]) : { rows: [] };
  if (!rows[0]) throw fail(404, 'Announcement not found.', 'ANNOUNCEMENT_NOT_FOUND');
  const existing = await db.query('SELECT read_at FROM announcement_reads WHERE announcement_id = ? AND user_id = ?', [id, student.id]);
  if (existing.rows[0]) return existing.rows[0].read_at;
  const readAt = files.utc();
  try {
    await db.query('INSERT INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)', [id, student.id, readAt]);
  } catch { /* a concurrent request already recorded it */ }
  return readAt;
}

async function markAllRead(student) {
  const adviser = await files.approvedAdviser(student.id);
  if (!adviser) return 0;
  const { rows } = await db.query(`SELECT a.id FROM announcements a WHERE a.teacher_id = ? AND ${UNREAD}`, [adviser, student.id]);
  const readAt = files.utc();
  let count = 0;
  for (const row of rows) {
    try {
      await db.query('INSERT INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)', [row.id, student.id, readAt]);
      count += 1;
    } catch { /* already read */ }
  }
  return count;
}

module.exports = { initializeAnnouncementTables, list, create, update, remove, markRead, markAllRead };
