import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
    // RUN T2 (C3) put this screen's gutter and section gap on their own dials,
    // so a third member joins the array between the two named here. What this
    // fence is for is unchanged and still exact: `contentWithFooter` is
    // applied by `isLastStep` and by nothing else.
    /contentContainerStyle=\{\[ styles\.content,[^\]]*isLastStep && styles\.contentWithFooter, \]\}/,
    'the clearance applies on the step that HAS a footer, and only there'
  );
  assert.match(
    flat,
    /contentWithFooter: \{ paddingBottom: spacing\.xl \+ PINNED_FOOTER_BOTTOM_PADDING, \}/,
    'the clearance is the content padding plus the SAME constant the footer applies'
  );
  // ANTI-VACUITY: that constant is imported here and is the shared one. RUN
  // PUBLISH1 (C1) widened this import to a multi-line block when the publish
  // surface took LitSurface and MoneyText, so the assertion reads the import
  // BLOCK rather than one line of it — the guarantee is unchanged.
  assert.match(
    flatten(screen),
    /import \{[^}]*PINNED_FOOTER_BOTTOM_PADDING,? *\} from '\.\.\/ui\/primitives'/
  );
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

test('D7/PJ1-C4 · the media advisory is one plain sentence, and the heading is deleted', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));

  // The PJ1-C4 copy, verbatim, in the shared info-text treatment with its
  // dark-ink override intact.
  assert.match(
    flat,
    /<Text style=\{\[styles\.infoText, isDark && styles\.infoTextDark\]\}> Avoid faces, documents, license plates, addresses, or any other personal information <\/Text>/,
    'the advisory body is the exact PJ1-C4 sentence'
  );
  // The heading is DELETED outright — text, style and column wrapper — and
  // the old list went with it rather than surviving beside the new sentence.
  assert.ok(!flat.includes('Avoid Sensitive Information'), 'the heading text is deleted');
  assert.ok(!flat.includes('infoHeading'), 'the heading style is gone with its text');
  assert.ok(!flat.includes('infoBody'), 'the two-line column wrapper is gone too');
  assert.ok(
    !flat.includes('or anything private'),
    'the old list is replaced, not left beside the new sentence'
  );
  // And the sentence D7 itself replaced stays retired.
  assert.ok(!flat.includes('Media appears with your'), 'the pre-D7 advisory sentence stays retired');
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

test('D10/PJ1-C4 · both cap badges read the caps actually enforced, through ONE block', () => {
  const flat = flatten(read('ui/primitives/MediaUploader.tsx'));
  const screen = flatten(read('screens/PostJobScreen.tsx'));

  // ONE shared render: the badge element appears exactly once, fed by the
  // per-kind derivation, so the photo and video badges cannot be restyled
  // apart — restyle the block and both move together.
  assert.equal(
    (flat.match(/styles\.capPill,/g) ?? []).length,
    1,
    'there is exactly one cap-badge element; both kinds render through it'
  );
  assert.match(
    flat,
    /kind === 'video' && videoMaxDurationSec \? \{ icon: 'time-outline' as const, text: `Up to \$\{videoMaxDurationSec\} seconds` \}/,
    'the video badge spells "seconds" and reads the picker cap'
  );
  assert.match(
    flat,
    /kind === 'photo' \? \{ icon: 'image-outline' as const, text: `Up to \$\{maxItems\} photos` \}/,
    'the photo badge reads the item cap, with the photo-nudge row\'s own glyph'
  );
  assert.ok(!/\bsec\b/.test(flat), 'the abbreviated "sec" is retired');
  // ANTI-VACUITY: the video figure is the SAME number handed to the picker,
  // and the photo figure is the SAME cap the add tile stops at.
  assert.match(flat, /videoMaxDuration: kind === 'video' \? videoMaxDurationSec : undefined,/);
  assert.match(flat, /const atLimit = items\.length >= maxItems;/);
  assert.match(screen, /videoMaxDurationSec=\{MAX_VIDEO_DURATION_MS \/ 1000\}/);
  assert.match(screen, /const MAX_VIDEO_DURATION_MS = 60_000;/);
  assert.match(screen, /maxItems=\{isHiring \? 5 : MAX_PHOTOS\}/);
  assert.match(screen, /const MAX_PHOTOS = 10;/);

  // The caption under the tile keeps ONLY the explanation — the badge says
  // the minute now, so the duplicate first sentence is deleted.
  assert.match(screen, /A short clip explains an awkward job faster than a paragraph\./);
  assert.ok(
    !screen.includes('seconds. A short clip'),
    'the "Up to 60 seconds." sentence is deleted from the caption'
  );
});

// ---------------------------------------------------------------------------
// D11-D18 — STEP 3 (LOCATION) AND STEP 4 (REVIEW).
//
// The area card says what it protects and can actually be read; the address
// caption is out of the label row; the budget is one displayed figure with one
// way to change it; and the summary keeps all six of its rows.
//
// WHY NOT VACUOUS: the readability claim in D11 is checked as the SPECIFIC
// pair of overrides that were missing — the card's own token and its text's
// token are parsed and compared, so "readable" is a resolved contrast between
// two palette entries rather than an eyeball. And the MEDIA row's wording is
// extracted from the screen and RUN over every count combination that matters.
// ---------------------------------------------------------------------------

