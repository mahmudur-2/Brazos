// 2026-09-26 (the refresh, audit M-21) — Forgot password. The link the reset
// email sends is read by lib/passwordResetLink.ts (executed here); the sign-in
// screen asks for it without ever saying whether an account exists; the app
// opens the new-password screen only for a real recovery link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const link = await import(pathToFileURL(join(root, 'lib/passwordResetLink.ts')).href);

test('a reset link is read only when it is one: the app scheme, type=recovery, both tokens', () => {
  const good = 'brazos://reset-password#access_token=a.b.c&refresh_token=r1&expires_in=3600&type=recovery';
  assert.deepEqual(link.parseRecoveryLink(good), { accessToken: 'a.b.c', refreshToken: 'r1' });
  assert.deepEqual(
    link.parseRecoveryLink('brazos://reset-password?access_token=x&refresh_token=y&type=recovery'),
    { accessToken: 'x', refreshToken: 'y' },
    'a query string carries the same tokens'
  );
  assert.equal(link.parseRecoveryLink('brazos://reset-password#access_token=a&refresh_token=r&type=signup'), null, 'not a recovery');
  assert.equal(link.parseRecoveryLink('brazos://reset-password#access_token=a&type=recovery'), null, 'no refresh token');
  assert.equal(link.parseRecoveryLink('brazos://payouts?from=return'), null, 'another app link');
  assert.equal(link.parseRecoveryLink('https://evil.example/reset-password#access_token=a&refresh_token=r&type=recovery'), null, 'another host');
});

test('the recovery flag notifies its listeners once per change', () => {
  const seen = [];
  const stop = link.subscribeRecovery((value) => seen.push(value));
  link.setRecoveryPending(true);
  link.setRecoveryPending(true);
  link.setRecoveryPending(false);
  stop();
  link.setRecoveryPending(true);
  assert.deepEqual(seen, [true, false]);
  link.setRecoveryPending(false);
});

test('sign-in asks for the link without saying whether the account exists', () => {
  const src = read('screens/EmailSignInScreen.tsx');
  assert.match(src, /accessibilityLabel="Forgot password\?"/);
  assert.match(src, /requestPasswordReset\(trimmedEmail\)/);
  assert.match(src, /If an account uses \$\{trimmedEmail\}, a reset link is on its way/);
  assert.match(src, /secureTextEntry=\{!passwordShown\}/, 'the eye toggles only what the field renders');
});

test('the app opens the new-password screen only after a recovery link signed it in', () => {
  const app = read('App.tsx');
  assert.match(app, /const recovery = parseRecoveryLink\(url\);/);
  assert.match(app, /beginRecovery\(recovery\)[\s\S]{0,160}setRecoveryPending\(true\)/);
  assert.match(app, /if \(user && recoveryPending\) return <ResetPasswordScreen \/>;/);
  const reset = read('lib/passwordReset.ts');
  assert.match(reset, /resetPasswordForEmail\(email\.trim\(\), \{\s*redirectTo: PASSWORD_RESET_REDIRECT,/);
  assert.match(read('supabase/config.toml'), /"brazos:\/\/reset-password"/, 'the local stack allows the redirect');
});
