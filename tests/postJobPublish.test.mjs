import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// RUN P1 — THE POST A JOB FLOW.
//
// One spec for the four-step wizard and the publish screen it ends on. What
// each section holds is stated where it starts; what they share is the method:
// values are PARSED out of the real files and compared to each other, never
// asserted as a string that could go stale on its own.
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

/** A palette token's value, parsed out of the object literal that declares it. */
function tokenValue(source, blockStart, key) {
  const at = source.indexOf(blockStart);
  assert.notEqual(at, -1, `${blockStart} must still declare a palette`);
  const end = source.indexOf('\n}', at);
  assert.notEqual(end, -1, `${blockStart}'s literal must close`);
  const found = new RegExp(`\\n\\s*${key}: '([^']+)'`).exec(source.slice(at, end));
  assert.ok(found, `${blockStart} must declare ${key}`);
  return found[1];
}

/** The JSX region that renders the published-job success surface. */
function publishBranch(screen) {
  const at = screen.indexOf('<SuccessScreen');
  assert.notEqual(at, -1, 'the publish surface must still be the SuccessScreen template');
  const end = screen.indexOf('\n          ) : (', at);
  assert.notEqual(end, -1, 'the publish branch must still be one half of a ternary');
  return screen.slice(at, end);
}

// ---------------------------------------------------------------------------
// D0 — THE PUBLISH SURFACE IS NOT COMPOSITED.
//
// THE DEFECT. The success surface was an `Animated.View` carrying
// `{ opacity: successOpacity }` over the still-mounted form. That is a GROUP
// opacity: the whole subtree is composited over what is behind it, so EVERY
// colour on the surface goes through the blend — including the bottom nav,
// one component that cannot legitimately resolve two greens.
//
// TWO WAYS THE SAME FAULT ARRIVES, and this fence holds both shut: an
// animated opacity ON the overlay node, and a translucent ground UNDER it
// (the overlay was literally `rgba(244,241,232,0.97)` before fa88118). The
// first is the one that was live; the second is fenced so it cannot come back
// as the "fix".
//
// WHY NOT VACUOUS: the ground's token is parsed out of the screen and then
// resolved in BOTH palettes from lib/theme.ts, so renaming the style, the
// token, or the palette entry fails the parse instead of passing the check.
// ---------------------------------------------------------------------------