/** The real mediaSummary, lifted out of the screen and executed. */
const mediaSummary = await (async () => {
  const source = read('screens/PostJobScreen.tsx');
  const at = source.indexOf('function mediaSummary');
  assert.notEqual(at, -1, 'the screen must declare mediaSummary');
  const end = source.indexOf('\n}', at);
  assert.ok(end > at, 'mediaSummary must close');
  const js = stripTypeScriptTypes('export ' + source.slice(at, end + 2), { mode: 'strip' });
  const url =
    'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
  return (await import(url)).mediaSummary;
})();

test('D11/PJ1-C7 · the area card is deleted, and the privacy fact still reads twice', () => {
  const screen = read('screens/PostJobScreen.tsx');
  const flat = flatten(screen);

  // C7 — the card, its copy and its glyph are gone from the Location step.
  assert.ok(
    !flat.includes('Shows approximate area'),
    'the approximate-area card is deleted, not reworded'
  );
  assert.ok(
    !flat.includes('information-circle-outline'),
    'the card\'s "i" glyph went with it'
  );

  // The privacy fact survives it, stated at least twice on the same step —
  // the step subtitle and the address caption, both verbatim.
  assert.match(
    flat,
    /Workers browsing see only the area\. The exact address stays private until you hire someone\./,
    'the Location step subtitle still states the privacy rule'
  );
  assert.match(
    flat,
    /Never shown until you hire — can see after job is accepted\./,
    'the address caption still states the privacy rule'
  );

  // Exactly ONE info card remains — the media advisory — and it keeps the
  // dark overrides D11 established (deep-green text on a near-black-green
  // card is the fault they exist for).
  assert.equal(
    (flat.match(/\[styles\.infoCard, isDark && styles\.infoCardDark\]/g) ?? []).length,
    1,
    'one info card remains and it takes the dark card treatment'
  );
  assert.equal(
    (flat.match(/\[styles\.infoText, isDark && styles\.infoTextDark\]/g) ?? []).length,
    1,
    'and its text takes the dark ink'
  );

  // ANTI-VACUITY: the two tokens the fault was made of really are one deep
  // green on another, and the override really is the cream ink.
  const tokens = read('ui/tokens.ts');
  const forest = tokenValue(tokens, 'export const dark = {', 'forest');
  const mint = tokenValue(tokens, 'export const dark = {', 'mint');
  const ink = tokenValue(tokens, 'export const dark = {', 'ink');
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  assert.ok(
    Math.abs(luminance(forest) - luminance(mint)) < 24,
    `dark forest ${forest} on dark mint ${mint} is the near-invisible pair this fixes`
  );
  assert.ok(
    luminance(ink) - luminance(mint) > 150,
    `dark ink ${ink} on dark mint ${mint} is the pair that reads`
  );
});

test('D12 · the address caption is below the field, and the label owns its row', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));

  const at = flat.indexOf('label="Service address (private, optional)"');
  assert.notEqual(at, -1, 'the private-address field must still be here');
  const field = flat.slice(at, at + 400);

  // No hint on the field — a hint is laid out BESIDE the label, and this is
  // the longest label in the app.
  assert.doesNotMatch(field, /hint=/, 'the sentence must not go back into the label row');
  // The caption is a plain line under the field, verbatim.
  assert.match(
    field,
    /<Text style=\{styles\.fieldHint\}> Never shown until you hire — can see after job is accepted\. <\/Text>/
  );
  assert.ok(
    !flat.includes('Never shown while workers browse'),
    'the old sentence is replaced, not duplicated'
  );
});

