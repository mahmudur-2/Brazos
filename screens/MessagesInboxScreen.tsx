import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { ConversationRow } from '../components/ConversationRow';
import { SwipeableRow, type SwipeAction } from '../components/SwipeableRow';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReportDialog } from '../components/ReportDialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import {
  clearedBy,
  conversationKey,
  conversationPreviewText,
  conversationTarget,
  fetchActiveJobs,
  resolveOtherId,
  threadUnread,
  type ActiveJob,
  type Conversation,
} from '../lib/conversations';
import {
  BLOCK_DURATIONS,
  foldConversationStates,
  markConversationUnreadForAll,
  setBlockUntil,
  setConversationStateForAll,
  blockExpiryFrom,
  type BlockDuration,
  type ConversationStatePatch,
} from '../lib/conversationStates';
import {
  groupThreadsByPerson,
  resolveActiveJob,
  type ActiveJobCandidate,
} from '../lib/conversationResolver';
import { fetchMyPendingOffers } from '../lib/offers';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  blockUser,
  muteUser,
  unblockUser,
  unmuteUser,
} from '../lib/moderation';
import type { MessagesStackNavigation } from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';
import {
  ARCHIVE,
  CLEAR_CHAT,
  DELETE_CHAT,
  HIDDEN_CHATS,
  MARK_UNREAD,
  TIMED_BLOCK,
} from '../lib/featureFlags';
import { canSwipe } from '../lib/motion120';
import {
  INBOX_FILTERS,
  emptyStateFor,
  filterRows,
  resolveSheetTarget,
  type InboxFilter,
  type ResolvedSheetTarget,
} from '../lib/inboxFilters';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/**
 * The filter pill's height in points, and the ONLY place it is stated.
 *
 * It has to be a real height rather than a `minHeight`, because of what was
 * wrong here: the pills are children of a HORIZONTAL ScrollView, and React
 * Native gives that view `baseHorizontal = { flexGrow: 1, flexShrink: 1 }`
 * (Libraries/Components/ScrollView/ScrollView.js). So the scroller grew into
 * every point of free vertical space the column had, and the content
 * container's cross-axis default — `alignItems: 'stretch'` — handed that
 * whole height to each pill. A `minHeight` is a floor and cannot cap a
 * stretch, which is why the row rendered as half-screen ovals in both themes
 * while the style block looked correct.
 *
 * The stretch is fixed where it is caused (`filterScroll` refuses to grow,
 * `filterRow` centres instead of stretching) — this constant is what the pill
 * measures once the stretch is gone, not a cap hiding it. `radius.pill` is
 * 999, so the corner is half the height at whatever this says.
 */
const FILTER_PILL_HEIGHT = 36;

/**
 * What the sheets act on. `jobId` is null in a direct thread (phase36), so
 * reporting there carries no job.
 *
 * This is RESOLVED from the live rows rather than declared here — see
 * lib/inboxFilters.ts. The sheet holds an id; the row behind it is read again
 * on every render.
 */
type SheetTarget = ResolvedSheetTarget;

