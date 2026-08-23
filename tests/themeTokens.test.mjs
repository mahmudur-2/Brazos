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
// ONE SERIF ROLE, NOTHING ELSE — 2026-08-22, the operator's THIRD font
// decision of that day (docs/emerald-v2/DECISIONS.md D5's third dated note).
// The second retired every serif; the third PARTIALLY reverses it: the
// customer Home hero title — that one role, nothing else — returns to
// Playfair Display (the Bold static, recovered byte-identical from the
// pre-retirement commit with its OFL license, registered by App.tsx's
// LaunchGate exactly the way the pre-retirement code registered it).
//
// This test is the no-serif fence NARROWED by exactly that one allowance.
// It still goes red the moment a serif appears anywhere else — a second
// role, a second file, a second face, a platform-serif stack, a stray .ttf.
//
// WHY IT IS NOT VACUOUS. Four halves, none a restatement of another:
//
//   1. EXECUTED. Both token surfaces are RUN. Every type ROLE still resolves
//      to no family (the system sans); the one face token, `displayHero`,
//      must resolve to exactly 'PlayfairDisplay-Bold' — a rename, a second
//      face token or a Platform.select serif fails in the resolved value.
//   2. WEIGHTS, AS VALUES. The sans heading roles still get their weight
//      from `fontWeight` (nothing else is bundled), pinned exactly. The hero
//      role is the inverse: the FAMILY is the weight, so the style that
//      names it must carry no fontWeight for iOS to honour the file.
//   3. DERIVED, NOT ENUMERATED. Every `fontFamily:` in the app tree is found
//      by scanning. The global allow-list is unchanged (fonts.display /
//      fonts.body / undefined); `fonts.displayHero` is permitted in
//      screens/HomeScreen.tsx ONLY, and EXACTLY ONCE — a second naming site
//      in that file, or one anywhere else, fails.
//   4. THE ASSET AND THE LOADER. Exactly ONE font file under assets/ —
//      PlayfairDisplay-Bold.ttf — and App.tsx registers exactly that face,
//      gates children on its resolution and couples the launch handover to
//      it, the pre-retirement arrangement restored.
// ---------------------------------------------------------------------------

/** The only right-hand sides a `fontFamily:` may carry anywhere in the tree. */
const ALLOWED_FONT_FAMILY = /^(fonts\.display\b|fonts\.body\b|undefined\b)/;

/** The one serif role's token, permitted in the one screen file only. */
const HERO_FONT_FAMILY = /^fonts\.displayHero\b/;

/** Family names that are serifs. Applied to font-family positions only — the
 *  word "serif" is legitimate in prose, in HomeScreen's cap-height ladder, and
 *  in `lib/countries.ts`'s entry for the country Georgia. */
const SERIF_FAMILY = /playfair|georgia|times new roman|\bserif\b/i;

/** The one quoted serif value each of these files may carry, and must. */
const QUOTED_SERIF_ALLOWANCE = new Map([
  // The token definition site.
  ['lib/theme.ts', "'PlayfairDisplay-Bold'"],
  // The registration's face name and its require path.
  ['App.tsx', "'PlayfairDisplay-Bold'"],
]);

