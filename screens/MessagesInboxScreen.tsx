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
import { PhotoViewer } from '../components/PhotoViewer';
import { ReportDialog } from '../components/ReportDialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useConversations } from '../hooks/useConversations';
import {
  conversationKey,
  fetchActiveJobs,
  resolveOtherId,
  type ActiveJob,
  type Conversation,
} from '../lib/conversations';
import {
  groupThreadsByPerson,
  resolveActiveJob,
  type ActiveJobCandidate,
} from '../lib/conversationResolver';
import { fetchMyPendingOffers } from '../lib/offers';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  blockUser,
  muteUser,
  unblockUser,
  unmuteUser,
} from '../lib/moderation';
import type { MessagesStackNavigation } from '../lib/navigation';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

type SheetTarget = {
  userId: string;
  name: string;
  /** Null in a direct thread (phase36) — reporting there carries no job. */
  jobId: string | null;
  blocking: boolean;
  muted: boolean;
};

export function MessagesInboxScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
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
    }, [refresh, loadPending, loadActiveJobs])
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), loadActiveJobs()]);
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
      const isMuted = moderation.muted.has(otherId);

      // The preview is the newest message across ALL of this person's
      // threads, whichever one it happens to be in.
      const latest = person.latest;
      const reactions = lastMessageReactions[latest.last_message_id] ?? [];
      const reactionPrefix =
        reactions.length > 0 ? `${reactions.map((r) => r.emoji).join('')} ` : '';
      const isImage = !!latest.last_message_image_url;
      const isVoice = !!latest.last_message_audio_url;
      const preview = latest.last_message_unsent_at
        ? 'This message was unsent'
        : reactionPrefix +
          (isVoice
            ? 'Voice message'
            : isImage
            ? 'Photo sent'
            : latest.last_message_content || '…');

      // Unread and the waiting-offer badge are both folded across the whole
      // conversation: with one row per person, anything unanswered in ANY of
      // their threads has to surface on that row or nowhere.
      const unreadInThread = (thread: Conversation) => {
        // A direct thread keeps its read timestamp on the thread row itself
        // (see phase36), so it comes back on the conversation instead of from
        // the job-keyed message_reads map.
        const lastReadAt = thread.job_id ? readMap[thread.job_id] : thread.my_read_at;
        // Muted conversations still receive messages — they just don't raise
        // the unread indicator (the only "badge" this app currently has).
        return (
          !isMuted &&
          thread.last_message_sender_id !== user.id &&
          (!lastReadAt || new Date(thread.last_message_at) > new Date(lastReadAt))
        );
      };
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

      const baseName = other?.full_name ?? 'Someone';

      return {
        key: `person:${otherId}`,
        jobId: activeJob?.id ?? latest.job_id,
        otherId,
        isSelf,
        // No active job means no job to name. A neutral placeholder here is
        // what produced "N conversations together" — the line stays empty
        // instead of saying something that isn't about anything.
        subtitle: isSelf ? null : activeJob?.title ?? null,
        name: isSelf ? `${baseName} (You)` : baseName,
        rawName: baseName,
        avatarUrl: other?.avatar_url ?? null,
        preview,
        lastMessageAt: latest.last_message_at,
        unread: person.threads.some(unreadInThread),
        muted: isMuted,
        blocking: moderation.blocking.has(otherId),
        awaitingRequest: person.threads.some(awaitingInThread),
      };
    });
  }, [
    conversations,
    profiles,
    readMap,
    lastMessageReactions,
    moderation,
    user,
    pendingByThread,
    activeJobs,
  ]);

  async function toggleBlock(target: SheetTarget) {
    if (!user) return;
    setSheetTarget(null);

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

  async function toggleMute(target: SheetTarget) {
    if (!user) return;
    setSheetTarget(null);
    const { error } = target.muted
      ? await unmuteUser(user.id, target.userId)
      : await muteUser(user.id, target.userId);
    if (error) {
      await alertAsync(target.muted ? 'Could not unmute' : 'Could not mute', userMessage(error));
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

      {/* useConversations is a LOCKED hook and still stores the raw message;
          the wrap happens here at the render seam instead (raw-error sweep,
          2026-08-10 — see docs/LOCKED_FILE_PATCHES.md). */}
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
              subtitle={item.subtitle}
              preview={item.preview}
              lastMessageAt={item.lastMessageAt}
              unread={item.unread}
              muted={item.muted}
              blocked={item.blocking}
              awaitingRequest={item.awaitingRequest}
              // Keyed by the PERSON, not by one of their threads: the row is
              // the whole conversation and Chat merges it either way.
              onPress={() => navigation.navigate('Chat', { counterpartyId: item.otherId })}
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
              onLongPressAvatar={
                item.avatarUrl ? () => setAvatarUri(item.avatarUrl) : undefined
              }
            />
          )}
          contentContainerStyle={
            rows.length === 0
              ? styles.emptyContainer
              : // A handful of rows with the default padding left most of the
                // screen bare below them — reads as broken, not "caught up".
                // Roomier padding/gap between rows (not centering the group —
                // that read as an empty/broken state instead of a real,
                // short list) makes it read as deliberately minimal.
              rows.length <= 3
              ? styles.sparseContent
              : styles.listContent
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
    gap: spacing.md,
  },
  sparseContent: {
    // No flexGrow/justifyContent — that centered the row group as a block,
    // which reads as an empty/broken state, not a short real list. Rows stay
    // top-anchored under the header; the "generous" part is just more
    // padding/gap than the normal listContent uses.
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 0,
    gap: spacing.lg,
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
  }),
);
