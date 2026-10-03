// tests/fixRunA.test.mjs — the FIX-RUN group A (money & safety) fences, 2026-10-03.
//
// Each test names its item in docs/dispatch/FIX-RUN.md. Source tests, like the rest of the
// suite: they read the files and pin the shapes that make each fix true, so a later edit that
// quietly undoes one goes red here with the item's name on it.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const code = (path) => flat(stripComments(read(path)));

test('A10 · "payout on its way" says what it waits for; the tip opens once the payment reaches the worker; the worker is nudged at the hire', () => {
  // A10a: the tip waits for the transfer, and the screen says why — and names the wait when it is
  // the worker's own payout setup.
  const review = code('screens/ReviewAndTipScreen.tsx');
  assert.match(
    review,
    /: !released \? \( <Text style=\{styles\.cardNote\}> A tip can be added once the job payment reaches \{workerName \?\? 'the worker'\}\. Yours is approved and on its way — if they haven’t set up payouts yet, it lands the moment they do\. <\/Text> \)/
  );
  assert.doesNotMatch(review, /The job payment releases first/);

  // The customer's job page: the eyebrow stays, and a note under the figure says what "on its
  // way" waits for — card path only (the sandbox releases on approval), never a "paid" claim.
  const detail = code('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /\? 'APPROVED · PAYOUT ON ITS WAY' : 'PAYMENT'\} <\/Text> <MoneyText cents=\{customerChargeCents\(payment\)\} state=\{payment\.status\} \/> (?:\{\} )?\{stripe && releaseRequested \? \( <Text style=\{styles\.paymentNote\}> The payment reaches \{workerFirstName\} once their payout account is ready — it shows as released when the transfer lands\. If they haven’t set up payouts yet, their job screen asks them to\. <\/Text> \) : null\}/);
  assert.doesNotMatch(detail, /paymentsMode !== 'sandbox'/, 'stripe is never locked out by a sandbox-only gate (D18)');

  // The worker's job page: a nudge to set up payouts from the hire onwards, before any payment
  // row exists — card path only, gone once enabled, and never beside the held-row PayoutNudge.
  const worker = code('screens/WorkerJobScreen.tsx');
  assert.match(
    worker,
    /\{live && paymentsMode === 'stripe' && payouts !== null && payouts !== 'enabled' && !waitingOnSetup \? \( <Pressable onPress=\{\(\) => navigateAcrossTabs\('Profile', 'Payouts', \{\}\)\}/
  );
  assert.match(worker, /<Text style=\{styles\.linkRowText\}>Set up payouts so the payment can reach you<\/Text>/);
  // The held-row rule is untouched: payoutSetupNotice stays the ONE derivation of "waiting on setup".
  assert.match(worker, /const waitingOnSetup = payment \? payoutSetupNotice\(payouts, \[payment\]\) !== null : false;/);
});
