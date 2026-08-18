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

const filtersUrl = pathToFileURL(join(root, 'lib/jobFilters.ts')).href;
const { DEFAULT_JOB_FILTERS, applyJobFilters, activeJobFilterCount, isDefaultJobFilters } =
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
  assert.match(results, /applyJobFilters\(base, filters\)/);
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