test('D13/D14 · the budget pill displays, the pencil edits, and nothing else is a control', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));

  // RUN a4 (2026-09-05): the label is now the mode's own word — 'Max budget'
  // in open bids, 'Price' in posted — so the block is anchored on the
  // expression rather than on the string it resolves to. Logic unchanged.
  const at = flat.indexOf(
    '<FieldLabel palette={emeraldColors}>{priceFieldLabel(pricingMode)}</FieldLabel>'
  );
  assert.notEqual(at, -1, 'the maximum carries the shared field label, left-aligned');
  const end = flat.indexOf('Optional — leave blank', at);
  assert.notEqual(end, -1, 'the helper must follow the pill');
  const block = flat.slice(at, end);

  // THE PILL IS NOT A TOUCH TARGET. Exactly one Pressable in the block, and
  // it is the pencil.
  assert.equal(
    (block.match(/<Pressable/g) ?? []).length,
    1,
    'the pill itself must not be pressable — the pencil is the only touch target'
  );
  assert.match(block, /<View style=\{styles\.budgetPill\}> <Text style=\{styles\.budgetPillValue\}/);
  assert.match(block, /accessibilityLabel="Edit budget"/);
  assert.match(block, /onPress=\{\(\) => setEditingBudget\(true\)\}/);
  assert.match(block, /<Ionicons name="pencil"/);

  // AND IT IS NOT A TEXT INPUT.
  assert.ok(!block.includes('<TextField'), 'the pill is a display, not a field');
  assert.ok(!block.includes('onChangeText'), 'nothing in the pill accepts typing');

  // D13 — the minimum is gone entirely, field and label. (The `budgetMin`
  // STATE survives, and must: the draft record and edit mode both carry it,
  // and D16 is about not WRITING it, not about corrupting a saved draft.
  // What has to be gone is any way to enter one.)
  assert.ok(!flat.includes('Min budget'), 'the MIN BUDGET field and label are removed');
  assert.ok(!flat.includes('budgetRow'), 'the two-field row is gone with it');
  assert.ok(!block.includes('budgetMin'), 'the review step offers no minimum to edit');

  // D14 — no slider, no track, no second edit affordance.
  for (const banned of ['Slider', 'FilterSlider', 'Edit Amount', 'budgetTrack']) {
    assert.ok(!flat.includes(banned), `${banned} must not appear — the pencil is the one edit path`);
  }

  // D15a — the range sentence is deleted, not reworded.
  assert.match(flat, /Optional — leave blank if you want workers to propose a price\./);
  assert.ok(!flat.includes('A range helps workers bid'), 'the range sentence is gone');

  // The label treatment is the SHARED one, so it cannot drift from Title and
  // Description on step 1.
  const field = read('components/TextField.tsx');
  assert.match(field, /export function FieldLabel\(\{/);
  assert.match(field, /<FieldLabel palette=\{palette\}>\{label\}<\/FieldLabel>/);
});

