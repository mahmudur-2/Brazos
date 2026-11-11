import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { AmountPrompt } from '../components/AmountPrompt';
import { Avatar } from '../components/Avatar';
import { ChatBubble } from '../components/ChatBubble';
import { ChatComposer } from '../components/ChatComposer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DropMenu, type DropMenuItem } from '../components/DropMenu';
import { nextMenu, personSafetyItems, type ChatMenu } from '../lib/chatMenus';
import { invalidateJobs } from '../lib/queryClient';
import { OfferCard } from '../components/OfferCard';
import { PayoutsGateCard, useMyPayoutsGate } from '../components/PayoutsGateCard';
import { PhotoViewer } from '../components/PhotoViewer';

import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversationChat } from '../hooks/useConversationChat';
import { KeyboardRisingColumn } from '../components/KeyboardRisingColumn';
import { useJob } from '../hooks/useJob';
import { canRehireWorker, fetchJobById, formatBudget, toOpenJob } from '../lib/jobs';
import {
  COUNTER_OFFER_ACTION_LABEL,
  acceptOfferConfirmText,
  acceptOfferConfirmTitle,
  declineOfferActionLabel,
  declineOfferConfirmTitle,
} from '../lib/offerCopy';
import { offerJobTarget } from '../lib/offerNavigation';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { askOpenSettings } from '../lib/permissionPrompt';
import { isTombstonedName } from '../lib/tombstone';
import { userMessage } from '../lib/errorMessage';
import {
  fetchDirectThreadWith,
  fetchSharedJobs,
  markConversationRead,
  resolveOtherId,
  type SharedJob,
} from '../lib/conversations';
import { isLiveJob } from '../lib/jobLifecycle';
import {
  resolveConversation,
  type ActiveJobCandidate,
} from '../lib/conversationResolver';
import {
  fetchDirectThread,
  otherParticipant,
  type DirectThread,
} from '../lib/directThreads';
import { chatTargetKey, type ChatTarget } from '../lib/messages';
import {
  blockUser,
  EMPTY_RELATION,
  fetchRelation,
  unblockUser,
  type RelationState,
} from '../lib/moderation';
import { ReportDialog } from '../components/ReportDialog';
import { useMode } from '../modes';
import {
  canUnsend,
  fetchMessagingUnlocked,
  isMessagingLockedError,
  MESSAGING_LOCKED_MESSAGE,
  messagePreviewText,
  sendMessage,
  unsendMessage,
  type Message,
} from '../lib/messages';
import {
  acceptOffer,
  COUNTER_LIMIT_MESSAGE,
  counterOffer,
  declineOffer,
  isCounterLimitError,
  isOfferActionableBy,
  offerIdOf,
  withdrawOffer,
  type OfferWithJob,
} from '../lib/offers';
import { useThreadOffers } from '../hooks/useJobOffers';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { uploadChatPhoto } from '../lib/storage';
import type { ChatRouteParamList } from '../lib/navigation';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette,
  screenGround,
  touchSlop,
} from '../lib/theme';
import { Divider, usePillReserve } from '../ui/primitives';
import { SPINNER_STATE, ScreenStateView } from '../ui/templates/ScreenStates';

/** One entry in the merged timeline: a message, or the job it belongs to. */
type TimelineItem =
  | { kind: 'divider'; key: string; title: string }
  | { kind: 'message'; key: string; message: Message };

/** A row with no offer chain shares one empty list, so memo sees the same prop (F3). */
const NO_OFFERS: OfferWithJob[] = [];

