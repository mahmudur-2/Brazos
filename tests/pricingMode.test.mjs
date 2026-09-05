import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ===========================================================================
// RUN a4 — THE POSTING CHOICE: ask for bids, or set a price.
//
// `docs/DECISIONS.md` 2026-09-05 entry (2), built on a3's column
// (`supabase/migrations/20260930000400_job_pricing_mode.sql`). Two halves:
//
//   EXECUTED — lib/pricingMode.ts is import-free, so it is imported for real
//   by its file URL (the tests/earnings.test.mjs idiom) and every function is
//   run rather than pattern-matched.
//
//   RAW TEXT — the wiring of the four files that read it, with comments
//   stripped so a sentence in a comment can never satisfy an assertion.
//
// WHAT THIS FILE PROTECTS ABOVE ALL: the DEFAULT path. The E2E money walk
// (.maestro/money-walk.yml) taps 'Edit budget', types into 'Maximum budget in
// dollars', and reads 'Edit Budget' as the dialog's title — all three in the
// open-bids state, none of them changed by this run. Those strings moved into
// lib/pricingMode.ts; they did not move in meaning.
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

const modeUrl = pathToFileURL(join(root, 'lib/pricingMode.ts')).href;
const {
  DEFAULT_PRICING_MODE,
  PRICING_MODE_OPTIONS,
  budgetEditorCopy,
  priceFieldLabel,
  priceRowLabel,
  pricingModeFrom,
} = await import(modeUrl);

// ---------------------------------------------------------------------------
// EXECUTED
// ---------------------------------------------------------------------------

test('a4 · [executed] the read is an allow-list: only posted_price is a posted price', () => {
  assert.equal(pricingModeFrom('posted_price'), 'posted_price');
  // Everything else — the other known value, a plausible third word, empty,
  // absent, and a value of the wrong type entirely — reads as open bids. A
  // status-like string on this client is a plain `string` with nothing
  // compile-checking it (CLAUDE.md §Supabase), so the read must fail safe.
  for (const value of ['open_bids', 'auction', '', null, undefined, 3]) {
    assert.equal(pricingModeFrom(value), 'open_bids', `${String(value)} must read as open bids`);
  }
});

test('a4 · [executed] open bids is the default, and the first segment', () => {
  assert.equal(DEFAULT_PRICING_MODE, 'open_bids');
  assert.equal(PRICING_MODE_OPTIONS[0].value, 'open_bids');
  assert.equal(PRICING_MODE_OPTIONS[0].label, 'Ask for bids');
  assert.equal(PRICING_MODE_OPTIONS[1].value, 'posted_price');
  assert.equal(PRICING_MODE_OPTIONS[1].label, 'Set a price');
  assert.equal(PRICING_MODE_OPTIONS.length, 2, 'two modes, and no third');
});

test('a4 · [executed] the open-bids copy is today’s copy, byte for byte', () => {
  // These three strings are what the E2E walk finds. They moved file; they did
  // not change. `allowEmpty` is the open-bids rule: a blank budget is a real
  // state on the row and saves as "no maximum".
  assert.deepEqual(budgetEditorCopy('open_bids'), {
    title: 'Edit Budget',
    message: 'Set the maximum amount workers can bid up to.',
    fieldLabel: 'Maximum budget in dollars',
    allowEmpty: true,
  });
});

test('a4 · [executed] a posted price names itself, and cannot be blank', () => {
  const posted = budgetEditorCopy('posted_price');
  assert.equal(posted.title, 'Your price');
  assert.equal(
    posted.message,
    'Workers can request the job at this price. You still choose who gets it.'
  );
  assert.equal(posted.fieldLabel, 'Your price in dollars');
  assert.equal(posted.allowEmpty, false, 'the server refuses a posted price with no amount');
  // The message says what actually happens: a request at the posted price is
  // an ordinary offer the customer still accepts and funds. Not Instant Book,
  // and no claim of speed, booking or a guarantee (SCOPE "Not in v1").
  for (const banned of [/instant/i, /guarantee/i, /\bbook\b/i, /\bAI\b/]) {
    assert.doesNotMatch(posted.message, banned);
  }
});

