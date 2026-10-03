import { supabase } from './supabase';

/**
 * Screen 42 — the in-app feed over phase20's notification_outbox (phase56
 * opened it to its recipient: SELECT scoped by RLS, UPDATE column-granted to
 * read_at only). The same rows the push queue holds ARE the feed — one event
 * log, two consumers, nothing double-written.
 */

export type AppNotification = {
  id: string;
  recipient_id: string;
  category: string;
  type: string;
  title: string;
  body: string | null;
  /** Tap-through payload written by the trigger: { screen, jobId, ... }. */
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const FEED_COLUMNS = 'id, recipient_id, category, type, title, body, data, read_at, created_at';

export async function fetchNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notification_outbox')
    .select(FEED_COLUMNS)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  return { data: (data ?? []) as AppNotification[], error };
}

/**
 * F13 — how many are unread, asked as a COUNT: no rows come back (head) and no
 * cap applies, so the bell can say 140 where the 100-row read said 100.
 */
export async function fetchUnreadNotificationCount(userId: string) {
  const { count, error } = await supabase
    .from('notification_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .is('read_at', null);
  return { count: count ?? 0, error };
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from('notification_outbox')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notification_outbox')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null);
  return { error };
}
