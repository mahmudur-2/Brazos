import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// FIX-RUN B11 (2026-10-03) — a denied permission is never a dead end.
//
// Every request*PermissionsAsync caller's denied branch reaches
// lib/permissionPrompt.ts askOpenSettings() or an Open Settings control of its
// own, and no location error shows the device's raw reason.
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

test('B11 · askOpenSettings offers Settings and opens it only on yes', async () => {
  let js = stripTypeScriptTypes(read('lib/permissionPrompt.ts'), { mode: 'strip' });
  const replacements = [
    ["import { Linking } from 'react-native';", 'const Linking = globalThis.__perm.Linking;'],
    ["import { confirmAsync } from './dialog';", 'const confirmAsync = (...a) => globalThis.__perm.confirm(...a);'],
  ];
  for (const [from, to] of replacements) {
    assert.ok(js.includes(from), `expected the runtime import: ${from}`);
    js = js.replace(from, to);
  }
  const opened = [];
  const asked = [];
  let answer = true;
  globalThis.__perm = {
    Linking: { openSettings: async () => void opened.push(true) },
    confirm: async (options) => {
      asked.push(options);
      return answer;
    },
  };
  const { askOpenSettings, PERMISSION_COPY } = await import(toDataUrl(js));

  assert.equal(await askOpenSettings('camera'), true);
  assert.deepEqual(asked[0], {
    title: 'Camera is off',
    message: 'Camera is off for Brazos. Turn it on in Settings to take a photo.',
    confirmText: 'Open Settings',
    cancelText: 'Not now',
  });
  assert.equal(opened.length, 1);

  answer = false;
  assert.equal(await askOpenSettings('location', 'Custom line.'), false);
  assert.equal(asked[1].message, 'Custom line.');
  assert.equal(opened.length, 1, 'Not now opens nothing');

  assert.deepEqual(Object.keys(PERMISSION_COPY).sort(), ['camera', 'location', 'microphone', 'speech']);
  for (const { message } of Object.values(PERMISSION_COPY)) assert.match(message, /Settings/);
});

test('B11 · every permission request has a way to Settings on denial', () => {
  const camera = [/if \(!permission\.granted\) \{\s*\/\/[^\n]*\n\s*await askOpenSettings\('camera'\);\s*return;/];
  for (const path of ['screens/ChatScreen.tsx', 'screens/ProfileScreen.tsx']) {
    const src = read(path);
    for (const shape of camera) assert.match(src, shape, `${path}: the camera denial offers Settings`);
    assert.doesNotMatch(src, /'Camera access needed'/);
  }

  // Speech: the provider reports the refusal; the mic offers Settings (lean
  // D5 removed the SearchBar mic, so DictationMic is the only one).
  assert.match(read('lib/voiceSearch/provider.ts'), /if \(!\(await ensurePermission\(mod\)\)\) \{\s*handlers\.onDenied\?\.\(\);\s*finish\(\);/);
  assert.match(read('lib/voiceSearch/types.ts'), /onDenied\?: \(\) => void;/);
  for (const path of ['components/DictationMic.tsx']) {
    assert.match(read(path), /onDenied: \(\) => void askOpenSettings\('speech'\),/, `${path} offers Settings`);
  }

  // lib/geolocation.ts reports `denied`; each asking surface turns it into Settings.
  for (const path of ['screens/PostJobScreen.tsx', 'screens/NotificationSettingsScreen.tsx']) {
    assert.match(read(path), /if \(result\.reason === 'denied'\)[\s\S]{0,40}askOpenSettings\('location'/, `${path} offers Settings`);
  }
  const results = read('screens/WorkerResultsScreen.tsx');
  assert.match(results, /\{geoState === 'denied' \? \(\s*<Pressable\s*onPress=\{\(\) => void Linking\.openSettings\(\)\}/);
  assert.match(results, /onPress=\{\(\) => void Linking\.openSettings\(\)\}\s*>\s*\{' '\}Open Settings/);

  // The surface that already had its own control keeps it.
  assert.match(read('components/HotspotMap.tsx'), /Linking\.openSettings\(\)/);
  // Notifications: the denied notice carries the action.
  const notif = read('screens/NotificationSettingsScreen.tsx');
  assert.match(notif, /settings: true,/);
  assert.match(notif, /notice\.settings \? \(\s*<Pressable onPress=\{\(\) => void Linking\.openSettings\(\)\}/);
});

test('B11 · no location error carries the device\'s raw reason', () => {
  const geo = read('lib/geolocation.ts');
  assert.doesNotMatch(geo, /\(\$\{reason\}\)/);
  assert.match(geo, /message: 'Couldn’t find your location\. Check that Location Services are on, or type the area instead\.'/);
  // The raw reason still reaches Sentry.
  assert.match(geo, /Sentry\?\.captureException\(err, \{\s*extra: \{ site: 'geolocation\.resolveCurrentPlace', stage: 'position' \},/);
});
