// Pack 1, F2 (ii): process-settlements cancels the provider's PaymentIntent of a voided row that was
// never held and received nothing (the intents_to_cancel view, supabase/tests/450_intent_cancel_queue.sql),
// and stamps the row through record_intent_cancel on a final answer only: a 2xx, or a 4xx about the
// intent itself (already canceled, not cancelable, missing). A 5xx, a throw, or a status that says
// nothing about the intent (401, 403, 409, 429) leaves the final stamp empty and the next run tries
// again; Codex R3-A6: such a row is moved to the back of the queue (record_intent_cancel with
// p_final false), so 25 unanswered rows never starve the newer ones.
// Deno cannot run here, so the handler's own body is executed under node (createPaymentResume.test.mjs's
// way): its imports are swapped for stubs (classify.mjs's real exports among them), its types stripped,
// Deno.serve hands over the handler, and a fake fetch answers the database and the provider.
// Test values only; none is shaped like a real key.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

import * as classify from '../supabase/functions/process-settlements/classify.mjs';

const root = join(import.meta.dirname, '..');
const FILE = 'supabase/functions/process-settlements/index.ts';
const source = readFileSync(join(root, FILE), 'utf8').replace(/\r\n/g, '\n');
const IMPORT = /^import \{([^}]*)\} from '([^']+)';$/gm;

globalThis.__psStubs = {
  ...classify,
  notConfigured: () => null,
  requireServiceRole: () => null,
  SECRET_KEY: 'service-for-the-test',
  serviceHeaders: () => ({ 'Content-Type': 'application/json' }),
};
const js = stripTypeScriptTypes(source.replace(IMPORT, (_, names) => `const {${names}} = globalThis.__psStubs;`), { mode: 'strip' });

let handler = null;
const ENV = { SUPABASE_URL: 'http://supabase.test', STRIPE_SECRET_KEY: 'stripe-secret-for-the-test' };
globalThis.Deno = { env: { get: (name) => ENV[name] }, serve: (h) => { handler = h; } };
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const STRIPE = 'https://api.stripe.com';
const DB = `${ENV.SUPABASE_URL}/rest/v1`;

/** One drain run against a fake world. `answers` maps an intent id to the provider's status (or 'throw'). */
async function run(rows, answers, { recordAnswer = () => Response.json(true) } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? '' };
    calls.push(call);
    const at = call.url;
    if (call.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
    if (at.startsWith(`${DB}/transfers_ready?`) || at.startsWith(`${DB}/refunds_ready?`)) return Response.json([]);
    if (at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json(rows);
    if (at === `${DB}/rpc/record_intent_cancel`) return recordAnswer(JSON.parse(call.body));
    const cancel = at.match(/^https:\/\/api\.stripe\.com\/v1\/payment_intents\/([^/]+)\/cancel$/);
    if (cancel) {
      const answer = answers[decodeURIComponent(cancel[1])];
      if (answer === 'throw') throw new Error('network down');
      return Response.json(answer < 300 ? { id: cancel[1], status: 'canceled' } : { error: { code: 'probe' } }, { status: answer });
    }
    return new Response('unexpected', { status: 599 });
  };
  const log = console.error;
  console.error = () => {};
  try {
    const res = await handler(new Request('http://edge.test/process-settlements', { method: 'POST', headers: { Authorization: 'Bearer service' } }));
    return { status: res.status, json: await res.json(), calls };
  } finally {
    console.error = log;
    globalThis.fetch = original;
  }
}

const records = (calls) => calls.filter((c) => c.url === `${DB}/rpc/record_intent_cancel`).map((c) => JSON.parse(c.body));
const stamped = (calls) => records(calls).filter((b) => b.p_final !== false).map((b) => b.p_payment_id);
const moved = (calls) => records(calls).filter((b) => b.p_final === false).map((b) => b.p_payment_id);
const cancels = (calls) => calls.filter((c) => c.url.startsWith(`${STRIPE}/v1/payment_intents/`));

test('0 · the harness: the handler was served', () => {
  assert.equal(typeof handler, 'function');
});

