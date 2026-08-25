import { supabase } from './supabase';
import type { ChatTarget } from './messages';

// One row per conversation with its latest message — backed by the
// public.conversations view (phase9, widened by phase36), which already
// enforces "only threads I'm a party to".
export type Conversation = {
  /** Set for a job conversation, null for a direct thread. */
  job_id: string | null;
  /** Set for a direct thread (phase36), null for a job conversation. */
  direct_thread_id: string | null;
  job_title: string | null;
  /**
   * For a job conversation these are the job's client and assigned worker. For
   * a direct thread the view reuses the same two columns for the thread's two
   * participants, with no client/worker relationship implied — which is what
   * lets resolveOtherId() and the inbox filter work on both kinds unchanged.
   */
  client_id: string;
  assigned_worker_id: string | null;
  last_message_id: string;
  last_message_sender_id: string;
  last_message_content: string;
  last_message_image_url: string | null;
  /** Voice note (phase16). Null until that migration runs, which the inbox
   *  preview tolerates — it just falls through to the text/photo cases. */
  last_message_audio_url: string | null;
  /**
   * Document attachment (phase77, S-6). Both branches of the view carry these,
   * so a document previews on a job thread and a pair thread alike.
   *
   * The URL is the raw `storage://chat-documents/…` reference and is NEVER
   * signed here — the inbox only asks whether a document is there, and
   * signing one URL per row on every inbox load would be N round trips to
   * render a list nobody has tapped. The NAME is the preview.
   */
  last_message_document_url: string | null;
  last_message_document_name: string | null;
  /** Unsend (phase25). Set if the last message in the thread was unsent —
   *  the inbox preview checks this before falling back to the text/photo/
   *  voice cases, same precedence as messagePreviewText(). */
  last_message_unsent_at: string | null;
  last_message_at: string;
  /** Direct threads carry their own read state (see phase36 for why they are
   *  not in message_reads); null for a job conversation, whose read state
   *  comes from fetchMyReadStates() as before. */
  my_read_at: string | null;
};

// ---------------------------------------------------------------------------
// THE CLEAR / DELETE WATERMARK (phase77, S-2).
//
// D7's ONE visibility helper, re-exported here so the two surfaces that read
// it — the inbox deciding whether a row is still in the list, and the chat
// timeline deciding which messages are still in the thread — share one import
// as well as one implementation.
//
// THE RULE ITSELF lives in lib/conversationVisibility.ts, which imports
// nothing, so a test can RUN the comparison rather than read it: a module that
// imports `./supabase` cannot be loaded by `node --test` at all. There is
// exactly one `<=` in this app comparing an instant to `cleared_before`, and
// it is over there. A second copy is the P3-31 bug the arrangement prevents.
// ---------------------------------------------------------------------------
export {
  clearedBy,
  conversationHiddenByDelete,
  visibleMessages,
  type ClearWatermark,
} from './conversationVisibility';

/** The chat target a conversation row opens. */
export function conversationTarget(c: Conversation): ChatTarget {
  return c.job_id
    ? { jobId: c.job_id }
    : { directThreadId: c.direct_thread_id as string };
}

/** Stable list key for a conversation row, whichever kind it is. */
export function conversationKey(c: Conversation): string {
  return c.job_id ? `job:${c.job_id}` : `direct:${c.direct_thread_id}`;
}

/** Only the fields a one-line preview reads. */
export type PreviewableConversation = Pick<
  Conversation,
  | 'last_message_unsent_at'
  | 'last_message_document_url'
  | 'last_message_document_name'
  | 'last_message_audio_url'
  | 'last_message_image_url'
  | 'last_message_content'
>;

/**
 * The one line under a name in a conversation list.
 *
 * Same precedence as messagePreviewText(): an unsent message says so and
 * carries no reactions, because there is nothing left to have reacted to.
 *
 * SHARED rather than copied. Two lists render conversations now — the inbox
 * and the Face-ID-gated hidden list — and a preview that reads differently in
 * one of them would be the P3-31 duplication in its most visible form.
 */
