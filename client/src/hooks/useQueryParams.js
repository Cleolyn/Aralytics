import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Search params plus a merge-style updater: `update({ section: 'A', task: '' })`
 * sets non-empty values and removes empty ones, keeping all other params.
 */
export default function useQueryParams() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(values => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }, [params, setParams]);
  return [params, update];
}
