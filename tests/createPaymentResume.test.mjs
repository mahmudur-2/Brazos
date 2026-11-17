// Pack 1, A2: create-payment resumes the intent the ledger row already names, and never creates a
// second one. The intent's idempotency key (brazos-intent-<payment id>) lasts about 24 hours at the
// provider; a POST after that minted a new intent the ledger never named, and the app was handed
// its secret. Deno cannot run here, so the handler's own body is executed under node: its two
// imports are swapped for stubs, its types stripped (edgeServiceAuth.test.mjs's way), Deno.serve
// hands over the handler, and a fake fetch answers the database and the provider and records every
// call. Test values only; none is shaped like a real key.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const FILE = 'supabase/functions/create-payment/index.ts';
const AUTH_IMPORT =
  /^import \{ notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser \} from '\.\.\/_shared\/serviceAuth\.ts';$/m;
const LIMIT_IMPORT = /^import \{ refuseUnadmitted \} from '\.\.\/_shared\/rateLimit\.ts';$/m;

const source = read(FILE);
globalThis.__cpStubs = {
  notConfigured: () => null,
  PUBLISHABLE_KEY: 'publishable-for-the-test',
  SECRET_KEY: 'service-for-the-test',
  serviceHeaders: () => ({ 'Content-Type': 'application/json' }),
  verifiedUser: async () => ({ id: 'user-1' }),
  // active_account_rule: an active account within its limit (tests/edgeAdmission.test.mjs runs the refusals).
  refuseUnadmitted: async () => null,
};
const js = stripTypeScriptTypes(
  source
    .replace(AUTH_IMPORT, 'const { notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser } = globalThis.__cpStubs;')
    .replace(LIMIT_IMPORT, 'const { refuseUnadmitted } = globalThis.__cpStubs;'),
  { mode: 'strip' }
);

let handler = null;
const ENV = { SUPABASE_URL: 'http://supabase.test', STRIPE_SECRET_KEY: 'stripe-secret-for-the-test' };
globalThis.Deno = { env: { get: (name) => ENV[name] }, serve: (h) => { handler = h; } };
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const STRIPE = 'https://api.stripe.com';
const PAYMENT = { id: 'pay-1', charge_amount_cents: 5375, provider_ref: null };

/**
 * One call to the handler against a fake world. `stored` is the intent the provider holds under the
 * row's provider_ref (or a function answering its GET). Returns the response, its body and every call.
 */
async function run({ payment = PAYMENT, body = { jobId: 'job-1' }, stored, tipRows, earlier, answer } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const call = { url: String(url), method, headers: init.headers ?? {}, body: init.body ?? '' };
    calls.push(call);
    const at = call.url;
    // SM-04: one call answered (or thrown) as the test says; undefined = the fake world's answer.
    const given = answer ? answer(call) : undefined;
    if (given) return given;
    if (at === `${ENV.SUPABASE_URL}/rest/v1/rpc/begin_job_payment`) return Response.json(payment);
    if (at === `${ENV.SUPABASE_URL}/rest/v1/rpc/begin_tip_payment`) return Response.json(payment);
    if (at === `${ENV.SUPABASE_URL}/rest/v1/rpc/get_payment_customer`) return Response.json('cus_test');
    if (at === `${ENV.SUPABASE_URL}/rest/v1/rpc/attach_provider_ref`) return Response.json(null);
    // SM-03 (c): the caller's unfunded tip row, read before begin_tip_payment (unset: an unexpected answer).
    if (tipRows && at.startsWith(`${ENV.SUPABASE_URL}/rest/v1/payments?`)) return typeof tipRows === 'function' ? tipRows() : Response.json(tipRows);
    if (earlier && at === `${STRIPE}/v1/payment_intents/pi_earlier` && method === 'GET') return typeof earlier === 'function' ? earlier() : Response.json({ id: 'pi_earlier', status: earlier });
    if (at === `${STRIPE}/v1/ephemeral_keys`) return Response.json({ secret: 'ek_test' });
    if (at === `${STRIPE}/v1/payment_intents` && method === 'POST') {
      return Response.json({ id: 'pi_new', client_secret: 'pi_new_secret' });
    }
    if (payment.provider_ref && at === `${STRIPE}/v1/payment_intents/${payment.provider_ref}` && method === 'GET') {
      return typeof stored === 'function' ? stored() : Response.json(stored);
    }
    if (at.startsWith(`${STRIPE}/v1/payment_intents/`) && method === 'GET') {
      return Response.json({ id: at.split('/').pop(), status: 'requires_payment_method' });
    }
    if (at.startsWith(`${STRIPE}/v1/payment_methods/`)) return Response.json({ customer: 'cus_test', type: 'card' });
    if (at.endsWith('/confirm')) return Response.json({ status: 'succeeded' });
    if (at.startsWith(`${STRIPE}/v1/payment_intents/`)) return Response.json({ id: at.split('/').pop() });
    return new Response('unexpected', { status: 599 });
  };
  try {
    const req = new Request('http://edge.test/create-payment', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const errors = [];
    const log = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    let res;
    try {
      res = await handler(req);
    } finally {
      console.error = log;
    }
    return { status: res.status, type: res.headers.get('Content-Type'), json: await res.json(), calls, errors };
  } finally {
    globalThis.fetch = original;
  }
}

