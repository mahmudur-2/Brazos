import type { ChatTarget } from './messages';

/**
 * THE conversation identity and send-routing rule.
 *
 * A customer and a worker have exactly ONE conversation, ever. Jobs are
 * context inside that conversation, not separate rooms, and the inbox may
 * never show two rows for the same person.
 *
 * This is a PRESENTATION-LAYER collapse. Underneath, message rows still key on
 * `job_id` / `direct_thread_id` exactly as they always have — phase66's RLS
 * lock, the offer events and the chat-media storage paths all depend on that,
 * and none of it moves. What this module owns is (a) folding the threads a
 * pair share into one conversation and (b) deciding which of those threads a
 * new message goes to. Everything downstream — send routing, the inbox
 * subtitle, attachment availability, quick replies — reads the answer from
 * here rather than deciding for itself, so the inbox can never display one job
 * while sends route to another.
 *
 * Pure by design: no runtime imports, so the test suite can execute it
 * directly (the lib/jobLifecycle.ts and lib/errorMessage.ts precedent).
 *
 * -----------------------------------------------------------------------
 * THE AUTHORITATIVE RESOLVER CONTRACT (signed off 2026-08-13, verbatim)
 * -----------------------------------------------------------------------
 *
 *   Among jobs with that counterparty in assigned/in_progress:
 *     1. Prefer the job with the greatest conversations.last_message_at.
 *     2. If the winner from (1) has NO messages at all (last_message_at
 *        absent) and another active job DOES have messages, that is
 *        acceptable only if the message-less job is the more recently
 *        CREATED job. A brand-new job with no chat yet must beat an older
 *        job that is still being chatted in — otherwise the first message
 *        about new work routes into the old job.
 *     3. Ties on the deciding value break by ascending job id.
 *   If no active job exists, the pair thread.
 *
 *   Restated as one rule: newer work wins over stale chatter; among jobs
 *   that both have activity, most recent activity wins; deterministic
 *   tiebreak by ascending job id.
 *
 * -----------------------------------------------------------------------
 *
 * Note on (2): the comparison there is created_at against created_at. That is
 * what makes a brand-new silent job beat an old job whose last message is
 * NEWER than the new job's creation — the case the rule exists for. Comparing
 * the silent job's creation against the chatty job's last message instead
 * would hand the conversation straight back to the old job, which is the
 * defect being prevented.
 */

/**
 * One job a pair share that is still being worked — the resolver's candidate.
 *
 * `lastMessageAt` is THE canonical activity timestamp: the job's own
 * `conversations.last_message_at`, i.e. the newest message in that job's
 * thread. It is null when the job thread has no messages yet, which is the
 * normal state straight after a hire — offer, counter and accept cards live in
 * the pair's direct thread (phase61), not in the job thread. No new column and
 * no new timestamp is invented for this.
 */
export type ActiveJobCandidate = {
  id: string;
  title: string;
  /** `jobs.created_at`. */
  createdAt: string;
  /** `conversations.last_message_at` for THIS job's thread, or null. */
  lastMessageAt: string | null;
};

export type ResolvedConversation = {
  /**
   * The thread a new message goes to. Null only when the pair have no thread
   * at all — no active job and no direct thread — which is not a conversation
   * yet.
   */
  target: ChatTarget | null;
  /** The active job the conversation is about, or null on the pair thread. */
  activeJob: ActiveJobCandidate | null;
};

