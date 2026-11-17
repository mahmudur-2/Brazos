// Money M2-1 (critic A4-09): process-settlements reports every run (record_timer_run, under its cron
// name), every request it makes carries a 10-second timeout, and a run has a 60-second budget. A5-04:
// a row starts only while its pass's accepted chain fits before the 50th second (A9-05: the one table
// CHAIN_CALLS, read below, never typed here), the passes and the rows take turns between runs, and a pass that had a ready row and started none is the run's
// error. A5-05: each run keeps its own deadlines and its own report. The database side (the expected rows, the late line of a
// task that never reported) is supabase/tests/483_money_timers.sql.
// Deno cannot run here, so the handler's own body runs under node as in intentCancel.test.mjs: its
// imports are swapped for stubs (classify.mjs's real exports among them), its types stripped,
// Deno.serve hands over the handler, and a fake fetch answers the database and the provider.
// Test values only; none is shaped like a real key.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

import * as connect from '../supabase/functions/connect-status/classify.mjs';
import * as classify from '../supabase/functions/process-settlements/classify.mjs';

const root = join(import.meta.dirname, '..');
const FILE = 'supabase/functions/process-settlements/index.ts';
const source = readFileSync(join(root, FILE), 'utf8').replace(/\r\n/g, '\n');
const IMPORT = /^import \{([^}]*)\} from '([^']+)';$/gm;

globalThis.__psRunStubs = {
  ...connect,
  ...classify,
  notConfigured: () => null,
  requireServiceRole: () => null,
  SECRET_KEY: 'service-for-the-test',
  serviceHeaders: () => ({ 'Content-Type': 'application/json' }),
  // The account cleanup pass (S1 decision 12) answers with its own failures; none by default.
  runAccountCleanups: async () => cleanupFailures,
};
let cleanupFailures = [];
const js = stripTypeScriptTypes(source.replace(IMPORT, (_, names) => `const {${names}} = globalThis.__psRunStubs;`), { mode: 'strip' });

let handler = null;
const ENV = { SUPABASE_URL: 'http://supabase.test', STRIPE_SECRET_KEY: 'stripe-secret-for-the-test' };
globalThis.Deno = { env: { get: (name) => ENV[name] }, serve: (h) => { handler = h; } };
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const STRIPE = 'https://api.stripe.com';
const DB = `${ENV.SUPABASE_URL}/rest/v1`;
const PAY = '3f2b6c1e-9a4d-4e7b-8c21-5d0f7a9b1c33';
const PAY2 = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

/** An intent read back as canceled (M2-2: the only answer that proves a cancel). */
const canceledIntent = (url) => {
  const ref = decodeURIComponent(url.match(/\/v1\/payment_intents\/([^/]+)/)[1]);
  return Response.json({ id: ref, object: 'payment_intent', status: 'canceled', amount: 500, amount_received: 0, currency: 'usd' });
};

/** A payout account read back with transfers active (M2-3b: connect-status's rule says enabled). */
const enabledAccount = (url) => {
  const id = decodeURIComponent(url.match(/\/v2\/core\/accounts\/([^?]+)/)[1]);
  return Response.json({
    id, object: 'v2.core.account',
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } },
    requirements: { entries: [] },
  });
};

/**
 * One drain run. `world(call)` answers a call or returns undefined for the defaults: empty queues,
 * every RPC true, the run report 204, one transfer/refund answered 2xx, a cancel answered with the
 * intent canceled, a fact stored 201 and applied to the row of its intent.
 */
async function drain(world = () => undefined, turn = 0) {
  const calls = [];
  const original = globalThis.fetch;
  // A5-04 (ii): the run's turn is its five-minute slot; turn 0 is the order the tests below name.
  const realDateNow = Date.now;
  Date.now = () => turn * 300_000;
  const paymentOf = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', body: init.body ?? '', signal: init.signal, headers: init.headers ?? {} };
    calls.push(call);
    const own = await world(call);
    const at = call.url;
    if (own !== undefined) {
      if (call.method === 'GET' && at.startsWith(`${DB}/intents_to_cancel?`)) for (const row of await own.clone().json()) paymentOf.set(row.provider_ref, row.id);
      return own;
    }
    if (call.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
    if (at.startsWith(`${DB}/transfers_ready?`) || at.startsWith(`${DB}/refunds_ready?`) || at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json([]);
    if (at.startsWith(`${DB}/payout_accounts_due?`)) return Response.json([]);
    if (at.startsWith(`${DB}/payment_events?`)) return Response.json([]);
    if (at.startsWith(`${STRIPE}/v1/events?`)) return Response.json({ object: 'list', data: [], has_more: false });
    if (at === `${DB}/rpc/record_timer_run`) return new Response(null, { status: 204 });
    if (at === `${DB}/payment_events`) return new Response(null, { status: 201 });
    if (at === `${DB}/rpc/apply_payment_event`) {
      const id = JSON.parse(call.body).p_event_id;
      return Response.json({ ok: true, payment_id: id.startsWith('process-settlements:reread:') ? paymentOf.get(id.split(':')[2]) ?? null : PAY });
    }
    if (at.startsWith(`${DB}/rpc/`)) return Response.json(true);
    if (at === `${STRIPE}/v1/transfers`) return Response.json({ id: 'tr_t', amount: 500 });
    if (at === `${STRIPE}/v1/refunds`) return Response.json({ id: 're_t', amount: 700, status: 'succeeded' });
    if (at.startsWith(`${STRIPE}/v1/payment_intents/`)) return canceledIntent(at);
    if (at.startsWith(`${STRIPE}/v2/core/accounts/`)) return enabledAccount(at);
    return new Response('unexpected', { status: 599 });
  };
  const log = console.error;
  console.error = () => {};
  try {
    const res = await handler(new Request('http://edge.test/process-settlements', { method: 'POST' }));
    return { json: await res.json(), calls };
  } finally {
    console.error = log;
    globalThis.fetch = original;
    Date.now = realDateNow;
  }
}

const reports = (calls) => calls.filter((c) => c.url === `${DB}/rpc/record_timer_run`).map((c) => JSON.parse(c.body));
const posts = (calls) => calls.filter((c) => c.method === 'POST').map((c) => c.url);
const oneRefund = (call) => (call.url.startsWith(`${DB}/refunds_ready?`)
  ? Response.json([{ id: PAY, provider_ref: 'pi_r', refund_cents: 700, refund_attempts: 0 }]) : undefined);
/** A9-05: the one table, read from the drain's source (the calls of each pass's accepted chain). */
const chainTable = () => {
  const found = source.match(/const CHAIN_CALLS: Record<PassName, number> = (\{[^}]*\});/);
  assert.ok(found, 'the one table CHAIN_CALLS is in the drain');
  return JSON.parse(found[1].replace(/(\w+):/g, '"$1":'));
};
/** The moment (ms of the run) from which a row of `pass` no longer starts: the 50th second less its chain. */
const lastStart = (pass) => 50_000 - chainTable()[pass] * 10_000;
/** How many rows of `pass` start, back to back from 0 s, when each takes `ms` of the run. */
const startsIn = (pass, ms) => Math.ceil(lastStart(pass) / ms);

test('0 · the harness: the handler was served', () => {
  assert.equal(typeof handler, 'function');
});

test('M2-1 · a clean run reports itself last, under its cron name, with no error', async () => {
  const r = await drain(oneRefund);
  assert.deepEqual(reports(r.calls), [{ p_name: 'brazos-process-settlements', p_error: null, p_stale_after: null }]);
  assert.equal(posts(r.calls).at(-1), `${DB}/rpc/record_timer_run`, 'the report is the last write');
  assert.equal(r.json.ok, true);
  assert.deepEqual(r.json.refunds, { attempted: 1, succeeded: 1, deferred: 0, failed: 0, defects: 0, blocked: 0 });
  assert.deepEqual(r.json.budget, { not_started: { payouts: 0, transfers: 0, refunds: 0, intents: 0, events: 0 }, skipped: [] });
});

test('M2-1 · a write-back that failed is the run\'s error, not only a count', async () => {
  const r = await drain((call) => oneRefund(call)
    ?? (call.url === `${DB}/rpc/record_settlement_sent` ? new Response('down', { status: 500 }) : undefined));
  assert.equal(r.json.refunds.defects, 1);
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), ['refunds: 1 defect']);
  assert.equal(r.json.ok, true, 'ok keeps its old meaning (no pass threw); the report carries the defect');
});

test('M2-1 · a begin that failed and a cancel stamp that failed are named per pass', async () => {
  const r = await drain((call) => {
    if (call.url.startsWith(`${DB}/intents_to_cancel?`)) return Response.json([{ id: 'pay-i', provider_ref: 'pi_x' }, { id: 'pay-j', provider_ref: 'pi_y' }]);
    if (call.url === `${DB}/rpc/record_intent_cancel`) return new Response('down', { status: 500 });
    return oneRefund(call) ?? (call.url === `${DB}/rpc/settlement_send_begin` ? new Response('down', { status: 500 }) : undefined);
  });
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), ['refunds: 1 defect; intents: 2 defects']);
});

test('M2-1 · a pass that throws is the run\'s error, with its message', async () => {
  const r = await drain((call) => (call.url.startsWith(`${DB}/transfers_ready?`) ? new Response('down', { status: 503 }) : undefined));
  assert.equal(r.json.ok, false);
  assert.deepEqual(reports(r.calls).map((b) => b.p_error),
    ['transfers: transfers_ready?select=id,payee_id,transfer_cents,transfer_attempts&limit=25 failed: 503 down']);
});

