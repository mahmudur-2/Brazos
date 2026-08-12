import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../lib/notifications';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { handleNotificationData } from '../lib/notificationRoutes';
import { colors, radius, spacing } from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

const KIND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  message: 'chatbubble-outline',
  payment_released: 'checkmark-done-outline',
  dispute_opened: 'alert-circle-outline',
  review: 'star-outline',
};

/**
 * Screen 42 — the event feed over the phase20/56 outbox. Every row is a real
 * enqueued event (bids, counters, accepts, status moves, messages, reviews,
 * releases, disputes — written by the database triggers, deduped, prefs-
 * gated). Tap-through: job-scoped events open inside the shared My Jobs /
 * Messages tabs, which exist identically in BOTH modes (§F) — so a tap
 * lands correctly whichever mode the user is in, and no silent mode switch
 * is ever needed for these payloads.
 */
export function NotificationsScreen() {
  const { user } = useAuth();

  const [rows, setRows] = useState<AppNotification[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    const { data, error } = await fetchNotifications(user.id);
    if (error) setLoadError(userMessage(error));
    else setRows(data);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function open(notification: AppNotification) {
    if (!notification.read_at) {
      setRows((prev) =>
        prev?.map((n) =>
          n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n
        ) ?? null
      );
      // Fire-and-forget by design: the focus reload self-heals a failed
      // write; the log keeps the failure observable (hardening A8).
      void markNotificationRead(notification.id).then(({ error }) => {
        if (error) console.warn('[Notifications] mark-read failed', error.message);
      });
    }
    const jobId = notification.data?.jobId;
    const screen = notification.data?.screen;
    if (typeof jobId === 'string') {
      // Chat opens in the Messages tab; everything job-scoped lands on the
      // MyJobs hub stack — both tabs are shared across modes (§F). Routed
      // through the one guarded cross-tab helper (lib/navigationRef.ts) so
      // this in-app feed and the push tap handler behave identically.
      if (screen === 'Chat') {
        navigateAcrossTabs('Messages', 'Chat', { jobId });
      } else if (screen === 'ClientJobDetail' || screen === 'JobDetail') {
        // A counter-offer is answered ON THE JOB — that is where the respond
        // card with Accept / Decline / Counter lives (phase59 addresses the
        // payload at exactly these two screens, one per side). Dropping it on
        // the hub made the notification a dead end. These two take the job ROW
        // as a route param, so they go through the canonical push router,
        // which already loads it.
        void handleNotificationData(notification.data);
      } else {
        navigateAcrossTabs('MyJobs', 'MyJobsHub');
      }
    }
  }

  async function markAll() {
    if (!user) return;
    setRows((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    const { error } = await markAllNotificationsRead(user.id);
    if (error) {
      // Revert the optimistic lie to the server truth and say so.
      await alertAsync('Could not mark all read', userMessage(error));
      void load();
    }
  }

  const unread = rows?.filter((n) => !n.read_at).length ?? 0;

  const state: ScreenState = !user
    ? { kind: 'permissionDenied', title: 'Sign in required', body: '' }
    : loadError
      ? { kind: 'error', message: loadError, onRetry: () => void load() }
      : rows === null
        ? { kind: 'loading', variant: 'spinner' }
        : rows.length === 0
          ? {
              kind: 'empty',
              title: 'Nothing yet',
              body: 'Bids, offers, messages, approvals and payment events land here as they happen.',
              actionLabel: 'Back',
              onAction: goBackOrHome,
            }
          : { kind: 'ready' };

  return (
    <DetailScreen
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : undefined}
      onBack={goBackOrHome}
      state={state}
      headerRight={
        unread > 0 ? (
          <Pressable onPress={() => void markAll()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : undefined
      }
      sections={[
        {
          content: (
            <View style={styles.list}>
              {(rows ?? []).map((n) => (
                <Pressable
                  key={n.id}
                  style={[styles.row, !n.read_at && styles.rowUnread]}
                  onPress={() => open(n)}
                  accessibilityRole="button"
                  accessibilityLabel={n.title}
                >
                  <Ionicons
                    name={KIND_ICONS[n.type] ?? 'notifications-outline'}
                    size={20}
                    color={!n.read_at ? colors.emerald : colors.textSubtle}
                  />
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowTitle, !n.read_at && styles.rowTitleUnread]} numberOfLines={1}>
                      {n.title}
                    </Text>
                    {n.body ? (
                      <Text style={styles.rowBody} numberOfLines={2}>
                        {n.body}
                      </Text>
                    ) : null}
                    <Text style={styles.rowMeta}>{formatTimeAgo(n.created_at)}</Text>
                  </View>
                  {!n.read_at ? <View style={styles.dot} /> : null}
                </Pressable>
              ))}
            </View>
          ),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  markAll: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 60,
  },
  rowUnread: {
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  rowTitleUnread: {
    color: colors.ink,
  },
  rowBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  rowMeta: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emerald,
    marginTop: 6,
  },
});
