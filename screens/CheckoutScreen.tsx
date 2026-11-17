import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EntranceView } from '../components/EntranceView';
import { ScreenHeader } from '../components/ScreenHeader';
import { entranceSlot, useEntered } from '../hooks/useEntrance';
import type { DetailSection } from '../ui/templates/DetailScreen';
import { STATE_COPY, ScreenStateView, isReady, type ScreenState } from '../ui/templates/ScreenStates';
import { MoneyText } from '../ui/primitives/MoneyText';
import { useAuth } from '../hooks/useAuth';
import { useOwnedJobDetail } from '../hooks/useJobDetail';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import { paymentProvider, paymentsMode } from '../lib/adapters/payments';
import { CANCELLATION_DISCLOSURE, FEE_NAME, PAY_AND_PROTECT, PAYMENT_HELD_NOT_INSURANCE } from '../lib/moneyCopy';
import { customerChargeCents, isRefundArranged, isRefundFailed } from '../lib/paymentRules';
import { serverNowMs } from '../lib/serverClock';
import {
  canOfferJobFunding,
  fetchJobPayment,
  isHeld,
  quoteJobPrice,
  type JobPriceQuote,
  type Payment,
} from '../lib/payments';
import { confirmWithSavedCard, presentCheckoutSheet, stripeReady, STRIPE_UNAVAILABLE_MESSAGE } from '../lib/payments/stripe';
import { cardLabel, listSavedCards, type SavedCard } from '../lib/paymentMethods';
import { FloatingAction, Toggle, useHideTabBar } from '../ui/primitives';
import {
  CHECKOUT_POLL_INTERVAL_MS,
  CHECKOUT_POLL_TIMEOUT_MS,
  classifyCheckoutPoll,
} from '../lib/payments/stripeRules';
import { deriveJobLifecycle, jobPillLabel, releaseAtLabel } from '../lib/jobLifecycle';
import { fetchRemoteConfig } from '../lib/remoteConfig';
import { fetchProfileById } from '../lib/profiles';
import { arrivalWindowLabel, formatBudget } from '../lib/jobs';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { layout, screenGround, spacing, textScale, themedStyles, useThemeColors, eyebrowStyle, type ColorPalette } from '../lib/theme';