test('A14-F F2 · the account cleanup\'s own failures are the run\'s errors: the report carries them, after the money passes\' own', async () => {
  const lines = ['account cleanup: the claim failed (500)', "account cleanup: a row's result was not saved (no answer)"];
  cleanupFailures = lines;
  try {
    const r = await drain((call) => (call.url.startsWith(`${DB}/transfers_ready?`) ? new Response('down', { status: 503 }) : undefined));
    assert.equal(r.json.ok, false);
    assert.deepEqual(reports(r.calls).map((b) => b.p_error),
      [`transfers: transfers_ready?select=id,payee_id,transfer_cents,transfer_attempts&limit=25 failed: 503 down; ${lines.join('; ')}`]);
    assert.deepEqual(r.json.errors.slice(1), lines);
  } finally {
    cleanupFailures = [];
  }
  // None handed back (a quiet pass, or a Stripe refusal its row records): the run stays clean.
  const clean = await drain();
  assert.deepEqual(reports(clean.calls).map((b) => b.p_error), [null]);
  assert.equal(clean.json.ok, true);
});

test('M2-1 · a report that cannot be written makes the run not ok (the task then shows late)', async () => {
  for (const answer of [() => new Response('down', { status: 500 }), () => { throw new Error('database down'); }]) {
    const r = await drain((call) => (call.url === `${DB}/rpc/record_timer_run` ? answer() : undefined));
    assert.equal(r.json.ok, false);
    assert.deepEqual(r.json.errors, ['timer: record_timer_run was not written']);
  }
});