export function conversationPreviewText(
  latest: PreviewableConversation,
  reactionEmoji: readonly string[] = []
): string {
  if (latest.last_message_unsent_at) return 'This message was unsent';
  const prefix = reactionEmoji.length > 0 ? `${reactionEmoji.join('')} ` : '';
  // AHEAD OF VOICE, the same order messagePreviewText() uses and for the same
  // reason: one insert writes every attachment kind, so whichever branch comes
  // first decides what this row says, and the document is the one that has a
  // NAME to say. The two must not diverge — an inbox row reading "Voice
  // message" over a thread whose newest bubble is a PDF is the drift this
  // shared implementation exists to prevent.
  if (latest.last_message_document_url) {
    return prefix + (latest.last_message_document_name || 'Document');
  }
  if (latest.last_message_audio_url) return `${prefix}Voice message`;
  if (latest.last_message_image_url) return `${prefix}Photo sent`;
  return prefix + (latest.last_message_content || '…');
}

/** Only the fields the unread rule reads. */
export type UnreadableConversation = Pick<
  Conversation,
  'job_id' | 'my_read_at' | 'last_message_sender_id' | 'last_message_at'
>;

/**
 * Has this thread got activity the user has not seen?
 *
 * A direct thread keeps its read timestamp on the thread row itself (phase36),
 * so it arrives on the conversation; a job thread's comes from the job-keyed
 * message_reads map. YOUR OWN last message never counts: offer events and
 * status cards are inserted with your id from screens you may never revisit,
 * and lighting the inbox for your own action is noise, not news.
 *
 * MUTE IS NOT PART OF THIS RULE. It is a property of the person, not of the
 * thread, and it is applied by the caller — the same reason the sheet resolves
 * `muted` off the row rather than off the conversation.
 */
export function threadUnread(
  thread: UnreadableConversation,
  userId: string,
  readMap: Record<string, string>
): boolean {
  const lastReadAt = thread.job_id ? readMap[thread.job_id] : thread.my_read_at;
  return (
    thread.last_message_sender_id !== userId &&
    (!lastReadAt || new Date(thread.last_message_at) > new Date(lastReadAt))
  );
}

/**
 * The other party in a conversation, from the current user's point of view.
 * If the job has no assigned worker (or otherwise no resolvable second party
 * — e.g. a job whose worker was never set), there is no one else in the
 * thread either, so it falls back to the user's own id — the same "messaging
 * yourself" treatment as a true self-bid (client_id === assigned_worker_id).
 */
export function resolveOtherId(
  job: { client_id: string; assigned_worker_id: string | null },
  userId: string
): string {
  const other = job.client_id === userId ? job.assigned_worker_id : job.client_id;
  return other ?? userId;
}

// Explicit projection — exactly the Conversation type above, pinned by
// tests/projections.test.mjs so the list and the type cannot drift apart.
// Never `select('*')`: the view is ours today, but a widened view must not
// silently start shipping new columns to every inbox load.
const CONVERSATION_COLUMNS =
  'job_id, direct_thread_id, job_title, client_id, assigned_worker_id, last_message_id, last_message_sender_id, last_message_content, last_message_image_url, last_message_audio_url, last_message_document_url, last_message_document_name, last_message_unsent_at, last_message_at, my_read_at';

