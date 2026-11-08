import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Both refs come from the one module that defines them, so no project ref is
// ever retyped into a test file.
import { PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';
import { decode } from './pngGeometry.mjs';

// ===========================================================================
// app.config.ts — the four deliberate changes it made to app.json, and the
// one thing it deliberately did NOT change.
//
// app.json was a static file; app.config.ts is a function, because three
// build variants need three bundle identifiers and a static file cannot
// produce them. Everything else was carried across verbatim and is fenced
// where it always was — the plugin usage strings in tests/voiceSearch,
// userInterfaceStyle in tests/themeTokens. THIS file owns only what the move changed on purpose,
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
// reason tests/themeTokens strips its own: the docblock
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
  // nothing reads location in the background (live location sharing, which
  // was foreground-only by decision, left with lean D3b). Asserted BOTH on the
  // resolved object — so a key cannot hide behind a spread or a variable —
  // and on the comment-stripped source, so it cannot be reintroduced under a
  // different key path.
  const infoPlist = resolved.ios.infoPlist;
  assert.equal(infoPlist.UIBackgroundModes, undefined);
  assert.equal(infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription, undefined);
  assert.doesNotMatch(code, /UIBackgroundModes/);
  assert.doesNotMatch(code, /NSLocationAlways/);

  // The two that remain, byte-identical to what app.json carried. Pinned as
  // a whole object so a third key cannot arrive unnoticed either. (Face ID
  // left with hidden chats, lean D3c.)
  assert.deepEqual(infoPlist, {
    ITSAppUsesNonExemptEncryption: false,
    NSPhotoLibraryAddUsageDescription:
      'Brazos saves job and work photos you choose to share to your photo library.',
  });
});

test('every variant suffixes the bundle identifier, and production carries no suffix', () => {
  // What this run can execute: with APP_VARIANT unset the config resolves to
  // development, which must already be suffixed — an unsuffixed dev build
  // overwrites the store build on the device.
  assert.equal(resolved.ios.bundleIdentifier, 'app.brazos.mobile.dev');
  assert.equal(resolved.name, 'BRAZOS Dev');

  // The other two variants are a source claim, because the variant is read at
  // module scope and the module caches. What is asserted is that ONE map
  // supplies the suffix and that the identifier interpolates it.
  assert.match(code, /development: '\.dev',/);
  assert.match(code, /preview: '\.preview',/);
  assert.match(code, /production: '',/);
  assert.match(code, /bundleIdentifier: `app\.brazos\.mobile\$\{BUNDLE_SUFFIX\[VARIANT\]\}`/);
  assert.match(code, /name: DISPLAY_NAME\[VARIANT\],/);
});

test('all three variants point at the one icon that actually exists', () => {
  // Distinct dev and beta icons were specified. The files they named were
  // never exported, and a variant pointed at a missing asset fails the build,
  // so all three resolve to the shipped b-leaf export. What is asserted here
  // is only that the map has not quietly acquired a path to a file that does
  // not exist. Giving dev and beta their own badge stays an operator task.
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

test('no project ref, URL or key is written into the app config', () => {
  // app.config.ts is a BUILD CONFIGURATION FILE, and the rule that eas.json
  // may name no project applies to it for the same reason: a ref committed
  // into build configuration is a ref that ships wherever that configuration
  // is read. The gate's own module is the single place either ref is spelled.
  assert.equal(source.includes(PRODUCTION_REF), false, 'the production ref is in app.config.ts');
  assert.equal(source.includes(STAGING_REF), false, 'the staging ref is in app.config.ts');
  assert.doesNotMatch(source, /supabase\.(co|in)/i);
  assert.doesNotMatch(source, /\beyJ|sb_publishable_|sb_pu_|sb_secret_/);
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

test('iOS only: no android or web block, and no Google map configuration ships', () => {
  // Lean v1 (owner ruling 42): the app ships to iOS only. iOS stays on Apple
  // Maps, so there is no Google map configuration of any kind.
  assert.equal(resolved.android, undefined, 'the android block is back');
  assert.equal(resolved.web, undefined, 'the web block is back');
  assert.equal(resolved.ios.config, undefined);
  assert.doesNotMatch(code, /PROVIDER_GOOGLE/);
  assert.doesNotMatch(code, /googleMaps|GOOGLE_MAPS_API_KEY/);
});

// Moved from tests/pwa.test.mjs (deleted in lean D2 with the web surface): the
// two fences there that guard things iOS still ships.
test('the app icon is the opaque 1024x1024 b-leaf export Apple accepts', () => {
  // B4 — Apple rejects an app icon that carries ANY transparency, so the two
  // properties worth fencing are the ones a re-export silently loses: the
  // 1024x1024 size, and total opacity. The file is PNG colour type 2, so there
  // is no alpha channel and the header settles opacity outright; a re-export
  // back to type 6 (RGBA) fails here even if every sample it writes is opaque.
  assert.equal(resolved.icon, './assets/brand/app-icon-b-leaf.png');
  const appIconBytes = readFileSync(join(root, 'assets/brand/app-icon-b-leaf.png'));
  const appIcon = decode(join(root, 'assets/brand/app-icon-b-leaf.png'));
  assert.deepEqual([appIcon.width, appIcon.height], [1024, 1024]);
  assert.equal(
    appIcon.colourType,
    2,
    `app-icon-b-leaf.png is PNG colour type ${appIcon.colourType}; the shipped export is type 2, which has no alpha channel at all`
  );
  // The one hole a colour type leaves open: a PNG with no alpha channel can
  // still declare a single colour fully transparent through a tRNS chunk.
  // tRNS precedes IDAT, so the walk stops at the first IDAT — and that it
  // REACHED one is asserted, so a walk that fell off the end cannot pass by
  // finding nothing.
  const preImageChunks = [];
  for (let off = 8; off + 8 <= appIconBytes.length; ) {
    const type = appIconBytes.toString('ascii', off + 4, off + 8);
    preImageChunks.push(type);
    if (type === 'IDAT') break;
    off += 12 + appIconBytes.readUInt32BE(off);
  }
  assert.ok(preImageChunks.includes('IDAT'), 'the app icon chunk walk never reached IDAT');
  assert.ok(
    !preImageChunks.includes('tRNS'),
    `app-icon-b-leaf.png declares transparency through tRNS (${preImageChunks.join(', ')}) — Apple rejects it`
  );
  // The corners are where a rounded export regresses, so each is still named.
  for (const [corner, x, y] of [
    ['top-left', 0, 0],
    ['top-right', appIcon.width - 1, 0],
    ['bottom-left', 0, appIcon.height - 1],
    ['bottom-right', appIcon.width - 1, appIcon.height - 1],
  ]) {
    assert.equal(
      appIcon.at(x, y)[3],
      255,
      `app-icon-b-leaf.png: the ${corner} corner is not opaque — Apple rejects it`
    );
  }
});

test('TestFlight and EAS Update configuration remains present', () => {
  const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));

  assert.ok(resolved.extra.eas.projectId);
  assert.ok(resolved.updates.url);
  // `testflight` (staging, Stripe test key) is what `release:testflight`
  // auto-submits; `production` is kept for real money later. Both are store
  // builds that declare a channel and auto-increment the build number.
  for (const name of ['production', 'testflight']) {
    assert.equal(eas.build[name].channel, name);
    assert.equal(eas.build[name].autoIncrement, true);
  }
  assert.deepEqual(Object.keys(eas.submit).sort(), ['production', 'testflight']);
});
