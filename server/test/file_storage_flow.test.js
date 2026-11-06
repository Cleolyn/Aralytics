// Chunked file storage over the real Express app: uploads, signed downloads, permissions,
// limits, shards, cleanup and the legacy base64 fallbacks. Uses an in-memory main database,
// fake D1 shards (node:sqlite) and a fake verified identity provider. Nothing live is touched.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sdkPath = require.resolve('@clerk/express');
require(sdkPath);
const originalSDK = require.cache[sdkPath].exports;
const identities = new Map();
require.cache[sdkPath].exports = {
  getAuth: req => ({ userId: req.headers['x-test-user'] || null }),
  clerkMiddleware: () => (_req, _res, next) => next(),
  createClerkClient: () => ({ users: { getUser: async id => identities.get(id) } })
};
const db = require('../src/config/database');
const app = require('../src/app');
require.cache[sdkPath].exports = originalSDK;
const { initializeDatabase } = require('../src/db/init');
const files = require('../src/services/fileService');
const tokens = require('../src/services/fileTokens');
const limits = require('../src/config/fileLimits');
const { createFakeD1 } = require('./helpers/fakeD1');

const MB = 1024 ** 2;
const SECRET = 'file-storage-test-secret';
const COMPETENCY = 'comp-ap10-q1-001';

const pdf = (size, seed = 7) => {
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + seed) % 251;
  bytes.write('%PDF-1.4\n', 0);
  return bytes;
};

async function addUser(id, role) {
  await db.query(`INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role)
    VALUES (?, ?, 'Test', ?, ?, ?, 'CLERK_MANAGED_AUTH', ?)`, [id, `account:${id}`, id, `Test ${id}`, `${id}@example.test`, role]);
  identities.set(id, {
    firstName: 'Test', lastName: id, primaryEmailAddressId: 'email',
    emailAddresses: [{ id: 'email', emailAddress: `${id}@example.test`, verification: { status: 'verified' } }]
  });
}

async function enroll(studentId, teacherId, status) {
  const invitation = `inv-${teacherId}`;
  await db.query(`INSERT OR IGNORE INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash)
    VALUES (?, ?, '2026-2027', '["10-Rizal"]', ?)`, [invitation, teacherId, `hash-${teacherId}`]);
  await db.query(`INSERT INTO enrollment_requests (user_id, invitation_id, lrn, full_name, mobile, section, status)
    VALUES (?, ?, ?, ?, '09171234567', '10-Rizal', ?)`, [studentId, invitation, String(Math.abs(hash(studentId))).padStart(12, '1').slice(0, 12), `Test ${studentId}`, status]);
}
const hash = text => [...text].reduce((total, ch) => (total * 31 + ch.charCodeAt(0)) | 0, 7);

