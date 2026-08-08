import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'brazos.workerAvailability';

export type WorkerAvailability = 'online' | 'offline';

/**
 * The worker's own visibility toggle, surfaced first on Worker Home's
 * availability card. Device-local only, by design — there is no
 * availability/presence column anywhere in the schema (lib/workerSearch.ts
 * documents that gap for search ranking, and it holds here too), and this is
 * not the moment to add one or fake a server call. AsyncStorage is what the
 * rest of the app already reaches for local-only preferences (see
 * useOneTimeNotice), so this follows the same shape rather than introducing
 * a new persistence pattern.
 *
 * Meant to be the one place this value lives: a future Worker Profile
 * availability control reads and writes through this same hook rather than
 * duplicating the storage key.
 *
 * `availability` starts null while the stored value is being read, so a
 * caller can avoid flashing the wrong state before it resolves.
 */
export function useWorkerAvailability() {
  const [availability, setAvailabilityState] = useState<WorkerAvailability | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (active) setAvailabilityState(value === 'offline' ? 'offline' : 'online');
      })
      .catch(() => {
        // Defaults to visible rather than getting stuck unresolved.
        if (active) setAvailabilityState('online');
      });
    return () => {
      active = false;
    };
  }, []);

  const setAvailability = useCallback((next: WorkerAvailability) => {
    setAvailabilityState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort: the in-memory value still drives this session's UI.
    });
  }, []);

  return { availability, setAvailability };
}
