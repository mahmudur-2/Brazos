// Pack 1, F2 (ii): process-settlements cancels the provider's PaymentIntent of a voided row that was
// never held and received nothing (the intents_to_cancel view, supabase/tests/450_intent_cancel_queue.sql).
// M2-2 (R-F, critic R-A "Intent cancel unknown"): only the intent itself proves anything. Unless the
// cancel's answer is this intent read back as canceled or succeeded, the drain reads the intent (GET).
// canceled: a payment_intent.canceled fact, stored and applied like the webhook's, then the final
// stamp (record_intent_cancel). succeeded: a payment_intent.succeeded fact with the amount read back
// (the funded-after-void refund), and no stamp. Anything else, a 404 and any 400 included, proves
// nothing: record_intent_check moves the row to the back of the queue (Codex R3-A6), so 25 unanswered
// rows never starve the newer ones, and keeps the first such answer's time (the 1-day line,
// supabase/tests/484_intent_reread.sql).
// Deno cannot run here, so the handler's own body is executed under node (createPaymentResume.test.mjs's
// way): its imports are swapped for stubs (classify.mjs's real exports among them), its types stripped,
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

globalThis.__psStubs = {
  ...connect,
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

/** The provider's PaymentIntent as Stripe answers it; client_secret is there to prove it is never stored. */
const intent = (id, status, received = 0, extra = {}) => ({
  id, object: 'payment_intent', status, amount: 5150, amount_received: received, currency: 'usd',
  client_secret: 'secret-for-the-test', metadata: { payment_id: `pay-${id}` }, ...extra,
});

/** An answer: a status (a 2xx cancel answers this intent canceled; any other status an error), 'throw', or { status, body }. */
function answerOf(spec, ref, kind) {
  if (spec === 'throw') throw new Error('network down');
  if (typeof spec === 'object' && spec !== null) return Response.json(spec.body, { status: spec.status });
  if (kind === 'cancel' && spec < 300) return Response.json(intent(ref, 'canceled'), { status: spec });
  return Response.json({ error: { code: 'probe' } }, { status: spec });
}

/**
 * One drain run against a fake world. `answers` maps an intent id to its cancel's answer, or to
 * { cancel, read }; a read not given answers 404. The fact is stored 201 and applied to the row of its
 * intent unless `insert` or `apply` say otherwise.
 */
async function run(rows, answers, {
  recordAnswer = () => Response.json(true), checkAnswer = () => Response.json(true),
  timerAnswer = () => new Response(null, { status: 204 }), insert = 201, apply = null,
} = {}) {
  const calls = [];
  const original = globalThis.fetch;
  // A5-04 (ii): turn 0, the pass and row order these tests name.
  const realDateNow = Date.now;
  Date.now = () => 0;
  const paymentOf = new Map(rows.map((r) => [r.provider_ref, r.id]));
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? '' };
    calls.push(call);
    const at = call.url;
    if (call.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
    if (at.startsWith(`${DB}/transfers_ready?`) || at.startsWith(`${DB}/refunds_ready?`) || at.startsWith(`${DB}/payout_accounts_due?`)) return Response.json([]);
    if (at.startsWith(`${DB}/intents_to_cancel?`)) return Response.json(rows);
    if (at === `${DB}/rpc/record_intent_cancel`) return recordAnswer(JSON.parse(call.body));
    if (at === `${DB}/rpc/record_intent_check`) return checkAnswer(JSON.parse(call.body));
    if (at === `${DB}/payment_events`) {
      if (insert === 'throw') throw new Error('database down');
      return new Response(insert === 409 ? '{"code":"23505"}' : null, { status: insert });
    }
    if (at === `${DB}/rpc/apply_payment_event`) {
      if (apply === 'throw') throw new Error('database down');
      if (typeof apply === 'number') return new Response('apply down', { status: apply });
      if (apply !== null) return Response.json(apply);
      const ref = JSON.parse(call.body).p_event_id.split(':')[2];
      return Response.json({ ok: true, payment_id: paymentOf.get(ref) ?? null });
    }
    // A5-04 (iv): the run's note of its ready rows, after the passes.
    if (at === `${DB}/rpc/note_ready_rows`) return Response.json(0);
    // M2-1: the run's own report, last.
    if (at === `${DB}/rpc/record_timer_run`) return timerAnswer(JSON.parse(call.body));
    const cancel = at.match(/^https:\/\/api\.stripe\.com\/v1\/payment_intents\/([^/]+)\/cancel$/);
    if (cancel) {
      const ref = decodeURIComponent(cancel[1]);
      const spec = answers[ref];
      return answerOf(typeof spec === 'object' && spec !== null && 'cancel' in spec ? spec.cancel : spec, ref, 'cancel');
    }
    const read = at.match(/^https:\/\/api\.stripe\.com\/v1\/payment_intents\/([^/]+)$/);
    if (read) {
      const ref = decodeURIComponent(read[1]);
      const spec = answers[ref];
      return answerOf(typeof spec === 'object' && spec !== null && 'read' in spec ? spec.read : 404, ref, 'read');
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
    Date.now = realDateNow;
  }
}

const records = (calls) => calls.filter((c) => c.url === `${DB}/rpc/record_intent_cancel`).map((c) => JSON.parse(c.body));
const stamped = (calls) => records(calls).filter((b) => b.p_final !== false).map((b) => b.p_payment_id);
const checks = (calls) => calls.filter((c) => c.url === `${DB}/rpc/record_intent_check`).map((c) => JSON.parse(c.body));
const moved = (calls) => checks(calls).map((b) => b.p_payment_id);
const cancels = (calls) => calls.filter((c) => /\/v1\/payment_intents\/[^/]+\/cancel$/.test(c.url));
const intentReads = (calls) => calls.filter((c) => /^https:\/\/api\.stripe\.com\/v1\/payment_intents\/[^/]+$/.test(c.url));
const facts = (calls) => calls.filter((c) => c.url === `${DB}/payment_events`).map((c) => JSON.parse(c.body));
/** Each call of pass three, by name and intent, in order. */
const steps = (calls) => calls.map((c) => {
  const cancel = c.url.match(/\/v1\/payment_intents\/([^/]+)\/cancel$/);
  if (cancel) return `cancel ${cancel[1]}`;
  const read = c.url.match(/^https:\/\/api\.stripe\.com\/v1\/payment_intents\/([^/]+)$/);
  if (read) return `read ${read[1]}`;
  if (c.url === `${DB}/payment_events`) return `fact ${JSON.parse(c.body).id}`;
  if (c.url === `${DB}/rpc/apply_payment_event`) return `apply ${JSON.parse(c.body).p_event_id}`;
  if (c.url === `${DB}/rpc/record_intent_cancel`) return `stamp ${JSON.parse(c.body).p_payment_id}`;
  if (c.url === `${DB}/rpc/record_intent_check`) return `check ${JSON.parse(c.body).p_payment_id}`;
  return null;
}).filter(Boolean);

test('0 · the harness: the handler was served', () => {
  assert.equal(typeof handler, 'function');
});

test('F2 (ii), R-F · a cancel is stamped only when the intent itself says canceled; a 404 or any 400 is read, never trusted', async () => {
  // Each cancel answer of the old test. Read back: the 400 row says canceled; the 404 row 404 again;
  // every other row is still open (requires_payment_method).
  const open = { status: 200, body: intent('x', 'requires_payment_method') };
  const answers = {
    pi_ok: 200,
    pi_state: { cancel: 400, read: { status: 200, body: intent('pi_state', 'canceled') } },
    pi_missing: { cancel: 404, read: 404 },
    pi_500: { cancel: 500 }, pi_throw: { cancel: 'throw' }, pi_429: { cancel: 429 }, pi_401: { cancel: 401 },
    pi_403: { cancel: 403 }, pi_409: { cancel: 409 },
  };
  for (const ref of ['pi_500', 'pi_throw', 'pi_429', 'pi_401', 'pi_403', 'pi_409']) answers[ref].read = { ...open, body: intent(ref, 'requires_payment_method') };
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
  // One read for every row whose cancel did not prove the intent canceled: a GET of the intent, platform
  // scope (no Stripe-Account), no key, no body.
  const got = intentReads(r.calls);
  assert.deepEqual(got.map((c) => c.url), rows.slice(1).map((row) => `${STRIPE}/v1/payment_intents/${row.provider_ref}`));
  for (const c of got) {
    assert.equal(c.method, 'GET');
    assert.equal(c.body, '');
    assert.deepEqual(c.headers, { Authorization: 'Bearer stripe-secret-for-the-test' });
  }

  assert.deepEqual(stamped(r.calls), ['pay-pi_ok', 'pay-pi_state'], 'only an intent read back as canceled is stamped');
  assert.deepEqual(moved(r.calls), rows.slice(2).map((row) => row.id), 'every other row is moved back, the 404 among them');
  assert.deepEqual(r.json.intents, { attempted: 9, succeeded: 2, deferred: 7, failed: 0, defects: 0, blocked: 0 });
  assert.equal(r.json.ok, true);
});

test('R3-A6 · an unproven answer moves its row to the back of the queue, right after its read; the final stamp stays empty', async () => {
  const answers = { pi_ok: 200, pi_500: 500, pi_throw: 'throw', pi_429: 429, pi_409: 409 };
  const rows = Object.keys(answers).map((ref) => ({ id: `pay-${ref}`, provider_ref: ref }));
  const r = await run(rows, answers);
  assert.deepEqual(moved(r.calls), ['pay-pi_500', 'pay-pi_throw', 'pay-pi_429', 'pay-pi_409'], 'every unproven row, once');
  assert.deepEqual(stamped(r.calls), ['pay-pi_ok'], 'only the proven answer is stamped');
  assert.ok(records(r.calls).every((b) => b.p_final === true), 'the drain stamps only final now; the move is record_intent_check');
  const order = steps(r.calls);
  for (const ref of ['pi_500', 'pi_throw', 'pi_429', 'pi_409']) {
    const at = order.indexOf(`cancel ${ref}`);
    assert.deepEqual(order.slice(at, at + 3), [`cancel ${ref}`, `read ${ref}`, `check pay-${ref}`], `${ref}: read, then moved, before the next row`);
  }
  assert.deepEqual(checks(r.calls).map((b) => b.p_answer), [
    'cancel 500 probe; read 404 probe', 'cancel threw: network down; read 404 probe',
    'cancel 429 probe; read 404 probe', 'cancel 409 probe; read 404 probe',
  ], 'each answer, in the drain\'s words');
  assert.deepEqual(r.json.intents, { attempted: 5, succeeded: 1, deferred: 4, failed: 0, defects: 0, blocked: 0 });
});

test('F2 (ii) · a stamp that cannot be written is a defect, and the next run asks again', async () => {
  const r = await run([{ id: 'pay-1', provider_ref: 'pi_ok' }], { pi_ok: 200 }, { recordAnswer: () => new Response('no', { status: 500 }) });
  assert.deepEqual(steps(r.calls), ['cancel pi_ok', 'fact process-settlements:reread:pi_ok:canceled:0', 'apply process-settlements:reread:pi_ok:canceled:0', 'stamp pay-1']);
  assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 0, deferred: 0, failed: 0, defects: 1, blocked: 0 });
});

