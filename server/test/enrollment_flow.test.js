// Uses an isolated in-memory DB and a fake verified identity provider. No live accounts are changed.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/config/database');
const sdkPath = require.resolve('@clerk/express');
require(sdkPath);
const originalSDK = require.cache[sdkPath].exports;
const identities = new Map();
require.cache[sdkPath].exports = {
  getAuth: req => ({ userId: req.headers['x-test-user'] || null }),
  createClerkClient: () => ({ users: { getUser: async id => identities.get(id) } })
};
const { verifyToken } = require('../src/middleware/authMiddleware');
const authRoutes = require('../src/routes/authRoutes');
const enrollmentRoutes = require('../src/routes/enrollmentRoutes');
require.cache[sdkPath].exports = originalSDK;
const { initializeEnrollmentTables } = require('../src/services/enrollmentService');

async function run() {
  await db.query(`CREATE TABLE users (id TEXT PRIMARY KEY, lrn_or_id TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL, full_name TEXT, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL, section TEXT, section_id TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await initializeEnrollmentTables();
  for (const [id, role, verified] of [['adviser-a', 'TEACHER', true], ['adviser-b', 'TEACHER', true], ['learner-a', 'STUDENT', true], ['learner-b', 'STUDENT', true], ['unverified', 'STUDENT', false]]) {
    identities.set(id, { firstName: 'Test', lastName: id, primaryEmailAddressId: 'email',
      emailAddresses: [{ id: 'email', emailAddress: `${id}@example.test`, verification: { status: verified ? 'verified' : 'unverified' } }],
      publicMetadata: { role } });
  }
  const app = express();
  app.use(express.json()); app.use('/api/auth', authRoutes); app.use('/api/enrollment', enrollmentRoutes);
  app.get('/api/learning', verifyToken, (_req, res) => res.json({ content: 'approved access' }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, user, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await call('/auth/sync', null, {})).status, 401);
    assert.equal((await call('/auth/sync', 'unverified', {})).status, 403);
    assert.equal((await call('/auth/student-login', null, { lrn_or_id: '123456789012' })).status, 410);
    for (const id of ['adviser-a', 'adviser-b', 'learner-a', 'learner-b']) assert.equal((await call('/auth/sync', id, {})).status, 200);
    identities.set('concurrent-learner', { ...identities.get('learner-a'), emailAddresses: [{ id: 'email', emailAddress: 'concurrent@example.test', verification: { status: 'verified' } }] });
    const simultaneous = await Promise.all([call('/auth/sync', 'concurrent-learner', {}), call('/auth/sync', 'concurrent-learner', {})]);
    assert.deepEqual(simultaneous.map(result => result.status), [200, 200], 'First-login sync must be idempotent under React StrictMode');
    assert.equal((await call('/auth/sync', 'learner-a', { role: 'TEACHER', section: 'Fake', lrn_or_id: '123456789012' })).data.role, 'STUDENT');
    identities.set('email-conflict', { ...identities.get('learner-a'), publicMetadata: { role: 'TEACHER' } });
    const conflict = await call('/auth/sync', 'email-conflict', {});
    assert.equal(conflict.status, 409); assert.equal(conflict.data.code, 'ACCOUNT_LINK_REQUIRED');
    assert.doesNotMatch(conflict.data.message, /SQLITE|UNIQUE/);
    assert.equal((await call('/auth/sync', 'learner-a', {})).data.role, 'STUDENT', 'An email collision must not change the existing role');
    assert.equal((await call('/learning', 'learner-a')).status, 403);
    assert.equal((await call('/enrollment/invitations', 'learner-a', { school_year: '2026-2027', sections: ['10-Rizal'] })).status, 403);
    const invitation = await call('/enrollment/invitations', 'adviser-a', { school_year: '2026-2027', sections: ['10-Rizal', '10-Bonifacio'] });
    assert.equal(invitation.status, 201);
    const { id: invitationId, code } = invitation.data;
    assert.equal(code.length, 10);
    assert.equal((await call('/enrollment/validate-code', 'learner-a', { code: 'AAAAAAAAAA' })).status, 400);
    const preview = await call('/enrollment/validate-code', 'learner-a', { code: code.toLowerCase() });
    assert.deepEqual(preview.data.sections, ['10-Rizal', '10-Bonifacio']);
    const profile = { code, lrn: '123456789012', full_name: 'María Luz Dela Cruz', mobile: '+639171234567', section: '10-Rizal' };
    assert.equal((await call('/enrollment/request', 'learner-a', { ...profile, code: '' })).status, 400);
    assert.equal((await call('/enrollment/request', 'learner-a', { ...profile, section: 'Invented' })).status, 400);
    assert.equal((await call('/enrollment/request', 'learner-a', { ...profile, lrn: '123' })).status, 400);
    const pending = await call('/enrollment/request', 'learner-a', profile);
    assert.equal(pending.status, 201); assert.equal(pending.data.enrollment.status, 'PENDING');
    assert.equal(pending.data.enrollment.mobile, '09171234567');
    assert.equal((await call('/learning', 'learner-a')).status, 403);
    assert.equal((await call('/enrollment/request', 'learner-a', profile)).status, 409);
    assert.equal((await call('/enrollment/request', 'learner-b', profile)).status, 409);
    assert.equal((await call('/enrollment/manage', 'adviser-b')).data.requests.length, 0);
    assert.equal((await call('/enrollment/requests/learner-a', 'adviser-b', { status: 'APPROVED' }, 'PATCH')).status, 404);
    assert.equal((await call('/enrollment/requests/learner-a', 'adviser-a', { status: 'REJECTED' }, 'PATCH')).status, 400);
    assert.equal((await call('/enrollment/requests/learner-a', 'adviser-a', { status: 'REJECTED', reason: 'Please confirm your section.' }, 'PATCH')).status, 200);
    assert.equal((await call('/learning', 'learner-a')).status, 403);
    assert.equal((await call('/enrollment/request', 'learner-a', { ...profile, section: '10-Bonifacio' })).status, 201);
    const approved = await call('/enrollment/requests/learner-a', 'adviser-a', { status: 'APPROVED' }, 'PATCH');
    assert.equal(approved.status, 200); assert.equal(approved.data.enrollment.status, 'APPROVED');
    assert.equal((await call('/learning', 'learner-a')).status, 200);
    assert.equal((await call('/enrollment/requests/learner-a', 'adviser-a', { status: 'REJECTED', reason: 'Duplicate review' }, 'PATCH')).status, 409);
    const synced = await call('/auth/sync', 'learner-a', { section: 'Fake', lrn_or_id: '999999999999' });
    assert.equal(synced.data.user.section, '10-Bonifacio'); assert.equal(synced.data.user.lrn_or_id, profile.lrn);
    assert.equal(synced.data.user.enrollment_status, 'APPROVED'); assert.equal(synced.data.user.password_hash, undefined);
    assert.equal((await call(`/enrollment/invitations/${invitationId}/close`, 'adviser-b', {}, 'PATCH')).status, 404);
    assert.equal((await call(`/enrollment/invitations/${invitationId}/close`, 'adviser-a', {}, 'PATCH')).status, 200);
    assert.equal((await call('/enrollment/validate-code', 'learner-b', { code })).status, 400);
    assert.equal((await call('/learning', 'learner-a')).status, 200, 'Closing an invitation must preserve approved access');
    // A forged legacy token cannot enter the production identity path.
    const legacy = require('jsonwebtoken').sign({ id: 'learner-b', role: 'TEACHER' }, require('../src/middleware/authMiddleware').JWT_SECRET);
    const forged = await fetch(base + '/enrollment/manage', { headers: { Authorization: `Bearer ${legacy}` } });
    assert.equal(forged.status, 401);
    console.log('PASS: verified identity, code gating, validation, duplicate LRN, adviser ownership, rejection/resubmission, approval, immutable profile, code closure, and legacy-login removal.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
