import { supabase } from './supabase';

// Minimum emoji set requested: heart, thumbs up, question mark.
export const REACTION_EMOJIS = ['❤️', '👍', '❓'] as const;

export type Reaction = {
  id: string;
  message_id: string;
  job_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

// Explicit projection — exactly the Reaction type above, pinned by
// tests/projections.test.mjs so the list and the type cannot drift apart.
const REACTION_COLUMNS = 'id, message_id, job_id, user_id, emoji, created_at';

/** All reactions across every message in a job (small dataset, fetched at once). */
export async function fetchReactionsForJob(jobId: string) {
  const { data, error } = await supabase
    .from('message_reactions')
    .select(REACTION_COLUMNS)
    .eq('job_id', jobId);

  return { data: (data ?? []) as Reaction[], error };
}

/**
 * Reactions on a specific set of messages (e.g. each inbox conversation's
 * latest message), across any number of jobs.
 */
export async function fetchReactionsForMessages(messageIds: string[]) {
  const unique = Array.from(new Set(messageIds.filter(Boolean)));
  if (unique.length === 0) {
    return { data: [] as Reaction[], error: null };
  }
  const { data, error } = await supabase
    .from('message_reactions')
    .select(REACTION_COLUMNS)
    .in('message_id', unique);

  return { data: (data ?? []) as Reaction[], error };
}

/**
 * Set (or replace) the current user's reaction on a message. One reaction per
 * person per message — the unique (message_id, user_id) constraint means this
 * upsert replaces any existing reaction from this user on this message.
 */
export async function setReaction(params: {
  messageId: string;
  jobId: string;
  userId: string;
  emoji: string;
}) {
  const { data, error } = await supabase
    .from('message_reactions')
    .upsert(
      {
        message_id: params.messageId,
        job_id: params.jobId,
        user_id: params.userId,
        emoji: params.emoji,
      },
      { onConflict: 'message_id,user_id' }
    )
    .select(REACTION_COLUMNS)
    .maybeSingle();

  return { data: data as Reaction | null, error };
}

/** Remove the current user's reaction from a message (tap it again to un-react). */
export async function removeReaction(messageId: string, userId: string) {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId);

  return { error };
}
