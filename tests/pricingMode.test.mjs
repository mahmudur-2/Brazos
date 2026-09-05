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

test('a4 · the dialog asks the question and hands both answers back', () => {
  const dialog = flatten(read('components/EditBudgetDialog.tsx'));
  assert.match(dialog, /import \{ SegmentedControl \} from '\.\/SegmentedControl';/);
  // The choice is the EXISTING control in its existing dress — no new one, and
  // no new style: it sits in the same `field` wrapper the amount row uses.
  assert.match(
    dialog,
    /<SegmentedControl<PricingMode> options=\{\[\.\.\.PRICING_MODE_OPTIONS\]\} value=\{draftMode\} onChange=\{setDraftMode\} palette=\{palette\} \/>/
  );
  // Every string comes from the shared module; the dialog writes none of them.
  assert.match(dialog, /const copy = budgetEditorCopy\(draftMode\);/);
  assert.ok(
    !dialog.includes('Set the maximum amount workers can bid up to'),
    'the copy lives in lib/pricingMode.ts, not restated here'
  );
  // The mode is a DRAFT: Save hands both halves back, Cancel discards both.
  assert.match(dialog, /onSave\(draft\.trim\(\), draftMode\);/);
  assert.match(dialog, /setDraft\(value\); setDraftMode\(mode\); setProblem\(null\);/);
  // A posted price cannot be blank, and it says so in validateOfferAmount's
  // own sentence rather than a second one for the same fact.
  assert.match(
    dialog,
    /if \(!text\.trim\(\)\) return budgetEditorCopy\(mode\)\.allowEmpty \? null : 'Enter an amount\.';/
  );
  // Still contacts nothing and still writes nothing.
  assert.ok(!dialog.includes('supabase'), 'the dialog contacts nothing');
  assert.ok(!dialog.includes('createJob'), 'the dialog writes nothing');
});

test('a4 · the wizard sends the mode and writes one figure to the right column', () => {
  const screen = flatten(read('screens/PostJobScreen.tsx'));
  assert.match(screen, /mode=\{pricingMode\}/);
  assert.match(
    screen,
    /onSave=\{\(next, mode\) => \{ setBudgetMax\(next\); setPricingMode\(mode\); setEditingBudget\(false\); \}\}/
  );

  // ONE typed figure, written to whichever column the mode means — and the
  // range columns are both null for a posted price, which is what the server's
  // 'A posted price is one amount, not a range' check requires.
  assert.match(
    screen,
    /budgetCents: posted \? budgetMaxCents : null, budgetMinCents: null, budgetMaxCents: posted \? null : budgetMaxCents, pricingMode,/
  );
  // Refused in the client before the RPC, naming the way out.
  assert.match(
    screen,
    /A posted price needs an amount\. Open Edit budget and enter one, or switch to Ask for bids\./
  );

  // The four labels the mode now decides.
  assert.match(screen, /<FieldLabel palette=\{emeraldColors\}>\{priceFieldLabel\(pricingMode\)\}<\/FieldLabel>/);
  assert.match(screen, /\{isHiring \? 'Offer' : priceRowLabel\(pricingMode\)\}/);
  assert.match(screen, /\{priceRowLabel\(pricingModeFrom\(publishedJob\.pricing_mode\)\)\}/);
  assert.match(screen, /validMax != null \? formatBudget\(validMax\) : postedPrice \? 'Price required' : 'No maximum'/);

  // THE HIRE FLOW IS UNTOUCHED: a direct offer is one negotiated amount and
  // has no mode, so the posted-price guard cannot fire on it.
  assert.match(screen, /if \(!isHiring && posted &&/);
});

test('a4 · the money walk’s selectors are byte-identical in the default state', () => {
  const screen = read('screens/PostJobScreen.tsx');
  const modes = read('lib/pricingMode.ts');

  // Each of these is still the whole text or label of the element
  // .maestro/money-walk.yml finds, and the walk runs entirely in open bids.
  for (const selector of [
    'accessibilityLabel="Edit budget"',
    'Publish',
    'Back to Home',
    'View job and bids',
  ]) {
    assert.ok(screen.includes(selector), `${selector} is an E2E selector and must not move`);
  }
  assert.ok(modes.includes("fieldLabel: 'Maximum budget in dollars'"), 'the field the walk types into');
  assert.ok(modes.includes("title: 'Edit Budget'"), 'the title the walk and the harness wait on');

  // …and neither segment label shadows one of them.
  const walkStrings = [
    'Edit budget',
    'Edit Budget',
    'Maximum budget in dollars',
    'Save',
    'Cancel',
    'Publish',
    'STEP 4 OF 4',
    'Your job is live.',
    'Back to Home',
    'View job and bids',
    'Get notified?',
    'Not now',
  ];
  for (const { label } of PRICING_MODE_OPTIONS) {
    assert.ok(!walkStrings.includes(label), `the segment label ${label} must not shadow a selector`);
  }

  // The flow itself is untouched — no selector was added to it for this run.
  const walk = read('.maestro/money-walk.yml');
  assert.ok(!walk.includes('Ask for bids') && !walk.includes('Set a price'));
  assert.match(walk, /- tapOn: "Edit budget"/);
  assert.match(walk, /- tapOn: "Maximum budget in dollars"/);
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
