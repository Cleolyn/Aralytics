// Admin account management over the real Express app: people directory, suspension,
// instructor revocation, account deletion, the audit log and the email wire-ups.
// In-memory main database, fake D1 shards and a fake identity provider. Nothing live is touched.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
delete process.env.RESEND_API_KEY;
delete process.env.MAIL_FROM;
const assert = require('node:assert/strict');

const sdkPath = require.resolve('@clerk/express');
require(sdkPath);
const originalSDK = require.cache[sdkPath].exports;
const identities = new Map();
const clerk = { deleted: [], failWith: null };
require.cache[sdkPath].exports = {
  getAuth: req => ({ userId: req.headers['x-test-user'] || null }),
  clerkMiddleware: () => (_req, _res, next) => next(),
  createClerkClient: () => ({
    users: {
      getUser: async id => identities.get(id),
      deleteUser: async id => {
        if (clerk.failWith) throw clerk.failWith;
        clerk.deleted.push(id);
      }
    }
  })
};
const db = require('../src/config/database');
const app = require('../src/app');
require.cache[sdkPath].exports = originalSDK;
const { initializeDatabase } = require('../src/db/init');
const accounts = require('../src/services/accountAdminService');
const notifier = require('../src/services/notifier');
const { createFakeD1 } = require('./helpers/fakeD1');

