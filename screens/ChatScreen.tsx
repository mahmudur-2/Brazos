import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { AmountPrompt } from '../components/AmountPrompt';
import { Avatar } from '../components/Avatar';
import { ChatBubble } from '../components/ChatBubble';
import { ChatComposer } from '../components/ChatComposer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DropMenu, type DropMenuItem } from '../components/DropMenu';
import { LiveLocationBar, LiveLocationCard } from '../components/LiveLocationCard';
import { nextMenu, personSafetyItems, type ChatMenu } from '../lib/chatMenus';
import { invalidateJobs } from '../lib/queryClient';
import { canCopy, copyText } from '../lib/clipboard';
import { TranslationSheet } from '../components/TranslationSheet';
import { OfferCard } from '../components/OfferCard';
import { PhotoViewer } from '../components/PhotoViewer';

import { ReactionPicker } from '../components/ReactionPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversationChat } from '../hooks/useConversationChat';
import { KeyboardRisingColumn } from '../components/KeyboardRisingColumn';
import { useJob } from '../hooks/useJob';
import { useReactions } from '../hooks/useReactions';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
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
import { isTombstonedName } from '../lib/rebook';
import { userMessage } from '../lib/errorMessage';
import {
  ACTIVE_JOB_STATUSES,
  fetchCounterpartyReadStates,
  fetchDirectThreadWith,
  fetchSharedJobs,
  markConversationRead,
  resolveOtherId,
  visibleMessages,
  type SharedJob,
} from '../lib/conversations';
import {
  BLOCK_DURATIONS,
  blockExpiryFrom,
  fetchMyConversationStates,
  indexConversationStates,
  setBlockUntil,
  type BlockDuration,
} from '../lib/conversationStates';
import type { ConversationState } from '../lib/conversationVisibility';
import {
  deliveryFor,
  type CounterpartyReadPositions,
} from '../lib/messageTicks';
import {
  resolveConversation,
  type ActiveJobCandidate,
} from '../lib/conversationResolver';
import {
  fetchDirectThread,
  otherParticipant,
  type DirectThread,
} from '../lib/directThreads';
import { LIVE_LOCATION, READ_TICKS, TIMED_BLOCK, TRANSLATION } from '../lib/featureFlags';
import { SHARE_DURATIONS } from '../lib/liveLocation';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { chatTargetKey, type ChatTarget } from '../lib/messages';
import { supabase } from '../lib/supabase';
import { deviceLanguage, translateTexts, type TranslateResult } from '../lib/translate';
import {
  blockUser,
  EMPTY_RELATION,
  fetchRelation,
  muteUser,
  unblockUser,
  unmuteUser,
  type RelationState,
} from '../lib/moderation';
import { ReportDialog } from '../components/ReportDialog';
import { permissionOutcome, trackIntent } from '../lib/observability/analytics';
import { fetchSavedWorkerIds, saveWorker, unsaveWorker } from '../lib/savedWorkers';
import { shareDocument, shareProfileLink } from '../lib/sharing';
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
  offerIdOf,
  withdrawOffer,
  type OfferWithJob,
} from '../lib/offers';
import { useThreadOffers } from '../hooks/useJobOffers';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { removeReaction, setReaction } from '../lib/reactions';
import { uploadChatAudio, uploadChatDocument, uploadChatPhoto } from '../lib/storage';
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
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // WHICH document is being fetched, not whether one is: the tapped bubble
  // spins and the rest of the thread stays live. Null again on success,
  // failure and cancellation alike — see openDocument.
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
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
  // The translation sheet's own state. `null` while a request is in flight —
  // the sheet reads that as "loading" and renders nothing else.
  const [translateOpen, setTranslateOpen] = useState(false);
  // Which translation request the sheet is currently showing. Bumped on every
  // new request AND on close, so an answer that arrives late can tell that
  // nobody is waiting for it any more (audit F5).
  const translateRunRef = useRef(0);
  const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null);
  // Whether this customer has already saved this worker. `null` while the read
  // is in flight, so the menu row never claims either state before it knows.
  const [savedWorker, setSavedWorker] = useState<boolean | null>(null);
  // Long-press target for the message menu (React / Reply).
  const [menuTarget, setMenuTarget] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [counterTarget, setCounterTarget] = useState<OfferWithJob | null>(null);
  const [confirmResponse, setConfirmResponse] = useState<{
    request: OfferWithJob;
    action: 'accept' | 'decline' | 'withdraw';
  } | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
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

  /** The `job:`/`direct:` key of the thread a message belongs to. */
  const threadKeyOf = useCallback(
    (message: Pick<Message, 'job_id' | 'direct_thread_id'>) =>
      chatTargetKey(
        message.job_id
          ? { jobId: message.job_id }
          : { directThreadId: message.direct_thread_id as string }
      ),
    []
  );

  /**
   * THIS USER'S OWN CLEAR / DELETE WATERMARKS (phase77, S-2).
   *
   * Per THREAD, because one conversation is several threads folded together
   * and clearing the pair's direct thread must not empty the job thread
   * interleaved with it. Read once on entry; the watermark only moves when
   * this user moves it, and they cannot do that from inside this screen.
   */
  const [stateByKey, setStateByKey] = useState<Record<string, ConversationState>>({});
  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchMyConversationStates(user.id).then(({ data, error: stateError }) => {
      if (!active) return;
      // A failed read is an empty index — every message visible, which is the
      // behaviour of every build before phase77. It can never hide a message
      // the user did not clear.
      if (stateError) {
        console.warn('[Chat] conversation-state read failed', stateError.message);
        return;
      }
      setStateByKey(indexConversationStates(data));
    });
    return () => {
      active = false;
    };
  }, [user]);

  /**
   * The timeline as this user actually holds it. D7's one visibility rule,
   * applied here and in the inbox from the same import — a message they
   * cleared is out of the thread, and stays out until something newer arrives.
   */
  const visibleTimeline = useMemo(
    () => visibleMessages(messages, (message) => stateByKey[threadKeyOf(message)]),
    [messages, stateByKey, threadKeyOf]
  );

  /**
   * THE GOLD TICK'S SOURCE — the counterparty's read position on every thread
   * this conversation is made of (phase77, S-4).
   *
   *   job threads     their `message_reads` row, readable since phase77's
   *                   message_reads_select_party.
   *   direct threads  their read column on `direct_threads`, which
   *                   direct_threads_select_party has always handed over.
   *
   * BOTH OR NEITHER. This conversation folds a pair's job threads AND their
   * direct thread into one timeline, so wiring only the readable half would
   * make the SAME conversation show gold on some bubbles and never on others —
   * an absent tick meaning "not read yet" on one message and "unknowable here"
   * on the next. That was exactly why READ_TICKS shipped dark.
   */
  const jobTargetIds = useMemo(
    () => targets.map((t) => t.jobId).filter((id): id is string => !!id),
    [targets]
  );
  const directTargetIds = useMemo(
    () => targets.map((t) => t.directThreadId).filter((id): id is string => !!id),
    [targets]
  );
  const [readPositions, setReadPositions] = useState<CounterpartyReadPositions>({
    byJobId: {},
    byDirectThreadId: {},
  });

  const refreshReadPositions = useCallback(async () => {
    // THE GUARD SITE. With the flag off nothing is read, nothing is
    // subscribed, and `delivery` is never assembled — an unflipped build shows
    // exactly the single tick it shows today.
    if (!READ_TICKS) return;
    if (!user || !counterpartyId || counterpartyId === user.id) return;

    const [jobReads, directRows] = await Promise.all([
      fetchCounterpartyReadStates(counterpartyId, jobTargetIds),
      Promise.all(directTargetIds.map((id) => fetchDirectThread(id))),
    ]);

    const byJobId: Record<string, string | null> = {};
    for (const row of jobReads.data) byJobId[row.job_id] = row.last_read_at;

    const byDirectThreadId: Record<string, string | null> = {};
    for (const { data } of directRows) {
      if (!data) continue;
      // Whichever column is THEIRS. The row carries both, and taking the wrong
      // one would show your own read position back to you as their tick.
      byDirectThreadId[data.id] =
        data.user_a === counterpartyId ? data.user_a_read_at : data.user_b_read_at;
    }

    setReadPositions({ byJobId, byDirectThreadId });
  }, [user, counterpartyId, jobTargetIds, directTargetIds]);

  useEffect(() => {
    void refreshReadPositions();
  }, [refreshReadPositions]);

  // ONE SUBSCRIPTION FOR BOTH KINDS, which is the whole reason phase77 chose a
  // policy over a definer RPC: an RPC cannot ride realtime, so job ticks would
  // poll and lag their direct siblings inside the same folded conversation.
  // Realtime respects RLS, so each table delivers only the rows these policies
  // already let this user read.
  //
  // Topic uniqueness is the useOpenJobs mitigation: supabase.channel() dedupes
  // by topic and removeChannel() tears down asynchronously, so every mount
  // needs a string that has never existed before.
  const instanceId = useId();
  const runRef = useRef(0);
  useEffect(() => {
    if (!READ_TICKS) return;
    if (!user || !counterpartyId || counterpartyId === user.id) return;

    const channel = supabase
      .channel(`chat:ticks:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reads' },
        () => void refreshReadPositions()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'direct_threads' },
        () => void refreshReadPositions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, counterpartyId, refreshReadPositions, instanceId]);

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
        .filter((shared) => ACTIVE_JOB_STATUSES.includes(shared.status))
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

  // Reactions are stored per job (message_reactions.job_id), so inside a merged
  // conversation they stay scoped to one job thread: the one messages are being
  // added to now. Messages from the pair thread or from a finished job render
  // without reaction chips, and the React action is hidden on them.
  const reactionsJobId = sendJobId ?? routeJobId;
  const { byMessage: reactionsByMessage, refresh: refreshReactions } =
    useReactions(reactionsJobId);

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
   * the text input, the send button, quick replies, camera, photo library and
   * voice — is removed rather than shown and then failing.
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

  const recorder = useVoiceRecorder();

  function handleMicTap() {
    if (sending) return;
    recorder.tapMic();
  }

  async function handleStopRecording() {
    await recorder.stopRecording();
    if (recorder.error) {
      await alertAsync('Recording failed', recorder.error);
      recorder.clearError();
    }
  }

  async function handleSendVoice() {
    const clip = recorder.previewClip;
    // Chat media is stored under `{jobId}/{userId}/…` and its storage policies
    // authorise on that job — the pair thread has no job id to key a path on,
    // so attachments follow the RESOLVED send target rather than the route: if
    // this message would land in the pair thread, there is nowhere to put a
    // file. The composer hides both controls there; this is the guard behind
    // them.
    if (!user || !clip || !sendTarget || !sendJobId) return;
    setSending(true);
    const { url, error: uploadError } = await uploadChatAudio(
      sendJobId,
      user.id,
      clip.uri
    );
    if (uploadError || !url) {
      setSending(false);
      await alertAsync(
        'Could not send voice message',
        userMessage(uploadError, 'Upload failed. The chat-audio storage bucket may still need setting up.')
      );
      return;
    }

    const { data, error } = await sendMessage({
      target: sendTarget,
      senderId: user.id,
      content: '',
      audioUrl: url,
      audioDurationMs: clip.durationMs,
    });
    setSending(false);

    if (error) {
      await reportSendFailure('Could not send voice message', error);
      return;
    }
    recorder.reset();
    if (data) addOwnMessage(data);
  }

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

  /**
   * LIVE LOCATION — the flag guards the ASSEMBLY, not the element, exactly as
   * READ_TICKS does above: with it false nothing is read, nothing is
   * subscribed, no watcher can start, and the two cards below have no share to
   * render, so an unflipped build behaves exactly as every build before it.
   *
   * Scoped to the RESOLVED send target, the same answer everything free-form
   * reads — a share belongs to the conversation a message would land in, and
   * both thread kinds carry one because all three RPCs take either id. A
   * conversation with yourself gets none: there is nobody to share with.
   */
  const liveLocation = useLiveLocation(
    sendTarget,
    user?.id,
    LIVE_LOCATION && !isSelfConversation
  );
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);

  /**
   * THE DURATION IS ASKED FOR, NEVER ASSUMED. Broadcasting a position is the
   * most consequential thing this composer can do, and how long it lasts is
   * the whole of what makes it consensual — so it is a decision taken before
   * anything starts, not a default with a way to change it afterwards. Three
   * choices, because eight hours is the server's own hard cap and anything
   * finer would be a picker rather than a decision.
   */
  const durationItems: ActionSheetItem[] = SHARE_DURATIONS.map((duration) => ({
    key: duration.key,
    label: duration.label,
    icon: 'time-outline' as const,
    onPress: () => {
      setDurationPickerOpen(false);
      void beginShare(duration.ms);
    },
  }));

  async function beginShare(durationMs: number) {
    const error = await liveLocation.start(durationMs);
    if (!error) return;
    // D9 — phase77's RPCs raise sentences already written for a user
    // ('Location sharing is not available', 'Sharing must end in the future,
    // at most 8 hours from now'), and userMessage() hands those through
    // unchanged. Nothing parallel is invented here.
    await alertAsync(
      'Could not share location',
      userMessage(error, 'Your location could not be read. Check that location services are on.')
    );
  }

  async function endShare() {
    const error = await liveLocation.stop();
    if (error) await alertAsync('Could not stop sharing', userMessage(error));
  }

  // Messages by id, for resolving a reply's quoted original without a join —
  // the quoted message is always somewhere in this conversation.
  // Off the VISIBLE timeline: a reply whose original this user cleared has no
  // quote left to show, because in their copy the original is not there.
  // F5: an original outside the loaded window arrives in quotedById, through
  // the same visibility rule, so a cleared original still shows no quote.
  const visibleQuoted = useMemo(
    () => visibleMessages(Object.values(quotedById), (message) => stateByKey[threadKeyOf(message)]),
    [quotedById, stateByKey, threadKeyOf]
  );
  const messagesById = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of visibleQuoted) map[m.id] = m;
    for (const m of visibleTimeline) map[m.id] = m;
    return map;
  }, [visibleTimeline, visibleQuoted]);

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
    // The visible timeline, never the raw one: a cleared message is out of
    // this user's copy, and a divider for a job whose messages are all gone
    // would head an empty section.
    for (const message of visibleTimeline) {
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
  }, [visibleTimeline, jobTitles]);

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

  const targetReactions = reactionTarget ? reactionsByMessage[reactionTarget] ?? [] : [];
  const myReactionEmoji =
    (user && targetReactions.find((r) => r.user_id === user.id)?.emoji) || null;

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

  // WHETHER THIS WORKER IS ALREADY SAVED, for the menu's Save row. The same
  // lib/savedWorkers calls the profile screen's "Saved — tap to remove" runs
  // on — nothing was extracted or duplicated, the module was already shared.
  // Customer perspective only: saved_workers is a customer's own private list.
  useEffect(() => {
    setSavedWorker(null);
    if (mode !== 'customer' || !user || !counterpartyId || counterpartyId === user.id) return;
    let active = true;
    fetchSavedWorkerIds(user.id).then(({ data }) => {
      if (active) setSavedWorker(data.has(counterpartyId));
    });
    return () => {
      active = false;
    };
  }, [mode, user, counterpartyId]);

  async function toggleSavedWorker() {
    if (!user || !counterpartyId || savedWorker === null) return;
    const next = !savedWorker;
    // Optimistic, with a rollback: the row is a one-tap toggle and waiting on
    // a round trip to redraw it reads as an unresponsive menu.
    setSavedWorker(next);
    const { error: saveError } = next
      ? await saveWorker(user.id, counterpartyId)
      : await unsaveWorker(user.id, counterpartyId);
    if (saveError) {
      setSavedWorker(!next);
      await alertAsync(
        next ? 'Could not save' : 'Could not remove',
        userMessage(saveError)
      );
    }
  }

  /**
   * MUTE IS LIVE, not flagged.
   *
   * The overnight dispatch expected this to wait on a per-conversation mute
   * row. It does not: `mutes` has shipped since phase13 and the inbox row has
   * been calling muteUser/unmuteUser all along — and a conversation in BRAZOS
   * IS a person (the inbox is keyed by counterparty), so per-user and
   * per-conversation mute are the same feature here. `relation` already
   * carries the current state, so the menu row can say which way it toggles.
   */
  async function toggleMute() {
    if (!user || !counterpartyId) return;
    const { error: muteError } = relation.muted
      ? await unmuteUser(user.id, counterpartyId)
      : await muteUser(user.id, counterpartyId);
    if (muteError) {
      await alertAsync(
        relation.muted ? 'Could not unmute' : 'Could not mute',
        userMessage(muteError)
      );
      return;
    }
    // Re-read rather than assuming: the same relation carries the block state
    // the composer gate reads, and a locally-flipped copy of it could disagree
    // with the server about more than mute.
    if (user && counterpartyId) setRelation(await fetchRelation(user.id, counterpartyId));
  }

  /**
   * 2026-09-26 (the refresh, audit M-10) — BLOCK AND REPORT, FROM THE PERSON.
   *
   * They lived only behind a long press or a swipe on the inbox row, so in a
   * conversation — where a person is most likely to need them — there was no
   * visible way to reach either. The header menu now carries both, through
   * the same calls the inbox makes: blockUser / unblockUser / setBlockUntil
   * and the shared ReportDialog, each confirming exactly as the inbox does.
   */
  const [reportOpen, setReportOpen] = useState(false);
  const [blockChooserOpen, setBlockChooserOpen] = useState(false);
  const counterpartyName = counterparty?.full_name ?? 'this person';

  async function rereadRelation() {
    if (user && counterpartyId) setRelation(await fetchRelation(user.id, counterpartyId));
  }

  async function blockPermanently() {
    setBlockChooserOpen(false);
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

  async function blockForDuration(duration: BlockDuration) {
    setBlockChooserOpen(false);
    if (!counterpartyId) return;
    const ok = await confirmAsync({
      title: `Block ${counterpartyName} for ${duration.label}?`,
      message: "You won't be able to message each other until it lapses. You can unblock sooner.",
      confirmText: 'Block',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    const { error: blockError } = await setBlockUntil(
      counterpartyId,
      blockExpiryFrom(Date.now(), duration.ms)
    );
    if (blockError) await alertAsync('Could not block', userMessage(blockError));
    await rereadRelation();
  }

  async function unblock() {
    if (!user || !counterpartyId) return;
    const { error: unblockError } = await unblockUser(user.id, counterpartyId);
    if (unblockError) await alertAsync('Could not unblock', userMessage(unblockError));
    await rereadRelation();
  }

  /** Block's one chooser — permanently first, then the timed durations. */
  const blockChooserItems: ActionSheetItem[] = [
    {
      key: 'block-permanent',
      label: 'Permanently',
      icon: 'ban-outline',
      destructive: true,
      onPress: () => void blockPermanently(),
    },
    ...(TIMED_BLOCK
      ? BLOCK_DURATIONS.map((duration) => ({
          key: duration.key,
          label: duration.label,
          icon: 'time-outline' as const,
          onPress: () => void blockForDuration(duration),
        }))
      : []),
  ];

  /**
   * TRANSLATE, one message or the whole conversation.
   *
   * The two entries differ only in what they pass: one string, or every
   * message this conversation currently has text for. Batching is deliberate
   * — "Translate Conversation" is ONE request with N strings, which is one
   * rate-limit decision on the server rather than N.
   *
   * The target is the DEVICE's language. It is read here rather than inside
   * lib/translate so that module stays free of platform APIs and testable.
   *
   * Everything below is dark: the entry points are behind TRANSLATION, and
   * the Edge Function is a DRAFT that has never been deployed. Every call
   * would resolve `unavailable`, which is exactly what the sheet says.
   */
  async function runTranslation(texts: string[]) {
    // AUDIT F5 — A LIVENESS GUARD. The fetch is awaited, and the sheet can be
    // closed (or a SECOND translation started on another message) while it is
    // in flight. Without this, the stale answer lands in the sheet's state:
    // either re-opening it later shows a translation of a message the user has
    // moved on from, or the second request's result is overwritten by the
    // first one to return. The counter is the same shape the customer-core
    // hooks use for their own out-of-order reads.
    const runId = ++translateRunRef.current;
    setTranslateResult(null);
    setTranslateOpen(true);
    const result = await translateTexts(texts, deviceLanguage());
    if (runId !== translateRunRef.current) return;
    setTranslateResult(result);
  }

  /** Closing INVALIDATES whatever is in flight, which is what makes the guard
   *  above cover the closed-mid-flight case rather than only the raced one. */
  function closeTranslation() {
    translateRunRef.current += 1;
    setTranslateOpen(false);
    setTranslateResult(null);
  }

  /**
   * Copy, and say so when it does not land.
   *
   * ONE implementation for both copy affordances — the translation sheet's
   * button and the message menu's item — because the rule they share is the
   * one that matters. The control only renders when `canCopy()`, so reaching
   * here without a clipboard means the native call itself refused, and silence
   * would leave the user believing the text is on their clipboard when it is
   * not. `subject` only names what failed; it does not change the rule.
   */
  async function copyOrExplain(text: string, subject: 'translation' | 'message') {
    if (!(await copyText(text))) {
      await alertAsync('Could not copy', `The ${subject} could not be copied on this device.`);
    }
  }

  async function handleCopyTranslation(text: string) {
    await copyOrExplain(text, 'translation');
  }

  async function handleShareProfile() {
    if (!counterpartyId) return;
    const result = await shareProfileLink(counterpartyId, counterparty?.full_name);
    if (!result.ok) await alertAsync('Could not share', result.message);
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
   * customer Save, Hire again and Share), then Mute, Block… and Report, which
   * reach the same calls the inbox row makes. They were reachable only by a
   * hidden gesture on the inbox, never from the conversation itself.
   */
  // F20: the person's Mute, Block and Report rows come from the one builder the
  // inbox menu also reads (lib/chatMenus.ts); this screen keeps the handlers.
  const personRows = personSafetyItems({
    muted: relation.muted,
    blocking: relation.blocking,
    onMute: () => void toggleMute(),
    onBlock: () => setBlockChooserOpen(true),
    onUnblock: () => void unblock(),
    onReport: () => setReportOpen(true),
  });
  const muteMenuItem: DropMenuItem = personRows.mute;

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
      // Hidden, not disabled, while the read is in flight: a row that cannot
      // say which way it would toggle should not be offered yet.
      if (savedWorker !== null) {
        headerMenuItems.push({
          key: 'save-worker',
          label: savedWorker ? 'Saved — tap to remove' : 'Save Worker',
          icon: savedWorker ? 'bookmark' : 'bookmark-outline',
          onPress: () => void toggleSavedWorker(),
        });
      }
      headerMenuItems.push({
        key: 'share-profile',
        label: 'Share Profile',
        icon: 'share-outline',
        onPress: () => void handleShareProfile(),
      });
      headerMenuItems.push(muteMenuItem);
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
      headerMenuItems.push(muteMenuItem);
    }
    // M-10 — the safety pair, last and in red, the same in both modes and the
    // same as the inbox row's menu (F20).
    headerMenuItems.push(...personRows.safety);
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
    if (respondingId) return;
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

  // Long-pressing a message offers both actions rather than jumping straight
  // to the reaction picker, so Reply is reachable the same way on every
  // message type — text, photo or voice.
  const messageMenuItems: ActionSheetItem[] = menuTarget
    ? [
        // Reactions are stored per job (message_reactions.job_id), so they are
        // only offered on messages belonging to the job whose reactions this
        // conversation has loaded — never on a pair-thread message, which has
        // no job to key one on.
        ...(reactionsJobId && menuTarget.job_id === reactionsJobId
          ? [
              {
                key: 'react',
                label: 'React',
                icon: 'happy-outline' as const,
                onPress: () => {
                  const id = menuTarget.id;
                  setMenuTarget(null);
                  setReactionTarget(id);
                },
              },
            ]
          : []),
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
        // COPY — added 2026-08-24, and it was never here before: the clipboard
        // boundary landed wired to the translation sheet's Copy button only,
        // and this list was not extended with it. Nothing was failing silently
        // on device; the item simply did not exist.
        //
        // Two gates, and they are different questions. `canCopy()` is the
        // never-a-dead-control rule the sheet already follows — a Copy that
        // cannot copy is worse than no Copy, because the user believes the
        // text is on their clipboard and pastes something else. `content` is
        // the same gate the TRANSLATE entries below use: a photo or a voice
        // note has no text to put anywhere.
        ...(canCopy() && menuTarget.content
          ? [
              {
                key: 'copy',
                label: 'Copy',
                icon: 'copy-outline' as const,
                onPress: () => {
                  const text = menuTarget.content ?? '';
                  setMenuTarget(null);
                  void copyOrExplain(text, 'message');
                },
              },
            ]
          : []),
        // TRANSLATE — two entries, because "this message" and "this
        // conversation" are different amounts of text and different amounts
        // of money, and a user should choose rather than discover. Both are
        // behind TRANSLATION: the Edge Function is a DRAFT and has never been
        // deployed, so every call would resolve `unavailable`.
        // Text only — there is nothing to translate in a photo or a voice note.
        ...(TRANSLATION && menuTarget.content
          ? [
              {
                key: 'translate-message',
                label: 'Translate This Message',
                icon: 'language-outline' as const,
                onPress: () => {
                  const text = menuTarget.content ?? '';
                  setMenuTarget(null);
                  void runTranslation([text]);
                },
              },
              {
                key: 'translate-conversation',
                label: 'Translate Conversation',
                icon: 'chatbubbles-outline' as const,
                onPress: () => {
                  setMenuTarget(null);
                  void runTranslation(
                    messages
                      .filter((m) => !m.unsent_at && !!m.content)
                      .map((m) => m.content as string)
                  );
                },
              },
            ]
          : []),
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


  async function handleSelectReaction(emoji: string) {
    // message_reactions is keyed by job, so reactions are a job-thread
    // feature; the React menu item is hidden everywhere else.
    if (!user || !reactionTarget || !reactionsJobId) return;
    const messageId = reactionTarget;
    setReactionTarget(null);
    const { error } = await setReaction({
      messageId,
      jobId: reactionsJobId,
      userId: user.id,
      emoji,
    });
    if (error) {
      await alertAsync('Could not react', userMessage(error));
      return;
    }
    // Refresh immediately for the reactor; the other party gets it via realtime.
    await refreshReactions();
  }

  async function handleRemoveReaction() {
    if (!user || !reactionTarget) return;
    const messageId = reactionTarget;
    setReactionTarget(null);
    const { error } = await removeReaction(messageId, user.id);
    if (error) {
      await alertAsync('Could not remove reaction', userMessage(error));
      return;
    }
    await refreshReactions();
  }

  async function sendPhoto(asset: ImagePicker.ImagePickerAsset) {
    if (!user || !sendTarget || !sendJobId) return; // See handleSendVoice for why.
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
    trackIntent({
      name: 'permission_result',
      kind: 'camera',
      outcome: permissionOutcome(permission.status, permission.canAskAgain),
    });
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

  /**
   * A DOCUMENT GOES TO THE THREAD, EITHER KIND — and this is the one send path
   * on this screen that does not require `sendJobId`.
   *
   * Photo and voice cannot: chat-photos and chat-audio authorise their inserts
   * against a JOB, so the pair thread has nowhere to key a path, which is what
   * `allowAttachments` has always meant. phase77's chat_documents_* policies
   * carry a second branch on `direct_threads`, so folder one may be either id
   * and the Document row renders on both thread kinds. The guard behind the
   * control agrees with the control: the resolved target, whichever kind it
   * is.
   */
  async function sendDocument(asset: DocumentPicker.DocumentPickerAsset) {
    const threadId = sendJobId ?? sendDirectThreadId;
    if (!user || !sendTarget || !threadId) return;
    setSending(true);
    const { url, error: uploadError } = await uploadChatDocument(
      threadId,
      user.id,
      asset.uri,
      asset.name,
      asset.mimeType
    );
    if (uploadError || !url) {
      setSending(false);
      await alertAsync(
        'Could not send document',
        userMessage(
          uploadError,
          'Upload failed. The chat-documents storage bucket may still need setting up.'
        )
      );
      return;
    }

    const { data, error } = await sendMessage({
      target: sendTarget,
      senderId: user.id,
      content: '',
      documentUrl: url,
      // The name and the size are what let the bubble draw before anything is
      // downloaded. `size` is optional on a picked asset, and an absent one
      // stays absent rather than becoming a zero the bubble would label.
      documentName: asset.name,
      documentSizeBytes: asset.size ?? null,
    });
    setSending(false);

    if (error) {
      await reportSendFailure('Could not send document', error);
      return;
    }
    if (data) addOwnMessage(data);
  }

  async function pickDocument() {
    // No permission request: the system document browser is a presented picker
    // that hands back only what the user chose, so there is no prompt to make
    // and nothing to explain in advance. copyToCacheDirectory is what makes
    // the returned uri readable by fetch() a moment later.
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      await sendDocument(result.assets[0]);
    }
  }

  /**
   * Open a document attachment IN THE OS.
   *
   * NOT Linking.openURL, which is what this was until 2026-08-25 and what the
   * fence in tests/chatDocuments.test.mjs now stops coming back. Opening the
   * signed URL left the app and handed Safari the link — putting the Supabase
   * project ref in the address bar and in the browser's history, and leaving
   * the file in a browser tab rather than in the OS. shareDocument downloads
   * it first and hands the OS the local file, exactly as a shared photo
   * already does, so the app stays in the foreground and the URL reaches no
   * browser at all.
   *
   * `document_url` arrives here already exchanged for a short-lived signed URL
   * (resolveMessageMedia), so this is the resolution the download uses; there
   * is no second one. A signature that has outlived the thread being left open
   * fails the download and is SAID rather than swallowed — nothing here
   * refreshes it, and silence would read as a dead bubble.
   *
   * The id, not a boolean: only the bubble that was tapped spins, and the rest
   * of the thread stays live.
   */
  async function openDocument(message: Message) {
    const url = message.document_url;
    // Already fetching one — a second tap must not start a second download.
    if (!url || openingDocumentId) return;
    setOpeningDocumentId(message.id);
    const result = await shareDocument(url, message.document_name);
    setOpeningDocumentId(null);
    // Dismissing the OS sheet is a cancellation and returns ok, so nothing is
    // surfaced for it. Only a real failure speaks.
    if (!result.ok) await alertAsync('Could not open document', result.message);
  }

  // F3: ONE row renderer, memoised on what a row reads, so state the rows do
  // not show (the menus, the reply bar, a send in flight) re-renders no row.
  // The two handlers that read screen state reach it through a ref, which
  // keeps them — and so this renderer — stable.
  const rowHandlers = useRef({ openDocument, openOfferJob });
  useEffect(() => {
    rowHandlers.current = { openDocument, openOfferJob };
  });
  const pressDocument = useCallback((message: Message) => void rowHandlers.current.openDocument(message), []);
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
          </View>
        );
      }

      return (
        <ChatBubble
          message={item}
          isOwn={item.sender_id === user?.id}
          // THE FLAG GUARDS THE ASSEMBLY, not the element. Undefined
          // resolves to `sent` — one tick — which is exactly what an
          // unflipped build has always shown. Own messages only:
          // a tick on theirs would claim to know what YOU did with
          // THEIR message.
          delivery={
            READ_TICKS && item.sender_id === user?.id
              ? deliveryFor(item, readPositions)
              : undefined
          }
          senderName={counterparty?.full_name}
          senderAvatarUrl={counterparty?.avatar_url}
          reactions={reactionsByMessage[item.id]}
          // Nothing to react to or reply to on an already-unsent placeholder:
          // the bubble withholds the long-press itself (F3).
          onLongPressMessage={setMenuTarget}
          onPressImage={setViewerUri}
          onPressDocument={pressDocument}
          documentBusy={openingDocumentId === item.id}
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
      readPositions,
      reactionsByMessage,
      openingDocumentId,
      messagesById,
      pressDocument,
      openOfferJobFromRow,
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

          {/* THE LIVE-SHARE CARDS SIT BELOW THE TIMELINE AND ABOVE EVERYTHING
              ELSE IN THIS COLUMN, and that placement is the "persistent" in
              "a persistent card in the thread": a share is a running state,
              not an event, so it must not scroll away with the messages it is
              not part of. Nothing is inserted into the timeline itself —
              `live_location_shares` has no row in `messages`, and writing one
              would make an ephemeral fact permanent in a transcript both
              people keep.

              OUTSIDE the blocked / locked / composer branch on purpose. Those
              three decide whether this user may WRITE; a share that already
              exists is a fact the policy handed over, and hiding it behind a
              composer state would be a second rule the server does not have.
              There is still no way to START one from a thread with no
              composer, because the entry lives in the [ + ] menu. */}
          {liveLocation.theirs.map((share) => (
            <LiveLocationCard
              key={share.id}
              share={share}
              sharerName={counterparty?.full_name}
              now={liveLocation.now}
            />
          ))}
          {liveLocation.mine ? (
            <LiveLocationBar
              share={liveLocation.mine}
              now={liveLocation.now}
              busy={liveLocation.busy}
              onStop={endShare}
            />
          ) : null}

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
            // replies, camera, photo library and voice — rather than disabling
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
              {replyTo && recorder.phase === 'idle' && (
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
                recorderPhase={recorder.phase}
                recorderDurationMs={recorder.durationMs}
                recorderLevels={recorder.meterLevels}
                previewUri={recorder.previewUri}
                onMicTap={handleMicTap}
                onStopRecording={handleStopRecording}
                onSendVoice={handleSendVoice}
                onDiscardVoice={recorder.discard}
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
                //
                // CAMERA, PHOTOS AND VOICE ONLY. Document is deliberately NOT
                // behind this: phase77's chat_documents_* policies take a job
                // id OR a direct thread id in folder one, so it works on both
                // thread kinds and hiding it here would hide a working
                // feature on every pair thread. The chat-photos / chat-audio
                // gap is real and parked; it is not closed from the client.
                allowAttachments={!!sendJobId}
                onPickDocument={pickDocument}
                // Also not behind `allowAttachments`, and for a stronger
                // reason than the document row: a share writes no file at
                // all. It is a row in `live_location_shares`, reached through
                // three RPCs that each take a job id or a direct thread id,
                // so there is no bucket and no path for a pair thread to
                // lack. Offered only while no share of this user's is already
                // running — the bar above IS the control at that point, and a
                // second entry that silently restarts a live share is how a
                // window quietly gets extended.
                onShareLiveLocation={
                  liveLocation.sharing ? undefined : () => setDurationPickerOpen(true)
                }
              />
            </>
          )}
        </KeyboardRisingColumn>
      </View>

      <ReactionPicker
        visible={!!reactionTarget}
        currentEmoji={myReactionEmoji}
        onSelect={handleSelectReaction}
        onRemove={handleRemoveReaction}
        onClose={() => setReactionTarget(null)}
      />

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

      <ActionSheet
        visible={blockChooserOpen}
        title={counterpartyName}
        subtitle="Block — for how long?"
        items={blockChooserItems}
        onClose={() => setBlockChooserOpen(false)}
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

      <ActionSheet
        visible={durationPickerOpen}
        title="Share live location"
        subtitle={`${counterparty?.full_name ?? 'They'} will see where you are until it ends. You can stop it at any time.`}
        items={durationItems}
        onClose={() => setDurationPickerOpen(false)}
      />

      <TranslationSheet
        visible={translateOpen}
        onClose={closeTranslation}
        result={translateResult}
        // Rendered only where the clipboard actually exists — on a build
        // without expo-clipboard's native module there is no core fallback to
        // fall back TO, so the control is absent rather than broken.
        onCopy={canCopy() ? handleCopyTranslation : undefined}
      />

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
