import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// ---------------------------------------------------------------------------
// 4D-3.5 — dual palettes and the token migration, light-pinned.
//
// Three layers, in order of strength:
//   1. ui/colorAlpha.ts and ui/tokens.ts are EXECUTED (the moneyCeiling
//      pattern; react-native is stubbed for tokens) so withAlpha's output and
//      light/dark key parity are facts, not source patterns.
//   2. The resolver plumbing (preference + system resolution, native sync,
//      app.json "automatic") is pinned against source, marked [static].
//   3. Every file the 4D-3.5 sweep migrated is scanned, comment-stripped, for
//      raw hex or rgba() literals — the regression this suite exists to stop.
//      Key-parity BETWEEN the palettes is additionally enforced at compile
//      time by `satisfies Record<ColorToken, string>` (npm run lint).
// ---------------------------------------------------------------------------

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const colorAlphaModule = (async () => {
  const js = stripTypeScriptTypes(await read('ui/colorAlpha.ts'), { mode: 'strip' });
  return import(toDataUrl(js));
})();

/** ui/tokens.ts, executed with react-native stubbed and the colorAlpha
 *  re-export removed (the module under test cannot resolve relative imports
 *  from a data: URL; colorAlpha is executed separately above). */
const tokensModule = (async () => {
  const js = stripTypeScriptTypes(await read('ui/tokens.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{[^}]*\} from 'react-native';/,
      "const Platform = { OS: 'ios', select: (options) => ('ios' in options ? options.ios : options.default) };",
    )
    .replace(/export \{ withAlpha \} from '\.\/colorAlpha';/, '');
  assert.ok(!stubbed.includes("from 'react-native'"), 'react-native import must be stubbed');
  assert.ok(!stubbed.includes("from './colorAlpha'"), 'colorAlpha re-export must be removed');
  return import(toDataUrl(stubbed));
})();

/**
 * lib/theme.ts — the screens' token surface — EXECUTED, the same way
 * ui/tokens.ts is above. react-native is stubbed; its `../ui/tokens` import is
 * fed from the module already executed here, so the palette the helpers see is
 * the real one and the two can never drift; and its three pass-through
 * re-exports are dropped, since a data: URL cannot resolve a relative
 * specifier and none of them is under test on this surface.
 *
 * This is what lets the star helper below be a FACT rather than a source
 * pattern: `starColors(colors, false).filled` is called and its answer
 * compared to the palette, so repointing either branch fails here.
 */
const themeModule = (async () => {
  const [tokens, { withAlpha }] = await Promise.all([tokensModule, colorAlphaModule]);
  globalThis.__THEME_TOKENS__ = { ...tokens, withAlpha };
  const js = stripTypeScriptTypes(await read('lib/theme.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{[^}]*\} from 'react-native';/,
      "const Platform = { OS: 'ios', select: (options) => ('ios' in options ? options.ios : options.default) };",
    )
    .replace(
      /import \{[^}]*\} from '\.\.\/ui\/tokens';/,
      'const { brand, dark: emeraldDark, withAlpha: alpha } = globalThis.__THEME_TOKENS__;',
    )
    .replace(/export \{[^}]*\} from '\.\.\/ui\/tokens';\n/g, '')
    .replace(/export \{[^}]*\} from '\.\.\/hooks\/useThemeColors';\n/g, '');
  assert.doesNotMatch(
    stubbed,
    /from '(?:react-native|\.[^']*)'/,
    'every import lib/theme.ts carries must be stubbed or dropped',
  );
  return import(toDataUrl(stubbed));
})();

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

