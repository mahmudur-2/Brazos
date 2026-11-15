// Pack 1, F2: a refund the provider reports as failed is not money that reached the customer.
// The database side is proven in supabase/tests/426_refund_failed.sql; this file executes the two
// pure parts the app and the drain read (the caption table, the predicate, the drain's verdict on a
// refund answered 2xx with status failed or canceled) and pins the wiring as text: the webhook
// subscribes refund.failed, MoneyText passes the fact through, and both customer cards read it.
// Codex round 3 (direction A): the status no longer moves on a failure, so the fact is
// refund_failed_at itself, on a held, refunded or partially_refunded row alike (R3-A8).
// Codex round 4 (R4-A5): refund_failed_at alone, whatever refund_cents says; the customer's failure
// sentence comes before every tip and status sentence, on every customer card. P3: after the owner
// records the arrangement (refund_arranged_at), the customer reads that it was refunded another way.
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
const { isRefundArranged, isRefundFailed } = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);

const FAILED_CAPTION = 'Refund didn’t go through — Brazos will arrange it';
const ARRANGED_CAPTION = 'Refunded another way';
const ARRANGED_NOTE = 'The refund to your card didn’t go through, so Brazos refunded you another way.';

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

test('F2 · the predicate: a refund the provider failed, whatever the status it left', () => {
  const held = { status: 'held', refund_cents: 5375 };
  assert.equal(isRefundFailed({ ...held, refund_failed_at: '2026-11-15T10:00:00Z' }), true);
  assert.equal(isRefundFailed({ ...held, refund_failed_at: null }), false, 'no failure recorded');
  assert.equal(isRefundFailed(held), false, 'an older row without the column');
  // R3: the status stays refunded or partially_refunded after a failure; refund_failed_at clears
  // only when the owner records the arrangement (resolve_refund_failure).
  for (const status of ['refunded', 'partially_refunded']) {
    assert.equal(isRefundFailed({ status, refund_cents: 5375, refund_failed_at: '2026-11-15T10:00:00Z' }), true,
      `${status}: the failure still shows`);
    assert.equal(isRefundFailed({ status, refund_cents: 5375, refund_failed_at: null }), false, `${status}: the arrangement recorded`);
  }
  // R4-A5: a failure whose charge.refunded never came can leave refund_cents empty; it still shows.
  assert.equal(isRefundFailed({ status: 'held', refund_cents: 0, refund_failed_at: '2026-11-15T10:00:00Z' }), true,
    'no refund queued by the app: the failure still shows');
  assert.equal(isRefundFailed({ status: 'released', refund_failed_at: '2026-11-15T10:00:00Z' }), true, 'refund_cents absent');
});

