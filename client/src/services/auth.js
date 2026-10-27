export async function syncVerifiedAccount(clerkUser, getToken, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  let timer;
  const work = async () => {
    const freshUser = await clerkUser.reload();
    if (controller.signal.aborted) throw new Error('Account verification timed out. Check your connection and try again.');
    const identity = freshUser || clerkUser;
    if (identity.primaryEmailAddress?.verification?.status !== 'verified') {
      return { id: identity.id, role: 'STUDENT', email: identity.primaryEmailAddress?.emailAddress, email_verified: false };
    }
    const token = await getToken();
    if (controller.signal.aborted) throw new Error('Account verification timed out. Check your connection and try again.');
    if (!token) throw new Error('Your sign-in session is not ready. Complete verification or sign in again.');
    const response = await fetch('/api/auth/sync', {
      method: 'POST', signal: controller.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}'
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('Aralytics could not reach the account service. Check that the backend is running and try again.'); }
    if (!response.ok) throw new Error(data.message || 'Could not verify your account. Please try again.');
    if (data.success !== true || data.user?.id !== identity.id || data.user?.email_verified !== true || !['TEACHER', 'STUDENT'].includes(data.user?.role)) {
      throw new Error('The account service returned an incompatible response. Restart the backend and try again.');
    }
    return data.user;
  };
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Account verification timed out. Check your connection and try again.'));
      controller.abort();
    }, timeoutMs);
  });
  try { return await Promise.race([work(), timeout]); }
  catch (err) {
    if (err.name === 'AbortError') throw new Error('Account verification timed out. Check your connection and try again.');
    if (err instanceof TypeError) throw new Error('Could not connect to the account service. Check your connection and try again.');
    throw err;
  } finally { clearTimeout(timer); }
}
