import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ---------------------------------------------------------------------------
// RUN S2 (C1) — the design studio's registry and its channel gate, executed.
//
// Two protections live here, and neither may be loosened by a future run:
//
//   1. THE CHANNEL GATE. The studio is PERMANENT and DEV-ONLY: it exists
//      under Metro (__DEV__) and on the `internal` / `development` update
//      channels, and NOWHERE else — `preview`, `production`, unknown and
//      null all FAIL CLOSED. The gate's pure rule is executed over the whole
//      truth table, the module-level constant is executed with the require
//      shimmed both ways, and BOTH mounts (the Appearance row and the
//      ModeShell panel mount) are pinned to read it.
//
//   2. THE REGISTRY. The panel renders entirely from
//      ui/designStudioSchema.ts. Executed here: every entry carries a
//      non-empty plain label, technical key and description; keys are
//      unique; numeric ranges are sane and every default sits inside its
//      own range; defaults MATCH the token surfaces they claim to mirror
//      (the materials table cross-checked value by value); writes round-trip
//      through the real store and reset restores identity; and every
//      category icon is a real glyph in the INSTALLED Ionicons font.
// ---------------------------------------------------------------------------

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

/** ui/tokens.ts, executed with react-native stubbed (the themeTokens shape). */
const tokensModule = (async () => {
  const js = stripTypeScriptTypes(await read('ui/tokens.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{[^}]*\} from 'react-native';/,
      "const Platform = { OS: 'ios', select: (options) => ('ios' in options ? options.ios : options.default) };",
    )
    .replace(/export \{ withAlpha \} from '\.\/colorAlpha';/, '');
  assert.ok(!stubbed.includes("from 'react-native'"), 'react-native import must be stubbed');
  return import(toDataUrl(stubbed));
})();

/** lib/designOverrides.ts, executed against the executed token module. */
const overridesModule = (async () => {
  const tokens = await tokensModule;
  globalThis.__S2_TOKENS__ = tokens;
  const js = stripTypeScriptTypes(await read('lib/designOverrides.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{[^}]*\} from 'react';/,
      'const useSyncExternalStore = () => { throw new Error("hooks are not under test"); }; const useMemo = (factory) => factory();',
    )
    .replace(
      /import \{[^}]*\} from '\.\.\/ui\/tokens';/,
      'const { materials } = globalThis.__S2_TOKENS__;',
    );
  assert.doesNotMatch(
    stubbed,
    /from '(?:react|\.[^']*)'/,
    'every import lib/designOverrides.ts carries must be stubbed or dropped',
  );
  return import(toDataUrl(stubbed));
})();

/** ui/designStudioSchema.ts, executed against the executed override store
 *  and token module. */
const schemaModule = (async () => {
  const overrides = await overridesModule;
  const tokens = await tokensModule;
  globalThis.__S2_OVERRIDES__ = overrides;
  globalThis.__S2_TOKENS__ = tokens;
  const js = stripTypeScriptTypes(await read('ui/designStudioSchema.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{[\s\S]*?\} from '\.\.\/lib\/designOverrides';/,
      'const { STATIC_MATERIALS, getDesignOverrides, patchDesignOverrides, patchMaterialOverride, setOverrideValue, setPaletteTokenOverride } = globalThis.__S2_OVERRIDES__;',
    )
    .replace(
      /import \{[\s\S]*?\} from '\.\/tokens';/,
      'const { controls, layout, navBar, radius: tokenRadius, shadows: tokenShadows, spacing } = globalThis.__S2_TOKENS__;',
    );
  assert.doesNotMatch(
    stubbed,
    /from '(?:react|\.[^']*)'/,
    'every import ui/designStudioSchema.ts carries must be stubbed or dropped',
  );
  return import(toDataUrl(stubbed));
})();

/** The gate, executed with the expo-updates require shimmed per case. */
const gateModuleWith = async (channelValue, dev) => {
  const js = stripTypeScriptTypes(await read('lib/designStudioGate.ts'), { mode: 'strip' });
  assert.match(js, /require\('expo-updates'\)/, 'the gate must read the installed expo-updates');
  const stubbed = js.replace(
    /require\('expo-updates'\)/,
    'globalThis.__S2_UPDATES_SHIM__()',
  );
  globalThis.__S2_UPDATES_SHIM__ = channelValue;
  globalThis.__DEV__ = dev;
  // A unique suffix defeats the data-URL module cache so each case re-runs
  // the module-level computation.
  return import(toDataUrl(`${stubbed}\n// case ${Math.abs(dev ? 1 : 0)}-${encodeURIComponent(String(channelValue))}-${gateCase++}`));
};
let gateCase = 0;

/** A StudioContext over the executed modules — what the panel builds live. */
const contextFor = async (overrides = {}) => {
  const tokens = await tokensModule;
  const o = await overridesModule;
  return {
    overrides: { ...o.getDesignOverrides(), ...overrides },
    staticMaterials: tokens.materials,
    appLight: {
      gold: tokens.brand.gold,
      surface: '#FFFFFF',
      text: '#1F2E22',
      background: '#F4F1E8',
      emerald: tokens.brand.emerald,
      navInactive: '#839087',
      postPillGreen: tokens.brand.emerald,
      goldDeep: '#A08149',
      greetingSlate: '#526477',
    },
    appDark: {
      gold: tokens.dark.gold,
      surface: tokens.dark.surface,
      text: '#F1EDE1',
      background: '#02110D',
      emerald: tokens.dark.emerald,
      navInactive: '#7C8A80',
      postPillGreen: tokens.brand.emerald,
      goldDeep: '#A08149',
      greetingSlate: '#526477',
    },
    emeraldLight: tokens.light,
    emeraldDark: tokens.dark,
    isDark: true,
    navBottomPadAuto: 6,
    glowAlphaDefault: SURFACE_GLOW_ALPHA_AS_SHIPPED,
  };
};

/** Surface's standing glow strength, read from its source so the registry's
 *  default cannot drift from the token it mirrors. */
const SURFACE_GLOW_ALPHA_AS_SHIPPED = await (async () => {
  const surface = await read('ui/primitives/Surface.tsx');
  const match = /export const SURFACE_GLOW_ALPHA = ([\d.]+);/.exec(surface);
  assert.ok(match, 'Surface must still export SURFACE_GLOW_ALPHA');
  return Number(match[1]);
})();

// ---------------------------------------------------------------------------
// The channel gate
// ---------------------------------------------------------------------------

test('gate rule: the whole truth table — internal/development/__DEV__ open it, everything else fails closed', async () => {
  const gate = await gateModuleWith(() => ({ channel: null }), false);
  const rule = gate.resolveDesignStudioAvailable;

  assert.deepEqual([...gate.DESIGN_STUDIO_CHANNELS], ['internal', 'development']);

  // The two channels, and Metro.
  assert.equal(rule('internal', false), true);
  assert.equal(rule('development', false), true);
  assert.equal(rule(null, true), true, '__DEV__ opens the studio whatever the channel says');
  assert.equal(rule('production', true), true);

  // FAIL CLOSED: release channels, unknown channels, and no channel at all.
  assert.equal(rule('preview', false), false);
  assert.equal(rule('production', false), false);
  assert.equal(rule('staging', false), false, 'an unknown channel is closed, not guessed');
  assert.equal(rule(null, false), false, 'a null channel without Metro is closed');
  assert.equal(rule('', false), false);
  assert.equal(rule('INTERNAL', false), false, 'the match is exact — no case folding');
});

test('gate module: the resolved constant fails closed on every degraded read', async () => {
  // The operator's share build: release (__DEV__ false), channel internal.
  assert.equal((await gateModuleWith(() => ({ channel: 'internal' }), false)).designStudioAvailable, true);
  // TestFlight and production builds.
  assert.equal((await gateModuleWith(() => ({ channel: 'preview' }), false)).designStudioAvailable, false);
  assert.equal((await gateModuleWith(() => ({ channel: 'production' }), false)).designStudioAvailable, false);
  // Expo Go / dev-build null channel without Metro: closed.
  assert.equal((await gateModuleWith(() => ({ channel: null }), false)).designStudioAvailable, false);
  // A module that throws, a missing export, a non-string channel: closed.
  assert.equal((await gateModuleWith(() => { throw new Error('no native module'); }, false)).designStudioAvailable, false);
  assert.equal((await gateModuleWith(() => ({}), false)).designStudioAvailable, false);
  assert.equal((await gateModuleWith(() => ({ channel: 42 }), false)).designStudioAvailable, false);
  assert.equal((await gateModuleWith(() => null, false)).designStudioAvailable, false);
  // Metro opens it even with nothing readable.
  assert.equal((await gateModuleWith(() => { throw new Error('boom'); }, true)).designStudioAvailable, true);
});

test('[static] the gate is shaped to fail closed, and expo-updates stays behind it', async () => {
  const gate = stripComments(await read('lib/designStudioGate.ts'));
  // One lazy, caught require — the lib/blur.tsx boundary shape.
  assert.match(gate.replace(/\s+/g, ' '), /try \{ const updates = require\('expo-updates'\)/);
  assert.match(gate.replace(/\s+/g, ' '), /\} catch \{ return null; \}/);
  // The allow-list, exactly.
  assert.match(gate, /DESIGN_STUDIO_CHANNELS = \['internal', 'development'\] as const/);
  // The pure rule: dev opens, null closes, then the allow-list — no other arm.
  assert.match(gate.replace(/\s+/g, ' '), /if \(dev\) return true; if \(channel == null\) return false; return \(DESIGN_STUDIO_CHANNELS as readonly string\[\]\)\.includes\(channel\);/);
  assert.match(gate, /__DEV__ === true/);

  // expo-updates is named ONLY here — the same boundary rule expo-blur has.
  const { readdirSync, statSync, readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry)) {
        if (rel === 'lib/designStudioGate.ts') continue;
        if (/expo-updates/.test(stripComments(readFileSync(join(root, rel), 'utf8')))) {
          offenders.push(rel);
        }
      }
    }
  };
  for (const dir of ['components', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui']) walk(dir);
  assert.deepEqual(offenders, [], 'expo-updates is read only by lib/designStudioGate.ts');
});

