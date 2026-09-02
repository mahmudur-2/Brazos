// RUN E2E1 (2026-09-02) — GATE 2 BOX 4'S FLOW FILES ARE FENCED OFFLINE.
//
// The money walk (.maestro/money-walk.yml with .maestro/sign-in.yml) runs on
// EAS Workflows (.eas/workflows/e2e-ios.yml) against a simulator build of the
// e2e-test profile (eas.json). None of that is exercised by `npm run verify`
// — the first green run is the operator's — so what CAN be proven offline is
// pinned here, as strings, the way every other fence in this directory reads
// its subject:
//
//   1. The flow launches the app the profile builds: its appId is the preview
//      bundle identifier, DERIVED from app.config.ts by regex, never retyped.
//   2. No credential shape reaches a flow file (D3): no email-shaped literal,
//      no pk_ / sk_ prefix, no digit run that could be a card or a phone —
//      except the one Stripe test card the walk types on purpose (D8) — and
//      the four MAESTRO_E2E_* names the workflow maps are the ones the flows
//      read.
//   3. The workflow triggers on workflow_dispatch and nothing else (D-10,
//      docs/BRAZOS_TARGET_ARCHITECTURE_v3.md): never push, pull_request,
//      schedule or tag — a metered iOS simulator build per commit is the one
//      unbounded meter.
//   4. The e2e-test profile is a credential-less simulator build in the
//      Beta's shape (D2), so the appId above is the binary the job installs.
//   5. The production ref appears in neither tree.
//
// Files are read as text, CRLF normalised, so the checks read the same on a
// Windows checkout (core.autocrlf) and on the EAS worker.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_REF } from '../scripts/supabase-ref.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const FLOW = '.maestro/money-walk.yml';
const SIGN_IN = '.maestro/sign-in.yml';
const WORKFLOW = '.eas/workflows/e2e-ios.yml';
const STRIPE_TEST_CARD = '4242424242424242';
const MAESTRO_NAMES = [
  'MAESTRO_E2E_CUSTOMER_EMAIL',
  'MAESTRO_E2E_CUSTOMER_PASSWORD',
  'MAESTRO_E2E_WORKER_EMAIL',
  'MAESTRO_E2E_WORKER_PASSWORD',
];

/** Every flow file, in name order — the whole set, not a hand-kept list. */
function maestroFiles() {
  return readdirSync(join(root, '.maestro'))
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => ({ name, text: read(join('.maestro', name)) }));
}

/** Every file under a directory, recursively, as repo-relative paths. */
function filesUnder(rel) {
  const out = [];
  for (const entry of readdirSync(join(root, rel))) {
    const child = join(rel, entry);
    if (statSync(join(root, child)).isDirectory()) out.push(...filesUnder(child));
    else out.push(child);
  }
  return out.sort();
}

/**
 * The preview variant's bundle identifier, from app.config.ts by regex: the
 * template literal that builds every identifier, plus BUNDLE_SUFFIX's
 * `preview` entry — the same two facts tests/appConfig.test.mjs pins.
 */
function previewBundleIdentifier() {
  const source = read('app.config.ts');
  const base = source.match(/bundleIdentifier: `([a-z0-9.]+)\$\{BUNDLE_SUFFIX\[VARIANT\]\}`/);
  assert.ok(base, 'app.config.ts builds bundleIdentifier from BUNDLE_SUFFIX[VARIANT]');
  const block = source.match(/const BUNDLE_SUFFIX: Record<Variant, string> = \{([\s\S]*?)\};/);
  assert.ok(block, 'app.config.ts declares BUNDLE_SUFFIX');
  const suffix = block[1].match(/preview: '([^']*)',/);
  assert.ok(suffix, 'BUNDLE_SUFFIX carries a preview entry');
  return base[1] + suffix[1];
}

/** The `on:` block's own lines — everything indented under it. */
function triggerBlock(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^on:\s*(#.*)?$/.test(line));
  assert.notEqual(start, -1, 'the workflow declares a multi-line `on:` block (never `on: push`)');
  const block = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    block.push(lines[i]);
  }
  return block;
}

test('the money walk exists and launches the variant the e2e-test profile builds', () => {
  const expected = previewBundleIdentifier();
  assert.equal(expected, 'app.brazos.mobile.preview', 'the preview identifier reads as expected');
  for (const rel of [FLOW, SIGN_IN]) {
    assert.ok(existsSync(join(root, rel)), `${rel} exists`);
    const appId = read(rel).match(/^appId:\s*(\S+)\s*$/m);
    assert.ok(appId, `${rel} declares an appId`);
    assert.equal(appId[1], expected, `${rel} launches the preview variant`);
  }
  // The walk really is the subflow's caller: one sign-in path, by file.
  assert.match(read(FLOW), /^\s+file: sign-in\.yml$/m);
});