test('R4-A6 · an unproven answer whose move cannot be written is a defect too, and nothing is stamped', async () => {
  const r = await run([{ id: 'pay-1', provider_ref: 'pi_500' }], { pi_500: 500 }, { checkAnswer: () => new Response('no', { status: 500 }) });
  assert.deepEqual(moved(r.calls), ['pay-1'], 'the move was asked once');
  assert.deepEqual(stamped(r.calls), [], 'no final stamp');
  assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 1, blocked: 0 });
});

test('F2 (ii) · a row without an intent is never sent', async () => {
  const r = await run([{ id: 'pay-1', provider_ref: null }], {});
  assert.equal(cancels(r.calls).length, 0);
  assert.deepEqual(r.json.intents, { attempted: 0, succeeded: 0, deferred: 0, failed: 0, defects: 1, blocked: 0 });
});

// Rewritten (A5-04 ii): the passes take turns between runs, so the cancel pass runs after both money
// passes in turn 0 and turn 1 only; the order is turnOrder's, from one list (A5 point 10: the event
// scan is the fifth pass).
test('F2 (ii) · the cancel pass runs after both money passes in turn 0; the passes take turns between runs', () => {
  assert.match(source, /const PASS_NAMES: readonly PassName\[\] = \['payouts', 'transfers', 'refunds', 'intents', 'events'\];/);
  assert.match(source, /for \(const name of turnOrder\(run\.turn, PASS_NAMES\) as PassName\[\]\) \{\n    try \{\n      counts\[name\] = await passes\[name\]\(run\);/);
  assert.match(source, /payouts: runPayoutReads,\n    transfers: runTransfers,\n    refunds: runRefunds,\n    intents: runIntentCancels,\n    events: runEventScan,\n  \};/);
  const names = ['payouts', 'transfers', 'refunds', 'intents', 'events'];
  assert.deepEqual(classify.turnOrder(0, names), names, 'turn 0: the cancel pass after both money passes');
  assert.deepEqual(classify.turnOrder(3, names), ['intents', 'events', 'payouts', 'transfers', 'refunds'], 'turn 3: the cancel pass first');
  assert.equal((source.match(/await run(PayoutReads|Transfers|Refunds|IntentCancels|EventScan)\(/g) ?? []).length, 0, 'no pass is called outside the turn');
});

// ---------------------------------------------------------------------------
// M2-2 (R-F): the critic's R-A row "Intent cancel unknown", state by state.
// ---------------------------------------------------------------------------
const { intentReading, INTENT_OPEN_STATUSES } = classify;

test('R-F · the read, every state that proves nothing: no fact, no stamp, the row moved back with the answer', async () => {
  assert.deepEqual([...INTENT_OPEN_STATUSES],
    ['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture', 'processing']);
  const cases = [
    ...INTENT_OPEN_STATUSES.map((s) => [s, { status: 200, body: intent('pi_q', s) }, `read 200 ${s} received 0`]),
    ['an unfamiliar status', { status: 200, body: intent('pi_q', 'weird') }, 'read 200 weird received 0'],
    ['canceled, yet money received', { status: 200, body: intent('pi_q', 'canceled', 5150) }, 'read 200 canceled received 5150'],
    ['succeeded without its amount', { status: 200, body: intent('pi_q', 'succeeded', undefined, { amount_received: undefined }) }, 'read 200 succeeded'],
    ['succeeded with nothing received', { status: 200, body: intent('pi_q', 'succeeded', 0) }, 'read 200 succeeded received 0'],
    ['another intent', { status: 200, body: intent('pi_other', 'canceled') }, 'read 200: not this intent'],
    ['another object', { status: 200, body: { ...intent('pi_q', 'canceled'), object: 'charge' } }, 'read 200: not this intent'],
    ['no body', { status: 200, body: {} }, 'read 200: not this intent'],
    ['400 parameter mismatch', { status: 400, body: { error: { code: 'parameter_invalid_empty' } } }, 'read 400 parameter_invalid_empty'],
    ['401', 401, 'read 401 probe'], ['403', 403, 'read 403 probe'], ['404', 404, 'read 404 probe'],
    ['409', 409, 'read 409 probe'], ['429', 429, 'read 429 probe'], ['500', 500, 'read 500 probe'], ['503', 503, 'read 503 probe'],
    ['a throw (a timeout among them)', 'throw', 'read threw: network down'],
  ];
  for (const [label, read, words] of cases) {
    const r = await run([{ id: 'pay-q', provider_ref: 'pi_q' }], { pi_q: { cancel: { status: 400, body: { error: { code: 'payment_intent_unexpected_state' } } }, read } });
    assert.deepEqual(steps(r.calls), ['cancel pi_q', 'read pi_q', 'check pay-q'], `${label}: cancel, read, moved back`);
    assert.deepEqual(checks(r.calls), [{ p_payment_id: 'pay-q', p_answer: `cancel 400 payment_intent_unexpected_state; ${words}` }], label);
    assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 0, blocked: 0 }, label);
  }
});

