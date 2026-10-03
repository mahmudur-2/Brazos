import type { Payment } from './payments';

/**
 * THE job-lifecycle derivation point (run addendum §1, 2026-08-09).
 *
 * The §H.1 status-enum migration (pending_payment/confirmed/en_route/…) is
 * DEFERRED to the version-gate phase. Until then the database vocabulary
 * stays `open → assigned → in_progress → completed`, and everything richer
 * is DERIVED here — and only here — from three facts:
 *
 *   1. jobs.status            (the §H.1 enum as it exists today)
 *   2. the payment's state    ("confirmed" is assigned + held, per the
 *                              Phase 5 judgment call BUILD_STATE records)
 *   3. the arrival timestamps (phase51: static, monotonic, worker-declared)
 *   4. an open dispute        (phase51: freezes release at `completed`)
 *
 * Every Phase 6–12 screen that wants a lifecycle answer calls this. No screen
 * re-derives any of it locally, so when the enum migration finally lands, the
 * enum values replace THIS function's body and the app follows in one file.
 */

export type JobLifecycleState =
  | 'draft'
  | 'open'
  /** Assigned, but the customer has not put the funds in protection yet. */
  | 'pending_payment'
  /** Assigned + payment held — §H.1's "confirmed", derived. */
  | 'confirmed'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  /** Work submitted complete; funds held pending the customer's approval. */
  | 'awaiting_approval'
  /** Work submitted complete; an open issue report is freezing release. */
  | 'disputed'
  | 'completed'
  | 'cancelled'
  | 'unknown';

/**
 * What the derivation needs of the payment row: the status, plus (R6a, D23)
 * whether release was requested and which provider wrote the row. Both are
 * optional so a status-only caller still compiles; a full Payment satisfies
 * it.
 */
export type LifecyclePayment = Pick<Payment, 'status'> &
  Partial<Pick<Payment, 'release_requested_at' | 'provider'>>;

export type JobLifecycleInput = {
  job: {
    status: string;
    en_route_at?: string | null;
    arrived_at?: string | null;
    /** Feeds the 72h auto-release clock (phase51). Absent/null = no clock. */
    completed_at?: string | null;
  };
  /** The job's active job_payment row, or null when checkout never ran. */
  payment: LifecyclePayment | null;
  /**
   * true = an open report exists, false = the read said there is none.
   * 'unknown' = the dispute read FAILED — which is a different fact from
   * "no dispute". A failed read must never render as a normal job quietly
   * progressing to auto-release (F-026), so 'unknown' here derives 'unknown'
   * and nothing else.
   */
  hasOpenDispute?: boolean | 'unknown';
};

/** phase51's on-read auto-release clock, from jobs.completed_at. */
export const AUTO_RELEASE_HOURS = 72;

/**
 * When phase51's clock releases this job's held payment, in epoch ms — or
 * null when the clock never runs (jobs completed before phase51 carry no
 * completed_at, deliberately).
 */
export function releaseDeadlineMs(job: { completed_at?: string | null }): number | null {
  if (!job.completed_at) return null;
  const completed = Date.parse(job.completed_at);
  return Number.isFinite(completed) ? completed + AUTO_RELEASE_HOURS * 3_600_000 : null;
}

export function deriveJobLifecycle(
  { job, payment, hasOpenDispute = false }: JobLifecycleInput,
  nowMs: number = Date.now()
): JobLifecycleState {
  // A failed dispute read poisons the whole derivation: from 'unknown' this
  // function may not place the job anywhere on the track — not progressing,
  // not awaiting approval, never auto-releasing. Callers hold their error
  // state instead of consuming this value as a fact.
  if (hasOpenDispute === 'unknown') return 'unknown';
  switch (job.status) {
    case 'draft':
      return 'draft';
    case 'open':
      return 'open';
    case 'cancelled':
      return 'cancelled';
    case 'assigned': {
      // Arrival facts outrank payment state: a worker who declared "arrived"
      // has arrived whether or not the customer finished checkout. The
      // payment surfaces keep telling the funding truth separately.
      if (job.arrived_at) return 'arrived';
      if (job.en_route_at) return 'en_route';
      return payment?.status === 'held' ? 'confirmed' : 'pending_payment';
    }
    case 'in_progress':
      return 'in_progress';
    case 'completed': {
      if (payment?.status === 'held') {
        if (hasOpenDispute) return 'disputed';
        // D23 (R6a): a stripe row the customer approved — or the 72h cron
        // requested — keeps status held until the provider's transfer lands,
        // with release_requested_at set. The decision is made: the job is
        // completed (the hub buckets it as closed), and the money copy says
        // approved / on its way, never released (isReleased stays false).
        if (payment.release_requested_at) return 'completed';
        // phase51's release is checked ON READ (there is no cron): a held
        // SANDBOX payment past its 72h deadline releases the moment
        // job_payment_state() next looks at it. Rendering it as completed
        // here is the same on-read honesty as effectiveOfferStatus() —
        // showing the truth early, never inventing state. The dispute branch
        // above mirrors the server, which refuses to auto-release while an
        // open report exists. The mirror is SANDBOX-ONLY: a stripe row past
        // 72h without a request is still awaiting approval until the gated
        // cron requests it, and a row whose provider is unknown is never
        // advanced early.
        if (payment.provider === 'sandbox') {
          const deadline = releaseDeadlineMs(job);
          if (deadline !== null && nowMs >= deadline) return 'completed';
        }
        return 'awaiting_approval';
      }
      // Released / paid out — or a legacy job with no payment row at all.
      return 'completed';
    }
    default:
      return 'unknown';
  }
}

