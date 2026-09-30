import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import {
  canOfferJobFunding,
  fetchJobPayment,
  quoteJobPrice,
  type JobPriceQuote,
  type Payment,
} from '../lib/payments';
import { confirmWithSavedCard, presentCheckoutSheet, stripeReady, STRIPE_UNAVAILABLE_MESSAGE } from '../lib/payments/stripe';
import { cardLabel, listSavedCards, type SavedCard } from '../lib/paymentMethods';
import { Toggle } from '../ui/primitives';
import {
  CHECKOUT_POLL_INTERVAL_MS,
  CHECKOUT_POLL_TIMEOUT_MS,
  classifyCheckoutPoll,
} from '../lib/payments/stripeRules';
import { releaseCountdownLabel } from '../lib/jobLifecycle';
import { fetchRemoteConfig } from '../lib/remoteConfig';
import { fetchProfileById } from '../lib/profiles';
import { arrivalWindowLabel, formatBudget } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * Screen 31 — Protected Checkout, over the payment ADAPTER
 * (lib/adapters/payments.ts), never the RPCs directly.
 *
 * TWO FUNCTIONAL MODES, ONE SCREEN (R6a).
 *
 * SANDBOX says so on screen — the VerifyPhoneScreen "MOCK MODE" banner
 * precedent (06_DEFERRED_INTEGRATIONS: every dev surface visibly labeled, not
 * just documented). What is NOT fake: the ledger row is real Supabase state,
 * authorize -> held are real audited transitions, and the money vocabulary is
 * §H.3's — authorized means authorized, held means held, and nothing on this
 * screen (or anywhere) can say released or paid. One decision, stated before
 * the tap; both provider calls are idempotent, so a retry after a dropped
 * response continues from wherever the ledger truthfully is instead of
 * double-charging (the DB's partial unique index is the second lock).
 *
 * STRIPE takes the card (D5): create-payment mints the ledger row and the
 * intent → the payment sheet takes the card → the screen POLLS the row until
 * it reads held (D7). The row is `unfunded` until the provider's webhook
 * lands, and a successful sheet is never presented as "held". The price shown
 * is the ALL-IN total (D13): the row's charge_amount_cents once a row exists,
 * quote_job_price() before it (D22) — never the bare agreed price as what the
 * card is charged, and never a fee this client computed (D10).
 *
 * Every checkout CTA also answers to the payments kill switch (D15) and, on a
 * stripe row, to its funding window (D9, D14): a lapsed window is never
 * extended, so it is never offered a charge.
 */

const stripe = paymentsMode === 'stripe';

/** D7's three terminal branches, plus idle. */
type CheckoutPhase = 'idle' | 'confirming' | 'gone' | 'timeout';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The customer's figures — the same four numbers from either source (D22). */
type CustomerFigures = {
  total: number;
  price: number;
  fee: number;
  tax: number;
  source: 'row' | 'quote';
};

export function CheckoutScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'Checkout'>>();
  const { job, missing } = useOwnedJobDetail(params.job);
  const { user } = useAuth();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [funding, setFunding] = useState(false);
  const fundingRef = useRef(false);
  // 2026-09-30 (idea 20) — the card the customer saved for one-tap hiring (read at the provider, stripe
  // only), which of the two ways the confirm pays, and the opt-in to save the card the sheet takes.
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [cardsRead, setCardsRead] = useState(false);
  const [dialogPath, setDialogPath] = useState<'saved' | 'sheet'>('sheet');
  const [saveCard, setSaveCard] = useState(false);
  const oneTapRef = useRef(false);
  // The pre-row price (D22) — stripe only; sandbox never asks for it.
  const [quote, setQuote] = useState<JobPriceQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  // The kill switch (D15): read on focus; a failed read falls back to true.
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  // One clock reading per load (and one per minute while a funding window is
  // showing), so the countdown and the D9 gate agree with each other.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const activeRef = useRef(true);

  const amountCents = job.final_amount_cents ?? job.budget_cents;
  const isOwner = !!user && user.id === job.client_id;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const loadPayment = useCallback(async (): Promise<Payment | null> => {
    setPaymentError(null);
    const { data, error } = await fetchJobPayment(job.id);
    setNowMs(Date.now());
    if (error) {
      setPaymentError(userMessage(error));
      setPaymentLoaded(true);
      return null;
    }
    setPayment(data);
    setPaymentLoaded(true);
    return data;
  }, [job.id]);

  /**
   * D22: with no ledger row the all-in total comes from quote_job_price(),
   * the database's own schedule. A failed quote disables the CTA with the
   * read's error and a retry — a bare agreed price is never presented as
   * what the card is charged.
   */
  const loadQuote = useCallback(async () => {
    if (!stripe) return;
    setQuoteError(null);
    if (amountCents == null) {
      setQuote(null);
      setQuoteError('This job has no agreed amount to charge yet.');
      return;
    }
    setQuoteLoading(true);
    const { data, error } = await quoteJobPrice(amountCents);
    setQuoteLoading(false);
    if (error || !data) {
      setQuote(null);
      setQuoteError(userMessage(error, 'The price could not be worked out right now.'));
      return;
    }
    setQuote(data);
  }, [amountCents]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const row = await loadPayment();
        if (!active) return;
        // The row's own figures replace the quote the moment a row exists.
        if (stripe && (!row || row.charge_amount_cents == null)) await loadQuote();
      })();
      return () => {
        active = false;
      };
    }, [loadPayment, loadQuote])
  );

  // Idea 20: the saved card, read once per visit (stripe only — sandbox never holds a card).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!stripe) {
        setCardsRead(true);
        return;
      }
      listSavedCards().then(({ data }) => {
        if (!active) return;
        setSavedCard(data[0] ?? null);
        setCardsRead(true);
      });
      return () => {
        active = false;
      };
    }, [])
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

  // D14: an unfunded stripe row's funding window, as a deadline in epoch ms.
  const fundingDueMs =
    payment?.status === 'unfunded' && payment.funding_due_at
      ? Date.parse(payment.funding_due_at)
      : null;
  const hasWindow = fundingDueMs != null && Number.isFinite(fundingDueMs);
  const windowOpen = hasWindow && nowMs < (fundingDueMs as number);
  const windowClosed = hasWindow && nowMs >= (fundingDueMs as number);

  useEffect(() => {
    if (!windowOpen) return;
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [windowOpen]);

  const state: ScreenState = missing
    ? {
        kind: 'empty',
        title: 'This job is no longer available',
        body: 'It may have been deleted or you may no longer have access to it.',
        actionLabel: 'Back',
        onAction: goBackOrHome,
      }
    : paymentsMode === 'disabled'
      ? {
          kind: 'permissionDenied',
          title: 'Payments are off in this build',
          body: 'No payment mode is switched on, so nothing can be authorized or held. Your accepted offer is unaffected.',
        }
      : stripe && !stripeReady()
        ? {
            // D4: a binary predating the native module, or a build without
            // the publishable key — the one honest sentence, never a spinner.
            kind: 'permissionDenied',
            title: 'Card payments need an update',
            body: `${STRIPE_UNAVAILABLE_MESSAGE} Your accepted offer is unaffected.`,
          }
        : !isOwner
          ? {
              kind: 'permissionDenied',
              title: 'Only the job’s owner can check out',
              body: 'The person who posted this job funds its protected payment.',
            }
          : job.status !== 'assigned' && job.status !== 'in_progress' && job.status !== 'completed'
            ? {
                kind: 'empty',
                title: 'Nothing to check out yet',
                body: 'Accept an offer first — checkout protects the payment for an accepted offer.',
                actionLabel: 'Back to the job',
                onAction: goBackOrHome,
              }
            : // Idea 20: on the card path the saved-card read is part of the page — painting without it
              // would insert the opt-in row, or swap the action bar, a beat later.
              !paymentLoaded || (stripe && !cardsRead)
              ? { kind: 'loading', variant: 'spinner' }
              : paymentError
                ? {
                    kind: 'error',
                    message: paymentError,
                    onRetry: () => void loadPayment(),
                  }
                : phase === 'confirming'
                  ? // D7: a spinner and the words in the header, and NO
                    // control that could imply the charge was undone.
                    { kind: 'loading', variant: 'spinner' }
                  : { kind: 'ready' };

  const held = payment?.status === 'held';
  const authorizedOnly = payment?.status === 'authorized';
  // D9 / D14: THE one derivation of whether checkout may be offered on this
  // row — an unfunded row inside its window is, a lapsed one never is.
  const canFund = canOfferJobFunding({ viewerId: user?.id, job, payment, nowMs });

  // D13 / D22: the customer's all-in figures — the row's once a row exists,
  // the quote before it. Sandbox keeps its own rows below, untouched.
  const figures: CustomerFigures | null = !stripe
    ? null
    : payment && payment.charge_amount_cents != null
      ? {
          total: payment.charge_amount_cents,
          price: payment.amount_cents,
          fee: payment.customer_fee_cents ?? 0,
          tax: payment.tax_cents ?? 0,
          source: 'row',
        }
      : quote
        ? {
            total: quote.total_cents,
            price: quote.job_price_cents,
            fee: quote.customer_fee_cents,
            tax: quote.tax_cents,
            source: 'quote',
          }
        : null;

  /**
   * The one sandbox funding action. Runs whichever half is still missing —
   * both calls are idempotent, so a retry after a half-completed attempt
   * picks up from the ledger's real state.
   */
  async function fundProtection() {
    if (fundingRef.current) return;
    fundingRef.current = true;
    setFunding(true);
    try {
      const authorized = await paymentProvider.authorizeJobPayment(job.id);
      if (authorized.error || !authorized.data) {
        await alertAsync(
          'Could not authorize the payment',
          `${userMessage(authorized.error, 'Check your connection and try again.')}\n\nYour accepted offer is unchanged — nothing was authorized or held.`
        );
        await loadPayment();
        return;
      }
      setPayment(authorized.data);

      const heldResult = await paymentProvider.protectJobPayment(job.id);
      if (heldResult.error || !heldResult.data) {
        await alertAsync(
          'Authorized, but not yet protected',
          `${userMessage(heldResult.error, 'Check your connection and try again.')}\n\nThe payment is authorized — not charged — and your accepted offer is unchanged. Tap the button again to finish protecting the funds.`
        );
        await loadPayment();
        return;
      }
      setPayment(heldResult.data);
      navigation.replace('JobConfirmed', { job });
    } finally {
      fundingRef.current = false;
      setFunding(false);
      setConfirmVisible(false);
    }
  }

  /**
   * D7: poll fetchJobPayment every 2 seconds for up to 30 seconds after a
   * successful sheet. "Seen" starts true — create-payment returned the row's
   * id — so a row that reads null now IS the failed/voided signal.
   */
  async function confirmPayment() {
    setPhase('confirming');
    const startedAt = Date.now();
    let seen = true;
    while (activeRef.current && Date.now() - startedAt < CHECKOUT_POLL_TIMEOUT_MS) {
      const { data, error } = await fetchJobPayment(job.id);
      if (!activeRef.current) return;
      if (!error) {
        const outcome = classifyCheckoutPoll({ status: data?.status ?? null, seen });
        if (data) {
          seen = true;
          setPayment(data);
        }
        if (outcome === 'held') {
          setPhase('idle');
          navigation.replace('JobConfirmed', { job });
          return;
        }
        if (outcome === 'gone') {
          setPayment(null);
          setPhase('gone');
          void loadQuote();
          return;
        }
      }
      await sleep(CHECKOUT_POLL_INTERVAL_MS);
    }
    if (activeRef.current) setPhase('timeout');
  }

  /**
   * 2026-09-30 (idea 20) — PAY WITH THE SAVED CARD: create-payment confirms the same intent off-session
   * with the card the customer saved for one-tap hiring — no sheet — and the screen then watches the
   * ledger reach held exactly as after the sheet (D7). A declined card leaves everything as it was
   * and the sheet one tap away.
   */
  async function fundBySavedCard() {
    if (fundingRef.current || !savedCard) return;
    fundingRef.current = true;
    setFunding(true);
    setConfirmVisible(false);
    // One spinner, "Confirming your payment…", from the tap (or the arrival) until the ledger says held.
    setPhase('confirming');
    try {
      const result = await confirmWithSavedCard(job.id, savedCard.id);
      // Confirmed — or an outcome nobody knows yet: the ledger decides, as after the sheet.
      if (result.confirmed || result.ambiguous) {
        await confirmPayment();
        return;
      }
      setPhase('idle');
      if (result.noSavedCard) setSavedCard(null);
      await alertAsync(
        result.declined ? 'Your card was declined' : 'Could not pay with your saved card',
        result.declined
          ? 'Nothing was charged.\n\nYour accepted offer is unchanged — pay with another card below.'
          : `${userMessage(result.error, 'The card could not be charged.')}\n\nYour accepted offer is unchanged — pay with another card below.`
      );
      await loadPayment();
    } finally {
      fundingRef.current = false;
      setFunding(false);
    }
  }

  // Idea 20: arriving from "Accept & pay" or a push's Confirm — the confirmation already given — the
  // saved card pays at once. Without one, this is ordinary Checkout.
  useEffect(() => {
    if (!params.oneTap || oneTapRef.current || !stripe || !cardsRead || !savedCard) return;
    // The card the accept's confirm named, and no other.
    if (params.oneTapCard && params.oneTapCard !== savedCard.id) return;
    if (!canFund || !figures || !paymentsEnabled || phase !== 'idle' || funding) return;
    oneTapRef.current = true;
    void fundBySavedCard();
    // fundBySavedCard is this render's own; the gate above is what the effect waits on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.oneTap, cardsRead, savedCard, canFund, figures, paymentsEnabled, phase, funding]);

  /** The stripe funding action (D5): create-payment → sheet → poll. */
  async function fundByCard() {
    if (fundingRef.current) return;
    fundingRef.current = true;
    setFunding(true);
    setConfirmVisible(false);
    try {
      // Idea 20: the customer's own opt-in — the card the sheet takes is kept for one-tap hiring.
      const session = await paymentProvider.beginJobCheckout(job.id, { saveCard: saveCard && !savedCard });
      if (session.error || !session.data) {
        await alertAsync(
          'Could not start the payment',
          `${userMessage(session.error, 'Check your connection and try again.')}\n\nYour accepted offer is unchanged — nothing was charged.`
        );
        await loadPayment();
        return;
      }
      const sheet = await presentCheckoutSheet(session.data);
      if (sheet.outcome === 'dismissed') {
        // D5: not an error and no poll. The row create-payment minted stays
        // unfunded; the CTA returns with its funding window (D14).
        await loadPayment();
        return;
      }
      if (sheet.outcome === 'failed') {
        await alertAsync(
          'The card was not charged',
          `${userMessage(sheet.error, 'The card could not be charged.')}\n\nYour accepted offer is unchanged — you can try again.`
        );
        await loadPayment();
        return;
      }
      await confirmPayment();
    } finally {
      fundingRef.current = false;
      setFunding(false);
      setConfirmVisible(false);
    }
  }

  /**
   * The manual re-read D7's third branch and D14's closed window offer —
   * one read, never a second payment.
   */
  async function recheck() {
    const row = await loadPayment();
    if (row?.status === 'held') {
      setPhase('idle');
      navigation.replace('JobConfirmed', { job });
      return;
    }
    if (phase === 'timeout' && row == null) setPhase('gone');
    if (stripe && (!row || row.charge_amount_cents == null)) await loadQuote();
  }

  const stripeCtaTitle = figures
    ? `Protect ${formatBudget(figures.total)} by card`
    : quoteLoading
      ? 'Working out the price…'
      : 'Protect payment by card';

  const actionBar = held ? (
    <Button
      title="Continue — job confirmed"
      onPress={() => navigation.replace('JobConfirmed', { job })}
    />
  ) : !paymentsEnabled ? undefined : !stripe ? (
    <Button
      title={
        authorizedOnly
          ? 'Finish protecting funds (sandbox)'
          : `Authorize & protect ${formatBudget(amountCents)} (sandbox)`
      }
      onPress={() => setConfirmVisible(true)}
      loading={funding}
      disabled={funding || state.kind !== 'ready'}
    />
  ) : phase === 'timeout' || windowClosed ? (
    <Button title="Check again" onPress={() => void recheck()} disabled={funding} />
  ) : canFund && savedCard && figures ? (
    // Idea 20: the saved card first; another card, through the sheet, one tap away.
    <View style={styles.cardActions}>
      <Button
        // The sheet's verb; the card by its last four, so the title never runs out of room (the
        // brand is in the confirm and the explainer).
        title={`Protect ${formatBudget(figures.total)} with card ···· ${savedCard.last4}`}
        onPress={() => {
          setDialogPath('saved');
          setConfirmVisible(true);
        }}
        loading={funding}
        disabled={funding || state.kind !== 'ready'}
      />
      <Button
        title="Use another card"
        variant="ghost"
        onPress={() => {
          setDialogPath('sheet');
          setConfirmVisible(true);
        }}
        disabled={funding || state.kind !== 'ready'}
      />
    </View>
  ) : canFund ? (
    <Button
      title={stripeCtaTitle}
      onPress={() => {
        setDialogPath('sheet');
        setConfirmVisible(true);
      }}
      loading={funding}
      disabled={funding || !figures || state.kind !== 'ready'}
    />
  ) : undefined;

  return (
    <>
      <DetailScreen
        title="Protected Checkout"
        subtitle={phase === 'confirming' ? 'Confirming your payment…' : job.title}
        onBack={goBackOrHome}
        state={state}
        sections={[
          /**
           * The banner states the MONEY fact, not the build fact. Stage 4A
           * moved availability to EXPO_PUBLIC_PAYMENTS_MODE, so sandbox
           * payments run on a release binary too — "development build" was a
           * false statement to a TestFlight tester. It renders iff the
           * RESOLVED mode is sandbox; a configError always resolves to
           * disabled, so that case is covered by the same condition.
           */
          ...(paymentsMode === 'sandbox'
            ? [
                {
                  content: (
                    <View style={styles.sandboxBanner} accessibilityRole="alert">
                      <Ionicons name="flask-outline" size={18} color={colors.warning} />
                      <Text style={styles.sandboxText}>
                        SANDBOX — no real money moves. No real money is charged,
                        held or transferred. The payment states below are real
                        app records used to test the flow.
                      </Text>
                    </View>
                  ),
                },
              ]
            : []),
          ...(!paymentsEnabled
            ? [
                {
                  content: (
                    <View style={styles.paymentState}>
                      <Text style={styles.explainText}>
                        Payments are paused right now. Your accepted offer is
                        unchanged — check back shortly to protect the payment.
                      </Text>
                    </View>
                  ),
                },
              ]
            : []),
          ...(phase === 'gone'
            ? [
                {
                  title: 'The payment did not go through',
                  content: (
                    <View style={styles.paymentState}>
                      <Text style={styles.explainText}>
                        Nothing is held for this job. Your accepted offer is
                        unchanged — you can check out again below.
                      </Text>
                    </View>
                  ),
                },
              ]
            : []),
          ...(phase === 'timeout'
            ? [
                {
                  title: 'Still confirming',
                  content: (
                    <View style={styles.paymentState}>
                      <Text style={styles.explainText}>
                        The payment was taken, but the app hasn’t seen it
                        confirm yet. Check back shortly — once it confirms, the
                        funds show as held here and on the job.
                      </Text>
                    </View>
                  ),
                },
              ]
            : []),
          ...(stripe && windowClosed && phase === 'idle'
            ? [
                {
                  title: 'Funding window closed',
                  content: (
                    <View style={styles.paymentState}>
                      <Text style={styles.explainText}>
                        The window to protect this payment closed before a card
                        was charged. A fresh checkout will be available shortly
                        — tap Check again below.
                      </Text>
                    </View>
                  ),
                },
              ]
            : []),
          {
            title: 'What you’re protecting',
            content: (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Accepted offer</Text>
                  <Text style={styles.summaryValue}>
                    {workerName ?? 'Your hired worker'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{stripe ? 'Agreed price' : 'Agreed amount'}</Text>
                  <Text style={styles.summaryValue}>
                    {formatBudget(stripe && figures ? figures.price : amountCents)}
                  </Text>
                </View>
                {arrivalWindowLabel(job) ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Scheduled</Text>
                    <Text style={styles.summaryValue}>{arrivalWindowLabel(job)}</Text>
                  </View>
                ) : null}
                {stripe ? (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Protection fee</Text>
                      <Text style={styles.summaryValue}>
                        {figures ? formatBudget(figures.fee) : quoteLoading ? '…' : '—'}
                      </Text>
                    </View>
                    {figures && figures.tax > 0 ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Tax</Text>
                        <Text style={styles.summaryValue}>{formatBudget(figures.tax)}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.summaryRow, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Total charged to your card</Text>
                      <Text style={styles.totalValue}>
                        {figures ? formatBudget(figures.total) : quoteLoading ? '…' : '—'}
                      </Text>
                    </View>
                    {windowOpen ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Funding window</Text>
                        <Text style={styles.summaryValue}>
                          closes in {releaseCountdownLabel(fundingDueMs as number, nowMs)}
                        </Text>
                      </View>
                    ) : null}
                    {quoteError && !figures ? (
                      <>
                        <Text style={styles.explainText}>{quoteError}</Text>
                        <Button title="Retry" onPress={() => void loadQuote()} loading={quoteLoading} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Platform fee</Text>
                      {/* Read off the ledger row, never computed here (D10):
                          sandbox rows are written with a zero fee. */}
                      <Text style={styles.summaryValue}>
                        {payment && payment.platform_fee_cents > 0
                          ? formatBudget(payment.platform_fee_cents)
                          : 'None in sandbox'}
                      </Text>
                    </View>
                    <View style={[styles.summaryRow, styles.totalRow]}>
                      <Text style={styles.totalLabel}>Total (sandbox)</Text>
                      <Text style={styles.totalValue}>{formatBudget(amountCents)}</Text>
                    </View>
                  </>
                )}
              </View>
            ),
          },
          // Idea 20: the opt-in, off by default — only while no card is saved and the sheet is the way.
          ...(stripe && cardsRead && !savedCard && canFund && !held
            ? [
                {
                  content: (
                    // The whole row answers a tap, as Need it today's does; the switch stays the control.
                    <Pressable
                      onPress={() => setSaveCard(!saveCard)}
                      style={({ pressed }) => [styles.saveRow, pressed && styles.saveRowPressed]}
                      accessible={false}
                    >
                      <View style={styles.saveCopy}>
                        <Text style={styles.saveTitle}>Save this card for one-tap hiring</Text>
                        <Text style={styles.explainText}>
                          Next time, accept and pay from a bid’s notification. Remove it any time in Payment methods.
                        </Text>
                      </View>
                      <Toggle value={saveCard} onValueChange={setSaveCard} accessibilityLabel="Save this card for one-tap hiring" />
                    </Pressable>
                  ),
                },
              ]
            : []),
          {
            title: 'How protection works',
            content: (
              <View style={styles.explainer}>
                {stripe ? (
                  <ExplainRow
                    icon="card-outline"
                    strong="Pay by card"
                    text={
                      savedCard
                        ? `charges the all-in total shown above to ${cardLabel(savedCard)} when you confirm, or to another card through the secure payment sheet.`
                        : 'charges the all-in total shown above through the secure payment sheet. Nothing is charged until you confirm in the sheet.'
                    }
                  />
                ) : (
                  <ExplainRow
                    icon="card-outline"
                    strong="Authorize"
                    text="confirms the amount against your sandbox payment method. Nothing is charged."
                  />
                )}
                <ExplainRow
                  icon="lock-closed-outline"
                  strong="Hold in protection"
                  text={`keeps the funds set aside while ${
                    workerName ?? 'the worker'
                  } does the job. They can see the funds are protected, and can’t be paid early.`}
                />
                <ExplainRow
                  icon="checkmark-done-outline"
                  strong="Release"
                  text="happens only after you approve the completed work — or automatically 72 hours after completion if you don’t respond. Reporting an issue holds the funds instead."
                />
              </View>
            ),
          },
          ...(payment
            ? [
                {
                  title: 'Current payment state',
                  content: (
                    <View style={styles.paymentState}>
                      <MoneyText cents={payment.amount_cents} state={payment.status} size="lg" />
                    </View>
                  ),
                },
              ]
            : []),
        ]}
        actionBar={actionBar}
      />

      <ConfirmDialog
        visible={confirmVisible}
        title={
          stripe
            ? `Charge ${formatBudget(figures?.total ?? null)} to ${dialogPath === 'saved' && savedCard ? cardLabel(savedCard) : 'your card'}?`
            : `Protect ${formatBudget(amountCents)} for this job?`
        }
        message={
          stripe
            ? dialogPath === 'saved' && savedCard
              ? `${cardLabel(savedCard)} is charged the all-in total now. Once the payment confirms, the funds are held in protection until you approve the finished work — releasing them is a separate, deliberate step after the job is done.`
              : 'Your card is charged the all-in total now, through the secure payment sheet. Once the payment confirms, the funds are held in protection until you approve the finished work — releasing them is a separate, deliberate step after the job is done.'
            : 'This authorizes the sandbox amount and places it in protected/held state. No real money is being charged — this is sandbox. Funds stay held until you approve the finished work — releasing them is a separate, deliberate step after the job is done.'
        }
        confirmText={stripe ? 'Pay & protect' : 'Authorize & protect'}
        cancelText="Not now"
        loading={funding}
        onConfirm={stripe ? (dialogPath === 'saved' && savedCard ? fundBySavedCard : fundByCard) : fundProtection}
        onCancel={() => setConfirmVisible(false)}
      />
    </>
  );
}

function ExplainRow({
  icon,
  strong,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  strong: string;
  text: string;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.explainRow}>
      <Ionicons name={icon} size={18} color={colors.emerald} />
      <Text style={styles.explainText}>
        <Text style={styles.explainStrong}>{strong}</Text> {text}
      </Text>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  sandboxBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  sandboxText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
    lineHeight: 18,
  },
  summaryCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
  },
  totalRow: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.money,
  },
  explainer: {
    gap: spacing.md,
  },
  explainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  explainText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  explainStrong: {
    fontWeight: '800',
    color: colors.ink,
  },
  paymentState: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  // Idea 20: the saved card's two buttons, and the opt-in row.
  cardActions: {
    gap: spacing.xs,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  saveRowPressed: {
    opacity: 0.7,
  },
  saveCopy: {
    flex: 1,
    gap: 2,
  },
  saveTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  }),
);
