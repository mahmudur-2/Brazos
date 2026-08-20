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
    // home(16) UPDATED THIS RECORDED FACT from 39 to 30. It is not a relaxation:
    // master 44's hero cap height converts to 33pt of Georgia, and the column
    // the hero artwork leaves caps it at 30 — "off your plate." sets 281.6pt at
    // 39 against ~222pt of room, which is what put it on a third line. The
    // studio's slider still runs 28..56; this is where it starts.
    'heroFontSize: 30',
    'screenPadding: 20',
    'sectionGap: 20',
    'searchHeight: 70',
    'searchRadius: 35',
    'ctaHeight: 48',
    'ctaRadius: 24',
    'jobCardRadius: 20',
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
    'Job-card radius',
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
  assert.match(home, /design\.jobCardRadius/);
});
