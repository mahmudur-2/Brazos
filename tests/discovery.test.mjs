import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 8 guards — discovery breadth and the §10 leak closure.
 *
 * What must stay true:
 *   1. The job filter model is pure and correct — executed against the real
 *      lib/jobFilters functions: category scoping, the "no stated budget
 *      always passes a floor" rule, and every sort's edge behavior.
 *   2. The customer-mode reachability leak is CLOSED AT THE SCREEN:
 *      JobDetail delegates customers to MarketJobPreview, SubmitBid refuses
 *      customers outright, and MarketJobPreview contains zero worker
 *      vocabulary (no payout, no fee math, no bid CTA).
 *   3. The results list and the filter sheet share one model source, so a
 *      future map surface filtering through the same lib keeps parity.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

// F19: lib/jobFilters.ts formats its day word through lib/time.ts. node resolves
// relative specifiers literally, so the module runs from a data URL with that one
// value import pointed at the file (lib/time.ts imports nothing).
const jobFiltersUrl =
  'data:text/javascript;charset=utf-8;base64,' +
  Buffer.from(
    (await import('node:module'))
      .stripTypeScriptTypes(await readFile(new URL('../lib/jobFilters.ts', import.meta.url), 'utf8'), { mode: 'strip' })
      .replace("from './time'", `from '${new URL('../lib/time.ts', import.meta.url).href}'`),
    'utf8',
  ).toString('base64');
const filtersUrl = jobFiltersUrl;
const {
  DEFAULT_JOB_FILTERS,
  applyJobFilters,
  activeJobFilterCount,
  isDefaultJobFilters,
  localDateKey,
} =
  await import(filtersUrl);

const at = (overrides) => ({
  id: overrides.id ?? 'x',
  client_id: 'c',
  title: 't',
  description: 'd',
  category: overrides.category ?? 'other',
  location: null,
  budget_cents: overrides.budget_cents ?? null,
  budget_min_cents: overrides.budget_min_cents ?? null,
  budget_max_cents: overrides.budget_max_cents ?? null,
  scheduled_date: null,
  arrival_start_hour: null,
  arrival_end_hour: null,
  status: 'open',
  created_at: overrides.created_at ?? '2026-08-09T00:00:00Z',
  photos: [],
  videos: [],
  ...(overrides.distance_miles != null ? { distance_miles: overrides.distance_miles } : {}),
});

test('category and budget filters scope correctly; no-budget jobs survive a floor', () => {
  const jobs = [
    at({ id: 'clean', category: 'cleaning', budget_max_cents: 4000 }),
    at({ id: 'yard', category: 'yard_work', budget_max_cents: 9000 }),
    at({ id: 'open', category: 'handyman' }), // no budget at all
  ];

  const cleaningOnly = applyJobFilters(jobs, {
    ...DEFAULT_JOB_FILTERS,
    categories: new Set(['cleaning']),
  });
  assert.deepEqual(cleaningOnly.map((j) => j.id), ['clean']);

  const fiftyPlus = applyJobFilters(jobs, {
    ...DEFAULT_JOB_FILTERS,
    minBudgetCents: 5000,
  });
  // The $40 job drops; the $90 job stays; the no-budget job STAYS — an open
  // negotiation is not a low budget.
  assert.deepEqual(fiftyPlus.map((j) => j.id).sort(), ['open', 'yard']);
});

