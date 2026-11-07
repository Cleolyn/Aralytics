// Instructor applications and the admin review flow over real HTTP routes.
// Uses an isolated in-memory database and a fake verified identity provider.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const express = require('express');

const sdkPath = require.resolve('@clerk/express');
require(sdkPath);
const originalSDK = require.cache[sdkPath].exports;
const identities = new Map();
require.cache[sdkPath].exports = {
  getAuth: req => ({ userId: req.headers['x-test-user'] || null }),
  createClerkClient: () => ({ users: { getUser: async id => identities.get(id) } })
};
const db = require('../src/config/database');
const { verifyToken, requireTeacher, requireStudent } = require('../src/middleware/auth');
const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/authRoutes'));
app.use('/api/enrollment', require('../src/routes/enrollmentRoutes'));
app.use('/api/instructor-applications', require('../src/routes/instructorApplicationRoutes'));
app.use('/api/admin', require('../src/routes/adminRoutes'));
app.get('/api/teacher-only', verifyToken, requireTeacher, (_req, res) => res.json({ ok: true }));
app.get('/api/student-only', verifyToken, requireStudent, (_req, res) => res.json({ ok: true }));
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ message: err.message }));
require.cache[sdkPath].exports = originalSDK;
const { initializeDatabase } = require('../src/db/init');
const { grantAdmin } = require('../src/db/grantAdmin');

function identity(id, { verified = true, role } = {}) {
  identities.set(id, {
    firstName: 'Test', lastName: id, primaryEmailAddressId: 'email',
    emailAddresses: [{ id: 'email', emailAddress: `${id}@example.test`, verification: { status: verified ? 'verified' : 'unverified' } }],
    publicMetadata: role ? { role } : {}
  });
}

const application = {
  full_name: 'Maria Santos', school: 'Ponce National High School', position: 'Teacher I',
  employee_id: 'EMP-2026/01', mobile: '+63 917 123 4567', message: 'AP10 adviser for 10-Rizal.'
};

