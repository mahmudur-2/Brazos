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
const LIMIT_IMPORT = /^import \{ overHourlyLimit, RATE_LIMITED \} from '\.\.\/_shared\/rateLimit\.ts';$/m;

const source = read(FILE);
globalThis.__cpStubs = {
  notConfigured: () => null,
  PUBLISHABLE_KEY: 'publishable-for-the-test',
  SECRET_KEY: 'service-for-the-test',
  serviceHeaders: () => ({ 'Content-Type': 'application/json' }),
  verifiedUser: async () => ({ id: 'user-1' }),
  overHourlyLimit: async () => false,
  RATE_LIMITED: 'Too many tries.',
};
const js = stripTypeScriptTypes(
  source
    .replace(AUTH_IMPORT, 'const { notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser } = globalThis.__cpStubs;')
    .replace(LIMIT_IMPORT, 'const { overHourlyLimit, RATE_LIMITED } = globalThis.__cpStubs;'),
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
async function run({ payment = PAYMENT, body = { jobId: 'job-1' }, stored } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const call = { url: String(url), method, headers: init.headers ?? {}, body: init.body ?? '' };
    calls.push(call);
    const at = call.url;
    if (at === `${ENV.SUPABASE_URL}/rest/v1/rpc/begin_job_payment`) return Response.json(payment);
    if (at === `${ENV.SUPABASE_URL}/rest/v1/rpc/get_payment_customer`) return Response.json('cus_test');
    if (at === `${ENV.SUPABASE_URL}/rest/v1/rpc/attach_provider_ref`) return Response.json(null);
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
    return { status: res.status, json: await res.json(), calls, errors };
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
    assert.deepEqual(r.json, { error: 'The payment provider is unavailable right now.' }, `${why}: the one sentence`);
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
