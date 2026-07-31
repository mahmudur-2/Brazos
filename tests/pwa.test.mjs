import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('web build is installable and receives hosted runtime configuration', async () => {
  const [appConfig, manifest, html, webSupabase, worker] = await Promise.all([
    read('app.json'),
    read('public/manifest.json'),
    read('public/index.html'),
    read('lib/supabase.web.ts'),
    read('hosting/sites-worker.js'),
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
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(webSupabase, /__BRAZOS_CONFIG__/);
  assert.match(worker, /url\.pathname === '\/config\.js'/);
  assert.match(worker, /env\.ASSETS\.fetch/);
  assert.doesNotMatch(worker, /service_role/i);
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
