/**
 * THE WORKER'S SKILLS — the rules, pure, so the fence executes them
 * (tests/workerSkills.test.mjs). hooks/useWorkerSkills.ts applies them to the
 * live reads; nothing else derives skills (P3-31).
 *
 * 2026-09-20 (sitting 2). Two sources, unioned: the profile's `categories`
 * and the categories of the worker's own listed services. A stored value
 * that is a category LABEL rather than its key still counts (mapped here,
 * never written back); anything that is neither is ignored — Best Match
 * ranks JOB categories, and only those exist on a job.
 */

export type WorkerSkillsState = 'loading' | 'error' | 'ready';

/** A stored category → a job category key, or null when it is neither a key nor a label. */
export function toJobCategoryKey(
  value: string,
  jobCategoryKeys: ReadonlySet<string>,
  labelToKey: ReadonlyMap<string, string>
): string | null {
  const key = jobCategoryKeys.has(value) ? value : (labelToKey.get(value) ?? null);
  return key !== null && jobCategoryKeys.has(key) ? key : null;
}

/** The union of both sources, as job category keys, in first-seen order. */
export function deriveWorkerSkillKeys(
  profileCategories: readonly string[] | null | undefined,
  serviceCategories: readonly string[] | null | undefined,
  jobCategoryKeys: ReadonlySet<string>,
  labelToKey: ReadonlyMap<string, string>
): Set<string> {
  const skills = new Set<string>();
  for (const value of [...(profileCategories ?? []), ...(serviceCategories ?? [])]) {
    const key = toJobCategoryKey(value, jobCategoryKeys, labelToKey);
    if (key) skills.add(key);
  }
  return skills;
}

/**
 * The state the Filters sheet's note reads. Something found → ready,
 * whatever else failed. Nothing yet and a source still reading → loading.
 * Nothing, and the PROFILE read failed → error (the profile is the primary
 * source; a failed services read alone is not an error — the profile
 * answered, and it holds nothing). Otherwise ready: both answered, and the
 * worker has picked nothing.
 */
export function deriveWorkerSkillsState(input: {
  skillCount: number;
  profileLoading: boolean;
  profileError: boolean;
  servicesLoading: boolean;
}): WorkerSkillsState {
  if (input.skillCount > 0) return 'ready';
  if (input.profileLoading || input.servicesLoading) return 'loading';
  if (input.profileError) return 'error';
  return 'ready';
}
