/**
 * THE PURE HALF of per-user conversation state — every rule, no client.
 *
 * WHY THIS FILE IS SEPARATE FROM lib/conversationStates.ts. A module that
 * imports `./supabase` cannot be loaded by `node --test` at all (Node's ESM
 * resolver will not take an extensionless relative specifier), so any rule
 * living beside a Supabase call is reachable only by reading its source. The
 * rules here are the ones a wrong character silently corrupts — a `<` where a
 * `<=` belongs, an `any` where an `every` belongs — so they are stated where a
 * test can RUN them. lib/conversationStates.ts owns the reads and the writes;
 * this file owns the arithmetic, and lib/conversations.ts re-exports the
 * watermark rule so both surfaces that need it have one import.
 *
 * Everything in here is total and side-effect free. Nothing in here may grow
 * an import that is not a type.
 */

/** One row of `conversation_states` (phase77), own-rows-only by RLS. */
export type ConversationState = {
  /** Set for a job thread's state, null for a direct thread's. */
  job_id: string | null;
  direct_thread_id: string | null;
  hidden: boolean;
  archived: boolean;
  /** Messages at or before this instant are out of this user's copy. */
  cleared_before: string | null;
  /** Out of this user's inbox while nothing newer than the watermark exists. */
  deleted: boolean;
};

// ---------------------------------------------------------------------------
// THE CLEAR / DELETE WATERMARK — ONE RULE, ONE IMPLEMENTATION (phase77, S-2).
//
// `cleared_before` is the instant at or before which a conversation's messages
// are out of THIS user's copy. Clear sets it; Delete sets it and also sets
// `deleted`, which takes the row out of the inbox for as long as nothing newer
// than the watermark exists. Nothing ever un-sets anything: the next message is
// newer than the watermark, so the thread reopens BY DERIVATION.
//
// WHY THE RULE IS WRITTEN ONCE. Two surfaces read it — the inbox deciding
// whether a row is still in the list, and the chat timeline deciding which
// messages are still in the thread — and they must agree to the character. A
// second copy of the comparison is the whole bug class this helper exists to
// prevent (the P3-31 discipline), so `clearedBy()` is the only place it is
// written and the two wrappers below are the only readings of it.
//
// COMPARISON IS ON ISO-8601 STRINGS, the same choice coveredByReadWatermark()
// makes and for the same reason: PostgREST hands back UTC timestamps at one
// precision, and those sort lexicographically. AT the watermark is COVERED —
// `<=`, not `<` — because the server takes now() at or after the last message
// the user meant to clear, and a `<` would leave exactly that message, the one
// they were looking at when they tapped, on screen.
// ---------------------------------------------------------------------------

/** The only two fields of a conversation state the visibility rule reads. */
export type ClearWatermark = {
  cleared_before?: string | null;
  deleted?: boolean;
};

/**
 * Is `instant` at or before this user's clear watermark?
 *
 * A missing state, or a state with no watermark, covers nothing — a
 * conversation nobody has cleared is entirely visible.
 */
export function clearedBy(
  instant: string,
  state: ClearWatermark | null | undefined
): boolean {
  const mark = state?.cleared_before;
  if (!mark) return false;
  return instant <= mark;
}

/**
 * The messages still in this user's copy of a conversation.
 *
 * THE STATE IS RESOLVED PER MESSAGE, not passed once, because ONE conversation
 * is several threads folded into a single chronological timeline (ChatScreen's
 * `targets`) and each thread carries its own watermark. Clearing a pair's
 * direct thread must not empty the job thread interleaved with it.
 */
export function visibleMessages<T extends { created_at: string }>(
  messages: readonly T[],
  stateFor: (message: T) => ClearWatermark | null | undefined
): T[] {
  return messages.filter((message) => !clearedBy(message.created_at, stateFor(message)));
}

/**
 * Is this conversation out of the inbox right now?
 *
 * Deleted AND quiet since — the moment a message newer than the watermark
 * arrives the answer flips back on its own, which is why `deleted` is never
 * written false anywhere in this app.
 */
export function conversationHiddenByDelete(
  lastMessageAt: string,
  state: ClearWatermark | null | undefined
): boolean {
  return !!state?.deleted && clearedBy(lastMessageAt, state);
}

// ---------------------------------------------------------------------------
// THE FOLD — per-thread rows into the per-person state the inbox renders.
// ---------------------------------------------------------------------------

/**
 * The `job:`/`direct:` key for a state row.
 *
 * THE SAME KEY the conversations themselves use (conversationKey) and the same
 * one chatTargetKey builds, because that is what lets the client join these
 * rows onto the inbox the way it already joins message_reads — the phase77
 * view deliberately does not carry them, since hidden and archived rows must
 * still be DELIVERED to the Face-ID list and the Archived pill.
 */
