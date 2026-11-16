import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
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
  tarballBin,
  webhookAction,
  webhookContract,
  webhookInputs,
} from '../scripts/production-deploy.mjs';
import { PRODUCTION_REF, RETIRED_PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';
import { bounce } from '../supabase/functions/connect-return/page.mjs';

// scripts/production-deploy.mjs, the Production button's logic, driven through a fake fetch: no
// network, no database, no Stripe. Every value below is fake and shaped so that the repository's
// own secret scan (tests/governance.test.mjs) does not mistake it for a real credential.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// F09: the button works on production's project only, so the fake world is that project.
const REF = PRODUCTION_REF;
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
const ADMIN_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'; // a fake user id, never printed

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
      'connect-return': [302, undefined, 'brazos://payouts?from=return'],
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
    cliTarball: null,
    cliVersion: '2.116.0',
    // F08: a test payment's event reaches stripe-webhook signed only when the stored secret is the webhook's.
    intents: [],
    nextIntent: 1,
    deliverAfter: 10_000,
    otherEndpointFails: false,
    applyFails: false,
    probePayment: null,
    adminAnswer: (row) => row,
    // Routes whose effect happens but whose answer is lost (fetch throws), and routes refused with HTTP 500.
    lose: new Set(),
    refuse: new Set(),
    authRead: (auth) => auth,
    profiles: new Map(),
    ...over,
  };
  return w;
}

function respond(status, body, location = null) {
  const text = body === undefined ? '' : JSON.stringify(body);
  const headers = { get: (name) => (name.toLowerCase() === 'location' ? location : null) };
  return { status, ok: status >= 200 && status < 300, headers, text: async () => text };
}

const HOOK = `${BASE}/functions/v1/stripe-webhook`;

/** The test payment's event as Stripe and the database see it now (F08). */
function delivery(w, intent) {
  const hook = w.endpoints.find((e) => e.url === HOOK && e.status === 'enabled' && e.enabled_events.includes('payment_intent.canceled'));
  const arrived = w.now >= intent.canceledAt + w.deliverAfter;
  const signed = Boolean(arrived && hook && w.secrets.get('STRIPE_WEBHOOK_SECRET') === hook.secret);
  return { signed, pending: (hook && !signed ? 1 : 0) + (w.otherEndpointFails ? 1 : 0) };
}

