// n7 — the legacy mixed aggregate is read NOWHERE in the app.
//
// `profiles.rating_avg` / `profiles.rating_count` are kept by a trigger that
// counts UNREVEALED reviews of BOTH roles (recompute_profile_rating —
// docs/BACKLOG.md §v1.2, docs/DECISIONS.md 2026-08-31 R8a). Every rating the
// app shows or ranks on is a per-role REVEALED summary instead:
// profile_review_summary for one person (R8b-c, the single-subject surfaces)
// and profile_review_summaries for a list (n6 the function, n7 the repoint —
// Compare Bids and OfferCard through lib/compareBids.ts, worker search and
// its scoring, saved workers). This fence is what keeps a future surface
// from reaching for the columns because they are still in the database: the
// columns retire in a schema run, and until then the only thing standing
// between a new card and a wrong number is this file.
//
// Comments are stripped first, so the prose that explains the retirement
// (lib/workerHeroCard.ts, lib/profiles.ts, lib/reviews.ts, the two profile
// screens) survives, and only CODE that names a column fails.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

/** Comments are prose. A fence a comment can satisfy is not a fence — the
 *  same helper tests/shotHarness.test.mjs uses. */
const codeOnly = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every tree that holds app code. dev-tools/ is excluded wherever it sits;
 *  the frozen web surface (*.web.ts / *.web.tsx) is never product code. */
const APP_TREES = ['lib', 'screens', 'components', 'hooks', 'navigation', 'modes'];

function appSources(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    const abs = join(root, rel);
    if (statSync(abs).isDirectory()) {
      if (entry === 'dev-tools') continue;
      out.push(...appSources(rel));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.web\.tsx?$/.test(entry)) continue;
    out.push(rel);
  }
  return out;
}

const LEGACY_COLUMNS = /\b(rating_avg|rating_count)\b/;

test('no app code reads profiles.rating_avg or profiles.rating_count', () => {
  const files = APP_TREES.flatMap(appSources);
  // A scan that found nothing to scan would pass for the wrong reason.
  assert.ok(files.length > 100, `expected the app trees to hold code, found ${files.length} files`);
  for (const must of [
    'lib/compareBids.ts',
    'lib/profiles.ts',
    'lib/workerSearch.ts',
    'screens/WorkerSearchScreen.tsx',
    'screens/SavedWorkersScreen.tsx',
    'screens/CompareBidsScreen.tsx',
    'components/OfferCard.tsx',
    'hooks/useJobOffers.ts',
  ]) {
    assert.ok(files.includes(must), `${must} must be in the scan`);
  }
  for (const file of files) {
    assert.ok(!file.includes('dev-tools/'), `${file} is under dev-tools and must not be scanned`);
    assert.ok(!/\.web\.tsx?$/.test(file), `${file} is the frozen web surface and must not be scanned`);
  }

  const offenders = files.filter((file) => LEGACY_COLUMNS.test(codeOnly(read(file))));
  assert.deepEqual(
    offenders,
    [],
    `these files read the legacy aggregate in code (comments are stripped): ${offenders.join(', ')}`
  );
});

test('the public profile projection no longer carries the legacy columns', () => {
  // The constant IS the definition of what a public profile read returns
  // (docs/architecture.md §Profiles and reputation), so the fence pins it
  // directly rather than trusting the scan above alone.
  const profiles = codeOnly(read('lib/profiles.ts'));
  const projection = profiles.match(/export const PUBLIC_PROFILE_COLUMNS =\s*'([^']*)'/)?.[1];
  assert.ok(projection, 'PUBLIC_PROFILE_COLUMNS must be a single-quoted string literal');
  const columns = projection.split(',').map((column) => column.trim());
  assert.ok(!columns.includes('rating_avg'), 'rating_avg must not be selected');
  assert.ok(!columns.includes('rating_count'), 'rating_count must not be selected');
  for (const kept of ['id', 'full_name', 'avatar_url', 'on_time_pct', 'completion_rate']) {
    assert.ok(columns.includes(kept), `${kept} stays in the public projection`);
  }
});

test('bid ranking reads the revealed per-role summary', () => {
  const compareBids = codeOnly(read('lib/compareBids.ts'));
  assert.match(compareBids, /shown_average/);
  assert.match(compareBids, /is_new/);
  assert.match(compareBids, /revealed_total/);
  // knownRating is a fact only once at least one review is REVEALED; the
  // badge needs the "New" threshold cleared, not a raw count.
  assert.match(compareBids, /total > 0 && shown != null \? shown : null/);
  assert.match(compareBids, /top\.worker\?\.is_new !== false/);
});

test('every list surface makes ONE batch summary call for the ids it renders', () => {
  // The batch wrapper exists once, in lib/reviews.ts, and answers an empty
  // id list locally.
  const reviews = codeOnly(read('lib/reviews.ts'));
  assert.match(reviews, /export async function fetchProfileReviewSummaries\(/);
  assert.match(reviews, /\.rpc\('profile_review_summaries', \{/);
  assert.match(reviews, /if \(ids\.length === 0\) return \{ data: new Map\(\), error: null \};/);
  assert.equal(
    (reviews.match(/\.rpc\('profile_review_summaries'/g) ?? []).length,
    1,
    'exactly one call site for the batch RPC'
  );

  // Each list surface calls the wrapper (never the RPC) exactly once.
  for (const [file, expected] of [
    ['hooks/useJobOffers.ts', 1],
    ['screens/WorkerSearchScreen.tsx', 1],
    ['screens/SavedWorkersScreen.tsx', 1],
    ['lib/workerSearch.ts', 1],
  ]) {
    const source = codeOnly(read(file));
    assert.equal(
      (source.match(/fetchProfileReviewSummaries\(/g) ?? []).length,
      expected,
      `${file} must call fetchProfileReviewSummaries exactly ${expected} time(s)`
    );
    assert.doesNotMatch(source, /profile_review_summaries/, `${file} must not name the RPC itself`);
  }

  // Compare Bids and Client Job Detail share the hook's one call; the hook's
  // read is opt-in so BidDetail (already on the single summary) issues no
  // second request.
  assert.match(codeOnly(read('screens/CompareBidsScreen.tsx')), /useJobOffers\([^)]*summaries: true/);
  assert.match(codeOnly(read('screens/ClientJobDetailScreen.tsx')), /useJobOffers\([^)]*summaries: true/);
  assert.doesNotMatch(codeOnly(read('screens/BidDetailScreen.tsx')), /summaries: true/);
});
