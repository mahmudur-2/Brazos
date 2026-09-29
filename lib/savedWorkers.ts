import { supabase } from './supabase';
import { fetchRehirableWorkerIds } from './jobs';
import { PUBLIC_PROFILE_COLUMNS, fetchProfilesByIds, type Profile } from './profiles';
import { pastOnlyIds } from './rebook';

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

/** A person the "Saved & past workers" list shows, as much as a face and a name need. */
export type RehirePerson = Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;

/**
 * 2026-09-29 (LUX-LIST-2 #7) — the people Profile's "Saved & past workers" row names: the same
 * population that screen lists — the saved (newest save first), then the past-only workers, deduped
 * against the saved through the one `pastOnlyIds` rule — in the order it lists them. Any failed read answers
 * `error` and nobody: the row keeps its plain subtitle rather than a guessed or partial list.
 */
export async function fetchRehirePeople(
  userId: string
): Promise<{ people: RehirePerson[]; error: unknown }> {
  const [savedRes, pastIdsRes] = await Promise.all([
    fetchSavedWorkers(userId),
    fetchRehirableWorkerIds(userId),
  ]);
  if (savedRes.error || pastIdsRes.error) {
    return { people: [], error: savedRes.error ?? pastIdsRes.error };
  }
  const saved: RehirePerson[] = savedRes.data.map((row) => row.profiles);
  const pastIds = pastOnlyIds(pastIdsRes.data, new Set(savedRes.data.map((row) => row.worker_id)));
  const past = await fetchProfilesByIds(pastIds);
  if (past.error) return { people: [], error: past.error };
  return { people: [...saved, ...past.data], error: null };
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
