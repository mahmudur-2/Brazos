import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollClearance } from '../ui/primitives';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ConversationRow } from '../components/ConversationRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import {
  clearedBy,
  conversationKey,
  conversationPreviewText,
  conversationTarget,
  resolveOtherId,
  threadUnread,
  type Conversation,
} from '../lib/conversations';
import { foldConversationStates, setConversationStateForAll } from '../lib/conversationStates';
import { groupThreadsByPerson } from '../lib/conversationResolver';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import type { MessagesStackNavigation } from '../lib/navigation';
import { goBackOrHome } from '../lib/navigationRef';
import {
  fonts,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  screenGround,
} from '../lib/theme';

/**
 * THE CONVERSATIONS BEHIND THE DEVICE PROMPT (phase77 HIDDEN_CHATS).
 *
 * REACHED ONE WAY ONLY: the foot row on the inbox, after
 * expo-local-authentication has returned success. This screen does not
 * authenticate — it is pushed by something that already did — and it carries
 * no params, because which conversations are hidden is a live fact and a route
 * param would be a snapshot of it.
 *
 * WHY IT IS A SMALLER LIST THAN THE INBOX. This is a way back INTO a
 * conversation, not a second inbox: no filter pills, no swipe actions, no
 * job-context eyebrow and no waiting-request badge. What it does share with
 * the inbox it shares by IMPORT, not by copy — groupThreadsByPerson folds the
 * threads, foldConversationStates decides what is hidden, clearedBy decides
 * what is still in this user's copy, and conversationPreviewText /
 * threadUnread write the row's two derived lines. A second implementation of
 * any of those would let this list and the inbox disagree about the same
 * conversation (the P3-31 discipline).
 *
 * UNHIDING IS A LONG PRESS, and it is the only action here. Without it hiding
 * would be one-way, which is a trap rather than a feature.
 */
export function HiddenChatsScreen() {
  // 2026-09-30: the tab bar floats over this screen; the list ends above the pill.
  const navClearance = useScrollClearance();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
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

  const rows = useMemo(() => {
    if (!user) return [];

    const people = groupThreadsByPerson(conversations, (c) => ({
      counterpartyId: resolveOtherId(c, user.id),
      jobId: c.job_id,
      directThreadId: c.direct_thread_id,
      lastMessageAt: c.last_message_at,
    }));

    return people
      .map((person) => {
        const otherId = person.counterpartyId;
        const state = foldConversationStates(
          person.threads.map((thread) => ({
            key: conversationKey(thread),
            lastMessageAt: thread.last_message_at,
          })),
          stateByKey
        );

        const liveThreads = person.threads.filter(
          (thread) => !clearedBy(thread.last_message_at, stateByKey[conversationKey(thread)])
        );
        const latest = liveThreads.reduce<Conversation | null>(
          (best, thread) =>
            !best || thread.last_message_at > best.last_message_at ? thread : best,
          null
        );
        const reactions = latest ? lastMessageReactions[latest.last_message_id] ?? [] : [];
        const isMuted = moderation.muted.has(otherId);
        const other = profiles[otherId];

        return {
          key: `person:${otherId}`,
          otherId,
          hidden: state.hidden,
          deleted: state.deleted,
          targets: person.threads.map(conversationTarget),
          name: other?.full_name ?? 'Someone',
          avatarUrl: other?.avatar_url ?? null,
          preview: latest
            ? conversationPreviewText(latest, reactions.map((r) => r.emoji))
            : '…',
          lastMessageAt: (latest ?? person.latest).last_message_at,
          unread: !isMuted && liveThreads.some((t) => threadUnread(t, user.id, readMap)),
          muted: isMuted,
          blocking: moderation.blocking.has(otherId),
        };
      })
      // A deleted conversation is out of every list, this one included — the
      // same D7 reading the inbox applies.
      .filter((row) => row.hidden && !row.deleted);
  }, [
    conversations,
    profiles,
    readMap,
    stateByKey,
    lastMessageReactions,
    moderation,
    user,
  ]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function unhide(row: (typeof rows)[number]) {
    const ok = await confirmAsync({
      title: `Unhide ${row.name}?`,
      message: 'This conversation goes back into your inbox.',
      confirmText: 'Unhide',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    const { error: unhideError } = await setConversationStateForAll(row.targets, {
      hidden: false,
    });
    if (unhideError) await alertAsync('Could not unhide', userMessage(unhideError));
    await refresh();
  }

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader
        title="Hidden Chats"
        subtitle="Unlocked for this visit"
        onBack={goBackOrHome}
      />

      {error ? <Text style={styles.error}>{userMessage(error)}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <ConversationRow
              name={item.name}
              avatarUrl={item.avatarUrl}
              preview={item.preview}
              lastMessageAt={item.lastMessageAt}
              unread={item.unread}
              muted={item.muted}
              blocked={item.blocking}
              onPress={() => navigation.navigate('Chat', { counterpartyId: item.otherId })}
              onLongPress={() => unhide(item)}
              accessibilityHint="Press and hold to unhide"
            />
          )}
          // 2026-09-28 (LUX-LIST-64 #54): the Inbox's clean list — a hairline
          // between rows, no card gap.
          ItemSeparatorComponent={() => (
            <View style={[styles.rowRule, { backgroundColor: withAlpha(colors.inboxRule, isDark ? 0.11 : 1) }]} />
          )}
          contentContainerStyle={[
            rows.length === 0 ? styles.emptyContainer : styles.listContent,
            { paddingBottom: navClearance },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="lock-open-outline"
                  size={32}
                  color={isDark ? colors.gold : colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>Nothing hidden</Text>
              <Text style={styles.emptyText}>
                Conversations you mark as hidden appear here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    rowRule: {
      height: 1,
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
  })
);