test('[static] BOTH mounts read the gate — the Appearance row and the ModeShell panel', async () => {
  const appearance = stripComments(await read('screens/AppearanceScreen.tsx'));
  assert.match(appearance, /from '\.\.\/lib\/designStudioGate'/);
  assert.match(
    appearance.replace(/\s+/g, ' '),
    /\{designStudioAvailable \? \( <Pressable/,
    'the Design studio row must render only where the gate allows',
  );

  const shell = stripComments(await read('navigation/ModeShell.tsx'));
  assert.match(shell, /from '\.\.\/lib\/designStudioGate'/);
  assert.match(
    shell.replace(/\s+/g, ' '),
    /\{designStudioAvailable \? <DesignStudioPanel \/> : null\}/,
    'the panel must mount only where the gate allows',
  );
  assert.doesNotMatch(
    shell.replace(/\s+/g, ' '),
    /<DesignStudioPanel \/>(?! : null)/,
    'no ungated panel mount may exist',
  );
});

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

test('registry: every entry carries a non-empty plain label, technical key and description', async () => {
  const schema = await schemaModule;
  assert.ok(schema.STUDIO_REGISTRY.length >= 15, `the registry must be populated (saw ${schema.STUDIO_REGISTRY.length})`);
  const keys = new Set();
  const categoryKeys = new Set(schema.STUDIO_CATEGORIES.map((c) => c.key));
  for (const entry of schema.STUDIO_REGISTRY) {
    assert.ok(entry.key && !keys.has(entry.key), `duplicate or empty key: ${entry.key}`);
    keys.add(entry.key);
    assert.ok(entry.plainLabel.trim().length > 0, `${entry.key}: empty plainLabel`);
    assert.ok(entry.technicalKey.trim().length > 0, `${entry.key}: empty technicalKey`);
    assert.ok(entry.description.trim().length > 0, `${entry.key}: empty description`);
    assert.ok(categoryKeys.has(entry.category), `${entry.key}: unknown category ${entry.category}`);
    assert.ok(['basic', 'advanced'].includes(entry.tier), `${entry.key}: bad tier`);
    assert.ok(
      ['number', 'decimal', 'color', 'boolean', 'enum', 'text'].includes(entry.kind),
      `${entry.key}: bad kind`,
    );
    assert.ok(['token', 'local'].includes(entry.scope), `${entry.key}: bad scope`);
  }
});

test('registry: numeric entries have sane ranges and defaults inside them', async () => {
  const schema = await schemaModule;
  const ctx = await contextFor();
  let numerics = 0;
  for (const entry of schema.STUDIO_REGISTRY) {
    if (entry.kind !== 'number' && entry.kind !== 'decimal') continue;
    numerics += 1;
    assert.ok(typeof entry.min === 'number' && typeof entry.max === 'number', `${entry.key}: no range`);
    assert.ok(entry.min < entry.max, `${entry.key}: empty range`);
    assert.ok(typeof entry.step === 'number' && entry.step > 0, `${entry.key}: no step`);
    const fallback = entry.defaultValue(ctx);
    assert.ok(typeof fallback === 'number' && Number.isFinite(fallback), `${entry.key}: non-numeric default`);
    assert.ok(
      fallback >= entry.min && fallback <= entry.max,
      `${entry.key}: default ${fallback} outside [${entry.min}, ${entry.max}]`,
    );
  }
  assert.ok(numerics >= 13, `the numeric sweep must see the dials (saw ${numerics})`);
});

test('registry: defaults mirror the token surfaces value by value', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const ctx = await contextFor();
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));

  for (const material of ['chrome', 'sheet', 'menu']) {
    for (const prop of ['blur', 'scrimAlpha', 'borderAlpha', 'fallbackScrimAlpha']) {
      const entry = byKey.get(`material.${material}.${prop}`);
      assert.ok(entry, `material.${material}.${prop} must be in the registry`);
      assert.equal(
        entry.defaultValue(ctx),
        tokens.materials[material][prop],
        `${entry.key}: default must BE the materials table's value`,
      );
      assert.equal(entry.technicalKey, `materials.${material}.${prop}`);
    }
  }
  assert.equal(byKey.get('glow.alpha').defaultValue(ctx), SURFACE_GLOW_ALPHA_AS_SHIPPED);
  assert.equal(byKey.get('nav.radius').defaultValue(ctx), 0, 'the bar launches square');
  assert.equal(byKey.get('nav.bottomPad').defaultValue(ctx), ctx.navBottomPadAuto);
  assert.equal(byKey.get('color.gold').defaultValue(ctx), tokens.dark.gold, 'dark ctx: dark gold');
  assert.equal(byKey.get('color.cardFill').defaultValue(ctx), tokens.dark.surface);
});

test('registry: writes round-trip through the real store, and reset restores identity', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const o = await overridesModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  try {
    byKey.get('material.chrome.blur').write(44);
    byKey.get('glow.alpha').write(0.31);
    byKey.get('nav.radius').write(12);
    const ctx = await contextFor();
    assert.equal(byKey.get('material.chrome.blur').overrideValue(ctx), 44);
    assert.equal(schema.currentValueOf(byKey.get('material.chrome.blur'), ctx), 44);
    assert.equal(schema.isModified(byKey.get('material.chrome.blur'), ctx), true);
    assert.equal(schema.isModified(byKey.get('material.sheet.blur'), ctx), false);
    assert.equal(o.resolveMaterials(o.getDesignOverrides()).chrome.blur, 44);
    assert.equal(o.getDesignOverrides().glowAlpha, 0.31);
    assert.equal(o.getDesignOverrides().navRadius, 12);

    // Clearing one dial returns exactly that entry to its default.
    byKey.get('material.chrome.blur').write(undefined);
    const cleared = await contextFor();
    assert.equal(schema.isModified(byKey.get('material.chrome.blur'), cleared), false);
    assert.equal(
      schema.currentValueOf(byKey.get('material.chrome.blur'), cleared),
      tokens.materials.chrome.blur,
    );
  } finally {
    o.resetDesignOverrides();
  }
  assert.equal(o.resolveMaterials(o.getDesignOverrides()), tokens.materials, 'reset must restore identity');
});