test('sorts behave at the edges', () => {
  const jobs = [
    at({ id: 'old-cheap', budget_max_cents: 2000, created_at: '2026-08-01T00:00:00Z' }),
    at({ id: 'new-rich', budget_max_cents: 9000, created_at: '2026-08-09T00:00:00Z' }),
    at({ id: 'mid-none', created_at: '2026-08-05T00:00:00Z' }),
  ];

  const newest = applyJobFilters(jobs, DEFAULT_JOB_FILTERS);
  assert.deepEqual(newest.map((j) => j.id), ['new-rich', 'mid-none', 'old-cheap']);

  const pay = applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, sort: 'pay' });
  // Highest ceiling first; NO budget can never rank as best-paying.
  assert.deepEqual(pay.map((j) => j.id), ['new-rich', 'old-cheap', 'mid-none']);

  const withDistance = [
    at({ id: 'far', distance_miles: 4.2 }),
    at({ id: 'near', distance_miles: 1.1 }),
    at({ id: 'unknown' }), // no distance — sinks, never crashes
  ];
  const closest = applyJobFilters(withDistance, {
    ...DEFAULT_JOB_FILTERS,
    sort: 'distance',
  });
  assert.deepEqual(closest.map((j) => j.id), ['near', 'far', 'unknown']);
});

test('the badge count and default detection agree', () => {
  assert.equal(isDefaultJobFilters(DEFAULT_JOB_FILTERS), true);
  assert.equal(activeJobFilterCount(DEFAULT_JOB_FILTERS), 0);
  const busy = {
    categories: new Set(['cleaning']),
    minBudgetCents: 5000,
    sort: 'pay',
  };
  assert.equal(isDefaultJobFilters(busy), false);
  assert.equal(activeJobFilterCount(busy), 3);
});

test('§10: JobDetail delegates customer mode to MarketJobPreview', async () => {
  const src = await read('screens/JobDetailScreen.tsx');
  assert.match(src, /useMode\(\)/);
  assert.match(src, /mode === 'customer' && !isOwnJob/);
  assert.match(src, /<MarketJobPreview/);
  // The delegation must come BEFORE the worker render begins.
  assert.ok(
    src.indexOf("mode === 'customer' && !isOwnJob") < src.indexOf('payoutEstimateLabel(job) ?'),
    'the customer branch must precede the worker surface'
  );
});

test('§10: MarketJobPreview carries zero worker vocabulary', async () => {
  const raw = await read('components/MarketJobPreview.tsx');
  // The doc comment NAMES the forbidden vocabulary (that's its job) — the
  // guard is about what the component RENDERS, so strip comments first.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // Customer money vocabulary only.
  assert.match(src, /EST\. PRICE/);
  assert.ok(!/EST\. PAY|payout|platform fee|after fee/i.test(src), 'no payout/fee vocabulary');
  // No bid affordances, no navigation into the bid flow.
  assert.ok(!/SubmitBid|create_offer|createMarketplaceOffer/.test(src), 'no bid path');
  // The one action is the confirmed mode switch.
  assert.match(src, /switchToOtherMode/);
  // Location is the public approximate string only — never job_locations.
  assert.ok(!/job_locations|fetchJobLocation/.test(src), 'no exact-location read');
});

test('§10: SubmitBid refuses customer mode at the screen', async () => {
  const src = await read('screens/SubmitBidScreen.tsx');
  assert.match(src, /mode === 'customer'/);
  assert.match(src, /switchToOtherMode/);
  // The guard must return before OfferComposer can render.
  assert.ok(
    src.indexOf("mode === 'customer'") < src.indexOf('<OfferComposer'),
    'guard must precede the composer'
  );
});

test('the results list and the sheet share the one filter model', async () => {
  const results = await read('screens/WorkerResultsScreen.tsx');
  assert.match(results, /applyJobFilters\(base, filters, sortContext\)/);
  assert.match(results, /JobFilterSheet/);
  const sheet = await read('components/JobFilterSheet.tsx');
  assert.match(sheet, /from '\.\.\/lib\/jobFilters'/);
  // Distance sort is only OFFERED where rows can carry a distance. Amended
  // for 4D-2 B3: a chosen distance chip routes "all"/"skills" through
  // jobs_within_radius too, so those rows now carry distance_miles as well —
  // the rule gained a disjunct, it did not lose one.
  assert.match(
    results,
    /distanceAvailable =\s*params\.mode === 'nearby' \|\| params\.mode === 'search' \|\| radiusActive/
  );
});

