import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoid } from '../components/KeyboardAvoid';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlowTextInput } from '../components/GlowTextInput';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenStateView } from '../ui/templates/ScreenStates';
import { FloatingAction, useScrollClearance } from '../ui/primitives';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import { paymentEyebrow } from '../lib/moneyCopy';
import {
  customerChargeCents,
  isCancellationFeeKept,
  isPayoutOnItsWay,
  isRefundArranged,
  isRefundFailed,
  isRefundQueued,
} from '../lib/paymentRules';
import { isRefundFailureRecorded } from '../lib/jobLifecycle';
import { firstNameOf } from '../lib/liveJobStatus';
import {
  classifyTipPoll,
  fetchJobPaymentState,
  fetchJobRefundIssue,
  fetchJobTip,
  isReleased,
  isReleaseRequested,
  type Payment,
  type TipPollState,
} from '../lib/payments';
import {
  presentCheckoutSheet,
  stripeReady,
  STRIPE_UNAVAILABLE_MESSAGE,
  type CheckoutSession,
} from '../lib/payments/stripe';
import { CHECKOUT_POLL_INTERVAL_MS, CHECKOUT_POLL_TIMEOUT_MS, earlierTipNotice } from '../lib/payments/stripeRules';
import { fetchProfileById } from '../lib/profiles';
import { fetchRemoteConfig } from '../lib/remoteConfig';
import { dollarsToCents, formatBudget } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { Announce } from '../hooks/useAnnounce';
import {
  EYEBROW_TYPE,
  emeraldColorsFor,
  radius,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  wellStyle,
  type ColorPalette,
  screenGround,
} from '../lib/theme';

/** Round tip suggestions, in cents. Presets, not a fee schedule — the
 *  customer types any amount they want below them. */
const TIP_PRESETS_CENTS = [500, 1000, 2000];

/**
 * Screen 37 — Review & tip (Phase 6, customer side).
 *
 * Sits BEHIND the approve gate by §9's ordering: the held payment releases
 * first (screen 36), then the review — so a review can never be the thing
 * standing between a worker and their money. Jobs with a still-held payment
 * are redirected to ApproveOrDispute; legacy jobs that completed without a
 * payment review from the job screen as before.
 *
 * ON THE CARD PATH (R6c, D3) the tip is a second checkout session, shaped on
 * screen 31's: create-payment mints the tip row through begin_tip_payment
 * (its refusals — one tip per job, release first, the job's own dollar
 * ceiling — are shown as they are), the row is read back so the confirm
 * dialog shows ITS charge_amount_cents, the same payment sheet takes the
 * card, and the screen POLLS the tip row (2s, up to 30s) for exactly three
 * outcomes: confirmed (the row reads held — payment_intent.succeeded charged
 * the card and queued the tip for transfer to the worker (B1) — or already
 * released), gone (the row failed or was voided), or timed out (an honest
 * sentence and a re-read; never a second tip). A dismissed sheet is not an
 * error: the unfunded row keeps its funding window and the controls return.
 * Nothing here says the tip was sent, or went to the worker, before the
 * ledger says released: a held tip is on its way.
 */

/** R6c (D3): the tip poll's three terminal branches, plus idle. */
type TipPhase = 'idle' | 'confirming' | 'gone' | 'timeout';

/** B1: the poll's success, for the poll and the re-read alike — the card was
 *  charged and the tip is held, queued for transfer to the worker
 *  ('charged'), or its transfer already landed ('released'). */