test('registry: every category icon is a real glyph in the installed Ionicons font', async () => {
  const schema = await schemaModule;
  const glyphmap = JSON.parse(
    await readFile(
      new URL(
        '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(schema.STUDIO_CATEGORIES.length, 14, 'the fourteen dispatched categories');
  for (const category of schema.STUDIO_CATEGORIES) {
    assert.ok(category.label.trim().length > 0, `${category.key}: empty label`);
    assert.ok(
      Object.hasOwn(glyphmap, category.icon),
      `${category.key}: '${category.icon}' is not an installed Ionicons glyph`,
    );
  }
});

// ---------------------------------------------------------------------------
// The panel (S2 C2) — rendered from the registry alone
// ---------------------------------------------------------------------------

test('[static] the panel renders from the registry — zero hand-wired rows, no per-token literals', async () => {
  const panel = stripComments(await read('components/DesignStudioPanel.tsx'));

  // The registry and category roster are the panel's ONLY source of rows.
  assert.match(panel, /STUDIO_REGISTRY/, 'the panel must consume the registry');
  assert.match(panel, /STUDIO_CATEGORIES/, 'the panel must render the category roster');
  assert.match(panel, /entry\.write\(/, "every override write goes through the entry's own write");

  // NO PER-TOKEN LITERALS. A token name appearing here would be a hand-wired
  // row — the exact shape the registry exists to end. The store's per-key
  // writers are banned too: the panel may reset everything, and nothing else.
  for (const banned of [
    /\bnavRadius\b/,
    /\bnavBottomPad\b/,
    /\bglowAlpha\b/,
    /\bscrimAlpha\b/,
    /\bborderAlpha\b/,
    /\bfallbackScrimAlpha\b/,
    /\bcardFill\b/,
    /\bSTUDIO_GOLD_CYCLE\b/,
    /\bSTUDIO_CARD_FILL_CYCLE\b/,
    /\bpatchDesignOverrides\b/,
    /\bpatchMaterialOverride\b/,
    /\bsetOverrideValue\b/,
    /\bsetPaletteTokenOverride\b/,
    /'chrome'/,
    /'sheet'/,
    /'menu'/,
  ]) {
    assert.doesNotMatch(panel, banned, `the panel hand-wires a token: ${banned}`);
  }
});

// ---------------------------------------------------------------------------
// RUN S3 (C2) — the header, the overflow and its pages
// ---------------------------------------------------------------------------

test('[static] S3: search is gone, the tier toggle is ONE pill, and the overflow carries five rows', async () => {
  const panel = stripComments(await read('components/DesignStudioPanel.tsx'));
  const flat = panel.replace(/\s+/g, ' ');

  // D3 — SEARCH IS REMOVED COMPLETELY: the input, its state, its style and
  // its filtering branch. Gone, not hidden.
  assert.doesNotMatch(panel, /placeholder="Search controls"/, 'the search input must be gone');
  assert.doesNotMatch(panel, /\bsetSearch\b/, 'the search state must be gone');
  assert.doesNotMatch(panel, /styles\.search\b/, 'the search style must be gone');
  assert.doesNotMatch(panel, /haystack/, 'the search filtering branch must be gone');

  // D4 — ONE tier toggle that flips, not a pair of pills; and the "All",
  // "Starred" and toolbar "Reset" pills are gone.
  assert.equal((panel.match(/'Simple'/g) ?? []).length, 1, 'exactly one Simple label');
  assert.equal((panel.match(/'Advanced'/g) ?? []).length, 1, 'exactly one Advanced label');
  assert.match(
    flat,
    /setTier\(tier === 'simple' \? 'advanced' : 'simple'\)/,
    'the tier pill must FLIP on tap',
  );
  assert.doesNotMatch(panel, /'Starred'/, 'the Starred pill is removed');
  assert.doesNotMatch(panel, /\['all', 'All'\]/, 'the All pill is removed');
  assert.doesNotMatch(panel, /styles\.filterLabel}>Reset</, 'the toolbar Reset pill is removed');

  // D4 — the header + toolbar box, computed from the panel's own numbers.
  const styleBlock = (key) => new RegExp(`${key}: \\{([^}]*)\\}`).exec(flat)?.[1] ?? '';
  const num = (block, key) => {
    const hit = new RegExp(`${key}: (-?[\\d.]+)`).exec(block);
    return hit ? Number(hit[1]) : 0;
  };
  const headerBox =
    num(styleBlock('header'), 'paddingVertical') * 2 + num(styleBlock('dragZone'), 'minHeight');
  const toolbarBox =
    num(styleBlock('toolbar'), 'paddingTop') +
    num(styleBlock('toolbar'), 'paddingBottom') +
    num(styleBlock('filterChip'), 'height');
  assert.ok(headerBox > 0 && toolbarBox > 0, 'the header and toolbar boxes must be readable');
  assert.ok(
    headerBox + toolbarBox <= 84,
    `S3 D4: header ${headerBox}pt + toolbar ${toolbarBox}pt must stay within 84pt`,
  );

  // D5 — five overflow rows, four of them pages, and the naming trap: the
  // state is 'overflow' and the pages are named, never 'menu'/'sheet'/'chrome'
  // (the registry fence bans those three literals in this file outright).
  for (const label of ['Presets', 'Export', 'Import', 'Raw JSON', 'Reset all']) {
    assert.match(flat, new RegExp(`'${label}'|>\\s*${label}\\s*<`), `missing overflow row: ${label}`);
  }
  for (const page of ["'overflow'", "'presets'", "'export'", "'import'", "'raw'"]) {
    assert.ok(flat.includes(page), `missing page name: ${page}`);
  }
  assert.match(flat, /‹ Design studio/, 'every page must carry the way back');
  // The studio must not wear what it tunes: the overflow is the panel's own
  // solid rows, never a shared popover or a glass Surface.
  assert.doesNotMatch(panel, /DropMenu/, 'the overflow must not wear the shared popover');
  assert.doesNotMatch(panel, /<Surface\b/, 'the studio never wears the material it tunes');
  // Behaviour unchanged on the pages the overflow now holds.
  assert.match(flat, /Share\.share\(\{ message: exportJson \}\)/);
  for (const title of ['Reset everything?', 'Import overrides?', 'Apply raw overrides?']) {
    assert.ok(panel.includes(title), `missing confirm: ${title}`);
  }
});

// ---------------------------------------------------------------------------
// Panel ergonomics (S2 C3) — the clamp, executed
// ---------------------------------------------------------------------------

test('clamp: the header can never leave the safe interactive area, at min and max height', async () => {
  const js = stripTypeScriptTypes(await read('ui/designStudioLayout.ts'), { mode: 'strip' });
  const layout = await import(toDataUrl(js));
  const { clampPanelRect, panelWidthFor, PANEL_MARGIN, PANEL_MIN_HEIGHT, PANEL_COLLAPSED_HEIGHT } =
    layout;

  assert.equal(PANEL_MIN_HEIGHT, 180, 'the dispatched resize floor');
  // S3 (D1): edge-to-edge. The panel spans the whole window width, so the
  // width function is the window's width and nothing subtracts a margin.
  assert.equal(PANEL_MARGIN, 0, 'S3 D1: the panel has no side margin left');
  assert.equal(
    panelWidthFor({ windowWidth: 393, windowHeight: 852, topInset: 59, bottomInset: 122 }),
    393,
    'S3 D1: panelWidthFor is the window width',
  );

  // A notched iPhone-ish frame: 393x852, status area 59, nav footprint 122.
  const frame = { windowWidth: 393, windowHeight: 852, topInset: 59, bottomInset: 122 };
  const maxY = frame.windowHeight - frame.bottomInset;
  const available = maxY - frame.topInset;

  const heights = [Number.NEGATIVE_INFINITY, -50, 0, PANEL_MIN_HEIGHT, 400, available, 10_000, Number.NaN];
  const positions = [-10_000, -1, 0, 59, 400, 700, 10_000, Number.NaN];
  for (const collapsed of [false, true]) {
    for (const height of heights) {
      for (const y of positions) {
        for (const x of [
          Number.NEGATIVE_INFINITY,
          -10_000,
          -1,
          0,
          12,
          24,
          400,
          10_000,
          Number.POSITIVE_INFINITY,
          Number.NaN,
        ]) {
          const next = clampPanelRect({ x, y, height }, frame, collapsed);
          const box = collapsed ? Math.min(PANEL_COLLAPSED_HEIGHT, available) : next.height;
          // S3 (D2): VERTICAL MOVEMENT ONLY. x is an OUTPUT of the clamp, not
          // an input — over the fuzz's WHOLE x set, including the two
          // infinities and NaN, the left edge is PANEL_MARGIN and nothing else.
          assert.equal(next.x, PANEL_MARGIN, `x must be pinned to the edge (from x=${x})`);
          assert.ok(next.y >= frame.topInset, `top edge above the status area: y=${next.y}`);
          assert.ok(
            next.y + box <= maxY,
            `bottom edge over the nav: y=${next.y} box=${box} (from y=${y}, h=${height})`,
          );
          assert.ok(next.x >= 0, `left edge off-screen: x=${next.x}`);
          assert.ok(
            next.x + panelWidthFor(frame) <= frame.windowWidth,
            `right edge off-screen: x=${next.x}`,
          );
          assert.ok(next.height >= Math.min(PANEL_MIN_HEIGHT, available), 'height under the floor');
          assert.ok(next.height <= available, 'height over the available area');
          assert.ok(
            Number.isFinite(next.x) && Number.isFinite(next.y) && Number.isFinite(next.height),
            'a non-finite gesture input must resolve to a safe rect',
          );
        }
      }
    }
  }

  // Height runs the full available area — the max is exactly the space
  // between the status area and the nav, never a fixed cap.
  assert.equal(clampPanelRect({ x: 12, y: 59, height: 10_000 }, frame, false).height, available);

  // A degenerate window (smaller than the floor) still holds every bound.
  const tiny = { windowWidth: 100, windowHeight: 200, topInset: 40, bottomInset: 100 };
  const cramped = clampPanelRect({ x: 0, y: 0, height: 500 }, tiny, false);
  assert.ok(cramped.y >= tiny.topInset);
  assert.ok(cramped.y + cramped.height <= tiny.windowHeight - tiny.bottomInset);
});

test('[static] the panel routes every gesture and frame change through the clamp, and stays non-modal', async () => {
  const panel = stripComments(await read('components/DesignStudioPanel.tsx'));
  // Every mutation path clamps: init, the re-clamp effect, drag, resize.
  const clampCalls = panel.match(/clampPanelRect\(/g) ?? [];
  assert.ok(clampCalls.length >= 4, `every rect mutation must clamp (saw ${clampCalls.length})`);
  // The frame's bottom boundary is the nav's LIVE footprint, so the bar is
  // never covered and the app behind stays interactive.
  assert.match(panel, /useFloatingNavClearance\(\)/);
  assert.match(panel, /bottomInset: navClearance/);
  assert.match(panel, /pointerEvents="box-none"/, 'the overlay must pass touches through');
  // S3 (D2) — VERTICAL MOVEMENT ONLY: the drag handler applies dy alone and
  // never reads dx, so the edge-to-edge panel cannot be dragged sideways.
  const dragBlock = panel.slice(panel.indexOf('const drag = useRef('), panel.indexOf('const resizeStart'));
  assert.ok(dragBlock.length > 0, 'the drag responder must still exist');
  assert.doesNotMatch(dragBlock, /gesture\.dx/, 'S3 D2: the drag never reads dx');
  // Collapse is its own affordance: the slim pill names the category and
  // restores height and scroll position.
  assert.match(panel, /Customizing — \{lastCategory\}/);
  assert.match(panel, /panelSession\.scrollY/, 'scroll position must persist for the session');
  // Content scrolls internally at every height: the body flexes inside the
  // sized panel rather than sizing it.
  assert.match(panel, /height: rect\.height/);
});

// ---------------------------------------------------------------------------
// The Navigation category (S2 C6)
// ---------------------------------------------------------------------------

test('nav dials: defaults mirror the tokens, the [+] derives from the live bar, and writes round-trip', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const o = await overridesModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  const ctx = await contextFor();

  assert.equal(byKey.get('nav.barHeight').defaultValue(ctx), tokens.layout.floatingNavHeight);
  assert.equal(byKey.get('nav.iconSize').defaultValue(ctx), tokens.navBar.iconSize);
  assert.equal(byKey.get('nav.labelSize').defaultValue(ctx), tokens.navBar.labelFontSize);
  assert.equal(byKey.get('nav.iconLabelGap').defaultValue(ctx), tokens.navBar.iconLabelGap);
  assert.equal(byKey.get('create.glowAlpha').defaultValue(ctx), tokens.navBar.createGlowAlpha);
  assert.equal(
    byKey.get('create.size').defaultValue(ctx),
    Math.round(tokens.layout.floatingNavHeight * tokens.navBar.createSizeRatio),
    "the [+]'s default size is home(18)'s share of the bar",
  );
  assert.equal(
    byKey.get('create.glyphSize').defaultValue(ctx),
    Math.round(
      Math.round(tokens.layout.floatingNavHeight * tokens.navBar.createSizeRatio) *
        tokens.navBar.createGlyphRatio,
    ),
  );
  assert.equal(byKey.get('nav.activeColor').defaultValue(ctx), tokens.dark.emerald, 'dark ctx');
  assert.ok(byKey.get('create.size').min >= 44, 'the [+] can never dial under the touch floor');

  try {
    // The [+]'s derived defaults FOLLOW the live bar height.
    byKey.get('nav.barHeight').write(100);
    const live = await contextFor();
    assert.equal(
      byKey.get('create.size').defaultValue(live),
      Math.round(100 * tokens.navBar.createSizeRatio),
    );
    // A bag write round-trips and clears.
    byKey.get('nav.spread').write(24);
    assert.equal(o.getDesignOverrides().values['nav.spread'], 24);
    byKey.get('nav.spread').write(undefined);
    byKey.get('nav.barHeight').write(undefined);
    assert.equal('values' in o.getDesignOverrides(), false);
  } finally {
    o.resetDesignOverrides();
  }

  // NO per-item X offsets and NO per-pair gaps: the row dials are the ROW's.
  const navKeys = schema.STUDIO_REGISTRY.filter((entry) => entry.category === 'navigation').map(
    (entry) => entry.key,
  );
  assert.ok(!navKeys.some((key) => /item\d|perItem|pairGap/i.test(key)), 'the bar stays slot-based flex');
  assert.ok(navKeys.includes('nav.spread') && navKeys.includes('nav.centerClearance'));
});

test('the narrow typography exception: nav label size is the ONLY font dial', async () => {
  const schema = await schemaModule;
  const fontDials = schema.STUDIO_REGISTRY.filter(
    (entry) =>
      /font/i.test(entry.technicalKey) ||
      /font size|text size|label size/i.test(entry.plainLabel) ||
      /labelSize/.test(entry.key),
  ).map((entry) => entry.key);
  assert.deepEqual(fontDials, ['nav.labelSize'], 'no other font property may grow a dial');
});

test('[static] the bar reads every dial through the override layer, and the trees subscribe', async () => {
  const bottomNav = stripComments(await read('ui/primitives/BottomNav.tsx'));
  // Item dials live in the item; container dials in the options factory; the
  // [+] inherits nothing from tab items — its dials are its own create.* set.
  for (const key of [
    "'nav.iconSize'",
    "'nav.labelSize'",
    "'nav.iconLabelGap'",
    "'nav.itemOffsetX'",
    "'nav.itemOffsetY'",
    "'nav.activeColor'",
    "'nav.inactiveColor'",
    "'nav.activeOpacity'",
    "'nav.inactiveOpacity'",
    "'nav.activeScale'",
    "'nav.barHeight'",
    "'nav.padTop'",
    "'nav.padLeft'",
    "'nav.padRight'",
    "'nav.spread'",
    "'nav.centerClearance'",
    "'create.size'",
    "'create.radius'",
    "'create.fill'",
    "'create.border'",
    "'create.glowAlpha'",
    "'create.glyphSize'",
    "'create.glyphColor'",
    "'create.glyphOffsetX'",
    "'create.glyphOffsetY'",
  ]) {
    assert.ok(bottomNav.includes(key), `BottomNav must read the ${key} dial`);
  }
  for (const path of ['navigation/CustomerRoot.tsx', 'navigation/WorkerRoot.tsx']) {
    assert.match(
      stripComments(await read(path)),
      /useNavBarContainerDials\(\);/,
      `${path} must subscribe to the bar-container dials`,
    );
  }
});

// ---------------------------------------------------------------------------
// Sheets and Menus (S2 C7)
// ---------------------------------------------------------------------------

test('sheet and menu dials: defaults mirror the shipped values, and the wearers read them', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  const ctx = await contextFor();

  assert.equal(byKey.get('sheet.topRadius').defaultValue(ctx), tokens.radius.xxl);
  assert.equal(byKey.get('sheet.dialogRadius').defaultValue(ctx), tokens.radius.xl);
  assert.equal(byKey.get('sheet.promptRadius').defaultValue(ctx), tokens.radius.lg);
  assert.equal(byKey.get('sheet.contentPad').defaultValue(ctx), tokens.layout.screenGutter);
  assert.equal(byKey.get('sheet.sectionGap').defaultValue(ctx), tokens.spacing.md);
  assert.equal(byKey.get('sheet.footerPad').defaultValue(ctx), tokens.spacing.lg);
  assert.equal(byKey.get('sheet.maxHeightPct').defaultValue(ctx), 88);
  assert.equal(byKey.get('sheet.backdropAlpha').defaultValue(ctx), 0.55, 'dark ctx: the D8 scrim');
  assert.equal(byKey.get('sheet.backdropAlpha').defaultValue({ ...ctx, isDark: false }), 0.45);
  assert.equal(byKey.get('sheet.handleWidth').defaultValue(ctx), 40);
  assert.equal(byKey.get('sheet.handleColor').defaultValue(ctx), tokens.dark.line);

  assert.equal(byKey.get('menu.minWidth').defaultValue(ctx), 208);
  assert.equal(byKey.get('menu.radius').defaultValue(ctx), tokens.materials.menu.radius);
  assert.equal(byKey.get('menu.itemHeight').defaultValue(ctx), 46);
  assert.ok(byKey.get('menu.itemHeight').min >= 44, 'menu rows can never dial under the touch floor');
  assert.equal(byKey.get('menu.separators').defaultValue(ctx), true);
  assert.equal(byKey.get('menu.separators').kind, 'boolean');

  // The material colour dials joined the Blur & Material category (C7):
  // fill/tint and hairline colour per material, defaulting to the table.
  for (const material of ['chrome', 'sheet', 'menu']) {
    assert.equal(
      byKey.get(`material.${material}.scrimColor`).defaultValue(ctx),
      tokens.materials[material].scrimColor,
    );
    assert.equal(
      byKey.get(`material.${material}.borderColor`).defaultValue(ctx),
      tokens.materials[material].borderColor,
    );
  }
});

test('[static] the sheet family and the menu wear their dials — and the menu wears the MATERIAL', async () => {
  const sheet = stripComments(await read('ui/primitives/Sheet.tsx'));
  for (const key of [
    "'sheet.topRadius'",
    "'sheet.maxHeightPct'",
    "'sheet.headerPad'",
    "'sheet.contentPad'",
    "'sheet.footerPad'",
    "'sheet.sectionGap'",
    "'sheet.handleWidth'",
    "'sheet.handleHeight'",
    "'sheet.handleColor'",
    "'sheet.handleAlpha'",
    "'sheet.handleSpaceAbove'",
    "'sheet.handleSpaceBelow'",
    "'sheet.backdropColor'",
    "'sheet.backdropAlpha'",
  ]) {
    assert.ok(sheet.includes(key), `Sheet must read the ${key} dial`);
  }
  for (const [path, keys] of [
    ['components/ActionSheet.tsx', ["'sheet.dialogRadius'", "'sheet.backdropColor'", "'sheet.backdropAlpha'"]],
    // ConfirmDialog's RADIUS stays pinned at radius.xl by the D15 budget
    // fence (not this run's to move) — its backdrop still dials.
    ['components/ConfirmDialog.tsx', ["'sheet.backdropColor'", "'sheet.backdropAlpha'"]],
    ['components/AmountPrompt.tsx', ["'sheet.promptRadius'", "'sheet.backdropColor'", "'sheet.backdropAlpha'"]],
  ]) {
    const source = stripComments(await read(path));
    for (const key of keys) assert.ok(source.includes(key), `${path} must read the ${key} dial`);
  }

  // THE MENU WEARS THE MENU MATERIAL — through Surface, in the SHARED file
  // both drivers render, so the category drives a real surface on both
  // paths. The panel style itself paints nothing any more, and
  // DropMenu.motion120.tsx is byte-untouched by this run.
  const shared = stripComments(await read('components/DropMenu.shared.tsx'));
  assert.match(shared, /<Surface\s+material="menu"/);
  for (const key of [
    "'menu.minWidth'",
    "'menu.radius'",
    "'menu.paddingY'",
    "'menu.itemHeight'",
    "'menu.itemPaddingX'",
    "'menu.itemSpacing'",
    "'menu.separators'",
  ]) {
    assert.ok(shared.includes(key), `DropMenu.shared must read the ${key} dial`);
  }
  const panelStyle = /panel: \{([^}]*)\}/.exec(shared.replace(/\s+/g, ' '));
  assert.ok(panelStyle, 'the shared panel style must survive');
  assert.doesNotMatch(
    panelStyle[1],
    /backgroundColor|borderColor|borderWidth/,
    'fill and hairline are the menu material’s now — the panel is geometry and clip only',
  );
  const motion120 = stripComments(await read('components/DropMenu.motion120.tsx'));
  assert.doesNotMatch(
    motion120,
    /material=|designOverrides|useOverride/,
    'DropMenu.motion120.tsx stays a pure animation driver — the shared file carries the material',
  );
});

// ---------------------------------------------------------------------------
// Cards, Buttons/Pills and Inputs (S2 C8)
// ---------------------------------------------------------------------------

test('card, button and input dials: defaults mirror the shipped values, floors hold', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  const ctx = await contextFor();
  const light = { ...ctx, isDark: false };

  assert.equal(byKey.get('card.paddingX').defaultValue(ctx), tokens.layout.cardPadding);
  assert.equal(byKey.get('card.radius').defaultValue(ctx), tokens.radius.lg);
  assert.equal(byKey.get('card.gap').defaultValue(ctx), tokens.spacing.md);
  assert.equal(byKey.get('card.shadowOpacity').defaultValue(ctx), 0.5, 'dark: GROUND1 depth');
  assert.equal(byKey.get('card.shadowOpacity').defaultValue(light), 0.08, 'light: §I depth');
  assert.equal(byKey.get('card.borderWidth').defaultValue(ctx), 0, 'the card draws no ring today');
  assert.equal(byKey.get('card.liftScale').defaultValue(ctx), 1, 'the wash ships at its calibration');

  assert.equal(byKey.get('listRow.paddingX').defaultValue(ctx), tokens.layout.screenGutter);
  assert.equal(byKey.get('listRow.minHeight').defaultValue(ctx), tokens.controls.minTouchTarget);

  for (const variant of ['primary', 'secondary', 'ghost', 'destructive']) {
    assert.equal(byKey.get(`button.${variant}.height`).defaultValue(ctx), 52, `${variant}: md height`);
    assert.ok(byKey.get(`button.${variant}.height`).min >= 44, `${variant}: touch floor`);
    assert.equal(byKey.get(`button.${variant}.radius`).defaultValue(ctx), 12, `${variant}: lib/theme radius.md`);
  }
  assert.equal(byKey.get('button.ghost.fill'), undefined, 'ghost has no fill to dial — it is bare text');
  assert.equal(byKey.get('button.secondary.borderAlpha').defaultValue(ctx), 0.55, 'dark: the gold hairline tier');
  assert.equal(byKey.get('button.secondary.borderAlpha').defaultValue(light), 1);
  assert.equal(byKey.get('button.pressedOpacity').defaultValue(ctx), 0.85);
  assert.equal(byKey.get('button.disabledOpacity').defaultValue(ctx), 1, 'decision 3 stays flat by default');

  assert.equal(byKey.get('chip.radius').defaultValue(ctx), tokens.radius.pill);
  assert.ok(byKey.get('chip.minHeight').min >= 44);
  assert.equal(byKey.get('pill.paddingX').defaultValue(ctx), tokens.spacing.md);

  assert.equal(byKey.get('search.height').defaultValue(ctx), tokens.controls.fieldHeight);
  assert.ok(byKey.get('search.height').min >= 44, 'the tappable field keeps the touch floor');
  assert.equal(byKey.get('search.focusGlow').defaultValue(ctx), 0, 'no focus glow ships today');
  assert.equal(byKey.get('toggle.trackWidth').defaultValue(ctx), 52);
});