// --- helpers for the map chip-row fences below -----------------------------
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The two schema facts the Hourly decision rests on, read from the SQL. */
const readSchema = async () => {
  const { readdir } = await import('node:fs/promises');
  const names = (await readdir(join(root, 'supabase', 'archive', 'phases'))).filter((n) => n.endsWith('.sql'));
  const all = (await Promise.all(names.map((n) => read(`supabase/archive/phases/${n}`)))).join('\n');
  return {
    phase53: await read('supabase/archive/phases/phase53_worker_self_service.sql'),
    // EVERY column the jobs table has or gains, gathered from every migration
    // rather than from the one phase file that happens to be remembered — the
    // whole point is to notice a column added somewhere else.
    jobColumns: all
      .split('\n')
      .filter((line) => /alter table (public\.)?jobs\b.*add column/i.test(line))
      .join('\n'),
  };
};

// ---------------------------------------------------------------------------
// THE MAP'S CHIP ROW — 2026-08-24. Two chips, and the third one's absence is
// as deliberate as the two that shipped.
// ---------------------------------------------------------------------------

test('[executed] Today filters on the scheduled date, in the caller’s own calendar', () => {
  const job = (id, scheduled_date) => ({
    id,
    category: 'cleaning',
    budget_cents: 5000,
    budget_min_cents: null,
    budget_max_cents: null,
    scheduled_date,
    created_at: '2026-08-24T00:00:00.000Z',
  });
  const jobs = [job('today', '2026-08-24'), job('tomorrow', '2026-08-25'), job('undated', null)];

  // OFF: every job, including the undated one.
  assert.deepEqual(
    applyJobFilters(jobs, DEFAULT_JOB_FILTERS).map((j) => j.id).sort(),
    ['today', 'tomorrow', 'undated']
  );

  // ON: only the job whose stored day IS that day.
  assert.deepEqual(
    applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, scheduledOn: '2026-08-24' }).map((j) => j.id),
    ['today']
  );

  // AN UNDATED JOB DOES NOT PASS, and the asymmetry with budget is the point:
  // an absent budget is an open negotiation, so it survives every floor; an
  // absent date is not a claim about today and cannot be shown as one.
  assert.equal(
    applyJobFilters([job('undated', null)], { ...DEFAULT_JOB_FILTERS, scheduledOn: '2026-08-24' })
      .length,
    0
  );
  assert.equal(
    applyJobFilters(
      [{ ...job('nobudget', '2026-08-24'), budget_cents: null }],
      { ...DEFAULT_JOB_FILTERS, minBudgetCents: 999_999 }
    ).length,
    1,
    'the budget rule is unchanged: no stated budget still passes every floor'
  );

  // THE DAY KEY IS LOCAL, and that is why it is computed by the caller rather
  // than inside the pure filter. `toISOString().slice(0,10)` is UTC: for
  // anyone west of Greenwich it answers "tomorrow" through the whole evening,
  // and a Today filter would start hiding today's jobs after dinner. This is
  // asserted against a fixed local instant so it holds in any test timezone.
  const evening = new Date(2026, 7, 24, 21, 30, 0);
  assert.equal(localDateKey(evening), '2026-08-24');
  assert.equal(localDateKey(new Date(2026, 0, 5, 0, 0, 0)), '2026-01-05');
  assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59, 0)), '2026-12-31');

  // The new field joins the badge count and the default check rather than
  // being a filter nothing can see is on.
  assert.equal(isDefaultJobFilters({ ...DEFAULT_JOB_FILTERS, scheduledOn: '2026-08-24' }), false);
  assert.equal(activeJobFilterCount({ ...DEFAULT_JOB_FILTERS, scheduledOn: '2026-08-24' }), 1);
  assert.equal(isDefaultJobFilters(DEFAULT_JOB_FILTERS), true);
});

