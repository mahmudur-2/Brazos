import { supabase } from './supabase';
import { formatBudget } from './jobs';

/**
 * The money ledger's client types and reads (BRAZOS_MASTER_PLAN.md §G/§H.3).
 *
 * A payment is created by the card checkout and stops at `held`. No client
 * call moves a payment past `held`: release is the customer's approval or the
 * auto-release clock, both in the database.
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
  isCancellationFeeKept,
  isHeld,
  isRefundQueued,
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
  /** What the platform keeps from amount_cents: the ledger's own figure. The
   *  worker's take is amount_cents - platform_fee_cents, read off the row,
   *  never computed from a client rate (D10). */
  platform_fee_cents: number;
  /** 'stripe' for every row the app writes. */
  provider: string;
  provider_ref: string | null;
  status: PaymentStatus;
  authorized_at: string | null;
  held_at: string | null;
  /** When the row left held for released (phase51): transfer.created stamps
   *  it. A tip is held once its card is charged and released only when its
   *  transfer lands, like a job payment (B1, 20261111000000). Null until then. */
  released_at: string | null;
  /** 'approved' = the customer approved the work; 'auto_approved' = the 72h
   *  on-read clock ran out (phase51). Null for tips and unreleased rows. */
  release_reason: 'approved' | 'auto_approved' | null;
  /** Reserved: the ledger stops at released (payout.paid is unhandled), so
   *  nothing writes this today. */
  paid_out_at: string | null;
  created_at: string;
  updated_at: string;
  // --- R6a (D12): the stripe ledger's figures. Every one optional/nullable so
  // an older row that never carried them still parses. ---
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
   *  row while its status stays held — approved, payout pending. A charged
   *  tip gets it from apply_payment_event at payment_intent.succeeded: a tip
   *  needs no approval (B1). */
  release_requested_at?: string | null;
  /** What release requested be transferred to the worker. */
  transfer_cents?: number | null;
  refund_cents?: number | null;
  refund_reason?: string | null;
};

/**
 * R6c (D7): THE one place the worker's take is derived from a ledger row —
 * amount_cents − platform_fee_cents, both read off the row, no rate anywhere.
 * Tips carry platform_fee_cents = 0 (enforce_tip_ceiling), so a tip's take is
 * its full amount. Every worker-facing
 * "yours" figure — Earnings' buckets and rows, the worker's job card — calls
 * this; nothing else on the client subtracts a fee.
 */
export function workerTakeCents(row: Pick<Payment, 'amount_cents' | 'platform_fee_cents'>): number {
  return row.amount_cents - row.platform_fee_cents;
}

/**
 * n5 (2026-09-04): the bid composer's take-home line, from a quote_job_price()
 * row and nothing else. `worker_receives_cents` is shown AS RETURNED — no
 * rate, no subtraction, no client arithmetic (R6a D10 stands). A missing
 * quote, or a figure that is not a non-negative integer, is null: unknown is
 * never rendered as a number. formatBudget is the one money formatter.
 */
export function workerTakeLine(
  quote: Pick<JobPriceQuote, 'worker_receives_cents'> | null | undefined
): string | null {
  if (!quote) return null;
  const cents = quote.worker_receives_cents;
  if (!Number.isInteger(cents) || cents < 0) return null;
  return `You get ${formatBudget(cents)} after the fee`;
}

/**
 * R6c (D7): the "Protection fee" line of the worker’s breakdown — the
 * customer's protection fee plus the worker-side fee, both read off the row.
 * A sum of two ledger columns, beside workerTakeCents and nowhere else; the
 * rates that produced each live in the database's fee_schedule.
 */
