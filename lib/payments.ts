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
 *
 * The pure predicates (isHeld, isReleased, isReleaseRequested,
 * canOfferJobFunding) live in lib/paymentRules.ts (R6a, D24) so the node
 * suite executes them; they are re-exported here so no importer changed.
 */

export {
  canOfferJobFunding,
  isHeld,
  isReleased,
  isReleaseRequested,
} from './paymentRules';

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
  /** The agreed price — what the worker's payout is computed from. */
  amount_cents: number;
  /** What the platform keeps from amount_cents. Sandbox rows write 0; a
   *  stripe row carries the ledger's own figure. The worker's take is
   *  amount_cents - platform_fee_cents, read off the row, never computed
   *  from a client rate (D10). */
  platform_fee_cents: number;
  /** 'sandbox' (phase50) or 'stripe' (R4's foundation). */
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
  // --- R6a (D12): the stripe ledger's figures. Every one optional/nullable so
  // a sandbox row that never carried them still parses. ---
  /** The customer's ALL-IN total — agreed price + protection fee + tax. The
   *  headline everywhere the customer is shown what they pay (D13). */
  charge_amount_cents?: number | null;
  /** The customer's protection fee, part of charge_amount_cents. */
  customer_fee_cents?: number | null;
  /** Tax on the charge; shown only when non-zero. */
  tax_cents?: number | null;
  /** An unfunded stripe row's funding window; a lapsed one is never extended
   *  (D9, D14). */
  funding_due_at?: string | null;
  /** D23: set by release_job_payment / auto_release_due_payments on a stripe
   *  row while its status stays held — approved, payout pending. */
  release_requested_at?: string | null;
  /** What release requested be transferred to the worker. */
  transfer_cents?: number | null;
  refund_cents?: number | null;
  refund_reason?: string | null;
};

/**
 * THERE IS NO CLIENT FEE CONSTANT (R6a, D10). PLATFORM_FEE_RATE and its two
 * helpers stood in for a schedule that did not exist; the real schedule now
 * lives in the database — quote_job_price() before a ledger row exists, the
 * row's own charge_amount_cents / customer_fee_cents / tax_cents /
 * platform_fee_cents once it does — and every figure the app shows is read
 * from one of those two places. Job details once quoted a worker LESS than
 * the ledger paid them from a second local rate; with no client arithmetic
 * left, that disagreement is unrepresentable.
 */

const PAYMENT_COLUMNS =
  'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at, charge_amount_cents, customer_fee_cents, tax_cents, funding_due_at, release_requested_at, transfer_cents, refund_cents, refund_reason';

/**
 * quote_job_price(p_amount_cents)'s row — the ONLY price arithmetic in the
 * marketplace (D-4). Read before a ledger row exists (D11, D22); once a row
 * exists its own charge_amount_cents / customer_fee_cents / tax_cents replace
 * the quote.
 */
export type JobPriceQuote = {
  job_price_cents: number;
  customer_fee_cents: number;
  tax_cents: number;
  total_cents: number;
  worker_fee_cents: number;
  worker_receives_cents: number;
};

const QUOTE_FIELDS: (keyof JobPriceQuote)[] = [
  'job_price_cents',
  'customer_fee_cents',
  'tax_cents',
  'total_cents',
  'worker_fee_cents',
  'worker_receives_cents',
];

const QUOTE_INCOMPLETE = 'The price could not be worked out right now. Try again.';

/**
 * The all-in price for an agreed amount, from the database's own schedule.
 * authenticated may execute it; the second parameter defaults server-side.
 * The result is validated field by field — a missing figure is an error,
 * never a number this client makes up.
 */
export async function quoteJobPrice(
  amountCents: number
): Promise<{ data: JobPriceQuote | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('quote_job_price', { p_amount_cents: amountCents });
  if (error) return { data: null, error: { message: error.message } };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object') return { data: null, error: { message: QUOTE_INCOMPLETE } };
  const quote: Partial<JobPriceQuote> = {};
  for (const field of QUOTE_FIELDS) {
    const value = row[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { data: null, error: { message: QUOTE_INCOMPLETE } };
    }
    quote[field] = value;
  }
  return { data: quote as JobPriceQuote, error: null };
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
 * What the hub's bucketing needs of each job's active payment: the status,
 * plus (D23) whether release was requested and which provider wrote the row,
 * so an approved stripe job buckets as closed rather than review.
 */
export type PaymentStatusSummary = Pick<Payment, 'status' | 'release_requested_at' | 'provider'>;

/**
 * The active job_payment STATUS for each of a list of jobs, in one query —
 * the My Jobs hub's bucketing read (Review means completed + held). Same
 * filters as fetchJobPayment; RLS scopes rows to payer/payee, and every job
 * the hub lists has the viewer as one of the two, so nothing extra leaks.
 *
 * This is a plain table read: it does NOT run phase51's on-read release
 * clock (that is job_payment_state(), one job per call — N round trips for a
 * list). deriveJobLifecycle() mirrors the elapsed-clock case client-side
 * instead — for sandbox rows only — so a held sandbox row past its deadline
 * still buckets as closed; a stripe row buckets as closed once
 * release_requested_at is set (D23).
 */
export async function fetchJobPaymentStatusesByJobIds(jobIds: string[]) {
  if (jobIds.length === 0) {
    return { data: {} as Record<string, PaymentStatusSummary>, error: null };
  }

  const { data, error } = await supabase
    .from('payments')
    .select('job_id, status, release_requested_at, provider')
    .in('job_id', jobIds)
    .eq('kind', 'job_payment')
    .not('status', 'in', '(failed,voided)');

  const byJob: Record<string, PaymentStatusSummary> = {};
  for (const row of (data ?? []) as {
    job_id: string;
    status: PaymentStatus;
    release_requested_at: string | null;
    provider: string;
  }[]) {
    byJob[row.job_id] = {
      status: row.status,
      release_requested_at: row.release_requested_at ?? null,
      provider: row.provider,
    };
  }
  return { data: byJob, error };
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
