import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ===========================================================================
// app.config.ts — the four deliberate changes it made to app.json, and the
// one thing it deliberately did NOT change.
//
// app.json was a static file; app.config.ts is a function, because three
// build variants need three bundle identifiers and a static file cannot
// produce them. Everything else was carried across verbatim and is fenced
// where it always was — the plugin usage strings in tests/voiceSearch, the
// icon geometry and the web block in tests/pwa, userInterfaceStyle in
// tests/themeTokens. THIS file owns only what the move changed on purpose,
// so that each of those four changes has to be re-decided rather than
// re-typed if a later run wants it back.
//
// HOW IT IS READ. The module is dynamic-imported with no transpiler — the
// same thing tests/sandboxCheckout.test.mjs already does to a .ts module —
// and its default export is called ONCE with an empty context. The variant
// is read at module scope and the module cache is per-URL, so calling it
// again with a different APP_VARIANT would return the first answer; the
// per-variant claims are therefore made against the SOURCE, which is honest
// about what it can and cannot see.
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'app.config.ts'), 'utf8');

// Comments are stripped for the two absence sweeps below, and for the same
// reason tests/themeTokens and tests/liveLocation strip theirs: the docblock
// NAMES the keys that were removed, because a removal with no recorded reason
// is a removal a later run undoes. A raw-text sweep would go red on the prose
// explaining why it is red, which punishes writing the decision down.
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const resolved = (
  await import(pathToFileURL(join(root, 'app.config.ts')).href)
).default({ config: {} });

test('the OTA runtime version is the app version, not a fingerprint', () => {
  // A fingerprint is recomputed from the entire native dependency graph, so
  // an unrelated bump silently orphans every installed binary from its update
  // channel — the update publishes, and nothing downloads it, with no error
  // anywhere. `appVersion` ties compatibility to a string a human can read.
  assert.deepEqual(resolved.runtimeVersion, { policy: 'appVersion' });
  assert.doesNotMatch(code, /fingerprint/, 'the fingerprint policy must not come back');
});

test('iOS declares no tablet support', () => {
  // Declaring it obliges every screen to work at iPad geometry, and App
  // Review checks. There is no tablet layout in this app.
  assert.equal(resolved.ios.supportsTablet, false);
});

test('no background mode and no Always-location permission survive anywhere', () => {
  // These two were one request, and they are refused rather than pending:
  // live location sharing ships foreground-only by decision (the reasoning is
  // recorded on LIVE_LOCATION in lib/featureFlags.ts). Asserted BOTH on the
  // resolved object — so a key cannot hide behind a spread or a variable —
  // and on the comment-stripped source, so it cannot be reintroduced under a
  // different key path.
  const infoPlist = resolved.ios.infoPlist;
  assert.equal(infoPlist.UIBackgroundModes, undefined);
  assert.equal(infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription, undefined);
  assert.doesNotMatch(code, /UIBackgroundModes/);
  assert.doesNotMatch(code, /NSLocationAlways/);

  // The three that remain, byte-identical to what app.json carried. Pinned as
  // a whole object so a fourth key cannot arrive unnoticed either.
  assert.deepEqual(infoPlist, {
    ITSAppUsesNonExemptEncryption: false,
    NSPhotoLibraryAddUsageDescription:
      'Brazos saves job and work photos you choose to share to your photo library.',
    NSFaceIDUsageDescription: 'Unlock hidden chats with Face ID.',
  });
});

