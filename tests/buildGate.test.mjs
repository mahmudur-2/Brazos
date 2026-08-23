import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_REF,
  evaluateGate,
  parseEnvText,
} from '../scripts/eas-build-pre-install.mjs';

// The EAS build gate, exercised the way EAS runs it: spawned as a process
// with an injected environment, asserting exit code plus the named reason.
// Offline by construction — the gate only string-parses; nothing connects
// anywhere. Refs come from the gate's own EXPECTED_REF map so no project ref
// is duplicated into this file.

const GATE = fileURLToPath(new URL('../scripts/eas-build-pre-install.mjs', import.meta.url));

const STAGING = EXPECTED_REF.development;
const PRODUCTION = EXPECTED_REF.production;

// A legacy-shaped Supabase key is a JWT whose payload carries { ref }. The
// header must be real base64 JSON so the fixture starts with eyJ like every
// actual legacy key — the gate classifies key format by that prefix.
const jwtFor = (ref) =>
  `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64')}.${Buffer.from(
    JSON.stringify({ ref })
  ).toString('base64')}.signature`;
const urlFor = (ref) => `https://${ref}.supabase.co`;

const stagingEnv = () => ({
  SUPABASE_URL: urlFor(STAGING),
  SUPABASE_KEY: jwtFor(STAGING),
});
const productionEnv = () => ({
  SUPABASE_URL: urlFor(PRODUCTION),
  SUPABASE_KEY: jwtFor(PRODUCTION),
});

// Spawn the gate in a throwaway directory (so the developer's real .env can
// never leak into a row) with only the injected variables under test.
function runGate(env, { envFileText } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'brazos-build-gate-'));
  try {
    if (envFileText !== undefined) {
      writeFileSync(path.join(dir, '.env'), envFileText);
    }
    const base = { ...process.env };
    for (const key of ['EAS_BUILD_PROFILE', 'SUPABASE_URL', 'SUPABASE_KEY', 'APP_ENV', 'BABEL_ENV', 'NODE_ENV']) {
      delete base[key];
    }
    return spawnSync(process.execPath, [GATE], {
      cwd: dir,
      env: { ...base, ...env },
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertFailure(result, ...reasonSubstrings) {
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, `expected a one-line reason, got:\n${result.stderr}`);
  assert.match(lines[0], /^BUILD GATE FAILED: /);
  for (const substring of reasonSubstrings) {
    assert.ok(
      lines[0].includes(substring),
      `reason line missing "${substring}":\n${lines[0]}`
    );
  }
}

test('development profile with staging env passes', () => {
  const result = runGate({ EAS_BUILD_PROFILE: 'development', ...stagingEnv() });
  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.match(result.stdout, /gate: OK — "development" builds against /);
  assert.ok(result.stdout.includes(STAGING));
  // Refs only — the gate must never print a URL or key value.
  assert.ok(!result.stdout.includes('https://'), 'gate printed a URL');
  assert.ok(!result.stdout.includes('signature'), 'gate printed a key');
});

test('development profile with production env fails closed', () => {
  const result = runGate({ EAS_BUILD_PROFILE: 'development', ...productionEnv() });
  assertFailure(result, `resolves to ${PRODUCTION}, expected ${STAGING}`);
});

test('testflight profile with staging env fails closed', () => {
  const result = runGate({ EAS_BUILD_PROFILE: 'testflight', ...stagingEnv() });
  assertFailure(result, `resolves to ${STAGING}, expected ${PRODUCTION}`);
});

test('missing SUPABASE_URL fails closed', () => {
  const result = runGate({ EAS_BUILD_PROFILE: 'development', SUPABASE_KEY: jwtFor(STAGING) });
  assertFailure(result, 'SUPABASE_URL is absent');
});

test('URL and key disagreeing on the project ref fails closed, naming both', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    SUPABASE_URL: urlFor(STAGING),
    SUPABASE_KEY: jwtFor(PRODUCTION),
  });
  assertFailure(result, 'project refs disagree', STAGING, PRODUCTION);
});

test('unknown profile fails closed', () => {
  const result = runGate({ EAS_BUILD_PROFILE: 'qa', ...stagingEnv() });
  assertFailure(result, 'unknown profile "qa"');
});

test('unset EAS_BUILD_PROFILE fails closed as not an EAS build', () => {
  const result = runGate(stagingEnv());
  assertFailure(result, 'not an EAS build');
});

test('a visible .env file disagreeing with the build env fails closed', () => {
  // The local-runner case: process.env says staging, but a .env in the build
  // directory points elsewhere. react-native-dotenv would let process.env
  // win, and the gate still refuses — every source the bundler could see
  // must agree.
  const result = runGate(
    { EAS_BUILD_PROFILE: 'development', ...stagingEnv() },
    { envFileText: `SUPABASE_URL=${urlFor(PRODUCTION)}\nSUPABASE_KEY=${jwtFor(PRODUCTION)}\n` }
  );
  assertFailure(result, '.env:SUPABASE_URL', 'project refs disagree');
});