test('R-F · canceled, read back: the payment_intent.canceled fact, stored and applied, then the stamp', async () => {
  const r = await run([{ id: 'pay-c', provider_ref: 'pi_c' }], {
    pi_c: { cancel: { status: 400, body: { error: { code: 'payment_intent_unexpected_state' } } }, read: { status: 200, body: intent('pi_c', 'canceled') } },
  });
  assert.deepEqual(steps(r.calls), ['cancel pi_c', 'read pi_c', 'fact process-settlements:reread:pi_c:canceled:0', 'apply process-settlements:reread:pi_c:canceled:0', 'stamp pay-c']);
  const stored = r.calls.find((c) => c.url === `${DB}/payment_events`);
  assert.equal(stored.headers.Prefer, 'return=minimal', 'the webhook\'s insert');
  assert.deepEqual(facts(r.calls), [{
    id: 'process-settlements:reread:pi_c:canceled:0', type: 'payment_intent.canceled', account_id: null,
    payload: { id: 'process-settlements:reread:pi_c:canceled:0', type: 'payment_intent.canceled', data: { object: {
      id: 'pi_c', object: 'payment_intent', status: 'canceled', amount: 5150, amount_received: 0, currency: 'usd',
    } } },
  }], 'a projection of the intent: never its client secret, never its metadata');
  assert.ok(!stored.body.includes('secret-for-the-test'));
  assert.deepEqual(records(r.calls), [{ p_payment_id: 'pay-c', p_final: true }]);
  assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 1, deferred: 0, failed: 0, defects: 0, blocked: 0 });

  // The cancel's own 2xx, this intent canceled: no read is needed.
  const direct = await run([{ id: 'pay-d', provider_ref: 'pi_d' }], { pi_d: 200 });
  assert.deepEqual(steps(direct.calls), ['cancel pi_d', 'fact process-settlements:reread:pi_d:canceled:0', 'apply process-settlements:reread:pi_d:canceled:0', 'stamp pay-d']);
  // A 2xx that is not this intent proves nothing: the intent is read.
  for (const body of [{ id: 'pi_e', status: 'canceled' }, intent('pi_other', 'canceled'), {}]) {
    const odd = await run([{ id: 'pay-e', provider_ref: 'pi_e' }], { pi_e: { cancel: { status: 200, body }, read: 404 } });
    assert.deepEqual(steps(odd.calls), ['cancel pi_e', 'read pi_e', 'check pay-e'], JSON.stringify(body));
  }
  // A fact already stored (the same state read twice): 409 is not an error, the fact is applied and stamped.
  const again = await run([{ id: 'pay-c', provider_ref: 'pi_c' }], { pi_c: 200 }, { insert: 409 });
  assert.deepEqual(steps(again.calls).slice(1), ['fact process-settlements:reread:pi_c:canceled:0', 'apply process-settlements:reread:pi_c:canceled:0', 'stamp pay-c']);
});

