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
  EXPO_PUBLIC_SUPABASE_URL: urlFor(STAGING),
  EXPO_PUBLIC_SUPABASE_KEY: jwtFor(STAGING),
});
const productionEnv = () => ({
  EXPO_PUBLIC_SUPABASE_URL: urlFor(PRODUCTION),
  EXPO_PUBLIC_SUPABASE_KEY: jwtFor(PRODUCTION),
});

// Spawn the gate in a throwaway directory (so the developer's real .env can
// never leak into a row) with only the injected variables under test.
//
// THE DELETION LIST IS PART OF THE FIXTURE, not housekeeping. Every variable
// the gate reads has to be stripped from the inherited environment, or the
// "absent variable" tests below pass because the gate found the developer's
// own value and liked it. R1 renamed both variables, and BOTH NAMES ARE
// STRIPPED: the old ones because a developer's shell still has them, the new
// ones because those are what the gate reads now.
function runGate(env, { envFileText } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'brazos-build-gate-'));
  try {
    if (envFileText !== undefined) {
      writeFileSync(path.join(dir, '.env'), envFileText);
    }
    const base = { ...process.env };
    for (const key of [
      'EAS_BUILD_PROFILE',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_KEY',
      'SUPABASE_URL',
      'SUPABASE_KEY',
      'APP_ENV',
      'BABEL_ENV',
      'NODE_ENV',
    ]) {
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

// The `testflight` profile was deleted in R1: TestFlight is a distribution of
// a production build, not a build kind of its own, so `production` is the
// profile that must refuse staging credentials.
test('production profile with staging env fails closed', () => {
  const result = runGate({ EAS_BUILD_PROFILE: 'production', ...stagingEnv() });
  assertFailure(result, `resolves to ${STAGING}, expected ${PRODUCTION}`);
});

test('missing EXPO_PUBLIC_SUPABASE_URL fails closed', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    EXPO_PUBLIC_SUPABASE_KEY: jwtFor(STAGING),
  });
  assertFailure(result, 'EXPO_PUBLIC_SUPABASE_URL is absent');
});

test('missing EXPO_PUBLIC_SUPABASE_KEY fails closed', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    EXPO_PUBLIC_SUPABASE_URL: urlFor(STAGING),
  });
  assertFailure(result, 'EXPO_PUBLIC_SUPABASE_KEY is absent');
});

// THE OLD NAMES ARE NOT READ ANY MORE, and that has to be proven rather than
// assumed. EXPO_PUBLIC_SUPABASE_URL CONTAINS the substring SUPABASE_URL, so a
// half-finished rename leaves reason strings that still read correctly while
// the gate inspects nothing. A build environment carrying only the pre-R1
// names must fail as absent, not pass by looking at them.
test('the pre-rename variable names are ignored entirely', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    SUPABASE_URL: urlFor(STAGING),
    SUPABASE_KEY: jwtFor(STAGING),
  });
  assertFailure(
    result,
    'EXPO_PUBLIC_SUPABASE_URL is absent',
    'EXPO_PUBLIC_SUPABASE_KEY is absent'
  );
});

test('URL and key disagreeing on the project ref fails closed, naming both', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    EXPO_PUBLIC_SUPABASE_URL: urlFor(STAGING),
    EXPO_PUBLIC_SUPABASE_KEY: jwtFor(PRODUCTION),
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
  // directory points elsewhere. The Expo CLI loads .env files itself and
  // inlines every EXPO_PUBLIC_ value at bundle time, so this is a live path
  // from a developer's own project into a shipped binary — and the gate
  // refuses, because every source the bundler could see must agree.
  const result = runGate(
    { EAS_BUILD_PROFILE: 'development', ...stagingEnv() },
    {
      envFileText:
        `EXPO_PUBLIC_SUPABASE_URL=${urlFor(PRODUCTION)}\n` +
        `EXPO_PUBLIC_SUPABASE_KEY=${jwtFor(PRODUCTION)}\n`,
    }
  );
  assertFailure(result, '.env:EXPO_PUBLIC_SUPABASE_URL', 'project refs disagree');
});

