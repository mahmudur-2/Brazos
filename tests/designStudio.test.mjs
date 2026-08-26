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

/** ui/designStudioSchema.ts, executed against the executed override store. */
const schemaModule = (async () => {
  const overrides = await overridesModule;
  globalThis.__S2_OVERRIDES__ = overrides;
  const js = stripTypeScriptTypes(await read('ui/designStudioSchema.ts'), { mode: 'strip' });
  const stubbed = js.replace(
    /import \{[\s\S]*?\} from '\.\.\/lib\/designOverrides';/,
    'const { STATIC_MATERIALS, getDesignOverrides, patchDesignOverrides, patchMaterialOverride, setOverrideValue } = globalThis.__S2_OVERRIDES__;',
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
    appLight: { gold: tokens.brand.gold, surface: '#FFFFFF' },
    appDark: { gold: tokens.dark.gold, surface: tokens.dark.surface },
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
// Panel ergonomics (S2 C3) — the clamp, executed
// ---------------------------------------------------------------------------

test('clamp: the header can never leave the safe interactive area, at min and max height', async () => {
  const js = stripTypeScriptTypes(await read('ui/designStudioLayout.ts'), { mode: 'strip' });
  const layout = await import(toDataUrl(js));
  const { clampPanelRect, panelWidthFor, PANEL_MIN_HEIGHT, PANEL_COLLAPSED_HEIGHT } = layout;

  assert.equal(PANEL_MIN_HEIGHT, 180, 'the dispatched resize floor');

  // A notched iPhone-ish frame: 393x852, status area 59, nav footprint 122.
  const frame = { windowWidth: 393, windowHeight: 852, topInset: 59, bottomInset: 122 };
  const maxY = frame.windowHeight - frame.bottomInset;
  const available = maxY - frame.topInset;

  const heights = [Number.NEGATIVE_INFINITY, -50, 0, PANEL_MIN_HEIGHT, 400, available, 10_000, Number.NaN];
  const positions = [-10_000, -1, 0, 59, 400, 700, 10_000, Number.NaN];
  for (const collapsed of [false, true]) {
    for (const height of heights) {
      for (const y of positions) {
        for (const x of [-10_000, -1, 0, 12, 24, 400, 10_000, Number.NaN]) {
          const next = clampPanelRect({ x, y, height }, frame, collapsed);
          const box = collapsed ? Math.min(PANEL_COLLAPSED_HEIGHT, available) : next.height;
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
  // Collapse is its own affordance: the slim pill names the category and
  // restores height and scroll position.
  assert.match(panel, /Customizing — \{lastCategory\}/);
  assert.match(panel, /panelSession\.scrollY/, 'scroll position must persist for the session');
  // Content scrolls internally at every height: the body flexes inside the
  // sized panel rather than sizing it.
  assert.match(panel, /height: rect\.height/);
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
