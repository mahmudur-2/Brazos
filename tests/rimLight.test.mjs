import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ===========================================================================
// THE WELCOME PAGE AS SHIPPED (2026-09-21, DECISIONS 18) — the operator's pick
// from the Lux chat's rendered options, approved as two pages (dark and light)
// and shipped as docs/mockups/html/lux/welcome-ship.html and -light.html: the
// reference composition on the Emerald Lux Glass ground, with motion f — the
// rim glint — on the lead action.
//
// What this file holds the build to, so none of it can drift:
//
//   1. THE LEAD ACTION IS EMAIL, AND THE LIGHT IS ON THE LEAD ACTION. Phone
//      auth resolves to `disabled` on every non-development build
//      (lib/phoneAuth/mode.ts), which is why tests/firstSession.test.mjs n5
//      keeps email first and phone second, undemoted; the operator ruled
//      three actions, email first with the glint.
//   2. ONE PATH, TWO DRIVERS. `rimPoint` in RimLight.shared.tsx is the lap —
//      a 'worklet' the reanimated sibling computes per frame and the native
//      driver samples once — and it is EXECUTED here: closed, continuous,
//      always on the rounded rectangle, the angle turning once through 360.
//   3. EVERY COLOUR IS A ROLE. The sixteen `auth*` / `heroDisc*` tokens carry
//      the pages' numbers, dark and light, and the screen, the button, the
//      scaffold and the light read nothing else.
// ===========================================================================

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

/** components/RimLight.shared.tsx, executed with its two value imports stubbed. */
const sharedModule = (async () => {
  const js = stripTypeScriptTypes(await read('components/RimLight.shared.tsx'), { mode: 'strip' });
  const stubbed = js
    .replace(/import \{[^}]*\} from '\.\.\/lib\/theme';/, 'const withAlpha = (c, a) => `${c}@${a}`;')
    .replace(
      /import \{[^}]*\} from '\.\.\/ui\/primitives\/LitSurface';/,
      'const backgroundImageStyle = (image) => ({ image }); const litBetween = (fill) => (fill.flat ? undefined : { lit: fill });'
    );
  assert.doesNotMatch(stubbed, /from '(?:react-native|\.[^']*)'/, 'every value import must be stubbed');
  return import(toDataUrl(stubbed));
})();

const BUTTON = { width: 331, height: 58, radius: 22 };

