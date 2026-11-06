/**
 * File records, quotas, permissions and cleanup.
 *
 * The `files` table (in the main database) is the source of truth for ownership and
 * status. The bytes live in chunks (see chunkStore.js), in whichever shard the file
 * was assigned to when it was reserved.
 *
 * Lifecycle: reserve (pending row) -> parts uploaded -> complete (ready) -> attach
 * to a material or submission. Pending and unattached files are swept by cleanupStale.
 */
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('../config/database');
const limits = require('../config/fileLimits');
const store = require('./chunkStore');
const tokens = require('./fileTokens');
const { fail } = require('./enrollmentService');

const MB = 1024 ** 2;
const LIVE = `status IN ('pending', 'ready')`;
const FILE_URL = /^\/api\/files\/([A-Za-z0-9-]{1,36})\/content/;
const LEGACY_PREFIX = { materials: '/api/materials/download/', 'performance-tasks': '/api/performance-tasks/files/' };

async function initializeFileTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS files (
    id VARCHAR(36) PRIMARY KEY, storage_key VARCHAR(255) NOT NULL UNIQUE,
    shard INTEGER NOT NULL DEFAULT 0, chunk_count INTEGER NOT NULL DEFAULT 0,
    owner_id VARCHAR(36) NOT NULL, purpose VARCHAR(20) NOT NULL,
    material_id VARCHAR(36) NULL, task_id VARCHAR(36) NULL, submission_id VARCHAR(36) NULL,
    original_name VARCHAR(255) NOT NULL, content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  // MySQL has no CREATE INDEX IF NOT EXISTS, so each index is created on its own and failures are ignored.
  for (const statement of [
    'CREATE INDEX idx_files_owner ON files (owner_id, status)',
    'CREATE INDEX idx_files_material ON files (material_id)',
    'CREATE INDEX idx_files_submission ON files (submission_id)',
    'CREATE INDEX idx_files_status_created ON files (status, created_at)'
  ]) {
    try { await db.query(statement); } catch { /* already exists */ }
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const utc = (date = new Date()) => new Date(date).toISOString().slice(0, 19).replace('T', ' ');
const envOf = req => req?.app?.locals?.env || {};

function formatBytes(bytes) {
  if (bytes >= 1024 * MB) return `${Number((bytes / (1024 * MB)).toFixed(1))} GB`;
  return `${Math.round(bytes / MB)} MB`;
}

function cleanName(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base.slice(-255);
}

const extensionOf = name => path.extname(String(name || '')).toLowerCase();
const allowedFor = purpose => limits.EXTENSIONS[purpose] || [];

function publicFile(row, downloadUrl) {
  return {
    id: row.id,
    name: row.original_name,
    size: Number(row.size_bytes),
    content_type: row.content_type,
    purpose: row.purpose,
    status: row.status,
    material_id: row.material_id || null,
    task_id: row.task_id || null,
    submission_id: row.submission_id || null,
    created_at: row.created_at,
    ...(downloadUrl !== undefined ? { download_url: downloadUrl } : {})
  };
}

async function getFile(id, connection = db) {
  const { rows } = await connection.query('SELECT * FROM files WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function filesByIds(ids) {
  const found = new Map();
  const list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const group = list.slice(i, i + 50);
    const { rows } = await db.query(`SELECT * FROM files WHERE id IN (${group.map(() => '?').join(',')})`, group);
    rows.forEach(row => found.set(row.id, row));
  }
  return found;
}

const sum = async (sql, params, connection = db) => Number((await connection.query(sql, params)).rows[0]?.total || 0);
const usedBy = (ownerId, connection = db) => sum(`SELECT SUM(size_bytes) AS total FROM files WHERE owner_id = ? AND ${LIVE}`, [ownerId], connection);
const usedTotal = connection => sum(`SELECT SUM(size_bytes) AS total FROM files WHERE ${LIVE}`, [], connection);

function limitsFor(user) {
  const role = limits.ROLE_LIMITS[user.role];
  return role ? { max_file: role.maxFile, quota: role.quota } : { max_file: 0, quota: 0 };
}

async function usage(user, purpose) {
  const own = limitsFor(user);
  return {
    used: await usedBy(user.id),
    quota: own.quota,
    max_file: own.max_file,
    allowed_extensions: allowedFor(purpose || 'personal')
  };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
async function approvedAdviser(studentId) {
  const { rows } = await db.query(`SELECT i.teacher_id FROM enrollment_requests e
    JOIN class_invitations i ON i.id = e.invitation_id WHERE e.user_id = ? AND e.status = 'APPROVED'`, [studentId]);
  return rows[0]?.teacher_id || null;
}

async function inClass(teacherId, studentId) {
  const { rows } = await db.query(`SELECT 1 AS found FROM enrollment_requests e
    JOIN class_invitations i ON i.id = e.invitation_id
    WHERE e.user_id = ? AND i.teacher_id = ? AND e.status = 'APPROVED' LIMIT 1`, [studentId, teacherId]);
  return rows.length > 0;
}

async function createdTask(teacherId, taskId) {
  if (!taskId) return false;
  const { rows } = await db.query('SELECT 1 AS found FROM performance_tasks WHERE id = ? AND created_by = ? LIMIT 1', [taskId, teacherId]);
  return rows.length > 0;
}

/** A teacher may open a student's submission file when the student is in their class or they set the task. */
async function teacherCanReadSubmission(teacherId, studentId, taskId, ctx = {}) {
  ctx.inClass ||= new Map();
  ctx.tasks ||= new Map();
  if (!ctx.inClass.has(studentId)) ctx.inClass.set(studentId, await inClass(teacherId, studentId));
  if (ctx.inClass.get(studentId)) return true;
  if (!ctx.tasks.has(taskId)) ctx.tasks.set(taskId, await createdTask(teacherId, taskId));
  return ctx.tasks.get(taskId);
}

/** `ctx` is an optional per-request cache so list endpoints do not repeat lookups. */
async function canRead(user, file, ctx = {}) {
  if (!user || !file) return false;
  if (user.role === 'ADMIN' || file.owner_id === user.id) return true;
  if (file.purpose === 'material') {
    if (user.role !== 'STUDENT') return false;
    if (ctx.adviser === undefined) ctx.adviser = await approvedAdviser(user.id);
    return Boolean(ctx.adviser) && ctx.adviser === file.owner_id;
  }
  if (file.purpose === 'submission' && user.role === 'TEACHER') {
    return teacherCanReadSubmission(user.id, file.owner_id, file.task_id, ctx);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Reserve / complete / attach
// ---------------------------------------------------------------------------
const roleMayUpload = (purpose, role) => (
  (purpose === 'material' && role === 'TEACHER') ||
  (purpose === 'submission' && role === 'STUDENT') ||
  (purpose === 'personal' && (role === 'TEACHER' || role === 'STUDENT'))
);

const storageFull = cap => fail(507, `Aralytics storage is full (${formatBytes(cap)} used). Uploads are paused — ask the administrator to free space.`);

async function reserve(env, user, { purpose, name, size, task_id: taskId } = {}) {
  if (!Object.hasOwn(limits.EXTENSIONS, purpose)) throw fail(400, 'Choose what this file is for.');
  if (!roleMayUpload(purpose, user.role)) throw fail(403, 'Your account cannot upload this kind of file.');
  const originalName = cleanName(name);
  const extension = extensionOf(originalName);
  const allowed = allowedFor(purpose);
  if (!originalName || !allowed.includes(extension)) throw fail(400, `Unsupported file type. Allowed: ${allowed.join(', ')}`);
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) throw fail(400, 'The file is empty or its size is missing.');
  const own = limitsFor(user);
  if (bytes > own.max_file) throw fail(413, `Files must be ${formatBytes(own.max_file)} or smaller.`);
  if (purpose === 'submission') {
    const { rows } = await db.query('SELECT id FROM performance_tasks WHERE id = ? LIMIT 1', [taskId || '']);
    if (!rows.length) throw fail(404, 'Performance task not found.');
  }

  const id = crypto.randomUUID();
  const chunkCount = Math.ceil(bytes / limits.CHUNK_BYTES);
  // One transaction keeps concurrent reservations from overshooting a cap by more than a file.
  const shard = await db.transaction(async tx => {
    const cap = store.siteCap(env);
    if (await usedTotal(tx) + bytes > cap) throw storageFull(cap);
    const mine = await usedBy(user.id, tx);
    if (mine + bytes > own.quota) throw fail(413, `You've used ${formatBytes(mine)} of ${formatBytes(own.quota)}. Delete files in My files to make room.`);
    const chosen = await store.pickShard(env, bytes, tx);
    if (chosen === null) throw storageFull(cap);
    await tx.query(`INSERT INTO files (id, storage_key, shard, chunk_count, owner_id, purpose, task_id, original_name,
      content_type, size_bytes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [id, id, chosen, chunkCount, user.id, purpose, purpose === 'submission' ? taskId : null, originalName,
      limits.CONTENT_TYPES[extension] || 'application/octet-stream', bytes, utc()]);
    return chosen;
  });

  const sig = tokens.sign(env, { a: 'u', f: id, u: user.id, s: shard, z: bytes, n: chunkCount }, limits.UPLOAD_TOKEN_TTL_S);
  return {
    file: publicFile(await getFile(id)),
    upload: {
      chunk_size: limits.CHUNK_BYTES,
      chunk_count: chunkCount,
      part_url: `/api/files/${id}/parts/{index}?sig=${sig}`,
      expires_at: new Date(Date.now() + limits.UPLOAD_TOKEN_TTL_S * 1000).toISOString()
    }
  };
}

const MAGIC = { '.pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], '.docx': [0x50, 0x4b], '.pptx': [0x50, 0x4b], '.xlsx': [0x50, 0x4b], '.zip': [0x50, 0x4b] };
const hasMagic = (head, expected) => !expected || expected.every((byte, i) => head[i] === byte);

async function complete(env, user, id) {
  const row = await getFile(id);
  if (!row || row.owner_id !== user.id) throw fail(404, 'Upload not found.');
  if (row.status === 'ready') return row;
  const chunks = store.backend(env, row.shard);
  const stats = await chunks.stats(row.storage_key);
  if (stats.count !== Number(row.chunk_count) || stats.bytes !== Number(row.size_bytes)) {
    throw fail(409, `Upload incomplete (${stats.count} of ${row.chunk_count} parts).`);
  }
  const head = await chunks.head(row.storage_key, 8);
  if (!hasMagic(head, MAGIC[extensionOf(row.original_name)])) {
    await deleteFiles(env, [row]);
    throw fail(400, 'The file does not look like a real document of that type. Check it and try again.');
  }
  await db.query(`UPDATE files SET status = 'ready' WHERE id = ? AND status = 'pending'`, [id]);
  return { ...row, status: 'ready' };
}

/** The caller's ready, unattached file of this purpose, or an error. Use before creating the parent record. */
async function requireAttachable(fileId, user, purpose) {
  const row = typeof fileId === 'string' && fileId ? await getFile(fileId) : null;
  if (!row || row.owner_id !== user.id || row.purpose !== purpose) throw fail(400, 'That upload was not found. Upload the file again.');
  if (row.status !== 'ready') throw fail(409, 'That upload is not finished. Upload the file again.');
  if (row.material_id || row.submission_id) throw fail(409, 'That upload is already in use. Upload the file again.');
  return row;
}

async function attach(fileId, user, purpose, { materialId = null, submissionId = null, taskId = null } = {}, connection = db) {
  const result = await connection.query(`UPDATE files SET material_id = ?, submission_id = ?, task_id = COALESCE(?, task_id)
    WHERE id = ? AND owner_id = ? AND purpose = ? AND status = 'ready' AND material_id IS NULL AND submission_id IS NULL`,
  [materialId, submissionId, taskId, fileId, user.id, purpose]);
  if (!result.affectedRows) throw fail(409, 'That upload is already in use. Upload the file again.');
}

// ---------------------------------------------------------------------------
// Deletion and cleanup
// ---------------------------------------------------------------------------
/** Removes the chunks first and the rows second, so a failure never leaves unreachable bytes. */
async function deleteFiles(env, rows) {
  if (!rows.length) return 0;
  const byShard = new Map();
  for (const row of rows) byShard.set(Number(row.shard), [...(byShard.get(Number(row.shard)) || []), row.storage_key]);
  for (const [shard, keys] of byShard) await store.backend(env, shard).deleteKeys(keys);
  for (let i = 0; i < rows.length; i += 50) {
    const ids = rows.slice(i, i + 50).map(row => row.id);
    await db.query(`DELETE FROM files WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  return rows.length;
}

async function deleteWhere(env, column, value, exceptId) {
  const { rows } = await db.query(`SELECT * FROM files WHERE ${column} = ? AND id != ?`, [value, exceptId || '']);
  return deleteFiles(env, rows);
}
const deleteForMaterial = (env, materialId, exceptId) => deleteWhere(env, 'material_id', materialId, exceptId);
const deleteForSubmission = (env, submissionId, exceptId) => deleteWhere(env, 'submission_id', submissionId, exceptId);
const deleteForOwner = (env, ownerId) => deleteWhere(env, 'owner_id', ownerId);

/** Scheduled sweep: abandoned uploads and files that were never attached. Up to 40 per run. */
async function cleanupStale(env, now = Date.now()) {
  const cutoff = utc(new Date(now - limits.PENDING_MAX_AGE_MS));
  const { rows } = await db.query(`SELECT * FROM files WHERE created_at < ? AND (status = 'pending' OR
    (status = 'ready' AND purpose IN ('material', 'submission') AND material_id IS NULL AND submission_id IS NULL)) LIMIT 40`, [cutoff]);
  let removed = 0;
  for (const row of rows) {
    try { removed += await deleteFiles(env, [row]); }
    catch (error) { console.error('[FILES] Cleanup failed for', row.id, error.message); }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Download links for API responses
// ---------------------------------------------------------------------------
const fileIdFromUrl = url => FILE_URL.exec(String(url || ''))?.[1] || null;

function legacyNameFromUrl(url, kind) {
  const prefix = LEGACY_PREFIX[kind];
  const value = String(url || '');
  if (!value.startsWith(prefix)) return null;
  try { return decodeURIComponent(value.slice(prefix.length).split('?')[0]) || null; } catch { return null; }
}

/**
 * Adds a signed `outKey` URL to every item whose `urlKey` points at an uploaded file the
 * viewer may read (null otherwise). Older base64 uploads get a signed legacy URL when
 * `legacyAllowed(item, ctx)` (default: always) approves. External links get null.
 */
async function decorateUrls(env, user, items, { urlKey = 'storage_url', outKey = 'download_url', legacyKind = 'materials', legacyAllowed, markAvailable } = {}) {
  const ids = new Set(items.map(item => fileIdFromUrl(item?.[urlKey])).filter(Boolean));
  const files = ids.size ? await filesByIds(ids) : new Map();
  const ctx = {};
  for (const item of items) {
    if (!item) continue;
    const id = fileIdFromUrl(item[urlKey]);
    if (id) {
      const file = files.get(id);
      const ready = file?.status === 'ready';
      item[outKey] = ready && await canRead(user, file, ctx) ? tokens.downloadUrl(env, file, user.id) : null;
      if (markAvailable) item.resource_available = ready;
      continue;
    }
    const legacy = legacyNameFromUrl(item[urlKey], legacyKind);
    if (legacy) item[outKey] = !legacyAllowed || await legacyAllowed(item, ctx) ? tokens.legacyUrl(env, legacyKind, legacy, user.id) : null;
    else item[outKey] = null;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Lists and admin
// ---------------------------------------------------------------------------
async function listOwn(env, user, purpose) {
  const params = [user.id];
  let where = `owner_id = ? AND status = 'ready'`;
  if (purpose) { where += ' AND purpose = ?'; params.push(purpose); }
  const { rows } = await db.query(`SELECT * FROM files WHERE ${where} ORDER BY created_at DESC, id`, params);
  return rows.map(row => publicFile(row, tokens.downloadUrl(env, row, user.id)));
}

async function adminStorage(env) {
  const [{ rows: perShard }, { rows: perPurpose }, { rows: perUser }] = await Promise.all([
    db.query(`SELECT shard, SUM(size_bytes) AS used FROM files WHERE ${LIVE} GROUP BY shard`),
    db.query(`SELECT purpose, SUM(size_bytes) AS used, COUNT(*) AS files FROM files WHERE ${LIVE} GROUP BY purpose`),
    db.query(`SELECT f.owner_id AS user_id, u.full_name, u.first_name, u.last_name, u.email, u.role,
        SUM(f.size_bytes) AS used, COUNT(*) AS files
      FROM files f LEFT JOIN users u ON u.id = f.owner_id WHERE f.status IN ('pending', 'ready')
      GROUP BY f.owner_id, u.full_name, u.first_name, u.last_name, u.email, u.role`)
  ]);
  const usedByShard = new Map(perShard.map(row => [Number(row.shard), Number(row.used || 0)]));
  const shardList = store.shards(env);
  if (!shardList.length) shardList.push(0);
  const users = perUser.map(row => ({
    user_id: row.user_id,
    full_name: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
    email: row.email || null,
    role: row.role || null,
    used: Number(row.used || 0),
    quota: limits.ROLE_LIMITS[row.role]?.quota ?? null,
    files: Number(row.files || 0)
  })).sort((a, b) => b.used - a.used);
  return {
    used: [...usedByShard.values()].reduce((a, b) => a + b, 0),
    cap: store.siteCap(env),
    file_count: perPurpose.reduce((total, row) => total + Number(row.files || 0), 0),
    by_purpose: Object.fromEntries(perPurpose.map(row => [row.purpose, { used: Number(row.used || 0), files: Number(row.files || 0) }])),
    shards: shardList.map(shard => ({ shard, used: usedByShard.get(shard) || 0, cap: limits.SHARD_CAP_BYTES })),
    users
  };
}

module.exports = {
  initializeFileTables, envOf, formatBytes, utc, publicFile, getFile, usage, limitsFor,
  approvedAdviser, inClass, createdTask, teacherCanReadSubmission, canRead,
  reserve, complete, requireAttachable, attach,
  deleteFiles, deleteForMaterial, deleteForSubmission, deleteForOwner, cleanupStale,
  fileIdFromUrl, legacyNameFromUrl, decorateUrls, listOwn, adminStorage
};
