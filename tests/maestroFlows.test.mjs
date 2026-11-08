// RUN E2E1 (2026-09-02) — GATE 2 BOX 4'S FLOW FILES ARE FENCED OFFLINE.
//
// The money walk (.maestro/money-walk.yml with .maestro/sign-in.yml) runs
// against a simulator build of the e2e-test profile (eas.json); its EAS
// workflow left in lean D7. None of that is exercised by `npm run verify`
// — the first green run is the operator's — so what CAN be proven offline is
// pinned here, as strings, the way every other fence in this directory reads
// its subject:
//
//   1. The flow launches the app the profile builds: its appId is the preview
//      bundle identifier, DERIVED from app.config.ts by regex, never retyped.
//   2. No credential shape reaches a flow file (D3): no email-shaped literal,
//      no pk_ / sk_ prefix, no digit run that could be a card or a phone —
//      except the one Stripe test card the walk types on purpose (D8) — and
//      the flows read the four MAESTRO_E2E_* names.
//   3. The e2e-test profile is a credential-less simulator build in the
//      Beta's shape (D2), so the appId above is the binary the job installs.
//   4. The production ref appears in no flow file.
//
// Files are read as text, CRLF normalised, so the checks read the same on a
// Windows checkout (core.autocrlf) and on the EAS worker.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_REF } from '../scripts/supabase-ref.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const FLOW = '.maestro/money-walk.yml';
const SIGN_IN = '.maestro/sign-in.yml';
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

test('the production ref appears in no flow file', () => {
  const subjects = maestroFiles().map((f) => join('.maestro', f.name));
  assert.ok(subjects.length >= 3, `only ${subjects.length} files — check the read`);
  for (const rel of subjects) {
    assert.ok(!read(rel).includes(PRODUCTION_REF), `${rel} names the production ref`);
  }
});