test('F2 (ii) · a final answer is stamped; anything else writes nothing and waits for the next run', async () => {
  const answers = {
    pi_ok: 200, pi_state: 400, pi_missing: 404,
    pi_500: 500, pi_throw: 'throw', pi_429: 429, pi_401: 401, pi_403: 403, pi_409: 409,
  };
  const rows = Object.keys(answers).map((ref) => ({ id: `pay-${ref}`, provider_ref: ref }));
  const r = await run(rows, answers);
  assert.equal(r.status, 200);

  // The read: the queue's own order, the drain's per-run limit.
  const reads = r.calls.filter((c) => c.url.startsWith(`${DB}/intents_to_cancel?`));
  assert.deepEqual(reads.map((c) => c.url), [`${DB}/intents_to_cancel?select=id,provider_ref&limit=25`]);

  // One cancel per row, in the queue's order, the documented call and nothing else.
  const sent = cancels(r.calls);
  assert.deepEqual(sent.map((c) => c.url), rows.map((row) => `${STRIPE}/v1/payment_intents/${row.provider_ref}/cancel`));
  for (const c of sent) {
    assert.equal(c.method, 'POST');
    assert.equal(c.body, 'cancellation_reason=abandoned');
    assert.equal(c.headers.Authorization, 'Bearer stripe-secret-for-the-test');
    assert.equal(c.headers['Idempotency-Key'], undefined, 'a cancel moves no money and carries no key');
  }

  assert.deepEqual(stamped(r.calls), ['pay-pi_ok', 'pay-pi_state', 'pay-pi_missing'], 'only 2xx and a 4xx about the intent are stamped');
  assert.deepEqual(r.json.intents, { attempted: 9, succeeded: 3, deferred: 6, failed: 0, defects: 0, blocked: 0 });
  assert.equal(r.json.ok, true);
});

test('R3-A6 · a deferred answer moves its row to the back of the queue; the final stamp stays empty', async () => {
  const answers = { pi_ok: 200, pi_500: 500, pi_throw: 'throw', pi_429: 429, pi_409: 409 };
  const rows = Object.keys(answers).map((ref) => ({ id: `pay-${ref}`, provider_ref: ref }));
  const r = await run(rows, answers);
  assert.deepEqual(moved(r.calls), ['pay-pi_500', 'pay-pi_throw', 'pay-pi_429', 'pay-pi_409'], 'every deferred row, once');
  assert.deepEqual(stamped(r.calls), ['pay-pi_ok'], 'only the final answer is stamped');
  assert.ok(records(r.calls).every((b) => typeof b.p_final === 'boolean'), 'each record says which it is');
  // Each move follows that row's own cancel.
  const order = r.calls.map((c) => (c.url.startsWith(`${STRIPE}/`) ? `cancel ${c.url.split('/')[5]}` : c.url === `${DB}/rpc/record_intent_cancel` ? `record ${JSON.parse(c.body).p_payment_id}` : null)).filter(Boolean);
  for (const ref of ['pi_500', 'pi_429', 'pi_409']) {
    assert.equal(order[order.indexOf(`cancel ${ref}`) + 1], `record pay-${ref}`, `${ref}: moved right after its cancel`);
  }
  assert.deepEqual(r.json.intents, { attempted: 5, succeeded: 1, deferred: 4, failed: 0, defects: 0, blocked: 0 });
});

test('F2 (ii) · a stamp that cannot be written is a defect, and the next run asks again', async () => {
  const r = await run([{ id: 'pay-1', provider_ref: 'pi_ok' }], { pi_ok: 200 }, { recordAnswer: () => new Response('no', { status: 500 }) });
  assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 0, deferred: 0, failed: 0, defects: 1, blocked: 0 });
});

test('F2 (ii) · a row without an intent is never sent', async () => {
  const r = await run([{ id: 'pay-1', provider_ref: null }], {});
  assert.equal(cancels(r.calls).length, 0);
  assert.deepEqual(r.json.intents, { attempted: 0, succeeded: 0, deferred: 0, failed: 0, defects: 1, blocked: 0 });
});

test('F2 (ii) · the cancel pass runs after both money passes', () => {
  const at = (s) => source.indexOf(s);
  assert.ok(at('transfers = await runTransfers();') < at('refunds = await runRefunds();'));
  assert.ok(at('refunds = await runRefunds();') < at('intents = await runIntentCancels();'));
});
