import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

/**
 * 4E — the worker hero card. lib/workerHeroCard.ts is EXECUTED (it is a pure
 * composition over lib/compareBids.ts, whose null-is-unknown rules it must
 * inherit rather than restate); the WorkerProfileScreen wiring is pinned
 * against source, marked [static].
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// The module value-imports './compareBids'; node resolves runtime specifiers
// literally, so rewrite it to an absolute file URL (compareBids is pure and
// import-free — it executes directly).
const { deriveWorkerHeroTrust } = await (async () => {
  const js = stripTypeScriptTypes(await read('lib/workerHeroCard.ts'), { mode: 'strip' }).replace(
    "from './compareBids'",
    `from '${pathToFileURL(join(root, 'lib/compareBids.ts')).href}'`
  );
  assert.ok(!js.includes("from './"), 'every relative import must be rewritten');
  return import(toDataUrl(js));
})();

// ---------------------------------------------------------------------------
// C3 — executed trust derivation
// ---------------------------------------------------------------------------

test('C3 · full known facts render every row but "Responds in" (C14: no unit named yet)', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { on_time_pct: 0.9, response_time: 120 },
    ratingSummary: { shownAverage: 4.7, isNew: false, total: 12 },
    stats: [{ count: 20 }, { count: 7 }],
  });
  assert.deepEqual(trust, {
    rating: { shownAverage: 4.7, isNew: false, count: 12 },
    newWorker: false,
    completedJobs: 27,
    respondsIn: null,
  });
});

test('C3 · zero revealed reviews is not a fact — no rating, no placeholder', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { on_time_pct: 0.8, response_time: null },
    ratingSummary: { shownAverage: 4.9, isNew: false, total: 0 },
    stats: [{ count: 5 }],
  });
  assert.equal(trust.rating, null);
});

test('C3 · an unanswered or failed summary read is UNKNOWN: no rating row (R8b-c)', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { on_time_pct: 0.8, response_time: null },
    ratingSummary: null,
    stats: [{ count: 5 }],
  });
  assert.equal(trust.rating, null);
});

test('C3 · an unanswered or failed stats read is UNKNOWN: no completed row, no "New worker" verdict', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { on_time_pct: null, response_time: null },
    ratingSummary: null,
    stats: null,
  });
  assert.equal(trust.completedJobs, null);
  assert.equal(trust.newWorker, false);
});

test('C3 · the "New worker" verdict is compareBids\' — KNOWN sub-3 completed with null on-time — and replaces the fact rows', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { on_time_pct: null, response_time: 60 },
    ratingSummary: { shownAverage: 5, isNew: true, total: 1 },
    stats: [{ count: 1 }],
  });
  assert.equal(trust.newWorker, true);
  assert.equal(trust.completedJobs, null);
  assert.equal(trust.respondsIn, null);
  // The rating itself is still a fact and keeps rendering — with the young-
  // reputation verdict beside it, so the surface prints "New" not a number.
  assert.deepEqual(trust.rating, { shownAverage: 5, isNew: true, count: 1 });
});

test('C3 · a KNOWN zero completed with a known on-time renders nothing — never "0 jobs completed"', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { on_time_pct: 0.95, response_time: null },
    ratingSummary: null,
    stats: [],
  });
  assert.equal(trust.newWorker, false);
  assert.equal(trust.completedJobs, null);
});

test('C14 · response_time is an integer with no named unit: any value gives no "Responds in", and nothing throws', () => {
  // The SQL column is an integer (baseline profiles.response_time); the old code called .trim() on it.
  for (const response_time of [12, 0, null, undefined]) {
    const trust = deriveWorkerHeroTrust({
      profile: { on_time_pct: 0.5, response_time },
      ratingSummary: null,
      stats: [{ count: 9 }],
    });
    assert.equal(trust.respondsIn, null, String(response_time));
    assert.equal(trust.completedJobs, 9, 'the other rows still render');
  }
});

test('C14 · the public profile read no longer selects response_time', async () => {
  const profiles = stripComments(await read('lib/profiles.ts'));
  const projection = profiles.match(/export const PUBLIC_PROFILE_COLUMNS =\s*'([^']*)'/)?.[1];
  assert.ok(projection, 'PUBLIC_PROFILE_COLUMNS is one string literal');
  assert.ok(!projection.split(',').map((c) => c.trim()).includes('response_time'));
  assert.match(profiles, /response_time\?: number \| null;/);
});

test('C3 · the module composes compareBids rather than copying its rules', async () => {
  const source = stripComments(await read('lib/workerHeroCard.ts'));
  assert.match(source, /from '\.\/compareBids'/);
  // knownRating left this list in R8b-c: the rating no longer derives from
  // the profile's mixed aggregate — it is the worker-role revealed summary.
  for (const fn of ['onTimePercent', 'totalCompletedJobs', 'trustRowFor']) {
    assert.ok(source.includes(fn), `must reuse ${fn}`);
  }
  // The legacy aggregate stays out: no reader of the profile rating columns.
  assert.ok(!source.includes('rating_avg'));
  assert.ok(!source.includes('rating_count'));
  // No re-implementation: the sum and the verdict live in compareBids only.
  assert.doesNotMatch(source, /reduce\(/);
  assert.doesNotMatch(source, /< 3/);
});

// ---------------------------------------------------------------------------
// The hero card on screen — pinned
// ---------------------------------------------------------------------------

test('[static] 4E · the hero renders the module output; the old placeholders are gone', async () => {
  const screen = await read('screens/WorkerProfileScreen.tsx');
  assert.match(screen, /deriveWorkerHeroTrust\({ profile, ratingSummary, stats: jobStats }\)/);
  // R8b-c: the summary is the worker role's, and a failed read stays null.
  assert.match(screen, /fetchProfileReviewSummary\(params\.workerId, 'worker'\)/);
  assert.match(screen, /if \(active && !summaryError\) setRatingSummary\(data\);/);
  assert.match(screen, /heroTrust\.rating \?/);
  assert.match(screen, /heroTrust\.newWorker \?/);
  assert.match(screen, /jobs?'\s*} completed|} completed/);
  // G3: profiles.response_time is measured from nothing (no writer), so the screen never shows it.
  assert.doesNotMatch(screen, /Responds in|heroTrust\.respondsIn/);
  // C3: no placeholder where a fact would go.
  assert.ok(!screen.includes('no reviews yet'));
  assert.ok(!screen.includes(": 'New'"));
  // The reviews entry exists only when there are reviews to open.
  assert.doesNotMatch(screen, /See reviews for/);
});

test('[static] 4E · stats arrive via worker_job_stats and stay null on failure', async () => {
  const screen = await read('screens/WorkerProfileScreen.tsx');
  assert.match(screen, /fetchWorkerJobStats\(params\.workerId\)/);
  assert.match(screen, /if \(active && !statsError\) setJobStats\(data\);/);
});

test('[static] 4E · a tombstoned profile carries no hire or book affordance', async () => {
  const screen = await read('screens/WorkerProfileScreen.tsx');
  // One predicate — lib/tombstone.ts's canHire — feeds every affordance.
  // (The save toggle left with saved workers in lean D5.)
  assert.match(screen, /const hireable = canHire\(profile\?\.full_name\);/);
  assert.match(screen, /recipientActive && hireable/);
  // Service booking rides canOffer, which now includes hireable.
  assert.match(screen, /!isSelf && canOffer && service\.published \?/);
});

test('[static] 4E · banned vocabulary stays off the hero surface', async () => {
  const screen = stripComments(await read('screens/WorkerProfileScreen.tsx')).toLowerCase();
  assert.ok(!screen.includes('escrow'));
  assert.ok(!screen.includes('verified'));
  assert.ok(!screen.includes('% fit'));
  assert.ok(!screen.includes('match score'));
});
