import { supabase } from './supabase';
import { DISPUTE_REASON_LABELS, type DisputeReason } from './disputes';
import { isNetworkError, userMessage } from './errorMessage';
import { formatBudget } from './jobs';
import { formatClock, formatDay } from './time';
import { titleCase } from './titleCase';

/**
 * B6 (production-36h) — THE OWNER'S "NEEDS ATTENTION" LIST: the lines of rpc('admin_attention'),
 * in the server's own order and the server's own words (screens/AdminAttentionScreen.tsx draws
 * them). The owner is the only admin; a push "Brazos needs you" brings him here.
 *
 * The app holds no table from `code` or `finish` to anything. A line's only buttons are its own
 * `decisions` ('customer', 'worker'); each runs rpc('admin_decide_issue') behind a confirmation, and
 * a value this build does not know is not drawn.
 */

/** One line, as the B6 contract gives it (the server's column order). */
export type AttentionLine = {
  key: string;
  what: string;
  reason: string;
  since: string;
  overdue: boolean;
  cents: number | null;
  detail: string | null;
  code: string;
  finish: string;
  payment_id: string | null;
  job_id: string | null;
  decisions: string[];
  job_title: string | null;
  customer_first_name: string | null;
  worker_first_name: string | null;
  report_reason: string | null;
  report_details: string | null;
  report_at: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  worker_phone: string | null;
  worker_email: string | null;
  arrived_at: string | null;
  work_started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  decision_note: string | null;
};

export type AttentionDecision = 'customer' | 'worker';

type RpcError = { message?: string | null; code?: string | null; details?: string | null };

/**
 * What the owner reads when a call fails. Only a sentence the server raised itself (SQLSTATE
 * P0001, the contract's one error code) is shown unchanged. Every other failure goes through
 * userMessage() like everywhere else: offline, an app/database skew, no access, and the engine's
 * own text that PostgREST also answers with HTTP 400 (a check constraint, a bad uuid), which must
 * never reach a screen.
 */
export function serverSentence(error: RpcError): string {
  const message = typeof error.message === 'string' ? error.message : '';
  if (error.code === 'P0001' && message.trim() !== '') return message;
  return userMessage(error);
}

