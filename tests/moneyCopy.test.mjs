import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * C4 (FIX-RUN 2026-10-03) — the money glossary and its one copy table,
 * executed. lib/moneyCopy.ts has no runtime imports, so node runs it as is.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const {
  FEE_NAME,
  HELD_IN_PROTECTION,
  PAY_AND_PROTECT,
  PAYMENT_STATE_WORDS,
  paymentCaption,
  paymentEyebrow,
} = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);

// The union, read off lib/payments.ts — a new status fails here until it has words.
const union = read('lib/payments.ts').match(/export type PaymentStatus =([\s\S]*?);/)[1];
const STATUSES = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const SETTLED = ['released', 'paid_out'];
// An honest negation ("Not paid yet") is not a claim.
const PAID = /(?<!not )\bpaid\b|received|sent to/i;

test('C4 · the glossary: one fee name, one held state, one action, one eyebrow', () => {
  assert.equal(FEE_NAME, 'Protection fee');
  assert.equal(HELD_IN_PROTECTION, 'Held in protection');
  assert.equal(PAY_AND_PROTECT, 'Pay & protect');
  assert.equal(paymentEyebrow(false), 'PAYMENT');
  assert.equal(paymentEyebrow(true), 'PAYMENT · TEST MODE');
  assert.deepEqual(Object.keys(PAYMENT_STATE_WORDS).sort(), [...STATUSES].sort());
  assert.ok(STATUSES.length >= 9, 'the union is real');
});

test('C4 · every state × viewer has a caption, and none says paid or received before release', () => {
  const variants = [
    {},
    { releaseRequested: true },
    { releaseRequested: true, waitingOnPayoutSetup: true },
    { issueOpen: true },
    { tip: true },
    { counterpartFirstName: 'Sam' },
    // The cancellation shape (final sweep): a refund queued, with or without the late-cancel fee.
    { refundQueued: true },
    { refundQueued: true, feeKept: true },
    { refundQueued: true, feeKept: true, releaseRequested: true, counterpartFirstName: 'Sam' },
  ];
  for (const status of STATUSES) {
    for (const viewer of ['customer', 'worker']) {
      for (const extra of variants) {
        const line = paymentCaption({ status, ...extra }, viewer);
        assert.ok(typeof line === 'string' && line.length > 0, `${status}/${viewer} ${JSON.stringify(extra)} has a caption`);
        if (!SETTLED.includes(status)) {
          assert.doesNotMatch(line, PAID, `${status}/${viewer} ${JSON.stringify(extra)} must not claim money moved: ${line}`);
        }
      }
    }
    assert.doesNotMatch(PAYMENT_STATE_WORDS[status], SETTLED.includes(status) ? /^$/ : PAID);
  }
  // An unknown status gets no caption — allow-listed, never guessed.
  assert.equal(paymentCaption({ status: 'mystery' }, 'customer'), null);
});

