import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/validation.ts executed with the REAL formatBudget, extracted verbatim
// from lib/jobs.ts at test time — a hand-written stub would let the asserted
// message drift from what users actually see.
const validationModule = (async () => {
  const jobsJs = stripTypeScriptTypes(await read('lib/jobs.ts'), { mode: 'strip' });
  const start = jobsJs.indexOf('export function formatBudget');
  const end = jobsJs.indexOf('\n}', start);
  assert.ok(start > 0 && end > start, 'formatBudget must exist in lib/jobs.ts');
  const formatBudget = jobsJs.slice(start, end + 2);

  const js = stripTypeScriptTypes(await read('lib/validation.ts'), { mode: 'strip' });
  // Replacer FUNCTION, not string: formatBudget's own `$${...}` template would
  // otherwise be mangled by String.replace's $-escape rules.
  const inlined = js.replace(/import \{ formatBudget \} from '\.\/jobs';/, () => formatBudget);
  assert.ok(!inlined.includes("from './jobs'"), 'the jobs import must be inlined');
  return import(toDataUrl(inlined));
})();

// ---------------------------------------------------------------------------
// phase75 / phase51 — the client mirror matches the database, operator included
// ---------------------------------------------------------------------------
//
// The database CHECKs are inclusive (`<= 10000000`; tips reject `> 100000`),
// so exactly at the ceiling is legal. An off-by-one where the client refuses
// a value the database accepts is a defect, which is why the SQL literals are
// asserted here alongside the constants: if a migration ever moves the
// ceiling, this test names both sides of the drift.

test('the client constants mirror the database ceilings, operator included', async () => {
  const { MONEY_CEILING_CENTS, TIP_CEILING_CENTS } = await validationModule;

  assert.equal(MONEY_CEILING_CENTS, 10_000_000);
  assert.equal(TIP_CEILING_CENTS, 100_000);
  assert.ok(Number.isInteger(MONEY_CEILING_CENTS));
  assert.ok(Number.isInteger(TIP_CEILING_CENTS));

  // phase75's ceilings, as the live schema (the baseline, pg_dump form) holds them.
  const baseline = await read('supabase/migrations/20260901000000_baseline.sql');
  const jobsCeiling = baseline.match(/CONSTRAINT "jobs_money_ceiling" CHECK [^\n]*/)?.[0] ?? '';
  // jobs: all three budget figures, inclusive.
  for (const column of ['budget_cents', 'budget_min_cents', 'budget_max_cents']) {
    assert.ok(
      jobsCeiling.includes(`(("${column}" > 0) AND ("${column}" <= 10000000))`),
      `jobs.${column} carries the inclusive ceiling`
    );
  }
  // job_offers and payments: same shape, inclusive.
  for (const table of ['job_offers', 'payments']) {
    assert.ok(
      baseline.includes(`CONSTRAINT "${table}_money_ceiling" CHECK ((("amount_cents" > 0) AND ("amount_cents" <= 10000000)))`),
      `${table} carries the inclusive amount ceiling`
    );
  }

  // The tip cap: the fee schedule's $1,000, and the trigger REJECTS only above
  // the limit, so 100000 itself is accepted.
  const stripe = await read('supabase/migrations/20260905000000_stripe_foundation.sql');
  assert.match(stripe, /tip_max_bps, tip_max_cents\)\s+select [^\n]*, 100000\n/);
  assert.match(stripe, /if new\.amount_cents > v_limit then/);
});

test('exactly at the ceiling is accepted; one cent above is refused', async () => {
  const { moneyCeilingError, MONEY_CEILING_CENTS } = await validationModule;

  assert.equal(moneyCeilingError(MONEY_CEILING_CENTS), null);
  assert.equal(moneyCeilingError(10_000_000), null);
  // Verbatim refusal copy — operator decision 2026-08-18.
  assert.equal(moneyCeilingError(10_000_001), 'Amount must be $100,000 or less.');

  // Absent amounts are legal — an empty budget is not an over-ceiling budget.
  assert.equal(moneyCeilingError(null), null);
  assert.equal(moneyCeilingError(undefined), null);
});

