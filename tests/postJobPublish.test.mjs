import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
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

// ---------------------------------------------------------------------------
// D7-D10 — STEP 2, MEDIA.
//
// The advisory leads with what it is warning about; there is ONE remove
// control and it lives inside the tile it removes; a clip renders as a real
// tile with a frame from the clip itself and its own length; and the sixty
// seconds the picker enforces is said out loud beside the counter.
//
// WHY NOT VACUOUS: the duration formatter is EXTRACTED FROM THE COMPONENT AND
// RUN (the lib/jobs formatBudget pattern conversion.test.mjs already uses), so
// what is asserted is the string a user sees, including the null it must
// return when there is no real duration to show.
// ---------------------------------------------------------------------------

/** The real clipDurationLabel, lifted out of the primitive and executed. */
const clipDurationLabel = await (async () => {
  const source = read('ui/primitives/MediaUploader.tsx');
  const at = source.indexOf('export function clipDurationLabel');
  assert.notEqual(at, -1, 'MediaUploader must export clipDurationLabel');
  const end = source.indexOf('\n}', at);
  assert.ok(end > at, 'clipDurationLabel must close');
  const js = stripTypeScriptTypes(source.slice(at, end + 2), { mode: 'strip' });
  const url =
    'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
  return (await import(url)).clipDurationLabel;
})();

test('D7 · the media advisory leads with the warning, on its own bold line', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));

  // The two lines, verbatim and in order.
  assert.match(
    flat,
    /<Text style=\{\[styles\.infoHeading, isDark && styles\.infoTextDark\]\}> Avoid Sensitive Information: <\/Text> <Text style=\{\[styles\.infoText, isDark && styles\.infoTextDark\]\}> faces, documents, license plates, address, or anything private <\/Text>/,
    'the heading and the list are two separate lines, in that order'
  );
  // The heading is bold; the list is not.
  assert.match(flat, /infoHeading: \{[^}]*fontWeight: '800',/);
  assert.doesNotMatch(/infoText: \{([^}]*)\}/.exec(flat)?.[1] ?? '', /fontWeight/);
  // The sentence it replaced is gone rather than left beside it.
  assert.ok(!flat.includes('Media appears with your'), 'the old advisory sentence is retired');
});

test('D8 · one remove control, inside the tile, on both kinds of media', () => {
  const source = read('ui/primitives/MediaUploader.tsx');
  const flat = flatten(source);

  // ONE control: it is rendered as a sibling of the photo/video branch, not
  // once inside each arm, so photo and video cannot diverge.
  assert.equal(
    (flat.match(/accessibilityLabel=\{`Remove \$\{kind\} \$\{index \+ 1\}`\}/g) ?? []).length,
    1,
    'there is exactly one remove control and both kinds render it'
  );

  // INSIDE the tile. A negative offset is the defect: the tile clips to its
  // own bounds, so the control was cut on a photo and floating beside a clip.
  const remove = /remove: \{([^}]*)\}/.exec(flat);
  assert.ok(remove, 'the remove control must keep a flat style object');
  assert.match(remove[1], /top: spacing\.xs \+ 2, right: spacing\.xs \+ 2,/);
  assert.doesNotMatch(remove[1], /-\s*\d/, 'no negative offset may push it back outside the tile');
  assert.doesNotMatch(
    remove[1],
    /backgroundColor/,
    'the fill is the shared media chrome, applied at the call site — not a second colour here'
  );

  // A translucent dark circle with a white glyph, and both colours are
  // theme-CONSTANT so the control is identical in either palette.
  assert.match(flat, /scrim: \{ backgroundColor: withAlpha\(palette\.mediaChrome, 0\.62\) \}/);
  assert.match(flat, /style=\{\[styles\.remove, chrome\.scrim\]\}/);
  assert.match(flat, /<Ionicons name="close" size=\{14\} color=\{palette\.white\} \/>/);
  assert.match(remove[1], /borderRadius: radius\.pill,/, 'a circle');

  // And the tile itself still clips, which is what made the old offset a bug.
  assert.match(flat, /tile: \{[^}]*overflow: 'hidden',/);
});

