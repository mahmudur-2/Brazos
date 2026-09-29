import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryGlyph } from '../components/CategoryGlyph';
import { BrowseJobCard } from '../components/BrowseJobCard';
import { Button } from '../components/Button';
import { MarketJobPreview } from '../components/MarketJobPreview';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { JobOwnerActions } from '../components/JobOwnerActions';
import { JobVideo } from '../components/JobVideo';
import { OfferResponseActions } from '../components/OfferResponseActions';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusBadge } from '../components/StatusBadge';
import {
  acceptOfferConfirmText,
  acceptOfferConfirmTitle,
  declineOfferActionLabel,
  declineOfferConfirmTitle,
  offerExpiryLabel,
  offerResponseNote,
} from '../lib/offerCopy';
import { useAuth } from '../hooks/useAuth';
import { useOpenJobDetail } from '../hooks/useJobDetail';
import { useMode } from '../modes';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { deriveMatchReasons } from '../lib/matchReasons';
import { type DistanceFilterMiles } from '../lib/discoveryFilter';
import { readDistanceFilter } from '../lib/discoveryFilterStorage';
import { fetchWorkerServices } from '../lib/services';
import {
  arrivalWindowLabel,
  budgetRangeLabel,
  categoryAccent,
  formatBudget,
  hasBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import { fetchProfileById, type Profile } from '../lib/profiles';
import { Avatar } from '../components/Avatar';
import {
  acceptOffer,
  countersRemaining,
  createMarketplaceOffer,
  declineOffer,
  fetchMyOfferForJob,
  fetchOfferChain,
  isOfferLapsed,
  withdrawOffer,
  type Offer,
} from '../lib/offers';
import { OfferComposer } from '../components/OfferComposer';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome, navigateAcrossTabs } from '../lib/navigationRef';
import { fetchClientJobStatsCounted } from '../lib/clientStats';
import { maybePromptForPush } from '../lib/pushNotifications';
import { formatTimeAgo } from '../lib/time';
import { useShellGround } from '../lib/shellGround';
import type { JobDetailRouteParamList } from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';
import { quoteJobPrice, type JobPriceQuote } from '../lib/payments';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  litCardStyle,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { PINNED_FOOTER_BOTTOM_PADDING, useScrollClearance } from '../ui/primitives';

/**
 * The worker's take on this job — "$45–$54" / "$54" — comes from
 * quote_job_price(), the database's own schedule and the ONLY price
 * arithmetic in the marketplace (R6a, D11). This screen once owned a local
 * ESTIMATED_PLATFORM_FEE_RATE = 0.1 and quoted 90% of the budget while
 * checkout and Earnings showed no fee at all; then a shared client constant
 * stood in for a schedule that did not exist. Neither survives: the figure is
 * read, never computed, so it can never again be lower than what the worker
 * is paid. See payoutEstimateLabel inside the component.
 */
type PayoutQuote =
  | 'loading'
  | 'failed'
  | { min: number | null; max: number; fee: boolean };