test('every variant suffixes BOTH identifiers, and production carries no suffix', () => {
  // The resolved pair is what this run can execute: with APP_VARIANT unset the
  // config resolves to development, which must already be suffixed — an
  // unsuffixed dev build overwrites the store build on the device.
  assert.equal(resolved.ios.bundleIdentifier, 'app.brazos.mobile.dev');
  assert.equal(resolved.android.package, 'com.brazos.app.dev');
  assert.equal(resolved.name, 'BRAZOS Dev');

  // The other two variants are a source claim, because the variant is read at
  // module scope and the module caches. What is asserted is that ONE map
  // supplies the suffix and that BOTH identifiers interpolate it — the failure
  // this guards against is suffixing iOS and forgetting Android, which reads
  // as working until two Android builds collide on one device.
  assert.match(code, /development: '\.dev',/);
  assert.match(code, /preview: '\.preview',/);
  assert.match(code, /production: '',/);
  assert.match(code, /bundleIdentifier: `app\.brazos\.mobile\$\{BUNDLE_SUFFIX\[VARIANT\]\}`/);
  assert.match(code, /package: `com\.brazos\.app\$\{BUNDLE_SUFFIX\[VARIANT\]\}`/);
  assert.match(code, /name: DISPLAY_NAME\[VARIANT\],/);
});

test('all three variants point at the one icon that actually exists', () => {
  // Distinct dev and beta icons were specified. The files they named were
  // never exported, and a variant pointed at a missing asset fails the build,
  // so all three resolve to the shipped b-leaf export. Its size, colour type
  // and opacity are measured in tests/pwa.test.mjs; what is asserted here is
  // only that the map has not quietly acquired a path to a file that does not
  // exist. Giving dev and beta their own badge stays an operator task.
  const ICON = './assets/brand/app-icon-b-leaf.png';
  assert.equal(resolved.icon, ICON);

  const map = code.slice(code.indexOf('const ICON'), code.indexOf('export default'));
  assert.ok(map.includes('const ICON'), 'the ICON map is gone');
  const paths = [...map.matchAll(/'(\.\/assets\/[^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(paths, [ICON, ICON, ICON], 'all three variants must name the same icon');

  // Raw source, comments included: a commented-out path is a line waiting to
  // be uncommented back into a broken build.
  assert.doesNotMatch(source, /app-icon-dev/);
  assert.doesNotMatch(source, /app-icon-beta/);
});

test('the config imports nothing at runtime, so it can never throw on a build machine', () => {
  // THE REASON app.config.ts MUST NOT IMPORT config/env.ts. That module
  // validates the environment at import time and throws on a malformed one,
  // and this file is evaluated by `expo start`, `expo export` and every EAS
  // build — a throw here breaks all three before anything can report why.
  // `import type` is erased, so the only import in the file must be one.
  const imports = [...source.matchAll(/^import\s+(type\s+)?/gm)];
  assert.ok(imports.length > 0, 'the file has no imports at all — check the scan');
  for (const match of imports) {
    assert.ok(match[1], `app.config.ts has a VALUE import: ${match[0].trim()}`);
  }
  assert.doesNotMatch(code, /config\/env/);
  assert.doesNotMatch(code, /require\(/);
});

test('the Android map key is read from the environment and is never a literal', () => {
  // Android only: iOS stays on Apple Maps, so there is no iOS counterpart and
  // there must not be one. An unset variable resolves to undefined, which is a
  // blank Android map rather than a failed build — an accepted outcome until
  // the key is created.
  assert.match(code, /apiKey: process\.env\.GOOGLE_MAPS_API_KEY,/);
  assert.equal(
    resolved.android.config.googleMaps.apiKey,
    process.env.GOOGLE_MAPS_API_KEY,
    'the key must come from the environment, never from a literal in the file'
  );
  assert.doesNotMatch(code, /PROVIDER_GOOGLE/);

  // iOS has no Google map configuration of any kind. Asserted structurally on
  // the resolved object, and positionally on the source: `googleMaps` occurs
  // exactly once, and that occurrence sits inside the android block rather
  // than the ios one.
  assert.equal(resolved.ios.config, undefined);
  const occurrences = [...code.matchAll(/googleMaps/g)];
  assert.equal(occurrences.length, 1, 'googleMaps must be configured in exactly one place');
  const iosAt = code.indexOf('\n  ios: {');
  const androidAt = code.indexOf('\n  android: {');
  const webAt = code.indexOf('\n  web: {');
  assert.ok(iosAt > -1 && androidAt > iosAt && webAt > androidAt, 'the block layout moved');
  assert.ok(
    occurrences[0].index > androidAt && occurrences[0].index < webAt,
    'googleMaps is configured outside the android block'
  );
});
