import { useCallback, useEffect, useState } from 'react';

export default function useRemoteData(load, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.resolve().then(load).then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err.message || 'Could not load this page. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Callers provide the primitive inputs used by their loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, version]);
  return { data, loading, error, refresh };
}
