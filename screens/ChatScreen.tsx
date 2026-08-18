import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { ChatBubble } from '../components/ChatBubble';
import { ChatComposer } from '../components/ChatComposer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { OfferCard } from '../components/OfferCard';
import { PhotoViewer } from '../components/PhotoViewer';
import { QuickReplies } from '../components/QuickReplies';
import { ReactionPicker } from '../components/ReactionPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversationChat } from '../hooks/useConversationChat';
import { useJob } from '../hooks/useJob';
import { useReactions } from '../hooks/useReactions';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { canRehireWorker, fetchJobById, formatBudget, toOpenJob } from '../lib/jobs';
import {
  acceptOfferConfirmTitle,
  declineOfferConfirmTitle,
} from '../lib/offerCopy';
import { offerJobTarget } from '../lib/offerNavigation';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  ACTIVE_JOB_STATUSES,
  fetchDirectThreadWith,
  fetchSharedJobs,
  markConversationRead,
  resolveOtherId,
  type SharedJob,
} from '../lib/conversations';
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
import { EMPTY_RELATION, fetchRelation, type RelationState } from '../lib/moderation';
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
import { uploadChatAudio, uploadChatPhoto } from '../lib/storage';
import type { ChatRouteParamList } from '../lib/navigation';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/** One entry in the merged timeline: a message, or the job it belongs to. */
type TimelineItem =
  | { kind: 'divider'; key: string; title: string }
  | { kind: 'message'; key: string; message: Message };

