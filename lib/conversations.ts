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

/** All of the user's conversations (threads with >=1 message), newest first. */
export async function fetchConversations(userId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .or(`client_id.eq.${userId},assigned_worker_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  return { data: (data ?? []) as Conversation[], error };
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
