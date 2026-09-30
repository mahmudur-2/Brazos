import { supabase } from '../supabase';
import type { Payment } from '../payments';
import {
  createPaymentSession,
  stripeReady,
  STRIPE_UNAVAILABLE_MESSAGE,
  type CheckoutSession,
} from '../payments/stripe';
import { moneyCeilingError, TIP_CEILING_CENTS } from '../validation';

/**
 * The payment-provider boundary (BRAZOS_MASTER_PLAN.md §A layer 5;
 * docs/emerald-v2/06_DEFERRED_INTEGRATIONS.md "Payment authorization/hold").
 * Shaped on lib/phoneAuth — the repo's validated adapter template: a
 * provider-neutral interface, one implementation chosen at module load, and
 * screens that never branch on the mode beyond asking for it to render
 * mode-aware copy.
 *
 * Three implementations coexist (R6a, D1):
 *
 *   sandbox   — the TestFlight beta's simulated ledger, unchanged. Its calls
 *               are the phase50/51/55 SECURITY DEFINER RPCs, which fabricate
 *               a sandbox provider ref server-side and persist real ledger
 *               rows moving unfunded -> authorized -> held -> released ->
 *               paid_out. No real money and no real provider.
 *   stripe    — the card path. The ledger row and the payment intent are
 *               minted by the create-payment edge function (it calls
 *               begin_job_payment); the card is taken by the provider's
 *               payment sheet through lib/payments/stripe.ts, the ONLY file
 *               that loads the card SDK; the row reads held only when the
 *               provider's webhook lands. Release is release_job_payment,
 *               which requests the transfer and leaves the row held until
 *               transfer.created (D23). A tip is a second checkout session
 *               (beginTipCheckout, R6c): create-payment mints the tip row
 *               through the database's tip RPC, the same sheet takes the
 *               card, and payment_intent.succeeded releases it — a tip has
 *               no held stop. Cash-out refuses: payouts run on the provider's
 *               own schedule.
 *   disabled  — fail-closed. Every call refuses with the same message, so a
 *               build without a payment mode cannot half-work.
 *
 * Still deliberately ABSENT: refund and payout — nothing implements them, and
 * an interface method nothing implements is an invitation to fake it.
 */

import { resolvePaymentsMode, type PaymentsMode } from './paymentsMode';

export type { PaymentsMode } from './paymentsMode';
export { resolvePaymentsMode } from './paymentsMode';

export type PaymentResult = {
  data: Payment | null;
  error: { message: string } | null;
};

/** D4: what the stripe checkout needs to open the payment sheet. */
export type CheckoutSessionResult = {
  data: CheckoutSession | null;
  error: { message: string } | null;
};

