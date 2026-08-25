import { supabase } from './supabase';
import { chatTargetFilter, chatTargetKey, type ChatTarget } from './messages';

/**
 * LIVE LOCATION — a time-bounded position share into one conversation
 * (phase77, S-7).
 *
 * A SHARE IS NOT A MESSAGE. `live_location_shares` is its own table with no
 * row in `messages`, so starting or stopping one inserts nothing into the
 * thread and leaves no history behind: it renders as a card that is present
 * while the share is live and gone when it ends. Writing a "started sharing"
 * message would have made an ephemeral fact permanent in a transcript both
 * parties keep.
 *
 * THE TABLE IS RPC-WRITTEN, like `job_locations` — no client write policy and
 * no client write grant, so these three wrappers are the only way to move a
 * row. Reads are party-scoped AND time-bounded by the SELECT policy, which is
 * the part worth internalising: an EXPIRED SHARE READS AS ABSENT to everyone,
 * the sharer included. There is no "ended" state to render, because the row
 * stops being visible rather than changing.
 *
 * WHICH MEANS AN EARLY STOP DELIVERS NO REALTIME EVENT. stop_live_location()
 * sets expires_at = now(), and the updated row immediately fails the policy's
 * expiry term, so realtime drops it rather than delivering it. A counterparty
 * cannot learn of an early stop by waiting. Two things cover it, and both are
 * in hooks/useLiveLocation.ts: a refetch on screen focus, and a local timer
 * that expires the displayed card against the `expires_at` it already holds.
 * That held timestamp is the honest upper bound in every case — it is what the
 * sharer asked for, and nothing can extend it.
 *
 * BOTH THREAD KINDS. All three RPCs take `p_job_id` OR `p_direct_thread_id`,
 * and the table's CHECK enforces exactly one, so a share works on a job thread
 * and a pair thread alike — the same either-or shape sendMessage() already
 * takes, which is why these wrappers take a ChatTarget.
 */
export type LiveLocationShare = {
  id: string;
  sharer_id: string;
  /** Exactly one of these is set — `live_location_shares_one_thread`. */
  job_id: string | null;
  direct_thread_id: string | null;
  lat: number;
  lng: number;
  started_at: string;
  updated_at: string;
  /**
   * When the share ends. Enforced server-side twice over and never by client
   * honesty: the SELECT policy hides a row past it, and the write RPCs refuse
   * to start one more than 8 hours out or to move one that has ended.
   */
  expires_at: string;
};

// Explicit projection, never select('*'): the table is ours today, but a
// widened one must not silently start shipping new columns to every chat.
const LIVE_LOCATION_COLUMNS =
  'id, sharer_id, job_id, direct_thread_id, lat, lng, started_at, updated_at, expires_at';

/** The server's hard ceiling, in both the RPC and a CHECK constraint. */
export const MAX_SHARE_MS = 8 * 60 * 60 * 1000;

/**
 * THE THREE CHOICES, and there is deliberately no fourth.
 *
 * Eight hours is the server's cap, so offering more would be offering a
 * request that is refused — the same "never a dead control" rule the composer
 * follows. Fifteen minutes is the "I am nearly there" case and an hour is the
 * "I am on my way" one; anything finer would be a picker rather than a
 * decision.
 */
