import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useAuth } from '../hooks/useAuth';
import { useNotificationModeBridge } from '../hooks/useNotificationModeBridge';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../lib/notifications';
import { goBackOrHome } from '../lib/navigationRef';
import { canRouteNotification, handleNotificationData } from '../lib/notificationRoutes';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

/**
 * Keyed on `notification_outbox.type`, NOT on category — a category covers
 * several types (`job_updates` is assignment, completion AND a review).
 *
 * Only the types worth a distinct glyph are listed; every other emitted type
 * deliberately falls back to the bell below. What is NOT allowed is a key no
 * trigger emits: `review` was one, and its star silently never rendered
 * because phase20's notify_on_review() enqueues `review_received`. A test
 * pins every key here against the migrations' own inventory.
 */
const KIND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  message: 'chatbubble-outline',
  payment_released: 'checkmark-done-outline',
  dispute_opened: 'alert-circle-outline',
  review_received: 'star-outline',
};

/**
 * Screen 42 — the event feed over the phase20/56 outbox. Every row is a real
 * enqueued event (bids, counters, accepts, status moves, messages, reviews,
 * releases, disputes — written by the database triggers, deduped, prefs-
 * gated). Tap-through is delegated entirely to lib/notificationRoutes.ts, the
 * resolver the push-tap path uses, so a notification opens the same place
 * whether it was tapped here or in the OS tray. Every destination sits in the
 * shared My Jobs / Messages / Profile tabs, mounted in BOTH modes (§F) — and
 * since Stage 4D the resolver additionally asks which mode OWNS the
 * destination: an event about the other side of the marketplace prompts the
 * one authoritative switchMode() (mandatory confirmation) before routing.
 * The bridge below only forwards ModeContext; this screen never switches.
 */
export function NotificationsScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();
  const modeBridge = useNotificationModeBridge();

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

  /**
   * A tapped row marks itself read and opens its subject. Only rows that
   * resolve to a real destination are tappable at all — see the render, which
   * asks canRouteNotification() the same question this delegates to.
   *
   * Routing is delegated WHOLE to lib/notificationRoutes.ts, the resolver the
   * push-tap path already uses. This screen used to carry its own copy of the
   * switch, and it had drifted: every payload without a jobId was dropped
   * silently (a pre-hire direct message, which carries directThreadId; a
   * review, which carries neither), and WorkerJob fell through to the hub
   * instead of the job. The row still marked itself read on the way, so the
   * event was consumed and led nowhere. One implementation per rule — a second
   * copy is exactly how the first one goes stale.
   */
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
    void handleNotificationData(notification.data, modeBridge);
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
              {(rows ?? []).map((n) => {
                // Every category the triggers emit resolves today (Chat with
                // a jobId or a directThreadId, ClientJobDetail, JobDetail,
                // WorkerJob, ProfileMain). This is the safety net for a
                // payload that does not — it stays a readable row, but it
                // never offers a tap that would only mark it read.
                const routable = canRouteNotification(n.data);
                return (
                  <Pressable
                    key={n.id}
                    style={[styles.row, !n.read_at && styles.rowUnread]}
                    onPress={routable ? () => open(n) : undefined}
                    disabled={!routable}
                    accessibilityRole={routable ? 'button' : 'text'}
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
                );
              })}
            </View>
          ),
        },
      ]}
    />
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  }),
);
