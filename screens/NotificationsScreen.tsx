import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../lib/notifications';
import type { ProfileStackNavigation } from '../lib/navigation';
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
  const navigation = useNavigation<ProfileStackNavigation>();
  const { user } = useAuth();

  const [rows, setRows] = useState<AppNotification[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    const { data, error } = await fetchNotifications(user.id);
    if (error) setLoadError(error.message);
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
      void markNotificationRead(notification.id);
    }
    const jobId = notification.data?.jobId;
    const screen = notification.data?.screen;
    if (typeof jobId === 'string') {
      // Chat opens in the Messages tab; everything job-scoped lands on the
      // MyJobs hub stack — both tabs are shared across modes (§F).
      const parent = (navigation.getParent() as unknown as {
        navigate: (tab: string, params?: object) => void;
      } | null);
      if (screen === 'Chat') {
        parent?.navigate('Messages', { screen: 'Chat', params: { jobId } });
      } else {
        parent?.navigate('MyJobs', { screen: 'MyJobsHub' });
      }
    }
  }

  async function markAll() {
    if (!user) return;
    setRows((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    await markAllNotificationsRead(user.id);
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
              onAction: () => navigation.goBack(),
            }
          : { kind: 'ready' };

  return (
    <DetailScreen
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : undefined}
      onBack={() => navigation.goBack()}
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
