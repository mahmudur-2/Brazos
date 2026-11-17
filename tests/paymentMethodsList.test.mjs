// A4-02 (production-36h, order O1-P): payment-methods' list action, when Stripe has deleted the stored
// customer. The app deletes an account only after this list proves that no card is left (lib/legal/
// privacyPolicy.ts section 7), so a list that fails for ever is a dead end. What must stay true: the
// list answers { cards: [] } only when a READ of the stored customer, with the same key, answers that
// this very customer is deleted (isDeletedCustomer in supabase/functions/_shared/stripeCustomer.mjs,
// the account cleanup's own test, A11-10's 404 rule); every other failure stays the 500 it was, a
// "no such customer" included (this key may not know the customer: another account or another mode),
// so no card is ever reported gone unless Stripe said so; remove and setup do not change. Deno cannot
// run here, so the handler's own body is executed under node (tests/edgeAdmission.test.mjs's way): the
// auth import is a stub that names the caller, the admission and the shared test are the REAL modules,
// Deno.serve hands over the handler, and a fake fetch plays the project and Stripe. Test values only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const toModule = (js) => 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const FILE = 'supabase/functions/payment-methods/index.ts';
const SHARED = 'supabase/functions/_shared/stripeCustomer.mjs';
const CLEANUP = 'supabase/functions/_shared/accountCleanup.ts';
const AUTH_IMPORT =
  /^import \{ notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser \} from '\.\.\/_shared\/serviceAuth\.ts';$/m;
const ADMIT_IMPORT = /^import \{ refuseUnadmitted \} from '\.\.\/_shared\/rateLimit\.ts';$/m;
const SHARED_IMPORT = /^(import \{[^}]+\} from )'\.\.\/_shared\/([A-Za-z]+\.mjs)';$/m;

const admission = await import(toModule(stripTypeScriptTypes(read('supabase/functions/_shared/rateLimit.ts'), { mode: 'strip' })));
// Absent before A4-02 (the red run): the tests that need it fail, the others still run.
const shared = await import(pathToFileURL(join(root, SHARED)).href).catch(() => ({}));

const ENV = { SUPABASE_URL: 'http://supabase.test', STRIPE_SECRET_KEY: 'stripe-secret-for-the-test' };
const USER = { id: 'user-1', email: 'customer@brazos.test' };
const CUS = 'cus_Gone';
globalThis.__pmStubs = {
  notConfigured: () => null,
  PUBLISHABLE_KEY: 'publishable-for-the-test',
  SECRET_KEY: 'service-for-the-test',
  serviceHeaders: () => ({ apikey: 'service-for-the-test', 'Content-Type': 'application/json' }),
  verifiedUser: async () => USER,
  refuseUnadmitted: admission.refuseUnadmitted,
};

const source = read(FILE);
assert.match(source, AUTH_IMPORT, 'the auth import is where the stub expects it');
assert.match(source, ADMIT_IMPORT, 'the admission import is where the loader expects it');
const js = source
  .replace(AUTH_IMPORT, 'const { notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser } = globalThis.__pmStubs;')
  .replace(ADMIT_IMPORT, 'const { refuseUnadmitted } = globalThis.__pmStubs;')
  // The shared test is imported from its real file.
  .replace(SHARED_IMPORT, (_, head, name) => `${head}'${pathToFileURL(join(root, 'supabase/functions/_shared', name)).href}';`);
let handler = null;
globalThis.Deno = { env: { get: (name) => ENV[name] }, serve: (h) => { handler = h; } };
await import(toModule(stripTypeScriptTypes(js, { mode: 'strip' })));
assert.equal(typeof handler, 'function', 'served');

const STRIPE = 'https://api.stripe.com';
const LIST = `${STRIPE}/v1/customers/${CUS}/payment_methods?type=card&limit=5`;
const READ = `${STRIPE}/v1/customers/${CUS}`;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// Stripe's error object (the documented code; the message is the one Stripe writes for a customer).
const missing = (param) => () =>
  json({ error: { type: 'invalid_request_error', code: 'resource_missing', param, message: `No such ${param}: '${CUS}'` } }, 404);
const missingCustomer = missing('customer');
const deletedCustomer = () => json({ id: CUS, object: 'customer', deleted: true });
const liveCustomer = () => json({ id: CUS, object: 'customer' });
const apiError = () => json({ error: { type: 'api_error', code: 'api_error' } }, 500);
const CARD = { id: 'pm_1', object: 'payment_method', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } };

/** One request against a fake world. Returns status, body and every call, each with its key. */
async function run(body, answers = {}) {
  const world = {
    admit: () => json('ok'),
    customer: () => json(CUS),
    list: () => json({ object: 'list', data: [CARD] }),
    read: liveCustomer,
    detach: () => json({ id: CARD.id, object: 'payment_method' }),
    ...answers,
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';
    const key =
      u === `${ENV.SUPABASE_URL}/rest/v1/rpc/admit_user_call` ? 'admit'
      : u === `${ENV.SUPABASE_URL}/rest/v1/rpc/get_payment_customer` ? 'customer'
      : u === LIST && method === 'GET' ? 'list'
      : u === READ && method === 'GET' ? 'read'
      : u === `${STRIPE}/v1/payment_methods/${CARD.id}/detach` && method === 'POST' ? 'detach'
      : 'unknown';
    calls.push({ key, method, url: u, headers: init.headers ?? {} });
    if (key === 'unknown') return new Response('unexpected', { status: 599 });
    return world[key]();
  };
  try {
    const res = await handler(new Request('http://edge.test/payment-methods', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json().catch(() => null), calls };
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}
const keys = (out) => out.calls.map((c) => c.key);
const FAILED = { error: 'Could not reach your cards right now.' };

test('A4-02 · a stored customer that Stripe reports deleted lists no card: 200 { cards: [] }', async () => {
  // Red without the change: the failed list was a 500 for ever, and the account could not be deleted.
  const out = await run({ action: 'list' }, { list: missingCustomer, read: deletedCustomer });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { cards: [] });
  assert.deepEqual(keys(out), ['admit', 'customer', 'list', 'read']);
  const readCall = out.calls[3];
  assert.equal(readCall.method, 'GET');
  assert.equal(readCall.headers.Authorization, `Bearer ${ENV.STRIPE_SECRET_KEY}`, 'the read asks with the same key');
  // A failed list of any kind is decided by the same read: a deleted customer holds no card.
  const afterOutage = await run({ action: 'list' }, { list: apiError, read: deletedCustomer });
  assert.deepEqual([afterOutage.status, afterOutage.body], [200, { cards: [] }]);
});

test('A4-02 · every other failure stays a failure: 500, no card reported gone', async () => {
  const cases = [
    ['a Stripe 500 on the list, the customer live', apiError, liveCustomer],
    ['a resource_missing for another object, the customer live', missing('payment_method'), liveCustomer],
    ['no such customer for this key (another account or another mode): the read answers 404 too', missingCustomer, missingCustomer],
    ['the read says deleted about another customer', missingCustomer, () => json({ id: 'cus_Other', object: 'customer', deleted: true })],
    ['the read says deleted, but not with a success status', missingCustomer, () => json({ id: CUS, object: 'customer', deleted: true }, 404)],
    ['deleted is not the value true', missingCustomer, () => json({ id: CUS, object: 'customer', deleted: 'true' })],
    ['the read answers a body that is not JSON', missingCustomer, () => new Response('<html>', { status: 200 })],
    ['the read cannot be reached', apiError, () => { throw new TypeError('fetch failed'); }],
    ['a refused key on both', () => json({ error: { code: 'api_key_expired' } }, 401), () => json({ error: { code: 'api_key_expired' } }, 401)],
    ['a list answer that is not a list, the customer live', () => json({ object: 'list' }), liveCustomer],
  ];
  for (const [name, list, readAnswer] of cases) {
    const out = await run({ action: 'list' }, { list, read: readAnswer });
    assert.equal(out.status, 500, name);
    assert.deepEqual(out.body, FAILED, name);
    assert.deepEqual(keys(out), ['admit', 'customer', 'list', 'read'], name);
  }
});

test('A4-02 · a working list is unchanged: the cards, and no read of the customer', async () => {
  const out = await run({ action: 'list' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { cards: [{ id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }] });
  assert.deepEqual(keys(out), ['admit', 'customer', 'list']);
  const none = await run({ action: 'list' }, { customer: () => json(null) });
  assert.deepEqual([none.status, none.body, keys(none)], [200, { cards: [] }, ['admit', 'customer']]);
});

test('A4-02 · remove does not change (setup is not run here): remove still fails on a failed list, asks no read, and the read sits in the list action only', async () => {
  const out = await run({ action: 'remove', paymentMethodId: CARD.id }, { list: missingCustomer, read: deletedCustomer });
  assert.deepEqual([out.status, out.body], [500, FAILED]);
  assert.deepEqual(keys(out), ['admit', 'customer', 'list']);
  const ok = await run({ action: 'remove', paymentMethodId: CARD.id });
  assert.deepEqual([ok.status, ok.body, keys(ok)], [200, { removed: true }, ['admit', 'customer', 'list', 'detach']]);
  // Static: the list action is the one caller of the read; remove keeps listCards' plain list.
  const code = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(code.split('listedCards(').length - 1, 2, 'one definition, one call');
  assert.match(code, /if \(action === 'list'\) \{\s*const customerId = await storedCustomer\(userId\);\s*return json\(\{ cards: customerId \? await listedCards\(customerId\) : \[\] \}\);\s*\}/);
  assert.match(code, /const owned = customerId \? \(await listCards\(customerId\)\)\.some\(/);
});

test('A4-02 · one test of a deleted customer, in one place, with two callers', async () => {
  assert.deepEqual(Object.keys(shared), ['isDeletedCustomer']);
  const sharedSource = read(SHARED);
  assert.doesNotMatch(sharedSource, /^\s*import\s/m, 'no imports');
  const cleanup = read(CLEANUP);
  for (const [name, text] of [['payment-methods', source], ['accountCleanup', cleanup]]) {
    const from = name === 'payment-methods' ? '../_shared/stripeCustomer.mjs' : './stripeCustomer.mjs';
    assert.equal(text.split(`\nimport { isDeletedCustomer } from '${from}';\n`).length - 1, 1, `${name} imports the shared test`);
    assert.doesNotMatch(text, /deleted === true/, `${name} holds no copy of the test`);
  }
  const { isDeletedCustomer } = shared;
  assert.equal(isDeletedCustomer(200, { id: CUS, object: 'customer', deleted: true }, CUS), true);
  for (const [status, body] of [
    [200, { id: 'cus_Other', deleted: true }],
    [404, { id: CUS, deleted: true }],
    [200, { id: CUS, object: 'customer' }],
    [200, { id: CUS, deleted: 'true' }],
    [200, null],
    [200, []],
    [200, 'deleted'],
    [404, { error: { type: 'invalid_request_error', code: 'resource_missing', param: 'customer' } }],
  ]) {
    assert.equal(isDeletedCustomer(status, body, CUS), false, JSON.stringify([status, body]));
  }
});
