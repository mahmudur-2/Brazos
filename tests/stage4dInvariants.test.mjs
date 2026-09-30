import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

/**
 * Stage 4D invariants that had no executed coverage (2026-08-18 audit,
 * docs/audits/STAGE4D_AUDIT.md).
 *
 * 1. arrivalWindowLabel — the ONE arrival formatter (B2). It was pinned
 *    [static] at its call sites but never executed: the both-or-neither
 *    window rule, the 12-hour edges, and the local-calendar date parse that
 *    keeps "2026-08-12" from rendering as Aug 11 west of UTC.
 * 2. budgetRangeLabel / hasBudget — the range-aware money line every 4D
 *    card and the market preview build from. Executed nowhere before this.
 * 3. Money-state vocabulary — the settled rule that nothing reads "paid"
 *    before release (and "escrow" appears nowhere), asserted over every
 *    derived lifecycle label and every next-action line the hub can emit.
 * 4. [static] The radius honesty ladder — search widens 5→10→15 ONLY when
 *    no radius is chosen; a chosen radius pins the ladder; nearby always
 *    arrives at the promised radius.
 *
 * The formatters are executed by verbatim extraction from lib/jobs.ts (the
 * moneyCeiling.test.mjs pattern — lib/jobs.ts imports the supabase client,
 * which node cannot load). lib/jobLifecycle.ts imports directly.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// The contiguous pure span of lib/jobs.ts: formatBudget, budgetRangeLabel,
// hasBudget, formatHour, arrivalWindowLabel — no imports, extracted verbatim.
const formattersModule = (async () => {
  const jobsJs = stripTypeScriptTypes(await read('lib/jobs.ts'), { mode: 'strip' });
  const start = jobsJs.indexOf('export function formatBudget');
  const end = jobsJs.indexOf('export async function fetchClientJobStats');
  assert.ok(start > 0 && end > start, 'the formatter span must exist in lib/jobs.ts');
  // 2026-09-30 (idea 5): arrivalWindowLabel moves the window by a running-late tap through
  // lib/runningLate.ts — itself pure, with no imports — so the span is evaluated beside it: the one
  // shift rule, executed, never a copy of it.
  const lateJs = stripTypeScriptTypes(await read('lib/runningLate.ts'), { mode: 'strip' });
  return import(toDataUrl(`${lateJs}\n${jobsJs.slice(start, end)}`));
})();

const lifecycleUrl = pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href;
const { myJobsNextAction, JOB_LIFECYCLE_LABELS } = await import(lifecycleUrl);

// ---------------------------------------------------------------------------
// arrivalWindowLabel — executed
// ---------------------------------------------------------------------------

test('4D-B2 · date + window renders "Day, Mon D · H AM–H AM"', async () => {
  const { arrivalWindowLabel } = await formattersModule;
  const label = arrivalWindowLabel({
    scheduled_date: '2026-08-12',
    arrival_start_hour: 8,
    arrival_end_hour: 11,
  });
  // The date half is locale-woven; what must hold is the local-parts parse
  // (Aug 12 stays Aug 12 in every timezone) and the exact window text.
  assert.match(label, /^[A-Z][a-z]{2}, Aug 12 · 8 AM–11 AM$/);
});

test('4D-B2 · idea 5: running late moves the window until the worker arrives', async () => {
  const { arrivalWindowLabel } = await formattersModule;
  const base = { scheduled_date: '2026-09-30', arrival_start_hour: 18, arrival_end_hour: 20 };
  assert.match(arrivalWindowLabel({ ...base, late_minutes: 20 }), / · 6:20 PM–8:20 PM$/);
  assert.match(arrivalWindowLabel({ ...base, late_minutes: 20, arrived_at: '2026-09-30T22:10:00Z' }), / · 6 PM–8 PM$/);
  assert.match(arrivalWindowLabel({ scheduled_date: '2026-09-30', late_minutes: 10 }), / · 10 min late$/);
});

test('4D-B2 · the window is both-or-neither: half an hour pair renders no window', async () => {
  const { arrivalWindowLabel } = await formattersModule;
  // Only a start hour: the window half must vanish, leaving the date alone.
  assert.match(
    arrivalWindowLabel({ scheduled_date: '2026-08-12', arrival_start_hour: 8, arrival_end_hour: null }),
    /^[A-Z][a-z]{2}, Aug 12$/
  );
  // Only an end hour, no date: nothing at all.
  assert.equal(
    arrivalWindowLabel({ scheduled_date: null, arrival_start_hour: null, arrival_end_hour: 11 }),
    null
  );
  // Fully flexible: null, so cards can render the row as absent.
  assert.equal(
    arrivalWindowLabel({ scheduled_date: null, arrival_start_hour: null, arrival_end_hour: null }),
    null
  );
});

test('4D-B2 · 12-hour edges: midnight, noon, and the hour-24 wrap', async () => {
  const { arrivalWindowLabel } = await formattersModule;
  assert.equal(
    arrivalWindowLabel({ arrival_start_hour: 0, arrival_end_hour: 12 }),
    '12 AM–12 PM'
  );
  // "until 12 AM" — hour 24 wraps to midnight rather than inventing "24 PM".
  assert.equal(
    arrivalWindowLabel({ arrival_start_hour: 18, arrival_end_hour: 24 }),
    '6 PM–12 AM'
  );
});

test('4D-B2 · a malformed scheduled_date degrades to the window, never throws', async () => {
  const { arrivalWindowLabel } = await formattersModule;
  assert.equal(
    arrivalWindowLabel({ scheduled_date: 'not-a-date', arrival_start_hour: 9, arrival_end_hour: 10 }),
    '9 AM–10 AM'
  );
});

// ---------------------------------------------------------------------------
// budgetRangeLabel / hasBudget — executed
// ---------------------------------------------------------------------------

test('4D · a real range renders both ends; a collapsed range renders one figure', async () => {
  const { budgetRangeLabel } = await formattersModule;
  assert.equal(
    budgetRangeLabel({ budget_cents: 8000, budget_min_cents: 5000, budget_max_cents: 8000 }),
    '$50–$80'
  );
  assert.equal(
    budgetRangeLabel({ budget_cents: 8000, budget_min_cents: 8000, budget_max_cents: 8000 }),
    '$80'
  );
});

test('4D · pre-phase49 jobs fall back to budget_cents; no figures reads "No budget set"', async () => {
  const { budgetRangeLabel, hasBudget } = await formattersModule;
  assert.equal(budgetRangeLabel({ budget_cents: 12500 }), '$125');
  assert.equal(
    budgetRangeLabel({ budget_cents: null, budget_min_cents: null, budget_max_cents: null }),
    'No budget set'
  );
  assert.equal(hasBudget({ budget_cents: null, budget_min_cents: null, budget_max_cents: null }), false);
  assert.equal(hasBudget({ budget_cents: null, budget_min_cents: 5000, budget_max_cents: null }), true);
});

// ---------------------------------------------------------------------------
// Money-state vocabulary — executed over every derived output
// ---------------------------------------------------------------------------

const ALL_STATES = Object.keys(JOB_LIFECYCLE_LABELS);

test('4D · no lifecycle label says "paid", and none says "escrow"', () => {
  for (const state of ALL_STATES) {
    const label = JOB_LIFECYCLE_LABELS[state];
    assert.doesNotMatch(label, /\bpaid\b/i, `${state} label must not read as paid`);
    assert.doesNotMatch(label, /escrow/i, `${state} label must say protection, not escrow`);
  }
});

test('4D · no next-action line says "paid" before release, in either perspective', () => {
  const nowMs = Date.parse('2026-08-18T00:00:00Z');
  for (const state of ALL_STATES) {
    for (const perspective of ['customer', 'worker']) {
      for (const releaseDeadline of [null, nowMs + 41 * 3_600_000]) {
        const line = myJobsNextAction({
          perspective,
          state,
          bidCount: 2,
          reviewedByMe: false,
          releaseDeadline,
          nowMs,
        });
        assert.equal(typeof line, 'string');
        assert.doesNotMatch(
          line,
          /\bpaid\b/i,
          `${perspective}/${state} next action must not read as paid`
        );
        assert.doesNotMatch(line, /escrow/i, `${perspective}/${state} must not say escrow`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// [static] The radius honesty ladder (B3)
// ---------------------------------------------------------------------------

test('[static] 4D-B3 · a chosen radius pins the search ladder; nearby arrives at its promise', async () => {
  const screen = await read('screens/WorkerResultsScreen.tsx');
  // search: widen 5→10→15 ONLY when no radius is chosen; a stated selection
  // is never silently exceeded.
  assert.match(
    screen,
    /params\.mode === 'search'\s*\?\s*radiusActive\s*\?\s*\[radius as number\]\s*:\s*\[5, 10, 15\]/
  );
  // nearby: always exactly the stated radius, defaulting to the 5-mile
  // promise — never a widening ladder.
  assert.match(screen, /params\.mode === 'nearby'\s*\?\s*\[radius \?\? NEARBY_RADIUS_MILES\]/);
});
