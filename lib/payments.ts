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
  /** Always PLATFORM_FEE_RATE of amount_cents, i.e. 0 — see that constant. */
  platform_fee_cents: number;
  /** 'sandbox' is the only value the database accepts (phase50 CHECK). */
  provider: string;
  provider_ref: string | null;
  status: PaymentStatus;
  authorized_at: string | null;
  held_at: string | null;
  /** When the row left held for released (phase51). Tips are born released
   *  and stamp it at insert. Null until then. */
  released_at: string | null;
  /** 'approved' = the customer approved the work; 'auto_approved' = the 72h
   *  on-read clock ran out (phase51). Null for tips and unreleased rows. */
  release_reason: 'approved' | 'auto_approved' | null;
  /** When the payee's simulated cash-out swept this row to paid_out
   *  (phase55). Sandbox — no real transfer exists. */
  paid_out_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * THE platform fee. Every fee figure in the app derives from this one value.
 *
 * WHY IT IS ZERO
 * The ledger is the authority, not the UI. Every insert into public.payments
 * writes `platform_fee_cents = 0` — sandbox_authorize_job_payment (phase50,
 * re-issued in phase58) and add_job_tip (phase51) — because no authoritative
 * fee schedule exists and a money table is the last place to invent one. So a
 * worker's real payout is the full agreed amount, and Earnings sums 0 in fees
 * off those same rows.
 *
 * WHY IT LIVES HERE RATHER THAN ON A SCREEN
 * Job details (screen 51) carried its own ESTIMATED_PLATFORM_FEE_RATE = 0.1 and
 * advertised "est. payout after fee" at 90% of the budget — $36 on a $40 job —
 * while checkout and Earnings both showed no fee at all. Two constants meant
 * the marketplace quoted a worker LESS than it pays them, which is the one
 * direction this must never be wrong in. One constant, ledger-derived, makes
 * that disagreement unrepresentable.
 *
 * WHEN A REAL SCHEDULE ARRIVES it comes from the database with the payment row,
 * not from a client constant: change the RPCs first, then read
 * `platform_fee_cents` off the row. This constant is the honest stand-in until
 * then, not a config knob to turn.
 */
export const PLATFORM_FEE_RATE: number = 0;

/** What the platform keeps from `amountCents`. */
export function platformFeeCents(amountCents: number): number {
  return Math.round(amountCents * PLATFORM_FEE_RATE);
}

/** What the worker actually receives from `amountCents`. Never more than the
 *  ledger will pay them, and — while the rate is 0 — never less either. */
export function workerPayoutCents(amountCents: number): number {
  return amountCents - platformFeeCents(amountCents);
}

const PAYMENT_COLUMNS =
  'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at';

/** True once funds are protected. §H.3: "held" is the ONLY state the app may
 *  describe as protected. Since phase51, approval (or the 72h clock) can move
 *  a held payment to released — see isReleased. */
export function isHeld(payment: Pick<Payment, 'status'>): boolean {
  return payment.status === 'held';
}

/** True once funds have left protection toward the worker — released or
 *  already paid out. The ONLY states the app may describe as released. */
export function isReleased(payment: Pick<Payment, 'status'>): boolean {
  return payment.status === 'released' || payment.status === 'paid_out';
}

/**
 * Whether the funding CTA (Checkout) may be offered for this job — THE one
 * derivation for every surface that can show it (AUD-P1-02; the lifecycle
 * derivation drifted into a duplicate once already, so this predicate exists
 * exactly once). It mirrors the server contract of
 * sandbox_authorize_job_payment (phase58): the job's owner, an accepted
 * assignment, status assigned/in_progress/completed — the worker starting or
 * even finishing must never destroy the customer's path to fund.
 *
 * The payment side is a strict WHITELIST: offer only on
 *   - no active row (checkout never ran; failed/voided rows read as null), or
 *   - an 'authorized' row (checkout stopped before the hold).
 * held, released, paid_out, refunded, partially_refunded, the legacy
 * 'pending', and anything unrecognized mean money already moved — or a state
 * this client cannot positively classify — and the answer is NO for all of
 * them: a wrongly-shown checkout here is a double-charge surface. An open
 * dispute also suppresses the offer; it exists to freeze money movement.
 */
export function canOfferJobFunding({
  viewerId,
  job,
  payment,
  hasOpenDispute = false,
}: {
  viewerId: string | null | undefined;
  job: { client_id: string; status: string; assigned_worker_id: string | null };
  payment: Pick<Payment, 'status'> | null;
  hasOpenDispute?: boolean;
}): boolean {
  if (!viewerId || viewerId !== job.client_id) return false;
  if (!job.assigned_worker_id) return false;
  if (
    job.status !== 'assigned' &&
    job.status !== 'in_progress' &&
    job.status !== 'completed'
  ) {
    return false;
  }
  if (hasOpenDispute) return false;
  if (payment == null) return true;
  return payment.status === 'authorized';
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

/**
 * The same active job_payment row, read through job_payment_state() so the
 * 72h auto-release clock is checked on the way (phase51's on-read pattern —
 * there is no cron). The lifecycle surfaces use THIS; fetchJobPayment stays
 * for reads where running the clock would be surprising.
 */
export async function fetchJobPaymentState(jobId: string) {
  const { data, error } = await supabase.rpc('job_payment_state', {
    p_job_id: jobId,
  });

  // The RPC returns NULL (not an error) when checkout never ran. PostgREST
  // serialises that as a row of nulls or nothing depending on version, so
  // key off the id.
  const row = (data ?? null) as Payment | null;
  return { data: row && row.id ? row : null, error };
}

/**
 * The job's tip row (kind='tip'), or null when none was given. Same RLS as
 * the job payment: only the two parties can see it.
 */
export async function fetchJobTip(jobId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('job_id', jobId)
    .eq('kind', 'tip')
    .not('status', 'in', '(failed,voided)')
    .maybeSingle();

  return { data: data as Payment | null, error };
}
