import assert from 'node:assert/strict';
import { accountHome, AUTH_TASK_PATHS, authErrorMessage, isAuthStart, localAuthPath } from '../src/utils/authFlow.js';
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
    [{ ...profile, enrollment_status: 'APPROVED' }, '/student/dashboard']
  ]) assert.equal(accountHome(user), destination);
  assert.equal(isAuthStart('/register'), true);
  assert.equal(isAuthStart('/register/protect-check'), false);
  assert.equal(isAuthStart('/login/factor-two'), false);
  assert.equal(localAuthPath('http://localhost:3000/onboarding?__clerk_db_jwt=test', 'http://localhost:3000'), '/onboarding?__clerk_db_jwt=test');
  assert.throws(() => localAuthPath('https://unexpected.example', 'http://localhost:3000'), /unexpected destination/);
  assert.equal(Object.keys(AUTH_TASK_PATHS).length, 3);
  assert.match(authErrorMessage({ code: 'protect_check_script_load_failed' }), /Security verification could not load/);

  globalThis.fetch = async (_url, options) => { assert.equal(options.headers.Authorization, 'Bearer verified-token'); return json({ success: true, user: profile }); };
  assert.deepEqual(await syncVerifiedAccount(clerkUser, async () => 'verified-token'), profile);
  let requested = false;
  globalThis.fetch = async () => { requested = true; throw new Error('Unexpected fetch'); };
  const unverified = await syncVerifiedAccount({ ...clerkUser, reload: async () => ({ ...identity, primaryEmailAddress: { ...identity.primaryEmailAddress, verification: { status: 'unverified' } } }) }, () => { throw new Error('Must not mint a token for onboarding'); });
  assert.equal(unverified.email_verified, false); assert.equal(requested, false);
  await assert.rejects(syncVerifiedAccount(clerkUser, async () => null), /session is not ready/);
  assert.equal(requested, false);
  for (const invalid of [{ ...profile, email_verified: undefined }, { ...profile, id: 'another-user' }, { ...profile, role: 'ADMIN' }]) {
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