test('M2-1 · every request, to the database and to the provider, carries a timeout signal', async () => {
  const r = await drain((call) => {
    const at = call.url;
    if (call.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/1' } });
    if (at.startsWith(`${DB}/transfers_ready?`)) return Response.json([{ id: PAY2, payee_id: 'u1', transfer_cents: 500, transfer_attempts: 0 }]);
    if (at.startsWith(`${DB}/payment_accounts?`)) return Response.json([{ user_id: 'u1', stripe_account_id: 'acct_t' }]);
    // M2-2: one cancel proven by its own answer, one that is read and moved back.
    if (at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json([{ id: 'pay-i', provider_ref: 'pi_x' }, { id: 'pay-k', provider_ref: 'pi_k' }]);
    if (at === `${STRIPE}/v1/payment_intents/pi_k/cancel` || at === `${STRIPE}/v1/payment_intents/pi_k`) return Response.json({ error: { code: 'probe' } }, { status: 500 });
    if (at === `${STRIPE}/v1/refunds`) return Response.json({ id: 're_t', amount: 700, status: 'failed' });
    return oneRefund(call);
  });
  const kinds = new Set(r.calls.map((c) => c.url.replace(/\?.*$/, '').replace(/\/payment_intents\/[^/]+/, '/payment_intents/x')));
  for (const url of [`${DB}/transfers_ready`, `${DB}/payment_accounts`, `${DB}/rpc/settlement_send_begin`, `${STRIPE}/v1/transfers`,
    `${DB}/rpc/record_settlement_sent`, `${DB}/refunds_ready`, `${STRIPE}/v1/refunds`, `${DB}/payment_events`,
    `${DB}/rpc/apply_payment_event`, `${DB}/rpc/record_settlement_result`, `${DB}/intents_to_cancel`,
    `${STRIPE}/v1/payment_intents/x/cancel`, `${STRIPE}/v1/payment_intents/x`, `${DB}/rpc/record_intent_cancel`,
    `${DB}/rpc/record_intent_check`, `${DB}/rpc/record_timer_run`]) {
    assert.ok(kinds.has(url), `${url} was called`);
  }
  for (const c of r.calls) assert.ok(c.signal instanceof AbortSignal, `${c.method} ${c.url}: a timeout signal`);
  assert.match(source, /const REQUEST_TIMEOUT_MS = 10_000;/);
  assert.match(source, /function timed\(run: Run, init: RequestInit = \{\}, endBy = run\.requestsEndBy\): RequestInit \{\n  const ms = Math\.min\(REQUEST_TIMEOUT_MS, endBy - performance\.now\(\)\);\n  return \{ \.\.\.init, signal: AbortSignal\.timeout\(Math\.max\(1, Math\.floor\(ms\)\)\) \};/);
  const code = source.replace(/\/\/[^\n]*/g, '');
  assert.equal((code.match(/\bfetch\(/g) ?? []).length, (code.match(/\bfetch\([^;]*?timed\(/gs) ?? []).length, 'every fetch is given timed()');
});

test('M2-1 · a provider call that times out is an unknown answer: the same key next tick', async () => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  assert.equal(classify.settlementVerdict('refund', { threw: timeout }).next, 'same_key');
  assert.equal(classify.settlementVerdict('transfer', { threw: timeout }).next, 'same_key');
  const r = await drain((call) => {
    if (call.url === `${STRIPE}/v1/refunds`) throw timeout;
    return oneRefund(call);
  });
  const result = r.calls.filter((c) => c.url === `${DB}/rpc/record_settlement_result`).map((c) => JSON.parse(c.body));
  assert.deepEqual(result.map((b) => [b.p_next, b.p_error]), [['same_key', 'threw: The operation was aborted due to timeout']]);
  assert.equal(r.json.refunds.deferred, 1);
});

// A5-04 (i) (rewritten from "M2-1 · the budget: no row starts once less than 25 of the 60 seconds are
// left"), A9-05 (was "room for one whole try"): a row starts only while its pass's accepted chain, each
// call at its full 10 seconds, ends before the 50th second: for the run, not a pass share.
test('A5-04 (i), A9-05 · a row starts only while its accepted chain fits before the 50th second; a started row finishes', async () => {
  const rows = [1, 2, 3].map((n) => ({ id: `pay-${n}`, provider_ref: `pi_${n}` }));
  let clock = 0;
  const realNow = performance.now;
  Object.defineProperty(performance, 'now', { value: () => clock, configurable: true, writable: true });
  try {
    // Each cancel takes 0.6 of the cancels' last start: rows start at 0 s and at that step; at twice
    // the step the cancel's chain no longer fits.
    const step = lastStart('intents') * 0.6;
    const r = await drain((call) => {
      if (call.url.startsWith(`${DB}/intents_to_cancel?`)) return Response.json(rows);
      if (call.url.startsWith(`${STRIPE}/v1/payment_intents/`)) { clock += step; return canceledIntent(call.url); }
      return undefined;
    });
    assert.equal(r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/payment_intents/`)).length, 2, 'two rows started; the run had no room for the third');
    assert.equal(r.calls.filter((c) => c.url === `${DB}/rpc/record_intent_cancel`).length, 2, 'each started row was written back');
    assert.deepEqual(r.json.budget, { not_started: { payouts: 0, transfers: 0, refunds: 0, intents: 1, events: 0 }, skipped: [] },
      'the event scan, whose chain is shorter, still starts');
    assert.deepEqual(r.json.stalled, [], 'rows were started: no stall');
    assert.equal(r.json.ok, true, 'a row left for the next tick is not a failure');
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null]);
    assert.equal(posts(r.calls).at(-1), `${DB}/rpc/record_timer_run`, 'the report is still written');

    // A later run starts its own budget.
    clock = 1_000_000;
    const next = await drain((call) => (call.url.startsWith(`${DB}/intents_to_cancel?`) ? Response.json(rows.slice(2)) : undefined));
    assert.equal(next.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/payment_intents/`)).length, 1, 'the next run starts the row left over');
  } finally {
    Object.defineProperty(performance, 'now', { value: realNow, configurable: true, writable: true });
  }
  assert.match(source, /const RUN_BUDGET_MS = 60_000;/);
  assert.match(source, /return performance\.now\(\) \+ calls \* REQUEST_TIMEOUT_MS < run\.requestsEndBy;/);
  assert.match(source, /function mayStart\(run: Run, name: PassName\): boolean \{\n  return fits\(run, CHAIN_CALLS\[name\]\);\n\}/);
  assert.deepEqual([...source.matchAll(/if \(!mayStart\(run, '(\w+)'\)\) \{/g)].map((m) => m[1]),
    ['payouts', 'transfers', 'refunds', 'intents', 'events'], 'the check stands before the rows of each of the five passes (the scan\'s events), each with its own chain');
  assert.equal((source.match(/if \(!\(await beginPass\(run, /g) ?? []).length, 5, 'each pass begins through beginPass');
});

// ---------------------------------------------------------------------------
// M2-1b (A4-09 iii), A5-04, A5-05: the 60 seconds bound every request; the passes take turns between runs.
// ---------------------------------------------------------------------------
/**
 * Runs `body` with a fake run clock (ms) and records the timeout every request was given, in order.
 * A request given 1 ms (its deadline had passed) is cut: the fake fetch throws a TimeoutError for it.
 */
async function withClock(body) {
  const state = { clock: 0, timeouts: [] };
  const realNow = performance.now;
  const realTimeout = AbortSignal.timeout;
  Object.defineProperty(performance, 'now', { value: () => state.clock, configurable: true, writable: true });
  AbortSignal.timeout = (ms) => {
    state.timeouts.push(ms);
    const signal = realTimeout.call(AbortSignal, 60_000);
    signal.givenMs = ms;
    return signal;
  };
  try {
    return await body(state);
  } finally {
    Object.defineProperty(performance, 'now', { value: realNow, configurable: true, writable: true });
    AbortSignal.timeout = realTimeout;
  }
}
const rowsOf = (n, make) => Array.from({ length: n }, (_, i) => make(i));
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
/** A HEAD count answer per view, from `sizes` (0 when not named). */
const countOf = (sizes) => (call) => {
  if (call.method !== 'HEAD') return undefined;
  const view = call.url.replace(`${DB}/`, '').replace(/\?.*$/, '');
  return new Response(null, { status: 200, headers: { 'content-range': `*/${sizes[view] ?? 0}` } });
};
const cutIfLate = (call) => {
  if (call.signal?.givenMs === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  return undefined;
};

test('M2-1b · no request runs past the 50th second; the report has the last 10 seconds to itself', async () => {
  await withClock(async (state) => {
    // One refund whose POST answers at 45 s: its write-back may take only the 5 seconds left.
    const r = await drain((call) => {
      if (call.url === `${STRIPE}/v1/refunds`) { state.clock = 45_000; return Response.json({ id: 're_t', amount: 700, status: 'succeeded' }); }
      if (call.url === `${DB}/rpc/record_settlement_sent`) state.clock = 49_600;
      return oneRefund(call);
    });
    const given = r.calls.map((c, i) => [c.method === 'HEAD' ? 'HEAD' : c.url.replace(/\?.*$/, '').replace(DB, 'db').replace(STRIPE, 'stripe'), state.timeouts[i]]);
    assert.equal(state.timeouts.length, r.calls.length, 'one timeout per request');
    assert.deepEqual(given.filter(([url]) => url === 'stripe/v1/refunds'), [['stripe/v1/refunds', 10_000]], 'at 0 s the POST has its 10 seconds');
    assert.deepEqual(given.filter(([url]) => url === 'db/rpc/record_settlement_sent'), [['db/rpc/record_settlement_sent', 5_000]], 'at 45 s the write-back has the 5 seconds left before the 50th');
    assert.deepEqual(given.at(-1), ['db/rpc/record_timer_run', 10_000], 'the report, last, has its own 10 seconds');
    assert.ok(state.timeouts.slice(0, -1).every((ms) => ms >= 1 && ms <= 10_000), 'no request is given more than 10 seconds');
    const late = given.slice(given.findIndex(([url]) => url === 'db/rpc/record_settlement_sent') + 1, -1);
    assert.deepEqual(late, [['HEAD', 400], ['HEAD', 400], ['HEAD', 400]], 'the counts after 49.6 s have the 0.4 s left');
    // The intents pass began at 49.6 s with no room for a try: it read no rows, only counted them (none).
    assert.deepEqual(r.json.budget.skipped, ['intents', 'events']);
    assert.equal(r.calls.some((c) => c.method === 'GET' && c.url.startsWith(`${DB}/intents_to_cancel?`)), false, 'a skipped pass reads no rows');
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null], 'an empty queue that was skipped is not a failure');
  });
  assert.match(source, /const REPORT_RESERVE_MS = REQUEST_TIMEOUT_MS;/);
  assert.match(source, /const requestsEndBy = start \+ RUN_BUDGET_MS - REPORT_RESERVE_MS;/);
  assert.match(source, /reportEndsBy: start \+ RUN_BUDGET_MS,/);
  assert.match(source, /serviceRpc\(run, 'record_timer_run', \{ p_name: TIMER_NAME, p_error: error, p_stale_after: null \}, run\.reportEndsBy\)/,
    'the report alone runs to the 60th second');
});

test('A5-05 · the report has its own absolute deadline; budget used up before the write-back is a defect the report names', async () => {
  await withClock(async (state) => {
    // The POST answers at 55 s: the write-back's deadline (the 50th second) has passed, so it is cut;
    // the intents pass cannot even count; the report, at 55 s, has the 5 seconds left before the 60th.
    const r = await drain((call) => {
      if (call.url === `${STRIPE}/v1/refunds`) { state.clock = 55_000; return Response.json({ id: 're_t', amount: 700, status: 'succeeded' }); }
      return cutIfLate(call) ?? oneRefund(call);
    });
    const given = r.calls.map((c, i) => [c.url.replace(/\?.*$/, '').replace(DB, 'db').replace(STRIPE, 'stripe'), state.timeouts[i]]);
    assert.deepEqual(given.filter(([url]) => url === 'db/rpc/record_settlement_sent'), [['db/rpc/record_settlement_sent', 1]], 'the write-back was cut');
    assert.deepEqual(r.json.refunds, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 1, blocked: 0 }, 'the same key next tick');
    assert.deepEqual(given.at(-1), ['db/rpc/record_timer_run', 5_000], 'the report has the 5 seconds left before the 60th');
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), ['refunds: 1 defect; intents: not read, the run had no time left']);
  });
  await withClock(async (state) => {
    // A run that reaches the report after its 60th second: the report is cut, and the run says so.
    const r = await drain((call) => {
      if (call.url === `${STRIPE}/v1/refunds`) { state.clock = 61_000; return Response.json({ id: 're_t', amount: 700, status: 'succeeded' }); }
      return cutIfLate(call) ?? oneRefund(call);
    });
    assert.equal(state.timeouts.at(-1), 1, 'the report was given no time');
    assert.equal(r.json.ok, false);
    assert.ok(r.json.errors.includes('timer: record_timer_run was not written'));
  });
});

test('A5-04 (ii, iii) · a long transfer queue can take one run, but the turn moves and the stall is the run\'s error', async () => {
  const transfers = rowsOf(25, (i) => ({ id: uuid(i), payee_id: 'u1', transfer_cents: 500, transfer_attempts: 0 }));
  const refunds = rowsOf(3, (i) => ({ id: uuid(100 + i), provider_ref: `pi_r${i}`, refund_cents: 700, refund_attempts: 0 }));
  const intents = rowsOf(3, (i) => ({ id: uuid(200 + i), provider_ref: `pi_c${i}` }));
  const world = (state) => (call) => {
    const at = call.url;
    const counted = countOf({ transfers_due: 25, transfers_ready: 25, refunds_due: 3, refunds_ready: 3, intents_to_cancel: 3 })(call);
    if (counted) return counted;
    if (at.startsWith(`${DB}/transfers_ready?`)) return Response.json(transfers);
    if (at.startsWith(`${DB}/payment_accounts?`)) return Response.json([{ user_id: 'u1', stripe_account_id: 'acct_t' }]);
    if (at.startsWith(`${DB}/refunds_ready?`)) return Response.json(refunds);
    if (at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json(intents);
    if (at.startsWith(`${STRIPE}/`)) state.clock += 5_000;
    return undefined;
  };
  const started = (r, prefix) => r.calls.filter((c) => c.url.startsWith(`${STRIPE}${prefix}`)).length;
  await withClock(async (state) => {
    // Turn 0: payouts, transfers, refunds, intents, events. Transfers start every 5 s until their chain
    // no longer fits; then the refunds and the cancels start none, and the report says so. The event
    // scan's chain is shorter: it still reads.
    const r = await drain(world(state), 0);
    assert.equal(started(r, '/v1/transfers'), startsIn('transfers', 5_000));
    assert.equal(started(r, '/v1/refunds'), 0);
    assert.deepEqual(r.json.budget, { not_started: { payouts: 0, transfers: 25 - startsIn('transfers', 5_000), refunds: 0, intents: 0, events: 0 }, skipped: ['refunds', 'intents'] });
    assert.deepEqual(reports(r.calls).map((b) => b.p_error),
      ['refunds: 3 ready, none started, the run had no time left; intents: 3 ready, none started, the run had no time left']);
  });
  await withClock(async (state) => {
    // Turn 2: refunds, intents, events, payouts, transfers. The refunds go first and take 15 s: past
    // the cancels' last start (their chain is the longest), so the cancels wait for their own turn.
    const r = await drain(world(state), 2);
    assert.equal(started(r, '/v1/refunds'), 3);
    assert.ok(15_000 >= lastStart('intents'), 'the fixture: the refunds end past the cancels\' last start');
    assert.equal(started(r, '/v1/payment_intents/'), 0);
    assert.equal(started(r, '/v1/transfers'), 0);
    assert.deepEqual(reports(r.calls).map((b) => b.p_error),
      ['intents: 3 ready, none started, the run had no time left; transfers: 25 ready, none started, the run had no time left']);
  });
  await withClock(async (state) => {
    // Turn 3: intents first. The cancels start every 5 s until their chain no longer fits.
    const r = await drain(world(state), 3);
    assert.equal(started(r, '/v1/payment_intents/'), startsIn('intents', 5_000));
    assert.equal(r.json.budget.not_started.intents, 3 - startsIn('intents', 5_000));
  });
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((t) => classify.turnOrder(t, ['payouts', 'transfers', 'refunds', 'intents', 'events']).join(',')),
    ['payouts,transfers,refunds,intents,events', 'transfers,refunds,intents,events,payouts', 'refunds,intents,events,payouts,transfers',
      'intents,events,payouts,transfers,refunds', 'events,payouts,transfers,refunds,intents', 'payouts,transfers,refunds,intents,events'],
    'each pass goes first once every 5 runs');
});

test('A5-04 (i) · no pass has a share: a pass uses the time the passes before it left', async () => {
  await withClock(async (state) => {
    // No transfer is due; 10 refunds and 10 cancels, 5 s each. Refunds start every 5 s until their
    // chain no longer fits; by then the cancels' chain does not fit either. The scan's still does.
    const refunds = rowsOf(10, (i) => ({ id: uuid(100 + i), provider_ref: `pi_r${i}`, refund_cents: 700, refund_attempts: 0 }));
    const intents = rowsOf(10, (i) => ({ id: uuid(200 + i), provider_ref: `pi_c${i}` }));
    const r = await drain((call) => {
      const at = call.url;
      const counted = countOf({ refunds_due: 10, refunds_ready: 10, intents_to_cancel: 10 })(call);
      if (counted) return counted;
      if (at.startsWith(`${DB}/refunds_ready?`)) return Response.json(refunds);
      if (at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json(intents);
      if (at.startsWith(`${STRIPE}/`)) state.clock += 5_000;
      return undefined;
    });
    assert.deepEqual(r.json.budget, { not_started: { payouts: 0, transfers: 0, refunds: 10 - startsIn('refunds', 5_000), intents: 0, events: 0 }, skipped: ['intents'] });
    assert.deepEqual(r.json.stalled, ['intents: 10 ready, none started, the run had no time left']);
  });
});

test('A5-04 (the critic\'s table), A9-05 · slow but successful database reads, run after run: the first pass starts its row when its chain fits, and a queue left untouched is the run\'s error', async () => {
  // Every database request takes 6 s and answers, when its timeout allows 6 s (else it is cut when its
  // timeout ends); one ready row in each queue; the provider is quick. The critic's run, under the old
  // shares, started no row in any run and reported success. A9-05: the cancels' chain is the longest;
  // at 6 s a call the note and the cancels' read end past its last start, so the cancels start in no
  // run, and every run names them.
  const world = (state) => (call) => {
    const at = call.url;
    if (at.startsWith(DB)) {
      const ms = call.signal?.givenMs ?? 10_000;
      if (ms < 6_000) { state.clock += ms; throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }
      state.clock += 6_000;
    }
    const counted = countOf({ transfers_due: 1, transfers_ready: 1, refunds_due: 1, refunds_ready: 1, intents_to_cancel: 1, payout_accounts_due: 1 })(call);
    if (counted) return counted;
    if (at.startsWith(`${DB}/payout_accounts_due?`)) return Response.json([{ user_id: 'u-w1', stripe_account_id: 'acct_w1', payouts_checked_at: null }]);
    if (at.startsWith(`${DB}/transfers_ready?`)) return Response.json([{ id: PAY2, payee_id: 'u1', transfer_cents: 500, transfer_attempts: 0 }]);
    if (at.startsWith(`${DB}/payment_accounts?`)) return Response.json([{ user_id: 'u1', stripe_account_id: 'acct_t' }]);
    if (at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json([{ id: 'pay-i', provider_ref: 'pi_x' }]);
    return oneRefund(call);
  };
  const tried = { payouts: 0, transfers: 0, refunds: 0, intents: 0 };
  for (const turn of [0, 1, 2, 3]) {
    await withClock(async (state) => {
      const r = await drain(world(state), turn);
      const first = classify.turnOrder(turn, ['payouts', 'transfers', 'refunds', 'intents', 'events'])[0];
      const did = {
        payouts: r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v2/core/accounts/`)).length,
        transfers: r.calls.filter((c) => c.url === `${STRIPE}/v1/transfers`).length,
        refunds: r.calls.filter((c) => c.url === `${STRIPE}/v1/refunds`).length,
        intents: r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/payment_intents/`) && c.method === 'POST').length,
      };
      const reached = 2 * 6_000; // the note, then the pass's read of its rows
      assert.equal(did[first], reached < lastStart(first) ? 1 : 0, `turn ${turn}: the pass that goes first (${first}) starts its row when its chain fits`);
      for (const [name, n] of Object.entries(did)) tried[name] += n;
      const untouched = Object.entries(did).filter(([, n]) => n === 0).map(([name]) => name);
      const error = reports(r.calls)[0].p_error ?? '';
      for (const name of untouched) assert.match(error, new RegExp(`${name}: (1 ready, none started, the run had no time left|not read, the run had no time left|the run had no time left, and its ready rows could not be counted)`), `turn ${turn}: ${name} untouched is named`);
      assert.equal(r.json.ok, true, `turn ${turn}: the report was written`);
    });
  }
  // A9-03 (a): the note's 6 s come first, so turn 0's second pass (transfers) no longer reaches its row.
  // A9-05: the cancels never fit at 6 s a call; the run's error names them in every run (above). On
  // turn 3 the time the cancels could not use goes to the payout read that follows them.
  assert.deepEqual(tried, { payouts: 2, transfers: 1, refunds: 1, intents: 0 }, 'over four runs every queue but the cancels was tried');
});

test('A5-04 (ii) · rowOrder: the rows of a pass start from an offset that moves each time the pass goes first', () => {
  const rows = ['a', 'b', 'c'];
  assert.deepEqual([0, 5, 10, 15].map((t) => classify.rowOrder(t, 5, rows).join('')), ['abc', 'bca', 'cab', 'abc']);
  assert.deepEqual(classify.rowOrder(9, 5, rows), ['b', 'c', 'a'], 'turns 5 to 9 share one offset');
  assert.deepEqual(classify.rowOrder(-1, 4, rows), rows, 'a bad turn is turn 0');
  assert.deepEqual(classify.rowOrder(3, 4, []), []);
  assert.deepEqual(rows, ['a', 'b', 'c'], 'the list given is not changed');
  assert.deepEqual(classify.turnOrder(Number.NaN, ['x', 'y']), ['x', 'y']);
  // rowOrder alone (A9-03 d: no bound on a row's wait in the queue, which is the view's order): each of
  // the rows one read holds is first exactly once in passes x rows turns.
  for (let p = 0; p < 5; p++) {
    for (let j = 0; j < 25; j++) {
      const queue = Array.from({ length: 25 }, (_, i) => i);
      const turns = Array.from({ length: 125 }, (_, t) => t)
        .filter((t) => classify.turnOrder(t, [0, 1, 2, 3, 4])[0] === p && classify.rowOrder(t, 5, queue)[0] === j);
      assert.equal(turns.length, 1, `pass ${p}, row ${j}: first exactly once in 5 x 25 turns of the same read`);
    }
  }
});

test('A5-05 · two runs that overlap in one instance keep their own deadline and their own report', async () => {
  await withClock(async (state) => {
    const calls = [];
    const original = globalThis.fetch;
    const realDateNow = Date.now;
    Date.now = () => 0;
    let releaseA;
    const heldA = new Promise((resolve) => { releaseA = resolve; });
    let first = true;
    const refundRows = [{ id: PAY, provider_ref: 'pi_r', refund_cents: 700, refund_attempts: 0 }];
    globalThis.fetch = async (url, init = {}) => {
      const call = { url: String(url), method: init.method ?? 'GET', body: init.body ?? '', ms: init.signal?.givenMs };
      calls.push(call);
      if (first) { first = false; await heldA; return Response.json([]); } // run A's first request waits
      const at = call.url;
      if (call.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/1' } });
      if (at.startsWith(`${DB}/refunds_ready?`)) return Response.json(refundRows);
      if (at.startsWith(`${STRIPE}/v1/events?`)) return Response.json({ object: 'list', data: [], has_more: false });
      if (at.includes('_ready?') || at.includes('_due?') || at.includes('intents_to_cancel?')) return Response.json([]);
      if (at === `${DB}/rpc/record_timer_run`) return new Response(null, { status: 204 });
      if (at.startsWith(`${DB}/rpc/`)) return Response.json(true);
      if (at === `${STRIPE}/v1/refunds`) return Response.json({ id: 're_t', amount: 700, status: 'succeeded' });
      return new Response('unexpected', { status: 599 });
    };
    const log = console.error;
    console.error = () => {};
    try {
      const request = () => new Request('http://edge.test/process-settlements', { method: 'POST' });
      const a = handler(request()); // run A starts at 0 s; its first request (A9-03 a: the note) is held
      await new Promise((resolve) => setTimeout(resolve, 0));
      state.clock = 40_000; // run B starts at 40 s and runs to its end, still at 40 s
      const b = await (await handler(request())).json();
      assert.equal(b.refunds.succeeded, 1, 'run B, by its own clock, sent its refund');
      assert.deepEqual(b.budget.skipped, []);
      state.clock = 55_000; // run A goes on at 55 s: past its own 50th second, whatever B set
      releaseA();
      const aJson = await (await a).json();
      assert.equal(aJson.refunds.attempted, 0, 'run A started no row after its own last start');
      assert.deepEqual(aJson.budget.skipped, ['payouts', 'transfers', 'refunds', 'intents', 'events'], 'run A skipped by its own clock');
      const timerReports = calls.filter((c) => c.url === `${DB}/rpc/record_timer_run`);
      assert.deepEqual(timerReports.map((c) => JSON.parse(c.body).p_error), [null,
        'payouts: not read, the run had no time left; transfers: not read, the run had no time left; refunds: not read, the run had no time left; intents: not read, the run had no time left'],
      'B reported its clean run; A reported its own stalls');
      assert.deepEqual(timerReports.map((c) => c.ms), [10_000, 5_000], 'B\'s report runs to B\'s 60th second; A\'s to A\'s own (5 s left at 55 s)');
      assert.equal(calls.filter((c) => c.method === 'GET' && c.url.startsWith(`${DB}/refunds_ready?`)).length, 1, 'only B read the refund queue');
    } finally {
      console.error = log;
      globalThis.fetch = original;
      Date.now = realDateNow;
    }
  });
});

// ---------------------------------------------------------------------------
// M2-3b (R-E): pass zero reads the payout accounts again (supabase/tests/486_payout_reread.sql).
// ---------------------------------------------------------------------------
const W1 = '0a1b2c3d-0000-4000-8000-000000000001';
const W2 = '0a1b2c3d-0000-4000-8000-000000000002';
const SEEN = '2026-11-16T10:00:00.123456+00:00';
const dueAccounts = (rows) => (call) => (call.url.startsWith(`${DB}/payout_accounts_due?`) ? Response.json(rows) : undefined);
const checks = (calls) => calls.filter((c) => c.url === `${DB}/rpc/record_payout_check`).map((c) => JSON.parse(c.body));

test('M2-3b · pass zero reads the account as connect-status does and records what it proved', async () => {
  const r = await drain(dueAccounts([{ user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: SEEN }]));
  const reads = r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v2/core/accounts/`));
  assert.deepEqual(reads.map((c) => [c.method, c.url]),
    [['GET', `${STRIPE}/v2/core/accounts/acct_w1?include[0]=configuration.recipient&include[1]=requirements`]]);
  assert.equal(reads[0].headers['Stripe-Version'], '2026-08-26.dahlia');
  assert.ok(reads[0].signal, 'the read carries the timeout signal');
  assert.deepEqual(checks(r.calls), [{ p_user_id: W1, p_seen: SEEN, p_status: 'enabled', p_answer: 'read 200 enabled' }],
    'p_seen is the value the view listed, verbatim');
  const order = r.calls.map((c) => c.url);
  assert.ok(order.findIndex((u) => u.startsWith(`${DB}/payout_accounts_due?`))
    < order.findIndex((u) => u.startsWith(`${DB}/transfers_ready?`)), 'the payout reads come before the transfers');
  assert.deepEqual(r.json.payouts, { attempted: 1, succeeded: 1, deferred: 0, failed: 0, defects: 0, blocked: 0 });
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null]);
});

test('M2-3b · the queue read asks for at most 10 accounts, and a never-checked account is read with p_seen null', async () => {
  const r = await drain(dueAccounts([{ user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: null }]));
  assert.deepEqual(r.calls.filter((c) => c.url.startsWith(`${DB}/payout_accounts_due?`)).map((c) => c.url),
    [`${DB}/payout_accounts_due?select=user_id,stripe_account_id,payouts_checked_at&limit=10`]);
  assert.equal(checks(r.calls)[0].p_seen, null);
  assert.match(source, /const PAYOUT_READ_LIMIT = 10;/);
});

test('M2-3b · a read that proves nothing records no status; a stale or missing account is blocked; a lost write-back is the run error', async () => {
  for (const [answer, want] of [
    [() => new Response('down', { status: 500 }), 'read threw: 500 answer could not be read: not JSON'],
    [() => Response.json({ error: { type: 'api_error' } }, { status: 500 }), 'read 500'],
    [() => Response.json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, { status: 404 }), 'read 404 resource_missing'],
    [() => Response.json({ id: 'acct_other', object: 'v2.core.account' }), 'read 200: not this account'],
    [() => { throw new Error('network down'); }, 'read threw: network down'],
  ]) {
    const r = await drain((call) => dueAccounts([{ user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: SEEN }])(call)
      ?? (call.url.startsWith(`${STRIPE}/v2/core/accounts/`) ? answer() : undefined));
    assert.deepEqual(checks(r.calls), [{ p_user_id: W1, p_seen: SEEN, p_status: null, p_answer: want }], want);
    assert.equal(r.json.payouts.deferred, 1, want);
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null], 'an unanswered read is a read again in an hour, not a failure');
  }

  const stale = await drain((call) => dueAccounts([{ user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: SEEN }])(call)
    ?? (call.url === `${DB}/rpc/record_payout_check` ? Response.json(false) : undefined));
  assert.equal(stale.json.payouts.blocked, 1);
  assert.deepEqual(reports(stale.calls).map((b) => b.p_error), [null]);

  const lost = await drain((call) => dueAccounts([
    { user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: SEEN },
    { user_id: W2, stripe_account_id: null, payouts_checked_at: null },
  ])(call) ?? (call.url === `${DB}/rpc/record_payout_check` ? new Response('down', { status: 500 }) : undefined));
  assert.equal(lost.json.payouts.defects, 2, 'a lost write-back and a row with no account are defects');
  assert.equal(lost.calls.filter((c) => c.url.startsWith(`${STRIPE}/v2/core/accounts/`)).length, 1, 'no read for a row with no account');
  assert.deepEqual(reports(lost.calls).map((b) => b.p_error), ['payouts: 2 defects'], 'the report carries the defects');
});

test('M2-3b · the drain pins the same Stripe-Version as connect-status', () => {
  const connectSrc = readFileSync(join(root, 'supabase/functions/connect-status/index.ts'), 'utf8');
  const pin = /const STRIPE_V2_VERSION = '([^']+)';/;
  assert.equal(source.match(pin)?.[1], connectSrc.match(pin)?.[1]);
  assert.ok(source.match(pin)?.[1], 'the drain names the version');
});

test('M2-3b · accountReading: only this account, read with a 2xx, is an account', () => {
  const { accountReading } = classify;
  // A9-04: the account carries the known shape (a bare id and object is not read: the A9-04 test).
  const acct = { id: 'acct_a', object: 'v2.core.account', configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } } };
  assert.deepEqual(accountReading('acct_a', { status: 200, body: acct }), { account: acct, answer: 'read 200' });
  assert.deepEqual(accountReading('acct_a', { status: 200, body: { ...acct, id: 'acct_b' } }), { account: null, answer: 'read 200: not this account' });
  assert.deepEqual(accountReading('acct_a', { status: 200, body: { ...acct, object: 'account' } }), { account: null, answer: 'read 200: not this account' });
  assert.deepEqual(accountReading('acct_a', { status: 200, body: {} }), { account: null, answer: 'read 200: not this account' });
  assert.deepEqual(accountReading('', { status: 200, body: { ...acct, id: '' } }), { account: null, answer: 'read 200: not this account' });
  assert.deepEqual(accountReading('acct_a', { status: 403, body: { error: { code: 'permission' } } }), { account: null, answer: 'read 403 permission' });
  assert.deepEqual(accountReading('acct_a', { threw: new Error('x') }), { account: null, answer: 'read threw: x' });
  assert.deepEqual(accountReading('acct_a', null), { account: null, answer: 'read no status' });
});

test('A9-04 · an account answer without the known shape or with an unknown status changes no state; the answer is recorded', async () => {
  const bare = { id: 'acct_w1', object: 'v2.core.account' };
  const withStatus = (status, requirements = { entries: [] }) => ({
    ...bare, configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status } } } } }, requirements,
  });
  for (const [body, want] of [
    [bare, 'read 200: payout capability not read (no status)'],
    [withStatus('paused'), 'read 200: payout capability not read (paused)'],
    [withStatus('pending', null), 'read 200: requirements not read'],
    [withStatus('pending', { entries: 'x' }), 'read 200: requirements not read'],
  ]) {
    const r = await drain((call) => dueAccounts([{ user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: SEEN }])(call)
      ?? (call.url.startsWith(`${STRIPE}/v2/core/accounts/`) ? Response.json(body) : undefined));
    assert.deepEqual(checks(r.calls), [{ p_user_id: W1, p_seen: SEEN, p_status: null, p_answer: want }], want);
    assert.equal(r.json.payouts.deferred, 1, want);
  }
  // The controls: each known status is read by connect-status's rule.
  for (const [body, status] of [
    [withStatus('active', undefined), 'enabled'],
    [withStatus('restricted'), 'action_needed'],
    [withStatus('pending'), 'under_review'],
    [withStatus('unsupported'), 'under_review'],
    [withStatus('pending', { entries: [{ minimum_deadline: { status: 'currently_due' } }] }), 'action_needed'],
  ]) {
    const r = await drain((call) => dueAccounts([{ user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: SEEN }])(call)
      ?? (call.url.startsWith(`${STRIPE}/v2/core/accounts/`) ? Response.json(body) : undefined));
    assert.deepEqual(checks(r.calls).map((c) => [c.p_status, c.p_answer]), [[status, `read 200 ${status}`]], status);
  }
});

// Rewritten (A5-04 i): the payout pass had a quarter of the time for its own; no pass has a share now.
test('A5-04 (i) · the payout pass has no share of its own: slow reads use the run\'s time, the rest wait for the next run', async () => {
  await withClock(async (state) => {
    const rows = rowsOf(10, (i) => ({ user_id: uuid(300 + i), stripe_account_id: `acct_${i}`, payouts_checked_at: null }));
    const r = await drain((call) => {
      if (call.url.startsWith(`${DB}/payout_accounts_due?`)) return Response.json(rows);
      if (call.url.startsWith(`${STRIPE}/`)) state.clock += 5_000;
      return undefined;
    });
    // Reads every 5 s until the payout chain no longer fits. The empty money queues are not a stall.
    assert.equal(checks(r.calls).length, startsIn('payouts', 5_000));
    assert.equal(r.json.budget.not_started.payouts, 10 - startsIn('payouts', 5_000));
    assert.deepEqual(r.json.budget.skipped, ['transfers', 'refunds', 'intents', 'events']);
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null]);
    assert.equal(r.json.ok, true);
  });
});

test('M2-3b · a payout pass that throws is the run error and the money passes still run', async () => {
  const r = await drain((call) => (call.url.startsWith(`${DB}/payout_accounts_due?`) ? new Response('down', { status: 500 }) : undefined)
    ?? oneRefund(call));
  assert.equal(r.json.ok, false);
  assert.match(r.json.errors[0], /^payouts: /);
  assert.match(reports(r.calls)[0].p_error ?? '', /^payouts: /);
  assert.equal(r.json.refunds.succeeded, 1, 'the refund still went');
});

// ---------------------------------------------------------------------------
// A5-01: "unknown" survives a lost body. Only a complete answer with the provider's typed error is
// a refusal (a new key); a body cut by the timeout after the headers, empty, {}, HTML, or an error
// with no type keeps the key.
// ---------------------------------------------------------------------------
const cutBody = (status) => new Response(new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode('{"error":{"type":"invalid_request_error","code":"parameter_mis'));
    c.error(new DOMException('The signal has been aborted', 'TimeoutError'));
  },
}), { status, headers: { 'content-type': 'application/json' } });
const oneTransfer = (call) => {
  if (call.url.startsWith(`${DB}/transfers_ready?`)) return Response.json([{ id: PAY, payee_id: W1, transfer_cents: 500, transfer_attempts: 0 }]);
  if (call.url.startsWith(`${DB}/payment_accounts?`)) return Response.json([{ user_id: W1, stripe_account_id: 'acct_w1' }]);
  return undefined;
};
const results = (calls) => calls.filter((c) => c.url === `${DB}/rpc/record_settlement_result`).map((c) => JSON.parse(c.body));

test('A5-01 · a lost or incomplete 4xx answer keeps the key, for a payout and for a refund', async () => {
  for (const [label, answer] of [
    ['the body cut by the timeout after the headers', () => cutBody(400)],
    ['an empty body', () => new Response('', { status: 400 })],
    ['{}', () => Response.json({}, { status: 400 })],
    ['a page of HTML', () => new Response('<html><body>Bad Request</body></html>', { status: 400, headers: { 'content-type': 'text/html' } })],
    ['an error with no type', () => Response.json({ error: { code: 'parameter_missing', message: 'x' } }, { status: 400 })],
    ['a 2xx cut short', () => cutBody(200)],
  ]) {
    const t = await drain((call) => oneTransfer(call) ?? (call.url === `${STRIPE}/v1/transfers` ? answer() : undefined));
    assert.deepEqual(results(t.calls).map((b) => [b.p_attempt, b.p_next]), [[0, 'same_key']], `transfer, ${label}`);
    assert.equal(t.calls.filter((c) => c.url === `${DB}/rpc/record_settlement_sent`).length, 0, `transfer, ${label}: never recorded as sent`);
    const r = await drain((call) => oneRefund(call) ?? (call.url === `${STRIPE}/v1/refunds` ? answer() : undefined));
    assert.deepEqual(results(r.calls).map((b) => [b.p_attempt, b.p_next]), [[0, 'same_key']], `refund, ${label}`);
    assert.equal(r.calls.filter((c) => c.url === `${DB}/payment_events`).length, 0, `refund, ${label}: no fact stored`);
  }
});

test('A5-01 · the controls: a complete typed refusal is a new key; a typed idempotency error stops', async () => {
  const refused = await drain((call) => oneTransfer(call) ?? (call.url === `${STRIPE}/v1/transfers`
    ? Response.json({ error: { type: 'invalid_request_error', code: 'account_invalid', message: 'x' } }, { status: 400 }) : undefined));
  assert.deepEqual(results(refused.calls).map((b) => b.p_next), ['new_key']);
  const mismatch = await drain((call) => oneTransfer(call) ?? (call.url === `${STRIPE}/v1/transfers`
    ? Response.json({ error: { type: 'idempotency_error', message: 'Keys for idempotent requests can only be used with the same parameters' } }, { status: 400 }) : undefined));
  assert.deepEqual(results(mismatch.calls).map((b) => b.p_next), ['stop'], 'the answer a lost body could have hidden');
});

test('A5-01 · a re-read whose body is lost proves nothing: the intent stays queued, the account keeps its state', async () => {
  const rows = [{ id: PAY2, provider_ref: 'pi_cut' }];
  const i = await drain((call) => {
    if (call.url.startsWith(`${DB}/intents_to_cancel?`)) return Response.json(rows);
    if (call.url.startsWith(`${STRIPE}/v1/payment_intents/`)) return cutBody(200);
    return undefined;
  });
  assert.equal(i.calls.filter((c) => c.url === `${DB}/rpc/record_intent_cancel`).length, 0, 'never stamped canceled');
  assert.equal(i.calls.filter((c) => c.url === `${DB}/payment_events`).length, 0, 'no fact');
  assert.equal(i.calls.filter((c) => c.url === `${DB}/rpc/record_intent_check`).length, 1, 'to the back of the queue');
  const a = await drain((call) => dueAccounts([{ user_id: W1, stripe_account_id: 'acct_w1', payouts_checked_at: SEEN }])(call)
    ?? (call.url.startsWith(`${STRIPE}/v2/core/accounts/`) ? cutBody(200) : undefined));
  assert.equal(checks(a.calls)[0].p_status, null, 'no state from a cut body');
});

// ---------------------------------------------------------------------------
// A5 point 10: the event scan. Stripe's own event list, read again each run over the last hour
// before the newest event; an event applies once by its own id, through the webhook's two doors.
// ---------------------------------------------------------------------------
const VERSION = '2026-08-26.dahlia';
const T = 1_790_000_000;
const evt = (n, created, type = 'charge.refunded', extra = {}) => ({
  id: `evt_s${n}`, object: 'event', api_version: VERSION, created, type, livemode: false,
  data: { object: { id: `ch_${n}`, object: 'charge', payment_intent: `pi_${n}` } }, ...extra,
});
/** The event list: `pages` maps a starting_after (or '' for the first page) to its answer. */
const eventList = (pages) => (call) => {
  if (!call.url.startsWith(`${STRIPE}/v1/events?`)) return undefined;
  const after = new URL(call.url).searchParams.get('starting_after') ?? '';
  const page = pages[after];
  return typeof page === 'function' ? page() : Response.json(page ?? { object: 'list', data: [], has_more: false });
};
const listPage = (data, more = false) => ({ object: 'list', data, has_more: more });
const storedRows = (rows) => (call) => (call.method === 'GET' && call.url.startsWith(`${DB}/payment_events?`) ? Response.json(rows) : undefined);
const inserts = (calls) => calls.filter((c) => c.method === 'POST' && c.url === `${DB}/payment_events`).map((c) => JSON.parse(c.body));
const applies = (calls) => calls.filter((c) => c.url === `${DB}/rpc/apply_payment_event`).map((c) => JSON.parse(c.body).p_event_id);
const either = (...worlds) => (call) => { for (const w of worlds) { const a = w(call); if (a !== undefined) return a; } return undefined; };

test('A5 point 10 · the scan reads every event type the webhook handles, from Stripe\'s list, with the webhook\'s version', async () => {
  const hook = readFileSync(join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const handled = [...hook.match(/HANDLED_EVENTS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...classify.SCANNED_EVENT_TYPES], handled, 'the same eight types, in the same order');
  const r = await drain();
  const reads = r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/events?`));
  assert.equal(reads.length, 1);
  const url = new URL(reads[0].url);
  assert.equal(reads[0].method, 'GET');
  assert.equal(url.searchParams.get('limit'), '100');
  assert.deepEqual(url.searchParams.getAll('types[]'), handled);
  assert.equal(url.searchParams.get('starting_after'), null, 'no cursor is kept between runs: the first page is the newest');
  assert.equal(reads[0].headers['Stripe-Version'], VERSION);
  assert.equal(reads[0].headers['Stripe-Account'], undefined, 'the platform\'s own events, the webhook\'s scope');
  assert.ok(reads[0].signal, 'the read carries the timeout signal');
  assert.deepEqual(r.json.events, { attempted: 0, succeeded: 0, deferred: 0, failed: 0, defects: 0, blocked: 0 });
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null], 'an empty list read to its end is a clean scan');
  assert.match(source, /const EVENT_WINDOW_S = 3_600;/);
  assert.match(source, /const EVENT_PAGES = 3;/);
  assert.match(source, /const MAX_APPLY_ATTEMPTS = 5;/);
  assert.match(hook, /const MAX_APPLY_ATTEMPTS = 5;/, 'the webhook\'s bound, the same');
});