test('D9 · a clip renders as a real tile — its own frame, a play mark, its real length', () => {
  const flat = flatten(read('ui/primitives/MediaUploader.tsx'));

  // The poster is the clip, through the same package and the same seek the
  // published-job video already uses. No new dependency, no placeholder card.
  assert.match(flat, /import \{ useVideoPlayer, VideoView \} from 'expo-video';/);
  assert.match(flat, /instance\.currentTime = 0\.5;/);
  assert.match(flat, /<VideoView player=\{player\} style=\{styles\.videoPoster\}/);
  assert.match(flat, /contentFit="cover"/);
  assert.ok(!flat.includes('Clip {index + 1}'), 'the placeholder card is retired');
  assert.match(
    flatten(read('components/JobVideo.tsx')),
    /p\.currentTime = 0\.5;/,
    'the seek matches the published-job poster it is modelled on'
  );

  // A centred play mark…
  assert.match(flat, /<View style=\{styles\.videoCentre\} pointerEvents="none"> <Ionicons name="play-circle"/);
  assert.match(flat, /videoCentre: \{[^}]*alignItems: 'center', justifyContent: 'center',/);

  // …and the length, bottom-right, in the same dark chrome as the remove
  // control, rendered ONLY when there is a real one.
  assert.match(flat, /const duration = clipDurationLabel\(durationMs\);/);
  assert.match(flat, /\{duration \? \( <View style=\{\[styles\.durationBadge, chrome\.scrim\]\}/);
  assert.match(flat, /durationBadge: \{[^}]*right: spacing\.xs, bottom: spacing\.xs,/);

  // The duration comes from the PICKER ASSET and nowhere else.
  assert.match(flat, /if \(asset\.duration != null\) durationsRef\.current\.set\(url, asset\.duration\);/);
  assert.match(flat, /durationMs=\{durationsRef\.current\.get\(url\) \?\? null\}/);
  // Removing a tile forgets its duration, so a later URL cannot inherit it.
  assert.match(flat, /durationsRef\.current\.delete\(url\);/);
});

test('D9 · [executed] the clip length is real or absent — never invented', () => {
  // iOS writes m:ss on a thumbnail, zero-padded, from milliseconds.
  assert.equal(clipDurationLabel(42_000), '0:42');
  assert.equal(clipDurationLabel(9_000), '0:09');
  assert.equal(clipDurationLabel(60_000), '1:00');
  assert.equal(clipDurationLabel(61_400), '1:01');
  assert.equal(clipDurationLabel(3_600_000), '60:00');
  // Sub-second rounding still reads as a real second, never "0:00".
  assert.equal(clipDurationLabel(1_400), '0:01');

  // NO DURATION IS NO BADGE. A restored draft's clip never went through a
  // picker in this session, so there is nothing honest to print.
  for (const absent of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(clipDurationLabel(absent), null, `${String(absent)} must produce no badge`);
  }
});

test('D10 · the cap pill reads from the cap the picker is actually given', () => {
  const flat = flatten(read('ui/primitives/MediaUploader.tsx'));
  const screen = flatten(read('screens/PostJobScreen.tsx'));

  // Beside the counter, on the video control only, with a clock glyph.
  assert.match(
    flat,
    /\{kind === 'video' && videoMaxDurationSec \? \( <View style=\{\[styles\.capPill, isDark && styles\.capPillDark\]\}> <Ionicons name="time-outline" size=\{12\}/
  );
  assert.match(flat, /Up to \{videoMaxDurationSec\} sec/);
  // ANTI-VACUITY: that prop is the SAME number handed to the picker, so the
  // pill cannot promise a minute the control does not enforce.
  assert.match(flat, /videoMaxDuration: kind === 'video' \? videoMaxDurationSec : undefined,/);
  assert.match(screen, /videoMaxDurationSec=\{MAX_VIDEO_DURATION_MS \/ 1000\}/);
  assert.match(screen, /const MAX_VIDEO_DURATION_MS = 60_000;/);

  // The paragraph under the tile stays — the pill is a glance, it is the
  // explanation.
  assert.match(
    screen,
    /Up to \{MAX_VIDEO_DURATION_MS \/ 1000\} seconds\. A short clip explains an awkward job faster than a paragraph\./
  );
});