const COMPETENCY = 'comp-ap10-q1-001';
const hash = text => [...text].reduce((total, ch) => (total * 31 + ch.charCodeAt(0)) | 0, 7);

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
    VALUES (?, ?, ?, ?, '09171234567', '10-Rizal', ?)`,
  [studentId, invitation, String(Math.abs(hash(studentId))).padStart(12, '1').slice(0, 12), `Test ${studentId}`, status]);
}

const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].count);

async function run() {
  await initializeDatabase();
  const shardA = createFakeD1();
  const shardB = createFakeD1();
  const env = { FILES_DB_1: shardA, FILES_DB_2: shardB, FILE_TOKEN_SECRET: 'admin-accounts-test-secret' };
  app.locals.env = env;

  for (const [id, role] of [['admin1', 'ADMIN'], ['admin2', 'ADMIN'], ['t1', 'TEACHER'], ['t2', 'TEACHER'], ['t3', 'TEACHER'],
    ['s1', 'STUDENT'], ['s2', 'STUDENT'], ['s3', 'STUDENT'], ['s4', 'STUDENT'], ['s5', 'STUDENT'], ['s6', 'STUDENT'], ['s7', 'STUDENT'],
    ['applicant', 'STUDENT'], ['applicant2', 'STUDENT'], ['plain', 'STUDENT']]) await addUser(id, role);

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
  const audit = async (query = '') => (await call(`/admin/audit?limit=100${query}`, 'admin1')).data;
  const actions = async () => (await audit()).entries.map(e => e.action);

  try {
    // -----------------------------------------------------------------------------
    // Access and the people directory
    // -----------------------------------------------------------------------------
    assert.equal((await call('/admin/users', null)).status, 401);
    assert.equal((await call('/admin/users', 't1')).status, 403);
    assert.equal((await call('/admin/audit', 's1')).status, 403);

    await enroll('s1', 't1', 'APPROVED');
    await enroll('s2', 't1', 'PENDING');
    await enroll('s3', 't1', 'REJECTED');
    const everyone = await call('/admin/users', 'admin1');
    assert.equal(everyone.status, 200);
    assert.equal(everyone.data.total, 15);
    const s1Row = everyone.data.users.find(u => u.id === 's1');
    assert.deepEqual(
      { status: s1Row.status, enrollment_status: s1Row.enrollment_status, adviser_name: s1Row.adviser_name, email: s1Row.email },
      { status: 'ACTIVE', enrollment_status: 'APPROVED', adviser_name: 'Test t1', email: 's1@example.test' });
    assert.equal((await call('/admin/users?q=TEST%20T2', 'admin1')).data.users[0].id, 't2', 'search ignores case');
    assert.equal((await call('/admin/users?role=ADMIN', 'admin1')).data.total, 2);
    assert.equal((await call('/admin/users?role=NOPE', 'admin1')).status, 400);
    assert.equal((await call('/admin/users?status=SUSPENDED', 'admin1')).data.total, 0);
    assert.equal((await call('/admin/users?page=2', 'admin1')).data.users.length, 0, 'page 2 is empty for 15 people');

    // -----------------------------------------------------------------------------
    // Suspension
    // -----------------------------------------------------------------------------
    assert.equal((await call('/files', 's1')).status, 200, 'active students reach protected routes');
    const noReason = await call('/admin/users/s1/suspend', 'admin1', { method: 'POST', body: { reason: '  ' } });
    assert.equal(noReason.status, 400); assert.equal(noReason.data.code, 'REASON_REQUIRED');
    assert.equal((await call('/admin/users/ghost/suspend', 'admin1', { method: 'POST', body: { reason: 'x' } })).data.code, 'USER_NOT_FOUND');
    const selfSuspend = await call('/admin/users/admin1/suspend', 'admin1', { method: 'POST', body: { reason: 'x' } });
    assert.equal(selfSuspend.status, 403); assert.equal(selfSuspend.data.code, 'CANNOT_TARGET_SELF');
    assert.equal((await call('/admin/users/s1/unsuspend', 'admin1', { method: 'POST' })).data.code, 'NOT_SUSPENDED');

    const suspended = await call('/admin/users/s1/suspend', 'admin1', { method: 'POST', body: { reason: 'x'.repeat(400) } });
    assert.equal(suspended.status, 200);
    assert.equal(suspended.data.user.status, 'SUSPENDED');
    assert.equal(suspended.data.user.suspended_reason.length, 300, 'reasons are capped at 300 characters');
    assert.equal((await call('/admin/users/s1/suspend', 'admin1', { method: 'POST', body: { reason: 'again' } })).data.code, 'ALREADY_SUSPENDED');

    const blocked = await call('/files', 's1');
    assert.equal(blocked.status, 403); assert.equal(blocked.data.code, 'ACCOUNT_SUSPENDED');
    assert.equal((await call('/enrollment/status', 's1')).data.code, 'ACCOUNT_SUSPENDED');
    const synced = await call('/auth/sync', 's1', { method: 'POST', body: {} });
    assert.equal(synced.status, 200, 'sync still works so the app can show the suspended page');
    assert.equal(synced.data.user.status, 'SUSPENDED');
    assert.equal(synced.data.user.suspended_reason.length, 300);
    const me = await call('/auth/me', 's1');
    assert.equal(me.status, 200); assert.equal(me.data.user.status, 'SUSPENDED');
    assert.equal((await call('/admin/users?status=SUSPENDED', 'admin1')).data.total, 1);

    assert.equal((await call('/admin/users/s1/unsuspend', 'admin1', { method: 'POST' })).data.user.status, 'ACTIVE');
    assert.equal((await call('/files', 's1')).status, 200, 'unsuspended accounts work again');
    assert.equal((await call('/auth/me', 's1')).data.user.status, 'ACTIVE');

    // Guards that cannot be reached through HTTP are checked on the service.
    const lone = await accounts.getUser('admin2');
    await db.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = 'admin2'`);
    assert.equal(await accounts.isLastActiveAdmin(await accounts.getUser('admin1')), true);
    await assert.rejects(accounts.suspend({ id: 'ghost-admin', email: 'g@example.test' }, 'admin1', 'test'), { code: 'LAST_ADMIN' });
    await assert.rejects(accounts.deleteAccount({ id: 'ghost-admin' }, 'admin1', 'admin1@example.test',
      { env, clerk: { users: { deleteUser: async () => assert.fail('Clerk must not be called') } } }), { code: 'LAST_ADMIN' });
    await db.query(`UPDATE users SET status = 'ACTIVE' WHERE id = ?`, [lone.id]);
    assert.equal(await accounts.isLastActiveAdmin(await accounts.getUser('admin1')), false);

    // -----------------------------------------------------------------------------
    // Revoking instructor access
    // -----------------------------------------------------------------------------
    await db.query(`INSERT INTO instructor_applications (user_id, full_name, school, position, mobile, status)
      VALUES ('t1', 'Test t1', 'Ponce NHS', 'Teacher I', '09171234567', 'APPROVED')`);
    await db.query(`INSERT INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash) VALUES ('inv-t1-second', 't1', '2026-2027', '["10-Bonifacio"]', 'hash-t1-second')`);
    const notTeacher = await call('/admin/users/s1/revoke-instructor', 'admin1', { method: 'POST', body: { reason: 'x' } });
    assert.equal(notTeacher.status, 409); assert.equal(notTeacher.data.code, 'NOT_INSTRUCTOR');
    assert.equal((await call('/admin/users/t1/revoke-instructor', 'admin1', { method: 'POST', body: {} })).data.code, 'REASON_REQUIRED');
    assert.equal((await call('/enrollment/manage', 't1')).status, 200);

    const revoked = await call('/admin/users/t1/revoke-instructor', 'admin1', { method: 'POST', body: { reason: 'Left the school' } });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.data.user.role, 'STUDENT');
    assert.equal(revoked.data.closed_invitations, 2);
    assert.equal(revoked.data.released_students, 2, 'pending and approved students are released');
    assert.equal(await count(`SELECT COUNT(*) AS count FROM class_invitations WHERE teacher_id = 't1' AND active = 1`), 0);
    const released = (await db.query(`SELECT user_id, status, reason FROM enrollment_requests ORDER BY user_id`)).rows;
    assert.equal(released.find(r => r.user_id === 's1').status, 'REJECTED');
    assert.equal(released.find(r => r.user_id === 's1').reason, accounts.REVOKED_ENROLLMENT_REASON);
    assert.equal(released.find(r => r.user_id === 's2').status, 'REJECTED');
    assert.equal(released.find(r => r.user_id === 's3').reason, null, 'already-rejected requests are untouched');
    const application = (await db.query(`SELECT status, reason FROM instructor_applications WHERE user_id = 't1'`)).rows[0];
    assert.equal(application.status, 'REJECTED');
    assert.equal(application.reason, 'Instructor access revoked: Left the school');
    assert.equal((await call('/enrollment/manage', 't1')).status, 403, 'revoked instructors lose the teacher workspace');
    assert.equal((await call('/admin/users/t1/revoke-instructor', 'admin1', { method: 'POST', body: { reason: 'again' } })).data.code, 'NOT_INSTRUCTOR');
    const reapplied = await call('/instructor-applications', 't1', {
      method: 'POST', body: { full_name: 'Maria Santos', school: 'Ponce NHS', position: 'Teacher I', mobile: '09171234567' } });
    assert.equal(reapplied.status, 201, 'a revoked instructor can apply again');
    assert.equal(reapplied.data.application.status, 'PENDING');

    // -----------------------------------------------------------------------------
    // Deleting accounts
    // -----------------------------------------------------------------------------
    await enroll('s4', 't2', 'APPROVED');
    await db.query(`INSERT INTO performance_tasks (id, quarter, competency_id, title, instructions, created_by)
      VALUES ('task-t2', 'Q1', ?, 'Task', 'Do it', 't2')`, [COMPETENCY]);
    await db.query(`INSERT INTO quizzes (id, competency_id, title, created_by) VALUES ('quiz-t2', ?, 'Quiz', 't2')`, [COMPETENCY]);

    // A student with a lot of history, including one stored file.
    const reserved = await call('/files', 's4', { method: 'POST', body: { purpose: 'personal', name: 'notes.pdf', size: 20 } });
    assert.equal(reserved.status, 201);
    const bytes = Buffer.alloc(20); bytes.write('%PDF-1.4\n', 0);
    const part = await fetch(origin + reserved.data.upload.part_url.replace('{index}', 0), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    assert.equal(part.status, 200);
    assert.equal((await call(`/files/${reserved.data.file.id}/complete`, 's4', { method: 'POST' })).status, 200);
    assert.equal(shardA.chunkCount() + shardB.chunkCount(), 1);
    await db.query(`INSERT INTO quiz_attempts (id, quiz_id, student_id) VALUES ('att-1', 'quiz-t2', 's4')`);
    await db.query(`INSERT INTO security_logs (id, attempt_id, event_type) VALUES ('sec-1', 'att-1', 'TAB_SWITCH')`);
    await db.query(`INSERT INTO quiz_submissions (id, quiz_id, student_id, started_at) VALUES ('sub-1', 'quiz-t2', 's4', '2026-01-01 00:00:00')`);
    await db.query(`INSERT INTO quiz_proctoring_logs (id, submission_id, event_type) VALUES ('log-1', 'sub-1', 'BLUR')`);
    await db.query(`INSERT INTO student_competency_mastery (id, student_id, competency_id, mastery_status) VALUES ('m-1', 's4', 'comp-ap10-q1-001', 'DEVELOPING')`);
    await db.query(`INSERT INTO remedial_interventions (id, student_id, competency_id, trigger_submission_id) VALUES ('rem-1', 's4', 'comp-ap10-q1-001', 'sub-1')`);
    await db.query(`INSERT INTO performance_task_submissions (id, task_id, student_id, file_name, file_url) VALUES ('pts-1', 'task-t2', 's4', 'a.pdf', '/x')`);

    const mismatch = await call('/admin/users/s4', 'admin1', { method: 'DELETE', body: { confirm_email: 'someone@else.test' } });
    assert.equal(mismatch.status, 400); assert.equal(mismatch.data.code, 'EMAIL_MISMATCH');
    assert.equal((await call('/admin/users/admin1', 'admin1', { method: 'DELETE', body: { confirm_email: 'admin1@example.test' } })).data.code, 'CANNOT_TARGET_SELF');
    assert.equal((await call('/admin/users/ghost', 'admin1', { method: 'DELETE', body: { confirm_email: 'x' } })).data.code, 'USER_NOT_FOUND');
    assert.equal(await count(`SELECT COUNT(*) AS count FROM users WHERE id = 's4'`), 1);

    // An instructor who owns content (task, quiz, a class with students) cannot be deleted.
    const owns = await call('/admin/users/t2', 'admin1', { method: 'DELETE', body: { confirm_email: 'T2@example.test' } });
    assert.equal(owns.status, 409); assert.equal(owns.data.code, 'ACCOUNT_OWNS_CONTENT');
    assert.deepEqual(owns.data.content, { lessons: 0, quizzes: 1, tasks: 1, classes: 1 });
    assert.deepEqual(clerk.deleted, [], 'Clerk is untouched when deletion is refused');

    // Clerk failures leave everything in place; a missing Clerk user counts as success.
    clerk.failWith = Object.assign(new Error('Clerk exploded'), { status: 500 });
    const clerkDown = await call('/admin/users/s4', 'admin1', { method: 'DELETE', body: { confirm_email: 's4@example.test' } });
    assert.equal(clerkDown.status, 502); assert.equal(clerkDown.data.code, 'CLERK_DELETE_FAILED');
    assert.equal(await count(`SELECT COUNT(*) AS count FROM users WHERE id = 's4'`), 1);
    assert.equal(shardA.chunkCount() + shardB.chunkCount(), 1, 'files survive a failed Clerk delete');

    clerk.failWith = Object.assign(new Error('Not found'), { status: 404 });
    const gone = await call('/admin/users/s5', 'admin1', { method: 'DELETE', body: { confirm_email: 's5@example.test' } });
    assert.equal(gone.status, 200, 'a Clerk 404 is fine');
    clerk.failWith = null;

    const deleted = await call('/admin/users/s4', 'admin1', { method: 'DELETE', body: { confirm_email: 'S4@Example.test' } });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.data, { success: true, id: 's4', removed_files: 1 });
    assert.deepEqual(clerk.deleted, ['s4'], 'Clerk delete was called');
    assert.equal(shardA.chunkCount() + shardB.chunkCount(), 0, 'file chunks are gone');
    for (const table of ['users WHERE id', 'files WHERE owner_id', 'quiz_attempts WHERE student_id', 'quiz_submissions WHERE student_id',
      'student_competency_mastery WHERE student_id', 'remedial_interventions WHERE student_id', 'performance_task_submissions WHERE student_id',
      'enrollment_requests WHERE user_id']) {
      assert.equal(await count(`SELECT COUNT(*) AS count FROM ${table} = 's4'`), 0, `${table} rows are removed`);
    }
    assert.equal(await count(`SELECT COUNT(*) AS count FROM security_logs`), 0);
    assert.equal(await count(`SELECT COUNT(*) AS count FROM quiz_proctoring_logs`), 0);
    assert.equal(await count(`SELECT COUNT(*) AS count FROM performance_tasks WHERE id = 'task-t2'`), 1, "others' content stays");

    // An instructor with nothing of value can be deleted, including unused class codes.
    await db.query(`INSERT INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash) VALUES ('inv-t3', 't3', '2026-2027', '["A"]', 'hash-t3')`);
    assert.equal((await call('/admin/users/t3', 'admin1', { method: 'DELETE', body: { confirm_email: 't3@example.test' } })).status, 200);
    assert.equal(await count(`SELECT COUNT(*) AS count FROM class_invitations WHERE teacher_id = 't3'`), 0);

    // -----------------------------------------------------------------------------
    // Audit log: reviews and storage purges join the account actions
    // -----------------------------------------------------------------------------
    await db.query(`INSERT INTO instructor_applications (user_id, full_name, school, position, mobile, status) VALUES
      ('applicant', 'Ana Reyes', 'Ponce NHS', 'Teacher I', '09171234567', 'PENDING'),
      ('applicant2', 'Ben Cruz', 'Ponce NHS', 'Teacher I', '09171234568', 'PENDING')`);
    assert.equal((await call('/admin/applications/applicant', 'admin1', { method: 'PATCH', body: { status: 'APPROVED' } })).status, 200);
    assert.equal((await call('/admin/applications/applicant2', 'admin1', { method: 'PATCH', body: { status: 'REJECTED', reason: 'Add your ID' } })).status, 200);
    assert.equal((await call('/admin/users/s6/files', 'admin1', { method: 'DELETE' })).status, 200);

    const seen = await actions();
    for (const action of ['ACCOUNT_SUSPENDED', 'ACCOUNT_UNSUSPENDED', 'INSTRUCTOR_REVOKED', 'ACCOUNT_DELETED',
      'APPLICATION_APPROVED', 'APPLICATION_RETURNED', 'STORAGE_PURGED']) {
      assert.ok(seen.includes(action), `${action} has an audit row`);
    }
    assert.equal(seen.filter(a => a === 'ACCOUNT_DELETED').length, 3, 's4, s5 and t3');
    const full = await audit();
    const deletedRow = full.entries.find(e => e.action === 'ACCOUNT_DELETED' && e.target_id === 's4');
    assert.equal(deletedRow.target_label, 's4@example.test', 'the email outlives the account');
    assert.equal(deletedRow.actor_email, 'admin1@example.test');
    assert.deepEqual(deletedRow.details, { role: 'STUDENT', removed_files: 1 });
    assert.equal(full.entries.find(e => e.action === 'INSTRUCTOR_REVOKED').details.reason, 'Left the school');
    assert.equal((await audit('&action=STORAGE_PURGED')).entries.length, 1);

    // Pagination walks the whole log without repeats.
    const pageIds = [];
    let cursor = '';
    do {
      const page = (await call(`/admin/audit?limit=3${cursor}`, 'admin1')).data;
      assert.ok(page.entries.length <= 3);
      pageIds.push(...page.entries.map(e => e.id));
      cursor = page.next_before ? `&before=${encodeURIComponent(page.next_before)}` : '';
    } while (cursor);
    assert.equal(new Set(pageIds).size, full.entries.length);
    assert.equal(pageIds.length, full.entries.length);

    // -----------------------------------------------------------------------------
    // Email wire-ups (transport is captured, never sent)
    // -----------------------------------------------------------------------------
    const sent = [];
    notifier.setTransport(async messages => { sent.push(...messages); });
    env.RESEND_API_KEY = 'test-key'; env.MAIL_FROM = 'Aralytics <no-reply@example.test>';

    await db.query(`INSERT INTO instructor_applications (user_id, full_name, school, position, mobile, status)
      VALUES ('s7', 'Cara Lim', 'Ponce NHS', 'Teacher I', '09171234569', 'PENDING')`);
    await call('/admin/applications/s7', 'admin1', { method: 'PATCH', body: { status: 'APPROVED' } });
    await call('/admin/users/s2/suspend', 'admin1', { method: 'POST', body: { reason: 'Shared account' } });
    await call('/admin/users/s7/revoke-instructor', 'admin1', { method: 'POST', body: { reason: 'Contract ended' } });

    await addUser('t4', 'TEACHER'); await addUser('s8', 'STUDENT'); await addUser('s9', 'STUDENT');
    await enroll('s8', 't4', 'PENDING'); await enroll('s9', 't4', 'PENDING');
    assert.equal((await call('/enrollment/requests/s8', 't4', { method: 'PATCH', body: { status: 'APPROVED' } })).status, 200);
    assert.equal((await call('/enrollment/requests/s9', 't4', { method: 'PATCH', body: { status: 'REJECTED', reason: 'Wrong LRN' } })).status, 200);

    await db.query(`INSERT INTO performance_tasks (id, quarter, competency_id, title, instructions, total_points, created_by)
      VALUES ('task-t4', 'Q1', ?, 'Poster', 'Make one', 50, 't4')`, [COMPETENCY]);
    await db.query(`INSERT INTO performance_task_submissions (id, task_id, student_id, file_name, file_url) VALUES ('pts-8', 'task-t4', 's8', 'a.pdf', '/x')`);
    assert.equal((await call('/performance-tasks/submissions/pts-8/grade', 't4', { method: 'PATCH', body: { score: 45, feedback: 'Great <work>' } })).status, 200);

    await notifier.flush();
    const bySubject = subject => sent.find(m => m.subject.includes(subject));
    assert.deepEqual(bySubject('instructor application was approved').to, ['s7@example.test']);
    assert.ok(bySubject('suspended'));
    assert.ok(bySubject('instructor access ended').text.includes('Contract ended'));
    assert.deepEqual(bySubject('enrollment was approved').to, ['s8@example.test']);
    assert.ok(bySubject('enrollment needs changes').text.includes('Wrong LRN'));
    const graded = bySubject('graded: Poster');
    assert.ok(graded.text.includes('45 / 50'));
    assert.ok(graded.html.includes('Great &lt;work&gt;'), 'HTML is escaped');
    assert.equal(graded.from, 'Aralytics <no-reply@example.test>');

    // A transport that throws never breaks the request.
    notifier.setTransport(async () => { throw new Error('mail is down'); });
    assert.equal((await call('/admin/users/s2/unsuspend', 'admin1', { method: 'POST' })).status, 200);
    await notifier.flush();
    notifier.setTransport();

    console.log('PASS: directory, suspend/unsuspend with ACCOUNT_SUSPENDED gate, guards, revoke cascade and reapply, delete (owns-content, Clerk, files, rows), audit log + pagination, email wire-ups.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
