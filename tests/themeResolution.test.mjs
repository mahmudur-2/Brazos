import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ---------------------------------------------------------------------------
// 4D-4 — Light/Dark/System resolution, executed rather than restated.
//
// lib/themePreference.ts is deliberately import-free (the modes/types.ts
// arrangement) so the resolution truth table and coercion rules run here as
// facts. lib/themePreferenceStorage.ts is executed with AsyncStorage stubbed
// so the persistence round-trip and its fail-safe behavior are facts too.
// The one [static] test is the source contract the sweep relies on: screens
// never import ui/tokens.ts directly (lib/theme.ts is their surface).
// ---------------------------------------------------------------------------

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const prefModule = await import(
  toDataUrl(stripTypeScriptTypes(await read('lib/themePreference.ts'), { mode: 'strip' }))
);

const {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  THEME_PREFERENCE_STORAGE_KEY,
  coerceThemePreference,
  isThemePreference,
  resolveColorScheme,
} = prefModule;

/** lib/themePreferenceStorage.ts, executed with its two imports stubbed: the
 *  pure rules come from the module executed above (so the two cannot drift),
 *  and AsyncStorage delegates to a swappable in-memory shim. */
const storageShim = { impl: null };
globalThis.__THEME_PREFERENCE_MODULE__ = prefModule;
globalThis.__THEME_STORAGE_SHIM__ = {
  getItem: (key) => storageShim.impl.getItem(key),
  setItem: (key, value) => storageShim.impl.setItem(key, value),
};

const storageModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/themePreferenceStorage.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import AsyncStorage from '@react-native-async-storage\/async-storage';/,
      'const AsyncStorage = globalThis.__THEME_STORAGE_SHIM__;',
    )
    .replace(
      /import \{[\s\S]*?\} from '\.\/themePreference';/,
      'const { DEFAULT_THEME_PREFERENCE, THEME_PREFERENCE_STORAGE_KEY, coerceThemePreference } = globalThis.__THEME_PREFERENCE_MODULE__;',
    );
  assert.ok(!stubbed.includes('@react-native-async-storage'), 'AsyncStorage must be stubbed');
  assert.ok(!stubbed.includes("from './themePreference'"), 'themePreference must be stubbed');
  return import(toDataUrl(stubbed));
})();

const memoryStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async setItem(key, value) {
      store.set(key, String(value));
    },
  };
};

const failingStorage = () => ({
  async getItem() {
    throw new Error('storage down');
  },
  async setItem() {
    throw new Error('storage down');
  },
});

// ---------------------------------------------------------------------------
// Resolution — the full truth table, executed
// ---------------------------------------------------------------------------

test('resolution truth table: every preference against both system appearances', () => {
  // preference `system` follows the OS.
  assert.equal(resolveColorScheme('system', 'light'), 'light');
  assert.equal(resolveColorScheme('system', 'dark'), 'dark');
  // a pinned preference wins over either OS answer.
  assert.equal(resolveColorScheme('light', 'light'), 'light');
  assert.equal(resolveColorScheme('light', 'dark'), 'light');
  assert.equal(resolveColorScheme('dark', 'light'), 'dark');
  assert.equal(resolveColorScheme('dark', 'dark'), 'dark');
});

test('an unknown system appearance resolves light, never dark', () => {
  assert.equal(resolveColorScheme('system', null), 'light');
  assert.equal(resolveColorScheme('system', undefined), 'light');
  // and a pinned preference is unaffected by the unknown.
  assert.equal(resolveColorScheme('dark', null), 'dark');
  assert.equal(resolveColorScheme('light', null), 'light');
});

test('anything that is not exactly one of the three literals is not a preference', () => {
  assert.deepEqual([...THEME_PREFERENCES], ['system', 'light', 'dark']);
  assert.equal(DEFAULT_THEME_PREFERENCE, 'system');
  for (const good of THEME_PREFERENCES) {
    assert.equal(isThemePreference(good), true);
    assert.equal(coerceThemePreference(good), good);
  }
  for (const bad of [null, undefined, '', 'Dark', 'LIGHT', 'auto', 'emerald', 0, true, {}]) {
    assert.equal(isThemePreference(bad), false, `${String(bad)} must not be a preference`);
    assert.equal(coerceThemePreference(bad), 'system');
  }
  assert.equal(coerceThemePreference('nonsense', 'dark'), 'dark');
});

// ---------------------------------------------------------------------------
// Persistence — executed round-trip, fail-safe in both directions
// ---------------------------------------------------------------------------

test('the stored preference round-trips through AsyncStorage under a versioned key', async () => {
  const { readThemePreference, writeThemePreference } = await storageModule;
  assert.equal(THEME_PREFERENCE_STORAGE_KEY, 'brazos.themePreference.v1');

  const storage = memoryStorage();
  storageShim.impl = storage;

  for (const pref of THEME_PREFERENCES) {
    await writeThemePreference(pref);
    assert.equal(storage.store.get(THEME_PREFERENCE_STORAGE_KEY), pref);
    assert.equal(await readThemePreference(), pref);
  }
});

test('nothing stored, junk stored, or storage down all read as the default', async () => {
  const { readThemePreference } = await storageModule;

  storageShim.impl = memoryStorage();
  assert.equal(await readThemePreference(), 'system');

  storageShim.impl = memoryStorage({ [THEME_PREFERENCE_STORAGE_KEY]: 'emerald' });
  assert.equal(await readThemePreference(), 'system');

  storageShim.impl = failingStorage();
  assert.equal(await readThemePreference(), 'system');
});

test('a write coerces junk and swallows storage failure rather than throwing', async () => {
  const { writeThemePreference } = await storageModule;

  const storage = memoryStorage();
  storageShim.impl = storage;
  await writeThemePreference('not-a-theme');
  assert.equal(storage.store.get(THEME_PREFERENCE_STORAGE_KEY), 'system');

  storageShim.impl = failingStorage();
  await assert.doesNotReject(() => writeThemePreference('dark'));
});

// ---------------------------------------------------------------------------
// Source contract — screens take tokens from lib/theme.ts, never ui/tokens.ts
// ---------------------------------------------------------------------------

test('[static] no file under screens/ imports ui/tokens.ts directly', async () => {
  const dir = new URL('../screens/', import.meta.url);
  const files = (await readdir(dir)).filter((name) => /\.(ts|tsx)$/.test(name));
  assert.ok(files.length > 40, `screens/ must enumerate (saw ${files.length})`);
  for (const name of files) {
    const source = await read(`screens/${name}`);
    assert.doesNotMatch(
      source,
      /from\s+['"][^'"]*ui\/tokens['"]/,
      `screens/${name} imports ui/tokens directly — lib/theme.ts is the screen surface`,
    );
  }
});