const creates = (calls) => calls.filter((c) => c.url === `${STRIPE}/v1/payment_intents` && c.method === 'POST');
const attaches = (calls) => calls.filter((c) => c.url.endsWith('/rest/v1/rpc/attach_provider_ref'));
const reads = (calls, id) => calls.filter((c) => c.url === `${STRIPE}/v1/payment_intents/${id}` && c.method === 'GET');
const ephemerals = (calls) => calls.filter((c) => c.url === `${STRIPE}/v1/ephemeral_keys`);

test('0 · the harness: both imports are where the stubs expect them, and the handler was served', () => {
  assert.match(source, AUTH_IMPORT);
  assert.match(source, LIMIT_IMPORT);
  assert.equal(typeof handler, 'function');
});

test('A2 · a row that already names its intent: that intent is read and resumed, never created again', async () => {
  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  const r = await run({ payment, stored: { id: 'pi_stored', client_secret: 'pi_stored_secret', status: 'requires_payment_method' } });
  assert.equal(r.status, 200);
  assert.equal(creates(r.calls).length, 0, 'no POST /v1/payment_intents');
  assert.equal(reads(r.calls, 'pi_stored').length, 1, 'one read of the stored intent');
  assert.equal(attaches(r.calls).length, 0, 'nothing to attach: the row already names it');
  assert.deepEqual(r.json, { paymentId: 'pay-1', customerId: 'cus_test', clientSecret: 'pi_stored_secret', ephemeralKeySecret: 'ek_test' });
});

test('A2 · the stored intent cannot be read: the request fails, and nothing is created', async () => {
  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  for (const [why, stored] of [
    ['a 404', () => Response.json({ error: { type: 'invalid_request_error' } }, { status: 404 })],
    ['a 500', () => Response.json({}, { status: 500 })],
    ['a 200 without a secret', () => Response.json({ id: 'pi_stored' })],
  ]) {
    const r = await run({ payment, stored });
    assert.equal(r.status, 502, `${why}: 502`);
    // SM-04: before the confirm call, so nothing was charged.
    assert.deepEqual(r.json, { error: 'The payment provider is unavailable right now.', ambiguous: false }, `${why}: the one sentence`);
    assert.equal(creates(r.calls).length, 0, `${why}: never a POST in its place`);
    assert.equal(attaches(r.calls).length, 0, `${why}: nothing attached`);
  }
  const thrown = await run({ payment, stored: () => { throw new TypeError('fetch failed'); } });
  assert.equal(thrown.status, 500, 'no answer at all: the request fails');
  assert.equal(creates(thrown.calls).length, 0, 'no answer at all: never a POST in its place');
});

test('A2 (control) · a row with no intent yet: one is created under the row\'s key, for the row\'s amount, and attached', async () => {
  const r = await run();
  assert.equal(r.status, 200);
  const [create, ...more] = creates(r.calls);
  assert.equal(more.length, 0, 'one create');
  assert.equal(create.headers['Idempotency-Key'], 'brazos-intent-pay-1');
  const fields = new URLSearchParams(create.body);
  assert.equal(fields.get('amount'), '5375', 'the row\'s own charge_amount_cents');
  assert.equal(fields.get('metadata[payment_id]'), 'pay-1');
  const [attach, ...again] = attaches(r.calls);
  assert.equal(again.length, 0, 'one attach');
  assert.deepEqual(JSON.parse(attach.body), { p_payment_id: 'pay-1', p_ref: 'pi_new' });
  assert.deepEqual(r.json, { paymentId: 'pay-1', customerId: 'cus_test', clientSecret: 'pi_new_secret', ephemeralKeySecret: 'ek_test' });
});