test('A5 point 10 · the window: the last hour before the newest event; an event applies once, by its own id, through the webhook\'s doors, oldest first', async () => {
  const list = listPage([
    evt(1, T, 'charge.refunded', { account: 'acct_x' }), // newest
    evt(2, T - 100, 'transfer.created'),
    evt(3, T - 3_000, 'refund.failed'),
    evt(4, T - 3_600, 'charge.dispute.closed'), // the window's first second: in
    evt(5, T - 3_601), // before the window: the end is reached
  ], true);
  const r = await drain(either(eventList({ '': list }), storedRows([
    { id: 'evt_s1', processed_at: '2026-11-16T10:00:00+00:00', attempts: 0 }, // the webhook applied it
    { id: 'evt_s2', processed_at: null, attempts: 2 }, // stored, its apply failed twice
    { id: 'evt_s4', processed_at: null, attempts: 5 }, // the webhook's bound: left to the operator's list
  ])));
  assert.equal(r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/events?`)).length, 1, 'the end was reached on page one: no second page');
  const lookup = r.calls.filter((c) => c.method === 'GET' && c.url.startsWith(`${DB}/payment_events?`));
  assert.deepEqual(lookup.map((c) => c.url), [`${DB}/payment_events?select=id,processed_at,attempts&id=in.(evt_s1,evt_s2,evt_s3,evt_s4)`]);
  assert.deepEqual(applies(r.calls), ['evt_s3', 'evt_s2'], 'only what the database has not applied, oldest first');
  const stored = inserts(r.calls);
  assert.deepEqual(stored.map((b) => [b.id, b.type, b.account_id]), [['evt_s3', 'refund.failed', null], ['evt_s2', 'transfer.created', null]]);
  assert.deepEqual(stored[0].payload, list.data[2], 'the payload is the event exactly as Stripe listed it, as the webhook stores it');
  assert.deepEqual(r.json.events, { attempted: 2, succeeded: 2, deferred: 0, failed: 0, defects: 0, blocked: 0 });
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null]);

  // The connected-account field is the event's own, as the webhook records it.
  const acct = await drain(either(eventList({ '': listPage([evt(1, T, 'charge.refunded', { account: 'acct_x' })]) })));
  assert.deepEqual(inserts(acct.calls).map((b) => b.account_id), ['acct_x']);

  // A 409 is "already stored", never a failure: the apply runs anyway, and the database applies an id once.
  const again = await drain((call) => (call.method === 'POST' && call.url === `${DB}/payment_events` ? new Response('dup', { status: 409 }) : undefined)
    ?? eventList({ '': listPage([evt(3, T, 'refund.failed')]) })(call));
  assert.deepEqual(applies(again.calls), ['evt_s3']);
  assert.equal(again.json.events.succeeded, 1);
});

test('A5 point 10 · each run reads its hour again: the windows overlap, and what is applied is never applied again', async () => {
  const first = listPage([evt(2, T - 60), evt(1, T - 600)]);
  const r1 = await drain(eventList({ '': first }));
  assert.deepEqual(applies(r1.calls), ['evt_s1', 'evt_s2']);
  // Five minutes later: one new event; the two before are read again, and the database says applied.
  const second = listPage([evt(9, T + 240), evt(2, T - 60), evt(1, T - 600)]);
  const r2 = await drain(either(eventList({ '': second }), storedRows([
    { id: 'evt_s2', processed_at: 'x', attempts: 0 }, { id: 'evt_s1', processed_at: 'x', attempts: 0 },
  ])));
  assert.equal(r2.calls.filter((c) => c.url.includes('starting_after')).length, 0, 'no cursor between runs');
  assert.deepEqual(applies(r2.calls), ['evt_s9']);
  assert.equal(inserts(r2.calls).length, 1, 'an applied event is not stored again');
});

test('A5 point 10 · a run that did not reach the end of its window says so', async () => {
  const page = (k) => listPage(rowsOf(100, (i) => evt(1000 * k + i, T - 10 * (100 * k + i))), true);
  const pages = { '': page(0), evt_s99: page(1), evt_s1099: page(2), evt_s2099: page(3) };
  const r = await drain(eventList(pages));
  const reads = r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/events?`)).map((c) => new URL(c.url).searchParams.get('starting_after'));
  assert.deepEqual(reads, [null, 'evt_s99', 'evt_s1099'], 'three pages at most, each after the last id of the one before');
  assert.equal(r.json.events.attempted, 300);
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), ['events: the last hour of Stripe\'s events was not read to its end (300 read)']);
  assert.equal(r.json.ok, true, 'ok keeps its meaning; the report carries it');

  // Out of time between pages: the same sentence, with what was read.
  await withClock(async (state) => {
    const slow = await drain((call) => {
      if (call.url.startsWith(`${STRIPE}/v1/events?`)) state.clock += 20_000;
      return eventList(pages)(call);
    });
    assert.equal(slow.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/events?`)).length, 2, 'pages at 0 s and 20 s; at 40 s no room');
    assert.match(reports(slow.calls)[0].p_error, /events: the last hour of Stripe's events was not read to its end \(200 read\)/);
    assert.match(reports(slow.calls)[0].p_error, /events: 200 ready, none started, the run had no time left/, 'none applied: a stall');
  });
});

test('A5 point 10 · an unknown list answer proves nothing: no event applied, and the run says it could not read the list', async () => {
  for (const [answer, words] of [
    [() => Response.json({ error: { type: 'api_error' } }, { status: 500 }), 'list 500'],
    [() => new Response('down', { status: 502 }), 'list threw: 502 answer could not be read: not JSON'],
    [() => cutBody(200), 'list threw: 200 answer cut short'],
    [() => Response.json({ object: 'event' }), 'list 200: not a list'],
    [() => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, 'list threw: The operation was aborted due to timeout'],
  ]) {
    const r = await drain(eventList({ '': answer }));
    assert.deepEqual(applies(r.calls), [], words);
    const error = reports(r.calls)[0].p_error ?? '';
    assert.ok(error.startsWith(`events: Stripe's event list could not be read (${words}`), `${words}: ${error}`);
    assert.doesNotMatch(error, /not read to its end/, 'one sentence for one cause');
  }
});