/**
 * C1 (2026-10-03, pick C1b) — THE STAGE WORDS. One set, everywhere a hired
 * job's progress is named: the pills, the steppers, the rail, Track and the
 * Inbox chip all read these. Booked · On the way · Here · Working · Done.
 */
export const STAGE = {
  booked: 'Booked',
  onTheWay: 'On the way',
  here: 'Here',
  working: 'Working',
  done: 'Done',
} as const;

/** The five stages in order — the full track (Track worker). */
export const STAGE_TRACK = [STAGE.booked, STAGE.onTheWay, STAGE.here, STAGE.working, STAGE.done] as const;

/**
 * Display labels for every derived state, in the app's plain voice.
 *
 * Two states sit outside the five stage words on purpose. pending_payment is
 * "Awaiting payment", never "Booked": an unfunded hire called booked is a
 * faked payment state (CLAUDE.md's money invariant). disputed stays "Issue
 * reported". Nothing here ever says paid — that word belongs to
 * jobPillLabel(), and only once the ledger says released.
 */
export const JOB_LIFECYCLE_LABELS: Record<JobLifecycleState, string> = {
  draft: 'Draft',
  open: 'Open',
  pending_payment: 'Awaiting payment',
  confirmed: STAGE.booked,
  en_route: STAGE.onTheWay,
  arrived: STAGE.here,
  in_progress: STAGE.working,
  awaiting_approval: STAGE.done,
  disputed: 'Issue reported',
  completed: STAGE.done,
  cancelled: 'Cancelled',
  unknown: 'Unknown',
};

/** The payment states in which the worker has actually been paid. */
const PAID_PAYMENT_STATUSES: readonly string[] = ['released', 'paid_out'];

/**
 * C1b — A JOB CARD'S PILL: the lifecycle label, except that a completed job
 * whose payment has actually released reads "Paid". Allow-listed: held (with
 * or without a release request), a failed read, no row — every one of them
 * stays "Done". Undefined for a status this client cannot classify, so the
 * badge keeps its raw-status fallback and never claims a stage.
 */
export function jobPillLabel(
  state: JobLifecycleState,
  paymentStatus: string | null | undefined
): string | undefined {
  if (state === 'unknown') return undefined;
  if (state === 'completed' && paymentStatus != null && PAID_PAYMENT_STATUSES.includes(paymentStatus)) {
    return 'Paid';
  }
  return JOB_LIFECYCLE_LABELS[state];
}

/**
 * The stage word for a derivation run WITHOUT the payment (a worker's route
 * screen): raw assigned arrives as pending_payment there whether or not the
 * money is held, so it reads the hire's stage word, Booked — never "Awaiting
 * payment", which would claim a funding fact this caller never read.
 */
export function paymentBlindStageLabel(state: JobLifecycleState): string {
  return state === 'pending_payment' ? STAGE.booked : JOB_LIFECYCLE_LABELS[state];
}

/**
 * The tracking timeline (screens 33/56): the ordered march from hire to done.
 * Returns the index of the CURRENT step, or -1 for states off the track
 * (open, cancelled, …). disputed sits at the awaiting_approval position —
 * the work is submitted either way; the dispute changes the money, not the
 * distance travelled.
 */
