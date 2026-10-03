import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useRefreshOnFocus } from './useRefreshOnFocus';
import { fetchUnreadNotificationCount } from '../lib/notifications';
import { queryKeys } from '../lib/queryKeys';

/**
 * How many of this account's notifications are unread — the one fact the Home bell's count and
 * Profile's "Notifications" row both show (2026-09-29, LUX-LIST-2 #7), so the two can never
 * disagree.
 *
 * F13 (fix run): ONE cached count, asked of the server as a count (no rows, no cap — it used to
 * read 100 rows and so could never say more than 100). A screen coming into focus refreshes it only
 * when it is stale; marking read (one or all) and an arriving push refresh it at once. A failed read
 * keeps the last good count, and with none yet it counts nothing rather than guessing.
 */
export function useUnreadNotificationCount(): number {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = useQueryClient();
  const key = queryKeys.unreadNotifications(userId ?? 'signed-out');
  const queryFn = useCallback(async () => {
    const { count, error } = await fetchUnreadNotificationCount(userId as string);
    if (error) throw error;
    return count;
  }, [userId]);
  const { data } = useQuery({ queryKey: key, queryFn, enabled: !!userId });
  const refreshIfStale = useCallback(() => {
    if (userId) void client.prefetchQuery({ queryKey: queryKeys.unreadNotifications(userId), queryFn });
  }, [client, userId, queryFn]);
  useRefreshOnFocus(refreshIfStale);
  return userId ? data ?? 0 : 0;
}
