import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { useAuth } from '../hooks/useAuth';
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import {
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  toOpenJob,
} from '../lib/jobs';
import { draftHasContent, loadPostJobDraft, type PostJobDraft } from '../lib/postJobDraft';
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
  // This bucket also retains cancelled jobs as history, so "Closed" is the
  // truthful label without changing the existing filter semantics.
  { label: 'Closed', value: 'completed' as const },
];

function matchesFilter(status: string, filter: Filter): boolean {
  if (filter === 'active') return status === 'open' || status === 'assigned';
  if (filter === 'in_progress') return status === 'in_progress';
  return status === 'completed' || status === 'cancelled';
}

function FilterTabs({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (filter: Filter) => void;
}) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {FILTERS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.countBadge}>
        <Text style={styles.countBadgeText}>{count}</Text>
      </View>
    </View>
  );
}

export function MyJobsHubScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { user } = useAuth();
  const { posted, working, pendingBids, names, loading, error, refresh } = useMyJobsHub();
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);
  // The local, unpublished wizard draft (lib/postJobDraft). §H groups drafts
  // under Open — and this device's draft is real work worth resuming, even
  // though it has no jobs row yet. Empty autosaves don't count as a draft.
  const [draft, setDraft] = useState<PostJobDraft | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      let active = true;
      // The draft slot is per account (AUD-P1-07): no signed-in user, no
      // draft card — never another account's leftovers.
      const userId = user?.id;
      if (userId) {
        loadPostJobDraft(userId).then((d) => {
          if (active) setDraft(d && draftHasContent(d) ? d : null);
        });
      } else {
        setDraft(null);
      }
      return () => {
        active = false;
      };
    }, [refresh, user?.id])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
  const showDraft = filter === 'active' && draft != null;

  const isEmpty =
    workingItems.length === 0 &&
    postedItems.length === 0 &&
    bidItems.length === 0 &&
    !showDraft;

  function openPostJob() {
    navigation.navigate('PostJob');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerMark}>
          <Ionicons name="briefcase-outline" size={22} color={colors.onPrimary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>YOUR WORK</Text>
          <Text style={styles.headerTitle}>My jobs</Text>
          <Text style={styles.headerSubtitle} numberOfLines={2}>
            Jobs you posted, work you accepted, and bids awaiting a response.
          </Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        <FilterTabs value={filter} onChange={setFilter} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.forest} />
          <Text style={styles.loadingText}>Loading your jobs…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.forest}
              colors={[colors.forest]}
            />
          }
        >
          {error ? (
            <View style={styles.errorCard} accessibilityRole="alert">
              <View style={styles.errorIcon}>
                <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorTitle}>Couldn’t refresh your jobs</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
              <Pressable
                onPress={() => void onRefresh()}
                disabled={refreshing}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Try loading jobs again"
              >
                <Text style={styles.retryText}>{refreshing ? 'Trying…' : 'Retry'}</Text>
              </Pressable>
            </View>
          ) : null}

          {isEmpty ? (
            error ? null : (
              <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="briefcase-outline" size={34} color={colors.forest} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>
                {filter === 'active'
                  ? 'Post a job or place a bid to get started.'
                  : filter === 'in_progress'
                  ? 'Jobs show up here once work has actually started.'
                  : 'Jobs show up here once they’re completed or cancelled.'}
              </Text>
              <Pressable
                onPress={openPostJob}
                style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Post another job"
              >
                <Ionicons name="add" size={20} color={colors.onPrimary} />
                <Text style={styles.primaryCtaText}>Post another job</Text>
              </Pressable>
              </View>
            )
          ) : (
            <>
              {showDraft && draft ? (
                <View style={styles.section}>
                  <SectionHeading title="Draft" count={1} />
                  <Pressable
                    onPress={openPostJob}
                    style={({ pressed }) => [styles.draftCard, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Resume your job draft"
                  >
                    <View style={styles.draftIcon}>
                      <Ionicons name="create-outline" size={20} color={colors.forest} />
                    </View>
                    <View style={styles.draftCopy}>
                      <Text style={styles.draftEyebrow}>NOT PUBLISHED YET</Text>
                      <Text style={styles.draftTitle} numberOfLines={1}>
                        {draft.title.trim() || 'Untitled job'}
                      </Text>
                      <Text style={styles.draftMeta} numberOfLines={1}>
                        Resume where you left off — workers can’t see it until you publish.
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={18} color={colors.forest} />
                  </Pressable>
                </View>
              ) : null}

              {workingItems.length > 0 && (
                <View style={styles.section}>
                  <SectionHeading
                    title={filter === 'completed' ? 'Work history' : 'You’re working'}
                    count={workingItems.length}
                  />
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
                  <SectionHeading title="You posted" count={postedItems.length} />
                  {postedItems.map((job) => {
                    const worker = job.assigned_worker_id
                      ? `Worker · ${names[job.assigned_worker_id] ?? 'Worker'}`
                      : job.bid_count > 0
                      ? `${job.bid_count} ${job.bid_count === 1 ? 'bid' : 'bids'} received`
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
                  <SectionHeading title="Pending bids" count={bidItems.length} />
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

              <Pressable
                onPress={openPostJob}
                style={({ pressed }) => [styles.postAnother, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Post another job"
              >
                <View style={styles.postAnotherIcon}>
                  <Ionicons name="add" size={20} color={colors.forest} />
                </View>
                <Text style={styles.postAnotherText}>Post another job</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.forest} />
              </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerMark: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.emerald,
  },
  headerTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.ink,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  filterBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  tabs: {
    minHeight: 50,
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
  },
  tab: {
    minHeight: 44,
    flex: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  tabSelected: {
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  tabLabelSelected: {
    color: colors.forest,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    // MainTabs already reserves the safe tab-bar height. Adding another
    // bottom inset here creates a visible dead strip above that bar.
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
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  countBadge: {
    minWidth: 30,
    height: 30,
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.forest,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  primaryCta: {
    minHeight: 52,
    minWidth: 220,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryCtaText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  draftCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.forest,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  draftIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftCopy: {
    flex: 1,
    gap: 2,
  },
  draftEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.emerald,
  },
  draftTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  draftMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  postAnother: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.mint2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  postAnotherIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAnotherText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.forest,
  },
  errorCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  errorIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCopy: {
    flex: 1,
    gap: 2,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.danger,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.danger,
  },
  retryButton: {
    minWidth: 60,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.danger,
  },
  pressed: {
    opacity: 0.82,
  },
});