test('A2 · Confirm with a saved card mints no ephemeral key (only the sheet uses one), and confirms the ledger\'s intent', async () => {
  const body = { jobId: 'job-1', useSavedCard: true, paymentMethodId: 'pm_saved' };
  const fresh = await run({ body });
  assert.deepEqual(fresh.json, { paymentId: 'pay-1', confirmed: true });
  assert.equal(ephemerals(fresh.calls).length, 0, 'no /v1/ephemeral_keys on the confirm path');
  assert.ok(fresh.calls.some((c) => c.url === `${STRIPE}/v1/payment_intents/pi_new/confirm`), 'the new intent is confirmed');

  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  const resumed = await run({ payment, body, stored: { id: 'pi_stored', client_secret: 'pi_stored_secret', status: 'requires_payment_method' } });
  assert.deepEqual(resumed.json, { paymentId: 'pay-1', confirmed: true });
  assert.equal(creates(resumed.calls).length, 0, 'no POST /v1/payment_intents');
  assert.equal(ephemerals(resumed.calls).length, 0, 'no /v1/ephemeral_keys');
  assert.ok(resumed.calls.some((c) => c.url === `${STRIPE}/v1/payment_intents/pi_stored/confirm`), 'the stored intent is confirmed');
});

// Codex R2 (gap): a stored intent the provider already settled, challenged or cancelled, resumed on
// the SHEET path. Today the function does not read its status there (index.ts:337-345, 425-429): it
// hands back the same four fields as for a payable intent, and the sheet on the device decides.
// Pinned as it is. A terminal branch in the saved-card path's shape ({ paymentId, confirmed }) would
// be refused by the app's validateCheckoutResponse with "Nothing was charged", a wrong sentence for a
// succeeded intent, so none is built: open.
// P-1 took the settled states out of this pin (the tests below); the challenged and cancelled stay open.
test('A2 (pinned, open) · a stored intent that needs the bank, or was cancelled: the sheet path hands back its secret as it is', async () => {
  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  for (const status of ['requires_action', 'canceled']) {
    const r = await run({ payment, stored: { id: 'pi_stored', client_secret: 'pi_stored_secret', status } });
    assert.equal(r.status, 200, `${status}: 200`);
    assert.deepEqual(r.json, { paymentId: 'pay-1', customerId: 'cus_test', clientSecret: 'pi_stored_secret', ephemeralKeySecret: 'ek_test' },
      `${status}: the sheet's four fields, the stored intent's own secret`);
    assert.equal(creates(r.calls).length, 0, `${status}: never a second intent`);
    assert.equal(attaches(r.calls).length, 0, `${status}: nothing attached`);
    assert.equal(r.calls.filter((c) => c.url.endsWith('/confirm')).length, 0, `${status}: nothing confirmed by the server`);
    assert.equal(r.calls.filter((c) => c.url === `${STRIPE}/v1/payment_intents/pi_stored` && c.method === 'POST').length, 0,
      `${status}: no update without saveCard`);
  }
});

// P-1: a resumed intent the provider already settled (the sheet lost its answer, the webhook is late)
// is never written again. Before, the job sheet's setup_future_usage update was refused by the
// provider for a settled intent and the customer read a 502 that said nothing was charged.
const SETTLED = ['succeeded', 'processing', 'requires_capture'];
const stripePosts = (calls) => calls.filter((c) => c.url.startsWith(STRIPE) && c.method === 'POST');

test('P-1 · sheet path, a stored intent already settled: { paymentId, confirmed: true }, and no write reaches the provider', async () => {
  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  for (const status of SETTLED) {
    for (const body of [{ jobId: 'job-1', saveCard: true }, { jobId: 'job-1', saveCard: false }, { jobId: 'job-1' }]) {
      const label = `${status}, saveCard ${String(body.saveCard)}`;
      const r = await run({ payment, body, stored: { id: 'pi_stored', client_secret: 'pi_stored_secret', status } });
      assert.equal(r.status, 200, `${label}: 200`);
      assert.deepEqual(r.json, { paymentId: 'pay-1', confirmed: true }, `${label}: the saved-card path's answer`);
      assert.equal(stripePosts(r.calls).length, 0, `${label}: no POST to the provider at all`);
      assert.equal(reads(r.calls, 'pi_stored').length, 1, `${label}: the one read of the stored intent`);
      assert.equal(attaches(r.calls).length, 0, `${label}: nothing attached`);
    }
  }
});