test('one-serif fence: the hero role alone is Playfair, and nothing else is a serif', async () => {
  const { type } = await tokensModule;
  const { typography, fonts } = await themeModule;

  // --- half one: executed, both surfaces -----------------------------------
  // `undefined` IS the system sans here: RN resolves an absent family to the
  // platform default, which is what body copy has always used.
  for (const role of ['display', 'h1', 'h2', 'title']) {
    assert.equal(type[role].fontFamily, undefined, `type.${role} must name no family`);
  }
  for (const role of ['title', 'heading', 'subheading', 'body', 'label', 'caption']) {
    assert.equal(typography[role].fontFamily, undefined, `typography.${role} must name no family`);
  }
  assert.equal(fonts.display, undefined, 'the shared heading voice stays the system sans');
  assert.equal(
    fonts.displayHero,
    'PlayfairDisplay-Bold',
    'the hero face is the one recovered Playfair static, under exactly this name'
  );

  // --- half two: the weights ----------------------------------------------
  // Sans roles: fontWeight is load-bearing (no file backs them), pinned.
  assert.equal(type.display.fontWeight, '800');
  assert.equal(type.h1.fontWeight, '800');
  assert.equal(type.h2.fontWeight, '700');
  assert.equal(type.title.fontWeight, '700');
  assert.equal(typography.title.fontWeight, '800');
  assert.equal(typography.heading.fontWeight, '700');
  assert.equal(typography.subheading.fontWeight, '600');
  // The hero role is the inverse: a bundled static makes fontWeight inert on
  // iOS, so the style that names the face must not carry one.
  const homeSource = stripComments(await read('screens/HomeScreen.tsx'));
  const heroStyle = /headline: \{([^}]*)\}/.exec(homeSource.replace(/\s+/g, ' '));
  assert.ok(heroStyle, 'the hero headline style must stay a plain object');
  assert.match(heroStyle[1], /fontFamily: fonts\.displayHero/);
  assert.doesNotMatch(
    heroStyle[1],
    /fontWeight/,
    'the family IS the weight for a bundled static — a fontWeight here is inert on iOS'
  );

  // --- half three: every fontFamily: in the tree, derived by scanning ------
  const offenders = [];
  let heroSites = 0;
  const sources = await filesUnder([
    'components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui',
  ]);
  for (const path of [...sources, 'App.tsx']) {
    const source = stripComments(await read(path));
    for (const match of source.matchAll(/fontFamily:\s*/g)) {
      const rhs = source.slice(match.index + match[0].length, match.index + match[0].length + 80);
      if (HERO_FONT_FAMILY.test(rhs)) {
        if (path === 'screens/HomeScreen.tsx') {
          heroSites += 1;
        } else {
          offenders.push(`${path}: fontFamily: fonts.displayHero outside the hero screen`);
        }
        continue;
      }
      if (!ALLOWED_FONT_FAMILY.test(rhs)) {
        offenders.push(`${path}: fontFamily: ${rhs.split('\n')[0].trim()}`);
      }
    }
    // A serif reached through anything other than a fontFamily: site — a
    // helper, a spread, a theme object — still has to name the family.
    const serif = SERIF_FAMILY.exec(source);
    if (serif && /\.(ts|tsx)$/.test(path) && path !== 'lib/countries.ts') {
      // Only a QUOTED family name counts; identifiers like MASTER_SERIF_CAPS
      // and GEORGIA_CAP_RATIO are frozen size arithmetic, not a face.
      for (const quoted of source.matchAll(/'([^']*)'|"([^"]*)"/g)) {
        const value = quoted[1] ?? quoted[2];
        if (!SERIF_FAMILY.test(value)) continue;
        const allowance = QUOTED_SERIF_ALLOWANCE.get(path);
        // The registration's require path names the file; everything else
        // must be the exact allowed family literal for that file.
        const isAllowed =
          allowance !== undefined &&
          (quoted[0] === allowance ||
            (path === 'App.tsx' && value === './assets/fonts/PlayfairDisplay-Bold.ttf'));
        if (!isAllowed) offenders.push(`${path}: quoted serif family ${quoted[0]}`);
      }
    }
    // Font-file references: only the registration may name the one file.
    if (path !== 'App.tsx') {
      assert.doesNotMatch(source, /\.(ttf|otf)\b/, `${path} must not reference a font file`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.equal(
    heroSites,
    1,
    `fonts.displayHero must be named by exactly ONE style — the hero title — not ${heroSites}`
  );

  // --- half four: the asset tree and the loader ----------------------------
  const assets = await readdir(join(repoRoot, 'assets'), { withFileTypes: true, recursive: true });
  assert.deepEqual(
    assets.filter((e) => e.isFile() && /\.(ttf|otf|woff2?)$/i.test(e.name)).map((e) => e.name),
    ['PlayfairDisplay-Bold.ttf'],
    'exactly one font file may be bundled — the recovered hero face',
  );

  const app = stripComments(await read('App.tsx'));
  assert.match(app, /import \{ useFonts \} from 'expo-font';/);
  assert.match(
    app,
    /useFonts\(\{\s*'PlayfairDisplay-Bold': require\('\.\/assets\/fonts\/PlayfairDisplay-Bold\.ttf'\),\s*\}\)/,
    'the loader registers exactly the one recovered face'
  );
  // The pre-retirement gate, restored: children wait for the face, the
  // launch handover is coupled to it, and a load error releases the gate.
  assert.match(app, /const fontsResolved = fontsLoaded \|\| fontLoadError != null;/);
  assert.match(app, /\{fontsResolved \? children : null\}/);
  assert.match(app, /sessionReady=\{!loading && fontsResolved\}/);
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