test('A5 point 10 · an event in another API version, or one that cannot be read, is not applied, and the run says so', async () => {
  const r = await drain(eventList({ '': listPage([
    evt(1, T), evt(2, T - 1, 'charge.refunded', { api_version: '2024-06-20' }), { id: 'evt_s3', object: 'event', created: T - 2 },
    evt(4, T - 3, 'customer.created'),
  ]) }));
  assert.deepEqual(applies(r.calls), ['evt_s1']);
  assert.equal(r.json.events.blocked, 1);
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), [
    'events: 1 event is in another Stripe API version than the webhook\'s, not applied; events: 2 listed events could not be read, not applied',
  ]);
});

test('A5 point 10 · an apply the database refused is tried again next run; a door that failed is a defect', async () => {
  const one = eventList({ '': listPage([evt(1, T)]) });
  const refused = await drain((call) => (call.url === `${DB}/rpc/apply_payment_event` ? Response.json({ ok: false, error: 'apply failed' }) : undefined) ?? one(call));
  assert.deepEqual(refused.json.events, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 0, blocked: 0 });
  for (const broken of [
    (call) => (call.method === 'POST' && call.url === `${DB}/payment_events` ? new Response('down', { status: 500 }) : undefined),
    (call) => (call.url === `${DB}/rpc/apply_payment_event` ? new Response('down', { status: 503 }) : undefined),
    (call) => { if (call.url === `${DB}/rpc/apply_payment_event`) throw new Error('database down'); return undefined; },
  ]) {
    const r = await drain((call) => broken(call) ?? one(call));
    assert.deepEqual(r.json.events, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 1, blocked: 0 });
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), ['events: 1 defect']);
  }
  // The lookup itself failing throws the pass: the run's error, the other passes untouched.
  const lookup = await drain((call) => (call.method === 'GET' && call.url.startsWith(`${DB}/payment_events?`) ? new Response('down', { status: 500 }) : undefined) ?? one(call) ?? oneRefund(call));
  assert.equal(lookup.json.ok, false);
  assert.match(reports(lookup.calls)[0].p_error, /^events: payment_events\?select=id,processed_at,attempts&id=in\.\(evt_s1\) failed: 500 down$/);
  assert.equal(lookup.json.refunds.succeeded, 1);
});

