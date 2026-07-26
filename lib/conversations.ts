import { supabase } from './supabase';

// One row per job with its latest message — backed by the public.conversations
// view (see phase9 SQL), which already enforces "only jobs I'm a party to".
export type Conversation = {
  job_id: string;
  job_title: string;
  client_id: string;
  assigned_worker_id: string | null;
  last_message_id: string;
  last_message_sender_id: string;
  last_message_content: string;
  last_message_image_url: string | null;
  /** Voice note (phase16). Null until that migration runs, which the inbox
   *  preview tolerates — it just falls through to the text/photo cases. */
  last_message_audio_url: string | null;
  last_message_at: string;
};

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

/** All of the user's conversations (jobs with >=1 message), newest activity first. */
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

/** Mark a job's chat as read "now" for the given user (upsert). */
export async function markConversationRead(jobId: string, userId: string) {
  const { error } = await supabase.from('message_reads').upsert(
    { job_id: jobId, user_id: userId, last_read_at: new Date().toISOString() },
    { onConflict: 'user_id,job_id' }
  );
  return { error };
}
