import { lateShiftMinutes, movedWindow } from './runningLate';
import { releaseCountdownLabel, releaseDeadlineMs, type JobLifecycleState } from './jobLifecycle';

/**
 * 2026-09-28 (LUX-LIST-64 #45, #62) — WHERE A HIRED JOB STANDS, in words and a
 * rail, for the two surfaces that show it without opening the job: the stage
 * rail on an assigned job's card (refs/live-job-cards.html, option A) and the
 * customer Home's live bar (refs/home-tucked-in.html). ONE implementation for
 * both (P3-31), built only on facts the job and its payment already carry —
 * derived from the lifecycle state lib/jobLifecycle.ts derives, never a second
 * derivation of it.
 *
 * HONEST BY CONSTRUCTION. "About 12 min" appears only when an ETA is handed in
 * — which only a live location share can supply; otherwise the line names the
 * BOOKED window ("booked 6–8 PM", "starts Sat, 8–11 AM"). "N of M tasks done"
 * appears only with a real checklist count. Nothing here guesses.
 */

/** The four steps the rail draws, in order. */
export const LIVE_RAIL_STEPS = ['Hired', 'On the way', 'Working', 'Done'] as const;

export type LiveTone = 'assigned' | 'progress' | 'review';

export type LiveJobStatus = {
  /** The rail step that is current: 0 Hired, 1 On the way, 2 Working, 3 Done. */
  step: 0 | 1 | 2 | 3;
  /** How much of each of the four bars is filled, 0..1. */
  fills: readonly [number, number, number, number];
  /** The bold head of the status line: "On the way". */
  head: string;
  /** What follows the dot: "booked 6–8 PM". */
  detail: string;
  /** The status line's dot is live (moving) while someone is on the way or working. */
  live: boolean;
  /** The stage's colour: Assigned gold, In progress orange, Review work lavender. */
  tone: LiveTone;
};

/**
 * WHICH STAGE COLOUR A LIFECYCLE STATE WEARS — the ONE mapping, read by the
 * card's rail and the Home bar through liveJobStatus() and by the Inbox job
 * chip through inboxStage() (P3-31): hired and on the way are Assigned (gold),
 * working is In progress (orange), done and waiting on the customer is Review
 * work (lavender). Null off the hired track — open, finished, cancelled,
 * disputed.
 */
export function liveTone(state: JobLifecycleState): LiveTone | null {
  switch (state) {
    case 'pending_payment':
    case 'confirmed':
    case 'en_route':
    case 'arrived':
      return 'assigned';
    case 'in_progress':
      return 'progress';
    case 'awaiting_approval':
      return 'review';
    default:
      return null;
  }
}

/** The stage words, one per tone (#54): the Inbox chip says these, in its colour. */
export const STAGE_WORDS: Record<LiveTone, string> = {
  assigned: 'Assigned',
  progress: 'In progress',
  review: 'Review work',
};

/**
 * 2026-09-28 (LUX-LIST-64 #54) — THE INBOX JOB CHIP's stage: the word and its
 * tone, or null — a finished (or not yet hired) job's chip shows its title only.
 */
export function inboxStage(state: JobLifecycleState): { word: string; tone: LiveTone } | null {
  const tone = liveTone(state);
  return tone ? { word: STAGE_WORDS[tone], tone } : null;
}