test('R-F · succeeded, read back: the funded-after-void fact with the amount received, and no stamp', async () => {
  const r = await run([{ id: 'pay-s', provider_ref: 'pi_s' }], {
    pi_s: { cancel: { status: 400, body: { error: { code: 'payment_intent_unexpected_state' } } }, read: { status: 200, body: intent('pi_s', 'succeeded', 5150) } },
  });
  assert.deepEqual(steps(r.calls), ['cancel pi_s', 'read pi_s', 'fact process-settlements:reread:pi_s:succeeded:5150', 'apply process-settlements:reread:pi_s:succeeded:5150']);
  assert.deepEqual(facts(r.calls)[0].payload.data.object,
    { id: 'pi_s', object: 'payment_intent', status: 'succeeded', amount: 5150, amount_received: 5150, currency: 'usd' });
  assert.equal(facts(r.calls)[0].type, 'payment_intent.succeeded');
  assert.deepEqual(records(r.calls), [], 'never stamped cancelled');
  assert.deepEqual(checks(r.calls), [], 'and not moved: the fact took the row out of the queue');
  assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 1, deferred: 0, failed: 0, defects: 0, blocked: 0 });
  // A different amount is carried as it was read; the database decides (payment_money_clear).
  const short = await run([{ id: 'pay-s', provider_ref: 'pi_s' }], { pi_s: { cancel: 400, read: { status: 200, body: intent('pi_s', 'succeeded', 1000) } } });
  assert.equal(facts(short.calls)[0].id, 'process-settlements:reread:pi_s:succeeded:1000');
  assert.equal(facts(short.calls)[0].payload.data.object.amount_received, 1000);
});