test('the tip cap boundary holds both ways', async () => {
  const { moneyCeilingError, TIP_CEILING_CENTS } = await validationModule;

  assert.equal(moneyCeilingError(100_000, TIP_CEILING_CENTS), null);
  // Verbatim refusal copy — operator decision 2026-08-18.
  assert.equal(moneyCeilingError(100_001, TIP_CEILING_CENTS), 'Tip must be $1,000 or less.');
  // The general ceiling does not bind tips down — only the explicit cap does.
  assert.equal(moneyCeilingError(100_001), null);
});

test('the refusal is written text, not a database error string', async () => {
  const { moneyCeilingError } = await validationModule;
  const msg = moneyCeilingError(10_000_001);

  assert.match(msg, /\$100,000/);
  // Nothing a CHECK violation would say. This is also exactly the vocabulary
  // lib/errorMessage.ts isSafeToShow() gates on, so passing here means
  // userMessage() hands the sentence through verbatim instead of swallowing
  // it into the generic fallback.
  assert.doesNotMatch(
    msg,
    /\b(column|relation|table|constraint|schema|function|type|operator|syntax|null value|violates|pg_|public\.|check|sqlstate|23514)\b/i
  );
  assert.ok(msg.length <= 160, 'must stay under isSafeToShow()’s length gate');
  // Integer cents throughout: the comparison is cents-to-cents, no dollar
  // arithmetic inside the validator.
  const src = stripComments(await read('lib/validation.ts'));
  assert.match(src, /amountCents <= ceilingCents/);
});

// ---------------------------------------------------------------------------
// Wiring — every amount entry point refuses BEFORE its RPC
// ---------------------------------------------------------------------------

function sliceOf(source, from, to) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${from} must exist`);
  const end = to ? source.indexOf(to, start) : source.length;
  assert.ok(end > start, `${to} must follow ${from}`);
  return source.slice(start, end);
}

function assertRefusesBeforeRpc(slice, checkNeedle, rpcNeedle) {
  const check = slice.indexOf(checkNeedle);
  const rpc = slice.indexOf(rpcNeedle);
  assert.ok(check >= 0, `${checkNeedle} must be called`);
  assert.ok(rpc >= 0, `${rpcNeedle} must be called`);
  assert.ok(check < rpc, `${checkNeedle} must run before ${rpcNeedle}`);
}

test('create_job and update_job_details refuse over-ceiling budgets before the RPC', async () => {
  const src = stripComments(await read('lib/jobs.ts'));

  // The shared helper covers all three budget figures.
  const helper = sliceOf(src, 'function jobBudgetCeilingError', 'export async function createJob');
  assert.match(helper, /moneyCeilingError\(input\.budgetCents\)/);
  assert.match(helper, /moneyCeilingError\(input\.budgetMinCents\)/);
  assert.match(helper, /moneyCeilingError\(input\.budgetMaxCents\)/);

  const createJob = sliceOf(src, 'export async function createJob', 'export async function updateJob');
  assertRefusesBeforeRpc(createJob, 'jobBudgetCeilingError(input)', ".rpc('create_job'");

  const updateJob = sliceOf(src, 'export async function updateJob', 'export async function deleteJob');
  assertRefusesBeforeRpc(updateJob, 'jobBudgetCeilingError(input)', ".rpc('update_job_details'");
});

test('create_offer and counter_offer refuse over-ceiling amounts before the RPC', async () => {
  const src = stripComments(await read('lib/offers.ts'));

  const bid = sliceOf(src, 'export async function createMarketplaceOffer', 'export type NewDirectOffer');
  assertRefusesBeforeRpc(bid, 'moneyCeilingError(input.amountCents)', ".rpc('create_offer'");

  const direct = sliceOf(src, 'export async function createDirectOffer', 'export async function counterOffer');
  assertRefusesBeforeRpc(direct, 'moneyCeilingError(input.amountCents)', ".rpc('create_offer'");

  const counter = sliceOf(src, 'export async function counterOffer', 'export async function declineOffer');
  assertRefusesBeforeRpc(counter, 'moneyCeilingError(amountCents)', ".rpc('counter_offer'");
});
