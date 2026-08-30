import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(join(root, path), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// lib/paymentRules.ts EXECUTED directly (R6a, D24): it carries no runtime
// import, so nothing has to be stubbed — canOfferJobFunding and the state
// helpers are pure. (Before R6a they lived in lib/payments.ts and had to be
// loaded through a data URL with the supabase client stubbed out.)
const rulesUrl = pathToFileURL(join(root, 'lib/paymentRules.ts')).href;
const { canOfferJobFunding, isHeld, isReleased, isReleaseRequested } = await import(rulesUrl);

// ---------------------------------------------------------------------------
// AUD-P1-02 · the funding-CTA predicate, exhaustively
// ---------------------------------------------------------------------------
//
// A wrong answer here is a stranded worker (false negative) or a checkout
// over money that already moved (false positive — the double-charge line).
// Every payment state the enum can produce is classified explicitly; the
// predicate is a whitelist, so a state nobody thought about answers NO.

const OWNER = 'user-owner';
const WORKER = 'user-worker';
const fundableJob = (status) => ({
  client_id: OWNER,
  status,
  assigned_worker_id: WORKER,
});

const NOW = Date.parse('2026-08-29T12:00:00Z');
const HOUR = 3_600_000;

test('funding is offered exactly on {assigned,in_progress,completed} × {no ledger, authorized, unfunded-in-window}', () => {
  const OFFER = [
    null,
    { status: 'authorized' },
    // D9: the row create-payment mints before the sheet opens. A customer who
    // closes the sheet must have a way back to checkout.
    { status: 'unfunded' },
    { status: 'unfunded', funding_due_at: new Date(NOW + 23 * HOUR).toISOString() },
  ];
  const NEVER = [
    { status: 'held' },
    { status: 'released' },
    { status: 'paid_out' },
    { status: 'refunded' },
    { status: 'partially_refunded' },
    { status: 'pending' }, // the legacy pre-repo label nothing writes
    { status: 'not-a-real-state' }, // whitelist: the unknown answers NO
    { status: 'failed' }, // active-row reads exclude these; if one is
    { status: 'voided' }, //   passed anyway, the answer is still NO
    // D9: a lapsed window is never extended — a charge into it would be
    // voided and refunded. Refused.
    { status: 'unfunded', funding_due_at: new Date(NOW - HOUR).toISOString() },
  ];

  let asserted = 0;
  for (const status of ['assigned', 'in_progress', 'completed']) {
    for (const payment of OFFER) {
      assert.equal(
        canOfferJobFunding({ viewerId: OWNER, job: fundableJob(status), payment, nowMs: NOW }),
        true,
        `${status} + ${payment ? payment.status : 'no ledger'} must offer funding — this combination stranding is AUD-P1-02`
      );
      asserted++;
    }
    for (const payment of NEVER) {
      assert.equal(
        canOfferJobFunding({ viewerId: OWNER, job: fundableJob(status), payment, nowMs: NOW }),
        false,
        `${status} + ${payment.status}${payment.funding_due_at ? ' (lapsed)' : ''} must NEVER offer checkout — money moved, lapsed, or unclassifiable`
      );
      asserted++;
    }
  }
  // Anti-vacuity: the whole matrix genuinely ran.
  assert.equal(asserted, 3 * (OFFER.length + NEVER.length));
});

test('D9 · an unfunded row is offered inside its funding window and refused past it', () => {
  const at = (funding_due_at, nowMs) =>
    canOfferJobFunding({
      viewerId: OWNER,
      job: fundableJob('assigned'),
      payment: { status: 'unfunded', funding_due_at },
      nowMs,
    });
  const due = new Date(NOW + 24 * HOUR).toISOString();
  assert.equal(at(due, NOW), true, 'inside the window: checkout is offered');
  assert.equal(at(due, NOW + 24 * HOUR - 1), true, 'one millisecond before the window closes');
  assert.equal(at(due, NOW + 24 * HOUR), false, 'at the deadline the window is closed');
  assert.equal(at(due, NOW + 25 * HOUR), false, 'past the deadline — never invite a payment into a lapsed row');
  // No recorded window is not a lapsed window; a window this client cannot
  // parse is refused rather than trusted.
  assert.equal(at(null, NOW), true);
  assert.equal(at(undefined, NOW), true);
  assert.equal(at('not-a-date', NOW), false);
  // held, released and refunded stay refused whatever the clock says.
  for (const status of ['held', 'released', 'refunded']) {
    assert.equal(
      canOfferJobFunding({
        viewerId: OWNER,
        job: fundableJob('completed'),
        payment: { status, funding_due_at: due },
        nowMs: NOW,
      }),
      false,
      `${status} must never offer checkout`
    );
  }
  // The default clock is the real one: a window a day out is open right now.
  assert.equal(at(new Date(Date.now() + 24 * HOUR).toISOString(), undefined), true);
});

test('funding is never offered outside the fundable statuses or to the wrong viewer', () => {
  for (const status of ['open', 'draft', 'cancelled', 'something_else']) {
    assert.equal(
      canOfferJobFunding({ viewerId: OWNER, job: fundableJob(status), payment: null }),
      false,
      `status ${status} must not offer funding — the server would refuse the authorize`
    );
  }

  // Only the job's owner (the payer) may fund — a stranger never does.
  assert.equal(
    canOfferJobFunding({ viewerId: WORKER, job: fundableJob('assigned'), payment: null }),
    false,
    'the worker must never be offered the customer’s checkout'
  );
  assert.equal(
    canOfferJobFunding({ viewerId: 'user-stranger', job: fundableJob('assigned'), payment: { status: 'unfunded' } }),
    false,
    'a stranger is never offered checkout, unfunded row or not'
  );
  assert.equal(
    canOfferJobFunding({ viewerId: null, job: fundableJob('assigned'), payment: null }),
    false
  );

  // No accepted assignment -> nothing to fund (mirrors the RPC's guard).
  assert.equal(
    canOfferJobFunding({
      viewerId: OWNER,
      job: { client_id: OWNER, status: 'assigned', assigned_worker_id: null },
      payment: null,
    }),
    false,
    'a job with no assigned worker has no accepted offer to fund'
  );

  // An open dispute freezes money movement — no funding offer under it.
  assert.equal(
    canOfferJobFunding({
      viewerId: OWNER,
      job: fundableJob('completed'),
      payment: null,
      hasOpenDispute: true,
    }),
    false,
    'an open issue report must suppress the funding offer'
  );
});

test('the state helpers read the ledger literally, and isReleased is never widened by a request', () => {
  assert.equal(isHeld({ status: 'held' }), true);
  assert.equal(isHeld({ status: 'released' }), false);
  assert.equal(isReleased({ status: 'released' }), true);
  assert.equal(isReleased({ status: 'paid_out' }), true);
  assert.equal(isReleased({ status: 'held' }), false);
  // D23: approved, payout pending — held with a request is requested, not released.
  const requested = { status: 'held', release_requested_at: '2026-08-29T12:00:00Z' };
  assert.equal(isReleaseRequested(requested), true);
  assert.equal(isReleased(requested), false);
  assert.equal(isHeld(requested), true);
  assert.equal(isReleaseRequested({ status: 'held', release_requested_at: null }), false);
  assert.equal(isReleaseRequested({ status: 'held' }), false);
  assert.equal(isReleaseRequested({ status: 'released', release_requested_at: '2026-08-29T12:00:00Z' }), false);
});

// ---------------------------------------------------------------------------
// The surfaces render from THE one predicate — no third derivation copy
// ---------------------------------------------------------------------------

test('every funding CTA renders from canOfferJobFunding, and the replaced conditionals are gone', async () => {
  const [clientDetail, approve, rules, payments] = await Promise.all([
    read('screens/ClientJobDetailScreen.tsx').then(stripComments),
    read('screens/ApproveOrDisputeScreen.tsx').then(stripComments),
    read('lib/paymentRules.ts'),
    read('lib/payments.ts'),
  ]);

  // The predicate lives in the pure module and is re-exported unchanged.
  assert.match(rules, /export function canOfferJobFunding/);
  assert.match(payments, /export \{[^}]*canOfferJobFunding[^}]*\} from '\.\/paymentRules';/s);
  assert.doesNotMatch(stripComments(payments), /function canOfferJobFunding/);

  for (const [name, src] of [
    ['ClientJobDetailScreen', clientDetail],
    ['ApproveOrDisputeScreen', approve],
  ]) {
    assert.match(
      src,
      /canOfferJobFunding\(\{/,
      `${name} must derive its funding CTA from the one predicate`
    );
    assert.match(
      src,
      /Protect payment in checkout/,
      `${name} must carry the funding CTA`
    );
  }

  // The old assigned-only fork is deleted, not shadowed: the CTA must not be
  // gated on a hand-written status equality anywhere near a Checkout push.
  // (The accept flow also navigates to Checkout much earlier in the file, so
  // the end anchor is the first push AFTER the CTA block begins.)
  const ctaStart = clientDetail.indexOf('canFundNow ? (');
  const ctaEnd = clientDetail.indexOf("navigate('Checkout'", ctaStart);
  assert.ok(ctaStart > 0 && ctaEnd > ctaStart, 'the canFundNow-driven CTA block must exist');
  const ctaBlock = clientDetail.slice(ctaStart, ctaEnd);
  assert.doesNotMatch(
    ctaBlock,
    /job\.status\s*===\s*'assigned'\s*\?/,
    'the funding CTA must not re-fork on status — that fork is the AUD-P1-02 defect'
  );

  // The completed branch never routes checkout from inside `payment ?` — an
  // unheld row is the predicate's job, and "Finish checkout" nested behind
  // the payment fork is exactly the dead pattern that stranded null ledgers.
  const completedBlock = clientDetail.slice(
    clientDetail.indexOf("job.status === 'completed' ?")
  );
  assert.ok(completedBlock.length > 0);
  assert.doesNotMatch(completedBlock, /Finish checkout/);

  // ApproveOrDispute's dead end now forks on the predicate too.
  assert.match(approve, /payment && !canFundNow \?/);
});

test('a missing ledger is not presented as a settled legacy payment', async () => {
  const clientDetail = stripComments(await read('screens/ClientJobDetailScreen.tsx'));
  const completedBlock = clientDetail.slice(
    clientDetail.indexOf("job.status === 'completed' ?")
  );
  // The legacy inline review renders only where NO funding path exists —
  // behind the canFundNow guard, never merely because status is completed.
  const reviewAt = completedBlock.indexOf('<ReviewSection');
  const guardAt = completedBlock.indexOf('canFundNow ? null');
  assert.ok(reviewAt > 0, 'the legacy review must still exist for the true no-path case');
  assert.ok(
    guardAt > 0 && guardAt < reviewAt,
    'the inline review must sit behind the canFundNow guard, not in front of it'
  );
});

test('the direct-offer accept routes the payer into funding', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));
  // The customer (payer) goes straight to Checkout through the guarded
  // cross-tab path; the worker's accept keeps its honest alert.
  assert.match(chat, /user\.id === request\.customer_id/);
  assert.match(chat, /navigateAcrossTabs\('MyJobs', 'Checkout', \{ job: acceptedJob \}\)/);
});

test('checkout itself admits every fundable status (the phase58 contract)', async () => {
  const checkout = stripComments(await read('screens/CheckoutScreen.tsx'));
  assert.match(
    checkout,
    /job\.status !== 'assigned' && job\.status !== 'in_progress' && job\.status !== 'completed'/,
    'CheckoutScreen must turn away only the statuses the server also refuses'
  );
});