test('a new-format publishable key with the matching URL passes — the URL ref is authoritative', () => {
  const result = runGate({
    EAS_BUILD_PROFILE: 'development',
    EXPO_PUBLIC_SUPABASE_URL: urlFor(STAGING),
    EXPO_PUBLIC_SUPABASE_KEY: 'sb_publishable_abc123',
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
    EXPO_PUBLIC_SUPABASE_URL: urlFor(PRODUCTION),
    EXPO_PUBLIC_SUPABASE_KEY: 'sb_publishable_abc123',
  });
  assertFailure(result, `resolves to ${PRODUCTION}, expected ${STAGING}`);
});

test('a key in neither format fails closed — sb_secret_ never ships in a client bundle', () => {
  for (const key of ['sb_secret_abc123', 'not-a-key-at-all']) {
    const result = runGate({
      EAS_BUILD_PROFILE: 'development',
      EXPO_PUBLIC_SUPABASE_URL: urlFor(STAGING),
      EXPO_PUBLIC_SUPABASE_KEY: key,
    });
    assertFailure(result, 'env:EXPO_PUBLIC_SUPABASE_KEY is neither a legacy');
  }
});

test('every profile in the expected-ref map is one of the four known profiles', () => {
  assert.deepEqual(
    Object.keys(EXPECTED_REF).sort(),
    ['development', 'e2e-test', 'preview', 'production']
  );
  assert.equal(EXPECTED_REF.preview, STAGING);
  assert.equal(EXPECTED_REF['e2e-test'], STAGING);
  assert.equal(EXPECTED_REF.production, PRODUCTION);
  // Only ONE profile may reach the production project. Counted rather than
  // listed, so adding a profile pinned to production has to be deliberate.
  const onProduction = Object.entries(EXPECTED_REF).filter(([, ref]) => ref === PRODUCTION);
  assert.deepEqual(onProduction.map(([name]) => name), ['production']);
});

