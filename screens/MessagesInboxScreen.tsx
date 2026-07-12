import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ConversationRow } from '../components/ConversationRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { resolveOtherId } from '../lib/conversations';
import type { MessagesStackNavigation } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

export function MessagesInboxScreen() {
  const navigation = useNavigation<MessagesStackNavigation>();
  const { user } = useAuth();
  const {
    conversations,
    readMap,
    profiles,
    lastMessageReactions,
    loading,
    error,
    refresh,
  } = useConversations();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const rows = useMemo(() => {
    if (!user) return [];

    // Count conversations per counterparty first, so a job title that would
    // be ambiguous (same person, several jobs) can fall back to a neutral
    // summary instead of naming just one of them.
    const counterpartyJobCounts: Record<string, number> = {};
    for (const c of conversations) {
      const otherId = resolveOtherId(c, user.id);
      counterpartyJobCounts[otherId] = (counterpartyJobCounts[otherId] ?? 0) + 1;
    }

    return conversations.map((c) => {
      // If the job has no assigned worker (or otherwise no resolvable second
      // party — e.g. test data inserted directly), there's no one else in
      // this thread either, so it's treated the same as messaging yourself.
      const otherId = resolveOtherId(c, user.id);
      const other = profiles[otherId];
      const isSelf = otherId === user.id;
      const reactions = lastMessageReactions[c.last_message_id] ?? [];
      const reactionPrefix =
        reactions.length > 0 ? `${reactions.map((r) => r.emoji).join('')} ` : '';
      const isImage = !!c.last_message_image_url;
      const preview =
        reactionPrefix + (isImage ? 'Photo sent' : c.last_message_content || '…');
      const lastReadAt = readMap[c.job_id];
      const unread =
        c.last_message_sender_id !== user.id &&
        (!lastReadAt || new Date(c.last_message_at) > new Date(lastReadAt));

      const baseName = other?.full_name ?? 'Someone';
      const jobCount = counterpartyJobCounts[otherId] ?? 1;

      return {
        jobId: c.job_id,
        // Self-chats never show a job label; otherwise fall back to a
        // neutral count when the same person has more than one job thread.
        subtitle: isSelf
          ? null
          : jobCount > 1
          ? `${jobCount} jobs together`
          : c.job_title,
        name: isSelf ? `${baseName} (You)` : baseName,
        avatarUrl: other?.avatar_url ?? null,
        preview,
        lastMessageAt: c.last_message_at,
        unread,
      };
    });
  }, [conversations, profiles, readMap, user]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Messages" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.jobId}
          renderItem={({ item }) => (
            <ConversationRow
              name={item.name}
              avatarUrl={item.avatarUrl}
              subtitle={item.subtitle}
              preview={item.preview}
              lastMessageAt={item.lastMessageAt}
              unread={item.unread}
              onPress={() =>
                navigation.navigate('Chat', { jobId: item.jobId })
              }
            />
          )}
          contentContainerStyle={
            rows.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={32} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Conversations start once a bid is accepted.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    padding: spacing.lg,
    gap: spacing.md,
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
    fontSize: 18,
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
});