test('[executed] the lap is closed, continuous, on the rounded rectangle, and turns once', async () => {
  const { rimPoint, rimSamples, RIM_INSET, RIM_LAP_MS, RIM_SAMPLES, RIM_LIGHT } = await sharedModule;
  assert.equal(RIM_LAP_MS, 6000, 'one lap in six seconds — "slowly", the operator\'s word');
  assert.equal(RIM_INSET, 2);
  assert.ok(RIM_LIGHT.width > RIM_LIGHT.height, 'the light is an ellipse along the rim, not a dot');

  const { width, height, radius } = BUTTON;
  const inset = RIM_INSET;
  const w = width - 2 * inset, h = height - 2 * inset, r = radius - inset;
  const perimeter = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;

  const N = 720;
  let previous = null;
  let maxStep = 0;
  let maxOff = 0;
  for (let i = 0; i <= N; i += 1) {
    const p = rimPoint(i / N, width, height, radius, inset);
    const cx = Math.min(Math.max(p.x, inset + r), inset + w - r);
    const cy = Math.min(Math.max(p.y, inset + r), inset + h - r);
    const off = Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
    const onStraightEdge =
      (Math.abs(p.y - inset) < 1e-6 || Math.abs(p.y - (inset + h)) < 1e-6) && p.x >= inset + r - 1e-6 && p.x <= inset + w - r + 1e-6
      || (Math.abs(p.x - inset) < 1e-6 || Math.abs(p.x - (inset + w)) < 1e-6) && p.y >= inset + r - 1e-6 && p.y <= inset + h - r + 1e-6;
    if (!onStraightEdge) maxOff = Math.max(maxOff, off);
    if (previous) {
      maxStep = Math.max(maxStep, Math.hypot(p.x - previous.x, p.y - previous.y));
      assert.ok(p.angle >= previous.angle - 1e-9, `the angle never turns back (at ${i}/${N})`);
    }
    previous = p;
  }
  assert.ok(maxOff < 1e-6, `every corner point lies on its arc (worst ${maxOff})`);
  assert.ok(maxStep < (perimeter / N) * 1.05, `no jump along the lap (worst step ${maxStep.toFixed(3)} vs ${(perimeter / N).toFixed(3)})`);
  const start = rimPoint(0, width, height, radius, inset);
  const end = rimPoint(1, width, height, radius, inset);
  assert.ok(Math.hypot(end.x - start.x, end.y - start.y) < 1e-6, 'the lap ends where it began');
  assert.equal(start.angle, 0);
  assert.ok(Math.abs(end.angle - 360) < 1e-9, 'the light has turned once through 360');
  assert.equal(start.y, inset);
  assert.ok(start.x > inset);

  const table = rimSamples(width, height, radius);
  assert.equal(table.input.length, RIM_SAMPLES + 1);
  assert.equal(table.input[0], 0);
  assert.equal(table.input[RIM_SAMPLES], 1);
  assert.equal(table.rotate[0], '0deg');
  assert.equal(table.rotate[RIM_SAMPLES], '360deg');
  const mid = rimPoint(0.5, width, height, radius, inset);
  assert.ok(Math.abs(table.x[RIM_SAMPLES / 2] - (mid.x - RIM_LIGHT.width / 2)) < 1e-9);
  assert.ok(Math.abs(table.y[RIM_SAMPLES / 2] - (mid.y - RIM_LIGHT.height / 2)) < 1e-9);
});

test('[executed] the three layers come from the auth roles, with the pages’ stops per theme', async () => {
  const { rimStylesFor, RIM_COVER_INSET, RIM_STOPS } = await sharedModule;
  const palette = { authGlintCore: 'CORE', authGlintHalo: 'HALO', authCtaTop: 'TOP', authCtaBottom: 'BOTTOM', white: 'WHITE' };
  const dark = rimStylesFor(palette, true, 22);
  const light = rimStylesFor(palette, false, 22);
  assert.deepEqual([dark.clip.top, dark.clip.left, dark.clip.right, dark.clip.bottom], [-1, -1, -1, -1]);
  assert.equal(dark.clip.overflow, 'hidden');
  assert.equal(dark.clip.borderRadius, 22);
  // The pages' stops: dark .95 / .45, light .98 / .55, the halo at 40 %, nothing at 72 %.
  assert.deepEqual(RIM_STOPS, { dark: { core: 0.95, halo: 0.45 }, light: { core: 0.98, halo: 0.55 }, haloAt: 40, endAt: 72 });
  assert.equal(dark.light[1].image, 'radial-gradient(ellipse closest-side at 50% 50%, CORE@0.95 0%, HALO@0.45 40%, HALO@0 72%)');
  assert.equal(light.light[1].image, 'radial-gradient(ellipse closest-side at 50% 50%, CORE@0.98 0%, HALO@0.55 40%, HALO@0 72%)');
  // The cover: inset by the hairline, the button's own fill with its specular
  // edge — lit in dark between the two stops, flat in light.
  assert.equal(dark.cover[0].top, RIM_COVER_INSET);
  assert.equal(dark.cover[0].borderRadius, 22 - RIM_COVER_INSET);
  assert.equal(dark.cover[0].backgroundColor, 'BOTTOM');
  assert.equal(dark.cover[0].boxShadow, 'inset 0 1px 0 WHITE@0.14');
  assert.deepEqual(dark.cover[1], { lit: { top: 'TOP', bottom: 'BOTTOM', flat: false } });
  assert.equal(light.cover[1], undefined, 'light adds no gradient — the flat forest is the fill');
});