const isTipConfirmed = (outcome: TipPollState) => outcome === 'charged' || outcome === 'released';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function ReviewAndTipScreen() {
  // Until the review is sent there is no Done, so the scroller's last control (the tip's Send)
  // must end above the floating tab bar; once it is sent, Done floats and the bar steps aside.
  const navClearance = useScrollClearance();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const emeraldColors = emeraldColorsFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'ReviewAndTip'>>();
  const { job, missing } = useOwnedJobDetail(params.job);
  const { user } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [tip, setTip] = useState<Payment | null>(null);
  // Codex R5-A4: a replaced tip (failed or voided) whose refund failed or was arranged.
  const [tipIssue, setTipIssue] = useState<Payment | null>(null);
  const [loaded, setLoaded] = useState(false);
  // A failed payment read must BLOCK, not fall through: with payment=null the
  // approve gate below would wave a still-held job straight into the review
  // form (hardening run, A6/A8).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  // D15: the payments kill switch, read on focus; a failed read is true.
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);

  const [tipChoice, setTipChoice] = useState<number | 'custom' | null>(null);
  const [customTip, setCustomTip] = useState('');
  // 2026-09-26 (the refresh, audit M-26) — the review is the last step of the
  // job, so it gets an ending: once it is sent, a thank-you at the top and a
  // pinned way out (Done, or hire the same person again). The tip stays open.
  const [reviewed, setReviewed] = useState(false);
  const [confirmTip, setConfirmTip] = useState(false);
  const [sendingTip, setSendingTip] = useState(false);
  const sendingTipRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  // R6c (D3): the card tip's phase, the session the sheet needs between the
  // begin and the confirm, and the unmount guard the poll checks each tick.
  const [tipPhase, setTipPhase] = useState<TipPhase>('idle');
  const tipSessionRef = useRef<CheckoutSession | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    const [paymentRes, tipRes, tipIssueRes] = await Promise.all([
      fetchJobPaymentState(job.id),
      fetchJobTip(job.id),
      fetchJobRefundIssue(job.id, 'tip'),
    ]);
    if (paymentRes.error) setLoadError(userMessage(paymentRes.error));
    else setPayment(paymentRes.data);
    if (tipRes.error) {
      const message = userMessage(tipRes.error);
      setLoadError((prev) => prev ?? message);
    } else setTip(tipRes.data);
    if (tipIssueRes.error) {
      const message = userMessage(tipIssueRes.error);
      setLoadError((prev) => prev ?? message);
    } else setTipIssue(tipIssueRes.data);
    setLoaded(true);
  }, [job.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchRemoteConfig().then((config) => {
        if (active) setPaymentsEnabled(config.paymentsEnabled);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!job.assigned_worker_id) return;
      fetchProfileById(job.assigned_worker_id).then(({ data }) => {
        if (active) setWorkerName(data?.full_name ?? null);
      });
      return () => {
        active = false;
      };
    }, [job.assigned_worker_id])
  );

  const isOwner = !!user && user.id === job.client_id;
  const released = !!payment && isReleased(payment);
  // D23: a stripe row the customer approved keeps status held until the
  // provider's transfer lands. The gate below admits it — the decision is
  // made, and bouncing it back to approval would loop forever.
  const releaseRequested = !!payment && isReleaseRequested(payment);
  const stripe = paymentsMode === 'stripe';

  const tipCents =
    tipChoice === 'custom'
      ? dollarsToCents(customTip)
      : tipChoice ?? null;
  const tipValid = tipCents != null && !Number.isNaN(tipCents) && tipCents > 0 && tipCents <= 100000;
  // R6c (D3): on the card path a tip row can exist UNFUNDED (minted, sheet
  // not finished); it is a tip in progress, never a tip that went through.
  // B1: past unfunded the card was charged — a held tip is on its way to the
  // worker and a released one reached them; the note under the amount says
  // which.
  const tipPending = !!tip && tip.status === 'unfunded';
  const tipDone = !!tip && !tipPending;
  // TRUTH-R: which body the tip card shows, decided once; 'controls' = a tip can still be sent.
  const tipView =
    tipDone && tip ? 'done'
    : paymentsMode === 'disabled' ? 'disabled'
    : !stripe ? 'none'
    : !paymentsEnabled ? 'paused'
    : !payment ? 'noPayment'
    : !released ? 'notReleased'
    : !stripeReady() ? 'unavailable'
    : tipPhase === 'confirming' ? 'confirming'
    : tipPhase === 'timeout' ? 'timeout'
    : 'controls';

  /**
   * R6c (D3) step one: mint the tip row and its intent (create-payment →
   * begin_tip_payment, as the caller), then read the row back so the confirm
   * dialog shows ITS charge_amount_cents — never a figure this client computed
   * or the function returned. Nothing is charged until the sheet.
   */
  async function startCardTip() {
    if (!tipValid || tipCents == null || sendingTipRef.current) return;
    sendingTipRef.current = true;
    setSendingTip(true);
    try {
      const session = await paymentProvider.beginTipCheckout(job.id, tipCents);
      if (session.error || !session.data) {
        // The RPC's own sentence, as it is — "A tip was already added to this
        // job", "The job payment releases first — then a tip can be added",
        // the ceiling's dollar sentence.
        await alertAsync(
          'Could not start the tip',
          `${userMessage(session.error, 'Check your connection and try again.')}`
        );
        await load();
        return;
      }
      if ('confirmed' in session.data) {
        // SM-03: the tip's intent already settled (an earlier sheet went through): no dialog, no sheet;
        // the poll waits for it. Its row's amount, not the picked one, is what was charged.
        const { data: row } = await fetchJobTip(job.id);
        if (!activeRef.current) return;
        if (row) setTip(row);
        const earlier = earlierTipNotice(row?.amount_cents, tipCents, formatBudget);
        if (earlier) await alertAsync(earlier.title, earlier.message);
        if (!activeRef.current) return;
        await confirmCardTip();
        return;
      }
      tipSessionRef.current = session.data;
      const { data: row, error: rowError } = await fetchJobTip(job.id);
      if (!activeRef.current) return;
      // TRUTH-R: the dialog names the row's own charge, so with no fresh row it does not open.
      if (!row) {
        tipSessionRef.current = null;
        await alertAsync(
          'Could not start the tip',
          `${userMessage(rowError, 'Check your connection and try again.')}`
        );
        await load();
        return;
      }
      setTip(row);
      setTipPhase('idle');
      setConfirmTip(true);
    } finally {
      sendingTipRef.current = false;
      setSendingTip(false);
    }
  }

  /** Step two: the sheet takes the card, then the poll. A dismissed sheet is
   *  not an error and starts no poll — the row stays unfunded. */
  async function chargeTip() {
    const session = tipSessionRef.current;
    if (!session || sendingTipRef.current) return;
    sendingTipRef.current = true;
    setSendingTip(true);
    setConfirmTip(false);
    try {
      const sheet = await presentCheckoutSheet(session);
      if (!activeRef.current) return;
      if (sheet.outcome === 'dismissed') {
        await load();
        return;
      }
      if (sheet.outcome === 'failed') {
        await alertAsync(
          'The payment did not finish',
          `${userMessage(sheet.error, 'The payment could not be completed.')}\n\nYou can try again.`
        );
        await load();
        return;
      }
      await confirmCardTip();
    } finally {
      tipSessionRef.current = null;
      sendingTipRef.current = false;
      setSendingTip(false);
    }
  }

  /**
   * The poll (R6a D7's shape): fetchJobTip every 2 seconds for up to 30
   * seconds after a successful sheet. "Seen" starts true — create-payment
   * returned the row's id — so a row that reads null now IS the failed/voided
   * signal. Charged (held) or released is success: payment_intent.succeeded
   * holds the tip and queues its transfer at once (B1), and transfer.created
   * releases it.
   */
  async function confirmCardTip() {
    setTipPhase('confirming');
    const startedAt = Date.now();
    let seen = true;
    while (activeRef.current && Date.now() - startedAt < CHECKOUT_POLL_TIMEOUT_MS) {
      const { data, error } = await fetchJobTip(job.id);
      if (!activeRef.current) return;
      if (!error) {
        const outcome = classifyTipPoll({ status: data?.status ?? null, seen });
        if (data) {
          seen = true;
          setTip(data);
        }
        if (isTipConfirmed(outcome)) {
          setTipPhase('idle');
          setTipChoice(null);
          setCustomTip('');
          return;
        }
        if (outcome === 'gone') {
          setTip(null);
          setTipPhase('gone');
          return;
        }
      }
      await sleep(CHECKOUT_POLL_INTERVAL_MS);
    }
    if (activeRef.current) setTipPhase('timeout');
  }

  /** The third branch's re-read — one read, never a second tip. */
  async function recheckTip() {
    const { data, error } = await fetchJobTip(job.id);
    if (!activeRef.current || error) return;
    const outcome = classifyTipPoll({ status: data?.status ?? null, seen: true });
    if (data) setTip(data);
    if (isTipConfirmed(outcome)) {
      setTipPhase('idle');
      setTipChoice(null);
      setCustomTip('');
      return;
    }
    if (outcome === 'gone') {
      setTip(null);
      setTipPhase('gone');
    }
  }

  const gateState = missing
    ? {
        kind: 'empty' as const,
        title: 'This job is no longer available',
        body: 'It may have been deleted or you may no longer have access to it.',
        actionLabel: 'Back',
        onAction: goBackOrHome,
      }
    : !isOwner
      ? {
          kind: 'permissionDenied' as const,
          title: 'Only the job’s owner reviews here',
          body: 'The person who posted this job reviews the finished work.',
        }
      : job.status !== 'completed'
        ? {
            kind: 'empty' as const,
            title: 'The job isn’t finished yet',
            body: 'Review and tip open once the work is completed and approved.',
            actionLabel: 'Back to the job',
            onAction: goBackOrHome,
          }
        : !loaded
          ? { kind: 'loading' as const, variant: 'spinner' as const }
          : loadError
            ? {
                kind: 'error' as const,
                message: loadError,
                onRetry: () => void load(),
              }
            : payment && !released && !releaseRequested
            ? {
                kind: 'empty' as const,
                title: 'Approve the work first',
                // Codex R11-A2: a refund of it failed: approval releases nothing; the title and the button alone.
                body: isRefundFailureRecorded(payment) ? undefined : 'Release the held payment (or report an issue) before leaving your review — a review should never stand between the worker and their money.',
                actionLabel: 'Go to approval',
                onAction: () => navigation.replace('ApproveOrDispute', { job }),
              }
            : null;

  // The amount controls — three presets and a custom field. G1b: each choice is the built Chip
  // (its chosen ring and check, the same in both themes), so the screen paints no selection itself.
  const amountControls = (
    <>
      <View style={styles.presetRow}>
        {TIP_PRESETS_CENTS.map((cents) => (
          <Chip
            key={cents}
            label={formatBudget(cents)}
            selected={tipChoice === cents}
            onPress={() => setTipChoice(tipChoice === cents ? null : cents)}
          />
        ))}
        <Chip
          label="Other"
          selected={tipChoice === 'custom'}
          onPress={() => setTipChoice(tipChoice === 'custom' ? null : 'custom')}
        />
      </View>
      {tipChoice === 'custom' ? (
        <GlowTextInput
          glowRadius={radius.md}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          style={[styles.customInput, wellStyle(colors, isDark)]}
          value={customTip}
          onChangeText={setCustomTip}
          placeholder="Amount in dollars, up to $1,000"
          placeholderTextColor={colors.textSubtle}
          keyboardType="decimal-pad"
          maxLength={8}
          accessibilityLabel="Custom tip amount in dollars"
        />
      ) : null}
    </>
  );

  // R6c (D3): the card dialog's sentence, from the tip ROW's own columns —
  // its amount, its customer fee, its tax — never a client computation. The
  // row exists by the time the dialog opens (startCardTip minted it).
  const cardTipMessage = (() => {
    const who = workerName ?? 'the worker';
    const amount = tipPending && tip ? tip.amount_cents : tipCents ?? null;
    const fee = tip?.customer_fee_cents ?? 0;
    const tax = tip?.tax_cents ?? 0;
    const charge =
      fee > 0 && tax > 0
        ? ` Your card is charged the tip plus a ${formatBudget(fee)} protection fee and ${formatBudget(tax)} tax, through the secure payment sheet.`
        : fee > 0
          ? ` Your card is charged the tip plus a ${formatBudget(fee)} protection fee, through the secure payment sheet.`
          : tax > 0
            ? ` Your card is charged the tip plus ${formatBudget(tax)} tax, through the secure payment sheet.`
            : ' Your card is charged through the secure payment sheet.';
    return `A ${formatBudget(amount)} tip goes to ${who} as its own payment, separate from the job payment.${charge} One tip per job.`;
  })();

  // R6c (D3) and B1: the note under a charged tip's amount. Where the tip is
  // follows the row: held is on its way to the worker (charged, its transfer
  // queued), released or paid_out went to them, and any other state (a
  // refund) gets no such sentence. The all-in figure is the tip ROW's
  // charge_amount_cents, read off the row — the card was charged once the
  // row is past unfunded.
  const tipDoneNote = (() => {
    if (!tip) return null;
    // R4-A5, P3: a failed or arranged refund of the tip: never "on its way" or "went to" the worker.
    // Codex R7-A3: "on its way" asks the one payout rule (a refund queued, or a tip not queued, says nothing).
    const where = isRefundFailed(tip) || isRefundArranged(tip)
      ? null
      : isPayoutOnItsWay(tip)
        ? `Your tip is on its way to ${workerName ?? 'the worker'} on top of the job payment.`
        : isReleased(tip)
          ? `Your tip went to ${workerName ?? 'the worker'} on top of the job payment.`
          : null;
    const charged =
      tip.charge_amount_cents == null
        ? null
        : tip.charge_amount_cents > tip.amount_cents
          ? `Your card was charged ${formatBudget(tip.charge_amount_cents)} — the tip plus its protection fee.`
          : `Your card was charged ${formatBudget(tip.charge_amount_cents)}.`;
    return [where, charged].filter(Boolean).join(' ') || null;
  })();

  return (
    // The tab bar owns the bottom inset until Done floats; FloatingAction keeps its own.
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader
        title="Review & Tip"
        subtitle={job.title}
        onBack={goBackOrHome}
        palette={emeraldColors}
      />
      {gateState ? (
        <ScreenStateView state={gateState} />
      ) : (
        <KeyboardAvoid
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.content, !reviewed && { paddingBottom: Math.max(spacing.xxl, navClearance) }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {reviewed ? (
              <Card style={styles.thanksCard} palette={emeraldColors}>
                <View style={styles.thanksRow} accessibilityLiveRegion="polite">
                  <Announce message={`Thanks — ${workerName ?? 'the worker'} has been rated.`} />
                  <Ionicons name="checkmark-circle" size={26} color={colors.emerald} />
                  <View style={styles.thanksCopy}>
                    <Text style={styles.thanksTitle}>
                      Thanks — {workerName ?? 'the worker'} has been rated.
                    </Text>
                    <Text style={styles.cardNote}>That closes the job.{tipView === 'controls' ? ' A tip is still open below.' : null}</Text>
                  </View>
                </View>
                {/* G1b RESTRUCTURE: the second way out sits with the thanks; Done floats as the one main action. */}
                {job.assigned_worker_id ? (
                  <Button
                    title={`Hire ${(workerName ?? 'them').split(/\s+/)[0]} Again`}
                    variant="quiet"
                    size="sm"
                    palette={emeraldColors}
                    onPress={() =>
                      navigation.navigate('PostJob', {
                        hireWorkerId: job.assigned_worker_id!,
                        hireWorkerName: workerName ?? 'this worker',
                      })
                    }
                  />
                ) : null}
              </Card>
            ) : null}

            {payment ? (
              <Card style={styles.paymentCard} palette={emeraldColors}>
                {/* D23: a stripe row is either released or approved with the
                    payout on its way — MoneyText keeps the row's real status
                    either way. */}
                {/* C4: PAYMENT in every state; the caption says Paid or Approved — on its way. */}
                <Text style={styles.eyebrow}>{paymentEyebrow()}</Text>
                <MoneyText
                  cents={customerChargeCents(payment)}
                  state={payment.status}
                  releaseRequested={!!payment.release_requested_at}
                  refundQueued={isRefundQueued(payment)}
                  feeKept={isCancellationFeeKept(payment)}
                  refundFailed={isRefundFailed(payment)}
                  refundArranged={isRefundArranged(payment)}
                  payoutOnItsWay={isPayoutOnItsWay(payment)}
                  counterpartFirstName={firstNameOf(workerName)}
                />
                <Text style={styles.cardNote}>
                  {released
                    ? payment.release_reason === 'auto_approved'
                      ? 'Released automatically.'
                      : 'Released on your approval.'
                    : !isPayoutOnItsWay(payment)
                      ? // Codex R5-A5, R7-A3: never "on its way" beside a refund of this payment (queued, failed or arranged).
                        payment.release_reason === 'auto_approved'
                        ? 'Approved automatically.'
                        : 'Approved on your say-so.'
                      : payment.release_reason === 'auto_approved'
                        ? 'Approved automatically. The payment is on its way to the worker and shows as released when the transfer lands.'
                        : 'Approved on your say-so. The payment is on its way to the worker and shows as released when the transfer lands.'}
                </Text>
              </Card>
            ) : null}

            {user && job.assigned_worker_id ? (
              <ReviewSection
                key={`${job.id}:${user.id}`}
                jobId={job.id}
                reviewerId={user.id}
                revieweeId={job.assigned_worker_id}
                revieweeName={workerName ?? 'the worker'}
                revieweeRole="worker"
                scrollRef={scrollRef}
                palette={emeraldColors}
                onSubmitted={() => {
                  setReviewed(true);
                  scrollRef.current?.scrollTo({ y: 0, animated: true });
                }}
              />
            ) : null}

            {/* G1b: the cards take the review card's palette, so the three read as one family. */}
            <Card style={styles.tipCard} palette={emeraldColors}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Add a tip?</Text>
              {/* Codex R5-A4: a replaced tip, charged late, whose refund failed or was arranged. */}
              {tipIssue ? (
                <MoneyText
                  cents={tipIssue.amount_cents}
                  state={tipIssue.status}
                  tip
                  refundFailed={isRefundFailed(tipIssue)}
                  refundArranged={isRefundArranged(tipIssue)}
                  counterpartFirstName={firstNameOf(workerName)}
                />
              ) : null}
              {tipView === 'done' && tip ? (
                <>
                  <MoneyText
                    cents={tip.amount_cents}
                    state={tip.status}
                    tip
                    refundQueued={isRefundQueued(tip)}
                    refundFailed={isRefundFailed(tip)}
                    refundArranged={isRefundArranged(tip)}
                    payoutOnItsWay={isPayoutOnItsWay(tip)}
                    counterpartFirstName={firstNameOf(workerName)}
                  />
                  {tipDoneNote ? <Text style={styles.cardNote}>{tipDoneNote}</Text> : null}
                </>
              ) : tipView === 'disabled' ? (
                <Text style={styles.cardNote}>
                  Payments aren’t available right now, so tipping is unavailable.
                </Text>
              ) : tipView !== 'none' ? (
                // R6c (D3): the card tip — the amount controls, then
                // create-payment → the sheet → the poll.
                // Each gate below is a refusal begin_tip_payment would give,
                // said before the tap where the screen already knows it.
                tipView === 'paused' ? (
                  <Text style={styles.cardNote}>
                    Payments are paused right now, so tipping is unavailable for the moment.
                  </Text>
                ) : tipView === 'noPayment' ? (
                  <Text style={styles.cardNote}>
                    This job finished without a protected payment, so there is no
                    payment to add a tip onto.
                  </Text>
                ) : tipView === 'notReleased' && payment ? (
                  // D23: approved, payout pending — begin_tip_payment refuses
                  // until the transfer lands. A10a (2026-10-03): the tip opens
                  // once the payment reaches the worker, and the screen says
                  // why — and what the wait is, when it is their payout setup.
                  // Codex R6-A3, R7-A3: the payout sentence only under the one payout rule.
                  <Text style={styles.cardNote}>
                    A tip can be added once the job payment reaches {workerName ?? 'the worker'}.
                    {isPayoutOnItsWay(payment)
                      ? ' Yours is approved and on its way — if they haven’t set up payouts yet, it lands the moment they do.'
                      : null}
                  </Text>
                ) : tipView === 'unavailable' ? (
                  <Text style={styles.cardNote}>{STRIPE_UNAVAILABLE_MESSAGE}</Text>
                ) : tipView === 'confirming' ? (
                  <View style={styles.confirmingRow}>
                    <ActivityIndicator size="small" color={colors.emerald} />
                    <Text style={styles.cardNote}>Confirming your tip…</Text>
                  </View>
                ) : tipView === 'timeout' ? (
                  <>
                    <Text style={styles.cardNote}>
                      The card was charged, but the app hasn’t seen the tip confirm
                      yet. Check again shortly — once it confirms, the tip shows
                      here.
                    </Text>
                    <Button
                      title="Check Again"
                      palette={emeraldColors}
                      onPress={() => void recheckTip()}
                      disabled={sendingTip}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.cardNote}>
                      {tipPhase === 'gone'
                        ? 'The tip did not go through. You can try again below.'
                        : tipPending && tip
                          ? `A ${formatBudget(tip.amount_cents)} tip is started but not confirmed. Finish it below, or choose another amount.`
                          : `Entirely optional — every cent of the tip goes to ${workerName ?? 'the worker'}.`}
                    </Text>
                    {amountControls}
                    {/* M-26 — always here, so the next step is visible
                        before an amount is chosen; it enables with one. */}
                    {/* G1b: secondary, so the screen keeps one main action (Submit Review, then Done). */}
                    <Button
                      title={
                        tipValid
                          ? `Send ${formatBudget(tipCents)} Tip by Card`
                          : 'Send Tip by Card'
                      }
                      variant="secondary"
                      palette={emeraldColors}
                      onPress={() => void startCardTip()}
                      disabled={tipChoice === null || !tipValid || sendingTip}
                      loading={sendingTip}
                    />
                  </>
                )
              ) : null}
            </Card>
          </ScrollView>
        </KeyboardAvoid>
      )}
      {/* G1b RESTRUCTURE: once the review is sent, Done floats full width with no plate; the bar steps aside. */}
      {!gateState && reviewed ? <FloatingAction title="Done" onPress={goBackOrHome} /> : null}

      <ConfirmDialog
        visible={confirmTip}
        title={
          stripe && tip?.charge_amount_cents != null
            ? `Charge ${formatBudget(tip.charge_amount_cents)} to your card?`
            : `Send a ${formatBudget(tipCents ?? null)} tip?`
        }
        message={cardTipMessage}
        confirmText={stripe ? 'Pay & Send Tip' : 'Send Tip'}
        loading={sendingTip}
        palette={emeraldColors}
        onConfirm={chargeTip}
        onCancel={() => {
          setConfirmTip(false);
          // R6c: the unfunded tip row keeps its funding window; the controls
          // return with the "started but not confirmed" note.
          tipSessionRef.current = null;
        }}
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  // M-26 — the completion moment; Done floats under it (G1b).
  thanksCard: { gap: spacing.md },
  thanksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thanksCopy: { flex: 1, gap: 2 },
  thanksTitle: {
    ...textScale.headline,
    fontWeight: '800',
    color: colors.ink,
  },
  eyebrow: {
    ...EYEBROW_TYPE,
    color: colors.eyebrow,
  },
  // G1b: the card heading in the review card's display type, so the two card titles match.
  sectionTitle: {
    ...textScale.title,
    color: colors.ink,
  },
  paymentCard: {
    gap: spacing.sm,
  },
  cardNote: {
    ...textScale.body,
    color: colors.textMuted,
  },
  confirmingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tipCard: {
    gap: spacing.md,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  customInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: textScale.callout.fontSize,
    color: colors.ink,
  },
  }),
);
