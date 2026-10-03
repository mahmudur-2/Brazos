import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { Card } from '../components/Card';
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
import { groupFeed, type FeedEntry } from '../lib/notificationGroups';
import { goBackOrHome } from '../lib/navigationRef';
import { canRouteNotification, handleNotificationData } from '../lib/notificationRoutes';
import {
  discs,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  textLine,
  touchSlop,
} from '../lib/theme';
import { formatTimeAgo } from '../lib/time';
import { invalidateNotifications } from '../lib/queryClient';

/**
 * Keyed on `notification_outbox.type`, NOT on category — a category covers
 * several types (`job_updates` is assignment, completion AND a review).
 *
 * 2026-09-29 (LUX-LIST-2 #8): EVERY type the database emits has its own glyph
 * now (it was four; the other ten wore the bell) — the operator: "dff icons for
 * each type of notification". What is still NOT allowed is a key no trigger
 * emits: `review` was one, and its star silently never rendered because
 * phase20's notify_on_review() enqueues `review_received`. A test pins every
 * key here against the migrations' own inventory, and any type a later
 * migration adds falls back to the bell until it is given one.
 */
const KIND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  bid_received: 'pricetag-outline',
  bid_competition: 'people-outline',
  offer_countered: 'swap-horizontal-outline',
  hire_countered: 'swap-horizontal-outline',
  hire_request: 'repeat-outline',
  hire_accepted: 'checkmark-circle-outline',
  job_assigned: 'checkmark-circle-outline',
  job_completed: 'clipboard-outline',
  job_nearby: 'location-outline',
  hire_declined: 'close-circle-outline',
  payment_released: 'cash-outline',
  dispute_opened: 'alert-circle-outline',
  review_received: 'star-outline',
  message: 'chatbubble-outline',
};

/**
 * 2026-09-29 (LUX-LIST-2 #8) — THE KIND'S COLOUR ("colour by kind", the operator's popup): bids and
 * jobs mint, money gold, messages a soft blue (their own colour), disputes red, reviews the gold star,
 * a declined hire grey. Palette roles, one per kind, never a literal.
 */
type Kind = 'bids' | 'money' | 'message' | 'dispute' | 'review' | 'muted';
const KIND_OF: Record<string, Kind> = {
  payment_released: 'money',
  message: 'message',
  dispute_opened: 'dispute',
  review_received: 'review',
  hire_declined: 'muted',
  // 2026-09-30 (idea 20): a declined saved card needs the customer — the warning colour.
  payment_declined: 'dispute',
};
const kindColour = (type: string, colors: ColorPalette): string => {
  switch (KIND_OF[type] ?? 'bids') {
    case 'money':
    case 'review':
      return colors.stageAssigned;
    case 'message':
      return colors.notifMessage;
    case 'dispute':
      return colors.danger;
    case 'muted':
      return colors.textSubtle;
    default:
      return colors.emerald;
  }
};

