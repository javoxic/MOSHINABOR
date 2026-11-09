import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Keeps filters and pagination in the URL so lists are shareable and survive reloads. */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>, [params, keys]);
  const page = Number(params.get('page') ?? '1') || 1;
  const set = useCallback(
    (patch: Partial<Record<K | 'page', string>>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch) as [string, string | undefined][]) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!('page' in patch)) next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  return { values, page, set };
}