test('D0 · the success overlay renders opaque — no animated opacity, no translucent ground', () => {
  const screen = read('screens/PostJobScreen.tsx');
  const flat = flatten(screen);
  const code = stripComments(screen);

  // 1. THE OVERLAY IS A PLAIN VIEW. No opacity binding of any kind reaches it.
  assert.match(
    flat,
    /\{showSuccess && \( <View style=\{styles\.successOverlay\} accessibilityViewIsModal>/,
    'the success overlay must be a plain View styled by styles.successOverlay alone'
  );
  assert.ok(
    !code.includes('successOpacity'),
    'successOpacity is the group-opacity defect itself — it must not come back'
  );
  assert.doesNotMatch(
    flat,
    /styles\.successOverlay,\s*\{/,
    'nothing may be layered onto the overlay inline — that is where an opacity returns'
  );

  // 2. THE GROUND IS OPAQUE, in both palettes, resolved rather than assumed.
  const block = /\n {2}successOverlay: \{([^}]*)\}/.exec(stripComments(screen));
  assert.ok(block, 'PostJobScreen must keep a successOverlay style object');
  const ground = /backgroundColor: colors\.(\w+),/.exec(block[1]);
  assert.ok(ground, 'the overlay must paint its ground from a palette token');
  assert.doesNotMatch(block[1], /opacity:/, 'the overlay style itself carries no opacity');

  const theme = read('lib/theme.ts');
  for (const [name, start] of [
    ['light', 'export const colors = {'],
    ['dark', 'export const darkColors: ColorPalette = {'],
  ]) {
    const value = tokenValue(theme, start, ground[1]);
    assert.match(
      value,
      /^#[0-9A-Fa-f]{6}$/,
      `the ${name} palette's ${ground[1]} must be a fully opaque 6-digit hex, saw ${value}`
    );
  }
});

test('D0 · the publish surface and the bottom nav resolve ONE green, and it is #5FAE81', () => {
  const tokens = read('ui/tokens.ts');
  const emeraldDark = tokenValue(tokens, 'export const dark = {', 'emerald');
  assert.equal(
    emeraldDark,
    '#5FAE81',
    'the dark palette\'s live-state green is the one the whole flow paints'
  );

  // The publish surface takes its green from that token — through the
  // template, which is the same component the rest of the app configures.
  const template = stripComments(read('ui/templates/SuccessScreen.tsx'));
  assert.match(
    template,
    /color=\{isDark \? colors\.emerald : colors\.forest\}/,
    'the success mark resolves its dark green from the emerald token'
  );

  // The bottom nav is ONE component with ONE active tint, so the publish
  // screen cannot paint it differently unless something composites over it —
  // which is precisely what the test above now forbids.
  const nav = stripComments(read('ui/primitives/BottomNav.tsx'));
  assert.match(
    nav,
    /tabBarActiveTintColor: palette\.emerald,/,
    'the nav active tint is the same emerald token the publish surface uses'
  );

  // ANTI-VACUITY: the dark palette lib/theme.ts hands screens must BE that
  // token, or the two greens above are only nominally the same.
  const theme = read('lib/theme.ts');
  assert.match(
    theme,
    /\n {2}emerald: emeraldDark\.emerald,/,
    'darkColors.emerald must be the ui/tokens dark emerald, not a second copy'
  );

  // And PostJobScreen's own publish branch names no other green.
  const publish = stripComments(publishBranch(read('screens/PostJobScreen.tsx')));
  const greens = [...publish.matchAll(/colors\.(emerald|forest|success|homeLive)\b/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(
    [...new Set(greens)],
    ['emerald'],
    'the publish branch may resolve exactly one green token, and it is emerald'
  );
});

// ---------------------------------------------------------------------------
// D1-D6 — THE NAVIGATION MODEL.
//
// Steps 1-3 have no footer buttons at all. Their Back and Continue are the
// header's two links, the title stays centred and put across all four steps,
// and the last step's forward action is a single pinned Publish pill.
//
// WHY NOT VACUOUS: the four-row link table is RE-DERIVED here from the real
// POST_STEPS labels parsed out of the screen, then compared against the table
// the design specifies. Renaming a step, reordering the list, or changing the
// derivation fails with the row that moved — the table is not restated as
// four hardcoded strings that could quietly stop describing the screen.
// ---------------------------------------------------------------------------

/** The wizard's step labels, in order, parsed from the screen's own list. */
function stepLabels(screen) {
  const at = screen.indexOf('const POST_STEPS = [');
  assert.notEqual(at, -1, 'the wizard must still declare POST_STEPS');
  const end = screen.indexOf('] as const;', at);
  assert.notEqual(end, -1, 'POST_STEPS must close');
  const labels = [...screen.slice(at, end).matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(labels.length, 4, `the wizard is four steps, saw ${labels.length}`);
  return labels;
}

test('D1-D4 · the header owns navigation, and its two links are the neighbouring steps', () => {
  const screen = read('screens/PostJobScreen.tsx');
  const flat = flatten(screen);
  const labels = stepLabels(screen);

  // The derivation, asserted as source…
  assert.match(
    flat,
    /const backLabel = step === 0 \? 'Home' : POST_STEPS\[step - 1\]\.label;/,
    'the left link is the previous step, or the exit for the first one'
  );
  assert.match(
    flat,
    /const advanceLabel = isLastStep \? undefined : POST_STEPS\[step \+ 1\]\.label;/,
    'the right link is the next step, and the last step has none'
  );

  // …then RUN it against the real labels and check the resulting table.
  const table = labels.map((_, step) => [
    step === 0 ? 'Home' : labels[step - 1],
    step === labels.length - 1 ? undefined : labels[step + 1],
  ]);
  assert.deepEqual(table, [
    ['Home', 'Media'],
    ['Describe', 'Location'],
    ['Media', 'Review'],
    ['Location', undefined],
  ]);

  // The header is wired to all of it, and the title is centred rather than
  // sitting beside the back control.
  assert.match(flat, /backLabel=\{backLabel\}/);
  assert.match(flat, /rightLabel=\{advanceLabel\}/);
  assert.match(flat, /onPressRight=\{handleContinue\}/);
  assert.match(flat, /rightDisabled=\{advanceDisabled\}/);
  assert.match(flat, /centerTitle/);
  // The title itself never changes across the steps — one expression, no step
  // term in it.
  assert.match(
    flat,
    /title=\{isEditing \? 'Edit Job' : isHiring \? 'Send an Offer' : 'Post a Job'\}/,
    'the header title is the flow, not the step'
  );
});

test('D2/D4 · no step but the last renders a footer button, and its footer holds one', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));

  // The footer exists only under the last-step gate.
  const at = flat.indexOf('<View style={styles.footer}>');
  assert.notEqual(at, -1, 'the pinned footer must still be a bare styles.footer View');
  assert.match(
    flat.slice(Math.max(0, at - 40), at),
    /\{isLastStep && \( $/,
    'the footer must be gated on the last step — steps 1-3 carry none'
  );

  // And it holds exactly one control.
  const close = flat.indexOf('</View> )}', at);
  assert.notEqual(close, -1, 'the gated footer must close');
  const footer = flat.slice(at, close);
  assert.equal(
    (footer.match(/<Button/g) ?? []).length,
    1,
    'the last step commits with ONE full-width control, not a Back/Publish pair'
  );
  assert.ok(!footer.includes('Continue'), 'Continue is a header link now, not a button');
  assert.ok(!footer.includes('footerBack'), 'the Back button and its style are gone');
  assert.match(
    footer,
    /title=\{isEditing \? 'Save changes' : isHiring \? 'Send request' : 'Publish'\}/
  );

  // A pill, not a rounded rectangle.
  assert.match(
    flat,
    /footerPrimary: \{ flex: 1, borderRadius: radius\.pill, \}/,
    'the Publish control is a pill'
  );
});

test('D5 · the last step scroller clears its own footer, from the shared constant', () => {
  const screen = read('screens/PostJobScreen.tsx');
  const flat = flatten(screen);

  assert.match(
    flat,
    /contentContainerStyle=\{\[styles\.content, isLastStep && styles\.contentWithFooter\]\}/,
    'the clearance applies on the step that HAS a footer, and only there'
  );
  assert.match(
    flat,
    /contentWithFooter: \{ paddingBottom: spacing\.xl \+ PINNED_FOOTER_BOTTOM_PADDING, \}/,
    'the clearance is the content padding plus the SAME constant the footer applies'
  );
  // ANTI-VACUITY: that constant is imported here and is the shared one.
  assert.match(screen, /PINNED_FOOTER_BOTTOM_PADDING \} from '\.\.\/ui\/primitives'/);
  assert.match(
    read('ui/primitives/BottomNav.tsx'),
    /export const PINNED_FOOTER_BOTTOM_PADDING = layout\.floatingNavGap;/
  );
});

test('D6 · dropping the footers kept the exit guard and the draft autosave', () => {
  const code = stripComments(read('screens/PostJobScreen.tsx'));

  // Header back, Android back and the iOS edge gesture still all mean "one
  // step back" while the wizard is mid-flow, and a write in flight still
  // cannot be removed from the stack.
  assert.match(code, /usePreventRemove\(submitting \|\| \(step > 0 && !showSuccess\), \(\) => \{/);
  assert.match(code, /if \(!submitting\) setStep\(\(current\) => Math\.max\(0, current - 1\)\);/);
  // The header's own left link routes through the same handler.
  assert.match(code, /onBack=\{handleBack\}/);
  // And the autosave effect still writes every field the draft carries.
  assert.match(code, /void savePostJobDraft\(draftUserId, \{/);
  assert.match(code, /if \(!isFreshPost \|\| !draftReady \|\| !draftUserId\) return;/);
});

test('D2 · the header new props are optional and leave every other caller untouched', () => {
  const header = read('components/ScreenHeader.tsx');
  const code = stripComments(header);

  for (const prop of ['backLabel?: string;', 'rightLabel?: string;', 'centerTitle?: boolean;']) {
    assert.ok(code.includes(prop), `${prop} must be optional`);
  }
  assert.match(code, /rightDisabled = false,/, 'a caller that passes nothing gets an enabled default');
  assert.match(code, /centerTitle = false,/, 'a caller that passes nothing keeps the left-aligned title');

  // The default branch is the arrangement the chat header depends on:
  // leading between the back control and the title block.
  assert.match(flatten(header), /\{backControl\} \{leading\} \{onPressTitle \?/);

  // Both links are ONE treatment — the same colour the bare back chevron
  // already resolved, so the header cannot grow a second link vocabulary.
  assert.match(code, /const backColor = isDark \? palette\.gold : palette\.text;/);
  const linkColors = [
    ...code.matchAll(/color: (?:rightDisabled \? palette\.textSubtle : )?backColor/g),
  ];
  assert.ok(linkColors.length >= 2, 'both edge links paint from backColor');

  // The muted state is a token, never an opacity dim.
  assert.ok(!/opacity:/.test(code), 'a disabled link is muted by colour, not faded');
});
