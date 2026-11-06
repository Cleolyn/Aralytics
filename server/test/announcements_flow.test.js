// Class announcements over the real Express app: class isolation, attachments through signed
// links, ownership, read markers, cleanup and optional email. In-memory database, fake D1 shards
// and a fake identity provider. Nothing live is touched.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');

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
const notifier = require('../src/services/notifier');
const { createFakeD1 } = require('./helpers/fakeD1');

async function addUser(id, role) {
  await db.query(`INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role)
    VALUES (?, ?, 'Test', ?, ?, ?, 'CLERK_MANAGED_AUTH', ?)`, [id, `account:${id}`, id, `Test ${id}`, `${id}@example.test`, role]);
  identities.set(id, {
    firstName: 'Test', lastName: id, primaryEmailAddressId: 'email',
    emailAddresses: [{ id: 'email', emailAddress: `${id}@example.test`, verification: { status: 'verified' } }]
  });
}

const hash = text => [...text].reduce((total, ch) => (total * 31 + ch.charCodeAt(0)) | 0, 7);
async function enroll(studentId, teacherId, status = 'APPROVED') {
  const invitation = `inv-${teacherId}`;
  await db.query(`INSERT OR IGNORE INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash)
    VALUES (?, ?, '2026-2027', '["10-Rizal"]', ?)`, [invitation, teacherId, `hash-${teacherId}`]);
  await db.query(`INSERT INTO enrollment_requests (user_id, invitation_id, lrn, full_name, mobile, section, status)
    VALUES (?, ?, ?, ?, '09171234567', '10-Rizal', ?)`, [studentId, invitation, String(Math.abs(hash(studentId))).padStart(12, '1').slice(0, 12), `Test ${studentId}`, status]);
}

