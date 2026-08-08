/**
 * The Customer/Worker mode vocabulary (BRAZOS_MASTER_PLAN.md §A, §F).
 *
 * Pure on purpose — no React, no React Native, no Supabase import anywhere in
 * this file — so the coercion and keying rules below can be *executed* by
 * tests/mode.test.mjs rather than asserted about as text. Same arrangement as
 * lib/setupState.ts, and for the same reason.
 *
 * Everything that decides "which mode is this" funnels through coerceAppMode.
 * There is no other place where a string becomes an AppMode, which is what
 * makes "never allow an invalid mode value" a property of the module rather
 * than a habit of its callers.
 */

/** One account, two modes. There is no third value and no "both". */
export type AppMode = 'customer' | 'worker';

export const APP_MODES: readonly AppMode[] = ['customer', 'worker'];

/**
 * What an account is in before it has ever said otherwise, and what every
 * unreadable/absent/invalid answer falls back to. Customer, because posting a
 * job is the entry point the signed-up-but-undecided user is most likely to
 * want, and because it is the mode whose surfaces show the least (no payout
 * figures, no exact addresses).
 */
export const DEFAULT_MODE: AppMode = 'customer';

export function isAppMode(value: unknown): value is AppMode {
  return value === 'customer' || value === 'worker';
}

/**
 * The single narrowing point. Anything that is not exactly one of the two
 * literals — null, undefined, 'Worker', 'admin', a number, a stale value from
 * a future schema — becomes the fallback rather than propagating.
 */
export function coerceAppMode(value: unknown, fallback: AppMode = DEFAULT_MODE): AppMode {
  return isAppMode(value) ? value : fallback;
}

export function otherMode(mode: AppMode): AppMode {
  return mode === 'customer' ? 'worker' : 'customer';
}

/** Display name, used in the switch confirmation and accessibility labels. */
export function modeLabel(mode: AppMode): string {
  return mode === 'worker' ? 'Worker' : 'Customer';
}

/**
 * The device-local cache key for one account's mode.
 *
 * Scoped to the user id for exactly the reason lib/setupState.ts is: two
 * accounts on one device must not inherit each other's mode. Versioned so a
 * future shape change can take a new key instead of migrating stored values.
 */
export function modeStorageKey(userId: string): string {
  return `brazos.mode.v1.${userId}`;
}

/**
 * Setup's "Start in" choice, expressed as a mode.
 *
 * Setup (screen 06) offers "Hire help" / "Find work". Before Phase 2 that
 * choice was a one-shot navigation instruction — it pushed BrowseJobs onto the
 * shared Home stack and was then forgotten. It is a mode choice, so it is
 * mapped to one here and persisted like any other.
 */
export function modeFromLanding(landing: 'hire' | 'work'): AppMode {
  return landing === 'work' ? 'worker' : 'customer';
}

/**
 * Resolve the mode to start in from every source that can have an opinion,
 * in priority order:
 *
 *   1. `landing`  — a choice the user made seconds ago on the Setup screen.
 *                   Nothing else may override an explicit, just-made decision.
 *   2. `remote`   — profiles.active_mode. The durable, cross-device answer, and
 *                   authoritative over the local cache so a switch made on
 *                   another device wins.
 *   3. `local`    — the AsyncStorage cache. Used when the server has no answer
 *                   or could not be reached, which is what keeps the app usable
 *                   offline and before phase42 is applied.
 *   4. DEFAULT_MODE.
 *
 * Kept as a pure function so the precedence is testable without a device, a
 * session, or a database.
 */
export function resolveInitialMode(sources: {
  landing?: unknown;
  remote?: unknown;
  local?: unknown;
}): AppMode {
  if (isAppMode(sources.landing)) return sources.landing;
  if (isAppMode(sources.remote)) return sources.remote;
  if (isAppMode(sources.local)) return sources.local;
  return DEFAULT_MODE;
}
