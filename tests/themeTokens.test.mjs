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
      // RUN H2 added `constantAccents` to what lib/theme.ts takes from the token
      // module, and RUN GROUND1 (C4) added `shadows` — lib/theme surfaces the
      // dark card shadow by reference rather than copying its numbers. The
      // destructure here has to name everything that import names, or the
      // executed module throws a ReferenceError at first use rather than
      // failing an assertion — so the stub is widened, never the assertions.
      'const { brand, dark: emeraldDark, constantAccents, shadows: tokenShadows, withAlpha: alpha } = globalThis.__THEME_TOKENS__;',
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

/** The one serif role's token, permitted in the one screen file only. */
const HERO_FONT_FAMILY = /^fonts\.displayHero\b/;

/** Family names that are serifs. Applied to font-family positions only — the
 *  word "serif" is legitimate in prose, in HomeScreen's cap-height ladder, and
 *  in `lib/countries.ts`'s entry for the country Georgia. */
const SERIF_FAMILY = /playfair|georgia|times new roman|\bserif\b/i;

/** The one quoted serif value each of these files may carry, and must. The
 *  token definition site is now the ONLY one — there is no registration. */
const QUOTED_SERIF_ALLOWANCE = new Map([
  ['lib/theme.ts', "'Georgia'"],
]);

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
    'Georgia',
    'the hero face is the platform serif, named exactly — no stack, no Platform.select'
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
    'the recovered static stays on disk, orphaned — and no SECOND face may join it',
  );

  const app = stripComments(await read('App.tsx'));
  assert.doesNotMatch(app, /useFonts|expo-font/, 'nothing registers a face any more');
  // The launch gate is back to its ONE condition: the session. A face that
  // ships with the OS cannot arrive late, so nothing holds the layer for it
  // and there is no load failure to release it on.
  assert.doesNotMatch(app, /fontsResolved|fontsLoaded|fontLoadError/);
  assert.match(app, /\{children\}/);
  assert.match(app, /sessionReady=\{!loading\}/);
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
  sheet: { blur: 40, scrimAlpha: 0.72, borderAlpha: 0.16, fallbackScrimAlpha: 0.92, radius: 28, radiusTopOnly: true },
  menu: { blur: 50, scrimAlpha: 0.82, borderAlpha: 0.14, fallbackScrimAlpha: 0.95, radius: 16, radiusTopOnly: false },
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
  assert.deepEqual(Object.keys(materials), ['chrome', 'sheet', 'menu']);
  for (const [name, expected] of Object.entries(MATERIALS_AS_DISPATCHED)) {
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(materials[name][key], value, `materials.${name}.${key} moved off the dispatched value`);
    }
    assert.equal(materials[name].scrimColor, '#071B15', `materials.${name} left the one scrim ink`);
    assert.equal(materials[name].borderColor, brand.mint, `materials.${name}'s hairline must be the brand mint`);
  }
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
// RUN G1 (C2) — the live override layer resolves to the static tokens when
// no dial is set. Identity, not merely equality: unchanged inputs must come
// back as the SAME objects, so palette-keyed style caches keep working and a
// fresh app is byte-identical in behaviour.
// ---------------------------------------------------------------------------

/** lib/designOverrides.ts, executed with react stubbed and ui/tokens fed
 *  from the module already executed above. */
const designOverridesModule = (async () => {
  const tokens = await tokensModule;
  globalThis.__DESIGN_TOKENS__ = tokens;
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
      'const { materials, setMetricSource } = globalThis.__DESIGN_TOKENS__;',
    );
  assert.doesNotMatch(
    stubbed,
    /from '(?:react|\.[^']*)'/,
    'every import lib/designOverrides.ts carries must be stubbed or dropped',
  );
  return import(toDataUrl(stubbed));
})();

test('G1 overrides: a fresh app resolves byte-identically — no override, no change', async () => {
  const { materials } = await tokensModule;
  const { colors, darkColors } = await themeModule;
  const o = await designOverridesModule;

  assert.deepEqual(o.getDesignOverrides(), { materials: {} }, 'the store must start empty');
  assert.equal(o.resolveMaterials(o.EMPTY_DESIGN_OVERRIDES), materials, 'materials must come back by identity');
  assert.deepEqual(o.resolveMaterials(o.EMPTY_DESIGN_OVERRIDES), materials);
  assert.equal(o.applyPaletteOverrides(darkColors, o.EMPTY_DESIGN_OVERRIDES, true), darkColors);
  assert.equal(o.applyPaletteOverrides(colors, o.EMPTY_DESIGN_OVERRIDES, false), colors);
});

test('G1 overrides: a dial moves only its own value, and reset restores the static truth', async () => {
  const { materials } = await tokensModule;
  const { darkColors } = await themeModule;
  const o = await designOverridesModule;
  try {
    o.patchMaterialOverride('chrome', { blur: 44, scrimAlpha: 0.61 });
    o.patchDesignOverrides({ gold: '#DCAB60', cardFill: '#182725', navBottomPad: 12 });

    const resolved = o.resolveMaterials(o.getDesignOverrides());
    assert.equal(resolved.chrome.blur, 44);
    assert.equal(resolved.chrome.scrimAlpha, 0.61);
    assert.equal(resolved.chrome.borderAlpha, materials.chrome.borderAlpha, 'an unset dial keeps the static value');
    assert.equal(resolved.sheet, materials.sheet, 'an untouched material keeps its identity');
    assert.equal(resolved.menu, materials.menu);

    const dark = o.applyPaletteOverrides(darkColors, o.getDesignOverrides(), true);
    assert.equal(dark.gold, '#DCAB60');
    assert.equal(dark.surface, '#182725');
    assert.equal(dark.background, darkColors.background, 'only the dialled roles move');
    // cardFill is by definition the DARK card surface; light never reads it.
    const light = o.applyPaletteOverrides(darkColors, o.getDesignOverrides(), false);
    assert.equal(light.surface, darkColors.surface);
    assert.equal(light.gold, '#DCAB60');
  } finally {
    o.resetDesignOverrides();
  }
  assert.equal(o.resolveMaterials(o.getDesignOverrides()), materials, 'reset must restore identity');
  assert.equal(o.applyPaletteOverrides(darkColors, o.getDesignOverrides(), true), darkColors);
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
