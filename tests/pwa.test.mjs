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
  const [nativeIcon, appleIcon, icon192, icon512, webMap, mapScreen, packageJson, appConfig] = await Promise.all([
    readBinary('assets/icon.png'),
    readBinary('public/apple-touch-icon.png'),
    readBinary('public/icon-192.png'),
    readBinary('public/icon-512.png'),
    read('components/HotspotMap.web.tsx'),
    read('screens/MapScreen.tsx'),
    read('package.json'),
    read('app.json'),
  ]);

  // Still 1024x1024, and still shipped — as the ANDROID adaptive foreground
  // pinned below. It is no longer expo.icon; see the flat icon just after.
  assert.deepEqual([nativeIcon.readUInt32BE(16), nativeIcon.readUInt32BE(20)], [1024, 1024]);
  assert.deepEqual([appleIcon.readUInt32BE(16), appleIcon.readUInt32BE(20)], [180, 180]);
  assert.deepEqual([icon192.readUInt32BE(16), icon192.readUInt32BE(20)], [192, 192]);
  assert.deepEqual([icon512.readUInt32BE(16), icon512.readUInt32BE(20)], [512, 512]);
  assert.equal(JSON.parse(appConfig).expo.icon, './assets/brand/app-icon-flat.png');
  assert.equal(
    JSON.parse(appConfig).expo.android.adaptiveIcon.foregroundImage,
    './assets/icon.png'
  );

  // B3 — THE APP ICON IS THE FLAT EXPORT, AND FLAT IS THE POINT.
  //
  // expo.icon moved off assets/icon.png to assets/brand/app-icon-flat.png.
  // Apple rejects an app icon that carries ANY transparency, so the two
  // properties worth fencing are the ones a re-export silently loses: the
  // 1024x1024 size, and total opacity.
  //
  // Colour type cannot answer the second one. This file is RGBA (PNG colour
  // type 6), so an alpha channel EXISTS and is merely pinned at 255 in all
  // 1048576 samples — exactly the trap the roster sweep in
  // tests/themeResolution.test.mjs documents. So the samples are read for
  // real, through the shared decoder in ./pngGeometry.mjs rather than a
  // second copy of the PNG filter loop.
  //
  // Not on that roster, deliberately: it scans screens/components/ui for
  // `require` of a raster, and this icon is mounted by app.json, not by a
  // require — adding it there would fail the roster's added-or-removed
  // assertion. app.json's icon keys are fenced HERE, so its measurement is
  // here too. assets/brand/app-icon-v2.png stays on that roster and stays
  // cut-out: it is the LaunchScreen mark, which is a different job.
  const appIcon = decode(join(root, 'assets/brand/app-icon-flat.png'));
  assert.deepEqual([appIcon.width, appIcon.height], [1024, 1024]);
  // The corners are where a rounded export regresses, so each is named.
  for (const [corner, x, y] of [
    ['top-left', 0, 0],
    ['top-right', appIcon.width - 1, 0],
    ['bottom-left', 0, appIcon.height - 1],
    ['bottom-right', appIcon.width - 1, appIcon.height - 1],
  ]) {
    assert.equal(
      appIcon.at(x, y)[3],
      255,
      `app-icon-flat.png: the ${corner} corner is not opaque — Apple rejects it`
    );
  }
  // ...and the flattening is total, not merely true at the four corners.
  let softest = 255;
  for (let i = appIcon.bpp - 1; i < appIcon.pixels.length; i += appIcon.bpp) {
    if (appIcon.pixels[i] < softest) softest = appIcon.pixels[i];
  }
  assert.equal(softest, 255, `app-icon-flat.png carries alpha down to ${softest}`);
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
