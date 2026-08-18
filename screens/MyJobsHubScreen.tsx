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
  type Job,
} from '../lib/jobs';
import {
  deriveJobLifecycle,
  deriveMyJobsTab,
  myJobsNextAction,
  releaseDeadlineMs,
  type MyJobsTab,
} from '../lib/jobLifecycle';
import { effectiveOfferStatus, type PendingOffer } from '../lib/offers';
import { draftHasContent, loadPostJobDraft, type PostJobDraft } from '../lib/postJobDraft';
import type { MyJobsStackNavigation } from '../lib/navigation';
import { useMode } from '../modes';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

/** "Cleaning · Bushwick" — the same category+location line the browse feed's
 *  card shows, so one job reads identically on both surfaces. */
function metaLineFor(job: { category: string; location: string | null }): string {
  const label = JOB_CATEGORY_LABELS[job.category as keyof typeof JOB_CATEGORY_LABELS] ?? job.category;
  return job.location ? `${label} · ${job.location}` : label;
}

/**
 * Stage 4D tabs (operator decision): Active / Review / Closed, derived
 * through lib/jobLifecycle.ts — Review means work finished with the money
 * still HELD, and it empties when funds release. It never means star-ratings:
 * a completed-but-unrated job sits in Closed with "Leave a review" as its
 * next action.
 */
type Filter = MyJobsTab;

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Review', value: 'review' },
  { label: 'Closed', value: 'closed' },
];

function FilterTabs({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (filter: Filter) => void;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
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
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.countBadge}>
        <Text style={styles.countBadgeText}>{count}</Text>
      </View>
    </View>
  );
}

/** The settled-bid card's own next-action line — offer facts, not lifecycle. */
function bidNextAction(status: string, awaitingMe: boolean): string {
  if (awaitingMe) return 'Respond to the counteroffer';
  if (status === 'declined') return 'Not selected';
  if (status === 'expired') return 'Bid expired';
  return 'Awaiting response';
}

