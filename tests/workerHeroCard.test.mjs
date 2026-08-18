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

test('C3 · full known facts render all three rows', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { rating_avg: 4.7, rating_count: 12, on_time_pct: 0.9, response_time: '2 hours' },
    stats: [{ count: 20 }, { count: 7 }],
  });
  assert.deepEqual(trust, {
    rating: { average: 4.7, count: 12 },
    newWorker: false,
    completedJobs: 27,
    respondsIn: '2 hours',
  });
});

test('C3 · a rating with zero counted reviews is not a fact — no rating, no placeholder', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { rating_avg: 4.9, rating_count: 0, on_time_pct: 0.8, response_time: null },
    stats: [{ count: 5 }],
  });
  assert.equal(trust.rating, null);
});

test('C3 · an unanswered or failed stats read is UNKNOWN: no completed row, no "New worker" verdict', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { rating_avg: null, rating_count: 0, on_time_pct: null, response_time: null },
    stats: null,
  });
  assert.equal(trust.completedJobs, null);
  assert.equal(trust.newWorker, false);
});

test('C3 · the "New worker" verdict is compareBids\' — KNOWN sub-3 completed with null on-time — and replaces the fact rows', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { rating_avg: 5, rating_count: 1, on_time_pct: null, response_time: '1 hour' },
    stats: [{ count: 1 }],
  });
  assert.equal(trust.newWorker, true);
  assert.equal(trust.completedJobs, null);
  assert.equal(trust.respondsIn, null);
  // The rating itself is still a fact and keeps rendering.
  assert.deepEqual(trust.rating, { average: 5, count: 1 });
});

test('C3 · a KNOWN zero completed with a known on-time renders nothing — never "0 jobs completed"', () => {
  const trust = deriveWorkerHeroTrust({
    profile: { rating_avg: null, rating_count: 0, on_time_pct: 0.95, response_time: null },
    stats: [],
  });
  assert.equal(trust.newWorker, false);
  assert.equal(trust.completedJobs, null);
});

test('C3 · responds-in is the real column value, trimmed; blank is null', () => {
  const blank = deriveWorkerHeroTrust({
    profile: { rating_avg: null, rating_count: 0, on_time_pct: 0.5, response_time: '   ' },
    stats: [{ count: 9 }],
  });
  assert.equal(blank.respondsIn, null);
  const real = deriveWorkerHeroTrust({
    profile: { rating_avg: null, rating_count: 0, on_time_pct: 0.5, response_time: ' about a day ' },
    stats: [{ count: 9 }],
  });
  assert.equal(real.respondsIn, 'about a day');
});

test('C3 · the module composes compareBids rather than copying its rules', async () => {
  const source = stripComments(await read('lib/workerHeroCard.ts'));
  assert.match(source, /from '\.\/compareBids'/);
  for (const fn of ['knownRating', 'onTimePercent', 'totalCompletedJobs', 'trustRowFor']) {
    assert.ok(source.includes(fn), `must reuse ${fn}`);
  }
  // No re-implementation: the sum and the verdict live in compareBids only.
  assert.doesNotMatch(source, /reduce\(/);
  assert.doesNotMatch(source, /< 3/);
});

// ---------------------------------------------------------------------------
// The hero card on screen — pinned
// ---------------------------------------------------------------------------

test('[static] 4E · the hero renders the module output; the old placeholders are gone', async () => {
  const screen = await read('screens/WorkerProfileScreen.tsx');
  assert.match(screen, /deriveWorkerHeroTrust\({ profile, stats: jobStats }\)/);
  assert.match(screen, /heroTrust\.rating \?/);
  assert.match(screen, /heroTrust\.newWorker \?/);
  assert.match(screen, /jobs?'\s*} completed|} completed/);
  assert.match(screen, /Responds in \$\{heroTrust\.respondsIn\}/);
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

test('[static] 4E · a tombstoned profile carries no hire, book, or save affordance', async () => {
  const screen = await read('screens/WorkerProfileScreen.tsx');
  // One predicate — lib/rebook.ts's canHire — feeds every affordance.
  assert.match(screen, /const hireable = canHire\(profile\?\.full_name\);/);
  assert.match(screen, /recipientActive && hireable/);
  assert.match(screen, /!isSelf && user && hireable \?/);
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
