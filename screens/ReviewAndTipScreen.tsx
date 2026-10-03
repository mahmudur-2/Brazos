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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GlowTextInput } from '../components/GlowTextInput';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReviewSection } from '../components/ReviewSection';
import { ScreenHeader } from '../components/ScreenHeader';
import { ScreenStateView } from '../ui/templates/ScreenStates';
import { usePinnedFooterPadding, useScrollClearance } from '../ui/primitives';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import {
  classifyTipPoll,
  fetchJobPaymentState,
  fetchJobTip,
  isReleased,
  isReleaseRequested,
  type Payment,
} from '../lib/payments';
import {
  presentCheckoutSheet,
  stripeReady,
  STRIPE_UNAVAILABLE_MESSAGE,
  type CheckoutSession,
} from '../lib/payments/stripe';
import { CHECKOUT_POLL_INTERVAL_MS, CHECKOUT_POLL_TIMEOUT_MS } from '../lib/payments/stripeRules';
import { fetchProfileById } from '../lib/profiles';
import { fetchRemoteConfig } from '../lib/remoteConfig';
import { dollarsToCents, formatBudget } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import {
  emeraldColorsFor,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  selectedInDark,
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
 * The tip is a REAL sandbox ledger row (kind='tip', born released) written by
 * sandbox_tip_worker() — release-first and one-per-job are enforced there,
 * not here.
 *
 * ON THE CARD PATH (R6c, D3) the tip is a second checkout session, shaped on
 * screen 31's: create-payment mints the tip row through begin_tip_payment
 * (its refusals — one tip per job, release first, the job's own dollar
 * ceiling — are shown as they are), the row is read back so the confirm
 * dialog shows ITS charge_amount_cents, the same payment sheet takes the
 * card, and the screen POLLS the tip row (2s, up to 30s) for exactly three
 * outcomes: released (a tip has no held stop — payment_intent.succeeded
 * releases it), gone (the row failed or was voided), or timed out (an honest
 * sentence and a re-read; never a second tip). A dismissed sheet is not an
 * error: the unfunded row keeps its funding window and the controls return.
 * Nothing here says "sent" or "charged" before the ledger says released.
 */

/** R6c (D3): the tip poll's three terminal branches, plus idle. */
type TipPhase = 'idle' | 'confirming' | 'gone' | 'timeout';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function ReviewAndTipScreen() {
  const footerPad = usePinnedFooterPadding();
  // Until the review is sent there is no done bar, so the scroller's last control (the tip's Send)
  // must end above the floating tab bar; once it is sent, the done bar clears it.
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
    const [paymentRes, tipRes] = await Promise.all([
      fetchJobPaymentState(job.id),
      fetchJobTip(job.id),
    ]);
    if (paymentRes.error) setLoadError(userMessage(paymentRes.error));
    else setPayment(paymentRes.data);
    if (tipRes.error) {
      const message = userMessage(tipRes.error);
      setLoadError((prev) => prev ?? message);
    } else setTip(tipRes.data);
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
  // not finished); it is a tip in progress, never a tip that went through. A
  // sandbox tip is born released, so for sandbox `tipDone` is exactly `tip`.
  const tipPending = !!tip && tip.status === 'unfunded';
  const tipDone = !!tip && !tipPending;

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
          `${userMessage(session.error, 'Check your connection and try again.')}\n\nNo tip was sent and nothing was charged.`
        );
        await load();
        return;
      }
      tipSessionRef.current = session.data;
      const { data: row } = await fetchJobTip(job.id);
      if (!activeRef.current) return;
      if (row) setTip(row);
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
          'The card was not charged',
          `${userMessage(sheet.error, 'The card could not be charged.')}\n\nNo tip was sent — you can try again.`
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
   * signal. Released is success: a tip has no held stop.
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
        if (outcome === 'released') {
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
    if (outcome === 'released') {
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

  async function sendTip() {
    if (!tipValid || tipCents == null || sendingTipRef.current) return;
    sendingTipRef.current = true;
    setSendingTip(true);
    try {
      const result = await paymentProvider.tipWorker(job.id, tipCents);
      if (result.error || !result.data) {
        await alertAsync(
          'Could not send the tip',
          `${userMessage(result.error, 'Check your connection and try again.')}\n\nNo tip was recorded.`
        );
        await load();
        return;
      }
      setTip(result.data);
      setTipChoice(null);
      setCustomTip('');
    } finally {
      sendingTipRef.current = false;
      setSendingTip(false);
      setConfirmTip(false);
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
                body: 'Release the held payment (or report an issue) before leaving your review — a review should never stand between the worker and their money.',
                actionLabel: 'Go to approval',
                onAction: () => navigation.replace('ApproveOrDispute', { job }),
              }
            : null;

  // The amount controls — three presets and a custom field — shared by both
  // paths; the sandbox renders them exactly as before.
  const amountControls = (
    <>
      <View style={styles.presetRow}>
        {TIP_PRESETS_CENTS.map((cents) => (
          <Pressable
            key={cents}
            style={[
              styles.preset,
              tipChoice === cents &&
                (isDark ? styles.presetActiveDark : styles.presetActive),
            ]}
            onPress={() => setTipChoice(tipChoice === cents ? null : cents)}
            accessibilityRole="button"
            accessibilityState={{ selected: tipChoice === cents }}
          >
            <Text
              style={[
                styles.presetText,
                tipChoice === cents &&
                  (isDark ? styles.presetTextActiveDark : styles.presetTextActive),
              ]}
            >
              {formatBudget(cents)}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[
            styles.preset,
            tipChoice === 'custom' &&
              (isDark ? styles.presetActiveDark : styles.presetActive),
          ]}
          onPress={() => setTipChoice(tipChoice === 'custom' ? null : 'custom')}
          accessibilityRole="button"
          accessibilityState={{ selected: tipChoice === 'custom' }}
        >
          <Text
            style={[
              styles.presetText,
              tipChoice === 'custom' &&
                (isDark ? styles.presetTextActiveDark : styles.presetTextActive),
            ]}
          >
            Other
          </Text>
        </Pressable>
      </View>
      {tipChoice === 'custom' ? (
        <GlowTextInput
              glowRadius={radius.lg}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          style={styles.customInput}
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
    return `A ${formatBudget(amount)} tip goes straight to ${who} as its own payment, separate from the job payment.${charge} One tip per job.`;
  })();

  return (
    // The tab bar owns the bottom inset, so the pinned bar sits on it.
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
        <KeyboardAvoidingView
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
              <View style={styles.thanksCard} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle" size={26} color={colors.emerald} />
                <View style={styles.thanksCopy}>
                  <Text style={styles.thanksTitle}>
                    Thanks — {workerName ?? 'the worker'} has been rated.
                  </Text>
                  <Text style={styles.cardNote}>That closes the job. A tip is still open below.</Text>
                </View>
              </View>
            ) : null}

            {payment ? (
              <View style={styles.paymentCard}>
                {/* D16 / D23: sandbox keeps its wording verbatim; a stripe
                    row is either released or approved with the payout on its
                    way — MoneyText keeps the row's real status either way. */}
                <Text style={styles.eyebrow}>
                  {paymentsMode === 'sandbox'
                    ? 'PAYMENT RELEASED · SANDBOX'
                    : released
                      ? 'PAYMENT RELEASED'
                      : 'APPROVED · PAYOUT ON ITS WAY'}
                </Text>
                <MoneyText cents={payment.amount_cents} state={payment.status} />
                <Text style={styles.cardNote}>
                  {paymentsMode === 'sandbox'
                    ? payment.release_reason === 'auto_approved'
                      ? 'Released automatically after 72 hours. Sandbox build — no real money moved.'
                      : 'Released on your approval. Sandbox build — no real money moved.'
                    : released
                      ? payment.release_reason === 'auto_approved'
                        ? 'Released automatically after 72 hours.'
                        : 'Released on your approval.'
                      : payment.release_reason === 'auto_approved'
                        ? 'Approved automatically after 72 hours. The payment is on its way to the worker and shows as released when the transfer lands.'
                        : 'Approved on your say-so. The payment is on its way to the worker and shows as released when the transfer lands.'}
                </Text>
              </View>
            ) : null}

            {user && job.assigned_worker_id ? (
              <ReviewSection
                key={`${job.id}:${user.id}`}
                jobId={job.id}
                reviewerId={user.id}
                revieweeId={job.assigned_worker_id}
                revieweeName={workerName ?? 'the worker'}
                revieweeRole="worker"
                prompt={`How was ${workerName ?? 'the worker'}’s work?`}
                scrollRef={scrollRef}
                palette={emeraldColors}
                onSubmitted={() => {
                  setReviewed(true);
                  scrollRef.current?.scrollTo({ y: 0, animated: true });
                }}
              />
            ) : null}

            <View style={styles.tipCard}>
              <Text style={styles.sectionTitle}>Add a tip?</Text>
              {tipDone && tip ? (
                <>
                  <MoneyText cents={tip.amount_cents} state={tip.status} />
                  <Text style={styles.cardNote}>
                    {paymentsMode === 'sandbox'
                      ? `Your tip went to ${workerName ?? 'the worker'} on top of the job payment. Sandbox build — no real money moved.`
                      : // R6c (D3): the all-in figure is the tip ROW's
                        // charge_amount_cents, read off the row, and it is
                        // said only once the row reads released.
                        tip.charge_amount_cents != null
                        ? tip.charge_amount_cents > tip.amount_cents
                          ? `Your tip went to ${workerName ?? 'the worker'} on top of the job payment. Your card was charged ${formatBudget(tip.charge_amount_cents)} — the tip plus its protection fee.`
                          : `Your tip went to ${workerName ?? 'the worker'} on top of the job payment. Your card was charged ${formatBudget(tip.charge_amount_cents)}.`
                        : `Your tip went to ${workerName ?? 'the worker'} on top of the job payment.`}
                  </Text>
                </>
              ) : paymentsMode === 'disabled' ? (
                <Text style={styles.cardNote}>
                  Payments are off in this build, so tipping is unavailable.
                </Text>
              ) : stripe ? (
                // R6c (D3): the card tip — the same amount controls as the
                // sandbox path, then create-payment → the sheet → the poll.
                // Each gate below is a refusal begin_tip_payment would give,
                // said before the tap where the screen already knows it.
                !paymentsEnabled ? (
                  <Text style={styles.cardNote}>
                    Payments are paused right now, so tipping is unavailable for the moment.
                  </Text>
                ) : !payment ? (
                  <Text style={styles.cardNote}>
                    This job finished without a protected payment, so there is no
                    payment to add a tip onto.
                  </Text>
                ) : !released ? (
                  // D23: approved, payout pending — begin_tip_payment refuses
                  // until the transfer lands. A10a (2026-10-03): the tip opens
                  // once the payment reaches the worker, and the screen says
                  // why — and what the wait is, when it is their payout setup.
                  <Text style={styles.cardNote}>
                    A tip can be added once the job payment reaches {workerName ?? 'the worker'}.
                    Yours is approved and on its way — if they haven’t set up payouts yet, it
                    lands the moment they do.
                  </Text>
                ) : !stripeReady() ? (
                  <Text style={styles.cardNote}>{STRIPE_UNAVAILABLE_MESSAGE}</Text>
                ) : tipPhase === 'confirming' ? (
                  <View style={styles.confirmingRow}>
                    <ActivityIndicator size="small" color={colors.emerald} />
                    <Text style={styles.cardNote}>Confirming your tip…</Text>
                  </View>
                ) : tipPhase === 'timeout' ? (
                  <>
                    <Text style={styles.cardNote}>
                      The card was charged, but the app hasn’t seen the tip confirm
                      yet. Check again shortly — once it confirms, the tip shows
                      here as sent.
                    </Text>
                    <Button
                      title="Check again"
                      palette={emeraldColors}
                      onPress={() => void recheckTip()}
                      disabled={sendingTip}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.cardNote}>
                      {tipPhase === 'gone'
                        ? 'The tip did not go through. Nothing was charged for it — you can try again below.'
                        : tipPending && tip
                          ? `A ${formatBudget(tip.amount_cents)} tip is started but not sent — nothing has been charged. Finish it below, or choose another amount.`
                          : `Entirely optional — every cent of the tip goes to ${workerName ?? 'the worker'}.`}
                    </Text>
                    {amountControls}
                    {/* M-26 — always here, so the next step is visible
                        before an amount is chosen; it enables with one. */}
                    <Button
                      title={
                        tipValid
                          ? `Send ${formatBudget(tipCents)} tip by card`
                          : 'Send tip by card'
                      }
                      palette={emeraldColors}
                      onPress={() => void startCardTip()}
                      disabled={tipChoice === null || !tipValid || sendingTip}
                      loading={sendingTip}
                    />
                  </>
                )
              ) : !paymentsEnabled ? (
                // D15: the kill switch hides the tip CTA.
                <Text style={styles.cardNote}>
                  Payments are paused right now, so tipping is unavailable for the moment.
                </Text>
              ) : !payment ? (
                <Text style={styles.cardNote}>
                  This job finished without a protected payment, so there is no
                  payment to add a tip onto.
                </Text>
              ) : (
                <>
                  <Text style={styles.cardNote}>
                    Entirely optional — every cent goes to{' '}
                    {workerName ?? 'the worker'}. Sandbox build, no real money.
                  </Text>
                  {amountControls}
                  {/* M-26 — always here; it enables with an amount. */}
                  <Button
                    title={
                      tipValid
                        ? `Send ${formatBudget(tipCents)} tip (sandbox)`
                        : 'Send tip (sandbox)'
                    }
                    palette={emeraldColors}
                    onPress={() => setConfirmTip(true)}
                    disabled={tipChoice === null || !tipValid || sendingTip}
                    loading={sendingTip}
                  />
                </>
              )}
            </View>
          </ScrollView>
          {reviewed ? (
            <View style={[styles.doneBar, { paddingBottom: footerPad }]}>
              {job.assigned_worker_id ? (
                <Button
                  title={`Hire ${(workerName ?? 'them').split(/\s+/)[0]} again`}
                  variant="secondary"
                  palette={emeraldColors}
                  onPress={() =>
                    navigation.navigate('PostJob', {
                      hireWorkerId: job.assigned_worker_id!,
                      hireWorkerName: workerName ?? 'this worker',
                    })
                  }
                  style={styles.doneAction}
                />
              ) : null}
              <Button title="Done" palette={emeraldColors} onPress={goBackOrHome} style={styles.doneAction} />
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}

      <ConfirmDialog
        visible={confirmTip}
        title={
          stripe && tip?.charge_amount_cents != null
            ? `Charge ${formatBudget(tip.charge_amount_cents)} to your card?`
            : `Send a ${formatBudget(tipCents ?? null)} tip?`
        }
        message={
          paymentsMode === 'sandbox'
            ? `The tip goes straight to ${workerName ?? 'the worker'} as its own ledger entry, separate from the job payment. One tip per job. No real money moves in this sandbox build.`
            : cardTipMessage
        }
        confirmText={stripe ? 'Pay & send tip' : 'Send tip'}
        cancelText="Not now"
        loading={sendingTip}
        palette={emeraldColors}
        onConfirm={stripe ? chargeTip : sendTip}
        onCancel={() => {
          setConfirmTip(false);
          // R6c: the unfunded tip row keeps its funding window; the controls
          // return with the "started but not sent" note.
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
  // M-26 — the completion moment and its pinned way out.
  thanksCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thanksCopy: { flex: 1, gap: 2 },
  thanksTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  doneBar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  doneAction: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.eyebrow,
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  paymentCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  cardNote: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  confirmingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tipCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preset: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
  },
  // emerald D6: one selection treatment — gold line, gold label, no fill.
  presetActiveDark: {
    borderColor: selectedInDark(colors).line,
    backgroundColor: selectedInDark(colors).fill,
  },
  presetText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  presetTextActive: {
    color: colors.emerald,
  },
  presetTextActiveDark: {
    color: selectedInDark(colors).line,
  },
  customInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  }),
);