/** The feed opens its settings from its own header (LUX-LIST-2 #7/#8), in whichever stack it sits. */
type FeedNavigation = NativeStackNavigationProp<{ NotificationSettings: undefined }>;

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
 *
 * 2026-09-29 (LUX-LIST-2 #8) — the feed made smarter: the round back button
 * alone (no "Home" beside it — back goes where you came from), "Notifications"
 * centred, a settings gear; "N unread · Mark all read" under the header; the
 * rows in day groups (lib/notificationGroups), one card per group; bids on one
 * job the same day folded into one row.
 */
export function NotificationsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();
  const modeBridge = useNotificationModeBridge();
  const navigation = useNavigation<FeedNavigation>();

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
   * A tapped row marks itself read and opens its subject — a folded row marks
   * EVERY row in it read and opens the lead's subject (the job's bids). Only
   * rows that resolve to a real destination are tappable at all — see the
   * render, which asks canRouteNotification() the same question this
   * delegates to.
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
  function open(entry: FeedEntry) {
    const unreadIds = entry.rows.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length) {
      const readAt = new Date().toISOString();
      setRows((prev) => prev?.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: readAt } : n)) ?? null);
      // Fire-and-forget by design: the focus reload self-heals a failed
      // write; the log keeps the failure observable (hardening A8).
      const writes: Promise<void>[] = [];
      for (const id of unreadIds) {
        writes.push(
          markNotificationRead(id).then(({ error }) => {
            if (error) console.warn('[Notifications] mark-read failed', error.message);
          })
        );
      }
      // F13: the bell's cached count follows once the writes have landed.
      void Promise.all(writes).then(invalidateNotifications);
    }
    // A folded row opens its newest (lead) row's subject: the job's bids.
    const notification = entry.lead;
    void handleNotificationData(notification.data, modeBridge);
  }

  async function markAll() {
    if (!user) return;
    setRows((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    const { error } = await markAllNotificationsRead(user.id);
    // F13: the bell's cached count follows, whichever way the write went.
    void invalidateNotifications();
    if (error) {
      // Revert the optimistic lie to the server truth and say so.
      await alertAsync('Could not mark all read', userMessage(error));
      void load();
    }
  }

  // "N unread" counts EVENTS, so it matches the bell on Home even where rows fold.
  const unread = rows?.filter((n) => !n.read_at).length ?? 0;
  const groups = useMemo(() => groupFeed(rows ?? []), [rows]);

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

  const discStyle = isDark
    ? {
        backgroundColor: withAlpha(discs.header.ink, discs.header.inkAlpha),
        borderColor: withAlpha(discs.header.rim, discs.header.rimAlpha),
      }
    : { backgroundColor: withAlpha(colors.text, 0.08), borderColor: withAlpha(colors.text, 0.1) };

  const renderEntry = (entry: FeedEntry, index: number) => {
    // The lead row carries the type, the time and the route; a folded row reads as its newest bid.
    const n = entry.lead;
    // Every category the triggers emit resolves today (Chat with a jobId or a
    // directThreadId, ClientJobDetail, JobDetail, WorkerJob, ProfileMain). This
    // is the safety net for a payload that does not — it stays a readable row,
    // but it never offers a tap that would only mark it read.
    const routable = canRouteNotification(n.data);
    const tone = kindColour(n.type, colors);
    return (
      <Pressable
        key={entry.key}
        style={({ pressed }) => [
          styles.row,
          index > 0 && styles.rowDivided,
          entry.unread && styles.rowUnread,
          pressed && routable && styles.rowPressed,
        ]}
        onPress={routable ? () => open(entry) : undefined}
        disabled={!routable}
        accessibilityRole={routable ? 'button' : 'text'}
        accessibilityLabel={entry.title}
      >
        <View style={[styles.well, { backgroundColor: withAlpha(tone, isDark ? 0.14 : 0.11) }]}>
          <Ionicons name={KIND_ICONS[n.type] ?? 'notifications-outline'} size={20} color={tone} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, entry.unread && styles.rowTitleUnread]} numberOfLines={1}>
            {entry.title}
          </Text>
          {entry.body ? (
            <Text style={styles.rowBody} numberOfLines={2}>
              {entry.body}
            </Text>
          ) : null}
          <Text style={styles.rowMeta}>{formatTimeAgo(n.created_at)}</Text>
        </View>
        {entry.unread ? <View style={styles.dot} /> : null}
      </Pressable>
    );
  };

  return (
    <DetailScreen
      title="Notifications"
      onBack={goBackOrHome}
      backLabel=""
      state={state}
      headerRight={
        <Pressable
          onPress={() => navigation.navigate('NotificationSettings')}
          hitSlop={4}
          style={styles.gearHit}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
        >
          <View style={[styles.gear, discStyle]}>
            <Ionicons name="settings-outline" size={18} color={colors.text} />
          </View>
        </Pressable>
      }
      sections={[
        ...(unread > 0
          ? [
              {
                content: (
                  <View style={styles.unreadLine}>
                    <Text style={styles.unreadCount}>{`${unread} unread`}</Text>
                    <Pressable onPress={() => void markAll()} hitSlop={touchSlop(textLine(styles.markAll))} accessibilityRole="button">
                      <Text style={styles.markAll}>Mark all read</Text>
                    </Pressable>
                  </View>
                ),
              },
            ]
          : []),
        ...groups.map((group) => ({
          title: group.label,
          content: <Card style={styles.groupCard}>{group.entries.map(renderEntry)}</Card>,
        })),
      ]}
    />
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  gearHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gear: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: -spacing.sm,
  },
  unreadCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  markAll: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.emerald,
  },
  // One card per day group: the rows inside it, a hairline between them.
  groupCard: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 60,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(colors.text, 0.12),
  },
  // Unread keeps its soft tint (light's mint wash; a faint one in dark).
  rowUnread: {
    backgroundColor: withAlpha(colors.emerald, 0.07),
  },
  rowPressed: {
    opacity: 0.8,
  },
  well: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
  },
  rowTitleUnread: {
    fontWeight: '800',
    color: colors.ink,
  },
  rowBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
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