test('[static] every C8 wearer reads its dials through the override layer', async () => {
  const wearers = [
    ['ui/primitives/JobCard.tsx', ["'card.fill'", "'card.paddingX'", "'card.radius'", "'card.shadowOpacity'", "'card.gap'"]],
    ['ui/primitives/LitSurface.tsx', ["'card.liftScale'"]],
    ['ui/primitives/ListRow.tsx', ["'listRow.paddingX'", "'listRow.textGap'", "'listRow.fill'"]],
    ['components/Button.tsx', ['`button.${variant}.height`', '`button.${variant}.fill`', "'button.iconGap'", "'button.pressedOpacity'", "'button.disabledOpacity'"]],
    ['components/Chip.tsx', ["'chip.paddingX'", "'chip.radius'", "'chip.borderWidth'"]],
    ['ui/primitives/StatusPill.tsx', ["'pill.paddingX'", "'pill.radius'"]],
    ['ui/primitives/SearchBar.tsx', ["'search.height'", "'search.fill'", "'search.focusBorder'", "'search.focusGlow'", "'search.placeholderColor'", "'search.iconSize'"]],
    ['ui/primitives/Toggle.tsx', ["'toggle.trackWidth'", "'toggle.knobSize'"]],
  ];
  for (const [path, keys] of wearers) {
    const source = stripComments(await read(path));
    for (const key of keys) {
      assert.ok(source.includes(key), `${path} must read the ${key} dial`);
    }
  }
  // The lit wash dial SCALES the caller's calibration — the pinned litFill
  // call shape survives, so the litSurface fence and this one agree.
  const lit = stripComments(await read('ui/primitives/LitSurface.tsx'));
  assert.match(lit, /liftAlphaProp \* liftScale/);
});

