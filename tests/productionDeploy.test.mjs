import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DRAINS,
  REQUIRED_SECRETS,
  SMOKE,
  authDiff,
  authWanted,
  destructiveVerdict,
  guardProblems,
  keyHeaders,
  pickPublishableKey,
  pickServerKey,
  planCode,
  run,
  summarize,
  webhookAction,
  webhookContract,
} from '../scripts/production-deploy.mjs';
import { RETIRED_PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';

// scripts/production-deploy.mjs, the Production button's logic, driven through a fake fetch: no
// network, no database, no Stripe. Every value below is fake and shaped so that the repository's
// own secret scan (tests/governance.test.mjs) does not mistake it for a real credential.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REF = 'fakeprojectrefabcdef';
const BASE = `https://${REF}.supabase.co`;
const SECRETS = {
  SUPABASE_ACCESS_TOKEN: 'sbp_fakeAccessToken0001', // key-guard: allow (a fake test value)
  SUPABASE_PROJECT_REF: REF,
  SUPABASE_DB_PASSWORD: 'fake-db-password-0001', // key-guard: allow (a fake test value)
  STRIPE_SECRET_KEY: 'sk_test_fake-0001',
  TWILIO_ACCOUNT_SID: 'ACfakeaccount0001',
  TWILIO_AUTH_TOKEN: 'fake-twilio-token-0001', // key-guard: allow (a fake test value)
  TWILIO_VERIFY_SERVICE_SID: 'VAfakeservice0001',
};
const FETCHED = {
  secret: 'sb_secret_fakeServerKey0001', // key-guard: allow (a fake test value)
  publishable: 'sb_publishable_fakePublicKey0001',
  serviceRole: 'eyJfakeLegacyServiceRole0001',
  anon: 'eyJfakeLegacyAnonKey00000001',
  whsec: 'whsec_fakeSigningSecret0001',
};
const GITHUB_TOKEN = 'ghs_fakeWorkflowToken0001'; // key-guard: allow (a fake test value)

const KEYS = () => [
  { name: 'anon', type: 'legacy', api_key: FETCHED.anon },
  { name: 'service_role', type: 'legacy', api_key: FETCHED.serviceRole },
  { name: 'default', type: 'publishable', api_key: FETCHED.publishable },
  { name: 'default', type: 'secret', api_key: FETCHED.secret },
];

// ---- the fake world ---------------------------------------------------------------------------

function world(over = {}) {
  const w = {
    now: Date.parse('2026-11-12T10:00:00Z'),
    timeline: [],
    environment: {
      status: 200,
      body: { name: 'production', can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User' }] }] },
    },
    project: { status: 200, body: { status: 'ACTIVE_HEALTHY' } },
    keys: KEYS(),
    legacy: { status: 200, body: { enabled: true } },
    secrets: new Map(),
    auth: {},
    authTakes: true,
    endpoints: [],
    nextEndpoint: 1,
    functions: {
      'send-push': [403, { error: 'forbidden' }],
      'connect-status': [401, { error: 'Sign in to check your payouts.' }],
      'stripe-webhook': [400, { error: 'invalid signature' }],
    },
    rpcMissingFor: 0,
    vault: null,
    probe: { send_push: 101, process_settlements: 102, send_receipts: 103 },
    probedAt: null,
    probeAnswers: { send_push: 200, process_settlements: 200, send_receipts: 200 },
    probeAfter: 10_000,
    vaultMissing: 'drain_notification_outbox: vault secrets missing',
    fingerprintStatus: 0,
    spawned: [],
    ...over,
  };
  return w;
}

function respond(status, body) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

function fakeFetch(w) {
  return async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const headers = init.headers ?? {};
    const body = init.body === undefined ? '' : String(init.body);
    w.timeline.push({ kind: 'request', method, url, headers, body });
    const u = new URL(url);
    const m = (re) => u.pathname.match(re);

    if (u.host === 'api.github.com') {
      if (headers.Authorization !== `Bearer ${GITHUB_TOKEN}`) return respond(401, {});
      return respond(w.environment.status, w.environment.body);
    }
    if (u.host === 'api.supabase.com') {
      if (headers.Authorization !== `Bearer ${SECRETS.SUPABASE_ACCESS_TOKEN}`) return respond(401, {});
      if (u.pathname === `/v1/projects/${REF}`) return respond(w.project.status, w.project.body);
      if (u.pathname === `/v1/projects/${REF}/api-keys`) {
        assert.equal(u.searchParams.get('reveal'), 'true');
        return respond(200, w.keys);
      }
      if (u.pathname === `/v1/projects/${REF}/api-keys/legacy`) return respond(w.legacy.status, w.legacy.body);
      if (u.pathname === `/v1/projects/${REF}/secrets`) {
        if (method === 'GET') return respond(200, [...w.secrets.keys()].map((name) => ({ name, value: 'digest' })));
        if (method === 'POST') {
          for (const s of JSON.parse(body)) w.secrets.set(s.name, s.value);
          return respond(201);
        }
        if (method === 'DELETE') {
          for (const name of JSON.parse(body)) w.secrets.delete(name);
          return respond(200, {});
        }
      }
      if (u.pathname === `/v1/projects/${REF}/config/auth`) {
        if (method === 'PATCH') {
          const patch = JSON.parse(body);
          if (w.authTakes) Object.assign(w.auth, patch);
          return respond(200, {});
        }
        const { sms_twilio_verify_auth_token: _token, ...readable } = w.auth;
        return respond(200, { ...readable, sms_twilio_verify_auth_token: 'hash' });
      }
      return respond(404, { message: 'no such route in the fake' });
    }
    if (u.host === 'api.stripe.com') {
      if (headers.Authorization !== `Bearer ${SECRETS.STRIPE_SECRET_KEY}`) return respond(401, {});
      if (u.pathname === '/v1/webhook_endpoints' && method === 'GET') return respond(200, { data: w.endpoints, has_more: false });
      if (u.pathname === '/v1/webhook_endpoints' && method === 'POST') {
        const form = new URLSearchParams(body);
        const e = {
          id: `we_fake${w.nextEndpoint++}`,
          url: form.get('url'),
          api_version: form.get('api_version'),
          enabled_events: form.getAll('enabled_events[]'),
          status: 'enabled',
        };
        w.endpoints.push(e);
        return respond(200, { ...e, secret: FETCHED.whsec });
      }
      const del = m(/^\/v1\/webhook_endpoints\/([^/]+)$/);
      if (del && method === 'DELETE') {
        w.endpoints = w.endpoints.filter((e) => e.id !== del[1]);
        return respond(200, { id: del[1], deleted: true });
      }
      return respond(404, {});
    }
    if (u.host === `${REF}.supabase.co`) {
      const fn = m(/^\/functions\/v1\/([a-z-]+)$/);
      if (fn) {
        const [status, answer] = w.functions[fn[1]] ?? [404, { message: 'not found' }];
        return respond(status, answer);
      }
      const rpc = m(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (rpc) {
        if (headers.apikey !== FETCHED.secret || headers.Authorization !== undefined) return respond(401, {});
        if (w.rpcMissingFor > 0) {
          w.rpcMissingFor -= 1;
          return respond(404, { code: 'PGRST202' });
        }
        if (rpc[1] === 'set_drain_secrets') {
          w.vault = { at: w.now, ...JSON.parse(body) };
          return respond(204);
        }
        if (rpc[1] === 'drain_probe') {
          // The real function raises in the first drain whose Vault secrets are missing, in its words.
          if (!w.vault) return respond(400, { code: 'P0001', message: w.vaultMissing });
          w.probedAt = w.now;
          return respond(200, w.probe);
        }
        if (rpc[1] === 'drain_probe_status') {
          assert.deepEqual(JSON.parse(body), { p_probe: w.probe });
          const ready = w.probedAt !== null && w.now >= w.probedAt + w.probeAfter;
          return respond(200, Object.fromEntries(DRAINS.map((drain) => [drain, ready ? w.probeAnswers[drain] : null])));
        }
      }
      return respond(404, {});
    }
    throw new Error(`the fake has no host ${u.host}`);
  };
}

function setup(w, env = {}, cwd = ROOT) {
  const dir = mkdtempSync(join(tmpdir(), 'brazos-button-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const log = [];
  const io = {
    env: {
      ...SECRETS,
      GITHUB_REF: 'refs/heads/mainexpo',
      GITHUB_REPOSITORY: 'owner/brazos',
      GITHUB_TOKEN,
      GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567',
      GITHUB_ACTIONS: 'true',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      ALLOW_DESTRUCTIVE: 'false',
      PATH: process.env.PATH,
      ...env,
    },
    fetch: fakeFetch(w),
    log: (line) => {
      log.push(String(line));
      w.timeline.push({ kind: 'log', line: String(line) });
    },
    sleep: async (ms) => {
      w.now += ms;
    },
    now: () => w.now,
    spawn: (cmd, args, opts) => {
      if (cmd === 'bash') return spawnSync(cmd, args, opts);
      w.spawned.push({ cmd, args, env: opts.env });
      return { status: w.fingerprintStatus, stdout: w.fingerprintStatus === 0 ? 'functions  PASS\n' : 'functions  FAIL\n', stderr: '' };
    },
    cwd,
  };
  const outputs = () =>
    Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    );
  return { io, log, outputs, summary: () => readFileSync(summary, 'utf8'), dir };
}

async function cmd(w, argv, env, cwd) {
  const s = setup(w, env, cwd);
  const code = await run(argv, s.io);
  return { code, ...s };
}

// Migrations for plan/check: one safe file, one that drops a table.
function migrationsFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'brazos-plan-'));
  mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(join(dir, 'supabase/migrations/20260101000000_safe.sql'), 'create table public.a (id int);\n');
  writeFileSync(join(dir, 'supabase/migrations/20260102000000_drop.sql'), 'drop table if exists public.b;\n');
  return dir;
}
function listFile(dir, rows) {
  const file = join(dir, 'migrations.txt');
  writeFileSync(
    file,
    ['   Local          | Remote         | Time (UTC)', '  ----------------|----------------|-----------']
      .concat(rows.map(([l, r]) => `   ${l ? `\`${l}\`` : ''} | ${r ? `\`${r}\`` : ''} | 2026-01-01`))
      .join('\n')
  );
  return file;
}
const EMPTY = [
  ['20260101000000', ''],
  ['20260102000000', ''],
];
const ONE_APPLIED = [
  ['20260101000000', '20260101000000'],
  ['20260102000000', ''],
];

// ---- guards -----------------------------------------------------------------------------------

test('the guards pass on a well-formed run and name each failure in a plain sentence', () => {
  const env = { ...SECRETS, GITHUB_REF: 'refs/heads/mainexpo' };
  assert.deepEqual(guardProblems(env), []);
  assert.match(guardProblems({ ...env, GITHUB_REF: 'refs/heads/other' }).join(), /only from the mainexpo branch/);
  assert.match(guardProblems({ ...env, SUPABASE_PROJECT_REF: STAGING_REF }).join(), /names the staging project/);
  assert.match(guardProblems({ ...env, SUPABASE_PROJECT_REF: RETIRED_PRODUCTION_REF }).join(), /names the retired production project/);
  assert.match(guardProblems({ ...env, SUPABASE_PROJECT_REF: 'Not-A-Ref' }).join(), /is not a project ref/);
  for (const key of ['sk_live_fake-0001', 'rk_test_fake-0001', 'pk_test_fake-0001']) {
    assert.match(guardProblems({ ...env, STRIPE_SECRET_KEY: key }).join(), /not a Stripe test key/);
  }
  const missing = guardProblems({ ...env, TWILIO_AUTH_TOKEN: '', SUPABASE_DB_PASSWORD: undefined }).join();
  assert.match(missing, /missing from the production environment: SUPABASE_DB_PASSWORD, TWILIO_AUTH_TOKEN\./);
  assert.equal(REQUIRED_SECRETS.length, 7);
});

test('the first guard stops when the production environment has no required reviewer', async () => {
  const ok = await cmd(world(), ['guards']);
  assert.equal(ok.code, 0, ok.log.join('\n'));

  const none = await cmd(world({ environment: { status: 200, body: { protection_rules: [{ type: 'branch_policy' }] } } }), ['guards']);
  assert.equal(none.code, 1);
  assert.match(none.outputs().reason, /no required reviewer/);

  const absent = await cmd(world({ environment: { status: 404, body: {} } }), ['guards']);
  assert.match(absent.outputs().reason, /no environment named production/);

  const reviewers = [{ type: 'required_reviewers', reviewers: [{ type: 'User' }] }];
  const bypass = await cmd(world({ environment: { status: 200, body: { can_admins_bypass: true, protection_rules: reviewers } } }), ['guards']);
  assert.equal(bypass.code, 1);
  assert.match(bypass.outputs().reason, /Allow administrators to bypass/);

  const dir = mkdtempSync(join(tmpdir(), 'brazos-event-'));
  writeFileSync(join(dir, 'event.json'), JSON.stringify({ repository: { private: true } }));
  const priv = await cmd(world(), ['guards'], { GITHUB_EVENT_PATH: join(dir, 'event.json') });
  assert.equal(priv.code, 1);
  assert.match(priv.outputs().reason, /private/);
});

test('status: a running project passes; a paused one and a refused token stop in plain words', async () => {
  assert.equal((await cmd(world(), ['status'])).code, 0);
  const paused = await cmd(world({ project: { status: 200, body: { status: 'INACTIVE' } } }), ['status']);
  assert.match(paused.outputs().reason, /not running \(status INACTIVE\).*restore it/);
  const token = await cmd(world({ project: { status: 401, body: {} } }), ['status']);
  assert.match(token.outputs().reason, /refused SUPABASE_ACCESS_TOKEN/);
});

// ---- keys -------------------------------------------------------------------------------------

test('the server key is the secret key named default, else the legacy service_role key', () => {
  assert.deepEqual(pickServerKey(KEYS()), { type: 'secret', value: FETCHED.secret });
  const noNew = KEYS().filter((k) => k.type !== 'secret');
  assert.deepEqual(pickServerKey(noNew), { type: 'legacy service_role', value: FETCHED.serviceRole });
  const otherName = KEYS().map((k) => (k.type === 'secret' ? { ...k, name: 'ci' } : k));
  assert.equal(pickServerKey(otherName).type, 'legacy service_role');
  assert.equal(pickServerKey([{ name: 'default', type: 'secret', api_key: 'sb_secret_abc••••••••••' }]), null);
  assert.equal(pickPublishableKey(KEYS()), FETCHED.publishable);
  // A secret key goes in apikey alone; a legacy JWT also as the bearer.
  assert.deepEqual(keyHeaders({ type: 'secret', value: 'x' }), { apikey: 'x' });
  assert.deepEqual(keyHeaders({ type: 'legacy service_role', value: 'y' }), { apikey: 'y', Authorization: 'Bearer y' });
});

test('keys: the table shows the key type and the legacy keys, never a value', async () => {
  const both = await cmd(world(), ['keys']);
  assert.equal(both.code, 0);
  assert.equal(both.outputs().note, 'server key: secret; legacy keys: yes, active');
  const off = await cmd(world({ legacy: { status: 200, body: { enabled: false } } }), ['keys']);
  assert.equal(off.outputs().note, 'server key: secret; legacy keys: yes, switched off');
  const none = await cmd(
    world({ keys: KEYS().filter((k) => k.type !== 'legacy'), legacy: { status: 200, body: { enabled: false } } }),
    ['keys']
  );
  assert.equal(none.outputs().note, 'server key: secret; legacy keys: no');
  const oldOnly = await cmd(world({ keys: KEYS().filter((k) => k.type !== 'secret') }), ['keys']);
  assert.equal(oldOnly.outputs().note, 'server key: legacy service_role; legacy keys: yes, active');
  const stuck = await cmd(
    world({ keys: KEYS().filter((k) => k.type !== 'secret'), legacy: { status: 200, body: { enabled: false } } }),
    ['keys']
  );
  assert.equal(stuck.code, 1);
  assert.match(stuck.outputs().reason, /no secret key named default.*switched off/);
});

// ---- plan, check and the destructive gate -------------------------------------------------------

test('the destructive gate: an empty database lets flagged files through, an applied one does not', () => {
  assert.equal(destructiveVerdict({ applied: 0, flagged: [], allowDestructive: false }).ok, true);
  assert.equal(destructiveVerdict({ applied: 0, flagged: ['x.sql'], allowDestructive: false }).ok, true);
  const stopped = destructiveVerdict({ applied: 1, flagged: ['x.sql'], allowDestructive: false });
  assert.equal(stopped.ok, false);
  assert.match(stopped.note, /Nothing was applied.*allow_destructive/);
  assert.equal(destructiveVerdict({ applied: 1, flagged: ['x.sql'], allowDestructive: true }).ok, true);
});

test('the plan code moves with the commit, the files, the flags and the applied count', () => {
  const base = { sha: 'a', files: ['m/1_a.sql'], flagged: [], applied: 0 };
  const code = planCode(base);
  assert.match(code, /^[0-9a-f]{8}$/);
  assert.equal(planCode({ ...base }), code);
  for (const change of [{ sha: 'b' }, { files: ['m/2_b.sql'] }, { flagged: ['m/1_a.sql'] }, { applied: 1 }]) {
    assert.notEqual(planCode({ ...base, ...change }), code, JSON.stringify(change));
  }
});

test('plan on an empty database lists the flagged file, passes, and hands its code to check', async () => {
  const dir = migrationsFixture();
  const list = listFile(dir, EMPTY);
  const p = await cmd(world(), ['plan', list], {}, dir);
  assert.equal(p.code, 0, p.log.join('\n'));
  const code = p.outputs().plan_code;
  assert.match(code, /^[0-9a-f]{8}$/);
  assert.match(p.summary(), /20260102000000_drop\.sql.*FLAGGED/);
  assert.match(p.summary(), /empty/);
  assert.ok(p.log.some((l) => /FLAG supabase\/migrations\/20260102000000_drop\.sql/.test(l)));

  assert.equal((await cmd(world(), ['check', list], { PLAN_CODE: code }, dir)).code, 0);
  const changed = await cmd(world(), ['check', list], { PLAN_CODE: 'deadbeef' }, dir);
  assert.equal(changed.code, 1);
  assert.match(changed.outputs().reason, /changed after the plan you approved.*Nothing was applied/);
  rmSync(dir, { recursive: true, force: true });
});

test('plan stops on a flagged file once anything is applied, unless allow_destructive is checked', async () => {
  const dir = migrationsFixture();
  const list = listFile(dir, ONE_APPLIED);
  const stopped = await cmd(world(), ['plan', list], {}, dir);
  assert.equal(stopped.code, 1);
  assert.match(stopped.outputs().reason, /removes or renames something/);
  const allowed = await cmd(world(), ['plan', list], { ALLOW_DESTRUCTIVE: 'true' }, dir);
  assert.equal(allowed.code, 0);
  const wrong = await cmd(world(), ['plan', list], { ALLOW_DESTRUCTIVE: 'yes' }, dir);
  assert.equal(wrong.code, 1);
  rmSync(dir, { recursive: true, force: true });
});

// ---- secrets and the Stripe webhook --------------------------------------------------------------

test('function secrets: STRIPE_SECRET_KEY only, never a SUPABASE_ name', async () => {
  const w = world();
  assert.equal((await cmd(w, ['secrets'])).code, 0);
  assert.deepEqual([...w.secrets.keys()], ['STRIPE_SECRET_KEY']);
  const live = await cmd(world(), ['secrets'], { STRIPE_SECRET_KEY: 'sk_live_fake-0001' });
  assert.equal(live.code, 1);
});

test('the webhook events and api_version come from the functions, and the functions agree', () => {
  const { events, apiVersion } = webhookContract(ROOT);
  const source = readFileSync(join(ROOT, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const handled = [...source.match(/HANDLED_EVENTS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(events, handled);
  assert.equal(events.length, 7);
  // Every Stripe version literal in every function equals the one the webhook is made with.
  const literals = [];
  for (const name of readdirSync(join(ROOT, 'supabase/functions'))) {
    const file = join(ROOT, 'supabase/functions', name, 'index.ts');
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/STRIPE_(?:V2_)?VERSION = '([^']+)'/g)) literals.push(m[1]);
  }
  assert.ok(literals.length >= 4, `only ${literals.length} Stripe version literals found`);
  for (const v of literals) assert.equal(v, apiVersion);

  // Two functions that disagree stop the webhook step.
  const dir = mkdtempSync(join(tmpdir(), 'brazos-fns-'));
  for (const [name, text] of [
    ['stripe-webhook', "const HANDLED_EVENTS = new Set([\n  'charge.refunded',\n]);\n"],
    ['a', "const STRIPE_VERSION = '2026-01-01.one';\n"],
    ['b', "const STRIPE_V2_VERSION = '2026-02-02.two';\n"],
  ]) {
    mkdirSync(join(dir, 'supabase/functions', name), { recursive: true });
    writeFileSync(join(dir, 'supabase/functions', name, 'index.ts'), text);
  }
  assert.throws(() => webhookContract(dir), /2 Stripe API versions/);
  rmSync(dir, { recursive: true, force: true });
});

test('webhook action: keep only an exact, enabled match whose secret is stored', () => {
  const { events, apiVersion } = webhookContract(ROOT);
  const good = { id: 'we_1', status: 'enabled', api_version: apiVersion, enabled_events: [...events].reverse() };
  assert.equal(webhookAction({ matches: [], events, apiVersion, secretSet: true }), 'create');
  assert.equal(webhookAction({ matches: [good], events, apiVersion, secretSet: true }), 'keep');
  assert.equal(webhookAction({ matches: [good], events, apiVersion, secretSet: false }), 'recreate');
  assert.equal(webhookAction({ matches: [good, { ...good, id: 'we_2' }], events, apiVersion, secretSet: true }), 'recreate');
  assert.equal(webhookAction({ matches: [{ ...good, status: 'disabled' }], events, apiVersion, secretSet: true }), 'recreate');
  assert.equal(webhookAction({ matches: [{ ...good, api_version: 'old' }], events, apiVersion, secretSet: true }), 'recreate');
  assert.equal(webhookAction({ matches: [{ ...good, enabled_events: events.slice(1) }], events, apiVersion, secretSet: true }), 'recreate');
});

test('webhook: made once, found by its URL, kept on the next press, made anew when wrong', async () => {
  const w = world();
  const first = await cmd(w, ['webhook']);
  assert.equal(first.code, 0, first.log.join('\n'));
  assert.equal(w.endpoints.length, 1);
  assert.equal(w.endpoints[0].url, `${BASE}/functions/v1/stripe-webhook`);
  assert.equal(w.secrets.get('STRIPE_WEBHOOK_SECRET'), FETCHED.whsec);
  const { events, apiVersion } = webhookContract(ROOT);
  assert.deepEqual(w.endpoints[0].enabled_events, events);
  assert.equal(w.endpoints[0].api_version, apiVersion);

  const posts = () => w.timeline.filter((e) => e.kind === 'request' && e.method !== 'GET' && e.url.includes('stripe.com')).length;
  const before = posts();
  const second = await cmd(w, ['webhook']);
  assert.equal(second.code, 0);
  assert.equal(posts(), before, 'a second press changed Stripe');
  assert.equal(second.outputs().note, 'kept');

  // The stored secret's name vanished: the old endpoint goes, a new one comes, its secret is stored.
  w.secrets.delete('STRIPE_WEBHOOK_SECRET');
  const third = await cmd(w, ['webhook']);
  assert.equal(third.code, 0);
  assert.equal(w.endpoints.length, 1);
  assert.equal(w.endpoints[0].id, 'we_fake2');
  assert.ok(w.secrets.has('STRIPE_WEBHOOK_SECRET'));

  // Another endpoint, someone else's URL, is never touched.
  w.endpoints.push({ id: 'we_other', url: 'https://example.invalid/hook', status: 'enabled', enabled_events: [] });
  w.endpoints[0].enabled_events = ['charge.refunded'];
  assert.equal((await cmd(w, ['webhook'])).code, 0);
  assert.ok(w.endpoints.some((e) => e.id === 'we_other'));
});

// ---- the key stored for the timers, and the smoke checks --------------------------------------------

test('vault: every press stores the functions URL and the server key, waiting while PostgREST learns the function', async () => {
  const w = world({ rpcMissingFor: 2 });
  const r = await cmd(w, ['vault']);
  assert.equal(r.code, 0, r.log.join('\n'));
  assert.equal(w.vault.p_functions_base_url, `${BASE}/functions/v1`);
  assert.equal(w.vault.p_service_key, FETCHED.secret);
  assert.equal(r.outputs().note, 'timer key stored: secret');
});

test('smoke checks: each function answers an unauthenticated call in its own words', async () => {
  assert.deepEqual(Object.keys(SMOKE), ['push', 'status', 'webhook']);
  for (const which of Object.keys(SMOKE)) {
    const r = await cmd(world(), ['smoke', which]);
    assert.equal(r.code, 0, `${which}: ${r.log.join('\n')}`);
  }
  // connect-status gets the publishable key as apikey and no Authorization.
  const w = world();
  await cmd(w, ['smoke', 'status']);
  const call = w.timeline.find((e) => e.kind === 'request' && e.url.endsWith('/functions/v1/connect-status'));
  assert.equal(call.headers.apikey, FETCHED.publishable);
  assert.equal(call.headers.Authorization, undefined);
  // send-push gets no key at all.
  const w2 = world();
  await cmd(w2, ['smoke', 'push']);
  const push = w2.timeline.find((e) => e.kind === 'request' && e.url.endsWith('/functions/v1/send-push'));
  assert.equal(push.headers.apikey, undefined);
  assert.equal(push.headers.Authorization, undefined);
});

test('connect-status (verify_jwt = true): any 401 refuses the caller, from the gateway or the function', async () => {
  const own = await cmd(world(), ['smoke', 'status']);
  assert.equal(own.code, 0, own.log.join('\n'));
  assert.equal(own.outputs().note, 'HTTP 401, refused in its own words');

  // The gateway's words on a new project are unknown; a 401 in any words passes.
  for (const body of [{ msg: 'Missing authorization header' }, { code: 401, message: 'Invalid JWT' }, undefined]) {
    const gateway = await cmd(world({ functions: { 'connect-status': [401, body] } }), ['smoke', 'status']);
    assert.equal(gateway.code, 0, `${JSON.stringify(body)}: ${gateway.log.join('\n')}`);
    assert.equal(gateway.outputs().note, 'HTTP 401, refused by the gateway');
  }

  const open = await cmd(world({ functions: { 'connect-status': [200, { state: 'none' }] } }), ['smoke', 'status']);
  assert.equal(open.code, 1);
  assert.equal(open.outputs().reason, 'connect-status answered HTTP 200, so a caller who is not signed in was not refused.');
  const missing = await cmd(world({ functions: { 'connect-status': [404, { message: 'not found' }] } }), ['smoke', 'status']);
  assert.equal(missing.code, 1);
  assert.equal(missing.outputs().reason, 'connect-status is not deployed (HTTP 404).');
  const unconfigured = await cmd(world({ functions: { 'connect-status': [500, { error: 'not configured' }] } }), ['smoke', 'status']);
  assert.equal(unconfigured.code, 1);
  assert.match(unconfigured.outputs().reason, /not configured/);
  const busy = await cmd(world({ functions: { 'connect-status': [403, {}] } }), ['smoke', 'status']);
  assert.match(busy.outputs().reason, /HTTP 403, not the 401 that refuses this call\./);
});

test('send-push and stripe-webhook stay strict: their own code must answer, in their own words', async () => {
  const gateway = await cmd(world({ functions: { 'send-push': [401, { msg: 'Invalid JWT' }] } }), ['smoke', 'push']);
  assert.equal(gateway.code, 1);
  assert.match(gateway.outputs().reason, /refused by the gateway.*verify_jwt/);
  const otherWords = await cmd(world({ functions: { 'send-push': [403, { error: 'something else' }] } }), ['smoke', 'push']);
  assert.equal(otherWords.code, 1);
  assert.match(otherWords.outputs().reason, /not in its own words/);
  const bare = await cmd(world({ functions: { 'send-push': [403, undefined] } }), ['smoke', 'push']);
  assert.equal(bare.code, 1);
  const pushOk = await cmd(world(), ['smoke', 'push']);
  assert.equal(pushOk.outputs().note, "HTTP 403, the function's own answer");
  const down = await cmd(world({ functions: { 'stripe-webhook': [502, {}] } }), ['smoke', 'webhook']);
  assert.match(down.outputs().reason, /HTTP 502/);
  assert.deepEqual(
    Object.fromEntries(Object.entries(SMOKE).map(([k, s]) => [k, s.gatewayToo])),
    { push: false, status: true, webhook: false },
    'only connect-status may be answered by the gateway'
  );
});

test('the verify_jwt settings the smoke rows rely on are the ones in supabase/config.toml', () => {
  const toml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
  const jwt = (fn) => toml.match(new RegExp(`\\[functions\\.${fn}\\][^\\[]*?verify_jwt = (true|false)`))?.[1];
  assert.equal(jwt('send-push'), 'false');
  assert.equal(jwt('stripe-webhook'), 'false');
  assert.equal(jwt('connect-status'), 'true');
});

test('the smoke answers are the functions’ own words, read from their source', () => {
  const src = (rel) => readFileSync(join(ROOT, 'supabase/functions', rel), 'utf8');
  const shared = readdirSync(join(ROOT, 'supabase/functions/_shared')).map((f) => src(`_shared/${f}`)).join('\n');
  assert.ok(`${src('send-push/index.ts')}\n${shared}`.includes(`'${SMOKE.push.error}'`), 'send-push lost its forbidden answer');
  assert.ok(src('connect-status/index.ts').includes(`'${SMOKE.status.error}'`), 'connect-status lost its sign-in sentence');
  assert.ok(src('stripe-webhook/index.ts').includes(`'${SMOKE.webhook.error}'`), 'stripe-webhook lost its signature answer');
});

test('timers: one test call from the database to each drain, with the stored key, must get HTTP 200', async () => {
  assert.deepEqual([...DRAINS], ['send_push', 'process_settlements', 'send_receipts']);
  const w = world();
  await cmd(w, ['vault']);
  const ok = await cmd(w, ['timers']);
  assert.equal(ok.code, 0, ok.log.join('\n'));
  assert.equal(ok.outputs().note, 'send-push, process-settlements, send-receipts answered the database with HTTP 200');

  const wrongKey = world({ probeAnswers: { send_push: 200, process_settlements: 403, send_receipts: 200 } });
  await cmd(wrongKey, ['vault']);
  const refused = await cmd(wrongKey, ['timers']);
  assert.equal(refused.code, 1);
  assert.match(refused.outputs().reason, /process-settlements .*HTTP 403.*press the button again/i);

  const silent = world({ probeAnswers: { send_push: 200, process_settlements: 200, send_receipts: 0 } });
  await cmd(silent, ['vault']);
  assert.match((await cmd(silent, ['timers'])).outputs().reason, /send-receipts .*no HTTP answer/);

  const noVault = await cmd(world(), ['timers']);
  assert.equal(noVault.code, 1);
  assert.match(noVault.outputs().reason, /Vault lacks the URL or the key for send-push/);
  const noReceipts = await cmd(world({ vaultMissing: 'drain_receipts: vault secrets missing' }), ['timers']);
  assert.match(noReceipts.outputs().reason, /Vault lacks the URL or the key for send-receipts/);
  // The words the fake raises are the migration's own.
  const sql = readdirSync(join(ROOT, 'supabase/migrations'))
    .map((f) => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
    .join('\n');
  for (const name of ['drain_notification_outbox', 'drain_settlements', 'drain_receipts']) {
    assert.ok(sql.includes(`'${name}: vault secrets missing'`), `${name} no longer raises its vault sentence`);
  }
  for (const fn of ['drain_probe()', 'drain_probe_status(p_probe jsonb)', 'set_drain_secrets(p_functions_base_url text, p_service_key text)']) {
    assert.ok(sql.includes(`function public.${fn}`), `${fn} is gone from the migrations`);
  }

  const late = world({ probeAfter: 3_600_000 });
  await cmd(late, ['vault']);
  assert.match((await cmd(late, ['timers'])).outputs().reason, /did not answer the database's test call within 3 minutes/);
});

// ---- sign-in settings ------------------------------------------------------------------------------

test('production-auth.json: phone on through Twilio Verify, email off, passwords of 8, no secret in the file', () => {
  const file = JSON.parse(readFileSync(join(ROOT, 'scripts/production-auth.json'), 'utf8'));
  assert.equal(file.external_phone_enabled, true);
  assert.equal(file.sms_provider, 'twilio_verify');
  assert.equal(file.external_email_enabled, false);
  assert.equal(file.password_min_length, 8);
  for (const key of Object.keys(file)) assert.doesNotMatch(key, /token|secret|sid|otp|password$/i, key);
});

test('auth: the PATCH carries the file and the three Twilio values, never a test sign-in code', async () => {
  const w = world();
  const r = await cmd(w, ['auth']);
  assert.equal(r.code, 0, r.log.join('\n'));
  const patch = w.timeline.find((e) => e.kind === 'request' && e.method === 'PATCH');
  const body = JSON.parse(patch.body);
  assert.equal(body.sms_twilio_verify_account_sid, SECRETS.TWILIO_ACCOUNT_SID);
  assert.equal(body.sms_twilio_verify_auth_token, SECRETS.TWILIO_AUTH_TOKEN);
  assert.equal(body.sms_twilio_verify_message_service_sid, SECRETS.TWILIO_VERIFY_SERVICE_SID);
  assert.equal('sms_test_otp' in body, false);
  const { compare } = authWanted(SECRETS);
  assert.equal('sms_twilio_verify_auth_token' in compare, false, 'the token is never read back');

  const stuck = await cmd(world({ authTakes: false }), ['auth']);
  assert.equal(stuck.code, 1);
  assert.match(stuck.outputs().reason, /did not take: .*external_email_enabled/);
  assert.deepEqual(authDiff({ a: 8, b: false }, { a: '8', b: false }), []);
});

const TEST_OTP = '15550000000=123456'; // a fake test value, never a real number

test('auth: PRODUCTION_TEST_OTP adds one test sign-in number for 7 days, read back, never printed', async () => {
  const w = world();
  const r = await cmd(w, ['auth'], { PRODUCTION_TEST_OTP: TEST_OTP });
  assert.equal(r.code, 0, r.log.join('\n'));
  const body = JSON.parse(w.timeline.find((e) => e.kind === 'request' && e.method === 'PATCH').body);
  assert.equal(body.sms_test_otp, TEST_OTP);
  assert.equal(body.sms_test_otp_valid_until, '2026-11-19T10:00:00.000Z');
  const { compare } = authWanted({ ...SECRETS, PRODUCTION_TEST_OTP: TEST_OTP }, w.now);
  assert.equal(compare.sms_test_otp, TEST_OTP, 'the test number is read back');
  assert.equal('sms_test_otp_valid_until' in compare, false);
  assert.equal(r.outputs().note, 'phone sign-in through Twilio Verify; email sign-in off; one test sign-in number until 2026-11-19');
  const printed = [r.log.join('\n'), JSON.stringify(r.outputs()), r.summary()].join('\n');
  for (const part of [TEST_OTP, ...TEST_OTP.split('=')]) assert.equal(printed.includes(part), false, 'the test number was printed');

  // A test number that did not take is named, not shown.
  const stuck = await cmd(world({ authTakes: false }), ['auth'], { PRODUCTION_TEST_OTP: TEST_OTP });
  assert.match(stuck.outputs().reason, /did not take: .*sms_test_otp/);
  assert.equal(JSON.stringify(stuck.outputs()).includes(TEST_OTP.split('=')[0]), false);
});

test('auth: a malformed PRODUCTION_TEST_OTP stops before any change and is never printed', async () => {
  for (const bad of ['+15550000000=123456', '15550000000=12345', '15550000000', '15550000000=123456,15550000001=123456']) {
    const w = world();
    const r = await cmd(w, ['auth'], { PRODUCTION_TEST_OTP: bad });
    assert.equal(r.code, 1, bad);
    assert.match(r.outputs().reason, /PRODUCTION_TEST_OTP is not/);
    assert.equal(w.timeline.some((e) => e.kind === 'request' && e.method === 'PATCH'), false, 'a PATCH was sent');
    const printed = [r.log.join('\n'), JSON.stringify(r.outputs()), r.summary()].join('\n');
    assert.equal(printed.includes('15550000000'), false, `the value was printed: ${bad}`);
  }
});

// ---- fingerprint and the table ---------------------------------------------------------------------

test('fingerprint: the proof tool gets the project URL and the server key, and nothing else', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brazos-fp-'));
  const file = join(dir, 'local-fingerprint.json');
  writeFileSync(file, '{}');
  const w = world();
  const r = await cmd(w, ['fingerprint', file]);
  assert.equal(r.code, 0, r.log.join('\n'));
  const child = w.spawned[0];
  assert.deepEqual(child.args.slice(-3), ['compare', file, 'hosted']);
  assert.equal(child.env.FINGERPRINT_URL, BASE);
  assert.equal(child.env.FINGERPRINT_KEY, FETCHED.secret);
  for (const name of REQUIRED_SECRETS) assert.equal(child.env[name], undefined, `${name} reached the proof tool`);
  const differ = await cmd(world({ fingerprintStatus: 1 }), ['fingerprint', file]);
  assert.match(differ.outputs().reason, /differs from the local build/);
  rmSync(dir, { recursive: true, force: true });
});

test('the table: one row per check, a reason per FAIL, a check that did not run is a FAIL', () => {
  const pass = { outcome: 'success', outputs: {} };
  const all = Object.fromEntries(
    ['guards', 'status', 'keys', 'link', 'list', 'plan'].map((id) => [id, id === 'keys' ? { ...pass, outputs: { note: 'server key: secret; legacy keys: no' } } : pass])
  );
  const ok = summarize('plan', all);
  assert.equal(ok.ok, true);
  assert.equal(ok.last, 'PRODUCTION PLAN: PASS');
  assert.match(ok.markdown, /\| PASS \| Project keys \| server key: secret; legacy keys: no \|/);

  const failed = summarize('apply', {
    download: pass,
    guards: pass,
    status: { outcome: 'failure', outputs: { reason: 'The production project is not running.' } },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.last, 'PRODUCTION: FAIL at Project is running');
  assert.match(failed.markdown, /\| FAIL \| Project is running \| The production project is not running\. \|/);
  assert.match(failed.markdown, /\| FAIL \| Database matches the local build \| This check did not run, so it proves nothing; the first FAIL above says why\. \|/);
  for (const row of failed.markdown.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Result'))) {
    assert.match(row, /^\| (PASS|FAIL) \| /, 'every row is PASS or FAIL');
    if (row.startsWith('| FAIL')) assert.match(row, /\| [A-Z][^|]*\. \|$/, 'every FAIL row carries one sentence');
  }

  const cli = summarize('apply', { push: { outcome: 'failure', outputs: {} } });
  assert.match(cli.markdown, /\| FAIL \| Apply the migrations \| .+ \|/);

  const skipped = summarize('prove', { download: pass });
  assert.equal(skipped.last, 'STAGING PROOF: FAIL at Staging database matches the local build');
  assert.equal(summarize('prove', { download: pass, fingerprint: pass }).last, 'STAGING PROOF: PASS');
});

// ---- nothing secret leaves the script, in any form ---------------------------------------------------

const leakForms = (value) =>
  [
    value,
    Buffer.from(value).toString('base64'),
    Buffer.from(value).toString('base64url'),
    Buffer.from(value).toString('hex'),
    encodeURIComponent(value),
    JSON.stringify(value).slice(1, -1),
  ].filter((form, i, all) => all.indexOf(form) === i);

const ALL_SECRETS = { ...SECRETS, ...FETCHED, GITHUB_TOKEN };

function assertNoLeak(label, { log, outputs, summary }) {
  const lines = log.filter((line) => !/^::add-mask::/.test(line));
  const text = [lines.join('\n'), JSON.stringify(outputs()), summary()].join('\n');
  for (const [name, value] of Object.entries(ALL_SECRETS)) {
    for (const form of leakForms(value)) {
      assert.equal(text.includes(form), false, `${label}: ${name} appears in the public output (form ${leakForms(value).indexOf(form)})`);
    }
  }
  // The one sanctioned line holds a fetched value and nothing else.
  for (const line of log.filter((l) => /^::add-mask::/.test(l))) {
    assert.ok(Object.values(FETCHED).includes(line.slice('::add-mask::'.length)), `${label}: an unexpected mask line`);
  }
}

test('no secret, key, token or password appears in the log, the outputs or the summary, in any form', async () => {
  const dir = migrationsFixture();
  const list = listFile(dir, EMPTY);
  const fp = join(dir, 'local-fingerprint.json');
  writeFileSync(fp, '{}');
  const w = world();

  const plan = await cmd(w, ['plan', list], {}, dir);
  const code = plan.outputs().plan_code;
  const happy = [
    ['guards'],
    ['status'],
    ['keys'],
    ['plan', list],
    ['check', list],
    ['secrets'],
    ['webhook'],
    ['vault'],
    ['smoke', 'push'],
    ['smoke', 'status'],
    ['smoke', 'webhook'],
    ['timers'],
    ['auth'],
    ['fingerprint', fp],
  ];
  for (const argv of happy) {
    const r = await cmd(w, argv, { PLAN_CODE: code }, dir);
    assert.equal(r.code, 0, `${argv.join(' ')}: ${r.log.join('\n')}`);
    assertNoLeak(argv.join(' '), r);
  }

  // The failure paths print too: every one of them is searched the same way.
  const failing = [
    [world({ environment: { status: 500, body: {} } }), ['guards'], { STRIPE_SECRET_KEY: 'sk_live_fake-0001' }],
    [world({ project: { status: 503, body: {} } }), ['status']],
    [world({ keys: [] }), ['keys']],
    [world({ functions: {} }), ['smoke', 'status']],
    [world({ authTakes: false }), ['auth']],
    [world({ probeAnswers: { send_push: 401, process_settlements: 200, send_receipts: 200 } }), ['timers']],
    [world({ fingerprintStatus: 2 }), ['fingerprint', fp]],
  ];
  for (const [fw, argv, env] of failing) {
    if (argv[0] === 'timers') await cmd(fw, ['vault']);
    const r = await cmd(fw, argv, env, dir);
    assert.equal(r.code, 1, `${argv.join(' ')} should fail`);
    assertNoLeak(`failing ${argv.join(' ')}`, r);
  }

  const table = summarize('apply', {});
  for (const value of Object.values(ALL_SECRETS)) assert.equal(table.markdown.includes(value), false);
  rmSync(dir, { recursive: true, force: true });
});

test('each fetched key is masked before any other use, and each secret goes only where it belongs', async () => {
  const w = world();
  for (const argv of [['webhook'], ['vault'], ['smoke', 'status'], ['timers'], ['auth']]) {
    assert.equal((await cmd(w, argv)).code, 0, argv.join(' '));
  }
  for (const value of [FETCHED.secret, FETCHED.publishable, FETCHED.whsec]) {
    const masked = w.timeline.findIndex((e) => e.kind === 'log' && e.line === `::add-mask::${value}`);
    const used = w.timeline.findIndex((e) => e.kind === 'request' && (JSON.stringify(e.headers).includes(value) || e.body.includes(value)));
    assert.ok(masked >= 0, 'never masked');
    assert.ok(used < 0 || masked < used, 'used before it was masked');
  }
  const allowed = {
    SUPABASE_ACCESS_TOKEN: ['api.supabase.com'],
    STRIPE_SECRET_KEY: ['api.stripe.com', 'api.supabase.com'],
    TWILIO_ACCOUNT_SID: ['api.supabase.com'],
    TWILIO_AUTH_TOKEN: ['api.supabase.com'],
    TWILIO_VERIFY_SERVICE_SID: ['api.supabase.com'],
    SUPABASE_DB_PASSWORD: [],
    secret: [`${REF}.supabase.co`],
    publishable: [`${REF}.supabase.co`],
    whsec: ['api.supabase.com'],
  };
  for (const [name, hosts] of Object.entries(allowed)) {
    const value = SECRETS[name] ?? FETCHED[name];
    for (const e of w.timeline.filter((x) => x.kind === 'request')) {
      if (JSON.stringify(e.headers).includes(value) || e.body.includes(value)) {
        assert.ok(hosts.includes(new URL(e.url).host), `${name} was sent to ${new URL(e.url).host}`);
      }
    }
  }
});
