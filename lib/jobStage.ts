import { STAGE, deriveJobLifecycle } from './jobLifecycle';

/**
 * The single evolving status shown on a job's detail screen:
 *   Open → Bids Pending (N) → Booked → [Working] → Done   (C1b's stage words)
 *
 * VISIBILITY RULE (carried over unchanged from the timeline this replaced):
 * "Working" (raw `in_progress`) is a real `jobs.status` value, but it is only ever surfaced
 * to the job's poster. For every other viewer an in_progress job reports
 * "Booked" — identical to a merely-assigned job — so the badge gives away
 * nothing about work having started. It flips straight from Booked to
 * Done for them. This is a display-time mapping only; the stored status
 * is untouched.
 *
 * Since Batch I (F-012) this is PRESENTATION over lib/jobLifecycle.ts: the
 * raw status runs through THE derivation, and only the stage vocabulary —
 * the bid overlay, the poster privacy rule, the frozen labels — lives here.
 * The derivation is deliberately payment-blind because this signature
 * carries no payment fact: raw 'assigned' therefore arrives as the derived
 * 'pending_payment' and still renders the stage word 'Booked' —
 * funding truth belongs to the payment surfaces, not this badge.
 *
 * Kept as a pure function separate from the component so the rule can be
 * unit-checked without rendering anything.
 */

export type JobStage = {
  /** Drives the badge colour — a key StatusBadge already knows. */
  statusKey: string;
  label: string;
};

/**
 * THE raw-status title-caser ('needs_review' → 'Needs Review'), shared with
 * StatusBadge — the one copy; a second one is the F-012 duplication coming
 * back.
 */
export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function jobStage(
  status: string,
  bidCount: number | null,
  isPoster: boolean
): JobStage {
  const state = deriveJobLifecycle({ job: { status }, payment: null });
  switch (state) {
    case 'open': {
      // null = count not loaded yet; show plain "Open" rather than briefly
      // flashing "Bids Pending (0)".
      const count = bidCount ?? 0;
      if (count > 0) {
        return { statusKey: 'pending', label: `Bids Pending (${count})` };
      }
      return { statusKey: 'open', label: 'Open' };
    }
    // Raw 'assigned', payment-blind — and nothing else: en_route/arrived
    // need arrival stamps this signature never sees.
    case 'pending_payment':
      return { statusKey: 'assigned', label: STAGE.booked };
    case 'in_progress':
      // The whole privacy rule lives here.
      return isPoster
        ? { statusKey: 'in_progress', label: STAGE.working }
        : { statusKey: 'assigned', label: STAGE.booked };
    case 'completed':
      return { statusKey: 'completed', label: STAGE.done };
    // A status this client cannot classify keeps the raw-status fallback
    // and never pretends it's on the track — the explicit branch, not an
    // accidental fall-through (decision 5).
    case 'unknown':
    default:
      // draft, cancelled — real states outside the normal flow, rendered
      // the same way: the raw status, title-cased.
      return { statusKey: status, label: formatStatus(status) };
  }
}
