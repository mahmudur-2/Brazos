import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoid } from '../components/KeyboardAvoid';
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
import { ReportContentLink } from '../components/ReportContentLink';
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
  payoutsGateCard,
} from '../lib/offerCopy';
import { PayoutsGateCard, useMyPayoutsGate } from '../components/PayoutsGateCard';
import { useAuth } from '../hooks/useAuth';
import { useOpenJobDetail } from '../hooks/useJobDetail';
import { useMode } from '../modes';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealShift } from '../lib/scrollReveal';
import { deriveMatchReasons } from '../lib/matchReasons';
import { invalidateJobs } from '../lib/queryClient';
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
import { quoteJobPrice, type JobPriceQuote } from '../lib/payments';
import { BOOKED_TIME_PASSED, jobWindowOver } from '../lib/paymentRules';
import { serverNowMs } from '../lib/serverClock';
import {
  EYEBROW_TYPE,
  layout,
  radius,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  wellStyle,
  withAlpha,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { FloatingAction, Sheet, useScrollClearance } from '../ui/primitives';
import { STATE_COPY } from '../ui/templates/ScreenStates';

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
  // RUN T2 (C8) — THE WORKER'S VIEW OF A JOB. G2: the job is one lit card on the ground; the
  // cards under it keep the same gap.
  const detailGap = spacing.lg;
  const iconCircleSize = 54;
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
  // PART 5b T1: the counter form opens under the reply card's buttons, which on a short page is the
  // foot of the screen, under the tab bar. Once it opens, and again once the keyboard is up, the page
  // scrolls (the scroller's own animation; none with reduced motion) just enough that the form's
  // heading and its amount field sit above the tab bar or the keyboard, never past the heading.
  // Closing the form moves nothing.
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const scrollBandRef = useRef<View>(null);
  const contentTopRef = useRef<View>(null);
  const counterFormRef = useRef<View>(null);
  const counterAmountRef = useRef<View>(null);
  useEffect(() => {
    if (!showCounterForm) return;
    let frame: number | null = null;
    const box = (ref: { current: View | null }) =>
      new Promise<{ top: number; bottom: number } | null>((resolve) => {
        if (!ref.current) return resolve(null);
        ref.current.measureInWindow((_x, top, _width, height) => resolve({ top, bottom: top + height }));
      });
    // The keyboard covers the tab bar, and the keyboard-avoiding view already ends the band at it.
    const reveal = (keyboardUp: boolean) => {
      if (frame != null) cancelAnimationFrame(frame);
      // One frame for the opened form's layout — a frame, never a timer.
      frame = requestAnimationFrame(() => {
        frame = null;
        void Promise.all([box(scrollBandRef), box(contentTopRef), box(counterFormRef), box(counterAmountRef)]).then(
          ([band, contentTop, form, field]) => {
            if (!band || !contentTop || !form || !field) return;
            const shift = revealShift({
              visibleTop: band.top,
              visibleBottom: band.bottom - (keyboardUp ? 0 : navClearance),
              headingTop: form.top,
              fieldBottom: field.bottom,
              margin: spacing.md,
            });
            if (shift > 0) {
              scrollRef.current?.scrollTo({ y: band.top - contentTop.top + shift, animated: reducedMotion === false });
            }
          }
        );
      });
    };
    reveal(false);
    const shown = Keyboard.addListener('keyboardDidShow', () => reveal(true));
    return () => {
      shown.remove();
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [showCounterForm, navClearance, reducedMotion]);
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
  // P6 (owner, 2026-11-16): no Bid Sent screen. The bid was just sent from here, or from the bid
  // form that went back here; the bid card says "Bid sent".
  const [bidJustSent, setBidJustSent] = useState(false);
  // P7 (owner, 2026-11-16): the bid form opens as a sheet over this page.
  const [bidSheetOpen, setBidSheetOpen] = useState(false);
  const bidSentShown = bidJustSent || params.bidSent === true;
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isOwnJob = !!user && job.client_id === user.id;
  // B11: a worker whose payouts are not on sees the payout card in place of the offer buttons.
  const payouts = useMyPayoutsGate(mode === 'worker' && !isOwnJob);
  const payoutsGateShown = payoutsGateCard(payouts) !== null;

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
  // A4 wiring (priority 2): once a dated job's booked window has ended, a new bid is refused
  // (job_window_over, refuse_offer_after_window), so no bid is offered: neither "Write a Bid" nor the
  // listed-price bid, nor the payout card that stands in for them. The page says the server's
  // sentence instead (BOOKED_TIME_PASSED.newBid); the hourly closer then closes the job.
  const windowOver = jobWindowOver({ job, nowMs: serverNowMs() });
  // 2026-09-26 (the refresh, audit M-2 / M-4): the bid decision is pinned in a bar
  // whenever the entry cards would render — the same condition, read once.
  const showBidBar = !isOwnJob && !checking && !activeBid && !windowOver;
  // G2: the bid pair floats at the foot with no plate (FloatingAction), and the bar steps aside.
  const floatingBid = showBidBar && !payoutsGateShown;
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
      amountCents,
      message: pitch,
    });
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();

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

    // P6 (owner, 2026-11-16): both bid paths end on this page, the bid card saying "Bid sent".
    // Fire-and-forget, as SubmitBid does: the prompt never holds the screen.
    void maybePromptForPush(
      'Get told the moment this customer accepts your bid — and when new jobs like this are posted.'
    );
    setBidJustSent(true);
  }

  /** P7: the sheet's bid went through: close it and show the bid on this page. */
  async function bidSentFromSheet() {
    setBidSheetOpen(false);
    void maybePromptForPush(
      'Get told the moment this customer accepts your bid — and when new jobs like this are posted.'
    );
    await refreshMyOffer();
    setBidJustSent(true);
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
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
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
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
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
    // F13: an own mutation — the cached hub and feed are out of date.
    invalidateJobs();
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
          <Button title="Go Back" variant="secondary" onPress={goBackOrHome} />
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
      style={[styles.safe, screenGround(colors, isDark)]}
      edges={galleryPhotos.length > 0 ? [] : ['top']}
    >
      <KeyboardAvoid
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* PART 5b T1: the scroller's frame (the visible band) and the content's first point, measured
            when the counter form opens. */}
        <View ref={scrollBandRef} collapsable={false} style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            floatingBid ? { paddingBottom: spacing.xl } : { paddingBottom: navClearance },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={contentTopRef} collapsable={false} />
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

          <View
            style={[
              styles.detailContent,
              { gap: detailGap },
              galleryPhotos.length > 0 ? styles.detailContentUnderHero : null,
            ]}
          >
            <Card>
            <View style={styles.jobHeader}>
              <View
                style={[
                  styles.iconCircle,
                  { width: iconCircleSize, height: iconCircleSize },
                  // G2: inside the lit card the tile is a well in dark; light keeps the category colour.
                  isDark ? wellStyle(colors, true) : { backgroundColor: accent.bg },
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
            ) : (
              // FIX-RUN B3 (Apple 1.2): someone else's post can be reported
              // (and its poster blocked) where it is read.
              <ReportContentLink
                subject={{ kind: 'job', id: job.id }}
                reportedId={job.client_id}
                reportedName={poster?.full_name ?? 'this customer'}
                jobId={job.id}
                label="Report This Job"
              />
            )}
            </Card>

          {isOwnJob ? (
            <Card style={styles.noticeCard}>
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
              <Card>
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
                  // A2-M5 A11: past the booked time the server refuses accept and counter, so no
                  // "Respond by <date>" and no buttons: the facts, and accept_offer's own sentence.
                  note={
                    windowOver
                      ? BOOKED_TIME_PASSED.workerAccept
                      : offerResponseNote({
                          viewerIsWorker: true,
                          expiresLabel: offerExpiryLabel(activeBid.expires_at),
                        })
                  }
                  actionsClosed={windowOver}
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
                {/* B11: accept and counter need payouts on; decline never does. Past the booked
                    time neither is offered (A2-M5 A11), so neither is the gate nor the form. */}
                {payoutsGateShown && !windowOver ? (
                  <View style={styles.counterFormWrap}>
                    <PayoutsGateCard status={payouts} />
                  </View>
                ) : null}
                {showCounterForm && !windowOver ? (
                  <View ref={counterFormRef} collapsable={false} style={styles.counterFormWrap}>
                    <OfferComposer
                      amountFieldRef={counterAmountRef}
                      context={{
                        kind: 'counter',
                        offer: activeBid,
                        counterpartyName: poster?.full_name ?? 'The customer',
                        jobTitle: job.title,
                        countersRemaining: countersLeft,
                        // A4 wiring (priority 2): a market job, so its window decides the counter.
                        jobWindow: job,
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
              <Card>
                {bidSentShown ? (
                  <View style={styles.bidSentRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.bidSentText}>Bid sent</Text>
                  </View>
                ) : null}
                <View style={styles.bidHeader}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>
                    {activeBid.parent_offer_id ? 'Your Counter-Offer' : 'Your Bid'}
                  </Text>
                  <StatusBadge status={activeBid.status} />
                </View>
                <Text style={styles.bidAmount}>{formatBudget(activeBid.amount_cents)}</Text>
                {activeBid.message ? (
                  <Card level="well" style={styles.bidMessageWell}>
                    <Text style={styles.bidMessage}>“{activeBid.message}”</Text>
                  </Card>
                ) : null}
                <Text style={styles.bidNote}>
                  {/* A2-M5 A9: past the booked time nothing is accepted, so no "until <date>" promise:
                      accept_offer's own sentence for the worker says what is true. */}
                  {windowOver
                    ? BOOKED_TIME_PASSED.workerAccept
                    : activeBid.expires_at
                    ? `The customer can accept it until ${offerExpiryLabel(activeBid.expires_at)} — after that it expires on its own. Check My Jobs for updates.`
                    : 'You’ve already bid on this job. Check My Jobs for updates.'}
                </Text>
                {/* No Message CTA here. Free-form messaging does not exist
                    between these two until the job is confirmed — the offer
                    is the whole conversation, and the server refuses a
                    pre-confirmation message regardless of what any screen
                    offers (phase66). */}
                {/* G2: the way out stays red but small, at the card's foot behind a hairline, so a
                    waiting bid reads as its status and amount first. */}
                <View style={styles.withdrawFoot}>
                  <Button
                    title={activeBid.parent_offer_id ? 'Withdraw Counter-Offer' : 'Withdraw Bid'}
                    variant="destructive"
                    size="sm"
                    onPress={() => setConfirmWithdrawVisible(true)}
                    loading={withdrawing}
                    disabled={withdrawing}
                  />
                </View>
              </Card>
            ) : (
              // Pending, but neither authored by nor awaiting this viewer —
              // a state this screen cannot positively classify (two-party
              // chains should make it unreachable). Render it attributed and
              // actionless rather than guessing at an action the server
              // would refuse.
              <Card>
                <View style={styles.bidHeader}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>Offer in Negotiation</Text>
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
              {windowOver ? (
                // A4 wiring (priority 2): the page's own notice card, with the server's sentence.
                <Card style={styles.noticeCard}>
                  <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.noticeText}>{BOOKED_TIME_PASSED.newBid}</Text>
                </Card>
              ) : bidLapsed ? (
                <Card style={styles.noticeCard}>
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
                <Card style={styles.noticeCard}>
                  <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
                  <Text style={styles.noticeText}>
                    Couldn’t load who posted this job. Check your connection
                    and retry.
                  </Text>
                  <Button
                    title={STATE_COPY.retry}
                    size="sm"
                    variant="secondary"
                    onPress={() => setPosterReadAttempt((attempt) => attempt + 1)}
                  />
                </Card>
              ) : poster ? (
                <Card style={styles.posterCard}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>Posted By</Text>
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
                <Card style={styles.payoutCard}>
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
                        ? 'You get, after the fee'
                        : 'You get'}
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

              {/* G2 RESTRUCTURE: the two cards that named the bid paths ("Take it at the listed
                  price", "Place a Bid") are gone; the floating pair says both, once. */}
              {/* B11: in place of the bid buttons, the payout card sits in the page (no pinned plate). */}
              {showBidBar && payoutsGateShown ? (
                <PayoutsGateCard status={payouts} framed />
              ) : null}
            </>
          )}

          {similarJobs.length > 0 && (
            <View style={styles.similarSection}>
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
        </View>
      </KeyboardAvoid>
      {/* G2: no plate. The pair floats where the bar's pill sat; "Write a Bid" is the one main
          action, the listed-price bid its quiet partner of the same size. */}
      {showBidBar && !payoutsGateShown ? (
        <FloatingAction
          title="Write a Bid"
          onPress={() => setBidSheetOpen(true)}
          disabled={takingListedPrice}
          secondary={
            job.budget_cents != null
              ? {
                  title: `I’ll Do It for ${formatBudget(job.budget_cents)}`,
                  onPress: handleTakeListedPrice,
                  disabled: takingListedPrice,
                }
              : undefined
          }
          hint="Questions go in your bid; chat opens once hired."
        />
      ) : null}

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
              ? `You’d receive ${formatBudget(payoutQuote.max)} after the fee. The customer will receive your bid and decide who gets the job.`
              : 'The customer will receive your bid and decide who gets the job.'
          }
          confirmText="Send Bid"
          loading={takingListedPrice}
          onConfirm={confirmTakeListedPrice}
          onCancel={() => setConfirmBidVisible(false)}
        />
      )}

      <ConfirmDialog
        visible={confirmWithdrawVisible}
        // A2-M5 W8: the dialog says what the button said: a counter-offer (a parent offer) or a bid.
        // withdraw_offer frees the one live chain either way, so a new bid can follow.
        title={activeBid?.parent_offer_id ? 'Withdraw your counter-offer?' : 'Withdraw your bid?'}
        message={`This withdraws your pending ${activeBid?.parent_offer_id ? 'counter-offer' : 'bid'} — the customer will no longer be able to accept it. You can send a new bid afterwards if you change your mind.`}
        confirmText={activeBid?.parent_offer_id ? 'Withdraw Counter' : 'Withdraw Bid'}
        destructive
        loading={withdrawing}
        onConfirm={handleWithdraw}
        onCancel={() => setConfirmWithdrawVisible(false)}
      />

      <ConfirmDialog
        visible={confirmResponse === 'accept'}
        title={acceptOfferConfirmTitle(formatBudget(activeBid?.amount_cents ?? null), true)}
        message="This takes the job at the customer’s countered amount and closes the negotiation. The job is assigned to you and moves into My Jobs."
        confirmText={acceptOfferConfirmText(true)}
        loading={responding === 'accept'}
        onConfirm={handleAcceptCounter}
        onCancel={() => setConfirmResponse(null)}
      />

      <ConfirmDialog
        visible={confirmResponse === 'decline'}
        title={declineOfferConfirmTitle(formatBudget(activeBid?.amount_cents ?? null), true)}
        message="This closes the negotiation — the customer’s counter can’t be accepted afterwards. You can send a new bid unless the job is filled."
        confirmText={declineOfferActionLabel(true)}
        destructive
        loading={responding === 'decline'}
        onConfirm={handleDeclineCounter}
        onCancel={() => setConfirmResponse(null)}
      />
      <Sheet
        visible={bidSheetOpen}
        title="Write a Bid"
        dismissWord="Cancel"
        onClose={() => setBidSheetOpen(false)}
        avoidKeyboard
      >
        <OfferComposer layout="inline" context={{ kind: 'bid', job }} onSubmitted={() => void bidSentFromSheet()} />
      </Sheet>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // The page ground is customer Home's own (declared to the shell above).
  safe: {
    flex: 1,
    backgroundColor: colors.homeBackground,
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
    ...textScale.label,
    color: colors.white,
    fontWeight: '800',
  },
  // G2: the page is the ground; the job and each group under it are lit cards in one column.
  detailContent: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.xs,
  },
  detailContentUnderHero: {
    paddingTop: spacing.lg,
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
  jobHeaderText: {
    flex: 1,
    gap: 2,
  },
  category: {
    ...textScale.headline,
    color: colors.text,
  },
  time: {
    ...textScale.label,
    fontWeight: '400',
    color: colors.textMuted,
  },
  title: {
    ...textScale.display,
    color: colors.ink,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  detailText: {
    ...textScale.callout,
    flex: 1,
    color: colors.textMuted,
  },
  detailTextDark: { color: colors.ink },
  description: {
    ...textScale.callout,
    fontWeight: '400',
    color: colors.text,
    // Snug under the title since 4D-2 B4 moved the scope of work above the
    // logistics rows; the title's own marginBottom provides the separation.
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
    ...textScale.callout,
    flex: 1,
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
  noticeText: {
    ...textScale.body,
    flex: 1,
    color: colors.textMuted,
  },
  // Decision 9: a card heading is display type.
  sectionTitle: {
    ...textScale.title,
    color: colors.ink,
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
    ...textScale.headline,
    color: colors.text,
  },
  posterMeta: {
    ...textScale.label,
    fontWeight: '400',
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
  payoutAmount: {
    ...textScale.hero,
    color: colors.money,
    fontVariant: ['tabular-nums'],
  },
  payoutNote: {
    ...textScale.footnote,
    fontWeight: '400',
    color: colors.textMuted,
  },
  // Eyebrow law: a structural card label is gold small-caps.
  priceEyebrow: {
    ...EYEBROW_TYPE,
    // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
    color: colors.eyebrowGold,
  },
  similarSection: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  // Master 10 sets SIMILAR OPEN JOBS as a gold small-caps section eyebrow.
  similarTitle: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  similarList: {
    gap: spacing.md,
  },
  bidSentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  bidSentText: {
    ...textScale.body,
    fontWeight: '700',
    color: colors.success,
  },
  bidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bidAmount: {
    ...textScale.heading,
    color: colors.money,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.sm,
  },
  bidMessageWell: {
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  bidMessage: {
    ...textScale.body,
    color: colors.text,
    fontStyle: 'italic',
  },
  bidNote: {
    ...textScale.label,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  withdrawFoot: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
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
    ...textScale.headline,
    color: colors.text,
    textAlign: 'center',
  },
  missingText: {
    ...textScale.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  }),
);
