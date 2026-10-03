import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from './useAuth';
import { ensureHiddenUsers, hiddenUserIds, subscribeHiddenUsers } from '../lib/moderation';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The people whose posts, profiles and reviews this viewer does not see: a
 * block either way (FIX-RUN B3, Apple 1.2). One shared set in lib/moderation,
 * loaded once per signed-in user and updated in place when they block someone,
 * so every feed that reads it agrees without a refetch of its own. Signed out,
 * nothing is hidden.
 */
export function useHiddenUserIds(): ReadonlySet<string> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId) void ensureHiddenUsers(userId);
  }, [userId]);
  const ids = useSyncExternalStore(subscribeHiddenUsers, hiddenUserIds, hiddenUserIds);
  return userId ? ids : EMPTY;
}
