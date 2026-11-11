// lean E4 (the lean security verdict B3, archived 2026-11-08) and lean K1: every Supabase-touching
// function reads its keys and checks its caller through one file, supabase/functions/_shared/
// serviceAuth.ts. The timers pass requireServiceRole() (the new default secret key or the legacy
// service key, constant time); the user functions pass verifiedUser() (the auth server says who the
// token belongs to; nothing is decoded). Deno cannot run here, so the helper's own body is executed
// under node with its one URL import swapped for node's crypto.timingSafeEqual, which THROWS on
// unequal lengths: a pass also proves the helper never hands it two lengths. Each environment is a
// fresh import with a stubbed Deno.env, because the keys are read once, at load. The wiring is
// fenced as text.
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
// CRLF folded to LF, so a Windows checkout and CI read the same text.
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const HELPER = 'supabase/functions/_shared/serviceAuth.ts';
const IMPORT = /^import \{ timingSafeEqual \} from 'https:\/\/deno\.land\/std@0\.224\.0\/crypto\/timing_safe_equal\.ts';$/m;

const source = read(HELPER);
globalThis.__e4TimingSafeEqual = (a, b) => timingSafeEqual(a, b);
const js = stripTypeScriptTypes(source.replace(IMPORT, 'const timingSafeEqual = globalThis.__e4TimingSafeEqual;'), { mode: 'strip' });

let loads = 0;
/** The helper, loaded under this environment (undefined = the variable is not set). */
async function load(env) {
  globalThis.Deno = { env: { get: (name) => env[name] } };
  return import(
    'data:text/javascript;charset=utf-8;base64,' + Buffer.from(`${js}\n// load ${++loads}`, 'utf8').toString('base64')
  );
}