test('D15 · the budget editor is ConfirmDialog shaped, emerald, and refuses over-ceiling in writing', () => {
  const dialog = read('components/EditBudgetDialog.tsx');
  const flat = flatten(dialog);
  const confirm = flatten(read('components/ConfirmDialog.tsx'));

  // ConfirmDialog's structure: the same Modal, scrim, centred wrap.
  for (const shared of [
    /<Modal visible=\{visible\} transparent animationType="fade"/,
    /backdrop: \{ flex: 1,/,
    /centerWrap: \{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing\.lg, \}/,
  ]) {
    assert.match(flat, shared, 'the dialog must keep ConfirmDialog\'s structure');
    assert.match(confirm, shared, 'and that structure must still be what ConfirmDialog has');
  }
  // The xl radius survives on both — the budget editor on its own panel, and
  // ConfirmDialog through the sheet material's radius prop (G1 C5).
  assert.match(flat, /borderRadius: radius\.xl,/, 'the budget editor keeps the xl radius');
  assert.match(
    confirm,
    /<Surface material="sheet" corners="all" radius=\{radius\.xl\}/,
    "ConfirmDialog's card wears the sheet material at the same xl radius (G1 C5)"
  );

  // …and the budget editor keeps an EMERALD, TRANSLUCENT panel of its own,
  // outside the material system by operator decision.
  assert.match(flat, /backgroundColor: withAlpha\(colors\.forest, 0\.92\)/);
  assert.match(flat, /borderColor: withAlpha\(colors\.emerald, 0\.55\)/);

  // THE SCRIM IS DEEPENED THROUGH THE SHARED HELPER, never a new number.
  assert.match(flat, /backgroundColor: scrimInDark\(colors\.ink\)/);
  assert.match(flat, /backdropDark: \{ backgroundColor: scrimInDark\(colors\.background\) \}/);
  assert.match(
    read('lib/theme.ts'),
    /export const SCRIM_DARK_ALPHA = 0\.55;/,
    'the alpha stays the one value lib/theme pins'
  );

  // L1 — NO LIBRARY, AND NO FILL DRAWN HERE.
  //
  // This was a ban on the words. RUN PUBLISH1 (C2) put the sheet on
  // ui/primitives/LitSurface.tsx — the same wash Home's promo card wears,
  // which is a `backgroundImage` STRING on one node and adds no dependency at
  // all. What L1 protects is unchanged and is asserted directly now: no
  // gradient, blur or SVG LIBRARY is imported, and this dialog writes no fill
  // expression of its own — the wash arrives entirely from the shared
  // primitive, whose own fence (tests/litSurface.test.mjs) owns its colours.
  for (const banned of ['BlurView', 'linear-gradient', 'LinearGradient', 'Svg']) {
    assert.ok(!flat.includes(banned), `${banned} must not appear — this dialog draws no fill`);
  }
  assert.doesNotMatch(
    dialog,
    /^import .*(gradient|blur|svg)/im,
    'no gradient, blur or SVG library may be imported here'
  );
  assert.match(
    flat,
    /import \{ LitSurface \} from '\.\.\/ui\/primitives';/,
    'the wash comes from the shared primitive, not from an expression written here'
  );

  // The contents, verbatim. RUN a4 (2026-09-05): the title and the message are
  // now the MODE's, so the two open-bids strings live in lib/pricingMode.ts —
  // pinned there, byte for byte — and what this dialog is pinned on is that it
  // renders that module's answer for the mode being edited, never its own copy.
  const modes = read('lib/pricingMode.ts');
  assert.match(modes, /title: 'Edit Budget',/);
  assert.match(modes, /message: 'Set the maximum amount workers can bid up to\.',/);
  assert.match(flat, /const copy = budgetEditorCopy\(draftMode\);/);
  assert.match(flat, /<Text style=\{\[styles\.title, \{ color: palette\.onForest \}\]\}>\{copy\.title\}<\/Text>/);
  assert.match(flat, /\{copy\.message\}<\/Text>/);
  assert.match(flat, /accessibilityLabel=\{copy\.fieldLabel\}/);
  assert.match(flat, /keyboardType="numeric"/);
  assert.match(flat, /returnKeyType="done"/);
  assert.match(flat, /onSubmitEditing=\{handleSave\}/, 'the Done key IS Save, not a second outcome');
  assert.match(
    flat,
    /<Button title="Save" palette=\{palette\} onPress=\{handleSave\} style=\{styles\.action\} \/>/
  );
  assert.match(flat, /<Button title="Cancel" variant="secondary"/);
  // RUN PUBLISH1 (C2): SIDE BY SIDE on one row, each half of it. Two
  // full-width buttons stacked read as a list of choices; this is one decision
  // with a default.
  assert.match(flat, /actions: \{ flexDirection: 'row', gap: spacing\.md,/);
  assert.match(flat, /action: \{ flex: 1, \}/);
  // AND THE LABEL ABOVE THE FIELD IS GONE, not moved: the message says it in a
  // sentence and the prefix says it in a glyph.
  assert.ok(!flat.includes('Maximum ($)'), 'the "Maximum ($)" caption stays deleted');
  assert.match(flat, /<Text style=\{styles\.amountPrefix\}>\$<\/Text>/, 'the "$" prefix is the label');

  // THE CEILING, COMPOSED FROM THE SHARED RULES and refusing before any RPC.
  assert.match(flat, /import \{ validateOfferAmount \} from '\.\/OfferComposer';/);
  assert.match(flat, /import \{ moneyCeilingError \} from '\.\.\/lib\/validation';/);
  // RUN a4 (2026-09-05): empty is still legal and still means no maximum — the
  // mode now decides whether this mode HAS one, and a posted price does not.
  assert.match(
    flat,
    /if \(!text\.trim\(\)\) return budgetEditorCopy\(mode\)\.allowEmpty \? null : 'Enter an amount\.';/,
    'empty is legal and means no maximum, where the mode allows a maximum'
  );
  assert.match(read('lib/pricingMode.ts'), /allowEmpty: true,/, 'and open bids is that mode');
  assert.match(flat, /return moneyCeilingError\(dollarsToCents\(text\)\);/);
  assert.match(flat, /if \(found\) \{ setProblem\(found\); return; \}/, 'a refusal blocks the save');
  // RUN PUBLISH1 (C2) drew the field here instead of through TextField, so the
  // refusal is rendered rather than handed to a component's `error` prop. The
  // guarantee is unchanged and is now checked on both halves: the message is
  // written under the field, and the field itself shows it is refused.
  assert.match(
    flat,
    /\{problem \? <Text style=\{styles\.amountError\}>\{problem\}<\/Text> : null\}/,
    'the refusal is stated in writing under the field'
  );
  assert.match(
    flat,
    /style=\{\[styles\.amountRow, problem \? styles\.amountRowError : null\]\}/,
    'and the field itself carries the refusal'
  );
  assert.match(flat, /amountRowError: \{ borderColor: colors\.danger, \}/);
  // No RPC of any kind lives in this dialog — it hands text back and closes.
  assert.ok(!flat.includes('supabase'), 'the dialog contacts nothing');
  assert.ok(!flat.includes('createJob'), 'the dialog writes nothing');

  // Cancel discards: the next open re-seeds from the live value. RUN a4: and
  // from the live MODE, so a cancelled mode change discards with the amount.
  assert.match(
    flat,
    /useEffect\(\(\) => \{ if \(!visible\) return; setDraft\(value\); setDraftMode\(mode\); setProblem\(null\); \}/
  );

  // The screen wires it: Save writes and closes, Cancel only closes. RUN a4:
  // Save now writes both halves of the one decision.
  const screen = flatten(read('screens/PostJobScreen.tsx'));
  assert.match(
    screen,
    /onSave=\{\(next, mode\) => \{ setBudgetMax\(next\); setPricingMode\(mode\); setEditingBudget\(false\); \}\}/
  );
  assert.match(screen, /onCancel=\{\(\) => setEditingBudget\(false\)\}/);
});

test('D16 · this screen writes no minimum, and nothing else about the column moved', () => {
  const screen = read('screens/PostJobScreen.tsx');
  const flat = flatten(screen);

  // RUN a4 (2026-09-05): the one typed figure now goes to the column its mode
  // means — budget_cents for a posted price, budget_max_cents for open bids.
  // The MINIMUM is what this test is about and it is still null on both roads.
  assert.match(
    flat,
    /budgetCents: posted \? budgetMaxCents : null, budgetMinCents: null, budgetMaxCents: posted \? null : budgetMaxCents, pricingMode,/
  );
  // The summary label must not claim a minimum either. RUN a4: that derivation
  // is now the open-bids branch, which is the only one that can render a range.
  assert.match(flat, /budget_min_cents: null, budget_max_cents: validMax,/);

  // NOT A SCHEMA CHANGE. No migration was written and the column's other
  // readers are untouched — lib/jobs still carries it end to end.
  const jobs = read('lib/jobs.ts');
  assert.match(jobs, /budget_min_cents/, 'the column stays in the data layer');
  assert.match(jobs, /moneyCeilingError\(input\.budgetMinCents\)/, 'and keeps its ceiling check');
  // The draft still round-trips it, so an in-progress draft is not corrupted.
  assert.match(read('lib/postJobDraft.ts'), /budgetMin/);
  assert.match(flat, /setBudgetMin\(draft\.budgetMin\)/);
});

test('D17/D18 · the summary keeps all six rows, and the media row counts honestly', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));

  const at = flat.indexOf('<Text style={styles.reviewEyebrow}>JOB SUMMARY</Text>');
  assert.notEqual(at, -1, 'the summary card must still be here');
  const end = flat.indexOf('<View style={styles.publishNotice}>', at);
  assert.notEqual(end, -1, 'the summary card must close before the publish notice');
  const card = flat.slice(at, end);

  const rows = [...card.matchAll(/<Text style=\{styles\.reviewLabel\}>([^<]+)<\/Text>/g)].map(
    (match) => match[1]
  );
  // RUN a4 (2026-09-05): SIX ROWS STILL, and the last one is still the amount —
  // what changed is that its label now comes from the posting mode ('Budget'
  // for open bids, 'Price' for a posted price) instead of being written here.
  assert.deepEqual(rows, [
    'Category',
    'Area',
    'Media',
    'Timing',
    'Address (private)',
    '{isHiring ? \'Offer\' : priceRowLabel(pricingMode)}',
  ]);

  // The private-address row no longer disappears when it is empty — a
  // missing address is a fact a review screen should state.
  assert.match(card, /\{address\.trim\(\) \|\| 'Not added'\}/);
  assert.match(card, /\{mediaSummary\(photos\.length, videos\.length\)\}/);
});

