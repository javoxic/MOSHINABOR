import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DATA_ROOTS } from '@/api/keys';

export function useInvalidateData(): () => Promise<void> {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all(DATA_ROOTS.map((k) => qc.invalidateQueries({ queryKey: [...k] })));
  }, [qc]);
}
