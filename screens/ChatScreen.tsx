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
import { useChat } from '../hooks/useChat';
import { useJob } from '../hooks/useJob';
import { useReactions } from '../hooks/useReactions';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { canRehireWorker, fetchJobById, formatBudget } from '../lib/jobs';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { markConversationRead, resolveOtherId } from '../lib/conversations';
import {
  fetchDirectThread,
  otherParticipant,
  type DirectThread,
} from '../lib/directThreads';
import type { ChatTarget } from '../lib/messages';
import { EMPTY_RELATION, fetchRelation, type RelationState } from '../lib/moderation';
import {
  canUnsend,
  messagePreviewText,
  sendMessage,
  unsendMessage,
  type Message,
} from '../lib/messages';
import {
  acceptOffer,
  counterOffer,
  declineOffer,
  offerIdOf,
  withdrawOffer,
  type OfferWithJob,
} from '../lib/offers';
import { useThreadOffers } from '../hooks/useJobOffers';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { removeReaction, setReaction } from '../lib/reactions';
import { uploadChatAudio, uploadChatPhoto } from '../lib/storage';
import type { ChatRouteParamList } from '../lib/navigation';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { colors, radius, spacing } from '../lib/theme';

export function ChatScreen() {
  // Chat is nested in more than one tab's stack, so its nav/route types are
  // declared standalone (ChatRouteParamList) rather than tied to one parent
  // stack — it only needs goBack() and its own `jobId` param.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<ChatRouteParamList, 'Chat'>>();
  const { user } = useAuth();
  // A thread is either a job's conversation or a direct thread between two
  // people with no job (phase36) — exactly one of these is ever set.
  const jobId = params.jobId ?? null;
  const directThreadId = params.directThreadId ?? null;
  // The route param IS the discriminated ChatTarget already — no rebuild, no
  // cast (hardening A8).
  const target: ChatTarget = params;

  const { job } = useJob(jobId);
  const { messages, loading, error, addLocal } = useChat(jobId, directThreadId);
  const { byMessage: reactionsByMessage, refresh: refreshReactions } =
    useReactions(jobId);

  // Mark this conversation read on entering and again on leaving, so a
  // message that arrives while the chat is open doesn't show as unread later.
  useFocusEffect(
    useCallback(() => {
      // Fire-and-forget by design (the unread dot self-heals on the next
      // focus); the log keeps a failed mark-read observable (hardening A8).
      const uid = user?.id;
      if (!uid) return;
      const mark = () =>
        void markConversationRead(target, uid).then(({ error: markError }) => {
          if (markError) console.warn('[Chat] mark-read failed', markError.message);
        });
      mark();
      return mark;
    }, [user, target])
  );

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

  const {
    byId: requestsById,
    offers: threadOffers,
    refresh: refreshRequests,
  } = useThreadOffers(messages);

  // The direct thread's own row, for working out who the other person is when
  // there is no job to read it from.
  const [thread, setThread] = useState<DirectThread | null>(null);
  useEffect(() => {
    if (!directThreadId) return;
    let active = true;
    fetchDirectThread(directThreadId).then(({ data }) => {
      if (active) setThread(data);
    });
    return () => {
      active = false;
    };
  }, [directThreadId]);

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
    // authorise on that job — a direct thread has no job id to key a path on,
    // so attachments stay job conversations only. The composer hides both
    // controls there; this is the guard behind them.
    if (!user || !clip || !jobId) return;
    setSending(true);
    const { url, error: uploadError } = await uploadChatAudio(
      jobId,
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
      target,
      senderId: user.id,
      content: '',
      audioUrl: url,
      audioDurationMs: clip.durationMs,
    });
    setSending(false);

    if (error) {
      await alertAsync('Could not send voice message', userMessage(error));
      return;
    }
    recorder.reset();
    if (data) addLocal(data);
  }

  const listRef = useRef<FlatList>(null);

  const counterpartyId = useMemo(() => {
    if (!user) return null;
    if (thread) return otherParticipant(thread, user.id);
    if (!job) return null;
    return resolveOtherId(job, user.id);
  }, [job, thread, user]);

  // A job where the client is also the assigned worker (e.g. bid on your own
  // job), or a job with no resolvable second party at all (no one assigned) —
  // either way there's no one else to message. No quick templates in that case.
  const isSelfConversation = !!user && counterpartyId === user.id;

  // Messages by id, for resolving a reply's quoted original without a join —
  // the quoted message is always in this same thread.
  const messagesById = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

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
  // a worker never sees it for their client. It also requires a job-backed
  // chat: create_job_request can target that job thread, but has no parameter
  // for a direct-thread id and would otherwise place the offer in an older job.
  const [canRehire, setCanRehire] = useState(false);
  useEffect(() => {
    setCanRehire(false);
    if (!jobId || !user || !counterpartyId || counterpartyId === user.id) return;
    let active = true;
    canRehireWorker(user.id, counterpartyId).then(({ data }) => {
      if (active) setCanRehire(data);
    });
    return () => {
      active = false;
    };
  }, [jobId, user, counterpartyId]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  async function handleSendText() {
    const content = text.trim();
    if (!content || !user || sending) return;
    const quoted = replyTo;
    setText('');
    setReplyTo(null);
    setSending(true);
    const { data, error } = await sendMessage({
      target,
      senderId: user.id,
      content,
      replyToId: quoted?.id ?? null,
    });
    setSending(false);
    if (error) {
      await alertAsync('Could not send message', userMessage(error));
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
      await alertAsync('Could not update offer', userMessage(error));
      // The RPC rejects stale turns, so resync rather than leaving the card
      // showing actions that no longer apply.
      await refreshRequests();
      return;
    }

    await refreshRequests();
    if (action === 'accept') {
      await alertAsync(
        'Offer accepted',
        'The job is now assigned and has moved into My Jobs.'
      );
    }
  }

  /**
   * Opens the job an accepted request created. Either party can tap into it —
   * routed to whichever screen their own role actually has: the client's full
   * job-with-bids view, or the worker's status screen. Both live in the My
   * Jobs stack regardless of which tab Chat itself was reached from, so this
   * always goes through the tab-level parent rather than the local stack.
   */
  async function openAcceptedJob(request: OfferWithJob) {
    if (!user || openingJobId) return;
    // Under the unified model the job always exists — a direct offer creates
    // it as a draft up front — so there is no nullable created_job_id to
    // guard, only the offer having actually been accepted.
    const jobId = request.job_id;

    if (user.id === request.customer_id) {
      // The client's screen needs the full job row (bids, status, etc.), not
      // just the id, so it's fetched before navigating.
      setOpeningJobId(request.id);
      const { data: fetchedJob, error } = await fetchJobById(jobId);
      setOpeningJobId(null);

      if (error || !fetchedJob) {
        await alertAsync(
          'Could not open job',
          userMessage(error, 'This job could not be found.')
        );
        return;
      }
      // MyJobs is a shared tab that registers this route in both trees, so the
      // hop was never mode-fragile — it goes through the one guarded helper
      // anyway, so there is a single way to cross tabs and no second pattern
      // for the next caller to copy (lib/navigationRef.ts).
      navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job: fetchedJob });
      return;
    }

    // The worker's screen only takes the id and loads itself.
    navigateAcrossTabs('MyJobs', 'WorkerJob', { jobId });
  }

  // Long-pressing a message offers both actions rather than jumping straight
  // to the reaction picker, so Reply is reachable the same way on every
  // message type — text, photo or voice.
  const messageMenuItems: ActionSheetItem[] = menuTarget
    ? [
        // Reactions are stored per job (message_reactions.job_id), so they are
        // only offered in a job conversation.
        ...(jobId
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
    if (!user || sending) return;
    setSending(true);
    const { data, error } = await sendMessage({
      target,
      senderId: user.id,
      content: template,
    });
    setSending(false);
    if (error) {
      await alertAsync('Could not send message', userMessage(error));
      return;
    }
    if (data) addLocal(data);
  }

  async function handleSelectReaction(emoji: string) {
    // message_reactions is keyed by job, so reactions are a job-conversation
    // feature; the React menu item is hidden in a direct thread.
    if (!user || !reactionTarget || !jobId) return;
    const messageId = reactionTarget;
    setReactionTarget(null);
    const { error } = await setReaction({
      messageId,
      jobId,
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
    if (!user || !jobId) return; // See handleSendVoice for why.
    setSending(true);
    const { url, error: uploadError } = await uploadChatPhoto(
      jobId,
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
      target,
      senderId: user.id,
      content: '',
      imageUrl: url,
    });
    setSending(false);
    if (error) {
      await alertAsync('Could not send photo', userMessage(error));
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
        subtitle={job?.title}
        onBack={() => navigation.goBack()}
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
          canRehire && counterparty && jobId ? (
            <Pressable
              onPress={() =>
                (navigation as unknown as {
                  navigate: (screen: 'PostJob', params: object) => void;
                }).navigate('PostJob', {
                  hireWorkerId: counterparty.id,
                  hireWorkerName: counterparty.full_name ?? 'this worker',
                  // Post the request into THIS conversation rather than
                  // letting the server pick a thread for us.
                  threadJobId: jobId,
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

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
        {loading ? (
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
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
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
                      onOpenJob={
                        request?.status === 'accepted'
                          ? () => openAcceptedJob(request)
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
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
        ) : (
          <>
            {!isSelfConversation && !replyTo && (
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
              allowAttachments={!!jobId}
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
            ? `Accept this ${formatBudget(confirmResponse.request.amount_cents)} job?`
            : confirmResponse?.action === 'withdraw'
              ? 'Withdraw your offer?'
              : 'Decline this offer?'
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

const styles = StyleSheet.create({
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
  requestRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  requestRowOwn: {
    justifyContent: 'flex-end',
    paddingLeft: 24,
  },
  requestRowOther: {
    justifyContent: 'flex-start',
    paddingRight: 24,
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
});
