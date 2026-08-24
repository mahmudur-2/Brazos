import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decode } from './pngGeometry.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readBinary = (path) => readFile(new URL(`../${path}`, import.meta.url));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('web build is installable and receives hosted runtime configuration', async () => {
  const [appConfig, manifest, html, serviceWorker, webSupabase, worker, buildPreparation] = await Promise.all([
    read('app.json'),
    read('public/manifest.json'),
    read('public/index.html'),
    read('public/sw.js'),
    read('lib/supabase.web.ts'),
    read('hosting/sites-worker.js'),
    read('scripts/prepare-sites-build.mjs'),
  ]);

  const app = JSON.parse(appConfig);
  const pwa = JSON.parse(manifest);

  assert.equal(app.expo.web.output, 'single');
  assert.equal(pwa.display, 'standalone');
  assert.equal(pwa.start_url, '/');
  assert.deepEqual(
    pwa.icons.map((icon) => icon.sizes),
    ['192x192', '512x512']
  );
  assert.deepEqual(
    pwa.icons.map((icon) => icon.src),
    ['/icon-192.png?v=4', '/icon-512.png?v=4']
  );
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /apple-touch-icon\.png\?v=4/);
  assert.match(html, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  // Two cache-busting literals, both bumped deliberately in 560ebb4 ("Fix
  // installed PWA viewport inset"): the runtime-config query here and
  // CACHE_NAME in public/sw.js below. public/ is a frozen surface and is the
  // truth — these expectations trailed it, so the test was the defect. The
  // second one was unreachable until the first was corrected.
  assert.match(html, /src="\/config\.js\?v=20260731-2"/);
  assert.match(html, /id="brazos-startup"/);
  assert.match(html, /BRAZOS could not start/);
  assert.doesNotMatch(html, /maplibre/i);
  assert.match(serviceWorker, /brazos-shell-v6/);
  assert.doesNotMatch(serviceWorker, /APP_SHELL = \['\/'/);
  assert.match(webSupabase, /__BRAZOS_CONFIG__/);
  assert.match(worker, /url\.pathname === '\/config\.js'/);
  assert.match(worker, /injectRuntimeConfig/);
  assert.match(worker, /runtimeConfigScript\(env\)/);
  assert.match(worker, /Cache-Control', 'no-store'/);
  assert.match(worker, /env\.ASSETS\.fetch/);
  assert.doesNotMatch(worker, /service_role/i);
  assert.match(buildPreparation, /await rm\(staticConfigPath\)/);
});

test('PWA ships the HD BRAZOS icon and a sharp rotatable privacy-preserving web map', async () => {
  const [nativeIcon, appleIcon, icon192, icon512, appIconBytes, webMap, mapScreen, packageJson, appConfig] =
    await Promise.all([
      readBinary('assets/icon.png'),
      readBinary('public/apple-touch-icon.png'),
      readBinary('public/icon-192.png'),
      readBinary('public/icon-512.png'),
      readBinary('assets/brand/app-icon-b-leaf.png'),
      read('components/HotspotMap.web.tsx'),
      read('screens/MapScreen.tsx'),
      read('package.json'),
      read('app.json'),
    ]);

  // Still 1024x1024, and still shipped — as the ANDROID adaptive foreground
  // pinned below. It is no longer expo.icon; see the b-leaf icon just after.
  assert.deepEqual([nativeIcon.readUInt32BE(16), nativeIcon.readUInt32BE(20)], [1024, 1024]);
  assert.deepEqual([appleIcon.readUInt32BE(16), appleIcon.readUInt32BE(20)], [180, 180]);
  assert.deepEqual([icon192.readUInt32BE(16), icon192.readUInt32BE(20)], [192, 192]);
  assert.deepEqual([icon512.readUInt32BE(16), icon512.readUInt32BE(20)], [512, 512]);
  assert.equal(JSON.parse(appConfig).expo.icon, './assets/brand/app-icon-b-leaf.png');
  assert.equal(
    JSON.parse(appConfig).expo.android.adaptiveIcon.foregroundImage,
    './assets/icon.png'
  );

  // B4 — THE APP ICON IS THE B-LEAF EXPORT, AND TOTAL OPACITY IS STILL THE POINT.
  //
  // expo.icon moved off assets/brand/app-icon-flat.png to
  // assets/brand/app-icon-b-leaf.png. Apple rejects an app icon that carries
  // ANY transparency, so the two properties worth fencing are the ones a
  // re-export silently loses: the 1024x1024 size, and total opacity.
  //
  // The flat export could only answer the second one by reading all 1048576
  // alpha samples, because it was RGBA (PNG colour type 6): the channel
  // EXISTED and was merely pinned at 255 — exactly the trap the roster sweep
  // in tests/themeResolution.test.mjs documents. This file is colour type 2,
  // so there is no alpha channel to sweep and the header settles the question
  // outright. Pinning the colour type is STRICTLY STRONGER than the old
  // sweep, not weaker: a re-export back to type 6 fails here now even if
  // every sample it writes is opaque. The million-sample loop is gone rather
  // than kept for safety, because on a three-byte pixel it would have been
  // stepping over the BLUE channel and calling it alpha.
  //
  // Not on that roster: it scans screens/components/ui for `require` of a
  // raster, and this icon is mounted by app.json, not by a require — adding
  // it there would fail the roster's added-or-removed assertion. app.json's
  // icon keys are fenced HERE, so its measurement is here too.
  // assets/brand/app-icon-v2.png stays on that roster and stays cut-out: it
  // is the LaunchScreen mark, which is a different job.
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
  // `at()` reads through the decoded pixel buffer, so this also proves the
  // image decodes at its extremes, and it reports real alpha rather than a
  // constant 255 the moment the file goes back to carrying a channel.
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
  assert.match(webMap, /new Map\(/);
  assert.match(webMap, /rastertiles\/voyager\/\{z\}\/\{x\}\/\{y\}@2x\.png/);
  assert.match(webMap, /tilePixelRatio: 2/);
  assert.match(webMap, /pinchRotate: true/);
  assert.match(webMap, /pinchZoom: true/);
  assert.match(webMap, /tileloadend/);
  assert.match(webMap, /tileloaderror/);
  assert.match(webMap, /OSM_FALLBACK_URL/);
  assert.match(webMap, /Rotate map/);
  assert.match(webMap, /MapPinIcon size=\{120\}/);
  assert.match(webMap, /requestForegroundPermissionsAsync/);
  assert.match(webMap, /onSelectCellRef\.current\(cell\)/);
  assert.match(webMap, /aggregated cell centers and counts/);
  assert.match(mapScreen, /backgroundColor: colors\.background/);
  // 4D-4: the map SCREEN is themed — chrome reads the resolved palette and
  // the native MapView follows the in-app theme. The WEB map stays frozen
  // and light (HotspotMap.web.tsx above), which is what this suite guards.
  assert.match(mapScreen, /useThemeColors/);
  assert.equal(JSON.parse(packageJson).dependencies.ol, '^10.10.0');
  assert.equal(JSON.parse(packageJson).dependencies['maplibre-gl'], undefined);
  assert.equal(JSON.parse(packageJson).dependencies.leaflet, undefined);
});

test('TestFlight and EAS Update configuration remains present', async () => {
  const [appConfig, easConfig] = await Promise.all([read('app.json'), read('eas.json')]);
  const app = JSON.parse(appConfig);
  const eas = JSON.parse(easConfig);

  assert.ok(app.expo.extra.eas.projectId);
  assert.ok(app.expo.updates.url);
  assert.equal(eas.build.testflight.channel, 'preview');
  assert.equal(eas.build.testflight.autoIncrement, true);
});