test('P-1 · saved-card path, a stored intent already settled: the same answer, nothing confirmed or written', async () => {
  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  const body = { jobId: 'job-1', useSavedCard: true, paymentMethodId: 'pm_saved' };
  for (const status of SETTLED) {
    const r = await run({ payment, body, stored: { id: 'pi_stored', client_secret: 'pi_stored_secret', status } });
    assert.equal(r.status, 200, `${status}: 200`);
    assert.deepEqual(r.json, { paymentId: 'pay-1', confirmed: true }, `${status}: confirmed`);
    assert.equal(stripePosts(r.calls).length, 0, `${status}: no POST to the provider at all`);
    assert.equal(reads(r.calls, 'pi_stored').length, 1, `${status}: answered from the first read, not a second one`);
  }
});

test('P-1 (control) · sheet path, a stored intent still payable: the opt-in is sent and the sheet gets its four fields', async () => {
  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  const r = await run({ payment, body: { jobId: 'job-1', saveCard: true }, stored: { id: 'pi_stored', client_secret: 'pi_stored_secret', status: 'requires_payment_method' } });
  assert.equal(r.status, 200);
  const updates = r.calls.filter((c) => c.url === `${STRIPE}/v1/payment_intents/pi_stored` && c.method === 'POST');
  assert.equal(updates.length, 1, 'one update of the stored intent');
  assert.equal(new URLSearchParams(updates[0].body).get('setup_future_usage'), 'off_session');
  assert.deepEqual(r.json, { paymentId: 'pay-1', customerId: 'cus_test', clientSecret: 'pi_stored_secret', ephemeralKeySecret: 'ek_test' });
});

test('P-1, SM-03 (a) · a TIP resume whose stored intent is settled: { paymentId, confirmed: true }, and no write reaches the provider', async () => {
  const payment = { ...PAYMENT, provider_ref: 'pi_stored' };
  for (const status of SETTLED) {
    const r = await run({ payment, body: { jobId: 'job-1', tipAmountCents: 500 }, tipRows: [], stored: { id: 'pi_stored', client_secret: 'pi_stored_secret', status } });
    assert.equal(r.status, 200, `${status}: 200`);
    assert.ok(r.calls.some((c) => c.url.endsWith('/rest/v1/rpc/begin_tip_payment')), `${status}: the tip row`);
    assert.deepEqual(r.json, { paymentId: 'pay-1', confirmed: true }, `${status}: confirmed`);
    assert.deepEqual(r.calls.filter((c) => c.url.startsWith(STRIPE)).map((c) => `${c.method} ${c.url.slice(STRIPE.length)}`),
      ['GET /v1/payment_intents/pi_stored'], `${status}: the one read, no ephemeral key`);
  }
});

const tipReads = (calls) => calls.filter((c) => c.url.startsWith(`${ENV.SUPABASE_URL}/rest/v1/payments?`));
const tipBegins = (calls) => calls.filter((c) => c.url.endsWith('/rest/v1/rpc/begin_tip_payment'));
const TIP_BODY = { jobId: 'job-1', tipAmountCents: 900 };
const EARLIER = [{ id: 'pay-0', provider_ref: 'pi_earlier' }];

test('SM-03 (c) · another amount while the earlier tip\'s intent is settled: that row confirmed, no begin_tip_payment, no write anywhere', async () => {
  for (const status of SETTLED) {
    const r = await run({ body: TIP_BODY, tipRows: EARLIER, earlier: status });
    assert.equal(r.status, 200, `${status}: 200`);
    assert.deepEqual(r.json, { paymentId: 'pay-0', confirmed: true }, `${status}: the earlier row's id`);
    assert.equal(tipBegins(r.calls).length, 0, `${status}: begin_tip_payment is not called (nothing voided)`);
    assert.equal(stripePosts(r.calls).length, 0, `${status}: no POST to the provider`);
    assert.deepEqual(r.calls.map((c) => c.method), ['GET', 'GET'], `${status}: two reads, nothing else`);
    const read = new URL(tipReads(r.calls)[0].url);
    assert.equal(read.searchParams.get('payer_id'), 'eq.user-1', 'the verified caller, never the body');
    assert.equal(read.searchParams.get('job_id'), 'eq.job-1');
    assert.equal(read.searchParams.get('kind'), 'eq.tip');
    assert.equal(read.searchParams.get('status'), 'eq.unfunded');
    assert.equal(read.searchParams.get('order'), 'created_at.desc');
    assert.equal(read.searchParams.get('limit'), '1');
    assert.equal(tipReads(r.calls)[0].headers.Authorization, undefined, 'read with the service headers, never the caller\'s token');
  }
});

