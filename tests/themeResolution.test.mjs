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
  const [routes, stacks, hub, accountSafety, screen] = await Promise.all([
    read('lib/navigation.ts'),
    read('navigation/sharedStacks.tsx'),
    read('screens/ProfileScreen.tsx'),
    read('screens/AccountSafetyScreen.tsx'),
    read('screens/AppearanceScreen.tsx'),
  ]);

  // Typed on the Profile stack, registered once, reachable from a Profile row.
  // Since the golden-master split (decision 10) that row is on the account &
  // safety page, which the hub's "Account" chip opens.
  assert.match(routes, /Appearance: undefined;/);
  assert.match(stacks, /<ProfileStack\.Screen name="Appearance" component=\{AppearanceScreen\} \/>/);
  assert.match(hub, /navigation\.navigate\('AccountSafety'\)/);
  assert.match(accountSafety, /navigation\.navigate\('Appearance'\)/);

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
  // Welcome, Create account and Email create account are golden masters 2, 3
  // and 4: converted to useThemeColors, so they hold no literals and need no
  // allowance. Every other auth screen has no master and stays as it is.
  'screens/SignInScreen.tsx': 'LOCKED screen',
  'screens/EmailSignInScreen.tsx': 'LOCKED screen',
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
// Manifest Appendix C — "Dark-only baked artwork renders only under the dark
// palette; light keeps current arrangements."
//
// A raster with no alpha channel has its background BAKED IN: mount it under
// the wrong palette and the user gets a rectangle of the other theme's ground.
// The rule was being kept by hand on two screens and by nothing at all
// tree-wide, so a fourth asset could be added tomorrow with no gate and
// nothing would say so. The roster below is the whole inventory — every
// raster the app `require`s — with what each one's background actually is.
//
// The `bake: 'opaque-dark'` and `'opaque-brand'` claims are RE-DERIVED here
// from each PNG's IHDR colour type (2 = RGB, i.e. no alpha channel exists at
// all), so the roster cannot rot into a stale comment. The 'transparent'
// entries were measured by decoding corner alpha during the dark device pass;
// that decode is not repeated here, and those assets need no gate either way.
// ---------------------------------------------------------------------------

const BAKED_ART = {
  // Master 44's hero crop and its gold-B drape: a dark room and a dark drape.
  'assets/prestige/hero_armchair_customer.png': { bake: 'opaque-dark', gate: true },
  'assets/prestige/brazos_b_drape.png': { bake: 'opaque-dark', gate: true },
  // Master 43's hero crop.
  'assets/prestige/hero_toolbox_worker.png': { bake: 'opaque-dark', gate: true },
  // The Heritage armchair. Opaque, and its bake is the LIGHT ground
  // (#FAF5F1) — the exact inverse hazard, so it carries the same gate.
  'assets/brand/customer-home-chair.png': { bake: 'opaque-light', gate: true },
  // Transparent: no background to leak, so no gate is owed.
  'assets/brand/customer-home-post-mark-hd.png': { bake: 'transparent', gate: false },
  'assets/brand/brazos-b-leaf.png': { bake: 'transparent', gate: false },
  'assets/brand/worker-home-toolbox.png': { bake: 'transparent', gate: false },
  // The app icon: a brand deep-green tile with a gold mark and transparent
  // corners. It is the BRAND's own square, not a palette ground — an icon does
  // not change colour with the theme on any platform — and it is mounted on
  // LaunchScreen, which is locked.
  'assets/brand/app-icon-v2.png': { bake: 'brand-mark', gate: false },
  // The mode-transition sheets are opaque, but their bake is the BRAND deep
  // green with a gold mark — not either palette's ground. They read correctly
  // over a light app and a dark one, and the whole sheet (mark, label, handle,
  // gold line) is the image, so there is nothing to fall back to. Deliberately
  // ungated; see components/ModeTransitionOverlay.tsx.
  'assets/brand/transition-customer.png': { bake: 'opaque-brand', gate: false },
  'assets/brand/transition-worker.png': { bake: 'opaque-brand', gate: false },
};

/** How far back from a mount the palette test may sit and still be its guard. */
const GATE_WINDOW = 240;

test('[static] every raster the app mounts is on the roster', async () => {
  const roots = ['screens', 'components', 'ui'];
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const found = new Map();
  for (const root of roots) {
    const entries = await readdir(join(repoRoot, root), { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      const path = relative(repoRoot, join(entry.parentPath, entry.name)).replace(/\\/g, '/');
      const source = stripCommentsForScan(await read(path));
      for (const hit of source.matchAll(/require\('([^']*\.(?:png|jpe?g|webp|gif))'\)/g)) {
        found.set(hit[1].replace(/^(\.\.\/)+/, ''), path);
      }
    }
  }
  // A new baked asset must be reviewed for its gate, not merged silently.
  assert.deepEqual(
    [...found.keys()].sort(),
    Object.keys(BAKED_ART).sort(),
    'a raster was added or removed — put it on the BAKED_ART roster with its measured bake',
  );
});

test('[static] an asset with no alpha channel really is baked, as the roster claims', async () => {
  for (const [asset, { bake }] of Object.entries(BAKED_ART)) {
    if (!bake.startsWith('opaque-')) continue;
    if (asset === 'assets/brand/customer-home-chair.png') continue; // RGBA but fully opaque
    const bytes = await readFile(new URL(`../${asset}`, import.meta.url));
    // PNG: 8-byte signature, then IHDR — width(4) height(4) depth(1) type(1).
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${asset} is not a PNG`);
    assert.equal(bytes[25], 2, `${asset} must be colour type 2 (RGB, no alpha) for this claim`);
  }
});

test('[static] a baked asset is mounted only behind an isDark decision', async () => {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const gated = Object.entries(BAKED_ART).filter(([, meta]) => meta.gate);
  assert.ok(gated.length >= 4, 'the gated set must not empty out');

  const roots = ['screens', 'components', 'ui'];
  const offenders = [];
  let checked = 0;
  for (const root of roots) {
    const entries = await readdir(join(repoRoot, root), { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      const path = relative(repoRoot, join(entry.parentPath, entry.name)).replace(/\\/g, '/');
      // Comment-stripped, so a docblock that MENTIONS the palette can never
      // stand in for a real gate.
      const source = stripCommentsForScan(await read(path));
      for (const [asset] of gated) {
        const decl = new RegExp(
          `const (\\w+) = require\\('(?:\\.\\./)+${asset.replace(/[.\\/]/g, (c) => '\\' + c)}'\\)`,
        ).exec(source);
        if (!decl) continue;
        const name = decl[1];
        for (const use of source.matchAll(new RegExp(`\\b${name}\\b`, 'g'))) {
          if (use.index <= decl.index + decl[0].length) continue; // the declaration itself
          checked += 1;
          const window = source.slice(Math.max(0, use.index - GATE_WINDOW), use.index);
          if (!window.includes('isDark')) offenders.push(`${path}: ${name} mounted ungated`);
        }
      }
    }
  }
  // The sweep must actually be looking at real mounts.
  assert.ok(checked >= 4, `the gate scan must see the known mounts (saw ${checked})`);
  assert.deepEqual(offenders, [], 'baked artwork must resolve per palette, never unconditionally');
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
