import { supabase } from './supabase';

/**
 * A private conversation between two people that exists without any job
 * (phase36). This is what a first-time direct offer lives in: there is no
 * shared job to hang it on yet, and inventing one would put a private
 * negotiation into the public job table.
 *
 * One row per unordered pair, forever — so a second offer to the same person
 * continues the same conversation rather than opening a new inbox entry.
 */
export type DirectThread = {
  id: string;
  user_a: string;
  user_b: string;
  user_a_read_at: string | null;
  user_b_read_at: string | null;
  created_at: string;
};

/** One thread by id. RLS returns nothing unless the caller is a participant. */
export async function fetchDirectThread(threadId: string) {
  const { data, error } = await supabase
    .from('direct_threads')
    .select('id, user_a, user_b, user_a_read_at, user_b_read_at, created_at')
    .eq('id', threadId)
    .maybeSingle();

  return { data: (data as DirectThread | null) ?? null, error };
}

/** The other participant, from `userId`'s point of view. */
export function otherParticipant(thread: DirectThread, userId: string): string {
  return thread.user_a === userId ? thread.user_b : thread.user_a;
}
