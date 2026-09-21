import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ===========================================================================
// THE WELCOME PAGE AS BUILT (2026-09-21) — the operator's pick from the Lux
// chat's rendered options: version 1 of docs/mockups/html/lux/welcome-ideas.html
// (the reference composition on the Emerald Lux Glass ground), polished, with
// motion f of welcome-motion.html — the rim glint — on the lead button.
//
// Two rulings this file holds the build to, so neither can drift:
//
//   1. THE LEAD ACTION IS EMAIL, AND THE LIGHT IS ON THE LEAD ACTION. Phone
//      auth resolves to `disabled` on every non-development build
//      (lib/phoneAuth/mode.ts), which is why tests/firstSession.test.mjs n5
//      keeps email first and phone second, undemoted. The page drew the light
//      on "Continue with phone"; the app puts it on the button that works.
//   2. ONE PATH, TWO DRIVERS. `rimPoint` in RimLight.shared.tsx is the lap —
//      a 'worklet' the reanimated sibling computes per frame and the native
//      driver samples once — and it is EXECUTED here: closed, continuous,
//      always on the rounded rectangle, the angle turning once through 360.
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
  // The inset rectangle the light's centre travels on.
  const w = width - 2 * inset, h = height - 2 * inset, r = radius - inset;
  const perimeter = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;

  const N = 720;
  let previous = null;
  let maxStep = 0;
  let maxOff = 0;
  for (let i = 0; i <= N; i += 1) {
    const p = rimPoint(i / N, width, height, radius, inset);
    // On the boundary: the distance from the inset rounded rectangle is ~0.
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
  // Continuous: no step is much more than the even share of the perimeter.
  assert.ok(maxStep < (perimeter / N) * 1.05, `no jump along the lap (worst step ${maxStep.toFixed(3)} vs ${(perimeter / N).toFixed(3)})`);
  // Closed: the end is the start, and the angle has turned exactly once.
  const start = rimPoint(0, width, height, radius, inset);
  const end = rimPoint(1, width, height, radius, inset);
  assert.ok(Math.hypot(end.x - start.x, end.y - start.y) < 1e-6, 'the lap ends where it began');
  assert.equal(start.angle, 0);
  assert.ok(Math.abs(end.angle - 360) < 1e-9, 'the light has turned once through 360');
  // It starts on the top edge, moving right — the page's lap.
  assert.equal(start.y, inset);
  assert.ok(start.x > inset);

  // The native driver's table: the same lap, sampled, its last rotate pinned
  // at 360 so a repeat does not spin the light backwards through a frame.
  const table = rimSamples(width, height, radius);
  assert.equal(table.input.length, RIM_SAMPLES + 1);
  assert.equal(table.input[0], 0);
  assert.equal(table.input[RIM_SAMPLES], 1);
  assert.equal(table.rotate[0], '0deg');
  assert.equal(table.rotate[RIM_SAMPLES], '360deg');
  assert.equal(table.x.length, table.y.length);
  // Sampled translate is the point less half the light, so the light's
  // CENTRE is what rides the rim.
  const mid = rimPoint(0.5, width, height, radius, inset);
  assert.ok(Math.abs(table.x[RIM_SAMPLES / 2] - (mid.x - RIM_LIGHT.width / 2)) < 1e-9);
  assert.ok(Math.abs(table.y[RIM_SAMPLES / 2] - (mid.y - RIM_LIGHT.height / 2)) < 1e-9);
});

test('[executed] the three layers come from the palette, and the cover is flat in light', async () => {
  const { rimStylesFor, RIM_COVER_INSET } = await sharedModule;
  const palette = { ink: 'INK', gold: 'GOLD', authCtaTop: 'TOP', authCtaBottom: 'BOTTOM' };
  const dark = rimStylesFor(palette, true, 22);
  const light = rimStylesFor(palette, false, 22);
  // The clip covers the border box from inside the padding box.
  assert.deepEqual([dark.clip.top, dark.clip.left, dark.clip.right, dark.clip.bottom], [-1, -1, -1, -1]);
  assert.equal(dark.clip.overflow, 'hidden');
  assert.equal(dark.clip.borderRadius, 22);
  // The light: a cream core, a gold halo, nothing but tokens through withAlpha.
  assert.match(dark.light[1].image, /^radial-gradient\(ellipse closest-side at 50% 50%, INK@0\.95 0%, GOLD@0\.45 40%, GOLD@0 72%\)$/);
  // The cover: inset by the hairline, the button's own fill — lit in dark
  // (the same two stops the button lights between), flat in light.
  assert.equal(dark.cover[0].top, RIM_COVER_INSET);
  assert.equal(dark.cover[0].borderRadius, 22 - RIM_COVER_INSET);
  assert.equal(dark.cover[0].backgroundColor, 'BOTTOM');
  assert.deepEqual(dark.cover[1], { lit: { top: 'TOP', bottom: 'BOTTOM', flat: false } });
  assert.equal(light.cover[1], undefined, 'light adds no gradient — the flat forest is the fill');
});

