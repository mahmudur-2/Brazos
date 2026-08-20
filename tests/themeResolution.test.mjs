import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { join, relative } from 'node:path';
import { inflateSync } from 'node:zlib';
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
  // allowance. emerald(5) converted Sign in and Email sign in onto the same
  // path, so THEIR allowances are gone too — the entries that used to sit here
  // were removed rather than kept as dead permissions. Every remaining auth
  // screen has no master and stays as it is.
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

test('[static] the auth flow is one design system, and authTheme stayed frozen', async () => {
  // emerald(5). The dark device pass found Welcome and both Create-account
  // screens rendering dark (masters 2, 3, 4) while both SIGN-IN screens
  // rendered Heritage light one tap away — the same flow in two design
  // systems. They were converted onto the path their siblings already use.
  const [authTheme, signIn, emailSignIn, countryPicker] = await Promise.all([
    read('lib/authTheme.ts'),
    read('screens/SignInScreen.tsx'),
    read('screens/EmailSignInScreen.tsx'),
    read('components/CountryPicker.tsx'),
  ]);

  // 1. THE FROZEN HALF. lib/authTheme.ts did not need a dark branch and did not
  //    get one: it is a flat Heritage constant surface with no notion of a
  //    resolved palette. This is what makes the conversion incapable of moving
  //    a light pixel in any consumer that did not opt in.
  const authThemeCode = stripCommentsForScan(authTheme);
  for (const themeAware of ['isDark', 'useThemeColors', 'ColorPalette', 'palette']) {
    assert.doesNotMatch(
      authThemeCode,
      new RegExp(`\\b${themeAware}\\b`),
      `lib/authTheme.ts must stay theme-blind — a '${themeAware}' in it is a dark branch`
    );
  }

  // 2. THE CONVERTED HALF. Both sign-in screens now resolve their colour the
  //    way their siblings do, and neither reads the frozen constant any more.
  for (const [path, source] of [
    ['screens/SignInScreen.tsx', signIn],
    ['screens/EmailSignInScreen.tsx', emailSignIn],
  ]) {
    assert.match(source, /const \{ palette: colors, isDark \} = useThemeColors\(\);/, path);
    assert.match(source, /const surface = authSurface\(colors, isDark\);/, path);
    assert.match(source, /const stylesFor = themedStyles\(\(colors: ColorPalette\) =>/, path);
    assert.doesNotMatch(
      stripCommentsForScan(source),
      /\bauthColors\b/,
      `${path} must not read the frozen Heritage constant any more`
    );
    // The shared shell and every shared control opt in, or the screen would be
    // dark chrome around light components.
    assert.match(source, /<AuthScaffold[\s\S]{0,200}?themed\s*>/, `${path} scaffold`);
  }

  // 3. CountryPicker — named by the dispatch — is BYTE-IDENTICAL, because
  //    nothing it depends on moved. It still takes no `themed` prop and still
  //    resolves every colour from the frozen constant, so its light rendering
  //    cannot have changed.
  const pickerCode = stripCommentsForScan(countryPicker);
  assert.doesNotMatch(pickerCode, /\bthemed\b/, 'CountryPicker must stay Heritage-only');
  assert.doesNotMatch(pickerCode, /useThemeColors|authSurface/, 'CountryPicker must stay Heritage-only');
  assert.match(pickerCode, /authColors\./, 'CountryPicker still resolves from authTheme');

  // 4. The opt-in reached exactly the five auth screens that have a dark
  //    treatment, and no further: the rest of the flow is untouched, so no
  //    other light surface moved.
  for (const path of [
    'screens/WelcomeScreen.tsx',
    'screens/CreateAccountScreen.tsx',
    'screens/EmailCreateAccountScreen.tsx',
    'screens/SignInScreen.tsx',
    'screens/EmailSignInScreen.tsx',
  ]) {
    assert.match(stripCommentsForScan(await read(path)), /\bthemed\b/, `${path} must opt in`);
  }
  for (const path of [
    'screens/VerifyPhoneScreen.tsx',
    'screens/SetupScreen.tsx',
    'screens/LegalGateScreen.tsx',
    'screens/LaunchScreen.tsx',
  ]) {
    assert.doesNotMatch(
      stripCommentsForScan(await read(path)),
      /\bthemed\b/,
      `${path} has no dark treatment and must stay exactly as it renders today`
    );
  }
});

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
// EVERY claim below is RE-DERIVED from the file itself, in BOTH directions
// (home(1)). An `opaque-*` entry must really have no usable alpha — IHDR
// colour type 2/0, or an alpha channel whose minimum sample is 255. A
// `transparent` entry must really carry an alpha channel that goes below 255,
// decoded out of the IDAT stream rather than trusted from a comment. The
// earlier version of this roster checked the opaque half only, so relabelling
// an asset 'transparent' silently removed it from all checking; it no longer
// does.
//
// home(1) re-measured the whole roster after the operator installed cut-out
// replacements. Three prestige rasters and the Heritage armchair moved from
// baked to transparent, and their `gate` did NOT move with them: the gate is
// no longer only about a ground leaking, it is the standing dark-only /
// light-only ARTWORK decision (assets/prestige is dark-only by standing
// decision; the Heritage armchair is the light composition), and a cut-out
// does not retire that.
// ---------------------------------------------------------------------------

const BAKED_ART = {
  // Master 44's hero crop and its gold-B drape, and master 43's hero crop.
  // All three shipped as RGB with the dark room baked in; the operator's
  // replacements are RGBA cut-outs (measured: 72.66% / 69.39% / 38.51% of
  // samples fully transparent, every corner at alpha 0). The GATE STAYS —
  // these are the dark-only Prestige crops, and light mounts the Heritage set.
  'assets/prestige/hero_armchair_customer.png': { bake: 'transparent', gate: true },
  'assets/prestige/brazos_b_drape.png': { bake: 'transparent', gate: true },
  'assets/prestige/hero_toolbox_worker.png': { bake: 'transparent', gate: true },
  // home(4)'s fixed atmosphere behind both homes. GATE DECISION: gated, and it
  // is the strongest case on the roster — this one is genuinely still baked
  // (RGB, no alpha channel at all, 1080x2335 of dark room), it is full-bleed
  // rather than a corner crop, and it is mounted by a component rather than by
  // the screen, so nothing on the screen itself would show the mistake.
  // components/HomeAtmosphere.tsx returns null under the light palette.
  'assets/prestige/home-atmosphere-dark.png': { bake: 'opaque-dark', gate: true },
  // The Heritage armchair. It used to be RGBA-but-fully-opaque over the LIGHT
  // ground (#FAF5F1) — the exact inverse hazard — and was the one entry the
  // old alpha check skipped BY NAME. It is now a real cut-out (62.81% fully
  // transparent), so it is measured like everything else and the skip is gone.
  // Still gated: it is the LIGHT-only composition.
  'assets/brand/customer-home-chair.png': { bake: 'transparent', gate: true },
  // The LIGHT mark on the promo card. It used to be
  // assets/brand/customer-home-post-mark-hd.png, which was DELETED from disk
  // during the cut-out install while screens/HomeScreen.tsx still `require`d
  // it. That is not a light-mode-only fault: Metro resolves an asset
  // `require` at BUNDLE time, so a missing file fails the whole build in both
  // themes, and the app would not have started at all. home(1) repointed the
  // light mark at the brand-folder drape installed alongside the cut-outs
  // (byte-identical to the prestige one, but under assets/brand, so the
  // dark-only standing decision on assets/prestige is not violated). Gated,
  // because it is still the LIGHT half of a per-theme pair.
  'assets/brand/brazos_b_drape.png': { bake: 'transparent', gate: true },
  // Transparent: no background to leak, so no gate is owed.
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

/**
 * Decode a PNG far enough to answer ONE question: does this file carry alpha
 * that actually drops below 255 anywhere?
 *
 * The IHDR colour type alone cannot answer it. Type 2/0 has no alpha channel
 * and is definitively opaque, but type 6/4 only says the channel EXISTS — the
 * Heritage armchair sat at type 6 with every sample at 255 for months, which is
 * why the old check had to skip it BY NAME. So the IDAT stream is inflated and
 * unfiltered here and the alpha samples are read for real.
 *
 * Interlaced or non-8-bit files would need a different walk; none is on the
 * roster, and meeting one is an assertion rather than a silent pass.
 */
function alphaProfile(bytes, asset) {
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${asset} is not a PNG`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const depth = bytes[24];
  const colourType = bytes[25];
  const interlace = bytes[28];
  const samples = width * height;
  if (colourType !== 6 && colourType !== 4) {
    // No alpha channel exists at all: the ground is baked in, whatever it is.
    assert.ok([0, 2, 3].includes(colourType), `${asset}: unknown PNG colour type ${colourType}`);
    return { colourType, hasAlphaChannel: false, minAlpha: 255, transparentSamples: 0, samples };
  }
  assert.equal(depth, 8, `${asset}: only 8-bit PNGs are on this roster`);
  assert.equal(interlace, 0, `${asset}: only non-interlaced PNGs are on this roster`);

  const idat = [];
  for (let off = 8; off + 8 <= bytes.length; ) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  // Unfilter the scanlines in place — PNG's five filter types, byte by byte.
  const bpp = colourType === 6 ? 4 : 2;
  const stride = width * bpp;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const img = Buffer.alloc(height * stride);
  for (let y = 0, cursor = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const cur = img.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? img.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? cur[x - bpp] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      if (filter === 1) cur[x] = (v + left) & 255;
      else if (filter === 2) cur[x] = (v + up) & 255;
      else if (filter === 3) cur[x] = (v + ((left + up) >> 1)) & 255;
      else if (filter === 4) cur[x] = (v + paeth(left, up, upLeft)) & 255;
      else cur[x] = v;
    }
  }

  let minAlpha = 255;
  let transparentSamples = 0;
  for (let i = bpp - 1; i < img.length; i += bpp) {
    const a = img[i];
    if (a < minAlpha) minAlpha = a;
    if (a === 0) transparentSamples += 1;
  }
  return { colourType, hasAlphaChannel: true, minAlpha, transparentSamples, samples };
}

test('[static] every roster bake claim is re-derived from the file, both ways', async () => {
  let opaqueChecked = 0;
  let transparentChecked = 0;
  for (const [asset, { bake }] of Object.entries(BAKED_ART)) {
    // Every rostered asset must be ON DISK. Metro resolves an asset `require`
    // at bundle time, so a roster entry with no file is not a cosmetic gap —
    // it is a build that does not start. home(1) hit exactly that.
    const bytes = await readFile(new URL(`../${asset}`, import.meta.url));
    const alpha = alphaProfile(bytes, asset);
    if (bake.startsWith('opaque-')) {
      opaqueChecked += 1;
      // Either no alpha channel at all, or one that never leaves full opacity.
      assert.equal(
        alpha.minAlpha,
        255,
        `${asset} is claimed ${bake} but carries alpha down to ${alpha.minAlpha}`,
      );
    } else {
      transparentChecked += 1;
      assert.ok(
        alpha.hasAlphaChannel,
        `${asset} is claimed transparent but is PNG colour type ${alpha.colourType} — no alpha channel exists`,
      );
      assert.ok(
        alpha.minAlpha < 255,
        `${asset} is claimed transparent but every alpha sample is 255 — the ground is still baked in`,
      );
      // A stray soft pixel is not a cut-out. The thinnest real cut-out on this
      // roster is the app icon at 3.37% fully transparent; the floor below sits
      // under that and still excludes a token pixel or a rounded corner.
      assert.ok(
        alpha.transparentSamples > alpha.samples * 0.01,
        `${asset} is claimed transparent but only ${alpha.transparentSamples}/${alpha.samples} samples are cut out`,
      );
    }
  }
  // The sweep must actually be measuring both halves of the roster.
  assert.ok(opaqueChecked >= 2, `the opaque half must stay measured (saw ${opaqueChecked})`);
  assert.ok(
    transparentChecked >= 6,
    `the transparent half must stay measured (saw ${transparentChecked})`,
  );
});

test('[static] the three hero rasters are cut-outs, corner to corner', async () => {
  // home(1)'s specific claim, pinned per file rather than in aggregate: these
  // are the three the operator replaced, and a re-bake of any one of them is
  // the exact regression this commit exists to prevent.
  for (const asset of [
    'assets/prestige/hero_armchair_customer.png',
    'assets/prestige/hero_toolbox_worker.png',
    'assets/prestige/brazos_b_drape.png',
  ]) {
    assert.equal(BAKED_ART[asset].bake, 'transparent', `${asset} left the transparent roster`);
    const bytes = await readFile(new URL(`../${asset}`, import.meta.url));
    const alpha = alphaProfile(bytes, asset);
    assert.equal(alpha.colourType, 6, `${asset} must be RGBA (colour type 6)`);
    assert.equal(alpha.minAlpha, 0, `${asset} must reach alpha 0, not merely be translucent`);
    // A baked hero is opaque exactly where a cut-out is empty: at the edges.
    assert.ok(
      alpha.transparentSamples > alpha.samples * 0.3,
      `${asset}: only ${alpha.transparentSamples}/${alpha.samples} samples cut out — that is a crop, not a cut-out`,
    );
  }
});

test('[static] a theme-specific asset is mounted only behind an isDark decision', async () => {
  // Renamed, not relaxed (home(1)): the four gated entries used to be gated
  // because their ground was baked in. They are cut-outs now, and the gate
  // survives them going transparent because the REAL rule was always the
  // dark-only / light-only artwork decision. Same four assets, same sweep,
  // same assertions.
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

  // emerald D9. The prop above was already correct and the device still showed
  // light tiles: `overrideUserInterfaceStyle` (what react-native-maps 1.20.1
  // assigns natively) changes the view's TRAIT COLLECTION, and MKMapView
  // repaints its basemap on a trait CHANGE — a map that already rasterised
  // under one appearance does not reliably re-rasterise for an override
  // applied afterwards. Keying the view on the resolved theme constructs a new
  // one under the right trait collection instead.
  assert.match(nativeMap, /key=\{isDark \? 'dark' : 'light'\}/);
  // ...and the remount must not cost the user their position.
  assert.match(nativeMap, /const regionRef = useRef\(DEFAULT_REGION\);/);
  assert.match(nativeMap, /initialRegion=\{regionRef\.current\}/);
  assert.match(nativeMap, /regionRef\.current = region;/);

  // There is exactly ONE MapView in the tree, so there is no second surface
  // where the theme could fail to reach the tiles.
  const mapFiles = [];
  for (const path of ['components', 'screens']) {
    const entries = await readdir(new URL(`../${path}/`, import.meta.url), {
      withFileTypes: true,
      recursive: true,
    });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.tsx$/.test(entry.name)) continue;
      const source = await read(`${path}/${entry.name}`);
      if (/from 'react-native-maps'/.test(source)) mapFiles.push(`${path}/${entry.name}`);
    }
  }
  assert.deepEqual(mapFiles.sort(), ['components/HotspotMap.native.tsx']);
});
