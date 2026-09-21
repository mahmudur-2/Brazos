import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// n5 (2026-09-04) — the first session, pinned so it cannot creep back
// ---------------------------------------------------------------------------
//
// Raw-text assertions on the comment-stripped source, in the tests/copyTruth
// style: the new truth pinned present and the old one pinned absent, so a
// later edit that restores the old shape fails here rather than on a device.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (path) => stripComments(read(path));

/** Every self-closing `<AuthButton … />` in a source slice, in order, as its raw props text. */
function authButtons(source) {
  return [...source.matchAll(/<AuthButton\b([\s\S]*?)\/>/g)].map((match) => match[1]);
}

// ---------------------------------------------------------------------------
// STEP 1 — Welcome's order. Phone sign-up resolves to `disabled` outside
// development (lib/phoneAuth/mode.ts), and from 2026-09-04 that put the email
// route first. 2026-09-21, ON THE OPERATOR'S RULING from the shipped screen
// (DECISIONS 19: "make Continue with phone the top one"), PHONE LEADS — the
// design's lead action, lit, carrying the rim light — and email is the second
// option with nothing hidden; the phone screen carries the switched-off notice
// and "Use Email Instead" until SMS is provisioned. Sign-in is unchanged.
// ---------------------------------------------------------------------------

test('n5 · Welcome leads with Continue with phone (the operator\'s ruling); email stays second; sign-in unchanged', () => {
  const welcome = code('screens/WelcomeScreen.tsx');
  const actionsAt = welcome.indexOf('styles.actions');
  assert.ok(actionsAt > -1, 'the Welcome actions block is gone');
  const buttons = authButtons(welcome.slice(actionsAt));
  assert.equal(buttons.length, 3, 'the actions block holds exactly three AuthButtons');

  // FIRST: phone, primary treatment, to CreateAccount — the operator's ruling.
  assert.match(buttons[0], /title="Continue with phone"/);
  assert.match(buttons[0], /navigation\.navigate\('CreateAccount'\)/);
  assert.match(buttons[0], /accessibilityHint="Create an account with your phone number"/);
  assert.match(buttons[0], /\bthemed\b/);
  assert.doesNotMatch(buttons[0], /variant=/, 'the phone button is the primary treatment');

  // SECOND: email, still present, primary treatment, to the registered EmailCreateAccount route.
  assert.match(buttons[1], /title="Continue with email"/);
  assert.match(buttons[1], /navigation\.navigate\('EmailCreateAccount'\)/);
  assert.match(buttons[1], /accessibilityHint="Create an account with your email"/);
  assert.match(buttons[1], /\bthemed\b/);
  assert.doesNotMatch(buttons[1], /variant=/, 'the email button is neither hidden nor demoted');

  // THIRD: unchanged.
  assert.match(buttons[2], /title="I already have an account"/);
  assert.match(buttons[2], /variant="ghost"/);
  assert.match(buttons[2], /navigation\.navigate\('SignIn'\)/);

  // The route the first button names is a registered signed-out route.
  assert.match(code('screens/AuthFlow.tsx'), /<Stack\.Screen name="EmailCreateAccount"/);
  assert.match(code('lib/navigation.ts'), /EmailCreateAccount: undefined;/);
});

// ---------------------------------------------------------------------------
// STEP 3 — the launch overlay lasts exactly as long as session restore. The
// 1120 ms / 700 ms visibility floor is gone; the exit starts when the host's
// `sessionReady` turns true. The one timer left is the crossfade failsafe,
// whose delay is derived, never a literal number of milliseconds.
// ---------------------------------------------------------------------------

test('n5 · the launch overlay has no visibility floor: the exit starts on sessionReady alone', () => {
  const launch = code('screens/LaunchScreen.tsx');
  assert.doesNotMatch(launch, /MIN_VISIBLE|floorReached|setFloorReached/);

  // Exactly one setTimeout, and it is the crossfade failsafe with a derived delay.
  assert.equal((launch.match(/setTimeout\(/g) ?? []).length, 1, 'one timer: the crossfade failsafe');
  assert.match(launch, /const failsafe = setTimeout\(release, duration \+ EXIT_GRACE_MS\);/);
  assert.doesNotMatch(launch, /setTimeout\([^)]*,\s*\d+\s*\)/, 'no timer with a literal-millisecond delay');

  // The exit condition is the session and nothing else.
  assert.match(launch, /if \(!sessionReady \|\| exitStarted\.current\) return;/);
  assert.match(launch, /\}, \[sessionReady, still, exit, onFinish\]\);/);
  // The entrance still plays, and the host still hands over the session flag.
  assert.match(launch, /fade\(logo, LOGO_DELAY, 400\)/);
  assert.match(code('App.tsx'), /sessionReady=\{!loading\}/);
});

// ---------------------------------------------------------------------------
// STEP 6 — VoiceOver names for the rating stars and the bare back chevron
// (docs/BACKLOG.md). Accessibility props only: the testID the Maestro walk
// taps stays, and the labelled "Back to …" variant is unchanged.
// ---------------------------------------------------------------------------

test('n5 · every rating star is a named button carrying its selected state, and the bare back chevron is named "Back"', () => {
  const stars = code('components/StarRating.tsx');
  const pressableAt = stars.indexOf('<Pressable');
  assert.ok(pressableAt > -1, 'the star Pressable is gone');
  const pressable = stars.slice(pressableAt, stars.indexOf('</Pressable>', pressableAt));
  assert.match(pressable, /testID=\{`review-star-\$\{star\}`\}/, 'the Maestro walk taps the stars by testID — it stays');
  assert.match(pressable, /accessibilityRole="button"/);
  assert.match(pressable, /accessibilityLabel=\{`\$\{star\} \$\{star === 1 \? 'star' : 'stars'\}`\}/);
  assert.match(pressable, /accessibilityState=\{\{ selected: filled \}\}/);
  assert.match(stars, /const filled = star <= value;/, 'selected means at or below the current value');

  const header = code('components/ScreenHeader.tsx');
  const backAt = header.indexOf('const backControl = onBack ?');
  assert.ok(backAt > -1, 'the back control is gone');
  const back = header.slice(backAt, header.indexOf('const rightControl', backAt));
  assert.match(back, /accessibilityRole="button"/, 'the chevron is a button with or without a label');
  assert.match(back, /accessibilityLabel=\{backLabel \? `Back to \$\{backLabel\}` : 'Back'\}/);
  assert.doesNotMatch(back, /accessibilityRole=\{backLabel \?/, 'the role no longer depends on the label');
  assert.doesNotMatch(back, /`Back to \$\{backLabel\}` : undefined/, 'the bare chevron is never unnamed');
});