// ---------------------------------------------------------------------------
// Chrome/Header and Layout (S2 C9)
// ---------------------------------------------------------------------------

test('chrome and layout dials: defaults mirror the shipped values; spacing/dividers stay honestly absent', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  const ctx = await contextFor();

  assert.equal(byKey.get('header.padX').defaultValue(ctx), tokens.spacing.lg);
  assert.equal(byKey.get('header.padY').defaultValue(ctx), tokens.spacing.md);
  assert.equal(byKey.get('header.minHeight').defaultValue(ctx), 0, 'content-driven today');
  assert.equal(byKey.get('header.titleAlign').defaultValue(ctx), 'auto');
  assert.deepEqual([...byKey.get('header.titleAlign').options], ['auto', 'left', 'center']);
  assert.equal(byKey.get('header.backSize').defaultValue(ctx), 26);
  assert.equal(byKey.get('header.backOffsetX').defaultValue(ctx), -tokens.spacing.xs);
  assert.equal(byKey.get('header.borderBottomWidth').defaultValue(ctx), 0, 'no hairline ships today');
  assert.equal(byKey.get('header.stepBarHeight').defaultValue(ctx), 4);

  assert.equal(byKey.get('layout.pagePadding').defaultValue(ctx), tokens.layout.screenGutter);
  assert.equal(byKey.get('layout.formSectionGap').defaultValue(ctx), tokens.spacing.lg);
  assert.equal(byKey.get('layout.detailSectionGap').defaultValue(ctx), tokens.spacing.xl);

  // The honest absences: a spacing multiplier or per-step token dial would
  // silently do nothing (the tokens are consumed at stylesheet build time),
  // and dividers have no shared primitive — both wait for the sweep.
  const spacingEntries = schema.STUDIO_REGISTRY.filter((entry) => entry.category === 'spacing');
  const dividerEntries = schema.STUDIO_REGISTRY.filter((entry) => entry.category === 'borders');
  assert.deepEqual(spacingEntries, [], 'no dead spacing dials — the omission is the report’s');
  assert.deepEqual(dividerEntries, [], 'no dead divider dials — the omission is the report’s');
});

test('[static] the chrome and templates read their dials through the override layer', async () => {
  const headerSource = stripComments(await read('components/ScreenHeader.tsx'));
  for (const key of ["'header.padX'", "'header.titleAlign'", "'header.backSize'", "'header.borderBottomWidth'"]) {
    assert.ok(headerSource.includes(key), `ScreenHeader must read the ${key} dial`);
  }
  const stepSource = stripComments(await read('ui/primitives/StepHeader.tsx'));
  for (const key of ["'header.stepPadX'", "'header.stepBarHeight'"]) {
    assert.ok(stepSource.includes(key), `StepHeader must read the ${key} dial`);
  }
  for (const [path, gapKey] of [
    ['ui/templates/FormScreen.tsx', "'layout.formSectionGap'"],
    ['ui/templates/DetailScreen.tsx', "'layout.detailSectionGap'"],
  ]) {
    const source = stripComments(await read(path));
    for (const key of ["'layout.pagePadding'", "'layout.contentTopPad'", gapKey]) {
      assert.ok(source.includes(key), `${path} must read the ${key} dial`);
    }
  }
});

// ---------------------------------------------------------------------------
// Shadows & Glows (S2 C10)
// ---------------------------------------------------------------------------

test('shadow and glow dials: per-surface defaults, glow-on-selection ships OFF, no spread anywhere', async () => {
  const schema = await schemaModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  const ctx = await contextFor();
  const light = { ...ctx, isDark: false };

  assert.equal(byKey.get('card.shadowColor').defaultValue(light), '#10261D', '§I’s shadow ink');
  assert.equal(byKey.get('card.shadowColor').defaultValue(ctx), '#000000', 'GROUND1’s black');
  assert.equal(byKey.get('card.elevation').defaultValue(ctx), 6);
  assert.equal(byKey.get('card.elevation').defaultValue(light), 3);
  assert.equal(byKey.get('button.primary.shadowOpacity').defaultValue(ctx), 0, 'the hero carries no shadow today');
  assert.equal(byKey.get('sheet.shadowOpacity').defaultValue(ctx), 0.14, 'the raised lift');
  assert.equal(byKey.get('glow.chipSelection').defaultValue(ctx), false, 'chips do not glow today');
  assert.equal(byKey.get('glow.chipSelection').kind, 'boolean');

  // RN renders no shadow spread — no dial may pretend otherwise. (nav.spread
  // is TAB spread, a layout quantity, and is deliberately not caught here.)
  for (const entry of schema.STUDIO_REGISTRY) {
    assert.ok(
      !/shadow.*spread|spread.*shadow/i.test(`${entry.key} ${entry.plainLabel}`),
      `${entry.key}: no shadow-spread dial`,
    );
  }
});

test('[static] the glow follows selection and the depth dials reach their surfaces', async () => {
  const chip = stripComments(await read('components/Chip.tsx'));
  assert.match(chip, /'glow\.chipSelection'/);
  assert.match(
    chip.replace(/\s+/g, ' '),
    /chipGlowOn && goldSelected \? glow\.halo\(withAlpha\(chosen\.line, glowAlphaDial \?\? SURFACE_GLOW_ALPHA\)\) : null/,
    'the CHOSEN chip lights at the global glow strength; the rest stay dark',
  );
  assert.match(stripComments(await read('ui/primitives/JobCard.tsx')), /'card\.shadowColor'/);
  assert.match(stripComments(await read('components/Button.tsx')), /'button\.primary\.shadowOpacity'/);
  assert.match(stripComments(await read('ui/primitives/BottomNav.tsx')), /'create\.glowColor'/);
  for (const path of [
    'components/ActionSheet.tsx',
    'components/ConfirmDialog.tsx',
    'components/AmountPrompt.tsx',
  ]) {
    assert.match(stripComments(await read(path)), /'sheet\.shadowOpacity'/, `${path} lift dial`);
  }
});

