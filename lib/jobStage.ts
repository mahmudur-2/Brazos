/**
 * The single evolving status shown on a job's detail screen:
 *   Open → Bids Pending (N) → Assigned → [In Progress] → Completed
 *
 * VISIBILITY RULE (carried over unchanged from the timeline this replaced):
 * "In Progress" is a real `jobs.status` value, but it is only ever surfaced
 * to the job's poster. For every other viewer an in_progress job reports
 * "Assigned" — identical to a merely-assigned job — so the badge gives away
 * nothing about work having started. It flips straight from Assigned to
 * Completed for them. This is a display-time mapping only; the stored status
 * is untouched.
 *
 * Kept as a pure function separate from the component so the rule can be
 * unit-checked without rendering anything.
 */

export type JobStage = {
  /** Drives the badge colour — a key StatusBadge already knows. */
  statusKey: string;
  label: string;
};

export function jobStage(
  status: string,
  bidCount: number | null,
  isPoster: boolean
): JobStage {
  switch (status) {
    case 'open': {
      // null = count not loaded yet; show plain "Open" rather than briefly
      // flashing "Bids Pending (0)".
      const count = bidCount ?? 0;
      if (count > 0) {
        return { statusKey: 'pending', label: `Bids Pending (${count})` };
      }
      return { statusKey: 'open', label: 'Open' };
    }
    case 'assigned':
      return { statusKey: 'assigned', label: 'Assigned' };
    case 'in_progress':
      // The whole privacy rule lives here.
      return isPoster
        ? { statusKey: 'in_progress', label: 'In Progress' }
        : { statusKey: 'assigned', label: 'Assigned' };
    case 'completed':
      return { statusKey: 'completed', label: 'Completed' };
    default:
      // cancelled, or anything outside the normal flow — fall back to the
      // raw status, title-cased, rather than pretending it's on the track.
      return {
        statusKey: status,
        label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      };
  }
}
