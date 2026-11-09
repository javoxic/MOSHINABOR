import { useCallback, useRef } from 'react';

function newKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Stable key for one logical submission: retries after a timeout reuse it (server replays the
 * original response), and it is rotated after a successful submission.
 */
export function useIdempotencyKey(): { key: () => string; rotate: () => void } {
  const ref = useRef<string>(newKey());
  const key = useCallback(() => ref.current, []);
  const rotate = useCallback(() => {
    ref.current = newKey();
  }, []);
  return { key, rotate };
}