/** All of the user's conversations (threads with >=1 message), newest first. */
export async function fetchConversations(userId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .or(`client_id.eq.${userId},assigned_worker_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  return { data: (data ?? []) as Conversation[], error };
}

/**
 * The direct thread between the current user and one other person, or null if
 * no offer has ever linked the pair. Since phase52 a thread exists from the
 * first offer between two users (trigger + backfill), so the offer surfaces
 * use this to open pre-hire chat. RLS returns the row only to its two
 * parties; direct_threads orders the pair (user_a < user_b) by constraint.
 */
export async function fetchDirectThreadWith(userId: string, otherId: string) {
  const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
  const { data, error } = await supabase
    .from('direct_threads')
    .select('id')
    .eq('user_a', a)
    .eq('user_b', b)
    .maybeSingle();

  return { data: (data?.id as string | undefined) ?? null, error };
}

/**
 * A job the signed-in user is a party to that is still being worked.
 *
 * This is the resolver's candidate set (lib/conversationResolver.ts): the jobs
 * that can own a conversation right now. It is read here rather than through
 * lib/jobs.ts because the inbox needs only these five columns for every
 * counterparty at once — `fetchJobsByClient` / `fetchJobsAssignedToWorker`
 * fetch every job of every status with an offer-count embed, which is two
 * round trips and far more data than a subtitle needs.
 */
export type ActiveJob = {
  id: string;
  title: string;
  created_at: string;
  client_id: string;
  assigned_worker_id: string | null;
};

/** The statuses that mean "still being worked" — the resolver's window. */
export const ACTIVE_JOB_STATUSES: string[] = ['assigned', 'in_progress'];

/** Every job the user currently holds with anyone, either side of it. */
export async function fetchActiveJobs(userId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, created_at, client_id, assigned_worker_id')
    .in('status', ACTIVE_JOB_STATUSES)
    .or(`client_id.eq.${userId},assigned_worker_id.eq.${userId}`);

  return { data: (data ?? []) as ActiveJob[], error };
}

/** A job two people share, whatever stage it has reached. */
export type SharedJob = ActiveJob & { status: string };

/**
 * Every job the signed-in user and one other person share, any status.
 *
 * These are the job threads that make up their one conversation — finished
 * work included, because a conversation does not end when a job does. RLS
 * already limits `jobs` to rows the caller is a party to; the filter here is
 * about the OTHER party.
 */
export async function fetchSharedJobs(userId: string, otherId: string) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, created_at, status, client_id, assigned_worker_id')
    .or(
      `and(client_id.eq.${userId},assigned_worker_id.eq.${otherId}),` +
        `and(client_id.eq.${otherId},assigned_worker_id.eq.${userId})`
    );

  return { data: (data ?? []) as SharedJob[], error };
}

export type ReadState = { job_id: string; last_read_at: string };

/** When the user last opened each job's chat (drives the unread dot). */
export async function fetchMyReadStates(userId: string) {
  const { data, error } = await supabase
    .from('message_reads')
    .select('job_id, last_read_at')
    .eq('user_id', userId);

  return { data: (data ?? []) as ReadState[], error };
}

/**
 * The OTHER party's read position on the given job threads — the gold tick's
 * source for a job conversation (phase77 READ_TICKS).
 *
 * Readable since phase77's `message_reads_select_party`, which is scoped to
 * exactly one row: the row belonging to the other party of a job the caller is
 * already in. It is the same table and the same shape `fetchMyReadStates()`
 * reads, deliberately — one tick pipeline for both thread kinds, rather than
 * an RPC for job threads that could never ride realtime beside its direct
 * sibling.
 *
 * An empty `jobIds` short-circuits: PostgREST renders `in.()` for an empty
 * list, which is a syntax error rather than an empty result.
 */
export async function fetchCounterpartyReadStates(otherId: string, jobIds: string[]) {
  if (jobIds.length === 0) return { data: [] as ReadState[], error: null };

  const { data, error } = await supabase
    .from('message_reads')
    .select('job_id, last_read_at')
    .eq('user_id', otherId)
    .in('job_id', jobIds);

  return { data: (data ?? []) as ReadState[], error };
}

/**
 * Mark a conversation as read "now" for the given user.
 *
 * A job conversation upserts into message_reads exactly as before. A direct
 * thread stores its two read timestamps on the thread row itself, so it goes
 * through mark_direct_thread_read(), which resolves the caller server-side and
 * can only move that caller's own column.
 */
export async function markConversationRead(target: ChatTarget, userId: string) {
  if (!target.jobId) {
    const { error } = await supabase.rpc('mark_direct_thread_read', {
      p_thread_id: target.directThreadId,
    });
    return { error };
  }

  const { error } = await supabase.from('message_reads').upsert(
    { job_id: target.jobId, user_id: userId, last_read_at: new Date().toISOString() },
    { onConflict: 'user_id,job_id' }
  );
  return { error };
}
