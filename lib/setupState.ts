/**
 * Final-setup state: what was chosen, and whether the step is done.
 *
 * Pure on purpose — no React Native import anywhere in this file — so the
 * keying and parsing rules can be executed directly by the tests rather than
 * asserted about as text. The AsyncStorage side lives in ./setupStorage.ts.
 *
 * WHERE THIS IS STORED, and why it is not in the database: `profiles` has no
 * onboarding column and `ProfileUpdate` accepts no such field, so persisting
 * server-side would mean a schema migration. Migrations are hand-run SQL in
 * this repository and explicitly out of scope here, so completion lives on the
 * device instead. The consequence is real and worth stating plainly: a user
 * who reinstalls, or signs in on a second device, sees Setup again. Nothing
 * security-relevant rides on it — legal acceptance is the thing that must be
 * durable, and that stays in `legal_acceptances` where it already was.
 */

/** Which destination the user chose to land in after setup. */
export type LandingPreference = 'hire' | 'work';

export type SetupRecord = {
  completed: boolean;
  landing: LandingPreference;
};

/** Matches the reference screen's pre-selected card. */
export const DEFAULT_LANDING: LandingPreference = 'hire';

export function isLandingPreference(value: unknown): value is LandingPreference {
  return value === 'hire' || value === 'work';
}

/**
 * Namespaced, versioned, and scoped to one authenticated user.
 *
 * The user id is what stops a second account on a shared device inheriting the
 * first one's completed setup — the single most likely way a local flag like
 * this goes wrong. The `v1` is so a future change to the record's shape can
 * simply use a new key rather than trying to migrate stored JSON.
 */
export function setupStorageKey(userId: string): string {
  return `brazos.setup.v1.${userId}`;
}

export function serializeSetupRecord(record: SetupRecord): string {
  return JSON.stringify({ completed: record.completed, landing: record.landing });
}

/**
 * Anything unreadable is treated as "no record", which means the user is shown
 * Setup again. That is the safe direction to fail: showing a completed user one
 * extra screen is an annoyance, while treating a corrupt value as "complete"
 * would skip the legal step.
 */
export function parseSetupRecord(raw: string | null | undefined): SetupRecord | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  if (record.completed !== true) return null;
  if (!isLandingPreference(record.landing)) {
    // A valid completion with an unreadable choice still counts as complete;
    // only the preference falls back.
    return { completed: true, landing: DEFAULT_LANDING };
  }

  return { completed: true, landing: record.landing };
}
