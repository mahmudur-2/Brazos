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
      // T1 (C1): the store installs its live-metric reader into ui/tokens.ts's
      // slot at load, so the executed module needs that binding too.
      'const { materials, setMetricSource } = globalThis.__S2_TOKENS__;',
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
      // T1 (C1/C5): the registry declares inheritance and writes the metric
      // bag, so the executed module needs those bindings too.
      'const { DIAL_INHERITANCE_DEPTH_CAP, STATIC_MATERIALS, getDesignOverrides, patchDesignOverrides, patchMaterialOverride, setDialInheritance, setMetricOverride, setOverrideValue, setPaletteTokenOverride } = globalThis.__S2_OVERRIDES__;',
    )
    .replace(
      /import \{[\s\S]*?\} from '\.\/tokens';/,
      // T1 (C4/C5): the divider dials read DIVIDER_DEFAULTS, and every metric
      // dial reads the shipped table its getter resolves through — never the
      // live getter, which would report a dialled value as the default.
      'const { CONTROL_DEFAULTS, controls, DIVIDER_DEFAULTS, layout, LAYOUT_METRIC_DEFAULTS, navBar, radius: tokenRadius, RADIUS_DEFAULTS, shadows: tokenShadows, spacing, SPACING_DEFAULTS, THEME_RADIUS_DEFAULTS, THEME_SPACING_DEFAULTS } = globalThis.__S2_TOKENS__;',
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
      border: '#DDD6C4',
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
      border: '#55482E',
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

  // expo-updates is named ONLY in the sanctioned seams — the same boundary
  // rule expo-blur has.
  //
  // R2 ADDED THE SECOND SEAM, and the allow-list is why this is a re-point
  // rather than a hole. lib/observability/sentry.ts tags every crash report
  // with the OTA update actually running inside the binary; without it a stack
  // trace names a release but not the update that broke it, and an update that
  // only breaks on one channel is unattributable. It reads expo-updates
  // through the IDENTICAL lazy caught require, and that shape is asserted
  // below for both members rather than assumed — so being on this list buys an
  // exemption from the walk, never from the boundary rule the walk enforces.
  const SANCTIONED_UPDATES_READERS = [
    'lib/designStudioGate.ts',
    'lib/observability/sentry.ts',
  ];

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
        if (SANCTIONED_UPDATES_READERS.includes(rel)) continue;
        if (/expo-updates/.test(stripComments(readFileSync(join(root, rel), 'utf8')))) {
          offenders.push(rel);
        }
      }
    }
  };
  for (const dir of ['components', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui']) walk(dir);
  assert.deepEqual(
    offenders,
    [],
    'expo-updates is read only by the sanctioned seams in SANCTIONED_UPDATES_READERS',
  );

  // NON-VACUITY, and the reason the allow-list cannot rot into a blanket
  // exemption: every module on it must still exist, must still name
  // expo-updates, and must still reach it through the caught require. An entry
  // whose file was deleted or which stopped reading the module at all would
  // otherwise sit here forever, silently widening the exemption.
  for (const rel of SANCTIONED_UPDATES_READERS) {
    const source = stripComments(readFileSync(join(root, rel), 'utf8')).replace(/\s+/g, ' ');
    assert.match(
      source,
      /require\('expo-updates'\)/,
      `${rel} is on the allow-list but no longer reads expo-updates`,
    );
    assert.match(
      source,
      /try \{[^}]*require\('expo-updates'\)[^}]*\} catch \{ return null; \}/,
      `${rel} must reach expo-updates through one lazy, caught require that falls back to null`,
    );
  }
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
  assert.equal(schema.STUDIO_CATEGORIES.length, 15, "the fourteen dispatched categories, plus RUN T2's Screens");
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
// RUN S3 (C4) — direct entry, executed; and the compact row, fenced
// ---------------------------------------------------------------------------

/** ui/designStudioInput.ts — import-free, executed directly (the colorMath
 *  shape). */
const inputModule = (async () => {
  const js = stripTypeScriptTypes(await read('ui/designStudioInput.ts'), { mode: 'strip' });
  assert.doesNotMatch(js, /\bimport\b/, 'ui/designStudioInput.ts must stay import-free');
  return import(toDataUrl(js));
})();