/** Runs fn with console.error captured; returns the lines. */
async function logged(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

// Test values only. None is shaped like a real key.
const NEW = 'new-secret-key-for-the-test';
const LEGACY = 'legacy-service-key-for-the-test';
const PUB = 'new-publishable-key-for-the-test';
const ANON = 'legacy-anon-key-for-the-test';
const URL_ = 'http://supabase.test';
const keys = (value) => (value === undefined ? undefined : JSON.stringify({ default: value }));
const BOTH = {
  SUPABASE_URL: URL_,
  SUPABASE_SECRET_KEYS: keys(NEW),
  SUPABASE_SERVICE_ROLE_KEY: LEGACY,
  SUPABASE_PUBLISHABLE_KEYS: keys(PUB),
  SUPABASE_ANON_KEY: ANON,
};

const post = (headers, method = 'POST') => new Request('http://edge.test/fn', { method, headers });

// Every way a request can carry nothing: no header, empty values, a scheme with no key.
const EMPTY_HEADERS = [
  {},
  { apikey: '' },
  { Authorization: '' },
  { Authorization: 'Bearer ' },
  { Authorization: 'Bearer' },
  { apikey: '', Authorization: 'Bearer ' },
  { apikey: ' ', Authorization: 'Bearer  ' },
];

async function assertRefused(res, status, error, why) {
  assert.ok(res instanceof Response, `${why}: refused`);
  assert.equal(res.status, status, `${why}: ${status}`);
  assert.equal(res.headers.get('Content-Type'), 'application/json', `${why}: JSON`);
  assert.deepEqual(await res.json(), { error }, `${why}: body`);
}

test('B3 · the helper exists, exports both checks and compares with Deno std timingSafeEqual', async () => {
  assert.match(source, IMPORT, 'timingSafeEqual comes from the pinned Deno std module');
  assert.match(source, /export function requireServiceRole\(req: Request\): Response \| null \{/);
  assert.match(source, /export async function verifiedUser\(req: Request, signIn: string, tryAgain: string\): Promise<Caller \| Response> \{/);
  assert.match(source, /timingSafeEqual\(sameLength \? a : new Uint8Array\(b\.byteLength\), b\)/);
  assert.doesNotMatch(source, /\batob\(|split\('\.'\)/, 'the helper decodes no token');
  const mod = await load(BOTH);
  assert.equal(typeof mod.requireServiceRole, 'function');
  assert.equal(typeof mod.verifiedUser, 'function');
});

test('K1 · the keys: the new default first, the legacy key as the fallback', async () => {
  let mod = await load(BOTH);
  assert.equal(mod.SECRET_KEY, NEW);
  assert.equal(mod.PUBLISHABLE_KEY, PUB);
  mod = await load({ ...BOTH, SUPABASE_SECRET_KEYS: undefined, SUPABASE_PUBLISHABLE_KEYS: undefined });
  assert.equal(mod.SECRET_KEY, LEGACY);
  assert.equal(mod.PUBLISHABLE_KEY, ANON);
  mod = await load({ ...BOTH, SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_ANON_KEY: undefined });
  assert.equal(mod.SECRET_KEY, NEW);
  assert.equal(mod.PUBLISHABLE_KEY, PUB);
  // The JSON holds more than one key: only `default` is used.
  mod = await load({ ...BOTH, SUPABASE_SECRET_KEYS: JSON.stringify({ other: 'x', default: NEW }) });
  assert.equal(mod.SECRET_KEY, NEW);
});

test('K1 · service headers: a new key on apikey alone, the legacy JWT also as Bearer', async () => {
  let mod = await load(BOTH);
  assert.deepEqual(mod.serviceHeaders(), { apikey: NEW, 'Content-Type': 'application/json' });
  mod = await load({ ...BOTH, SUPABASE_SECRET_KEYS: undefined });
  assert.deepEqual(mod.serviceHeaders(), { apikey: LEGACY, Authorization: `Bearer ${LEGACY}`, 'Content-Type': 'application/json' });
});

test('B3/K1 · executed: only a POST carrying one of the two server keys passes', async () => {
  const mod = await load(BOTH);
  for (const [why, headers] of [
    ['the new key as Bearer', { Authorization: `Bearer ${NEW}` }],
    ['the new key on apikey', { apikey: NEW }],
    ['the legacy key as Bearer', { Authorization: `Bearer ${LEGACY}` }],
    ['the legacy key on apikey', { apikey: LEGACY }],
    ['the new key on both (the drains\' shape)', { apikey: NEW, Authorization: `Bearer ${NEW}` }],
    ['a wrong apikey beside a right Bearer', { apikey: PUB, Authorization: `Bearer ${LEGACY}` }],
  ]) {
    assert.equal(mod.requireServiceRole(post(headers)), null, `${why}: passes`);
  }

  for (const [why, headers, method, status, error] of [
    ['a GET, even with the key', { Authorization: `Bearer ${NEW}` }, 'GET', 405, 'method not allowed'],
    ['no header', {}, 'POST', 403, 'forbidden'],
    ['a different key of the same length', { Authorization: `Bearer ${NEW.replace(/.$/, 'X')}` }, 'POST', 403, 'forbidden'],
    ['a shorter key', { Authorization: `Bearer ${NEW.slice(0, -1)}` }, 'POST', 403, 'forbidden'],
    ['a longer key', { apikey: `${LEGACY}x` }, 'POST', 403, 'forbidden'],
    ['the key without the Bearer scheme', { Authorization: NEW }, 'POST', 403, 'forbidden'],
    ['the Bearer scheme inside apikey', { apikey: `Bearer ${NEW}` }, 'POST', 403, 'forbidden'],
    ['the publishable key', { apikey: PUB, Authorization: `Bearer ${PUB}` }, 'POST', 403, 'forbidden'],
    ['the anon key', { apikey: ANON, Authorization: `Bearer ${ANON}` }, 'POST', 403, 'forbidden'],
  ]) {
    await assertRefused(mod.requireServiceRole(post(headers, method)), status, error, why);
  }
});

// Direction 1: a key variable that is missing, empty or bad JSON matches nothing, and a missing or
// empty header never passes, in any combination. One test per key variable.
const ABSENT = [undefined, '', 'not json', '{}', '{"default":""}', '{"default":5}', 'null', '"x"'];

test('K1 · empty is absent: SUPABASE_SECRET_KEYS', async () => {
  for (const value of ABSENT) {
    const why = `SUPABASE_SECRET_KEYS=${JSON.stringify(value)}`;
    // Alone: no server key at all.
    let mod = await load({ ...BOTH, SUPABASE_SECRET_KEYS: value, SUPABASE_SERVICE_ROLE_KEY: undefined });
    assert.equal(mod.SECRET_KEY, '', `${why}: no server key`);
    for (const headers of EMPTY_HEADERS) {
      await assertRefused(mod.requireServiceRole(post(headers)), 403, 'forbidden', `${why}, ${JSON.stringify(headers)}`);
    }
    await assertRefused(mod.requireServiceRole(post({ apikey: NEW })), 403, 'forbidden', `${why}: the new key matches nothing`);
    const lines = await logged(async () => {
      await assertRefused(mod.notConfigured('fn', { SUPABASE_URL: URL_, SECRET_KEY: mod.SECRET_KEY }), 500, 'not configured', why);
    });
    assert.deepEqual(lines, ['fn: not configured: SUPABASE_SECRET_KEYS.default or SUPABASE_SERVICE_ROLE_KEY'], `${why}: names only`);
    // Beside the legacy key: the legacy key still works, and empty headers still fail.
    mod = await load({ ...BOTH, SUPABASE_SECRET_KEYS: value });
    assert.equal(mod.SECRET_KEY, LEGACY, `${why}: the legacy key is the fallback`);
    assert.equal(mod.requireServiceRole(post({ apikey: LEGACY })), null, `${why}: the legacy key passes`);
    for (const headers of EMPTY_HEADERS) {
      await assertRefused(mod.requireServiceRole(post(headers)), 403, 'forbidden', `${why} + legacy, ${JSON.stringify(headers)}`);
    }
  }
});

test('K1 · empty is absent: SUPABASE_SERVICE_ROLE_KEY', async () => {
  for (const value of [undefined, '']) {
    const why = `SUPABASE_SERVICE_ROLE_KEY=${JSON.stringify(value)}`;
    let mod = await load({ ...BOTH, SUPABASE_SERVICE_ROLE_KEY: value, SUPABASE_SECRET_KEYS: undefined });
    assert.equal(mod.SECRET_KEY, '', `${why}: no server key`);
    for (const headers of EMPTY_HEADERS) {
      await assertRefused(mod.requireServiceRole(post(headers)), 403, 'forbidden', `${why}, ${JSON.stringify(headers)}`);
    }
    await assertRefused(mod.requireServiceRole(post({ apikey: LEGACY })), 403, 'forbidden', `${why}: the legacy key matches nothing`);
    mod = await load({ ...BOTH, SUPABASE_SERVICE_ROLE_KEY: value });
    assert.equal(mod.requireServiceRole(post({ apikey: NEW })), null, `${why}: the new key still passes`);
    for (const headers of EMPTY_HEADERS) {
      await assertRefused(mod.requireServiceRole(post(headers)), 403, 'forbidden', `${why} + new, ${JSON.stringify(headers)}`);
    }
  }
});

test('K1 · empty is absent: SUPABASE_PUBLISHABLE_KEYS', async () => {
  for (const value of ABSENT) {
    const why = `SUPABASE_PUBLISHABLE_KEYS=${JSON.stringify(value)}`;
    let mod = await load({ ...BOTH, SUPABASE_PUBLISHABLE_KEYS: value, SUPABASE_ANON_KEY: undefined });
    assert.equal(mod.PUBLISHABLE_KEY, '', `${why}: no public key`);
    const lines = await logged(async () => {
      await assertRefused(mod.notConfigured('fn', { PUBLISHABLE_KEY: mod.PUBLISHABLE_KEY }), 500, 'not configured', why);
    });
    assert.deepEqual(lines, ['fn: not configured: SUPABASE_PUBLISHABLE_KEYS.default or SUPABASE_ANON_KEY'], `${why}: names only`);
    // The public key never opens the server gate, set or not.
    await assertRefused(mod.requireServiceRole(post({ apikey: PUB })), 403, 'forbidden', `${why}: the publishable key`);
    mod = await load({ ...BOTH, SUPABASE_PUBLISHABLE_KEYS: value });
    assert.equal(mod.PUBLISHABLE_KEY, ANON, `${why}: the anon key is the fallback`);
  }
});

test('K1 · empty is absent: SUPABASE_ANON_KEY', async () => {
  for (const value of [undefined, '']) {
    const why = `SUPABASE_ANON_KEY=${JSON.stringify(value)}`;
    let mod = await load({ ...BOTH, SUPABASE_ANON_KEY: value, SUPABASE_PUBLISHABLE_KEYS: undefined });
    assert.equal(mod.PUBLISHABLE_KEY, '', `${why}: no public key`);
    assert.notEqual(mod.notConfigured('fn', { PUBLISHABLE_KEY: mod.PUBLISHABLE_KEY }), null, `${why}: not configured`);
    await assertRefused(mod.requireServiceRole(post({ apikey: ANON })), 403, 'forbidden', `${why}: the anon key`);
    mod = await load({ ...BOTH, SUPABASE_ANON_KEY: value });
    assert.equal(mod.PUBLISHABLE_KEY, PUB, `${why}: the publishable key is used`);
  }
});

test('K1 · notConfigured: null when all are set; otherwise one line of names, never a value', async () => {
  const mod = await load(BOTH);
  assert.equal(mod.notConfigured('fn', { SUPABASE_URL: URL_, SECRET_KEY: NEW, STRIPE_SECRET_KEY: 'sk' }), null);
  const lines = await logged(async () => {
    await assertRefused(
      mod.notConfigured('fn', { SUPABASE_URL: URL_, SECRET_KEY: NEW, PUBLISHABLE_KEY: '', STRIPE_SECRET_KEY: '' }),
      500, 'not configured', 'two missing'
    );
  });
  assert.deepEqual(lines, ['fn: not configured: SUPABASE_PUBLISHABLE_KEYS.default or SUPABASE_ANON_KEY, STRIPE_SECRET_KEY']);
  assert.ok(!lines[0].includes(NEW) && !lines[0].includes(URL_), 'no value is logged');
});

// Direction 2: only a 2xx holding a user id proves the caller.
test('K1 · verifiedUser: the auth server decides, and "cannot check" is never an answer', async () => {
  const mod = await load(BOTH);
  const TOKEN = 'Bearer a-user-token-for-the-test';
  const SIGN_IN = 'Sign in to do it.';
  const TRY_AGAIN = 'Could not do it. Try again.';
  const original = globalThis.fetch;
  const calls = [];
  const answer = (respond) => {
    calls.length = 0;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers });
      return respond();
    };
  };
  const ask = (authorization) =>
    mod.verifiedUser(post(authorization === undefined ? {} : { Authorization: authorization }), SIGN_IN, TRY_AGAIN);

  try {
    // Proven: id and email from the answer alone; the token is sent once, with the public key.
    answer(() => Response.json({ id: 'user-1', email: 'dana@brazos.test', role: 'service_role' }));
    assert.deepEqual(await ask(TOKEN), { id: 'user-1', email: 'dana@brazos.test' });
    assert.deepEqual(calls, [{ url: `${URL_}/auth/v1/user`, headers: { apikey: PUB, Authorization: TOKEN } }]);
    answer(() => Response.json({ id: 'user-1', phone: '15550000000' }));
    assert.deepEqual(await ask(TOKEN), { id: 'user-1', email: null }, 'no email: null');
    answer(() => Response.json({ id: 'user-1', email: 'not-an-address' }));
    assert.deepEqual(await ask(TOKEN), { id: 'user-1', email: null }, 'an email without @: null');

    // No token: signed out, and nobody is asked.
    for (const authorization of [undefined, '', 'Bearer', 'Basic abc', TOKEN.slice('Bearer '.length)]) {
      answer(() => Response.json({ id: 'user-1' }));
      await assertRefused(await ask(authorization), 401, SIGN_IN, `Authorization ${JSON.stringify(authorization)}`);
      assert.equal(calls.length, 0, `Authorization ${JSON.stringify(authorization)}: the auth server is not asked`);
    }

    // The auth server says no: signed out, today's sentence.
    for (const status of [401, 403]) {
      answer(() => Response.json({ msg: 'invalid JWT' }, { status }));
      const lines = await logged(async () => assertRefused(await ask(TOKEN), 401, SIGN_IN, `auth ${status}`));
      assert.deepEqual(lines, [], `auth ${status}: nothing logged`);
    }

    // Cannot check: try again (503) and a log line with the status only.
    const unknown = [
      ['a 500', () => Response.json({ id: 'user-1' }, { status: 500 }), 'auth check: 500'],
      ['a 502', () => new Response('bad gateway', { status: 502 }), 'auth check: 502'],
      ['a 429', () => Response.json({ id: 'user-1' }, { status: 429 }), 'auth check: 429'],
      ['a 404', () => Response.json({}, { status: 404 }), 'auth check: 404'],
      ['a 400', () => Response.json({}, { status: 400 }), 'auth check: 400'],
      ['a 200 without an id', () => Response.json({ email: 'dana@brazos.test' }), 'auth check: 200'],
      ['a 200 with an empty id', () => Response.json({ id: '' }), 'auth check: 200'],
      ['a 200 with a numeric id', () => Response.json({ id: 7 }), 'auth check: 200'],
      ['a 200 that is not JSON', () => new Response('<html>'), 'auth check: 200'],
      ['a 200 with null', () => new Response('null'), 'auth check: 200'],
      ['a 204', () => new Response(null, { status: 204 }), 'auth check: 204'],
      ['no answer', () => { throw new TypeError('fetch failed'); }, 'auth check: no answer'],
    ];
    for (const [why, respond, line] of unknown) {
      answer(respond);
      const lines = await logged(async () => assertRefused(await ask(TOKEN), 503, TRY_AGAIN, why));
      assert.deepEqual(lines, [line], `${why}: the status only`);
    }
  } finally {
    globalThis.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// The wiring, as text.
// ---------------------------------------------------------------------------
const FUNCTIONS = readdirSync(join(root, 'supabase/functions')).filter(
  (name) => name !== '_shared' && statSync(join(root, 'supabase/functions', name)).isDirectory()
);
const TIMERS = ['send-push', 'send-receipts', 'process-settlements'];
const USERS = {
  'create-payment': ["'Sign in to protect a payment.'", "'Could not start this payment. Try again.'"],
  'connect-onboarding': ["'Sign in to set up payouts.'", "'Could not start payout setup. Try again.'"],
  'connect-status': ["'Sign in to check your payouts.'", "'Could not check your payouts. Try again.'"],
  'payment-methods': ["'Sign in to manage your cards.'", "'Could not reach your cards right now. Try again.'"],
};
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('B3 · the three timer functions run the gate right after their configuration check', () => {
  for (const name of TIMERS) {
    const fn = read(`supabase/functions/${name}/index.ts`);
    assert.match(fn, /^import \{ [^}]*\brequireServiceRole\b[^}]* \} from '\.\.\/_shared\/serviceAuth\.ts';$/m, `${name} imports the gate`);
    const env = fn.indexOf(`const unset = notConfigured('${name}', { SUPABASE_URL, SECRET_KEY`);
    const gate = fn.indexOf('const refused = requireServiceRole(req);\n  if (refused) return refused;');
    assert.ok(env > -1, `${name} checks its configuration`);
    assert.ok(gate > env, `${name} runs the gate right after the configuration check`);
    assert.equal(fn.indexOf('Deno.serve('), fn.lastIndexOf('Deno.serve('), `${name} serves once`);
    assert.ok(fn.indexOf('Deno.serve(') < env, `${name}: both checks are inside the handler`);
  }
});

test('K1 · the four user functions take the caller from verifiedUser() alone, with their own sentences', () => {
  for (const [name, [signIn, tryAgain]] of Object.entries(USERS)) {
    const fn = read(`supabase/functions/${name}/index.ts`);
    assert.match(fn, new RegExp(`verifiedUser\\(req, ${esc(signIn)}, ${esc(tryAgain)}\\)`), `${name} asks the auth server`);
    assert.match(fn, new RegExp(`const unset = notConfigured\\('${name}', \\{ SUPABASE_URL, PUBLISHABLE_KEY, SECRET_KEY, STRIPE_SECRET_KEY \\}\\);`), `${name} checks its configuration`);
    // In the handler: the configuration check, then the caller check (connect-onboarding's runs inside resolveCaller).
    const handler = fn.indexOf('Deno.serve(');
    const config = fn.indexOf('const unset = notConfigured(', handler);
    const check = Math.min(...['verifiedUser(req,', 'resolveCaller(req,'].map((s) => fn.indexOf(s, handler)).filter((i) => i > -1));
    assert.ok(handler > -1 && config > handler && check > config, `${name}: configuration first, then the caller`);
    assert.doesNotMatch(fn, /payer_id \?\?|claims\?\.|\.sub\b/, `${name} takes no user id from anywhere else`);
  }
});

test('K1 · no function decodes a token, asks the auth server itself, or reads a key variable', () => {
  for (const name of FUNCTIONS) {
    const dir = join(root, 'supabase/functions', name);
    for (const file of readdirSync(dir, { recursive: true }).filter((f) => /\.(ts|mjs|js)$/.test(f))) {
      const text = read(`supabase/functions/${name}/${file.replace(/\\/g, '/')}`);
      const where = `${name}/${file}`;
      assert.doesNotMatch(text, /\batob\(|jwtClaims|split\('\.'\)/, `${where} decodes no token`);
      assert.doesNotMatch(text, /\/auth\/v1\/user[`'"]/, `${where} leaves the caller check to verifiedUser()`);
      assert.doesNotMatch(
        text,
        /Deno\.env\.get\('SUPABASE_(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEYS|PUBLISHABLE_KEYS)'\)/,
        `${where} reads its Supabase keys from the shared file`
      );
    }
  }
});

test('K1 · verify_jwt: on for the four user functions, off for the timers and the two public doors', () => {
  const toml = read('supabase/config.toml');
  const expected = {
    ...Object.fromEntries(Object.keys(USERS).map((name) => [name, 'true'])),
    ...Object.fromEntries(TIMERS.map((name) => [name, 'false'])),
    'stripe-webhook': 'false',
    'connect-return': 'false',
  };
  assert.deepEqual([...FUNCTIONS].sort(), Object.keys(expected).sort(), 'every function directory is listed here');
  for (const [name, value] of Object.entries(expected)) {
    const section = toml.match(new RegExp(`^\\[functions\\.${esc(name)}\\]\\n((?:#.*\\n)*)verify_jwt = (true|false)$`, 'm'));
    assert.ok(section, `[functions.${name}] has a verify_jwt line`);
    assert.equal(section[2], value, `[functions.${name}] verify_jwt = ${value}`);
  }
});

test('B3 · no plain string compare of a Bearer header is left under supabase/functions', () => {
  const dir = join(root, 'supabase/functions');
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.(ts|mjs|js)$/.test(f));
  assert.ok(files.length >= 12, `only ${files.length} files read: check the scan`);
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    assert.doesNotMatch(text, /[!=]==\s*[`'"]Bearer/, `${file} compares a Bearer header with a plain string`);
    assert.doesNotMatch(text, /[`'"]Bearer [^`'"]*[`'"]\s*[!=]==/, `${file} compares a Bearer header with a plain string`);
  }
});