// A9-02: the scan reports how far back it read (record_event_scan; supabase/tests/497_event_scan_gap.sql).
const scanReports = (calls) => calls.filter((c) => c.url === `${DB}/rpc/record_event_scan`).map((c) => JSON.parse(c.body));

test('A9-02 · a scan whose every listed event was stored reports how far back it read', async () => {
  const whole = await drain(eventList({ '': listPage([evt(1, T), evt(2, T - 100), evt(3, T - 3_601)], true) }));
  assert.deepEqual(scanReports(whole.calls), [{ p_window_from: T - 3_600, p_read_from: T - 3_600 }], 'it met the window start');
  const ended = await drain(eventList({ '': listPage([evt(1, T), evt(2, T - 100)]) }));
  assert.deepEqual(scanReports(ended.calls), [{ p_window_from: T - 3_600, p_read_from: null }], 'the list ended first: every listed event read');
  const empty = await drain();
  assert.deepEqual(scanReports(empty.calls), [{ p_window_from: null, p_read_from: null }], 'an empty list read to its end');
  const page = (k) => listPage(rowsOf(100, (i) => evt(1000 * k + i, T - 10 * (100 * k + i))), true);
  const over = await drain(eventList({ '': page(0), evt_s99: page(1), evt_s1099: page(2), evt_s2099: page(3) }));
  assert.deepEqual(scanReports(over.calls), [{ p_window_from: T - 3_600, p_read_from: T - 2_990 }], 'the page limit: the oldest event read');
  const lost = await drain((call) => (call.url === `${DB}/rpc/record_event_scan` ? new Response('down', { status: 500 }) : undefined)
    ?? eventList({ '': listPage([evt(1, T)]) })(call));
  assert.deepEqual(reports(lost.calls).map((b) => b.p_error), ['events: how far back the scan read could not be recorded']);
});