test('[static] the map chip row is Today alone — and the three absences are decisions', async () => {
  const map = stripComments(await read('screens/MapScreen.tsx'));

  // 2026-09-19: ONE chip, drawn on the pane material rather than through the
  // Chip primitive so it can be glass in dark and flat in light; its selected
  // treatment is still the app's one — selectedInDark's gold line in dark,
  // the forest fill in light.
  assert.match(map, /name="calendar-outline"/);
  assert.match(map, /\{\s*todayOn \? 'Showing jobs scheduled for today' : 'Show only jobs scheduled for today'\s*\}/);
  assert.match(map, /\{ backgroundColor: chosen\.fill, borderColor: chosen\.line \}/);
  assert.match(map, /chipShellSelected: \{\s*backgroundColor: colors\.forest,\s*borderColor: colors\.forest,/);
  // NEARBY IS ABSENT since the approved design: the distance pill on the
  // search capsule IS the radius — one control for one fact — so a second
  // toggle over the same radius would be the parallel vocabulary the chip
  // row is forbidden to create. The radius still writes through the one
  // storage path.
  assert.doesNotMatch(map, /label="Nearby"|nearbyOn|toggleNearby/, 'no second control over the radius');
  assert.doesNotMatch(map, /\bnearbyOnly\b|\bisNearby\b/, 'no second nearby vocabulary');
  assert.match(map, /writeDistanceFilter\(userId, next\)/);

  // HOURLY IS ABSENT BECAUSE THE COLUMN IS. `jobs` has no hourly-versus-fixed
  // field; the only `price_unit` in the schema is on `worker_services`
  // (phase53) — a worker's own service listing, not a posted job. An Hourly
  // chip could therefore only be INFERRED from a price shape, which is
  // inventing marketplace data about somebody's job. Both halves are
  // re-derived from the schema so this cannot rot into a stale excuse: the
  // day `jobs` grows the column, this fails and the chip gets built.
  assert.doesNotMatch(map, /label="Hourly"/, 'no hourly chip until the jobs table can answer it');
  const schema = await readSchema();
  assert.match(
    schema.phase53,
    /price_unit text not null default 'flat' check \(price_unit in \('flat', 'hourly'\)\)/,
    'the hourly vocabulary must still be the one on worker_services'
  );
  // ANTI-VACUITY, and it carries the whole argument: a column scan that found
  // NOTHING would prove "jobs has no hourly column" about an empty string. The
  // column Today actually filters on must be in what was read, so the same
  // sweep that says hourly is absent has demonstrably seen a real jobs column.
  assert.match(
    schema.jobColumns,
    /scheduled_date/,
    'the jobs-column sweep is not reading the migrations — the absence below would be vacuous'
  );
  // The BUDGET columns must be in view too, because they are exactly what an
  // Hourly chip would be tempted to infer a rate from. The sweep sees them,
  // sees the date beside them, and sees no hourly flag anywhere near either —
  // which is the finding, not an accident of what got read.
  for (const column of ['budget_min_cents', 'budget_max_cents', 'arrival_start_hour']) {
    assert.match(schema.jobColumns, new RegExp(column), `the sweep must see jobs.${column}`);
  }
  assert.doesNotMatch(
    schema.jobColumns,
    /price_unit|hourly|rate_type|pricing_type/,
    'jobs grew an hourly-versus-fixed column — the Hourly chip can be built now'
  );

  // VERIFIED IS ABSENT because verification vocabulary was removed from this
  // app deliberately, and multiple fences enforce its absence. Asserted here
  // too, at the one surface a chip row could reintroduce it.
  assert.doesNotMatch(map, /Verified|verified/, 'verification vocabulary does not come back as a chip');

  // TODAY IS THE SHARED MODEL, not a screen-local predicate.
  assert.match(map, /scheduledOn: prev\.scheduledOn == null \? todayKey : null/);
  assert.match(map, /const todayKey = localDateKey\(new Date\(\)\);/);
  assert.doesNotMatch(
    map,
    /scheduled_date/,
    'the map must not reach past the filter model into the column itself'
  );
});
