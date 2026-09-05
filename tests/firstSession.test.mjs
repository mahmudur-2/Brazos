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
// STEP 1 — Welcome leads with the path that works in the shipped build.
// Phone sign-up resolves to `disabled` outside development
// (lib/phoneAuth/mode.ts), so the email route is the first button; phone stays
// as the second option with nothing hidden; sign-in is unchanged.
// ---------------------------------------------------------------------------

test('n5 · Welcome leads with Continue with email; phone stays second; sign-in unchanged', () => {
  const welcome = code('screens/WelcomeScreen.tsx');
  const actionsAt = welcome.indexOf('styles.actions');
  assert.ok(actionsAt > -1, 'the Welcome actions block is gone');
  const buttons = authButtons(welcome.slice(actionsAt));
  assert.equal(buttons.length, 3, 'the actions block holds exactly three AuthButtons');

  // FIRST: email, primary treatment, to the registered EmailCreateAccount route.
  assert.match(buttons[0], /title="Continue with email"/);
  assert.match(buttons[0], /navigation\.navigate\('EmailCreateAccount'\)/);
  assert.match(buttons[0], /accessibilityHint="Create an account with your email"/);
  assert.match(buttons[0], /\bthemed\b/);
  assert.doesNotMatch(buttons[0], /variant=/, 'the email button is the primary treatment');

  // SECOND: phone, still present, same treatment as before, still to CreateAccount.
  assert.match(buttons[1], /title="Continue with phone"/);
  assert.match(buttons[1], /navigation\.navigate\('CreateAccount'\)/);
  assert.match(buttons[1], /accessibilityHint="Create an account with your phone number"/);
  assert.match(buttons[1], /\bthemed\b/);
  assert.doesNotMatch(buttons[1], /variant=/, 'the phone button is neither hidden nor demoted');

  // THIRD: unchanged.
  assert.match(buttons[2], /title="I already have an account"/);
  assert.match(buttons[2], /variant="ghost"/);
  assert.match(buttons[2], /navigation\.navigate\('SignIn'\)/);

  // The route the first button names is a registered signed-out route.
  assert.match(code('screens/AuthFlow.tsx'), /<Stack\.Screen name="EmailCreateAccount"/);
  assert.match(code('lib/navigation.ts'), /EmailCreateAccount: undefined;/);
});
