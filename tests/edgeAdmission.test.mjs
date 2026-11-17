// active_account_rule (production-36h S1, M2; S4-12): the four payment functions a user's token reaches
// refuse a banned or deleted account, and refuse when the account cannot be checked, before any other
// database call and before any provider call. Deno cannot run here, so each handler's own body is
// executed under node (tests/createPaymentResume.test.mjs's way): the auth import is a stub that names
// the caller, the admission is the REAL shared module (types stripped), Deno.serve hands over the
// handler, and a fake fetch answers the admission and records every call. Test values only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const toModule = (js) => 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const AUTH_IMPORT =
  /^import \{ notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser \} from '\.\.\/_shared\/serviceAuth\.ts';$/m;
const ADMIT_IMPORT = /^import \{ refuseUnadmitted \} from '\.\.\/_shared\/rateLimit\.ts';$/m;
const LOCAL_IMPORT = /^(import \{[^}]+\} from )'\.\/([a-z]+\.mjs)';$/m;

const admission = await import(toModule(stripTypeScriptTypes(read('supabase/functions/_shared/rateLimit.ts'), { mode: 'strip' })));
const { ACCOUNT_SUSPENDED, ACCOUNT_INACTIVE, ACCOUNT_UNCHECKED } = admission;

const ENV = { SUPABASE_URL: 'http://supabase.test', STRIPE_SECRET_KEY: 'stripe-secret-for-the-test' };
const USER = { id: 'user-1', email: 'worker@brazos.test' };
globalThis.__admitStubs = {
  notConfigured: () => null,
  PUBLISHABLE_KEY: 'publishable-for-the-test',
  SECRET_KEY: 'service-for-the-test',
  serviceHeaders: () => ({ apikey: 'service-for-the-test', 'Content-Type': 'application/json' }),
  verifiedUser: async () => USER,
  refuseUnadmitted: admission.refuseUnadmitted,
};

const loaded = new Map();

/** Loads one handler (once: an import is cached) with its auth import stubbed and the real admission. */
async function load(fn) {
  if (!loaded.has(fn)) loaded.set(fn, await loadOnce(fn));
  return loaded.get(fn);
}

async function loadOnce(fn) {
  const file = `supabase/functions/${fn}/index.ts`;
  const source = read(file);
  assert.match(source, AUTH_IMPORT, `${fn}: the auth import is where the stub expects it`);
  assert.match(source, ADMIT_IMPORT, `${fn}: the admission import is where the stub expects it`);
  let js = source
    .replace(AUTH_IMPORT, 'const { notConfigured, PUBLISHABLE_KEY, SECRET_KEY, serviceHeaders, verifiedUser } = globalThis.__admitStubs;')
    .replace(ADMIT_IMPORT, 'const { refuseUnadmitted } = globalThis.__admitStubs;');
  // A function's own helper module (account.mjs, classify.mjs) is imported from its real file.
  js = js.replace(LOCAL_IMPORT, (_, head, name) => `${head}'${pathToFileURL(join(root, 'supabase/functions', fn, name)).href}';`);
  let handler = null;
  globalThis.Deno = { env: { get: (name) => ENV[name] }, serve: (h) => { handler = h; } };
  await import(toModule(stripTypeScriptTypes(js, { mode: 'strip' })));
  assert.equal(typeof handler, 'function', `${fn}: served`);
  return handler;
}

const BODIES = {
  'create-payment': { jobId: 'job-1' },
  'payment-methods': { action: 'setup' },
  'connect-onboarding': { email: 'worker@brazos.test' },
  'connect-status': {},
};

/** One request against a fake world whose admission answers `admit`. Returns status, body, calls. */
async function run(handler, fn, admit, body = BODIES[fn]) {
  const calls = [];
  const original = globalThis.fetch;
  const originalError = console.error;
  console.error = () => {};
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? '' };
    calls.push(call);
    if (call.url === `${ENV.SUPABASE_URL}/rest/v1/rpc/admit_user_call`) return admit(JSON.parse(call.body));
    return new Response('unexpected', { status: 599 });
  };
  try {
    const res = await handler(new Request(`http://edge.test/${fn}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json().catch(() => null), calls };
  } finally {
    globalThis.fetch = original;
    console.error = originalError;
  }
}

const said = (word) => async () => Response.json(word);

for (const fn of ['create-payment', 'payment-methods', 'connect-onboarding', 'connect-status']) {
  test(`${fn} · a banned caller: 401 with the suspended sentence, one database call (the check, with the service key), no provider call`, async () => {
    const handler = await load(fn);
    const out = await run(handler, fn, said('suspended'));
    assert.equal(out.status, 401);
    assert.deepEqual(out.body, { error: ACCOUNT_SUSPENDED });
    assert.deepEqual(out.calls.map((c) => c.url), [`${ENV.SUPABASE_URL}/rest/v1/rpc/admit_user_call`]);
    assert.equal(out.calls[0].headers.apikey, 'service-for-the-test', 'asked with the service key, never the user token');
    const args = JSON.parse(out.calls[0].body);
    assert.equal(args.p_user, USER.id);
    assert.equal(args.p_action, `fn:${fn}`);
    assert.equal(out.calls.filter((c) => c.url.includes('stripe.com')).length, 0, 'zero provider calls');
  });

  test(`${fn} · a deleted caller: 401 "This account is no longer active.", no other call`, async () => {
    const handler = await load(fn);
    const out = await run(handler, fn, said('inactive'));
    assert.equal(out.status, 401);
    assert.deepEqual(out.body, { error: ACCOUNT_INACTIVE });
    assert.equal(out.calls.length, 1);
  });

  test(`${fn} · the check cannot be answered: 503, never let through, no other call`, async () => {
    const handler = await load(fn);
    for (const admit of [async () => new Response('down', { status: 500 }), said(true), async () => { throw new TypeError('fetch failed'); }]) {
      const out = await run(handler, fn, admit);
      assert.equal(out.status, 503);
      assert.deepEqual(out.body, { error: ACCOUNT_UNCHECKED });
      assert.equal(out.calls.length, 1);
    }
  });

  test(`${fn} · an active caller goes on past the check (positive control)`, async () => {
    const handler = await load(fn);
    const out = await run(handler, fn, said('ok'));
    assert.ok(out.calls.length > 1, 'the handler made its next call after the check');
    assert.notEqual(out.body?.error, ACCOUNT_SUSPENDED);
  });
}

test('payment-methods · a suspended account may list and remove its own cards (C1), not save a new one', async () => {
  const handler = await load('payment-methods');
  for (const [action, allowed] of [['list', true], ['remove', true], ['setup', false]]) {
    const out = await run(handler, 'payment-methods', said('ok'), { action, paymentMethodId: 'pm_test' });
    assert.equal(JSON.parse(out.calls[0].body).p_allow_suspended, allowed, action);
  }
});