test('[static] the two drivers share one body, move by transform alone, and never run under reduced motion', async () => {
  const shared = stripComments(await read('components/RimLight.shared.tsx'));
  const fast = stripComments(await read('components/RimLight.motion120.tsx'));
  const fallback = stripComments(await read('components/RimLight.tsx'));

  assert.match(shared, /export function rimPoint\([\s\S]*?\{\s*'worklet';/, "rimPoint carries the 'worklet' directive as its first statement");
  assert.equal((shared.match(/'worklet'/g) ?? []).length, 1, 'one worklet — the path');
  assert.match(fast, /rimPoint\(progress\.value, width, height, radius, RIM_INSET\)/, 'the fast path computes the point per frame on the UI thread');
  assert.match(shared, /export function rimSamples\(/, 'the fallback samples the same function');
  assert.match(fallback, /rimSamples\(box\.width, box\.height, radius\)/);
  assert.doesNotMatch(fallback, /rimPoint\(/, 'the fallback does not re-derive the path — it samples the shared one');

  const fastStyle = /useAnimatedStyle\(\(\) => \{([\s\S]*?)\}, \[width, height, radius\]\)/.exec(fast);
  assert.ok(fastStyle, 'the fast path has one animated style');
  assert.match(fastStyle[1], /transform: \[/);
  for (const banned of ['opacity', 'width:', 'height:', 'shadow', 'borderRadius']) {
    assert.ok(!fastStyle[1].includes(banned), `the animated style must not touch ${banned}`);
  }
  assert.match(fallback, /transform: \[\s*\{ translateX: progress\.interpolate/, 'the native driver animates the transform');
  assert.match(fallback, /useNativeDriver: USE_NATIVE_DRIVER/, 'the driver decision is the shared constant');
  assert.match(fallback, /easing: Easing\.linear/);
  assert.match(fast, /easing: Easing\.linear/);
  assert.match(fast, /withRepeat\(\s*withTiming\(1, \{ duration: RIM_LAP_MS, easing: Easing\.linear \}\),\s*-1,\s*false\s*\)/, 'one linear timing, repeated forever, never reversed');
  assert.match(fast, /return \(\) => cancelAnimation\(progress\);/, 'the worklet loop is cancelled on unmount');
  assert.match(fallback, /return \(\) => lap\.stop\(\);/, 'the native loop is stopped on unmount');
  assert.match(fallback, /if \(reducedMotion !== false\) return null;/);
  assert.match(fast, /pointerEvents="none"/);
  assert.match(fallback, /pointerEvents="none"/);
  for (const [name, source] of [['shared', shared], ['fast', fast], ['fallback', fallback]]) {
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${name} writes no hex colour`);
    assert.doesNotMatch(source, /rgba?\(/, `${name} writes no rgb colour`);
  }
});

test('[static] the Welcome screen is the ship page: its numbers, its wiring, the light on the lead action', async () => {
  const welcome = stripComments(await read('screens/WelcomeScreen.tsx'));
  const actionsAt = welcome.indexOf('styles.actions');
  const buttons = [...welcome.slice(actionsAt).matchAll(/<AuthButton\b([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(buttons.length, 3);
  // The lead: email, lit, with the glyph, the chevron and the light.
  assert.match(buttons[0], /title="Continue with email"/);
  assert.match(buttons[0], /\bhero\b/);
  assert.match(buttons[0], /\blit\b/);
  assert.match(buttons[0], /icon="mail-outline"/);
  assert.match(buttons[0], /\bchevron\b/);
  assert.match(buttons[0], /light=\{rimLight\}/);
  assert.match(welcome, /const rimLight = <RimLight radius=\{authRadius\.heroButton\} \/>;/);
  // Phone: the same shape and glyph treatment, NOT lit and without the light.
  assert.match(buttons[1], /title="Continue with phone"/);
  assert.match(buttons[1], /\bhero\b/);
  assert.match(buttons[1], /icon="phone-portrait-outline"/);
  assert.doesNotMatch(buttons[1], /\blit\b/);
  assert.doesNotMatch(buttons[1], /light=/);
  // Sign-in: the ghost as the page's text link, with the chevron.
  assert.match(buttons[2], /title="I already have an account"/);
  assert.match(buttons[2], /variant="ghost"/);
  assert.match(buttons[2], /\bhero\b/);
  assert.match(buttons[2], /\bchevron\b/);
  // The page's own numbers — the art canvas and the copy's distances.
  assert.match(welcome, /width: 353,\s*height: 300,/);
  assert.match(welcome, /top: 60,/);
  // outer sizes: the page's content box plus its 1-pt border
  assert.match(welcome, /\{ key: 'back', left: 62, top: 24, size: 218 \}/);
  assert.match(welcome, /\{ key: 'mid', left: 98, top: 71, size: 202 \}/);
  assert.match(welcome, /\{ key: 'front', left: 127, top: 111, size: 174 \}/);
  assert.match(welcome, /a: \{ left: 11, top: 65, rotate: '-5deg' \},\s*b: \{ left: 188, top: 143, rotate: '5deg' \},\s*c: \{ left: 75, top: 246, rotate: undefined \},/);
  assert.match(welcome, /inset: 11,\s*eyebrowGap: 28,\s*headlineGap: 9,\s*bodyGap: 12,\s*actionsBottom: 49,\s*actionsGap: 11,/);
  // The two-tone headline in the serif, the eyebrow and body on the roles.
  assert.match(welcome, /\{'Get it done\.\\n'\}\s*<Text style=\{\{ color: colors\.authAccent \}\}>\{'Work with\\nconfidence\.'\}<\/Text>/);
  assert.match(welcome, /fontFamily: fonts\.displayHero,\s*fontWeight: '700',\s*color: colors\.authInk,/);
  assert.match(welcome, /color: colors\.authAccent,\s*\}/);
  assert.match(welcome, /color: colors\.authMuted,/);
  // The ground and the full backdrop are the scaffold's.
  assert.match(welcome, /<AuthScaffold backdrop="full" themed ground>/);
  // No colour is written in the screen: roles through withAlpha only.
  assert.doesNotMatch(welcome, /#[0-9a-fA-F]{3,8}\b/, 'the screen writes no hex colour');
  assert.doesNotMatch(welcome, /rgba?\(/, 'the screen writes no rgb colour');
  for (const label of ['Local workers', 'Protected payment', 'Local jobs']) {
    assert.match(welcome, new RegExp(`>${label}<`), `${label} badge`);
  }
});

test('[static] the hero dress on AuthButton is opt-in and absent renders the control it always was', async () => {
  const button = stripComments(await read('components/AuthButton.tsx'));
  for (const prop of ['hero?: boolean;', 'lit?: boolean;', 'chevron?: boolean;', 'light?: ReactNode;']) {
    assert.ok(button.includes(prop), `AuthButton declares ${prop}`);
  }
  assert.match(button, /icon\?: ComponentProps<typeof Ionicons>\['name'\];/);
  assert.match(button, /hero = false,\s*lit = false,\s*icon,\s*chevron = false,\s*light,/);
  // The plain label stays the Pressable's direct child; only a glyph takes the row.
  assert.match(button, /return icon \? \(\s*<View style=\{styles\.group\}>/);
  assert.match(button, /\{light \?\? null\}/);
  // The shape and dress read the auth roles and the page's numbers, never a literal colour.
  assert.match(button, /litBetween\(\{ top: palette\.authCtaTop, bottom: palette\.authCtaBottom, flat: !isDark \}\)/);
  assert.match(button, /borderColor: withAlpha\(palette\.authGold, HERO\.hairlineAlpha\)/);
  assert.match(button, /hairlineAlpha: 0\.62,/);
  assert.match(button, /height: authSizes\.heroButton,\s*borderRadius: authRadius\.heroButton,/);
  assert.doesNotMatch(stripComments(button).replace(/authColors\.\w+/g, ''), /#[0-9a-fA-F]{6}\b/, 'no hex colour enters the button');
  const authTheme = await read('lib/authTheme.ts');
  assert.match(authTheme, /heroButton: 58,/);
  assert.match(authTheme, /heroButton: 22,/);
  assert.match(authTheme, /heroLink: 44,/);
  assert.match(authTheme, /heroBadge: 42,/);
  assert.match(authTheme, /heroBadge: 20,/);
});

test('[static] the ground and the corner are the pages’; the roles are the pages’ numbers, both palettes', async () => {
  const scaffold = stripComments(await read('components/AuthScaffold.tsx'));
  assert.match(scaffold, /const lit = ground && themed;/);
  assert.match(scaffold, /lit && isDark\s*\?\s*backgroundImageStyle\(/, 'the base gradient is dark only — light’s three stops are the ivory');
  assert.match(scaffold, /linear-gradient\(165deg, \$\{palette\.authGroundTop\} 0%, \$\{palette\.authGroundMid\} 55%, \$\{palette\.authGroundBottom\} 100%\)/);
  assert.match(scaffold, /glow: \{ rx: 0\.72, ry: 0\.46, cx: 0\.5, cy: 0\.36, dark: 0\.18, light: 0\.07, fade: 70 \}/);
  assert.match(scaffold, /corner: \{ radius: 300, dark: 0\.13, light: 0\.16 \}/);
  assert.match(scaffold, /foot: \{ from: 62, dark: 0\.26, light: 0\.07 \}/);
  const backdrop = stripComments(await read('components/AuthBackdrop.tsx'));
  assert.match(backdrop, /cx: 1\.221,\s*cy: -0\.047,\s*radius: 0\.3308,\s*step: 0\.0763,\s*alphas: \[0\.36, 0\.3, 0\.24, 0\.18, 0\.12\],/);
  assert.match(backdrop, /color: withAlpha\(palette\.authGold, alpha\),/);

  const tokens = await read('ui/tokens.ts');
  const dark = /export const dark = \{([\s\S]*?)\} as const satisfies/.exec(tokens)[1];
  const light = /export const colors = \{([\s\S]*?)\} as const;/.exec(tokens)[1];
  const hex = (block, key) => new RegExp(`\\n\\s+${key}: '(#[0-9A-F]{6})',`).exec(block)?.[1];
  const expected = {
    dark: { authInk: '#F3F1E8', authMuted: '#A9B8B1', authAccent: '#7EE2B4', authGold: '#E9C170', authGlintCore: '#FFE9B0', authGlintHalo: '#E9C170', authBadgeFill: '#0A2822', authShade: '#000000', authGroundTop: '#062421', authGroundMid: '#0A1A17', authGroundBottom: '#07110F', heroDiscTop: '#19553F', heroDiscMid: '#0F3B30', heroDiscBottom: '#0A2A23', authCtaTop: '#1C503F', authCtaBottom: '#0E3229' },
    light: { authInk: '#13201B', authMuted: '#6E7771', authAccent: '#0D6B52', authGold: '#C8A15B', authGlintCore: '#FFF6DE', authGlintHalo: '#E8C98C', authBadgeFill: '#FFFFFF', authShade: '#10261D', authGroundTop: '#F6F3EA', authGroundMid: '#F6F3EA', authGroundBottom: '#F6F3EA', heroDiscTop: '#F6F9F4', heroDiscMid: '#DEEBE1', heroDiscBottom: '#CDDCCF', authCtaTop: '#064C3B', authCtaBottom: '#064C3B' },
  };
  for (const [theme, block] of [['dark', dark], ['light', light]]) {
    for (const [key, value] of Object.entries(expected[theme])) assert.equal(hex(block, key), value, `${theme} ${key}`);
  }
  // Light is flat by construction: the ground stops are the bg, the CTA stops are the forest.
  assert.equal(hex(light, 'authGroundTop'), hex(light, 'bg'));
  assert.equal(hex(light, 'authCtaTop'), hex(light, 'authCtaBottom'));
  const theme = await read('lib/theme.ts');
  for (const key of Object.keys(expected.dark)) {
    assert.match(theme, new RegExp(`\\n  ${key}: emeraldLight\\.${key},`), `light ${key} by reference`);
    assert.match(theme, new RegExp(`\\n  ${key}: emeraldDark\\.${key},`), `dark ${key} by reference`);
  }
});