export const SHARE_DURATIONS = [
  { key: '15m', label: '15 minutes', ms: 15 * 60 * 1000 },
  { key: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { key: '8h', label: '8 hours', ms: MAX_SHARE_MS },
] as const;

export type ShareDuration = (typeof SHARE_DURATIONS)[number];

/**
 * A few seconds shaved off the ceiling, and only off the ceiling.
 *
 * The expiry is computed from the DEVICE's clock and checked against the
 * SERVER's: start_live_location() raises if `p_expires_at > now() + interval
 * '8 hours'`. Network latency only helps — the server's now() is later than
 * the client's by the time the request lands — but a device clock running
 * AHEAD of the server turns an exact eight-hour request into a refusal. This
 * margin absorbs ordinary skew; a device that is wrong by more than this still
 * gets the server's own sentence rather than a silent failure, which is the
 * fail-safe rather than a fallback.
 *
 * It costs five seconds off one of the three choices and is invisible at the
 * card's one-minute resolution.
 */
const CLOCK_SKEW_MARGIN_MS = 5000;

/**
 * The `expires_at` to ask for, computed client-side per the RPC's contract and
 * CLAMPED so it can never exceed the server's ceiling however it is called.
 */
export function shareExpiryFor(durationMs: number, now: number = Date.now()): string {
  const bounded = Math.min(Math.max(durationMs, 0), MAX_SHARE_MS - CLOCK_SKEW_MARGIN_MS);
  return new Date(now + bounded).toISOString();
}

/**
 * Is this share still live, by the clock this device holds?
 *
 * The SELECT policy already hides an expired row, so a fetch cannot return
 * one — this is for the row already ON SCREEN, whose share may have ended
 * since it arrived. See the module note: an early stop delivers no event, so
 * the displayed card has to expire itself.
 */
export function isShareActive(
  share: Pick<LiveLocationShare, 'expires_at'>,
  now: number = Date.now()
): boolean {
  const at = new Date(share.expires_at).getTime();
  return Number.isFinite(at) && at > now;
}

/**
 * "7h 59m" / "14m" / "under a minute" — how much of a share is left.
 *
 * Empty once it has ended, because an ended share has no card to label. Never
 * negative and never "0m": a share in its last seconds still exists, and
 * saying so in words beats a zero that reads as a bug.
 */
export function formatTimeRemaining(
  expiresAt: string,
  now: number = Date.now()
): string {
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return '';
  const remaining = at - now;
  if (remaining <= 0) return '';
  const minutes = Math.floor(remaining / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * HEARTBEAT CADENCE. No more often than every 10 seconds, and no further apart
 * than every 60 — the first bound is battery and the second is honesty: a pin
 * that has not moved in over a minute is stale enough that the counterparty is
 * reading a position rather than a movement.
 *
 * The chosen value sits inside both bounds, which is what the fence checks —
 * the BOUNDS are the contract, not the number.
 */
export const HEARTBEAT_MIN_MS = 10_000;
export const HEARTBEAT_MAX_MS = 60_000;
export const HEARTBEAT_MS = 15_000;

/** Metres of movement that also triggers a heartbeat, between ticks. */
export const HEARTBEAT_DISTANCE_M = 25;

/** How often a displayed card re-checks its own expiry (D8's local timer). */
export const EXPIRY_TICK_MS = 15_000;

/** The `column=eq.value` realtime filter for this thread's shares. The
 *  columns are the same two `messages` carries, so the one rule is reused. */
export function shareFilterFor(target: ChatTarget): string {
  return chatTargetFilter(target);
}

/** A stable channel/react key for this thread's shares. */
export function shareChannelKeyFor(target: ChatTarget): string {
  return chatTargetKey(target);
}

/** The RPC argument pair every one of the three functions takes. */
function threadArgs(target: ChatTarget) {
  return {
    p_job_id: target.jobId ?? null,
    p_direct_thread_id: target.directThreadId ?? null,
  };
}

/**
 * Start (or restart) this user's share into one conversation.
 *
 * Deliberately separate from the heartbeat, which is phase77's decision and
 * worth restating: a stray update can never RESTART a share the user ended,
 * because only this function inserts.
 */
export async function startLiveLocation(
  target: ChatTarget,
  lat: number,
  lng: number,
  expiresAt: string
) {
  const { data, error } = await supabase.rpc('start_live_location', {
    p_lat: lat,
    p_lng: lng,
    p_expires_at: expiresAt,
    ...threadArgs(target),
  });
  return { data: (data as string | null) ?? null, error };
}

/**
 * The heartbeat: move this user's own ACTIVE share.
 *
 * RAISES once the share has expired or was stopped — 'No active location
 * share'. That raise is the authoritative END of the share and is not a
 * transient failure: the caller tears the watcher down rather than retrying,
 * because there is nothing left to move and every retry would raise again.
 */
export async function updateLiveLocation(target: ChatTarget, lat: number, lng: number) {
  const { error } = await supabase.rpc('update_live_location', {
    p_lat: lat,
    p_lng: lng,
    ...threadArgs(target),
  });
  return { error };
}

/**
 * End this user's own share now. Idempotent server-side — stopping an
 * already-ended share is a silent no-op, so a double tap or a retry can never
 * surface an error on an action that succeeded.
 */
export async function stopLiveLocation(target: ChatTarget) {
  const { error } = await supabase.rpc('stop_live_location', threadArgs(target));
  return { error };
}

/**
 * Every share currently visible in this thread — both parties'.
 *
 * No expiry filter here, and that is not an omission: the SELECT policy's own
 * `expires_at > now()` term means an expired row cannot come back, and adding
 * a client-side `.gt()` would be a second copy of a rule the server already
 * owns. isShareActive() above is for the row already on screen, which is a
 * different question.
 */
export async function fetchActiveShares(target: ChatTarget) {
  const { data, error } = await supabase
    .from('live_location_shares')
    .select(LIVE_LOCATION_COLUMNS)
    .eq(
      target.jobId ? 'job_id' : 'direct_thread_id',
      target.jobId ?? target.directThreadId
    );

  if (error) return { data: [] as LiveLocationShare[], error };
  return { data: (data ?? []) as LiveLocationShare[], error: null };
}