test('R-F · a fact that is not recorded is never stamped: the row is moved back, a defect now', async () => {
  const proven = { pi_f: { cancel: 400, read: { status: 200, body: intent('pi_f', 'canceled') } } };
  for (const [label, world] of [
    ['the insert failed', { insert: 500 }],
    ['the insert threw', { insert: 'throw' }],
    ['apply answered 500', { apply: 500 }],
    ['apply threw', { apply: 'throw' }],
    ['apply failed (ok false)', { apply: { ok: false, error: 'apply failed' } }],
    ['the fact matched no payment', { apply: { ok: true, payment_id: null } }],
    ['the fact matched another payment', { apply: { ok: true, payment_id: '00000000-0000-4000-8000-000000000000' } }],
  ]) {
    const r = await run([{ id: 'pay-f', provider_ref: 'pi_f' }], proven, world);
    assert.deepEqual(stamped(r.calls), [], `${label}: no stamp`);
    assert.deepEqual(checks(r.calls), [{ p_payment_id: 'pay-f', p_answer: 'cancel 400 probe; read 200 canceled; the fact was not recorded' }], label);
    assert.deepEqual(r.json.intents, { attempted: 1, succeeded: 0, deferred: 1, failed: 0, defects: 1, blocked: 0 }, label);
  }
});

