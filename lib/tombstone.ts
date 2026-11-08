/**
 * The deleted-account tombstone — pure, import-free, so tests execute it.
 * (Moved verbatim from lib/rebook.ts when lean D5 removed saved workers.)
 */

/**
 * phase67's tombstone name, verbatim. Account deletion keeps the profiles row
 * and sets `full_name = 'Deleted user'` (supabase/phase67_account_deletion.sql
 * — a test pins this against the SQL). `deleted_at` is not in the public
 * column list, so the name IS the client-visible tombstone. The label renders
 * exactly as stored — never renamed, never softened (operator decision).
 */
export const DELETED_USER_LABEL = 'Deleted user';

/** Whether a public profile is a deletion tombstone. */
export function isTombstonedName(fullName: string | null | undefined): boolean {
  return fullName === DELETED_USER_LABEL;
}

/**
 * §4.3 — whether a profile may carry a Hire control. A tombstoned account
 * cannot complete a hire (create_offer's own is_profile_active gate refuses
 * it), so offering the tap is a dead end; the profile itself still renders —
 * the history and any reviews are real.
 */
export function canHire(fullName: string | null | undefined): boolean {
  return !isTombstonedName(fullName);
}