export function ChatScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // Perspective for the header menu comes from ModeContext, never a prop.
  const { mode } = useMode();
  // 2026-09-30: the floating pill's height above the screen edge — the chat column reserves it
  // beneath the composer, and the keyboard's rise takes it back out (KeyboardRisingColumn).
  const pillReserve = usePillReserve();
  // Chat is nested in more than one tab's stack, so its nav/route types are
  // declared standalone (ChatRouteParamList) rather than tied to one parent
  // stack — it only needs goBack() and its own params.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<ChatRouteParamList, 'Chat'>>();
  const { user } = useAuth();
  // A pair have exactly ONE conversation, and `counterpartyId` names it. The
  // two older shapes name one THREAD inside it and stay valid forever — every
  // job screen and every push payload arrives with one of them, and none of
  // them should have to manufacture a counterparty id. The person is derived
  // from whichever was supplied; a supplied jobId is then kept ONLY as the
  // initial scroll target (see scrollTargetIndex).
  const routeJobId = params.jobId ?? null;
  const routeDirectThreadId = params.directThreadId ?? null;
  const routeCounterpartyId = params.counterpartyId ?? null;

  // Loaded to put a name to a legacy jobId entry, and to title its divider.
  const { job } = useJob(routeJobId);

  const [counterparty, setCounterparty] = useState<Profile | null>(null);
  const [relation, setRelation] = useState<RelationState>(EMPTY_RELATION);
  // F3: the draft lives in the composer; this slot only carries it across the
  // composer unmounting (the messaging lock flipping) and a failed send that
  // unmounted it.
  const draftRef = useRef('');
  const [sending, setSending] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // Profile pictures open in the same viewer but without the share sheet, so
  // they're tracked separately from ordinary chat photos.
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  // THE SINGLE OPEN-MENU OWNER. One value naming which anchored menu is open,
  // replacing the boolean here and the second one that used to live inside
  // ChatComposer. Two booleans have a fourth state — both open — and a device
  // walk found it on screen; one slot cannot hold two answers. See
  // lib/chatMenus.ts.
  const [openMenu, setOpenMenu] = useState<ChatMenu | null>(null);
  const toggleMenu = useCallback(
    (menu: ChatMenu) => setOpenMenu((current) => nextMenu(current, menu)),
    [],
  );
  const closeMenus = useCallback(() => setOpenMenu(null), []);

  // The three dismissals that are NOT a tap on the menu. An anchored panel is
  // positioned against a control, so anything that moves the layout out from
  // under it — or takes the user somewhere else — has to close it rather than
  // leave it floating over a screen it no longer belongs to. The outside tap
  // is DropMenu's own backdrop and arrives through `onClose`.
  //
  // Both subscriptions are removed on unmount, which is also what clears the
  // menu: the value lives in this component, so leaving the screen cannot
  // leave a menu open behind it.
  useEffect(() => {
    const onKeyboard = Keyboard.addListener('keyboardDidShow', closeMenus);
    const onBlur = navigation.addListener('blur', closeMenus);
    return () => {
      onKeyboard.remove();
      onBlur();
    };
  }, [closeMenus, navigation]);
  // Long-press target for the message menu (Reply / Unsend).
  const [menuTarget, setMenuTarget] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [counterTarget, setCounterTarget] = useState<OfferWithJob | null>(null);
  const [confirmResponse, setConfirmResponse] = useState<{
    request: OfferWithJob;
    action: 'accept' | 'decline' | 'withdraw';
  } | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const respondingRef = useRef(false);
  const [openingJobId, setOpeningJobId] = useState<string | null>(null);

  // The direct thread's own row, for working out who the other person is when
  // there is no job to read it from.
  const [thread, setThread] = useState<DirectThread | null>(null);
  useEffect(() => {
    if (!routeDirectThreadId) return;
    let active = true;
    fetchDirectThread(routeDirectThreadId).then(({ data }) => {
      if (active) setThread(data);
    });
    return () => {
      active = false;
    };
  }, [routeDirectThreadId]);

  /** Who this conversation is with — the one thing that identifies it. */
  const counterpartyId = useMemo(() => {
    if (!user) return null;
    if (routeCounterpartyId) return routeCounterpartyId;
    if (thread) return otherParticipant(thread, user.id);
    if (!job) return null;
    return resolveOtherId(job, user.id);
  }, [job, routeCounterpartyId, thread, user]);

  // Every thread this one conversation is made of: their job threads — any
  // stage, because a conversation does not end when a job does — and their
  // pair thread. Nothing is migrated or reparented to build this; the rows
  // stay exactly where they have always been.
  const [sharedJobs, setSharedJobs] = useState<SharedJob[]>([]);
  const [pairThreadId, setPairThreadId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(true);
  useEffect(() => {
    if (!user || !counterpartyId) return;
    let active = true;
    setThreadsLoading(true);
    Promise.all([
      fetchSharedJobs(user.id, counterpartyId),
      fetchDirectThreadWith(user.id, counterpartyId),
    ]).then(([jobs, pair]) => {
      if (!active) return;
      setSharedJobs(jobs.data);
      setPairThreadId(pair.data);
      setThreadsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user, counterpartyId]);

  const targets = useMemo<ChatTarget[]>(() => {
    const list: ChatTarget[] = [];
    const seen = new Set<string>();
    const add = (target: ChatTarget) => {
      const key = chatTargetKey(target);
      if (seen.has(key)) return;
      seen.add(key);
      list.push(target);
    };
    // The thread the caller named goes in first and unconditionally, so an
    // older entry point can never open a conversation missing its own thread —
    // not even when the shared-job read is still in flight or comes back
    // short.
    if (routeJobId) add({ jobId: routeJobId });
    if (routeDirectThreadId) add({ directThreadId: routeDirectThreadId });
    if (pairThreadId) add({ directThreadId: pairThreadId });
    for (const shared of sharedJobs) add({ jobId: shared.id });
    return list;
  }, [routeJobId, routeDirectThreadId, pairThreadId, sharedJobs]);

  // F5: fifty at a time; a legacy jobId entry loads every thread back to that
  // job's first message so the jump has somewhere to land.
  const { messages, loading, error, addLocal, loadOlder, loadingOlder, quotedById } = useConversationChat(
    targets,
    { anchorJobId: routeJobId }
  );

  // conversations.last_message_at IS the newest message in a job's thread, so
  // the canonical activity timestamp is read straight off the timeline that is
  // already loaded rather than fetched a second time.
  const activityByJob = useMemo(() => {
    const map: Record<string, string> = {};
    for (const message of messages) {
      if (message.job_id) map[message.job_id] = message.created_at;
    }
    return map;
  }, [messages]);

  const activeJobs = useMemo<ActiveJobCandidate[]>(
    () =>
      sharedJobs
        // F6/F7: the one live rule (lib/jobLifecycle.ts), the same set the query reads.
        .filter((shared) => isLiveJob(shared))
        .map((shared) => ({
          id: shared.id,
          title: shared.title,
          createdAt: shared.created_at,
          lastMessageAt: activityByJob[shared.id] ?? null,
        })),
    [sharedJobs, activityByJob]
  );

  /**
   * THE send target — the one answer everything free-form reads: the composer,
   * the messaging lock, attachments and the quick replies. Resolved in one
   * place (lib/conversationResolver.ts) so the conversation can never show one
   * job while a message sent from it lands in another.
   */
  const resolved = useMemo(
    () => resolveConversation(activeJobs, pairThreadId),
    [activeJobs, pairThreadId]
  );
  const activeJob = resolved.activeJob;
  // A pair with no active job AND no pair thread is not a conversation the
  // resolver can name — every thread of theirs is a finished job. Fall back to
  // the thread the caller came from, so an older entry still sends exactly
  // where it always did.
  const fallbackTarget: ChatTarget | null = routeJobId
    ? { jobId: routeJobId }
    : routeDirectThreadId
      ? { directThreadId: routeDirectThreadId }
      : null;
  const sendTargetSource = resolved.target ?? fallbackTarget;
  const sendJobId = sendTargetSource?.jobId ?? null;
  const sendDirectThreadId = sendTargetSource?.directThreadId ?? null;
  const sendTarget = useMemo<ChatTarget | null>(
    () =>
      sendJobId
        ? { jobId: sendJobId }
        : sendDirectThreadId
          ? { directThreadId: sendDirectThreadId }
          : null,
    [sendJobId, sendDirectThreadId]
  );

  // Mark the conversation read on entering and again on leaving, so a message
  // that arrives while the chat is open doesn't show as unread later. Every
  // thread of it, because the inbox folds their unread state into one row —
  // leaving one unmarked keeps that row lit with nothing to open.
  useFocusEffect(
    useCallback(() => {
      // Fire-and-forget by design (the unread dot self-heals on the next
      // focus); the log keeps a failed mark-read observable (hardening A8).
      const uid = user?.id;
      if (!uid) return;
      const mark = () => {
        for (const target of targets) {
          void markConversationRead(target, uid).then(({ error: markError }) => {
            if (markError) console.warn('[Chat] mark-read failed', markError.message);
          });
        }
      };
      mark();
      return mark;
    }, [user, targets])
  );

  /**
   * Whether free-form messaging is open here yet. `null` = not yet known.
   *
   * The answer comes from the database function that also backs the messages
   * INSERT policy (phase66), so this screen cannot offer a composer the server
   * would refuse, and cannot hide one it would allow. Before the pair are
   * hired the negotiation cards ARE the conversation; everything free-form —
   * the text input, the send button, quick replies, camera and photo library
   * — is removed rather than shown and then failing.
   */
  const [messagingUnlocked, setMessagingUnlocked] = useState<boolean | null>(null);
  const refreshMessagingLock = useCallback(async () => {
    // Asked about the RESOLVED target and nowhere else. No target yet means no
    // answer yet, which stays locked — the rule is never re-derived here.
    if (!sendJobId && !sendDirectThreadId) return;
    const { data, error } = await fetchMessagingUnlocked(
      sendJobId ? { jobId: sendJobId } : { directThreadId: sendDirectThreadId as string }
    );
    // A failed read keeps the conversation closed: the policy is the authority
    // either way, so guessing "open" would only produce a refused send.
    if (error) {
      console.warn('[Chat] messaging lock read failed', error.message);
      return;
    }
    setMessagingUnlocked(data);
  }, [sendJobId, sendDirectThreadId]);

  // Re-read on every focus, so accepting an offer on another screen (or the
  // other device) opens this thread without a restart.
  useFocusEffect(
    useCallback(() => {
      void refreshMessagingLock();
    }, [refreshMessagingLock])
  );

  const {
    byId: requestsById,
    offers: threadOffers,
    refresh: refreshRequests,
  } = useThreadOffers(messages);
  // B11: the payout state is read only while an offer here waits on this user as its worker.
  const payouts = useMyPayoutsGate(
    threadOffers.some((offer) => offer.worker_id === user?.id && isOfferActionableBy(offer, user?.id))
  );

  const listRef = useRef<FlatList<TimelineItem>>(null);

  /** An own message is in: show it, and take the reader to it (offset 0 is the bottom). */
  function addOwnMessage(message: Message) {
    addLocal(message);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  }

  // A job where the client is also the assigned worker (e.g. bid on your own
  // job), or a job with no resolvable second party at all (no one assigned) —
  // either way there's no one else to message. No quick templates in that case.
  const isSelfConversation = !!user && counterpartyId === user.id;

  // Messages by id, for resolving a reply's quoted original without a join —
  // the quoted message is always somewhere in this conversation.
  // F5: an original outside the loaded window arrives in quotedById.
  const messagesById = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of Object.values(quotedById)) map[m.id] = m;
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages, quotedById]);

  const jobTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const shared of sharedJobs) map[shared.id] = shared.title;
    if (job) map[job.id] = job.title;
    return map;
  }, [sharedJobs, job]);

  /**
   * The one timeline: every message from every thread with this person, in
   * strict chronological order. Chronology always wins — nothing is regrouped
   * or reordered by job.
   *
   * A divider goes in wherever the job context CHANGES from the message before
   * it, so the same job can head more than one divider when two conversations
   * interleave. That is the honest reading of what happened, not a bug. Pair-
   * thread messages carry no job and get no divider.
   */
  const items = useMemo<TimelineItem[]>(() => {
    const list: TimelineItem[] = [];
    let context: string | null = null;
    for (const message of messages) {
      const messageJobId = message.job_id ?? null;
      if (messageJobId !== context) {
        context = messageJobId;
        if (messageJobId) {
          list.push({
            kind: 'divider',
            key: `divider:${message.id}`,
            title: jobTitles[messageJobId] ?? 'Job',
          });
        }
      }
      list.push({ kind: 'message', key: message.id, message });
    }
    return list;
  }, [messages, jobTitles]);

  // A supplied jobId is ONLY an initial scroll target: the conversation opens
  // at that job's first chronological message rather than at the bottom.
  const scrollTargetIndex = useMemo(() => {
    if (!routeJobId) return -1;
    return items.findIndex(
      (item) => item.kind === 'message' && item.message.job_id === routeJobId
    );
  }, [items, routeJobId]);

  // F4: the newest-first rows an inverted list draws bottom-up.
  const invertedItems = useMemo(() => [...items].reverse(), [items]);

  // Only the newest event message for each request stays interactive; earlier
  // ones render as history. Messages arrive oldest-first, so the last one wins.
  const latestMessageIdByRequest = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of messages) {
      const offerId = offerIdOf(m);
      if (offerId) map[offerId] = m.id;
    }
    return map;
  }, [messages]);

  useEffect(() => {
    if (!counterpartyId) return;
    let active = true;
    fetchProfileById(counterpartyId).then(({ data }) => {
      if (active) setCounterparty(data);
    });
    return () => {
      active = false;
    };
  }, [counterpartyId]);

  // Block state drives whether composing is possible at all. The database
  // rejects the insert either way (phase13 messages policy) — this just keeps
  // the app from offering an action that's guaranteed to fail.
  useEffect(() => {
    if (!user || !counterpartyId || counterpartyId === user.id) return;
    let active = true;
    fetchRelation(user.id, counterpartyId).then((r) => {
      if (active) setRelation(r);
    });
    return () => {
      active = false;
    };
  }, [user, counterpartyId]);

  // FIX-RUN B16: a deleted account (phase67's tombstone name) can't receive a
  // message — the composer gives way to a notice rather than a send that fails.
  const counterpartyDeleted = isTombstonedName(counterparty?.full_name);
  // Whether this user may write here at all: a block either way, or nobody left to write to.
  const isBlocked = relation.blocking || relation.blockedBy || counterpartyDeleted;

  // "Hire Again" only ever shows to the client side of a past completed job —
  // a worker never sees it for their client. It used to also require a
  // job-backed chat, because an offer with no thread named would "otherwise
  // place the offer in an older job". With one conversation per pair that
  // older job's thread IS this conversation, so the requirement is gone: the
  // CTA follows the RELATIONSHIP (canRehireWorker) rather than which route
  // opened the screen, and the offer is posted into the resolved job when
  // there is one (create_direct_offer falls back to their most recent shared
  // completed job, then their pair thread, when there is not).
  const [canRehire, setCanRehire] = useState(false);
  useEffect(() => {
    setCanRehire(false);
    if (!user || !counterpartyId || counterpartyId === user.id) return;
    let active = true;
    canRehireWorker(user.id, counterpartyId).then(({ data }) => {
      if (active) setCanRehire(data);
    });
    return () => {
      active = false;
    };
  }, [user, counterpartyId]);

  /**
   * 2026-09-26 (the refresh, audit M-10) — BLOCK AND REPORT, FROM THE PERSON.
   *
   * They lived only behind a long press on the inbox row, so in a
   * conversation — where a person is most likely to need them — there was no
   * visible way to reach either. The header menu now carries both, through
   * the same calls the inbox makes: blockUser / unblockUser and the shared
   * ReportDialog, each confirming exactly as the inbox does.
   */
  const [reportOpen, setReportOpen] = useState(false);
  const counterpartyName = counterparty?.full_name ?? 'this person';

  // Re-read rather than assuming: the relation carries the block state the
  // composer gate reads, and a locally-flipped copy could disagree with the server.
  async function rereadRelation() {
    if (user && counterpartyId) setRelation(await fetchRelation(user.id, counterpartyId));
  }

  async function block() {
    if (!user || !counterpartyId) return;
    const ok = await confirmAsync({
      title: `Block ${counterpartyName}?`,
      message: "You won't be able to message each other on any job. You can undo this later.",
      confirmText: 'Block',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    const { error: blockError } = await blockUser(user.id, counterpartyId);
    if (blockError) await alertAsync('Could not block', userMessage(blockError));
    await rereadRelation();
  }

  async function unblock() {
    if (!user || !counterpartyId) return;
    const { error: unblockError } = await unblockUser(user.id, counterpartyId);
    if (unblockError) await alertAsync('Could not unblock', userMessage(unblockError));
    await rereadRelation();
  }

  function openCounterpartyProfile() {
    if (!counterparty) return;
    (navigation.navigate as (n: string, p?: object) => void)('WorkerProfile', {
      workerId: counterparty.id,
      workerName: counterparty.full_name ?? undefined,
    });
  }

  function openCounterpartyReviews() {
    if (!counterparty) return;
    // The role is the counterparty's, read off this screen's own mode: a
    // customer is talking to a worker and vice versa. The navigate cast
    // above means tsc could not catch this param going missing (R8b-c).
    (navigation.navigate as (n: string, p?: object) => void)('ProfileReviews', {
      userId: counterparty.id,
      name: counterparty.full_name ?? undefined,
      role: mode === 'customer' ? 'worker' : 'customer',
    });
  }

  /**
   * THE HEADER'S OVERFLOW MENU, and it is MODE-SHAPED.
   *
   * Perspective comes from ModeContext (repo rule: never a hand-passed prop),
   * because the two sides of a conversation want different things from the
   * same person. A customer looking at a worker can hire them again, save
   * them, and pass their profile on; a worker looking at a customer can read
   * who they are and what other people said about them, and that is the
   * honest end of the list — there is no "save a customer" list in this
   * product and inventing one to balance the menus would be inventing a
   * feature.
   *
   * 2026-09-26 (the refresh, audit M-10): ONE SKELETON IN BOTH MODES — the
   * person's profile rows first (View profile, Rating / Reviews, and for a
   * customer Save, Hire again and Share), then Block and Report, which
   * reach the same calls the inbox row makes. They were reachable only by a
   * hidden gesture on the inbox, never from the conversation itself.
   */
  // F20: the person's Block and Report rows come from the one builder the
  // inbox menu also reads (lib/chatMenus.ts); this screen keeps the handlers.
  const personRows = personSafetyItems({
    blocking: relation.blocking,
    onBlock: () => void block(),
    onUnblock: () => void unblock(),
    onReport: () => setReportOpen(true),
  });

  const headerMenuItems: DropMenuItem[] = [];
  if (counterparty && !isSelfConversation) {
    if (mode === 'customer') {
      headerMenuItems.push({
        key: 'view-profile',
        label: 'View Profile',
        icon: 'person-outline',
        onPress: openCounterpartyProfile,
      });
      if (canRehire) {
        headerMenuItems.push({
          key: 'hire-again',
          label: 'Hire Again',
          icon: 'person-add-outline',
          onPress: () =>
            (navigation as unknown as {
              navigate: (screen: 'PostJob', params: object) => void;
            }).navigate('PostJob', {
              hireWorkerId: counterparty.id,
              hireWorkerName: counterparty.full_name ?? 'this worker',
              // Post the request into the same thread a message would go to.
              // With no active job there is nothing to name and the server's
              // own fallback — their most recent shared completed job, then
              // their pair thread — lands in this conversation anyway,
              // because every one of those threads IS it.
              threadJobId: activeJob?.id,
            }),
        });
      }
      headerMenuItems.push({
        key: 'reviews',
        label: 'Rating / Reviews',
        icon: 'star-outline',
        onPress: openCounterpartyReviews,
      });
    } else {
      headerMenuItems.push({
        key: 'view-profile',
        label: 'View Profile',
        icon: 'person-outline',
        onPress: openCounterpartyProfile,
      });
      headerMenuItems.push({
        key: 'reviews',
        label: 'Rating / Reviews',
        icon: 'star-outline',
        onPress: openCounterpartyReviews,
      });
    }
    // M-10 — the safety pair, last and in red, the same in both modes and the
    // same as the inbox row's menu (F20).
    headerMenuItems.push(...personRows);
  }

  // F4 — ONE SCROLL PATH. The list is inverted: the newest message is row 0
  // at the bottom, so a new message lands there with no measuring and no
  // snap, and maintainVisibleContentPosition (on the list) keeps a reader who
  // has scrolled up exactly where they are. Nothing scrolls to the end.
  //
  // A legacy jobId entry jumps once, to that job's FIRST chronological message
  // (scrollTargetIndex is chronological; the list is newest-first). An index
  // of -1 — that job has nothing in it yet — leaves the list where an
  // inverted list opens: on the newest message. Nothing undoes the jump: the
  // only other scroll is an own send, which is the person asking to be there.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current || scrollTargetIndex < 0) return;
    jumpedRef.current = true;
    requestAnimationFrame(() =>
      listRef.current?.scrollToIndex({
        index: items.length - 1 - scrollTargetIndex,
        animated: false,
        // Inverted: 1 is the visual top, so the job's first message heads the screen.
        viewPosition: 1,
      })
    );
  }, [items.length, scrollTargetIndex]);

  /**
   * The one place a refused send is turned into words.
   *
   * A pre-confirmation insert is rejected by the policy, not by this screen,
   * so it can arrive even with the composer hidden — a stale screen, an
   * alternate entry point, or an older installed build. Name the rule instead
   * of leaking the database's own text, and re-read the lock so the surface
   * catches up with the server.
   */
  async function reportSendFailure(
    title: string,
    error: { message?: string | null; code?: string | null } | null
  ) {
    if (isMessagingLockedError(error)) {
      setMessagingUnlocked(false);
      void refreshMessagingLock();
      await alertAsync('Messaging isn’t open yet', MESSAGING_LOCKED_MESSAGE);
      return;
    }
    await alertAsync(title, userMessage(error));
  }

  async function handleSendText(content: string): Promise<boolean> {
    if (!content || !user || sending || !sendTarget) return false;
    const quoted = replyTo;
    setReplyTo(null);
    setSending(true);
    const { data, error } = await sendMessage({
      target: sendTarget,
      senderId: user.id,
      content,
      replyToId: quoted?.id ?? null,
    });
    setSending(false);
    if (error) {
      await reportSendFailure('Could not send message', error);
      // Restore the draft AND the reply target, so a failure doesn't silently
      // turn a reply into a standalone message on the next attempt. The
      // composer puts the words back itself; the slot covers a refusal that
      // unmounted it (MESSAGING_LOCKED hides the row).
      draftRef.current = content;
      setReplyTo(quoted);
      return false;
    }
    if (data) addOwnMessage(data);
    return true;
  }

  async function respondToRequest(
    request: OfferWithJob,
    action: 'accept' | 'decline' | 'counter' | 'withdraw',
    amountCents?: number
  ) {
    // A8: the ref is the guard (state is stale inside a double tap); the state draws the busy card.
    if (respondingRef.current) return;
    respondingRef.current = true;
    setRespondingId(request.id);
    // One RPC per action rather than an action string the server has to
    // re-parse. Each validates the turn, the lifecycle state and the counter
    // cap itself, so a stale card cannot produce an invalid transition.
    // withdraw (phase50) is the AUTHOR's retraction while the other side owes
    // the reply — the mirror of decline, validated the same way.
    const { error } =
      action === 'accept'
        ? await acceptOffer(request.id)
        : action === 'decline'
          ? await declineOffer(request.id)
          : action === 'withdraw'
            ? await withdrawOffer(request.id)
            : await counterOffer(request.id, amountCents ?? 0);
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
    respondingRef.current = false;
    setRespondingId(null);

    if (error) {
      // The counter cap is enforced server-side, so a stale chain here can
      // still offer Counter. Name the limit instead of a generic failure.
      if (action === 'counter' && isCounterLimitError(error)) {
        await alertAsync('No counter-offers left', COUNTER_LIMIT_MESSAGE);
      } else {
        await alertAsync('Could not update offer', userMessage(error));
      }
      // The RPC rejects stale turns, so resync rather than leaving the card
      // showing actions that no longer apply.
      await refreshRequests();
      return;
    }

    await refreshRequests();
    // Accepting is what assigns the worker — which is exactly the condition
    // that opens messaging. Re-read it here so the composer appears without
    // needing to leave and come back.
    if (action === 'accept') await refreshMessagingLock();
    if (action === 'accept') {
      // The accepter decides the next step (AUD-P1-02). The CUSTOMER just
      // agreed to pay: funding is the immediate next move — ending on an
      // alert here is exactly how jobs ran to completed with an empty
      // ledger. The WORKER cannot fund; they get told where the job lives.
      if (user && user.id === request.customer_id) {
        setOpeningJobId(request.id);
        const { data: acceptedJob, error: jobError } = await fetchJobById(request.job_id);
        setOpeningJobId(null);
        if (!jobError && acceptedJob) {
          // Checkout lives in the shared MyJobs tab in both trees; the one
          // guarded dispatch path, same as openAcceptedJob below.
          navigateAcrossTabs('MyJobs', 'Checkout', { job: acceptedJob });
          return;
        }
        // The row didn't come back (connection, RLS edge) — fall through to
        // the honest alert; ClientJobDetail now carries the funding CTA too.
      }
      await alertAsync(
        'Offer accepted',
        user && user.id === request.customer_id
          ? 'The job is now assigned and has moved into My Jobs. Protect the payment in checkout from the job screen.'
          : 'The job is now assigned and has moved into My Jobs.'
      );
    }
  }

  /**
   * Opens the job an offer is about — live or accepted, both directions.
   *
   * Under the unified model the job ALWAYS exists (job_offers.job_id is NOT
   * NULL and a direct offer creates its draft job up front), so there is no
   * nullable created_job_id to guard and no standalone offer to invent one
   * for. Which screen a viewer lands on is decided once, in
   * lib/offerNavigation.ts, from the offer's own stable participants — the
   * same decision My Jobs makes for the same offer.
   *
   * All three destinations live in the shared My Jobs stack regardless of
   * which tab Chat itself was reached from, so this goes through the one
   * guarded cross-tab helper rather than the local stack.
   */
  async function openOfferJob(request: OfferWithJob) {
    if (!user || openingJobId) return;
    const target = offerJobTarget(request, user.id);
    if (!target) return;

    // The worker's own screen for a job they hold only takes the id and loads
    // itself.
    if (target.screen === 'WorkerJob') {
      navigateAcrossTabs('MyJobs', 'WorkerJob', { jobId: target.jobId });
      return;
    }

    // The worker's marketplace view takes the browse-feed projection, which
    // the offer already embeds — the same row My Jobs hands the same screen.
    if (target.screen === 'JobDetail' && request.job) {
      navigateAcrossTabs('MyJobs', 'JobDetail', { job: toOpenJob(request.job) });
      return;
    }

    // Either the client's screen (which needs the full job row — offers,
    // status, payment) or a JobDetail whose embed did not come back. Both are
    // answered by the authoritative read rather than a half-built row.
    setOpeningJobId(request.id);
    const { data: fetchedJob, error } = await fetchJobById(target.jobId);
    setOpeningJobId(null);

    if (error || !fetchedJob) {
      await alertAsync(
        'Could not open job',
        userMessage(error, 'This job could not be found.')
      );
      return;
    }
    // MyJobs is a shared tab that registers these routes in both trees, so the
    // hop was never mode-fragile — it goes through the one guarded helper
    // anyway, so there is a single way to cross tabs and no second pattern
    // for the next caller to copy (lib/navigationRef.ts).
    if (target.screen === 'JobDetail') {
      navigateAcrossTabs('MyJobs', 'JobDetail', { job: toOpenJob(fetchedJob) });
      return;
    }
    navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job: fetchedJob });
  }

  // Long-pressing a message opens one menu, so Reply is reachable the same
  // way on every message type — text or photo.
  const messageMenuItems: ActionSheetItem[] = menuTarget
    ? [
        {
          key: 'reply',
          label: 'Reply',
          icon: 'arrow-undo-outline',
          onPress: () => {
            const target = menuTarget;
            setMenuTarget(null);
            setReplyTo(target);
          },
        },
        // Own messages only, and only inside the 15-minute window — see
        // canUnsend() in lib/messages.ts. The RPC re-checks both server-side
        // regardless of what this menu offers.
        ...(canUnsend(menuTarget, user?.id)
          ? [
              {
                key: 'unsend',
                label: 'Unsend',
                icon: 'arrow-undo-circle-outline' as const,
                destructive: true,
                onPress: () => {
                  const target = menuTarget;
                  setMenuTarget(null);
                  handleUnsend(target);
                },
              },
            ]
          : []),
      ]
    : [];

  async function handleUnsend(message: Message) {
    const ok = await confirmAsync({
      title: 'Unsend this message?',
      message: 'It will be replaced with "This message was unsent" for both of you.',
      confirmText: 'Unsend',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await unsendMessage(message.id);
    if (error) await alertAsync('Could not unsend', userMessage(error));
  }

  /**
   * Accept and decline both settle a negotiation for good — accept creates a
   * real assigned job, decline ends the offer — so each goes through the
   * in-app confirmation rather than firing on a single tap. The confirm button
   * disables itself while the RPC is in flight, so a second tap cannot send a
   * second response.
   */
  async function confirmPendingResponse() {
    const pending = confirmResponse;
    if (!pending) return;
    await respondToRequest(pending.request, pending.action);
    setConfirmResponse(null);
  }


  async function sendPhoto(asset: ImagePicker.ImagePickerAsset) {
    // Chat photos are stored under `{jobId}/{userId}/…` and their storage
    // policies authorise on that job — the pair thread has no job id to key a
    // path on, so a photo follows the RESOLVED send target rather than the
    // route: if this message would land in the pair thread, there is nowhere
    // to put a file. The composer hides the controls there; this is the guard
    // behind them.
    if (!user || !sendTarget || !sendJobId) return;
    setSending(true);
    const { url, error: uploadError } = await uploadChatPhoto(
      sendJobId,
      user.id,
      asset
    );
    if (uploadError || !url) {
      setSending(false);
      await alertAsync(
        'Photo upload failed',
        'Please try again. You may need to set up the chat-photos storage bucket.'
      );
      return;
    }
    const { data, error } = await sendMessage({
      target: sendTarget,
      senderId: user.id,
      content: '',
      imageUrl: url,
    });
    setSending(false);
    if (error) {
      await reportSendFailure('Could not send photo', error);
      return;
    }
    if (data) addOwnMessage(data);
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      await sendPhoto(result.assets[0]);
    }
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      // B11: never a dead end — the prompt offers Settings.
      await askOpenSettings('camera');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      await sendPhoto(result.assets[0]);
    }
  }

  // F3: ONE row renderer, memoised on what a row reads, so state the rows do
  // not show (the menus, the reply bar, a send in flight) re-renders no row.
  // The handler that reads screen state reaches it through a ref, which keeps
  // it — and so this renderer — stable.
  const rowHandlers = useRef({ openOfferJob });
  useEffect(() => {
    rowHandlers.current = { openOfferJob };
  });
  const openOfferJobFromRow = useCallback(
    (request: OfferWithJob) => void rowHandlers.current.openOfferJob(request),
    []
  );
  // Each negotiation's chain, grouped once rather than filtered per row.
  const chainsByRoot = useMemo(() => {
    const byRoot: Record<string, OfferWithJob[]> = {};
    for (const offer of threadOffers) (byRoot[offer.root_offer_id] ??= []).push(offer);
    return byRoot;
  }, [threadOffers]);
  const renderItem = useCallback(
    ({ item: entry }: ListRenderItemInfo<TimelineItem>) => {
      // The job context changed here. Not a section header — the same
      // job can head several of these when two conversations
      // interleave, which is what actually happened.
      if (entry.kind === 'divider') {
        return (
          <View style={styles.jobDivider}>
            <Divider thickness={1} style={styles.jobDividerRule} />
            <Text style={styles.jobDividerLabel} numberOfLines={1}>
              {entry.title}
            </Text>
            <Divider thickness={1} style={styles.jobDividerRule} />
          </View>
        );
      }

      const item = entry.message;
      // A hire-request event renders as a negotiation card instead of
      // an ordinary bubble — same thread, no separate screen.
      const offerId = offerIdOf(item);
      if (offerId) {
        const request = requestsById[offerId];
        const isOwn = item.sender_id === user?.id;
        return (
          <View
            style={[
              styles.requestRow,
              isOwn ? styles.requestRowOwn : styles.requestRowOther,
            ]}
          >
            <OfferCard
              variant="thread"
              message={item}
              offer={request}
              chain={request ? chainsByRoot[request.root_offer_id] ?? NO_OFFERS : NO_OFFERS}
              job={request?.job ?? null}
              isLatest={latestMessageIdByRequest[offerId] === item.id}
              currentUserId={user?.id ?? ''}
              counterpartyName={counterparty?.full_name}
              busy={respondingId === offerId}
              onAccept={() =>
                request && setConfirmResponse({ request, action: 'accept' })
              }
              onDecline={() =>
                request && setConfirmResponse({ request, action: 'decline' })
              }
              onCounter={() => request && setCounterTarget(request)}
              onWithdraw={() =>
                request && setConfirmResponse({ request, action: 'withdraw' })
              }
              // Live and accepted offers alike lead to the job they
              // are about; offerJobTarget() is the single rule for
              // whether there is a destination and which one.
              onOpenJob={
                request && offerJobTarget(request, user?.id)
                  ? () => openOfferJobFromRow(request)
                  : undefined
              }
            />
            {/* B11: the hire request he must answer, while his payouts are not on. */}
            {request &&
            request.worker_id === user?.id &&
            latestMessageIdByRequest[offerId] === item.id &&
            isOfferActionableBy(request, user?.id) ? (
              <PayoutsGateCard status={payouts} framed />
            ) : null}
          </View>
        );
      }

      return (
        <ChatBubble
          message={item}
          isOwn={item.sender_id === user?.id}
          senderName={counterparty?.full_name}
          senderAvatarUrl={counterparty?.avatar_url}
          // Nothing to reply to on an already-unsent placeholder: the bubble
          // withholds the long-press itself (F3).
          onLongPressMessage={setMenuTarget}
          onPressImage={setViewerUri}
          replyTo={item.reply_to_id ? messagesById[item.reply_to_id] : null}
          replyToName={
            item.reply_to_id
              ? messagesById[item.reply_to_id]?.sender_id === user?.id
                ? 'You'
                : counterparty?.full_name ?? 'Them'
              : null
          }
          onLongPressAvatarUri={setAvatarUri}
        />
      );
    },
    [
      styles,
      user?.id,
      requestsById,
      chainsByRoot,
      latestMessageIdByRequest,
      counterparty,
      respondingId,
      messagesById,
      openOfferJobFromRow,
      payouts,
    ]
  );

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* THE HEADER LAYER. `zIndex` is load-bearing: the overflow menu
          below drops DOWN out of the header, and the message column is a
          LATER sibling, so without this the dropdown would render beneath
          the messages it is supposed to cover. */}
      <View style={styles.headerLayer}>
        <ScreenHeader
          title={
            counterparty?.full_name
              ? isSelfConversation
                ? `${counterparty.full_name} (You)`
                : counterparty.full_name
              : 'Chat'
          }
          // The job this conversation is about right now — the same one the
          // inbox row names and the same one a message sent now would go to.
          subtitle={activeJob?.title}
          onBack={goBackOrHome}
          // Tapping the title opens the other party's profile — including their
          // Past Work gallery, which is the point of having one.
          onPressTitle={
            counterparty && !isSelfConversation
              ? () =>
                  (navigation.navigate as (n: string, p?: object) => void)(
                    'WorkerProfile',
                    {
                      workerId: counterparty.id,
                      workerName: counterparty.full_name ?? undefined,
                    }
                  )
              : undefined
          }
          // 2026-08-23: the counterparty's face, left of the serif name. It
          // opens the SAME view-only PhotoViewer the message avatars open —
          // allowShare={false}, because forwarding someone else's photo of
          // themselves is not an affordance this app hands out.
          leading={
            counterparty && !isSelfConversation ? (
              <Pressable
                onPress={
                  counterparty.avatar_url ? () => setAvatarUri(counterparty.avatar_url!) : undefined
                }
                disabled={!counterparty.avatar_url}
                hitSlop={6}
                accessibilityRole={counterparty.avatar_url ? 'imagebutton' : 'image'}
                accessibilityLabel={
                  counterparty.avatar_url
                    ? `${counterparty.full_name ?? 'Their'} profile photo`
                    : `${counterparty.full_name ?? 'They'} have no profile photo`
                }
              >
                <Avatar uri={counterparty.avatar_url} name={counterparty.full_name} size={34} />
              </Pressable>
            ) : undefined
          }
          // 2026-08-23: the "Hire Again" chip is retired FROM THE HEADER — the
          // action itself is not, it is the first item of the menu below. A
          // header has room for one affordance and it should be the one that
          // reaches all of them.
          right={
            counterparty && !isSelfConversation ? (
              <View style={styles.headerMenuAnchor}>
                <Pressable
                  onPress={() => toggleMenu('header')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="More"
                  accessibilityHint={`Actions for ${counterparty.full_name ?? 'this person'}`}
                  accessibilityState={{ expanded: openMenu === 'header' }}
                  style={({ pressed }) => [styles.headerDots, pressed && styles.headerDotsPressed]}
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color={colors.mark} />
                </Pressable>
                <DropMenu
                  visible={openMenu === 'header'}
                  onClose={closeMenus}
                  items={headerMenuItems}
                  direction="down"
                  align="right"
                  closeLabel="Close menu"
                />
              </View>
            ) : undefined
          }
        />
      </View>

      {/* useConversationChat keeps the failure itself rather than its text, so
          the one mapper still runs here at the render seam (raw-error sweep,
          2026-08-10 — see docs/LOCKED_FILE_PATCHES.md). */}

      {error ? <Text style={styles.error}>{userMessage(error)}</Text> : null}

      {/* THE CLIP. It does not move, and it is what stops the translated
          column from riding up OVER the header — a transform draws outside its
          parent's box unless the parent clips, and this column is a LATER
          sibling than the header, so it would paint on top of it. `overflow`
          here is load-bearing, not tidiness. */}
      <View style={styles.keyboardClip}>
        {/* 2026-08-23 — THE COMPOSER RISES ON A TRANSFORM.
            KeyboardAvoidingView's `behavior="padding"` is retired here: see
            hooks/useKeyboardOffset.ts for the root cause. The visual result is
            identical and the mechanism is not — no relayout, no measurement,
            and the interpolation runs on the UI thread, so the rise holds its
            frame budget while JS is busy with exactly the work the keyboard
            appearing tends to trigger.
            The keyboardVerticalOffset note the padding version carried is void
            with it: there is no frame arithmetic left to get wrong. */}
        <KeyboardRisingColumn
          // emerald(3): the whole chat column clears the floating pill, not just
          // the composer — the bottom-most element here is the composer, the
          // locked notice or the blocked notice depending on state, and putting
          // the clearance on the column covers all three rather than three
          // places to forget. The bar does not hide on keyboard
          // (tabBarHideOnKeyboard is off), so the pill is still there behind it.
          //
          // ...and the rise SUBTRACTS that clearance, because the keyboard
          // covers the pill completely once it is up. That dead band above the
          // keyboard is a bug the padding version always had.
          //
          // 2026-08-23: the transform and the clearance moved INTO this
          // component so a reanimated build can track the keyboard's live
          // height instead of imitating its curve. The fallback is the same
          // native-driver rise this screen has had; see the component.
          insetBelow={0}
          reserveBelow={pillReserve}
          style={styles.flex}
        >
          {loading || (threadsLoading && targets.length === 0) ? (
            <ScreenStateView state={SPINNER_STATE} />
          ) : (
            <FlatList
              ref={listRef}
              // flex:1 is load-bearing, not cosmetic. Without it this list sizes
              // to its CONTENT inside the composer column, so once the keyboard
              // shrinks that column the list overflows and shoves the quick-reply
              // row past the bottom edge — the chips getting sliced in half.
              // contentContainerStyle's flexGrow only affects the inner content
              // view, so it does not bound the scroller itself.
              style={styles.list}
              inverted
              data={invertedItems}
              keyExtractor={(entry) => entry.key}
              renderItem={renderItem}
              contentContainerStyle={styles.messages}
              // F4: a message arriving at the bottom keeps a reader who has
              // scrolled up in place; within ~80pt of the bottom it follows.
              maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 80 }}
              // F5: the end of an inverted list is its top — the oldest loaded
              // message — so reaching it loads the page before.
              onEndReached={() => void loadOlder()}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loadingOlder ? (
                  <ActivityIndicator
                    style={styles.olderSpinner}
                    color={colors.textMuted}
                    accessibilityLabel="Loading earlier messages"
                  />
                ) : null
              }
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                // Variable-height rows: the target may not be measured yet.
                listRef.current?.scrollToOffset({
                  offset: index * averageItemLength,
                  animated: false,
                });
              }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="chatbubbles-outline" size={28} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>Say hello</Text>
                  <Text style={styles.emptyText}>
                    Messages and photos here are only visible to you and{' '}
                    {counterparty?.full_name ?? 'the other person'}.
                  </Text>
                </View>
              }
            />
          )}

          {isBlocked ? (
            <View style={styles.blockedNotice}>
              <Ionicons name="ban-outline" size={18} color={colors.danger} />
              <Text style={styles.blockedText}>
                {counterpartyDeleted
                  ? 'This account was deleted. You can’t send messages here.'
                  : relation.blocking
                    ? "You've blocked this person. Unblock them from the ⋯ menu above to start talking again."
                    : "You can't reply to this conversation."}
              </Text>
            </View>
          ) : messagingUnlocked !== true ? (
            // Every free-form entry point at once — composer, send button, quick
            // replies, camera and photo library — rather than disabling
            // them one by one and leaving the next one to be forgotten. The
            // negotiation cards above stay fully interactive. While the answer
            // is still unknown (null) nothing is offered, so a slow read can
            // never flash a composer the server would refuse.
            messagingUnlocked === false ? (
              <View style={styles.lockedNotice}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.textMuted}
                />
                <Text style={styles.lockedText}>{MESSAGING_LOCKED_MESSAGE}</Text>
              </View>
            ) : null
          ) : (
            <>
              {/* The one-tap template row lived here until 2026-08-23. It is
                  gone with components/QuickReplies.tsx: the rebuilt composer
                  gives the message field its full width, and a fixed-height
                  chip row above it was the one element in this column that
                  refused to shrink to make room for the keyboard. */}

              {/* Quoted-reply chip: what you're replying to, above the input,
                  with a way to back out — same as WhatsApp. */}
              {replyTo && (
                <View style={styles.replyBar}>
                  <View style={styles.replyAccent} />
                  <View style={styles.replyBody}>
                    <Text style={styles.replyName} numberOfLines={1}>
                      Replying to{' '}
                      {replyTo.sender_id === user?.id
                        ? 'yourself'
                        : counterparty?.full_name ?? 'them'}
                    </Text>
                    <Text style={styles.replyText} numberOfLines={1}>
                      {messagePreviewText(replyTo)}
                    </Text>
                  </View>
                  {replyTo.image_url ? (
                    <RemoteImage uri={replyTo.image_url} style={styles.replyThumb} />
                  ) : null}
                  <Pressable
                    onPress={() => setReplyTo(null)}
                    hitSlop={touchSlop(18, 18)}
                    accessibilityLabel="Cancel reply"
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              )}

              <ChatComposer
                onSend={handleSendText}
                draft={draftRef}
                sending={sending}
                onPickCamera={pickFromCamera}
                onPickLibrary={pickFromLibrary}
                // The [ + ] drop-up reads the one owner rather than a boolean
                // of its own, so opening it closes the header's dropdown in
                // the same assignment.
                menuOpen={openMenu === 'composer'}
                onToggleMenu={() => toggleMenu('composer')}
                onCloseMenu={closeMenus}
                // Whether the RESOLVED send target is job-scoped, not which
                // route opened the screen: chat media is stored under
                // `{jobId}/{userId}/…` and the pair thread has no job id to key
                // a path on.
                allowAttachments={!!sendJobId}
              />
            </>
          )}
        </KeyboardRisingColumn>
      </View>

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      {/* Profile pictures: full-screen and zoomable, but no share sheet. */}
      <PhotoViewer
        visible={!!avatarUri}
        uri={avatarUri}
        onClose={() => setAvatarUri(null)}
        allowShare={false}
      />

      <ActionSheet
        visible={!!menuTarget}
        title="Message"
        items={messageMenuItems}
        onClose={() => setMenuTarget(null)}
      />

      {user && counterpartyId ? (
        <ReportDialog
          visible={reportOpen}
          reporterId={user.id}
          reportedId={counterpartyId}
          reportedName={counterpartyName}
          jobId={activeJob?.id ?? null}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => {
            setReportOpen(false);
            void rereadRelation();
          }}
        />
      ) : null}

      <AmountPrompt
        visible={!!counterTarget}
        title="Counter-offer"
        message={
          counterTarget
            ? `Currently ${formatBudget(counterTarget.amount_cents)}. Propose a different amount.`
            : ''
        }
        initialCents={counterTarget?.amount_cents ?? null}
        confirmText={COUNTER_OFFER_ACTION_LABEL}
        onCancel={() => setCounterTarget(null)}
        onSubmit={(cents) => {
          const pending = counterTarget;
          setCounterTarget(null);
          if (pending) respondToRequest(pending, 'counter', cents);
        }}
      />

      <ConfirmDialog
        visible={!!confirmResponse}
        title={
          confirmResponse?.action === 'accept'
            ? acceptOfferConfirmTitle(
                formatBudget(confirmResponse.request.amount_cents),
                confirmResponse.request.worker_id === user?.id
              )
            : confirmResponse?.action === 'withdraw'
              ? 'Withdraw your offer?'
              : confirmResponse
                ? declineOfferConfirmTitle(
                    formatBudget(confirmResponse.request.amount_cents),
                    confirmResponse.request.worker_id === user?.id
                  )
                : ''
        }
        message={
          confirmResponse?.action === 'accept'
            ? 'The job is created and assigned to you straight away. It moves into My Jobs and can’t be undone here.'
            : confirmResponse?.action === 'withdraw'
              ? 'This withdraws your pending offer — they’ll no longer be able to accept it. You can send a new offer later.'
              : 'No job will be created. This can’t be undone.'
        }
        confirmText={
          confirmResponse?.action === 'accept'
            ? acceptOfferConfirmText(confirmResponse.request.worker_id === user?.id)
            : confirmResponse?.action === 'withdraw'
              ? 'Withdraw offer'
              : confirmResponse
                ? declineOfferActionLabel(confirmResponse.request.worker_id === user?.id)
                : ''
        }
        cancelText="Cancel"
        destructive={
          confirmResponse?.action === 'decline' || confirmResponse?.action === 'withdraw'
        }
        loading={!!confirmResponse && respondingId === confirmResponse.request.id}
        onConfirm={confirmPendingResponse}
        onCancel={() => setConfirmResponse(null)}
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
  flex: {
    flex: 1,
  },
  // The stationary frame the rising column is clipped to. Its bounds end
  // where the header ends, so a column translated up by the keyboard's height
  // disappears under the header instead of painting over it.
  keyboardClip: {
    flex: 1,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
  },
  olderSpinner: {
    paddingVertical: spacing.md,
  },
  messages: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    // F4: the inverted list flips this back upright itself (VirtualizedList
    // applies its inversion to the empty component), so it reads as authored.
    paddingTop: spacing.xxl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  // Where the conversation changes job. Quiet by design — it is a caption on
  // the messages either side of it, not a section header.
  jobDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  // The rule's thickness and colour are the Divider's (1 pt, the border role); this is its share of the row.
  jobDividerRule: {
    flex: 1,
    // The row centres its children; the Divider's own stretch would pin a fixed-height rule to the top.
    alignSelf: 'center',
  },
  jobDividerLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  requestRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  requestRowOwn: {
    justifyContent: 'flex-end',
    paddingLeft: spacing.xl,
  },
  requestRowOther: {
    justifyContent: 'flex-start',
    paddingRight: spacing.xl,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  replyBody: {
    flex: 1,
    gap: 1,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  replyText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  replyThumb: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  blockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  blockedText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  // Same shape as the blocked notice, in the neutral palette: this is not a
  // failure, it is the stage the negotiation is at.
  lockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  lockedText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  // Was a bare text link, which read as a caption next to the counterparty's
  // name rather than as the one action in the header. Bounded and filled
  // instead — 36 tall plus the Pressable's hitSlop clears a comfortable
  // target without making the header taller.
  // THE HEADER LAYER, and `zIndex` is the whole reason it exists: the overflow
  // menu drops DOWN out of the header, and the message column is a later
  // sibling, so without this the dropdown renders beneath the messages it is
  // meant to cover.
  headerLayer: {
    zIndex: 20,
  },
  // The box DropMenu measures itself against. Nothing is drawn here.
  headerMenuAnchor: {
    position: 'relative',
  },
  // Three gold dots where "Hire Again" used to be a chip. Gold as line-work:
  // a glyph, not a pill — a header has room for one affordance and it should
  // be the one that reaches all of them. The 44pt floor comes from the drawn
  // box plus hitSlop at the call site.
  headerDots: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDotsPressed: {
    opacity: 0.6,
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
