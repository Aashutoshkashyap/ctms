'use client';

import { useCallback, useRef, useState } from 'react';

export function useSubmissionLock() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await task();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
