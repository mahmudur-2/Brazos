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

// app.json became app.config.ts (three build variants need three bundle
// identifiers). userInterfaceStyle lives at the same key path, one level
// shallower: the default export IS the expo config, with no `expo` wrapper.
const loadAppConfig = async () =>
  (await import(new URL('../app.config.ts', import.meta.url).href)).default({ config: {} });

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
      // RUN H2 added `constantAccents` to what lib/theme.ts takes from the token
      // module, and RUN GROUND1 (C4) added `shadows` — lib/theme surfaces the
      // dark card shadow by reference rather than copying its numbers. The
      // destructure here has to name everything that import names, or the
      // executed module throws a ReferenceError at first use rather than
      // failing an assertion — so the stub is widened, never the assertions.
      // RUN T1 (C2) added `metricGeneration` (themedStyles keyed on it); D1
      // (lean) removed it with the design studio.
      // 2026-09-18 added `light as emeraldLight`: the task card's three roles
      // are defined once in ui/tokens.ts and lib/theme.ts takes BOTH palettes'
      // values by reference, the light side included.
      // Fix run E3 added `controls`: touchSlop() reads the 44pt floor from it.
      // A2-M1 added `litCard` and `wells`: litRowStyle() and wellStyle() are called below.
      'const { brand, controls, dark: emeraldDark, light: emeraldLight, constantAccents, litCard: tokenLitCard, radius, shadows: tokenShadows, spacing, type: tokenType, wells, withAlpha: alpha } = globalThis.__THEME_TOKENS__;',
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
  // 2026-09-26 (the refresh): Emerald Lux Glass — forest is the Lux mint CTA, and
  // the content on it is the Lux dark ink, not the cream.
  assert.equal(dark.onForest, '#062018', 'the Lux dark ink reads on the mint fill');
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
// ONE SERIF ROLE, NOTHING ELSE — and since 2026-08-23 that role is the
// PLATFORM's serif rather than a bundled one. 2026-08-22 ran three font
// decisions (docs/emerald-v2/DECISIONS.md D5): bundle Playfair for three
// heading roles, reverse that in full and retire the platform serif too,
// then re-bundle Playfair for the customer Home hero title alone. The
// fourth decision, the day after, keeps that ONE role and sets it in
// 'Georgia' — so the app ships no font file again, and the launch gate no
// longer waits on expo-font.
//
// This test is the no-serif fence NARROWED by exactly that one allowance.
// It still goes red the moment a serif appears anywhere else — a second
// role, a second face, a platform-serif stack, a bundled .ttf, a loader.
//
// WHY IT IS NOT VACUOUS. Four halves, none a restatement of another:
//
//   1. EXECUTED. Both token surfaces are RUN. Every type ROLE still resolves
//      to no family (the system sans); the one face token, `displayHero`,
//      must resolve to exactly 'Georgia' — a rename, a second face token or
//      a Platform.select stack fails in the resolved value.
//   2. WEIGHTS, AS VALUES. Every role gets its weight from `fontWeight`,
//      pinned exactly — the hero role INCLUDED, which is the inversion this
//      decision brings: a bundled static made the family the weight and any
//      fontWeight inert, a platform face makes the weight load-bearing
//      again. Without one the hero would render at Georgia regular.
//   3. DERIVED, NOT ENUMERATED. Every `fontFamily:` in the app tree is found
//      by scanning. The global allow-list is unchanged (fonts.display /
//      fonts.body / undefined); `fonts.displayHero` is permitted in
//      screens/HomeScreen.tsx ONLY, and EXACTLY ONCE — a second naming site
//      in that file, or one anywhere else, fails.
//   4. THE ASSET AND THE ABSENT LOADER. The recovered PlayfairDisplay-Bold
//      static is still on disk and must stay the ONLY font file there — but
//      nothing may require it, nothing may call useFonts, and the launch
//      gate is back to its one condition, the session.
// ---------------------------------------------------------------------------

/** The only right-hand sides a `fontFamily:` may carry anywhere in the tree. */
const ALLOWED_FONT_FAMILY = /^(fonts\.display\b|fonts\.body\b|undefined\b)/;

/** The one serif role's token, permitted in the hero screens only. */
const HERO_FONT_FAMILY = /^fonts\.displayHero\b/;

/**
 * Where the hero face may be named, and how many times in each file.
 *
 * 2026-09-21 — TWO SITES, BY THE OPERATOR'S RULING (DECISIONS 18): the
 * customer Home's hero title, as since 2026-08-23, and the Welcome page's
 * headline — the shipped Welcome page (docs/mockups/html/lux/welcome-ship.html)
 * draws "Get it done. / Work with / confidence." in Georgia 44/47, and the
 * operator, asked whether to widen this rule to it, said yes. Still ONE role
 * — the hero headline of a screen — on two screens; still the platform face,
 * still no file, still no loader, and every other claim below holds. A site
 * not named here, or a second naming in any of these files, fails here.
 *
 * 2026-09-21, later — A THIRD SITE, BY THE OPERATOR'S PICK (DECISIONS 20):
 * the email Sign-in screen's headline, "Sign in to BRAZOS", drawn by its ship
 * page (docs/mockups/html/lux/signin-ship-light.html) in the Welcome's serif
 * at the form size, Georgia 34/38 — chosen from the ideas page that day
 * ("make it d"). Same role, same face, same file-less rule.
 *
 * 2026-09-21, later still — THE FOURTH, the phone Sign-in's headline, by the
 * same operator's word (DECISIONS 21: "make the changes we talked about to
 * sign in screen for With phone, not just email") — its ship page
 * docs/mockups/html/lux/signin-phone-ship-light.html draws the same
 * "Sign in to Brazos" in the same Georgia 34/38.
 */
/*
 * 2026-09-28 — THE POSTING FLOW'S SITES, BY THE OPERATOR'S LIST (LUX-LIST-64
 * #38, #42): the job's own title where the flow shows it whole — the review
 * summary's title (refs/job-summary.html `.title`, Georgia 25) and the
 * published card's (refs/publish-moment.html `.jt`, Georgia 21) — and the live
 * page's headline, "Your job is live." (`.lv-title`, Georgia 32), which is the
 * hero headline of a screen like the four above. Same face, still no file, no
 * loader; a naming anywhere else still fails here.
 */
const HERO_SITES = new Map([
  ['screens/HomeScreen.tsx', 1],
  ['screens/WelcomeScreen.tsx', 1],
  ['screens/EmailSignInScreen.tsx', 1],
  ['screens/SignInScreen.tsx', 1],
  ['components/JobSummaryCard.tsx', 1],
  ['components/JobLivePage.tsx', 2],
]);

/** Family names that are serifs. Applied to font-family positions only — the
 *  word "serif" is legitimate in prose, in HomeScreen's cap-height ladder, and
 *  in `lib/countries.ts`'s entry for the country Georgia. */
const SERIF_FAMILY = /playfair|georgia|times new roman|\bserif\b/i;

/** The one quoted serif value each of these files may carry, and must. The
 *  token definition site is now the ONLY one — there is no registration. */
// 2026-09-26 (the refresh): EMPTY — the operator: "change any font from everywhere
// to this (default one i already have on the app)". No file may name a serif.
const QUOTED_SERIF_ALLOWANCE = new Map([]);

