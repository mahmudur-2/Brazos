import { useCallback, useSyncExternalStore } from 'react';
import type { JobFilterModel } from '../lib/jobFilters';
import {
  readSessionJobFilters,
  subscribeSessionJobFilters,
  writeSessionJobFilters,
} from '../lib/jobFilterSession';
import { useAuth } from './useAuth';

/**
 * 2026-09-28 (LUX-LIST-64 #64, audit M-25) — the worker's ONE filter memory
 * (lib/jobFilterSession.ts), as state: the Map and the job list read and write
 * the same model, and a change on one is the other's too.
 */
export function useSessionJobFilters(): [
  JobFilterModel,
  (next: JobFilterModel | ((prev: JobFilterModel) => JobFilterModel)) => void,
] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const model = useSyncExternalStore(
    subscribeSessionJobFilters,
    () => readSessionJobFilters(userId),
    () => readSessionJobFilters(userId)
  );
  const setModel = useCallback(
    (next: JobFilterModel | ((prev: JobFilterModel) => JobFilterModel)) => {
      const prev = readSessionJobFilters(userId);
      writeSessionJobFilters(userId, typeof next === 'function' ? next(prev) : next);
    },
    [userId]
  );
  return [model, setModel];
}
