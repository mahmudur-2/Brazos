import { supabase } from './supabase';

// Worker/client profile (public-facing subset). `completion_rate` is a
// later-phase reputation field that may not exist in the DB yet, so it is
// optional and the UI degrades gracefully when it's absent.
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

/** Update the signed-in user's own profile row. */
export async function updateProfile(userId: string, patch: ProfileUpdate) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .maybeSingle();

  return { data: data as Profile | null, error };
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
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return { data: data as Profile | null, error };
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