export function MessagesInboxScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C6) — THE INBOX'S OWN FOUR. The filter pill's height keeps the
  // named constant it has always had as its fallback, so the number is still
  // spelled exactly once in this file and the fence that prices it against
  // the 32-36pt band still reads it there.
  //
  // RUN N3 (2026-09-08): the pill is 36 (was 34) and the row gap is 10 (was
  // `spacing.sm`, 8). The gap stopped inheriting because 10 is not on the
  // theme scale and an inheriting dial has to ship at its parent's value.
  const filterPillHeight = useDialNumber('messages.filterPill.height') ?? FILTER_PILL_HEIGHT;
  const filterRowGap = useDialNumber('messages.filterRow.gap') ?? 10;
  const listGap = useDialNumber('messages.list.gap') ?? spacing.md;
  const listPaddingX = useDialNumber('messages.list.paddingX') ?? spacing.lg;
  const navigation = useNavigation<MessagesStackNavigation>();
  const { user } = useAuth();
  const {
    conversations,
    readMap,
    stateByKey,
    profiles,
    lastMessageReactions,
    moderation,
    loading,
    error,
    refresh,
  } = useConversations();
  const [refreshing, setRefreshing] = useState(false);
  // AN IDENTITY, NOT A SNAPSHOT (audit F2). This used to hold the whole row,
  // including `muted` and `blocking` — the two values that decide both what
  // the sheet SAYS and which call the tap MAKES. A realtime refresh while the
  // sheet was open left that copy behind, and the tap then inverted the user's
  // intent: the row read "Mute", the person was already muted, and tapping
  // unmuted them. The id cannot go stale; the row is re-read below.
  const [sheetUserId, setSheetUserId] = useState<string | null>(null);
  // THE SAME IDENTITY-NOT-SNAPSHOT RULE, now that More has live actions too.
  // It held a copied row while every one of its entries was a no-op; the
  // moment Archive/Unarchive and Hide/Unhide read state to choose their label
  // AND their call, a stale copy could invert the user's intent exactly the
  // way F2 did in the first sheet.
  const [moreUserId, setMoreUserId] = useState<string | null>(null);
  const [blockDurationUserId, setBlockDurationUserId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<SheetTarget | null>(null);
  // Whether this device can put a conversation behind an authentication prompt
  // at all. Null while unknown, which renders as "no" — HIDDEN RATHER THAN
  // OFFERED AND THEN FAILING (D3): with no biometric or passcode enrolled the
  // hidden-chats entry and the "Mark as Hidden" row simply do not exist.
  const [deviceAuthReady, setDeviceAuthReady] = useState(false);
  // Session-only, deliberately. Which slice of your own inbox you were last
  // looking at is not worth a stored preference, and restoring a filter that
  // hides most of your conversations is a confusing way to open a screen.
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  // Threads with a job offer waiting on THIS user. There are no push
  // notifications, so this list is the only thing that surfaces a new offer
  // or counter-offer. Keyed the same way the rows are, so a request in a
  // direct thread badges its row too.
  // Since phase61 EVERY live chain has a thread key: marketplace bids post a
  // root message into the pair's direct thread the same way direct offers do,
  // so my_pending_offers() resolves direct_thread_id for them instead of the
  // NULL that used to key as `direct:null` and match nothing (AUD-P1-01). The
  // counterparty-keyed fallback that worked around that is gone with it.
  const [pendingByThread, setPendingByThread] = useState<Set<string>>(new Set());
  // The jobs this user currently holds with anyone. A person's row is
  // subtitled with the job the resolver picks out of these, which is the SAME
  // job their next message would go to — the inbox must never name one job
  // while sends route to another.
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);

  const loadActiveJobs = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await fetchActiveJobs(user.id);
    if (error) {
      // Keep the last known set, exactly as the pending-offer refresh does: a
      // failed read must not silently drop every row's subtitle.
      console.warn('[MessagesInbox] active-job refresh failed', error.message);
      return;
    }
    setActiveJobs(data);
  }, [user?.id]);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await fetchMyPendingOffers();
    if (error) {
      // Keep the last known badges — a failed refresh must not clear the
      // only surface announcing a waiting offer (hardening A8).
      console.warn('[MessagesInbox] pending-offer refresh failed', error.message);
      return;
    }
    const byThread = new Set<string>();
    for (const r of data) {
      if (r.thread_job_id) {
        byThread.add(`job:${r.thread_job_id}`);
      } else if (r.direct_thread_id) {
        byThread.add(`direct:${r.direct_thread_id}`);
      }
    }
    setPendingByThread(byThread);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadPending();
      loadActiveJobs();
    }, [refresh, loadPending, loadActiveJobs])
  );

  // Asked ONCE, on mount: the answer is a property of the device, not of the
  // session. A throw is the same answer as false — a platform where the module
  // cannot even be probed is a platform that cannot hold a chat behind Face ID.
  useEffect(() => {
    let active = true;
    async function probeDeviceAuth() {
      try {
        const [hasHardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (active) setDeviceAuthReady(hasHardware && enrolled);
      } catch {
        if (active) setDeviceAuthReady(false);
      }
    }
    void probeDeviceAuth();
    return () => {
      active = false;
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), loadActiveJobs()]);
    setRefreshing(false);
  }

  const allRows = useMemo(() => {
    if (!user) return [];

    // ONE row per person. A pair have exactly one conversation, ever — jobs
    // are context inside it, not separate rooms — so every thread with the
    // same counterparty folds into a single row here.
    const people = groupThreadsByPerson(conversations, (c) => ({
      counterpartyId: resolveOtherId(c, user.id),
      jobId: c.job_id,
      directThreadId: c.direct_thread_id,
      lastMessageAt: c.last_message_at,
    }));

    // conversations.last_message_at IS the canonical activity timestamp for a
    // job, so the resolver reads it straight off the rows this list is built
    // from. A job whose own thread has no messages yet simply has no entry.
    const activityByJob: Record<string, string> = {};
    for (const c of conversations) {
      if (c.job_id) activityByJob[c.job_id] = c.last_message_at;
    }

    return people.map((person) => {
      const otherId = person.counterpartyId;
      const other = profiles[otherId];
      const isSelf = otherId === user.id;
      const isMuted = moderation.muted.has(otherId);

      // THIS CONVERSATION'S OWN STATE (phase77), folded from the per-thread
      // rows onto the one row that represents them. Every flag is ALL rather
      // than ANY — see foldConversationStates() for why one archived job
      // thread must not take the person's row out of the inbox.
      const state = foldConversationStates(
        person.threads.map((thread) => ({
          key: conversationKey(thread),
          lastMessageAt: thread.last_message_at,
        })),
        stateByKey
      );

      // The threads this user has not cleared. A cleared thread contributes no
      // preview and no unread mark, because in this user's copy it has no
      // messages left — the row showing a line the chat no longer contains is
      // exactly the inconsistency the one visibility rule exists to prevent.
      const liveThreads = person.threads.filter(
        (thread) => !clearedBy(thread.last_message_at, stateByKey[conversationKey(thread)])
      );
      // The preview is the newest message across all of this person's
      // still-visible threads, whichever one it happens to be in.
      const latest = liveThreads.reduce<Conversation | null>(
        (best, thread) =>
          !best || thread.last_message_at > best.last_message_at ? thread : best,
        null
      );
      const reactions = latest ? lastMessageReactions[latest.last_message_id] ?? [] : [];
      // Everything cleared and nothing since falls through to the same ellipsis
      // an empty message already renders as — no new vocabulary, and no claim
      // about a message that is gone.
      const preview = latest
        ? conversationPreviewText(latest, reactions.map((r) => r.emoji))
        : '…';

      // Unread and the waiting-offer badge are both folded across the whole
      // conversation: with one row per person, anything unanswered in ANY of
      // their threads has to surface on that row or nowhere.
      //
      // Muted conversations still receive messages — they just don't raise the
      // unread indicator (the only "badge" this app currently has), which is
      // why mute is applied here rather than inside threadUnread().
      const unreadInThread = (thread: Conversation) =>
        !isMuted && threadUnread(thread, user.id, readMap);
      const awaitingInThread = (thread: Conversation) => {
        // One lookup for every kind of chain now — a marketplace bid keys as
        // `direct:<pair thread>` exactly like a direct offer (see loadPending).
        const key = conversationKey(thread);
        const awaitingRequest = pendingByThread.has(key);
        return awaitingRequest;
      };

      // The job this conversation is about, chosen by the ONE resolver that
      // also decides where a message sent from the chat screen lands.
      const candidates: ActiveJobCandidate[] = activeJobs
        .filter((job) => resolveOtherId(job, user.id) === otherId)
        .map((job) => ({
          id: job.id,
          title: job.title,
          createdAt: job.created_at,
          lastMessageAt: activityByJob[job.id] ?? null,
        }));
      const activeJob = resolveActiveJob(candidates);

      const baseName = other?.full_name ?? 'Someone';

      return {
        key: `person:${otherId}`,
        jobId: activeJob?.id ?? latest?.job_id ?? person.latest.job_id,
        otherId,
        isSelf,
        // EVERY thread of the conversation, because every phase77 action
        // applies to the whole of it — a job pair and a pair who have only
        // ever had a direct thread reach the same six actions.
        targets: person.threads.map(conversationTarget),
        archived: state.archived,
        hidden: state.hidden,
        // D7's inbox reading: deleted AND quiet since. One newer message and
        // this is false again, with nothing un-set anywhere.
        deleted: state.deleted,
        // No active job means no job to name. A neutral placeholder here is
        // what produced "N conversations together" — the line stays empty
        // instead of saying something that isn't about anything.
        subtitle: isSelf ? null : activeJob?.title ?? null,
        name: isSelf ? `${baseName} (You)` : baseName,
        rawName: baseName,
        avatarUrl: other?.avatar_url ?? null,
        preview,
        lastMessageAt: (latest ?? person.latest).last_message_at,
        // Only the threads still in this user's copy can be unread; a thread
        // they cleared has nothing left to have missed.
        unread: liveThreads.some(unreadInThread),
        muted: isMuted,
        blocking: moderation.blocking.has(otherId),
        // Over ALL threads, cleared ones included: an offer waiting on this
        // user is live whatever they did to their own copy of the thread.
        awaitingRequest: person.threads.some(awaitingInThread),
      };
    });
  }, [
    conversations,
    profiles,
    readMap,
    stateByKey,
    lastMessageReactions,
    moderation,
    user,
    pendingByThread,
    activeJobs,
  ]);

  /**
   * THE INBOX, after phase77 takes two kinds of row out of it.
   *
   * DELETED-AND-QUIET rows are gone outright (D7): the conversation is not
   * listed, not resolvable by the sheet, and not actionable — and it comes
   * back on its own the moment a message newer than the watermark arrives.
   *
   * HIDDEN rows are gone from the LIST but not from the app; they are behind
   * the device-authentication prompt the foot row opens. They are excluded
   * before the pills rather than inside them, because hidden is a different
   * axis from archived — a hidden conversation must not surface under
   * Archived, or under Unread, either.
   */
  const rows = useMemo(
    () => allRows.filter((row) => !row.deleted && !row.hidden),
    [allRows]
  );
  const hiddenCount = useMemo(
    () => allRows.filter((row) => !row.deleted && row.hidden).length,
    [allRows]
  );

  async function toggleBlock(target: SheetTarget) {
    if (!user) return;
    setSheetUserId(null);

    if (target.blocking) {
      const { error } = await unblockUser(user.id, target.userId);
      if (error) await alertAsync('Could not unblock', userMessage(error));
      await refresh();
      return;
    }

    const ok = await confirmAsync({
      title: `Block ${target.name}?`,
      message:
        "You won't be able to message each other on any job. You can undo this later.",
      confirmText: 'Block',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    const { error } = await blockUser(user.id, target.userId);
    if (error) await alertAsync('Could not block', userMessage(error));
    await refresh();
  }

  async function toggleMute(target: SheetTarget) {
    if (!user) return;
    setSheetUserId(null);
    const { error } = target.muted
      ? await unmuteUser(user.id, target.userId)
      : await muteUser(user.id, target.userId);
    if (error) {
      await alertAsync(target.muted ? 'Could not unmute' : 'Could not mute', userMessage(error));
    }
    await refresh();
  }

  /**
   * EVERY PHASE77 STATE CHANGE, THROUGH ONE DOOR.
   *
   * `setConversationStateForAll` reaches every thread the conversation is made
   * of, so a pair with three job threads and a pair thread and a pair who have
   * only ever had a direct thread both get the whole action. A handler that
   * took `target.jobId` would work on the first and silently no-op on the
   * second, which is the half-feature this run exists to prevent.
   *
   * The failure path is lib/errorMessage.ts's, exactly as toggleBlock's is: no
   * database text reaches a user and no new error vocabulary is invented.
   */
  async function applyConversationState(
    target: SheetTarget,
    patch: ConversationStatePatch,
    failureTitle: string
  ) {
    setMoreUserId(null);
    const { error: stateError } = await setConversationStateForAll(target.targets, patch);
    if (stateError) await alertAsync(failureTitle, userMessage(stateError));
    await refresh();
  }

  /** Destructive rows confirm first — the shape toggleBlock already uses. */
  async function confirmThen(
    prompt: { title: string; message: string; confirmText: string },
    run: () => Promise<void>
  ) {
    const ok = await confirmAsync({
      title: prompt.title,
      message: prompt.message,
      confirmText: prompt.confirmText,
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    await run();
  }

  async function markUnread(target: SheetTarget) {
    if (!user) return;
    setMoreUserId(null);
    const { error: unreadError } = await markConversationUnreadForAll(
      target.targets,
      user.id
    );
    if (unreadError) await alertAsync('Could not mark as unread', userMessage(unreadError));
    await refresh();
  }

  /**
   * A TIMED BLOCK. Two taps and a confirm: the duration sheet, then the
   * ordinary destructive confirmation.
   *
   * The expiry is computed here as `now + interval` and sent as an absolute
   * instant, which is what set_block takes. The PERMANENT block is untouched
   * and stays in the first sheet on the existing `blocks` insert.
   */
  async function blockFor(target: SheetTarget, duration: BlockDuration) {
    setBlockDurationUserId(null);
    await confirmThen(
      {
        title: `Block ${target.name} for ${duration.label}?`,
        message:
          "You won't be able to message each other until it lapses. You can unblock sooner.",
        confirmText: 'Block',
      },
      async () => {
        const { error: blockError } = await setBlockUntil(
          target.userId,
          blockExpiryFrom(Date.now(), duration.ms)
        );
        if (blockError) await alertAsync('Could not block', userMessage(blockError));
        await refresh();
      }
    );
  }

  /**
   * THE SECOND SHEET. Six rows, each gated by the flag that owns it, each with
   * a real handler behind it — a flipped flag over a no-op row is the dead
   * control lib/featureFlags.ts exists to prevent.
   *
   * The permanent block is deliberately NOT here: it is in the first sheet,
   * where it already was. TIMED_BLOCK is the variant that needed an expiry
   * column, and it is a different row precisely so shipping it cannot quietly
   * change what the existing one does.
   *
   * FOUR OF THE SIX READ STATE TO CHOOSE THEIR LABEL, so they are built from
   * the LIVE target rather than a copy — the same rule the first sheet's Mute
   * and Block follow, for the same reason (F2): a label and the call it makes
   * must be the same fact.
   */
  function moreItemsFor(target: SheetTarget | null): ActionSheetItem[] {
    if (!target) return [];
    const items: ActionSheetItem[] = [];
    if (TIMED_BLOCK) {
      items.push({
        key: 'block-timed',
        label: 'Block for a while',
        icon: 'time-outline',
        destructive: true,
        onPress: () => {
          setMoreUserId(null);
          setBlockDurationUserId(target.userId);
        },
      });
    }
    if (MARK_UNREAD) {
      items.push({
        key: 'mark-unread',
        label: 'Mark as Unread',
        icon: 'mail-unread-outline',
        onPress: () => markUnread(target),
      });
    }
    if (CLEAR_CHAT) {
      items.push({
        key: 'clear-chat',
        label: 'Clear Chat',
        icon: 'trash-bin-outline',
        destructive: true,
        onPress: () =>
          confirmThen(
            {
              title: `Clear this chat with ${target.name}?`,
              message:
                'The messages leave your copy of the conversation. Their copy is untouched, and new messages still arrive here.',
              confirmText: 'Clear',
            },
            () => applyConversationState(target, { clear: true }, 'Could not clear chat')
          ),
      });
    }
    // D3 — the row does not exist on a device with nothing enrolled, because
    // the prompt that guards the list could never be shown.
    if (HIDDEN_CHATS && deviceAuthReady) {
      items.push({
        key: 'hide',
        label: target.hidden ? 'Unhide' : 'Mark as Hidden 🔒',
        icon: target.hidden ? 'lock-open-outline' : 'lock-closed-outline',
        onPress: () =>
          applyConversationState(
            target,
            { hidden: !target.hidden },
            target.hidden ? 'Could not unhide' : 'Could not hide'
          ),
      });
    }
    if (ARCHIVE) {
      items.push({
        key: 'archive',
        label: target.archived ? 'Unarchive' : 'Archive',
        icon: target.archived ? 'file-tray-outline' : 'archive-outline',
        onPress: () =>
          applyConversationState(
            target,
            { archived: !target.archived },
            target.archived ? 'Could not unarchive' : 'Could not archive'
          ),
      });
    }
    if (DELETE_CHAT) {
      items.push({
        key: 'delete-chat',
        label: 'Delete Chat',
        icon: 'close-circle-outline',
        destructive: true,
        onPress: () =>
          confirmThen(
            {
              title: `Delete this chat with ${target.name}?`,
              message:
                'It leaves your inbox and its messages leave your copy. Their copy is untouched, and the conversation returns if they write again.',
              confirmText: 'Delete',
            },
            () => applyConversationState(target, { delete: true }, 'Could not delete chat')
          ),
      });
    }
    return items;
  }

  /**
   * ONE ACTION MODEL, TWO ENTRY MECHANICS.
   *
   * The dispatch specifies a swipe-left revealing Mute · Report · More on a
   * build that has react-native-gesture-handler, and the SAME actions through
   * the existing long-press ActionSheet on a build that does not. The list is
   * built once, here, for exactly that reason: an action reachable by one
   * mechanic and not the other is two apps.
   *
   * `canSwipe()` is false on every build today (the packages are not
   * installed — see lib/motion120/vendor.ts), so long-press is the live entry
   * and the swipe surface is the deferred one. When it lands it consumes this
   * same array; nothing below has to move.
   *
   * MUTE IS LIVE and always has been (`mutes`, phase13). BLOCK stays exactly
   * where it lives today — permanent, in this sheet, untouched — and the
   * dispatch's TIMED block is a separate, flagged row inside More.
   */
  // THE LIVE ROW behind the open sheet, re-read every render from the rows the
  // inbox just built. A refresh that lands while the sheet is open moves this
  // with it, so the label and the call it makes are the same fact. A row that
  // has gone resolves to null, which closes the sheet rather than acting on a
  // conversation that is no longer there.
  const sheetTarget = useMemo(() => resolveSheetTarget(rows, sheetUserId), [rows, sheetUserId]);
  // Both later sheets resolve the same way and for the same reason. A row that
  // has GONE — deleted from another device, or archived out of this list —
  // resolves to null, which closes the sheet rather than acting on a
  // conversation that is no longer there.
  const moreTarget = useMemo(() => resolveSheetTarget(rows, moreUserId), [rows, moreUserId]);
  const blockDurationTarget = useMemo(
    () => resolveSheetTarget(rows, blockDurationUserId),
    [rows, blockDurationUserId]
  );

  /**
   * THE ONE ACTION MODEL, built from a live target.
   *
   * Both entry mechanics consume this: the long-press ActionSheet renders the
   * whole list, and the swipe surface renders three of its entries as tiles.
   * Neither writes a handler of its own — an action reachable one way and not
   * the other, or behaving differently depending on how it was reached, is two
   * apps rather than one with two mechanics.
   */
  const actionsFor = useCallback(
    (target: SheetTarget): ActionSheetItem[] => [
      {
        key: 'mute',
        label: target.muted ? 'Unmute' : 'Mute',
        icon: target.muted ? 'notifications' : 'notifications-off-outline',
        onPress: () => toggleMute(target),
      },
      {
        key: 'block',
        label: target.blocking ? 'Unblock' : 'Block',
        icon: target.blocking ? 'lock-open-outline' : 'ban-outline',
        destructive: !target.blocking,
        onPress: () => toggleBlock(target),
      },
      {
        key: 'report',
        label: 'Report',
        icon: 'flag-outline',
        destructive: true,
        onPress: () => {
          setSheetUserId(null);
          setReportTarget(target);
        },
      },
    ],
    // toggleMute/toggleBlock are declared below as plain functions and are
    // stable for a render; the target carries everything else they read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * THE SWIPE'S THREE TILES — Mute, Report, and a gold overflow that opens the
   * very sheet a long press would have opened. Block is deliberately NOT a
   * tile: it is the destructive one, it confirms, and a tile a thumb can reach
   * by accident is the wrong place for it. It stays one tap away, inside More.
   *
   * Every tile's handler is taken from `actionsFor` by key, so there is no
   * second implementation to drift.
   */
  const swipeActionsFor = useCallback(
    (userId: string): SwipeAction[] => {
      const target = resolveSheetTarget(rows, userId);
      if (!target) return [];
      const model = actionsFor(target);
      const byKey = (key: string) => model.find((item) => item.key === key);
      const mute = byKey('mute');
      const report = byKey('report');
      const tiles: SwipeAction[] = [];
      if (mute) tiles.push({ ...mute });
      if (report) tiles.push({ ...report });
      tiles.push({
        key: 'more',
        label: 'More',
        icon: 'ellipsis-horizontal',
        tone: 'gold',
        // The SAME sheet the long press opens, on the same live target.
        onPress: () => setSheetUserId(userId),
      });
      return tiles;
    },
    [rows, actionsFor]
  );

  // The rows the second sheet would hold RIGHT NOW: for the sheet that is open
  // if one is, and otherwise for the first sheet's target, which is what
  // decides whether the "More" row appears at all.
  const moreItems: ActionSheetItem[] = moreItemsFor(moreTarget ?? sheetTarget);

  const sheetItems: ActionSheetItem[] = sheetTarget
    ? [
        ...actionsFor(sheetTarget),
        // MORE renders only if it would have something in it. Before phase77
        // every row it holds was flag-gated and every flag was false, so it did
        // not render at all — an empty second sheet behind a visible button is
        // exactly the dead control this repo refuses to ship. The condition
        // stays for the same reason: HIDDEN_CHATS drops out on a device with
        // nothing enrolled, so this can still legitimately be empty.
        ...(moreItems.length > 0
          ? [
              {
                key: 'more',
                label: 'More',
                icon: 'ellipsis-horizontal' as const,
                onPress: () => {
                  const target = sheetTarget;
                  setSheetUserId(null);
                  setMoreUserId(target.userId);
                },
              },
            ]
          : []),
      ]
    : [];

  /** The timed block's three durations, each one tap from its confirmation. */
  const blockDurationItems: ActionSheetItem[] = blockDurationTarget
    ? BLOCK_DURATIONS.map((duration) => ({
        key: duration.key,
        label: duration.label,
        icon: 'time-outline' as const,
        onPress: () => blockFor(blockDurationTarget, duration),
      }))
    : [];

  // The pill's slice of the list, and the ONLY thing the pills change. They
  // are a view over the rows the inbox already built, never a second fetch.
  const visibleRows = useMemo(() => filterRows(rows, filter), [rows, filter]);

  // Which mechanic reveals the row actions on THIS build. The action list is
  // the same either way (see sheetItems); this only decides what the row tells
  // a screen reader it can do, which is the one place the difference is
  // user-visible today.
  const rowActionHint = canSwipe()
    ? 'Swipe left for mute, report and more'
    : 'Press and hold for mute, block, report and more';

  /**
   * THE HIDDEN CHATS ENTRY — one row at the foot of the list, and ONLY when
   * there is something behind it.
   *
   * DELIBERATELY NOT A SIXTH PILL. A pill sits in the chrome permanently and
   * announces that hidden conversations exist whether or not any do; a foot
   * row that appears only when the list has something in it says nothing about
   * a user who has hidden nothing. It is also gated on the device being able
   * to ASK — with no biometric or passcode enrolled the prompt could never be
   * shown, so the entry is absent rather than offered and then failing (D3).
   *
   * It rides the main list only. Under a pill the list is a slice, and an
   * unrelated lock row under "Archived" is noise.
   */
  const showHiddenChatsRow =
    HIDDEN_CHATS && deviceAuthReady && hiddenCount > 0 && filter === 'all';

  /**
   * A FAILED OR CANCELLED PROMPT DOES NOTHING AND SAYS NOTHING (D2).
   *
   * There is no error to surface: cancelling is a decision, not a fault, and a
   * message either way would confirm to whoever is holding the phone that
   * there is something here to get into.
   */
  async function openHiddenChats() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock hidden chats',
        cancelLabel: 'Cancel',
      });
      if (!result.success) return;
    } catch {
      return;
    }
    navigation.navigate('HiddenChats');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Messages" />

      {/* THE FILTER ROW (2026-08-23). Deliberately small and quiet — it is a
          navigation aid above a list, not a set of tabs — and horizontal so a
          sixth pill can arrive without the row wrapping. Two of the five
          filter live state; the other three are honest about carrying none,
          which is why each has its own empty state rather than sharing one.
          This row SUPERSEDES the never-built master-34 All/Jobs/Offers/Support
          tabs; those are not being built. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={[styles.filterRow, { gap: filterRowGap }]}
        keyboardShouldPersistTaps="handled"
      >
        {INBOX_FILTERS.map((pill) => {
          const active = filter === pill.key;
          return (
            <Pressable
              key={pill.key}
              onPress={() => setFilter(pill.key)}
              style={({ pressed }) => [
                styles.pill,
                { height: filterPillHeight },
                active && styles.pillActive,
                pressed && styles.pillPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${pill.label} conversations`}
            >
              <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                {pill.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* useConversations is a LOCKED hook and still stores the raw message;
          the wrap happens here at the render seam instead (raw-error sweep,
          2026-08-10 — see docs/LOCKED_FILE_PATCHES.md). */}
      {error ? <Text style={styles.error}>{userMessage(error)}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            // TWO MECHANICS, ONE ACTION MODEL. On a build with gesture-handler
            // this reveals Mute / Report / More on a swipe left; on every build
            // shipped so far it renders the row unwrapped and the long press
            // below is the only entry. Both take their actions from
            // `actionsFor`, so neither can offer something the other cannot.
            <SwipeableRow actions={swipeActionsFor(item.otherId)} enabled={!item.isSelf}>
            <ConversationRow
              name={item.name}
              avatarUrl={item.avatarUrl}
              subtitle={item.subtitle}
              preview={item.preview}
              lastMessageAt={item.lastMessageAt}
              unread={item.unread}
              muted={item.muted}
              blocked={item.blocking}
              awaitingRequest={item.awaitingRequest}
              // Keyed by the PERSON, not by one of their threads: the row is
              // the whole conversation and Chat merges it either way.
              onPress={() => navigation.navigate('Chat', { counterpartyId: item.otherId })}
              onLongPress={
                item.isSelf
                  ? undefined
                  : () =>
                      // The ID ONLY. Copying `blocking`/`muted` out of the row
                      // here is what F2 was: the sheet then had a second copy
                      // of two facts that a realtime refresh could move.
                      setSheetUserId(item.otherId)
              }
              onLongPressAvatar={
                item.avatarUrl ? () => setAvatarUri(item.avatarUrl) : undefined
              }
              accessibilityHint={item.isSelf ? undefined : rowActionHint}
            />
            </SwipeableRow>
          )}
          contentContainerStyle={
            visibleRows.length === 0
              ? styles.emptyContainer
              : // A handful of rows with the default padding left most of the
                // screen bare below them — reads as broken, not "caught up".
                // Roomier padding/gap between rows (not centering the group —
                // that read as an empty/broken state instead of a real,
                // short list) makes it read as deliberately minimal.
              visibleRows.length <= 3
              ? styles.sparseContent
              : [styles.listContent, { gap: listGap, paddingHorizontal: listPaddingX }]
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            showHiddenChatsRow ? (
              <Pressable
                onPress={openHiddenChats}
                style={({ pressed }) => [styles.hiddenRow, pressed && styles.pillPressed]}
                accessibilityRole="button"
                accessibilityLabel="Hidden Chats"
                accessibilityHint="Unlocks with Face ID, Touch ID or your passcode"
              >
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <Text style={styles.hiddenRowLabel}>Hidden Chats</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={32} color={isDark ? colors.gold : colors.primary} />
              </View>
              {/* Per-pill, because "no messages yet" under the Archived pill
                  would be a different and untrue statement. */}
              <Text style={styles.emptyTitle}>{emptyStateFor(filter).title}</Text>
              <Text style={styles.emptyText}>{emptyStateFor(filter).body}</Text>
            </View>
          }
        />
      )}

      <ActionSheet
        visible={!!sheetTarget}
        title={sheetTarget?.name}
        subtitle="Manage this conversation"
        items={sheetItems}
        onClose={() => setSheetUserId(null)}
      />

      <ActionSheet
        visible={!!moreTarget}
        title={moreTarget?.name}
        subtitle="More actions"
        items={moreItems}
        onClose={() => setMoreUserId(null)}
      />

      <ActionSheet
        visible={!!blockDurationTarget}
        title={blockDurationTarget?.name}
        subtitle="Block for how long?"
        items={blockDurationItems}
        onClose={() => setBlockDurationUserId(null)}
      />

      {user && reportTarget && (
        <ReportDialog
          visible
          reporterId={user.id}
          reportedId={reportTarget.userId}
          reportedName={reportTarget.name}
          jobId={reportTarget.jobId}
          onClose={() => setReportTarget(null)}
        />
      )}

      <PhotoViewer
        visible={!!avatarUri}
        uri={avatarUri}
        onClose={() => setAvatarUri(null)}
        allowShare={false}
      />
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // The scroller itself takes the height of its row and no more. Without
  // this it keeps RN's `baseHorizontal` flexGrow of 1 and swallows the free
  // vertical space between the header and the list — which is the height the
  // pills were then stretched to.
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: 'row',
    // Cross-axis. A row's default is `stretch`, and that default is what made
    // the pills as tall as the scroller; centring is what makes each pill
    // measure itself instead of its container.
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  // Small and quiet: a filter above a list, not a tab bar. The resting pill
  // is a hairline on the page ground so the ACTIVE one is the only filled
  // thing in the row.
  pill: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  pillActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.primarySoft,
  },
  pillPressed: {
    opacity: 0.7,
  },
  // The foot row. Quiet by construction: a hairline capsule in the muted text
  // colour, the same restraint the resting filter pill uses. It is a way back
  // into something, not an announcement that something is there.
  hiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    // 44pt minimum touch target.
    minHeight: 44,
  },
  hiddenRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  pillLabelActive: {
    color: colors.emerald,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  sparseContent: {
    // No flexGrow/justifyContent — that centered the row group as a block,
    // which reads as an empty/broken state, not a short real list. Rows stay
    // top-anchored under the header; the "generous" part is just more
    // padding/gap than the normal listContent uses.
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 0,
    gap: spacing.lg,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 300,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  }),
);
