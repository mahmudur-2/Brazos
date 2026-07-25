import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { ChatBubble } from '../components/ChatBubble';
import { ReactionPicker } from '../components/ReactionPicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useJob } from '../hooks/useJob';
import { useReactions } from '../hooks/useReactions';
import { canRehireWorker } from '../lib/jobs';
import { alertAsync } from '../lib/dialog';
import { markConversationRead, resolveOtherId } from '../lib/conversations';
import { EMPTY_RELATION, fetchRelation, type RelationState } from '../lib/moderation';
import { CHAT_TEMPLATES, sendMessage } from '../lib/messages';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { removeReaction, setReaction } from '../lib/reactions';
import { uploadChatPhoto } from '../lib/storage';
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

  const listRef = useRef<FlatList>(null);

  const counterpartyId = useMemo(() => {
    if (!job || !user) return null;
    return resolveOtherId(job, user.id);
  }, [job, user]);

  // A job where the client is also the assigned worker (e.g. bid on your own
  // job), or a job with no resolvable second party at all (no one assigned) —
  // either way there's no one else to message. No quick templates in that case.
  const isSelfConversation = !!user && counterpartyId === user.id;

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
    setText('');
    setSending(true);
    const { data, error } = await sendMessage({
      jobId: params.jobId,
      senderId: user.id,
      content,
    });
    setSending(false);
    if (error) {
      await alertAsync('Could not send message', error.message);
      setText(content);
      return;
    }
    if (data) addLocal(data);
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
        right={
          canRehire && counterparty ? (
            <Pressable
              onPress={() =>
                (navigation as any).navigate('PostJob', {
                  hireWorkerId: counterparty.id,
                  hireWorkerName: counterparty.full_name ?? 'this worker',
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ChatBubble
                message={item}
                isOwn={item.sender_id === user?.id}
                senderName={counterparty?.full_name}
                senderAvatarUrl={counterparty?.avatar_url}
                reactions={reactionsByMessage[item.id]}
                onLongPress={() => setReactionTarget(item.id)}
              />
            )}
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
            {!isSelfConversation && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.templatesRow}
                contentContainerStyle={styles.templatesContent}
                keyboardShouldPersistTaps="handled"
              >
                {CHAT_TEMPLATES.map((template) => (
                  <Pressable
                    key={template}
                    style={styles.templateChip}
                    onPress={() => handleTemplate(template)}
                    disabled={sending}
                  >
                    <Text style={styles.templateText}>{template}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.inputRow}>
              {Platform.OS !== 'web' && (
                <Pressable onPress={pickFromCamera} style={styles.iconBtn} hitSlop={6}>
                  <Ionicons name="camera-outline" size={22} color={colors.primary} />
                </Pressable>
              )}
              <Pressable onPress={pickFromLibrary} style={styles.iconBtn} hitSlop={6}>
                <Ionicons name="image-outline" size={22} color={colors.primary} />
              </Pressable>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="Message…"
                placeholderTextColor={colors.textSubtle}
                multiline
              />
              <Pressable
                onPress={handleSendText}
                disabled={!text.trim() || sending}
                style={[
                  styles.sendBtn,
                  (!text.trim() || sending) && styles.sendBtnDisabled,
                ]}
              >
                <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
              </Pressable>
            </View>
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
  templatesRow: {
    flexGrow: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  templatesContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  templateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  templateText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
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
