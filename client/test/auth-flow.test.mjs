import assert from 'node:assert/strict';
import { accountHome, afterAuthPath, intentFromSearch, withIntent, AUTH_TASK_PATHS, authErrorMessage, isAuthStart, localAuthPath } from '../src/utils/authFlow.js';
import { syncVerifiedAccount } from '../src/services/auth.js';
import { setTokenGetter, getToken, getTokenSync } from '../src/services/api.js';

const originalFetch = globalThis.fetch;
const identity = { id: 'user_test', primaryEmailAddress: { emailAddress: 'student@example.test', verification: { status: 'verified' } } };
const clerkUser = { ...identity, reload: async () => identity };
const profile = { id: identity.id, role: 'STUDENT', email_verified: true, enrollment_status: 'NOT_ENROLLED' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
try {
  for (const [user, destination] of [
    [null, '/login'], [{ role: 'TEACHER', email_verified: false }, '/onboarding'],
    [{ role: 'TEACHER', email_verified: true }, '/teacher/dashboard'],
    [profile, '/onboarding'], [{ ...profile, enrollment_status: 'PENDING' }, '/onboarding'],
    [{ ...profile, enrollment_status: 'REJECTED' }, '/onboarding'],
    [{ ...profile, enrollment_status: 'APPROVED' }, '/student/dashboard'],
    [{ role: 'ADMIN', email_verified: true }, '/admin'], [{ role: 'ADMIN', email_verified: false }, '/onboarding'],
    [{ ...profile, instructor_application: { status: 'PENDING' } }, '/instructor/apply'],
    [{ ...profile, instructor_application: { status: 'REJECTED' } }, '/instructor/apply'],
    [{ ...profile, enrollment_status: 'APPROVED', instructor_application: { status: 'PENDING' } }, '/student/dashboard'],
    [{ ...profile, enrollment_status: 'APPROVED', status: 'SUSPENDED' }, '/suspended'],
    [{ role: 'TEACHER', email_verified: true, status: 'SUSPENDED' }, '/suspended'],
    [{ role: 'ADMIN', email_verified: true, status: 'SUSPENDED' }, '/suspended'],
    [{ role: 'TEACHER', email_verified: false, status: 'SUSPENDED' }, '/onboarding'],
    [{ role: 'TEACHER', email_verified: true, status: 'ACTIVE' }, '/teacher/dashboard']
  ]) assert.equal(accountHome(user), destination);
  // "I am a Teacher": new accounts go to instructor verification, never the class-code screen.
  for (const [user, intent, destination] of [
    [profile, 'TEACHER', '/instructor/apply'],
    [{ role: 'TEACHER', email_verified: true }, 'TEACHER', '/teacher/dashboard'],
    [{ role: 'TEACHER', email_verified: false }, 'TEACHER', '/onboarding'],
    [{ ...profile, enrollment_status: 'PENDING' }, 'TEACHER', '/onboarding'],
    [{ ...profile, enrollment_status: 'REJECTED' }, 'TEACHER', '/onboarding'],
    [{ ...profile, enrollment_status: 'REJECTED', instructor_application: { status: 'PENDING' } }, 'TEACHER', '/instructor/apply'],
    [{ ...profile, enrollment_status: 'APPROVED' }, 'TEACHER', '/student/dashboard'],
    [{ ...profile, instructor_application: { status: 'REJECTED' } }, 'STUDENT', '/onboarding'],
    [profile, 'STUDENT', '/onboarding']
  ]) assert.equal(accountHome(user, intent), destination, `${intent} ${JSON.stringify(user)}`);
  assert.equal(afterAuthPath('TEACHER'), '/instructor/apply');
  assert.equal(afterAuthPath('STUDENT'), '/onboarding');
  assert.equal(intentFromSearch('?role=teacher'), 'TEACHER');
  assert.equal(intentFromSearch('?role=ADMIN'), null);
  assert.equal(withIntent('/register', 'TEACHER'), '/register?role=TEACHER');
  assert.equal(isAuthStart('/register'), true);
  assert.equal(isAuthStart('/register/protect-check'), false);
  assert.equal(isAuthStart('/login/factor-two'), false);
  assert.equal(localAuthPath('http://localhost:3000/onboarding?__clerk_db_jwt=test', 'http://localhost:3000'), '/onboarding?__clerk_db_jwt=test');
  assert.throws(() => localAuthPath('https://unexpected.example', 'http://localhost:3000'), /unexpected destination/);
  assert.equal(Object.keys(AUTH_TASK_PATHS).length, 3);
  assert.match(authErrorMessage({ code: 'protect_check_script_load_failed' }), /Security verification could not load/);

  globalThis.fetch = async (_url, options) => { assert.equal(options.headers.Authorization, 'Bearer verified-token'); return json({ success: true, user: profile }); };
  assert.deepEqual(await syncVerifiedAccount(clerkUser, async () => 'verified-token'), profile);
  globalThis.fetch = async () => json({ success: true, user: { ...profile, role: 'ADMIN' } });
  assert.equal((await syncVerifiedAccount(clerkUser, async () => 'token')).role, 'ADMIN', 'Admins are a valid account role');
  let requested = false;
  globalThis.fetch = async () => { requested = true; throw new Error('Unexpected fetch'); };
  const unverified = await syncVerifiedAccount({ ...clerkUser, reload: async () => ({ ...identity, primaryEmailAddress: { ...identity.primaryEmailAddress, verification: { status: 'unverified' } } }) }, () => { throw new Error('Must not mint a token for onboarding'); });
  assert.equal(unverified.email_verified, false); assert.equal(requested, false);
  await assert.rejects(syncVerifiedAccount(clerkUser, async () => null), /session is not ready/);
  assert.equal(requested, false);
  for (const invalid of [{ ...profile, email_verified: undefined }, { ...profile, id: 'another-user' }, { ...profile, role: 'SUPERUSER' }]) {
    globalThis.fetch = async () => json({ success: true, user: invalid });
    await assert.rejects(syncVerifiedAccount(clerkUser, async () => 'token'), /incompatible response/);
  }
  globalThis.fetch = async () => new Response('<html>Proxy unavailable</html>', { status: 502 });
  await assert.rejects(syncVerifiedAccount(clerkUser, async () => 'token'), /backend is running/);
  globalThis.fetch = async () => json({ message: 'Your session expired.' }, 401);
  await assert.rejects(syncVerifiedAccount(clerkUser, async () => 'token'), /session expired/);
  globalThis.fetch = async () => json({ message: 'Contact your adviser to link the existing account.' }, 409);
  await assert.rejects(syncVerifiedAccount(clerkUser, async () => 'token'), /link the existing account/);
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(syncVerifiedAccount(clerkUser, async () => 'token'), /Could not connect/);
  await assert.rejects(syncVerifiedAccount(clerkUser, () => new Promise(() => {}), { timeoutMs: 15 }), /timed out/);
  let resolveOld;
  setTokenGetter(() => new Promise(resolve => { resolveOld = resolve; }));
  const oldRequest = getToken();
  setTokenGetter(async () => 'new-session-token'); resolveOld('previous-session-token');
  assert.equal(await oldRequest, null); assert.equal(getTokenSync(), null);
  assert.equal(await getToken(), 'new-session-token'); assert.equal(getTokenSync(), 'new-session-token');
  setTokenGetter(async () => null); assert.equal(await getToken(), null); assert.equal(getTokenSync(), null);
  console.log('PASS: auth destinations, Protect errors, verified profile sync, missing/expired sessions, API failures, bounded timeouts, and token isolation after account changes.');
} finally { globalThis.fetch = originalFetch; setTokenGetter(null); }