export function ChatScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
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
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // Profile pictures open in the same viewer but without the share sheet, so
  // they're tracked separately from ordinary chat photos.
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
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

  const { messages, loading, error, addLocal } = useConversationChat(targets);

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
    if (data) addLocal(data);
  }

  const listRef = useRef<FlatList<TimelineItem>>(null);

  // A job where the client is also the assigned worker (e.g. bid on your own
  // job), or a job with no resolvable second party at all (no one assigned) —
  // either way there's no one else to message. No quick templates in that case.
  const isSelfConversation = !!user && counterpartyId === user.id;

  // Messages by id, for resolving a reply's quoted original without a join —
  // the quoted message is always somewhere in this conversation.
  const messagesById = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

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

  const isBlocked = relation.blocking || relation.blockedBy;

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

  // Once the jump has happened, only genuinely NEW messages pull the view back
  // down — otherwise the conversation would snap to the bottom the moment a
  // photo finished measuring and the jump would be pointless.
  const settledCount = useRef<number | null>(null);
  useEffect(() => {
    if (items.length === 0) return;
    if (scrollTargetIndex >= 0 && settledCount.current === null) {
      settledCount.current = items.length;
      requestAnimationFrame(() =>
        listRef.current?.scrollToIndex({
          index: scrollTargetIndex,
          animated: false,
          viewPosition: 0,
        })
      );
      return;
    }
    if (scrollTargetIndex >= 0 && items.length <= (settledCount.current ?? 0)) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
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

  async function handleSendText() {
    const content = text.trim();
    if (!content || !user || sending || !sendTarget) return;
    const quoted = replyTo;
    setText('');
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
      // turn a reply into a standalone message on the next attempt.
      setText(content);
      setReplyTo(quoted);
      return;
    }
    if (data) addLocal(data);
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

  async function handleTemplate(template: string) {
    if (!user || sending || !sendTarget) return;
    setSending(true);
    const { data, error } = await sendMessage({
      target: sendTarget,
      senderId: user.id,
      content: template,
    });
    setSending(false);
    if (error) {
      await reportSendFailure('Could not send message', error);
      return;
    }
    if (data) addLocal(data);
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
    if (data) addLocal(data);
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
      await alertAsync('Camera access needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      await sendPhoto(result.assets[0]);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
        right={
          canRehire && counterparty ? (
            <Pressable
              onPress={() =>
                (navigation as unknown as {
                  navigate: (screen: 'PostJob', params: object) => void;
                }).navigate('PostJob', {
                  hireWorkerId: counterparty.id,
                  hireWorkerName: counterparty.full_name ?? 'this worker',
                  // Post the request into the same thread a message would go
                  // to. With no active job there is nothing to name and the
                  // server's own fallback — their most recent shared completed
                  // job, then their pair thread — lands in this conversation
                  // anyway, because every one of those threads IS it.
                  threadJobId: activeJob?.id,
                })
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Hire ${counterparty.full_name ?? 'this worker'} again`}
              style={({ pressed }) => [
                styles.hireAgainButton,
                pressed && styles.hireAgainButtonPressed,
              ]}
            >
              <Ionicons name="person-add" size={14} color={colors.onPrimary} />
              <Text style={styles.hireAgainLabel}>Hire Again</Text>
            </Pressable>
          ) : undefined
        }
      />

      {/* useConversationChat keeps the failure itself rather than its text, so
          the one mapper still runs here at the render seam (raw-error sweep,
          2026-08-10 — see docs/LOCKED_FILE_PATCHES.md). */}
      {error ? <Text style={styles.error}>{userMessage(error)}</Text> : null}

      {/* keyboardVerticalOffset is 0, not 90. With `behavior="padding"` RN
          computes padding as (frameBottom - keyboardTop + offset), and this
          view already ends at the screen bottom — so any non-zero offset is
          added verbatim as dead space above the keyboard. The old 90 was the
          gap that showed up whenever the keyboard opened. The header is a
          sibling above this view, not an overlay, so nothing needs
          compensating for. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading || (threadsLoading && targets.length === 0) ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
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
            data={items}
            keyExtractor={(entry) => entry.key}
            renderItem={({ item: entry }) => {
              // The job context changed here. Not a section header — the same
              // job can head several of these when two conversations
              // interleave, which is what actually happened.
              if (entry.kind === 'divider') {
                return (
                  <View style={styles.jobDivider}>
                    <View style={styles.jobDividerRule} />
                    <Text style={styles.jobDividerLabel} numberOfLines={1}>
                      {entry.title}
                    </Text>
                    <View style={styles.jobDividerRule} />
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
                      chain={threadOffers.filter(
                        (o) => o.root_offer_id === request?.root_offer_id
                      )}
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
                          ? () => openOfferJob(request)
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
                  senderName={counterparty?.full_name}
                  senderAvatarUrl={counterparty?.avatar_url}
                  reactions={reactionsByMessage[item.id]}
                  // Nothing to react to or reply to on an already-unsent
                  // placeholder.
                  onLongPress={item.unsent_at ? undefined : () => setMenuTarget(item)}
                  onPressImage={setViewerUri}
                  replyTo={item.reply_to_id ? messagesById[item.reply_to_id] : null}
                  replyToName={
                    item.reply_to_id
                      ? messagesById[item.reply_to_id]?.sender_id === user?.id
                        ? 'You'
                        : counterparty?.full_name ?? 'Them'
                      : null
                  }
                  onLongPressAvatar={
                    counterparty?.avatar_url
                      ? () => setAvatarUri(counterparty.avatar_url!)
                      : undefined
                  }
                />
              );
            }}
            contentContainerStyle={styles.messages}
            // A legacy jobId entry owns the initial scroll (see
            // scrollTargetIndex) — sticking to the bottom here would undo it
            // the moment an image finished measuring.
            onContentSizeChange={() => {
              if (scrollTargetIndex >= 0) return;
              listRef.current?.scrollToEnd({ animated: false });
            }}
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
              {relation.blocking
                ? "You've blocked this person. Unblock them from Messages to start talking again."
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
            {/* The templates are about work in progress — "On my way",
                "Running late", "When can you start?". They are only true of a
                job thread with a live job, so on the pair thread there are no
                quick replies at all rather than a second set invented to fill
                the row. */}
            {!isSelfConversation && !replyTo && !!activeJob && (
              <QuickReplies onSelect={handleTemplate} disabled={sending} />
            )}

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
                  <Image source={{ uri: replyTo.image_url }} style={styles.replyThumb} />
                ) : null}
                <Pressable
                  onPress={() => setReplyTo(null)}
                  hitSlop={10}
                  accessibilityLabel="Cancel reply"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            )}

            <ChatComposer
              text={text}
              onChangeText={setText}
              onSend={handleSendText}
              sending={sending}
              onPickCamera={pickFromCamera}
              onPickLibrary={pickFromLibrary}
              recorderPhase={recorder.phase}
              recorderDurationMs={recorder.durationMs}
              previewUri={recorder.previewUri}
              onMicTap={handleMicTap}
              onStopRecording={handleStopRecording}
              onSendVoice={handleSendVoice}
              onDiscardVoice={recorder.discard}
              // Whether the RESOLVED send target is job-scoped, not which
              // route opened the screen: chat media is stored under
              // `{jobId}/{userId}/…` and the pair thread has no job id to key
              // a path on.
              allowAttachments={!!sendJobId}
            />
          </>
        )}
      </KeyboardAvoidingView>

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

      <AmountPrompt
        visible={!!counterTarget}
        title="Counter offer"
        message={
          counterTarget
            ? `Currently ${formatBudget(counterTarget.amount_cents)}. Propose a different amount.`
            : ''
        }
        initialCents={counterTarget?.amount_cents ?? null}
        confirmText="Send counter"
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
                formatBudget(confirmResponse.request.amount_cents)
              )
            : confirmResponse?.action === 'withdraw'
              ? 'Withdraw your offer?'
              : confirmResponse
                ? declineOfferConfirmTitle(
                    formatBudget(confirmResponse.request.amount_cents)
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
            ? 'Accept job'
            : confirmResponse?.action === 'withdraw'
              ? 'Withdraw offer'
              : 'Decline'
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
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
  jobDividerRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
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
  hireAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  hireAgainButtonPressed: {
    opacity: 0.85,
  },
  hireAgainLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
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