export type PaymentProvider = {
  getMode(): PaymentsMode;
  /**
   * Create — or idempotently return — the job's payment in `authorized`.
   * The amount is the accepted offer's; the server refuses to take one.
   * The sandbox's first step; the stripe provider refuses it (D4).
   */
  authorizeJobPayment(jobId: string): Promise<PaymentResult>;
  /** Move the job's authorized payment to `held`. Idempotent on held.
   *  The sandbox's second step; the stripe provider refuses it (D4). */
  protectJobPayment(jobId: string): Promise<PaymentResult>;
  /**
   * D4/D5: mint the stripe ledger row and its payment intent through the
   * create-payment edge function, returning what the payment sheet needs.
   * The row is `unfunded` until the webhook lands — nothing here is held.
   * Sandbox and disabled refuse it.
   */
  /** Idea 20: `saveCard` is the customer's own opt-in to keep the card for one-tap hiring. */
  beginJobCheckout(jobId: string, options?: { saveCard?: boolean }): Promise<CheckoutSessionResult>;
  /**
   * The customer's approval: move the held payment toward `released`. The
   * server enforces ownership, completed status, the dispute freeze, and
   * idempotency — navigation order is not an authorization boundary. On a
   * stripe row the status stays held with release_requested_at set until
   * the transfer lands (D23).
   */
  releaseJobPayment(jobId: string): Promise<PaymentResult>;
  /** One review-time tip per completed job, only after release — the
   *  sandbox's one-step tip. Stripe refuses: a card tip is beginTipCheckout
   *  plus the sheet (R6c, D3). */
  tipWorker(jobId: string, amountCents: number): Promise<PaymentResult>;
  /**
   * R6c (D3/D4): mint the stripe TIP row and its payment intent through the
   * same create-payment function (tipAmountCents in the body), returning what
   * the payment sheet needs. The row is `unfunded` until the webhook lands and
   * has no held stop: payment_intent.succeeded releases it. The RPC's own
   * refusals (one tip per job, release first, the ceiling's dollar sentence)
   * come back verbatim. Sandbox and disabled refuse it.
   */
  beginTipCheckout(jobId: string, amountCents: number): Promise<CheckoutSessionResult>;
  /**
   * Sweep the caller's released rows to paid_out (phase55's simulated
   * cash-out). Returns the swept rows; an empty array is the honest answer
   * for "nothing to cash out" — repeat calls are no-ops by construction.
   * Stripe refuses (D19): payouts run on the provider's schedule.
   */
  cashOut(): Promise<{ data: Payment[]; error: { message: string } | null }>;
};

const resolution = resolvePaymentsMode({
  configured: process.env.EXPO_PUBLIC_PAYMENTS_MODE,
  dev: __DEV__,
});

export const paymentsMode = resolution.mode;
export const paymentsConfigError = resolution.configError;

const DISABLED_MESSAGE =
  'Payments are not switched on in this build. Nothing was charged or held.';

/** The sandbox has no payment sheet: its two-step idiom is the whole flow. */
export const SANDBOX_NO_SHEET_MESSAGE =
  'Sandbox payments use no payment sheet — authorize and protect the payment instead.';
/** D4: the sandbox's two steps have no stripe meaning. */
export const STRIPE_NO_TWO_STEP_MESSAGE =
  'Card payments are taken in one step through checkout — nothing is authorized or protected separately.';
/** R6c (D3): the one-step tip has no card meaning — a card tip is a checkout
 *  session through the sheet. Never the word "paid". */
export const STRIPE_TIP_MESSAGE =
  'Card tips are sent through the payment sheet — nothing was recorded or charged.';
/** D19: nothing for the worker to trigger. */
export const STRIPE_CASH_OUT_MESSAGE =
  'Payouts arrive on the provider’s own schedule once payout setup is complete — there is nothing to trigger here.';

function createSandboxPaymentProvider(): PaymentProvider {
  const call = async (fn: string, jobId: string): Promise<PaymentResult> => {
    const { data, error } = await supabase.rpc(fn, { p_job_id: jobId });
    if (error) return { data: null, error: { message: error.message } };
    return { data: (data ?? null) as Payment | null, error: null };
  };

  return {
    getMode: () => 'sandbox',
    authorizeJobPayment: (jobId) => call('sandbox_authorize_job_payment', jobId),
    protectJobPayment: (jobId) => call('sandbox_hold_job_payment', jobId),
    beginJobCheckout: async () => ({ data: null, error: { message: SANDBOX_NO_SHEET_MESSAGE } }),
    releaseJobPayment: (jobId) => call('sandbox_release_job_payment', jobId),
    tipWorker: async (jobId, amountCents) => {
      // sandbox_tip_worker()'s own $1,000 cap (phase51), mirrored so an
      // over-cap tip is refused with a sentence before the RPC.
      const ceilingError = moneyCeilingError(amountCents, TIP_CEILING_CENTS);
      if (ceilingError) {
        return { data: null, error: { message: ceilingError } };
      }
      const { data, error } = await supabase.rpc('sandbox_tip_worker', {
        p_job_id: jobId,
        p_amount_cents: amountCents,
      });
      if (error) return { data: null, error: { message: error.message } };
      return { data: (data ?? null) as Payment | null, error: null };
    },
    beginTipCheckout: async () => ({ data: null, error: { message: SANDBOX_NO_SHEET_MESSAGE } }),
    cashOut: async () => {
      const { data, error } = await supabase.rpc('sandbox_cash_out');
      if (error) return { data: [], error: { message: error.message } };
      return { data: (data ?? []) as Payment[], error: null };
    },
  };
}

