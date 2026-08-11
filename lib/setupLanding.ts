import type { LandingPreference } from './setupState';

/**
 * A one-shot handoff for "where should the app open, just this once".
 *
 * Finishing setup does not navigate — it flips a condition in RootNavigator,
 * which swaps the whole onboarding stack for MainTabs. There is no navigator
 * alive at that moment that could be told to go anywhere, so the choice is
 * parked here and picked up by MainTabs when it mounts. Same shape as the
 * parked deep link in ./navigationRef.ts, and for the same reason.
 *
 * Deliberately module state, not storage: it describes one transition, not a
 * preference. The durable copy lives in the setup record.
 */
let pending: LandingPreference | null = null;

export function setPendingLanding(landing: LandingPreference): void {
  pending = landing;
}

/**
 * Reads and clears in one step, so a remount of MainTabs (a tab reset, a
 * fast refresh) cannot replay the jump and yank a user off whatever screen
 * they had since navigated to.
 */
export function consumePendingLanding(): LandingPreference | null {
  const landing = pending;
  pending = null;
  return landing;
}
