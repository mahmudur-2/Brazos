/**
 * Rebook derivations (4D-3 §4) — pure, import-free, so tests execute them.
 *
 * The people surface has two populations: workers the customer saved, and
 * workers who completed a job for them. One worker can be in both; the rules
 * here decide how the two lists merge and which rows can carry a Hire action.
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
 * §4.1 — a worker appearing in both sections appears ONLY under Saved. Takes
 * the past-worker ids and subtracts everyone already saved; the caller renders
 * the survivors under "Worked for you before".
 */
export function pastOnlyIds(
  pastIds: Iterable<string>,
  savedIds: ReadonlySet<string>
): string[] {
  const out: string[] = [];
  for (const id of pastIds) {
    if (!savedIds.has(id)) out.push(id);
  }
  return out;
}

/**
 * §4.3 — whether a row may carry a Hire control. A tombstoned account cannot
 * complete a hire (create_offer's own is_profile_active gate refuses it), so
 * offering the tap is a dead end; the row itself still renders — the history
 * and any reviews are real.
 */
export function canHire(fullName: string | null | undefined): boolean {
  return !isTombstonedName(fullName);
}

export type RebookStripSource = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type RebookStripItem = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  /** True when the item came from the Saved section (renders the bookmark). */
  saved: boolean;
};

/**
 * §4.4 — the two sections collapsed into one horizontal strip for the top of
 * the worker-search surface: Saved first (marked), then past workers deduped
 * against them. Tombstones are excluded outright — the strip exists only as a
 * hire shortcut, and a deleted account cannot be hired.
 */
export function rebookStripItems(
  saved: RebookStripSource[],
  past: RebookStripSource[]
): RebookStripItem[] {
  const items: RebookStripItem[] = [];
  const seen = new Set<string>();
  for (const p of saved) {
    if (isTombstonedName(p.full_name) || seen.has(p.id)) continue;
    seen.add(p.id);
    items.push({ id: p.id, name: p.full_name, avatarUrl: p.avatar_url, saved: true });
  }
  for (const p of past) {
    if (isTombstonedName(p.full_name) || seen.has(p.id)) continue;
    seen.add(p.id);
    items.push({ id: p.id, name: p.full_name, avatarUrl: p.avatar_url, saved: false });
  }
  return items;
}