test('direct entry: every branch of parseDirectEntry, executed', async () => {
  const { parseDirectEntry } = await inputModule;
  const plain = { kind: 'number' };
  const decimal = { kind: 'decimal' };

  // ---- accepted shapes ---------------------------------------------------
  assert.equal(parseDirectEntry('17.5', plain), 17.5, 'a decimal string');
  assert.equal(parseDirectEntry('.25', plain), 0.25, 'a leading-dot decimal');
  assert.equal(parseDirectEntry('-3', plain), -3, 'a negative');
  assert.equal(parseDirectEntry('0', plain), 0, 'zero is a value, not an absence');
  assert.equal(parseDirectEntry('  24  ', plain), 24, 'surrounding whitespace is trimmed');

  // ---- rounding: TWO DECIMALS FOR BOTH KINDS, never a fork ---------------
  assert.equal(parseDirectEntry('17.567', plain), 17.57, 'rounds up at the third decimal');
  assert.equal(parseDirectEntry('1.004', decimal), 1, 'rounds down at the third decimal');
  assert.equal(
    parseDirectEntry('17.567', plain),
    parseDirectEntry('17.567', decimal),
    "'number' and 'decimal' round identically — kind never branches",
  );
  assert.equal(parseDirectEntry('-1.239', plain), -1.24, 'negatives round the same way');

  // ---- clamping, and only where the schema declares a bound --------------
  assert.equal(parseDirectEntry('900', { min: 0, max: 100, kind: 'number' }), 100, 'clamps to max');
  assert.equal(parseDirectEntry('-900', { min: 0, max: 100, kind: 'number' }), 0, 'clamps to min');
  assert.equal(parseDirectEntry('50', { min: 0, max: 100, kind: 'number' }), 50, 'inside the range is untouched');
  assert.equal(parseDirectEntry('900', { min: 0, kind: 'number' }), 900, 'no max declared, no ceiling');
  assert.equal(parseDirectEntry('-900', { max: 100, kind: 'number' }), -900, 'no min declared, no floor');
  assert.equal(parseDirectEntry('0.556', { min: 0, max: 1, kind: 'decimal' }), 0.56, 'rounds THEN clamps');

  // ---- null: the caller reverts, writes nothing and never crashes -------
  for (const empty of ['', '   ', '\t\n']) {
    assert.equal(parseDirectEntry(empty, plain), null, `empty input must revert: ${JSON.stringify(empty)}`);
  }
  for (const junk of ['abc', '12abc', '-', '.', '--3', '1.2.3']) {
    assert.equal(parseDirectEntry(junk, plain), null, `unparseable input must revert: ${junk}`);
  }
  for (const wild of ['Infinity', '-Infinity', 'NaN']) {
    assert.equal(parseDirectEntry(wild, plain), null, `non-finite input must revert: ${wild}`);
  }
  // A clamp can never rescue a null — the bounds are not consulted at all.
  assert.equal(parseDirectEntry('', { min: 0, max: 100, kind: 'number' }), null);
  assert.equal(parseDirectEntry('NaN', { min: 0, max: 100, kind: 'number' }), null);
});

