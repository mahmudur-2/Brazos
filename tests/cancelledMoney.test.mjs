import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * FIX-RUN final sweep (2026-10-03) — THE MONEY ON A CANCELLED JOB.
 *
 * cancel_job() and ban_user() direct a held card payment home by setting
 * refund_cents on the row (and transfer_cents for a late-cancel fee) while its
 * status stays `held` until charge.refunded lands. A11 made the customer's job
 * page READ that row on a cancelled job; nothing SHOWED it, and the worker's
 * page described it as "held in protection" or "approved". One predicate pair
 * in lib/paymentRules.ts, two facts in the glossary, and both screens and
 * Earnings read them. lib/paymentRules.ts and lib/earningsMath.ts carry no
 * runtime imports, so node executes them as they are.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (path) => strip(read(path)).replace(/\s+/g, ' ');

const { isRefundQueued, isCancellationFeeKept, isReleaseRequested } = await import(
  pathToFileURL(join(root, 'lib/paymentRules.ts')).href
);
const { deriveEarnings } = await import(pathToFileURL(join(root, 'lib/earningsMath.ts')).href);
const take = (r) => r.amount_cents - r.platform_fee_cents;

test('the cancellation shape: a held row with a refund queued, with or without the late-cancel fee', () => {
  // ban_user() / worker_cancelled / customer_cancelled_free: the whole charge home.
  const full = { status: 'held', refund_cents: 5375, transfer_cents: 0, release_requested_at: null };
  assert.equal(isRefundQueued(full), true);
  assert.equal(isCancellationFeeKept(full), false);
  // customer_cancelled_late: the fee travels to the worker, the rest goes home — and
  // release_requested_at is set for the fee's transfer, so the approval predicate is true too.
  const late = { status: 'held', refund_cents: 4375, transfer_cents: 1000, release_requested_at: '2026-10-03T12:00:00Z' };
  assert.equal(isRefundQueued(late), true);
  assert.equal(isCancellationFeeKept(late), true);
  assert.equal(isReleaseRequested(late), true, 'the fee shape also reads as release requested — callers ask refundQueued FIRST');
  // Not the shape: a plain held row, a null refund, and a refund already settled.
  assert.equal(isRefundQueued({ status: 'held', refund_cents: 0 }), false);
  assert.equal(isRefundQueued({ status: 'held' }), false);
  assert.equal(isRefundQueued({ status: 'held', refund_cents: null }), false);
  assert.equal(isRefundQueued({ status: 'refunded', refund_cents: 5375 }), false);
  assert.equal(isCancellationFeeKept({ status: 'held', refund_cents: 0, transfer_cents: 1000 }), false);
});

test('Earnings never counts a refund going home as pending — only the fee that still travels', () => {
  const base = { id: 'p', job_id: 'j', platform_fee_cents: 0, job_title: 'x' };
  assert.equal(deriveEarnings([{ ...base, status: 'held', amount_cents: 10000 }], take).pendingCents, 10000, 'a plain held row is pending');
  assert.equal(
    deriveEarnings([{ ...base, status: 'held', amount_cents: 10000, refund_cents: 10750, transfer_cents: 0 }], take).pendingCents,
    0,
    'a full refund queued is nothing pending'
  );
  assert.equal(
    deriveEarnings([{ ...base, status: 'held', amount_cents: 10000, refund_cents: 9750, transfer_cents: 1000 }], take).pendingCents,
    1000,
    'a late cancellation pends the fee alone'
  );
  assert.equal(
    deriveEarnings([{ ...base, status: 'held', amount_cents: 10000, refund_cents: null }], take).pendingCents,
    10000,
    'a null refund is no refund'
  );
});