test('C4 · the table says the right thing for the states that matter most', () => {
  assert.equal(paymentCaption({ status: 'held' }, 'customer'), 'Held in protection — released when you approve');
  assert.equal(paymentCaption({ status: 'held' }, 'worker'), 'Held in protection — yours when the customer approves');
  // D23: approval outranks the protection sentence, and the dispute sentence.
  assert.equal(paymentCaption({ status: 'held', releaseRequested: true, counterpartFirstName: 'Sam' }, 'customer'), 'Approved — on its way to Sam');
  assert.equal(paymentCaption({ status: 'held', releaseRequested: true }, 'customer'), 'Approved — on its way to your worker');
  assert.equal(paymentCaption({ status: 'held', releaseRequested: true }, 'worker'), 'Approved — on its way to you');
  assert.equal(paymentCaption({ status: 'held', releaseRequested: true, waitingOnPayoutSetup: true }, 'worker'), 'Approved — waiting on your payout setup');
  assert.equal(paymentCaption({ status: 'held', issueOpen: true }, 'customer'), 'Held — you reported an issue');
  assert.equal(paymentCaption({ status: 'held', issueOpen: true }, 'worker'), 'Held — the customer reported an issue');
  // Settled: the customer's figure is their charge, the worker's their take.
  assert.equal(paymentCaption({ status: 'released' }, 'customer'), 'Paid');
  assert.equal(paymentCaption({ status: 'released' }, 'worker'), 'You received');
  // Tips.
  assert.equal(paymentCaption({ status: 'held', tip: true }, 'customer'), 'Tip held in protection');
  assert.equal(paymentCaption({ status: 'released', tip: true, counterpartFirstName: 'Sam' }, 'customer'), 'Tip sent to Sam');
  assert.equal(paymentCaption({ status: 'released', tip: true }, 'worker'), 'Tip received');
  // A whitespace name falls back rather than printing "to  ".
  assert.equal(paymentCaption({ status: 'held', releaseRequested: true, counterpartFirstName: '  ' }, 'customer'), 'Approved — on its way to your worker');
  // The cancellation shape (final sweep): a refund queued on a held row is money going home — it
  // outranks the protection sentence, the issue sentence AND the approval one (the late-cancel fee
  // sets release_requested_at too, and a fee is not an approval of finished work).
  assert.equal(paymentCaption({ status: 'held', refundQueued: true }, 'customer'), 'Refund on its way — back on your card in a few days');
  assert.equal(paymentCaption({ status: 'held', refundQueued: true }, 'worker'), 'Refund on its way to the customer');
  assert.equal(paymentCaption({ status: 'held', refundQueued: true, issueOpen: true }, 'customer'), 'Refund on its way — back on your card in a few days');
  assert.equal(
    paymentCaption({ status: 'held', refundQueued: true, feeKept: true, releaseRequested: true, counterpartFirstName: 'Sam' }, 'customer'),
    'Partly refunded — the cancellation fee goes to Sam'
  );
  assert.equal(paymentCaption({ status: 'held', refundQueued: true, feeKept: true, releaseRequested: true }, 'worker'), 'Cancellation fee — on its way to you');
  // Off a held row the facts say nothing: a settled refund keeps its own words.
  assert.equal(paymentCaption({ status: 'refunded', refundQueued: true }, 'customer'), 'Refunded');
});

test('[static] C4 · MoneyText and StatusPill hold no money words of their own; the screens use the glossary', () => {
  const pill = stripComments(read('ui/primitives/StatusPill.tsx'));
  assert.match(pill, /PAYMENT_LABELS: Record<PaymentStatus, string> = PAYMENT_STATE_WORDS;/);
  const money = stripComments(read('ui/primitives/MoneyText.tsx'));
  assert.doesNotMatch(money, /'(Paid|You received|Held|Released|Refunded|Not paid)/);
  // One eyebrow over every payment amount on the money screens.
  for (const file of [
    'screens/WorkerJobScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/ApproveOrDisputeScreen.tsx',
    'screens/ReviewAndTipScreen.tsx',
  ]) {
    const code = stripComments(read(file));
    assert.match(code, /paymentEyebrow\(/, `${file} uses the one eyebrow`);
    assert.doesNotMatch(code, /'(HELD PAYMENT|PROTECTED PAYMENT|PAYMENT PROTECTED|PAYMENT RELEASED|APPROVED · [A-Z ]+|TEST MODE — NO REAL MONEY)/, `${file} spells a state eyebrow`);
  }
  // One fee name and one action word on Checkout.
  const checkout = stripComments(read('screens/CheckoutScreen.tsx'));
  assert.doesNotMatch(checkout, /Platform fee|Authorize & protect|Finish protecting/);
  assert.match(checkout, /\{FEE_NAME\}/);
  // The customer's amounts are their charge — never the bare agreed price under a payment caption.
  for (const file of ['screens/CheckoutScreen.tsx', 'screens/ReviewAndTipScreen.tsx']) {
    assert.doesNotMatch(read(file), /<MoneyText cents=\{payment\.amount_cents\}/, `${file} shows the charge`);
  }
});
