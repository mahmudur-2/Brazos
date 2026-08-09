import { supabase } from './supabase';

/**
 * The money ledger's client types and reads (BRAZOS_MASTER_PLAN.md §G/§H.3).
 *
 * Phase 5 scope: a payment is created by the sandbox checkout and stops at
 * `held`. There is deliberately no client call — and no database function —
 * that moves a payment past `held`; release is Phase 6's approval flow.
 *
 * Writes go through the payment ADAPTER (lib/adapters/payments.ts), never
 * from screens, and land in SECURITY DEFINER RPCs — payments carries SELECT
 * for its two parties and nothing else (phase50). Reads here are plain RLS
 * table reads: payer or payee, enforced by the database.
 */

/**
 * Mirrors the Postgres payment_status enum as Phase 5 writes it — §H.3's
 * vocabulary, the same union StatusPill/MoneyText transcribed in Phase 1.
 * The live enum also carries a legacy 'pending' label from the pre-repo
 * scaffold era; the table had zero rows when phase50 extended it, nothing
 * writes that label, and it is excluded here so no screen can render a
 * payment state §H.3 does not define.
 */
export type PaymentStatus =
  | 'unfunded'
  | 'authorized'
  | 'held'
  | 'released'
  | 'paid_out'
  | 'failed'
  | 'voided'
  | 'refunded'
  | 'partially_refunded';

/** Mirrors the Postgres payment_kind enum. Phase 5 writes only job_payment;
 *  tip is Phase 10's review-time flow. */
export type PaymentKind = 'job_payment' | 'tip';

export type Payment = {
  id: string;
  job_id: string;
  /** The accepted job_offers row this payment funds — money's audit link back
   *  to the negotiation that produced it. */
  offer_id: string | null;
  payer_id: string;
  payee_id: string;
  kind: PaymentKind;
  amount_cents: number;
  /** 0 in Phase 5: no authoritative fee schedule exists, and a money table is
   *  the last place to invent one. Screen 51's 10% remains a labeled estimate. */
  platform_fee_cents: number;
  /** 'sandbox' is the only value the database accepts (phase50 CHECK). */
  provider: string;
  provider_ref: string | null;
  status: PaymentStatus;
  authorized_at: string | null;
  held_at: string | null;
  created_at: string;
  updated_at: string;
};

const PAYMENT_COLUMNS =
  'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, created_at, updated_at';

/** True while the row is live money state rather than failed/voided debris —
 *  the same predicate phase50's one-active-payment index enforces. */
export function isActivePayment(payment: Pick<Payment, 'status'>): boolean {
  return payment.status !== 'failed' && payment.status !== 'voided';
}

/** True once funds are protected. §H.3: "held" is the ONLY state the app may
 *  describe as protected, and Phase 5's terminal state. */
export function isHeld(payment: Pick<Payment, 'status'>): boolean {
  return payment.status === 'held';
}

/**
 * The job's active job_payment row, or null when checkout has not run.
 * RLS returns it only to the payer (customer) and payee (hired worker), so a
 * null on someone else's job is indistinguishable from "no payment" — which
 * is exactly what an outsider is entitled to know.
 */
export async function fetchJobPayment(jobId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('job_id', jobId)
    .eq('kind', 'job_payment')
    .not('status', 'in', '(failed,voided)')
    .maybeSingle();

  return { data: data as Payment | null, error };
}
