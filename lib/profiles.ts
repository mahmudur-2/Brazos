import { supabase } from './supabase';
import type { JobCategory } from './jobs';

// Combined profile shape. Public reads deliberately omit `phone`, `is_admin`,
// and `banned`; get_my_profile() is the only client-facing read that returns
// those self-only fields after phase29.
//
// The legacy rating columns (rating_avg / rating_count — the trigger-kept
// aggregate that mixes both roles and counts reviews the blind window still
// holds back) are NOT here and NOT in PUBLIC_PROFILE_COLUMNS since n7: every
// rating the app shows or ranks on is a per-role REVEALED summary
// (lib/reviews.ts — profile_review_summary for one person,
// profile_review_summaries for a list). The columns stay in the database
// until their retirement (docs/BACKLOG.md §v1.2); nothing here reads them.
export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  bio?: string | null;
  language?: string | null;
  categories?: string[] | null;
  completion_rate?: number | null;
  // Both are in PUBLIC_PROFILE_COLUMNS and so come back on every public read,
  // but are null for almost every account — treat null as "unknown", never as
  // zero, anywhere they are used to rank or describe someone.
  on_time_pct?: number | null;
  response_time?: string | null;
  // Moderation (phase13). Optional so the app still works if the migration
  // hasn't been run yet — both default to false/absent.
  is_admin?: boolean | null;
  banned?: boolean | null;
  // Availability (phase53, screen 66). Display truth only — nothing blocks a
  // customer from offering; the worker declines as usual. Optional for the
  // pre-migration window; absent reads as "accepting".
  accepting_work?: boolean | null;
  availability_note?: string | null;
};

export type ProfileUpdate = {
  full_name?: string;
  phone?: string;
  avatar_url?: string | null;
  bio?: string | null;
  language?: string;
  categories?: string[];
  accepting_work?: boolean;
  availability_note?: string | null;
};

export const PUBLIC_PROFILE_COLUMNS =
  'id, full_name, avatar_url, role, bio, language, categories, completion_rate, on_time_pct, response_time, accepting_work, availability_note';

const SELF_PROFILE_COLUMNS = `${PUBLIC_PROFILE_COLUMNS}, phone, is_admin, banned`;

function isMissingRpc(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202';
}

/**
 * Update the signed-in user's own editable fields. phase29 revokes direct
 * profile UPDATE and rejects protected keys inside update_my_profile().
 *
 * The PGRST202 fallback is only for the pre-migration development window: it
 * keeps the existing development database usable until phase29 is applied. Once the
 * function exists, every other error is returned and never bypassed.
 */
export async function updateProfile(userId: string, patch: ProfileUpdate) {
  const rpcResult = await supabase
    .rpc('update_my_profile', { p_patch: patch })
    .maybeSingle();

  if (!isMissingRpc(rpcResult.error)) {
    return { data: rpcResult.data as Profile | null, error: rpcResult.error };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select(SELF_PROFILE_COLUMNS)
    .maybeSingle();

  return { data: data as Profile | null, error };
}

/**
 * The signed-in account's persisted Customer/Worker mode
 * (supabase/phase42_active_mode.sql).
 *
 * Returns `null` — never a guess — when the answer cannot be had: the RPC is
 * missing (phase42 not applied yet), the request failed, or the value coming
 * back is not one of the two modes. The caller falls back to its local cache in
 * that case; see modes/ModeProvider.tsx. Deliberately its own narrow RPC rather
 * than reading the whole profile: this runs on every launch, before anything
 * authenticated renders, and it must not depend on a full profile read
 * succeeding.
 */
export async function fetchMyActiveMode() {
  const { data, error } = await supabase.rpc('get_my_active_mode');
  if (error) return { data: null, error };
  return { data: typeof data === 'string' ? data : null, error: null };
}

/**
 * Persist the signed-in account's mode. `set_active_mode()` validates the value
 * server-side and the check constraint backs it up, so an invalid mode cannot
 * be stored even if this is called wrongly.
 *
 * Failure is reported, not thrown: switching modes must still work on a device
 * that is offline or talking to a database without phase42 applied — the local
 * cache carries it until the next successful write.
 */
export async function setMyActiveMode(mode: 'customer' | 'worker') {
  const { error } = await supabase.rpc('set_active_mode', { p_mode: mode });
  return { error };
}

/** Fetch the signed-in user's complete profile, including their own phone. */
export async function fetchMyProfile(userId: string) {
  const rpcResult = await supabase.rpc('get_my_profile').maybeSingle();
  if (!isMissingRpc(rpcResult.error)) {
    return { data: rpcResult.data as Profile | null, error: rpcResult.error };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(SELF_PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  return { data: data as Profile | null, error };
}

/** Check the signed-in account's ban flag without exposing it on public reads. */
export async function fetchCurrentUserBanned(userId: string) {
  const rpcResult = await supabase.rpc('current_user_is_banned');
  if (!isMissingRpc(rpcResult.error)) {
    return { data: rpcResult.data === true, error: rpcResult.error };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('banned')
    .eq('id', userId)
    .maybeSingle();

  return { data: data?.banned === true, error };
}

/**
 * Whether another account is in good standing — the one thing about someone
 * else's moderation state a client may ask for. `banned` is not in the public
 * column list (phase29 revoked it), so this narrow SECURITY DEFINER answer is
 * the only way to know, and it returns a boolean rather than the reason.
 *
 * Treated as "active" when the RPC is missing (an unmigrated database): the
 * server refuses the action either way, so a false negative here would only
 * hide a working button.
 */
export async function isProfileActive(userId: string) {
  const { data, error } = await supabase.rpc('is_profile_active', { p_user: userId });
  if (error) return { data: isMissingRpc(error), error };
  return { data: data === true, error: null };
}

/** Fetch a set of profiles by id (for resolving counterparty names in lists). */
export async function fetchProfilesByIds(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) {
    return { data: [] as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[], error: null };
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', unique);

  return {
    data: (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[],
    error,
  };
}

/** Fetch a single profile by id (e.g. the counterparty on a job). */
export async function fetchProfileById(id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  return {
    data: data ? ({ ...data, phone: null, is_admin: null, banned: null } as Profile) : null,
    error,
  };
}

export type CategoryStat = { category: JobCategory; count: number };

/**
 * Completed-jobs-by-category for a worker (moved from lib/portfolio.ts when
 * lean D5 removed the portfolio).
 *
 * Goes through the worker_job_stats() RPC rather than querying `jobs`: a
 * visitor can't read another user's completed job rows under RLS, so a direct
 * count would silently return zero for exactly the case this is for.
 */
export async function fetchWorkerJobStats(workerId: string) {
  const { data, error } = await supabase.rpc('worker_job_stats', {
    p_worker: workerId,
  });

  const stats = ((data ?? []) as { category: string; job_count: number }[]).map(
    (row) => ({ category: row.category as JobCategory, count: row.job_count })
  );
  return { data: stats, error };
}

/** Up to two initials from a name, e.g. "Carlos Reyes" -> "CR". */
export function getInitials(name?: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Normalize completion_rate (accepts 0-1 or 0-100) to a 0-100 percent, or null. */
export function completionPercent(rate?: number | null): number | null {
  if (rate == null) return null;
  const pct = rate <= 1 ? rate * 100 : rate;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
