import { supabase } from './supabase';

// Combined profile shape. Public reads deliberately omit `phone`, `is_admin`,
// and `banned`; get_my_profile() is the only client-facing read that returns
// those self-only fields after phase29.
export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  verification_status: string | null;
  rating_avg: number | null;
  rating_count: number | null;
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
};

export type ProfileUpdate = {
  full_name?: string;
  phone?: string;
  avatar_url?: string | null;
  bio?: string | null;
  language?: string;
  categories?: string[];
};

export const PUBLIC_PROFILE_COLUMNS =
  'id, full_name, avatar_url, role, verification_status, rating_avg, rating_count, bio, language, categories, completion_rate, on_time_pct, response_time';

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

/** Up to two initials from a name, e.g. "Carlos Reyes" -> "CR". */
export function getInitials(name?: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function isVerified(status?: string | null): boolean {
  return status === 'verified';
}

/** Normalize completion_rate (accepts 0-1 or 0-100) to a 0-100 percent, or null. */
export function completionPercent(rate?: number | null): number | null {
  if (rate == null) return null;
  const pct = rate <= 1 ? rate * 100 : rate;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
