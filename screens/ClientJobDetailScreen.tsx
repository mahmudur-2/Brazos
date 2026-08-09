import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { OfferCard } from '../components/OfferCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { JobOwnerActions } from '../components/JobOwnerActions';
import { JobProgress } from '../components/JobProgress';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';
import { VerificationBadge } from '../components/VerificationBadge';
import { useAuth } from '../hooks/useAuth';
import { useJobOffers } from '../hooks/useJobOffers';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { fetchJobPaymentState, isHeld, isReleased, type Payment } from '../lib/payments';
import { DISPUTE_REASON_LABELS, fetchOpenJobDispute, type JobDispute } from '../lib/disputes';
import { MoneyText } from '../ui/primitives/MoneyText';
import { alertAsync } from '../lib/dialog';
import {
  acceptOffer,
  bestValueOfferId,
  OFFER_SORT_OPTIONS,
  sortOffers,
  type OfferSort,
  type OfferWithWorker,
} from '../lib/offers';
import { jobStage } from '../lib/jobStage';
import { deriveJobLifecycle } from '../lib/jobLifecycle';
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
import { colors, emeraldColors, radius, spacing, typography } from '../lib/theme';
import { formatTimeAgo } from '../lib/time';

export function ClientJobDetailScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'ClientJobDetail'>>();
  // Seeded from the hub card, then re-read canonically on every focus so an
  // edit made in PostJob (title, budget, location, photos, videos) is reflected
  // here the moment the poster comes back, instead of the card's snapshot from
  // whenever the hub last loaded.
  const { job, missing, refresh: refreshJob } = useOwnedJobDetail(params.job);

  const { user } = useAuth();
  const { offers: bids, loading, error, refresh: refreshBids } = useJobOffers(job.id);
  const [sort, setSort] = useState<OfferSort>('value');
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
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [rehirable, setRehirable] = useState<Set<string>>(new Set());
  // The exact service address (job_private_details). This is the poster's own
  // screen, so RLS always grants the read; it simply comes back null when the
  // posting never carried one.
  const [privateAddress, setPrivateAddress] = useState<string | null>(null);
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
  const accent = categoryAccent(job.category);
  const hasLifecycle = ['assigned', 'in_progress', 'completed'].includes(job.status);
  const pendingBids = useMemo(
    () => bids.filter((bid) => bid.status === 'pending'),
    [bids]
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
  const lifecycle = deriveJobLifecycle({ job, payment, hasOpenDispute: !!openDispute });

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
    if (result.error) setWorkerError(result.error.message);
    else setWorker(result.data);
  }, [canAccept, job.assigned_worker_id, job.id]);

  useEffect(() => {
    // React Navigation can retarget this retained route to another job. Modal,
    // viewer, sort, and payment state belong to the old job and must not follow.
    refreshRunRef.current += 1;
    setSort('value');
    setRefreshing(false);
    setPendingAccept(null);
    setViewerUri(null);
    setAvatarUri(null);
    setWorkerError(null);
    setPayment(null);
    setOpenDispute(null);
  }, [job.id]);

  // The ledger row, re-read on every focus: Checkout and the approval flow are
  // one push away and the money label here must follow what actually happened
  // there. job_payment_state() (phase51) also runs the 72h auto-release check
  // on the way — the on-read pattern; there is no cron.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (job.status === 'open' || job.status === 'cancelled') return;
      fetchJobPaymentState(job.id).then(({ data, error }) => {
        if (active && !error) setPayment(data);
      });
      fetchOpenJobDispute(job.id).then(({ data, error }) => {
        if (active && !error) setOpenDispute(data);
      });
      return () => {
        active = false;
      };
    }, [job.id, job.status])
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
    fetchJobLocation(job.id).then(({ data, error }) => {
      if (active && !error) setPrivateAddress(data?.address_line ?? null);
    });
    return () => {
      active = false;
    };
  }, [job.id]);

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

  const sortedBids = useMemo(() => sortOffers(pendingBids, sort), [pendingBids, sort]);
  const bestId = useMemo(() => bestValueOfferId(pendingBids), [pendingBids]);

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
        await alertAsync('Could not refresh job', jobResult.error.message);
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
      await alertAsync('Could not confirm bid acceptance', error.message);
      return;
    }

    setPendingAccept(null);
    proceedToCheckout();
  }

  if (missing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader
          title="Job unavailable"
          onBack={() => navigation.goBack()}
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title={canAccept ? 'Job & bids' : 'Job detail'}
        onBack={() => navigation.goBack()}
        palette={emeraldColors}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
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
        <View style={[styles.jobHero, !canAccept && styles.jobHeroActive]}>
          <View style={styles.heroTopRow}>
            <StatusBadge status={stage.statusKey} label={stage.label} />
            <Text style={[styles.postedAt, !canAccept && styles.heroTextLight]}>
              Posted {formatTimeAgo(job.created_at)}
            </Text>
          </View>

          <Text style={[styles.jobTitle, !canAccept && styles.heroTitleLight]}>
            {job.title}
          </Text>

          <View style={styles.jobMetaRow}>
            <View style={[styles.iconCircle, { backgroundColor: accent.bg }]}>
              <Ionicons
                name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                size={18}
                color={accent.icon}
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

          <View style={styles.jobFooter}>
            <View>
              <Text style={[styles.valueLabel, !canAccept && styles.heroEyebrowLight]}>
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
            style={styles.ownerActions}
          />
        </View>

        <Card palette={emeraldColors} style={styles.scopeCard}>
          <Text style={styles.eyebrow}>JOB SCOPE</Text>
          <Text style={styles.scopeDescription} selectable>
            {job.description}
          </Text>
          <View style={styles.scopeTag}>
            <Ionicons
              name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
              size={15}
              color={colors.emerald}
            />
            <Text style={styles.scopeTagText}>
              {JOB_CATEGORY_LABELS[job.category] ?? job.category}
            </Text>
          </View>
        </Card>

        {arrivalWindowLabel(job) || privateAddress ? (
          <Card palette={emeraldColors} style={styles.timingCard}>
            <Text style={styles.eyebrow}>TIMING &amp; ADDRESS</Text>
            {arrivalWindowLabel(job) ? (
              <View style={styles.timingRow}>
                <Ionicons name="time-outline" size={18} color={colors.emerald} />
                <Text style={styles.timingText}>{arrivalWindowLabel(job)}</Text>
              </View>
            ) : null}
            {privateAddress ? (
              <View style={styles.timingRow}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.emerald} />
                <View style={styles.timingCopy}>
                  <Text style={styles.timingText} selectable>
                    {privateAddress}
                  </Text>
                  <Text style={styles.timingCaption}>
                    Private — only you and the worker you hire can see this address.
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}

        {canAccept && (job.photos.length > 0 || job.videos.length > 0) ? (
          <Card palette={emeraldColors} style={styles.mediaCard}>
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
                    <Image source={{ uri: url }} style={styles.beforeAfterPhoto} />
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
              <View style={styles.emptyIcon}>
                <Ionicons name="cloud-offline-outline" size={32} color={colors.emerald} />
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
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={32} color={colors.emerald} />
              </View>
              <Text style={styles.emptyTitle}>
                {bids.length > 0 ? 'No active bids' : 'No bids yet'}
              </Text>
              <Text style={styles.emptyText}>
                {bids.length > 0
                  ? 'Previous bids were withdrawn or closed. New pending bids will appear here.'
                  : 'When workers bid on this job, they’ll appear here ranked by value.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.bidSectionHeader}>
                <View>
                  <Text style={styles.eyebrow}>WORKER OFFERS</Text>
                  <Text style={styles.bidSectionTitle}>
                    {pendingBids.length}{' '}
                    {pendingBids.length === 1 ? 'bid' : 'bids'} to compare
                  </Text>
                </View>
                {pendingBids.length > 1 && (
                  <Button
                    title="Compare"
                    size="sm"
                    variant="secondary"
                    palette={emeraldColors}
                    onPress={() => navigation.navigate('CompareBids', { job })}
                  />
                )}
              </View>
              {pendingBids.length > 1 && (
                <SegmentedControl
                  options={OFFER_SORT_OPTIONS}
                  value={sort}
                  onChange={setSort}
                  palette={emeraldColors}
                />
              )}

              <View style={styles.bidList}>
                {sortedBids.map((bid) => {
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
                      palette={emeraldColors}
                      isBestValue={bid.id === bestId && pendingBids.length > 1}
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
              <Card palette={emeraldColors} style={styles.cancelledCard}>
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
              <Card palette={emeraldColors} style={styles.progressCard}>
                <Text style={styles.eyebrow}>JOB PROGRESS</Text>
                <Text style={styles.sectionTitle}>Where things stand</Text>
                <JobProgress status={job.status} palette={emeraldColors} />
              </Card>
            ) : null}

            <Card palette={emeraldColors} style={styles.workerCard}>
              <Text style={styles.eyebrow}>ASSIGNED WORKER</Text>
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
                style={({ pressed }) => [styles.workerRow, pressed && styles.workerRowPressed]}
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
                    {assignedWorker ? (
                      <VerificationBadge status={assignedWorker.verification_status} />
                    ) : null}
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
            {job.assigned_worker_id &&
              (job.status === 'assigned' || job.status === 'in_progress') && (
                <Button
                  title="Track worker"
                  variant="secondary"
                  palette={emeraldColors}
                  onPress={() => navigation.navigate('TrackWorker', { job })}
                />
              )}

            {/* The money truth for this job (phase50 ledger). Labels come from
                MoneyText's fixed §H.3 captions — never hand-written here. */}
            {job.status === 'assigned' ? (
              payment && isHeld(payment) ? (
                <Card palette={emeraldColors} style={styles.paymentCard}>
                  <Text style={styles.eyebrow}>PROTECTED PAYMENT · SANDBOX</Text>
                  <MoneyText cents={payment.amount_cents} state={payment.status} size="lg" />
                  <Text style={styles.paymentNote}>
                    Funds stay held until you approve the finished work. Sandbox
                    build — no real money moves.
                  </Text>
                </Card>
              ) : (
                <Card palette={emeraldColors} style={styles.paymentCard}>
                  <Text style={styles.eyebrow}>PAYMENT NOT PROTECTED YET</Text>
                  <Text style={styles.paymentNote}>
                    {workerName} is hired, but the payment isn’t in protection yet.
                    {payment?.status === 'authorized'
                      ? ' It’s authorized — not charged — finish checkout to protect it.'
                      : ''}
                  </Text>
                  <Button
                    title="Protect payment in checkout"
                    palette={emeraldColors}
                    onPress={() => navigation.navigate('Checkout', { job })}
                  />
                </Card>
              )
            ) : payment ? (
              <Card palette={emeraldColors} style={styles.paymentCard}>
                <Text style={styles.eyebrow}>PAYMENT · SANDBOX</Text>
                <MoneyText cents={payment.amount_cents} state={payment.status} />
              </Card>
            ) : null}

            {/* Before/after: the client's own posting photos next to what the
                worker submitted on completion. Rendered as soon as the worker
                marks the job done, so the client reviews the finished work
                here rather than having to ask for it. */}
            {(job.photos.length > 0 || job.videos.length > 0 || hasCompletionEvidence) && (
              <Card palette={emeraldColors} style={styles.evidenceCard}>
                <Text style={styles.eyebrow}>WORK EVIDENCE</Text>
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
                          <Image source={{ uri: url }} style={styles.beforeAfterPhoto} />
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
                          <Image source={{ uri: url }} style={styles.beforeAfterPhoto} />
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
              // Phase 6, §9 ordering: with a payment on the job, approval
              // comes FIRST — release the held funds (or report an issue) on
              // screen 36, review & tip on screen 37 only after release. A
              // legacy job that completed without any payment keeps the old
              // inline review, since there is nothing to release.
              payment ? (
                lifecycle === 'disputed' && openDispute ? (
                  <Card palette={emeraldColors} style={styles.approvalCard}>
                    <Text style={styles.approvalTitle}>Issue reported</Text>
                    <Text style={styles.noticeText}>
                      {DISPUTE_REASON_LABELS[openDispute.reason]} — the payment
                      stays held while your report is open.
                    </Text>
                    <Button
                      title="Manage your report"
                      palette={emeraldColors}
                      onPress={() => navigation.navigate('ApproveOrDispute', { job })}
                    />
                  </Card>
                ) : lifecycle === 'awaiting_approval' ? (
                  <Card palette={emeraldColors} style={styles.approvalCard}>
                    <Text style={styles.approvalTitle}>The work is done — your call</Text>
                    <Text style={styles.noticeText}>
                      Review what {workerName} submitted, then approve to release
                      the held funds or report an issue. With no response, the
                      funds release automatically after 72 hours.
                    </Text>
                    <Button
                      title="Review & approve the work"
                      palette={emeraldColors}
                      onPress={() => navigation.navigate('ApproveOrDispute', { job })}
                    />
                  </Card>
                ) : isReleased(payment) ? (
                  <Card palette={emeraldColors} style={styles.approvalCard}>
                    <Text style={styles.approvalTitle}>Payment released</Text>
                    <Text style={styles.noticeText}>
                      All settled with {workerName}. Leave a review — and a tip,
                      if you’d like.
                    </Text>
                    <Button
                      title="Review & tip"
                      palette={emeraldColors}
                      onPress={() => navigation.navigate('ReviewAndTip', { job })}
                    />
                  </Card>
                ) : (
                  <Card palette={emeraldColors} style={styles.approvalCard}>
                    <Text style={styles.approvalTitle}>Payment unfinished</Text>
                    <Text style={styles.noticeText}>
                      The job is complete but the payment never reached
                      protection. Finish checkout to protect and then release it.
                    </Text>
                    <Button
                      title="Finish checkout"
                      palette={emeraldColors}
                      onPress={() => navigation.navigate('Checkout', { job })}
                    />
                  </Card>
                )
              ) : user && job.assigned_worker_id ? (
                <ReviewSection
                  key={`${job.id}:${user.id}`}
                  jobId={job.id}
                  reviewerId={user.id}
                  revieweeId={job.assigned_worker_id}
                  revieweeName={workerName}
                  prompt={`How was ${workerName}’s work?`}
                  scrollRef={scrollRef}
                  palette={emeraldColors}
                />
              ) : null
            ) : (
              <Card palette={emeraldColors} style={styles.noticeCard}>
                <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                <Text style={styles.noticeText}>
                  Waiting for the worker to finish. You can leave a review once the
                  job is completed.
                </Text>
              </Card>
            )}
              </>
            )}
          </>
        )}
        </ScrollView>
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
            ? `Accept ${formatBudget(pendingAccept.amount_cents)} from ${
                pendingAccept.worker?.full_name ?? 'this worker'
              }?`
            : ''
        }
        message="This selects their bid for the job — the other active bids will no longer be eligible. Next you’ll authorize and protect the payment in a sandbox checkout (no real money in this build)."
        confirmText="Accept bid"
        cancelText="Cancel"
        loading={!!pendingAccept && acceptingId === pendingAccept.id}
        palette={emeraldColors}
        onConfirm={() => pendingAccept && doAccept(pendingAccept)}
        onCancel={() => setPendingAccept(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // Extra clearance below the last card so that, once the review form has
    // been scrolled to the end with the keyboard open, Submit sits clear of
    // the keyboard's top edge rather than flush against it.
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  jobHero: {
    padding: spacing.xl,
    gap: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mint2,
  },
  jobHeroActive: {
    backgroundColor: colors.forest,
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
    color: colors.mint2,
  },
  heroTitleLight: {
    color: colors.onPrimary,
  },
  heroEyebrowLight: {
    color: colors.goldSoft,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
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
  valueLabel: {
    ...typography.caption,
    color: colors.emerald,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  budget: {
    ...typography.heading,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  bidCount: {
    ...typography.label,
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
  eyebrow: {
    ...typography.caption,
    color: colors.emerald,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
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
    color: colors.textMuted,
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