/** Every .ts/.tsx file under the given roots, repo-relative, forward-slashed. */
const filesUnder = async (roots) => {
  const out = [];
  for (const root of roots) {
    const entries = await readdir(join(repoRoot, root), { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      out.push(relative(repoRoot, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
    }
  }
  return out.sort();
};

// ---------------------------------------------------------------------------
// withAlpha — executed, byte-exact against every value the sweep replaced
// ---------------------------------------------------------------------------

test('withAlpha reproduces every migrated rgba literal byte-for-byte', async () => {
  const { withAlpha } = await colorAlphaModule;

  // colors.text scrims (ActionSheet, AmountPrompt, ConfirmDialog,
  // ReactionPicker, ReportDialog, PortfolioPicker, ReviewSection,
  // ProfileScreen, WorkerJobScreen).
  assert.equal(withAlpha('#1F2E22', 0.35), 'rgba(31,46,34,0.35)');
  assert.equal(withAlpha('#1F2E22', 0.45), 'rgba(31,46,34,0.45)');
  assert.equal(withAlpha('#1F2E22', 0.6), 'rgba(31,46,34,0.6)');

  // brand.ink scrims (Sheet, MediaGrid, ServicePickerSheet).
  assert.equal(withAlpha('#13201B', 0.42), 'rgba(19,32,27,0.42)');
  assert.equal(withAlpha('#13201B', 0.45), 'rgba(19,32,27,0.45)');
  assert.equal(withAlpha('#13201B', 0.72), 'rgba(19,32,27,0.72)');

  // colors.onPrimary on-fill translucencies (ChatBubble, VoiceNote).
  assert.equal(withAlpha('#F4F1E8', 0.16), 'rgba(244,241,232,0.16)');
  assert.equal(withAlpha('#F4F1E8', 0.35), 'rgba(244,241,232,0.35)');
  assert.equal(withAlpha('#F4F1E8', 0.75), 'rgba(244,241,232,0.75)');
  assert.equal(withAlpha('#F4F1E8', 0.8), 'rgba(244,241,232,0.8)');

  // colors.mediaChrome (JobVideo) and colors.black (PhotoViewer,
  // JobDetailScreen hero chrome).
  assert.equal(withAlpha('#0F1F17', 0.32), 'rgba(15,31,23,0.32)');
  assert.equal(withAlpha('#0F1F17', 0.78), 'rgba(15,31,23,0.78)');
  assert.equal(withAlpha('#0F1F17', 0.82), 'rgba(15,31,23,0.82)');
  assert.equal(withAlpha('#000000', 0.38), 'rgba(0,0,0,0.38)');
  assert.equal(withAlpha('#000000', 0.45), 'rgba(0,0,0,0.45)');
  assert.equal(withAlpha('#000000', 0.58), 'rgba(0,0,0,0.58)');

  // Shorthand hex expands; a missing '#' is tolerated the way CSS-ish
  // call sites would write it.
  assert.equal(withAlpha('#000', 0.5), 'rgba(0,0,0,0.5)');
  assert.equal(withAlpha('1F2E22', 0.35), 'rgba(31,46,34,0.35)');
});

// ---------------------------------------------------------------------------
// Dual palettes — executed key parity, and light IS the Heritage palette
// ---------------------------------------------------------------------------

test('ui/tokens light and dark carry identical key sets, light === colors', async () => {
  const { colors, light, dark } = await tokensModule;

  assert.equal(light, colors, 'light must BE the existing Heritage palette object');

  const lightKeys = Object.keys(light).sort();
  const darkKeys = Object.keys(dark).sort();
  assert.deepEqual(darkKeys, lightKeys, 'light and dark must have identical key names');

  for (const [key, value] of Object.entries(dark)) {
    assert.match(
      String(value),
      /^#[0-9a-fA-F]{6}$/,
      `dark.${key} must be a 6-digit hex colour`,
    );
  }

  // The Prestige v2 anchors (pixel-derived from the 43 golden masters):
  // forest is the deep-green conversion fill and gold is metal line-work —
  // v1 merged them (the gold-primary experiment) and v2 must never re-merge
  // them; content on a forest fill is the cream ink in dark; and surfaces
  // stay darker than their content.
  assert.notEqual(dark.forest, dark.gold, 'v2: forest is green, gold is metal — never re-merged');
  assert.equal(dark.onForest, dark.ink, 'cream ink reads on the deep-green fill');
  assert.notEqual(dark.bg, light.bg);
  assert.notEqual(dark.surface, light.surface);
});

test('[static] dark palette is compile-checked against ColorToken', async () => {
  const tokens = await read('ui/tokens.ts');
  // tsc (npm run lint) is the real enforcement of key parity; this pin keeps
  // the enforcement from being quietly deleted.
  assert.match(tokens, /export const dark = \{[\s\S]*?\} as const satisfies Record<ColorToken, string>;/);
  assert.match(tokens, /export const light = colors;/);
});

// ---------------------------------------------------------------------------
// Playfair heading faces — 2026-08-22, supersedes emerald-v2 DECISIONS.md D5
// for the three large heading roles only. Executed against ui/tokens.ts;
// lib/theme.ts (the screens' surface) and App.tsx's render gate are pinned
// statically.
// ---------------------------------------------------------------------------

test('Playfair fence: the three heading roles resolve to the bundled statics', async () => {
  const { type } = await tokensModule;

  // Executed, not pattern-matched: repointing any of the three back at the
  // platform serif (fonts.display → 'Georgia' under the ios stub) fails here.
  assert.equal(type.display.fontFamily, 'PlayfairDisplay-ExtraBold');
  assert.equal(type.h1.fontFamily, 'PlayfairDisplay-ExtraBold');
  assert.equal(type.h2.fontFamily, 'PlayfairDisplay-Bold');

  // With a real file bundled the face IS the weight; a fontWeight on top
  // would make iOS synthesize a second embolden over ExtraBold.
  assert.equal(type.display.fontWeight, undefined);
  assert.equal(type.h1.fontWeight, undefined);
  assert.equal(type.h2.fontWeight, undefined);

  // The card-title voice did NOT move: 15pt sits under Playfair's ~18pt
  // floor, so `title` keeps the platform serif and a meaningful fontWeight.
  assert.equal(type.title.fontFamily, 'Georgia');
  assert.equal(type.title.fontWeight, '700');

  // lib/theme.ts mirrors the decision for its two large roles; subheading
  // (17pt/600) stays on the platform serif — no 600 face is bundled.
  const theme = stripComments(await read('lib/theme.ts'));
  assert.match(theme, /displayBold: 'PlayfairDisplay-Bold'/);
  assert.match(theme, /displayExtraBold: 'PlayfairDisplay-ExtraBold'/);
  assert.match(theme, /title: \{ fontSize: 28, fontFamily: fonts\.displayExtraBold,/);
  assert.match(theme, /heading: \{ fontSize: 22, fontFamily: fonts\.displayBold,/);
  assert.match(theme, /subheading: \{ fontSize: 17, fontWeight: '600', fontFamily: fonts\.display,/);

  // The faces the roles name are real bundled TTFs, registered and gated at
  // the root — a deleted asset or an ungated root resurrects D5's flash.
  for (const file of ['PlayfairDisplay-Bold.ttf', 'PlayfairDisplay-ExtraBold.ttf']) {
    const ttf = await readFile(new URL(`../assets/fonts/${file}`, import.meta.url));
    assert.ok(ttf.length > 50_000, `${file} is implausibly small for a real face`);
    assert.equal(ttf.readUInt32BE(0), 0x00010000, `${file} must carry the TrueType magic`);
  }
  const app = stripComments(await read('App.tsx'));
  assert.match(app, /useFonts\(\{/);
  assert.match(app, /'PlayfairDisplay-Bold': require\('\.\/assets\/fonts\/PlayfairDisplay-Bold\.ttf'\)/);
  assert.match(app, /'PlayfairDisplay-ExtraBold': require\('\.\/assets\/fonts\/PlayfairDisplay-ExtraBold\.ttf'\)/);
  assert.match(app, /fontsResolved \? children : null/);
});

// ---------------------------------------------------------------------------
// L-010 — the one star treatment reaches LIGHT, not just dark.
//
// docs/audit/2026-08-22/light_mode_parity.md's only rendering finding. The
// dark pass gave the app ONE star (lib/theme.ts `starColors`), but three
// bare-`★`-in-a-sentence spans were repointed on the dark side only:
//
//     <Text style={isDark ? styles.xStarDark : undefined}>★</Text>
//
// `undefined` is not "the Heritage star" — it is no paint at all, so in light
// the glyph inherited the muted grey of the meta line it sits in. The helper
// had expressed light correctly the whole time; nothing called it there.
//
// WHY NOT VACUOUS. Half one EXECUTES lib/theme.ts and compares the helper's
// answer to the palette, so flipping either branch fails. Half two DERIVES the
// site list by scanning the tree for the glyph — a fourth bare star added
// anywhere under screens/, components/ or ui/ fails until it is painted the
// same way — and counts painted spans against glyphs per file, so reverting
// one site to the `isDark ? … : undefined` shape fails on that file by name
// while the glyph count stays put.
// ---------------------------------------------------------------------------

test('L-010 fence: the one star treatment resolves in LIGHT too, at every bare-★ site', async () => {
  const { colors, darkColors, starColors } = await themeModule;

  // --- half one: the helper, executed against both palettes ----------------
  assert.equal(starColors(colors, false).filled, colors.star, 'light filled star is the star token');
  assert.equal(starColors(darkColors, true).filled, darkColors.gold, 'dark filled star is Prestige gold');
  assert.equal(starColors(colors, false).empty, colors.border, 'light empty star is the neutral border');
  // The exact regression: a light star that reads as body-meta grey.
  for (const grey of ['textMuted', 'textSubtle', 'text']) {
    assert.notEqual(
      starColors(colors, false).filled,
      colors[grey],
      `the light filled star must never resolve to ${grey} — that IS the washed-out star`,
    );
  }

  // --- half two: every bare glyph in the tree, derived --------------------
  // The painted shape, and the glyph itself. Comment-stripped first, so a
  // docblock that draws a ★ to explain the rule is not mistaken for a site.
  const PAINTED = /<Text style=\{\{ color: starColors\(colors, isDark\)\.filled \}\}> ?★/g;
  const GLYPH = /★/g;

  const sites = [];
  for (const path of await filesUnder(['screens', 'components', 'ui'])) {
    const flat = stripComments(await read(path)).replace(/\s+/g, ' ');
    const glyphs = [...flat.matchAll(GLYPH)].length;
    if (glyphs === 0) continue;
    sites.push(path);
    assert.equal(
      [...flat.matchAll(PAINTED)].length,
      glyphs,
      `${path}: every bare ★ must be painted through starColors(colors, isDark).filled — ` +
        'an isDark-gated style leaves the light half inheriting the meta line',
    );
  }

  // The three L-010 sites, derived rather than trusted. A new bare star lands
  // here as a failure with its own path, not as silence.
  assert.deepEqual(sites, [
    'screens/BidDetailScreen.tsx',
    'screens/ProfileScreen.tsx',
    'screens/SavedWorkersScreen.tsx',
  ]);

  // The style keys the three sites used to carry are gone, not merely unused —
  // a dead `…StarDark: { color: colors.gold }` is the shape a future run
  // re-attaches to the glyph.
  for (const path of sites) {
    assert.doesNotMatch(
      stripComments(await read(path)),
      /StarDark:\s*\{/,
      `${path}: the dark-only star style key must be deleted, not left dangling`,
    );
  }
});

// ---------------------------------------------------------------------------
// L-002 — the eleven category accents are token-layer data, at unchanged values.
//
// They were twenty-two raw hexes in lib/jobs.ts: outside all three sanctioned
// token surfaces (CLAUDE.md "Design system and navigation") and outside the
// hex fence's scanned directories, so a twelfth could have been added with
// nothing to catch it. The move to ui/tokens.ts is a REFACTOR — this fence is
// what makes that claim checkable rather than asserted.
//
// WHY NOT VACUOUS. The table below is the pre-refactor lib/jobs.ts table
// copied byte for byte, and it is compared against the EXECUTED token module,
// so a single changed digit anywhere fails. It then pins the two properties
// that make "both palettes resolve to today's exact hexes" true rather than
// hopeful: the accents are not palette keys (so no theme resolution can move
// them), and lib/jobs.ts holds the table but no literal (so the values were
// moved, not copied). Gating — that dark never paints this table at all — is
// tests/emeraldFences.test.mjs F5's job and is deliberately not restated here.
// ---------------------------------------------------------------------------

/** lib/jobs.ts's JOB_CATEGORY_COLORS exactly as it stood at dd518d9, before
 *  the values moved to the token layer. A refactor moves no pixel. */
const CATEGORY_ACCENTS_BEFORE_L002 = {
  handyman: { bg: '#3B6FA6', icon: '#FFFFFF' },
  cleaning: { bg: '#2E8B84', icon: '#FFFFFF' },
  moving: { bg: '#C56A2E', icon: '#FFFFFF' },
  dog_walking: { bg: '#7B5CA6', icon: '#FFFFFF' },
  yard_work: { bg: '#5A8F3C', icon: '#FFFFFF' },
  errands: { bg: '#E0A93A', icon: '#3D2B0F' },
  furniture_assembly: { bg: '#8B6544', icon: '#FFFFFF' },
  tv_mounting: { bg: '#5B6B75', icon: '#FFFFFF' },
  painting: { bg: '#B85C7A', icon: '#FFFFFF' },
  packing: { bg: '#4A5A9E', icon: '#FFFFFF' },
  other: { bg: '#6B7280', icon: '#FFFFFF' },
};

test('L-002 fence: the category accents moved to the token layer at unchanged values', async () => {
  const { categoryAccents, light, dark } = await tokensModule;

  // 1. VALUE PARITY, executed. Every one of the twenty-two values, byte for
  //    byte, against the table that lived in lib/jobs.ts.
  assert.deepEqual(
    JSON.parse(JSON.stringify(categoryAccents)),
    CATEGORY_ACCENTS_BEFORE_L002,
    'L-002 is a refactor, not a retune — a category badge repainted',
  );

  // 2. BOTH PALETTES RESOLVE TO THOSE HEXES. The accents are identity colours,
  //    not palette roles: they are absent from light and from dark, so there
  //    is no resolution step that could move one theme's badge off the other's.
  //    (An accent quietly repointed at a palette token — `colors.forest`, say —
  //    WOULD flip between themes; this is what forbids that.)
  for (const key of Object.keys(CATEGORY_ACCENTS_BEFORE_L002)) {
    assert.ok(!(key in light), `${key} must not become a light palette token`);
    assert.ok(!(key in dark), `${key} must not become a dark palette token`);
  }
  for (const [key, pair] of Object.entries(categoryAccents)) {
    for (const half of ['bg', 'icon']) {
      assert.match(pair[half], /^#[0-9A-F]{6}$/, `categoryAccents.${key}.${half} must be a plain hex`);
    }
  }

  // 3. THE VALUES MOVED, they were not copied. lib/jobs.ts keeps the table and
  //    its guarded accessor — tests/emeraldFences.test.mjs F5 pins both
  //    declarations — but carries no colour literal of any kind any more, which
  //    is the whole point of the finding.
  const jobs = stripComments(await read('lib/jobs.ts'));
  assert.match(
    jobs,
    /JOB_CATEGORY_COLORS: Record<JobCategory, \{ bg: string; icon: string \}> =\s*categoryAccents;/,
    'lib/jobs.ts must take the table from the token layer',
  );
  assert.equal(
    jobs.match(/#[0-9a-fA-F]{3,8}\b/),
    null,
    `lib/jobs.ts: a raw hex literal is back — ${jobs.match(/#[0-9a-fA-F]{3,8}\b/)?.[0] ?? ''}`,
  );
  assert.equal(
    jobs.match(/\b(?:rgba?|hsla?)\(/),
    null,
    'lib/jobs.ts: a raw rgb/hsl colour literal is back',
  );
});

// ---------------------------------------------------------------------------
// Resolver plumbing — 4D-4: preference + system resolution, native sync
// ---------------------------------------------------------------------------

test('[static] the theme resolver honors preference and system, and syncs native surfaces', async () => {
  const [hookSource, providerSource, app, appJson] = await Promise.all([
    read('hooks/useThemeColors.ts'),
    read('lib/ThemeContext.tsx'),
    read('App.tsx'),
    read('app.json'),
  ]);
  // Comment-stripped: the docblocks legitimately NAME the APIs they explain;
  // only code is held to the contract.
  const hook = stripComments(hookSource);
  const provider = stripComments(providerSource);

  // The hook reads the provider and ONLY the provider — the OS appearance is
  // an input the provider resolves, never something a consumer samples.
  assert.doesNotMatch(hook, /useColorScheme/);
  assert.match(hook, /useTheme\(\)/);
  assert.match(hook, /from '\.\.\/lib\/ThemeContext'/);

  // 4D-4: the provider is where all three inputs meet — the stored
  // preference (via lib/themePreferenceStorage), the live system appearance
  // (useColorScheme subscribes to Appearance changes), and the pure
  // resolution rule (lib/themePreference). A pinned choice is pushed to the
  // native side so the keyboard, alerts, share sheets and MapKit tiles
  // follow the app, applied at bootstrap and on every change.
  assert.match(provider, /useColorScheme\(\)/);
  assert.match(provider, /readThemePreference/);
  assert.match(provider, /writeThemePreference/);
  assert.match(provider, /resolveColorScheme\(/);
  assert.match(provider, /Appearance\.setColorScheme\(/);
  // Storage mechanics live in lib/themePreferenceStorage.ts, not here.
  assert.doesNotMatch(provider, /AsyncStorage|SecureStore/);

  // Mounted once; navigation and the status bar derive from the resolution.
  assert.match(app, /<ThemeProvider>/);
  assert.match(app, /from '\.\/lib\/ThemeContext'/);
  assert.match(app, /theme=\{navigationTheme\}/);
  assert.doesNotMatch(stripComments(app), /<StatusBar style="dark"/);

  // 4D-4 flipped this to "automatic" (T1) — native surfaces follow the
  // trait, which Appearance.setColorScheme then steers per the preference.
  assert.equal(JSON.parse(appJson).expo.userInterfaceStyle, 'automatic');
});

// ---------------------------------------------------------------------------
// The migrated files never regain a raw colour literal
// ---------------------------------------------------------------------------

/** Files the 4D-3.5 sweep migrated to token reads. Comment-stripped source
 *  must contain no raw hex and no rgba() literal, except the named leaves. */
const MIGRATED_FILES = [
  'App.tsx',
  'components/ActionSheet.tsx',
  'components/AmountPrompt.tsx',
  'components/AuthButton.tsx',
  'components/ChatBubble.tsx',
  'components/ConfirmDialog.tsx',
  'components/ConversationRow.tsx',
  'components/JobVideo.tsx',
  'components/ModeTransitionOverlay.tsx',
  'components/PastWork.tsx',
  'components/PhotoViewer.tsx',
  'components/PortfolioPicker.tsx',
  'components/ReactionPicker.tsx',
  'components/ReportDialog.tsx',
  'components/ReviewSection.tsx',
  'components/ServicePickerSheet.tsx',
  'components/VoiceNote.tsx',
  'components/WorkerJobCard.tsx',
  'hooks/useThemeColors.ts',
  'lib/ThemeContext.tsx',
  'screens/ChatScreen.tsx',
  'screens/JobDetailScreen.tsx',
  'screens/PaymentMethodsScreen.tsx',
  'screens/ProfileScreen.tsx',
  'screens/ServicesPricingScreen.tsx',
  'screens/WorkChecklistScreen.tsx',
  'screens/WorkerHomeScreen.tsx',
  'screens/WorkerJobScreen.tsx',
  'screens/WorkerProfileScreen.tsx',
  'ui/primitives/MediaGrid.tsx',
  'ui/primitives/Sheet.tsx',
];

/** Literals deliberately left in place, each with its reason on the record
 *  (final report, 4D-3.5). An entry here is an allowance for THAT string
 *  only — anything else in the file still fails. */
const ALLOWED_LITERALS = {
  // The mode-transition shimmer's highlight core: a brand-asset tint paired
  // with the baked transition-* PNGs (STAGE4D_PLAN.md T3 makes dark variants
  // of those assets design work, not code). Migrates when the assets do.
  'components/ModeTransitionOverlay.tsx': ["'#FFF3D6'"],
};

test('[static] migrated files carry no raw hex or rgba() colour literals', async () => {
  for (const path of MIGRATED_FILES) {
    let source = stripComments(await read(path));
    for (const allowed of ALLOWED_LITERALS[path] ?? []) {
      assert.ok(
        source.includes(allowed),
        `${path}: expected the recorded leave ${allowed}; if it was migrated, drop its allowance`,
      );
      source = source.split(allowed).join('');
    }
    const hex = source.match(/#[0-9a-fA-F]{3,8}\b/);
    assert.equal(hex, null, `${path}: raw hex literal ${hex?.[0] ?? ''} crept back in`);
    const rgba = source.match(/rgba?\(/);
    assert.equal(rgba, null, `${path}: raw rgb/rgba() literal crept back in`);
  }
});
