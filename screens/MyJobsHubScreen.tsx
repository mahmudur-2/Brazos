import { useCallback, useMemo, useState } from 'react';
import { useScrollClearance } from '../ui/primitives';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EntranceView } from '../components/EntranceView';
import { useEntered } from '../hooks/useEntrance';
import { ScreenHeader } from '../components/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { HubCard } from '../components/HubCard';
import { SegmentedControl } from '../components/SegmentedControl';
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
  jobPillLabel,
  myJobsNextAction,
  releaseDeadlineMs,
  type MyJobsTab,
} from '../lib/jobLifecycle';
import { effectiveOfferStatus, type PendingOffer } from '../lib/offers';
import { clearPostJobDraft } from '../lib/postJobDraft';
import { deleteJobPhoto } from '../lib/storage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DraftCard } from '../components/DraftCard';
import { usePostJobDraft } from '../hooks/usePostJobDraft';
import type { MyJobsStackNavigation } from '../lib/navigation';
import { useMode } from '../modes';
import { goBackOrHome } from '../lib/navigationRef';
import { useDialNumber } from '../lib/designOverrides';
import {
  EYEBROW_TYPE,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  withAlpha,
  screenGround,
} from '../lib/theme';
import { formatTimeAgo } from '../lib/time';
import { STATE_COPY, ScreenStateView, type ScreenState } from '../ui/templates/ScreenStates';
import { postedCardLive } from '../lib/liveJobStatus';

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

/** The hub's first read: the shared spinner, with the hub's own line under it (E7). */
const HUB_LOADING = { kind: 'loading', variant: 'spinner', label: 'Loading your jobs…' } as const satisfies ScreenState;

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
  // RUN T2 (C4) — the segmented bar is this screen's signature control, and
  // both of its numbers were unreachable. They fall back to what this file
  // drew, spelled here and nowhere else. 2026-09-27 (the operator's review):
  // the bar is the shared Lux segment (components/SegmentedControl.tsx) — the
  // mint-filled pill in the glass track — at its 48pt, pill-cornered; the two
  // dials still reach it.
  const tabsHeight = useDialNumber('myJobs.tabs.height') ?? 52;
  // 26 is half the 52pt track: the pill. A dial in 0..40 cannot say "pill".
  const tabsRadius = useDialNumber('myJobs.tabs.radius') ?? 26;
  return (
    <SegmentedControl
      options={FILTERS}
      value={value}
      onChange={onChange}
      height={tabsHeight}
      radius={tabsRadius}
    />
  );
}

