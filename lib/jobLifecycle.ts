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

export type JobLifecycleInput = {
  job: {
    status: string;
    en_route_at?: string | null;
    arrived_at?: string | null;
  };
  /** The job's active job_payment row, or null when checkout never ran. */
  payment: Pick<Payment, 'status'> | null;
  hasOpenDispute?: boolean;
};

export function deriveJobLifecycle({
  job,
  payment,
  hasOpenDispute = false,
}: JobLifecycleInput): JobLifecycleState {
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
        return hasOpenDispute ? 'disputed' : 'awaiting_approval';
      }
      // Released / paid out — or a legacy job with no payment row at all.
      return 'completed';
    }
    default:
      return 'unknown';
  }
}

/** Display labels for every derived state, in the app's plain voice. */
export const JOB_LIFECYCLE_LABELS: Record<JobLifecycleState, string> = {
  draft: 'Draft',
  open: 'Open',
  pending_payment: 'Awaiting payment protection',
  confirmed: 'Confirmed',
  en_route: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  awaiting_approval: 'Awaiting your approval',
  disputed: 'Issue reported',
  completed: 'Completed',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
};

/**
 * The tracking timeline (screens 33/56): the ordered march from hire to done.
 * Returns the index of the CURRENT step, or -1 for states off the track
 * (open, cancelled, …). disputed sits at the awaiting_approval position —
 * the work is submitted either way; the dispute changes the money, not the
 * distance travelled.
 */
export const TRACK_STEPS = [
  'confirmed',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
] as const;

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
