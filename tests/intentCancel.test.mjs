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

test('R4-A6 · a deferred answer whose move cannot be written is a defect too, and nothing is stamped', async () => {
  const r = await run([{ id: 'pay-1', provider_ref: 'pi_500' }], { pi_500: 500 }, { recordAnswer: () => new Response('no', { status: 500 }) });
  assert.deepEqual(moved(r.calls), ['pay-1'], 'the move was asked once');
  assert.deepEqual(stamped(r.calls), [], 'no final stamp');
  assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 1, blocked: 0 });
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

// ---------------------------------------------------------------------------
// Codex R11-A1: a refund the provider answers failed or canceled at once is a failure the drain has
// seen, so it is recorded at once and by the webhook's one rule: the drain hands the provider's Refund
// to the event path (refundFailedEvent, classify.mjs), stores it in payment_events, applies it with
// apply_payment_event, and only then stops the attempt. The database side is
// supabase/tests/426_refund_failed.sql G13 to G17. The same handler as above, one refunds_ready row.
// ---------------------------------------------------------------------------
const { refundFailedEvent, settlementVerdict } = classify;
const PAY = '3f2b6c1e-9a4d-4e7b-8c21-5d0f7a9b1c33';
const REFUND_ROW = { id: PAY, provider_ref: 'pi_r11', refund_cents: 3875, refund_attempts: 2 };
const refund = (status) => ({
  id: 're_r11', object: 'refund', amount: 3875, payment_intent: 'pi_r11', status,
  failure_reason: 'expired_or_canceled_card', metadata: { payment_id: PAY },
});

/** One drain run with one refunds_ready row. `provider` is { status, body } or 'throw'; insert a status or 'throw'; apply a body, a status or 'throw'. */
async function runRefund({ provider, insert = 201, apply = { ok: true, payment_id: PAY } }) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? '' };
    calls.push(call);
    const at = call.url;
    if (call.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
    if (at.startsWith(`${DB}/transfers_ready?`) || at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json([]);
    if (at.startsWith(`${DB}/refunds_ready?`)) return Response.json([REFUND_ROW]);
    if (at === `${DB}/rpc/settlement_send_begin`) return Response.json(true);
    if (at === `${DB}/rpc/record_settlement_result` || at === `${DB}/rpc/record_settlement_sent`) return Response.json(true);
    if (at === `${STRIPE}/v1/refunds`) {
      if (provider === 'throw') throw new Error('network down');
      return Response.json(provider.body, { status: provider.status });
    }
    if (at === `${DB}/payment_events`) {
      if (insert === 'throw') throw new Error('database down');
      return new Response(insert === 409 ? '{"code":"23505"}' : null, { status: insert });
    }
    if (at === `${DB}/rpc/apply_payment_event`) {
      if (apply === 'throw') throw new Error('database down');
      return typeof apply === 'number' ? new Response('apply down', { status: apply }) : Response.json(apply);
    }
    return new Response('unexpected', { status: 599 });
  };
  const log = console.error;
  console.error = () => {};
  try {
    const res = await handler(new Request('http://edge.test/process-settlements', { method: 'POST', headers: { Authorization: 'Bearer service' } }));
    return { json: await res.json(), calls };
  } finally {
    console.error = log;
    globalThis.fetch = original;
  }
}

/** The writes and the provider call, in order, by name. */
const writes = (calls) => calls
  .filter((c) => c.method === 'POST')
  .map((c) => (c.url.startsWith(`${STRIPE}/`) ? `stripe ${c.url.slice(STRIPE.length)}` : c.url.slice(DB.length + 1)));
const bodyOf = (calls, path) => calls.filter((c) => c.url === `${DB}/${path}`).map((c) => JSON.parse(c.body));

test('R11-A1 · the classifier: only a refund answered 2xx failed or canceled becomes a refund.failed event, the Refund unchanged', () => {
  for (const status of ['failed', 'canceled']) {
    const body = refund(status);
    const event = refundFailedEvent('refund', { status: 200, body });
    assert.deepEqual(event, {
      id: 'process-settlements:re_r11',
      type: 'refund.failed',
      payload: { id: 'process-settlements:re_r11', type: 'refund.failed', data: { object: body } },
    }, `${status}: the provider's Refund is the event's object, and the payload has no other field`);
    assert.equal(event.payload.data.object, body, `${status}: the same object, not a copy`);
    assert.doesNotMatch(event.id, /^evt_/, `${status}: never a Stripe event id`);
    assert.equal(settlementVerdict('refund', { status: 200, body }).next, 'stop', `${status}: and the attempt still stops`);
  }
  // Controls: every other answer is not a failure the provider reported.
  for (const [label, kind, outcome] of [
    ['pending', 'refund', { status: 200, body: refund('pending') }],
    ['succeeded', 'refund', { status: 200, body: refund('succeeded') }],
    ['no status', 'refund', { status: 200, body: refund(undefined) }],
    ['no amount', 'refund', { status: 200, body: { ...refund('failed'), amount: 0 } }],
    ['not a refund id', 'refund', { status: 200, body: { ...refund('failed'), id: 'tr_r11' } }],
    ['a stop code on a 4xx', 'refund', { status: 400, body: { error: { code: 'charge_disputed', message: 'disputed' } } }],
    ['a 5xx', 'refund', { status: 500, body: {} }],
    ['a throw', 'refund', { threw: new Error('network down') }],
    ['a transfer', 'transfer', { status: 200, body: { id: 'tr_r11', amount: 3875, status: 'failed' } }],
  ]) {
    assert.equal(refundFailedEvent(kind, outcome), null, `${label}: no event`);
  }
});

