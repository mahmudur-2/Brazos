import {
  deriveJobLifecycle,
  myJobsNextAction,
  releaseDeadlineMs,
  type JobLifecycleState,
} from './jobLifecycle';
import type { Job } from './jobs';
import type { PaymentStatusSummary } from './payments';

/**
 * a2 (2026-09-05) — WHAT NEEDS THE CUSTOMER'S MOVE, on customer Home.
 *
 * docs/DECISIONS.md 2026-09-05 entry (4): after the first post, every decision
 * that produces a successful job — respond to bids, protect the payment,
 * approve the finished work — happens on a surface the customer cannot see
 * from the bar. Home now lists the posted jobs waiting on the customer.
 *
 * NO NEW DATA. Every fact here already arrives in one batched read through
 * hooks/useMyJobsHub.ts, and the LINE each item carries is the hub card's own
 * next-action line from myJobsNextAction() — P3-31: one implementation of the
 * lifecycle derivation and one of its copy, called twice, never rewritten
 * here. This module owns exactly one new thing: WHICH posted jobs are a MOVE
 * and in what order.
 *
 * Pure and injection-free — the caller hands in the hub's four maps — so the
 * node suite executes the rule rather than reading it as prose.
 */

export type AttentionItem = { job: Job; state: JobLifecycleState; line: string };

/** How many items Home draws. The rest are counted behind "See all". */
export const ATTENTION_CAP = 3;

/**
 * The urgency order, rank 0 first — money the customer is holding up, then
 * a decision, then a worker in motion, then the tail of a finished job.
 * `null` means the job is NOT the customer's move and never reaches Home.
 */
function rankOf(state: JobLifecycleState, job: Job, reviewedByMe: boolean): number | null {
  switch (state) {
    case 'awaiting_approval':
      // Finished work waiting on the approval that releases the money.
      return 0;
    case 'pending_payment':
      // A hire waiting on payment protection: the worker cannot start.
      return 1;
    case 'open':
      // Bids to review. Zero bids is a WAIT, not a move — there is nothing to
      // do but wait, and the hub already says "Awaiting bids".
      return job.bid_count > 0 ? 2 : null;
    case 'arrived':
      return 3;
    case 'en_route':
      // A worker on the way. Arrived outranks en route: someone is at the door.
      return 4;
    case 'completed':
      // A review to leave. Once written the job is closed and nothing is owed.
      return reviewedByMe ? null : 5;
    case 'draft':
      // The customer's own unpublished wizard draft is device-local and never
      // a jobs row (lib/postJobDraft.ts). The `draft` ROWS that do exist are
      // the direct-offer jobs create_offer() writes, so a "Finish posting"
      // prompt on one of those would be wrong.
      return null;
    case 'confirmed':
    case 'in_progress':
      // The worker's move — mark en route, mark complete. Not the customer's.
      return null;
    case 'disputed':
      // The customer already acted by reporting the issue; the hub's Review
      // tab carries it while release stays frozen.
      return null;
    case 'cancelled':
      // Closed.
      return null;
    default:
      // 'unknown' — a status this client cannot classify, including the
      // poisoned value a FAILED dispute read derives. Omit rather than
      // prompt: Home must never invent a move out of a fact it does not have.
      return null;
  }
}

/**
 * 2026-09-26 (the refresh, audit M-15) — WHAT NEEDS THE WORKER'S MOVE, on
 * Worker Home. The same shape as the customer's rule above, from the same
 * batched hub read: an issue on one of the worker's jobs first, then the
 * worker's own next step on a hired job (head out, arrive and start, finish),
 * then a review to leave. Waiting on the customer — payment protection, the
 * approval clock — is not the worker's move and never reaches the strip.
 */
function workerRankOf(state: JobLifecycleState, reviewedByMe: boolean): number | null {
  switch (state) {
    case 'disputed':
      return 0;
    case 'confirmed':
      return 1;
    case 'en_route':
    case 'arrived':
      return 2;
    case 'in_progress':
      return 3;
    case 'completed':
      return reviewedByMe ? null : 4;
    default:
      // pending_payment and awaiting_approval wait on the customer; open,
      // draft and cancelled are not a hired job; 'unknown' is never a prompt.
      return null;
  }
}

type RankInput = {
  payments: Record<string, PaymentStatusSummary>;
  openDisputeJobIds: ReadonlySet<string>;
  reviewedJobIds: ReadonlySet<string>;
  nowMs?: number;
};

/**
 * The one ranking loop both lists share: derive each job once, rank it with
 * the perspective's rule, carry the hub card's own next-action line, and
 * order by rank, then newest, then id — so two renders of the same data draw
 * the same order.
 */
function rankJobs(
  jobs: readonly Job[],
  perspective: 'customer' | 'worker',
  rank: (state: JobLifecycleState, job: Job, reviewedByMe: boolean) => number | null,
  input: RankInput
): AttentionItem[] {
  const nowMs = input.nowMs ?? Date.now();
  const ranked: { item: AttentionItem; rank: number; postedMs: number }[] = [];

  for (const job of jobs) {
    const reviewedByMe = input.reviewedJobIds.has(job.id);
    const state = deriveJobLifecycle(
      {
        job,
        payment: input.payments[job.id] ?? null,
        hasOpenDispute: input.openDisputeJobIds.has(job.id),
      },
      nowMs
    );
    const r = rank(state, job, reviewedByMe);
    if (r === null) continue;
    const postedMs = Date.parse(job.created_at);
    ranked.push({
      rank: r,
      postedMs: Number.isFinite(postedMs) ? postedMs : 0,
      item: {
        job,
        state,
        line: myJobsNextAction({
          perspective,
          state,
          bidCount: job.bid_count,
          reviewedByMe,
          releaseDeadline: releaseDeadlineMs(job),
          nowMs,
        }),
      },
    });
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.postedMs !== b.postedMs) return b.postedMs - a.postedMs;
    if (a.item.job.id < b.item.job.id) return -1;
    return a.item.job.id > b.item.job.id ? 1 : 0;
  });

  return ranked.map((entry) => entry.item);
}

/**
 * Every posted job that needs the customer's move, most urgent first. Returns
 * ALL of them: the caller slices to ATTENTION_CAP and counts the remainder,
 * so "See all" can be shown from the true total.
 *
 * Within a rank the most recently posted job comes first, ties broken by id
 * ascending, so two renders of the same data draw the same order.
 */
export function attentionItems(input: {
  posted: readonly Job[];
} & RankInput): AttentionItem[] {
  return rankJobs(input.posted, 'customer', rankOf, input);
}

/** M-15 — every hired job that needs the worker's move, most urgent first. */
export function workerAttentionItems(input: {
  working: readonly Job[];
} & RankInput): AttentionItem[] {
  return rankJobs(input.working, 'worker', (state, _job, reviewedByMe) => workerRankOf(state, reviewedByMe), input);
}