test('D18 · [executed] the media row pluralises each side and omits an empty one', () => {
  assert.equal(mediaSummary(3, 1), '3 photos • 1 video');
  assert.equal(mediaSummary(1, 2), '1 photo • 2 videos');
  assert.equal(mediaSummary(1, 1), '1 photo • 1 video');
  assert.equal(mediaSummary(10, 0), '10 photos');
  assert.equal(mediaSummary(0, 1), '1 video');
  assert.equal(mediaSummary(0, 0), 'None');
  // "video", never "clip" — one word for one thing across the flow.
  for (const [photos, videos] of [[0, 1], [2, 3], [1, 1]]) {
    assert.doesNotMatch(mediaSummary(photos, videos), /clip/);
  }
  // A zero is never printed as a zero.
  assert.doesNotMatch(mediaSummary(4, 0), /\b0\b/);
  assert.doesNotMatch(mediaSummary(0, 4), /\b0\b/);
});

// ---------------------------------------------------------------------------
// D19-D26 — THE PUBLISH SCREEN.
//
// The copy, the glyph, the label, the card that promises a notification, and
// the mark that animates once and then holds still.
//
// WHY NOT VACUOUS: the notification card's claim is checked against the
// MIGRATIONS, end to end — the trigger that enqueues it, the projection that
// fires that trigger, and the preference default that lets it through. If any
// link were missing the card would be a promise the app does not keep, and
// this fence would say which link.
// ---------------------------------------------------------------------------

test('D19-D21 · the publish copy, the amount glyph, and where the second action goes', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));
  const publish = publishBranch(read('screens/PostJobScreen.tsx'));

  // D20 — verbatim.
  assert.match(
    flat,
    /body="Workers can now see your job\. Bids appear as workers respond, and you choose who gets it\."/
  );
  assert.ok(
    !flat.includes('Workers browsing BRAZOS can now see it'),
    'the body it replaced is retired'
  );

  // D19 — the BUDGET row's glyph is the amount's own sign, and the wallet is
  // gone from THIS card. (Step 4's summary keeps its own glyph: D19 is scoped
  // to the publish screen.)
  assert.match(publish, /<Text style=\{styles\.reviewIconGlyph\}>\$<\/Text>/);
  assert.ok(
    !publish.includes('wallet-outline'),
    'the wallet glyph is gone from the publish screen\'s budget row'
  );
  assert.match(flat, /reviewIconGlyph: \{[^}]*color: colors\.emerald,/);

  // D21 — new label, same handler and same destination.
  assert.match(publish, /label: 'Back to Home',/);
  assert.match(publish, /onPress: \(\) => leaveAfterSuccess\(false\),/);
  assert.ok(!publish.includes('Keep browsing'), 'the old label is replaced, not kept beside it');
});