function SectionHeading({ title, count, gold = false }: { title: string; count: number; gold?: boolean }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // 2026-09-27 (the operator's review, the Lux `.sect` + `.badge`): the count
  // sits right beside its label, not across the row.
  return (
    <View style={styles.sectionHeaderRow}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, gold && styles.sectionTitleGold]}>{title}</Text>
      <View style={[styles.countBadge, isDark && styles.countBadgeDark]}>
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
  // 2026-09-30: the tab bar floats over this screen; the list ends above the pill.
  const navClearance = useScrollClearance();
  const { palette: colors, isDark } = useThemeColors();
  // Forest reads near-black on a dark surface under palette v2; masters
  // 35/36/37 draw these accents gold.
  const accent = isDark ? colors.gold : colors.forest;
  const styles = stylesFor(colors);
  // RUN T2 (C4) — this screen's own three, on the `theme.*` scale because this
  // file imports spacing/radius from lib/theme.
  const contentGap = useDialNumber('myJobs.content.gap') ?? spacing.xl;
  const emptyPaddingY = useDialNumber('myJobs.empty.paddingY') ?? spacing.xxl;
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
    refreshIfStale,
  } = useMyJobsHub();
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);
  // The local, unpublished wizard draft (lib/postJobDraft). §H groups drafts
  // under Active — and this device's draft is real work worth resuming, even
  // though it has no jobs row yet. Empty autosaves don't count as a draft.
  // 2026-09-28 (LUX-LIST-64 #17): read by the one hook the Home's card uses too.
  const { draft, setDraft } = usePostJobDraft();
  // M-7 — backing out of the wizard keeps a draft with content, so this card
  // carries the one explicit delete. Its media was never published and
  // belongs to no job, so it goes with it.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  async function discardDraft() {
    const userId = user?.id;
    if (!userId || !draft) return;
    setDiscarding(true);
    await Promise.all([...draft.photos, ...draft.videos].map((url) => deleteJobPhoto(url)));
    await clearPostJobDraft(userId);
    setDiscarding(false);
    setConfirmDiscard(false);
    setDraft(null);
  }

  // F13: a focus reads only when the cached hub is stale or last failed;
  // pull-to-refresh below always reads.
  useFocusEffect(
    useCallback(() => {
      refreshIfStale();
    }, [refreshIfStale])
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
  // FIX-RUN F12: the sections arrive in order, once (hooks/useEntrance.ts useEntered).
  const hubEntered = useEntered(workingItems.length + postedItems.length + bidItems.length + closedBidItems.length > 0);
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

  // 2026-09-26 (the refresh, audit M-28) — an empty tab teaches the one step
  // it holds, in one sentence, and says only what the product does: posting
  // is free, the charge comes when you hire, and the held payment waits here
  // for your approval.
  const emptyText = isCustomer
    ? filter === 'active'
      ? 'Post a job — you’re only charged when you hire someone.'
      : filter === 'review'
        ? 'When a worker finishes, the held payment waits here for your approval.'
        : 'Finished and cancelled jobs land here.'
    : filter === 'active'
      ? 'Accepted work and the bids you’ve placed show up here.'
      : filter === 'review'
        ? 'Work you’ve submitted for approval lands here until funds release.'
        : 'Finished work and settled bids land here.';

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* M-9 — the customer's My Jobs is a hidden tab reached from Home and
          the [+] sheet, so it has a way back. 2026-09-28 (LUX-LIST-64 #22):
          the shared header — the round back button, "My Jobs" centred on its
          row at 17, no line under it. The worker's My Jobs is a real tab: a
          tab root's big left title (#27), its one line kept. */}
      {isCustomer ? (
        <ScreenHeader title="My Jobs" onBack={goBackOrHome} />
      ) : (
        <ScreenHeader title="My Jobs" subtitle="Accepted work and open bids." largeTitle />
      )}

      <View style={styles.filterBar}>
        <FilterTabs value={filter} onChange={setFilter} />
      </View>

      {loading ? (
        <ScreenStateView state={HUB_LOADING} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { gap: contentGap, paddingBottom: navClearance }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={accent}
              colors={[accent]}
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
                <Text style={styles.retryText}>{refreshing ? 'Trying…' : STATE_COPY.retry}</Text>
              </Pressable>
            </View>
          ) : null}

          {isEmpty ? (
            error ? null : (
              <View style={[styles.empty, { paddingVertical: emptyPaddingY }]}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="briefcase-outline" size={34} color={accent} />
                </View>
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyText}>{emptyText}</Text>
                {/* 2026-09-28 (LUX-LIST-64 #44): only an account with no jobs at all
                    gets a button here — "Post a job"; a tab that is merely empty
                    does not, and no "Post another job" is left anywhere. */}
                {isCustomer && posted.length === 0 && !draft ? (
                  <Pressable
                    onPress={openPostJob}
                    style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Post a job"
                  >
                    <Ionicons name="add" size={20} color={colors.onForest} />
                    <Text style={styles.primaryCtaText}>Post a job</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          ) : (
            <>
              {showDraft && draft ? (
                <View style={styles.section}>
                  <SectionHeading title="Draft" count={1} gold />
                  <DraftCard draft={draft} onPress={openPostJob} />
                  <Pressable
                    onPress={() => setConfirmDiscard(true)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.draftDiscard, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Discard draft"
                  >
                    <Text style={styles.draftDiscardText}>Discard draft</Text>
                  </Pressable>
                </View>
              ) : null}

              {workingItems.length > 0 && (
                <EntranceView index={0} skip={hubEntered}>
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
                      subtitle={names[job.client_id] ?? 'Customer'}
                      thumbnailUrl={jobThumbnailUrl(job)}
                      metaLine={metaLineFor(job)}
                      timeLabel={formatTimeAgo(job.created_at)}
                      priceCents={job.final_amount_cents ?? job.budget_cents}
                      // A7 (2026-10-03): the figure is named — the agreed price once hired, else the
                      // customer's budget — so it is never read as the take, which the job screen
                      // shows as "You get" off the ledger row.
                      priceLabel={job.final_amount_cents != null ? 'Agreed price:' : 'Budget:'}
                      status={job.status}
                      statusLabel={jobPillLabel(lifecycleOf(job), payments[job.id]?.status)}
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
                </EntranceView>
              )}

              {postedItems.length > 0 && (
                <EntranceView index={1} skip={hubEntered}>
                <View style={styles.section}>
                  <SectionHeading title="You posted" count={postedItems.length} />
                  {postedItems.map((job) => {
                    // 2026-09-28 (LUX-LIST-64 #19): the person's name alone.
                    const worker = job.assigned_worker_id
                      ? names[job.assigned_worker_id] ?? 'Worker'
                      : job.bid_count > 0
                      ? `${job.bid_count} ${job.bid_count === 1 ? 'bid' : 'bids'} received`
                      : 'Awaiting bids';
                    const state = lifecycleOf(job);
                    // #45: the rail, the chat words and the held note — the one
                    // rule the Home's cards read too (lib/liveJobStatus.ts).
                    const { live, chatLabel, moneyNote } = postedCardLive({
                      job,
                      state,
                      paymentStatus: payments[job.id]?.status,
                      workerName: job.assigned_worker_id ? names[job.assigned_worker_id] : null,
                      nowMs,
                    });
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
                        statusLabel={jobPillLabel(state, payments[job.id]?.status)}
                        live={live}
                        onChat={live ? () => navigation.navigate('Chat', { jobId: job.id }) : undefined}
                        chatLabel={chatLabel}
                        moneyNote={moneyNote}
                        nextAction={myJobsNextAction({
                          perspective: 'customer',
                          state,
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
                </EntranceView>
              )}

              {bidItems.length > 0 && (
                <EntranceView index={2} skip={hubEntered}>
                <View style={styles.section}>
                  <SectionHeading title="Pending bids" count={bidItems.length} gold />
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
                    const clientName = names[job.client_id] ?? 'Customer';
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
                            ? `${clientFirstName} sent you a counter-offer — respond`
                            : clientName
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
                </EntranceView>
              )}

              {closedBidItems.length > 0 && (
                <EntranceView index={3} skip={hubEntered}>
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
                        subtitle={names[job.client_id] ?? 'Customer'}
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
                </EntranceView>
              )}

            </>
          )}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmDiscard}
        title="Discard this draft?"
        message="Its text and photos are deleted from Brazos. Workers never saw it."
        confirmText="Discard"
        destructive
        loading={discarding}
        onConfirm={() => void discardDraft()}
        onCancel={() => setConfirmDiscard(false)}
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
  filterBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  // 2026-09-27 (the operator's review): the segmented bar's own styles are
  // gone — it is the shared Lux segment (components/SegmentedControl.tsx).
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    // MainTabs already reserves the safe tab-bar height. Adding another
    // bottom inset here creates a visible dead strip above that bar.
    paddingBottom: 0,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Masters 35/36: each section is a gold small-caps eyebrow beside a sage
  // pill whose count reads green.
  sectionTitleGold: { color: colors.eyebrowGold }, // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
  sectionTitle: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  // The Lux `.badge`: 22 tall, the mint at .14 in dark, the count in mint.
  countBadge: {
    minWidth: 22,
    height: 22,
    backgroundColor: colors.mint,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeDark: {
    backgroundColor: withAlpha(colors.emerald, 0.14),
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
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
  draftDiscard: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  draftDiscardText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
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