test('A9-02 · a scan that left a listed event unstored reports nothing, so its time stays uncovered', async () => {
  for (const [label, world] of [
    ['another API version', eventList({ '': listPage([evt(1, T), evt(2, T - 1, 'charge.refunded', { api_version: '2024-06-20' })]) })],
    ['an unreadable event', eventList({ '': listPage([evt(1, T), { id: 'evt_s3', object: 'event', created: T - 2 }]) })],
    ['a store that failed', (call) => (call.method === 'POST' && call.url === `${DB}/payment_events` ? new Response('down', { status: 500 }) : undefined)
      ?? eventList({ '': listPage([evt(1, T)]) })(call)],
    ['a list that could not be read', eventList({ '': () => Response.json({ error: { type: 'api_error' } }, { status: 500 }) })],
  ]) {
    const r = await drain(world);
    assert.deepEqual(scanReports(r.calls), [], label);
  }
});

test('A5 point 10 · eventListReading: only a whole 2xx list is a page', () => {
  const { eventListReading } = classify;
  const e = evt(1, T);
  assert.deepEqual(eventListReading({ status: 200, body: listPage([e], true) }, VERSION),
    { page: { events: [{ event: e, ours: true }], unreadable: 0, hasMore: true, lastId: 'evt_s1' }, answer: 'list 200' });
  assert.deepEqual(eventListReading({ status: 200, body: listPage([e]) }, 'other').page.events, [{ event: e, ours: false }]);
  assert.deepEqual(eventListReading({ status: 200, body: listPage([e]) }, '').page.events, [{ event: e, ours: false }], 'no version: never ours');
  for (const bad of [{ ...e, id: 'ev_1' }, { ...e, object: 'charge' }, { ...e, created: '1' }, { ...e, created: 1.5 }, { ...e, type: 'charge.updated' },
    { ...e, data: null }, { ...e, data: { object: [] } }, null, 'evt_x']) {
    assert.equal(eventListReading({ status: 200, body: listPage([bad]) }, VERSION).page.unreadable, 1, JSON.stringify(bad));
  }
  assert.equal(eventListReading({ status: 200, body: listPage([{ id: 'x' }]) }, VERSION).page.lastId, 'x', 'paging goes on past an unreadable item');
  assert.deepEqual(eventListReading({ status: 404, body: { error: { code: 'resource_missing' } } }, VERSION), { page: null, answer: 'list 404 resource_missing' });
  assert.deepEqual(eventListReading({ status: 200, body: { data: [] } }, VERSION), { page: null, answer: 'list 200: not a list' });
  assert.deepEqual(eventListReading({ threw: new Error('x') }, VERSION), { page: null, answer: 'list threw: x' });
  assert.deepEqual(eventListReading(null, VERSION), { page: null, answer: 'list no status' });
  assert.equal(eventListReading({ status: 200, body: listPage([]) }, VERSION).page.hasMore, false);
  // A12-02: was "only true is more" (hasMore false, read as the end of the list).
  for (const more of ['yes', null, undefined, 1]) {
    assert.deepEqual(eventListReading({ status: 200, body: { ...listPage([e]), has_more: more } }, VERSION),
      { page: null, answer: 'list 200: has_more is not true or false' }, `has_more ${String(more)}`);
  }
  for (const data of [[], [e, { object: 'event' }], [e, { ...e, id: '' }]]) {
    assert.deepEqual(eventListReading({ status: 200, body: listPage(data, true) }, VERSION),
      { page: null, answer: 'list 200: more pages and no last id to read them' }, JSON.stringify(data.slice(1)));
  }
});

test('A12-02 · an unreadable page answer never counts as complete coverage: no scan recorded, no event applied, the run says it could not read the list', async () => {
  const e = evt(1, T);
  for (const [label, body, words] of [
    ['has_more missing', { object: 'list', data: [e] }, 'has_more is not true or false'],
    ['has_more a string', { ...listPage([e]), has_more: 'yes' }, 'has_more is not true or false'],
    ['has_more null', { ...listPage([e]), has_more: null }, 'has_more is not true or false'],
    ['more pages, an empty page', listPage([], true), 'more pages and no last id to read them'],
    ['more pages, a last item with no id', listPage([e, { object: 'event', created: T - 1 }], true), 'more pages and no last id to read them'],
  ]) {
    const r = await drain(eventList({ '': body }));
    assert.deepEqual(scanReports(r.calls), [], `${label}: no record_event_scan`);
    assert.deepEqual(applies(r.calls), [], `${label}: nothing applied`);
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), [`events: Stripe's event list could not be read (list 200: ${words})`], label);
  }
});