test('R-F · intentReading: the fact id carries the status and the amount; the words are bounded', () => {
  assert.deepEqual(intentReading('pi_a', { status: 200, body: intent('pi_a', 'succeeded', 2599) }, 'read').event.id, 'process-settlements:reread:pi_a:succeeded:2599');
  assert.deepEqual(intentReading('pi_a', { status: 200, body: intent('pi_a', 'canceled') }, 'cancel').event.id, 'process-settlements:reread:pi_a:canceled:0');
  assert.equal(intentReading('pi_a', { status: 200, body: intent('pi_a', 'canceled') }, 'cancel').state, 'canceled');
  assert.equal(intentReading('', { status: 200, body: intent('', 'canceled') }, 'read').state, 'unknown', 'no ref, no proof');
  const long = intentReading('pi_a', { threw: new Error('x'.repeat(500)) }, 'read');
  assert.ok(long.answer.length <= 200 && long.answer.startsWith('read threw: x'));
  assert.equal(intentReading('pi_a', undefined, 'read').answer, 'read no status');
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
  // M2-1: the run's own report (record_timer_run) is answered 204 and is the last write of every run;
  // A9-03 (a): the note of the ready rows (note_ready_rows) is the first write of every run.
  const calls = [];
  const original = globalThis.fetch;
  const realDateNow = Date.now;
  Date.now = () => 0;
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? '' };
    calls.push(call);
    const at = call.url;
    if (call.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
    if (at.startsWith(`${DB}/transfers_ready?`) || at.startsWith(`${DB}/intents_to_cancel?`) || at.startsWith(`${DB}/payout_accounts_due?`)) return Response.json([]);
    if (at.startsWith(`${DB}/refunds_ready?`)) return Response.json([REFUND_ROW]);
    if (at === `${DB}/rpc/settlement_send_begin`) return Response.json(true);
    if (at === `${DB}/rpc/note_ready_rows`) return Response.json(0);
    if (at === `${DB}/rpc/record_timer_run`) return new Response(null, { status: 204 });
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
    Date.now = realDateNow;
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
    assert.equal(settlementVerdict('refund', { status: 200, body }).next, 'stop', `${status}: and the attempt still stops`);
  }
  // Controls: every other answer is not a failure the provider reported.
  for (const [label, kind, outcome] of [
    ['pending', 'refund', { status: 200, body: refund('pending') }],
    ['succeeded', 'refund', { status: 200, body: refund('succeeded') }],
    ['no status', 'refund', { status: 200, body: refund(undefined) }],
    ['no amount', 'refund', { status: 200, body: { ...refund('failed'), amount: 0 } }],
    ['not a refund id', 'refund', { status: 200, body: { ...refund('failed'), id: 'tr_r11' } }],
    ['a stop code on a 4xx', 'refund', { status: 400, body: { error: { type: 'invalid_request_error', code: 'charge_disputed', message: 'disputed' } } }],
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
      'rpc/note_ready_rows',
      'rpc/settlement_send_begin', 'stripe /v1/refunds', 'payment_events', 'rpc/apply_payment_event', 'rpc/record_settlement_result',
      'rpc/record_timer_run',
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
  assert.deepEqual(writes(again.calls).slice(3), ['payment_events', 'rpc/apply_payment_event', 'rpc/record_settlement_result', 'rpc/record_timer_run']);
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
  assert.deepEqual(writes(pending.calls), ['rpc/note_ready_rows', 'rpc/settlement_send_begin', 'stripe /v1/refunds', 'rpc/record_settlement_sent', 'rpc/record_timer_run'], 'pending: written back as sent');
  const disputed = await runRefund({ provider: { status: 400, body: { error: { type: 'invalid_request_error', code: 'charge_disputed', message: 'disputed' } } } });
  assert.deepEqual(writes(disputed.calls), ['rpc/note_ready_rows', 'rpc/settlement_send_begin', 'stripe /v1/refunds', 'rpc/record_settlement_result', 'rpc/record_timer_run'], 'a 4xx stop code: the stop alone');
  assert.equal(bodyOf(disputed.calls, 'rpc/record_settlement_result')[0].p_next, 'stop');
  const unknown = await runRefund({ provider: { status: 500, body: {} } });
  assert.deepEqual(writes(unknown.calls), ['rpc/note_ready_rows', 'rpc/settlement_send_begin', 'stripe /v1/refunds', 'rpc/record_settlement_result', 'rpc/record_timer_run'], 'a 5xx: the same key, no event');
  assert.equal(bodyOf(unknown.calls, 'rpc/record_settlement_result')[0].p_next, 'same_key');
  const threw = await runRefund({ provider: 'throw' });
  assert.equal(writes(threw.calls).includes('payment_events'), false, 'a throw: no event');
});
