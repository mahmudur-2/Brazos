import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 2026-09-20 (sitting 2) — THE WORKER'S SKILLS, ONE RULE, EXECUTED.
 *
 * The phone walk showed "Pick job categories on your profile to unlock Best
 * Match" on an account that HAD picked them. The fix is a single derivation
 * (lib/workerSkills.ts, applied by hooks/useWorkerSkills.ts) that unions the
 * profile's categories with the worker's listed services, tolerates a stored
 * label, and reports why the set may be empty — and every screen that used
 * to derive skills on its own now reads that one hook.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const { toJobCategoryKey, deriveWorkerSkillKeys, deriveWorkerSkillsState } = await import(
  pathToFileURL(join(root, 'lib/workerSkills.ts')).href
);
const { SKILL_CATEGORIES } = await import(pathToFileURL(join(root, 'lib/skillCategories.ts')).href);

// lib/jobs.ts reaches ui/tokens without an extension, so JOB_CATEGORIES is
// read from the source, the way the filter fence reads it.
const jobsSource = await read('lib/jobs.ts');
const JOB_CATEGORIES = [...(/export const JOB_CATEGORIES = \[([^\]]*)\]/.exec(jobsSource)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const KEYS = new Set(JOB_CATEGORIES);
const LABELS = new Map(SKILL_CATEGORIES.map((c) => [c.label, c.key]));

test('every profile skill key is a job category, so a key stored by the accordion always counts', () => {
  assert.ok(JOB_CATEGORIES.length >= 11);
  for (const c of SKILL_CATEGORIES) {
    assert.ok(KEYS.has(c.key), `${c.key} must be a job category`);
    assert.equal(toJobCategoryKey(c.key, KEYS, LABELS), c.key);
  }
});

test('a stored LABEL maps to its key; a custom-typed category is ignored', () => {
  assert.equal(toJobCategoryKey('House Cleaning', KEYS, LABELS), 'cleaning');
  assert.equal(toJobCategoryKey('Moving Help', KEYS, LABELS), 'moving');
  assert.equal(toJobCategoryKey('Piano tuning', KEYS, LABELS), null);
  assert.equal(toJobCategoryKey('', KEYS, LABELS), null);
});

test('the skills are the UNION of the profile and the listed services, de-duplicated, keys and labels alike', () => {
  const skills = deriveWorkerSkillKeys(
    ['cleaning', 'House Cleaning', 'Piano tuning'],
    ['moving', 'cleaning', 'other'],
    KEYS,
    LABELS
  );
  assert.deepEqual([...skills], ['cleaning', 'moving', 'other']);
  assert.deepEqual([...deriveWorkerSkillKeys(null, undefined, KEYS, LABELS)], []);
  // services alone unlock Best Match (the operator's ruling)
  assert.deepEqual([...deriveWorkerSkillKeys([], ['painting'], KEYS, LABELS)], ['painting']);
});

test('the state says why the set is empty: loading, the profile failed, or nothing picked', () => {
  const base = { skillCount: 0, profileLoading: false, profileError: false, servicesLoading: false };
  assert.equal(deriveWorkerSkillsState({ ...base, skillCount: 2, profileError: true }), 'ready', 'something found → ready');
  assert.equal(deriveWorkerSkillsState({ ...base, profileLoading: true }), 'loading');
  assert.equal(deriveWorkerSkillsState({ ...base, servicesLoading: true }), 'loading');
  assert.equal(deriveWorkerSkillsState({ ...base, profileError: true }), 'error');
  assert.equal(deriveWorkerSkillsState(base), 'ready', 'both answered, nothing picked');
});

test('[static] the Filters note names the state, and the three screens read the ONE hook', async () => {
  const sheet = await read('components/JobFilterSheet.tsx');
  assert.match(sheet, /export function categoriesNote\(/);
  assert.match(sheet, /Loading your profile…/);
  assert.match(sheet, /Couldn't load your profile, so My skills is off for now\./);
  assert.match(sheet, /Pick job categories on your profile to filter by your skills\./);
  assert.match(sheet, /note=\{categoriesNote\(skills, skillsState\)\}/);
  assert.match(sheet, /skillsState = 'ready',/, 'older callers are treated as ready');

  for (const file of ['screens/MapScreen.tsx', 'screens/WorkerResultsScreen.tsx', 'screens/WorkerHomeScreen.tsx']) {
    const source = await read(file);
    assert.match(source, /useWorkerSkills\(\)/, `${file} must read the one hook`);
    assert.doesNotMatch(
      source,
      /new Set(<[^>]*>)?\(\s*\(?profile\?\.categories/,
      `${file} must not derive skills from the profile on its own`
    );
  }
  for (const file of ['screens/MapScreen.tsx', 'screens/WorkerResultsScreen.tsx']) {
    const source = await read(file);
    assert.match(source, /skillsState=\{skillsState\}/, `${file} must hand the sheet the state`);
  }

  const hook = await read('hooks/useWorkerSkills.ts');
  assert.match(hook, /fetchWorkerServices\(user\.id\)/, 'the services are the second source');
  assert.match(hook, /useSyncExternalStore\(subscribe, getSnapshot\)/, 'one read per account, shared');
  assert.match(hook, /deriveWorkerSkillKeys\(/);
  assert.match(hook, /deriveWorkerSkillsState\(\{/);
});