function fakeFetch(w) {
  return async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const headers = init.headers ?? {};
    const body = init.body === undefined ? '' : String(init.body);
    w.timeline.push({ kind: 'request', method, url, headers, body, redirect: init.redirect });
    const u = new URL(url);
    const m = (re) => u.pathname.match(re);
    // The effect happens, then the answer is lost (fetch throws).
    const lost = (route, answer) => {
      if (w.lose.has(route)) {
        w.lose.delete(route);
        throw new Error('the answer was lost');
      }
      return answer;
    };

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
          if (w.refuse.has('secret')) return respond(500, {});
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
        return respond(200, w.authRead({ ...readable, sms_twilio_verify_auth_token: 'hash' }));
      }
      return respond(404, { message: 'no such route in the fake' });
    }
    if (u.host === 'api.stripe.com') {
      if (headers.Authorization !== `Bearer ${SECRETS.STRIPE_SECRET_KEY}`) return respond(401, {});
      // A listed endpoint never carries its secret; only the create answer does.
      const shown = ({ secret: _secret, ...e }) => e;
      if (u.pathname === '/v1/webhook_endpoints' && method === 'GET') return respond(200, { data: w.endpoints.map(shown), has_more: false });
      if (u.pathname === '/v1/webhook_endpoints' && method === 'POST') {
        if (w.refuse.has('create')) return respond(500, {});
        const form = new URLSearchParams(body);
        const e = {
          id: `we_fake${w.nextEndpoint++}`,
          url: form.get('url'),
          api_version: form.get('api_version'),
          enabled_events: form.getAll('enabled_events[]'),
          status: 'enabled',
          secret: FETCHED.whsec,
        };
        w.endpoints.push(e);
        return lost('create', respond(200, w.noSecret ? shown(e) : e));
      }
      const one = m(/^\/v1\/webhook_endpoints\/([^/]+)$/);
      if (one && method === 'POST') {
        if (w.refuse.has('update')) return respond(500, {});
        const e = w.endpoints.find((x) => x.id === one[1]);
        if (!e) return respond(404, {});
        const form = new URLSearchParams(body);
        if (form.has('enabled_events[]')) e.enabled_events = form.getAll('enabled_events[]');
        if (form.get('disabled') === 'false') e.status = 'enabled';
        return lost('update', respond(200, shown(e)));
      }
      if (one && method === 'DELETE') {
        w.endpoints = w.endpoints.filter((e) => e.id !== one[1]);
        return respond(200, { id: one[1], deleted: true });
      }
      if (u.pathname === '/v1/payment_intents' && method === 'POST') {
        if (w.refuse.has('intent')) return respond(500, {});
        const intent = { id: `pi_fake${w.nextIntent++}`, form: new URLSearchParams(body), status: 'requires_payment_method', canceledAt: null, event: null };
        w.intents.push(intent);
        return lost('intent', respond(200, { id: intent.id, status: intent.status }));
      }
      const cancel = m(/^\/v1\/payment_intents\/([^/]+)\/cancel$/);
      if (cancel && method === 'POST') {
        const intent = w.intents.find((x) => x.id === cancel[1]);
        if (!intent) return respond(404, {});
        intent.status = 'canceled';
        intent.canceledAt = w.now;
        intent.event = `evt_fake${intent.id.slice(3)}`;
        return lost('cancel', respond(200, { id: intent.id, status: 'canceled' }));
      }
      const ev = m(/^\/v1\/events\/([^/]+)$/);
      if (ev && method === 'GET') {
        const intent = w.intents.find((x) => x.event === ev[1]);
        if (!intent) return respond(404, {});
        return respond(200, { id: ev[1], type: 'payment_intent.canceled', pending_webhooks: delivery(w, intent).pending });
      }
      return respond(404, {});
    }
    if (u.host === `${REF}.supabase.co`) {
      const fn = m(/^\/functions\/v1\/([a-z-]+)$/);
      if (fn) {
        const [status, answer, location] = w.functions[fn[1]] ?? [404, { message: 'not found' }];
        return respond(status, answer, location);
      }
      if (u.pathname === '/rest/v1/payment_events') {
        if (headers.apikey !== FETCHED.secret || headers.Authorization !== undefined) return respond(401, {});
        assert.equal(u.searchParams.get('type'), 'eq.payment_intent.canceled');
        const pi = (u.searchParams.get('payload->data->object->>id') ?? '').replace(/^eq\./, '');
        const intent = w.intents.find((x) => x.id === pi && x.event);
        if (!intent || !delivery(w, intent).signed) return respond(200, []);
        const applied = !w.applyFails;
        return respond(200, [{ id: intent.event, processed_at: applied ? new Date(w.now).toISOString() : null, attempts: applied ? 0 : 1, payment_id: w.probePayment }]);
      }
      if (u.pathname === '/rest/v1/profiles') {
        if (headers.apikey !== FETCHED.secret || headers.Authorization !== undefined) return respond(401, {});
        const p = w.profiles.get((u.searchParams.get('id') ?? '').replace(/^eq\./, ''));
        if (method === 'GET') return respond(200, p ? [{ id: p.id, is_admin: p.is_admin, banned: p.banned, deleted_at: p.deleted_at }] : []);
        if (method === 'PATCH') {
          assert.equal(headers.Prefer, 'return=representation');
          assert.equal(u.searchParams.get('deleted_at'), 'is.null');
          assert.equal(u.searchParams.get('banned'), 'is.false');
          if (!p || p.deleted_at !== null || p.banned) return respond(200, []);
          Object.assign(p, JSON.parse(body));
          return lost('admin', respond(200, [w.adminAnswer({ id: p.id, is_admin: p.is_admin })]));
        }
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
    if (u.host === 'registry.npmjs.org') {
      const tgz = w.cliTarball;
      if (!tgz) return respond(404, {});
      return { status: 200, ok: true, headers: { get: () => null }, arrayBuffer: async () => tgz.buffer.slice(tgz.byteOffset, tgz.byteOffset + tgz.byteLength) };
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
      if (args[0] === '--version') return { status: 0, stdout: `${w.cliVersion}\n`, stderr: '' };
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
  // F09: any other well-formed ref is refused too; only PRODUCTION_REF passes.
  assert.deepEqual(guardProblems({ ...env, SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst' }), [
    'SUPABASE_PROJECT_REF is not the production project that scripts/supabase-ref.mjs names (PRODUCTION_REF). The button works on that project only.',
  ]);
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

test('F09: every command refuses a project other than production before any request; only the proof reads staging', async () => {
  for (const argv of [['status'], ['keys'], ['webhook-plan'], ['webhook'], ['webhook-event'], ['vault'], ['timers'], ['auth'], ['admin']]) {
    const w = world();
    const r = await cmd(w, argv, { SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', PRODUCTION_ADMIN_USER_ID: ADMIN_ID });
    assert.equal(r.code, 1, argv.join(' '));
    assert.match(r.outputs().reason, /is not the production project that scripts\/supabase-ref\.mjs names/, argv.join(' '));
    assert.deepEqual(w.timeline.filter((e) => e.kind === 'request'), [], `${argv.join(' ')} sent a request`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'brazos-fp-'));
  writeFileSync(join(dir, 'fp.json'), '{}');
  const staging = await cmd(world(), ['fingerprint', join(dir, 'fp.json')], { SUPABASE_PROJECT_REF: STAGING_REF });
  assert.doesNotMatch(staging.outputs().reason ?? '', /production project|staging project/);
  rmSync(dir, { recursive: true, force: true });
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
  assert.equal(events.length, 8);
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

const PAIR =
  'In Stripe (test mode), open Developers, Webhooks, the webhook whose address ends in /functions/v1/stripe-webhook, and reveal its signing secret. In Supabase, open the production project, Edge Functions, Secrets, and save it as STRIPE_WEBHOOK_SECRET. Then press the button again.';

/** A webhook at this project's address, as the button makes it, with the secret Stripe gave it. */
function hookEndpoint(over = {}) {
  const { events, apiVersion } = webhookContract(ROOT);
  return { id: 'we_fake1', url: HOOK, status: 'enabled', api_version: apiVersion, enabled_events: [...events], secret: FETCHED.whsec, ...over };
}
const writes = (w) => w.timeline.filter((e) => e.kind === 'request' && e.method !== 'GET');
const stripeWrites = (w) => writes(w).filter((e) => e.url.includes('api.stripe.com'));
const deletes = (w) => w.timeline.filter((e) => e.kind === 'request' && e.method === 'DELETE');

test('webhook action (F02, F07): create, keep, update in place, or stop; never a delete', () => {
  const { events, apiVersion } = webhookContract(ROOT);
  const good = { id: 'we_1', status: 'enabled', api_version: apiVersion, enabled_events: [...events].reverse() };
  const act = (matches, secretSet = true) => webhookAction({ matches, events, apiVersion, secretSet });
  assert.equal(act([]), 'create');
  assert.equal(act([], false), 'create');
  assert.equal(act([good]), 'keep');
  assert.equal(act([{ ...good, status: 'disabled' }]), 'update');
  assert.equal(act([{ ...good, enabled_events: events.slice(1) }]), 'update');
  assert.equal(act([{ ...good, enabled_events: ['*'] }]), 'update');
  // A stored secret is checked before events or the enabled state: an unpaired endpoint always stops.
  assert.equal(act([good], false), 'pairing');
  assert.equal(act([{ ...good, status: 'disabled', enabled_events: [] }], false), 'pairing');
  // Several, or a version the functions do not read, stop before anything else, paired or not.
  assert.equal(act([good, { ...good, id: 'we_2' }]), 'several');
  assert.equal(act([good, { ...good, id: 'we_2' }], false), 'several');
  assert.equal(act([{ ...good, api_version: '2025-01-27.acacia' }]), 'version');
  assert.equal(act([{ ...good, api_version: null }], false), 'version');
});

test('the webhook decision logs its inputs as counts, yes/no and the version, never an id, a secret or the address', async () => {
  const { events, apiVersion } = webhookContract(ROOT);
  const w = world({ endpoints: [hookEndpoint({ enabled_events: events.slice(1), status: 'disabled' })] });
  w.secrets.set('STRIPE_WEBHOOK_SECRET', FETCHED.whsec);
  const r = await cmd(w, ['webhook-plan']);
  assert.equal(r.code, 0, r.log.join('\n'));
  assert.deepEqual(r.log.filter((l) => l.startsWith('Stripe webhook')), [
    `Stripe webhook inputs: endpoints at this project's address: 1; STRIPE_WEBHOOK_SECRET stored: yes; enabled: no; events match: no (${events.length} wanted, ${events.length - 1} on the endpoint); API version: ${apiVersion} (the functions read ${apiVersion}).`,
    'Stripe webhook decision: update.',
  ]);
  assert.equal(
    webhookInputs({ matches: [], events, apiVersion, secretSet: false }),
    `endpoints at this project's address: 0; STRIPE_WEBHOOK_SECRET stored: no; enabled: n/a; events match: n/a; API version: n/a (the functions read ${apiVersion})`
  );
  assert.match(webhookInputs({ matches: [{ api_version: 'x"><script>' }], events, apiVersion, secretSet: true }), /API version: unreadable/);
  assert.match(webhookInputs({ matches: [{ api_version: null }], events, apiVersion, secretSet: true }), /API version: none \(the account default\)/);
  const printed = [r.log.join('\n'), JSON.stringify(r.outputs()), r.summary()].join('\n');
  for (const part of ['we_fake1', REF, HOOK, FETCHED.whsec]) assert.equal(printed.includes(part), false, `${part} was printed`);
});

test('webhook-plan (F09): the summary names the target and the planned action; a stop changes nothing anywhere', async () => {
  const fresh = await cmd(world(), ['webhook-plan']);
  assert.equal(fresh.code, 0, fresh.log.join('\n'));
  assert.equal(fresh.summary(), '**Target:** the production project (`PRODUCTION_REF` in scripts/supabase-ref.mjs). **Stripe webhook:** create.\n\n');
  assert.equal(fresh.outputs().note, 'the production project; webhook: create');

  const { events } = webhookContract(ROOT);
  const cases = [
    ['several', [hookEndpoint(), hookEndpoint({ id: 'we_fake2' })], true],
    ['version', [hookEndpoint({ api_version: '2025-01-27.acacia' })], true],
    ['pairing', [hookEndpoint()], false],
  ];
  for (const [action, endpoints, paired] of cases) {
    const w = world({ endpoints });
    if (paired) w.secrets.set('STRIPE_WEBHOOK_SECRET', FETCHED.whsec);
    for (const command of ['webhook-plan', 'webhook']) {
      const r = await cmd(w, [command]);
      assert.equal(r.code, 1, `${action} ${command}`);
      assert.deepEqual(writes(w), [], `${action} ${command}: something was written`);
      assert.match(r.outputs().reason, /Nothing in Stripe was changed\./);
      if (command === 'webhook-plan') assert.match(r.summary(), /\*\*Stripe webhook:\*\* stop\.$/m);
    }
  }
  const several = await cmd(world({ endpoints: cases[0][1] }), ['webhook-plan']);
  assert.equal(
    several.outputs().reason,
    `Stripe has 2 webhooks for this project's address, so the button cannot tell which one the signing secret saved in Supabase belongs to. Nothing in Stripe was changed. In Stripe (test mode), open Developers, Webhooks. Keep one of them (one that lists all ${events.length} events, if there is one), reveal its signing secret, and in Supabase (the production project, Edge Functions, Secrets) save it as STRIPE_WEBHOOK_SECRET. Then delete the other 1 and press the button again.`
  );
  const pairing = await cmd(world({ endpoints: cases[2][1] }), ['webhook-plan']);
  assert.equal(
    pairing.outputs().reason,
    `Stripe already has the webhook for this project, but no STRIPE_WEBHOOK_SECRET is saved in Supabase, and Stripe hands the button a signing secret only when it makes a webhook. Nothing in Stripe was changed. ${PAIR}`
  );
  const version = await cmd(world({ endpoints: cases[1][1] }), ['webhook-plan']);
  assert.match(version.outputs().reason, /^The Stripe webhook for this project sends events in API version 2025-01-27\.acacia, and the functions of this commit read /);
  assert.match(version.outputs().reason, /Delete\) and press the button again, which makes a new one with .* and saves its signing secret\.$/);
});

test('webhook: made once, kept on the next press, updated in place when its events or state differ, never deleted', async () => {
  const w = world();
  const first = await cmd(w, ['webhook']);
  assert.equal(first.code, 0, first.log.join('\n'));
  assert.equal(first.outputs().note, 'made');
  assert.equal(w.endpoints.length, 1);
  assert.equal(w.endpoints[0].url, HOOK);
  assert.equal(w.secrets.get('STRIPE_WEBHOOK_SECRET'), FETCHED.whsec);
  const { events, apiVersion } = webhookContract(ROOT);
  assert.deepEqual(w.endpoints[0].enabled_events, events);
  assert.equal(w.endpoints[0].api_version, apiVersion);

  const before = stripeWrites(w).length;
  const second = await cmd(w, ['webhook']);
  assert.equal(second.code, 0);
  assert.equal(stripeWrites(w).length, before, 'a second press changed Stripe');
  assert.equal(second.outputs().note, 'kept');

  // The button's first production run made 7 events; the functions now handle 8; disabled too.
  w.endpoints[0].enabled_events = events.slice(0, -1);
  w.endpoints[0].status = 'disabled';
  const third = await cmd(w, ['webhook']);
  assert.equal(third.code, 0, third.log.join('\n'));
  assert.equal(third.outputs().note, 'updated in place');
  assert.deepEqual(w.endpoints.map((e) => [e.id, e.status, e.enabled_events.length]), [['we_fake1', 'enabled', events.length]]);
  assert.equal(w.secrets.get('STRIPE_WEBHOOK_SECRET'), FETCHED.whsec, 'the signing secret stays');
  const update = stripeWrites(w).at(-1);
  assert.match(update.url, /\/v1\/webhook_endpoints\/we_fake1$/);
  assert.equal(new URLSearchParams(update.body).get('disabled'), 'false');
  assert.equal((await cmd(w, ['webhook'])).outputs().note, 'kept');

  // Another endpoint, someone else's URL, is never touched.
  w.endpoints.push({ id: 'we_other', url: 'https://example.invalid/hook', status: 'enabled', enabled_events: [] });
  assert.equal((await cmd(w, ['webhook'])).code, 0);
  assert.ok(w.endpoints.some((e) => e.id === 'we_other'));
  assert.deepEqual(deletes(w), [], 'the button sent a DELETE');
});

test('webhook drill: every interruption ends in a press that completes by itself or a stop with the exact clicks', async () => {
  const pair = (w) => w.secrets.set('STRIPE_WEBHOOK_SECRET', w.endpoints[0].secret);
  const press = async (w) => {
    const plan = await cmd(w, ['webhook-plan']);
    if (plan.code !== 0) return plan;
    const hook = await cmd(w, ['webhook']);
    if (hook.code !== 0) return hook;
    return cmd(w, ['webhook-event']);
  };
  const drills = [];

  // 1. Stripe made the webhook, but its answer (and the secret in it) was lost.
  const lostCreate = world({ lose: new Set(['create']) });
  const a1 = await press(lostCreate);
  assert.equal(a1.outputs().reason, 'Stripe did not confirm the new webhook (HTTP 0). Press the button again; if Stripe made it anyway, the next press stops and says how to save its signing secret.');
  const a2 = await press(lostCreate);
  assert.match(a2.outputs().reason, new RegExp(`${PAIR.replace(/[.()]/g, '\\$&')}$`));
  pair(lostCreate);
  assert.equal((await press(lostCreate)).code, 0);
  drills.push(lostCreate);

  // 1b. The same, with a stale secret from an earlier webhook still saved: the decision keeps the
  // new webhook, and the signed test event is what catches the wrong pairing.
  const stale = world({ lose: new Set(['create']) });
  stale.secrets.set('STRIPE_WEBHOOK_SECRET', 'whsec_staleFromAnOlderWebhook01');
  await press(stale);
  const b2 = await press(stale);
  assert.equal(
    b2.outputs().reason,
    `No signed test event reached stripe-webhook within 3 minutes, so the webhook is not proven: the signing secret saved in Supabase is most likely not this webhook's. ${PAIR}`
  );
  pair(stale);
  assert.equal((await press(stale)).code, 0);
  drills.push(stale);

  // 2. Stripe answered without a signing secret.
  const noSecret = world({ noSecret: true });
  assert.equal((await press(noSecret)).outputs().reason, `Stripe made the webhook but returned no signing secret. ${PAIR}`);
  noSecret.noSecret = false;
  pair(noSecret);
  assert.equal((await press(noSecret)).code, 0);
  drills.push(noSecret);

  // 3. Supabase refused the signing secret.
  const refused = world({ refuse: new Set(['secret']) });
  assert.equal((await press(refused)).outputs().reason, `The webhook was made, but Supabase refused its signing secret (HTTP 500). ${PAIR}`);
  refused.refuse.clear();
  assert.match((await press(refused)).outputs().reason, /no STRIPE_WEBHOOK_SECRET is saved in Supabase/);
  pair(refused);
  assert.equal((await press(refused)).code, 0);
  drills.push(refused);

  // 4. The update happened, but its answer was lost: the next press keeps it.
  const { events } = webhookContract(ROOT);
  const lostUpdate = world({ endpoints: [hookEndpoint({ enabled_events: events.slice(0, -1) })], lose: new Set(['update']) });
  pair(lostUpdate);
  assert.equal(
    (await press(lostUpdate)).outputs().reason,
    'Stripe did not confirm the webhook update (HTTP 0). Press the button again: it reads the webhook again and changes only what still differs.'
  );
  const d2 = await press(lostUpdate);
  assert.equal(d2.code, 0, d2.log.join('\n'));
  drills.push(lostUpdate);

  // 5. Stripe refused the update: the next press sends it again.
  const refusedUpdate = world({ endpoints: [hookEndpoint({ status: 'disabled' })], refuse: new Set(['update']) });
  pair(refusedUpdate);
  assert.match((await press(refusedUpdate)).outputs().reason, /did not confirm the webhook update \(HTTP 500\)/);
  refusedUpdate.refuse.clear();
  assert.equal((await press(refusedUpdate)).code, 0);
  drills.push(refusedUpdate);

  // 6. The test payment: its create answer or its cancel answer lost. It holds no card; the next press makes another.
  for (const route of ['intent', 'cancel']) {
    const probe = world({ lose: new Set([route]) });
    const r = await press(probe);
    assert.equal(r.code, 1, route);
    assert.match(r.outputs().reason, route === 'intent' ? /did not confirm the test payment that proves the webhook \(HTTP 0\)/ : /did not confirm that the test payment was canceled \(HTTP 0\)\. It holds no card/);
    assert.equal((await press(probe)).code, 0, route);
    drills.push(probe);
  }

  for (const w of drills) {
    assert.deepEqual(deletes(w), [], 'a drill sent a DELETE');
    assert.equal(w.endpoints.length, 1, 'a drill left more or fewer than one webhook');
  }
});

test('webhook-event (F08): passes only on a signed, applied event that matched no payment', async () => {
  const ready = async (over = {}) => {
    const w = world(over);
    assert.equal((await cmd(w, ['webhook'])).code, 0);
    return w;
  };
  const w = await ready();
  const ok = await cmd(w, ['webhook-event']);
  assert.equal(ok.code, 0, ok.log.join('\n'));
  assert.equal(ok.outputs().note, 'a signed test event reached stripe-webhook and matched no payment');
  // Never charged: no card, no customer, no confirm; canceled at once; described in plain words.
  const [intent] = w.intents;
  assert.equal(intent.status, 'canceled');
  assert.deepEqual([...intent.form.keys()].sort(), ['amount', 'currency', 'description', 'metadata[brazos_probe]', 'payment_method_types[]']);
  assert.equal(intent.form.get('description'), 'Brazos Production button check (never charged, canceled at once)');
  assert.equal(intent.form.get('payment_method_types[]'), 'card');
  assert.equal(w.timeline.some((e) => e.kind === 'request' && /\/confirm$/.test(e.url)), false);

  // The row alone is no proof: a row Stripe still counts as undelivered (another webhook) stops.
  const other = await cmd(await ready({ otherEndpointFails: true }), ['webhook-event']);
  assert.equal(
    other.outputs().reason,
    'stripe-webhook took the signed test event, but Stripe still counts it as undelivered to another webhook on this account. In Stripe (test mode), open Developers, Webhooks, and fix or delete the webhook that shows failed deliveries; then press the button again.'
  );
  // A broken pairing: Stripe's signature fails, nothing is recorded.
  const unpaired = await ready();
  unpaired.secrets.set('STRIPE_WEBHOOK_SECRET', 'whsec_staleFromAnOlderWebhook01');
  assert.match((await cmd(unpaired, ['webhook-event'])).outputs().reason, /^No signed test event reached stripe-webhook within 3 minutes/);
  const unapplied = await cmd(await ready({ applyFails: true }), ['webhook-event']);
  assert.equal(unapplied.outputs().reason, 'stripe-webhook took the signed test event but could not apply it within 3 minutes; payment_attention lists its error. Press the button again.');
  const matched = await cmd(await ready({ probePayment: '5f0e4c1a-0000-4000-8000-000000000001' }), ['webhook-event']);
  assert.equal(matched.outputs().reason, 'The test event matched a payment, which a test payment never may, so the button stopped here.');
  // No test payment is sent while the webhook is not kept as is.
  const notReady = world();
  const early = await cmd(notReady, ['webhook-event']);
  assert.equal(early.outputs().reason, 'The Stripe webhook is not ready (decision: create), so no test event was sent. Press the button again.');
  assert.deepEqual(stripeWrites(notReady), []);
  const refusedIntent = await cmd(await ready({ refuse: new Set(['intent']) }), ['webhook-event']);
  assert.equal(refusedIntent.outputs().reason, 'Stripe did not confirm the test payment that proves the webhook (HTTP 500). Press the button again.');
});

test('the probe leaves nothing a person is told about: the unmatched path sets processed_at and nothing else', () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261115000600_refund_failed_and_event_order.sql'), 'utf8');
  // A payment_intent.% event resolves its row by provider_ref only, and every ledger write needs a row.
  assert.match(sql, /if v_type like 'payment_intent\.%' then\n\s+select \* into v_payment from public\.payments\n\s+where provider = 'stripe' and provider_ref = v_obj ->> 'id' for update;/);
  // Every write in between needs that row; then processed_at is set with a null payment_id.
  const done = '    update public.payment_events set processed_at = now(), payment_id = v_payment.id where id = p_event_id;';
  assert.ok(sql.includes(done));
  const chain = sql.slice(sql.indexOf("    if v_payment.id is not null and v_type = 'transfer.created' then"), sql.indexOf(done));
  assert.deepEqual(
    chain.split('\n').filter((line) => /^ {4}\S/.test(line)),
    [
      "    if v_payment.id is not null and v_type = 'transfer.created' then",
      "    elsif v_payment.id is not null and v_type = 'transfer.reversed' then",
      '    elsif v_payment.id is not null then',
      '    end if;',
      '    -- payout.paid is DELIBERATELY not handled (§5.2 note 9).',
    ]
  );
  // payment_attention lists an event only while it is unprocessed.
  assert.match(sql, /from public\.payment_events e\n\s+where e\.processed_at is null and e\.attempts > 0;/);
  // stripe-webhook answers 2xx only after the signature check, so pending_webhooks 0 means a signed receipt.
  const fn = readFileSync(join(ROOT, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const check = fn.indexOf("if (!verified) return json({ error: 'invalid signature' }, 400);");
  assert.ok(check > 0, 'the signature check moved');
  const ok = [...fn.matchAll(/return json\(\{ ok: (?:true|false)/g)];
  assert.equal(ok.length, 3);
  for (const m of ok) assert.ok(m.index > check, 'a 2xx answer before the signature check');
  assert.match(readFileSync(join(ROOT, 'supabase/functions/_shared/serviceAuth.ts'), 'utf8'), /return refuse\('not configured', 500\);/);
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
  assert.deepEqual(Object.keys(SMOKE), ['push', 'status', 'webhook', 'return']);
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
    { push: false, status: true, webhook: false, return: false },
    'only connect-status may be answered by the gateway'
  );
});

test('the verify_jwt settings the smoke rows rely on are the ones in supabase/config.toml', () => {
  const toml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
  const jwt = (fn) => toml.match(new RegExp(`\\[functions\\.${fn}\\][^\\[]*?verify_jwt = (true|false)`))?.[1];
  assert.equal(jwt('send-push'), 'false');
  assert.equal(jwt('stripe-webhook'), 'false');
  assert.equal(jwt('connect-status'), 'true');
  assert.equal(jwt('connect-return'), 'false');
});

test('the smoke answers are the functions’ own words, read from their source', () => {
  const src = (rel) => readFileSync(join(ROOT, 'supabase/functions', rel), 'utf8');
  const shared = readdirSync(join(ROOT, 'supabase/functions/_shared')).map((f) => src(`_shared/${f}`)).join('\n');
  assert.ok(`${src('send-push/index.ts')}\n${shared}`.includes(`'${SMOKE.push.error}'`), 'send-push lost its forbidden answer');
  assert.ok(src('connect-status/index.ts').includes(`'${SMOKE.status.error}'`), 'connect-status lost its sign-in sentence');
  assert.ok(src('stripe-webhook/index.ts').includes(`'${SMOKE.webhook.error}'`), 'stripe-webhook lost its signature answer');
  assert.equal(bounce(null, 'brazos').headers.Location, SMOKE.return.location, 'connect-return no longer sends the browser where its row expects');
  assert.equal(bounce(null, 'brazos').status, SMOKE.return.status);
});

test('connect-return: a GET without a key, not following the redirect, must get a 302 to the app', async () => {
  const w = world();
  const ok = await cmd(w, ['smoke', 'return']);
  assert.equal(ok.code, 0, ok.log.join('\n'));
  assert.equal(ok.outputs().note, "HTTP 302, the function's own answer");
  const call = w.timeline.find((e) => e.kind === 'request' && e.url.endsWith('/functions/v1/connect-return'));
  assert.equal(call.method, 'GET');
  assert.equal(call.redirect, 'manual');
  assert.equal(call.body, '');
  assert.equal(call.headers.apikey, undefined);
  assert.equal(call.headers.Authorization, undefined);

  const page = await cmd(world({ functions: { 'connect-return': [200, undefined] } }), ['smoke', 'return']);
  assert.equal(page.code, 1);
  assert.equal(page.outputs().reason, 'connect-return answered HTTP 200, not a 302 to brazos://payouts?from=return.');
  const elsewhere = await cmd(world({ functions: { 'connect-return': [302, undefined, 'https://example.com/'] } }), ['smoke', 'return']);
  assert.equal(elsewhere.code, 1);
  assert.equal(elsewhere.outputs().reason, 'connect-return answered HTTP 302, not a 302 to brazos://payouts?from=return.');
  const refreshed = await cmd(world({ functions: { 'connect-return': [302, undefined, 'brazos://payouts?from=refresh'] } }), ['smoke', 'return']);
  assert.equal(refreshed.code, 1);
  const gateway = await cmd(world({ functions: { 'connect-return': [401, { msg: 'Invalid JWT' }] } }), ['smoke', 'return']);
  assert.match(gateway.outputs().reason, /refused by the gateway.*verify_jwt/);
  const missing = await cmd(world({ functions: {} }), ['smoke', 'return']);
  assert.equal(missing.outputs().reason, 'connect-return is not deployed (HTTP 404).');
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

test('auth (R6-f): the end date is compared when Supabase answers it, a visible warning when it does not', async () => {
  // Read back without milliseconds: still the same moment.
  const seconds = await cmd(world({ authRead: (a) => ({ ...a, sms_test_otp_valid_until: '2026-11-19T10:00:00Z' }) }), ['auth'], { PRODUCTION_TEST_OTP: TEST_OTP });
  assert.equal(seconds.code, 0, seconds.log.join('\n'));
  assert.equal(seconds.log.some((l) => l.startsWith('::warning::')), false);
  const { testUntil } = authWanted({ ...SECRETS, PRODUCTION_TEST_OTP: TEST_OTP }, Date.parse('2026-11-12T10:00:00.789Z'));
  assert.equal(testUntil, '2026-11-19T10:00:00.000Z', 'whole seconds');

  const other = await cmd(world({ authRead: (a) => ({ ...a, sms_test_otp_valid_until: '2026-12-31T00:00:00Z' }) }), ['auth'], { PRODUCTION_TEST_OTP: TEST_OTP });
  assert.equal(other.code, 1);
  assert.equal(other.outputs().reason, 'These sign-in settings did not take: sms_test_otp_valid_until.');

  const absent = await cmd(
    world({ authRead: ({ sms_test_otp_valid_until: _until, ...a }) => a }),
    ['auth'],
    { PRODUCTION_TEST_OTP: TEST_OTP }
  );
  assert.equal(absent.code, 0, absent.log.join('\n'));
  assert.ok(absent.log.includes("::warning::The sign-in settings answer holds no sms_test_otp_valid_until, so the test number's 7-day end is unverified."));
  assert.equal(absent.outputs().note, 'phone sign-in through Twilio Verify; email sign-in off; one test sign-in number until 2026-11-19 (end date unverified)');
  // Without a test number there is no end date to compare and no warning.
  const none = await cmd(world({ authRead: ({ sms_test_otp_valid_until: _until, ...a }) => a }), ['auth']);
  assert.equal(none.code, 0);
  assert.equal(none.log.some((l) => l.startsWith('::warning::')), false);
});

// ---- the admin account (Q-A, F10) ----------------------------------------------------------------

const ADMIN_STEPS =
  'In Supabase, open the production project, then Authentication, Users, and copy the User UID of your own account. In GitHub, open Settings, Environments, production, and save it as the secret PRODUCTION_ADMIN_USER_ID. Then press the button again.';
const profile = (over = {}) => ({ id: ADMIN_ID, is_admin: false, banned: false, deleted_at: null, ...over });
const adminWorld = (row) => world({ profiles: new Map(row ? [[row.id, row]] : []) });
const patches = (w) => w.timeline.filter((e) => e.kind === 'request' && e.method === 'PATCH' && e.url.includes('/rest/v1/profiles'));

test('admin: not set changes nothing; an active account becomes admin once; pressing again says done and changes nothing', async () => {
  const unset = adminWorld(profile());
  const skipped = await cmd(unset, ['admin']);
  assert.equal(skipped.code, 0);
  assert.equal(skipped.outputs().note, 'PRODUCTION_ADMIN_USER_ID not set: no change');
  assert.deepEqual(unset.timeline.filter((e) => e.kind === 'request'), []);

  const w = adminWorld(profile());
  const done = await cmd(w, ['admin'], { PRODUCTION_ADMIN_USER_ID: ` ${ADMIN_ID.toUpperCase()} ` });
  assert.equal(done.code, 0, done.log.join('\n'));
  assert.equal(done.outputs().note, 'done: the saved account is an admin');
  assert.equal(w.profiles.get(ADMIN_ID).is_admin, true);
  assert.equal(JSON.parse(patches(w)[0].body).is_admin, true);
  assert.deepEqual(Object.keys(JSON.parse(patches(w)[0].body)), ['is_admin'], 'the step writes is_admin and nothing else');

  const again = await cmd(w, ['admin'], { PRODUCTION_ADMIN_USER_ID: ADMIN_ID });
  assert.equal(again.code, 0);
  assert.equal(again.outputs().note, 'done: the saved account is an admin');
  assert.equal(patches(w).length, 1, 'the second press changed something');

  // The answer was lost after the change: the next press finds an admin and says done.
  const lost = world({ profiles: new Map([[ADMIN_ID, profile()]]), lose: new Set(['admin']) });
  const first = await cmd(lost, ['admin'], { PRODUCTION_ADMIN_USER_ID: ADMIN_ID });
  assert.equal(first.outputs().reason, 'The account saved in PRODUCTION_ADMIN_USER_ID did not become an admin (HTTP 0). Press the button again.');
  assert.equal((await cmd(lost, ['admin'], { PRODUCTION_ADMIN_USER_ID: ADMIN_ID })).outputs().note, 'done: the saved account is an admin');
  // The returned row must be the saved id: an answer naming another account is no proof.
  const elsewhere = world({ profiles: new Map([[ADMIN_ID, profile()]]), adminAnswer: (row) => ({ ...row, id: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d' }) });
  const wrong = await cmd(elsewhere, ['admin'], { PRODUCTION_ADMIN_USER_ID: ADMIN_ID });
  assert.equal(wrong.outputs().reason, 'The account saved in PRODUCTION_ADMIN_USER_ID did not become an admin (HTTP 200). Press the button again.');

  for (const r of [done, again, first]) {
    const printed = [r.log.join('\n'), JSON.stringify(r.outputs()), r.summary()].join('\n').toLowerCase();
    assert.equal(printed.includes(ADMIN_ID), false, 'the id was printed');
  }
  // The step never takes admin away: no request in the script sets it false.
  assert.doesNotMatch(readFileSync(join(ROOT, 'scripts/production-deploy.mjs'), 'utf8'), /is_admin: false/);
});

test('admin (F10): a bad id, no account, a deleted or a banned account stop with the exact clicks and change nothing', async () => {
  const cases = [
    ['not-a-uuid', null, `PRODUCTION_ADMIN_USER_ID is not a user id (36 characters: digits, the letters a to f, and four dashes). ${ADMIN_STEPS}`],
    [ADMIN_ID, null, `No account in the production project has the id saved in PRODUCTION_ADMIN_USER_ID. ${ADMIN_STEPS}`],
    [ADMIN_ID, profile({ deleted_at: '2026-11-01T00:00:00Z' }), `The account saved in PRODUCTION_ADMIN_USER_ID is deleted or banned, so the button does not make it an admin. ${ADMIN_STEPS}`],
    [ADMIN_ID, profile({ banned: true }), `The account saved in PRODUCTION_ADMIN_USER_ID is deleted or banned, so the button does not make it an admin. ${ADMIN_STEPS}`],
    // A deleted account that is still flagged (an old saved id) is refused too, never reported done.
    [ADMIN_ID, profile({ deleted_at: '2026-11-01T00:00:00Z', is_admin: true }), `The account saved in PRODUCTION_ADMIN_USER_ID is deleted or banned, so the button does not make it an admin. ${ADMIN_STEPS}`],
  ];
  for (const [id, row, reason] of cases) {
    const w = adminWorld(row);
    const r = await cmd(w, ['admin'], { PRODUCTION_ADMIN_USER_ID: id });
    assert.equal(r.code, 1, JSON.stringify(row));
    assert.equal(r.outputs().reason, reason);
    assert.deepEqual(patches(w), [], 'a refused account was changed');
    if (row) assert.equal(w.profiles.get(ADMIN_ID).is_admin, row.is_admin);
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

// ---- the Supabase CLI (R6-d) ------------------------------------------------------------------------

/** A gzipped ustar archive of [name, bytes, type] entries, the shape npm pack writes. */
function tgzOf(entries) {
  const blocks = [];
  for (const [name, data, type = '0'] of entries) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    header.write('0000755\0', 100);
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write(type, 156);
    header.write('ustar\0', 257);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const CLI_BIN = Buffer.from('#!/bin/sh\necho 2.116.0\n');
const CLI_GO = Buffer.alloc(700, 7); // more than one block: the walk must step over the padding
const CLI_TGZ = tgzOf([
  ['package/package.json', Buffer.from('{"name":"@supabase/cli-linux-x64"}')],
  ['package/bin/', Buffer.alloc(0), '5'],
  ['PaxHeader/supabase', Buffer.from('30 path=package/bin/supabase\n'), 'x'],
  ['package/bin/supabase', CLI_BIN],
  ['package/bin/supabase-go', CLI_GO],
  ['package/README.md', Buffer.from('readme')],
]);
const CLI_URL = 'https://registry.npmjs.org/@supabase/cli-linux-x64/-/cli-linux-x64-2.116.0.tgz';

/** A folder holding a package-lock.json that pins `tgz` the way npm does. */
function cliLockDir(tgz, over = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'brazos-cli-'));
  const entry = { version: '2.116.0', resolved: CLI_URL, integrity: `sha512-${createHash('sha512').update(tgz).digest('base64')}`, ...over };
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/@supabase/cli-linux-x64': entry } }));
  return dir;
}

test('tarballBin: the regular files under package/bin/ of an npm tarball, and nothing else', () => {
  const files = tarballBin(CLI_TGZ);
  assert.deepEqual(Object.keys(files).sort(), ['supabase', 'supabase-go']);
  assert.ok(Buffer.from(files.supabase).equals(CLI_BIN));
  assert.ok(Buffer.from(files['supabase-go']).equals(CLI_GO));
  assert.deepEqual(tarballBin(tgzOf([['package/bin/.hidden', CLI_BIN], ['package/bin/a/b', CLI_BIN], ['other/bin/supabase', CLI_BIN]])), {});
});

test('cli-fetch: the CLI runs only from bytes whose sha512 matches package-lock.json', async () => {
  const dir = cliLockDir(CLI_TGZ);
  const w = world({ cliTarball: CLI_TGZ });
  const ok = await cmd(w, ['cli-fetch', 'cli'], {}, dir);
  assert.equal(ok.code, 0, ok.log.join('\n'));
  assert.ok(readFileSync(join(dir, 'cli', 'supabase')).equals(CLI_BIN));
  assert.ok(readFileSync(join(dir, 'cli', 'supabase-go')).equals(CLI_GO));
  if (process.platform !== 'win32') assert.equal(statSync(join(dir, 'cli', 'supabase')).mode & 0o777, 0o755);
  assert.deepEqual(w.spawned.map((s) => [s.cmd, s.args]), [[join(dir, 'cli', 'supabase'), ['--version']]]);
  assert.deepEqual(w.timeline.filter((e) => e.kind === 'request').map((e) => e.url), [CLI_URL]);
  assert.equal(ok.outputs().note, 'Supabase CLI 2.116.0, sha512 matches package-lock.json');

  // Other bytes than the lockfile pins: nothing is written and nothing runs.
  const tampered = world({ cliTarball: tgzOf([['package/bin/supabase', Buffer.from('#!/bin/sh\nevil\n')]]) });
  const bad = await cmd(tampered, ['cli-fetch', 'cli'], {}, cliLockDir(CLI_TGZ));
  assert.equal(bad.code, 1);
  assert.equal(
    bad.outputs().reason,
    'The Supabase CLI downloaded from npm does not match the sha512 checksum in package-lock.json, so the CLI was not run and nothing was changed.'
  );
  assert.equal(existsSync(join(bad.io.cwd, 'cli')), false);
  assert.deepEqual(tampered.spawned, []);

  const missing = world({ cliTarball: null });
  const gone = await cmd(missing, ['cli-fetch', 'cli'], {}, cliLockDir(CLI_TGZ));
  assert.equal(gone.code, 1);
  assert.equal(gone.outputs().reason, 'The Supabase CLI could not be downloaded from npm, so the CLI was not run and nothing was changed. Running again is safe.');
  assert.deepEqual(missing.spawned, []);

  for (const over of [{ integrity: 'sha1-abc=' }, { resolved: 'https://example.com/cli.tgz' }, { version: '' }]) {
    const unpinned = world({ cliTarball: CLI_TGZ });
    const r = await cmd(unpinned, ['cli-fetch', 'cli'], {}, cliLockDir(CLI_TGZ, over));
    assert.equal(r.code, 1, JSON.stringify(over));
    assert.equal(
      r.outputs().reason,
      'The Supabase CLI for Linux is not pinned in package-lock.json (an npm registry URL and a sha512 checksum), so the CLI was not run and nothing was changed.'
    );
    assert.deepEqual(unpinned.timeline.filter((e) => e.kind === 'request'), [], 'nothing is downloaded');
  }

  const noBinTgz = tgzOf([['package/package.json', Buffer.from('{}')]]);
  const noBin = await cmd(world({ cliTarball: noBinTgz }), ['cli-fetch', 'cli'], {}, cliLockDir(noBinTgz));
  assert.equal(noBin.code, 1);
  assert.equal(noBin.outputs().reason, 'The Supabase CLI package holds no bin/supabase, so the CLI was not run and nothing was changed.');

  const older = await cmd(world({ cliTarball: CLI_TGZ, cliVersion: '2.115.0' }), ['cli-fetch', 'cli'], {}, cliLockDir(CLI_TGZ));
  assert.equal(older.code, 1);
  assert.equal(older.outputs().reason, 'The Supabase CLI did not report version 2.116.0, so no CLI command reached the project and nothing was changed.');

  const noFolder = await cmd(world({ cliTarball: CLI_TGZ }), ['cli-fetch'], {}, cliLockDir(CLI_TGZ));
  assert.equal(noFolder.code, 1);
  assert.equal(noFolder.outputs().reason, 'cli-fetch needs the folder to put the Supabase CLI in.');
  rmSync(dir, { recursive: true, force: true });
});

test('package-lock.json pins the Linux CLI the button runs: the supabase package’s version, from npm, by sha512', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const entry = lock.packages['node_modules/@supabase/cli-linux-x64'];
  assert.equal(entry.version, lock.packages['node_modules/supabase'].version);
  assert.equal(entry.resolved, `https://registry.npmjs.org/@supabase/cli-linux-x64/-/cli-linux-x64-${entry.version}.tgz`);
  assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
});

test('the table: one row per check, a reason per FAIL, a check that did not run is a FAIL', () => {
  const pass = { outcome: 'success', outputs: {} };
  const all = Object.fromEntries(
    ['guards', 'status', 'keys', 'webhook_plan', 'cli', 'link', 'list', 'plan'].map((id) => [id, id === 'keys' ? { ...pass, outputs: { note: 'server key: secret; legacy keys: no' } } : pass])
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

const ALL_SECRETS = { ...SECRETS, ...FETCHED, GITHUB_TOKEN, ADMIN_ID };

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
  const w = world({ profiles: new Map([[ADMIN_ID, { id: ADMIN_ID, is_admin: false, banned: false, deleted_at: null }]]) });

  const plan = await cmd(w, ['plan', list], {}, dir);
  const code = plan.outputs().plan_code;
  const happy = [
    ['guards'],
    ['status'],
    ['keys'],
    ['webhook-plan'],
    ['plan', list],
    ['check', list],
    ['secrets'],
    ['webhook'],
    ['vault'],
    ['smoke', 'push'],
    ['smoke', 'status'],
    ['smoke', 'webhook'],
    ['webhook-event'],
    ['smoke', 'return'],
    ['timers'],
    ['auth'],
    ['admin'],
    ['fingerprint', fp],
  ];
  for (const argv of happy) {
    const r = await cmd(w, argv, { PLAN_CODE: code, PRODUCTION_ADMIN_USER_ID: ADMIN_ID }, dir);
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
    [world({ endpoints: [{ id: 'we_fake1', url: `${BASE}/functions/v1/stripe-webhook`, status: 'enabled', api_version: 'x', enabled_events: [] }] }), ['webhook-plan']],
    [world({ refuse: new Set(['secret']) }), ['webhook']],
    [world(), ['webhook-event']],
    [world(), ['admin'], { PRODUCTION_ADMIN_USER_ID: ADMIN_ID }],
    [world(), ['admin'], { PRODUCTION_ADMIN_USER_ID: `${ADMIN_ID}0` }],
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
  w.profiles.set(ADMIN_ID, { id: ADMIN_ID, is_admin: false, banned: false, deleted_at: null });
  for (const argv of [['webhook'], ['webhook-event'], ['vault'], ['smoke', 'status'], ['timers'], ['auth'], ['admin']]) {
    assert.equal((await cmd(w, argv, { PRODUCTION_ADMIN_USER_ID: ADMIN_ID })).code, 0, argv.join(' '));
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
    ADMIN_ID: [`${REF}.supabase.co`],
  };
  for (const [name, hosts] of Object.entries(allowed)) {
    const value = SECRETS[name] ?? FETCHED[name] ?? ALL_SECRETS[name];
    for (const e of w.timeline.filter((x) => x.kind === 'request')) {
      if (JSON.stringify(e.headers).includes(value) || e.body.includes(value) || e.url.includes(value)) {
        assert.ok(hosts.includes(new URL(e.url).host), `${name} was sent to ${new URL(e.url).host}`);
      }
    }
  }
});
