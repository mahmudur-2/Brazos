import { supabase } from '../supabase';
import type { Payment } from '../payments';

/**
 * The payment-provider boundary (BRAZOS_MASTER_PLAN.md §A layer 5;
 * docs/emerald-v2/06_DEFERRED_INTEGRATIONS.md "Payment authorization/hold").
 * Shaped on lib/phoneAuth — the repo's validated adapter template: a
 * provider-neutral interface, one implementation chosen at module load, and
 * screens that never branch on the mode beyond asking for it to render the
 * sandbox banner.
 *
 * Phase 5 ships exactly two implementations:
 *
 *   sandbox   — the ONLY functional provider. Its two calls are the phase50
 *               SECURITY DEFINER RPCs, which fabricate a sandbox provider ref
 *               server-side and persist real ledger rows in Supabase moving
 *               unfunded -> authorized -> held. No real money, no real
 *               provider, and the database CHECK (provider in ('sandbox'))
 *               makes impersonating one impossible.
 *   disabled  — fail-closed. Every call refuses with the same message, so a
 *               build without a payment mode cannot half-work.
 *
 * Phase 6 widened the boundary with release (the customer's approval moving
 * held -> released, server-enforced) and the review-time tip. Still
 * deliberately ABSENT: refund and payout — nothing implements them yet, and
 * an interface method nothing implements is an invitation to fake it.
 */

import { resolvePaymentsMode, type PaymentsMode } from './paymentsMode';

export type { PaymentsMode } from './paymentsMode';
export { resolvePaymentsMode } from './paymentsMode';

export type PaymentResult = {
  data: Payment | null;
  error: { message: string } | null;
};

export type PaymentProvider = {
  getMode(): PaymentsMode;
  /**
   * Create — or idempotently return — the job's payment in `authorized`.
   * The amount is the accepted offer's; the server refuses to take one.
   */
  authorizeJobPayment(jobId: string): Promise<PaymentResult>;
  /** Move the job's authorized payment to `held`. Idempotent on held. */
  protectJobPayment(jobId: string): Promise<PaymentResult>;
  /**
   * The customer's approval: move the held payment to `released`. The server
   * enforces ownership, completed status, the dispute freeze, and idempotency
   * on released — navigation order is not an authorization boundary.
   */
  releaseJobPayment(jobId: string): Promise<PaymentResult>;
  /** One review-time tip per completed job, only after release. */
  tipWorker(jobId: string, amountCents: number): Promise<PaymentResult>;
};

const resolution = resolvePaymentsMode({
  configured: process.env.EXPO_PUBLIC_PAYMENTS_MODE,
  dev: __DEV__,
});

export const paymentsMode = resolution.mode;
export const paymentsConfigError = resolution.configError;

const DISABLED_MESSAGE =
  'Payments are not switched on in this build. Nothing was charged or held.';

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
    releaseJobPayment: (jobId) => call('sandbox_release_job_payment', jobId),
    tipWorker: async (jobId, amountCents) => {
      const { data, error } = await supabase.rpc('sandbox_tip_worker', {
        p_job_id: jobId,
        p_amount_cents: amountCents,
      });
      if (error) return { data: null, error: { message: error.message } };
      return { data: (data ?? null) as Payment | null, error: null };
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
    authorizeJobPayment: refuse,
    protectJobPayment: refuse,
    releaseJobPayment: refuse,
    tipWorker: refuse,
  };
}

/**
 * The one payment provider the app uses, chosen once at module load.
 * Screens import this and never call the sandbox RPCs directly.
 */
export const paymentProvider: PaymentProvider =
  resolution.mode === 'sandbox'
    ? createSandboxPaymentProvider()
    : createDisabledPaymentProvider(resolution.configError ?? DISABLED_MESSAGE);
