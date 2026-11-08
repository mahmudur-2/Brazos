import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const dir = (path) => readdirSync(new URL(`../${path}`, import.meta.url));
/** A data-URL module cannot resolve a relative specifier; give it the absolute one. */
const rulesUrl = new URL('../lib/paymentRules.ts', import.meta.url).href;

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// ---------------------------------------------------------------------------
// One fee, and the ledger decides what it is
// ---------------------------------------------------------------------------
//
// Job details advertised "EST. PAYOUT AFTER FEE $36" on a $40 job from a local
// ESTIMATED_PLATFORM_FEE_RATE = 0.1, while checkout and Earnings both reported
// no fee at all — because the payments RPCs write platform_fee_cents = 0. The
// marketplace was quoting a worker LESS than it pays them. The first fix was
// one shared client constant; R6a (D10) removed even that: the schedule lives
// in the database — quote_job_price() before a row exists, the row's own
// columns after — and the client reads, never computes.

test('the client carries no fee constant: quote_job_price() and the ledger row are the only fee sources', async () => {
  const payments = stripComments(await read('lib/payments.ts'));
  assert.doesNotMatch(payments, /PLATFORM_FEE_RATE|platformFeeCents|workerPayoutCents/);
  assert.match(payments, /export async function quoteJobPrice\(/);
  assert.match(payments, /rpc\('quote_job_price', \{ p_amount_cents: amountCents \}\)/);
  // The row carries the customer's figures and the worker's fee.
  assert.match(payments, /charge_amount_cents\?: number \| null;/);
  assert.match(payments, /customer_fee_cents\?: number \| null;/);
  assert.match(payments, /tax_cents\?: number \| null;/);
  assert.match(payments, /platform_fee_cents: number;/);
});

test('quoteJobPrice validates every figure the screens show, and never invents one', async () => {
  // Executed: lib/payments.ts with the supabase client stubbed to a canned
  // rpc(), the tests/fundingPath arrangement.
  const js = stripTypeScriptTypes(await read('lib/payments.ts'), { mode: 'strip' });
  // n5 (2026-09-04): lib/payments.ts imports formatBudget for the take-home
  // line; the REAL one is inlined (the tests/conversion pattern, function
  // replacer because the source carries `$$`) so the module stays loadable.
  const jobsJs = stripTypeScriptTypes(await read('lib/jobs.ts'), { mode: 'strip' });
  const fbStart = jobsJs.indexOf('export function formatBudget');
  const fbEnd = jobsJs.indexOf('\n}', fbStart);
  assert.ok(fbStart > 0 && fbEnd > fbStart, 'formatBudget must exist in lib/jobs.ts');
  const formatBudgetSource = jobsJs.slice(fbStart, fbEnd + 2);
  const load = async (rpc) => {
    const stubbed = js
      .replace(/import \{ supabase \} from '\.\/supabase';/, `const supabase = { rpc: ${rpc} };`)
      .replace(/from '\.\/paymentRules';/, `from '${rulesUrl}';`)
      .replace(/import \{ formatBudget \} from '\.\/jobs';/, () => formatBudgetSource);
    assert.notEqual(stubbed, js, 'the supabase import must be found and stubbed');
    assert.match(stubbed, /paymentRules\.ts';/, 'the pure re-export must be re-pointed to an absolute URL');
    assert.ok(!stubbed.includes("'./jobs'"), 'the jobs import must be inlined');
    return import(toDataUrl(stubbed));
  };
  const row = {
    job_price_cents: 4000,
    customer_fee_cents: 400,
    tax_cents: 0,
    total_cents: 4400,
    worker_fee_cents: 200,
    worker_receives_cents: 3800,
  };

  // The RPC returns a set; the first row is the quote.
  const asArray = await load(`async () => ({ data: [${JSON.stringify(row)}], error: null })`);
  assert.deepEqual(await asArray.quoteJobPrice(4000), { data: row, error: null });
  // A bare object is accepted too.
  const asObject = await load(`async () => ({ data: ${JSON.stringify(row)}, error: null })`);
  assert.deepEqual(await asObject.quoteJobPrice(4000), { data: row, error: null });
  // A missing figure is an error, not a zero.
  const { worker_receives_cents: _dropped, ...incomplete } = row;
  const missing = await load(`async () => ({ data: [${JSON.stringify(incomplete)}], error: null })`);
  const missingResult = await missing.quoteJobPrice(4000);
  assert.equal(missingResult.data, null);
  assert.match(missingResult.error.message, /price could not be worked out/);
  // A non-numeric figure is an error, not a coercion.
  const junk = await load(`async () => ({ data: [${JSON.stringify({ ...row, total_cents: '4400' })}], error: null })`);
  assert.equal((await junk.quoteJobPrice(4000)).data, null);
  // No row at all is an error.
  const empty = await load(`async () => ({ data: [], error: null })`);
  assert.equal((await empty.quoteJobPrice(4000)).data, null);
  // The database's own refusal is passed through.
  const refused = await load(`async () => ({ data: null, error: { message: 'Payments are paused right now.' } })`);
  assert.deepEqual(await refused.quoteJobPrice(4000), {
    data: null,
    error: { message: 'Payments are paused right now.' },
  });
  // The worker's figure is the RPC's, as returned: never more than the price
  // charged, and never recomputed here.
  assert.ok(row.worker_receives_cents <= row.job_price_cents);
  assert.equal((await asArray.quoteJobPrice(4000)).data.worker_receives_cents, 3800);
});

test('no screen carries its own fee rate or fee arithmetic', async () => {
  const offenders = [];
  for (const file of dir('screens').filter((f) => f.endsWith('.tsx'))) {
    const source = stripComments(await read(`screens/${file}`));
    // A local constant is what caused the contradiction.
    if (/(?:FEE_RATE|PLATFORM_FEE)\s*=\s*[\d.]/.test(source)) {
      offenders.push(`screens/${file} — declares its own fee rate`);
    }
    // ...as is spelling the deduction out by hand.
    if (/\*\s*\(\s*1\s*-\s*[\w.]*FEE/i.test(source)) {
      offenders.push(`screens/${file} — hand-rolls the after-fee arithmetic`);
    }
    // ...and so is importing a rate that no longer exists.
    if (/PLATFORM_FEE_RATE|platformFeeCents|workerPayoutCents/.test(source)) {
      offenders.push(`screens/${file} — imports a client fee constant`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'fee figures come from quote_job_price() or the ledger row, never from a screen'
  );
});

test('the three fee surfaces read the database, and Job details shows the RPC’s worker figure', async () => {
  const [jobDetail, checkout, earnings] = await Promise.all([
    read('screens/JobDetailScreen.tsx').then(stripComments),
    read('screens/CheckoutScreen.tsx').then(stripComments),
    read('screens/EarningsScreen.tsx').then(stripComments),
  ]);

  // Job details: quote_job_price() per distinct figure, worker_receives_cents
  // shown as returned, the stated budget alone when the read fails.
  assert.match(jobDetail, /quoteJobPrice\(cents\)/);
  assert.match(jobDetail, /worker_receives_cents/);
  assert.match(jobDetail, /distinct = quoteMin != null && quoteMin !== quoteMax \? \[quoteMin, quoteMax\] : \[quoteMax\]/);
  assert.match(jobDetail, /payoutQuote === 'failed'\) return budgetRangeLabel\(open\)/);
  assert.doesNotMatch(jobDetail, /budget\w*_cents\s*\*|\*\s*[\d.]+\s*\)?\s*;?\s*$/m);
  assert.doesNotMatch(jobDetail, /ESTIMATED_PLATFORM_FEE_RATE/);
  assert.doesNotMatch(jobDetail, /takes no platform fee/);
  // Checkout: the row's all-in figures, or the quote before a row exists.
  assert.match(checkout, /charge_amount_cents/);
  assert.match(checkout, /quoteJobPrice\(amountCents\)/);
  assert.match(checkout, /fee: payment\.customer_fee_cents \?\? 0/);
  // Earnings: the ledger's own sum, and no rate sentence.
  assert.match(earnings, /formatBudget\(s\.feeCents\)/);
  assert.doesNotMatch(earnings, /% rate/);
});

test('a worker is never quoted less than the ledger pays them — the figure is read, not derived', async () => {
  // With no client arithmetic, the only way Job details could understate the
  // payout is by showing something other than the RPC's worker figure.
  const jobDetail = stripComments(await read('screens/JobDetailScreen.tsx'));
  const label = jobDetail.slice(
    jobDetail.indexOf('const payoutEstimateLabel'),
    jobDetail.indexOf('return payoutQuote.min != null')
  );
  assert.ok(label.length > 0, 'the payout label helper exists');
  assert.doesNotMatch(label, /[-*\/]\s*\d|Math\./, 'the label performs no arithmetic');
  assert.match(jobDetail, /receives = \(quotes as JobPriceQuote\[\]\)\.map\(\(quote\) => quote\.worker_receives_cents\)/);
});

test('A7 (2026-10-03) — the worker reads one vocabulary for one job: the budget is labelled BUDGET, the take after the fee is "You get"', async () => {
  // Cards once said "EST. PAY $75" over the customer's budget, Job details "EST. PAYOUT AFTER FEE
  // $69.37", and the job screen "You receive $64.75" — three labels, and the first read a budget
  // as pay. The budget is named as the budget everywhere a worker sees it; the only after-fee
  // figure is "You get", read from the quote or the ledger row, never derived.
  for (const file of ['components/WorkerJobCard.tsx', 'screens/JobDetailScreen.tsx', 'screens/WorkerJobScreen.tsx', 'lib/payments.ts', 'components/HubCard.tsx', 'screens/MyJobsHubScreen.tsx']) {
    const src = stripComments(await read(file));
    assert.doesNotMatch(src, /EST\. PAY\b|Est\. payout|You receive\b/, `${file} keeps the one vocabulary`);
  }
  assert.match(stripComments(await read('components/WorkerJobCard.tsx')), />BUDGET</);
  assert.match(stripComments(await read('screens/JobDetailScreen.tsx')), /\? 'You get, after the fee'\s*: 'You get'\}/);
  assert.match(stripComments(await read('screens/WorkerJobScreen.tsx')), />You get</);
  assert.match(stripComments(await read('lib/payments.ts')), /return `You get \$\{formatBudget\(cents\)\} after the fee`;/);
  // The hub names its figure: the agreed price once hired, else the budget — never a take.
  assert.match(stripComments(await read('screens/MyJobsHubScreen.tsx')), /priceLabel=\{job\.final_amount_cents != null \? 'Agreed price:' : 'Budget:'\}/);
});
