// Pack 1, F2: a refund the provider reports as failed is not money that reached the customer.
// The database side is proven in supabase/tests/426_refund_failed.sql; this file executes the two
// pure parts the app and the drain read (the caption table, the predicate, the drain's verdict on a
// refund answered 2xx with status failed or canceled) and pins the wiring as text: the webhook
// subscribes refund.failed, MoneyText passes the fact through, and the customer's cancelled-job card
// reads it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { settlementVerdict } from '../supabase/functions/process-settlements/classify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = (path) => strip(read(path)).replace(/\s+/g, ' ');

const { paymentCaption } = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);
const { isRefundFailed } = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);

const FAILED_CAPTION = 'Refund didn’t go through — Brazos will arrange it';

test('F2 · the drain: a refund answered 2xx with status failed or canceled stops; any other status is sent', () => {
  for (const status of ['failed', 'canceled']) {
    const v = settlementVerdict('refund', { status: 200, body: { id: 're_1', object: 'refund', amount: 750, status } });
    assert.equal(v.result, 'refused', `${status}: refused`);
    assert.equal(v.next, 'stop', `${status}: the row stops and shows in payment_attention`);
    assert.equal(v.ref, null, `${status}: no refund is written back as sent`);
    assert.match(v.message, new RegExp(`re_1 ${status}`), `${status}: the message names the refund and its status`);
  }
  for (const status of ['pending', 'succeeded', 'requires_action', undefined]) {
    const v = settlementVerdict('refund', { status: 200, body: { id: 're_2', object: 'refund', amount: 750, status } });
    assert.equal(v.result, 'sent', `${String(status)}: sent (control)`);
    assert.equal(v.ref, 're_2');
  }
  // A transfer has no refund status: unchanged.
  const t = settlementVerdict('transfer', { status: 200, body: { id: 'tr_1', amount: 750, status: 'failed' } });
  assert.equal(t.result, 'sent', 'a transfer is read as before (control)');
});

test('F2 · the predicate: a queued refund the provider failed', () => {
  const held = { status: 'held', refund_cents: 5375 };
  assert.equal(isRefundFailed({ ...held, refund_failed_at: '2026-11-15T10:00:00Z' }), true);
  assert.equal(isRefundFailed({ ...held, refund_failed_at: null }), false, 'no failure recorded');
  assert.equal(isRefundFailed(held), false, 'an older row without the column');
  assert.equal(isRefundFailed({ status: 'refunded', refund_cents: 5375, refund_failed_at: '2026-11-15T10:00:00Z' }), false,
    'refunded again by hand after the failure: the status speaks');
  assert.equal(isRefundFailed({ status: 'held', refund_cents: 0, refund_failed_at: '2026-11-15T10:00:00Z' }), false,
    'no refund queued');
});

test('F2 · the caption: the customer is never told the money is on its way to their card after a failure', () => {
  assert.equal(paymentCaption({ status: 'held', refundQueued: true, refundFailed: true }, 'customer'), FAILED_CAPTION);
  assert.equal(
    paymentCaption({ status: 'held', refundQueued: true, feeKept: true, refundFailed: true, counterpartFirstName: 'Sam' }, 'customer'),
    FAILED_CAPTION,
    'the fee variant too'
  );
  // The worker's own money is not touched by the customer's refund: their sentences stay.
  assert.equal(paymentCaption({ status: 'held', refundQueued: true, refundFailed: true }, 'worker'), 'Refund on its way to the customer');
  assert.equal(paymentCaption({ status: 'held', refundQueued: true, feeKept: true, refundFailed: true }, 'worker'), 'Cancellation fee — on its way to you');
  // Controls: no failure, the sentences as before; the status speaks for every other state.
  assert.equal(paymentCaption({ status: 'held', refundQueued: true }, 'customer'), 'Refund on its way — back on your card in a few days');
  assert.equal(paymentCaption({ status: 'refunded', refundQueued: true, refundFailed: true }, 'customer'), 'Refunded');
  assert.equal(paymentCaption({ status: 'released', refundFailed: true }, 'customer'), 'Paid');
  assert.equal(paymentCaption({ status: 'voided', refundFailed: true }, 'customer'), 'Payment cancelled — nothing was charged');
});

test('F2 · [static] the webhook subscribes refund.failed; MoneyText and the cancelled-job card carry the fact', () => {
  const webhook = read('supabase/functions/stripe-webhook/index.ts');
  const handled = [...webhook.match(/HANDLED_EVENTS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(handled.includes('refund.failed'), 'refund.failed is subscribed');

  const money = code('ui/primitives/MoneyText.tsx');
  assert.match(money, /waitingOnPayoutSetup, refundFailed, refundQueued, feeKept, tip, counterpartFirstName \}, perspective/);

  const detail = code('screens/ClientJobDetailScreen.tsx');
  const cancelled = detail.slice(detail.indexOf("job.status === 'cancelled' ?"));
  assert.match(cancelled, /refundFailed=\{isRefundFailed\(payment\)\}/, 'the cancelled job passes the failure to the caption');
  const note = detail.slice(detail.indexOf('const cancelledMoneyNote = (() => {'));
  const failedAt = note.indexOf('if (isRefundFailed(payment))');
  assert.ok(failedAt > -1 && failedAt < note.indexOf('if (isCancellationFeeKept(payment))'), 'the failure is asked first');
  assert.match(note, /The cancellation fee goes to \$\{workerFirstName\}\. The refund of the rest to your card didn’t go through; Brazos will arrange it another way\./);
  assert.match(note, /'The refund to your card didn’t go through\. Brazos will arrange it another way\.'/);
  assert.match(read('lib/payments.ts'), /refund_failed_at\?: string \| null;/, 'the Payment type carries the column');
});
