import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryGlyph } from '../components/CategoryGlyph';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import {
  acceptOfferActionLabel,
  acceptOfferConfirmText,
  acceptOfferConfirmTitle,
  firstNameOf,
} from '../lib/offerCopy';
import { OfferCard } from '../components/OfferCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { HeldPulse, ReleasedTick } from '../components/MoneyMoment';
import { JobOwnerActions } from '../components/JobOwnerActions';
import { JobProgress } from '../components/JobProgress';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useJobOffers } from '../hooks/useJobOffers';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { fetchProfileById, type Profile } from '../lib/profiles';
import {
  canOfferJobFunding,
  fetchJobPaymentState,
  isHeld,
  isReleased,
  isReleaseRequested,
  quoteJobPrice,
  type JobPriceQuote,
  type Payment,
} from '../lib/payments';
import { customerChargeCents } from '../lib/paymentRules';
import { paymentsMode } from '../lib/adapters/payments';
import { fetchRemoteConfig } from '../lib/remoteConfig';
import { DISPUTE_REASON_LABELS, fetchOpenJobDispute, type JobDispute } from '../lib/disputes';
import { MoneyText } from '../ui/primitives/MoneyText';
import { usePinnedFooterPadding, useScrollClearance } from '../ui/primitives';
import { alertAsync, confirmAsync } from '../lib/dialog';
import { RepeatNote } from '../components/RepeatNote';
import { useJobSeries } from '../hooks/useJobSeries';
import { stopJobSeries } from '../lib/jobSeries';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { acceptOffer, type OfferWithWorker } from '../lib/offers';
import {
  BID_SORT_CHIPS,
  compareWorkerFromSummary,
  sortBidsForChip,
  type BidSortChip,
} from '../lib/compareBids';
import { jobStage } from '../lib/jobStage';
import {
  deriveJobLifecycle,
  JOB_LIFECYCLE_LABELS,
  releaseCountdownLabel,
  releaseDeadlineMs,
  trackStepIndex,
} from '../lib/jobLifecycle';
import {
  arrivalWindowLabel,
  budgetRangeLabel,
  categoryAccent,
  completionPhotosOf,
  completionVideosOf,
  fetchJobLocation,
  fetchRehirableWorkerIds,
  formatBudget,
  formatPendingBidCount,
  hasBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
} from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';
import {
  emeraldColorsFor,
  fonts,
  radius,
  spacing,
  themedStyles,
  typographyFor,
  litCardStyle,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

export function ClientJobDetailScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C7) — THE CUSTOMER'S JOB PAGE, ITS OWN FIVE. Each falls back to
  // the value this file drew before the dial existed, spelled here and nowhere
  // else; the four token-backed ones take the `theme.*` scale this file
  // imports spacing/radius from.
  const jobHeroPadding = useDialNumber('clientJobDetail.jobHero.padding') ?? spacing.xl;
  const jobHeroRadius = useDialNumber('clientJobDetail.jobHero.radius') ?? radius.xl;
  const contentPaddingX = useDialNumber('clientJobDetail.content.paddingX') ?? spacing.lg;
  const contentGap = useDialNumber('clientJobDetail.content.gap') ?? spacing.lg;
  const iconCircleSize = useDialNumber('clientJobDetail.iconCircle.size') ?? 36;
  // emerald(3): the floating pill's real footprint. This is the "Job & bids"
  // surface the device pass caught scrolling under it.
  const navClearance = useScrollClearance();
  const footerPad = usePinnedFooterPadding();
  const emeraldColors = emeraldColorsFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'ClientJobDetail'>>();
  // Seeded from the hub card, then re-read canonically on every focus so an
  // edit made in PostJob (title, budget, location, photos, videos) is reflected
  // here the moment the poster comes back, instead of the card's snapshot from
  // whenever the hub last loaded.
  const { job, missing, refresh: refreshJob } = useOwnedJobDetail(params.job);

  const { user } = useAuth();
  // n7 — `summaries` is the shared hook's ONE profile_review_summaries() call
  // over the offers' worker ids (worker role, REVEALED reviews only); null
  // until it answers. The ranking and every card's rating read it, never the
  // profile's legacy mixed aggregate.
  const {
    offers: bids,
    loading,
    error,
    refresh: refreshBids,
    summaries,
  } = useJobOffers(job.id, { summaries: true });
  // null = no chip selected = the stated deterministic default order
  // (lib/compareBids.ts — the single ordering source).
  const [sort, setSort] = useState<BidSortChip | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [pendingAccept, setPendingAccept] = useState<OfferWithWorker | null>(null);
  const [worker, setWorker] = useState<Profile | null>(null);
  // The job's sandbox ledger row (phase50). Loaded on focus so returning from
  // Checkout immediately reflects authorized/held truthfully.
  const [payment, setPayment] = useState<Payment | null>(null);
  // The open issue report, if any (phase51) — it freezes release and reroutes
  // the completed-job section to the approval surface.
  const [openDispute, setOpenDispute] = useState<JobDispute | null>(null);
  // A failed payment/dispute read is a different fact from "no payment, no
  // dispute" (F-026): while true, the money and completed-job surfaces below
  // render a retry banner instead of consuming the absent rows as truth.
  const [statusReadError, setStatusReadError] = useState(false);
  const [statusReadAttempt, setStatusReadAttempt] = useState(0);
  // D15: the payments kill switch, read on focus; a failed read is true.
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  // Idea 14: whether this job's ledger has been read — a repeat visit's "Confirm $X" push opens
  // Checkout only once it says the visit still waits for its payment.
  const [paymentRead, setPaymentRead] = useState(false);
  // The group 4 review: payments may be paused — the jump to Checkout also waits for that answer.
  const [configRead, setConfigRead] = useState(false);
  // Idea 14: a visit of a repeating job — its line, and "Stop repeating".
  const { series, setSeries } = useJobSeries(job.series_id);
  const [stoppingSeries, setStoppingSeries] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [rehirable, setRehirable] = useState<Set<string>>(new Set());
  // The exact service address (job_private_details). This is the poster's own
  // screen, so RLS always grants the read; it simply comes back null when the
  // posting never carried one.
  const [privateAddress, setPrivateAddress] = useState<string | null>(null);
  const [addressReadFailed, setAddressReadFailed] = useState(false);
  const [addressReadAttempt, setAddressReadAttempt] = useState(0);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  // Handed to ReviewSection so focusing its comment field can lift the card
  // clear of the keyboard — the review card is the last thing in this list.
  const scrollRef = useRef<ScrollView>(null);

  const acceptingRef = useRef(false);
  const screenMountedRef = useRef(true);
  const currentJobIdRef = useRef(job.id);
  const refreshRunRef = useRef(0);
  const workerRunRef = useRef(0);
  currentJobIdRef.current = job.id;

  const canAccept = job.status === 'open';
  // A retained ClientJobDetail route can be retargeted to another job. Never
  // render the previous assignment while this job's profile read is pending.
  const assignedWorker = worker?.id === job.assigned_worker_id ? worker : null;
  const workerName = assignedWorker?.full_name ?? 'the worker';
  // 2026-09-27 (the Lux remake, ruling 10): the settled line addresses the
  // worker by first name so it holds one line on a 393-wide phone.
  const workerFirstName = firstNameOf(assignedWorker?.full_name, 'the worker');
  const accent = categoryAccent(job.category);
  // "An accepted price exists" = the job sits on the hire-to-done track,
  // classified through THE derivation (F-012). Deliberately payment- and
  // dispute-blind — whether the job left the market must not flip on a
  // failed payment read — so it runs payment-null, exactly like
  // RouteArrival's derivation, instead of reusing `lifecycle` below.
  const hasLifecycle = trackStepIndex(deriveJobLifecycle({ job, payment: null })) >= 0;
  // The rank rows lib/compareBids.ts orders: each pending bid with its
  // worker's summary mapped to CompareWorker (null while unanswered → unrated
  // → last as a block) and the offer itself for the card.
  const pendingBids = useMemo(
    () =>
      bids.filter((bid) => bid.status === 'pending').map((bid) => ({
        id: bid.id,
        amount_cents: bid.amount_cents,
        created_at: bid.created_at,
        worker: compareWorkerFromSummary(summaries?.get(bid.worker_id)),
        offer: bid,
      })),
    [bids, summaries]
  );
  // `job.bid_count` includes withdrawn/rejected history. Only pending rows can
  // drive the poster's actionable status, even while the fresh read loads.
  const visibleBidCount = pendingBids.length;
  const displayedAmountCents = hasLifecycle
    ? job.final_amount_cents ?? job.budget_cents
    : job.budget_cents;
  const completionPhotos = completionPhotosOf(job);
  const completionVideos = completionVideosOf(job);
  const hasCompletionEvidence = completionPhotos.length > 0 || completionVideos.length > 0;
  // Always the poster's own view of their job, so isPoster is unconditionally
  // true here — this is the one screen that legitimately shows "In Progress".
  const actionableBidCount = loading && bids.length === 0 ? null : visibleBidCount;
  const stage = jobStage(job.status, actionableBidCount, true);
  // THE lifecycle derivation point (run addendum §1) — the completed-job fork
  // below branches on this, never on a hand-rolled status+payment combo.
  const lifecycle = deriveJobLifecycle({
    job,
    payment,
    // A failed read derives 'unknown', never "no dispute" (F-026).
    hasOpenDispute: statusReadError ? 'unknown' : !!openDispute,
  });
  // THE funding-CTA derivation (AUD-P1-02) — expressed once in lib/payments,
  // never as a per-branch status conditional. The worker starting or even
  // finishing must never strand an unfunded job with no checkout path.
  const canFundNow = canOfferJobFunding({
    viewerId: user?.id,
    job,
    payment,
    hasOpenDispute: !!openDispute,
  });
  // Idea 14: from a repeat visit's "Confirm $X" push — Checkout, once, and only when this visit can
  // still be funded (a visit already paid, or a closed funding window, stays here).
  const checkoutIntentRef = useRef(false);
  useEffect(() => {
    if (params.intent !== 'checkout' || checkoutIntentRef.current || !paymentRead || !configRead) return;
    checkoutIntentRef.current = true;
    if (canFundNow && paymentsEnabled) navigation.navigate('Checkout', { job });
  }, [params.intent, paymentRead, configRead, canFundNow, paymentsEnabled, job, navigation]);

  async function handleStopSeries() {
    if (!series || stoppingSeries) return;
    const ok = await confirmAsync({
      title: 'Stop repeating?',
      message: 'Visits already booked stay booked. No new visits will be offered or posted.',
      confirmText: 'Stop repeating',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    setStoppingSeries(true);
    const { data, error: stopError } = await stopJobSeries(series.id);
    if (!screenMountedRef.current) return;
    setStoppingSeries(false);
    if (stopError) {
      await alertAsync('Could not stop the repeat', userMessage(stopError));
      return;
    }
    if (data) setSeries(data);
  }

  // D14: an unfunded stripe row's funding window. Open → the countdown rides
  // the funding card; closed → canFundNow already refuses (D9), and the card
  // below says so and offers a re-read, never a charge into a lapsed row.
  const fundingDueMs =
    payment?.status === 'unfunded' && payment.funding_due_at
      ? Date.parse(payment.funding_due_at)
      : null;
  const fundingWindowOpen =
    fundingDueMs != null && Number.isFinite(fundingDueMs) && Date.now() < fundingDueMs;
  const fundingWindowClosed =
    fundingDueMs != null && Number.isFinite(fundingDueMs) && Date.now() >= fundingDueMs;
  // D23: approved, payout pending — the completed branch offers Review for it.
  const releaseRequested = !!payment && isReleaseRequested(payment);
  const stripe = paymentsMode === 'stripe';

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
      refreshRunRef.current += 1;
    };
  }, []);

  const loadAssignedWorker = useCallback(async () => {
    const workerId = job.assigned_worker_id;
    const jobId = job.id;
    const runId = ++workerRunRef.current;
    if (canAccept || !workerId) {
      setWorker(null);
      setWorkerError(null);
      return;
    }

    setWorkerError(null);
    const result = await fetchProfileById(workerId);
    if (
      runId !== workerRunRef.current ||
      currentJobIdRef.current !== jobId ||
      !screenMountedRef.current
    ) {
      return;
    }
    if (result.error) setWorkerError(userMessage(result.error));
    else setWorker(result.data);
  }, [canAccept, job.assigned_worker_id, job.id]);

  useEffect(() => {
    // React Navigation can retarget this retained route to another job. Modal,
    // viewer, sort, and payment state belong to the old job and must not follow.
    refreshRunRef.current += 1;
    setSort(null);
    setRefreshing(false);
    setPendingAccept(null);
    setViewerUri(null);
    setAvatarUri(null);
    setWorkerError(null);
    setPayment(null);
    setOpenDispute(null);
    setStatusReadError(false);
    setPaymentRead(false);
  }, [job.id]);

  // The ledger row, re-read on every focus: Checkout and the approval flow are
  // one push away and the money label here must follow what actually happened
  // there. job_payment_state() (phase51) also runs the 72h auto-release check
  // on the way — the on-read pattern; there is no cron.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (job.status === 'open' || job.status === 'cancelled') return;
      Promise.all([fetchJobPaymentState(job.id), fetchOpenJobDispute(job.id)]).then(
        ([paymentResult, disputeResult]) => {
          if (!active) return;
          if (!paymentResult.error) setPayment(paymentResult.data);
          if (!disputeResult.error) setOpenDispute(disputeResult.data);
          // Idea 14: the checkout intent waits for a ledger actually read.
          if (!paymentResult.error && !disputeResult.error) setPaymentRead(true);
          // Either read failing marks the pair failed: both feed the same
          // lifecycle answer, and a retry re-runs them together.
          setStatusReadError(!!(paymentResult.error || disputeResult.error));
        }
      );
      return () => {
        active = false;
      };
    }, [job.id, job.status, statusReadAttempt])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchRemoteConfig().then((config) => {
        if (!active) return;
        setPaymentsEnabled(config.paymentsEnabled);
        setConfigRead(true);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    setWorker(null);
    void loadAssignedWorker();
    return () => {
      workerRunRef.current += 1;
    };
  }, [loadAssignedWorker]);
  useEffect(() => {
    let active = true;
    setPrivateAddress(null);
    setAddressReadFailed(false);
    fetchJobLocation(job.id).then(({ data, error }) => {
      if (!active) return;
      // A failed read is not "this posting carries no address" — the timing
      // card says so and offers a retry instead of omitting the row (F-026).
      if (error) setAddressReadFailed(true);
      else setPrivateAddress(data?.address_line ?? null);
    });
    return () => {
      active = false;
    };
  }, [job.id, addressReadAttempt]);

  // "Hire Again" is client-scoped by definition: only workers who have already
  // completed a job for *this* client. Workers never see this in reverse.
  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchRehirableWorkerIds(user.id).then(({ data }) => {
      if (active) setRehirable(data);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const sortedBids = useMemo(() => sortBidsForChip(pendingBids, sort), [pendingBids, sort]);

  // 2026-09-26 (the refresh, audit M-5): the fee is shown BEFORE the accept,
  // from the same quote_job_price() the worker's composer and Checkout use —
  // one total per distinct pending amount, never a rate computed here.
  const [quotes, setQuotes] = useState<Record<number, JobPriceQuote>>({});
  const pendingAmountsKey = pendingBids.map((b) => b.amount_cents).join(',');
  useEffect(() => {
    let active = true;
    const amounts = Array.from(new Set(pendingBids.map((b) => b.amount_cents)));
    Promise.all(amounts.map((cents) => quoteJobPrice(cents).then((r) => [cents, r.data] as const))).then(
      (rows) => {
        if (!active) return;
        const next: Record<number, JobPriceQuote> = {};
        for (const [cents, quote] of rows) if (quote) next[cents] = quote;
        setQuotes(next);
      }
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAmountsKey]);
  const acceptQuote = pendingAccept ? quotes[pendingAccept.amount_cents] ?? null : null;

  // 2026-09-26 (the refresh, audit M-1 / M-4): THE ONE DECISION this page exists
  // for, pinned in a bar under the scroll instead of at the end of it — derived
  // from the same lifecycle the hub's next-action line reads, so the sentence on
  // the hub card and the button here always agree. Null = nothing to decide.
  const approvalDeadline = releaseDeadlineMs(job);
  const primaryAction: { label: string; onPress: () => void } | null = (() => {
    if (statusReadError) return null;
    if (canAccept) {
      if (pendingBids.length === 1) {
        const only = pendingBids[0].offer;
        return { label: acceptOfferActionLabel(formatBudget(only.amount_cents), false), onPress: () => confirmAccept(only) };
      }
      if (pendingBids.length > 1) {
        return { label: `Compare ${pendingBids.length} bids`, onPress: () => navigation.navigate('CompareBids', { job }) };
      }
      return null;
    }
    // The funding CTA renders from canOfferJobFunding ALONE (AUD-P1-02), and
    // D15's kill switch hides it in every mode.
    const fundingAction = canFundNow ? (paymentsEnabled ? { label: 'Protect payment in checkout', onPress: () => navigation.navigate('Checkout', { job }) } : null) : undefined;
    if (fundingAction !== undefined) return fundingAction;
    switch (lifecycle) {
      case 'confirmed':
      case 'en_route':
      case 'arrived':
      case 'in_progress':
        return job.assigned_worker_id
          ? { label: 'Track worker', onPress: () => navigation.navigate('TrackWorker', { job }) }
          : null;
      case 'awaiting_approval':
        return {
          label:
            approvalDeadline != null
              ? `Review & approve · ${releaseCountdownLabel(approvalDeadline, Date.now())} left`
              : 'Review & approve the work',
          onPress: () => navigation.navigate('ApproveOrDispute', { job }),
        };
      case 'disputed':
        return openDispute
          ? { label: 'Manage your report', onPress: () => navigation.navigate('ApproveOrDispute', { job }) }
          : null;
      case 'completed':
        return payment && (isReleased(payment) || releaseRequested)
          ? {
              label: stripe || !isReleased(payment) ? 'Leave a review' : 'Review & tip',
              onPress: () => navigation.navigate('ReviewAndTip', { job }),
            }
          : null;
      default:
        return null;
    }
  })();

  async function onRefresh() {
    const runId = ++refreshRunRef.current;
    const refreshJobId = job.id;
    setRefreshing(true);
    try {
      const [jobResult] = await Promise.all([
        refreshJob(),
        canAccept ? refreshBids() : Promise.resolve(),
        !canAccept && job.assigned_worker_id ? loadAssignedWorker() : Promise.resolve(),
      ]);
      if (
        runId === refreshRunRef.current &&
        currentJobIdRef.current === refreshJobId &&
        screenMountedRef.current &&
        jobResult.error
      ) {
        await alertAsync('Could not refresh job', userMessage(jobResult.error));
      }
    } finally {
      if (runId === refreshRunRef.current && screenMountedRef.current) {
        setRefreshing(false);
      }
    }
  }

  /**
   * Phase 5: an accepted bid flows straight into the protected checkout —
   * hiring and funding are one continuous motion, so instead of the old
   * "success overlay, back to the hub" the screen navigates to Checkout,
   * which re-reads the job canonically and shows the truthful payment state.
   */
  function proceedToCheckout() {
    navigation.navigate('Checkout', { job });
  }

  /**
   * Accepting a bid assigns the job and closes every other bid on it, so it
   * goes through the in-app confirmation rather than firing on one tap. The
   * confirm button disables itself while accept_offer() is in flight, so a
   * second tap cannot send a second accept.
   */
  function confirmAccept(bid: OfferWithWorker) {
    if (!bid.worker || acceptingId || acceptingRef.current) return;
    setPendingAccept(bid);
  }

  async function doAccept(bid: OfferWithWorker) {
    if (!bid.worker || acceptingRef.current) return;
    const acceptedJobId = job.id;
    acceptingRef.current = true;
    setAcceptingId(bid.id);
    const { error } = await acceptOffer(bid.id);
    acceptingRef.current = false;
    if (!screenMountedRef.current) return;
    setAcceptingId(null);
    if (currentJobIdRef.current !== acceptedJobId) {
      setPendingAccept(null);
      return;
    }

    if (error) {
      setPendingAccept(null);
      const [jobResult] = await Promise.all([refreshJob(), refreshBids()]);
      if (!screenMountedRef.current || currentJobIdRef.current !== acceptedJobId) return;

      // A network response can be lost after the transaction committed. The
      // canonical job read tells us whether this exact worker was assigned,
      // avoiding a false failure message and a stale open-job screen.
      if (jobResult.data?.assigned_worker_id === bid.worker.id) {
        proceedToCheckout();
        return;
      }
      await alertAsync('Could not confirm bid acceptance', userMessage(error));
      return;
    }

    setPendingAccept(null);
    proceedToCheckout();
  }

  if (missing) {
    return (
      <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
        <ScreenHeader
          title="Job Unavailable"
          onBack={goBackOrHome}
          palette={emeraldColors}
        />
        <View style={styles.missingState}>
          <View style={styles.missingIcon}>
            <Ionicons name="document-text-outline" size={34} color={colors.emerald} />
          </View>
          <Text style={styles.missingTitle}>This job is no longer available</Text>
          <Text style={styles.missingText}>
            It may have been deleted or you may no longer have access to it.
          </Text>
          <Button
            title="Back to My Jobs"
            onPress={() => navigation.popTo('MyJobsHub')}
            palette={emeraldColors}
            style={styles.missingButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={canAccept ? 'Job & Bids' : 'Job Detail'}
        onBack={goBackOrHome}
        palette={emeraldColors}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: contentPaddingX, gap: contentGap },
            primaryAction ? { paddingBottom: contentGap } : { paddingBottom: navClearance },
          ]}
          keyboardShouldPersistTaps="handled"
          // Swiping the list down puts the keyboard away, so it never has to
          // be dismissed by hunting for empty space to tap.
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.emerald}
              colors={[colors.emerald]}
            />
          }
        >
        <View
          style={[
            styles.jobHero,
            { padding: jobHeroPadding, borderRadius: jobHeroRadius },
            isDark && styles.jobHeroDark,
            !canAccept && styles.jobHeroActive,
            // 2026-09-29 (LUX-LIST-2 #6): the lit card in both schemes, as the approved reference
            // (.shots/refresh/depth/ "S", job-assigned) drew this hero — its own fill, rim and lift.
            litCardStyle(isDark),
          ]}
        >
          <View style={styles.heroTopRow}>
            <StatusBadge
              status={stage.statusKey}
              label={
                hasLifecycle && !statusReadError && lifecycle !== 'unknown'
                  ? JOB_LIFECYCLE_LABELS[lifecycle]
                  : stage.label
              }
            />
            <Text style={[styles.postedAt, !canAccept && styles.heroTextLight]}>
              Posted {formatTimeAgo(job.created_at)}
            </Text>
          </View>

          <Text style={[styles.jobTitle, !canAccept && styles.heroTitleLight]}>
            {job.title}
          </Text>

          <View style={styles.jobMetaRow}>
            {/* Master 8: a sage squircle behind a gold hairline, with the
                category glyph in gold; light keeps the category accents. */}
            <View
              style={[
                styles.iconCircle,
                { width: iconCircleSize, height: iconCircleSize },
                // LUX-LIST-2 #6: the lit tile in dark; light keeps the category colour.
                isDark ? [styles.iconCircleDark, litCardStyle(true, 'tile')] : { backgroundColor: accent.bg },
              ]}
            >
              <CategoryGlyph
                name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                size={18}
                color={isDark ? colors.gold : accent.icon}
                filled
                bare
              />
            </View>
            <Text
              style={[styles.jobMeta, !canAccept && styles.heroTextLight]}
              numberOfLines={2}
            >
              {JOB_CATEGORY_LABELS[job.category] ?? job.category}
              {job.location ? ` · ${job.location}` : ''}
            </Text>
          </View>

          <View style={[styles.jobFooter, isDark && styles.dividerDark]}>
            <View>
              <Text
                style={[
                  styles.valueLabel,
                  !canAccept && styles.heroEyebrowLight,
                  isDark && styles.valueLabelDark,
                ]}
              >
                {hasLifecycle ? 'AGREED PRICE' : 'BUDGET'}
              </Text>
              <Text style={[styles.budget, !canAccept && styles.heroTitleLight]}>
                {hasLifecycle
                  ? formatBudget(displayedAmountCents)
                  : hasBudget(job)
                    ? budgetRangeLabel(job)
                    : formatBudget(null)}
              </Text>
            </View>
            {canAccept ? (
              <Text style={styles.bidCount} accessibilityLiveRegion="polite">
                {loading && bids.length === 0
                  ? 'Checking bids…'
                  : error && bids.length === 0
                    ? 'Bids unavailable'
                    : formatPendingBidCount(visibleBidCount)}
              </Text>
            ) : null}
          </View>

          <JobOwnerActions
            jobId={job.id}
            posterId={job.client_id}
            status={job.status}
            style={[styles.ownerActions, isDark && styles.dividerDark]}
          />
        </View>

        <Card palette={emeraldColors} style={[styles.scopeCard, isDark && styles.hairlineDark]}>
          <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>JOB SCOPE</Text>
          <Text style={styles.scopeDescription} selectable>
            {job.description}
          </Text>
          <View style={[styles.scopeTag, isDark && styles.scopeTagDark]}>
            <CategoryGlyph
              name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
              size={15}
              color={isDark ? colors.gold : colors.emerald}
              filled
              bare
            />
            <Text style={styles.scopeTagText}>
              {JOB_CATEGORY_LABELS[job.category] ?? job.category}
            </Text>
          </View>
        </Card>

        {arrivalWindowLabel(job) || privateAddress || addressReadFailed || series ? (
          <Card palette={emeraldColors} style={[styles.timingCard, isDark && styles.hairlineDark]}>
            <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>TIMING &amp; ADDRESS</Text>
            {arrivalWindowLabel(job) ? (
              <View style={styles.timingRow}>
                {/* Master 16 sets both logistics glyphs in a gold ring. */}
                <View style={[styles.timingGlyph, isDark && styles.timingGlyphDark]}>
                  <Ionicons
                    name="time-outline"
                    size={17}
                    color={isDark ? colors.gold : colors.emerald}
                  />
                </View>
                <Text style={styles.timingText}>{arrivalWindowLabel(job)}</Text>
              </View>
            ) : null}
            {privateAddress ? (
              <View style={styles.timingRow}>
                <View style={[styles.timingGlyph, isDark && styles.timingGlyphDark]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={17}
                    color={isDark ? colors.gold : colors.emerald}
                  />
                </View>
                <View style={styles.timingCopy}>
                  <Text style={styles.timingText} selectable>
                    {privateAddress}
                  </Text>
                  <Text style={styles.timingCaption}>
                    Private — only you and the worker you hire can see this address.
                  </Text>
                </View>
              </View>
            ) : addressReadFailed ? (
              // A failed read, surfaced as itself — never rendered as "this
              // posting has no exact address" (F-026).
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>Couldn’t load the exact address</Text>
                  <Text style={styles.errorMessage}>
                    Check your connection and retry.
                  </Text>
                </View>
                <Button
                  title="Retry"
                  size="sm"
                  variant="secondary"
                  palette={emeraldColors}
                  onPress={() => setAddressReadAttempt((attempt) => attempt + 1)}
                />
              </View>
            ) : null}
            {/* Idea 14: a visit of a repeating job says so, with the one thing to do about it. */}
            {series ? (
              <RepeatNote series={series} perspective="customer" busy={stoppingSeries} onEnd={() => void handleStopSeries()} />
            ) : null}
          </Card>
        ) : null}

        {canAccept && (job.photos.length > 0 || job.videos.length > 0) ? (
          <Card palette={emeraldColors} style={[styles.mediaCard, isDark && styles.hairlineDark]}>
            <Text style={styles.sectionTitle}>Posting media</Text>
            <Text style={styles.sectionCaption}>What workers can review before bidding.</Text>
            {job.photos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {job.photos.map((url) => (
                  <Pressable
                    key={url}
                    onPress={() => setViewerUri(url)}
                    accessibilityRole="button"
                    accessibilityLabel="Open posting photo"
                  >
                    <RemoteImage uri={url} style={styles.beforeAfterPhoto} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {job.videos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {job.videos.map((url) => (
                  <JobVideo key={url} uri={url} label="Job video" />
                ))}
              </ScrollView>
            ) : null}
          </Card>
        ) : null}

        {canAccept && error && bids.length > 0 ? (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Bids may be out of date</Text>
              <Text style={styles.errorMessage} selectable>
                {error}
              </Text>
            </View>
            <Pressable
              onPress={onRefresh}
              disabled={refreshing}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry loading bids"
            >
              <Text style={styles.retryText}>{refreshing ? 'Trying…' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : null}

        {canAccept ? (
          loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.emerald} />
              <Text style={styles.loadingText}>Loading bids…</Text>
            </View>
          ) : error && bids.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, isDark && styles.emptyIconDark]}>
                <Ionicons name="cloud-offline-outline" size={32} color={isDark ? colors.gold : colors.emerald} />
              </View>
              <Text style={styles.emptyTitle}>Couldn’t load bids</Text>
              <Text style={styles.emptyText} selectable>
                {error}
              </Text>
              <Button
                title="Try again"
                onPress={onRefresh}
                loading={refreshing}
                palette={emeraldColors}
                style={styles.retryButton}
              />
            </View>
          ) : pendingBids.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, isDark && styles.emptyIconDark]}>
                <Ionicons name="people-outline" size={32} color={isDark ? colors.gold : colors.emerald} />
              </View>
              <Text style={styles.emptyTitle}>
                {bids.length > 0 ? 'No active bids' : 'No bids yet'}
              </Text>
              <Text style={styles.emptyText}>
                {bids.length > 0
                  ? 'Previous bids were withdrawn or closed. New pending bids will appear here.'
                  : 'When workers bid on this job, they’ll appear here.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.bidSectionHeader}>
                <View>
                  <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>WORKER OFFERS</Text>
                  <Text style={styles.bidSectionTitle}>
                    {pendingBids.length}{' '}
                    {pendingBids.length === 1 ? 'bid' : 'bids'} to compare
                  </Text>
                </View>

              </View>
              {pendingBids.length > 1 && (
                <SegmentedControl
                  options={BID_SORT_CHIPS}
                  value={sort}
                  onChange={setSort}
                  palette={emeraldColors}
                />
              )}

              <View style={styles.bidList}>
                {sortedBids.map(({ offer: bid }) => {
                  // A const narrows ONCE and survives into the closures — the
                  // five `bid.worker!` assertions this replaces were sound
                  // only by inspection (hardening A8).
                  const worker = bid.worker;
                  const avatarUrl = worker?.avatar_url ?? null;
                  return (
                    <OfferCard
                      key={bid.id}
                      variant="list"
                      offer={bid}
                      summary={summaries?.get(bid.worker_id) ?? null}
                      allInCents={quotes[bid.amount_cents]?.total_cents ?? null}
                      palette={emeraldColors}
                      canAccept={canAccept}
                      accepting={acceptingId === bid.id}
                      disabled={acceptingId !== null && acceptingId !== bid.id}
                      onAccept={() => confirmAccept(bid)}
                      onOpenDetail={() =>
                        navigation.navigate('BidDetail', { job, offerId: bid.id })
                      }
                      onViewProfile={
                        worker
                          ? () =>
                              navigation.navigate('WorkerProfile', {
                                workerId: worker.id,
                                workerName: worker.full_name ?? undefined,
                              })
                          : undefined
                      }
                      onLongPressAvatar={
                        avatarUrl ? () => setAvatarUri(avatarUrl) : undefined
                      }
                      canRehire={!!worker && rehirable.has(worker.id)}
                      onHireAgain={
                        worker
                          ? () =>
                              navigation.navigate('PostJob', {
                                hireWorkerId: worker.id,
                                hireWorkerName: worker.full_name ?? 'this worker',
                              })
                          : undefined
                      }
                    />
                  );
                })}
              </View>
            </>
          )
        ) : (
          <>
            {job.status === 'cancelled' ? (
              <Card palette={emeraldColors} style={[styles.cancelledCard, isDark && styles.hairlineDark]}>
                <View style={styles.cancelledIcon}>
                  <Ionicons name="close" size={22} color={colors.neutral} />
                </View>
                <View style={styles.errorCopy}>
                  <Text style={styles.cancelledTitle}>This job was cancelled</Text>
                  <Text style={styles.cancelledText}>
                    No further action is needed. The job remains here for your records.
                  </Text>
                </View>
              </Card>
            ) : (
              <>
            {hasLifecycle ? (
              <Card palette={emeraldColors} style={[styles.progressCard, isDark && styles.hairlineDark]}>
                <Text style={[styles.eyebrow, isDark && styles.eyebrowDark, styles.eyebrowGold]}>JOB PROGRESS</Text>
                <Text style={styles.sectionTitle}>Where things stand</Text>
                <JobProgress status={job.status} palette={emeraldColors} />
              </Card>
            ) : null}

            <Card palette={emeraldColors} style={[styles.workerCard, isDark && styles.hairlineDark]}>
              <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>ASSIGNED WORKER</Text>
              <Text style={styles.sectionTitle}>
                {assignedWorker?.full_name ?? 'Your worker'}
              </Text>
              {workerError ? (
                <View style={styles.errorBanner} accessibilityRole="alert">
                  <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                  <View style={styles.errorCopy}>
                    <Text style={styles.errorTitle}>Couldn’t load the worker profile</Text>
                    <Text style={styles.errorMessage} numberOfLines={2}>
                      {workerError}
                    </Text>
                  </View>
                  <Button
                    title="Retry"
                    size="sm"
                    variant="secondary"
                    palette={emeraldColors}
                    onPress={() => void loadAssignedWorker()}
                  />
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.workerRow,
                  isDark && styles.workerRowDark,
                  litCardStyle(isDark),
                  pressed && styles.workerRowPressed,
                ]}
                onPress={() =>
                  job.assigned_worker_id &&
                  navigation.navigate('WorkerProfile', {
                    workerId: job.assigned_worker_id,
                    workerName: assignedWorker?.full_name ?? undefined,
                  })
                }
                disabled={!job.assigned_worker_id}
                accessibilityRole={job.assigned_worker_id ? 'button' : undefined}
                accessibilityLabel={
                  job.assigned_worker_id
                    ? `View ${assignedWorker?.full_name ?? 'worker'} profile`
                    : undefined
                }
              >
                <AvatarPressable
                  name={assignedWorker?.full_name}
                  uri={assignedWorker?.avatar_url}
                  size={52}
                  onLongPress={
                    assignedWorker?.avatar_url
                      ? () => setAvatarUri(assignedWorker.avatar_url)
                      : undefined
                  }
                />
                <View style={styles.workerText}>
                  <View style={styles.workerNameRow}>
                    <Text style={styles.workerName} numberOfLines={1}>
                      {assignedWorker?.full_name ?? 'Assigned worker'}
                    </Text>
                  </View>
                  <Text style={styles.workerMeta}>
                    {formatBudget(job.final_amount_cents ?? job.budget_cents)} agreed
                  </Text>
                </View>
                {job.assigned_worker_id && (
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                )}
              </Pressable>
            </Card>

            {job.assigned_worker_id && (
              <Button
                title={`Message ${workerName}`}
                icon="chatbubble-outline"
                iconPosition="leading"
                variant="secondary"
                palette={emeraldColors}
                onPress={() =>
                  navigation.navigate('Chat', { jobId: job.id })
                }
              />
            )}

            {/* Phase 6 — the static tracking surface (screen 33): where the
                worker is in the confirmed → done march, from their own
                declarations. Meaningless once the job is completed. */}
            {/* 2026-09-26: Track worker is the pinned primary while the job runs. */}

            {/* The money truth for this job (phase50 ledger). Labels come from
                MoneyText's fixed §H.3 captions — never hand-written here. The
                funding CTA renders from canFundNow ALONE (AUD-P1-02): once at
                assigned, and still at in_progress/completed, because phase58's
                authorize-after-start exists exactly for the worker outrunning
                checkout. It never renders over a held/released/refunded or
                otherwise unclassifiable row — that is the double-charge line. */}
            {statusReadError ? (
              // The failed reads' surface (F-026): every card below that
              // renders from the payment/dispute rows is held back behind
              // this retry rather than treating the absent rows as truth.
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>Couldn’t load payment details</Text>
                  <Text style={styles.errorMessage}>
                    This job’s payment and issue-report info didn’t load, so
                    what’s shown may be incomplete. Check your connection and
                    retry.
                  </Text>
                </View>
                <Button
                  title="Retry"
                  size="sm"
                  variant="secondary"
                  palette={emeraldColors}
                  onPress={() => setStatusReadAttempt((attempt) => attempt + 1)}
                />
              </View>
            ) : canFundNow ? (
              <Card palette={emeraldColors} style={[styles.paymentCard, isDark && styles.hairlineDark]}>
                <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>PAYMENT NOT PROTECTED YET</Text>
                <Text style={styles.paymentNote}>
                  {workerName} is hired, but the payment isn’t in protection yet.
                  {payment?.status === 'authorized'
                    ? ' It’s authorized — not charged — finish checkout to protect it.'
                    : ''}
                  {/* Derived, not raw (F-012): inside this branch canFundNow
                      holds, so the payment is null/authorized and the raw
                      in_progress/completed statuses map 1:1 onto these
                      derived states. */}
                  {lifecycle === 'in_progress'
                    ? ' The work has started; protecting the payment works exactly the same.'
                    : lifecycle === 'completed'
                      ? ' The work is finished, but the worker can’t be paid until the payment is protected and then released.'
                      : ''}
                  {/* D14: the remaining funding window, in the app's plain
                      voice, off the one countdown formatter. */}
                  {fundingWindowOpen
                    ? ` The funding window closes in ${releaseCountdownLabel(
                        fundingDueMs as number,
                        Date.now()
                      )}.`
                    : ''}
                  {!paymentsEnabled
                    ? ' Payments are paused right now — check back shortly to protect it.'
                    : ''}
                </Text>
                {/* D15: the kill switch hides the checkout CTA in every mode —
                    and it is the pinned primary below (2026-09-26). */}
              </Card>
            ) : payment && isHeld(payment) && job.status === 'assigned' ? (
              // Idea 10: fresh from Checkout, the held card gives one soft haptic and a one-second pulse.
              <HeldPulse paymentId={payment.id} heldAt={payment.held_at}>
              <Card palette={emeraldColors} style={[styles.paymentCard, isDark && styles.hairlineDark]}>
                {/* Master 17 rings a shield at the payment card's right. */}
                <View style={styles.paymentShield}>
                  <Ionicons name="shield-outline" size={22} color={colors.mark} />
                </View>
                {/* D16: sandbox keeps its label verbatim; stripe drops it. */}
                <Text style={[styles.eyebrow, isDark && styles.eyebrowDark, styles.eyebrowGold]}>
                  {paymentsMode === 'sandbox' ? 'PROTECTED PAYMENT · SANDBOX' : 'PROTECTED PAYMENT'}
                </Text>
                {/* Tier A (C2, D-4): the customer's held figure is the row's
                    charge_amount_cents — the agreed price is said beside the
                    title; this is what the card was charged. */}
                <MoneyText cents={customerChargeCents(payment)} state={payment.status} size="lg" />
                {/* 2026-09-26 (audit M-6): one money block, both figures named —
                    what the card paid (the charge, above) and the agreed price
                    it protects. */}
                <Text style={styles.paymentNote}>
                  Charged to your card · {formatBudget(job.final_amount_cents ?? job.budget_cents)} agreed price
                </Text>
                <Text style={styles.paymentNote}>
                  {paymentsMode === 'sandbox'
                    ? 'Funds stay held until you approve the finished work. Sandbox build — no real money moves.'
                    : 'Funds stay held until you approve the finished work.'}
                </Text>
              </Card>
              </HeldPulse>
            ) : payment && fundingWindowClosed ? (
              // D14 PAST DUE: no checkout CTA (canFundNow refused it — D9), the
              // window closed, and a re-read: once the row is voided a fresh
              // checkout follows. Never a payment into a lapsed row.
              <Card palette={emeraldColors} style={[styles.paymentCard, isDark && styles.hairlineDark]}>
                <View style={styles.paymentShield}>
                  <Ionicons name="shield-outline" size={22} color={colors.mark} />
                </View>
                <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>FUNDING WINDOW CLOSED</Text>
                <MoneyText cents={customerChargeCents(payment)} state={payment.status} />
                <Text style={styles.paymentNote}>
                  The window to protect this payment closed before a card was
                  charged. A fresh checkout will be available shortly — check
                  again in a moment.
                </Text>
                <Button
                  title="Check again"
                  variant="secondary"
                  palette={emeraldColors}
                  onPress={() => setStatusReadAttempt((attempt) => attempt + 1)}
                />
              </Card>
            ) : payment ? (
              <Card palette={emeraldColors} style={[styles.paymentCard, isDark && styles.hairlineDark]}>
                <View style={styles.paymentShield}>
                  <Ionicons name="shield-outline" size={22} color={colors.mark} />
                </View>
                <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>
                  {paymentsMode === 'sandbox'
                    ? 'PAYMENT · SANDBOX'
                    : releaseRequested
                      ? 'APPROVED · PAYOUT ON ITS WAY'
                      : 'PAYMENT'}
                </Text>
                <MoneyText cents={customerChargeCents(payment)} state={payment.status} />
              </Card>
            ) : null}

            {/* Before/after: the client's own posting photos next to what the
                worker submitted on completion. Rendered as soon as the worker
                marks the job done, so the client reviews the finished work
                here rather than having to ask for it. */}
            {(job.photos.length > 0 || job.videos.length > 0 || hasCompletionEvidence) && (
              <Card palette={emeraldColors} style={[styles.evidenceCard, isDark && styles.hairlineDark]}>
                <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>WORK EVIDENCE</Text>
                <Text style={styles.sectionTitle}>
                  {hasCompletionEvidence ? 'Before & after' : 'Your original media'}
                </Text>
                {job.photos.length > 0 && (
                  <View style={styles.photoGroup}>
                    <Text style={styles.photoGroupLabel}>
                      {hasCompletionEvidence ? 'Before · your photos' : 'Your job photos'}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoRow}
                    >
                      {job.photos.map((url) => (
                        <Pressable
                          key={url}
                          onPress={() => setViewerUri(url)}
                          accessibilityRole="button"
                          accessibilityLabel="Open before photo"
                        >
                          <RemoteImage uri={url} style={styles.beforeAfterPhoto} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {job.videos.length > 0 && (
                  <View style={styles.photoGroup}>
                    <Text style={styles.photoGroupLabel}>
                      {hasCompletionEvidence ? 'Before · your video' : 'Your job video'}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoRow}
                    >
                      {job.videos.map((url) => (
                        <JobVideo key={url} uri={url} label="Job video" />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {completionPhotos.length > 0 && (
                  <View style={styles.photoGroup}>
                    <Text style={styles.photoGroupLabel}>After · finished work</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoRow}
                    >
                      {completionPhotos.map((url) => (
                        <Pressable
                          key={url}
                          onPress={() => setViewerUri(url)}
                          accessibilityRole="button"
                          accessibilityLabel="Open finished work photo"
                        >
                          <RemoteImage uri={url} style={styles.beforeAfterPhoto} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {completionVideos.length > 0 && (
                  <View style={styles.photoGroup}>
                    <Text style={styles.photoGroupLabel}>After · video</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoRow}
                    >
                      {completionVideos.map((url) => (
                        <JobVideo key={url} uri={url} label="Finished work" />
                      ))}
                    </ScrollView>
                  </View>
                )}
              </Card>
            )}

            {job.status === 'completed' ? (
              // Phase 6, §9 ordering: with a HELD payment, approval comes
              // FIRST — release the held funds (or report an issue) on screen
              // 36, review & tip on screen 37 only after release. An unfunded
              // or authorized-only ledger is the funding card's job above
              // (canFundNow) — a missing ledger is NOT a settled legacy
              // payment, so nothing here may imply the payment finished,
              // the worker was paid, or review/tip is available merely
              // because the status reads completed (AUD-P1-02). And when the
              // payment/dispute reads FAILED, none of this may render at all —
              // the retry banner above owns that state (F-026).
              statusReadError ? null : payment ? (
                lifecycle === 'disputed' && openDispute ? (
                  <Card palette={emeraldColors} style={[styles.approvalCard, isDark && styles.hairlineDark]}>
                    <Text style={styles.approvalTitle}>Issue reported</Text>
                    <Text style={styles.noticeText}>
                      {DISPUTE_REASON_LABELS[openDispute.reason]} — the payment
                      stays held while your report is open.
                    </Text>

                  </Card>
                ) : lifecycle === 'awaiting_approval' ? (
                  <Card palette={emeraldColors} style={[styles.approvalCard, isDark && styles.hairlineDark]}>
                    <Text style={styles.approvalTitle}>The work is done — your call</Text>
                    <Text style={styles.noticeText}>
                      Review what {workerName} submitted, then approve to release
                      the held funds or report an issue. With no response, the
                      funds release automatically after 72 hours.
                    </Text>
                    <Button
                      title="Report an issue"
                      variant="secondary"
                      palette={emeraldColors}
                      onPress={() => navigation.navigate('ApproveOrDispute', { job })}
                    />
                  </Card>
                ) : isReleased(payment) ? (
                  <Card palette={emeraldColors} style={[styles.approvalCard, isDark && styles.hairlineDark]}>
                    {/* Idea 10: fresh, the release pops a tick in beside the title with the success haptic. */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={styles.approvalTitle}>Payment released</Text>
                      <ReleasedTick paymentId={payment.id} releasedAt={payment.released_at} color={colors.emerald} />
                    </View>
                    <Text style={styles.noticeText}>
                      {stripe
                        ? `Settled. Leave ${workerFirstName} a review.`
                        : `Settled. Leave ${workerFirstName} a review or a tip.`}
                    </Text>
                  </Card>
                ) : releaseRequested ? (
                  // D23: approved, payout pending. The decision is made; the
                  // review is offered now, and the money copy says on its way
                  // — never released until the transfer lands.
                  <Card palette={emeraldColors} style={[styles.approvalCard, isDark && styles.hairlineDark]}>
                    <Text style={styles.approvalTitle}>Work approved — payout on its way</Text>
                    <Text style={styles.noticeText}>
                      You approved {workerName}’s work. The payment is on its
                      way to them and shows as released when the transfer
                      lands. Leave a review whenever you like.
                    </Text>
                  </Card>
                ) : null
              ) : // An authorized row landed in the funding card above; any other
              // unheld, unreleased row (refunded, …) shows its MoneyText above
              // and offers nothing here — never a checkout off a row this
              // screen cannot positively classify.
              canFundNow ? null : user && job.assigned_worker_id ? ( // funding card above owns this state
                // No ledger AND no funding path (e.g. an open report on an
                // unfunded job): the pre-payments legacy review, unchanged.
                <ReviewSection
                  key={`${job.id}:${user.id}`}
                  jobId={job.id}
                  reviewerId={user.id}
                  revieweeId={job.assigned_worker_id}
                  revieweeName={workerName}
                  revieweeRole="worker"
                  prompt={`How was ${workerName}’s work?`}
                  scrollRef={scrollRef}
                  palette={emeraldColors}
                />
              ) : null
            ) : (
              <Card palette={emeraldColors} style={[styles.noticeCard, isDark && styles.hairlineDark]}>
                <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                <Text style={styles.noticeText}>
                  Waiting for the worker to finish.
                </Text>
              </Card>
            )}
              </>
            )}
          </>
        )}
        </ScrollView>
        {primaryAction ? (
          <View style={[styles.actionBar, { paddingBottom: footerPad }]}>
            <Button
              title={primaryAction.label}
              palette={emeraldColors}
              onPress={primaryAction.onPress}
              disabled={acceptingId !== null}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      <PhotoViewer
        visible={!!avatarUri}
        uri={avatarUri}
        onClose={() => setAvatarUri(null)}
        allowShare={false}
      />

      <ConfirmDialog
        visible={!!pendingAccept}
        title={
          pendingAccept
            ? acceptOfferConfirmTitle(formatBudget(pendingAccept.amount_cents), false)
            : ''
        }
        message={
          (acceptQuote
            ? `Agreed price ${formatBudget(acceptQuote.job_price_cents)} · Protection fee ${formatBudget(
                acceptQuote.customer_fee_cents
              )} · Total charged ${formatBudget(acceptQuote.total_cents)}.\n\n`
            : '') +
          (paymentsMode === 'sandbox'
            ? 'This selects their bid for the job — the other active bids will no longer be eligible. Next you’ll authorize and protect the payment in a sandbox checkout (no real money in this build).'
            : 'This selects their bid for the job — the other active bids will no longer be eligible. Next you’ll protect the payment in checkout.')
        }
        // #64 (M-17): the confirmation repeats the button's verb and noun; the
        // total it charges is spelled out in the message above. 2026-09-30 (decision C):
        // with the quote, the button itself says what the tap does — "Accept & pay $129".
        confirmText={acceptOfferConfirmText(false, acceptQuote ? formatBudget(acceptQuote.total_cents) : undefined)}
        cancelText="Cancel"
        loading={!!pendingAccept && acceptingId === pendingAccept.id}
        palette={emeraldColors}
        onConfirm={() => pendingAccept && doAccept(pendingAccept)}
        onCancel={() => setPendingAccept(null)}
      />
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) => {
  const typography = typographyFor(colors);
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  actionBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.sm,
    // Extra clearance below the last card so that, once the review form has
    // been scrolled to the end with the keyboard open, Submit sits clear of
    // the keyboard's top edge rather than flush against it.
    paddingBottom: spacing.xxl,
  },
  jobHero: {
    gap: spacing.lg,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mint2,
  },
  // Master 8 draws the hero as a hairlined SURFACE card, not a sage fill;
  // light keeps the approved Heritage sage.
  jobHeroDark: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  // Every card and divider on masters 8, 16 and 17 is a GOLD hairline. In
  // light the Emerald Trust sage hairline is the approved arrangement, so
  // this is applied per-surface rather than by moving the token.
  hairlineDark: { borderColor: colors.border },
  dividerDark: { borderTopColor: colors.border },
  jobHeroActive: {
    // 4D-B recorded intent, carried out in the 4D-4 sweep: forest was a CARD
    // fill here, and under Prestige forest is the gold primary — a gold card
    // is wrong in both themes. The active hero now sits on surface with a
    // forest (gold in dark) accent border; the hero text tokens below
    // follow (their *Light names date from the forest-fill era).
    backgroundColor: colors.surface,
    borderColor: colors.forest,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  postedAt: {
    ...typography.caption,
    flexShrink: 1,
    textAlign: 'right',
  },
  heroTextLight: {
    color: colors.textMuted,
  },
  heroTitleLight: {
    color: colors.text,
  },
  heroEyebrowLight: {
    color: colors.emerald,
  },
  iconCircle: {
    borderRadius: radius.md,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircleDark: {
    backgroundColor: colors.mint,
  },
  jobMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  jobTitle: {
    ...typography.title,
    color: colors.ink,
    lineHeight: 34,
  },
  jobMeta: {
    flex: 1,
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 21,
  },
  jobFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
  },
  // Eyebrow law: BUDGET / AGREED PRICE is a structural card label, so gold
  // in dark; light keeps the Heritage emerald.
  valueLabel: {
    ...typography.caption,
    color: colors.eyebrow,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  valueLabelDark: { color: colors.eyebrow },
  // Masters 8, 16 and 17 all set the OWNER's own figure in cream, not green —
  // decision 6's emerald covers the marketplace-facing money (EST. PAY, feed
  // prices, Open/live/unread), which is what those examples all are.
  budget: {
    ...typography.heading,
    color: colors.money,
    fontVariant: ['tabular-nums'],
  },
  bidCount: {
    ...typography.label,
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.emerald,
  },
  ownerActions: {
    borderTopColor: colors.mint2,
  },
  scopeCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  timingCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  // Master 16 rings each logistics glyph. 30pt drawn; the row is read-only,
  // so no touch floor applies to it.
  timingGlyph: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  timingGlyphDark: {
    borderColor: colors.gold,
  },
  timingCopy: {
    flex: 1,
    gap: 2,
  },
  timingText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 21,
  },
  timingCaption: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  // Every card's section eyebrow on masters 8, 16 and 17 is gold small-caps.
  eyebrow: {
    ...typography.caption,
    color: colors.eyebrow,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  eyebrowDark: { color: colors.eyebrow },
  eyebrowGold: { color: colors.eyebrowGold }, // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
  scopeDescription: {
    ...typography.body,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  scopeTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Masters 8 and 16 both draw the scope chip as a gold OUTLINE, not a sage
  // fill — master 16 keeps its label green, which is the tag vocabulary.
  scopeTagDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  scopeTagText: {
    ...typography.label,
    color: colors.emerald,
  },
  mediaCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  sectionCaption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  noticeText: {
    flex: 1,
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 21,
  },
  approvalCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  approvalTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  bidSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  bidSectionTitle: {
    ...typography.heading,
    color: colors.ink,
    marginTop: spacing.xs,
  },
  progressCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  workerCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  paymentCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  paymentNote: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 20,
  },
  workerRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Master 17 draws this as an inner hairlined card on the card's own
  // surface, not a sage panel; light keeps the sage.
  workerRowDark: {
    backgroundColor: 'transparent',
  },
  // Master 17's shield sits in a gold ring at the payment card's right.
  paymentShield: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  workerRowPressed: {
    opacity: 0.72,
  },
  workerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  workerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workerName: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  workerMeta: {
    ...typography.label,
    color: colors.textMuted,
  },
  evidenceCard: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
  },
  photoGroup: {
    gap: spacing.sm,
  },
  photoGroupLabel: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  photoRow: {
    gap: spacing.sm,
  },
  beforeAfterPhoto: {
    width: 150,
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.neutralBg,
  },
  bidList: {
    gap: spacing.md,
  },
  errorBanner: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  errorCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  errorTitle: {
    ...typography.label,
    color: colors.danger,
    fontWeight: '800',
  },
  errorMessage: {
    ...typography.caption,
    color: colors.danger,
    lineHeight: 18,
  },
  retryText: {
    ...typography.label,
    color: colors.danger,
    fontWeight: '800',
  },
  loadingState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xxl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  // Master 8's empty-bids glyph is a ring, not a filled disc: a gold hairline
  // circle over the card's own surface. Light keeps the Heritage sage fill.
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
  },
  retryButton: {
    minWidth: 150,
    marginTop: spacing.sm,
  },
  cancelledCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.neutralBg,
    backgroundColor: colors.neutralBg,
  },
  cancelledIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  cancelledTitle: {
    ...typography.subheading,
    color: colors.ink,
    fontWeight: '800',
  },
  cancelledText: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 21,
  },
  missingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  missingIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    marginBottom: spacing.xs,
  },
  missingTitle: {
    ...typography.heading,
    color: colors.ink,
    textAlign: 'center',
  },
  missingText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  missingButton: {
    width: '100%',
    maxWidth: 300,
    marginTop: spacing.sm,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  successCircle: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successTitle: {
    ...typography.heading,
    fontWeight: '800',
    color: colors.ink,
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  });
});