// ---------------------------------------------------------------------------
// History, presets, export and import (S2 C4)
// ---------------------------------------------------------------------------

/** lib/designStudioHistory.ts, executed against the executed store. */
const historyModule = (async () => {
  const overrides = await overridesModule;
  globalThis.__S2_OVERRIDES__ = overrides;
  const js = stripTypeScriptTypes(await read('lib/designStudioHistory.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{[^}]*\} from 'react';/,
      'const useSyncExternalStore = () => { throw new Error("hooks are not under test"); };',
    )
    .replace(
      /import \{[\s\S]*?\} from '\.\/designOverrides';/,
      'const { getDesignOverrides, setDesignOverrides, setDesignOverridesChangeListener } = globalThis.__S2_OVERRIDES__;',
    );
  assert.doesNotMatch(stubbed, /from '(?:react|\.[^']*)'/, 'history imports must be stubbed');
  return import(toDataUrl(stubbed));
})();

test('history: every override change is one undoable step, bounded, with redo', async () => {
  const o = await overridesModule;
  const h = await historyModule;
  assert.ok(h.HISTORY_LIMIT >= 50, 'the dispatch floor is a 50-step stack');
  o.resetDesignOverrides();
  h.resetDesignHistory();
  try {
    o.patchDesignOverrides({ glowAlpha: 0.3 });
    o.patchDesignOverrides({ navRadius: 8 });
    assert.equal(h.canUndoDesignChange(), true);

    h.undoDesignChange();
    assert.equal(o.getDesignOverrides().navRadius, undefined, 'undo removes the last step');
    assert.equal(o.getDesignOverrides().glowAlpha, 0.3, 'earlier steps survive');
    assert.equal(h.canRedoDesignChange(), true);

    h.redoDesignChange();
    assert.equal(o.getDesignOverrides().navRadius, 8, 'redo reapplies the undone step');

    // Undo of undo's own write must not be re-recorded: two undos walk back
    // to the empty set, never ping-pong.
    h.undoDesignChange();
    h.undoDesignChange();
    assert.deepEqual(o.getDesignOverrides(), { materials: {} });
    assert.equal(h.canUndoDesignChange(), false);

    // A new change clears the redo branch.
    o.patchDesignOverrides({ glowAlpha: 0.5 });
    assert.equal(h.canRedoDesignChange(), false);

    // Bounded: flooding past the limit keeps the stack at the limit.
    for (let i = 0; i < h.HISTORY_LIMIT + 25; i += 1) {
      o.patchDesignOverrides({ navRadius: (i % 20) + 1 });
    }
    let undos = 0;
    while (h.canUndoDesignChange() && undos < 1000) {
      h.undoDesignChange();
      undos += 1;
    }
    assert.ok(undos <= h.HISTORY_LIMIT, `stack must stay bounded (walked ${undos})`);
  } finally {
    o.resetDesignOverrides();
    h.resetDesignHistory();
  }
});

test('history: an atomic apply (import / preset load) is one undoable step', async () => {
  const o = await overridesModule;
  const h = await historyModule;
  const schema = await schemaModule;
  o.resetDesignOverrides();
  h.resetDesignHistory();
  try {
    const ctx = await contextFor();
    const sanitized = schema.sanitizeOverrides(
      { glowAlpha: 0.4, materials: { chrome: { blur: 50 } } },
      ctx,
    );
    o.setDesignOverrides(sanitized.overrides);
    assert.equal(o.getDesignOverrides().glowAlpha, 0.4);
    h.undoDesignChange();
    assert.deepEqual(o.getDesignOverrides(), { materials: {} }, 'one undo reverts the whole import');
  } finally {
    o.resetDesignOverrides();
    h.resetDesignHistory();
  }
});

test('sanitize: a raw override object round-trips; junk is dropped and listed, never applied', async () => {
  const schema = await schemaModule;
  const ctx = await contextFor();

  const good = schema.sanitizeOverrides(
    {
      materials: { chrome: { blur: 44, scrimAlpha: 0.6 }, sheet: { borderAlpha: 0.3 } },
      glowAlpha: 0.31,
      navRadius: 12,
      gold: 'dcab60',
      values: {},
      palette: { dark: { 'app.text': '#abc' } },
    },
    ctx,
  );
  assert.deepEqual(good.dropped, []);
  assert.equal(good.overrides.materials.chrome.blur, 44);
  assert.equal(good.overrides.gold, '#DCAB60', 'hex normalises');
  assert.equal(good.overrides.palette.dark['app.text'], '#AABBCC', 'shorthand hex expands');
  assert.equal('values' in good.overrides, false, 'an empty bag never materialises');

  const junk = schema.sanitizeOverrides(
    {
      materials: { chrome: { blur: 'loud', scrimColor: '#071B20' }, kitchen: { blur: 10 } },
      glowAlpha: Number.POSITIVE_INFINITY,
      navRadius: 999,
      cardFill: 'not-a-colour',
      values: { 'no.such.entry': 5, 'material.chrome.blur': 51 },
      palette: { dark: { 'app.notARole': '#111111', 'emerald.bg': '#101010' }, mars: {} },
      utterlyUnknown: true,
    },
    ctx,
  );
  assert.equal(junk.overrides.materials.chrome.scrimColor, '#071B20', 'valid keys beside junk survive');
  assert.equal(junk.overrides.materials.chrome.blur, undefined, 'a non-numeric blur is dropped');
  assert.equal(junk.overrides.navRadius, 40, 'out-of-range clamps to the schema max');
  assert.equal(junk.overrides.glowAlpha, undefined, 'a non-finite number is dropped');
  assert.equal(junk.overrides.cardFill, undefined);
  assert.equal(
    'values' in junk.overrides,
    false,
    'a bag key that is not bag-addressed is junk — it would sit unread',
  );
  assert.equal(junk.overrides.palette.dark['emerald.bg'], '#101010');
  for (const expected of [
    'materials.chrome.blur',
    'materials.kitchen',
    'glowAlpha',
    'cardFill',
    'values.no.such.entry',
    'values.material.chrome.blur',
    'palette.dark.app.notARole',
    'palette.mars',
    'utterlyUnknown',
  ]) {
    assert.ok(junk.dropped.includes(expected), `dropped list must name ${expected} (got ${junk.dropped.join(', ')})`);
  }

  // Malformed roots can never crash or partially apply.
  for (const bad of [null, undefined, 42, 'overrides', [1, 2], true]) {
    const result = schema.sanitizeOverrides(bad, ctx);
    assert.deepEqual(result.overrides, { materials: {} });
    assert.ok(result.dropped.length > 0);
  }
});

test('sanitize: the grouped export shape imports through the same path', async () => {
  const schema = await schemaModule;
  const ctx = await contextFor();
  const result = schema.sanitizeOverrides(
    {
      'Blur & Material': [
        { technicalKey: 'materials.menu.blur', scope: 'token', value: 60, default: 50 },
        { technicalKey: 'materials.menu.nonsense', value: 1 },
        'not an item',
      ],
      Navigation: [{ technicalKey: 'navBottomPad', scope: 'token', value: 10 }],
      Colors: [{ technicalKey: 'palette.light.app.text', value: '#112233' }],
    },
    ctx,
  );
  assert.equal(result.overrides.materials.menu.blur, 60);
  assert.equal(result.overrides.navBottomPad, 10);
  assert.equal(result.overrides.palette.light['app.text'], '#112233');
  assert.ok(result.dropped.includes('materials.menu.nonsense'));
  assert.ok(result.dropped.some((entry) => entry.includes('unreadable item')));
});

test('export: modified values only, grouped, carrying technicalKey and scope', async () => {
  const o = await overridesModule;
  const schema = await schemaModule;
  o.resetDesignOverrides();
  try {
    assert.deepEqual(schema.exportModifiedOverrides(await contextFor()), {}, 'no overrides, no payload');

    o.patchMaterialOverride('chrome', { blur: 44 });
    o.patchDesignOverrides({ navRadius: 12 });
    o.setPaletteTokenOverride('dark', 'app.text', '#AABBCC');
    const grouped = schema.exportModifiedOverrides(await contextFor());

    assert.deepEqual(Object.keys(grouped).sort(), ['Blur & Material', 'Colors', 'Navigation']);
    const blur = grouped['Blur & Material'][0];
    assert.deepEqual(blur, {
      technicalKey: 'materials.chrome.blur',
      scope: 'token',
      value: 44,
      default: (await tokensModule).materials.chrome.blur,
    });
    const colour = grouped.Colors[0];
    assert.equal(colour.technicalKey, 'palette.dark.app.text');
    assert.equal(colour.scope, 'token');
    assert.equal(colour.value, '#AABBCC');
    // The export round-trips through the import path byte-for-value.
    const reimported = schema.sanitizeOverrides(grouped, await contextFor());
    assert.deepEqual(reimported.dropped, []);
    assert.equal(reimported.overrides.materials.chrome.blur, 44);
    assert.equal(reimported.overrides.navRadius, 12);
    assert.equal(reimported.overrides.palette.dark['app.text'], '#AABBCC');
  } finally {
    o.resetDesignOverrides();
  }
});

