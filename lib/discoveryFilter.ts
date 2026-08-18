/**
 * The worker discovery distance filter (4D-2 B3) — pure rules only, so
 * `node --test` executes them directly. The AsyncStorage half lives in
 * ./discoveryFilterStorage.ts, split exactly the way modes/types.ts and
 * modes/modeStorage.ts are.
 *
 * `null` means "Any distance" — no radius constraint. It is a real state,
 * stored as the literal 'any' so an absent key (never chosen) and a chosen
 * "Any" are distinguishable in storage even though both currently resolve to
 * the same behavior.
 */

/**
 * The app's standing "nearby" promise, in miles. Canonical here since 4D-2 —
 * screens/WorkerResultsScreen.tsx re-exports it so the LOCKED
 * BrowseJobsScreen's `import { NEARBY_RADIUS_MILES } from
 * './WorkerResultsScreen'` keeps resolving unchanged. Kept in sync with that
 * locked screen's own "within 5 miles" pill copy.
 */
export const NEARBY_RADIUS_MILES = 5;

export const DISTANCE_FILTER_OPTIONS = [2, 5, 10, 25] as const;

export type DistanceFilterMiles = (typeof DISTANCE_FILTER_OPTIONS)[number];

export function isDistanceFilterMiles(value: unknown): value is DistanceFilterMiles {
  return (DISTANCE_FILTER_OPTIONS as readonly number[]).includes(value as number);
}

/**
 * Device-local storage key, scoped per account for the modes/types.ts reason:
 * two accounts on one device must not inherit each other's filter. Versioned
 * so a shape change takes a new key instead of migrating values.
 */
export function distanceFilterStorageKey(userId: string): string {
  return `brazos.discovery.distance.v1.${userId}`;
}

/** Wire format: a radius stores its number, "Any distance" stores 'any'. */
export function encodeDistanceFilter(value: DistanceFilterMiles | null): string {
  return value === null ? 'any' : String(value);
}

/**
 * Stored string → filter value. Anything unrecognized — a legacy value, a
 * corrupted write, a radius that later left the option list — coerces to
 * null (Any) rather than to a radius the UI cannot represent: the fail-safe
 * direction, since "Any" only ever shows MORE real jobs.
 */
export function coerceStoredDistanceFilter(raw: string | null): DistanceFilterMiles | null {
  if (raw === null || raw === 'any') return null;
  const parsed = Number(raw);
  return isDistanceFilterMiles(parsed) ? parsed : null;
}

/** The chip caption for one option. */
export function distanceChipLabel(value: DistanceFilterMiles | null): string {
  return value === null ? 'Any distance' : `${value} mi`;
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
