import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './api';

const respond = (status, body) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('request() and suspended accounts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('announces ACCOUNT_SUSPENDED and still throws with the code and status', async () => {
    respond(403, { success: false, code: 'ACCOUNT_SUSPENDED', message: 'Your account is suspended.' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const heard = vi.fn();
    window.addEventListener('auth:suspended', heard);
    await expect(request('/files')).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED', status: 403, message: 'Your account is suspended.' });
    window.removeEventListener('auth:suspended', heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('does not announce other errors', async () => {
    respond(403, { success: false, code: 'ENROLLMENT_REQUIRED', message: 'Not yet.' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const heard = vi.fn();
    window.addEventListener('auth:suspended', heard);
    await expect(request('/files')).rejects.toMatchObject({ code: 'ENROLLMENT_REQUIRED' });
    window.removeEventListener('auth:suspended', heard);
    expect(heard).not.toHaveBeenCalled();
  });
});
