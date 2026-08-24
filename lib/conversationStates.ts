import type { ChatTarget } from './messages';
import { supabase } from './supabase';

/**
 * PER-USER, PER-CONVERSATION INBOX STATE — the reads and the writes
 * (supabase/phase77_conversation_features.sql, S-1 / S-2 / S-3 / S-5).
 *
 * WHAT THIS FILE IS. The client half of `conversation_states`, plus every
 * phase77 write path: it is the one place in the app that names
 * `set_conversation_state`, `set_block` and `set_direct_thread_read_at`. The
 * RULES it applies live next door in lib/conversationVisibility.ts, which
 * imports nothing and is therefore reachable by the tests; this file is the
 * part that needs a client and so can only be read.
 *
 * WHY THE CLIENT NEVER WRITES THE TABLE DIRECTLY. It is keyed on
 * `job_id XOR direct_thread_id` under two PARTIAL unique indexes, and
 * PostgREST's `onConflict` cannot name a partial index's predicate — the
 * phase36 `message_reads` lesson, restated by the migration. So the table
 * carries a SELECT-only own-rows policy with every write grant revoked, and
 * `set_conversation_state()` owns every write. Nothing here may become an
 * `.upsert()`.
 */

export {
  BLOCK_DURATIONS,
  FULLY_UNREAD_AT,
  NO_CONVERSATION_STATE,
  blockExpiryFrom,
  conversationStateKey,
  foldConversationStates,
  indexConversationStates,
  type BlockDuration,
  type ConversationState,
  type FoldableThread,
  type FoldedConversationState,
} from './conversationVisibility';

import { FULLY_UNREAD_AT, type ConversationState } from './conversationVisibility';

// Explicit projection, never `select('*')` — the same discipline
// CONVERSATION_COLUMNS follows, and for the same reason: a widened table must
// not silently start shipping new columns to every inbox load.
const CONVERSATION_STATE_COLUMNS =
  'job_id, direct_thread_id, hidden, archived, cleared_before, deleted';

/** Every conversation state this user owns. RLS scopes it to their own rows. */
export async function fetchMyConversationStates(userId: string) {
  const { data, error } = await supabase
    .from('conversation_states')
    .select(CONVERSATION_STATE_COLUMNS)
    .eq('user_id', userId);

  return { data: (data ?? []) as ConversationState[], error };
}

// ---------------------------------------------------------------------------
// THE WRITES. Three RPCs, and the one non-RPC path phase77 deliberately left
// alone (job-thread mark-as-unread, which the existing message_reads policies
// already allow).
// ---------------------------------------------------------------------------

/**
 * What to change about one conversation's state.
 *
 * `hidden` / `archived` PATCH: undefined leaves the flag alone, matching the
 * RPC's `coalesce(p_hidden, cs.hidden)`. `clear` and `delete` are events, not
 * flags — they set the shared watermark, and `delete` additionally sets
 * `deleted`. Neither can be undone from here: the migration never un-sets
 * `deleted`, and this file must never grow a call that tries.
 */
export type ConversationStatePatch = {
  hidden?: boolean;
  archived?: boolean;
  clear?: boolean;
  delete?: boolean;
};

/**
 * Set one thread's state. BOTH thread kinds, one call — the RPC takes
 * `p_job_id` XOR `p_direct_thread_id` and resolves the caller's membership
 * server-side, so a thread the user is not party to raises rather than writes.
 */
export async function setConversationState(
  target: ChatTarget,
  patch: ConversationStatePatch
) {
  const { error } = await supabase.rpc('set_conversation_state', {
    p_job_id: target.jobId ?? null,
    p_direct_thread_id: target.directThreadId ?? null,
    p_hidden: patch.hidden ?? null,
    p_archived: patch.archived ?? null,
    p_clear: patch.clear ?? false,
    p_delete: patch.delete ?? false,
  });
  return { error };
}

/**
 * Set the state of EVERY thread a conversation is made of.
 *
 * This is the shape every inbox action actually wants. A row is a person, and
 * archiving "them" has to reach their job threads and their pair thread alike
 * or the action half-lands — the failure mode where a feature works on one
 * thread kind and silently no-ops on the other.
 *
 * The FIRST error is reported and the rest still run: the flags are idempotent
 * and the watermark is monotone server-side, so a partially applied state
 * self-corrects on the next attempt, whereas stopping at the first failure
 * would leave the untouched threads in a state the user can neither see nor
 * retry.
 */
export async function setConversationStateForAll(
  targets: readonly ChatTarget[],
  patch: ConversationStatePatch
) {
  const results = await Promise.all(
    targets.map((target) => setConversationState(target, patch))
  );
  return { error: results.find((r) => r.error)?.error ?? null };
}

/**
 * Create or re-time this user's block on someone.
 *
 * `expiresAt` null means PERMANENT — but the permanent block is not routed
 * here: it stays on the existing `blocks` insert in lib/moderation.ts, exactly
 * where it has always been, and unblocking stays that file's delete. This
 * exists for the TIMED variant, which needs the definer path because `blocks`
 * has no UPDATE policy and no UPDATE grant (phase76) and so cannot move an
 * existing row's expiry from the client at all.
 */
export async function setBlockUntil(otherId: string, expiresAt: string | null) {
  const { error } = await supabase.rpc('set_block', {
    p_blocked: otherId,
    p_expires_at: expiresAt,
  });
  return { error };
}

/**
 * Move this user's own read position on a direct thread, to any past instant
 * or to NULL for "never read".
 *
 * `mark_direct_thread_read()` is untouched and still owns the hot path; this
 * is its explicit-timestamp sibling, which is what makes a direct thread
 * rewindable at all (phase77, S-5). The counterparty's column is structurally
 * unreachable — the RPC resolves which column to write from auth.uid().
 */
export async function setDirectThreadReadAt(threadId: string, readAt: string | null) {
  const { error } = await supabase.rpc('set_direct_thread_read_at', {
    p_thread_id: threadId,
    p_read_at: readAt,
  });
  return { error };
}

/**
 * Rewind one thread's read position so it returns to the unread state.
 *
 * BOTH KINDS, BY DIFFERENT ROUTES, and phase77 is why the routes differ:
 *
 *   job threads     the EXISTING upsert, unchanged. `message_reads_update_own`
 *                   constrains the ROW (`user_id = auth.uid()`) and never the
 *                   VALUE, so writing an earlier last_read_at has always been
 *                   allowed — nothing new was needed and nothing new is used.
 *   direct threads  set_direct_thread_read_at(), because the only other writer
 *                   hard-codes now() and a table with no INSERT or UPDATE
 *                   policy cannot be written any other way.
 */
export async function markConversationUnread(target: ChatTarget, userId: string) {
  if (!target.jobId) {
    // ChatTarget is a union whose arms are distinguished by which key is
    // present, and a falsy `jobId` does not narrow it — the same cast
    // conversationTarget() and markConversationRead() already make.
    return setDirectThreadReadAt(target.directThreadId as string, null);
  }

  const { error } = await supabase.from('message_reads').upsert(
    { job_id: target.jobId, user_id: userId, last_read_at: FULLY_UNREAD_AT },
    { onConflict: 'user_id,job_id' }
  );
  return { error };
}

/** Rewind every thread of a conversation, so the one inbox row goes unread. */
export async function markConversationUnreadForAll(
  targets: readonly ChatTarget[],
  userId: string
) {
  const results = await Promise.all(
    targets.map((target) => markConversationUnread(target, userId))
  );
  return { error: results.find((r) => r.error)?.error ?? null };
}