/** Milliseconds for an ISO timestamp; missing/unparseable sorts oldest. */
function timeOf(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** Rule 3 — the deterministic tiebreak, ascending job id. */
function lowerId(a: ActiveJobCandidate, b: ActiveJobCandidate): ActiveJobCandidate {
  return a.id <= b.id ? a : b;
}

/**
 * The candidate with the greatest `value`, ties broken by ascending id.
 * A NaN difference (two unparseable timestamps) falls to the tiebreak too,
 * so the answer is total regardless of the data.
 */
function bestBy(
  jobs: readonly ActiveJobCandidate[],
  value: (job: ActiveJobCandidate) => number
): ActiveJobCandidate {
  return jobs.reduce((best, job) => {
    const difference = value(job) - value(best);
    if (difference > 0) return job;
    if (difference < 0) return best;
    return lowerId(best, job);
  });
}

/** The active job a conversation is about, per the contract above. */
export function resolveActiveJob(
  jobs: readonly ActiveJobCandidate[]
): ActiveJobCandidate | null {
  if (jobs.length === 0) return null;

  const chatted = jobs.filter((job) => job.lastMessageAt !== null);
  const silent = jobs.filter((job) => job.lastMessageAt === null);

  // Rule 1 on its own.
  if (silent.length === 0) return bestBy(chatted, (job) => timeOf(job.lastMessageAt));
  // Nothing has been said about any of them: newer work wins.
  if (chatted.length === 0) return bestBy(silent, (job) => timeOf(job.createdAt));

  // Rule 2 — the newest silent job takes it only if it is the more recently
  // CREATED of the two.
  const newestSilent = bestBy(silent, (job) => timeOf(job.createdAt));
  const liveliest = bestBy(chatted, (job) => timeOf(job.lastMessageAt));
  const difference = timeOf(newestSilent.createdAt) - timeOf(liveliest.createdAt);
  if (difference > 0) return newestSilent;
  if (difference < 0) return liveliest;
  return lowerId(newestSilent, liveliest);
}

/**
 * THE send target for a conversation: the active job's thread, or the pair
 * thread when there is no active job.
 *
 * `messaging_unlocked()` is asked about whatever this returns and nowhere
 * else — the rule is never re-derived client-side.
 */
export function resolveConversation(
  activeJobs: readonly ActiveJobCandidate[],
  directThreadId: string | null
): ResolvedConversation {
  const activeJob = resolveActiveJob(activeJobs);
  if (activeJob) return { target: { jobId: activeJob.id }, activeJob };
  return { target: directThreadId ? { directThreadId } : null, activeJob: null };
}

/** What the grouper needs to know about one underlying thread. */
export type ThreadSummary = {
  counterpartyId: string;
  jobId: string | null;
  directThreadId: string | null;
  /** `conversations.last_message_at`. */
  lastMessageAt: string;
};

/** Every thread a pair share, as the one conversation they actually are. */
export type PersonConversation<T> = {
  counterpartyId: string;
  /** Every underlying thread with this person. */
  threads: T[];
  /** The thread carrying the most recent message across all of them. */
  latest: T;
  /** The pair's direct thread, when one of the threads is it. */
  directThreadId: string | null;
};

/**
 * Fold threads into one conversation per person, newest activity first.
 *
 * Generic over the caller's row type so the inbox keeps its full
 * `Conversation` rows (preview, read state, reactions) instead of being handed
 * back a lossy projection.
 */
export function groupThreadsByPerson<T>(
  threads: readonly T[],
  describe: (thread: T) => ThreadSummary
): PersonConversation<T>[] {
  const byPerson = new Map<string, PersonConversation<T>>();

  for (const thread of threads) {
    const summary = describe(thread);
    const existing = byPerson.get(summary.counterpartyId);

    if (!existing) {
      byPerson.set(summary.counterpartyId, {
        counterpartyId: summary.counterpartyId,
        threads: [thread],
        latest: thread,
        directThreadId: summary.directThreadId,
      });
      continue;
    }

    existing.threads.push(thread);
    if (summary.directThreadId) existing.directThreadId = summary.directThreadId;
    // The preview is the most recent message across ALL of them, whichever
    // thread it happens to be in. Computed rather than assumed from input
    // order, so a caller that sorts differently still gets the right one.
    if (timeOf(summary.lastMessageAt) > timeOf(describe(existing.latest).lastMessageAt)) {
      existing.latest = thread;
    }
  }

  return [...byPerson.values()].sort((a, b) => {
    const difference =
      timeOf(describe(b.latest).lastMessageAt) - timeOf(describe(a.latest).lastMessageAt);
    if (difference !== 0) return difference;
    return a.counterpartyId < b.counterpartyId ? -1 : 1;
  });
}