export function brazosFeeCents(
  row: Pick<Payment, 'platform_fee_cents' | 'customer_fee_cents'>
): number {
  return row.platform_fee_cents + (row.customer_fee_cents ?? 0);
}

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
 * list). A stripe row buckets as closed once release_requested_at is set
 * (D23).
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
 * R6c (D3): the tip poll's terminal branches, decided from one read of the tip
 * row — the tip's mirror of stripeRules' classifyCheckoutPoll:
 *   'charged'  — payment_intent.succeeded landed: the card was charged and the
 *                tip is held, already queued for transfer to the worker
 *                (release_requested_at and transfer_cents set at once, B1). The
 *                poll's success — but the tip is on its way, not yet sent.
 *   'released' — the transfer landed (transfer.created), or, swept later,
 *                paid_out: the tip reached the worker. Also success.
 *   'gone'     — fetchJobTip filters failed and voided, so a row that was
 *                seen and now reads null is the failed/voided signal; a row
 *                that reads failed or voided outright says the same thing.
 *   'pending'  — anything else (unfunded). Keep polling until the deadline;
 *                the deadline is the screen's own branch, not a state here.
 *
 * `seen` starts true from the paymentId create-payment returned — a row that
 * never existed is not "gone", it is not yet there.
 */
export type TipPollState = 'charged' | 'released' | 'gone' | 'pending';

