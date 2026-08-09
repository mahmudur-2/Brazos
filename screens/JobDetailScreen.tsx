import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BrowseJobCard } from '../components/BrowseJobCard';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { JobOwnerActions } from '../components/JobOwnerActions';
import { JobVideo } from '../components/JobVideo';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import { useAuth } from '../hooks/useAuth';
import { useOpenJobDetail } from '../hooks/useJobDetail';
import { useOpenJobs } from '../hooks/useOpenJobs';
import {
  arrivalWindowLabel,
  budgetRangeLabel,
  categoryAccent,
  dollarsToCents,
  fetchClientJobStats,
  formatBudget,
  hasBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { Avatar } from '../components/Avatar';
import { createMarketplaceOffer, fetchMyOfferForJob, type Offer } from '../lib/offers';
import { alertAsync } from '../lib/dialog';
import { maybePromptForPush } from '../lib/pushNotifications';
import { formatTimeAgo } from '../lib/time';
import type { JobDetailRouteParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

// There is no identity-verification provider yet. Keep this explicit rather
// than presenting a trust signal the product cannot currently substantiate.
const VERIFICATION_LABEL = 'Unverified';

/**
 * No payments, commission, or ledger system exists at any layer yet
 * (BUILD_STATE: "payment implementation does not exist"). This constant
 * exists ONLY to drive the clearly-labeled payout ESTIMATE below — it is a
 * local assumption about a future fee, not a read of any real fee schedule,
 * and the UI copy says so. Phase 5's sandbox checkout owns the real number.
 */
const ESTIMATED_PLATFORM_FEE_RATE = 0.1;

function afterFeeCents(cents: number): number {
  return Math.round(cents * (1 - ESTIMATED_PLATFORM_FEE_RATE));
}

/** "$45–$54" / "$54" — the job's budget with the estimated fee taken off. */
function payoutEstimateLabel(job: OpenJob): string | null {
  const min = job.budget_min_cents;
  const max = job.budget_max_cents ?? job.budget_cents;
  if (max == null) return null;
  if (min != null && min !== max) {
    return `${formatBudget(afterFeeCents(min))}–${formatBudget(afterFeeCents(max))}`;
  }
  return formatBudget(afterFeeCents(max));
}

export function JobDetailScreen() {
  // Registered in three different stacks (Home, MyJobs, Map) — like Chat, its
  // nav/route types are standalone rather than tied to one parent stack.
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<JobDetailRouteParamList, 'JobDetail'>>();
  // The route param is only the seed. Every list that can reach this screen
  // (Home preview, All Open Jobs, the map zone drill-down, a pending bid card)
  // hands over its own snapshot; re-reading through one canonical fetch is what
  // makes the same job show the same media, budget and status regardless of
  // which of them opened it, and what picks up the poster's edits on the way
  // back from PostJob.
  const { job, missing } = useOpenJobDetail(params.job);
  const { user } = useAuth();

  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Separate from `submitting` so the two bid paths disable each other while
  // either is in flight, and repeated taps on the listed-price button cannot
  // stack a second create_bid call behind the first.
  const [takingListedPrice, setTakingListedPrice] = useState(false);
  const [existingBid, setExistingBid] = useState<Offer | null>(null);
  const [checking, setChecking] = useState(true);
  // The posting customer's public profile + real posting history — the
  // customer-side trust signals screen 51 shows a browsing worker. Rendered
  // only once loaded; nothing is fabricated while they're in flight.
  const [poster, setPoster] = useState<Profile | null>(null);
  const [posterStats, setPosterStats] = useState<{ posted: number; completed: number } | null>(
    null
  );
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [confirmBidVisible, setConfirmBidVisible] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isOwnJob = !!user && job.client_id === user.id;
  const accent = categoryAccent(job.category);
  const galleryPhotos = job.photos ?? [];
  const heroHeight = Math.min(340, Math.max(260, Math.round(screenWidth * 0.82)));

  // Content otherwise stops dead after the two cards below, leaving a blank
  // scroll area down to the tab bar. Reuses the same open-jobs feed Home's
  // preview list is built on — same-category matches first, newest within
  // that, current job excluded, capped at 3.
  const { jobs: openJobs } = useOpenJobs();
  const similarJobs: OpenJob[] = openJobs
    .filter((j) => j.id !== job.id)
    .sort((a, b) => {
      const aMatch = a.category === job.category ? 0 : 1;
      const bMatch = b.category === job.category ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 3);

  useEffect(() => {
    let active = true;
    if (!user || isOwnJob) {
      setChecking(false);
      return;
    }
    fetchMyOfferForJob(user.id, job.id).then(({ data }) => {
      if (active) {
        setExistingBid(data);
        setChecking(false);
      }
    });
    return () => {
      active = false;
    };
  }, [user, job.id, isOwnJob]);

  // A retained JobDetail route may be re-targeted from a similar-job card.
  // Always lead with that job's poster-selected first photo.
  useEffect(() => {
    setActivePhotoIndex(0);
  }, [job.id]);

  useEffect(() => {
    let active = true;
    setPoster(null);
    setPosterStats(null);
    if (isOwnJob) return;
    fetchProfileById(job.client_id).then(({ data, error }) => {
      if (active && !error) setPoster(data);
    });
    fetchClientJobStats(job.client_id).then(({ data, error }) => {
      if (active && !error) setPosterStats(data);
    });
    return () => {
      active = false;
    };
  }, [job.client_id, isOwnJob]);

  /**
   * Shared tail of both bid paths. Everything that decides whether the bid is
   * allowed — job still open, not your own job, not blocked, no existing bid —
   * lives in create_bid(), so this only has to report what came back.
   */
  async function placeBid(amountCents: number, pitch: string) {
    if (!user) return false;

    const { data: offerId, error } = await createMarketplaceOffer({
      jobId: job.id,
      amountCents,
      message: pitch,
    });

    if (error) {
      const msg =
        error.code === '23505'
          ? 'You already have a bid on this job.'
          : error.message;
      await alertAsync('Could not place bid', msg);
      // A duplicate means someone (this screen, a second tap, another device)
      // already bid — resync so the form is replaced by the real bid rather
      // than inviting another attempt.
      if (error.code === '23505') {
        const { data: mine } = await fetchMyOfferForJob(user.id, job.id);
        setExistingBid(mine);
      }
      return false;
    }

    // create_offer() returns the new offer's id, not the row — job_offers is
    // RLS-locked to SELECT, so the authoritative row is read back rather than
    // assembled client-side from what was just sent.
    if (offerId) {
      const { data: mine } = await fetchMyOfferForJob(user.id, job.id);
      setExistingBid(mine);
    }
    return true;
  }

  /**
   * "I'll do it for $X" — a bid at the poster's own listed budget, so a worker
   * who is simply happy with the advertised price does not have to retype it
   * and invent a pitch.
   *
   * It is an ordinary bid, deliberately: same table, same create_bid()
   * validation, same competing-bid handling, and the same accept_bid() the
   * poster already uses. Pressing it books nothing — the poster still has to
   * choose this worker over the others.
   */
  function handleTakeListedPrice() {
    if (!user || job.budget_cents == null || takingListedPrice || submitting) return;
    setConfirmBidVisible(true);
  }

  async function confirmTakeListedPrice() {
    if (!user || job.budget_cents == null) return;

    setTakingListedPrice(true);
    const sent = await placeBid(
      job.budget_cents,
      `I can do this for your listed budget of ${formatBudget(job.budget_cents)}.`
    );
    setTakingListedPrice(false);
    setConfirmBidVisible(false);
    if (!sent) return;

    await alertAsync(
      'Offer sent',
      'The client can see your offer and open your profile from it.'
    );
    await maybePromptForPush(
      'Get told the moment this client accepts your offer — and when new jobs like this are posted.'
    );
    navigation.getParent()?.navigate('MyJobs' as never);
  }

  async function handleSubmit() {
    if (!user) return;

    const amountCents = dollarsToCents(amount);
    if (amountCents == null) {
      await alertAsync('Enter a bid', 'Please enter your bid amount.');
      return;
    }
    if (Number.isNaN(amountCents) || amountCents <= 0) {
      await alertAsync('Invalid amount', 'Your bid must be a positive dollar amount.');
      return;
    }
    if (!message.trim()) {
      await alertAsync('Add a pitch', 'Add a short message telling the client why to pick you.');
      return;
    }

    setSubmitting(true);
    const placed = await placeBid(amountCents, message.trim());
    setSubmitting(false);
    if (!placed) return;

    await alertAsync('Bid placed', 'The client can now see your bid.');

    // Second good moment to ask: they have a bid in flight whose outcome they
    // now care about. No-ops if the PostJob path already asked.
    await maybePromptForPush(
      'Get told the moment this client accepts your bid — and when new jobs like this are posted.'
    );

    // Show the worker their pending bid in the My Jobs hub tab.
    navigation.getParent()?.navigate('MyJobs' as never);
  }

  // The canonical read came back empty: the poster deleted the job while this
  // screen was open (or on a stale card the list has not dropped yet). Saying
  // so beats leaving a bid form pointed at a row that no longer exists.
  if (missing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Job details" onBack={() => navigation.goBack()} />
        <View style={styles.missing}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
          <Text style={styles.missingTitle}>This job is no longer available</Text>
          <Text style={styles.missingText}>
            The person who posted it has taken it down.
          </Text>
          <Button title="Go back" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {galleryPhotos.length > 0 ? (
            <View style={[styles.heroMedia, { height: heroHeight }]}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
                  setActivePhotoIndex(
                    Math.max(0, Math.min(nextIndex, galleryPhotos.length - 1))
                  );
                }}
              >
                {galleryPhotos.map((url, index) => (
                  <Pressable
                    key={url}
                    style={{ width: screenWidth, height: heroHeight }}
                    onPress={() => setViewerUri(url)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Open photo ${index + 1} of ${galleryPhotos.length}`}
                  >
                    <Image source={{ uri: url }} style={styles.heroPhoto} resizeMode="cover" />
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                onPress={() => navigation.goBack()}
                style={[styles.heroBack, { top: insets.top + spacing.sm }]}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Ionicons name="chevron-back" size={28} color={colors.white} />
              </Pressable>

              {galleryPhotos.length > 1 ? (
                <View style={styles.photoCount} pointerEvents="none">
                  <Text style={styles.photoCountText}>
                    {activePhotoIndex + 1}/{galleryPhotos.length}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <ScreenHeader title="Job details" onBack={() => navigation.goBack()} />
          )}

          <View style={styles.detailContent}>
            <View style={styles.detailSurface}>
            <View style={styles.jobHeader}>
              <View style={[styles.iconCircle, { backgroundColor: accent.bg }]}>
                <Ionicons
                  name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                  size={22}
                  color={accent.icon}
                />
              </View>
              <View style={styles.jobHeaderText}>
                <Text style={styles.category}>
                  {JOB_CATEGORY_LABELS[job.category] ?? job.category}
                </Text>
                <Text style={styles.time}>Posted {formatTimeAgo(job.created_at)}</Text>
              </View>
              <View style={styles.unverifiedBadge}>
                <Ionicons name="shield-outline" size={15} color={colors.neutral} />
                <Text style={styles.unverifiedText}>{VERIFICATION_LABEL}</Text>
              </View>
            </View>

            <Text style={styles.title}>{job.title}</Text>

            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={20} color={colors.textMuted} />
              <Text style={styles.detailText}>{job.location ?? 'No location set'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={20} color={colors.textMuted} />
              <Text style={styles.detailText}>
                {hasBudget(job) ? `${budgetRangeLabel(job)} budget` : 'Open budget'}
              </Text>
            </View>
            {arrivalWindowLabel(job) ? (
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                <Text style={styles.detailText}>Arrive {arrivalWindowLabel(job)}</Text>
              </View>
            ) : null}

            {job.description ? <Text style={styles.description}>{job.description}</Text> : null}

            {job.videos?.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.videoRow}
              >
                {job.videos.map((url, index) => (
                  <JobVideo
                    key={url}
                    uri={url}
                    label={job.videos.length > 1 ? `Watch clip ${index + 1}` : 'Watch clip'}
                  />
                ))}
              </ScrollView>
            ) : null}

            {isOwnJob ? (
              <JobOwnerActions jobId={job.id} posterId={job.client_id} status={job.status} />
            ) : null}
            </View>

          {isOwnJob ? (
            <Card style={[styles.noticeCard, styles.secondaryCard]}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
              <Text style={styles.noticeText}>This is your job — you can’t bid on it.</Text>
            </Card>
          ) : checking ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : existingBid ? (
            <Card style={styles.secondaryCard}>
              <View style={styles.bidHeader}>
                <Text style={styles.sectionTitle}>Your bid</Text>
                <StatusBadge status={existingBid.status} />
              </View>
              <Text style={styles.bidAmount}>{formatBudget(existingBid.amount_cents)}</Text>
              {existingBid.message ? (
                <Text style={styles.bidMessage}>“{existingBid.message}”</Text>
              ) : null}
              <Text style={styles.bidNote}>
                You’ve already bid on this job. Check My Bids for updates.
              </Text>
            </Card>
          ) : (
            <>
              {/* Customer-side trust signals: real profile, real counted
                  history. Rendered only once loaded — never placeholders. */}
              {poster ? (
                <Card style={[styles.posterCard, styles.secondaryCard]}>
                  <Text style={styles.sectionTitle}>Posted by</Text>
                  <View style={styles.posterRow}>
                    <Avatar name={poster.full_name} uri={poster.avatar_url} size={48} />
                    <View style={styles.posterCopy}>
                      <Text style={styles.posterName} numberOfLines={1}>
                        {poster.full_name ?? 'BRAZOS customer'}
                      </Text>
                      {posterStats ? (
                        <Text style={styles.posterMeta}>
                          {posterStats.posted}{' '}
                          {posterStats.posted === 1 ? 'job' : 'jobs'} posted ·{' '}
                          {posterStats.completed} completed
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              ) : null}

              {/* Payout after fee — a clearly-labeled ESTIMATE (see
                  ESTIMATED_PLATFORM_FEE_RATE). Payments don't exist yet and
                  the copy says so; nothing here reads a ledger. */}
              {payoutEstimateLabel(job) ? (
                <Card style={[styles.payoutCard, styles.secondaryCard]}>
                  <Text style={styles.priceEyebrow}>Est. payout after fee</Text>
                  <Text style={styles.payoutAmount}>{payoutEstimateLabel(job)}</Text>
                  <Text style={styles.payoutNote}>
                    Estimate only, from the customer’s stated budget minus a{' '}
                    {Math.round(ESTIMATED_PLATFORM_FEE_RATE * 100)}% platform fee. Payments
                    aren’t live in BRAZOS yet, so nothing is charged or paid through the
                    app — you settle directly with the customer.
                  </Text>
                </Card>
              ) : null}

              {/* Happy with the advertised price? One tap, no retyping the
                  number and no inventing a pitch. Still an ordinary bid the
                  poster has to accept. */}
              {job.budget_cents != null && (
                <Card style={[styles.listedPriceCard, styles.secondaryCard]}>
                  <Text style={styles.priceEyebrow}>Take it at the listed price</Text>
                  <View style={styles.listedPriceInfo}>
                    <View style={styles.priceIcon}>
                      <Ionicons name="cash-outline" size={22} color={colors.primary} />
                    </View>
                    <View style={styles.priceCopy}>
                      <Text style={styles.listedPriceTitle}>
                        You’ll offer {formatBudget(job.budget_cents)}
                      </Text>
                      <Text style={styles.quickBidText}>
                        Sends the listed-price bid. The client still chooses who gets the job.
                      </Text>
                    </View>
                  </View>
                  <Button
                    title={`I’ll do it for ${formatBudget(job.budget_cents)}`}
                    icon="sparkles"
                    onPress={handleTakeListedPrice}
                    loading={takingListedPrice}
                    disabled={submitting}
                    style={styles.quickBidAction}
                  />
                </Card>
              )}

              <Card style={styles.secondaryCard}>
                <Text style={styles.sectionTitle}>
                  {job.budget_cents != null ? 'Or name your own price' : 'Place a bid'}
                </Text>
                <View style={styles.form}>
                  <TextField
                    label="Your bid (USD)"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="e.g. 45"
                    keyboardType="numeric"
                  />
                  <TextField
                    label="Pitch"
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Why should the client pick you?"
                    autoCapitalize="sentences"
                    multiline
                    numberOfLines={3}
                    style={styles.multiline}
                  />
                  <Button
                    title="Place bid"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={takingListedPrice}
                  />
                </View>
              </Card>
            </>
          )}

          {similarJobs.length > 0 && (
            <View style={[styles.similarSection, styles.secondarySection]}>
              <Text style={styles.similarTitle}>Similar open jobs</Text>
              <View style={styles.similarList}>
                {similarJobs.map((sj) => (
                  <BrowseJobCard
                    key={sj.id}
                    job={sj}
                    onPress={() => (navigation as any).navigate('JobDetail', { job: sj })}
                  />
                ))}
              </View>
            </View>
          )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
      />

      {job.budget_cents != null && (
        <ConfirmDialog
          visible={confirmBidVisible}
          title={`Send a ${formatBudget(job.budget_cents)} bid?`}
          message="The client will receive your bid and decide who gets the job."
          confirmText="Send bid"
          cancelText="Cancel"
          loading={takingListedPrice}
          onConfirm={confirmTakeListedPrice}
          onCancel={() => setConfirmBidVisible(false)}
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
  flex: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: 0,
  },
  heroMedia: {
    backgroundColor: colors.neutralBg,
    overflow: 'hidden',
  },
  heroPhoto: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.neutralBg,
  },
  heroBack: {
    position: 'absolute',
    left: spacing.lg,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  photoCount: {
    position: 'absolute',
    left: spacing.lg,
    bottom: spacing.lg,
    minWidth: 48,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  photoCountText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  detailContent: {
    gap: spacing.lg,
    backgroundColor: colors.surface,
  },
  detailSurface: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobHeaderText: {
    flex: 1,
    gap: 2,
  },
  category: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  time: {
    fontSize: 13,
    color: colors.textMuted,
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralBg,
  },
  unverifiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.neutral,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  detailText: {
    flex: 1,
    fontSize: 16,
    color: colors.textMuted,
  },
  description: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    marginTop: spacing.lg,
  },
  videoRow: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryCard: {
    marginHorizontal: spacing.lg,
  },
  secondarySection: {
    marginHorizontal: spacing.lg,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  listedPriceCard: {
    gap: spacing.md,
  },
  posterCard: {
    gap: spacing.md,
  },
  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  posterCopy: {
    flex: 1,
    gap: 2,
  },
  posterName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  posterMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  payoutCard: {
    gap: spacing.sm,
  },
  payoutAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  payoutNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  priceEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  listedPriceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.homeBackground,
  },
  priceIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  priceCopy: {
    flex: 1,
    gap: 2,
  },
  listedPriceTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  similarSection: {
    gap: spacing.md,
  },
  similarTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  similarList: {
    gap: spacing.md,
  },
  quickBidText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  quickBidAction: {
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  multiline: {
    height: 90,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  bidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bidAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  bidMessage: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  bidNote: {
    fontSize: 13,
    color: colors.textSubtle,
    marginTop: spacing.md,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  missingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  missingText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