test('[static] the two drivers share one body, move by transform alone, and never run under reduced motion', async () => {
  const shared = stripComments(await read('components/RimLight.shared.tsx'));
  const fast = stripComments(await read('components/RimLight.motion120.tsx'));
  const fallback = stripComments(await read('components/RimLight.tsx'));

  // The path is a worklet, declared ONCE, and both drivers reach it.
  assert.match(shared, /export function rimPoint\([\s\S]*?\{\s*'worklet';/, "rimPoint carries the 'worklet' directive as its first statement");
  assert.equal((shared.match(/'worklet'/g) ?? []).length, 1, 'one worklet — the path');
  assert.match(fast, /rimPoint\(progress\.value, width, height, radius, RIM_INSET\)/, 'the fast path computes the point per frame on the UI thread');
  assert.match(shared, /export function rimSamples\(/, 'the fallback samples the same function');
  assert.match(fallback, /rimSamples\(box\.width, box\.height, radius\)/);
  assert.doesNotMatch(fallback, /rimPoint\(/, 'the fallback does not re-derive the path — it samples the shared one');

  // Transform only, on both drivers: no shadow, radius, size or opacity is animated.
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

  // Reduced motion: nothing mounts — the rim rests at its static gold.
  assert.match(fallback, /if \(reducedMotion !== false\) return null;/);
  // The light never takes a touch.
  assert.match(fast, /pointerEvents="none"/);
  assert.match(fallback, /pointerEvents="none"/);

  // No colour is written in any of the three files: tokens through withAlpha only.
  for (const [name, source] of [['shared', shared], ['fast', fast], ['fallback', fallback]]) {
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${name} writes no hex colour`);
    assert.doesNotMatch(source, /rgba?\(/, `${name} writes no rgb colour`);
  }
});

test('[static] the Welcome screen wires the light to the lead action, by the n5 order', async () => {
  const welcome = stripComments(await read('screens/WelcomeScreen.tsx'));
  const actionsAt = welcome.indexOf('styles.actions');
  const actions = welcome.slice(actionsAt);
  const buttons = [...actions.matchAll(/<AuthButton\b([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(buttons.length, 3);
  // The lead: email, lit, with the glyph, the chevron and the light.
  assert.match(buttons[0], /title="Continue with email"/);
  assert.match(buttons[0], /\bhero\b/);
  assert.match(buttons[0], /\blit\b/);
  assert.match(buttons[0], /icon="mail-outline"/);
  assert.match(buttons[0], /\bchevron\b/);
  assert.match(buttons[0], /light=\{rimLight\}/);
  assert.match(welcome, /const rimLight = <RimLight radius=\{authRadius\.heroButton\} \/>;/, 'one light, its radius the hero button\'s own token');
  // Phone: the same shape and glyph treatment, NOT lit and without the light.
  assert.match(buttons[1], /title="Continue with phone"/);
  assert.match(buttons[1], /\bhero\b/);
  assert.match(buttons[1], /icon="phone-portrait-outline"/);
  assert.doesNotMatch(buttons[1], /\blit\b/);
  assert.doesNotMatch(buttons[1], /light=/);
  // Sign-in: the ghost at the same shape, with the chevron.
  assert.match(buttons[2], /title="I already have an account"/);
  assert.match(buttons[2], /variant="ghost"/);
  assert.match(buttons[2], /\bhero\b/);
  assert.match(buttons[2], /\bchevron\b/);
  // The two-tone headline: the promise in the accent, the whole in one Text.
  assert.match(welcome, /\{'Get it done\.\\n'\}\s*<Text style=\{\{ color: colors\.emeraldBright \}\}>\{'Work with\\nconfidence\.'\}<\/Text>/);
  // The ground and the full backdrop are the scaffold's.
  assert.match(welcome, /<AuthScaffold backdrop="full" themed ground>/);
  // The art is the page's: three discs, the halo, the ghost ring, three badges.
  assert.match(welcome, /const DISCS = \[/);
  assert.equal((welcome.match(/key: '(?:back|mid|front)'/g) ?? []).length, 3);
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
  // Defaults off.
  assert.match(button, /hero = false,\s*lit = false,\s*icon,\s*chevron = false,\s*light,/);
  // The plain label stays the Pressable's direct child; only a glyph takes the row.
  assert.match(button, /return icon \? \(\s*<View style=\{styles\.group\}>/);
  assert.match(button, /\{light \?\? null\}/);
  // The lit fill is the palette's two stops, flat outside the dark opt-in; the
  // depth only under a lit, filled, dark control.
  assert.match(button, /litBetween\(\{ top: palette\.authCtaTop, bottom: palette\.authCtaBottom, flat: !prestige \}\)/);
  assert.match(button, /lit && !isGhost && \(prestige \? authShadows\.hero : null\)/);
  // The shape is the auth surface's tokens, not a literal.
  assert.match(button, /hero: \{\s*height: authSizes\.heroButton,\s*borderRadius: authRadius\.heroButton,\s*\}/);
  const authTheme = await read('lib/authTheme.ts');
  assert.match(authTheme, /heroButton: 58,/);
  assert.match(authTheme, /heroButton: 22,/);
});

test('[static] the ground is the Lux page\'s in dark and nothing in light; the tokens say so', async () => {
  const scaffold = stripComments(await read('components/AuthScaffold.tsx'));
  assert.match(scaffold, /ground && themed && isDark\s*\?\s*backgroundImageStyle\(/, 'the gradient is gated on the dark opt-in');
  assert.match(scaffold, /linear-gradient\(165deg, \$\{palette\.authGroundTop\} 0%, \$\{palette\.authGroundMid\} 55%, \$\{palette\.authGroundBottom\} 100%\)/);

  const tokens = await read('ui/tokens.ts');
  const dark = /export const dark = \{([\s\S]*?)\} as const satisfies/.exec(tokens)[1];
  const light = /export const colors = \{([\s\S]*?)\} as const;/.exec(tokens)[1];
  const hex = (block, key) => new RegExp(`\\n\\s+${key}: '(#[0-9A-F]{6})',`).exec(block)?.[1];
  // Dark: the Emerald Lux Glass ground, the README's one ground, and the page's discs and CTA.
  assert.deepEqual(
    ['authGroundTop', 'authGroundMid', 'authGroundBottom'].map((k) => hex(dark, k)),
    ['#062421', '#0A1A17', '#07110F']
  );
  assert.deepEqual(['heroDiscTop', 'heroDiscMid', 'heroDiscBottom'].map((k) => hex(dark, k)), ['#19553F', '#0F3B30', '#0A2A23']);
  assert.deepEqual(['authCtaTop', 'authCtaBottom'].map((k) => hex(dark, k)), ['#1C503F', '#0E3229']);
  // Light: flat by construction — the ground stops ARE the ivory bg, the CTA stops ARE the forest.
  const lightBg = hex(light, 'bg');
  for (const k of ['authGroundTop', 'authGroundMid', 'authGroundBottom']) assert.equal(hex(light, k), lightBg, `light ${k} is the bg`);
  assert.equal(hex(light, 'authCtaTop'), hex(light, 'authCtaBottom'));
  assert.equal(hex(light, 'authCtaBottom'), '#064C3B', 'the light CTA is the Heritage forest');
  // And lib/theme.ts takes both palettes' values by reference.
  const theme = await read('lib/theme.ts');
  for (const k of ['authGroundTop', 'authGroundMid', 'authGroundBottom', 'heroDiscTop', 'heroDiscMid', 'heroDiscBottom', 'authCtaTop', 'authCtaBottom']) {
    assert.match(theme, new RegExp(`\\n  ${k}: emeraldLight\\.${k},`), `light ${k} by reference`);
    assert.match(theme, new RegExp(`\\n  ${k}: emeraldDark\\.${k},`), `dark ${k} by reference`);
  }
});
