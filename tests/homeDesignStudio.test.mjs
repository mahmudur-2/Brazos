import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Home Design Studio is a web-development wrapper around the existing tabs', async () => {
  const app = await read('App.tsx');

  assert.match(app, /Platform\.OS === 'web'/);
  assert.match(app, /get\('studio'\) === 'home'/);
  assert.match(app, /<HomeDesignStudio>[\s\S]*<MainTabs \/>/);
  assert.doesNotMatch(app, /<Tab\.Screen name="HomeDesignStudio"/);
});

test('Home Design Studio defaults preserve the current Home geometry and controls update real styles', async () => {
  const [settings, studio, home] = await Promise.all([
    read('lib/homeDesignStudio.tsx'),
    read('dev-tools/HomeDesignStudio.tsx'),
    read('screens/HomeScreen.tsx'),
  ]);

  for (const value of [
    // home(23) UPDATED THIS RECORDED FACT from 30 to 31, against the REPLACED
    // master 44 (853x1844, not the 941x1672 home(16) measured). It is not a
    // relaxation: the new file's hero cap converts to 35pt of Georgia — two
    // points MORE than the old one said — and the column the hero artwork
    // leaves caps it at 31, because "off your plate." sets 7.00pt of ink per
    // point of size and the art's ink starts at 244.6pt. The studio's slider
    // still runs 28..56; this is where it starts.
    // The tuning pass took this to 33. The hero art slot moved with it
    // (right -28 -> -33), which widens the column the artwork leaves, and 33
    // is the size the operator approved in that column.
    'heroFontSize: 33',
    'screenPadding: 20',
    'sectionGap: 20',
    // 70 -> 65 in the same pass; searchRadius stays 35 and is no longer half
    // the height, which is deliberate and is why they are two settings.
    'searchHeight: 65',
    'searchRadius: 35',
    'ctaHeight: 48',
    'ctaRadius: 24',
    // 2026-09-17: `jobCardRadius: 20` left this list with the setting. It
    // rounded the Nearby list's card, and Nearby left the customer Home; a
    // setting whose reader is gone moves nothing, so it was deleted rather
    // than left as a slider that lies. Seven settings, not eight.
  ]) {
    assert.match(settings, new RegExp(value));
  }

  for (const label of [
    'Hero font size',
    'Screen padding',
    'Section gap',
    'Search height',
    'Search radius',
    'Post a job CTA height',
    'Post a job CTA radius',
  ]) {
    assert.match(studio, new RegExp(label));
  }
  assert.match(studio, /setSettings\(DEFAULT_HOME_DESIGN_SETTINGS\)/);
  assert.match(studio, /phoneShell/);
  assert.match(studio, /width: 413/);
  assert.match(studio, /height: 872/);
  assert.match(studio, /phoneViewport/);
  assert.match(studio, /MainTabs is the normal application's navigation tree/);
  assert.match(home, /useHomeDesignSettings\(\)/);
  assert.match(home, /design\.heroFontSize/);
  assert.match(home, /design\.screenPadding/);
  assert.match(home, /design\.searchHeight/);
  assert.match(home, /design\.ctaHeight/);
  assert.match(home, /design\.ctaRadius/);
});
