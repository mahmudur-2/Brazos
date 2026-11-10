import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Divider, useScrollClearance } from '../ui/primitives';
import {
  Animated,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EntranceView } from '../components/EntranceView';
import { entranceSlot, useEntered } from '../hooks/useEntrance';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ConversationRow } from '../components/ConversationRow';
import { PressScale } from '../components/PressScale';
import { SelectionText, SelectionTint } from '../components/Selection';
import { GlassDropdown, type GlassDropdownItem, type GlassDropdownRequest } from '../components/GlassDropdown';
import { personSafetyItems } from '../lib/chatMenus';
import { Button } from '../components/Button';
import { SUPPORT_EMAIL, supportMailtoUrl } from '../lib/appLinks';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReportDialog } from '../components/ReportDialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConversations } from '../hooks/useConversations';
import {
  conversationKey,
  conversationPreviewText,
  fetchActiveJobs,
  resolveOtherId,
  threadUnread,
  type ActiveJob,
  type Conversation,
} from '../lib/conversations';
import {
  groupThreadsByPerson,
  resolveActiveJob,
  type ActiveJobCandidate,
} from '../lib/conversationResolver';
import { fetchMyPendingOffers } from '../lib/offers';
import { fetchJobLifecycleStates } from '../lib/inboxStages';
import type { JobLifecycleState } from '../lib/jobLifecycle';
import { inboxStage } from '../lib/liveJobStatus';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { blockUser, unblockUser } from '../lib/moderation';
import type { MessagesStackNavigation } from '../lib/navigation';
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
  withAlpha,
  type ColorPalette,
  edgeFade,
  screenGround,
  slopRoom,
  touchSlop,
} from '../lib/theme';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { SPINNER_STATE, ScreenStateView } from '../ui/templates/ScreenStates';

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
 *
 * 2026-09-28 (LUX-LIST-64 #55): 34, the approved clean list's own chip.
 */
const FILTER_PILL_HEIGHT = 34;

/** The Support pill's Contact support (FIX-RUN B3): the Profile hub's opener,
 *  the house shape — a failure still publishes the address, through lib/dialog. */
async function openSupportMail(): Promise<void> {
  try {
    await Linking.openURL(supportMailtoUrl());
  } catch {
    await alertAsync('Could not open your mail app', `Write to ${SUPPORT_EMAIL}.`);
  }
}

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
  // 2026-09-30: the tab bar floats over this screen; the list ends above the pill.
  const navClearance = useScrollClearance();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // Fix run D11: the pill row is wider than the phone, and the last pill was
  // cut at the edge with no cue that the row scrolls. A 28 pt fade into the
  // ground sits over the right edge while more pills lie past it, and leaves
  // once the row is scrolled to its end (or fits). The state flips only at
  // those edges, and the fade's opacity rides the native driver.
  const reduceMotion = useReducedMotion();
  const pillRowRef = useRef({ offset: 0, view: 0, content: 0 });
  const pillFade = useRef(new Animated.Value(0)).current;
  const [pillsMoreRight, setPillsMoreRight] = useState(false);
  const measurePillRow = useCallback(() => {
    const { offset, view, content } = pillRowRef.current;
    const next = view > 0 && content - view > 1 && offset + view < content - 1;
    setPillsMoreRight((prev) => (prev === next ? prev : next));
  }, []);
  useEffect(() => {
    if (reduceMotion !== false) {
      pillFade.setValue(pillsMoreRight ? 1 : 0);
      return;
    }
    const fade = Animated.timing(pillFade, {
      toValue: pillsMoreRight ? 1 : 0,
      duration: 160,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    fade.start();
    return () => fade.stop();
  }, [pillFade, pillsMoreRight, reduceMotion]);
  // The ground the row sits on: the top stop of the dark diagonal, the cream in light.
  const pillFadeTo = isDark ? colors.authGroundTop : colors.background;
  // RUN T2 (C6) — THE INBOX'S OWN FOUR. The filter pill's height keeps the
  // named constant it has always had as its fallback, so the number is still
  // spelled exactly once in this file and the fence that prices it against
  // the 32-36pt band still reads it there.
  //
  // RUN N3 (2026-09-08): the pill is 36 (was 34) and the row gap is 10 (was
  // `spacing.sm`, 8). The gap stopped inheriting because 10 is not on the
  // theme scale and an inheriting dial has to ship at its parent's value.
  const filterPillHeight = FILTER_PILL_HEIGHT;
  // 2026-09-28 (LUX-LIST-64 #54, #55): the pills 8 apart, the reference's; the
  // rows carry no gap of their own — a hairline parts them — so its dial went.
  const filterRowGap = spacing.sm;
  // E3 review: the scroller's room for the pills' slop (lib/theme.ts slopRoom) — it follows the
  // dial exactly as the slop itself does.
  const pillRoom = slopRoom(filterPillHeight);
  const listPaddingX = spacing.lg;
  const navigation = useNavigation<MessagesStackNavigation>();
  const { user } = useAuth();
  const {
    conversations,
    readMap,
    profiles,
    moderation,
    unseenByKey,
    loading,
    error,
    refresh,
  } = useConversations();
  const [refreshing, setRefreshing] = useState(false);
  // AN IDENTITY, NOT A SNAPSHOT (audit F2). This used to hold the whole row,
  // including `blocking` — the value that decides both what the sheet SAYS and
  // which call the tap MAKES. A realtime refresh while the sheet was open left
  // that copy behind, and the tap then inverted the user's intent. The id
  // cannot go stale; the row is re-read below.
  //
  // 2026-09-28 (LUX-LIST-64 #53): the ONE menu — the glass dropdown under the
  // row's ••• — keeps that rule: it holds the person's id, and the row is read
  // again below on every render.
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  // Each row's •••, which the dropdown opens under.
  const moreRefs = useRef(new Map<string, View | null>());
  const [reportTarget, setReportTarget] = useState<SheetTarget | null>(null);
  const reportAfterMenu = useRef<SheetTarget | null>(null);
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
  // 2026-09-28 (LUX-LIST-64 #54) — where each job a row names stands, for its
  // job chip, keyed by job id: read and DERIVED in the data layer
  // (lib/inboxStages.ts) — this screen holds no idea of its own about it.
  const [stageByJob, setStageByJob] = useState<Record<string, JobLifecycleState>>({});
  const [stageTick, setStageTick] = useState(0);

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

  const loadStages = useCallback(async (jobIds: string[]) => {
    const { data, error } = await fetchJobLifecycleStates(jobIds);
    if (error) {
      // Keep the last known stages: a failed read must not strip every chip.
      console.warn('[MessagesInbox] stage refresh failed', error.message);
      return;
    }
    setStageByJob(data);
  }, []);

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
      setStageTick((tick) => tick + 1);
    }, [refresh, loadPending, loadActiveJobs])
  );

  // The jobs the rows can name — every job thread's and every active job's —
  // read again when that set changes and on every visit to the screen.
  const chipJobKey = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conversations) if (c.job_id) ids.add(c.job_id);
    for (const job of activeJobs) ids.add(job.id);
    return [...ids].sort().join(',');
  }, [conversations, activeJobs]);
  useEffect(() => {
    void loadStages(chipJobKey ? chipJobKey.split(',') : []);
  }, [chipJobKey, stageTick, loadStages]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), loadActiveJobs()]);
    setStageTick((tick) => tick + 1);
    setRefreshing(false);
  }

  const rows = useMemo(() => {
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

      // The preview is the newest message across all of this person's
      // threads, whichever one it happens to be in.
      const latest = person.latest;
      const preview = conversationPreviewText(latest);

      // Unread and the waiting-offer badge are both folded across the whole
      // conversation: with one row per person, anything unanswered in ANY of
      // their threads has to surface on that row or nowhere.
      const unreadInThread = (thread: Conversation) => threadUnread(thread, user.id, readMap);
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

      // 2026-09-28 (LUX-LIST-64 #54) — THE JOB THE ROW'S CHIP NAMES: the active
      // job — the one a message from here goes to — else the conversation's
      // most recent job, finished or not. Its stage shows only while it is hired
      // and underway; a finished job's chip is its title alone.
      const latestJobThread = person.threads.reduce<Conversation | null>(
        (best, thread) =>
          thread.job_id && (!best || thread.last_message_at > best.last_message_at) ? thread : best,
        null
      );
      const chipJob = activeJob
        ? { id: activeJob.id, title: activeJob.title }
        : latestJobThread?.job_id && latestJobThread.job_title
          ? { id: latestJobThread.job_id, title: latestJobThread.job_title }
          : null;
      const chipState = chipJob ? stageByJob[chipJob.id] : undefined;

      // The count beside the name: the unseen messages of the unread threads,
      // as counted (hooks/useConversations). None counted: no number.
      const unreadCount = person.threads
        .filter(unreadInThread)
        .reduce((sum, thread) => sum + (unseenByKey[conversationKey(thread)] ?? 0), 0);

      const baseName = other?.full_name ?? 'Someone';

      return {
        key: `person:${otherId}`,
        jobId: activeJob?.id ?? latest.job_id,
        otherId,
        isSelf,
        // A real job or none: a neutral placeholder is what once produced "N
        // conversations together", so a pair with no job has no chip at all.
        job:
          isSelf || !chipJob
            ? null
            : { title: chipJob.title, stage: chipState ? inboxStage(chipState) : null },
        name: isSelf ? `${baseName} (You)` : baseName,
        rawName: baseName,
        avatarUrl: other?.avatar_url ?? null,
        preview,
        lastMessageAt: latest.last_message_at,
        unread: person.threads.some(unreadInThread),
        unreadCount: unreadCount > 0 ? unreadCount : null,
        blocking: moderation.blocking.has(otherId),
        awaitingRequest: person.threads.some(awaitingInThread),
      };
    });
  }, [
    conversations,
    profiles,
    readMap,
    moderation,
    user,
    pendingByThread,
    activeJobs,
    stageByJob,
    unseenByKey,
  ]);

  async function toggleBlock(target: SheetTarget) {
    if (!user) return;
    setMenuUserId(null);

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

  // THE LIVE ROW behind the open menu, re-read every render from the rows the
  // inbox just built. A refresh that lands while the menu is open moves this
  // with it, so the label and the call it makes are the same fact. A row that
  // has gone resolves to null, which closes the menu rather than acting on a
  // conversation that is no longer there.
  const menuTarget = useMemo(() => resolveSheetTarget(rows, menuUserId), [rows, menuUserId]);

  /** #53 — the menu, opened under a row's •••. */
  function openMenu(userId: string) {
    setMenuUserId(userId);
  }

  // 2026-09-28 (LUX-LIST-64 #53) — the GLASS DROPDOWN under the row's •••, its
  // words with no "…": Block (which confirms) and Report, in red. F20: they come
  // from the one builder the chat header's menu also reads (lib/chatMenus.ts);
  // the handlers stay this screen's.
  const menuGroups: GlassDropdownItem[][] = menuTarget
    ? [
        personSafetyItems({
          blocking: menuTarget.blocking,
          onBlock: () => toggleBlock(menuTarget),
          onUnblock: () => toggleBlock(menuTarget),
          onReport: () => {
            // Run 31: opened in the same instant the menu's Modal closed, iOS dismissed the report
            // with it and nothing appeared. It opens once the menu has gone (GlassDropdown onClosed).
            reportAfterMenu.current = menuTarget;
            setMenuUserId(null);
          },
        }),
      ]
    : [];
  const menuRequest: GlassDropdownRequest | null = menuTarget
    ? {
        key: menuTarget.userId,
        measure: (done) => {
          const more = moreRefs.current.get(menuTarget.userId);
          // A row that has scrolled away has no ••• to open under: the menu stays shut.
          if (!more) {
            setMenuUserId(null);
            return;
          }
          more.measureInWindow((x, y, width, height) => done({ x, y, width, height }));
        },
      }
    : null;

  // The pill's slice of the list, and the ONLY thing the pills change. They
  // are a view over the rows the inbox already built, never a second fetch.
  const visibleRows = useMemo(() => filterRows(rows, filter), [rows, filter]);
  // FIX-RUN F12: the first batch of rows cascades in, once (hooks/useEntrance.ts useEntered).
  const rowsEntered = useEntered(!loading && visibleRows.length > 0);

  // #55 — the resting pill: a faint mint-white rim in dark, the warm line in
  // light; its words the ink at .85. Chosen: styles.pillActive.
  const pillRim = isDark ? withAlpha(colors.inboxRule, 0.18) : colors.border;
  const pillInk = withAlpha(colors.ink, 0.85);
  // Chosen: the mint rim (styles.pillActive) over the soft tint — the mint at
  // .08 in dark, the pale sage in light.
  const pillOnFill = isDark ? withAlpha(colors.emerald, 0.08) : colors.primarySoft;
  // FIX-RUN F12 — with motion on, a pill's tint and word FADE to the chosen colours
  // (components/Selection); under Reduce Motion they are drawn exactly as before.
  const pillsFade = reduceMotion === false;

  // What the row tells a screen reader it can do.
  const rowActionHint = 'Press and hold for block and report';

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* 2026-09-26 (the refresh, audit M-16): the tab says Inbox, so the
          screen it opens says Inbox. */}
      {/* 2026-09-28 (LUX-LIST-64 #27): a tab root's big left title, 34. */}
      <ScreenHeader title="Inbox" largeTitle />

      {/* THE FILTER ROW (2026-08-23). Deliberately small and quiet — it is a
          navigation aid above a list, not a set of tabs — and horizontal so a
          new pill can arrive without the row wrapping. Each pill has its own
          empty state rather than sharing one.
          This row SUPERSEDES the never-built master-34 All/Jobs/Offers/Support
          tabs; those are not being built. */}
      {/* 2026-09-28 (LUX-LIST-64 #55): the approved clean list's chips — 34
          tall, 14 either side, 14/600, 8 apart; a faint rim at rest and, when
          chosen, the mint rim over a soft tint. NO check: the one exception to
          #35's chosen-chip tick. */}
      {/* E3 review (2026-10-03): a ScrollView rejects a touch outside its own frame, so the
          pills' 44pt slop ended at this row's 34pt edge. slopRoom() grows the frame by the slop
          (margin out, padding back) and nothing drawn moves. */}
      <View style={styles.filterWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, pillRoom.scroller]}
        contentContainerStyle={[styles.filterRow, pillRoom.content, { gap: filterRowGap }]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onLayout={(event) => {
          pillRowRef.current.view = event.nativeEvent.layout.width;
          measurePillRow();
        }}
        onContentSizeChange={(width) => {
          pillRowRef.current.content = width;
          measurePillRow();
        }}
        onScroll={(event) => {
          pillRowRef.current.offset = event.nativeEvent.contentOffset.x;
          measurePillRow();
        }}
      >
        {INBOX_FILTERS.map((pill) => {
          const active = filter === pill.key;
          // FIX-RUN F12: the shared press spring; no haptic, since a swipe along the row starts on a pill.
          return (
            <PressScale
              key={pill.key}
              haptic={false}
              onPress={() => setFilter(pill.key)}
              hitSlop={touchSlop(filterPillHeight)}
              style={({ pressed }) => [
                styles.pill,
                { height: filterPillHeight, borderColor: pillRim },
                active && [styles.pillActive, { backgroundColor: pillOnFill }],
                pillsFade && styles.pillClear,
                pressed && styles.pillPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${pill.label} conversations`}
            >
              {pillsFade ? (
                <>
                  <SelectionTint
                    on={active}
                    rest={{ fill: 'transparent', rim: pillRim }}
                    chosen={{ fill: pillOnFill, rim: colors.emerald }}
                    radius={radius.pill}
                    rimWidth={1}
                  />
                  <SelectionText on={active} rest={pillInk} chosen={colors.emeraldBright} style={styles.pillLabel}>
                    {pill.label}
                  </SelectionText>
                </>
              ) : (
                <Text style={[styles.pillLabel, { color: pillInk }, active && styles.pillLabelActive]}>
                  {pill.label}
                </Text>
              )}
            </PressScale>
          );
        })}
      </ScrollView>
        <Animated.View
          pointerEvents="none"
          style={[styles.filterFade, edgeFade(pillFadeTo, 90), { opacity: pillFade }]}
        />
      </View>

      {/* useConversations is a LOCKED hook and still stores the raw message;
          the wrap happens here at the render seam instead (raw-error sweep,
          2026-08-10 — see docs/LOCKED_FILE_PATCHES.md). */}
      {error ? <Text style={styles.error}>{userMessage(error)}</Text> : null}

      {loading ? (
        <ScreenStateView state={SPINNER_STATE} />
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={(item) => item.key}
          renderItem={({ item, index }) => (
            <EntranceView index={entranceSlot(index)} skip={rowsEntered}>
            <ConversationRow
              name={item.name}
              avatarUrl={item.avatarUrl}
              job={item.job}
              preview={item.preview}
              lastMessageAt={item.lastMessageAt}
              unread={item.unread}
              unreadCount={item.unreadCount}
              blocked={item.blocking}
              awaitingRequest={item.awaitingRequest}
              // Keyed by the PERSON, not by one of their threads: the row is
              // the whole conversation and Chat merges it either way.
              onPress={() => navigation.navigate('Chat', { counterpartyId: item.otherId })}
              onLongPress={
                item.isSelf
                  ? undefined
                  : () =>
                      // The ID ONLY. Copying `blocking` out of the row here is
                      // what F2 was: the sheet then had a second copy of a
                      // fact that a realtime refresh could move.
                      openMenu(item.otherId)
              }
              onLongPressAvatar={
                item.avatarUrl ? () => setAvatarUri(item.avatarUrl) : undefined
              }
              // M-10 — the same menu, one visible tap away; #53 — it opens
              // right under this •••.
              onMore={item.isSelf ? undefined : () => openMenu(item.otherId)}
              moreRef={(node) => {
                if (node) moreRefs.current.set(item.otherId, node);
                else moreRefs.current.delete(item.otherId);
              }}
              accessibilityHint={item.isSelf ? undefined : rowActionHint}
            />
            </EntranceView>
          )}
          // 2026-09-28 (LUX-LIST-64 #54) — THE CLEAN LIST: no cards, a hairline
          // between rows, the same 16 either side and 18 under the pills at any
          // length (the "sparse" roomier variant went with the cards).
          ItemSeparatorComponent={() => (
            <Divider thickness={1} color={withAlpha(colors.inboxRule, isDark ? 0.11 : 1)} />
          )}
          contentContainerStyle={[
            visibleRows.length === 0
              ? styles.emptyContainer
              : [styles.listContent, { paddingHorizontal: listPaddingX }],
            { paddingBottom: navClearance },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                {/* #26 — the Inbox's empty screens only: the bubble is grey. */}
                <Ionicons name="chatbubbles-outline" size={32} color={colors.grey} />
              </View>
              {/* Per-pill, because "no messages yet" under the Requests pill
                  would be a different and untrue statement. */}
              <Text style={styles.emptyTitle}>{emptyStateFor(filter).title}</Text>
              <Text style={styles.emptyText}>{emptyStateFor(filter).body}</Text>
              {emptyStateFor(filter).action ? (
                <Button
                  title={emptyStateFor(filter).action ?? ''}
                  variant="secondary"
                  icon="mail-outline"
                  onPress={() => void openSupportMail()}
                  style={styles.emptyAction}
                />
              ) : null}
            </View>
          }
        />
      )}

      <GlassDropdown
        request={menuRequest}
        groups={menuGroups}
        onClose={() => setMenuUserId(null)}
        onClosed={() => {
          const target = reportAfterMenu.current;
          reportAfterMenu.current = null;
          if (target) setReportTarget(target);
        }}
        accessibilityLabel={menuTarget ? `Manage conversation with ${menuTarget.name}` : 'Manage conversation'}
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
  filterWrap: {
    position: 'relative',
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  // Fix run D11: the 28 pt cue that the pill row scrolls on.
  filterFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 28,
  },
  filterRow: {
    flexDirection: 'row',
    // Cross-axis. A row's default is `stretch`, and that default is what made
    // the pills as tall as the scroller; centring is what makes each pill
    // measure itself instead of its container.
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  // Small and quiet: a filter above a list, not a tab bar. The resting pill
  // is a hairline on the page ground so the ACTIVE one is the only filled
  // thing in the row.
  pill: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  pillActive: {
    borderColor: colors.emerald,
  },
  pillPressed: {
    opacity: 0.7,
  },
  // FIX-RUN F12: a pill whose tint paints it keeps its geometry and draws its own paint clear.
  pillClear: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillLabelActive: {
    color: colors.emeraldBright,
  },
  listContent: {
    paddingTop: 18,
    paddingBottom: 0,
  },
  // #54 — the hairline between two rows (colour set per theme at the list).
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
  emptyAction: { marginTop: spacing.sm, alignSelf: 'stretch' },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  }),
);
