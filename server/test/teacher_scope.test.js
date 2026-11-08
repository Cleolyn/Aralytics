// Teachers only see their own advisees' scores, interventions and quiz submissions.
// Two teachers, one approved learner each, both answering the same quiz.
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

const COMPETENCY = 'comp-ap10-q1-001';

async function addUser(id, role) {
  await db.query(`INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section)
    VALUES (?, ?, 'Test', ?, ?, ?, 'CLERK_MANAGED_AUTH', ?, ?)`,
  [id, `account:${id}`, id, `Test ${id}`, `${id}@example.test`, role, role === 'STUDENT' ? `10-${id}` : null]);
  identities.set(id, {
    firstName: 'Test', lastName: id, primaryEmailAddressId: 'email',
    emailAddresses: [{ id: 'email', emailAddress: `${id}@example.test`, verification: { status: 'verified' } }]
  });
}

async function enroll(studentId, teacherId, lrn) {
  await db.query(`INSERT OR IGNORE INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash)
    VALUES (?, ?, '2026-2027', ?, ?)`, [`inv-${teacherId}`, teacherId, JSON.stringify([`10-${studentId}`]), `hash-${teacherId}`]);
  await db.query(`INSERT INTO enrollment_requests (user_id, invitation_id, lrn, full_name, mobile, section, status)
    VALUES (?, ?, ?, ?, '09171234567', ?, 'APPROVED')`, [studentId, `inv-${teacherId}`, lrn, `Test ${studentId}`, `10-${studentId}`]);
}

async function attempt(studentId) {
  await db.query(`INSERT INTO quiz_attempts (id, quiz_id, student_id, score, total_points, is_passed) VALUES (?, 'scope-quiz', ?, 2, 10, 0)`, [`att-${studentId}`, studentId]);
  await db.query(`INSERT INTO quiz_submissions (id, quiz_id, student_id, started_at, submitted_at, score_obtained, percentage, status)
    VALUES (?, 'scope-quiz', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 20, 'SUBMITTED')`, [`sub-${studentId}`, studentId]);
  await db.query(`INSERT INTO interventions (id, student_id, competency_id, status) VALUES (?, ?, ?, 'RECOMMENDED')`, [`intv-${studentId}`, studentId, COMPETENCY]);
}

async function run() {
  await initializeDatabase();
  for (const [id, role] of [['tA', 'TEACHER'], ['tB', 'TEACHER'], ['sA', 'STUDENT'], ['sB', 'STUDENT']]) await addUser(id, role);
  await enroll('sA', 'tA', '111111111111');
  await enroll('sB', 'tB', '222222222222');
  await db.query(`INSERT INTO quizzes (id, competency_id, title, total_points, passing_score, is_published, created_by)
    VALUES ('scope-quiz', ?, 'Shared quiz', 10, 7, 1, 'tA')`, [COMPETENCY]);
  await attempt('sA');
  await attempt('sB');

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, user, { method = 'GET', body } = {}) => {
    const response = await fetch(`${origin}/api${route}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-test-user': user }, ...(body ? { body: JSON.stringify(body) } : {})
    });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, data: type.includes('json') ? await response.json() : await response.arrayBuffer() };
  };
  const studentsIn = body => {
    const ids = new Set();
    JSON.stringify(body, (key, value) => { if (key === 'student_id' && typeof value === 'string') ids.add(value); if (key === 'student' && value?.id) ids.add(value.id); return value; });
    return [...ids].sort();
  };

  try {
    for (const route of ['/analytics/proficiency', '/analytics/remediation-queue', '/teacher/profiling', '/teacher/remediation-queue', '/teacher/dashboard', '/submissions/gradebook']) {
      const asA = await call(route, 'tA');
      const asB = await call(route, 'tB');
      assert.equal(asA.status, 200, route);
      assert.deepEqual(studentsIn(asA.data), ['sA'], `${route}: teacher A sees only their learner`);
      assert.deepEqual(studentsIn(asB.data), ['sB'], `${route}: teacher B sees only their learner`);
    }

    // Exports carry names, so check the bytes for the other class's learner.
    const xlsx = await call('/analytics/export/xlsx', 'tA');
    assert.equal(xlsx.status, 200);
    const XLSX = require('xlsx');
    const rows = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(xlsx.data)).Sheets.Master_Gradebook);
    assert.deepEqual(rows.map(r => r['Student Name']), ['Test sA'], 'gradebook export has only teacher A\'s learner');

    // Single records: a teacher may open their advisee's work or attempts on their own quiz.
    assert.equal((await call('/submissions/detail/sub-sA', 'tA')).status, 200);
    assert.equal((await call('/submissions/detail/sub-sB', 'tA')).status, 200, 'quiz author sees attempts on their quiz');
    assert.equal((await call('/submissions/detail/sub-sA', 'tB')).status, 404, 'other teacher cannot open the record');
    assert.equal((await call('/proctoring/trail/sub-sA', 'tB')).status, 404);

    // Interventions on another teacher's learner are refused and left alone.
    assert.equal((await call('/analytics/intervention/intv-sB/action', 'tA', { method: 'POST', body: { action: 'APPROVE' } })).status, 404);
    assert.equal((await call('/analytics/interventions', 'tA', { method: 'POST', body: { student_id: 'sB', competency_id: COMPETENCY } })).status, 404);
    assert.equal((await call('/analytics/interventions/intv-sB', 'tA', { method: 'DELETE' })).status, 404);
    const { rows: untouched } = await db.query("SELECT status FROM interventions WHERE id = 'intv-sB'");
    assert.equal(untouched[0].status, 'RECOMMENDED');
    assert.equal((await call('/analytics/intervention/intv-sB/action', 'tB', { method: 'POST', body: { action: 'APPROVE' } })).status, 200);

    console.log('teacher_scope: all checks passed');
  } finally {
    server.close();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