test('P3 · the predicate: arranged only while no failure waits', () => {
  const at = '2026-11-15T10:00:00Z';
  assert.equal(isRefundArranged({ refund_failed_at: null, refund_arranged_at: at }), true, 'the owner recorded the arrangement');
  assert.equal(isRefundArranged({ refund_failed_at: at, refund_arranged_at: at }), false, 'a new failure since: failed wins');
  assert.equal(isRefundArranged({ refund_failed_at: null, refund_arranged_at: null }), false, 'nothing arranged');
  assert.equal(isRefundArranged({}), false, 'an older row without the columns');
  assert.equal(isRefundFailed({ refund_failed_at: at, refund_arranged_at: at }), true, 'and the failure shows again');
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
  // R3-A8: a refunded or partially_refunded row whose refund failed is never "Refunded" to the customer.
  assert.equal(paymentCaption({ status: 'refunded', refundFailed: true }, 'customer'), FAILED_CAPTION);
  assert.equal(paymentCaption({ status: 'partially_refunded', refundFailed: true }, 'customer'), FAILED_CAPTION);
  assert.equal(paymentCaption({ status: 'refunded', refundFailed: true }, 'worker'), 'Refunded to the customer');
  // Controls: no failure, the sentences as before; the status speaks for every other state.
  assert.equal(paymentCaption({ status: 'held', refundQueued: true }, 'customer'), 'Refund on its way — back on your card in a few days');
  assert.equal(paymentCaption({ status: 'refunded' }, 'customer'), 'Refunded');
  assert.equal(paymentCaption({ status: 'partially_refunded' }, 'customer'), 'Partly refunded');
  // R4-A5: no status condition: a released or voided row whose refund failed says so too.
  assert.equal(paymentCaption({ status: 'released', refundFailed: true }, 'customer'), FAILED_CAPTION);
  assert.equal(paymentCaption({ status: 'voided', refundFailed: true }, 'customer'), FAILED_CAPTION);
  assert.equal(paymentCaption({ status: 'released' }, 'customer'), 'Paid', 'control: no failure');
  // R4-A5: a tip: the failure comes before the tip sentences; the worker's tip sentences stay.
  for (const status of ['held', 'released', 'refunded']) {
    assert.equal(paymentCaption({ status, tip: true, refundFailed: true, counterpartFirstName: 'Sam' }, 'customer'), FAILED_CAPTION,
      `a ${status} tip`);
  }
  assert.equal(paymentCaption({ status: 'held', tip: true, refundFailed: true, counterpartFirstName: 'Ann' }, 'worker'), 'Tip from Ann — on its way');
  assert.equal(paymentCaption({ status: 'held', tip: true, counterpartFirstName: 'Sam' }, 'customer'), 'Tip on its way to Sam', 'control');
});

test('P3 · the caption: refunded another way, for the customer only; a new failure wins', () => {
  for (const status of ['held', 'refunded', 'partially_refunded', 'released', 'voided']) {
    assert.equal(paymentCaption({ status, refundArranged: true }, 'customer'), ARRANGED_CAPTION, `${status}: the customer`);
    assert.equal(paymentCaption({ status, refundFailed: true }, 'customer'), FAILED_CAPTION, `${status}: the failure`);
    const worker = paymentCaption({ status, refundArranged: true }, 'worker');
    assert.equal(worker, paymentCaption({ status }, 'worker'), `${status}: the worker reads their own sentence`);
    assert.notEqual(worker, ARRANGED_CAPTION);
    assert.notEqual(paymentCaption({ status, refundFailed: true }, 'worker'), FAILED_CAPTION, `${status}: the worker never reads the failure`);
  }
  assert.equal(paymentCaption({ status: 'held', tip: true, refundArranged: true, counterpartFirstName: 'Sam' }, 'customer'), ARRANGED_CAPTION,
    'a tip too, before its tip sentence');
  assert.equal(paymentCaption({ status: 'held', refundQueued: true, feeKept: true, refundArranged: true }, 'customer'), ARRANGED_CAPTION,
    'before the cancellation sentences');
  assert.equal(paymentCaption({ status: 'refunded', refundFailed: true, refundArranged: true }, 'customer'), FAILED_CAPTION, 'failed wins');
});

