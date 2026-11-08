import { env } from '../../config/env';
import { supabase } from '../supabase';
import type { Payment } from '../payments';
import {
  createPaymentSession,
  stripePublishableKey,
  stripeReady,
  STRIPE_UNAVAILABLE_MESSAGE,
  type CheckoutSession,
} from '../payments/stripe';

/**
 * The payment-provider boundary (BRAZOS_MASTER_PLAN.md §A layer 5;
 * docs/emerald-v2/06_DEFERRED_INTEGRATIONS.md "Payment authorization/hold").
 * Shaped on lib/phoneAuth — the repo's validated adapter template: a
 * provider-neutral interface, one implementation chosen at module load, and
 * screens that never branch on the mode beyond asking for it to render
 * mode-aware copy.
 *
 * Two implementations (R6a, D1):
 *
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
 *               no held stop. Payouts run on the provider's own schedule.
 *   disabled  — fail-closed. Every call refuses with the same message, so a
 *               build without a payment mode cannot half-work.
 *
 * Still deliberately ABSENT: refund and payout — nothing implements them, and
 * an interface method nothing implements is an invitation to fake it.
 */

export type PaymentsMode = 'stripe' | 'disabled';

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
   * D4/D5: mint the stripe ledger row and its payment intent through the
   * create-payment edge function, returning what the payment sheet needs.
   * The row is `unfunded` until the webhook lands — nothing here is held.
   * Disabled refuses it.
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
  /**
   * R6c (D3/D4): mint the stripe TIP row and its payment intent through the
   * same create-payment function (tipAmountCents in the body), returning what
   * the payment sheet needs. The row is `unfunded` until the webhook lands and
   * has no held stop: payment_intent.succeeded releases it. The RPC's own
   * refusals (one tip per job, release first, the ceiling's dollar sentence)
   * come back verbatim. Disabled refuses it.
   */
  beginTipCheckout(jobId: string, amountCents: number): Promise<CheckoutSessionResult>;
};

/**
 * Fail closed: the card path runs only when the build declares 'stripe' AND
 * carries the publishable key. Unset, any other value, or no key: disabled.
 */
export const paymentsMode: PaymentsMode =
  env.EXPO_PUBLIC_PAYMENTS_MODE === 'stripe' && stripePublishableKey() !== null ? 'stripe' : 'disabled';

const DISABLED_MESSAGE =
  'Payments aren’t available right now. Nothing was charged or held.';

/**
 * The card path (R6a). When the native module is absent (a binary predating
 * it, or web), EVERY method refuses with D4's one honest sentence — this
 * build cannot take card payments yet; update the app — and CheckoutScreen
 * shows that sentence as its screen state.
 */
function createStripePaymentProvider(): PaymentProvider {
  const unavailable = (): PaymentResult => ({
    data: null,
    error: { message: STRIPE_UNAVAILABLE_MESSAGE },
  });

  return {
    getMode: () => 'stripe',
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
    // R6c (D3): no client ceiling check here on purpose — the tip RPC's own
    // sentences (the job-specific dollar ceiling among them) are the ones the
    // customer reads, verbatim, passed through create-payment.
    beginTipCheckout: async (jobId, amountCents) => {
      if (!stripeReady()) return { data: null, error: { message: STRIPE_UNAVAILABLE_MESSAGE } };
      return createPaymentSession(jobId, { tipAmountCents: amountCents });
    },
  };
}

function createDisabledPaymentProvider(message: string): PaymentProvider {
  const refuse = async (): Promise<PaymentResult> => ({
    data: null,
    error: { message },
  });
  return {
    getMode: () => 'disabled',
    beginJobCheckout: async () => ({ data: null, error: { message } }),
    releaseJobPayment: refuse,
    beginTipCheckout: async () => ({ data: null, error: { message } }),
  };
}

/**
 * The one payment provider the app uses, chosen once at module load.
 * Screens import this and never call the RPCs or the card SDK directly.
 */
export const paymentProvider: PaymentProvider =
  paymentsMode === 'stripe' ? createStripePaymentProvider() : createDisabledPaymentProvider(DISABLED_MESSAGE);