/**
 * Screen 31 — Protected Checkout, over the payment ADAPTER
 * (lib/adapters/payments.ts), never the RPCs directly.
 *
 * The money vocabulary is §H.3's — held means held, and nothing on this
 * screen (or anywhere) can say released or paid. A disabled payments mode
 * renders the unavailable state and no checkout control.
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
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // A task screen (UI-DIRECTION §7): the bar steps aside; the pay action floats at the foot.
  useHideTabBar();
  const insets = useSafeAreaInsets();
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
  // The pre-row price (D22) — stripe only.
  const [quote, setQuote] = useState<JobPriceQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  // The kill switch (D15): read on focus; a failed read falls back to true.
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  // A4-06: one-tap pay waits for that answer, as ClientJobDetailScreen's jump to Checkout does.
  const [configRead, setConfigRead] = useState(false);
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  // One clock reading per load (and one per minute while a funding window is
  // showing), so the countdown and the D9 gate agree with each other.
  const [nowMs, setNowMs] = useState(() => serverNowMs());
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
    setNowMs(serverNowMs());
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

  // Idea 20: the saved card, read once per visit (stripe only).
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
        if (!active) return;
        setPaymentsEnabled(config.paymentsEnabled);
        setConfigRead(true);
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
    const id = setInterval(() => setNowMs(serverNowMs()), 60_000);
    return () => clearInterval(id);
  }, [windowOpen]);

  // A4-08: a hired job that a stale route brings here names its own stage, as the job card's pill does
  // ("Paid" only once the ledger says released), instead of asking for an offer it already has.
  const hiredLabel = job.assigned_worker_id
    ? jobPillLabel(deriveJobLifecycle({ job, payment }, nowMs), payment?.status)
    : undefined;
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
          title: 'Payments aren’t available right now',
          body: 'Nothing was charged or held. Your accepted offer is unaffected.',
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
          : // A4 wiring (A2): the server protects a payment only on an assigned job ('Accept an offer before
            // protecting a payment', begin_job_payment), the rule canOfferJobFunding keeps. A job past
            // assigned whose payment is held keeps its held page; the decision waits for the payment read.
            job.status !== 'assigned' && paymentLoaded && !paymentError && !(payment && isHeld(payment))
            ? {
                kind: 'empty',
                title: hiredLabel ?? 'Nothing to check out yet',
                body: hiredLabel ? undefined : 'Accept an offer first — checkout protects the payment for an accepted offer.',
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

  const held = !!payment && isHeld(payment);
  // D9 / D14: THE one derivation of whether checkout may be offered on this
  // row — an unfunded row inside its window is, a lapsed one never is.
  const canFund = canOfferJobFunding({ viewerId: user?.id, job, payment, nowMs });

  // D13 / D22: the customer's all-in figures — the row's once a row exists,
  // the quote before it.
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
          : `${userMessage(result.error, 'The payment could not be completed.')}\n\nYour accepted offer is unchanged — pay with another card below.`
      );
      await loadPayment();
    } finally {
      fundingRef.current = false;
      setFunding(false);
    }
  }

  // Idea 20: arriving from "Accept & pay" — the confirmation already given, naming this card — the
  // saved card pays at once. A4 (2026-10-03): every other one-tap arrival (a repeat visit's Confirm
  // push, which gave no in-app confirm) opens the Pay & protect confirm instead, naming the card and
  // the amount; the charge runs only from that confirm. No charge ever happens out of sight (the
  // build run's ruling 1). Without a saved card, this is ordinary Checkout.
  useEffect(() => {
    if (!params.oneTap || oneTapRef.current || !stripe || !cardsRead || !savedCard || !configRead) return;
    if (!canFund || !figures || !paymentsEnabled || phase !== 'idle' || funding) return;
    oneTapRef.current = true;
    // The card the accept's confirm named, and no other, pays without a second confirm.
    if (params.oneTapCard === savedCard.id) {
      void fundBySavedCard();
      return;
    }
    setDialogPath('saved');
    setConfirmVisible(true);
    // fundBySavedCard is this render's own; the gate above is what the effect waits on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.oneTap, cardsRead, savedCard, configRead, canFund, figures, paymentsEnabled, phase, funding]);

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
        // PAY-R (PC-01): a refusal can mean the payment is already held, so the app reads it first.
        const read = await fetchJobPayment(job.id);
        if (read.data && isHeld(read.data)) {
          await confirmPayment();
          return;
        }
        await alertAsync(
          'Could not start the payment',
          `${userMessage(session.error, 'Check your connection and try again.')}\n\nYour accepted offer is unchanged.`
        );
        await loadPayment();
        return;
      }
      // R3-1: the stored intent is already settled: no sheet; the poll waits for held.
      if ('confirmed' in session.data) {
        await confirmPayment();
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
        // R3-1 (UA-01): the row stays unfunded until the webhook moves it to held, so a read right
        // after the sheet cannot prove the card was not charged. Only a held row is known; every other
        // read says the payment did not finish, and a retry resumes the same intent (no second charge).
        const read = await fetchJobPayment(job.id);
        if (read.data && isHeld(read.data)) {
          await confirmPayment();
          return;
        }
        await alertAsync(
          'The payment did not finish',
          `${userMessage(sheet.error, 'The payment could not be completed.')}\n\nYour accepted offer is unchanged. You can try again. If this payment already went through, you will not pay twice: Brazos refunds any extra charge in full.`
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
    if (row && isHeld(row)) {
      setPhase('idle');
      navigation.replace('JobConfirmed', { job });
      return;
    }
    if (phase === 'timeout' && row == null) setPhase('gone');
    // PAY-R (PC-03): a row that may still be funded brings the pay button back.
    if (phase === 'timeout' && row && canOfferJobFunding({ viewerId: user?.id, job, payment: row, nowMs: serverNowMs() })) {
      setPhase('idle');
    }
    if (stripe && (!row || row.charge_amount_cents == null)) await loadQuote();
  }

  const stripeCtaTitle = figures
    ? `Protect ${formatBudget(figures.total)} by Card`
    : quoteLoading
      ? 'Working out the price…'
      : 'Protect payment by card';

  const actionBar = held ? (
    <FloatingAction
      title="Continue — Job Confirmed"
      onPress={() => navigation.replace('JobConfirmed', { job })}
    />
  ) : !paymentsEnabled ? undefined : !stripe ? undefined : phase === 'timeout' || windowClosed ? (
    <FloatingAction title="Check Again" onPress={() => void recheck()} disabled={funding} />
  ) : canFund && savedCard && figures ? (
    // Idea 20: the saved card first; another card, through the sheet, one tap away.
    <FloatingAction
      // The sheet's verb; the card by its last four, so the title never runs out of room (the
      // brand is in the confirm and the explainer).
      title={`Protect ${formatBudget(figures.total)} with Card ···· ${savedCard.last4}`}
      onPress={() => {
        setDialogPath('saved');
        setConfirmVisible(true);
      }}
      loading={funding}
      disabled={funding || state.kind !== 'ready'}
    />
  ) : canFund ? (
    <FloatingAction
      title={stripeCtaTitle}
      // P16 (owner, 2026-11-16): straight to the card sheet, which shows the amount and can be cancelled.
      onPress={() => void fundByCard()}
      loading={funding}
      disabled={funding || !figures || state.kind !== 'ready'}
    />
  ) : undefined;
  // The saved-card branch above, as one fact: its card row in the summary carries "Use Another Card".
  const savedCardPath =
    !held && paymentsEnabled && stripe && !(phase === 'timeout' || windowClosed) && canFund && !!savedCard && !!figures;

  const sections: DetailSection[] = [
          ...(!paymentsEnabled
            ? [
                {
                  content: (
                    <Card>
                      <Text style={styles.explainText}>
                        Payments are paused right now. Your accepted offer is
                        unchanged — check back shortly to protect the payment.
                      </Text>
                    </Card>
                  ),
                },
              ]
            : []),
          ...(phase === 'gone'
            ? [
                {
                  title: 'The Payment Did Not Go Through',
                  content: (
                    <Card>
                      <Text style={styles.explainText}>
                        Nothing is held for this job. Your accepted offer is
                        unchanged — you can check out again below.
                      </Text>
                    </Card>
                  ),
                },
              ]
            : []),
          ...(phase === 'timeout'
            ? [
                {
                  title: 'Still Confirming',
                  content: (
                    <Card>
                      <Text style={styles.explainText}>
                        The app hasn’t seen your payment confirm yet. Check back shortly.
                      </Text>
                    </Card>
                  ),
                },
              ]
            : []),
          ...(stripe && windowClosed && phase === 'idle'
            ? [
                {
                  title: 'Payment Timed Out',
                  content: (
                    <Card>
                      <Text style={styles.explainText}>
                        The time to pay ran out, and the app hasn’t seen a
                        payment confirm. Check back shortly.
                      </Text>
                    </Card>
                  ),
                },
              ]
            : []),
          {
            title: 'What You’re Protecting',
            content: (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Accepted Offer</Text>
                  <Text style={styles.summaryValue}>
                    {workerName ?? 'Your hired worker'}
                  </Text>
                </View>
                {arrivalWindowLabel(job) ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Scheduled</Text>
                    <Text style={styles.summaryValue}>{arrivalWindowLabel(job)}</Text>
                  </View>
                ) : null}
                {/* The money in its own well: each line, then the total under a hairline. */}
                <Card level="well" style={styles.priceBox}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{stripe ? 'Agreed Price' : 'Agreed Amount'}</Text>
                    <Text style={styles.summaryValue}>
                      {formatBudget(stripe && figures ? figures.price : amountCents)}
                    </Text>
                  </View>
                  {stripe ? (
                    <>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{FEE_NAME}</Text>
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
                        <Text style={styles.totalLabel}>Total Charged to Your Card</Text>
                        <Text style={styles.totalValue}>
                          {figures ? formatBudget(figures.total) : quoteLoading ? '…' : '—'}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </Card>
                {/* Idea 20: the saved card as its own row; another card, through the sheet, one tap away. */}
                {savedCardPath && savedCard ? (
                  <View style={styles.cardRow}>
                    <Ionicons name="card-outline" size={18} color={colors.emerald} />
                    <Text style={styles.cardRowLabel} numberOfLines={1}>{cardLabel(savedCard)}</Text>
                    <Button
                      title="Use Another Card"
                      variant="quiet"
                      size="sm"
                      // P16 (owner, 2026-11-16): straight to the card sheet, which shows the amount and can be cancelled.
                      onPress={() => void fundByCard()}
                      disabled={funding || state.kind !== 'ready'}
                    />
                  </View>
                ) : null}
                {stripe ? (
                  <>
                    {windowOpen ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Pay By</Text>
                        <Text style={styles.summaryValue}>
                          {releaseAtLabel(fundingDueMs as number, nowMs)}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.explainText}>{PAYMENT_HELD_NOT_INSURANCE}</Text>
                    <Text style={styles.explainText}>{CANCELLATION_DISCLOSURE}</Text>
                    {quoteError && !figures ? (
                      <>
                        <Text style={styles.explainText}>{quoteError}</Text>
                        <Button title={STATE_COPY.retry} variant="quiet" onPress={() => void loadQuote()} loading={quoteLoading} />
                      </>
                    ) : null}
                  </>
                ) : null}
              </Card>
            ),
          },
          // Idea 20: the opt-in, off by default — only while no card is saved and the sheet is the way.
          ...(stripe && cardsRead && !savedCard && canFund && !held
            ? [
                {
                  content: (
                    <Card>
                      {/* The whole row answers a tap, as Need it today's does; the switch stays the control. */}
                      <Pressable
                        onPress={() => setSaveCard(!saveCard)}
                        style={({ pressed }) => [styles.saveRow, pressed && styles.saveRowPressed]}
                        accessible={false}
                      >
                        <View style={styles.saveCopy}>
                          <Text style={styles.saveTitle}>Save This Card for One-Tap Hiring</Text>
                          <Text style={styles.explainText}>
                            Next time, accept and pay from a bid’s notification. Remove it any time in Payment methods.
                          </Text>
                        </View>
                        <Toggle value={saveCard} onValueChange={setSaveCard} accessibilityLabel="Save This Card for One-Tap Hiring" />
                      </Pressable>
                    </Card>
                  ),
                },
              ]
            : []),
          {
            title: 'How Protection Works',
            content: (
              <Card style={styles.explainer}>
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
                ) : null}
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
                  text="happens only after you approve the completed work — or automatically 72 hours after you’re told the work is complete (7 days after the work is marked complete at the latest) if you don’t respond. Reporting an issue holds the funds instead."
                />
              </Card>
            ),
          },
          ...(payment
            ? [
                {
                  title: 'Current Payment State',
                  content: (
                    <Card>
                      <MoneyText
                        cents={customerChargeCents(payment)}
                        state={payment.status}
                        size="lg"
                        refundFailed={isRefundFailed(payment)}
                        refundArranged={isRefundArranged(payment)}
                      />
                    </Card>
                  ),
                },
              ]
            : []),
  ];
  // The sections arrive once, in reading order, as the detail template drew them.
  const sectionsEntered = useEntered(isReady(state) && sections.length > 0);

  return (
    <>
      <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
        <ScreenHeader
          title="Protected Checkout"
          subtitle={phase === 'confirming' ? 'Confirming your payment…' : job.title}
          onBack={goBackOrHome}
        />
        {state.kind !== 'ready' ? (
          <ScreenStateView state={state} />
        ) : (
          <>
            <ScrollView
              style={styles.flex}
              // With no floating action, the end clears the home indicator itself (the bar is hidden).
              contentContainerStyle={[styles.content, !actionBar && { paddingBottom: insets.bottom + spacing.lg }]}
              showsVerticalScrollIndicator={false}
            >
              {sections.map((section, index) => (
                <EntranceView
                  key={section.title ?? `section-${index}`}
                  index={entranceSlot(index)}
                  skip={sectionsEntered}
                  style={styles.section}
                >
                  {section.title ? (
                    <Text accessibilityRole="header" style={styles.sectionTitle}>
                      {section.title}
                    </Text>
                  ) : null}
                  {section.content}
                </EntranceView>
              ))}
            </ScrollView>
            {actionBar}
          </>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmVisible}
        title={`Charge ${formatBudget(figures?.total ?? null)} to ${dialogPath === 'saved' && savedCard ? cardLabel(savedCard) : 'your card'}?`}
        message={
          dialogPath === 'saved' && savedCard
            ? `${cardLabel(savedCard)} is charged the all-in total now. Once the payment confirms, the funds are held in protection until you approve the finished work — releasing them is a separate, deliberate step after the job is done.`
            : 'Your card is charged the all-in total now, through the secure payment sheet. Once the payment confirms, the funds are held in protection until you approve the finished work — releasing them is a separate, deliberate step after the job is done.'
        }
        confirmText={PAY_AND_PROTECT}
        loading={funding}
        onConfirm={dialogPath === 'saved' && savedCard ? fundBySavedCard : fundByCard}
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
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: layout.screenGutter,
    gap: spacing.lg + spacing.xs,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: eyebrowStyle(colors),
  summaryCard: {
    gap: spacing.md,
  },
  priceBox: {
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardRowLabel: {
    ...textScale.callout,
    flex: 1,
    fontWeight: '700',
    color: colors.ink,
  },
  summaryLabel: {
    ...textScale.body,
    color: colors.textMuted,
  },
  summaryValue: {
    ...textScale.body,
    flexShrink: 1,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'right',
  },
  totalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: {
    ...textScale.callout,
    flexShrink: 1,
    fontWeight: '800',
    color: colors.ink,
  },
  totalValue: {
    ...textScale.title,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
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
    ...textScale.label,
    flex: 1,
    fontWeight: '400',
    color: colors.textMuted,
  },
  explainStrong: {
    fontWeight: '800',
    color: colors.ink,
  },
  // Idea 20: the opt-in row.
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  saveRowPressed: {
    opacity: 0.7,
  },
  saveCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  saveTitle: {
    ...textScale.callout,
    fontWeight: '700',
    color: colors.ink,
  },
  }),
);