test('D22 · the bids card is on the screen because the schema actually backs it', () => {
  const flat = flatten(read('screens/PostJobScreen.tsx'));

  assert.match(flat, /Expect the first bids soon/);
  assert.match(flat, /You&apos;ll be notified when a worker bids on this job\./);

  // LINK 1 — the preference defaults to on, so a fresh account receives it.
  const phase20 = read('supabase/archive/phases/phase20_push_notifications.sql');
  assert.match(
    phase20,
    /\n {2}bids boolean not null default true,/,
    'notification_prefs.bids must default to true'
  );

  // LINK 2 — a bid enqueues 'bid_received' to the JOB'S OWNER, on the 'bids'
  // channel, from a trigger that really is installed.
  assert.match(
    flatten(phase20),
    /perform public\.enqueue_notification\( v_job\.client_id, new\.worker_id, 'bids', 'bid_received',/
  );
  assert.match(
    flatten(phase20),
    /create trigger bids_notify after insert on public\.bids for each row execute function public\.notify_on_bid\(\);/
  );

  // LINK 3 — `bids` is written for every marketplace offer chain, so that
  // trigger fires on the real write path (job_offers), not a dead legacy one.
  const phase47 = flatten(read('supabase/archive/phases/phase47_bids_projection_trigger.sql'));
  assert.match(phase47, /insert into public\.bids \(id, job_id, worker_id, amount_cents, message, status, created_at\)/);
  assert.match(phase47, /create trigger job_offers_mirror_bids/);

  // The three links above all predate this card — it was written BECAUSE they
  // were verified, not alongside a new migration to make them true.
});

test('D23 · the mark is a bigger check on a filled disc, ringed, haloed and sparkled', () => {
  const shared = read('components/SuccessMark.shared.tsx');
  const still = read('components/SuccessMark.tsx');
  const flatShared = flatten(shared);

  // BIGGER THAN WHAT IT REPLACED. The template's glyph is a 44pt icon in an
  // 88pt disc; both numbers are read from the template rather than restated.
  const template = read('ui/templates/SuccessScreen.tsx');
  const templateGlyph = Number(/size=\{(\d+)\} color=\{isDark \? colors\.emerald/.exec(template)?.[1]);
  const templateDisc = Number(/glyph: \{\s*width: (\d+),/.exec(template)?.[1]);
  const check = Number(/export const MARK_CHECK = (\d+);/.exec(shared)?.[1]);
  const disc = Number(/export const MARK_DISC = (\d+);/.exec(shared)?.[1]);
  assert.ok(templateGlyph > 0 && templateDisc > 0, 'the template must still declare its own mark');
  assert.ok(check > templateGlyph, `the check grew: ${check} > ${templateGlyph}`);
  assert.ok(disc > templateDisc, `the disc grew: ${disc} > ${templateDisc}`);

  // A FILLED disc, in the one solid conversion fill, with cream on it.
  assert.match(flatShared, /disc: \{[^}]*backgroundColor: colors\.forest,/);
  assert.match(flatten(still), /<Ionicons name="checkmark" size=\{MARK_CHECK\} color=\{colors\.onForest\} \/>/);

  // CONCENTRIC RING BORDERS behind it — borders, not fills, and two of them
  // stepping outward.
  assert.match(flatShared, /export const MARK_RINGS = \[(\d+), (\d+)\] as const;/);
  const rings = /MARK_RINGS = \[(\d+), (\d+)\]/.exec(flatShared);
  assert.ok(rings, 'the ring diameters must stay readable constants');
  assert.ok(
    Number(rings[1]) > disc && Number(rings[2]) > Number(rings[1]),
    'the rings step outward from the disc'
  );
  const ring = /ring: \{([^}]*)\}/.exec(flatShared);
  assert.ok(ring, 'the ring must keep a flat style');
  assert.match(ring[1], /borderWidth: 1,/);
  assert.doesNotMatch(ring[1], /backgroundColor/, 'a ring is line-work, never a fill');

  // A SHADOW HALO, from the token shape rather than a hand-rolled shadow.
  assert.match(flatShared, /discGlow: glow\.halo\(withAlpha\(colors\.emerald, 0\.55\)\)/);

  // SPARKLES, from the icon set that is already installed.
  assert.match(flatShared, /export const MARK_SPARKLES = \[/);
  assert.ok(
    (flatShared.match(/\{ key: '/g) ?? []).length >= 3,
    'a few sparkles, not one'
  );
  assert.match(flatten(still), /<Ionicons key=\{sparkle\.key\} name="sparkles"/);

  // L1 — FLAT FILLS ONLY. No gradient, blur or SVG anywhere in the trio.
  for (const path of [
    'components/SuccessMark.shared.tsx',
    'components/SuccessMark.tsx',
    'components/SuccessMark.motion120.tsx',
  ]) {
    const source = stripComments(read(path));
    for (const banned of ['Gradient', 'BlurView', 'react-native-svg', '<Svg']) {
      assert.ok(!source.includes(banned), `${path} must not reach for ${banned}`);
    }
    // L2 — and no raw colour literals either.
    assert.equal(source.match(/#[0-9a-fA-F]{3,8}\b/), null, `${path}: a raw hex crept in`);
    assert.equal(source.match(/rgba?\(/), null, `${path}: a raw rgba() crept in`);

    // L4 — no node carries a shadow AND a clip: on iOS overflow:'hidden' sets
    // masksToBounds and takes the halo off the same layer.
    for (const match of source.matchAll(/\w+: \{([^}]*)\}/g)) {
      const body = match[1];
      const clips = /overflow: 'hidden'/.test(body);
      const shadowed = /shadow|elevation|glow\.halo/.test(body);
      assert.ok(!(clips && shadowed), `${path}: a node carries both a clip and a shadow`);
    }
  }
});

test('D24 · the entrance runs once, for about a second, and then holds', () => {
  const fast = stripComments(read('components/SuccessMark.motion120.tsx'));
  const flat = flatten(read('components/SuccessMark.shared.tsx'));

  // ONE animation. Not one per piece — one shared progress every piece reads,
  // which is what makes "once" structural rather than a promise.
  assert.equal(
    (fast.match(/withTiming\(/g) ?? []).length,
    1,
    'there is exactly one animation on this surface'
  );
  assert.match(fast, /progress\.value = withTiming\(1, \{ duration: MARK_ENTRANCE_MS \}\);/);

  // Roughly a second.
  const ms = Number(/export const MARK_ENTRANCE_MS = (\d+);/.exec(flat)?.[1]);
  assert.ok(ms >= 700 && ms <= 1300, `the entrance is about a second, saw ${ms}ms`);

  // NOTHING THAT KEEPS RUNNING.
  for (const banned of ['withRepeat', 'withSequence', 'withDecay', 'withSpring', 'setInterval', 'reverse', 'Infinity', '-1']) {
    assert.ok(!fast.includes(banned), `${banned} would keep the mark moving — it must not appear`);
  }
  // It is kicked once, on mount, and never re-kicked by a changing dependency.
  assert.match(fast, /\}, \[progress\]\);/, 'the effect depends only on the stable shared value');

  // IT ENDS ON THE STILL FRAME. Every interpolation clamps, so at progress 1
  // nothing has run past the value the still artwork draws.
  const interpolations = [...fast.matchAll(/interpolate\([^;]*?\)/g)];
  assert.ok(interpolations.length >= 4, 'the pieces really are functions of the progress');
  for (const [expression] of interpolations) {
    assert.match(expression, /'clamp'/, `an interpolation may not extrapolate: ${expression}`);
  }
});

test('D25/D26 · the boundary holds, and reduced motion gets the still artwork', () => {
  const fallback = read('components/SuccessMark.tsx');
  const flatFallback = flatten(fallback);
  const fast = read('components/SuccessMark.motion120.tsx');

  // D25 — the chooser, on the capability it actually needs, with a literal
  // require. (motion120.test.mjs holds the tree-wide exclusivity scan; this
  // pins THIS sibling's half of it.)
  assert.match(flatFallback, /resolveMotion120<ComponentType<SuccessMarkProps>>\( motionCapability, 'reanimated',/);
  assert.match(flatFallback, /require\('\.\/SuccessMark\.motion120'\)/);
  assert.ok(
    !stripComments(fallback).includes("from 'react-native-reanimated'"),
    'the fallback must never import the vendor — that is the crash the boundary exists for'
  );
  assert.match(fast, /from 'react-native-reanimated'/);
  // Both take the artwork from the shared module, so the two cannot drift.
  for (const [label, source] of [['fallback', fallback], ['fast', fast]]) {
    assert.ok(
      source.includes("from './SuccessMark.shared'"),
      `the ${label} must draw the shared artwork`
    );
  }

  // D26 — REDUCED MOTION NEVER GETS A DEGRADED ANIMATION, it gets the same
  // artwork standing still. And `null` — the hook's "not read yet" — does not
  // animate either, which is that hook's own stated contract.
  assert.match(
    flatFallback,
    /const reducedMotion = useReducedMotion\(\); if \(reducedMotion !== false \|\| !canWorklet\(\)\) return <SuccessMarkStill \{\.\.\.props\} \/>;/,
    'only an explicit false may animate'
  );
  assert.match(
    read('hooks/useReducedMotion.ts'),
    /export function useReducedMotion\(\): boolean \| null \{/,
    'the hook really can answer null, which is why the check is !== false'
  );

  // The still path is the FULL artwork — every ring and every sparkle — not a
  // reduced one.
  assert.match(flatFallback, /\{MARK_RINGS\.map\(\(size, index\) =>/);
  assert.match(flatFallback, /\{MARK_SPARKLES\.map\(\(sparkle\) =>/);

  // And the screen mounts the mark through the template's slot.
  const screen = flatten(read('screens/PostJobScreen.tsx'));
  assert.match(screen, /mark=\{<SuccessMark accessibilityLabel="Your job is published" \/>\}/);
  // RUN MOTION1 (C2) staggered the template's own pieces, so the default glyph
  // is an Animated.View carrying an entrance style. The guarantee this line
  // makes is the `??`, and it is unchanged: a caller-supplied mark REPLACES the
  // glyph, and only the glyph the template draws itself is animated here — the
  // mark brings its own entrance through the motion120 boundary above.
  assert.match(
    flatten(read('ui/templates/SuccessScreen.tsx')),
    /\{mark \?\? \( <Animated\.View style=\{\[styles\.glyph, isDark && styles\.glyphDark, glyphEntrance\]\}>/,
    'the mark REPLACES the default glyph rather than joining it'
  );
  // And the mark is never given a SECOND entrance by the template.
  assert.doesNotMatch(
    flatten(read('ui/templates/SuccessScreen.tsx')),
    /Entrance\}?\]?\}?>\s*\{mark|\{mark\}[^]{0,40}Entrance/,
    'a caller mark must not be wrapped in the template’s own entrance'
  );
});

// ---------------------------------------------------------------------------
// THE RUN'S OWN LIMITS.
//
// Everything above is about what the flow does. This last section is about
// what building it was NOT allowed to do — no new dependency, no database, no
// production reference, no escrow, and no reaching for the asset staged for a
// later run. Each is cheap to check and expensive to discover later.
// ---------------------------------------------------------------------------

/** Every file this run created or reshaped. */
const TOUCHED = [
  'components/EditBudgetDialog.tsx',
  'components/ScreenHeader.tsx',
  'components/SuccessMark.motion120.tsx',
  'components/SuccessMark.shared.tsx',
  'components/SuccessMark.tsx',
  'components/TextField.tsx',
  'screens/PostJobScreen.tsx',
  'ui/primitives/MediaUploader.tsx',
  'ui/templates/SuccessScreen.tsx',
];

test('gate · nothing this run added reaches for a package the app does not have', () => {
  const manifest = JSON.parse(read('package.json'));
  const installed = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  assert.ok(installed.size > 20, 'the manifest must have actually parsed');

  const seen = new Set();
  for (const path of TOUCHED) {
    const source = stripComments(read(path));
    for (const match of source.matchAll(/(?:from|require\()\s*'([^']+)'/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) continue;
      // Scoped packages keep two segments; everything else keeps one.
      const pkg = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      seen.add(pkg);
      assert.ok(
        installed.has(pkg) || pkg === 'react' || pkg === 'react-native',
        `${path} imports ${pkg}, which is not in package.json`
      );
    }
  }
  // ANTI-VACUITY: the sweep really did find the imports it is checking.
  assert.ok(seen.has('expo-video'), 'the clip poster\'s package must be among the imports checked');
  assert.ok(seen.has('react-native-reanimated'), 'the fast path\'s vendor must be too');
});

test('gate · none of it contacts a database, and production is named nowhere', () => {
  for (const path of TOUCHED) {
    const source = stripComments(read(path));
    assert.ok(!source.includes('supabase'), `${path} must not reach the client`);
    assert.ok(!source.includes('.rpc('), `${path} must not call an RPC`);
    assert.ok(
      !source.includes('avkighsiufeefyycbebf'),
      `${path} must never name the production project`
    );
  }
  // And the flow's one writer still goes through the data layer it always did.
  assert.match(read('screens/PostJobScreen.tsx'), /await createJob\(user\.id, jobInput\)/);
});

test('gate · the payment-holding mechanism is protection, never escrow', () => {
  for (const path of TOUCHED) {
    assert.equal(
      /escrow/i.test(read(path)),
      false,
      `${path} must say "held in protection" — escrow is a claim BRAZOS does not make`
    );
  }
});

// RUN H2 IS THE LATER RUN. This gate used to assert the opposite of what it
// asserts now — that hero_armchair_customer_light.png was staged on disk and
// mounted by NOTHING — and it was right to, for as long as the file was an
// unused asset sitting in the tree. H2 mounts it as light's hero, so the gate
// is INVERTED rather than deleted: the condition it was holding open has been
// met, and what protects the asset from here is that it stays mounted in
// exactly one place, behind a palette test. Deleting it would leave the file
// with no fence at all, which is the one outcome the original was written to
// prevent.
test('gate · the staged light hero has landed: one mount, gated, on customer Home', () => {
  const staged = 'hero_armchair_customer_light';
  const dirs = ['components', 'screens', 'ui', 'lib', 'hooks', 'navigation', 'modes'];
  const referencing = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const next = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (readFileSync(join(root, next), 'utf8').includes(staged)) referencing.push(next);
    }
  };
  for (const dir of dirs) walk(dir);
  assert.deepEqual(
    referencing.map((p) => p.replace(/\\/g, '/')),
    ['screens/HomeScreen.tsx'],
    `${staged}.png is light's customer-Home hero and belongs to that screen alone`
  );

  // Mounted behind a palette test, and mounted ONCE. It is a light composition:
  // dropping it onto the dark ground is the mirror of the fault that put the
  // dark hero's own gate back on.
  const home = readFileSync(join(root, 'screens/HomeScreen.tsx'), 'utf8');
  assert.equal(
    home.split(`${staged}.png`).length - 1,
    1,
    'the light hero must be required exactly once'
  );
  assert.match(
    home.replace(/\s+/g, ' '),
    /source=\{isDark \? PRESTIGE_HERO_ART : PRESTIGE_HERO_ART_LIGHT\}/,
    'the light hero must resolve per palette, never unconditionally'
  );
});
