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
import { JOB_CATEGORY_ICONS, toOpenJob } from '../lib/jobs';
import type { MyJobsStackNavigation } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

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
                      title={job.title}
                      subtitle={`Client · ${names[job.client_id] ?? 'Client'}`}
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
                        title={job.title}
                        subtitle={worker}
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
                  {bidItems.map((bid) =>
                    bid.job ? (
                      <HubCard
                        key={`bid-${bid.id}`}
                        icon={
                          JOB_CATEGORY_ICONS[bid.job.category] ?? 'ellipsis-horizontal'
                        }
                        title={bid.job.title}
                        subtitle={`Client · ${names[bid.job.client_id] ?? 'Client'}`}
                        priceCents={bid.amount_cents}
                        priceLabel="Your bid:"
                        status={bid.status}
                        onPress={() =>
                          navigation.navigate('JobDetail', {
                            job: toOpenJob(bid.job),
                          })
                        }
                      />
                    ) : null
                  )}
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
    padding: spacing.lg,
    paddingTop: spacing.sm,
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