test('one-serif fence: the hero role alone is Georgia, and nothing else is a serif', async () => {
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
    undefined,
    'the hero role is the system sans like every other role (2026-09-26, one font everywhere)'
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
  // The hero role is NO LONGER the inverse. Georgia is a platform face, not a
  // bundled static, so iOS selects the cut from `fontWeight` exactly as it
  // does for the sans roles above: the weight is load-bearing again, and the
  // style that names the face must carry it. '700' is the weight the Bold
  // static shipped, which is what this title looked like the day before.
  const homeSource = stripComments(await read('screens/HomeScreen.tsx'));
  const heroStyle = /headline: \{([^}]*)\}/.exec(homeSource.replace(/\s+/g, ' '));
  assert.ok(heroStyle, 'the hero headline style must stay a plain object');
  assert.match(heroStyle[1], /fontFamily: fonts\.displayHero/);
  assert.match(
    heroStyle[1],
    /fontWeight: '700'/,
    'a platform face takes its cut from fontWeight — without one the hero renders at regular'
  );

  // --- half three: every fontFamily: in the tree, derived by scanning ------
  const offenders = [];
  const heroSites = new Map();
  const sources = await filesUnder([
    'components', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui',
  ]);
  for (const path of [...sources, 'App.tsx']) {
    const source = stripComments(await read(path));
    for (const match of source.matchAll(/fontFamily:\s*/g)) {
      const rhs = source.slice(match.index + match[0].length, match.index + match[0].length + 80);
      if (HERO_FONT_FAMILY.test(rhs)) {
        if (HERO_SITES.has(path)) {
          heroSites.set(path, (heroSites.get(path) ?? 0) + 1);
        } else {
          offenders.push(`${path}: fontFamily: fonts.displayHero outside the hero screens`);
        }
        continue;
      }
      // RUN G1 (C3): the design studio's Values readout renders data in the
      // PLATFORM monospace — one identifier, one file, and Menlo/monospace is
      // no serif, no bundled face and no loader, so every claim this fence
      // makes still holds. Anywhere else it is an offender like any other.
      if (/^STUDIO_MONO\b/.test(rhs) && path === 'components/DesignStudioPanel.tsx') {
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
    // Font-file references and loaders: NOTHING may carry either now. The
    // recovered static is on disk and is required by no one.
    assert.doesNotMatch(source, /\.(ttf|otf)\b/, `${path} must not reference a font file`);
    assert.doesNotMatch(source, /useFonts|expo-font/, `${path} must not load a font`);
  }
  assert.deepEqual(offenders, []);
  assert.deepEqual(
    [...heroSites.entries()].sort(),
    [...HERO_SITES.entries()].sort(),
    `fonts.displayHero must be named by exactly ONE style in each hero screen — saw ${JSON.stringify([...heroSites.entries()])}`
  );
  // The Welcome headline, like Home's, carries its cut as a value: a platform
  // face renders at regular without one.
  const welcomeSource = stripComments(await read('screens/WelcomeScreen.tsx'));
  const welcomeHeadline = /headline: \{([^}]*)\}/.exec(welcomeSource.replace(/\s+/g, ' '));
  assert.ok(welcomeHeadline, 'the Welcome headline style must stay a plain object');
  assert.match(welcomeHeadline[1], /fontFamily: fonts\.displayHero/);
  assert.match(welcomeHeadline[1], /fontWeight: '700'/, 'the Welcome headline names its cut');

  // --- half four: the asset tree and the loader ----------------------------
  const assets = await readdir(join(repoRoot, 'assets'), { withFileTypes: true, recursive: true });
  assert.deepEqual(
    assets.filter((e) => e.isFile() && /\.(ttf|otf|woff2?)$/i.test(e.name)).map((e) => e.name),
    [],
    'no font file ships (D8 moved the orphaned Playfair static to _archive/2026-11-lean/) — and none may join the asset tree',
  );

  const app = stripComments(await read('App.tsx'));
  assert.doesNotMatch(app, /useFonts|expo-font/, 'nothing registers a face any more');
  // The launch gate is back to its ONE condition: the session. A face that
  // ships with the OS cannot arrive late, so nothing holds the layer for it
  // and there is no load failure to release it on.
  assert.doesNotMatch(app, /fontsResolved|fontsLoaded|fontLoadError/);
  assert.match(app, /\{children\}/);
  // F1 (fix run, 2026-10-03) adds a hold for the first real screen, capped —
  // still no face: the doesNotMatch above keeps fonts out of it.
  assert.match(app, /sessionReady=\{!loading && \(contentReady \|\| holdCapped\)\}/);
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

  // The L-010 sites, derived rather than trusted (lean D5 deleted the third,
  // SavedWorkersScreen). A new bare star lands here as a failure with its own
  // path, not as silence.
  assert.deepEqual(sites, [
    'screens/BidDetailScreen.tsx',
    'screens/ProfileScreen.tsx',
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
// RUN G1 (C1) — the materials table, and the legibility its fallbacks carry.
//
// The three glass materials are DATA in ui/tokens.ts, worn only through
// ui/primitives/Surface.tsx. Two claims are made executable here:
//
//   1. The table is the dispatched one — blur, scrim mix, hairline mix and
//      fallback mix per material, one shared scrim ink, the brand mint line.
//   2. LEGIBILITY IS THE SCRIM'S JOB, and the worst case is provable: on web
//      and under Reduce Transparency the surface is scrim-only at
//      `fallbackScrimAlpha`, and the worst thing that scrim can sit on is
//      pure white. Composited there, the app's dark ivory text must still
//      clear WCAG 4.5:1 and the secondary text 3:1. The blurred dark-theme
//      renders sit on darker grounds at deeper stacks, so the fallback is the
//      floor — if this passes, no rendering of the material reads worse.
// ---------------------------------------------------------------------------

const MATERIALS_AS_DISPATCHED = {
  // RUN S3 (D11) — SOLID NAV GROUND: the chrome material is opaque now
  // (blur 0, both scrims at 1). The ink, the hairline hue, the border alpha
  // and the radius contract did NOT move — this is the same material at a
  // different mix — so the one-scrim-ink assertion below still holds, and the
  // contrast assertion still passes on its own arithmetic (the worst-case
  // ground simply becomes the pure scrim ink rather than a wash of it).
  chrome: { blur: 0, scrimAlpha: 1, borderAlpha: 0.2, fallbackScrimAlpha: 1, radius: null, radiusTopOnly: false },
  // A2-M3 (the director, finding 1): solid where no blur draws, as `menu` is. Was .92.
  sheet: { blur: 40, scrimAlpha: 0.72, borderAlpha: 0.16, fallbackScrimAlpha: 1, radius: 28, radiusTopOnly: true },
  // 2026-09-29 (LUX-LIST-2 #9): the pop-ups' glass, frosted stronger and denser, solid where no blur draws.
  menu: { blur: 80, scrimAlpha: 0.9, borderAlpha: 0.14, fallbackScrimAlpha: 1, radius: 16, radiusTopOnly: false },
};

/** WCAG relative luminance of a #RRGGBB hex. */
const luminanceOf = (hex) => {
  const channel = (byte) => {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio between two #RRGGBB hexes. */
const contrastOf = (a, b) => {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** `hex` at `alpha`, composited over pure white, back to #RRGGBB. */
const overWhite = (hex, alpha) => {
  const mix = [1, 3, 5]
    .map((at) => parseInt(hex.slice(at, at + 2), 16))
    .map((byte) => Math.round(alpha * byte + (1 - alpha) * 255))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `#${mix}`;
};

test('G1 materials: the table is as dispatched, worn from one scrim ink and the brand mint', async () => {
  const { materials, brand } = await tokensModule;
  // 2026-09-18: 'clear' is the fourth — the [+] create sheet's pane.
  // 2026-09-19: 'pane' is the fifth — the approved Map design's jobs and
  // Filters panes, asserted below.
  // 2026-09-27: 'card' is the sixth — the Lux remake's flat card (ruling 8 of
  // docs/dispatch/LUX-REMAKE.md), asserted below.
  // 2026-09-28: 'dropdown' is the seventh — the Inbox ••• menu's glass
  // (LUX-LIST-64 #53, docs/mockups/html/refs/inbox-clean-list.html), asserted below.
  assert.deepEqual(Object.keys(materials), ['chrome', 'sheet', 'menu', 'clear', 'pane', 'card', 'dropdown']);
  for (const [name, expected] of Object.entries(MATERIALS_AS_DISPATCHED)) {
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(materials[name][key], value, `materials.${name}.${key} moved off the dispatched value`);
    }
    assert.equal(materials[name].scrimColor, '#071B15', `materials.${name} left the one scrim ink`);
    assert.equal(materials[name].borderColor, brand.mint, `materials.${name}'s hairline must be the brand mint`);
  }
  // CLEAR (2026-09-18, G1 "Clear" of docs/mockups/html/glass-sheet.html): the
  // same scrim ink at the see-through 0.40, a WHITE rim — the mockup's, and
  // the one exception to the mint rule above, because a mint hairline reads
  // green on glass this clear — the specular top edge, and the one light
  // recipe in the table ("L2 Frost", for this sheet alone). Every other
  // material carries no light block, which is what keeps light flat.
  const { colors: lightPalette } = await tokensModule;
  assert.equal(materials.clear.scrimColor, '#071B15');
  assert.equal(materials.clear.scrimAlpha, 0.4);
  assert.equal(materials.clear.borderColor, lightPalette.surface, 'the rim is the one white');
  assert.equal(materials.clear.borderAlpha, 0.14);
  assert.equal(materials.clear.highlightAlpha, 0.22);
  // A2-M3: the sheet's own fallback went solid (finding 1); the [+] create sheet is a loved surface
  // and keeps its .92 — the value it always shared with the sheet — pinned here on its own.
  assert.equal(materials.clear.fallbackScrimAlpha, 0.92, 'no blur, no clearer pane');
  assert.deepEqual([materials.clear.radius, materials.clear.radiusTopOnly], [28, true], 'docked: top corners');
  assert.deepEqual(materials.clear.light, {
    blur: 50,
    scrimColor: lightPalette.surface,
    scrimAlpha: 0.72,
    borderColor: lightPalette.surface,
    borderAlpha: 0.85,
    fallbackScrimAlpha: 0.96,
    highlightAlpha: 0.95,
  });
  // PANE (2026-09-19, docs/mockups/html/map-explore-dark.html, the liquid
  // pass the operator approved; 2026-09-20 sitting 2, recipe "D" — richer,
  // rim only): the pane's OWN ink — #062418, the mockup gradient's mean,
  // not the shared glass scrim — at 0.88 over a blur of 30, deeper than
  // sheet, far deeper than clear, so the map reads through as a hint; the
  // mint rim at 0.46; NO specular top edge (it doubled the rim into a thick
  // band on the phone — DECISIONS 2026-09-20 sitting 2, (4)); a MINT sheen
  // 0.10 → 0.04; the docked radius by default; and NO light block: the
  // operator ruled light flat ("no liquid glass on light mode"), so light
  // panes render the surface under the line hairline through Surface's
  // flat branch.
  assert.equal(materials.pane.scrimColor, '#062418');
  assert.equal(materials.pane.blur, 30);
  assert.equal(materials.pane.scrimAlpha, 0.88);
  assert.equal(materials.pane.borderColor, brand.mint);
  assert.equal(materials.pane.borderAlpha, 0.46);
  assert.equal(materials.pane.highlightAlpha, 0, 'rim only — no inner top line on any pane');
  assert.deepEqual(materials.pane.sheen, { fromAlpha: 0.1, toAlpha: 0.04, color: brand.mint }, 'the mint-tinted sheen');
  assert.equal(materials.pane.fallbackScrimAlpha, 0.94);
  assert.deepEqual([materials.pane.radius, materials.pane.radiusTopOnly], [28, true], 'docked by default');
  // 2026-09-20 (sitting 2, item 13): the panes' OWN edges, one table — the
  // operator's picks from seven honest renders: the search pill and the Today
  // chip option C (the dark emerald rim at .70 under a soft glow), the jobs
  // sheet option B (the bright green at .60, the same glow), the Filters
  // sheet the pane's rim as a hairline with no glow. Rims are never thicker
  // than 1pt; the glow is rings of PANE_HALO_RING points, no shadow.
  const { paneEdges, PANE_HALO_RING, dark } = await tokensModule;
  assert.equal(PANE_HALO_RING, 2);
  // 2026-09-27 (the Lux remake, ruling 2): pinned to today's #5FAE81 as a
  // literal — `dark.emerald` is the one mint now, and the map does not move.
  assert.deepEqual(paneEdges.search, {
    rim: { color: '#5FAE81', alpha: 0.7 },
    halo: { color: '#5FAE81', alphas: [0.12, 0.06, 0.03] },
  });
  assert.notEqual(dark.emerald, '#5FAE81', 'the pin is a pin only while the palette has moved');
  assert.deepEqual(paneEdges.sheet, {
    rim: { color: '#7DE7A4', alpha: 0.6 },
    halo: { color: '#7DE7A4', alphas: [0.12, 0.06, 0.03] },
  });
  assert.deepEqual(paneEdges.filters, { rim: { color: brand.mint, alpha: 0.46, width: 'hairline' } });
  for (const edge of Object.values(paneEdges)) {
    assert.ok(edge.rim.width === undefined || edge.rim.width === 'hairline', 'a rim is 1pt or a hairline, never thicker');
  }
  for (const name of ['chrome', 'sheet', 'menu', 'pane']) {
    assert.equal(materials[name].light, undefined, `${name} must stay flat in light — no light recipe`);
  }
  // CARD (2026-09-27, the Lux remake, ruling 8 — docs/mockups/html/lux/
  // lux.build.mjs `.card`): the glass card FLAT — no blur — the fill
  // rgba(12,44,38,.52), the rim rgba(200,255,230,.20), the WHITE specular edge
  // at .16 (its own colour, not the rim's), the drop shadow 0 10px 30px black
  // .35 (a native radius of 15), radius 22 on all four corners; the fallback
  // draws it nearly opaque. Light: a white card, no visible rim, under the auth
  // surface's soft card shadow — the one other material with a light block.
  assert.equal(materials.card.blur, 0, 'flat: a blur adds nothing on a static ground');
  // 2026-09-29 (LUX-LIST-2 #6) — THE LIT CARD, the operator's pick from .shots/refresh/depth/ ("B lit
  // … a tiny bit lesser"): an OPAQUE wash #0F2E27 → #0B211C (the task card's lit wash at 70% of its
  // lift) over the same #0B211C, the Lux rim .20, the white edge .16 drawn as an inset shadow (Surface),
  // today's lift. Was #0C2C26 at .58 / rim .24 / a straight strip at .22 (2026-09-27, one notch past
  // the Lux). Light: white falling to #F9F8F3 under the green rim .14 and the Lux light card's shadow.
  assert.equal(materials.card.scrimColor, '#0B211C');
  assert.equal(materials.card.scrimAlpha, 1);
  assert.deepEqual(materials.card.wash, { top: '#0F2E27', bottom: '#0B211C' });
  assert.equal(materials.card.borderColor, '#C8FFE6');
  assert.equal(materials.card.borderAlpha, 0.2);
  assert.equal(materials.card.highlightAlpha, 0.16);
  assert.equal(materials.card.highlightColor, lightPalette.surface, 'the specular edge is white');
  assert.equal(materials.card.fallbackScrimAlpha, 1);
  assert.deepEqual(materials.card.shadow, { color: '#000000', alpha: 0.42, radius: 17, y: 12 });
  assert.deepEqual([materials.card.radius, materials.card.radiusTopOnly], [22, false]);
  assert.deepEqual(materials.card.light, {
    blur: 0,
    scrimColor: '#F9F8F3',
    scrimAlpha: 1,
    wash: { top: '#FFFFFF', bottom: '#F9F8F3' },
    borderColor: '#0D6B52',
    borderAlpha: 0.14,
    fallbackScrimAlpha: 1,
    highlightAlpha: 0,
    shadow: { color: '#10261D', alpha: 0.105, radius: 15, y: 10 },
  });
  // DROPDOWN (2026-09-28, LUX-LIST-64 #53 — the approved clean list's `.menu`):
  // blur 22 (intensity 44; web draws × 0.5), the Lux mint rim at .24, the white
  // top edge at .14, `0 22px 48px rgba(0,0,0,.55)` (a native radius of 24),
  // radius 18 on all four corners; its tint is the pane fill below, and where
  // no blur draws, the gradient's mean nearly opaque. Glass in LIGHT too — the
  // reference's frosted white under a green rim at .16 and a soft green shadow.
  // 2026-09-29 (LUX-LIST-2 #9): frosted stronger and denser (blur 80, the gradient .86 → .92), and
  // SOLID where no blur can draw (fallback 1).
  assert.equal(materials.dropdown.blur, 80);
  assert.equal(materials.dropdown.scrimColor, '#11362D');
  assert.equal(materials.dropdown.borderColor, '#7EE2B4');
  assert.equal(materials.dropdown.borderAlpha, 0.24);
  assert.equal(materials.dropdown.highlightAlpha, 0.14);
  assert.equal(materials.dropdown.highlightColor, lightPalette.surface, 'the top edge is white');
  assert.equal(materials.dropdown.fallbackScrimAlpha, 1);
  assert.deepEqual(materials.dropdown.shadow, { color: '#000000', alpha: 0.55, radius: 24, y: 22 });
  assert.deepEqual([materials.dropdown.radius, materials.dropdown.radiusTopOnly], [18, false]);
  assert.deepEqual(materials.dropdown.light, {
    blur: 80,
    scrimColor: lightPalette.surface,
    scrimAlpha: 0.89,
    borderColor: '#0E6B52',
    borderAlpha: 0.16,
    fallbackScrimAlpha: 1,
    highlightAlpha: 0.9,
    highlightColor: lightPalette.surface,
    shadow: { color: '#102A1D', alpha: 0.18, radius: 22, y: 18 },
  });
  const { paneFills } = await tokensModule;
  assert.deepEqual(paneFills.dropdown, {
    angle: 160,
    from: { color: '#1A4A3E', alpha: 0.86 },
    to: { color: '#09221C', alpha: 0.92 },
    light: {
      angle: 160,
      from: { color: lightPalette.surface, alpha: 0.86 },
      to: { color: '#ECF4EF', alpha: 0.92 },
    },
  });
});

test('G1 materials: the web-fallback scrim on pure white keeps primary text ≥4.5:1 and secondary ≥3:1', async () => {
  const { materials } = await tokensModule;
  const { darkColors } = await themeModule;

  for (const [name, spec] of Object.entries(materials)) {
    const worstGround = overWhite(spec.scrimColor, spec.fallbackScrimAlpha);
    const primary = contrastOf(darkColors.text, worstGround);
    const secondary = contrastOf(darkColors.textMuted, worstGround);
    assert.ok(
      primary >= 4.5,
      `${name}: primary text ${darkColors.text} over the fallback scrim on white is ${primary.toFixed(2)}:1 — below 4.5:1`,
    );
    assert.ok(
      secondary >= 3,
      `${name}: secondary text ${darkColors.textMuted} over the fallback scrim on white is ${secondary.toFixed(2)}:1 — below 3:1`,
    );
  }
});

// ---------------------------------------------------------------------------
// Fix run E1 / E2 — TEXT CONTRAST, COMPUTED. Every ink a screen sets as text
// clears WCAG AA (4.5:1) on the grounds it sits on, in both palettes. The
// palettes are the EXECUTED modules above, so a token edit that drops an ink
// under the line fails here with its ratio, not on a phone.
// ---------------------------------------------------------------------------

/** `hex` at `alpha` over the opaque `ground`, back to #RRGGBB. */
const over = (hex, alpha, ground) => {
  const byte = (h, at) => parseInt(h.slice(at, at + 2), 16);
  const mix = [1, 3, 5]
    .map((at) => Math.round(alpha * byte(hex, at) + (1 - alpha) * byte(ground, at)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `#${mix}`;
};

const assertAA = (ink, ground, what) => {
  const ratio = contrastOf(ink, ground);
  assert.ok(ratio >= 4.5, `${what}: ${ink} on ${ground} is ${ratio.toFixed(2)}:1 — below 4.5:1`);
};

test('E1 contrast: every light text ink clears 4.5:1 on the cream, the white card and the chip', async () => {
  const { colors } = await themeModule;
  const { light, meltBar, litCard } = await tokensModule;
  const pages = { background: colors.background, surface: colors.surface };
  const chips = { ...pages, neutralBg: colors.neutralBg, mint: light.mint };

  // lib/theme `colors`, the screens' surface.
  for (const key of ['text', 'textMuted', 'textSubtle', 'navInactive', 'success', 'warning', 'danger', 'info', 'neutral', 'eyebrowGold', 'homeSlate']) {
    for (const [name, ground] of Object.entries(pages)) assertAA(colors[key], ground, `light colors.${key} on ${name}`);
  }
  // ui/tokens `colors`, the new screens' surface.
  for (const key of ['ink', 'muted', 'authMuted', 'danger', 'warn', 'navInactive', 'eyebrowGold', 'inboxPreview', 'inboxChipInk', 'grey', 'waitingInk', 'dropGlyph', 'dropDanger', 'draftInk', 'money', 'mark', 'stageAssigned', 'stageProgress', 'stageReview']) {
    for (const [name, ground] of Object.entries(pages)) assertAA(light[key], ground, `light tokens.${key} on ${name}`);
  }
  // The secondary inks that sit on a chip fill as well as on the page.
  for (const [ink, key] of [[colors.textMuted, 'textMuted'], [colors.textSubtle, 'textSubtle'], [light.muted, 'muted'], [light.inboxChipInk, 'inboxChipInk']]) {
    for (const [name, ground] of Object.entries(chips)) assertAA(ink, ground, `light ${key} on ${name}`);
  }
  // Each status ink on its own tint, and the waiting primary's ink on its fill.
  for (const key of ['success', 'warning', 'danger', 'info', 'neutral']) {
    assertAA(colors[key], colors[`${key}Bg`], `light ${key} on ${key}Bg`);
  }
  assertAA(light.waitingInk, light.waitingFill, 'light waitingInk on waitingFill');
  // Each stage ink on its own tint — the filled light status pill (StatusBadge) draws exactly that pair.
  for (const key of ['stageAssigned', 'stageProgress', 'stageReview']) {
    assertAA(light[key], light[`${key}Bg`], `light tokens.${key} on ${key}Bg`);
  }
  // A resting tab label: the ink at the rest alpha over the white pill, at both of its stops.
  for (const stop of [litCard.light.top, litCard.light.bottom]) {
    assertAA(over(light.ink, meltBar.restInkAlpha.light, stop), stop, 'a resting light tab label on the pill');
  }
});

test('E2 contrast: the dark secondary inks and the one dark red clear 4.5:1 on the card, the chip and the lit card', async () => {
  const { colors, darkColors } = await themeModule;
  const { dark, meltBar, litCard } = await tokensModule;
  const grounds = {
    background: darkColors.background,
    surface: darkColors.surface,
    mint: darkColors.mint,
    neutralBg: darkColors.neutralBg,
    taskCardLitTop: darkColors.taskCardLitTop,
    litCardTop: litCard.dark.top,
  };
  for (const key of ['text', 'textMuted', 'textSubtle', 'danger', 'success', 'warning', 'eyebrowGold']) {
    for (const [name, ground] of Object.entries(grounds)) assertAA(darkColors[key], ground, `dark colors.${key} on ${name}`);
  }
  for (const key of ['muted', 'danger', 'dropDanger', 'inboxChipInk', 'eyebrowGold']) {
    for (const [name, ground] of Object.entries(grounds)) assertAA(dark[key], ground, `dark tokens.${key} on ${name}`);
  }
  // The quiet grey is words on the lit card and the page (an unchosen Start-in tile, the media
  // limit pills), never on a chip fill.
  for (const ground of [litCard.dark.top, litCard.dark.bottom, darkColors.surface, darkColors.background]) {
    assertAA(dark.grey, ground, 'dark tokens.grey on its card or page');
  }
  assertAA(darkColors.navInactive, darkColors.surface, 'dark navInactive on surface');
  // One dark red: the error ink, the dropdown's red rows and the map's palette agree.
  assert.equal(darkColors.danger, dark.danger);
  assert.equal(dark.dropDanger, dark.danger);
  // Content on a solid danger fill (the bell's count) reads in both themes.
  assertAA(colors.onPrimary, colors.danger, 'light onPrimary on the danger fill');
  assertAA(darkColors.onPrimary, darkColors.danger, 'dark onPrimary on the danger fill');
  for (const stop of [litCard.dark.top, litCard.dark.bottom]) {
    assertAA(over(dark.ink, meltBar.restInkAlpha.dark, stop), stop, 'a resting dark tab label on the pill');
  }
});

// ---------------------------------------------------------------------------
// A2-M1 (E3) — THE PARTS' CONTRAST, COMPUTED. Every text and mark the visual
// foundation's parts draw, on every ground the part sits on, in both themes:
// the button family, the field, the section label, the status pill, the focus
// ring and the header chevron. Text needs 4.5:1, a mark 3:1. The ratio of each
// pair prints as a diagnostic, so `node --test tests/themeTokens.test.mjs` is
// the contrast table. It reads lib/theme's `palette` (the screens' one door)
// and the token constants; the second palette (ui/tokens `light`/`dark`) is
// E1 and E2's until the palettes become one.
// ---------------------------------------------------------------------------

test('A2-E3 contrast: the parts\' text and marks clear AA on the grounds they sit on, in both themes', async (t) => {
  const { colors, darkColors } = await themeModule;
  const { litCard, wells, discs, dangerBright } = await tokensModule;
  const rows = [];
  const check = (what, ink, grounds, floor = 4.5) => {
    for (const [name, ground] of Object.entries(grounds)) {
      rows.push({ what: `${what} on ${name}`, ink, ground, floor, ratio: contrastOf(ink, ground) });
    }
  };
  const darkWell = (stop) => over(wells.field.ink, wells.field.inkAlpha, stop);
  const light = {
    background: colors.background,
    surface: colors.surface,
    litCardTop: litCard.light.top,
    litCardBottom: litCard.light.bottom,
  };
  const dark = {
    background: darkColors.background,
    surface: darkColors.surface,
    litCardTop: litCard.dark.top,
    litCardBottom: litCard.dark.bottom,
    wellOnCardTop: darkWell(litCard.dark.top),
    wellOnCardBottom: darkWell(litCard.dark.bottom),
  };

  // The button family. Main: its ink on its fill. Danger: the one bright red, both themes.
  check('light main label', colors.onPrimary, { primary: colors.primary });
  check('dark main label', darkColors.onPrimary, { primary: darkColors.primary });
  check('danger label', dangerBright.label, { dangerBright: dangerBright.fill });
  // Quiet (a well) and text buttons: dark green in light, mint in dark. The field label is the same ink.
  check('light quiet/text label', colors.forest, light);
  check('dark quiet/text and field label', darkColors.primary, dark);
  check('light field label', colors.eyebrow, light);
  // A field's value, on the well (light: the cream ground) and the card.
  check('light field value', colors.text, light);
  check('dark field value', darkColors.text, dark);
  // The section label.
  check('light section label', colors.eyebrow, light);
  check('light gold section label', colors.eyebrowGold, light);
  check('dark section label', darkColors.eyebrow, dark);
  // The status pill: light is its ink on its own tint; dark is its ink on a .14 tint of itself over the card or page.
  for (const key of ['success', 'warning', 'danger', 'neutral', 'stageAssigned', 'stageProgress']) {
    check(`light ${key} pill`, colors[key], { [`${key}Bg`]: colors[`${key}Bg`] });
    const ink = darkColors[key];
    check(`dark ${key} pill`, ink, { onCard: over(ink, 0.14, litCard.dark.bottom), onPage: over(ink, 0.14, darkColors.background) });
  }
  // Marks. The focus ring's edge is the field's accent (TextField: `palette.emerald`) at the alpha
  // components/FocusRing.tsx draws it with in each theme, read from that file so the pair follows the code.
  const edge = /const EDGE_ALPHA = \{ dark: ([0-9.]+), light: ([0-9.]+) \}/.exec(await read('components/FocusRing.tsx'));
  const edgeAlpha = { dark: Number(edge?.[1]), light: Number(edge?.[2]) };
  for (const alpha of Object.values(edgeAlpha)) {
    assert.ok(alpha > 0 && alpha <= 1, `FocusRing's EDGE_ALPHA must be found (saw ${JSON.stringify(edgeAlpha)})`);
  }
  for (const [name, ground] of Object.entries({ background: colors.background, surface: colors.surface })) {
    const ink = over(colors.emerald, edgeAlpha.light, ground);
    rows.push({ what: `light focus ring edge on ${name}`, ink, ground, floor: 3, ratio: contrastOf(ink, ground) });
  }
  for (const [name, ground] of Object.entries({ wellOnCardTop: dark.wellOnCardTop, wellOnCardBottom: dark.wellOnCardBottom })) {
    const ink = over(darkColors.emerald, edgeAlpha.dark, ground);
    rows.push({ what: `dark focus ring edge on ${name}`, ink, ground, floor: 3, ratio: contrastOf(ink, ground) });
  }
  // The header's back chevron on its disc (ScreenHeader, AuthScaffold): gold on the card-ink disc in
  // dark, the text ink on a .08 text disc in light.
  check('dark header chevron', darkColors.gold, { disc: over(discs.header.ink, discs.header.inkAlpha, darkColors.background) }, 3);
  check('light header chevron', colors.text, { disc: over(colors.text, 0.08, colors.background) }, 3);

  // Every pair must clear (A2-M2 fixed the light focus ring, the last pair under its floor).
  assert.ok(rows.length > 50, `the table must cover the parts (saw ${rows.length} pairs)`);
  for (const row of rows) {
    t.diagnostic(`${row.ratio.toFixed(2)}:1  ${row.what}: ${row.ink} on ${row.ground}`);
  }
  const under = rows
    .filter((row) => !(row.ratio >= row.floor))
    .map((row) => `${row.what}: ${row.ink} on ${row.ground} is ${row.ratio.toFixed(2)}:1, under ${row.floor}:1`);
  assert.deepEqual(under, [], `a part's ink is under the contrast floor:\n${under.join('\n')}`);
});

test('A2 depth helpers: the well and the lit row draw no gradient, and the lit row one shadow layer', async () => {
  const { wellStyle, litRowStyle, colors, darkColors } = await themeModule;
  for (const isDark of [false, true]) {
    const well = wellStyle(isDark ? darkColors : colors, isDark);
    const row = litRowStyle(isDark);
    for (const [name, style] of [['wellStyle', well], ['litRowStyle', row]]) {
      assert.equal(style.experimental_backgroundImage, undefined, `${name} draws no gradient (isDark ${isDark})`);
      assert.equal(style.borderWidth, 1, `${name} keeps its 1pt rim (isDark ${isDark})`);
    }
    assert.equal(well.boxShadow ?? well.shadowOpacity, undefined, `the well casts no shadow (isDark ${isDark})`);
    assert.ok(typeof row.boxShadow === 'string' && !/\)\s*,/.test(row.boxShadow), `the lit row has one shadow layer: ${row.boxShadow}`);
  }
});

// ---------------------------------------------------------------------------
// A2-M2 — THE CONTROLS. The press's `fill` and `dim` are executed; the one red, the haptics and
// the never-cut labels are pinned against the parts' source.
// ---------------------------------------------------------------------------

/** components/PressScale.shared.tsx, executed with react-native's StyleSheet.flatten stubbed. */
const pressSharedModule = (async () => {
  const js = stripTypeScriptTypes(await read('components/PressScale.shared.tsx'), { mode: 'strip' });
  const stubbed = js.replace(
    /import \{[^}]*\} from 'react-native';/,
    'const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s || {});\n' +
      'const StyleSheet = { flatten: (s) => flat(s) };',
  );
  assert.ok(!/from '/.test(stubbed), 'every import of PressScale.shared must be stubbed or type-only');
  return import(toDataUrl(stubbed));
})();

test('[executed] A2-M2 press: `fill` gives a flex share one row height, and `dim` is the pressed opacity', async () => {
  const { pressStyles, withPressDim } = await pressSharedModule;
  // Without `fill` the split is today's: no grow on the Pressable, no row on the wrapper (2026-10-03).
  const plain = pressStyles({ flex: 1, minHeight: 52, backgroundColor: 'red' });
  assert.equal(plain.outer.flex, 1);
  assert.equal(plain.outer.flexDirection, undefined);
  assert.equal(plain.inner.flexGrow, undefined);
  // With `fill` the wrapper lays out as a row and the Pressable takes its width; the row's stretch carries the height.
  const filled = pressStyles({ flex: 2, minHeight: 52, backgroundColor: 'red' }, true);
  assert.equal(filled.outer.flex, 2);
  assert.equal(filled.outer.flexDirection, 'row');
  assert.deepEqual(
    [filled.inner.flexGrow, filled.inner.flexShrink, filled.inner.flexBasis, filled.inner.backgroundColor],
    [1, 1, 0, 'red'],
  );
  // A style that is a function of the press keeps being one, and keeps the share.
  const fn = pressStyles(({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.5 }], true);
  assert.equal(fn.outer.flexDirection, 'row');
  assert.deepEqual([fn.inner({ pressed: true }).flexGrow, fn.inner({ pressed: true }).opacity], [1, 0.5]);
  // `dim`: nothing without it; the pressed style with it, over the caller's own.
  const style = { backgroundColor: 'red' };
  assert.equal(withPressDim(style, undefined), style);
  const dimmed = withPressDim(style, 0.85);
  assert.deepEqual(Object.assign({}, ...dimmed({ pressed: true }).filter(Boolean)), { backgroundColor: 'red', opacity: 0.85 });
  assert.equal(Object.assign({}, ...dimmed({ pressed: false }).filter(Boolean)).opacity, undefined);
});

test('[static] A2-M2 one red: a page\'s red button, a form\'s red submit and a pop-up\'s red confirm are dangerBright', async () => {
  const button = stripComments(await read('components/Button.tsx'));
  assert.match(button, /: isDestructive\s*\? \{ backgroundColor: dangerBright\.fill \}/);
  assert.match(button, /: isDestructive\s*\? dangerBright\.label/);
  assert.match(button, /isDestructive && !isDisabled \? \(isDark \? dangerBright\.glow : shadows\.card\) : null/);
  const dialog = stripComments(await read('components/ConfirmDialog.tsx'));
  assert.match(dialog, /variant=\{destructive \? 'destructive' : 'primary'\}/);
  const form = stripComments(await read('ui/templates/FormScreen.tsx'));
  assert.match(form, /destructive: \{\s*backgroundColor: dangerBright\.fill,\s*\}/);
  assert.match(form, /destructiveLabel: \{\s*color: dangerBright\.label,\s*\}/);
  assert.match(form, /destructiveArmed && \(isDark \? dangerBright\.glow : shadows\.card\)/);
  // The second red is gone everywhere.
  const tokens = await tokensModule;
  assert.equal(tokens.dangerConfirmDark, undefined);
  for (const path of ['components/ConfirmDialog.tsx', 'lib/theme.ts', 'ui/tokens.ts', 'components/Button.tsx']) {
    assert.doesNotMatch(stripComments(await read(path)), /dangerConfirmDark|#FF5A4E/i, `${path} keeps no second red`);
  }
});

test('[executed] A2-M2 haptics: a choosing control ticks, a dangerous pop-up warns', async () => {
  const hook = await read('hooks/usePressFeedback.ts');
  const at = hook.indexOf('export function pressHaptic');
  const js = stripTypeScriptTypes(hook.slice(at, hook.indexOf('\n}', at) + 2), { mode: 'strip' });
  const calls = [];
  globalThis.__PRESS_HAPTICS__ = { select: () => calls.push('select'), tap: () => calls.push('tap') };
  const { pressHaptic } = await import(toDataUrl('const { select, tap } = globalThis.__PRESS_HAPTICS__;\n' + js));
  for (const haptic of [true, 'select', false]) pressHaptic(haptic);
  assert.deepEqual(calls, ['tap', 'select']);
  // The wearers: a choice chip, the switch, a segment that moves, a destructive pop-up as it opens.
  assert.match(stripComments(await read('components/Chip.tsx')), /haptic=\{check \? 'select' : true\}/);
  assert.match(stripComments(await read('ui/primitives/Toggle.tsx')), /usePressFeedback\(\{ haptic: 'select' \}\)/);
  assert.match(stripComments(await read('components/SegmentedControl.tsx')), /if \(!selected\) select\(\);\s*onChange\(option\.value\);/);
  assert.match(
    stripComments(await read('components/ConfirmDialog.tsx')),
    /useEffect\(\(\) => \{\s*if \(visible && destructive\) warning\(\);\s*\}, \[visible, destructive\]\);/,
  );
});

test('[static] A2-M2 labels and fields: a label takes two lines, centred; a pair keeps one height; a field is the 52pt well; money has equal digits', async () => {
  const button = stripComments(await read('components/Button.tsx'));
  assert.match(button, /numberOfLines=\{2\}\s*adjustsFontSizeToFit\s*minimumFontScale=\{0\.8\}/);
  assert.match(button, /text: \{[^}]*textAlign: 'center',\s*overflow: 'visible',/, 'the line limit never clips a glyph');
  assert.match(button, /const sharesRow = typeof flatStyle\?\.flex === 'number' && flatStyle\.flex > 0;/);
  assert.match(button, /dim=\{PRESS_DIM\}\s*fill=\{sharesRow \|\| \(pairHeight \? 'height' : false\)\}/);
  assert.doesNotMatch(button, /state\.pressed/, 'the dim is the press\'s now, not a pressed style');
  const form = stripComments(await read('ui/templates/FormScreen.tsx'));
  assert.equal(form.match(/<PressScale\s+onPress=\{on(?:Secondary|Submit)\}[^>]*?\s+fill\s/g)?.length, 2, 'both footer buttons fill their share');
  assert.equal(form.match(/\{\.\.\.LABEL_FIT\}/g)?.length, 2);
  assert.match(form, /buttonLabel: \{[^}]*textAlign: 'center',\s*overflow: 'visible',/);
  const field = stripComments(await read('components/TextField.tsx'));
  assert.match(field, /minHeight: controls\.textFieldHeight,/);
  assert.match(field, /wellStyle\(palette, isDark\),/);
  const { controls } = await tokensModule;
  assert.equal(controls.textFieldHeight, 52);
  const money = stripComments(await read('ui/primitives/MoneyText.tsx'));
  assert.equal(money.match(/fontVariant: \['tabular-nums'\]/g)?.length, 2, 'both amount sizes use equal-width digits');
});

// ---------------------------------------------------------------------------
// A2-M3 — SURFACES AND THE FOOT. The press's `fill="height"` is executed; the bottom rule (the bar
// steps aside), the floating action, Card's levels and the pop-up's pair height are pinned
// against the parts' source.
// ---------------------------------------------------------------------------

test('[executed] A2-M3 press: `fill="height"` is the row wrapper alone, so a content-width control takes its row\'s height', async () => {
  const { pressStyles } = await pressSharedModule;
  const paired = pressStyles({ flexShrink: 0, minHeight: 52, backgroundColor: 'red' }, 'height');
  assert.equal(paired.outer.flexDirection, 'row', 'the row stretch carries the height');
  assert.equal(paired.outer.flexShrink, 0);
  assert.deepEqual([paired.inner.flexGrow, paired.inner.flexBasis, paired.inner.backgroundColor], [undefined, undefined, 'red'], 'nothing grows: the control keeps its own width');
  const button = stripComments(await read('components/Button.tsx'));
  assert.match(button, /pairHeight = false,/);
  const dialog = stripComments(await read('components/ConfirmDialog.tsx'));
  assert.match(dialog, /title="Cancel"[\s\S]*?style=\{styles\.cancel\}\s*pairHeight\s*\/>/, 'the pop-up\'s Cancel keeps its action\'s height');
});

test('[static] A2-M3 the bottom rule: a focused screen hides the bar, which steps aside on its own spring and draws as before at rest', async () => {
  const nav = stripComments(await read('ui/primitives/BottomNav.tsx'));
  assert.match(nav, /export function useHideTabBar\(hidden = true\): void \{\s*useFocusedRegistration\(useContext\(BarHiddenRegistry\), hidden\);/);
  assert.match(nav, /export function useTabBarHidden\(\): boolean \{\s*return useContext\(BarHiddenCount\) > 0;/);
  assert.match(nav, /<BarHiddenRegistry\.Provider value=\{registerHidden\}>\s*<BarHiddenCount\.Provider value=\{hidden\}>\{children\}/, 'one provider above both trees serves the bar and the screens');
  const shared = stripComments(await read('components/MeltTabBar.shared.tsx'));
  const step = shared.slice(shared.indexOf('export function useStepAside'), shared.indexOf('export function UnderBarFade'));
  assert.match(step, /const hidden = useTabBarHidden\(\);/);
  assert.match(step, /const moved = hidden \|\| !home;/);
  assert.match(step, /const aside = !moved\s*\? null/, 'at rest the root wears no transform and no opacity');
  assert.match(step, /if \(finished && !hidden\) setHome\(true\);/, 'the style comes off only once the bar is home');
  assert.match(step, /const \[stiffness, damping\] = meltBar\.springs\.circles\[1\];/, "the bar's own middle spring");
  assert.equal(step.match(/useNativeDriver: USE_NATIVE_DRIVER/g)?.length, 2, 'both the slide and the reduced fade run on the native driver');
  assert.match(step, /: reduced\s*\? \{ opacity: away\.interpolate/, 'Reduce Motion fades instead of sliding');
  assert.match(step, /pointerEvents: hidden \? \('none' as const\) : \('box-none' as const\)/, 'a bar that has stepped aside takes no touch');
  assert.match(shared, /const shown = !onMap && !footPinned && !barHidden;/, 'the fade under the bar goes with it');
  // No wrapper: a wrapping view changes how the pill draws even at rest, so each path's root wears it.
  assert.match(stripComments(await read('components/MeltTabBar.tsx')), /<>\s*<UnderBarFade state=\{props\.state\} \/>\s*<Bar \{\.\.\.props\} \/>\s*<\/>/);
  for (const [path, tag] of [['components/MeltTabBar.tsx', 'Animated'], ['components/MeltTabBar.motion120.tsx', 'NativeAnimated']]) {
    const src = stripComments(await read(path));
    assert.match(src, /const stepAside = useStepAside\((reduced|false)\);/, `${path} steps aside`);
    assert.match(
      src,
      new RegExp(`<${tag}\\.View\\s+pointerEvents=\\{stepAside\\.pointerEvents\\}\\s+accessibilityElementsHidden=\\{stepAside\\.accessibilityElementsHidden\\}\\s+importantForAccessibility=\\{stepAside\\.importantForAccessibility\\}\\s+style=\\{\\[styles\\.root, \\{ height: m\\.bottom \\+ meltBar\\.height \\}, stepAside\\.aside\\]\\}`),
      `${path}: the root wears it`
    );
  }
  // A screen switches it on itself: no navigation file names it.
  for (const file of ['navigation/CustomerRoot.tsx', 'navigation/WorkerRoot.tsx', 'navigation/ModeShell.tsx', 'navigation/sharedStacks.tsx']) {
    assert.doesNotMatch(stripComments(await read(file)), /useHideTabBar|useTabBarHidden/, `${file} does not decide it`);
  }
});

test('[static] A2-M3 the floating action: no plate, the bar\'s place and lift, a quiet second, one hint line, its own keyboard rise', async () => {
  const part = stripComments(await read('ui/primitives/FloatingAction.tsx'));
  assert.match(part, /\}: FloatingActionProps\) \{\s*useHideTabBar\(\);/, 'it hides the bar while its screen is focused');
  assert.match(part, /const bottom = pillBottomOffset\(insets\.bottom, meltBar\.bottomTuck, meltBar\.bottomMin\);/, "it sits where the bar's pill sat");
  assert.match(part, /<KeyboardAvoid\s+behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}\s+keyboardVerticalOffset=\{PINNED_FOOTER_BOTTOM_PADDING - bottom\}/);
  assert.match(part, /variant="quiet"/);
  assert.match(part, /numberOfLines=\{1\}/);
  const foot = part.match(/foot: \{[^}]*\}/)?.[0] ?? '';
  assert.ok(foot.length > 0, 'the foot style exists');
  assert.doesNotMatch(foot, /background|border|shadow/i, 'no plate behind the pills');
  assert.match(part, /const shadow = \(isDark \? litCard\.dark : litCard\.light\)\.shadow;/, "depth 2: the lit card's lift");
  assert.match(part, /share: \{\s*flex: 1,\s*\}/, 'equal shares: one width, one height');
});

test('[static] A2-M3 Card levels: `lit` is the card as it was; `well` and `row` are the depth helpers', async () => {
  const card = stripComments(await read('components/Card.tsx'));
  assert.match(card, /level = 'lit',/);
  assert.match(card, /level === 'lit' \? \(\s*<Surface material="card" style=\{\[styles\.card, paletteStyle, style\]\}>/, 'the default draws exactly as before');
  assert.match(card, /level === 'well' \? \[styles\.well, wellStyle\(paletteProp \?\? colors, isDark\)\] : \[styles\.row, litRowStyle\(isDark\)\]/);
  assert.match(card, /well: \{\s*borderRadius: radius\.md,\s*\}/);
  assert.match(card, /row: \{\s*borderRadius: radius\.card,\s*\}/);
});

// ---------------------------------------------------------------------------
// A2-M4 — THE BID PARTS (direction §7, the owner's picture, F11, P3, F5). Pinned against the
// parts' source: the open bid's actions and links, the small "New", the Cancel Job inset, the
// amount label. The reply card's order is pinned in offerActionParity.test.mjs.
// ---------------------------------------------------------------------------

const openBidOf = (card) => card.slice(card.indexOf('if (inPlace) {'), card.indexOf('<View style={styles.headerRow}>'));

test('[static] A2-M4 the open bid: a quiet pair of one width, the main Accept under it; the name is the profile link; no Hire Again', async () => {
  const card = stripComments(await read('components/OfferCard.tsx'));
  const open = openBidOf(card);
  assert.ok(open.length > 0 && open.includes('inPlace.onToggle'), 'the in-place branch exists');
  const row = open.slice(open.indexOf('<View style={styles.inPlaceActionRow}>'), open.indexOf('acceptOfferActionLabel('));
  assert.equal((row.match(/variant="quiet"/g) ?? []).length, 2, 'Decline and Counter are the quiet pair');
  assert.equal((row.match(/style=\{styles\.actionButton\}/g) ?? []).length, 2, 'one share each: one width');
  assert.match(card, /actionButton: \{\s*flex: 1,\s*minWidth: 0,\s*\}/);
  assert.match(open, /<\/View>\s*<Button\s+title=\{acceptOfferActionLabel\(formatBudget\(offer\.amount_cents\), false\)\}\s+onPress=\{onAccept\}/, 'Accept is the main button under the pair');
  assert.doesNotMatch(open, /variant="(secondary|destructive)"/, 'no outlined or red action on the card');
  assert.doesNotMatch(open, /Hire Again|onHireAgain/, 'no Hire Again on a live bid');
  assert.doesNotMatch(open, /View Profile/, 'no "View Profile" row');
  assert.match(open, /inPlace\.open && onViewProfile \? \(\s*<PressScale[\s\S]*?onPress=\{onViewProfile\}[\s\S]*?accessibilityLabel=\{`View \$\{name\}'s profile`\}/, 'the open name opens the profile');
  assert.doesNotMatch(open, /priceLabel/, 'the chevron takes the "BID" eyebrow\'s place');
  assert.match(open, /<Text style=\{\[styles\.pitch, wellStyle\(palette, isDark\)\]\} selectable>/, 'the note sits in a well');
});

test('[static] A2-M4b F11: the small "New" tag only for no reviews and no jobs; under the star line the count stands alone; a star only beside a rating', async () => {
  const card = stripComments(await read('components/OfferCard.tsx'));
  const open = openBidOf(card);
  assert.match(open, /const showNewTag = summary\?\.isNew === true && summary\.total === 0 && jobs === 0;/, '"New" never sits beside a review or a job');
  assert.match(open, /const rated = summary\?\.isNew === false && ratingText !== '';/);
  assert.match(open, /ratingCount == null \|\| showNewTag \? '' : ratingCount === 0 \? 'No reviews yet' : rated \? `\(\$\{reviewCount\}\)` : reviewCount;/, 'the count alone ("1 review") under the star threshold');
  assert.match(open, /\{showNewTag \? \(\s*<View style=\{styles\.tag\}>\s*<Text style=\{styles\.tagText\}>\{ratingText\}<\/Text>\s*<\/View>\s*\) : rated \? \(\s*<>\s*<Ionicons name="star"/, 'a star stands only beside a rating');
  assert.equal((open.match(/name="star"/g) ?? []).length, 1);
  assert.doesNotMatch(open, /'New worker'/, 'no "New worker" line on the card');
  assert.match(open, /trust\.kind === 'new'\s*\?\s*jobs != null && jobs > 0\s*\?\s*`\$\{jobs\} completed \$\{jobs === 1 \? 'job' : 'jobs'\}`\s*:\s*''/, 'a worker with jobs shows the jobs line');
  assert.match(card, /tagText: \{\s*fontSize: 11,\s*fontWeight: '700',\s*color: colors\.emerald,\s*\}/);
});

test('[static] A2-M4b P3: the bid card\'s and the reply card\'s openers are one word; the form and the pop-ups keep theirs', async () => {
  const open = openBidOf(stripComments(await read('components/OfferCard.tsx')));
  const row = open.slice(open.indexOf('<View style={styles.inPlaceActionRow}>'), open.indexOf('acceptOfferActionLabel('));
  assert.match(row, /title=\{DECLINE_OPENER_LABEL\}[\s\S]*title=\{COUNTER_OPENER_LABEL\}/);
  const reply = stripComments(await read('components/OfferResponseActions.tsx'));
  assert.match(reply, /title=\{DECLINE_OPENER_LABEL\}[\s\S]*title=\{COUNTER_OPENER_LABEL\}/);
  assert.doesNotMatch(reply, /COUNTER_OFFER_ACTION_LABEL|declineOfferActionLabel/);
  assert.match(stripComments(await read('components/OfferComposer.tsx')), /title=\{isBid \? 'Send Bid' : 'Send Counter-Offer'\}/, "the counter form's submit keeps its words");
});

test('[static] A2-M5 T1: My Jobs draws the job row (one-line title, badge, price right, one hint, one chevron, thin rail); the Home keeps its card', async () => {
  const card = stripComments(await read('components/HubCard.tsx'));
  const row = card.slice(card.indexOf("if (layout === 'row') {"), card.indexOf('<View style={styles.statusRow}>'));
  assert.match(row, /<Text style=\{styles\.rowTitle\} numberOfLines=\{1\}>/, 'the title on one line');
  assert.match(row, /<StatusBadge status=\{status\} label=\{statusLabel\} \/>/);
  assert.match(row, /\{priceCents != null \? \(/, 'no budget, no big words in the price place');
  assert.doesNotMatch(row, /View details|arrow-forward/, 'the tap on the card is the action; no "View details"');
  assert.equal((row.match(/name="chevron-forward"/g) ?? []).length, 1, 'one chevron');
  assert.match(row, /<StageRail status=\{live\} onChat=\{onChat\} chatLabel=\{chatLabel\} thin \/>/);
  assert.match(row, /\{actionHead\}\s*\{actionTail \? <Text style=\{styles\.rowHintTail\}>\{` — \$\{actionTail\}`\}<\/Text> : null\}/, 'the hint keeps the same words');
  const hub = stripComments(await read('screens/MyJobsHubScreen.tsx'));
  assert.equal((hub.match(/layout="row"/g) ?? []).length, 4, 'every hub list draws rows');
  assert.equal((hub.match(/<HubCard/g) ?? []).length, 4);
  assert.doesNotMatch(stripComments(await read('screens/HomeScreen.tsx')), /layout=/, 'the loved Home keeps the card');
  assert.match(stripComments(await read('components/StageRail.tsx')), /\{thin \? null : <View style=\{styles\.rail\}>/, 'the thin rail drops only the step words');
});

test('[static] A2-M5 T2: the results row has one hint line and a narrow budget column; Worker Home\'s card is unchanged', async () => {
  const card = stripComments(await read('components/WorkerJobCard.tsx'));
  const end = card.indexOf('function PeekRow(');
  const compactAt = card.lastIndexOf('return (', end);
  const full = card.slice(card.indexOf("if (variant === 'full') {"), compactAt);
  const compact = card.slice(compactAt, end);
  assert.ok(full.length > 0 && compact.length > 0);
  assert.match(full, /<Text style=\{\[styles\.title, \{ paddingRight: payClear \}\]\} numberOfLines=\{1\}>/);
  assert.equal((full.match(/numberOfLines=\{2\}/g) ?? []).length, 1, 'one hint (it may wrap rather than cut a time)');
  assert.match(full, />BUDGET</);
  assert.match(card, /fullPay: \{\s*maxWidth: 84,\s*\}/, 'a narrow budget column');
  assert.match(compact, /<View style=\{styles\.metaRow\}>[\s\S]*<View style=\{styles\.metaRow\}>[\s\S]*Break the ice/, 'Worker Home keeps its lines');
});

test('[static] A2-M5 S1: the Earnings subtitle takes two lines and the header row grows to hold them; every other header keeps one', async () => {
  const header = stripComments(await read('components/ScreenHeader.tsx'));
  assert.match(header, /subtitleLines = 1,/, 'one line unless asked');
  assert.match(header, /numberOfLines=\{subtitleLines\}/);
  assert.match(header, /subtitle && subtitleLines === 2 \? styles\.containerTwoLine : null/);
  assert.match(header, /containerTwoLine: \{\s*minHeight: 44 \+ 17 \+ spacing\.xs \+ spacing\.sm,\s*\}/);
  assert.match(stripComments(await read('ui/templates/DetailScreen.tsx')), /subtitleLines=\{subtitleLines\}/);
  assert.match(stripComments(await read('screens/EarningsScreen.tsx')), /subtitleLines=\{2\}/);
});

test('[static] A2-M5 S2: the bid page\'s Decline | Counter is the bid card\'s quiet pair; no outline in a second red', async () => {
  const bid = stripComments(await read('screens/BidDetailScreen.tsx'));
  const bar = bid.slice(bid.indexOf('actionBar={'), bid.indexOf('<ConfirmDialog'));
  assert.ok(bar.length > 0, 'the action bar must exist');
  const pair = bar.slice(bar.indexOf('<View style={styles.actionRow}>'), bar.indexOf('acceptOfferActionLabel('));
  assert.match(pair, /title=\{declineOfferActionLabel\(false\)\}\s*variant="quiet"\s*palette=\{emeraldColors\}/);
  assert.match(pair, /title=\{COUNTER_OFFER_ACTION_LABEL\}\s*variant="quiet"\s*palette=\{emeraldColors\}/);
  assert.doesNotMatch(bar, /colors\.danger/, 'the one red is the destructive Button, never a palette swap');
});

test('[static] A2-M4 P3: the Cancel Job inset is the bid card\'s padding plus its rim, so it shares the Accept\'s width', async () => {
  const card = stripComments(await read('components/OfferCard.tsx'));
  assert.match(card, /export function offerActionInset\(\): number \{\s*return spacing\.lg \+ 1;\s*\}/);
  assert.match(card, /card: \{\s*borderRadius: radius\.xl,\s*borderColor: colors\.mint2,\s*padding: spacing\.lg,\s*\}/, 'the card pads by spacing.lg');
  assert.match(stripComments(await read('ui/primitives/Surface.tsx')), /rim\?\.width \?\? 1;/, "the card's rim is 1 pt");
});

test('[static] A2-M4 F5: the offer amount label is mint like every field label (no gold tone)', async () => {
  const composer = stripComments(await read('components/OfferComposer.tsx'));
  const field = composer.slice(composer.indexOf('export function OfferAmountField'), composer.indexOf('export function OfferComposer'));
  assert.match(field, /<TextField\s+label=\{label\}\s+value=\{value\}/);
  assert.doesNotMatch(field, /labelTone/);
});

test('E3 touchSlop: any drawn size reaches the 44pt floor on each axis it is given, and keeps its identity', async () => {
  const { touchSlop, textLine } = await themeModule;
  const { controls } = await tokensModule;
  const floor = controls.minTouchTarget;
  assert.equal(floor, 44);
  for (let drawn = 1; drawn <= floor + 4; drawn += 1) {
    const slop = touchSlop(drawn, drawn);
    assert.ok(drawn + slop.top + slop.bottom >= floor, `${drawn}pt tall stays under the floor`);
    assert.ok(drawn + slop.left + slop.right >= floor, `${drawn}pt wide stays under the floor`);
    assert.ok(slop.top <= Math.ceil(Math.max(0, floor - drawn) / 2), `${drawn}pt gets more slop than it needs`);
  }
  assert.deepEqual(touchSlop(34), { top: 5, bottom: 5, left: 0, right: 0 }, 'no width: a text link keeps its sides');
  assert.deepEqual(touchSlop(48, 60), { top: 0, bottom: 0, left: 0, right: 0 }, 'at the floor: nothing');
  assert.equal(touchSlop(34), touchSlop(34), 'one object per size, so the prop never churns');
  // E3 review (2026-10-03): the room a horizontal scroller makes for its pills' slop — the slop as
  // a negative vertical margin on the scroller, given back as padding on its content, so nothing
  // drawn moves; one object per size, as touchSlop().
  const { slopRoom } = await themeModule;
  assert.deepEqual(slopRoom(34), { scroller: { marginVertical: -5 }, content: { paddingVertical: 5 }, slop: 5 }, 'a 34pt row: 5 out, 5 back');
  assert.deepEqual(slopRoom(48), { scroller: { marginVertical: 0 }, content: { paddingVertical: 0 }, slop: 0 }, 'at the floor: no room');
  assert.equal(slopRoom(34).content.paddingVertical, touchSlop(34).top, 'the room is exactly the slop');
  assert.equal(slopRoom(34), slopRoom(34), 'one object per size, so the props never churn');
  assert.equal(textLine({ fontSize: 14 }), 17);
  assert.equal(textLine({ fontSize: 13, lineHeight: 18 }), 18);
});

// ---------------------------------------------------------------------------
// RUN T1 (C2) — the token reads and the palette-keyed style caches. D1 (lean):
// the design studio's override layer (lib/designOverrides.ts) is deleted, so
// its G1 fences and the override halves of these went with it.
// ---------------------------------------------------------------------------

/** Every metric key that is LIVE, read from the executed token surfaces so
 *  this can never drift from what the getters actually address. */
const liveMetricKeys = (async () => {
  const tokens = await tokensModule;
  const theme = await themeModule;
  return {
    spacing: new Set([
      ...Object.keys(tokens.SPACING_DEFAULTS),
      ...Object.keys(tokens.THEME_SPACING_DEFAULTS),
    ]),
    radius: new Set([
      ...Object.keys(tokens.RADIUS_DEFAULTS),
      ...Object.keys(tokens.THEME_RADIUS_DEFAULTS),
    ]),
    emeraldRadius: new Set(Object.keys(tokens.RADIUS_DEFAULTS)),
    controls: new Set(Object.keys(tokens.CONTROL_DEFAULTS)),
    layout: new Set(Object.keys(tokens.LAYOUT_METRIC_DEFAULTS)),
  };
})();

test('T1 tokens: every group answers with its table, and the fixed members are fixed', async () => {
  const tokens = await tokensModule;
  const theme = await themeModule;

  // Untouched, every group answers with the table it is built from.
  for (const [key, value] of Object.entries(tokens.SPACING_DEFAULTS)) {
    assert.equal(tokens.spacing[key], value, `spacing.${key} must ship at ${value}`);
  }
  for (const [key, value] of Object.entries(tokens.RADIUS_DEFAULTS)) {
    assert.equal(tokens.radius[key], value);
  }
  for (const [key, value] of Object.entries(tokens.CONTROL_DEFAULTS)) {
    assert.equal(tokens.controls[key], value);
  }
  for (const [key, value] of Object.entries(tokens.LAYOUT_METRIC_DEFAULTS)) {
    assert.equal(tokens.layout[key], value);
  }
  for (const [key, value] of Object.entries(tokens.THEME_SPACING_DEFAULTS)) {
    assert.equal(theme.spacing[key], value);
  }
  for (const [key, value] of Object.entries(tokens.THEME_RADIUS_DEFAULTS)) {
    assert.equal(theme.radius[key], value);
  }

  // ONE SPACING SCALE (fix run D8): ui/tokens' `spacing` and lib/theme's are
  // the SAME group, so `xl` is 24 from either import.
  assert.equal(tokens.spacing, theme.spacing, 'lib/theme re-exports the one spacing group');
  assert.equal(tokens.spacing.xl, 24);
  assert.equal(tokens.SPACING_DEFAULTS, tokens.THEME_SPACING_DEFAULTS, 'the §I name is the same table');

  // FIXED MEMBERS. A capsule is a shape and the touch floor is non-negotiable.
  assert.equal(tokens.radius.pill, 999, 'pill is a shape, not a size');
  assert.equal(theme.radius.pill, 999);
  assert.equal(tokens.controls.minTouchTarget, 44, 'the touch floor is 44');
  assert.equal(tokens.layout.maxContentWidth, 420, 'derived nav/layout geometry is fixed');
});

test('T1 cache: a stylesheet is the SAME OBJECT for a palette, and cached per palette', async () => {
  const tokens = await tokensModule;
  const theme = await themeModule;

  const palette = { surface: '#0A1813' };
  let builds = 0;
  const stylesFor = theme.themedStyles((colors) => {
    builds += 1;
    return { card: { backgroundColor: colors.surface, padding: tokens.spacing.lg } };
  });

  const first = stylesFor(palette);
  assert.equal(stylesFor(palette), first, 'identity, not deep equality — the pre-T1 contract');
  assert.equal(builds, 1, 'and the factory ran exactly once');
  assert.equal(first.card.padding, 16, 'carrying the shipped default');

  // A second palette is still cached per palette, exactly as before.
  const other = { surface: '#FFFFFF' };
  assert.notEqual(stylesFor(other), stylesFor(palette));
  assert.equal(stylesFor(other), stylesFor(other));
});

test('[static] T1 (D7): no live metric is captured into a module-scope constant', async () => {
  const keys = await liveMetricKeys;
  const files = await filesUnder(['components', 'ui', 'screens', 'hooks', 'lib', 'navigation', 'modes']);
  // The two definition files build the groups; they name the DEFAULT tables,
  // never the getters, so they cannot capture anything.
  const skip = new Set(['ui/tokens.ts', 'lib/theme.ts']);
  // A declaration that defers its read is fine, whatever shape the deferral
  // takes: an arrow, a function, or a lazily-built stylesheet.
  const DEFERRED = /=>|\bfunction\b|StyleSheet\.create|metricStyles|themedStyles/;
  const offenders = [];

  for (const file of files) {
    if (skip.has(file)) continue;
    const source = stripComments(await read(file));
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^(export\s+)?(const|let|var)\s/.test(lines[i])) continue;
      // Take the whole declaration: from this line until the running bracket
      // depth comes back to zero.
      let depth = 0;
      let text = '';
      for (let j = i; j < lines.length; j += 1) {
        text += lines[j] + '\n';
        for (const ch of lines[j]) {
          if (ch === '{' || ch === '(' || ch === '[') depth += 1;
          else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
        }
        if (depth <= 0) break;
      }
      if (DEFERRED.test(text)) continue;
      for (const [group, names] of Object.entries(keys)) {
        const re = new RegExp(`\\b${group}\\.(\\w+)`, 'g');
        let m;
        while ((m = re.exec(text)) !== null) {
          if (names.has(m[1])) offenders.push(`${file}:${i + 1} captures ${group}.${m[1]}`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a live metric read into a module-scope constant is frozen at import — read it at use time instead',
  );
});

test('[static] T1 (D7): the centred-header inset reads its spacing at use time', async () => {
  const source = await read('components/ScreenHeader.tsx');
  // The exact shape D7 names: `const X = spacing.xxl * 3` froze the answer at
  // import. It is a function now, called where it is used.
  assert.doesNotMatch(source, /const\s+CENTERED_TITLE_INSET\s*=/, 'the frozen capture must be gone');
  assert.match(source, /const centeredTitleInset = \(\) => spacing\.xxl \* 3;/);
  assert.equal(
    (source.match(/centeredTitleInset\(\)/g) ?? []).length,
    2,
    'both edges must call it, not read a constant',
  );
});

// ---------------------------------------------------------------------------
// Resolver plumbing — 4D-4: preference + system resolution, native sync
// ---------------------------------------------------------------------------

test('[static] the theme resolver honors preference and system, and syncs native surfaces', async () => {
  const [hookSource, providerSource, app, appConfig] = await Promise.all([
    read('hooks/useThemeColors.ts'),
    read('lib/ThemeContext.tsx'),
    read('App.tsx'),
    loadAppConfig(),
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
  assert.equal(appConfig.userInterfaceStyle, 'automatic');
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
  'components/PhotoViewer.tsx',
  'components/ReportDialog.tsx',
  'components/ReviewSection.tsx',
  'components/ServicePickerSheet.tsx',
  'components/WorkerJobCard.tsx',
  'hooks/useThemeColors.ts',
  'lib/ThemeContext.tsx',
  'screens/ChatScreen.tsx',
  'screens/JobDetailScreen.tsx',
  'screens/PaymentMethodsScreen.tsx',
  'screens/ProfileScreen.tsx',
  'screens/ServicesPricingScreen.tsx',
  'screens/WorkerHomeScreen.tsx',
  'screens/WorkerJobScreen.tsx',
  'screens/WorkerProfileScreen.tsx',
  'ui/primitives/Sheet.tsx',
];

/** Literals deliberately left in place, each with its reason on the record
 *  (final report, 4D-3.5). An entry here is an allowance for THAT string
 *  only — anything else in the file still fails. */
const ALLOWED_LITERALS = {
  // 2026-09-21 — the one allowance this map ever held (the mode-transition
  // shimmer's '#FFF3D6', paired with the baked transition-* PNGs) left with
  // the shimmer: the glass wipe draws from the palette alone.
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

// ---------------------------------------------------------------------------
// THE PARITY FENCE — 2026-08-24, and it is home(19)'s rule let out of one
// screen.
//
// THE OPERATOR'S STANDING PRODUCT RULE: between light and dark, ONLY colour
// VALUES may differ. Font size, weight, letterSpacing, textTransform,
// lineHeight, borderWidth, borderRadius, elevation, spacing and structure are
// one set of numbers for both. Where they diverged, DARK was correct and light
// adopted dark's value.
//
// home(19) already asserted exactly this — for screens/HomeScreen.tsx and
// screens/WorkerHomeScreen.tsx, by scanning their `*Dark` style objects for
// layout and depth. The rule was never a Home rule. The sweep that generalised
// it found the fault in twenty-seven files, the widest being TextField's label:
// light drew a 13pt/600 sentence-case label where dark drew an 11pt/800
// uppercase eyebrow with wide tracking. That is a different label rather than
// the same one in a second palette, and every form in the app renders it.
//
// WHAT IS FLAGGED IS AN ALLOW-LIST, not a deny-list, and that is deliberate.
// The scan names the React Native style properties that are geometry, type or
// depth; anything not on it is left alone. A deny-list ("everything that is not
// a colour") fires on every object that merely happens to have keys — a
// category-accent map, the auth backdrop's line/faint/gold triple — and a fence
// that cries wolf is a fence somebody deletes.
//
// THREE SHAPES ARE READ, because the fault took three forms:
//   1. a `*Dark` style object inside StyleSheet.create;
//   2. `isDark && { ...inline... }` — an override light never gets;
//   3. `isDark ? A : B` where both branches are style objects, inline or
//      named — the two are diffed and a differing non-colour key is a fork.
// Parsed with TypeScript, not matched with a regex: a nested shadowOffset and
// a docblock that discusses borderWidth both defeat brace-counting.
// ---------------------------------------------------------------------------

/** Geometry, type and depth. A theme decision may not reach any of these. */
const PALETTE_MAY_NOT_CHANGE = new Set([
  // type
  'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'fontVariant',
  'letterSpacing', 'lineHeight', 'textTransform', 'textAlign', 'textAlignVertical',
  'textDecorationLine', 'includeFontPadding',
  // borders — the WEIGHT and the SHAPE, never the colour
  'borderWidth', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderRightWidth', 'borderStartWidth', 'borderEndWidth', 'borderStyle',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius', 'borderCurve',
  // depth — home(19) put this here: adding or removing a shadow per theme
  // makes light a different design, not the same design in a second palette
  'elevation', 'shadowOpacity', 'shadowRadius', 'shadowOffset',
  'textShadowOffset', 'textShadowRadius', 'opacity',
  // space
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingHorizontal', 'paddingVertical', 'paddingStart', 'paddingEnd',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'gap', 'rowGap', 'columnGap',
  // box and structure
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'flexDirection', 'flexWrap',
  'alignItems', 'alignSelf', 'alignContent', 'justifyContent',
  'position', 'top', 'right', 'bottom', 'left', 'zIndex', 'overflow',
  'transform', 'aspectRatio', 'display',
]);

const themeForkOffenders = (path, source, ts) => {
  const sf = ts.createSourceFile(
    path, source, ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const offenders = [];
  let overrides = 0;

  const keysOf = (obj) => {
    const m = new Map();
    for (const p of obj.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const k = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
      if (k) m.set(k, p.initializer.getText().replace(/\s+/g, ' '));
    }
    return m;
  };

  // Named style objects, so `isDark ? styles.aDark : styles.a` can be diffed.
  const named = new Map();
  const collect = (node) => {
    if (
      ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'create' && node.arguments.length &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const p of node.arguments[0].properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const k = ts.isIdentifier(p.name) ? p.name.text : null;
        if (k && ts.isObjectLiteralExpression(p.initializer)) named.set(k, p.initializer);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  // 1. every `*Dark` style object is colour-only.
  for (const [name, obj] of named) {
    if (!/Dark$/.test(name)) continue;
    overrides += 1;
    for (const key of keysOf(obj).keys()) {
      if (PALETTE_MAY_NOT_CHANGE.has(key)) offenders.push(path + ': ' + name + '.' + key + ' is dark-only');
    }
  }

  const mentionsIsDark = (node) => {
    let hit = false;
    const walk = (n) => {
      if (hit) return;
      if (ts.isIdentifier(n) && n.text === 'isDark') hit = true;
      else ts.forEachChild(n, walk);
    };
    walk(node);
    return hit;
  };
  const asObject = (node) => {
    if (ts.isObjectLiteralExpression(node)) return node;
    const m = node.getText().match(/^styles\.(\w+)$/);
    return m ? named.get(m[1]) ?? null : null;
  };

  const visit = (node) => {
    // 2. `isDark && <object>` — an override the other theme never gets. Read
    //    for `!isDark` too: a LIGHT-only override is the same fault mirrored,
    //    and the tree has four of them (all colour-only today).
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      mentionsIsDark(node.left)
    ) {
      const obj = asObject(node.right);
      if (obj) {
        overrides += 1;
        const side = /!\s*isDark/.test(node.left.getText()) ? 'light' : 'dark';
        for (const key of keysOf(obj).keys()) {
          if (PALETTE_MAY_NOT_CHANGE.has(key)) {
            offenders.push(path + ': a ' + side + '-only override sets ' + key);
          }
        }
      }
    }
    // 3. `isDark ? A : B` — both sides styles; a differing non-colour key is a
    //    fork, and a dark-only branch is one too.
    if (ts.isConditionalExpression(node) && mentionsIsDark(node.condition)) {
      const a = asObject(node.whenTrue);
      const b = asObject(node.whenFalse);
      if (a && b) {
        overrides += 1;
        const ka = keysOf(a);
        const kb = keysOf(b);
        for (const key of new Set([...ka.keys(), ...kb.keys()])) {
          if (!PALETTE_MAY_NOT_CHANGE.has(key)) continue;
          if (ka.get(key) !== kb.get(key)) offenders.push(path + ': the themes disagree on ' + key);
        }
      } else if (a && !b && node.whenFalse.kind === ts.SyntaxKind.NullKeyword) {
        overrides += 1;
        for (const key of keysOf(a).keys()) {
          if (PALETTE_MAY_NOT_CHANGE.has(key)) offenders.push(path + ': a dark-only override sets ' + key);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { offenders, overrides };
};

test('[static] a theme decision may change a COLOUR and nothing else, tree-wide', async () => {
  const ts = (await import('typescript')).default;
  const files = await filesUnder(['screens', 'components', 'ui', 'hooks', 'navigation', 'modes']);
  assert.ok(files.length > 100, 'the sweep must enumerate the tree (saw ' + files.length + ')');

  const offenders = [];
  let overrides = 0;
  for (const path of files) {
    const source = await read(path);
    if (!source.includes('isDark') && !/\w+Dark:\s*\{/.test(source)) continue;
    const result = themeForkOffenders(path, source, ts);
    offenders.push(...result.offenders);
    overrides += result.overrides;
  }

  // ANTI-VACUITY on the real tree: theme overrides are numerous by design, so a
  // scanner that had gone blind would report "no offenders" about nothing.
  assert.ok(
    overrides > 100,
    'the scan must be finding the tree’s theme overrides (saw ' + overrides + ')',
  );
  assert.deepEqual(
    offenders,
    [],
    'a theme override changes something that is not a colour. Light is a palette translation of ' +
      'dark, never a reinterpretation: move the value onto the shared style at DARK’s number, ' +
      'and leave only the colour forked',
  );
});

test('[static] the parity scan catches a planted fork — and does not invent one', async () => {
  // ANTI-VACUITY as a fixture rather than a claim, planting one of each shape
  // the real sweep found: a `*Dark` object with a ring light never drew, a
  // dark-only inline override, and a named pair that disagrees on type size.
  // The clean cases beside them must NOT be flagged — a colour-only override is
  // the whole point of having two palettes, and an object that merely has keys
  // (the auth backdrop's line/faint triple) is not a style at all.
  const ts = (await import('typescript')).default;
  const fixture = [
    "import { StyleSheet } from 'react-native';",
    'export function Broken({ isDark }) {',
    '  const ring = isDark && { borderWidth: 2, borderColor: c.gold };',
    '  const art = isDark ? { line: c.gold, faint: c.goldSoft } : { line: c.ink, faint: c.mint };',
    '  const fill = isDark ? { backgroundColor: c.forest } : { backgroundColor: c.mint };',
    '  return [ring, art, fill, isDark ? styles.tabDark : styles.tab];',
    '}',
    'const styles = StyleSheet.create({',
    '  glyphDark: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.gold },',
    '  rowDark: { backgroundColor: c.forest, borderColor: c.gold },',
    '  tab: { fontSize: 12, color: c.ink },',
    '  tabDark: { fontSize: 16, color: c.gold },',
    '});',
  ].join('\n');

  const planted = themeForkOffenders('components/Fixture.tsx', fixture, ts);
  assert.ok(planted.overrides >= 4, 'every planted override must be seen (saw ' + planted.overrides + ')');
  assert.deepEqual(
    planted.offenders.sort(),
    [
      'components/Fixture.tsx: a dark-only override sets borderWidth',
      'components/Fixture.tsx: glyphDark.borderWidth is dark-only',
      'components/Fixture.tsx: tabDark.fontSize is dark-only',
      'components/Fixture.tsx: the themes disagree on fontSize',
    ],
    'exactly the planted forks must be caught, and the colour-only ones left alone',
  );

  // And a file whose overrides are colour-only produces nothing at all.
  const clean = [
    "import { StyleSheet } from 'react-native';",
    'export function Fine({ isDark }) { return isDark && styles.pillDark; }',
    'const styles = StyleSheet.create({',
    '  pill: { borderWidth: 1, borderRadius: 8, borderColor: c.line, backgroundColor: c.mint },',
    '  pillDark: { borderColor: c.gold, backgroundColor: "transparent" },',
    '});',
  ].join('\n');
  assert.deepEqual(themeForkOffenders('components/Clean.tsx', clean, ts).offenders, []);
});