export function JobDetailScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C8) — THE WORKER'S VIEW OF A JOB, ITS OWN FOUR. Each falls back to
  // the value this file drew before the dial existed, spelled here and nowhere
  // else; the three token-backed ones take the `theme.*` scale this file
  // imports spacing/radius from.
  const detailPaddingX = useDialNumber('jobDetail.detailSurface.paddingX') ?? spacing.xl;
  const detailPaddingY = useDialNumber('jobDetail.detailSurface.paddingY') ?? spacing.lg;
  const detailGap = useDialNumber('jobDetail.detailContent.gap') ?? spacing.lg;
  const iconCircleSize = useDialNumber('jobDetail.iconCircle.size') ?? 54;
  // RUN H3 (C3): the same declaration customer Home makes, and for the same
  // reason — this screen's page ground is `homeBackground`, so without it the
  // mode shell paints `background` in the floating pill's margins and a band
  // of a second ivory runs under the bar. See lib/shellGround.tsx.
  useShellGround('homeBackground');
  // emerald(3): the floating pill's real footprint.
  const navClearance = useScrollClearance();
  // The shared meta-glyph rule (prestige 3c, WorkerJobCard): gold in dark,
  // Heritage muted in light.
  const metaGlyph = isDark ? colors.gold : colors.textMuted;
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
  // §10: perspective comes from ModeContext — see the customer-mode delegation
  // to MarketJobPreview below.
  const { mode } = useMode();

  // Guards the one inline bid path left on this screen (the listed-price
  // quick bid) so repeated taps cannot stack a second create_offer call.
  // The custom-terms path moved to the SubmitBid route (screen 52), where
  // OfferComposer owns its own in-flight guard.
  const [takingListedPrice, setTakingListedPrice] = useState(false);
  const [existingBid, setExistingBid] = useState<Offer | null>(null);
  // The full chain behind existingBid (every revision sharing its root) —
  // what countersRemaining() counts. Empty when there is no live chain.
  const [chain, setChain] = useState<Offer[]>([]);
  const [checking, setChecking] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [responding, setResponding] = useState<'accept' | 'decline' | null>(null);
  const [confirmResponse, setConfirmResponse] = useState<'accept' | 'decline' | null>(null);
  const [showCounterForm, setShowCounterForm] = useState(false);
  // Sync guard: two fast taps both read the old state before React paints.
  const respondingRef = useRef(false);
  const [confirmWithdrawVisible, setConfirmWithdrawVisible] = useState(false);
  // The posting customer's public profile + real posting history — the
  // customer-side trust signals screen 51 shows a browsing worker. Rendered
  // only once loaded; nothing is fabricated while they're in flight.
  const [poster, setPoster] = useState<Profile | null>(null);
  const [posterStats, setPosterStats] = useState<{
    posted: number;
    completed: number;
    cancelled: number;
  } | null>(
    null
  );
  // A failed poster/history read renders as a retry row in the card's place —
  // never as a job with no poster to show (F-026).
  const [posterReadFailed, setPosterReadFailed] = useState(false);
  const [posterReadAttempt, setPosterReadAttempt] = useState(0);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [confirmBidVisible, setConfirmBidVisible] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isOwnJob = !!user && job.client_id === user.id;

  // D11: one quote_job_price() read per distinct figure — a min–max budget is
  // two calls, a single budget one — only for the worker view that renders
  // the payout card. worker_receives_cents is shown as returned.
  const quoteMin = job.budget_min_cents;
  const quoteMax = job.budget_max_cents ?? job.budget_cents;
  const [payoutQuote, setPayoutQuote] = useState<PayoutQuote>('loading');
  useEffect(() => {
    let active = true;
    setPayoutQuote('loading');
    if (mode !== 'worker' || isOwnJob || quoteMax == null) return;
    const distinct = quoteMin != null && quoteMin !== quoteMax ? [quoteMin, quoteMax] : [quoteMax];
    Promise.all(distinct.map((cents) => quoteJobPrice(cents))).then((results) => {
      if (!active) return;
      const quotes = results.map((result) => result.data);
      if (quotes.some((quote) => quote == null)) {
        setPayoutQuote('failed');
        return;
      }
      const receives = (quotes as JobPriceQuote[]).map((quote) => quote.worker_receives_cents);
      const fee = (quotes as JobPriceQuote[]).some((quote) => quote.worker_fee_cents > 0);
      setPayoutQuote(
        distinct.length === 2
          ? { min: receives[0], max: receives[1], fee }
          : { min: null, max: receives[0], fee }
      );
    });
    return () => {
      active = false;
    };
  }, [mode, isOwnJob, quoteMin, quoteMax]);

  /**
   * "$45–$54" / "$54" — what the worker would actually receive, off the
   * quote. While the quote loads it is an ellipsis; when the read failed it
   * is the customer's stated budget alone, with no fee line and never a
   * computed one; null when the job carries no budget at all.
   */
  const payoutEstimateLabel = (open: OpenJob): string | null => {
    if (quoteMax == null) return null;
    if (payoutQuote === 'loading') return '…';
    if (payoutQuote === 'failed') return budgetRangeLabel(open);
    return payoutQuote.min != null
      ? `${formatBudget(payoutQuote.min)}–${formatBudget(payoutQuote.max)}`
      : formatBudget(payoutQuote.max);
  };
  // A pending bid past its deadline renders as expired and frees the worker
  // to bid again — the server enforces the same rule inside every RPC.
  const bidLapsed = !!existingBid && isOfferLapsed(existingBid);
  const activeBid = existingBid && !bidLapsed ? existingBid : null;
  // Whose terms, whose move — from author_id/awaiting_id, NEVER from
  // worker_id: the chain's pending revision keeps worker_id = this worker
  // even when the CUSTOMER authored it as a counter (AUD-P1-01). The RPCs
  // re-check both server-side; these only decide what to render.
  const viewerAuthoredBid = !!activeBid && !!user && activeBid.author_id === user.id;
  // 2026-09-26 (the refresh, audit M-2 / M-4): the bid decision is pinned in a bar
  // whenever the entry cards would render — the same condition, read once.
  const showBidBar = !isOwnJob && !checking && !activeBid;
  const viewerOwesResponse =
    !!activeBid && !!user && !viewerAuthoredBid && activeBid.awaiting_id === user.id;
  const countersLeft = user ? countersRemaining(chain, user.id) : 0;
  // Incoming counter-offers are addressed by first name — the same first-name
  // treatment the rest of the app gives a counterparty (WorkerProfileScreen,
  // HomeScreen). A blank or whitespace-only name falls back to the role word.
  const posterFirstName =
    poster?.full_name?.trim().split(/\s+/)[0] || 'The customer';
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

  // --- 4D-2 B5: deterministic match-reason inputs. All three facts are
  // fetched real data or stay null (unknown renders nothing); the RULE lives
  // in lib/matchReasons.ts — this screen only gathers inputs and renders the
  // module's output.
  const { profile: myProfile } = useProfile();
  const userId = user?.id ?? null;
  const [myRadius, setMyRadius] = useState<DistanceFilterMiles | null>(null);
  const [myListedPriceCents, setMyListedPriceCents] = useState<number | null>(null);
  // Present only when the surface that opened this detail carried the
  // server-computed distance (a radius result or the map's pin sheet).
  const routeDistance = (params.job as { distance_miles?: unknown }).distance_miles;
  const distanceMiles = typeof routeDistance === 'number' ? routeDistance : null;

  useEffect(() => {
    if (mode !== 'worker' || !userId) return;
    let active = true;
    readDistanceFilter(userId).then((stored) => {
      if (active) setMyRadius(stored);
    });
    return () => {
      active = false;
    };
  }, [mode, userId]);

  useEffect(() => {
    if (mode !== 'worker' || !userId || isOwnJob) return;
    let active = true;
    (async () => {
      const { data, error: servicesError } = await fetchWorkerServices(userId);
      if (!active || servicesError) return;
      // The cheapest PUBLISHED flat price for this job's category. Hourly
      // and quote-only rows cannot be compared to a job budget without
      // inventing hours, so they contribute nothing (unknown, not zero).
      const flats = data
        .filter(
          (service) =>
            service.published &&
            service.category === job.category &&
            service.price_unit === 'flat' &&
            service.price_cents != null
        )
        .map((service) => service.price_cents as number);
      setMyListedPriceCents(flats.length > 0 ? Math.min(...flats) : null);
    })();
    return () => {
      active = false;
    };
  }, [mode, userId, isOwnJob, job.category]);

  const matchReasons =
    mode === 'worker' && !isOwnJob
      ? deriveMatchReasons({
          job: {
            category: job.category,
            budget_cents: job.budget_cents,
            budget_min_cents: job.budget_min_cents,
            budget_max_cents: job.budget_max_cents,
          },
          workerCategories: myProfile?.categories ?? null,
          distanceMiles,
          radiusMiles: myRadius,
          listedFlatPriceCents: myListedPriceCents,
        })
      : [];

  // The one canonical re-read: the chain's live pending revision plus every
  // revision behind it. Every action lands back here — success or REFUSAL —
  // so a stale card is replaced by the server's truth, never argued with.
  const refreshMyOffer = useCallback(async () => {
    if (!user) return;
    const { data, error } = await fetchMyOfferForJob(user.id, job.id);
    if (error) {
      // A FAILED read is not "no offer". Writing its null through would erase
      // the respond card and its "Your move" badge — the only surface telling
      // this user a counter is waiting on them — every time the screen is
      // focused without a connection. Keep last-known-good and let the next
      // focus re-read (same rule as the inbox's pending badges, hardening A8).
      console.warn('[JobDetail] offer refresh failed', error.message);
      return;
    }
    setExistingBid(data);
    if (data) {
      const { data: chainRows, error: chainError } = await fetchOfferChain(
        data.root_offer_id
      );
      // Same reasoning: a failed chain read returns [], which would silently
      // reset countersRemaining() to a full allowance.
      if (chainError) {
        console.warn('[JobDetail] offer chain refresh failed', chainError.message);
        return;
      }
      setChain(chainRows);
    } else {
      setChain([]);
    }
  }, [user, job.id]);

  // Focus, not mount: the bid form now lives on its own route (SubmitBid),
  // so coming back from Bid Sent — or from a counter answered on another
  // device — must re-read the canonical row rather than trust mount state.
  useFocusEffect(
    useCallback(() => {
      if (!user || isOwnJob) {
        setChecking(false);
        return;
      }
      void refreshMyOffer().finally(() => setChecking(false));
    }, [user, isOwnJob, refreshMyOffer])
  );

  // A different revision means a different negotiation moment — never leave
  // a half-typed counter form pointed at a row that no longer exists.
  useEffect(() => {
    setShowCounterForm(false);
  }, [activeBid?.id]);

  // A retained JobDetail route may be re-targeted from a similar-job card.
  // Always lead with that job's poster-selected first photo.
  useEffect(() => {
    setActivePhotoIndex(0);
  }, [job.id]);

  useEffect(() => {
    let active = true;
    setPoster(null);
    setPosterStats(null);
    setPosterReadFailed(false);
    if (isOwnJob) return;
    // phase58: the stats are counted server-side — the direct counts only
    // ever answered through the legacy permissive jobs policy the hardening
    // run dropped. Settled together with the profile so a failure in either
    // surfaces as one retry row rather than a silently posterless job (F-026).
    Promise.all([
      fetchProfileById(job.client_id),
      fetchClientJobStatsCounted(job.client_id),
    ]).then(([profileResult, statsResult]) => {
      if (!active) return;
      if (!profileResult.error) setPoster(profileResult.data);
      if (!statsResult.error) setPosterStats(statsResult.data);
      setPosterReadFailed(!!(profileResult.error || statsResult.error));
    });
    return () => {
      active = false;
    };
  }, [job.client_id, isOwnJob, posterReadAttempt]);

  /**
   * Shared tail of both bid paths. Everything that decides whether the bid is
   * allowed — job still open, not your own job, not blocked, no existing bid —
   * lives in create_bid(), so this only has to report what came back.
   */
  async function placeBid(amountCents: number, pitch: string): Promise<string | null> {
    if (!user) return null;

    const { data: offerId, error } = await createMarketplaceOffer({
      jobId: job.id,
      // The job being bid on is the screen's own subject; time-to-bid costs no
      // read here either (lib/offers.ts NewMarketplaceOffer).
      postedAt: job.created_at,
      amountCents,
      message: pitch,
    });

    if (error) {
      const msg =
        error.code === '23505'
          ? 'You already have a bid on this job.'
          : userMessage(error);
      await alertAsync('Could not place bid', msg);
      // A duplicate means someone (this screen, a second tap, another device)
      // already bid — resync so the form is replaced by the real bid rather
      // than inviting another attempt.
      if (error.code === '23505') {
        await refreshMyOffer();
      }
      return null;
    }

    // create_offer() returns the new offer's id, not the row — job_offers is
    // RLS-locked to SELECT, so the authoritative row is read back rather than
    // assembled client-side from what was just sent.
    if (offerId) {
      await refreshMyOffer();
    }
    return offerId ?? null;
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
    if (!user || job.budget_cents == null || takingListedPrice) return;
    setConfirmBidVisible(true);
  }

  async function confirmTakeListedPrice() {
    if (!user || job.budget_cents == null) return;

    setTakingListedPrice(true);
    const amountCents = job.budget_cents;
    const offerId = await placeBid(
      amountCents,
      `I can do this for your listed budget of ${formatBudget(amountCents)}.`
    );
    setTakingListedPrice(false);
    setConfirmBidVisible(false);
    if (!offerId) return;

    // 2026-09-26 (the refresh, audit M-2): both bid paths end on the same Bid
    // sent screen SubmitBid lands on — the OS alert and the tab hop are gone.
    // Fire-and-forget, as SubmitBid does: the prompt never holds the screen.
    void maybePromptForPush(
      'Get told the moment this client accepts your offer — and when new jobs like this are posted.'
    );
    (navigation as unknown as {
      navigate: (
        screen: 'BidSent',
        params: { jobTitle: string; amountCents: number; offerId: string }
      ) => void;
    }).navigate('BidSent', { jobTitle: job.title, amountCents, offerId });
  }

  /**
   * Withdraw the pending bid (§H.2 withdrawn, phase50). Confirmed first; the
   * RPC is idempotent, and on success the screen re-reads the canonical row —
   * a withdrawn bid frees this worker to bid again, so the entry cards return.
   */
  async function handleWithdraw() {
    if (!user || !activeBid || withdrawing) return;
    setWithdrawing(true);
    const { error } = await withdrawOffer(activeBid.id);
    setWithdrawing(false);
    setConfirmWithdrawVisible(false);
    if (error) {
      await alertAsync('Could not withdraw bid', userMessage(error));
      // Whatever blocked it (already accepted, already expired), the truth is
      // in the canonical row — re-read rather than guess.
    }
    await refreshMyOffer();
  }

  /**
   * Accept the customer's counter (§H.2). accept_offer() re-validates the
   * turn, expiry, and the job's state under its locks — a stale card cannot
   * take an already-filled job; the refusal is re-read below instead.
   */
  async function handleAcceptCounter() {
    if (!user || !activeBid || respondingRef.current) return;
    respondingRef.current = true;
    setResponding('accept');
    const { data: assignedJobId, error } = await acceptOffer(activeBid.id);
    respondingRef.current = false;
    setResponding(null);
    setConfirmResponse(null);
    if (error || !assignedJobId) {
      await alertAsync(
        'Could not accept this offer',
        userMessage(error, 'Check your connection and try again.')
      );
      await refreshMyOffer();
      return;
    }
    await alertAsync(
      'Offer accepted',
      'You’re hired — the job is assigned to you and now lives in My Jobs.'
    );
    // MyJobs is a shared tab; the one guarded dispatch path, same as Chat's
    // accepted-offer jump.
    navigateAcrossTabs('MyJobs', 'WorkerJob', { jobId: assignedJobId });
  }

  /** Decline the customer's counter. Their exit is decline, never withdraw —
   *  withdraw belongs to the pending revision's AUTHOR alone (phase50). */
  async function handleDeclineCounter() {
    if (!user || !activeBid || respondingRef.current) return;
    respondingRef.current = true;
    setResponding('decline');
    const { error } = await declineOffer(activeBid.id);
    respondingRef.current = false;
    setResponding(null);
    setConfirmResponse(null);
    if (error) {
      await alertAsync('Could not decline this offer', userMessage(error));
    }
    await refreshMyOffer();
  }

  // The pre-hire "Message the poster" entries and the thread lookup behind
  // them were removed with phase66: free-form messaging does not exist between
  // a worker and a poster until the job is confirmed, and the thread they
  // opened has no composer until then. The pair's direct_threads row is still
  // created with the offer (phase52) and still carries the negotiation cards.

  // §10 (Phase 8): this screen is registered in the SHARED Map and MyJobs
  // stacks, so a customer-mode user can genuinely arrive here. Rendering the
  // worker surface (EST. PAY, bid CTAs) to them was the documented
  // reachability leak — closed HERE, at the screen, so no navigation path
  // can bypass it. Their own job keeps the owner view below.
  if (!missing && mode === 'customer' && !isOwnJob) {
    return (
      <MarketJobPreview job={job} poster={poster} onBack={goBackOrHome} />
    );
  }

  // The canonical read came back empty: the poster deleted the job while this
  // screen was open (or on a stale card the list has not dropped yet). Saying
  // so beats leaving a bid form pointed at a row that no longer exists.
  if (missing) {
    return (
      <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
        <ScreenHeader title="Job Details" onBack={goBackOrHome} />
        <View style={styles.missing}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
          <Text style={styles.missingTitle}>This job is no longer available</Text>
          <Text style={styles.missingText}>
            The person who posted it has taken it down.
          </Text>
          <Button title="Go back" variant="secondary" onPress={goBackOrHome} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    // Same shared pattern every other ScreenHeader screen uses — SafeAreaView
    // with an explicit `top` edge — and the reason this one was the exception
    // is the hero. With photos the hero image is deliberately full-bleed under
    // the status bar and its own floating Back button offsets by insets.top
    // (below); asking for the top edge as well would push the image down and
    // double-offset that button. Without photos the ScreenHeader IS the topmost
    // element, and omitting the inset is what rendered "Job details" on top of
    // the system clock. The error branch above already had this right. The
    // bottom edge is the tab bar's (2026-09-26, the refresh): asking for it
    // here too drew a blank band between the bid bar and the tabs.
    <SafeAreaView
      style={styles.safe}
      edges={galleryPhotos.length > 0 ? [] : ['top']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            showBidBar ? { paddingBottom: spacing.xl } : { paddingBottom: navClearance },
          ]}
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
                    <RemoteImage uri={url} style={styles.heroPhoto} contentFit="cover" />
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                onPress={goBackOrHome}
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
            <ScreenHeader title="Job Details" onBack={goBackOrHome} />
          )}

          <View style={[styles.detailContent, { gap: detailGap }]}>
            <View
              style={[
                styles.detailSurface,
                { paddingHorizontal: detailPaddingX, paddingVertical: detailPaddingY },
              ]}
            >
            <View style={styles.jobHeader}>
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
                  size={22}
                  color={isDark ? colors.gold : accent.icon}
                  filled
                  bare
                />
              </View>
              <View style={styles.jobHeaderText}>
                <Text style={styles.category}>
                  {JOB_CATEGORY_LABELS[job.category] ?? job.category}
                </Text>
                <Text style={styles.time}>Posted {formatTimeAgo(job.created_at)}</Text>
              </View>
            </View>

            <Text style={styles.title}>{job.title}</Text>

            {/* 4D-2 B4: the scope of work sits directly under the title —
                above the fold — so a worker reads WHAT the job is before the
                logistics rows rather than after them. */}
            {job.description ? <Text style={styles.description}>{job.description}</Text> : null}

            {/* The shared meta treatment prestige(3c) settled on the job
                cards: gold glyph, cream text in dark; light keeps the muted
                pair. These rows are the same class of fact. */}
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={20} color={metaGlyph} />
              {/* Approximate area only. The exact address lives in
                  job_locations, readable by the poster and the assigned
                  worker — enforced by RLS, and this screen renders no field
                  it has no right to. */}
              <Text style={[styles.detailText, isDark && styles.detailTextDark]}>
                {job.location ?? 'No location set'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={20} color={metaGlyph} />
              <Text style={[styles.detailText, isDark && styles.detailTextDark]}>
                {/* A standalone meta line has no money eyebrow above it, so
                    master 35's full sentence is the right form here — and it
                    is `formatBudget`'s own string, not a fourth one. */}
                {hasBudget(job) ? `${budgetRangeLabel(job)} budget` : 'No budget set'}
              </Text>
            </View>
            {arrivalWindowLabel(job) ? (
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={20} color={metaGlyph} />
                <Text style={[styles.detailText, isDark && styles.detailTextDark]}>
                  Arrive {arrivalWindowLabel(job)}
                </Text>
              </View>
            ) : null}

            {/* B5: deterministic match reasons — boolean facts from
                lib/matchReasons.ts, rendered only when they hold. No
                percentages, no scores, no negative badges: an unmet or
                unknown reason renders nothing at all. */}
            {matchReasons.length > 0 ? (
              <View style={styles.matchReasons}>
                {matchReasons.map((reason) => (
                  <View key={reason.key} style={styles.matchReasonRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.matchReasonText}>{reason.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

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
          ) : activeBid ? (
            viewerOwesResponse ? (
              // The customer countered: THEIR terms, YOUR move. Attributed to
              // them, answered with the three server actions — never labeled
              // "Your bid", never offered Withdraw (author-only, and the
              // author is the customer here). AUD-P1-01.
              <Card style={styles.secondaryCard}>
                {/* THE shared actionable presentation — the same component
                    the chat thread renders, so the two surfaces cannot show
                    different labels, a different action order or a different
                    destructive treatment for one negotiation. It owns its own
                    spacing, which is what stopped the explanatory paragraph
                    colliding with the fixed-height Accept button. */}
                <OfferResponseActions
                  senderFirstName={posterFirstName}
                  isCounter={activeBid.parent_offer_id !== null}
                  amountLabel={formatBudget(activeBid.amount_cents)}
                  note={offerResponseNote({
                    viewerIsWorker: true,
                    expiresLabel: offerExpiryLabel(activeBid.expires_at),
                  })}
                  // Job detail is the worker's side of an open job.
                  viewerIsWorker
                  // The control stays available while the form is open so the
                  // same button dismisses it.
                  canCounter={!(countersLeft === 0 && !showCounterForm)}
                  busy={responding !== null}
                  onAccept={() => setConfirmResponse('accept')}
                  onCounter={() => setShowCounterForm((visible) => !visible)}
                  onDecline={() => setConfirmResponse('decline')}
                />
                {showCounterForm ? (
                  <View style={styles.counterFormWrap}>
                    <OfferComposer
                      context={{
                        kind: 'counter',
                        offer: activeBid,
                        counterpartyName: poster?.full_name ?? 'The customer',
                        jobTitle: job.title,
                        countersRemaining: countersLeft,
                      }}
                      onSubmitted={async () => {
                        // The chain moved: their revision is superseded and
                        // the turn is theirs. Re-read so the card shows the
                        // truth.
                        setShowCounterForm(false);
                        await refreshMyOffer();
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            ) : viewerAuthoredBid ? (
              <Card style={styles.secondaryCard}>
                <View style={styles.bidHeader}>
                  <Text style={styles.sectionTitle}>
                    {activeBid.parent_offer_id ? 'Your counter-offer' : 'Your bid'}
                  </Text>
                  <StatusBadge status={activeBid.status} />
                </View>
                <Text style={styles.bidAmount}>{formatBudget(activeBid.amount_cents)}</Text>
                {activeBid.message ? (
                  <Text style={styles.bidMessage}>“{activeBid.message}”</Text>
                ) : null}
                <Text style={styles.bidNote}>
                  {activeBid.expires_at
                    ? `The customer can accept it until ${new Date(
                        activeBid.expires_at
                      ).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })} — after that it expires on its own. Check My Jobs for updates.`
                    : 'You’ve already bid on this job. Check My Jobs for updates.'}
                </Text>
                {/* No Message CTA here. Free-form messaging does not exist
                    between these two until the job is confirmed — the offer
                    is the whole conversation, and the server refuses a
                    pre-confirmation message regardless of what any screen
                    offers (phase66). */}
                <Button
                  title="Withdraw bid"
                  variant="secondary"
                  onPress={() => setConfirmWithdrawVisible(true)}
                  loading={withdrawing}
                  disabled={withdrawing}
                  style={styles.withdrawAction}
                />
              </Card>
            ) : (
              // Pending, but neither authored by nor awaiting this viewer —
              // a state this screen cannot positively classify (two-party
              // chains should make it unreachable). Render it attributed and
              // actionless rather than guessing at an action the server
              // would refuse.
              <Card style={styles.secondaryCard}>
                <View style={styles.bidHeader}>
                  <Text style={styles.sectionTitle}>Offer in negotiation</Text>
                  <StatusBadge status={activeBid.status} />
                </View>
                <Text style={styles.bidAmount}>{formatBudget(activeBid.amount_cents)}</Text>
                <Text style={styles.bidNote}>
                  This negotiation is waiting on the other side. Check My Jobs
                  for updates.
                </Text>
              </Card>
            )
          ) : (
            <>
              {bidLapsed ? (
                <Card style={[styles.noticeCard, styles.secondaryCard]}>
                  <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.noticeText}>
                    Your earlier bid expired without a response. You can send a
                    new one below.
                  </Text>
                </Card>
              ) : null}
              {/* Customer-side trust signals: real profile, real counted
                  history. Rendered only once loaded — never placeholders, and
                  a FAILED read says so with a retry rather than posing as a
                  job with no poster (F-026). */}
              {posterReadFailed ? (
                <Card style={[styles.noticeCard, styles.secondaryCard]}>
                  <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                  <Text style={styles.noticeText}>
                    Couldn’t load who posted this job. Check your connection
                    and retry.
                  </Text>
                  <Button
                    title="Retry"
                    size="sm"
                    variant="secondary"
                    onPress={() => setPosterReadAttempt((attempt) => attempt + 1)}
                  />
                </Card>
              ) : poster ? (
                <Card style={[styles.posterCard, styles.secondaryCard]}>
                  <Text style={styles.sectionTitle}>Posted by</Text>
                  <View style={styles.posterRow}>
                    <Avatar name={poster.full_name} uri={poster.avatar_url} size={48} />
                    <View style={styles.posterCopy}>
                      <Text style={styles.posterName} numberOfLines={1}>
                        {poster.full_name ?? 'Customer'}
                      </Text>
                      {posterStats ? (
                        <Text style={styles.posterMeta}>
                          {posterStats.posted}{' '}
                          {posterStats.posted === 1 ? 'job' : 'jobs'} posted ·{' '}
                          {posterStats.completed} completed
                          {posterStats.cancelled > 0
                            ? ` · ${posterStats.cancelled} cancelled`
                            : ''}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              ) : null}

              {/* Payout — the label, the number and the fee sentence all come
                  from quote_job_price() (D11), the same schedule checkout
                  charges and the ledger records, so this card cannot drift
                  from what the worker is actually paid. */}
              {payoutEstimateLabel(job) ? (
                <Card style={[styles.payoutCard, styles.secondaryCard]}>
                  {/* Master 10 sets a shield against this card's copy —
                      decoration beside a claim the words already make. The
                      refresh draws it as the plain shield-check the worker's
                      own payment card wears; the B mark is Launch's alone. */}
                  <View style={styles.payoutMark} pointerEvents="none">
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={54}
                      color={isDark ? colors.gold : colors.emerald}
                    />
                  </View>
                  <Text style={styles.priceEyebrow}>
                    {payoutQuote === 'failed'
                      ? 'Stated budget'
                      : payoutQuote !== 'loading' && payoutQuote.fee
                        ? 'Est. payout after fee'
                        : 'Est. payout'}
                  </Text>
                  <Text style={styles.payoutAmount}>{payoutEstimateLabel(job)}</Text>
                  <Text style={styles.payoutNote}>
                    {payoutQuote === 'loading'
                      ? 'Working out what you’d receive…'
                      : payoutQuote === 'failed'
                        ? 'Estimate only; your net couldn’t be worked out.'
                        : payoutQuote.fee
                          ? 'Estimate: the stated budget less Brazos’s fee.'
                          : 'Estimate: the customer’s stated budget.'}
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
                    <View style={[styles.priceIcon, isDark && litCardStyle(true, 'tile')]}>
                      <Ionicons
                        name="cash-outline"
                        size={22}
                        color={isDark ? colors.gold : colors.primary}
                      />
                    </View>
                    <View style={styles.priceCopy}>
                      <Text style={styles.listedPriceTitle}>
                        You’ll offer {formatBudget(job.budget_cents)}
                      </Text>
                      <Text style={styles.quickBidText}>
                        The client still chooses.
                      </Text>
                    </View>
                  </View>
                </Card>
              )}

              {/* The custom-terms path is the OfferComposer's SubmitBid route
                  (screen 52) — one canonical offer form for bids, counters
                  and direct offers, rather than a second form living here. */}
              <Card style={styles.secondaryCard}>
                <Text style={styles.sectionTitle}>
                  {job.budget_cents != null ? 'Or name your own price' : 'Place a bid'}
                </Text>
                <Text style={styles.quickBidText}>
                  Your price, and why you’re the right pick.
                </Text>
                {/* Master 10 gives this a GOLD serif label — decision 3's
                    ghost. Its own hairline box in the master is the shape
                    decision 3 reserves for the standard control, so the ghost
                    ships bare inside the card that already frames it. */}
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
                    onPress={() =>
                      (navigation as unknown as {
                        navigate: (screen: 'JobDetail', params: { job: OpenJob }) => void;
                      }).navigate('JobDetail', { job: sj })
                    }
                  />
                ))}
              </View>
            </View>
          )}
          </View>
        </ScrollView>
        {showBidBar ? (
          <View style={[styles.bidBar, { paddingBottom: PINNED_FOOTER_BOTTOM_PADDING }]}>
            <View style={styles.bidBarRow}>
              {job.budget_cents != null ? (
                <Button
                  title={`I’ll do it for ${formatBudget(job.budget_cents)}`}
                  onPress={handleTakeListedPrice}
                  loading={takingListedPrice}
                  style={styles.bidBarPrimary}
                />
              ) : null}
              <Button
                title="Write a bid"
                variant={job.budget_cents != null ? 'secondary' : 'primary'}
                onPress={() =>
                  (navigation as unknown as {
                    navigate: (screen: 'SubmitBid', params: { job: OpenJob }) => void;
                  }).navigate('SubmitBid', { job })
                }
                disabled={takingListedPrice}
                style={job.budget_cents != null ? styles.bidBarSecondary : styles.bidBarPrimary}
              />
            </View>
            <Text style={styles.bidBarNote}>
              Questions go in your bid; chat opens once hired.
            </Text>
          </View>
        ) : null}
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
          message={
            payoutQuote !== 'loading' && payoutQuote !== 'failed' && payoutQuote.min == null
              ? `You’d receive ${formatBudget(payoutQuote.max)} after the fee. The client will receive your bid and decide who gets the job.`
              : 'The client will receive your bid and decide who gets the job.'
          }
          confirmText="Send bid"
          cancelText="Cancel"
          loading={takingListedPrice}
          onConfirm={confirmTakeListedPrice}
          onCancel={() => setConfirmBidVisible(false)}
        />
      )}

      <ConfirmDialog
        visible={confirmWithdrawVisible}
        title="Withdraw your bid?"
        message="This withdraws your pending bid — the customer will no longer be able to accept it. You can send a new bid afterwards if you change your mind."
        confirmText="Withdraw bid"
        cancelText="Keep bid"
        loading={withdrawing}
        onConfirm={handleWithdraw}
        onCancel={() => setConfirmWithdrawVisible(false)}
      />

      <ConfirmDialog
        visible={confirmResponse === 'accept'}
        title={acceptOfferConfirmTitle(formatBudget(activeBid?.amount_cents ?? null), true)}
        message="This takes the job at the customer’s countered amount and closes the negotiation. The job is assigned to you and moves into My Jobs."
        confirmText={acceptOfferConfirmText(true)}
        cancelText="Cancel"
        loading={responding === 'accept'}
        onConfirm={handleAcceptCounter}
        onCancel={() => setConfirmResponse(null)}
      />

      <ConfirmDialog
        visible={confirmResponse === 'decline'}
        title={declineOfferConfirmTitle(formatBudget(activeBid?.amount_cents ?? null), true)}
        message="This closes the negotiation — the customer’s counter can’t be accepted afterwards. You can send a new bid unless the job is filled."
        confirmText={declineOfferActionLabel(true)}
        cancelText="Cancel"
        loading={responding === 'decline'}
        onConfirm={handleDeclineCounter}
        onCancel={() => setConfirmResponse(null)}
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
    backgroundColor: withAlpha(colors.black, 0.38),
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
    backgroundColor: withAlpha(colors.black, 0.58),
  },
  photoCountText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  detailContent: {
    backgroundColor: colors.surface,
  },
  detailSurface: {
    backgroundColor: colors.surface,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  iconCircle: {
    borderRadius: radius.lg,
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  // D2: one category tile everywhere — deep-green surface, gold hairline,
  // gold glyph. The saturated per-category fills are retired in dark; light
  // keeps them.
  iconCircleDark: {
    backgroundColor: colors.mint,
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
  detailTextDark: { color: colors.ink },
  description: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    // Snug under the title since 4D-2 B4 moved the scope of work above the
    // logistics rows; the title's own marginBottom provides the separation.
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  matchReasons: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  matchReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  matchReasonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
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
  // Decision 9: a card heading is display type.
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
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
  // Master 10 parks the shield mark in the card's top-right, clear of the
  // copy column. Bounded to this card, never a screen-level coordinate.
  payoutMark: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  // Master 10's figure: the serif, at display weight.
  payoutAmount: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    color: colors.money,
  },
  payoutNote: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  // Eyebrow law: a structural card label is gold small-caps.
  priceEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
    color: colors.eyebrowGold,
    letterSpacing: 1.2,
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
  // Master 10's icon squircle: sage fill inside a gold hairline.
  priceIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mint,
  },
  priceCopy: {
    flex: 1,
    gap: 2,
  },
  listedPriceTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  similarSection: {
    gap: spacing.md,
  },
  // Master 10 sets SIMILAR OPEN JOBS as a gold small-caps section eyebrow.
  similarTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  similarList: {
    gap: spacing.md,
  },
  quickBidText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  bidBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  bidBarRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bidBarPrimary: {
    flex: 1.4,
  },
  bidBarSecondary: {
    flex: 1,
  },
  bidBarNote: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    textAlign: 'center',
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
    color: colors.money,
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
  withdrawAction: {
    marginTop: spacing.sm,
  },
  counterFormWrap: {
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
  }),
);