/** lib/designStudioPresets.ts, executed with AsyncStorage shimmed. */
const presetsModuleWith = async (shim) => {
  globalThis.__S2_STORAGE_SHIM__ = shim;
  const js = stripTypeScriptTypes(await read('lib/designStudioPresets.ts'), { mode: 'strip' });
  const stubbed = js.replace(
    /import AsyncStorage from '@react-native-async-storage\/async-storage';/,
    'const AsyncStorage = globalThis.__S2_STORAGE_SHIM__;',
  );
  assert.doesNotMatch(stubbed, /from '(?:@|\.[^']*)'/, 'presets imports must be stubbed');
  return import(toDataUrl(`${stubbed}\n// presets case ${presetsCase++}`));
};
let presetsCase = 0;

test('presets: save / load / rename / duplicate / delete round-trip under the versioned key', async () => {
  const store = new Map();
  const p = await presetsModuleWith({
    getItem: async (key) => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => {
      store.set(key, String(value));
    },
  });
  assert.equal(p.DESIGN_STUDIO_PRESETS_KEY, 'brazos.designstudio.presets.v1');

  const overrides = { materials: {}, glowAlpha: 0.4 };
  assert.equal(await p.saveDesignPreset('warm glass', overrides), true);
  assert.ok(store.has('brazos.designstudio.presets.v1'), 'the versioned key is the one home');
  assert.deepEqual(await p.loadDesignPreset('warm glass'), overrides);

  assert.equal(await p.duplicateDesignPreset('warm glass'), true);
  assert.deepEqual(
    (await p.listDesignPresets()).map((preset) => preset.name),
    ['warm glass', 'warm glass copy'],
  );

  assert.equal(await p.renameDesignPreset('warm glass copy', 'warm glass'), false, 'rename never clobbers');
  assert.equal(await p.renameDesignPreset('warm glass copy', 'cool glass'), true);
  assert.equal(await p.deleteDesignPreset('warm glass'), true);
  assert.deepEqual((await p.listDesignPresets()).map((preset) => preset.name), ['cool glass']);
  assert.equal(await p.deleteDesignPreset('never existed'), false);

  // Junk in storage reads as empty, never a crash.
  store.set('brazos.designstudio.presets.v1', '{broken json');
  assert.deepEqual(await p.listDesignPresets(), []);
});

test('presets: a broken store is swallowed, never thrown', async () => {
  const p = await presetsModuleWith({
    getItem: async () => {
      throw new Error('storage down');
    },
    setItem: async () => {
      throw new Error('storage down');
    },
  });
  assert.deepEqual(await p.listDesignPresets(), []);
  assert.equal(await p.saveDesignPreset('x', { materials: {} }), false);
  assert.equal(await p.loadDesignPreset('x'), null);
  assert.equal(await p.deleteDesignPreset('x'), false);
});

test('pins: the pinned set round-trips under its own versioned key, and a broken store is swallowed', async () => {
  const store = new Map();
  const p = await presetsModuleWith({
    getItem: async (key) => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => {
      store.set(key, String(value));
    },
  });
  assert.equal(p.DESIGN_STUDIO_PINS_KEY, 'brazos.designstudio.pins.v1');

  // Nothing stored yet reads as nothing pinned.
  assert.deepEqual(await p.loadDesignPins(), []);
  assert.equal(await p.saveDesignPins(['nav.barHeight', 'material.chrome.blur']), true);
  assert.ok(store.has('brazos.designstudio.pins.v1'), 'pins live under their own versioned key');
  assert.deepEqual(await p.loadDesignPins(), ['nav.barHeight', 'material.chrome.blur']);
  // Unpinning everything is a write, not a delete — the empty set persists.
  assert.equal(await p.saveDesignPins([]), true);
  assert.deepEqual(await p.loadDesignPins(), []);
  // Junk in storage reads as empty, never a crash — the presets posture.
  store.set('brazos.designstudio.pins.v1', '{broken json');
  assert.deepEqual(await p.loadDesignPins(), []);
  store.set('brazos.designstudio.pins.v1', '{"not":"an array"}');
  assert.deepEqual(await p.loadDesignPins(), []);
  store.set('brazos.designstudio.pins.v1', '["ok", 7, null, ""]');
  assert.deepEqual(await p.loadDesignPins(), ['ok'], 'non-string entries are dropped');

  // The presets key is untouched by any of it.
  assert.equal(store.has('brazos.designstudio.presets.v1'), false);

  const broken = await presetsModuleWith({
    getItem: async () => {
      throw new Error('storage down');
    },
    setItem: async () => {
      throw new Error('storage down');
    },
  });
  assert.deepEqual(await broken.loadDesignPins(), []);
  assert.equal(await broken.saveDesignPins(['x']), false);
});

