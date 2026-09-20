/**
 * The worker discovery distance filter (4D-2 B3) — pure rules only, so
 * `node --test` executes them directly. The session-state half lives in
 * ./discoveryFilterStorage.ts, split exactly the way modes/types.ts and
 * modes/modeStorage.ts are.
 *
 * `null` means "Any distance" — no radius constraint.
 *
 * 2026-08-22, two operator decisions:
 *  - The filter is SESSION-ONLY: every cold start begins at Any, and the
 *    last choice survives only in memory (shared across Map and the results
 *    list). The persisted-value era's wire codec is gone with it; the
 *    storage KEY survives solely so the retired stored value can be erased.
 *  - A CUSTOM radius joined the presets: any whole mile from
 *    DISTANCE_FILTER_MIN to DISTANCE_FILTER_MAX, picked with the Map filter
 *    sheet's stepper, so the type widened from the preset union to a
 *    validated number.
 *
 * 2026-09-19, operator: the Custom pill offers DISTANCE_CUSTOM_VALUES — the
 * list below, generated from the ruled steps — and the ceiling is 3,000
 * miles. The server's jobs_within_radius() clamp rose to match in the same
 * commit (supabase/migrations/20260930000500_radius_cap_3000.sql); before
 * it, a radius past 50 was silently answered as 50.
 */

/**
 * The app's standing "nearby" promise, in miles. Canonical here since 4D-2 —
 * screens/WorkerResultsScreen.tsx re-exports it so WorkerHomeScreen's
 * `import { NEARBY_RADIUS_MILES } from './WorkerResultsScreen'` keeps
 * resolving unchanged.
 */
export const NEARBY_RADIUS_MILES = 5;

/** The preset chips both discovery surfaces draw. */
export const DISTANCE_FILTER_OPTIONS = [2, 5, 10, 25] as const;

/** The custom stepper's bounds, whole miles inclusive. The presets sit
 *  inside them, so one validator covers both entry paths. */
export const DISTANCE_FILTER_MIN = 1;
export const DISTANCE_FILTER_MAX = 3000;

/**
 * The Custom distance list (operator, 2026-09-19): 1 to 10 by 1, to 50 by
 * 5, to 100 by 10, to 1,000 by 100, then by 1,000 to 3,000. Generated,
 * never typed; every value passes isDistanceFilterMiles().
 */
export const DISTANCE_CUSTOM_VALUES: readonly number[] = (() => {
  const out: number[] = [];
  for (let m = 1; m <= 10; m += 1) out.push(m);
  for (let m = 15; m <= 50; m += 5) out.push(m);
  for (let m = 60; m <= 100; m += 10) out.push(m);
  for (let m = 200; m <= 1000; m += 100) out.push(m);
  for (let m = 2000; m <= 3000; m += 1000) out.push(m);
  return out;
})();

export type DistanceFilterMiles = number;

/** Allow-list validation for anything claiming to be a radius: a whole mile
 *  inside the stepper's bounds. Fail-safe callers coerce failures to null
 *  (Any), which only ever shows MORE real jobs. */
export function isDistanceFilterMiles(value: unknown): value is DistanceFilterMiles {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= DISTANCE_FILTER_MIN &&
    value <= DISTANCE_FILTER_MAX
  );
}

/** Clamp a stepper step to the custom range, whole miles. */
export function clampDistanceFilterMiles(value: number): DistanceFilterMiles {
  return Math.min(DISTANCE_FILTER_MAX, Math.max(DISTANCE_FILTER_MIN, Math.round(value)));
}

/**
 * The RETIRED device-local storage key. The filter stopped persisting on
 * 2026-08-22 (session-only, Any on every cold start); this survives solely so
 * discoveryFilterStorage can erase whatever a previous build stored under it.
 * Nothing may write to it again.
 */
export function distanceFilterStorageKey(userId: string): string {
  return `brazos.discovery.distance.v1.${userId}`;
}

/** The chip caption for one option. */
export function distanceChipLabel(value: DistanceFilterMiles | null): string {
  return value === null ? 'Any distance' : `${value.toLocaleString('en-US')} mi`;
}

/**
 * "0.5 mi away" / "2 mi away" — for the server-computed, half-mile-snapped
 * `distance_miles` (phase75). Trims a trailing ".0" so whole miles read as
 * whole numbers; never invents precision beyond one decimal.
 */
export function formatDistanceMiles(miles: number): string {
  const rounded = miles.toFixed(1).replace(/\.0$/, '');
  return `${rounded} mi away`;
}