test('SM-03 (c) (control) · the earlier intent is not settled: today\'s path exactly (begin_tip_payment, a new intent, the sheet)', async () => {
  const r = await run({ body: TIP_BODY, tipRows: EARLIER, earlier: 'requires_payment_method' });
  assert.equal(tipReads(r.calls).length, 1, 'the earlier row was read');
  assert.equal(tipBegins(r.calls).length, 1, 'begin_tip_payment decides');
  assert.deepEqual(r.json, { paymentId: 'pay-1', customerId: 'cus_test', clientSecret: 'pi_new_secret', ephemeralKeySecret: 'ek_test' });
});

test('SM-03 (c) (control) · the pre-read answers no row or no stored intent: today\'s path exactly, no new refusal', async () => {
  const answers = [
    () => Response.json({ not: 'a list' }),
    () => Response.json([]),
    () => Response.json([{ id: 'pay-0', provider_ref: null }]),
  ];
  for (const [index, tipRows] of answers.entries()) {
    const r = await run({ body: TIP_BODY, tipRows });
    assert.equal(tipReads(r.calls).length, 1, `${index}: the read was tried`);
    assert.equal(tipBegins(r.calls).length, 1, `${index}: begin_tip_payment decides`);
    assert.equal(r.status, 200, `${index}: 200`);
    assert.deepEqual(r.json, { paymentId: 'pay-1', customerId: 'cus_test', clientSecret: 'pi_new_secret', ephemeralKeySecret: 'ek_test' }, `${index}`);
  }
  // A job payment never reads a tip row.
  assert.equal(tipReads((await run({ body: { jobId: 'job-1' }, tipRows: EARLIER, earlier: 'succeeded' })).calls).length, 0);
});

// SM-03 (c), unknown state: a pre-read that fails for a moment refuses with an existing answer; begin_tip_payment
// would void a row whose intent may already be settled, and the sheet would charge a second time.
const fails = (status) => () => Response.json({ error: { type: 'api_error' } }, { status });
const throws = () => { throw new TypeError('fetch failed'); };
const stopped = (r, label) => {
  assert.equal(tipBegins(r.calls).length, 0, `${label}: begin_tip_payment is not called`);
  assert.equal(creates(r.calls).length, 0, `${label}: no intent is created`);
};

test('SM-03 (c) T1 · the tip row read answers 503, 429 or throws: 500 with the begin call\'s own answer, nothing begun', async () => {
  for (const [label, tipRows, line] of [['503', fails(503), '503'], ['429', fails(429), '429'], ['thrown', throws, 'threw']]) {
    const r = await run({ body: TIP_BODY, tipRows });
    assert.equal(r.status, 500, `${label}: 500`);
    assert.deepEqual(r.json, { error: 'Could not start this payment.', ambiguous: false }, `${label}`);
    stopped(r, label);
    assert.deepEqual(r.errors, [`create-payment: tip pre-read payments ${line}`], `${label}: one log line, place and status`);
  }
});

test('SM-03 (c) T2 · a row is found and its intent read answers 503 or 429: line 364\'s 502, nothing begun', async () => {
  for (const status of [503, 429]) {
    const r = await run({ body: TIP_BODY, tipRows: EARLIER, earlier: fails(status) });
    assert.equal(r.status, 502, `${status}: 502`);
    assert.deepEqual(r.json, { error: 'The payment provider is unavailable right now.', ambiguous: false }, `${status}`);
    stopped(r, status);
    assert.deepEqual(r.errors, [`create-payment: tip pre-read intent ${status}`]);
  }
});

test('SM-03 (c) T3 · a row is found and its intent read throws: line 364\'s 502, nothing begun', async () => {
  const r = await run({ body: TIP_BODY, tipRows: EARLIER, earlier: throws });
  assert.equal(r.status, 502);
  assert.deepEqual(r.json, { error: 'The payment provider is unavailable right now.', ambiguous: false });
  stopped(r, 'thrown');
  assert.deepEqual(r.errors, ['create-payment: tip pre-read intent threw']);
});