export function classifyTipPoll({
  status,
  seen,
}: {
  status: string | null | undefined;
  seen: boolean;
}): TipPollState {
  if (status === 'held') return 'charged';
  if (status === 'released' || status === 'paid_out') return 'released';
  if (status === 'failed' || status === 'voided') return 'gone';
  if (status == null) return seen ? 'gone' : 'pending';
  return 'pending';
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

// ---------------------------------------------------------------------------
// R6c (D1) — payouts: the worker's payout state, in the vocabulary
// 20260915000000_connect_onboarding.sql speaks and HANDOFF.md R5b "FOR R6"
// contracts. Status truth is on-demand: my_payouts_status() is the cheap read
// of the STORED state; connect-status (lib/payments/stripe.ts) is the refresh
// that asks the provider and moves it. Nothing here claims a state the
// database does not hold.
// ---------------------------------------------------------------------------

/** The four app-facing payout states, exactly as payment_accounts.payouts_status stores them. */
export const PAYOUTS_STATUSES = Object.freeze(['none', 'action_needed', 'under_review', 'enabled'] as const);

export type PayoutsStatus = (typeof PAYOUTS_STATUSES)[number];

export function isPayoutsStatus(value: unknown): value is PayoutsStatus {
  return typeof value === 'string' && (PAYOUTS_STATUSES as readonly string[]).includes(value);
}

/** What the payouts screen renders for each state — the R5b contract, verbatim
 *  where it names a string. `cta` is the one button; null means no call to
 *  action. `refresh` is whether a refresh is the thing to offer instead. No
 *  sentence here says "verified" or claims identity — payouts_enabled is not
 *  identity verification. */
export type PayoutsView = {
  headline: string;
  body: string;
  cta: 'Set up payouts' | 'Finish setting up payouts' | null;
  refresh: boolean;
};

const PAYOUTS_VIEWS: Record<PayoutsStatus, PayoutsView> = {
  none: {
    headline: 'Payouts aren’t set up yet',
    body: 'Set up payouts to receive what you earn. It’s a short setup in your browser, and you’re brought back here when it’s done.',
    cta: 'Set up payouts',
    refresh: false,
  },
  action_needed: {
    headline: 'Payout setup isn’t finished',
    body: 'Something is still needed before payouts can start. Pick up where you left off — the setup resumes in your browser.',
    cta: 'Finish setting up payouts',
    refresh: false,
  },
  under_review: {
    headline: 'Payouts under review',
    body: 'Nothing more is needed from you right now. The review finishes on its own — tap Refresh to check.',
    cta: null,
    refresh: true,
  },
  enabled: {
    headline: 'Payouts are set up',
    body: 'Approved payments are transferred to you on the provider’s schedule. There is nothing to trigger here.',
    cta: null,
    refresh: false,
  },
};

/** The status → CTA mapping (R5b "The four status strings and the payouts CTA"). */
export function payoutsCta(status: PayoutsStatus): PayoutsView {
  return PAYOUTS_VIEWS[status];
}

/**
 * n4b (2026-09-05): the one sentence Payouts says when an APPROVED payment is
 * waiting on the worker's own setup. From the worker's side, "approved and
 * not yet sent" is a stripe row still `held` with `release_requested_at` set
 * — lib/paymentRules.ts isReleaseRequested (D23), spelled out here the way
 * lib/jobLifecycle.ts spells it, because this module re-exports that
 * predicate without binding it and the node harnesses that execute this file
 * rewrite its one paymentRules import specifier — and process-settlements sends
 * nothing to a payee whose payment_accounts.payouts_enabled is false, which
 * is every status but 'enabled'. Never "paid", never "released": the
 * transfer has not landed. A null status is unknown, and unknown says
 * nothing.
 */
export const PAYOUT_SETUP_NOTICE =
  'An approved payment is waiting on your payout setup before it can be sent to you.';

export function payoutSetupNotice(
  status: PayoutsStatus | null,
  rows: ReadonlyArray<Pick<Payment, 'provider' | 'status' | 'release_requested_at'>>
): string | null {
  if (status === null || status === 'enabled') return null;
  const waiting = rows.some(
    (row) => row.provider === 'stripe' && row.status === 'held' && !!row.release_requested_at
  );
  return waiting ? PAYOUT_SETUP_NOTICE : null;
}

export const PAYOUTS_STATUS_UNREADABLE = 'Your payout status could not be read right now. Try again.';

// The cheap read itself — my_payouts_status() — lives in
// lib/payments/stripe.ts beside the two connect calls: payouts exist on the
// card path only, and this module's contract (tests/payouts.test.mjs)
// is that it calls no RPC on a payout path at all. It validates through
// validatePayoutsStatusResponse() below, so the shape rule is written once.

/** connect-onboarding's 200 body: the STORED status at the time of the call and the single-use hosted link. */
export type PayoutsOnboarding = { status: PayoutsStatus; url: string };

export const PAYOUTS_RESPONSE_MALFORMED =
  'The payout setup could not be started right now. Nothing changed — try again.';

/** Validated field by field — a missing or malformed link is an error, never a page this client guesses. */
export function validatePayoutsOnboardingResponse(payload: unknown): {
  data: PayoutsOnboarding | null;
  error: { message: string } | null;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { data: null, error: { message: PAYOUTS_RESPONSE_MALFORMED } };
  }
  const { status, url } = payload as Record<string, unknown>;
  if (!isPayoutsStatus(status) || typeof url !== 'string' || !url.startsWith('https://')) {
    return { data: null, error: { message: PAYOUTS_RESPONSE_MALFORMED } };
  }
  return { data: { status, url }, error: null };
}

/** connect-status's 200 body: `{"status":"…"}` — the state the provider was just asked for, now stored. */
export function validatePayoutsStatusResponse(payload: unknown): {
  data: PayoutsStatus | null;
  error: { message: string } | null;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { data: null, error: { message: PAYOUTS_STATUS_UNREADABLE } };
  }
  const { status } = payload as Record<string, unknown>;
  if (!isPayoutsStatus(status)) return { data: null, error: { message: PAYOUTS_STATUS_UNREADABLE } };
  return { data: status, error: null };
}

/**
 * The fee terms the hire was quoted under (job_agreements; both parties can
 * read it). Null when there is no snapshot — a job hired before agreements
 * existed — in which case the cancel preview says nothing about a figure.
 */
export async function fetchCancelTerms(jobId: string) {
  const { data, error } = await supabase
    .from('job_agreements')
    // The whole snapshot row: the fee columns are read by lib/paymentRules.ts customerCancelPreview,
    // never named in this module (tests/jobCompletions.test.mjs keeps a rate out of it).
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  return { data: data ?? null, error };
}