test('parseEnvText handles quotes, export prefixes, comments and CRLF', () => {
  const vars = parseEnvText(
    '# comment\r\nexport EXPO_PUBLIC_SUPABASE_URL="https://example.supabase.co"\r\n' +
      "EXPO_PUBLIC_SUPABASE_KEY='abc.def.ghi'\r\nPLAIN=value # trailing comment\r\nnot a pair\r\n"
  );
  assert.equal(vars.EXPO_PUBLIC_SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(vars.EXPO_PUBLIC_SUPABASE_KEY, 'abc.def.ghi');
  assert.equal(vars.PLAIN, 'value');
  assert.equal(Object.keys(vars).length, 3);
});

test('evaluateGate treats inherited-member profile names as unknown', () => {
  const verdict = evaluateGate({ EAS_BUILD_PROFILE: 'toString', ...stagingEnv() });
  assert.equal(verdict.ok, false);
  assert.match(verdict.problems[0], /unknown profile/);
});

// The `preview` build profile replaced `share` in R1: the same thing — a
// standalone binary a registered tester installs from a link, no dev client
// and no Metro, so `developmentClient` must be ABSENT rather than false,
// because EAS reads whether the key is present, not what it is set to — under
// the name the rest of the tooling already uses.
//
// ITS CHANNEL IS `preview` AND ITS ENVIRONMENT IS `development`, which reads
// like a mistake and is the opposite of one. The EAS *environment* named
// `preview` holds PRODUCTION credentials; the preview build PROFILE is pinned
// to staging. Naming the matching environment would inject production
// credentials into a staging build. The gate would catch it — that is what
// fail-closed is for — but the build would simply stop, so the pairing below
// is deliberate and must not be "tidied up".
test('the preview profile is a standalone staging build on its own channel', () => {
  const configPath = fileURLToPath(new URL('../eas.json', import.meta.url));
  const text = readFileSync(configPath, 'utf8');
  const eas = JSON.parse(text);
  const preview = eas.build.preview;

  assert.ok(preview, 'eas.json declares a preview build profile');
  assert.equal(preview.distribution, 'internal');
  assert.equal(preview.autoIncrement, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(preview, 'developmentClient'),
    false,
    'developmentClient must be absent, not false'
  );

  // NO CREDENTIAL OF ANY KIND LIVES IN eas.json ANY MORE. The URL and key
  // used to sit inline, which is what let the old fence tie a profile to the
  // gate's pin. They now come from the EAS environment the profile selects, so
  // what is asserted here is the stronger, simpler property: this file names
  // no project, no URL and no key at all — not the production ref, not the
  // staging one, and nothing key-shaped.
  assert.equal(text.includes(PRODUCTION), false, 'no production ref in eas.json');
  assert.equal(text.includes(STAGING), false, 'no staging ref in eas.json');
  assert.doesNotMatch(text, /supabase\.(co|in)/i, 'no Supabase URL may appear in eas.json');
  assert.doesNotMatch(text, /\beyJ|sb_publishable_|sb_pu_|sb_secret_/, 'no key may appear in eas.json');
  assert.doesNotMatch(text, /SUPABASE/i, 'eas.json must not name a Supabase variable at all');

  // An env block alone does not decide what a build reads. EAS resolves the
  // profile's `environment` first and lets that environment's server-side
  // variables override the env block; when the key is ABSENT it does not mean
  // "no environment", it means EAS picks a default one. That is how a tester
  // build once came up holding production credentials. EVERY profile pins one.
  for (const [name, profile] of Object.entries(eas.build)) {
    assert.ok(
      typeof profile.environment === 'string' && profile.environment !== '',
      `${name} must pin an EAS environment: an absent one lets EAS inject server-side variables, which is exactly how production credentials reached a tester build`
    );
  }
  assert.equal(preview.environment, 'development');

  // BOTH variant variables, in every profile, set to the same value. §2.1
  // reads APP_VARIANT at config time and config/env.ts reads
  // EXPO_PUBLIC_APP_VARIANT at runtime; setting only the first leaves
  // isProduction false on a production build. And source-map upload stays off
  // until the auth token exists, or sentry-cli fails the build rather than
  // skipping.
  for (const [name, profile] of Object.entries(eas.build)) {
    assert.ok(profile.env, `${name} declares no env block`);
    assert.equal(
      profile.env.APP_VARIANT,
      profile.env.EXPO_PUBLIC_APP_VARIANT,
      `${name} sets the two variant variables to different values`
    );
    assert.match(profile.env.APP_VARIANT, /^(development|preview|production)$/);
    assert.equal(profile.env.SENTRY_DISABLE_AUTO_UPLOAD, 'true');
  }
  assert.equal(eas.build.production.env.APP_VARIANT, 'production');

  // No two build profiles may share an update channel.
  assert.equal(preview.channel, 'preview');
  const channels = Object.values(eas.build)
    .map((profile) => profile.channel)
    .filter((channel) => channel !== undefined);
  assert.equal(new Set(channels).size, channels.length);

  // Everything preview does not touch, pinned by shape.
  assert.deepEqual(Object.keys(eas.build).sort(), [
    'development',
    'e2e-test',
    'preview',
    'production',
  ]);
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.distribution, 'internal');
  assert.equal(eas.build.development.channel, undefined);
  assert.equal(eas.build.production.channel, 'production');
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.autoIncrement, true);
  // Android is a shipping target: the store build is an app bundle, the two
  // installable ones are APKs.
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.equal(eas.build.development.android.buildType, 'apk');
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.deepEqual(Object.keys(eas.submit), ['production']);
});

// INVARIANT 5, REHOMED AND STRENGTHENED. The old suite proved eas.json and the
// gate could not drift by pinning one profile's inline URL against the gate's
// expected ref for that profile. With no URLs left in eas.json that check has
// no direct successor, so it is replaced by a claim that covers every profile
// at once and in both directions: a profile in eas.json that the gate does not
// know is an UNPINNED build, and a profile the gate pins that eas.json does not
// declare is a rule guarding nothing. Either is a silent hole; both fail here.
test('eas.json and the build gate know exactly the same set of profiles', () => {
  const eas = JSON.parse(readFileSync(fileURLToPath(new URL('../eas.json', import.meta.url)), 'utf8'));
  const declared = Object.keys(eas.build).sort();
  const pinned = Object.keys(EXPECTED_REF).sort();

  assert.deepEqual(
    declared,
    pinned,
    `eas.json declares [${declared}] and the gate pins [${pinned}] — every build profile must be pinned to exactly one project, and the gate must pin nothing that cannot be built`
  );
  // Non-vacuity: two empty sets are also identical.
  assert.ok(declared.length >= 4, `only ${declared.length} profiles — check the read`);
});