test('a4 · [executed] the two labels answer both ways', () => {
  assert.equal(priceRowLabel('posted_price'), 'Price');
  assert.equal(priceRowLabel('open_bids'), 'Budget');
  assert.equal(priceFieldLabel('posted_price'), 'Price');
  assert.equal(priceFieldLabel('open_bids'), 'Max budget');
});

// ---------------------------------------------------------------------------
// RAW TEXT — the wiring
// ---------------------------------------------------------------------------

test('a4 · the data layer carries the mode end to end', () => {
  const jobs = stripComments(read('lib/jobs.ts'));

  // Read: the column is in the browse allow-list, and JOB_COLUMNS extends it,
  // so every Job read carries it too.
  assert.match(jobs, /const OPEN_JOB_COLUMNS =\s*'[^']*budget_max_cents, pricing_mode,/);
  assert.match(jobs, /const JOB_COLUMNS =\s*`\$\{OPEN_JOB_COLUMNS\}/);

  // Mapped through the allow-list on both shapes, never assigned raw.
  assert.equal(
    (jobs.match(/pricing_mode: pricingModeFrom\(row\.pricing_mode\)/g) ?? []).length,
    2,
    'mapJobRow and toOpenJob must both resolve the mode through the allow-list'
  );

  // Written: both RPCs send it, defaulted rather than left to chance.
  assert.equal(
    (jobs.match(/p_pricing_mode: input\.pricingMode \?\? DEFAULT_PRICING_MODE/g) ?? []).length,
    2,
    'create_job and update_job_details must both send p_pricing_mode'
  );

  // The client mirror of the server's own two sentences, refusing before the
  // RPC the way the ceiling mirror does.
  assert.match(jobs, /function jobPricingModeError\(input: NewJobInput\): string \| null/);
  assert.match(jobs, /return 'A posted price needs an amount';/);
  assert.match(jobs, /return 'A posted price is one amount, not a range';/);
  const flat = flatten(read('lib/jobs.ts'));
  for (const [fn, rpc] of [
    ['export async function createJob', ".rpc('create_job'"],
    ['export async function updateJob', ".rpc('update_job_details'"],
  ]) {
    const at = flat.indexOf(fn);
    assert.notEqual(at, -1, `${fn} must exist`);
    const guard = flat.indexOf('const modeError = jobPricingModeError(input);', at);
    const call = flat.indexOf(rpc, at);
    assert.ok(guard > at && guard < call, `${fn} must refuse the mode before ${rpc}`);
  }

  // The server's sentences, quoted from the migration rather than trusted.
  const migration = read('supabase/migrations/20260930000400_job_pricing_mode.sql');
  assert.match(migration, /raise exception 'A posted price needs an amount';/);
  assert.match(migration, /raise exception 'A posted price is one amount, not a range';/);
});

test('a4 · the draft round-trips the mode', () => {
  const draft = stripComments(read('lib/postJobDraft.ts'));
  assert.match(draft, /pricingMode: PricingMode;/);
  assert.match(draft, /pricingMode: pricingModeFrom\(parsed\.pricingMode\)/);
  // savePostJobDraft writes the whole object, so nothing else is needed there.
  assert.match(draft, /JSON\.stringify\(draft\)/);
});

test('a4 · the worker side, the offer projection and the funnel are untouched', () => {
  // R2 rules the CUSTOMER side only: a request at the listed price stays an
  // ordinary offer, so nothing on the worker's road reads the mode.
  assert.ok(
    !read('lib/offers.ts').includes('pricing_mode'),
    'OFFER_JOB_EMBED is not widened — no card built from it reads the mode'
  );
  assert.ok(
    !read('screens/JobDetailScreen.tsx').includes('pricing_mode'),
    'the worker job detail must not read the mode'
  );
  // The funnel union is closed on purpose (tests/observability.test.mjs
  // INVARIANT 12); the mode is on the jobs row, which is the instrument.
  assert.ok(
    !read('lib/observability/analytics.ts').includes('pricing'),
    'no analytics event changed for this run'
  );
});