async function run() {
  await initializeDatabase();
  const shardA = createFakeD1();
  const shardB = createFakeD1();
  const shardC = createFakeD1();
  const env = { FILES_DB_1: shardA, FILES_DB_2: shardB, FILE_TOKEN_SECRET: SECRET };
  app.locals.env = env;
  const chunkTotal = () => shardA.chunkCount() + shardB.chunkCount() + shardC.chunkCount();

  for (const [id, role] of [['teacherA', 'TEACHER'], ['teacherB', 'TEACHER'], ['studentA', 'STUDENT'], ['studentP', 'STUDENT'],
    ['studentB', 'STUDENT'], ['admin', 'ADMIN']]) await addUser(id, role);
  await enroll('studentA', 'teacherA', 'APPROVED');
  await enroll('studentP', 'teacherA', 'PENDING');
  await enroll('studentB', 'teacherB', 'APPROVED');
  for (const [id, owner] of [['task-a', 'teacherA'], ['task-b', 'teacherB']]) {
    await db.query(`INSERT INTO performance_tasks (id, quarter, competency_id, title, instructions, created_by)
      VALUES (?, 'Q1', ?, ?, 'Do it', ?)`, [id, COMPETENCY, id, owner]);
  }

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, user, { method = 'GET', body } = {}) => {
    const response = await fetch(`${origin}/api${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };
  const put = async (url, body) => {
    try { return await fetch(origin + url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body }); }
    catch (error) { console.error('PUT failed', url.split('?')[0], body.length); throw error; }
  };
  const raw = (url, init) => fetch(origin + url, init);

  /** The client's flow: reserve, PUT each part, complete. Returns every step so tests can inspect failures. */
  async function upload(user, { purpose, name, bytes, task_id: taskId, skipParts = [] }) {
    const reserved = await call('/files', user, { method: 'POST', body: { purpose, name, size: bytes.length, task_id: taskId } });
    if (reserved.status !== 201) return { reserved };
    const { chunk_size: size, chunk_count: count, part_url: template } = reserved.data.upload;
    for (let i = 0; i < count; i++) {
      if (skipParts.includes(i)) continue;
      const response = await put(template.replace('{index}', i), bytes.subarray(i * size, (i + 1) * size));
      assert.equal(response.status, 200, `part ${i} must upload`);
    }
    const completed = await call(`/files/${reserved.data.file.id}/complete`, user, { method: 'POST' });
    return { reserved, completed, id: reserved.data.file.id };
  }
  const makeMaterial = async (user, name, bytes) => {
    const up = await upload(user, { purpose: 'material', name, bytes });
    assert.equal(up.completed.status, 200);
    const created = await call('/materials', user, { method: 'POST', body: { competency_id: COMPETENCY, title: name, file_type: 'PDF', file_id: up.id } });
    assert.equal(created.status, 201);
    return { fileId: up.id, materialId: created.data.materialId };
  };

  try {
    // -----------------------------------------------------------------------------
    // Access control basics
    // -----------------------------------------------------------------------------
    assert.equal((await call('/files', null, { method: 'POST', body: {} })).status, 401);
    const pendingStudent = await call('/files', 'studentP', { method: 'POST', body: { purpose: 'personal', name: 'a.pdf', size: 10 } });
    assert.equal(pendingStudent.status, 403, 'students waiting for approval cannot upload');
    assert.equal(pendingStudent.data.code, 'ENROLLMENT_REQUIRED');
    const reserve = (user, body) => call('/files', user, { method: 'POST', body });
    assert.equal((await reserve('studentA', { purpose: 'material', name: 'a.pdf', size: 10 })).status, 403, 'students cannot upload lesson files');
    assert.equal((await reserve('teacherA', { purpose: 'submission', name: 'a.pdf', size: 10, task_id: 'task-a' })).status, 403);
    assert.equal((await reserve('admin', { purpose: 'personal', name: 'a.pdf', size: 10 })).status, 403, 'admins can read and delete, not upload');
    assert.equal((await reserve('teacherA', { purpose: 'bogus', name: 'a.pdf', size: 10 })).status, 400);
    assert.equal((await reserve('studentA', { purpose: 'submission', name: 'a.pdf', size: 10, task_id: 'nope' })).status, 404);

    // -----------------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------------
    const exe = await reserve('teacherA', { purpose: 'personal', name: 'virus.exe', size: 10 });
    assert.equal(exe.status, 400); assert.match(exe.data.message, /Unsupported file type\. Allowed: .*\.pdf/);
    assert.equal((await reserve('teacherA', { purpose: 'personal', name: 'icon.svg', size: 10 })).status, 400, 'svg is never allowed');
    assert.equal((await reserve('teacherA', { purpose: 'material', name: 'funny.gif', size: 10 })).status, 400, 'gif is personal-only');
    assert.equal((await reserve('teacherA', { purpose: 'personal', name: 'funny.gif', size: 10 })).status, 201);
    assert.equal((await reserve('teacherA', { purpose: 'personal', name: 'empty.pdf', size: 0 })).status, 400);
    assert.equal((await reserve('teacherA', { purpose: 'personal', name: 'empty.pdf' })).status, 400);
    const bigStudent = await reserve('studentA', { purpose: 'personal', name: 'big.pdf', size: 10 * MB + 1 });
    assert.equal(bigStudent.status, 413); assert.equal(bigStudent.data.message, 'Files must be 10 MB or smaller.');
    const bigTeacher = await reserve('teacherA', { purpose: 'personal', name: 'big.pdf', size: 15 * MB + 1 });
    assert.equal(bigTeacher.status, 413); assert.equal(bigTeacher.data.message, 'Files must be 15 MB or smaller.');
    assert.equal((await reserve('teacherA', { purpose: 'personal', name: 'ok.pdf', size: 15 * MB })).status, 201, 'exactly 15 MB is fine');
    await call('/files', 'teacherA'); // list also works
    for (const row of (await db.query(`SELECT id FROM files WHERE status = 'pending'`)).rows) {
      assert.equal((await call(`/files/${row.id}`, 'teacherA', { method: 'DELETE' })).status, 200, 'owners can delete pending reservations');
    }
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM files')).rows[0].n, 0);

    // Wrong part sizes, out-of-range parts and borrowed tokens
    const probe = await reserve('teacherA', { purpose: 'personal', name: 'probe.pdf', size: 2 * MB + 100 });
    assert.equal(probe.data.upload.chunk_count, 3);
    const probeUrl = index => probe.data.upload.part_url.replace('{index}', index);
    assert.equal((await put(probeUrl(0), Buffer.alloc(MB - 1))).status, 400, 'short part');
    assert.equal((await put(probeUrl(0), Buffer.alloc(MB + 1))).status, 400, 'long part');
    assert.equal((await put(probeUrl(2), Buffer.alloc(MB))).status, 400, 'the last part has its own size');
    assert.equal((await put(probeUrl(3), Buffer.alloc(100))).status, 400, 'part index past the end');
    assert.equal((await put(probeUrl(2), Buffer.alloc(100))).status, 200);
    assert.equal((await put(probeUrl(2), Buffer.alloc(100, 1))).status, 200, 'retrying a part is idempotent');
    const unsigned = probeUrl(0).split('?')[0];
    assert.equal((await put(unsigned, Buffer.alloc(MB))).status, 403, 'no sig');
    const other = await reserve('teacherB', { purpose: 'personal', name: 'other.pdf', size: MB });
    assert.equal((await put(`/api/files/${probe.data.file.id}/parts/0?sig=${other.data.upload.part_url.split('sig=')[1]}`, Buffer.alloc(MB))).status, 403, 'a token is bound to its file');
    assert.equal((await raw(probeUrl(0).replace('/parts/0', '/content'))).status, 403, 'an upload token cannot download');
    assert.equal((await call(`/files/${probe.data.file.id}/complete`, 'teacherA', { method: 'POST' })).status, 409);
    const incomplete = await call(`/files/${probe.data.file.id}/complete`, 'teacherA', { method: 'POST' });
    assert.match(incomplete.data.message, /^Upload incomplete \(1 of 3 parts\)\.$/);
    assert.equal((await call(`/files/${probe.data.file.id}/complete`, 'teacherB', { method: 'POST' })).status, 404, 'only the owner completes');
    for (const id of [probe.data.file.id, other.data.file.id]) await db.query('DELETE FROM files WHERE id = ?', [id]);
    shardA.sql.exec('DELETE FROM file_chunks'); shardB.sql.exec('DELETE FROM file_chunks');

    // Fake PDF: content must match the extension, and the bytes are discarded
    const before = chunkTotal();
    const fake = await upload('teacherA', { purpose: 'personal', name: 'fake.pdf', bytes: Buffer.from('this is not a pdf at all') });
    assert.equal(fake.completed.status, 400);
    assert.equal(chunkTotal(), before, 'a rejected file leaves no chunks');
    assert.equal((await files.getFile(fake.id)), null, 'and no record');
    const fakeZip = await upload('teacherA', { purpose: 'personal', name: 'fake.docx', bytes: Buffer.from('not a zip container') });
    assert.equal(fakeZip.completed.status, 400);

    // A real PNG needs no magic check and works for students' personal files
    const png = await upload('studentA', { purpose: 'personal', name: 'photo.png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) });
    assert.equal(png.completed.status, 200);

    // Base64 uploads are retired
    assert.equal((await call('/materials', 'teacherA', { method: 'POST', body: { competency_id: COMPETENCY, title: 'x', file_type: 'PDF', file_name: 'a.pdf', file_content_base64: 'JVBERg==' } })).status, 400);
    assert.equal((await call('/performance-tasks/task-a/submit', 'studentA', { method: 'POST', body: { file_name: 'a.pdf', file_content_base64: 'JVBERg==' } })).status, 400);

    // -----------------------------------------------------------------------------
    // Round trip, downloads, ranges, and the permission matrix
    // -----------------------------------------------------------------------------
    const lesson = pdf(Math.floor(2.5 * MB));
    const chunksBeforeLesson = chunkTotal();
    const { fileId, materialId } = await makeMaterial('teacherA', 'lesson.pdf', lesson);
    assert.deepEqual((await files.getFile(fileId)).material_id, materialId);
    assert.equal(chunkTotal() - chunksBeforeLesson, 3, 'three parts stored');

    const urlFor = async (user, id = fileId) => {
      const result = await call(`/files/${id}`, user);
      return result.status === 200 ? result.data.file.download_url : result.status;
    };
    const allowedMaterial = ['teacherA', 'studentA', 'admin'];
    for (const user of allowedMaterial) assert.match(await urlFor(user), /^\/api\/files\/.+\/content\?sig=/, `${user} can read the lesson`);
    for (const user of ['teacherB', 'studentB']) assert.equal(await urlFor(user), 404, `${user} cannot read the lesson`);
    assert.equal(await urlFor('studentP'), 403, 'a pending student is stopped by the enrollment guard');
    assert.equal(await urlFor(null), 401);

    // Materials list: download_url only where the viewer may read the file
    const listed = async user => (await call('/materials', user)).data.materials.find(m => m.id === materialId);
    assert.match((await listed('studentA')).download_url, /\/content\?sig=/);
    assert.equal((await listed('studentB')).download_url, null);
    assert.equal((await listed('teacherB')).download_url, null);
    assert.equal((await listed('studentA')).resource_available, true);
    assert.equal((await listed('studentA')).storage_url, `/api/files/${fileId}/content`);
    assert.equal((await call(`/materials/${materialId}`, 'studentA')).data.material.download_url.includes('sig='), true);

    // Full download and headers
    const link = await urlFor('studentA');
    const full = await raw(link);
    assert.equal(full.status, 200);
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), lesson, 'a 2.5-chunk file round-trips intact');
    assert.equal(full.headers.get('content-type'), 'application/pdf');
    assert.equal(full.headers.get('content-length'), String(lesson.length));
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(full.headers.get('cache-control'), 'private, no-store');
    assert.match(full.headers.get('content-disposition'), /^inline; filename="lesson\.pdf"; filename\*=UTF-8''lesson\.pdf$/);
    const before2 = shardA.queries.count + shardB.queries.count;
    await (await raw(link)).arrayBuffer();
    assert.equal(shardA.queries.count + shardB.queries.count - before2, 1, 'three chunks are read with one query');

    // Ranges, including one that crosses a chunk boundary
    const crossing = await raw(link, { headers: { Range: `bytes=${MB - 10}-${MB + 20}` } });
    assert.equal(crossing.status, 206);
    assert.equal(crossing.headers.get('content-range'), `bytes ${MB - 10}-${MB + 20}/${lesson.length}`);
    assert.deepEqual(Buffer.from(await crossing.arrayBuffer()), lesson.subarray(MB - 10, MB + 21));
    const tail = await raw(link, { headers: { Range: 'bytes=-100' } });
    assert.equal(tail.status, 206);
    assert.deepEqual(Buffer.from(await tail.arrayBuffer()), lesson.subarray(lesson.length - 100));
    const open = await raw(link, { headers: { Range: `bytes=${lesson.length - 5}-` } });
    assert.deepEqual(Buffer.from(await open.arrayBuffer()), lesson.subarray(lesson.length - 5));
    const clamped = await raw(link, { headers: { Range: `bytes=0-${lesson.length * 2}` } });
    assert.equal(clamped.headers.get('content-length'), String(lesson.length));
    for (const bad of [`bytes=${lesson.length}-`, 'bytes=5-2', 'bytes=abc', 'items=0-1']) {
      const response = await raw(link, { headers: { Range: bad } });
      assert.equal(response.status, 416, bad);
      assert.equal(response.headers.get('content-range'), `bytes */${lesson.length}`);
    }
    const head = await raw(link, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(lesson.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);

    // Signature failures
    const sigOf = url => url.split('sig=')[1];
    const base = `/api/files/${fileId}/content`;
    assert.equal((await raw(base)).status, 403, 'no sig');
    const tampered = sigOf(link).replace(/.$/, ch => (ch === 'A' ? 'B' : 'A'));
    assert.equal((await raw(`${base}?sig=${tampered}`)).status, 403, 'tampered sig');
    assert.equal((await raw(`${base}?sig=garbage`)).status, 403);
    const expired = tokens.sign(env, { a: 'd', f: fileId, u: 'studentA' }, -10);
    const expiredResponse = await raw(`${base}?sig=${expired}`);
    assert.equal(expiredResponse.status, 403); assert.match((await expiredResponse.json()).message, /expired/);
    assert.equal((await raw(`${base}?sig=${tokens.sign(env, { a: 'u', f: fileId }, 60)}`)).status, 403, 'wrong action');
    assert.equal((await raw(`${base}?sig=${tokens.sign(env, { a: 'd', f: 'someone-else' }, 60)}`)).status, 403, 'wrong file');
    assert.equal(tokens.verify({ FILE_TOKEN_SECRET: 'another' }, sigOf(link), { a: 'd', f: fileId }), null, 'wrong secret');
    assert.equal((await raw(`/api/files/missing/content?sig=${tokens.sign(env, { a: 'd', f: 'missing' }, 60)}`)).status, 404);

    // Submissions
    const work = pdf(300000, 3);
    const submission = await upload('studentA', { purpose: 'submission', name: 'work.pdf', bytes: work, task_id: 'task-a' });
    assert.equal(submission.completed.status, 200);
    assert.equal((await call(`/files/${submission.id}`, 'teacherA')).status, 200, 'class adviser');
    assert.equal((await call(`/files/${submission.id}`, 'admin')).status, 200);
    assert.equal((await call(`/files/${submission.id}`, 'studentA')).status, 200, 'owner');
    assert.equal((await call(`/files/${submission.id}`, 'teacherB')).status, 404);
    assert.equal((await call(`/files/${submission.id}`, 'studentB')).status, 404);
    const unattachedDelete = await call(`/files/${submission.id}`, 'studentA', { method: 'DELETE' });
    assert.equal(unattachedDelete.status, 409, 'submission files go away with the submission');
    // Wrong task, or someone else's upload, cannot be submitted
    assert.equal((await call('/performance-tasks/task-b/submit', 'studentA', { method: 'POST', body: { file_id: submission.id } })).status, 400);
    assert.equal((await call('/performance-tasks/task-a/submit', 'studentB', { method: 'POST', body: { file_id: submission.id } })).status, 400);
    const submitted = await call('/performance-tasks/task-a/submit', 'studentA', { method: 'POST', body: { file_id: submission.id, notes: 'hello' } });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.data.submission.file_name, 'work.pdf');
    assert.equal(submitted.data.submission.file_url, `/api/files/${submission.id}/content`);
    assert.match(submitted.data.submission.download_url, /\/content\?sig=/);
    assert.equal((await call('/performance-tasks/task-a/submit', 'studentA', { method: 'POST', body: { file_id: submission.id } })).status, 409, 'an upload is used once');

    const teacherView = (await call('/performance-tasks/task-a/submissions', 'teacherA')).data.submissions;
    assert.match(teacherView[0].download_url, /\/content\?sig=/);
    assert.deepEqual(Buffer.from(await (await raw(teacherView[0].download_url)).arrayBuffer()), work);
    assert.match((await call('/performance-tasks/task-a', 'studentA')).data.task.my_submission.download_url, /sig=/);
    // teacherB did not create task-a and has no class link to studentA
    assert.equal((await call('/performance-tasks/task-a/submissions', 'teacherB')).data.submissions[0].download_url, null);

    // The teacher who set the task can read submissions from outside their class
    const outside = await upload('studentA', { purpose: 'submission', name: 'other.pdf', bytes: pdf(1000), task_id: 'task-b' });
    await call('/performance-tasks/task-b/submit', 'studentA', { method: 'POST', body: { file_id: outside.id } });
    assert.equal((await call(`/files/${outside.id}`, 'teacherB')).status, 200, 'task creator');
    assert.equal((await call(`/files/${outside.id}`, 'teacherA')).status, 200, 'class adviser');

    // Personal files: owner and admin only
    const personal = await upload('studentA', { purpose: 'personal', name: 'notes.pdf', bytes: pdf(5000) });
    assert.equal((await call(`/files/${personal.id}`, 'studentA')).status, 200);
    assert.equal((await call(`/files/${personal.id}`, 'admin')).status, 200);
    for (const user of ['teacherA', 'teacherB', 'studentB']) assert.equal((await call(`/files/${personal.id}`, user)).status, 404, user);
    const mine = await call('/files?purpose=personal', 'studentA');
    assert.equal(mine.data.files.length, 2);
    assert.ok(mine.data.files.every(file => file.download_url && file.purpose === 'personal'));
    assert.equal(mine.data.usage.quota, 50 * MB);
    assert.equal(mine.data.usage.max_file, 10 * MB);
    assert.equal(mine.data.usage.used, 7 + 5000 + 300000 + 1000);
    assert.ok(mine.data.usage.allowed_extensions.includes('.gif'));
    assert.equal((await call('/files?purpose=bogus', 'studentA')).status, 400);
    assert.equal((await call('/files?purpose=personal', 'studentB')).data.files.length, 0);

    // Admin overview
    assert.equal((await call('/admin/storage', 'teacherA')).status, 403);
    const overview = (await call('/admin/storage', 'admin')).data;
    assert.equal(overview.cap, 2 * limits.SHARD_CAP_BYTES);
    assert.equal(overview.shards.length, 2);
    assert.equal(overview.used, overview.shards.reduce((total, shard) => total + shard.used, 0));
    assert.equal(overview.file_count, 5);
    assert.ok(overview.by_purpose.material && overview.by_purpose.submission && overview.by_purpose.personal);
    assert.equal(overview.users[0].user_id, 'teacherA', 'sorted by usage');
    assert.equal(overview.users[0].role, 'TEACHER'); assert.equal(overview.users[0].quota, 1024 * MB);
    assert.deepEqual(overview.users.map(user => user.used), [...overview.users.map(user => user.used)].sort((a, b) => b - a));

    // -----------------------------------------------------------------------------
    // Quotas, the site cap and shard choice (rows are seeded; no bytes are written)
    // -----------------------------------------------------------------------------
    const seed = (owner, size, shard = 1, purpose = 'personal') => db.query(`INSERT INTO files (id, storage_key, shard, chunk_count, owner_id, purpose,
      original_name, content_type, size_bytes, status, created_at) VALUES (?, ?, ?, 1, ?, ?, 'seed.pdf', 'application/pdf', ?, 'ready', ?)`,
    [`seed-${Math.random().toString(36).slice(2)}`, `seed-${Math.random().toString(36).slice(2)}`, shard, owner, purpose, size, files.utc()]);
    const clearSeeds = () => db.query(`DELETE FROM files WHERE original_name = 'seed.pdf'`);

    await seed('studentB', 49 * MB + MB / 2);
    const studentQuota = await reserve('studentB', { purpose: 'personal', name: 'more.pdf', size: MB });
    assert.equal(studentQuota.status, 413);
    assert.match(studentQuota.data.message, /^You've used 50 MB of 50 MB\. Delete files in My files to make room\.$/);
    assert.equal((await reserve('studentB', { purpose: 'personal', name: 'small.pdf', size: MB / 2 })).status, 201, 'exactly the quota still fits');
    await clearSeeds();
    await db.query(`DELETE FROM files WHERE owner_id = 'studentB'`);

    env.FILES_DB_3 = shardC; // three shards: the 1350 MB site cap now sits above the 1 GB teacher quota
    await seed('teacherB', 1020 * MB, 3);
    const teacherQuota = await reserve('teacherB', { purpose: 'personal', name: 'more.pdf', size: 5 * MB });
    assert.equal(teacherQuota.status, 413);
    assert.match(teacherQuota.data.message, /^You.ve used 1020 MB of 1 GB\. Delete files/);
    await clearSeeds();
    delete env.FILES_DB_3;

    await seed('filler', 449 * MB, 1);
    const spill = await upload('teacherA', { purpose: 'personal', name: 'spill.pdf', bytes: pdf(200000) });
    assert.equal(spill.completed.status, 200);
    assert.equal((await files.getFile(spill.id)).shard, 2, 'shard 1 is nearly full, so the file goes to shard 2');
    assert.equal(shardB.chunkCount() >= 1, true);
    await seed('filler', 440 * MB, 2);
    await seed('studentA', 40 * MB, 2); // near the student quota as well
    const siteFull = await reserve('teacherA', { purpose: 'personal', name: 'late.pdf', size: 15 * MB });
    assert.equal(siteFull.status, 507);
    assert.equal(siteFull.data.message, 'Aralytics storage is full (900 MB used). Uploads are paused — ask the administrator to free space.');
    const fullStudent = await reserve('studentA', { purpose: 'personal', name: 'late.pdf', size: 9 * MB });
    assert.equal(fullStudent.status, 507, 'the site cap is checked before the personal quota');
    await clearSeeds();
    await seed('filler', 445 * MB, 1);
    await seed('filler', 445 * MB, 2);
    assert.equal((await reserve('teacherA', { purpose: 'personal', name: 'late.pdf', size: 8 * MB })).status, 507, 'no single shard has room');
    await clearSeeds();

    // -----------------------------------------------------------------------------
    // Deleting files leaves nothing behind
    // -----------------------------------------------------------------------------
    const chunksBefore = chunkTotal();
    const temporary = await upload('studentA', { purpose: 'personal', name: 'temp.pdf', bytes: pdf(MB + 10) });
    assert.equal(chunkTotal(), chunksBefore + 2);
    assert.equal((await call(`/files/${temporary.id}`, 'studentB', { method: 'DELETE' })).status, 404, 'others cannot delete it');
    assert.equal((await call(`/files/${temporary.id}`, 'studentA', { method: 'DELETE' })).status, 200);
    assert.equal(chunkTotal(), chunksBefore, 'personal delete removes the chunks');
    assert.equal(await files.getFile(temporary.id), null);

    // Material ownership
    assert.equal((await call(`/materials/${materialId}`, 'teacherB', { method: 'PUT', body: { title: 'Hijacked' } })).status, 403);
    assert.equal((await call(`/materials/${materialId}`, 'teacherB', { method: 'DELETE' })).status, 403);
    assert.equal((await call(`/materials/${materialId}`, 'studentA', { method: 'DELETE' })).status, 403, 'students cannot manage lessons');
    assert.equal((await call(`/materials/${materialId}`, 'teacherA')).data.material.title, 'lesson.pdf');

    // Replacing a lesson file removes the previous one
    const replacement = await upload('teacherA', { purpose: 'material', name: 'lesson-v2.pdf', bytes: pdf(2000) });
    assert.equal((await call(`/materials/${materialId}`, 'teacherA', { method: 'PUT', body: { file_id: replacement.id } })).status, 200);
    assert.equal(await files.getFile(fileId), null, 'the previous file is deleted');
    assert.equal((await files.getFile(replacement.id)).material_id, materialId);
    assert.equal((await call(`/materials/${materialId}`, 'teacherA')).data.material.storage_url, `/api/files/${replacement.id}/content`);
    assert.equal((await raw(link)).status, 404, 'the old link stops working');
    // Someone else's upload cannot be attached
    assert.equal((await call(`/materials/${materialId}`, 'teacherA', { method: 'PUT', body: { file_id: personal.id } })).status, 400);
    // Switching to a link removes the file
    assert.equal((await call(`/materials/${materialId}`, 'teacherA', { method: 'PUT', body: { storage_url: 'https://example.com/lesson' } })).status, 200);
    assert.equal(await files.getFile(replacement.id), null);
    assert.equal((await listed('studentA')).download_url, null, 'external links have no download_url');

    // Deleting a lesson (admins may too)
    const doomed = await makeMaterial('teacherA', 'doomed.pdf', pdf(MB + 5));
    const afterUpload = chunkTotal();
    assert.equal((await call(`/materials/${doomed.materialId}`, 'admin', { method: 'DELETE' })).status, 200);
    assert.equal(chunkTotal(), afterUpload - 2);
    assert.equal(await files.getFile(doomed.fileId), null);

    // Resubmitting replaces the earlier file
    const second = await upload('studentA', { purpose: 'submission', name: 'work-v2.pdf', bytes: pdf(2 * MB + 1), task_id: 'task-a' });
    const afterSecond = chunkTotal();
    const resubmitted = await call('/performance-tasks/task-a/submit', 'studentA', { method: 'POST', body: { file_id: second.id } });
    assert.equal(resubmitted.status, 200);
    assert.equal(await files.getFile(submission.id), null, 'the first submission file is deleted');
    assert.equal(chunkTotal(), afterSecond - 1);
    assert.equal(resubmitted.data.submission.id, submitted.data.submission.id, 'same submission row');

    // Orphans and abandoned uploads are swept by the cron
    const stale = await reserve('studentA', { purpose: 'personal', name: 'abandoned.pdf', size: 100 });
    const fresh = await reserve('studentA', { purpose: 'personal', name: 'fresh.pdf', size: 100 });
    const orphan = await upload('teacherA', { purpose: 'material', name: 'orphan.pdf', bytes: pdf(MB + 1) });
    const oldOrphan = await upload('teacherA', { purpose: 'material', name: 'old-orphan.pdf', bytes: pdf(MB + 1) });
    await put(stale.data.upload.part_url.replace('{index}', 0), Buffer.alloc(100));
    const old = files.utc(new Date(Date.now() - 25 * 3600 * 1000));
    await db.query('UPDATE files SET created_at = ? WHERE id IN (?, ?)', [old, stale.data.file.id, oldOrphan.id]);
    const swept = chunkTotal();
    assert.equal(await files.cleanupStale(env, Date.now()), 2);
    assert.equal(await files.getFile(stale.data.file.id), null);
    assert.equal(await files.getFile(oldOrphan.id), null);
    assert.ok(await files.getFile(fresh.data.file.id), 'recent pending files stay');
    assert.ok(await files.getFile(orphan.id), 'a recent unattached file stays');
    assert.ok(await files.getFile(second.id), 'attached files stay');
    assert.equal(chunkTotal(), swept - 3, 'their chunks are deleted too');
    assert.equal(await files.cleanupStale(env, Date.now()), 0);
    assert.equal(await files.cleanupStale(env, Date.now() + 26 * 3600 * 1000) >= 2, true, 'later runs catch them');

    // Admin purge
    const purged = await call('/admin/users/studentA/files', 'teacherA', { method: 'DELETE' });
    assert.equal(purged.status, 403);
    const before3 = chunkTotal();
    const purge = await call('/admin/users/studentA/files', 'admin', { method: 'DELETE' });
    assert.equal(purge.status, 200); assert.ok(purge.data.removed >= 2);
    assert.equal((await db.query(`SELECT COUNT(*) AS n FROM files WHERE owner_id = 'studentA'`)).rows[0].n, 0);
    assert.ok(chunkTotal() < before3);

    // -----------------------------------------------------------------------------
    // Older uploads keep working, but now need a session or a signed link
    // -----------------------------------------------------------------------------
    const legacyBytes = Buffer.from('%PDF-1.4\nlegacy lesson');
    shardA.sql.prepare('INSERT INTO upload_chunks (object_key, chunk_index, content) VALUES (?, 0, ?)').run('materials/x.pdf', legacyBytes.toString('base64'));
    shardA.sql.prepare('INSERT INTO upload_chunks (object_key, chunk_index, content) VALUES (?, 0, ?)').run('performance-tasks/old.pdf', legacyBytes.toString('base64'));
    assert.equal((await raw('/api/materials/download/x.pdf')).status, 401, 'no session, no link');
    const viaSession = await raw('/api/materials/download/x.pdf', { headers: { 'x-test-user': 'studentB' } });
    assert.equal(viaSession.status, 200);
    assert.deepEqual(Buffer.from(await viaSession.arrayBuffer()), legacyBytes);
    const legacyLink = tokens.legacyUrl(env, 'materials', 'x.pdf', 'studentA');
    const viaSig = await raw(legacyLink);
    assert.equal(viaSig.status, 200); assert.deepEqual(Buffer.from(await viaSig.arrayBuffer()), legacyBytes);
    assert.equal((await raw('/api/materials/download/y.pdf?' + legacyLink.split('?')[1])).status, 403, 'a link is bound to its file');
    assert.equal((await raw(legacyLink.replace(/.$/, ch => (ch === 'A' ? 'B' : 'A')))).status, 403);
    assert.equal((await raw('/api/materials/download/..%2Fsecret.pdf', { headers: { 'x-test-user': 'studentA' } })).status >= 400, true);

    // Materials pointing at legacy files get signed legacy links; availability is probed
    await db.query(`INSERT INTO instructional_materials (id, competency_id, title, file_type, storage_url, file_size_bytes, content_hash, created_by)
      VALUES ('mat-legacy', ?, 'Legacy', 'PDF', '/api/materials/download/x.pdf', 10, 'hash', 'teacherB')`, [COMPETENCY]);
    const legacyListed = (await call('/materials', 'studentA')).data.materials.find(m => m.id === 'mat-legacy');
    assert.equal(legacyListed.resource_available, true);
    assert.equal((await raw(legacyListed.download_url)).status, 200);

    // Legacy submissions: the owner, the adviser and the task creator, but not other teachers
    await db.query(`INSERT INTO performance_task_submissions (id, task_id, student_id, file_name, file_url, status)
      VALUES ('pts-legacy', 'task-a', 'studentB', 'old.pdf', '/api/performance-tasks/files/old.pdf', 'SUBMITTED')`);
    const asUser = user => raw('/api/performance-tasks/files/old.pdf', { headers: { 'x-test-user': user } });
    assert.equal((await asUser('studentB')).status, 200, 'owner');
    assert.equal((await asUser('teacherA')).status, 200, 'creator of the task');
    assert.equal((await asUser('teacherB')).status, 200, 'adviser of studentB');
    assert.equal((await asUser('studentA')).status, 404, 'other students');
    assert.equal((await raw('/api/performance-tasks/files/old.pdf')).status, 401);
    const legacySubmission = (await call('/performance-tasks/task-a/submissions', 'teacherA')).data.submissions.find(s => s.id === 'pts-legacy');
    assert.equal((await raw(legacySubmission.download_url)).status, 200);

    // -----------------------------------------------------------------------------
    // Without any D1 binding the same flow runs on local disk (shard 0)
    // -----------------------------------------------------------------------------
    const diskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aralytics-disk-files-'));
    process.env.FILES_LOCAL_ROOT = diskRoot;
    app.locals.env = {};
    try {
      const document = pdf(Math.floor(1.5 * MB), 9);
      const onDisk = await upload('teacherA', { purpose: 'personal', name: 'disk.pdf', bytes: document });
      assert.equal(onDisk.completed.status, 200);
      assert.equal((await files.getFile(onDisk.id)).shard, 0);
      assert.deepEqual(fs.readdirSync(path.join(diskRoot, onDisk.id)).sort(), ['0.part', '1.part']);
      const diskLink = (await call(`/files/${onDisk.id}`, 'teacherA')).data.file.download_url;
      assert.deepEqual(Buffer.from(await (await raw(diskLink)).arrayBuffer()), document);
      const diskRange = await raw(diskLink, { headers: { Range: `bytes=${MB - 3}-${MB + 3}` } });
      assert.deepEqual(Buffer.from(await diskRange.arrayBuffer()), document.subarray(MB - 3, MB + 4));
      const diskFake = await upload('teacherA', { purpose: 'personal', name: 'fake.pdf', bytes: Buffer.from('nope') });
      assert.equal(diskFake.completed.status, 400);
      assert.equal(fs.existsSync(path.join(diskRoot, diskFake.reserved.data.file.id)), false);
      assert.equal((await call(`/files/${onDisk.id}`, 'teacherA', { method: 'DELETE' })).status, 200);
      assert.equal(fs.existsSync(path.join(diskRoot, onDisk.id)), false);
    } finally {
      app.locals.env = env;
      delete process.env.FILES_LOCAL_ROOT;
      fs.rmSync(diskRoot, { recursive: true, force: true });
    }

    console.log('PASS: file storage flow');
  } finally {
    server.close();
    shardA.close(); shardB.close(); shardC.close();
  }
}

run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
