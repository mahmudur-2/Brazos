import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// FIX-RUN B16 (2026-10-03) — the smaller session gaps.
//   · Setup is no longer remembered on the device alone (tests/setupOnboarding).
//   · The payment sheet can come back from a bank's 3-D Secure page.
//   · A ban is re-checked when the app comes forward, not only at sign-in.
//   · Messaging a deleted account says so instead of offering a composer.
// Phone numbers stay unverified: that needs an SMS service (operator).
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('B16 · both payment sheets carry the app-scheme return URL, and the link handler hands it back', () => {
  const boundary = stripComments(read('lib/payments/stripe.ts'));
  assert.match(boundary, /export const STRIPE_RETURN_URL = 'brazos:\/\/stripe-redirect';/);
  assert.equal((boundary.match(/returnURL: STRIPE_RETURN_URL,/g) ?? []).length, 2, 'the card sheet and the save-a-card sheet');
  assert.match(boundary, /if \(!url\.startsWith\(STRIPE_RETURN_URL\) \|\| !stripe\?\.handleURLCallback\) return false;/);
  assert.match(boundary, /return await stripe\.handleURLCallback\(url\);/);
  // Still cards only (D8): the sheet is never asked for a wallet.
  assert.doesNotMatch(boundary, /applePay/);
  // The scheme the URL names is the app's own.
  assert.match(read('app.config.ts'), /scheme: 'brazos',/);

  const app = stripComments(read('App.tsx'));
  assert.match(app, /if \(url\.startsWith\(STRIPE_RETURN_URL\)\) \{\s*void handleStripeUrl\(url\);\s*return;\s*\}/);
  // Before the recovery link and the app links, so nothing else claims it.
  assert.ok(app.indexOf('handleStripeUrl(url)') < app.indexOf('parseRecoveryLink(url)'));
});

test('B16 · a ban is re-checked when the app comes to the front, at most once per ten minutes', () => {
  const auth = stripComments(read('lib/AuthContext.tsx'));
  assert.match(auth, /const BAN_RECHECK_MS = 10 \* 60 \* 1000;/);
  assert.match(auth, /if \(state === 'active' && Date\.now\(\) - lastCheck >= BAN_RECHECK_MS\) void check\(\);/);
  assert.match(auth, /lastCheck = Date\.now\(\);\s*const \{ data: banned \} = await fetchCurrentUserBanned\(userId\);/);
  // The listener goes with the signed-in user.
  assert.match(auth, /return \(\) => \{\s*active = false;\s*subscription\.remove\(\);\s*\};\s*\}, \[session\?\.user\?\.id\]\);/);
});

test('B16 · a deleted account gets a notice in place of the composer', () => {
  const chat = stripComments(read('screens/ChatScreen.tsx'));
  assert.match(chat, /const counterpartyDeleted = isTombstonedName\(counterparty\?\.full_name\);/);
  assert.match(chat, /const isBlocked = relation\.blocking \|\| relation\.blockedBy \|\| counterpartyDeleted;/);
  assert.match(chat, /\{counterpartyDeleted\s*\?\s*'This account was deleted\. You can’t send messages here\.'/);
});
