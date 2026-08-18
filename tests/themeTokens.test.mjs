import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ---------------------------------------------------------------------------
// 4D-3.5 — dual palettes and the token migration, light-pinned.
//
// Three layers, in order of strength:
//   1. ui/colorAlpha.ts and ui/tokens.ts are EXECUTED (the moneyCeiling
//      pattern; react-native is stubbed for tokens) so withAlpha's output and
//      light/dark key parity are facts, not source patterns.
//   2. The resolver plumbing (provider pinned to light, no Appearance read,
//      app.json untouched) is pinned against source, marked [static].
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

  // The five Prestige anchors that make dark "Emerald Prestige" and not just
  // an inversion: gold primary (forest === gold), dark content on that gold
  // fill, and surfaces darker than their content.
  assert.equal(dark.forest, dark.gold, 'Prestige primary is gold');
  assert.notEqual(dark.onForest, light.onForest, 'onForest must flip dark for the gold fill');
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
// Resolver plumbing — pinned light, no Appearance read, app.json untouched
// ---------------------------------------------------------------------------

test('[static] the theme resolver is pinned to light with no Appearance read', async () => {
  const [hookSource, providerSource, app, appJson] = await Promise.all([
    read('hooks/useThemeColors.ts'),
    read('lib/ThemeContext.tsx'),
    read('App.tsx'),
    read('app.json'),
  ]);
  // Comment-stripped: the docblocks legitimately NAME the APIs they explain
  // are absent; only code may not touch them.
  const hook = stripComments(hookSource);
  const provider = stripComments(providerSource);

  // The hook reads the provider and ONLY the provider.
  assert.doesNotMatch(hook, /useColorScheme/);
  assert.match(hook, /useTheme\(\)/);
  assert.match(hook, /from '\.\.\/lib\/ThemeContext'/);

  // The provider returns light unconditionally in 4D-3.5 — no Appearance
  // API, no stored preference, no dark resolution path yet.
  assert.doesNotMatch(provider, /useColorScheme|Appearance|AsyncStorage|SecureStore/);
  assert.match(provider, /isDark: false/);
  assert.match(provider, /palette: colors/);

  // Mounted once, above the app-state providers.
  assert.match(app, /<ThemeProvider>/);
  assert.match(app, /from '\.\/lib\/ThemeContext'/);

  // 4D-4 owns flipping this to "automatic" (needs a native build — T1).
  assert.equal(JSON.parse(appJson).expo.userInterfaceStyle, 'light');
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