test('[static] S3: compact rows, direct entry in the value slot, and nothing overflows 393pt', async () => {
  const panel = stripComments(await read('components/DesignStudioPanel.tsx'));
  const flat = panel.replace(/\s+/g, ' ');
  const styleBlock = (key) => {
    const hit = new RegExp(`${key}: \\{([^}]*)\\}`).exec(flat);
    assert.ok(hit, `the panel must declare a ${key} style`);
    return hit[1];
  };
  const num = (block, key) => {
    const hit = new RegExp(`${key}: (-?[\\d.]+)`).exec(block);
    return hit ? Number(hit[1]) : null;
  };

  // ---- D7, the row's density --------------------------------------------
  assert.ok(num(styleBlock('entryRow'), 'paddingVertical') <= 6, 'row vertical padding ≤ 6pt');
  assert.ok(num(styleBlock('category'), 'gap') <= 2, '≤ 2pt between rows');
  assert.ok(num(styleBlock('categoryHeader'), 'minHeight') <= 36, 'category header rows ≤ 36pt');
  assert.equal(num(styleBlock('bodyContent'), 'paddingHorizontal'), 10, 'panel horizontal padding is 10pt');
  const editorGap = num(styleBlock('editorRow'), 'gap');
  assert.ok(editorGap >= 4 && editorGap <= 6, `the right cluster's gaps are 4–6pt (saw ${editorGap})`);

  // ---- D13, nothing overflows and NOTHING IS RESERVED --------------------
  assert.doesNotMatch(flat, /<ScrollView[^>]*\shorizontal/, 'no horizontal ScrollView in the panel');
  assert.doesNotMatch(flat, /\shorizontal(=|\s|\/|>)/, 'nothing in the panel scrolls sideways');
  for (const key of [
    'rowValue',
    'miniValue',
    'editorRow',
    'entryRow',
    'colorEditor',
    'colorEditorRow',
    'hslRow',
    'miniStepper',
    'hexInput',
    'directInput',
    'presetInput',
    'jsonInput',
  ]) {
    assert.doesNotMatch(
      styleBlock(key),
      /\bwidth: \d/,
      `${key} must not reserve a fixed width — it is a value, cluster or input style`,
    );
  }
  // The label block takes ALL remaining width and truncates rather than wraps.
  assert.match(styleBlock('labelBlock'), /flex: 1/);
  assert.match(styleBlock('labelBlock'), /minWidth: 0/);
  assert.match(flat, /<Text style=\{styles\.rowLabel\} numberOfLines=\{1\}>/);
  // A colour row's hex input flexes between the swatch and the row's [↺].
  assert.match(styleBlock('hexInput'), /flex: 1/);
  assert.doesNotMatch(styleBlock('hslRow'), /flexWrap/, 'line 2 may never wrap');

  // ---- D9, line 2 fits on one line inside the 373pt content box ----------
  // Advance width per character at these sizes, as a share of the font size:
  // SF Pro's tabular figures are 0.5555em and Roboto's 0.57em, so 0.58 is a
  // deliberate over-estimate; the cap letter of a mini label is ~0.72em.
  const CHAR = 0.58;
  const CAP = 0.72;
  const miniStep = num(styleBlock('miniStep'), 'width');
  const innerGap = num(styleBlock('miniStepper'), 'gap');
  const outerGap = num(styleBlock('hslRow'), 'gap');
  const valueSize = num(styleBlock('miniValue'), 'fontSize');
  const labelSize = num(styleBlock('miniLabel'), 'fontSize');
  assert.ok(miniStep >= 28, `D9: each mini glyph button is ≥ 28pt visual (saw ${miniStep})`);
  assert.equal(outerGap, 4, 'D9: 4pt between the mini steppers');
  const stepperWidth = (chars) =>
    labelSize * CAP + innerGap + miniStep + innerGap + chars * valueSize * CHAR + innerGap + miniStep;
  // Worst case: H "360", S "100", L "100" and an alpha reading "0.55".
  const line = stepperWidth(3) * 3 + stepperWidth(4) + outerGap * 3;
  const contentBox = 393 - 2 * num(styleBlock('bodyContent'), 'paddingHorizontal');
  assert.equal(contentBox, 373);
  assert.ok(
    line <= contentBox,
    `D9: H/S/L/A needs ${line.toFixed(1)}pt on one line and the content box is ${contentBox}pt`,
  );
  // The hit area: 36pt across (exactly tiling the 4pt gap, never overlapping
  // a neighbour) and the full 44pt floor down, where there is no neighbour.
  assert.match(flat, /hitSlop=\{\{ top: 8, bottom: 8, left: 4, right: 4 \}\}/);
  assert.equal(miniStep + 4 + 4, 36, 'D9: hitSlop takes the glyph button to 36pt');

  // ---- D8, the [✎] and what it swaps in ---------------------------------
  assert.match(flat, /keyboardType="decimal-pad"/);
  assert.match(flat, /autoFocus selectTextOnFocus/);
  assert.match(flat, /onBlur=\{commit\} onSubmitEditing=\{commit\}/, 'commit on submit OR blur');
  assert.match(flat, /parseDirectEntry\(draft, \{ min: entry\.min, max: entry\.max,/);
  assert.match(flat, /if \(parsed == null\) return; entry\.write\(parsed\);/, 'null REVERTS — no write');
  assert.match(flat, /\{draft != null && entry\.unit \?/, 'the unit is rendered OUTSIDE the field');
  assert.match(flat, /from '\.\.\/ui\/designStudioInput'/, 'parsing lives in the pure module');
  // ± still steps by the schema's own step, unchanged.
  assert.match(flat, /clamp\(round2\(current \+ direction \* step\), min, max\)/);
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
  assert.equal(
    byKey.get('nav.activeColor').defaultValue(ctx),
    tokens.navBar.activeColorDark,
    "N3: dark ships the bar's own green, not the palette's live-state emerald",
  );
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

test('S3 nav paint: solid chrome ground, the champagne [+] ring, and no raster in the bar', async () => {
  const tokens = await tokensModule;
  const schema = await schemaModule;
  const bar = stripComments(await read('ui/primitives/BottomNav.tsx'));
  const surface = stripComments(await read('ui/primitives/Surface.tsx'));

  // ---- D11, SOLID NAV GROUND --------------------------------------------
  assert.equal(tokens.materials.chrome.blur, 0, 'the chrome material no longer blurs');
  assert.equal(tokens.materials.chrome.scrimAlpha, 1, 'the chrome scrim is opaque');
  assert.equal(tokens.materials.chrome.fallbackScrimAlpha, 1, 'and opaque without blur too');
  // The same material at a different mix — everything else is untouched.
  assert.equal(tokens.materials.chrome.scrimColor, '#071B15');
  assert.equal(tokens.materials.chrome.borderColor, tokens.brand.mint);
  assert.equal(tokens.materials.chrome.borderAlpha, 0.2);
  assert.equal(tokens.materials.chrome.radius, null);
  assert.equal(tokens.materials.chrome.radiusTopOnly, false);
  // Sheet and menu are NOT dragged along: both still blur under a
  // translucent scrim, so this is the nav's ground and nothing else's.
  for (const name of ['sheet', 'menu']) {
    assert.ok(tokens.materials[name].blur > 0, `${name} must still blur`);
    assert.ok(tokens.materials[name].scrimAlpha < 1, `${name}'s scrim must stay translucent`);
  }
  // The blur mounts ONLY where it can be seen.
  assert.match(
    surface.replace(/\s+/g, ' '),
    /\{isDark && !flat && spec\.blur > 0 && scrimAlpha < 1 \?/,
    'the BlurLayer must not mount behind an opaque scrim or at zero blur',
  );
  // The registry's chrome dials read the tokens, so they launch at the new
  // values and keep working — a solid ground is a default, not a removal.
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  const ctx = await contextFor();
  assert.equal(byKey.get('material.chrome.blur').defaultValue(ctx), 0);
  assert.equal(byKey.get('material.chrome.scrimAlpha').defaultValue(ctx), 1);
  assert.equal(byKey.get('material.chrome.fallbackScrimAlpha').defaultValue(ctx), 1);

  // ---- D14, THE [+] RING GOES CHAMPAGNE (dark only) ---------------------
  //
  // 2026-09-17 STOPS DRAWING THAT RING, on operator instruction: the dark
  // control has no outline at all. D14's token is NOT deleted and this block
  // still owns it — the studio's `create.border` dial launches at it and
  // turning that dial still paints a ring, so the hue is live where a dial can
  // reach it. What moved is the shipped default, and the DIAL half of D14 is
  // asserted exactly as it was.
  assert.equal(tokens.navBar.ringColorDark, '#E6D19A');
  assert.match(
    bar,
    /borderColor: 'transparent',/,
    "the dark control declares no ring — by colour, so no geometry forks with it",
  );
  assert.doesNotMatch(bar, /#E6D19A/i, 'the hex belongs in ui/tokens.ts, never at the call site');
  // The registry default follows the token; LIGHT is untouched.
  assert.equal(byKey.get('create.border').defaultValue({ ...ctx, isDark: true }), '#E6D19A');
  assert.equal(
    byKey.get('create.border').defaultValue({ ...ctx, isDark: false }),
    ctx.appLight.goldDeep,
    "light keeps H3's deepened gold",
  );
  // RUN N3 (2026-09-08) put the fill on the control's OWN gold token; 2026-09-17
  // reverses the gold and hands the control the dark "Post a job" pill's recipe
  // — `postPillGreen` under ui/primitives/LitSurface.tsx's wash. So the tree has
  // no gold FILL in this file at all now, which is why tests/goldOnForest's
  // recorded exception for it is deleted rather than left standing.
  assert.match(bar, /backgroundColor: colors\.postPillGreen,/, "the fill is the pill's green");
  assert.match(bar, /liftAlpha: navBar\.createLiftAlpha,/, 'lit with the pill’s own alpha');
  assert.match(bar, /borderColor: colors\.goldDeep,/, "light's ring stays");

  // ---- D16, NO RASTER IN THE BAR (a proof, not a change) ----------------
  // Every mark in the bar is an Ionicons font glyph or a styled View, so it
  // is resolution-independent on every device.
  assert.doesNotMatch(bar, /\bfrom 'react-native'.*\bImage\b/, 'no Image import');
  assert.doesNotMatch(bar, /<Image\b/, 'the bar renders no Image');
  assert.doesNotMatch(bar, /\bImageBackground\b/, 'the bar renders no ImageBackground');
  assert.doesNotMatch(bar, /require\(/, 'the bar bundles no asset');
  assert.doesNotMatch(bar, /\ssource=/, 'nothing in the bar takes an image source');
  assert.match(bar, /<Ionicons/, 'the marks are font glyphs');
});

// ---------------------------------------------------------------------------
// RUN S3 (D12) — THE STATIC REGISTRY AUDIT.
//
// A dial nothing reads is worse than a missing one: the operator turns it,
// the app does not move, and they cannot tell whether the dial is broken or
// their eye is. So EVERY static registry key must be provably read by
// production source, and this test is the proof rather than a claim.
//
// The five ways a key counts as READ — anything else is an ORPHAN:
//   (a) its exact literal appears in single or double quotes;
//   (b) its exact literal sits in a string-array constant a wearer feeds to
//       useOverrideFingerprint (the nav's bar-container dials);
//   (c) a TEMPLATE read brackets it — a `${...}` template with real static
//       text on BOTH ends, so `button.${variant}.height` reads
//       button.primary.height but `${ns}.${role}` brackets nothing;
//   (d) it is a `material.<name>.<prop>` key and ui/primitives/Surface.tsx
//       reads `spec.<prop>`, or lib/designOverrides.ts's resolver folds it;
//   (e) it is one of the G1 dials, read through useDesignDial('...') or
//       `overrides.<dial>` — including the palette pair, which fold inside
//       lib/designOverrides.ts's exported resolver that hooks/useThemeColors
//       consumes, the same shape (d) allows for the materials.
//
// The panel, the schema and the override layer are EXCLUDED from the search:
// they are the studio talking about itself, and a dial that only the studio
// mentions is exactly the orphan this looks for. Tests are excluded for the
// same reason. Runtime-enumerated colour entries are out of scope — they are
// generated from the live palettes and have no static key to audit.
// ---------------------------------------------------------------------------

test('registry audit: every static entry has a reader in production source — zero orphans', async () => {
  const schema = await schemaModule;
  const { readdirSync, statSync, readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  const EXCLUDED = new Set([
    'components/DesignStudioPanel.tsx',
    'ui/designStudioSchema.ts',
    'lib/designOverrides.ts',
  ]);
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry) && !EXCLUDED.has(rel)) {
        sources.push([rel, readFileSync(join(root, rel), 'utf8')]);
      }
    }
  };
  for (const dir of ['components', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui']) {
    walk(dir);
  }
  assert.ok(sources.length > 100, `the audit must actually scan the tree (saw ${sources.length})`);

  // (a)
  const quoted = (key) =>
    sources.find(([, code]) => code.includes(`'${key}'`) || code.includes(`"${key}"`))?.[0] ?? null;

  // (b)
  const fingerprinted = new Map();
  for (const [path, code] of sources) {
    for (const use of code.matchAll(/useOverrideFingerprint\((\w+)\)/g)) {
      const decl = new RegExp(`const ${use[1]}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(code);
      if (!decl) continue;
      for (const literal of decl[1].matchAll(/'([^']+)'/g)) fingerprinted.set(literal[1], path);
    }
  }

  // (c)
  const templates = [];
  for (const [path, code] of sources) {
    for (const hit of code.matchAll(/`([^`\\]*\$\{[^`]*?\}[^`\\]*)`/g)) {
      const parts = hit[1].split(/\$\{[^}]*\}/);
      if (!parts[0] || !parts[parts.length - 1]) continue; // brackets nothing
      const pattern = parts
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[A-Za-z0-9_]+');
      templates.push({ path, raw: hit[1], re: new RegExp(`^${pattern}$`) });
    }
  }

  // (d)
  const surfaceSource = sources.find(([path]) => path === 'ui/primitives/Surface.tsx')?.[1] ?? '';
  assert.ok(surfaceSource, 'the material wearer must be in the scan');
  const overrideLayer = await read('lib/designOverrides.ts');
  const materialRead = (key) => {
    const parts = /^material\.(\w+)\.(\w+)$/.exec(key);
    if (!parts) return null;
    if (new RegExp(`spec\\.${parts[2]}\\b`).test(surfaceSource)) {
      return `ui/primitives/Surface.tsx (spec.${parts[2]})`;
    }
    if (new RegExp(`resolved\\[name\\][\\s\\S]{0,400}${parts[2]}`).test(overrideLayer)) {
      return `lib/designOverrides.ts resolveMaterials (${parts[2]})`;
    }
    return null;
  };

  // (e)
  const g1Read = (entry) => {
    const dial = entry.technicalKey;
    if (dial.includes('.')) return null;
    for (const [path, code] of sources) {
      if (
        code.includes(`useDesignDial('${dial}')`) ||
        new RegExp(`overrides\\.${dial}\\b`).test(code) ||
        new RegExp(`\\{[^}]*\\b${dial}\\b[^}]*\\}\\s*=\\s*useDesignOverrides\\(\\)`).test(code)
      ) {
        return path;
      }
    }
    // The palette dials fold inside the exported resolver a production hook
    // consumes — the same shape (d) allows for resolveMaterials.
    if (new RegExp(`overrides\\.${dial}\\b`).test(overrideLayer)) {
      const consumer = sources.find(([, code]) => /applyPaletteOverrides/.test(code));
      if (consumer) return `${consumer[0]} (via lib/designOverrides.ts overrides.${dial})`;
    }
    return null;
  };

  // (f) RUN T1 — THE TOKEN GETTER IS ITSELF A READER, and the widest one in
  // the app. A metric dial's key IS the address ui/tokens.ts's and
  // lib/theme.ts's getters resolve through, so every consumer of that token
  // reads it without naming it: `spacing.lg` reaches all 92 files that import
  // `spacing`. The key space is derived from the `metricGroup('<group>', …)`
  // calls in those two files crossed with the executed default tables, so a
  // dial on a key no getter addresses is still an ORPHAN.
  const tokenMetricKeys = await (async () => {
    const tokens = await tokensModule;
    const declaring = [await read('ui/tokens.ts'), await read('lib/theme.ts')].join('\n');
    const keys = new Set();
    for (const [, group, tableName] of declaring.matchAll(/metricGroup\('([^']+)', (\w+)/g)) {
      const table = tokens[tableName];
      if (!table) continue;
      for (const key of Object.keys(table)) keys.add(`${group}.${key}`);
    }
    assert.ok(keys.size >= 20, 'the live token key space must actually have been read');
    return keys;
  })();

  /** Which of the six readers claims this entry, or null for an orphan. */
  const classify = (entry) => {
    if (quoted(entry.key)) return 'quoted';
    if (fingerprinted.has(entry.key)) return 'fingerprint';
    if (templates.some((template) => template.re.test(entry.key))) return 'template';
    if (materialRead(entry.key)) return 'material';
    if (tokenMetricKeys.has(entry.key)) return 'token';
    if (g1Read(entry)) return 'g1';
    return null;
  };

  // THE AUDIT MUST HAVE TEETH. A fence that cannot fail proves nothing, so
  // three keys nothing can possibly read are run through the same classifier
  // first: one plain, one shaped like a material prop that no wearer reads,
  // and one shaped like a G1 dial. All three must come back ORPHAN.
  for (const fake of [
    { key: 'nothing.reads.this', technicalKey: 'nothing.reads.this' },
    { key: 'material.chrome.nosuchprop', technicalKey: 'materials.chrome.nosuchprop' },
    { key: 'color.nosuchdial', technicalKey: 'nosuchdial' },
    // Shaped like a live metric dial, on a step no scale carries.
    { key: 'spacing.nosuchstep', technicalKey: 'spacing.nosuchstep' },
    { key: 'nosuchgroup.lg', technicalKey: 'nosuchgroup.lg' },
  ]) {
    assert.equal(classify(fake), null, `the audit must catch an orphan: ${fake.key}`);
  }

  const counts = { quoted: 0, fingerprint: 0, template: 0, material: 0, token: 0, g1: 0, orphan: 0 };
  const orphans = [];
  for (const entry of schema.STUDIO_REGISTRY) {
    const reader = classify(entry);
    if (reader) counts[reader] += 1;
    else {
      counts.orphan += 1;
      orphans.push(`${entry.key} (${entry.category}, ${entry.technicalKey})`);
    }
  }

  console.log(
    `  ℹ registry audit: ${schema.STUDIO_REGISTRY.length} static entries — ` +
      `${counts.quoted} quoted literal, ${counts.template} template read, ` +
      `${counts.material} material prop, ${counts.token} live token getter, ${counts.g1} G1 dial, ` +
      `${counts.fingerprint} fingerprint array, ${counts.orphan} ORPHAN`,
  );

  assert.deepEqual(
    orphans,
    [],
    'a dial no production file reads cannot change the app — delete the entry or wire a reader',
  );
  assert.equal(
    counts.quoted + counts.fingerprint + counts.template + counts.material + counts.token + counts.g1,
    schema.STUDIO_REGISTRY.length,
    'every static entry must land in exactly one classification',
  );
});

test('[static] S3 D15: the active tab glows with a box to blur into, and composites in place', async () => {
  const bar = stripComments(await read('ui/primitives/BottomNav.tsx'));
  const flat = bar.replace(/\s+/g, ' ');

  // The glow itself is UNCHANGED — same shape, same colour, same strength,
  // same dial. This fence is about the box around it, not the light.
  assert.match(
    flat,
    /glow\.text\(withAlpha\(colors\.emerald, glowAlpha \?\? ACTIVE_TAB_GLOW_ALPHA\)\)/,
    'the glow keeps its colour and its dial',
  );

  // (a) THE BOX. The bleed is READ from the shape's own radius rather than
  // restated, so the padding can never drift from the blur it contains.
  assert.match(flat, /const bleed = activeGlow\?\.textShadowRadius \?\? 0;/);
  assert.match(flat, /const glyphGlowBox = bleed \? \{ padding: bleed, margin: -bleed \} : null;/);
  // Equal and opposite: the laid-out geometry is byte-identical.
  assert.match(flat, /marginTop: iconLabelGap - bleed, marginBottom: -bleed, marginLeft: -bleed, marginRight: -bleed,/);
  assert.match(flat, /style=\{\[activeGlow, glyphGlowBox\]\}/, 'the glyph wears the box');
  assert.match(flat, /activeGlow, labelGlowBox,/, 'the label wears its own');
  // Unfocused and light: bleed is 0, both boxes are null, nothing is declared.
  assert.match(flat, /const labelGlowBox = bleed \?/);

  // (b) IN PLACE. Identity dials are not declared at all, so an untouched bar
  // never forces its subtree onto an offscreen layer.
  assert.match(flat, /const moved = offsetX !== 0 \|\| offsetY !== 0 \|\| dialledScale !== 1;/);
  assert.match(flat, /\.\.\.\(dialledOpacity !== 1 \? \{ opacity: dialledOpacity \} : null\),/);
  assert.match(flat, /\.\.\.\(moved \? \{ transform: \[/);
  // The dials themselves still exist and still default to identity.
  assert.match(bar, /useOverrideNumber\('nav\.activeOpacity'\) \?\? 1/);
  assert.match(bar, /useOverrideNumber\('nav\.activeScale'\) \?\? 1/);
  assert.match(bar, /useOverrideNumber\('nav\.itemOffsetX'\) \?\? 0/);

  // Nothing in the item's own chain may clip the blur back off again.
  assert.doesNotMatch(bar, /overflow: 'hidden'/, 'the bar clips nothing');
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

  // S2 left this category honestly empty because there was no shared divider
  // to dial. RUN T1 (C4) built one, so the assertion FLIPS: the category must
  // now carry live dials rather than none.
  const borderEntries = schema.STUDIO_REGISTRY.filter((entry) => entry.category === 'borders');
  assert.deepEqual(
    borderEntries.map((entry) => entry.key).sort(),
    [
      'divider.color', 'divider.inset', 'divider.thickness',
      'radius.lg', 'radius.md', 'radius.sm', 'radius.xl', 'radius.xs', 'radius.xxl',
      'theme.radius.lg', 'theme.radius.md', 'theme.radius.sm', 'theme.radius.xl',
    ],
    'Borders & Dividers must carry both corner scales and the Divider’s dials',
  );

  // S2 held this category empty on an honest premise: a spacing dial "would
  // silently do nothing" while every token was consumed at stylesheet-build
  // time. T1 (C2) removed the premise — the tokens resolve at read time and
  // the style caches key on the metric generation — so the assertion FLIPS
  // here too. Both scales, because this repo carries two.
  const spacingKeys = schema.STUDIO_REGISTRY.filter((entry) => entry.category === 'spacing').map(
    (entry) => entry.key,
  );
  assert.deepEqual(
    spacingKeys,
    [
      'theme.spacing.xs', 'theme.spacing.sm', 'theme.spacing.md',
      'theme.spacing.lg', 'theme.spacing.xl', 'theme.spacing.xxl',
      'spacing.xs', 'spacing.sm', 'spacing.md', 'spacing.lg',
      'spacing.xl', 'spacing.xxl', 'spacing.xxxl',
    ],
    'Spacing must carry both live scales, app first — it is the one that moves the app',
  );
});

test('T1 (C5): every metric dial mirrors its shipped table, floors hold, and pill has no dial', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const o = await overridesModule;
  const ctx = await contextFor();
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));

  /** Every dial that writes the metric bag, and the table it must mirror. */
  const TABLES = {
    spacing: 'SPACING_DEFAULTS',
    radius: 'RADIUS_DEFAULTS',
    controls: 'CONTROL_DEFAULTS',
    layout: 'LAYOUT_METRIC_DEFAULTS',
    'theme.spacing': 'THEME_SPACING_DEFAULTS',
    'theme.radius': 'THEME_RADIUS_DEFAULTS',
  };

  let checked = 0;
  for (const [group, tableName] of Object.entries(TABLES)) {
    const table = tokens[tableName];
    assert.ok(table, `${tableName} must be exported from ui/tokens.ts`);
    for (const [step, value] of Object.entries(table)) {
      const entry = byKey.get(`${group}.${step}`);
      assert.ok(entry, `${group}.${step} is live but carries no dial`);
      assert.equal(entry.defaultValue(ctx), value, `${entry.key} must default to its shipped ${value}`);
      assert.equal(entry.kind, 'number');
      assert.equal(entry.scope, 'token', 'a token dial is never local');
      assert.ok(entry.min != null && entry.max != null && entry.step != null, `${entry.key} needs a range`);
      assert.ok(value >= entry.min && value <= entry.max, `${entry.key}'s default sits outside its own range`);
      checked += 1;
    }
  }
  assert.equal(checked, 30, 'all six live scales are dialled, end to end');

  // THE TOUCH FLOOR IS NOT NEGOTIABLE (CLAUDE.md). No control-height dial may
  // be turned below 44 — the schema range is the enforcement, because
  // controls.minTouchTarget itself deliberately has no dial.
  for (const key of ['controls.buttonHeight', 'controls.buttonHeightSmall', 'controls.fieldHeight', 'controls.iconButton']) {
    assert.ok(byKey.get(key).min >= 44, `${key} must not be dialable below the 44pt touch floor`);
  }
  assert.equal(byKey.has('controls.minTouchTarget'), false, 'the floor itself is not a dial');

  // A CAPSULE IS A SHAPE, NOT A SIZE.
  assert.equal(byKey.has('radius.pill'), false, 'pill radius has no dial');
  assert.equal(byKey.has('theme.radius.pill'), false);

  // The write reaches the METRIC bag — which is what bumps the generation
  // that rebuilds every cached stylesheet — and not the values bag.
  try {
    const gen = o.metricsGeneration();
    byKey.get('theme.spacing.lg').write(22);
    assert.equal(o.getDesignOverrides().metrics['theme.spacing.lg'], 22);
    assert.equal(o.getDesignOverrides().values?.['theme.spacing.lg'], undefined, 'never the values bag');
    assert.equal(o.metricsGeneration(), gen + 1);
    assert.equal(o.liveMetric('theme.spacing.lg'), 22);
    byKey.get('theme.spacing.lg').write(undefined);
    assert.equal(o.liveMetric('theme.spacing.lg'), undefined, 'and reset clears it');
  } finally {
    o.resetDesignOverrides();
  }
});

test('T1 (C5/D9): an untouched child follows its parent, and its reset returns it to inheriting', async () => {
  const schema = await schemaModule;
  const o = await overridesModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));

  const chains = schema.STUDIO_REGISTRY.filter((entry) => entry.inheritsFrom);
  assert.ok(chains.length >= 20, 'the mechanism must carry real chains, not one demo');

  const child = byKey.get('header.padX');
  const parent = byKey.get('spacing.lg');
  assert.equal(child.inheritsFrom, 'spacing.lg', 'the header padding is the Emerald large gap');

  const base = await contextFor();
  const shipped = parent.defaultValue(base);
  try {
    // 1. THE PARENT MOVES AND THE UNTOUCHED CHILD FOLLOWS.
    parent.write(shipped + 6);
    const moved = await contextFor();
    assert.equal(schema.resolveDialValue(child.key, moved), shipped + 6);
    assert.equal(schema.currentValueOf(child, moved), shipped + 6);
    assert.equal(schema.isModified(child, moved), false, 'following a parent is not being modified');
    assert.equal(schema.inheritedFrom(child, moved)?.plainLabel, parent.plainLabel);

    // 2. TOUCHING THE CHILD ENDS THE INHERITANCE.
    child.write(9);
    const touched = await contextFor();
    assert.equal(schema.currentValueOf(child, touched), 9, 'its own value wins');
    assert.equal(schema.inheritedFrom(child, touched), null, 'and the panel stops claiming otherwise');

    // 3. AND ITS RESET RETURNS IT TO INHERITING, NOT TO A FROZEN NUMBER.
    child.write(undefined);
    const back = await contextFor();
    assert.equal(schema.inheritedFrom(back && child, back)?.key, parent.key);
    assert.equal(schema.currentValueOf(child, back), shipped + 6, 'so it shows its parent again');
  } finally {
    o.resetDesignOverrides();
  }
  const clean = await contextFor();
  assert.equal(schema.currentValueOf(child, clean), shipped, 'and a full reset lands on the shipped value');
});

test('T1 (C4): the Divider ships the hairline three surfaces already agree on', async () => {
  const schema = await schemaModule;
  const tokens = await tokensModule;
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));
  const ctx = await contextFor();

  // Defaults are READ from the token surface, never restated here.
  assert.equal(byKey.get('divider.thickness').defaultValue(ctx), tokens.DIVIDER_DEFAULTS.thickness);
  assert.equal(byKey.get('divider.inset').defaultValue(ctx), tokens.DIVIDER_DEFAULTS.inset);
  assert.equal(byKey.get('divider.color').defaultValue(ctx), ctx.appDark.border);
  assert.equal(tokens.DIVIDER_DEFAULTS.thickness, 0, '0 is the platform hairline, not a zero-height rule');
  assert.equal(tokens.DIVIDER_DEFAULTS.inset, 0, 'full bleed, as every surface draws it');

  const source = await read('ui/primitives/Divider.tsx');
  // 0 must mean the platform hairline at the ONE place that reads it, or the
  // primitive draws nothing at its own default.
  assert.match(source, /dialled > 0 \? dialled : StyleSheet\.hairlineWidth/);
  for (const key of ["'divider.thickness'", "'divider.inset'", "'divider.color'"]) {
    assert.ok(source.includes(key), `Divider must read the ${key} dial`);
  }
  assert.match(source, /palette\.border/, 'its colour is a palette role, resolved per theme');

  // Exported from the barrel, which is the canonical import path.
  const barrel = await read('ui/primitives/index.ts');
  assert.match(barrel, /export \{ Divider \} from '\.\/Divider';/);
  assert.match(barrel, /export type \{ DividerProps \} from '\.\/Divider';/);

  // C4 SHIPS THE PRIMITIVE AND NOTHING ELSE. Repointing the four hand-drawn
  // hairlines at it is a screen change; if this count moves, that conversion
  // happened and this fence should be replaced, not relaxed.
  const wearers = [];
  for (const path of ['components/DropMenu.shared.tsx', 'components/ReportDialog.tsx', 'components/JobOwnerActions.tsx']) {
    if (/\bDivider\b/.test(await read(path))) wearers.push(path);
  }
  assert.deepEqual(wearers, [], 'the divider sweep is T2’s, not this run’s');
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

// ---------------------------------------------------------------------------
// RUN T1 (C1) — the live metrics store and the inheritance mechanism
// ---------------------------------------------------------------------------

test('T1 metrics: unset reads as undefined, a metric write bumps the generation, nothing else does', async () => {
  const o = await overridesModule;
  const tokens = await tokensModule;
  try {
    assert.equal(o.liveMetric('spacing.lg'), undefined, 'an unset metric must read as undefined');
    assert.equal('metrics' in o.getDesignOverrides(), false, 'the bag must not exist until it is used');

    const start = o.metricsGeneration();
    o.setMetricOverride('spacing.lg', 24);
    assert.equal(o.liveMetric('spacing.lg'), 24);
    assert.equal(o.metricsGeneration(), start + 1, 'a metric write bumps the generation');

    o.setMetricOverride('spacing.lg', 24);
    assert.equal(o.metricsGeneration(), start + 1, 'writing the same value again is not a write');

    // THE POINT OF A SEPARATE BAG: a colour, blur or non-metric layout dial
    // must not invalidate all 102 themedStyles caches, so it must not touch
    // this counter.
    o.setOverrideValue('menu.minWidth', 240);
    o.patchDesignOverrides({ glowAlpha: 0.4 });
    o.patchMaterialOverride('sheet', { blur: 30 });
    o.setPaletteTokenOverride('dark', 'app.text', '#AABBCC');
    assert.equal(o.metricsGeneration(), start + 1, 'a non-metric dial must leave the generation alone');

    // ui/tokens.ts reads THIS store, through the installed slot — not a copy.
    assert.equal(tokens.liveMetric('spacing.lg'), 24, 'the token bridge reads this store');
    assert.equal(tokens.metricGeneration(), o.metricsGeneration());
    assert.equal(tokens.liveMetric('spacing.nope'), undefined);

    o.setMetricOverride('spacing.lg', undefined);
    assert.equal(o.liveMetric('spacing.lg'), undefined, 'clearing returns the metric to its default');
    assert.equal('metrics' in o.getDesignOverrides(), false, 'an emptied bag must dissolve');
    assert.equal(o.metricsGeneration(), start + 2, 'clearing is a write too');
  } finally {
    o.resetDesignOverrides();
  }
  // The G1 contract, restated over the new field: empty is exactly one shape.
  assert.deepEqual(o.getDesignOverrides(), { materials: {} }, 'reset must restore the empty shape');
  assert.equal(o.liveMetric('spacing.lg'), undefined);
});

test('T1 inheritance: a chain resolves to its nearest set value; a ring and an absurd chain both terminate', async () => {
  const o = await overridesModule;
  const schema = await schemaModule;
  try {
    o.setDialInheritance({ child: 'parent', parent: 'grandparent' });
    assert.equal(o.getDialParent('child'), 'parent');
    assert.equal(o.resolveInheritedOverride('child'), undefined, 'an untouched chain is untouched');

    o.setOverrideValue('grandparent', 7);
    assert.equal(o.resolveInheritedOverride('child'), 7, 'a child follows a distant ancestor');
    assert.equal(o.resolveInheritedOverride('parent'), 7);

    o.setOverrideValue('parent', 5);
    assert.equal(o.resolveInheritedOverride('child'), 5, 'the NEAREST set value wins');

    // The walk reads both bags, so a metric dial and a values dial can sit on
    // the same chain.
    o.setMetricOverride('child', 3);
    assert.equal(o.resolveInheritedOverride('child'), 3, 'a touched dial stops inheriting');
    o.setMetricOverride('child', undefined);
    o.setOverrideValue('parent', undefined);
    o.setOverrideValue('grandparent', undefined);
    assert.equal(o.resolveInheritedOverride('child'), undefined);

    // A RING answers instead of spinning — and still finds a value on the way
    // round, because the visited set stops the SECOND visit, not the first.
    o.setDialInheritance({ a: 'b', b: 'c', c: 'a' });
    assert.equal(o.resolveInheritedOverride('a'), undefined, 'a cycle must terminate');
    o.setOverrideValue('c', 11);
    assert.equal(o.resolveInheritedOverride('a'), 11);
    o.setOverrideValue('c', undefined);

    // A chain longer than the cap stops AT the cap: a value parked beyond it
    // is deliberately unreachable, and one just inside it is still found.
    const cap = o.DIAL_INHERITANCE_DEPTH_CAP;
    assert.ok(Number.isInteger(cap) && cap >= 2, 'the depth cap must be a real bound');
    const long = {};
    for (let i = 0; i < cap + 4; i += 1) long['n' + i] = 'n' + (i + 1);
    o.setDialInheritance(long);
    o.setOverrideValue('n' + (cap + 2), 99);
    assert.equal(o.resolveInheritedOverride('n0'), undefined, 'the depth cap holds');
    o.setOverrideValue('n' + (cap - 1), 42);
    assert.equal(o.resolveInheritedOverride('n0'), 42, 'everything inside the cap is still reached');
  } finally {
    o.resetDesignOverrides();
    o.setDialInheritance(schema.DIAL_INHERITANCE);
  }
});

test('T1 inheritance: every declared parent exists, ships at the same value, and resolves through the registry', async () => {
  const schema = await schemaModule;
  const o = await overridesModule;
  const ctx = await contextFor();
  const byKey = new Map(schema.STUDIO_REGISTRY.map((entry) => [entry.key, entry]));

  for (const entry of schema.STUDIO_REGISTRY) {
    if (!entry.inheritsFrom) continue;
    const parent = byKey.get(entry.inheritsFrom);
    assert.ok(parent, entry.key + ' inherits from ' + entry.inheritsFrom + ', which is not a registered dial');
    // D11's acceptance test, per chain: an inheriting dial must SHIP at what
    // its parent ships at, or switching the mechanism on would itself have
    // moved a rendered value.
    assert.equal(
      entry.defaultValue(ctx),
      parent.defaultValue(ctx),
      entry.key + ' and its parent ' + parent.key + ' must ship at the same value',
    );
    assert.equal(
      schema.DIAL_INHERITANCE[entry.key],
      entry.inheritsFrom,
      'the registered map must mirror the registry',
    );
  }

  // Untouched, every entry — inheriting or not — resolves to its own default.
  for (const entry of schema.STUDIO_REGISTRY) {
    assert.equal(
      schema.resolveDialValue(entry.key, ctx),
      entry.defaultValue(ctx),
      entry.key + ' must resolve to its shipped default when nothing is set',
    );
    assert.equal(schema.inheritedFrom(entry, ctx) === null, !entry.inheritsFrom);
  }
  assert.equal(schema.resolveDialValue('no.such.dial', ctx), undefined, 'an unknown key resolves to nothing');
});