test('[static] S3: stars are gone and the long-press pin chip replaces them', async () => {
  const panel = stripComments(await read('components/DesignStudioPanel.tsx'));
  const flat = panel.replace(/\s+/g, ' ');

  // D6 — STARS ARE GONE EVERYWHERE.
  assert.doesNotMatch(panel, /'star'/, 'the star glyph must be gone');
  assert.doesNotMatch(panel, /'star-outline'/, 'the star-outline glyph must be gone');
  assert.doesNotMatch(panel, /favourite/i, 'the favourites state must be gone');

  // The chip: raised by a LONG PRESS on the label block, reading "Pin
  // control" or "Unpin control", clearing itself after 3 s or on tap.
  assert.match(flat, /onLongPress=\{onRequestPin\}/, 'the label block raises the chip');
  assert.match(flat, /'Unpin control' : 'Pin control'/, 'the chip names both directions');
  assert.match(flat, /setTimeout\(\(\) => setPinChip\(null\), 3000\)/, 'the chip clears after 3 s');
  assert.match(flat, /onPress=\{onTogglePin\}/, 'tapping the chip toggles the pin');

  // Persistence rides the presets module — the studio's one storage boundary.
  assert.match(panel, /loadDesignPins/, 'pins load on mount');
  assert.match(panel, /saveDesignPins/, 'pins save on every change');
  assert.match(flat, /void loadDesignPins\(\)\.then/, 'the load is fired once, on mount');
  assert.doesNotMatch(panel, /AsyncStorage/, 'the panel never touches storage directly');

  // The Pinned section: full rows, at the very top, absent when empty, and
  // the entries stay in their categories (the registry map is untouched).
  assert.match(flat, /const renderPinned = \(\) => \{ if \(!pinnedEntries\.length\) return null;/);
  assert.match(flat, /\{renderPinned\(\)\} \{STUDIO_CATEGORIES\.map\(renderCategory\)\}/, 'Pinned renders FIRST');
  assert.match(flat, />\s*Pinned\s*</, 'the section names itself');
  // The Modified filter applies to the Pinned section too.
  assert.match(
    flat,
    /return modifiedOnly \? list\.filter\(\(entry\) => isModified\(entry, ctx\)\) : list;/,
    'the Modified filter narrows the Pinned section',
  );
});

test('[static] the four destructive acts confirm; dial changes and per-token resets never do', async () => {
  const panel = stripComments(await read('components/DesignStudioPanel.tsx'));
  for (const title of [
    'Reset everything?',
    'Import overrides?',
    'Apply raw overrides?',
  ]) {
    assert.ok(panel.includes(title), `missing confirm: ${title}`);
  }
  assert.match(panel, /title: `Reset \$\{label\}\?`/, 'section resets confirm');
  assert.match(panel, /title: `Load “\$\{preset\.name\}”\?`/, 'preset load over changes confirms');
  assert.match(panel, /title: `Delete “\$\{preset\.name\}”\?`/, 'preset delete confirms');
  assert.match(panel, /from '\.\.\/lib\/dialog'/, 'confirms ride the shared dialog helper (real iOS Alert.alert on device)');
  // The stepper path applies live — no confirmAsync may sit inside it.
  const stepper = panel.slice(panel.indexOf('function StepperEditor'), panel.indexOf('function ColorEditor'));
  assert.doesNotMatch(stepper, /confirmAsync/, 'dial changes apply live, no confirm');
  // Export rides RN's built-in Share, never a clipboard module.
  assert.match(panel, /Share\.share\(\{ message: exportJson \}\)/);
  assert.doesNotMatch(panel, /expo-clipboard/, 'the clipboard native module is absent from the installed binary');
});

// ---------------------------------------------------------------------------
// The Colors category (S2 C5)
// ---------------------------------------------------------------------------

/** ui/colorMath.ts — import-free, executed directly. */
const colorMathModule = (async () => {
  const js = stripTypeScriptTypes(await read('ui/colorMath.ts'), { mode: 'strip' });
  assert.doesNotMatch(js, /from '/, 'ui/colorMath.ts must stay import-free');
  return import(toDataUrl(js));
})();

test('colour math: parse/format round-trips, HSL wraps and clamps, WCAG contrast agrees with the G1 fence', async () => {
  const m = await colorMathModule;

  assert.deepEqual(m.parseHex('#D4A24C'), { r: 212, g: 162, b: 76, alpha: null });
  assert.deepEqual(m.parseHex('d4a24c'), { r: 212, g: 162, b: 76, alpha: null });
  assert.deepEqual(m.parseHex('#abc'), { r: 170, g: 187, b: 204, alpha: null });
  assert.equal(m.parseHex('#D4A24C80').alpha.toFixed(3), (128 / 255).toFixed(3));
  assert.equal(m.parseHex('#D4A2'), null);
  assert.equal(m.parseHex('not a colour'), null);
  assert.equal(m.formatHex(212, 162, 76, null), '#D4A24C');
  assert.equal(m.formatHex(212, 162, 76, 0.5), '#D4A24C80');

  // HSL round-trip lands back on the same bytes for a representative set.
  for (const hex of ['#D4A24C', '#02110D', '#F1EDE1', '#5FAE81', '#000000', '#FFFFFF']) {
    const { r, g, b } = m.parseHex(hex);
    const hsl = m.rgbToHsl(r, g, b);
    assert.equal(m.hslToHex(hsl.h, hsl.s, hsl.l, null), hex, `${hex} must round-trip`);
  }
  // The hue stepper wraps; saturation and lightness clamp.
  const red = m.rgbToHsl(255, 0, 0);
  assert.equal(Math.round(red.h), 0);
  assert.equal(m.hslToHex(-2, 100, 50, null), m.hslToHex(358, 100, 50, null));
  assert.equal(m.hslToHex(362, 100, 50, null), m.hslToHex(2, 100, 50, null));
  assert.equal(m.hslToHex(0, 120, 50, null), m.hslToHex(0, 100, 50, null));
  assert.equal(m.hslToHex(0, 100, -10, null), '#000000');

  // The SAME WCAG formula the G1 material fence runs (themeTokens.test.mjs):
  // identical inputs must give identical answers, so the studio's readout
  // and the executed fence can never disagree.
  assert.ok(Math.abs(m.contrastRatio('#FFFFFF', '#000000') - 21) < 1e-9);
  assert.equal(
    m.contrastRatio('#FFFFFF', '#000000'),
    m.contrastRatio('#000000', '#FFFFFF'),
    'contrast is symmetric',
  );
  const fenceLuminance = (hex) => {
    const channel = (byte) => {
      const c = byte / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  for (const hex of ['#F1EDE1', '#93A096', '#071B15', '#D4A24C']) {
    assert.equal(m.relativeLuminance(hex), fenceLuminance(hex), `${hex}: one luminance formula`);
  }
  assert.equal(m.contrastRatio('junk', '#000000'), null, 'unreadable input warns as absent, never throws');
});

test('colour tokens: enumerated at runtime, both surfaces, both themes — a new token needs no edit', async () => {
  const schema = await schemaModule;
  const o = await overridesModule;
  const ctx = await contextFor();

  const entries = schema.colorTokenEntries(ctx, 'dark');
  assert.equal(
    entries.length,
    Object.keys(ctx.appLight).length + Object.keys(ctx.emeraldLight).length,
    'one entry per palette token per surface',
  );
  for (const entry of entries) {
    assert.ok(entry.plainLabel.trim().length > 0, `${entry.key}: empty label`);
    assert.ok(entry.description.trim().length > 0, `${entry.key}: empty description`);
    assert.equal(entry.kind, 'color');
    assert.equal(entry.category, 'colors');
    assert.equal(entry.technicalKey, entry.key);
  }

  // Defaults ARE the palette's own values.
  const emeraldBg = entries.find((entry) => entry.key === 'palette.dark.emerald.bg');
  assert.ok(emeraldBg, 'ui/tokens tokens must enumerate');
  assert.equal(emeraldBg.defaultValue(ctx), ctx.emeraldDark.bg);

  // Writes round-trip through the palette bank, and clear again.
  try {
    emeraldBg.write('#101010');
    const live = await contextFor();
    assert.equal(emeraldBg.overrideValue(live), '#101010');
    assert.equal(o.getDesignOverrides().palette.dark['emerald.bg'], '#101010');
    emeraldBg.write(undefined);
    assert.equal('palette' in o.getDesignOverrides(), false);
  } finally {
    o.resetDesignOverrides();
  }

  // The contrast ground pairs an ink with its ground and a ground with its ink.
  const text = entries.find((entry) => entry.key === 'palette.dark.app.text');
  assert.equal(text.contrastGround(ctx).label, 'background');
  const surface = entries.find((entry) => entry.key === 'palette.dark.app.surface');
  assert.equal(surface.contrastGround(ctx).label, 'text');

  // A NEW TOKEN APPEARS WITH NO PANEL EDIT: enumeration reads the palettes.
  const grown = {
    ...ctx,
    appLight: { ...ctx.appLight, brandNewRole: '#123456' },
  };
  const grownEntries = schema.colorTokenEntries(grown, 'light');
  const added = grownEntries.find((entry) => entry.key === 'palette.light.app.brandNewRole');
  assert.ok(added, 'a token added to the palette must appear in the studio');
  assert.equal(added.plainLabel, 'Brand new role');
});

test('[static] the colour editor is HSL + hex + alpha + live contrast, and the G1 cycles are gone', async () => {
  const panel = stripComments(await read('components/DesignStudioPanel.tsx'));
  assert.match(panel, /colorTokenEntries\(ctx, colorTheme\)/, 'the Colors category enumerates at runtime');
  assert.match(panel, /setColorTheme/, 'the light/dark toggle must exist');
  assert.match(panel, /hslToHex\(hsl\.h \+ direction \* 2/, 'hue steps ±2');
  assert.match(panel, /clamp\(hsl\.s \+ direction \* 2, 0, 100\)/, 'saturation steps ±2, clamped');
  assert.match(panel, /clamp\(hsl\.l \+ direction \* 2, 0, 100\)/, 'lightness steps ±2, clamped');
  assert.match(panel, /parsed\.alpha != null \?/, 'the alpha stepper appears only where alpha exists');
  assert.match(panel, /ratio < 4\.5 && styles\.contrastLow/, 'the contrast readout warns below 4.5:1');
  assert.match(panel, /contrastRatio\(current, ground\.hex\)/);

  const tokens = await read('ui/tokens.ts');
  assert.doesNotMatch(tokens, /STUDIO_GOLD_CYCLE\s*=/, 'the gold cycle is retired');
  assert.doesNotMatch(tokens, /STUDIO_CARD_FILL_CYCLE\s*=/, 'the card-fill cycle is retired');
});

// ---------------------------------------------------------------------------
// The generalised override layer (S2 C1)
// ---------------------------------------------------------------------------

test('overrides: the values bag round-trips, prunes to nothing, and never disturbs its neighbours', async () => {
  const o = await overridesModule;
  try {
    o.setOverrideValue('card.radius', 20);
    o.setOverrideValue('nav.iconSize', 31);
    assert.equal(o.getOverrideValue('card.radius'), 20);
    assert.deepEqual(o.getDesignOverrides().values, { 'card.radius': 20, 'nav.iconSize': 31 });
    o.setOverrideValue('card.radius', undefined);
    assert.equal(o.getOverrideValue('card.radius'), undefined);
    assert.deepEqual(o.getDesignOverrides().values, { 'nav.iconSize': 31 });
    o.setOverrideValue('nav.iconSize', undefined);
    assert.equal(
      'values' in o.getDesignOverrides(),
      false,
      'an emptied bag must leave the override object, not linger as {}',
    );
  } finally {
    o.resetDesignOverrides();
  }
  assert.deepEqual(o.getDesignOverrides(), { materials: {} });
});

test('overrides: palette banks apply per theme and per namespace, and clear cleanly', async () => {
  const o = await overridesModule;
  const appDark = { gold: '#D4A24C', surface: '#0A1813', text: '#F1EDE1' };
  const emeraldDark = { gold: '#D4A24C', surface: '#0A1813', bg: '#02110D' };
  try {
    o.setPaletteTokenOverride('dark', 'app.text', '#AABBCC');
    o.setPaletteTokenOverride('dark', 'emerald.bg', '#101010');
    o.setPaletteTokenOverride('light', 'app.text', '#112233');

    const darkApp = o.applyPaletteOverrides(appDark, o.getDesignOverrides(), true, 'app');
    assert.equal(darkApp.text, '#AABBCC');
    assert.equal(darkApp.gold, appDark.gold, 'only the dialled role moves');
    const darkEmerald = o.applyPaletteOverrides(emeraldDark, o.getDesignOverrides(), true, 'emerald');
    assert.equal(darkEmerald.bg, '#101010');
    assert.equal(
      darkEmerald.text,
      undefined,
      'an app-namespace key must never leak into the emerald palette',
    );
    // The light bank does not reach a dark resolution and vice versa.
    const lightApp = o.applyPaletteOverrides(appDark, o.getDesignOverrides(), false, 'app');
    assert.equal(lightApp.text, '#112233');
    assert.equal(lightApp.surface, appDark.surface, 'cardFill untouched — light never reads it');

    // A key the palette does not carry is ignored, never invented.
    o.setPaletteTokenOverride('dark', 'app.notARole', '#FF0000');
    const still = o.applyPaletteOverrides(appDark, o.getDesignOverrides(), true, 'app');
    assert.equal('notARole' in still, false);

    // Clearing every key dissolves the banks entirely.
    o.setPaletteTokenOverride('dark', 'app.text', undefined);
    o.setPaletteTokenOverride('dark', 'emerald.bg', undefined);
    o.setPaletteTokenOverride('dark', 'app.notARole', undefined);
    o.setPaletteTokenOverride('light', 'app.text', undefined);
    assert.equal('palette' in o.getDesignOverrides(), false, 'emptied banks must dissolve');
  } finally {
    o.resetDesignOverrides();
  }
  // Identity when empty — the G1 contract, restated over the new fields.
  assert.equal(o.applyPaletteOverrides(appDark, o.getDesignOverrides(), true, 'app'), appDark);
});

test('overrides: the legacy G1 dials keep last word over the banks', async () => {
  const o = await overridesModule;
  const appDark = { gold: '#D4A24C', surface: '#0A1813' };
  try {
    o.setPaletteTokenOverride('dark', 'app.gold', '#111111');
    o.patchDesignOverrides({ gold: '#DCAB60' });
    const resolved = o.applyPaletteOverrides(appDark, o.getDesignOverrides(), true, 'app');
    assert.equal(resolved.gold, '#DCAB60', 'the recorded G1 dial behaviour is unchanged');
  } finally {
    o.resetDesignOverrides();
  }
});