async function run() {
  await initializeDatabase();
  identity('admin');
  identity('applicant', { role: 'TEACHER' }); // Clerk metadata must be ignored.
  identity('enrolled-student');
  identity('meta-admin', { role: 'ADMIN' });

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, user, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    // Everyone starts as a student, regardless of Clerk metadata.
    for (const id of ['admin', 'applicant', 'enrolled-student', 'meta-admin']) {
      const synced = await call('/auth/sync', id, {});
      assert.equal(synced.status, 200);
      assert.equal(synced.data.role, 'STUDENT', `${id} must start as a student`);
    }
    assert.equal((await call('/auth/sync', 'applicant', {})).data.user.instructor_application, null);

    // Bootstrapping the first admin: dry run changes nothing; --apply promotes.
    await grantAdmin('admin@example.test');
    assert.equal((await call('/auth/me', 'admin')).data.user.role, 'STUDENT');
    await grantAdmin('ADMIN@example.test', { apply: true });
    assert.equal((await call('/auth/me', 'admin')).data.user.role, 'ADMIN');
    await assert.rejects(grantAdmin('nobody@example.test', { apply: true }), /must sign in to Aralytics once/);

    // Admin endpoints require the ADMIN role.
    assert.equal((await call('/admin/applications', null)).status, 401);
    assert.equal((await call('/admin/applications', 'applicant')).status, 403);
    assert.equal((await call('/admin/applications', 'meta-admin')).status, 403, 'Clerk metadata must not grant admin');
    assert.equal((await call('/admin/applications', 'admin')).status, 200);
    // Admins do not use the teacher or student workspaces.
    assert.equal((await call('/teacher-only', 'admin')).status, 403);
    assert.equal((await call('/student-only', 'admin')).status, 403);

    // Application validation.
    for (const [field, value, message] of [
      ['full_name', 'M4ria', /full name/], ['school', '', /school/], ['position', 'x', /position/],
      ['mobile', '12345', /mobile number/], ['employee_id', 'bad<id>', /Employee ID/], ['message', 'x'.repeat(1001), /1000 characters/]
    ]) {
      const invalid = await call('/instructor-applications', 'applicant', { ...application, [field]: value });
      assert.equal(invalid.status, 400, `${field} must be validated`);
      assert.match(invalid.data.message, message);
    }

    // Submit, and stay a student while pending.
    const submitted = await call('/instructor-applications', 'applicant', application);
    assert.equal(submitted.status, 201);
    assert.equal(submitted.data.application.status, 'PENDING');
    assert.equal(submitted.data.application.mobile, '09171234567');
    assert.equal(submitted.data.application.employee_id, 'EMP-2026/01');
    assert.equal((await call('/instructor-applications', 'applicant', application)).status, 409, 'No duplicate pending applications');
    assert.deepEqual((await call('/auth/sync', 'applicant', {})).data.user.instructor_application, { status: 'PENDING', reason: null });
    assert.equal((await call('/teacher-only', 'applicant')).status, 403, 'Pending applicants have no teacher access');

    // Admin sees it.
    const pending = await call('/admin/applications?status=PENDING', 'admin');
    assert.equal(pending.data.applications.length, 1);
    assert.equal(pending.data.applications[0].email, 'applicant@example.test');
    assert.equal(pending.data.applications[0].school, 'Ponce National High School');
    assert.deepEqual((await call('/admin/summary', 'admin')).data.summary, { pending: 1, approved: 0, rejected: 0, instructors: 0 });
    assert.equal((await call('/admin/applications?status=BOGUS', 'admin')).status, 400);

    // Review rules.
    assert.equal((await call('/admin/applications/applicant', 'admin', { status: 'REJECTED' }, 'PATCH')).status, 400, 'Rejection needs a reason');
    assert.equal((await call('/admin/applications/applicant', 'admin', { status: 'MAYBE' }, 'PATCH')).status, 400);
    assert.equal((await call('/admin/applications/missing', 'admin', { status: 'APPROVED' }, 'PATCH')).status, 404);
    assert.equal((await call('/admin/applications/admin', 'admin', { status: 'APPROVED' }, 'PATCH')).status, 403, 'No self-review');

    const rejected = await call('/admin/applications/applicant', 'admin', { status: 'REJECTED', reason: 'Please use your DepEd employee ID.' }, 'PATCH');
    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.application.status, 'REJECTED');
    assert.equal(rejected.data.application.reviewed_by_name, 'Test admin');
    assert.equal((await call('/admin/applications/applicant', 'admin', { status: 'APPROVED' }, 'PATCH')).status, 409, 'Reviewed once only');
    assert.deepEqual((await call('/auth/sync', 'applicant', {})).data.user.instructor_application,
      { status: 'REJECTED', reason: 'Please use your DepEd employee ID.' });
    assert.equal((await call('/auth/me', 'applicant')).data.user.role, 'STUDENT');

    // Resubmit after correcting.
    const resubmitted = await call('/instructor-applications', 'applicant', { ...application, employee_id: 'DEPED-4401' });
    assert.equal(resubmitted.status, 201);
    assert.equal(resubmitted.data.application.status, 'PENDING');
    assert.equal(resubmitted.data.application.reason, null);

    // Approve -> TEACHER.
    const approved = await call('/admin/applications/applicant', 'admin', { status: 'APPROVED' }, 'PATCH');
    assert.equal(approved.status, 200);
    assert.equal(approved.data.application.status, 'APPROVED');
    const synced = await call('/auth/sync', 'applicant', {});
    assert.equal(synced.data.role, 'TEACHER');
    assert.equal(synced.data.user.full_name, 'Maria Santos');
    assert.equal(synced.data.user.first_name, 'Maria');
    assert.equal(synced.data.user.last_name, 'Santos');
    assert.equal(synced.data.user.instructor_application, null);
    assert.equal((await call('/teacher-only', 'applicant')).status, 200);
    assert.equal((await call('/instructor-applications', 'applicant', application)).status, 409, 'Teachers cannot re-apply');
    assert.equal((await call('/instructor-applications', 'admin', application)).status, 409, 'Admins cannot apply');

    const instructors = await call('/admin/instructors', 'admin');
    assert.equal(instructors.data.instructors.length, 1);
    assert.deepEqual(
      { email: instructors.data.instructors[0].email, school: instructors.data.instructors[0].school, students: instructors.data.instructors[0].students },
      { email: 'applicant@example.test', school: 'Ponce National High School', students: 0 }
    );
    assert.deepEqual((await call('/admin/summary', 'admin')).data.summary, { pending: 0, approved: 1, rejected: 0, instructors: 1 });

    // A student who is enrolled (or waiting to be) in a class cannot apply with the same account.
    const invitation = await call('/enrollment/invitations', 'applicant', { school_year: '2026-2027', sections: ['10-Rizal'] });
    assert.equal(invitation.status, 201);
    const enrolled = await call('/enrollment/request', 'enrolled-student', {
      code: invitation.data.code, lrn: '123456789012', full_name: 'Juan Cruz', mobile: '09171234567', section: '10-Rizal'
    });
    assert.equal(enrolled.status, 201);
    const blocked = await call('/instructor-applications', 'enrolled-student', application);
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.message, /separate account/);

    // Conversely, an account with a pending instructor application cannot submit a student enrollment request.
    identity('pending-applicant');
    await call('/auth/sync', 'pending-applicant', {});
    assert.equal((await call('/instructor-applications', 'pending-applicant', application)).status, 201);
    const blockedEnroll = await call('/enrollment/request', 'pending-applicant', {
      code: invitation.data.code, lrn: '987654321098', full_name: 'Maria Santos', mobile: '09171234567', section: '10-Rizal'
    });
    assert.equal(blockedEnroll.status, 409);
    assert.match(blockedEnroll.data.message, /pending instructor application/);

    console.log('PASS: role isolation, admin bootstrap, metadata ignored, validation, pending/rejected/resubmitted/approved lifecycle, single review, no self-review, staff and enrolled-student application limits.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