/** The list, in the server's order. */
export async function fetchAttention(): Promise<{ data: AttentionLine[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_attention');
  if (error) return { data: [], error: serverSentence(error) };
  return { data: (data ?? []) as AttentionLine[], error: null };
}

/**
 * The owner's decision on an issue report. The list is read again after it, either way.
 * `unanswered`: Brazos never answered (no connection, the client's timeout; status 0 is a request
 * with no answer), so the decision may have been made on the server. UA/UB-01: so is an answer of
 * 500 or more (a gateway's 502, 503 or 504 can come after the decision was committed). Only a 4xx
 * answer is a refusal.
 */
export async function decideIssue(
  jobId: string,
  side: AttentionDecision
): Promise<{ error: string | null; unanswered?: boolean }> {
  const { error, status } = await supabase.rpc('admin_decide_issue', { p_job_id: jobId, p_in_favour_of: side });
  if (!error) return { error: null };
  if (isNetworkError(error) || status === 0 || status >= 500) return { error: userMessage(error), unanswered: true };
  return { error: serverSentence(error) };
}

// ---------------------------------------------------------------- the words

export const ATTENTION_EMPTY = { title: 'All Clear', body: 'Nothing needs you right now.' } as const;

/** B7 (R1): a decision Brazos never answered. It may be done: the owner reloads before deciding again. */
export const DECISION_UNANSWERED = {
  title: 'Not sure it went through',
  message: 'Brazos did not answer. The decision may already be done. Reload the list before you decide again.',
} as const;

const DECISIONS: Record<
  AttentionDecision,
  { label: string; failed: string; confirm: { title: string; message: string; confirmText: string } }
> = {
  customer: {
    label: 'Refund Customer',
    failed: 'Could not refund',
    confirm: {
      title: 'Refund the customer?',
      message: 'This sends the payment back to the customer. You cannot undo it.',
      confirmText: 'Refund',
    },
  },
  worker: {
    label: 'Pay Worker',
    failed: 'Could not pay',
    confirm: {
      title: 'Pay the worker?',
      message: 'This releases the payment to the worker. You cannot undo it.',
      confirmText: 'Pay',
    },
  },
};

function isDecision(value: unknown): value is AttentionDecision {
  return value === 'customer' || value === 'worker';
}

/** "Wed, Sep 30 at 9:30 AM" (lib/time's day and clock), or null for no time. */
export function dayTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${formatDay(date)} at ${formatClock(date)}`;
}

export type AttentionPerson = { role: 'Customer' | 'Worker'; name: string | null; phone: string | null; email: string | null };

/** Everything a card shows, in the order it shows it. */
export type AttentionCardView = {
  /** The server's `what`, in Title Case. */
  label: string;
  overdue: boolean;
  /** The server's sentence, never cut. */
  reason: string;
  facts: string[];
  /** Only on a line with a decision. */
  people: AttentionPerson[] | null;
  report: { label: string | null; details: string | null; at: string | null } | null;
  times: { label: string; value: string }[] | null;
  note: string | null;
  buttons: { side: AttentionDecision; label: string }[];
  details: { detail: string; code: string } | null;
};

export function attentionCard(line: AttentionLine): AttentionCardView {
  const decisions = Array.isArray(line.decisions) ? line.decisions : [];
  const deciding = decisions.length > 0;

  const facts: string[] = [];
  if (line.job_title) facts.push(`Job: ${line.job_title}`);
  if (typeof line.cents === 'number') facts.push(`Amount: ${formatBudget(line.cents)}`);
  const since = dayTime(line.since);
  if (since) facts.push(`Since ${since}`);

  const times: { label: string; value: string }[] = [
    { label: 'Arrived', value: dayTime(line.arrived_at) ?? 'Not recorded' },
    { label: 'Started', value: dayTime(line.work_started_at) ?? 'Not recorded' },
  ];
  const finished = dayTime(line.completed_at);
  if (finished) times.push({ label: 'Finished', value: finished });
  const cancelled = dayTime(line.cancelled_at);
  if (cancelled) times.push({ label: 'Cancelled', value: cancelled });

  const sides = decisions.filter(isDecision).filter((side, index, all) => all.indexOf(side) === index);

  return {
    label: titleCase(line.what),
    overdue: line.overdue === true,
    reason: line.reason,
    facts,
    people: deciding
      ? [
          { role: 'Customer', name: line.customer_first_name, phone: line.customer_phone, email: line.customer_email },
          { role: 'Worker', name: line.worker_first_name, phone: line.worker_phone, email: line.worker_email },
        ]
      : null,
    report:
      deciding && line.report_reason
        ? {
            // The same words the customer's report screen shows (lib/disputes.ts).
            label: DISPUTE_REASON_LABELS[line.report_reason as DisputeReason] ?? null,
            details: line.report_details,
            at: dayTime(line.report_at),
          }
        : null,
    times: deciding ? times : null,
    note: line.decision_note,
    // A decision needs its job; a line without one draws no button.
    buttons: line.job_id ? sides.map((side) => ({ side, label: DECISIONS[side].label })) : [],
    details: line.detail ? { detail: line.detail, code: line.code } : null,
  };
}

/**
 * B7 (R2): ONE DECISION PER CARD. A hold per line key, taken at the tap, before the confirmation
 * opens, and given back only after the list was read again (or at "Cancel"). While a card's key is
 * held, a tap on either of its buttons does nothing (no second confirmation can queue: ConfirmHost
 * queues them), and `onChange` turns both buttons off.
 */
export type DecisionGuard = {
  /** False when the key is already held: the tap does nothing. */
  take: (key: string) => boolean;
  release: (key: string) => void;
};

export function decisionGuard(onChange: (key: string, held: boolean) => void): DecisionGuard {
  const held = new Set<string>();
  return {
    take(key) {
      if (held.has(key)) return false;
      held.add(key);
      onChange(key, true);
      return true;
    },
    release(key) {
      if (!held.delete(key)) return;
      onChange(key, false);
    },
  };
}

/**
 * One decision: the confirmation (lib/dialog), the call, then the list read again. A refusal shows
 * the server's sentence unchanged before the list is read again. A call Brazos never answered (or
 * one that threw) is NOT a refusal: the money may have moved, so the owner reads "Not sure it went
 * through", never "Could not refund" or "Could not pay". The card's hold (`guard`) is taken before
 * anything else, synchronously at the tap, and kept until the list was read again.
 */
export async function runDecision(
  line: AttentionLine,
  side: AttentionDecision,
  io: {
    confirm: (options: { title: string; message: string; confirmText: string }) => Promise<boolean>;
    decide: (jobId: string, side: AttentionDecision) => Promise<{ error: string | null; unanswered?: boolean }>;
    alert: (title: string, message: string) => Promise<void>;
    reload: () => Promise<void>;
    guard: DecisionGuard;
  }
): Promise<void> {
  const jobId = line.job_id;
  if (!jobId) return;
  // Before the first await: a second tap on this card, even in the same frame, finds the hold.
  if (!io.guard.take(line.key)) return;
  try {
    const ok = await io.confirm(DECISIONS[side].confirm);
    if (!ok) return;
    let outcome: { error: string | null; unanswered?: boolean };
    try {
      outcome = await io.decide(jobId, side);
    } catch {
      outcome = { error: null, unanswered: true };
    }
    if (outcome.unanswered) await io.alert(DECISION_UNANSWERED.title, DECISION_UNANSWERED.message);
    else if (outcome.error) await io.alert(DECISIONS[side].failed, outcome.error);
    await io.reload();
  } finally {
    io.guard.release(line.key);
  }
}