test('SM-03 (c) C1 · the tip row read is refused for good (400, 401, 403, 404): today\'s path, begin_tip_payment decides', async () => {
  for (const status of [400, 401, 403, 404]) {
    const r = await run({ body: TIP_BODY, tipRows: fails(status) });
    assert.equal(tipBegins(r.calls).length, 1, `${status}: begin_tip_payment decides`);
    assert.equal(r.status, 200, `${status}: 200`);
  }
});

test('SM-03 (c) C2 · a row is found and its intent read answers 404: today\'s path, begin_tip_payment decides', async () => {
  const r = await run({ body: TIP_BODY, tipRows: EARLIER, earlier: fails(404) });
  assert.equal(tipBegins(r.calls).length, 1, 'begin_tip_payment decides');
  assert.equal(r.status, 200);
});

// ---------------------------------------------------------------- SM-04: a refusal before any charge says so

const SAVED = { jobId: 'job-1', useSavedCard: true, paymentMethodId: 'pm_saved' };
const UNAVAILABLE = 'The payment provider is unavailable right now.';

test('SM-04 · every answer of 500 or more before the confirm call carries ambiguous: false, with its status and type', async () => {
  const cases = [
    ['the card read answers 503', SAVED, (c) => (c.url.includes('/v1/payment_methods/') ? new Response('{}', { status: 503 }) : undefined), 502, { error: UNAVAILABLE }],
    ['the customer read fails (thrown, the catch)', SAVED, (c) => (c.url.endsWith('/rpc/get_payment_customer') ? new Response('down', { status: 500 }) : undefined), 500, { error: 'Could not start this payment.' }],
    ['begin_job_payment answers 500', SAVED, (c) => (c.url.endsWith('/rpc/begin_job_payment') ? Response.json({ message: 'boom' }, { status: 500 }) : undefined), 500, { error: 'boom' }],
    ['the intent create fails (sheet path)', { jobId: 'job-1' }, (c) => (c.url === `${STRIPE}/v1/payment_intents` ? Response.json({}, { status: 500 }) : undefined), 502, { error: UNAVAILABLE }],
    ['the intent read before the confirm throws', SAVED, (c) => (c.method === 'GET' && c.url === `${STRIPE}/v1/payment_intents/pi_new` ? (() => { throw new TypeError('fetch failed'); })() : undefined), 500, { error: 'Could not start this payment.' }],
  ];
  for (const [why, body, answer, status, sent] of cases) {
    const r = await run({ body, answer });
    assert.equal(r.status, status, `${why}: the status is kept`);
    assert.equal(r.type, 'application/json', `${why}: the type is kept`);
    assert.deepEqual(r.json, { ...sent, ambiguous: false }, `${why}: nothing was charged`);
    assert.equal(r.calls.filter((c) => c.url.endsWith('/confirm')).length, 0, `${why}: no confirm call`);
  }
});

test('SM-04 (controls) · a 4xx gets no field; at the confirm call nothing changes', async () => {
  const refused = await run({ body: SAVED, answer: (c) => (c.url.endsWith('/rpc/begin_job_payment') ? Response.json({ message: 'Job not found' }, { status: 400 }) : undefined) });
  assert.equal(refused.status, 400);
  assert.deepEqual(refused.json, { error: 'Job not found' });
  const gone = await run({ body: SAVED, answer: (c) => (c.url.includes('/v1/payment_methods/') ? Response.json({}, { status: 404 }) : undefined) });
  assert.deepEqual(gone.json, { error: 'That card is no longer saved. Protect the payment in Checkout.', code: 'no_saved_card' });
  // The confirm call throws: no answer is known, so no `ambiguous` (the app reads a 500 without it as unknown).
  const thrown = await run({ body: SAVED, answer: (c) => (c.url.endsWith('/confirm') ? (() => { throw new TypeError('fetch failed'); })() : undefined) });
  assert.equal(thrown.status, 500);
  assert.deepEqual(thrown.json, { error: 'Could not start this payment.' });
  // The confirm call answers 5xx: ambiguous: true, as before.
  const failed = await run({ body: SAVED, answer: (c) => (c.url.endsWith('/confirm') ? Response.json({ error: { type: 'api_error' } }, { status: 500 }) : undefined) });
  assert.equal(failed.status, 502);
  assert.deepEqual(failed.json, { error: UNAVAILABLE, ambiguous: true });
});