/** "8 AM" / "12 PM". */
function hourLabel(hour: number): string {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * The booked window, compact: "6–8 PM" (one meridiem when both ends share it),
 * "11 AM–2 PM" otherwise; with the day in front unless it is today — "Sat,
 * 8–11 AM", "tomorrow, 6–8 PM". Null when the poster left timing flexible.
 */
export function bookedWindow(
  job: {
    scheduled_date?: string | null;
    arrival_start_hour?: number | null;
    arrival_end_hour?: number | null;
    /** Idea 5: running late moves the window until the worker arrives (lib/runningLate.ts). */
    late_minutes?: number | null;
    arrived_at?: string | null;
    status?: string | null;
  },
  nowMs: number
): string | null {
  let window: string | null = null;
  const shift = lateShiftMinutes(job);
  if (job.arrival_start_hour != null && job.arrival_end_hour != null) {
    if (shift) {
      window = movedWindow(job.arrival_start_hour, job.arrival_end_hour, shift);
    } else {
      const a = hourLabel(job.arrival_start_hour);
      const b = hourLabel(job.arrival_end_hour);
      window = a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
    }
  } else if (shift) {
    // A flexible day has no window to move, so the delay is said instead.
    window = `${shift} min late`;
  }
  let day: string | null = null;
  if (job.scheduled_date) {
    const [y, m, d] = job.scheduled_date.split('-').map(Number);
    if (y && m && d) {
      const date = new Date(y, m - 1, d);
      const today = new Date(nowMs);
      today.setHours(0, 0, 0, 0);
      const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
      day =
        diff === 0
          ? null
          : diff === 1
            ? 'tomorrow'
            : date.toLocaleDateString('en-US', { weekday: 'short' });
    }
  }
  if (day && window) return `${day}, ${window}`;
  if (window) return window;
  return day;
}

/** "9:02 AM" from an ISO stamp, in the viewer's own clock. */
function clockLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function liveJobStatus(input: {
  state: JobLifecycleState;
  job: {
    scheduled_date?: string | null;
    arrival_start_hour?: number | null;
    arrival_end_hour?: number | null;
    arrived_at?: string | null;
  };
  /** Minutes away — ONLY from a live location share; absent, the booked window. */
  etaMinutes?: number | null;
  /** The worker's checklist, when it has been read. */
  checklist?: { done: number; total: number } | null;
  /** From releaseDeadlineMs(); the approval countdown. */
  releaseDeadline?: number | null;
  /** The card says what to do ("approve, or it releases in 63h"); the Home bar,
   *  what has happened ("check the work"). */
  surface: 'card' | 'bar';
  nowMs: number;
}): LiveJobStatus | null {
  const { state, job, surface, nowMs } = input;
  const tone = liveTone(state);
  if (!tone) return null;
  const window = bookedWindow(job, nowMs);
  // Idea 5: a flexible day has no window, so a delay is said as itself — "running 20 min late" — rather
  // than as a booked time ("booked 20 min late").
  const lateOnly = job.arrival_start_hour == null && lateShiftMinutes(job) > 0;
  switch (state) {
    case 'pending_payment':
    case 'confirmed':
      return {
        step: 0,
        fills: [0.55, 0, 0, 0],
        head: 'Hired',
        detail: lateOnly ? `running ${window}` : window ? `starts ${window}` : 'time to agree in chat',
        live: false,
        tone,
      };
    case 'en_route':
      return {
        step: 1,
        fills: [1, 0.55, 0, 0],
        head: 'On the way',
        // The bar is one slim line beside "Message Sam ›", so it names the
        // window bare ("6–8 PM"); the card has the room to say "booked".
        detail:
          input.etaMinutes != null && input.etaMinutes >= 0
            ? `about ${Math.max(1, Math.round(input.etaMinutes))} min`
            : window
              ? surface === 'bar'
                ? window
                : lateOnly
                  ? `running ${window}`
                  : `booked ${window}`
              : 'heading to you',
        live: true,
        tone,
      };
    case 'arrived':
      return {
        step: 2,
        fills: [1, 1, 0.08, 0],
        head: 'Arrived',
        detail: clockLabel(job.arrived_at) ?? 'at your door',
        live: false,
        tone,
      };
    case 'in_progress': {
      const list = input.checklist;
      const counted = list && list.total > 0;
      return {
        step: 2,
        fills: [1, 1, counted ? Math.max(0.08, Math.min(1, list!.done / list!.total)) : 0.5, 0],
        head: 'Working',
        // No checklist read, no count: "on the job" says what is known and no more.
        detail: counted ? `${list!.done} of ${list!.total} tasks done` : 'on the job',
        live: true,
        tone,
      };
    }
    case 'awaiting_approval': {
      const countdown =
        input.releaseDeadline != null && input.releaseDeadline > nowMs
          ? releaseCountdownLabel(input.releaseDeadline, nowMs)
          : null;
      return {
        step: 3,
        fills: [1, 1, 1, 0.55],
        head: 'Done',
        detail:
          surface === 'bar'
            ? 'check the work'
            : countdown
              ? `approve, or it releases in ${countdown}`
              : 'approve the work',
        live: false,
        tone,
      };
    }
    default:
      return null;
  }
}

/** The order the Home live bar prefers when several jobs are underway. */
export const LIVE_BAR_PRIORITY: readonly JobLifecycleState[] = [
  'in_progress',
  'arrived',
  'en_route',
  'awaiting_approval',
];

/** "Sam" from "Sam Okafor"; null when there is no name to shorten. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * 2026-09-28 (LUX-LIST-64 #45) — THE LIVE HALF OF A CUSTOMER'S POSTED-JOB CARD:
 * the rail with its status line, the chat button's words, and "held" beside the
 * price while the payment is held. ONE rule for My Jobs and both of the Home's
 * job sections (P3-31) — three copies would start describing one hired job three
 * ways. No worker, no rail: an open job's card keeps its next-action line.
 */
export function postedCardLive(input: {
  job: Parameters<typeof liveJobStatus>[0]['job'] & {
    assigned_worker_id?: string | null;
    completed_at?: string | null;
  };
  state: JobLifecycleState;
  paymentStatus: string | null | undefined;
  workerName: string | null | undefined;
  nowMs: number;
}): { live: LiveJobStatus | null; chatLabel: string; moneyNote: 'held' | undefined } {
  const { job, state, paymentStatus, workerName, nowMs } = input;
  const live = job.assigned_worker_id
    ? liveJobStatus({ state, job, releaseDeadline: releaseDeadlineMs(job), surface: 'card', nowMs })
    : null;
  const first = firstNameOf(workerName);
  return {
    live,
    chatLabel: first ? `Message ${first}` : 'Message your worker',
    moneyNote: live && paymentStatus === 'held' ? 'held' : undefined,
  };
}

/**
 * 2026-09-28 (LUX-LIST-64 #62) — WHICH JOB THE HOME LIVE BAR SPEAKS FOR: the
 * first hired job underway, by LIVE_BAR_PRIORITY (working, then arrived, then on
 * the way, then waiting for review); within a stage the list's own order, which
 * is newest first. Null — and no bar — when nothing is underway.
 */
export function pickLiveBarItem<T extends { job: { assigned_worker_id?: string | null }; state: JobLifecycleState }>(
  items: readonly T[]
): T | null {
  for (const stage of LIVE_BAR_PRIORITY) {
    const hit = items.find((item) => item.state === stage && item.job.assigned_worker_id);
    if (hit) return hit;
  }
  return null;
}
