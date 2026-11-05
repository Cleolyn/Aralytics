import { useCallback, useState } from 'react';

/** Throw the API's message when a response reports failure. */
export function requireSuccess(response, fallback = 'Something went wrong. Please try again.') {
  if (!response?.success) throw new Error(response?.message || fallback);
  return response;
}

/**
 * Busy / error / success-message state for user-triggered async actions.
 *
 *   const action = useAsyncAction();
 *   action.run(async () => { … action.setMessage('Saved.'); }, { key: item.id });
 *
 * `busy` holds the `key` of the running action (true by default), so a table can
 * disable only the row being saved. Errors thrown by the task become `error`.
 */
export default function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const run = useCallback(async (task, { key = true, clearMessage = false } = {}) => {
    setBusy(key);
    setError('');
    if (clearMessage) setMessage('');
    try {
      return await task();
    } catch (err) {
      setError(err.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, message, run, setError, setMessage };
}