test('R11-A1 · the drain: begin, refund, the failure stored and applied, then the stop', async () => {
  for (const status of ['failed', 'canceled']) {
    const r = await runRefund({ provider: { status: 200, body: refund(status) } });
    assert.deepEqual(writes(r.calls), [
      'rpc/settlement_send_begin', 'stripe /v1/refunds', 'payment_events', 'rpc/apply_payment_event', 'rpc/record_settlement_result',
    ], `${status}: the failure is recorded before the attempt stops`);
    const stored = r.calls.find((c) => c.url === `${DB}/payment_events`);
    assert.equal(stored.headers.Prefer, 'return=minimal', `${status}: the webhook's insert`);
    assert.deepEqual(JSON.parse(stored.body), {
      id: 'process-settlements:re_r11', type: 'refund.failed', account_id: null,
      payload: { id: 'process-settlements:re_r11', type: 'refund.failed', data: { object: refund(status) } },
    }, `${status}: the provider's Refund, as answered`);
    assert.deepEqual(bodyOf(r.calls, 'rpc/apply_payment_event'), [{ p_event_id: 'process-settlements:re_r11' }]);
    assert.deepEqual(bodyOf(r.calls, 'rpc/record_settlement_result'), [{
      p_payment_id: PAY, p_kind: 'refund', p_attempt: 2, p_next: 'stop', p_error: `200 re_r11 ${status}: the provider made no refund`,
    }], `${status}: then the stop, as before`);
    assert.deepEqual(r.json.refunds, { attempted: 1, succeeded: 0, deferred: 0, failed: 1, defects: 0, blocked: 0 });
  }
  // Already stored (a replay of the same answer): 409 is not an error, the event is applied anyway.
  const again = await runRefund({ provider: { status: 200, body: refund('failed') }, insert: 409 });
  assert.deepEqual(writes(again.calls).slice(2), ['payment_events', 'rpc/apply_payment_event', 'rpc/record_settlement_result']);
  assert.equal(again.json.refunds.failed, 1);
});

test('R11-A1 · the drain: a failure not recorded is not stopped: the same key next tick, a defect now', async () => {
  for (const [label, world] of [
    ['the insert failed', { insert: 500 }],
    ['the insert threw', { insert: 'throw' }],
    ['apply answered 500', { apply: 500 }],
    ['apply threw', { apply: 'throw' }],
    ['apply failed (ok false)', { apply: { ok: false, error: 'apply failed' } }],
    ['the event matched no payment', { apply: { ok: true, payment_id: null } }],
    ['the event matched another payment', { apply: { ok: true, payment_id: '00000000-0000-4000-8000-000000000000' } }],
  ]) {
    const r = await runRefund({ provider: { status: 200, body: refund('failed') }, ...world });
    const done = writes(r.calls);
    assert.equal(done.includes('rpc/record_settlement_result'), false, `${label}: no stop`);
    assert.equal(done.includes('rpc/record_settlement_sent'), false, `${label}: nothing written back as sent`);
    assert.equal(done.includes('rpc/apply_payment_event'), !String(world.insert ?? '').match(/500|throw/), `${label}: applied only once stored`);
    assert.deepEqual(r.json.refunds, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 1, blocked: 0 }, label);
  }
});

test('R11-A1 · the drain (controls): no other answer stores an event', async () => {
  const pending = await runRefund({ provider: { status: 200, body: refund('pending') } });
  assert.deepEqual(writes(pending.calls), ['rpc/settlement_send_begin', 'stripe /v1/refunds', 'rpc/record_settlement_sent'], 'pending: written back as sent');
  const disputed = await runRefund({ provider: { status: 400, body: { error: { code: 'charge_disputed', message: 'disputed' } } } });
  assert.deepEqual(writes(disputed.calls), ['rpc/settlement_send_begin', 'stripe /v1/refunds', 'rpc/record_settlement_result'], 'a 4xx stop code: the stop alone');
  assert.equal(bodyOf(disputed.calls, 'rpc/record_settlement_result')[0].p_next, 'stop');
  const unknown = await runRefund({ provider: { status: 500, body: {} } });
  assert.deepEqual(writes(unknown.calls), ['rpc/settlement_send_begin', 'stripe /v1/refunds', 'rpc/record_settlement_result'], 'a 5xx: the same key, no event');
  assert.equal(bodyOf(unknown.calls, 'rpc/record_settlement_result')[0].p_next, 'same_key');
  const threw = await runRefund({ provider: 'throw' });
  assert.equal(writes(threw.calls).includes('payment_events'), false, 'a throw: no event');
});
