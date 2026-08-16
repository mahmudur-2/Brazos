import { supabase } from './supabase';
import { PUBLIC_PROFILE_COLUMNS, type Profile } from './profiles';

/**
 * Screen 46 (+ the Rebook 08 fold-in) — the customer's saved-workers list
 * (phase53's saved_workers). Private to the saver by RLS in both directions:
 * a worker cannot see who saved them.
 */

export async function fetchSavedWorkerIds(userId: string) {
  const { data, error } = await supabase
    .from('saved_workers')
    .select('worker_id')
    .eq('user_id', userId);

  return {
    data: new Set(((data ?? []) as { worker_id: string }[]).map((r) => r.worker_id)),
    error,
  };
}

/** Saved workers with their public profiles, newest saves first. */
export async function fetchSavedWorkers(userId: string) {
  const { data, error } = await supabase
    .from('saved_workers')
    .select(`worker_id, created_at, profiles!saved_workers_worker_id_fkey(${PUBLIC_PROFILE_COLUMNS})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows = ((data ?? []) as unknown as { worker_id: string; created_at: string; profiles: Profile }[])
    .filter((r) => !!r.profiles);
  return { data: rows, error };
}

/**
 * Save a worker. ON CONFLICT DO NOTHING, not DO UPDATE.
 *
 * `ignoreDuplicates: true` is what makes PostgREST emit DO NOTHING, so the
 * write needs INSERT and nothing more. The previous plain upsert compiled to
 * ON CONFLICT DO UPDATE, and saved_workers carries neither an UPDATE grant nor
 * an UPDATE policy (phase53) - so re-saving an already-saved worker was
 * refused rather than being the no-op it should be.
 *
 * Widening the table's rights was the wrong repair: the row is (user_id,
 * worker_id, created_at) and the first two ARE the primary key, so a duplicate
 * save has nothing to update. The only thing DO UPDATE could touch is
 * created_at, and silently restamping when the save happened would be a lie.
 * Saving twice therefore succeeds, changes nothing, and keeps the original
 * save time.
 */
export async function saveWorker(userId: string, workerId: string) {
  const { error } = await supabase
    .from('saved_workers')
    .upsert(
      { user_id: userId, worker_id: workerId },
      { onConflict: 'user_id,worker_id', ignoreDuplicates: true }
    );
  return { error };
}

export async function unsaveWorker(userId: string, workerId: string) {
  const { error } = await supabase
    .from('saved_workers')
    .delete()
    .eq('user_id', userId)
    .eq('worker_id', workerId);
  return { error };
}