async function run() {
  await initializeDatabase();
  const shard = createFakeD1();
  app.locals.env = { FILES_DB_1: shard, FILE_TOKEN_SECRET: 'announcement-test-secret' };
  for (const [id, role] of [['t1', 'TEACHER'], ['t2', 'TEACHER'], ['s1', 'STUDENT'], ['s1b', 'STUDENT'], ['s2', 'STUDENT'],
    ['pending', 'STUDENT'], ['admin', 'ADMIN']]) await addUser(id, role);
  await enroll('s1', 't1');
  await enroll('s1b', 't1');
  await enroll('s2', 't2');
  await enroll('pending', 't1', 'PENDING');

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
  async function upload(user, name, bytes) {
    const reserved = await call('/files', user, { method: 'POST', body: { purpose: 'personal', name, size: bytes.length } });
    assert.equal(reserved.status, 201);
    const response = await fetch(origin + reserved.data.upload.part_url.replace('{index}', 0), {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes
    });
    assert.equal(response.status, 200);
    const done = await call(`/files/${reserved.data.file.id}/complete`, user, { method: 'POST' });
    assert.equal(done.status, 200);
    return reserved.data.file.id;
  }

  try {
    // Access
    assert.equal((await call('/announcements', null)).status, 401);
    assert.equal((await call('/announcements', 'pending')).data.code, 'ENROLLMENT_REQUIRED');
    assert.equal((await call('/announcements', 'admin')).status, 403, 'admins have no announcement feed');
    assert.equal((await call('/announcements', 'admin', { method: 'POST', body: { title: 'x', body: 'y' } })).status, 403);
    assert.equal((await call('/announcements', 's1', { method: 'POST', body: { title: 'x', body: 'y' } })).status, 403, 'students cannot post');

    // Validation
    for (const body of [{}, { title: '', body: 'b' }, { title: 'a', body: '  ' }, { title: 'x'.repeat(151), body: 'b' }, { title: 'a', body: 'b'.repeat(5001) }]) {
      const bad = await call('/announcements', 't1', { method: 'POST', body });
      assert.equal(bad.status, 400);
      assert.equal(bad.data.code, 'INVALID_ANNOUNCEMENT');
      assert.equal(bad.data.success, false);
    }

    // Create, with an attachment from the teacher's own files
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(300, 5)]);
    const fileId = await upload('t1', 'schedule.pdf', pdf);
    const foreignFile = await upload('t2', 'other.pdf', pdf);
    const studentFile = await upload('s1', 'mine.pdf', pdf);
    for (const bad of [foreignFile, studentFile, 'no-such-file']) {
      const rejected = await call('/announcements', 't1', { method: 'POST', body: { title: 'Bad', body: 'attach', file_id: bad } });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.data.code, 'FILE_NOT_FOUND');
    }
    const plain = await call('/announcements', 't1', { method: 'POST', body: { title: 'Welcome', body: 'Read the syllabus.' } });
    assert.equal(plain.status, 201);
    assert.equal(plain.data.announcement.attachment, null);
    await new Promise(resolve => setTimeout(resolve, 1100)); // timestamps have second resolution
    const withFile = await call('/announcements', 't1', { method: 'POST', body: { title: 'Schedule', body: 'See attached.', file_id: fileId } });
    assert.equal(withFile.status, 201);
    assert.equal(withFile.data.announcement.attachment.name, 'schedule.pdf');
    await new Promise(resolve => setTimeout(resolve, 1100));
    const pinned = await call('/announcements', 't1', { method: 'POST', body: { title: 'Pinned first', body: 'Important', pinned: true } });
    assert.equal(pinned.data.announcement.pinned, true);
    const other = await call('/announcements', 't2', { method: 'POST', body: { title: 'Class B only', body: 'For section B.' } });
    assert.equal(other.status, 201);
    const [plainId, fileAnnId, pinnedId, otherId] = [plain, withFile, pinned, other].map(r => r.data.announcement.id);

    // Class isolation, ordering and unread counts
    const t1List = await call('/announcements', 't1');
    assert.deepEqual(t1List.data.announcements.map(a => a.id), [pinnedId, fileAnnId, plainId], 'pinned first, then newest');
    assert.equal((await call('/announcements', 't2')).data.announcements.length, 1);
    const s1List = await call('/announcements', 's1');
    assert.deepEqual(s1List.data.announcements.map(a => a.id), [pinnedId, fileAnnId, plainId]);
    assert.equal(s1List.data.unread_count, 3);
    assert.ok(s1List.data.announcements.every(a => a.read === false));
    assert.equal(s1List.data.announcements[0].teacher_name, 'Test t1');
    assert.deepEqual((await call('/announcements', 's2')).data.announcements.map(a => a.id), [otherId]);
    assert.equal((await call('/announcements?limit=1', 's1')).data.announcements.length, 1);
    assert.equal((await call('/announcements?limit=1', 's1')).data.unread_count, 3, 'unread count ignores the limit');

    // Attachment link opens through the byte route
    const attachment = s1List.data.announcements.find(a => a.id === fileAnnId).attachment;
    assert.equal(attachment.content_type, 'application/pdf');
    assert.equal(attachment.size, pdf.length);
    const download = await fetch(origin + attachment.download_url);
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
    assert.equal((await fetch(origin + attachment.download_url.split('?')[0])).status, 403, 'unsigned link is refused');

    // Read markers: only the adviser's posts, per student
    assert.equal((await call(`/announcements/${otherId}/read`, 's1', { method: 'POST', body: {} })).status, 404, 'other class post is hidden');
    assert.equal((await call('/announcements/nope/read', 's1', { method: 'POST', body: {} })).data.code, 'ANNOUNCEMENT_NOT_FOUND');
    assert.equal((await call(`/announcements/${plainId}/read`, 't1', { method: 'POST', body: {} })).status, 403, 'teachers have no read markers');
    const marked = await call(`/announcements/${plainId}/read`, 's1', { method: 'POST', body: {} });
    assert.equal(marked.status, 200);
    assert.match(marked.data.read_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal((await call(`/announcements/${plainId}/read`, 's1', { method: 'POST', body: {} })).data.read_at, marked.data.read_at, 'marking twice is harmless');
    const afterOne = await call('/announcements', 's1');
    assert.equal(afterOne.data.unread_count, 2);
    assert.equal(afterOne.data.announcements.find(a => a.id === plainId).read, true);
    assert.equal((await call('/announcements', 's1b')).data.unread_count, 3, 'another student is unaffected');
    const all = await call('/announcements/read-all', 's1', { method: 'POST', body: {} });
    assert.equal(all.data.count, 2);
    assert.equal((await call('/announcements', 's1')).data.unread_count, 0);
    assert.equal((await call('/announcements/read-all', 's1', { method: 'POST', body: {} })).data.count, 0);
    assert.equal((await call('/announcements/read-all', 's2', { method: 'POST', body: {} })).data.count, 1, 'only own class counted');

    // Edit ownership and validation
    assert.equal((await call(`/announcements/${plainId}`, 't2', { method: 'PUT', body: { title: 'Hijack' } })).data.code, 'ANNOUNCEMENT_NOT_FOUND');
    assert.equal((await call(`/announcements/${plainId}`, 'admin', { method: 'PUT', body: { title: 'Hijack' } })).status, 403);
    assert.equal((await call(`/announcements/${plainId}`, 's1', { method: 'PUT', body: { title: 'Hijack' } })).status, 403);
    assert.equal((await call(`/announcements/${plainId}`, 't1', { method: 'PUT', body: { title: '' } })).status, 400);
    assert.equal((await call(`/announcements/${plainId}`, 't1', { method: 'PUT', body: { file_id: foreignFile } })).data.code, 'FILE_NOT_FOUND');
    const edited = await call(`/announcements/${plainId}`, 't1', { method: 'PUT', body: { title: 'Welcome back', pinned: true, file_id: fileId } });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.announcement.title, 'Welcome back');
    assert.equal(edited.data.announcement.body, 'Read the syllabus.', 'partial update keeps other fields');
    assert.equal(edited.data.announcement.pinned, true);
    assert.ok(edited.data.announcement.updated_at);
    assert.equal(edited.data.announcement.attachment.id, fileId);
    const cleared = await call(`/announcements/${plainId}`, 't1', { method: 'PUT', body: { file_id: null } });
    assert.equal(cleared.data.announcement.attachment, null);

    // A deleted file shows as no attachment; the post stays
    assert.equal((await call(`/files/${fileId}`, 't1', { method: 'DELETE' })).status, 200);
    const afterFileGone = (await call('/announcements', 's1')).data.announcements.find(a => a.id === fileAnnId);
    assert.ok(afterFileGone, 'post survives a deleted file');
    assert.equal(afterFileGone.attachment, null);

    // Delete cleans up reads and is owner-only
    assert.equal((await call(`/announcements/${otherId}`, 't1', { method: 'DELETE' })).data.code, 'ANNOUNCEMENT_NOT_FOUND');
    assert.equal((await call(`/announcements/${plainId}`, 'admin', { method: 'DELETE' })).status, 403);
    const readsBefore = (await db.query('SELECT COUNT(*) AS n FROM announcement_reads WHERE announcement_id = ?', [plainId])).rows[0].n;
    assert.ok(readsBefore > 0);
    const removed = await call(`/announcements/${plainId}`, 't1', { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.id, plainId);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM announcement_reads WHERE announcement_id = ?', [plainId])).rows[0].n, 0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM announcements WHERE id = ?', [plainId])).rows[0].n, 0);
    assert.equal((await call('/announcements', 's1')).data.announcements.some(a => a.id === plainId), false);

    // Email only when asked, to approved students of this teacher only
    const sent = [];
    const originalNotify = notifier.notify;
    notifier.notify = (req, event, data) => { sent.push({ event, data }); };
    try {
      await call('/announcements', 't1', { method: 'POST', body: { title: 'Quiet', body: 'No email.' } });
      assert.equal(sent.length, 0);
      await call('/announcements', 't1', { method: 'POST', body: { title: 'Loud', body: 'Email me.', email_students: true } });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].event, 'announcement.posted');
      assert.deepEqual([...sent[0].data.to].sort(), ['s1@example.test', 's1b@example.test']);
      assert.equal(sent[0].data.title, 'Loud');
      assert.equal(sent[0].data.excerpt, 'Email me.');
      assert.equal(sent[0].data.teacher_name, 'Test t1');
      notifier.notify = () => { throw new Error('mail down'); };
      const resilient = await call('/announcements', 't1', { method: 'POST', body: { title: 'Still posts', body: 'x', email_students: true } });
      assert.equal(resilient.status, 201, 'a failing mailer never fails the post');
    } finally {
      notifier.notify = originalNotify;
    }

    console.log('announcements_flow: all checks passed');
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