test('a new-format publishable key with the matching URL passes — the URL ref is authoritative', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    SUPABASE_URL: urlFor(STAGING),
    SUPABASE_KEY: 'sb_publishable_abc123',
  });
  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.match(result.stdout, /gate: OK — "development" builds against /);
  assert.match(result.stdout, /new-format publishable key/);
  assert.match(result.stdout, /live control probe/);
  // Refs only — the key value itself is never printed.
  assert.ok(!result.stdout.includes('sb_publishable_abc123'), 'gate printed the key');
});

test('a publishable key cannot rescue a wrong-project URL — the URL check still fails closed', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    SUPABASE_URL: urlFor(PRODUCTION),
    SUPABASE_KEY: 'sb_publishable_abc123',
  });
  assertFailure(result, `resolves to ${PRODUCTION}, expected ${STAGING}`);
});

test('a key in neither format fails closed — sb_secret_ never ships in a client bundle', () => {
  for (const key of ['sb_secret_abc123', 'not-a-key-at-all']) {
    const result = runGate({
      EAS_BUILD_PROFILE: 'development',
      SUPABASE_URL: urlFor(STAGING),
      SUPABASE_KEY: key,
    });
    assertFailure(result, 'env:SUPABASE_KEY is neither a legacy');
  }
});

test('every profile in the expected-ref map is one of the four known profiles', () => {
  assert.deepEqual(
    Object.keys(EXPECTED_REF).sort(),
    ['development', 'preview', 'production', 'testflight']
  );
  assert.equal(EXPECTED_REF.preview, STAGING);
  assert.equal(EXPECTED_REF.testflight, PRODUCTION);
});

test('parseEnvText handles quotes, export prefixes, comments and CRLF', () => {
  const vars = parseEnvText(
    '# comment\r\nexport SUPABASE_URL="https://example.supabase.co"\r\n' +
      "SUPABASE_KEY='abc.def.ghi'\r\nPLAIN=value # trailing comment\r\nnot a pair\r\n"
  );
  assert.equal(vars.SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(vars.SUPABASE_KEY, 'abc.def.ghi');
  assert.equal(vars.PLAIN, 'value');
  assert.equal(Object.keys(vars).length, 3);
});

test('evaluateGate treats inherited-member profile names as unknown', () => {
  const verdict = evaluateGate({ EAS_BUILD_PROFILE: 'toString', ...stagingEnv() });
  assert.equal(verdict.ok, false);
  assert.match(verdict.problems[0], /unknown profile/);
});

// The `share` build profile: a standalone binary a registered tester installs
// from a link — no dev client and no Metro, so `developmentClient` must be
// ABSENT rather than false, because EAS reads whether the key is present, not
// what it is set to. The channel is `internal` and deliberately not `preview`:
// `testflight` owns `preview`, and a shared channel would let a TestFlight
// update land on a tester build and a tester update land on TestFlight.
test('the share profile is a standalone staging build on its own channel', () => {
  const configPath = fileURLToPath(new URL('../eas.json', import.meta.url));
  const text = readFileSync(configPath, 'utf8');
  const eas = JSON.parse(text);
  const share = eas.build.share;

  assert.ok(share, 'eas.json declares a share build profile');
  assert.equal(share.distribution, 'internal');
  assert.equal(share.autoIncrement, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(share, 'developmentClient'),
    false,
    'developmentClient must be absent, not false'
  );

  // The env block is the development profile's, copied verbatim: same staging
  // project, same anon key, so a tester build can never reach production.
  assert.equal(share.env.SUPABASE_URL, urlFor(STAGING));
  assert.deepEqual(share.env, eas.build.development.env);
  assert.equal(text.includes(PRODUCTION), false, 'no production ref in eas.json');

  // No two build profiles may share an update channel.
  assert.equal(share.channel, 'internal');
  const channels = Object.values(eas.build)
    .map((profile) => profile.channel)
    .filter((channel) => channel !== undefined);
  assert.equal(new Set(channels).size, channels.length);

  // Everything share does not touch, pinned by shape.
  assert.deepEqual(Object.keys(eas.build).sort(), [
    'development',
    'production',
    'share',
    'testflight',
  ]);
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.distribution, 'internal');
  assert.equal(eas.build.development.channel, undefined);
  assert.deepEqual(eas.build.testflight, {
    channel: 'preview',
    environment: 'preview',
    autoIncrement: true,
  });
  assert.deepEqual(eas.build.production, {
    channel: 'production',
    environment: 'production',
  });
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.deepEqual(Object.keys(eas.submit), ['testflight']);
});