test('F2 · [static] the webhook subscribes refund.failed; MoneyText and the cancelled-job card carry the fact', () => {
  const webhook = read('supabase/functions/stripe-webhook/index.ts');
  const handled = [...webhook.match(/HANDLED_EVENTS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(handled.includes('refund.failed'), 'refund.failed is subscribed');

  const money = code('ui/primitives/MoneyText.tsx');
  assert.match(money, /waitingOnPayoutSetup, refundFailed, refundArranged, refundQueued, feeKept, tip, counterpartFirstName \}, perspective/);

  const detail = code('screens/ClientJobDetailScreen.tsx');
  // R3-A8: the main payment card (a job that is not cancelled, a refund resolved for the customer)
  // passes both refund facts too.
  const main = detail.slice(detail.lastIndexOf('<MoneyText', detail.indexOf('releaseRequested={releaseRequested}')));
  const card = main.slice(0, main.indexOf('/>'));
  assert.match(card, /refundQueued=\{isRefundQueued\(payment\)\}/, 'the main card passes the queued refund');
  assert.match(card, /refundFailed=\{isRefundFailed\(payment\)\}/, 'the main card passes the failure');
  const note = detail.slice(detail.indexOf('const cancelledMoneyNote = (() => {'));
  const failedAt = note.indexOf('if (isRefundFailed(payment))');
  assert.ok(failedAt > -1 && failedAt < note.indexOf('if (isCancellationFeeKept(payment))'), 'the failure is asked first');
  assert.match(note, /The cancellation fee goes to \$\{workerFirstName\}\. The refund of the rest to your card didn’t go through; Brazos will arrange it another way\./);
  assert.match(note, /'The refund to your card didn’t go through\. Brazos will arrange it another way\.'/);
  assert.match(read('lib/payments.ts'), /refund_failed_at\?: string \| null;/, 'the Payment type carries the column');
  // P3: the arranged sentence comes right after the failure, before every other refund sentence.
  const arrangedAt = note.indexOf('if (isRefundArranged(payment))');
  assert.ok(arrangedAt > failedAt && arrangedAt < note.indexOf('if (isCancellationFeeKept(payment))'), 'arranged is asked second');
  assert.ok(note.slice(arrangedAt, note.indexOf('if (isCancellationFeeKept(payment))')).includes(`'${ARRANGED_NOTE}'`),
    'the arranged note, word for word');
});

test('R4-A5, P3 · [static] every customer card passes both facts; the worker card passes neither; the columns are read', () => {
  // Each customer MoneyText: the element from "<MoneyText" to its "/>".
  const cards = (path) => {
    const src = code(path);
    const out = [];
    for (let i = src.indexOf('<MoneyText'); i > -1; i = src.indexOf('<MoneyText', i + 1)) out.push(src.slice(i, src.indexOf('/>', i)));
    return out;
  };
  const customer = {
    'screens/ClientJobDetailScreen.tsx': { refundFailed: 'payment', count: 4 },
    'screens/ApproveOrDisputeScreen.tsx': { refundFailed: 'payment', count: 1 },
    'screens/CheckoutScreen.tsx': { refundFailed: 'payment', count: 1 },
    'screens/JobConfirmedScreen.tsx': { refundFailed: 'payment', count: 1 },
    'screens/ReviewAndTipScreen.tsx': { refundFailed: null, count: 2 },
  };
  for (const [path, want] of Object.entries(customer)) {
    const found = cards(path);
    assert.equal(found.length, want.count, `${path}: ${want.count} MoneyText`);
    for (const card of found) {
      const row = want.refundFailed ?? (card.includes('tip.amount_cents') ? 'tip' : 'payment');
      assert.ok(card.includes(`refundFailed={isRefundFailed(${row})}`), `${path}: a card passes refundFailed (${row})`);
      assert.ok(card.includes(`refundArranged={isRefundArranged(${row})}`), `${path}: a card passes refundArranged (${row})`);
    }
  }
  const workerCards = cards('screens/WorkerJobScreen.tsx').concat(cards('screens/EarningsScreen.tsx'));
  assert.ok(workerCards.length >= 2, 'the worker cards are found (WorkerJobScreen, EarningsScreen)');
  for (const card of workerCards) {
    assert.ok(!/refundFailed|refundArranged/.test(card), 'a worker card never carries the customer sentences');
  }
  const columns = read('lib/payments.ts').match(/const PAYMENT_COLUMNS =\s*'([^']+)'/)[1].split(', ');
  assert.ok(columns.includes('refund_failed_at') && columns.includes('refund_arranged_at'), 'PAYMENT_COLUMNS reads both columns');
  // The tip note never says the tip is on its way, or went, to the worker once its refund failed or was arranged.
  const review = code('screens/ReviewAndTipScreen.tsx');
  const tipNote = review.slice(review.indexOf('const tipDoneNote = (() => {'));
  assert.match(tipNote, /^const tipDoneNote = \(\(\) => \{ if \(!tip\) return null; const where = isRefundFailed\(tip\) \|\| isRefundArranged\(tip\) \? null : isHeld\(tip\)/);
});
