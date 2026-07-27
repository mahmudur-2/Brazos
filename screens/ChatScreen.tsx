import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { JobRequestCard } from '../components/JobRequestCard';
import { PhotoViewer } from '../components/PhotoViewer';
import { QuickReplies } from '../components/QuickReplies';
import { ReactionPicker } from '../components/ReactionPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useJob } from '../hooks/useJob';
import { useReactions } from '../hooks/useReactions';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { canRehireWorker, formatBudget } from '../lib/jobs';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { markConversationRead, resolveOtherId } from '../lib/conversations';
import { EMPTY_RELATION, fetchRelation, type RelationState } from '../lib/moderation';
import {
  CHAT_TEMPLATES,
  formatClipDuration,
  messagePreviewText,
  sendMessage,
  type Message,
} from '../lib/messages';
import {
  isOpenRequest,
  respondToJobRequest,
  type JobRequest,
} from '../lib/jobRequests';
import { useJobRequests } from '../hooks/useJobRequests';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { removeReaction, setReaction } from '../lib/reactions';
import { uploadChatAudio, uploadChatPhoto } from '../lib/storage';
import type { ChatRouteParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

export function ChatScreen() {
  // Chat is nested in more than one tab's stack, so its nav/route types are
  // declared standalone (ChatRouteParamList) rather than tied to one parent
  // stack — it only needs goBack() and its own `jobId` param.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<ChatRouteParamList, 'Chat'>>();
  const { user } = useAuth();
  const { job } = useJob(params.jobId);
  const { messages, loading, error, addLocal } = useChat(params.jobId);
  const { byMessage: reactionsByMessage, refresh: refreshReactions } =
    useReactions(params.jobId);

  // Mark this conversation read on entering and again on leaving, so a
  // message that arrives while the chat is open doesn't show as unread later.
  useFocusEffect(
    useCallback(() => {
      if (user) markConversationRead(params.jobId, user.id);
      return () => {
        if (user) markConversationRead(params.jobId, user.id);
      };
    }, [user, params.jobId])
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
  const [counterTarget, setCounterTarget] = useState<JobRequest | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const { byId: requestsById, refresh: refreshRequests } = useJobRequests(params.jobId);

  const recorder = useVoiceRecorder();
  const insets = useSafeAreaInsets();
  // The composer owns the bottom safe-area inset (SafeAreaView no longer
  // applies it — see the `edges` prop above), but that inset must collapse
  // while the keyboard is up or it becomes a gap above the keyboard.
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  async function handleMicPressIn() {
    if (sending) return;
    const started = await recorder.start();
    if (!started && recorder.error) {
      await alertAsync('Cannot record', recorder.error);
      recorder.clearError();
    }
  }

  async function handleMicPressOut() {
    const clip = await recorder.stop();
    if (!clip) {
      // A sub-MIN_CLIP_MS clip is a mis-tap on the mic icon, so it's dropped
      // without comment. A genuine recorder failure does get surfaced.
      if (recorder.error) {
        await alertAsync('Recording failed', recorder.error);
        recorder.clearError();
      }
      return;
    }
    await sendVoiceNote(clip);
  }

  async function sendVoiceNote(clip: { uri: string; durationMs: number }) {
    if (!user) return;
    setSending(true);
    const { url, error: uploadError } = await uploadChatAudio(params.jobId, clip.uri);
    if (uploadError || !url) {
      setSending(false);
      await alertAsync(
        'Could not send voice message',
        uploadError?.message ??
          'Upload failed. The chat-audio storage bucket may still need setting up.'
      );
      return;
    }

    const { data, error } = await sendMessage({
      jobId: params.jobId,
      senderId: user.id,
      content: '',
      audioUrl: url,
      audioDurationMs: clip.durationMs,
    });
    setSending(false);

    if (error) {
      await alertAsync('Could not send voice message', error.message);
      return;
    }
    if (data) addLocal(data);
  }

  const listRef = useRef<FlatList>(null);

  const counterpartyId = useMemo(() => {
    if (!job || !user) return null;
    return resolveOtherId(job, user.id);
  }, [job, user]);

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
      if (m.job_request_id) map[m.job_request_id] = m.id;
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
  // a worker never sees it for their client.
  const [canRehire, setCanRehire] = useState(false);
  useEffect(() => {
    if (!user || !counterpartyId || counterpartyId === user.id) return;
    let active = true;
    canRehireWorker(user.id, counterpartyId).then(({ data }) => {
      if (active) setCanRehire(data);
    });
    return () => {
      active = false;
    };
  }, [user, counterpartyId]);

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
      jobId: params.jobId,
      senderId: user.id,
      content,
      replyToId: quoted?.id ?? null,
    });
    setSending(false);
    if (error) {
      await alertAsync('Could not send message', error.message);
      // Restore the draft AND the reply target, so a failure doesn't silently
      // turn a reply into a standalone message on the next attempt.
      setText(content);
      setReplyTo(quoted);
      return;
    }
    if (data) addLocal(data);
  }

  async function respondToRequest(
    request: JobRequest,
    action: 'accept' | 'decline' | 'counter',
    amountCents?: number
  ) {
    if (respondingId) return;
    setRespondingId(request.id);
    const { error } = await respondToJobRequest(request.id, action, amountCents);
    setRespondingId(null);

    if (error) {
      await alertAsync('Could not update request', error.message);
      // The RPC rejects stale turns, so resync rather than leaving the card
      // showing actions that no longer apply.
      await refreshRequests();
      return;
    }

    await refreshRequests();
    if (action === 'accept') {
      await alertAsync(
        'Request accepted',
        'The job is now assigned and has moved into My Jobs.'
      );
    }
  }

  // Long-pressing a message offers both actions rather than jumping straight
  // to the reaction picker, so Reply is reachable the same way on every
  // message type — text, photo or voice.
  const messageMenuItems: ActionSheetItem[] = menuTarget
    ? [
        {
          key: 'react',
          label: 'React',
          icon: 'happy-outline',
          onPress: () => {
            const id = menuTarget.id;
            setMenuTarget(null);
            setReactionTarget(id);
          },
        },
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
      ]
    : [];

  async function confirmDecline(request: JobRequest) {
    const ok = await confirmAsync({
      title: 'Decline this request?',
      message: 'No job will be created. This cannot be undone.',
      confirmText: 'Decline',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (ok) await respondToRequest(request, 'decline');
  }

  async function handleTemplate(template: string) {
    if (!user || sending) return;
    setSending(true);
    const { data, error } = await sendMessage({
      jobId: params.jobId,
      senderId: user.id,
      content: template,
    });
    setSending(false);
    if (error) {
      await alertAsync('Could not send message', error.message);
      return;
    }
    if (data) addLocal(data);
  }

  async function handleSelectReaction(emoji: string) {
    if (!user || !reactionTarget) return;
    const messageId = reactionTarget;
    setReactionTarget(null);
    const { error } = await setReaction({
      messageId,
      jobId: params.jobId,
      userId: user.id,
      emoji,
    });
    if (error) {
      await alertAsync('Could not react', error.message);
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
      await alertAsync('Could not remove reaction', error.message);
      return;
    }
    await refreshReactions();
  }

  async function sendPhoto(asset: ImagePicker.ImagePickerAsset) {
    if (!user) return;
    setSending(true);
    const { url, error: uploadError } = await uploadChatPhoto(params.jobId, asset);
    if (uploadError || !url) {
      setSending(false);
      await alertAsync(
        'Photo upload failed',
        'Please try again. You may need to set up the chat-photos storage bucket.'
      );
      return;
    }
    const { data, error } = await sendMessage({
      jobId: params.jobId,
      senderId: user.id,
      content: '',
      imageUrl: url,
    });
    setSending(false);
    if (error) {
      await alertAsync('Could not send photo', error.message);
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
          canRehire && counterparty ? (
            <Pressable
              onPress={() =>
                (navigation as any).navigate('PostJob', {
                  hireWorkerId: counterparty.id,
                  hireWorkerName: counterparty.full_name ?? 'this worker',
                  // Post the request into THIS conversation rather than
                  // letting the server pick a thread for us.
                  threadJobId: params.jobId,
                })
              }
              hitSlop={8}
            >
              <Text style={styles.hireAgainLink}>Hire Again</Text>
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
              if (item.job_request_id) {
                const request = requestsById[item.job_request_id];
                const isOwn = item.sender_id === user?.id;
                return (
                  <View
                    style={[
                      styles.requestRow,
                      isOwn ? styles.requestRowOwn : styles.requestRowOther,
                    ]}
                  >
                    <JobRequestCard
                      message={item}
                      request={request}
                      isLatest={latestMessageIdByRequest[item.job_request_id] === item.id}
                      currentUserId={user?.id ?? ''}
                      busy={respondingId === item.job_request_id}
                      onAccept={() => request && respondToRequest(request, 'accept')}
                      onDecline={() => request && confirmDecline(request)}
                      onCounter={() => request && setCounterTarget(request)}
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
                  onLongPress={() => setMenuTarget(item)}
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
            {replyTo && !recorder.isRecording && (
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

            {recorder.isRecording && (
              <View style={styles.recordingBar}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTime}>
                  {formatClipDuration(recorder.durationMs)}
                </Text>
                <Text style={styles.recordingHint}>
                  Release to send · slide off to cancel
                </Text>
              </View>
            )}

            <ChatComposer
              text={text}
              onChangeText={setText}
              onSend={handleSendText}
              sending={sending}
              isRecording={recorder.isRecording}
              onPickCamera={pickFromCamera}
              onPickLibrary={pickFromLibrary}
              onMicPressIn={handleMicPressIn}
              onMicPressOut={handleMicPressOut}
              // The inset itself drops to zero while the keyboard is up,
              // since the inset area is covered by the keyboard then.
              bottomInset={keyboardUp ? 0 : insets.bottom}
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
          const target = counterTarget;
          setCounterTarget(null);
          if (target) respondToRequest(target, 'counter', cents);
        }}
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
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  recordingTime: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
    fontVariant: ['tabular-nums'],
  },
  recordingHint: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
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
  hireAgainLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
});
