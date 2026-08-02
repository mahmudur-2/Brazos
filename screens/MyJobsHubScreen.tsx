import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { HubCard } from '../components/HubCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import {
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  toOpenJob,
} from '../lib/jobs';
import type { MyJobsStackNavigation } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

/** "Cleaning · Bushwick" — the same category+location line the browse feed's
 *  card shows, so one job reads identically on both surfaces. */
function metaLineFor(job: { category: string; location: string | null }): string {
  const label = JOB_CATEGORY_LABELS[job.category as keyof typeof JOB_CATEGORY_LABELS] ?? job.category;
  return job.location ? `${label} · ${job.location}` : label;
}

type Filter = 'active' | 'in_progress' | 'completed';

const FILTERS = [
  { label: 'Active', value: 'active' as const },
  { label: 'In Progress', value: 'in_progress' as const },
  { label: 'Completed', value: 'completed' as const },
];

function matchesFilter(status: string, filter: Filter): boolean {
  if (filter === 'active') return status === 'open' || status === 'assigned';
  if (filter === 'in_progress') return status === 'in_progress';
  return status === 'completed' || status === 'cancelled';
}

export function MyJobsHubScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { posted, working, pendingBids, names, loading, error, refresh } = useMyJobsHub();
  const [filter, setFilter] = useState<Filter>('active');
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

  const workingItems = useMemo(
    () => working.filter((j) => matchesFilter(j.status, filter)),
    [working, filter]
  );
  const postedItems = useMemo(
    () => posted.filter((j) => matchesFilter(j.status, filter)),
    [posted, filter]
  );
  // Pending bids are only relevant in the Active view.
  const bidItems = filter === 'active' ? pendingBids : [];

  const isEmpty =
    workingItems.length === 0 && postedItems.length === 0 && bidItems.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="My Jobs" />

      <View style={styles.filterBar}>
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {isEmpty ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="briefcase-outline" size={32} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>
                {filter === 'active'
                  ? 'Post a job or place a bid to get started.'
                  : filter === 'in_progress'
                  ? 'Jobs show up here once work has actually started.'
                  : 'Jobs show up here once they’re completed or cancelled.'}
              </Text>
            </View>
          ) : (
            <>
              {workingItems.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>You’re working</Text>
                  {workingItems.map((job) => (
                    <HubCard
                      key={`work-${job.id}`}
                      icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                      category={job.category}
                      title={job.title}
                      subtitle={`Client · ${names[job.client_id] ?? 'Client'}`}
                      thumbnailUrl={jobThumbnailUrl(job)}
                      metaLine={metaLineFor(job)}
                      timeLabel={formatTimeAgo(job.created_at)}
                      priceCents={job.final_amount_cents ?? job.budget_cents}
                      status={job.status}
                      onPress={() =>
                        navigation.navigate('WorkerJob', { jobId: job.id })
                      }
                    />
                  ))}
                </View>
              )}

              {postedItems.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>You posted</Text>
                  {postedItems.map((job) => {
                    const worker = job.assigned_worker_id
                      ? `Worker · ${names[job.assigned_worker_id] ?? 'Worker'}`
                      : job.bid_count > 0
                      ? `${job.bid_count} ${job.bid_count === 1 ? 'bid' : 'bids'}`
                      : 'Awaiting bids';
                    return (
                      <HubCard
                        key={`posted-${job.id}`}
                        icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                        category={job.category}
                        title={job.title}
                        subtitle={worker}
                        thumbnailUrl={jobThumbnailUrl(job)}
                        metaLine={metaLineFor(job)}
                        timeLabel={formatTimeAgo(job.created_at)}
                        priceCents={job.final_amount_cents ?? job.budget_cents}
                        status={job.status}
                        onPress={() =>
                          navigation.navigate('ClientJobDetail', { job })
                        }
                      />
                    );
                  })}
                </View>
              )}

              {bidItems.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Pending bids</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>
                        {bidItems.length} waiting
                      </Text>
                    </View>
                  </View>
                  {bidItems.map((bid) => {
                    if (!bid.job) return null;
                    // Normalized once so the card and the screen it opens are
                    // built from the same row, not two different readings of it.
                    const job = toOpenJob(bid.job);
                    return (
                      <HubCard
                        key={`bid-${bid.id}`}
                        icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                        category={job.category}
                        title={job.title}
                        subtitle={`Client · ${names[job.client_id] ?? 'Client'}`}
                        thumbnailUrl={jobThumbnailUrl(job)}
                        metaLine={metaLineFor(job)}
                        timeLabel={formatTimeAgo(job.created_at)}
                        priceCents={bid.amount_cents}
                        priceLabel="Your bid:"
                        status={bid.status}
                        onPress={() => navigation.navigate('JobDetail', { job })}
                      />
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 0,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  countBadge: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl * 2,
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
    maxWidth: 280,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    fontSize: 14,
  },
});