/**
 * The card path (R6a). When the native module is absent (a binary predating
 * it, or web) or the publishable key is missing, EVERY method refuses with
 * D4's one honest sentence — this build cannot take card payments yet; update
 * the app — and CheckoutScreen shows that sentence as its screen state.
 */
function createStripePaymentProvider(): PaymentProvider {
  const unavailable = (): PaymentResult => ({
    data: null,
    error: { message: STRIPE_UNAVAILABLE_MESSAGE },
  });
  const refuse = async (message: string): Promise<PaymentResult> => ({
    data: null,
    error: { message },
  });

  return {
    getMode: () => 'stripe',
    // The sandbox's two-step idiom has no stripe meaning; CheckoutScreen
    // branches on the mode and never calls these here.
    authorizeJobPayment: async () =>
      stripeReady() ? refuse(STRIPE_NO_TWO_STEP_MESSAGE) : unavailable(),
    protectJobPayment: async () =>
      stripeReady() ? refuse(STRIPE_NO_TWO_STEP_MESSAGE) : unavailable(),
    beginJobCheckout: async (jobId, options) => {
      if (!stripeReady()) return { data: null, error: { message: STRIPE_UNAVAILABLE_MESSAGE } };
      return createPaymentSession(jobId, { saveCard: options?.saveCard === true });
    },
    releaseJobPayment: async (jobId) => {
      if (!stripeReady()) return unavailable();
      const { data, error } = await supabase.rpc('release_job_payment', { p_job_id: jobId });
      if (error) return { data: null, error: { message: error.message } };
      return { data: (data ?? null) as Payment | null, error: null };
    },
    tipWorker: async () => (stripeReady() ? refuse(STRIPE_TIP_MESSAGE) : unavailable()),
    // R6c (D3): no client ceiling check here on purpose — the tip RPC's own
    // sentences (the job-specific dollar ceiling among them) are the ones the
    // customer reads, verbatim, passed through create-payment.
    beginTipCheckout: async (jobId, amountCents) => {
      if (!stripeReady()) return { data: null, error: { message: STRIPE_UNAVAILABLE_MESSAGE } };
      return createPaymentSession(jobId, { tipAmountCents: amountCents });
    },
    cashOut: async () => ({
      data: [],
      error: { message: stripeReady() ? STRIPE_CASH_OUT_MESSAGE : STRIPE_UNAVAILABLE_MESSAGE },
    }),
  };
}

function createDisabledPaymentProvider(message: string): PaymentProvider {
  const refuse = async (): Promise<PaymentResult> => ({
    data: null,
    error: { message },
  });
  return {
    getMode: () => 'disabled',
    authorizeJobPayment: refuse,
    protectJobPayment: refuse,
    beginJobCheckout: async () => ({ data: null, error: { message } }),
    releaseJobPayment: refuse,
    tipWorker: refuse,
    beginTipCheckout: async () => ({ data: null, error: { message } }),
    cashOut: async () => ({ data: [], error: { message } }),
  };
}

/**
 * The one payment provider the app uses, chosen once at module load.
 * Screens import this and never call the RPCs or the card SDK directly.
 */
export const paymentProvider: PaymentProvider =
  resolution.mode === 'sandbox'
    ? createSandboxPaymentProvider()
    : resolution.mode === 'stripe'
      ? createStripePaymentProvider()
      : createDisabledPaymentProvider(resolution.configError ?? DISABLED_MESSAGE);