test('no credential shape reaches a flow file, and the four MAESTRO_E2E names are read', () => {
  const files = maestroFiles();
  assert.ok(files.length >= 2, `only ${files.length} flow files — check the read`);
  for (const { name, text } of files) {
    assert.doesNotMatch(
      text,
      /@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
      `${name} carries an email-shaped literal`
    );
    assert.doesNotMatch(text, /\bpk_/, `${name} carries a publishable-key prefix`);
    assert.doesNotMatch(text, /\bsk_/, `${name} carries a secret-key prefix`);
    for (const run of text.match(/\d{13,}/g) ?? []) {
      assert.equal(
        run,
        STRIPE_TEST_CARD,
        `${name} carries a ${run.length}-digit run that is not the Stripe test card`
      );
    }
  }
  const all = files.map((f) => f.text).join('\n');
  for (const variable of MAESTRO_NAMES) {
    assert.ok(all.includes(`\${${variable}}`), `the flow set reads \${${variable}}`);
  }
  // D8: the test card is typed exactly once, in the money walk.
  assert.equal(read(FLOW).split(STRIPE_TEST_CARD).length - 1, 1);
});

test('the workflow triggers on workflow_dispatch and nothing else (D-10)', () => {
  const block = triggerBlock(read(WORKFLOW));
  assert.ok(
    block.some((line) => /^\s+workflow_dispatch\s*:/.test(line)),
    'workflow_dispatch is the trigger'
  );
  for (const forbidden of ['push', 'pull_request', 'schedule', 'tag', 'tags']) {
    assert.ok(
      !block.some((line) => new RegExp(`^\\s+${forbidden}\\s*:`).test(line)),
      `\`${forbidden}\` must never trigger a metered simulator build`
    );
  }
});

test('the workflow runs the money walk on the simulator build it makes, in the preview environment', () => {
  const text = read(WORKFLOW);
  assert.match(text, /^\s+type: build$/m);
  assert.match(text, /^\s+platform: ios$/m);
  assert.match(text, /^\s+profile: e2e-test$/m);
  assert.match(text, /^\s+type: maestro$/m);
  assert.match(text, /^\s+environment: preview$/m);
  assert.match(text, /^\s+build_id: \$\{\{ needs\.build_ios_simulator\.outputs\.build_id \}\}$/m);
  assert.match(text, /^\s+record_screen: true$/m);
  const flowPath = text.match(/^\s+flow_path: (\S+)$/m);
  assert.ok(flowPath, 'flow_path is declared');
  assert.equal(flowPath[1], FLOW);
  assert.ok(existsSync(join(root, flowPath[1])), `${flowPath[1]} exists`);
  for (const variable of MAESTRO_NAMES) {
    assert.match(
      text,
      new RegExp(`^\\s+${variable}: \\$\\{\\{ env\\.${variable} \\}\\}$`, 'm'),
      `${variable} is mapped from the environment under its own name`
    );
  }
});

test('the e2e-test profile is a credential-less simulator build in the Beta shape (D2)', () => {
  const eas = JSON.parse(read('eas.json'));
  const profile = eas.build['e2e-test'];
  assert.ok(profile, 'eas.json declares e2e-test');
  assert.equal(profile.withoutCredentials, true);
  assert.equal(profile.ios?.simulator, true);
  assert.equal(profile.environment, 'preview');
  assert.equal(profile.distribution, 'internal');
  assert.equal(profile.channel, undefined, 'no update channel: a simulator build never takes an OTA');
  // The Beta's shape: both variant variables say preview, which is what makes
  // the appId the flows launch the binary this profile installs.
  assert.equal(profile.env.APP_VARIANT, 'preview');
  assert.equal(profile.env.EXPO_PUBLIC_APP_VARIANT, 'preview');
});

test('the production ref appears in no flow or workflow file', () => {
  const subjects = [
    ...maestroFiles().map((f) => join('.maestro', f.name)),
    ...filesUnder('.eas'),
  ];
  assert.ok(subjects.length >= 3, `only ${subjects.length} files — check the read`);
  for (const rel of subjects) {
    assert.ok(!read(rel).includes(PRODUCTION_REF), `${rel} names the production ref`);
  }
});
