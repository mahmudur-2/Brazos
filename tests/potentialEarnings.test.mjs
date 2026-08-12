import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * A5 guards (docs/LOCKED_FILE_PATCHES.md, applied by owner authorization) —
 * Worker Home's POTENTIAL EARNINGS banner must never count the viewer's own
 * posted jobs: you cannot earn from your own job. The exclusion is
 * banner-only — the feed itself deliberately keeps those rows (their card
 * carries Edit), so no customer- or worker-mode card changes.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const src = await read('screens/BrowseJobsScreen.tsx');

// The stats memo is inline on the LOCKED screen (extraction was not part of
// the authorized diff), so lift its arrow function out of the source and
// execute it for real rather than asserting on text alone.
const memoMatch = src.match(
  /const stats = useMemo\((\(\) => \{[\s\S]*?\}), \[jobs, profile\?\.id\]\);/
);
assert.ok(memoMatch, 'BrowseJobsScreen must derive stats via useMemo keyed on [jobs, profile?.id]');
const runStats = (jobs, profile) =>
  new Function('jobs', 'profile', `return (${memoMatch[1]})();`)(jobs, profile);

const job = (id, clientId, cents) => ({ id, client_id: clientId, budget_cents: cents });

test('POTENTIAL EARNINGS excludes rows where client_id === viewer, and the count matches', () => {
  const feed = [
    job('a', 'me', 5000), // viewer's own posted job — not earnable
    job('b', 'other-1', 12500),
    job('c', 'other-2', null), // budget-less job still counts, adds $0
    job('d', 'me', 999999), // second own job — also excluded
  ];
  const stats = runStats(feed, { id: 'me' });
  assert.equal(stats.cents, 12500, 'own budgets must not inflate the sum');
  assert.equal(stats.count, 2, '"across N jobs" must count the same rows the sum does');

  // A viewer with no posted jobs in the feed sees the full sum.
  const outsider = runStats(feed, { id: 'someone-else' });
  assert.equal(outsider.cents, 5000 + 12500 + 999999);
  assert.equal(outsider.count, 4);
});

test('a still-loading profile falls back to the whole feed, never a crash', () => {
  const feed = [job('a', 'me', 5000), job('b', 'other', 100)];
  for (const profile of [null, undefined, {}]) {
    const stats = runStats(feed, profile);
    assert.equal(stats.cents, 5100);
    assert.equal(stats.count, 2);
  }
  // Empty feed derives zeros, never NaN or undefined.
  assert.deepEqual(runStats([], { id: 'me' }), { cents: 0, count: 0 });
});

test('the exclusion is banner-only: feed cards are identical in both modes', () => {
  // The preview list still derives from the UNfiltered feed — own jobs stay
  // visible (their card carries Edit); only the stats memo skips them.
  assert.match(
    src,
    /startOfComparableJobs\(jobs, myCategories\)/,
    'previewJobs must keep deriving from the unfiltered jobs array'
  );
  const exclusions = src.match(/job\.client_id === profile\.id/g) ?? [];
  assert.equal(
    exclusions.length,
    1,
    'the own-job exclusion must exist exactly once — inside the stats memo only'
  );
  // And the banner renders from the memo's pair, so sum and caption agree.
  assert.match(src, /formatBudget\(stats\.cents\)/);
  assert.match(src, /across \$\{stats\.count\}/);
});