// ---------------------------------------------------------------------------
// A9-05: a row starts only when its accepted chain, each call at its full 10 s, ends before the 50th
// second; the start seconds are read from the one table (CHAIN_CALLS), never typed here.
// ---------------------------------------------------------------------------
const oneTransfer9 = (call) => (call.url.startsWith(`${DB}/transfers_ready?`)
  ? Response.json([{ id: PAY2, payee_id: 'u1', transfer_cents: 500, transfer_attempts: 0 }])
  : call.url.startsWith(`${DB}/payment_accounts?`) ? Response.json([{ user_id: 'u1', stripe_account_id: 'acct_t' }]) : undefined);

test('A9-05 · the one table: each start second is derived from it', () => {
  assert.deepEqual(chainTable(), { payouts: 2, transfers: 3, refunds: 3, intents: 4, events: 2 });
  assert.deepEqual(Object.fromEntries(Object.keys(chainTable()).map((p) => [p, lastStart(p) / 1000])),
    { payouts: 30, transfers: 20, refunds: 20, intents: 10, events: 30 }, 'the start second of each pass, as reported');
  const code = source.split('\n').filter((l) => !/^\s*(\/\/|\/\*\*|\*)/.test(l)).join('\n');
  assert.equal((code.match(/CHAIN_CALLS/g) ?? []).length, 3, 'defined once, read by mayStart and by the intent re-read');
  assert.doesNotMatch(source, /TRY_MS|startsBefore/, 'the one line for every pass is gone');
});

test('A9-05 (a) · a transfer that would start at second 29 does not start; one before its last start does', async () => {
  for (const [at, sent] of [[29_000, 0], [() => lastStart('transfers') - 1, 1]]) {
    await withClock(async (state) => {
      // turn 1: the transfers go first; the note (the first request) ends at `at`.
      const r = await drain((call) => {
        if (call.url === `${DB}/rpc/note_ready_rows`) { state.clock = typeof at === 'function' ? at() : at; return Response.json(0); }
        return oneTransfer9(call);
      }, 1);
      assert.equal(r.calls.filter((c) => c.url === `${STRIPE}/v1/transfers`).length, sent, `at ${typeof at === 'function' ? at() : at} ms`);
      assert.equal(r.calls.filter((c) => c.url === `${DB}/rpc/settlement_send_begin`).length, sent, `at ${typeof at === 'function' ? at() : at} ms: no begin either`);
    });
  }
});

test('A9-05 (b) · a refund answered failed whose next call does not fit stays on the unknown path; the next run stores the failure once, under the same key', async () => {
  const failed = { id: 're_f9', object: 'refund', amount: 700, payment_intent: 'pi_r', status: 'failed',
    failure_reason: 'expired_or_canceled_card', metadata: { payment_id: PAY } };
  const runs = [];
  for (const late of [true, false]) {
    await withClock(async (state) => {
      const r = await drain((call) => {
        if (call.url === `${STRIPE}/v1/refunds`) { if (late) state.clock = 31_000; return Response.json(failed); }
        return oneRefund(call);
      }, 2);
      runs.push(r);
    });
  }
  const [first, next] = runs;
  const keys = (r) => r.calls.filter((c) => c.url === `${STRIPE}/v1/refunds`).map((c) => c.headers['Idempotency-Key']);
  assert.deepEqual(inserts(first.calls), [], 'first run: the failure is not stored');
  assert.equal(first.calls.filter((c) => c.url === `${DB}/rpc/record_settlement_result`).length, 0, 'first run: nothing written as done');
  assert.deepEqual([first.json.refunds.deferred, first.json.refunds.defects], [1, 1], 'first run: the unknown path');
  assert.deepEqual(inserts(next.calls).map((b) => [b.id, b.type]), [['process-settlements:re_f9', 'refund.failed']], 'next run: stored once');
  assert.equal(next.calls.filter((c) => c.url === `${DB}/rpc/record_settlement_result`).length, 1, 'next run: then the stop');
  assert.deepEqual([...keys(first), ...keys(next)], ['rf:' + PAY + ':0', 'rf:' + PAY + ':0'], 'one key, no refund under a new key');
});

test('A9-05 (c) · an intent cancel at second 11 does not start; one before its last start does', async () => {
  for (const [at, sent] of [[11_000, 0], [() => lastStart('intents') - 1, 1]]) {
    await withClock(async (state) => {
      // turn 3: the intent cancels go first.
      const r = await drain((call) => {
        if (call.url === `${DB}/rpc/note_ready_rows`) { state.clock = typeof at === 'function' ? at() : at; return Response.json(0); }
        if (call.url.startsWith(`${DB}/intents_to_cancel?`)) return Response.json([{ id: 'pay-i', provider_ref: 'pi_x' }]);
        return undefined;
      }, 3);
      assert.equal(r.calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/payment_intents/`)).length, sent, `at ${typeof at === 'function' ? at() : at} ms`);
    });
  }
});

test('A9-06 · a pass with no time for a try whose count fails says the count failed, not that the run had no time left', async () => {
  await withClock(async (state) => {
    const r = await drain((call) => {
      if (call.url.startsWith(`${DB}/payout_accounts_due?`)) { state.clock = 35_000; return Response.json([]); }
      if (call.method === 'HEAD' && call.url.startsWith(`${DB}/transfers_ready?`)) return new Response('down', { status: 500 });
      return undefined;
    });
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), ['transfers: the run had no time left, and its ready rows could not be counted']);
    // The control: past the 50th second no count is asked, and the clause says the run had no time left.
    state.clock = 0;
    const late = await drain((call) => {
      if (call.url.startsWith(`${DB}/payout_accounts_due?`)) { state.clock = 51_000; return Response.json([]); }
      return undefined;
    });
    assert.equal(late.calls.filter((c) => c.method === 'HEAD').length, 0);
    assert.deepEqual(reports(late.calls).map((b) => b.p_error),
      ['transfers: not read, the run had no time left; refunds: not read, the run had no time left; intents: not read, the run had no time left']);
  });
});

// ---------------------------------------------------------------------------
// A5-04 (iv): the note of the ready rows (note_ready_rows; supabase/tests/489_ready_wait.sql). It only sees.
// ---------------------------------------------------------------------------
const notes = (calls) => calls.filter((c) => c.url === `${DB}/rpc/note_ready_rows`);

// Rewritten (A9-03 a, was "... once, after every pass and right before its report ..."): the note is first.
test('A5-04 (iv) · each run notes its ready rows once, first, before any request of a pass, with no argument', async () => {
  const r = await drain((call) => oneTransfer(call) ?? oneRefund(call));
  assert.deepEqual(notes(r.calls).map((c) => c.body), ['{}'], 'one note, no argument: no turn, no clock, no row');
  assert.equal(r.calls[0].url, `${DB}/rpc/note_ready_rows`, 'the first request of the run');
  assert.equal(r.calls.filter((c) => c.url === `${STRIPE}/v1/transfers` || c.url === `${STRIPE}/v1/refunds`).length, 2, 'the money passes still sent');
  assert.deepEqual(reports(r.calls).map((b) => b.p_error), [null]);
});

test('A5-04 (iv) · a note that fails or throws is a clause of the report; the passes ran and ok keeps its meaning', async () => {
  for (const [answer, clause] of [
    [() => new Response('note down', { status: 500 }), 'ready: note_ready_rows failed 500: note down'],
    [() => { throw new Error('database down'); }, 'ready: note_ready_rows threw: database down'],
  ]) {
    const r = await drain((call) => oneTransfer(call) ?? oneRefund(call) ?? (call.url === `${DB}/rpc/note_ready_rows` ? answer() : undefined));
    assert.deepEqual(reports(r.calls).map((b) => b.p_error), [clause], 'the timer line shows it');
    assert.equal(r.calls.filter((c) => c.url === `${STRIPE}/v1/transfers` || c.url === `${STRIPE}/v1/refunds`).length, 2, 'both money passes sent their row');
    assert.deepEqual([r.json.transfers.succeeded, r.json.refunds.succeeded], [1, 1]);
    assert.equal(r.json.ok, true, 'no pass threw');
  }
});

// Rewritten (A9-03 a, was "a run past its 30th second after the passes notes nothing, and that is no
// error"): the note never depends on time the passes leave.
test('A9-03 (a) · a run whose passes use all its time still notes its ready rows, first, in its own request bound', async () => {
  await withClock(async (state) => {
    const r = await drain((call) => {
      if (call.url === `${STRIPE}/v1/refunds`) { state.clock = 31_000; return Response.json({ id: 're_t', amount: 700, status: 'succeeded' }); }
      return oneRefund(call);
    });
    assert.equal(notes(r.calls).length, 1, 'one note');
    assert.equal(posts(r.calls)[0], `${DB}/rpc/note_ready_rows`, 'the note is the first write of the run');
    assert.equal(notes(r.calls)[0].signal.givenMs, 10_000, 'the note has its own 10-second request bound');
    assert.equal(posts(r.calls).at(-1), `${DB}/rpc/record_timer_run`);
  });
});

test('A5-04 (iv) · [static] the drain only calls the note: it never reads the table, and no pass uses the note', () => {
  assert.equal(source.includes('settlement_ready_since'), false, 'the drain never names the table');
  const code = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((code.match(/note_ready_rows/g) ?? []).length, 3, 'in the code: the call and its two error clauses');
  assert.equal((source.match(/serviceRpc\(run, 'note_ready_rows', \{\}\)/g) ?? []).length, 1, 'one call, no argument');
  assert.equal((source.match(/noteReadyRows\(/g) ?? []).length, 2, 'defined once, called once');
  assert.match(source, /\n {2}const run = newRun\(\);\n(?: {2}\/\/[^\n]*\n)* {2}const noted = await noteReadyRows\(run\);\n/, 'called in the handler, right after the run is made, before the passes');
  assert.match(source, /runError\(noted \? \[\.\.\.errors, noted\] : errors, counts, run\.stalled\)/, 'its clause goes to the report only');
});
