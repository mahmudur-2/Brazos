import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Tier A (C7) — the launch posting allowlist, additive only
// ---------------------------------------------------------------------------
//
// LAUNCH_EXCLUDED_CATEGORIES names keys a customer may not POST under at
// launch. The shared category map is not edited — worker services, browse,
// search chips, Home tiles and existing rows all read it — and the filter
// lives at exactly one site, the Post-a-Job picker. The pure span of
// lib/jobs.ts (the categories, their labels, the allowlist) is extracted and
// EXECUTED here, so "every excluded key still exists in the map" is proven on
// the real constants; the picker's single filter site is pinned as text.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const jobsJs = stripTypeScriptTypes(read('lib/jobs.ts'), { mode: 'strip' });
const start = jobsJs.indexOf('export const JOB_CATEGORIES');
const end = jobsJs.indexOf('export const JOB_CATEGORY_ICONS');
assert.ok(start > 0 && end > start, 'the category span must exist in lib/jobs.ts');
const { JOB_CATEGORIES, JOB_CATEGORY_LABELS, LAUNCH_EXCLUDED_CATEGORIES } = await import(
  toDataUrl(jobsJs.slice(start, end))
);

/** The picker's list, computed the way the screen computes it. */
const postable = JOB_CATEGORIES.filter((c) => !LAUNCH_EXCLUDED_CATEGORIES.includes(c));

test('1 · every excluded key still exists in the shared map, and is absent from the posting picker', () => {
  for (const key of LAUNCH_EXCLUDED_CATEGORIES) {
    assert.ok(JOB_CATEGORIES.includes(key), `${key} stays in JOB_CATEGORIES`);
    assert.ok(typeof JOB_CATEGORY_LABELS[key] === 'string', `${key} keeps its label`);
    assert.ok(!postable.includes(key), `${key} is not offered to a customer posting a job`);
  }
  // Nothing is excluded twice, and nothing outside the map can be listed.
  assert.equal(new Set(LAUNCH_EXCLUDED_CATEGORIES).size, LAUNCH_EXCLUDED_CATEGORIES.length);
  assert.ok(LAUNCH_EXCLUDED_CATEGORIES.every((k) => JOB_CATEGORIES.includes(k)));
  // The picker never loses "other" — the category sheet hangs off it.
  assert.ok(postable.includes('other'));
});

test('2 · the shared map is untouched by the allowlist: eleven keys, the three merged candidates among them', () => {
  assert.equal(JOB_CATEGORIES.length, 11);
  for (const merged of ['handyman', 'painting', 'moving']) {
    assert.ok(JOB_CATEGORIES.includes(merged), `${merged} is in the map`);
    assert.ok(postable.includes(merged), `${merged} merges licensed and unlicensed work — left to the operator, still postable`);
  }
  // No distinct licensed-work key exists to exclude, so the list is empty at launch.
  assert.deepEqual([...LAUNCH_EXCLUDED_CATEGORIES], []);
  assert.ok(Array.isArray(LAUNCH_EXCLUDED_CATEGORIES));
});

test('3 · [static] the filter lives at ONE site in PostJobScreen, and every enumeration there reads it', () => {
  const screen = stripComments(read('screens/PostJobScreen.tsx'));
  assert.match(
    screen,
    /const POSTABLE_CATEGORIES: readonly JobCategory\[\] = JOB_CATEGORIES\.filter\(\s*\(c\) => !LAUNCH_EXCLUDED_CATEGORIES\.includes\(c\)\s*\);/
  );
  assert.equal((screen.match(/LAUNCH_EXCLUDED_CATEGORIES/g) ?? []).length, 2, 'the import and the one filter');
  // JOB_CATEGORIES is named twice: the import and the filter. Every chip
  // render, the measurement pass, the packing, the Other sheet's rows and the
  // sheet's pick read POSTABLE_CATEGORIES.
  assert.equal((screen.match(/\bJOB_CATEGORIES\b/g) ?? []).length, 2, 'no enumeration of the unfiltered map remains');
  assert.ok((screen.match(/\bPOSTABLE_CATEGORIES\b/g) ?? []).length >= 6);
  assert.match(screen, /\(chipOrder \?\? POSTABLE_CATEGORIES\)\.map/);
  assert.match(screen, /const OTHER_SHEET_SERVICES: SkillCategory\[\] = POSTABLE_CATEGORIES\.map/);
  assert.match(screen, /const packable = POSTABLE_CATEGORIES\.filter\(\(c\) => c !== 'other'\);/);
  assert.match(screen, /POSTABLE_CATEGORIES\.some\(\(c\) => !chipWidthsRef\.current\.has\(c\)\)/);
  assert.match(screen, /const chosen = POSTABLE_CATEGORIES\.find\(\(c\) => c === categoryKey\);/);
});

test('4 · [static] search, browse, worker services and Home tiles never see the allowlist', () => {
  for (const file of [
    'components/JobFilterSheet.tsx',
    'components/BrowseJobCard.tsx',
    'screens/WorkerSearchScreen.tsx',
    'screens/ServicesPricingScreen.tsx',
    'screens/HomeScreen.tsx',
    'lib/skillCategories.ts',
  ]) {
    assert.doesNotMatch(read(file), /LAUNCH_EXCLUDED_CATEGORIES|POSTABLE_CATEGORIES/, `${file} reads the shared map as before`);
  }
});
