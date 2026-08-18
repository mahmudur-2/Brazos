import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// ---------------------------------------------------------------------------
// The Appearance setting — wired end to end (commit 2)
// ---------------------------------------------------------------------------

test('[static] Profile → Appearance is typed, registered, and applies through setPreference', async () => {
  const [routes, stacks, profile, screen] = await Promise.all([
    read('lib/navigation.ts'),
    read('navigation/sharedStacks.tsx'),
    read('screens/ProfileScreen.tsx'),
    read('screens/AppearanceScreen.tsx'),
  ]);

  // Typed on the Profile stack, registered once, reachable from a Profile row.
  assert.match(routes, /Appearance: undefined;/);
  assert.match(stacks, /<ProfileStack\.Screen name="Appearance" component=\{AppearanceScreen\} \/>/);
  assert.match(profile, /navigation\.navigate\('Appearance'\)/);

  // The screen offers exactly the three preferences by their labels and
  // indicates the current one; a tap goes through the provider's one
  // mutation path (setPreference persists + repaints + syncs native).
  assert.match(screen, /THEME_PREFERENCES\.map/);
  for (const label of ["system: 'System'", "light: 'Light'", "dark: 'Dark'"]) {
    assert.ok(screen.includes(label), `option label missing: ${label}`);
  }
  assert.match(screen, /const selected = option === preference;/);
  assert.match(screen, /setPreference\(option\)/);
  // Styled from the resolved palette, not the static light snapshot.
  assert.match(screen, /useThemeColors/);
  assert.match(screen, /themedStyles/);
});

// ---------------------------------------------------------------------------
// The permanent hex-literal contract (commit 3 of 4D-4)
//
// Within screens/, components/, ui/, hooks/, navigation/, and modes/, no file
// may contain a raw colour literal — #-hex or rgb(/rgba(/hsl( — because a raw
// literal is invisible to the palette and ships a light artifact into dark
// mode. 'transparent' is fine. Comment-stripped, so prose may NAME a hex.
// (lib/authTheme.ts holds the auth surface's literals and lives outside the
// scanned directories; it is additionally never-modified this run.)
// ---------------------------------------------------------------------------

const stripCommentsForScan = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** File-level allowances, each with its reason on the record. */
const LITERAL_FILE_ALLOWLIST = {
  // The definition layer — the one place palette hex values are supposed to live.
  'ui/tokens.ts': 'the token definition layer',
  // withAlpha's serializer emits rgba() strings; it is how literals are avoided.
  'ui/colorAlpha.ts': 'the rgba() serializer behind withAlpha',
  // LOCKED screens (CLAUDE.md "Locked — never modify"): stay light by operator
  // decision; their literals move when the operator unlocks them.
  'screens/LaunchScreen.tsx': 'LOCKED screen',
  'screens/WelcomeScreen.tsx': 'LOCKED screen',
  'screens/SignInScreen.tsx': 'LOCKED screen',
  'screens/EmailSignInScreen.tsx': 'LOCKED screen',
  'screens/CreateAccountScreen.tsx': 'LOCKED screen',
  'screens/EmailCreateAccountScreen.tsx': 'LOCKED screen',
  'screens/VerifyPhoneScreen.tsx': 'LOCKED screen',
  'screens/SetupScreen.tsx': 'LOCKED screen',
  'screens/LegalGateScreen.tsx': 'LOCKED screen',
  'screens/HomeScreen.tsx': 'LOCKED screen (customer Home, atlas set)',
  'screens/BrowseJobsScreen.tsx': 'LOCKED screen (atlas 48, unmounted)',
  // The mode-transition shimmer core pairs with the baked LIGHT transition
  // PNGs — the 4D-3.5 allowance, unchanged; migrates when the assets do.
  'components/ModeTransitionOverlay.tsx': 'shimmer tint paired with baked light PNGs',
  // Auth surface (stays light this run; lib/authTheme.ts is never-modified,
  // so these cannot move into tokens yet — logged as the authTheme follow-up).
  'components/AuthNotice.tsx': 'auth surface; token home is frozen authTheme',
  'components/CountryPicker.tsx': 'auth surface scrim; token home is frozen authTheme',
};

test('[static] no raw colour literal in screens/, components/, ui/, hooks/, navigation/, modes/', async () => {
  const roots = ['screens', 'components', 'ui', 'hooks', 'navigation', 'modes'];
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const files = [];
  for (const root of roots) {
    const entries = await readdir(join(repoRoot, root), { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(relative(repoRoot, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
    }
  }
  assert.ok(files.length > 100, `scan must enumerate the six directories (saw ${files.length})`);

  const offenders = [];
  for (const path of files) {
    if (LITERAL_FILE_ALLOWLIST[path]) continue;
    // Frozen web implementations are never modified (CLAUDE.md frozen list).
    if (/\.web\.tsx?$/.test(path)) continue;
    const source = stripCommentsForScan(await read(path));
    const hex = source.match(/#[0-9a-fA-F]{3,8}\b/);
    const fn = source.match(/\b(?:rgba?|hsla?)\(/);
    if (hex) offenders.push(`${path}: ${hex[0]}`);
    else if (fn) offenders.push(`${path}: ${fn[0]}`);
  }
  assert.deepEqual(offenders, [], `raw colour literals crept in:\n${offenders.join('\n')}`);
});

// ---------------------------------------------------------------------------
// The map surface (commit 4): Apple Maps tiles follow the in-app theme
// ---------------------------------------------------------------------------

test('[static] MapKit tiles follow the resolved theme; no Google-only style ships', async () => {
  // Comment-stripped: the docblock NAMES customMapStyle to explain its absence.
  const nativeMap = stripCommentsForScan(await read('components/HotspotMap.native.tsx'));
  // No Google provider is configured anywhere, so iOS renders Apple Maps —
  // where customMapStyle is Google-only and inert. It must not ship.
  assert.doesNotMatch(nativeMap, /customMapStyle/);
  assert.doesNotMatch(nativeMap, /PROVIDER_GOOGLE/);
  // react-native-maps 1.20.1 exposes a per-MapView iOS appearance prop; the
  // tiles follow the RESOLVED theme (covers a pinned preference that differs
  // from the OS trait), and the overlays read the same palette.
  assert.match(nativeMap, /userInterfaceStyle=\{isDark \? 'dark' : 'light'\}/);
  assert.match(nativeMap, /useThemeColors/);
});
