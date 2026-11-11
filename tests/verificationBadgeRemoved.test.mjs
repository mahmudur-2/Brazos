import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Comments legitimately use the word ("verified against live data",
// "device-verified entry point"); the contract is about what a USER can be
// shown, so only post-strip code and string content is asserted on.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// Stage 4D-B: the verification badge is removed from every user-visible
// surface. It rendered "Verified" only when profiles.verification_status ===
// 'verified' — a value no migration in this repository ever writes and the
// app cannot write — so every profile read "Not verified" permanently: a
// distrust signal on 100% of workers carrying zero information.
// ---------------------------------------------------------------------------

/**
 * The formerly locked screens (01–07 + Home) are excluded from the USER-COPY
 * assertion EXPLICITLY, so the exclusion is visible here rather than silent.
 * The one known hit behind this list is screens/WelcomeScreen.tsx's
 * "Verified workers" marketing line — an operator item, not something this
 * suite may edit around.
 */
const LOCKED_SCREENS = [
  'screens/LaunchScreen.tsx',
  'screens/WelcomeScreen.tsx',
  'screens/SignInScreen.tsx',
  'screens/EmailSignInScreen.tsx',
  'screens/CreateAccountScreen.tsx',
  'screens/EmailCreateAccountScreen.tsx',
  'screens/VerifyPhoneScreen.tsx',
  'screens/SetupScreen.tsx',
  'screens/LegalGateScreen.tsx',
  'screens/HomeScreen.tsx',
];

const SCAN_DIRS = ['screens', 'components', 'ui', 'hooks', 'lib', 'modes', 'navigation'];

function appFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    for (const entry of readdirSync(join(root, dir), { recursive: true })) {
      const rel = `${dir}/${String(entry).replace(/\\/g, '/')}`;
      if (!/\.(ts|tsx)$/.test(rel)) continue;
      // lib/legal/ carries the background-check disclosure VERBATIM — it is
      // asserted on its own literal below and must never be edited to satisfy
      // a word scan.
      if (rel.startsWith('lib/legal/')) continue;
      files.push(rel);
    }
  }
  return files;
}

test('the badge component is gone and nothing references it — locked files included', () => {
  assert.ok(!existsSync(join(root, 'components/VerificationBadge.tsx')));

  const files = appFiles();
  assert.ok(files.length > 50, `the scan must actually walk the tree (saw ${files.length})`);

  // NO allow-list here: any file importing the deleted component would be a
  // stranded import, so this holds for every file or the removal was wrong.
  for (const file of files) {
    const src = read(file);
    assert.ok(!src.includes('VerificationBadge'), `${file} still references VerificationBadge`);
    assert.ok(!src.includes('isVerified'), `${file} still references isVerified`);
  }
});

test('no user-visible "Verified" / "Unverified" / "Not verified" copy outside locked screens', () => {
  const banned = /\bVerified\b|\bUnverified\b|\bNot verified\b/;
  for (const file of appFiles()) {
    if (LOCKED_SCREENS.includes(file)) continue;
    const code = stripComments(read(file));
    const hit = code.match(banned);
    assert.ok(hit === null, `${file} still emits "${hit?.[0]}"`);
  }
});

test('verification_status no longer feeds any client projection or type', () => {
  const profiles = read('lib/profiles.ts');
  assert.doesNotMatch(profiles, /verification_status/);
  assert.doesNotMatch(profiles, /isVerified/);

  const search = read('lib/workerSearch.ts');
  assert.doesNotMatch(search, /verification_status|verificationStatus/);
});

test('the background-check disclosure in lib/legal/ is untouched', () => {
  const terms = read('lib/legal/termsOfService.ts');
  assert.match(
    terms,
    /BRAZOS DOES NOT PERFORM BACKGROUND CHECKS, CRIMINAL RECORD CHECKS, IDENTITY\s+VERIFICATION, REFERENCE CHECKS, LICENSE VERIFICATION, OR INSURANCE\s+VERIFICATION ON ANY USER/
  );
});