export function conversationStateKey(
  state: Pick<ConversationState, 'job_id' | 'direct_thread_id'>
): string {
  return state.job_id ? `job:${state.job_id}` : `direct:${state.direct_thread_id}`;
}

/** State rows by conversation key, for the join. */
export function indexConversationStates(
  rows: readonly ConversationState[]
): Record<string, ConversationState> {
  const map: Record<string, ConversationState> = {};
  for (const row of rows) map[conversationStateKey(row)] = row;
  return map;
}

/** One thread of a conversation, as the fold needs to see it. */
export type FoldableThread = {
  /** conversationKey() of the thread. */
  key: string;
  /** `conversations.last_message_at` for that thread. */
  lastMessageAt: string;
};

/** A whole conversation's state, folded from the threads underneath it. */
export type FoldedConversationState = {
  hidden: boolean;
  archived: boolean;
  /** Nothing left to preview: every thread's newest message is cleared. */
  cleared: boolean;
  /** Out of the inbox: every thread is deleted AND quiet since. */
  deleted: boolean;
};

export const NO_CONVERSATION_STATE: FoldedConversationState = {
  hidden: false,
  archived: false,
  cleared: false,
  deleted: false,
};

/**
 * Fold every thread's state into the one conversation's state.
 *
 * A BRAZOS inbox row is a PERSON, not a thread — a pair have exactly one
 * conversation and their job threads and pair thread are plumbing underneath
 * it (groupThreadsByPerson). The state rows are per-thread because that is
 * what the key can be, so this is the one bridge between the two and "is this
 * conversation archived" has a single answer wherever it is asked.
 *
 * EVERY flag is ALL, never ANY, and that asymmetry is the point: the actions
 * apply to every thread of a conversation at once, so "all of them" is exactly
 * the state an action just produced. Read the other way, one archived job
 * thread would take a person's row out of the inbox while their other thread
 * was still receiving messages — the row would go quiet with live conversation
 * behind it.
 *
 * A conversation with no threads folds to no state rather than to a vacuous
 * true: `[].every()` is true, and "every thread of nothing is archived" is not
 * a statement this inbox should act on.
 */
export function foldConversationStates(
  threads: readonly FoldableThread[],
  byKey: Record<string, ConversationState | undefined>
): FoldedConversationState {
  if (threads.length === 0) return NO_CONVERSATION_STATE;

  const seen = threads.map((thread) => ({
    state: byKey[thread.key],
    lastMessageAt: thread.lastMessageAt,
  }));

  return {
    hidden: seen.every((t) => !!t.state?.hidden),
    archived: seen.every((t) => !!t.state?.archived),
    cleared: seen.every((t) => clearedBy(t.lastMessageAt, t.state)),
    deleted: seen.every((t) => conversationHiddenByDelete(t.lastMessageAt, t.state)),
  };
}

// ---------------------------------------------------------------------------
// THE TIMED BLOCK'S DURATIONS (phase77, S-3).
// ---------------------------------------------------------------------------

/** How long a timed block lasts, and what the sheet calls it. */
export type BlockDuration = { key: string; label: string; ms: number };

const HOUR_MS = 60 * 60 * 1000;

/**
 * The three offered durations.
 *
 * Computed CLIENT-SIDE as `now + interval` and sent as an absolute instant,
 * because `set_block` takes a timestamp rather than an interval — and it
 * rejects anything already in the past, so a badly skewed clock fails loudly
 * instead of writing a block that was over before it started.
 */
export const BLOCK_DURATIONS: BlockDuration[] = [
  { key: 'block-1h', label: '1 hour', ms: HOUR_MS },
  { key: 'block-24h', label: '24 hours', ms: 24 * HOUR_MS },
  { key: 'block-7d', label: '7 days', ms: 7 * 24 * HOUR_MS },
];

/** `now + duration`, as the absolute instant set_block stores. */
export function blockExpiryFrom(now: number, ms: number): string {
  return new Date(now + ms).toISOString();
}

/**
 * The read position that means "this thread is entirely unread".
 *
 * A direct thread expresses that as NULL, through set_direct_thread_read_at.
 * A job thread cannot: `message_reads` stores one row per user per job and the
 * client writes it directly, so the equivalent is a watermark before every
 * message that could exist. The epoch is that watermark, and it compares
 * correctly against the ISO-8601 strings the unread derivation already uses.
 */
export const FULLY_UNREAD_AT = new Date(0).toISOString();
