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
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { ConversationRow } from '../components/ConversationRow';
import { ReportDialog } from '../components/ReportDialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import { resolveOtherId } from '../lib/conversations';
import { alertAsync, confirmAsync } from '../lib/dialog';
import {
  blockUser,
  muteUser,
  unblockUser,
  unmuteUser,
} from '../lib/moderation';
import type { MessagesStackNavigation } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

type SheetTarget = {
  userId: string;
  name: string;
  jobId: string;
  blocking: boolean;
  muted: boolean;
};

export function MessagesInboxScreen() {
  const navigation = useNavigation<MessagesStackNavigation>();
  const { user } = useAuth();
  const {
    conversations,
    readMap,
    profiles,
    lastMessageReactions,
    moderation,
    loading,
    error,
    refresh,
  } = useConversations();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [reportTarget, setReportTarget] = useState<SheetTarget | null>(null);

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
      const isMuted = moderation.muted.has(otherId);
      // Muted conversations still receive messages — they just don't raise the
      // unread indicator (the only "badge" this app currently has).
      const unread =
        !isMuted &&
        c.last_message_sender_id !== user.id &&
        (!lastReadAt || new Date(c.last_message_at) > new Date(lastReadAt));

      const baseName = other?.full_name ?? 'Someone';
      const jobCount = counterpartyJobCounts[otherId] ?? 1;

      return {
        jobId: c.job_id,
        otherId,
        isSelf,
        subtitle: isSelf
          ? null
          : jobCount > 1
          ? `${jobCount} jobs together`
          : c.job_title,
        name: isSelf ? `${baseName} (You)` : baseName,
        rawName: baseName,
        avatarUrl: other?.avatar_url ?? null,
        preview,
        lastMessageAt: c.last_message_at,
        unread,
        muted: isMuted,
        blocking: moderation.blocking.has(otherId),
      };
    });
  }, [conversations, profiles, readMap, lastMessageReactions, moderation, user]);

  async function toggleBlock(target: SheetTarget) {
    if (!user) return;
    setSheetTarget(null);

    if (target.blocking) {
      const { error } = await unblockUser(user.id, target.userId);
      if (error) await alertAsync('Could not unblock', error.message);
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
    if (error) await alertAsync('Could not block', error.message);
    await refresh();
  }

  async function toggleMute(target: SheetTarget) {
    if (!user) return;
    setSheetTarget(null);
    const { error } = target.muted
      ? await unmuteUser(user.id, target.userId)
      : await muteUser(user.id, target.userId);
    if (error) {
      await alertAsync(target.muted ? 'Could not unmute' : 'Could not mute', error.message);
    }
    await refresh();
  }

  const sheetItems: ActionSheetItem[] = sheetTarget
    ? [
        {
          key: 'mute',
          label: sheetTarget.muted ? 'Unmute' : 'Mute',
          icon: sheetTarget.muted ? 'notifications' : 'notifications-off-outline',
          onPress: () => toggleMute(sheetTarget),
        },
        {
          key: 'block',
          label: sheetTarget.blocking ? 'Unblock' : 'Block',
          icon: sheetTarget.blocking ? 'lock-open-outline' : 'ban-outline',
          destructive: !sheetTarget.blocking,
          onPress: () => toggleBlock(sheetTarget),
        },
        {
          key: 'report',
          label: 'Report',
          icon: 'flag-outline',
          destructive: true,
          onPress: () => {
            const target = sheetTarget;
            setSheetTarget(null);
            setReportTarget(target);
          },
        },
      ]
    : [];

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
              muted={item.muted}
              blocked={item.blocking}
              onPress={() => navigation.navigate('Chat', { jobId: item.jobId })}
              onLongPress={
                item.isSelf
                  ? undefined
                  : () =>
                      setSheetTarget({
                        userId: item.otherId,
                        name: item.rawName,
                        jobId: item.jobId,
                        blocking: item.blocking,
                        muted: item.muted,
                      })
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

      <ActionSheet
        visible={!!sheetTarget}
        title={sheetTarget?.name}
        subtitle="Manage this conversation"
        items={sheetItems}
        onClose={() => setSheetTarget(null)}
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