export function trackStepIndex(state: JobLifecycleState): number {
  switch (state) {
    case 'pending_payment':
    case 'confirmed':
      return 0;
    case 'en_route':
      return 1;
    case 'arrived':
      return 2;
    case 'in_progress':
      return 3;
    case 'awaiting_approval':
    case 'disputed':
    case 'completed':
      return 4;
    default:
      return -1;
  }
}

// ---------------------------------------------------------------------------
// Stage 4D — the My Jobs hub's tab buckets and next-action lines
// ---------------------------------------------------------------------------

/**
 * The hub's three tabs (operator decision 2026-08-16):
 *   active — everything not finished yet, drafts included.
 *   review — work finished, money still HELD (awaiting approval or frozen by
 *            an open dispute). Empties when funds release. Never star-ratings.
 *   closed — released/paid_out, cancelled. A completed-but-unrated job sits
 *            HERE, carrying "Leave a review" as its next action.
 */
export type MyJobsTab = 'active' | 'review' | 'closed';

export function deriveMyJobsTab(state: JobLifecycleState): MyJobsTab {
  switch (state) {
    case 'awaiting_approval':
    case 'disputed':
      return 'review';
    case 'completed':
    case 'cancelled':
      return 'closed';
    // draft, open, pending_payment, confirmed, en_route, arrived,
    // in_progress — and 'unknown', which lands in Active DELIBERATELY: a
    // status this client cannot classify must stay visible, and Active is
    // the tab the user actually checks. Never silently hide a job.
    default:
      return 'active';
  }
}

/** "41h" / "<1h" — the remaining run of phase51's release clock. */
export function releaseCountdownLabel(deadlineMs: number, nowMs: number): string {
  const remainingMs = deadlineMs - nowMs;
  if (remainingMs < 3_600_000) return '<1h';
  return `${Math.floor(remainingMs / 3_600_000)}h`;
}

export type MyJobsPerspective = 'customer' | 'worker';

/**
 * The derived NEXT-ACTION line every hub card carries as its primary label
 * (4D-1a). One implementation, both perspectives, built only on facts the
 * hub already holds: the derived lifecycle state, the bid count, whether the
 * viewer has already reviewed the job, and the release deadline. Money copy
 * follows the payment state machine: held funds "release", nothing is ever
 * called paid before it releases.
 */
export function myJobsNextAction(input: {
  perspective: MyJobsPerspective;
  state: JobLifecycleState;
  /** Posted jobs only — pending bids on the open job. */
  bidCount?: number;
  /** Whether the VIEWER has already left their review on this job. */
  reviewedByMe?: boolean;
  /** From releaseDeadlineMs(); null when the clock never runs. */
  releaseDeadline?: number | null;
  nowMs?: number;
}): string {
  const { perspective, state, bidCount = 0, reviewedByMe = false } = input;
  const nowMs = input.nowMs ?? Date.now();
  const countdown =
    input.releaseDeadline != null && input.releaseDeadline > nowMs
      ? releaseCountdownLabel(input.releaseDeadline, nowMs)
      : null;

  switch (state) {
    case 'draft':
      return 'Finish posting — workers can’t see it yet';
    case 'open':
      return bidCount > 0
        ? `${bidCount} ${bidCount === 1 ? 'bid' : 'bids'} to review`
        : 'Awaiting bids';
    case 'pending_payment':
      return perspective === 'customer'
        ? 'Complete checkout — protect the payment'
        : 'Waiting on payment protection';
    case 'confirmed':
      return perspective === 'customer'
        ? 'Booked — waiting on your worker'
        : 'Mark en route when you head out';
    case 'en_route':
      return perspective === 'customer'
        ? 'Worker on the way — track progress'
        : 'Mark arrived when you get there';
    case 'arrived':
      return perspective === 'customer'
        ? 'Your worker is here'
        : 'Start the job when you begin';
    case 'in_progress':
      return perspective === 'customer'
        ? 'Working — track progress'
        : 'Mark complete when you finish';
    case 'awaiting_approval':
      if (perspective === 'customer') {
        return countdown
          ? `Approval needed — releases in ${countdown}`
          : 'Approval needed — review the finished work';
      }
      return countdown
        ? `Waiting on approval — releases in ${countdown}`
        : 'Waiting on customer approval';
    case 'disputed':
      return 'Issue reported — release is frozen';
    case 'completed':
      return reviewedByMe ? 'Closed' : 'Leave a review';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'View details';
  }
}
