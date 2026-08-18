import { supabase } from './supabase';

/**
 * Per-user notification switches. These are enforced server-side by
 * should_notify() (phase20) before anything is queued — this module is just
 * the client's read/write surface for the settings screen.
 */
export type NotificationPrefs = {
  user_id: string;
  messages: boolean;
  bids: boolean;
  job_updates: boolean;
  hire_requests: boolean;
  nearby_jobs: boolean;
  nearby_radius_miles: number;
  home_lat: number | null;
  home_lng: number | null;
};

/** The five switches shown in Profile, in display order. */
export const NOTIFICATION_TOGGLES = [
  {
    key: 'messages',
    label: 'Messages',
    hint: 'New messages in any conversation.',
  },
  {
    key: 'bids',
    label: 'Bids on my jobs',
    hint: 'When someone bids on a job you posted, and when a rival bid lands on a job you bid on.',
  },
  {
    key: 'job_updates',
    label: 'Job updates',
    hint: 'Assignments, completed work, and reviews you receive.',
  },
  {
    key: 'hire_requests',
    label: 'Hire Again requests',
    hint: 'Direct hire offers, counter-offers, and their outcomes.',
  },
  {
    key: 'nearby_jobs',
    label: 'New jobs nearby',
    hint: 'New jobs posted near you in the categories on your profile.',
  },
] as const;

export type NotificationToggleKey = (typeof NOTIFICATION_TOGGLES)[number]['key'];

/** Radius choices for "New jobs nearby". Mirrors the DB CHECK constraint. */
export const RADIUS_OPTIONS = [1, 3, 5, 10] as const;

/** Matches the table defaults, for the window before a row is read/created. */
export const DEFAULT_PREFS: Omit<NotificationPrefs, 'user_id'> = {
  messages: true,
  bids: true,
  job_updates: true,
  hire_requests: true,
  nearby_jobs: false,
  nearby_radius_miles: 5,
  home_lat: null,
  home_lng: null,
};

/**
 * The signed-in user's preferences. A row is created by a trigger on profile
 * insert and backfilled for existing accounts, but this still upserts on a
 * miss so a user whose row somehow doesn't exist gets a working settings
 * screen rather than an error.
 */
// Explicit projection — exactly the NotificationPrefs type above, pinned by
// tests/projections.test.mjs so the list and the type cannot drift apart.
const NOTIFICATION_PREFS_COLUMNS =
  'user_id, messages, bids, job_updates, hire_requests, nearby_jobs, nearby_radius_miles, home_lat, home_lng';

export async function fetchNotificationPrefs(userId: string) {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select(NOTIFICATION_PREFS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { data: null, error };

  if (!data) {
    const { data: created, error: createError } = await supabase
      .from('notification_prefs')
      .insert({ user_id: userId })
      .select(NOTIFICATION_PREFS_COLUMNS)
      .maybeSingle();
    return { data: created as NotificationPrefs | null, error: createError };
  }

  return { data: data as NotificationPrefs, error: null };
}

export type NotificationPrefsPatch = Partial<
  Pick<
    NotificationPrefs,
    | 'messages'
    | 'bids'
    | 'job_updates'
    | 'hire_requests'
    | 'nearby_jobs'
    | 'nearby_radius_miles'
    | 'home_lat'
    | 'home_lng'
  >
>;

export async function updateNotificationPrefs(
  userId: string,
  patch: NotificationPrefsPatch
) {
  const { data, error } = await supabase
    .from('notification_prefs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select(NOTIFICATION_PREFS_COLUMNS)
    .maybeSingle();

  return { data: data as NotificationPrefs | null, error };
}