test('[static] the predicates are re-exported, and both job screens and MoneyText read them', () => {
  assert.match(read('lib/payments.ts'), /export \{[^}]*isCancellationFeeKept[^}]*isRefundQueued[^}]*\} from '\.\/paymentRules';/s);

  const money = code('ui/primitives/MoneyText.tsx');
  // Codex R8-A1: the fee's sent fact and the payout fact ride beside feeKept.
  assert.match(money, /refundQueued, feeKept, feeSent, payoutOnItsWay, tip, counterpartFirstName \}, perspective/);

  // The customer's page: the cancelled branch shows the money, and the failed-read banner reaches it.
  const detail = code('screens/ClientJobDetailScreen.tsx');
  const cancelled = detail.slice(detail.indexOf("job.status === 'cancelled' ?"));
  // Pack 1, Codex R5-A4: the card shows cancelledPayment, the active row or else a failed or voided
  // row whose refund failed or was arranged (payment ?? refundIssue).
  assert.match(cancelled, /statusReadError \? \( statusReadBanner \) : cancelledPayment \? \(/, 'a failed read on a cancelled job says so');
  assert.match(detail, /const cancelledPayment = payment \?\? refundIssue;/);
  assert.match(
    cancelled,
    /<MoneyText cents=\{customerChargeCents\(cancelledPayment\)\} state=\{cancelledPayment\.status\} refundQueued=\{isRefundQueued\(cancelledPayment\)\} feeKept=\{isCancellationFeeKept\(cancelledPayment\)\} refundFailed=\{isRefundFailed\(cancelledPayment\)\} refundArranged=\{isRefundArranged\(cancelledPayment\)\} counterpartFirstName=\{workerFirstName\} \/>/,
    'the cancelled job shows its payment through the two facts (and, pack 1, the refund failure and its arrangement)'
  );
  assert.match(detail, /const statusReadBanner = \(/, 'one banner element, used on the live job and the cancelled one');
  assert.equal((detail.match(/statusReadBanner/g) ?? []).length, 3, 'defined once, rendered twice');

  // The worker's page: the facts reach the caption, the note names the cancellation first, and
  // neither the gold eyebrow nor the "held" breakdown describes a refund going home.
  const worker = code('screens/WorkerJobScreen.tsx');
  // Codex R8-A1: then the payout fact and the fee's sent fact.
  // A2-M5 4d-1: a cancelled job still held for review draws no take at all (tests/a2m5Repairs.test.mjs).
  assert.match(worker, /refundQueued=\{isRefundQueued\(payment\)\} feeKept=\{isCancellationFeeKept\(payment\)\} payoutOnItsWay=\{isPayoutOnItsWay\(payment\)\} feeSent=\{!!payment\.released_at\} \/> \)\}/);
  const note = worker.slice(worker.indexOf("if (lifecycle === 'cancelled') {"));
  assert.ok(note.indexOf('isCancellationFeeKept(payment)') < note.indexOf('isReleased(payment)'), 'the cancelled branch comes before every live sentence');
  assert.match(note, /This job was cancelled late\. The cancellation fee is on its way to you; the rest goes back to \$\{clientName\}\./);
  assert.match(note, /This job was cancelled\. \$\{clientName\}’s payment goes back to them\./);
  assert.match(worker, /isHeld\(payment\) && !isRefundQueued\(payment\) && !isReleaseRequested\(payment\) && !isReleased\(payment\) && styles\.eyebrowGold/);
  assert.match(worker, /\(\(isHeld\(payment\) && !isRefundQueued\(payment\)\) \|\| isReleased\(payment\)\)/);
  // The payout nudge names what still travels: the fee on a late cancellation, the take otherwise.
  // Codex R8-A1: through the card's own figure (workerReceivesCents), so a fee row whose refund landed
  // (partially_refunded) names the fee too; executed in tests/earnings.test.mjs.
  assert.match(worker, /<PayoutNudge cents=\{workerReceivesCents\(\{ \.\.\.payment, job_status: job\.status \}, workerTakeCents\)\}/);
  assert.equal(
    (worker.match(/workerReceivesCents\(\{ \.\.\.payment, job_status: job\.status \}, workerTakeCents\)/g) ?? []).length,
    2,
    'the card figure and the nudge: one expression'
  );
});