export function MyJobsHubScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { user } = useAuth();
  // Perspective comes from ModeContext — never a hand-passed prop (CLAUDE.md).
  // Worker mode: accepted work and the user's own bids, with no posting
  // affordance anywhere. Customer mode: posted jobs only.
  const { mode } = useMode();
  const isCustomer = mode === 'customer';
  const {
    posted,
    working,
    pendingBids,
    settledBids,
    payments,
    openDisputeJobIds,
    reviewedJobIds,
    names,
    loading,
    error,
    refresh,
  } = useMyJobsHub();
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);
  // The local, unpublished wizard draft (lib/postJobDraft). §H groups drafts
  // under Active — and this device's draft is real work worth resuming, even
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

  // One clock reading per data load: bucketing and the release countdowns all
  // derive from the same instant, so a card can't straddle two tabs.
  const nowMs = useMemo(
    () => Date.now(),
    [posted, working, pendingBids, settledBids, payments]
  );

  const lifecycleOf = useCallback(
    (job: Job) =>
      deriveJobLifecycle(
        {
          job,
          payment: payments[job.id] ?? null,
          hasOpenDispute: openDisputeJobIds.has(job.id),
        },
        nowMs
      ),
    [payments, openDisputeJobIds, nowMs]
  );

  const workingItems = useMemo(
    () => (isCustomer ? [] : working.filter((j) => deriveMyJobsTab(lifecycleOf(j)) === filter)),
    [isCustomer, working, filter, lifecycleOf]
  );
  const postedItems = useMemo(
    () => (isCustomer ? posted.filter((j) => deriveMyJobsTab(lifecycleOf(j)) === filter) : []),
    [isCustomer, posted, filter, lifecycleOf]
  );
  // Worker-side bids. Active carries the genuinely live ones; a pending row
  // past its deadline renders as expired (effectiveOfferStatus) and joins the
  // settled declined/expired rows under Closed. Review never holds bids —
  // that tab is about held money, and an unaccepted bid holds none.
  const bidItems =
    !isCustomer && filter === 'active'
      ? pendingBids.filter((bid) => effectiveOfferStatus(bid, nowMs) === 'pending')
      : [];
  const closedBidItems: PendingOffer[] =
    !isCustomer && filter === 'closed'
      ? [
          ...pendingBids.filter((bid) => effectiveOfferStatus(bid, nowMs) === 'expired'),
          ...settledBids,
        ]
      : [];
  const showDraft = isCustomer && filter === 'active' && draft != null;

  const isEmpty =
    workingItems.length === 0 &&
    postedItems.length === 0 &&
    bidItems.length === 0 &&
    closedBidItems.length === 0 &&
    !showDraft;

  function openPostJob() {
    navigation.navigate('PostJob');
  }

  const emptyText = isCustomer
    ? filter === 'active'
      ? 'Post a job to get started.'
      : filter === 'review'
        ? 'Nothing is waiting on your approval right now.'
        : 'Finished and cancelled jobs land here.'
    : filter === 'active'
      ? 'Accepted work and the bids you’ve placed show up here.'
      : filter === 'review'
        ? 'Work you’ve submitted for approval lands here until funds release.'
        : 'Finished work and settled bids land here.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerMark}>
          <Ionicons name="briefcase-outline" size={22} color={colors.onForest} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>YOUR WORK</Text>
          <Text style={styles.headerTitle}>My jobs</Text>
          <Text style={styles.headerSubtitle} numberOfLines={2}>
            {isCustomer
              ? 'Jobs you posted, from first bid to final review.'
              : 'Work you accepted and bids awaiting a response.'}
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
                <Text style={styles.emptyText}>{emptyText}</Text>
                {isCustomer ? (
                  <Pressable
                    onPress={openPostJob}
                    style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Post another job"
                  >
                    <Ionicons name="add" size={20} color={colors.onForest} />
                    <Text style={styles.primaryCtaText}>Post another job</Text>
                  </Pressable>
                ) : null}
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
                    title={filter === 'closed' ? 'Work history' : 'You’re working'}
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
                      nextAction={myJobsNextAction({
                        perspective: 'worker',
                        state: lifecycleOf(job),
                        reviewedByMe: reviewedJobIds.has(job.id),
                        releaseDeadline: releaseDeadlineMs(job),
                        nowMs,
                      })}
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
                        nextAction={myJobsNextAction({
                          perspective: 'customer',
                          state: lifecycleOf(job),
                          bidCount: job.bid_count,
                          reviewedByMe: reviewedJobIds.has(job.id),
                          releaseDeadline: releaseDeadlineMs(job),
                          nowMs,
                        })}
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
                    // Whose terms, whose move — from author_id/awaiting_id,
                    // never from worker_id (AUD-P1-01): a pending customer
                    // counter must read as requiring THIS user's response,
                    // not as their own bid quietly pending.
                    const awaitingMe =
                      effectiveOfferStatus(bid) === 'pending' &&
                      !!user &&
                      bid.awaiting_id === user.id &&
                      bid.author_id !== user.id;
                    const clientName = names[job.client_id] ?? 'Client';
                    // Incoming counter-offers are addressed by first name.
                    const clientFirstName =
                      clientName.trim().split(/\s+/)[0] || clientName;
                    return (
                      <HubCard
                        key={`bid-${bid.id}`}
                        icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                        category={job.category}
                        title={job.title}
                        subtitle={
                          awaitingMe
                            ? `${clientFirstName} sent you a Counteroffer — respond`
                            : `Client · ${clientName}`
                        }
                        thumbnailUrl={jobThumbnailUrl(job)}
                        metaLine={metaLineFor(job)}
                        timeLabel={formatTimeAgo(job.created_at)}
                        priceCents={bid.amount_cents}
                        priceLabel={
                          awaitingMe
                            ? 'Their counter:'
                            : bid.author_id === user?.id && bid.parent_offer_id
                              ? 'Your counter:'
                              : 'Your bid:'
                        }
                        status={bid.status}
                        statusLabel={awaitingMe ? 'Respond' : undefined}
                        nextAction={bidNextAction('pending', awaitingMe)}
                        onPress={() => navigation.navigate('JobDetail', { job })}
                      />
                    );
                  })}
                </View>
              )}

              {closedBidItems.length > 0 && (
                <View style={styles.section}>
                  <SectionHeading title="Settled bids" count={closedBidItems.length} />
                  {closedBidItems.map((bid) => {
                    if (!bid.job) return null;
                    const job = toOpenJob(bid.job);
                    const status = effectiveOfferStatus(bid, nowMs);
                    return (
                      <HubCard
                        key={`settled-${bid.id}`}
                        icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                        category={job.category}
                        title={job.title}
                        subtitle={`Client · ${names[job.client_id] ?? 'Client'}`}
                        thumbnailUrl={jobThumbnailUrl(job)}
                        metaLine={metaLineFor(job)}
                        timeLabel={formatTimeAgo(bid.created_at)}
                        priceCents={bid.amount_cents}
                        priceLabel="Your bid:"
                        status={status}
                        nextAction={bidNextAction(status, false)}
                        onPress={() => navigation.navigate('JobDetail', { job })}
                      />
                    );
                  })}
                </View>
              )}

              {isCustomer ? (
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
              ) : null}
            </>
          )}
        </ScrollView>
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
    color: colors.onForest,
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
  }),
);
