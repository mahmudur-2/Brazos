import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/payments.ts EXECUTED (the mode.test.mjs arrangement): its one value
// import (the supabase client) is stubbed out — canOfferJobFunding and the
// state helpers are pure and never touch it.
const paymentsModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/payments.ts'), { mode: 'strip' });
  const stubbed = js.replace(
    /import \{ supabase \} from '\.\/supabase';/,
    'const supabase = null;'
  );
  assert.notEqual(stubbed, js, 'the supabase import must be found and stubbed');
  return import(toDataUrl(stubbed));
})();

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

test('funding is offered exactly on {assigned,in_progress,completed} × {no ledger, authorized}', async () => {
  const { canOfferJobFunding } = await paymentsModule;

  const OFFER = [null, { status: 'authorized' }];
  const NEVER = [
    { status: 'held' },
    { status: 'released' },
    { status: 'paid_out' },
    { status: 'refunded' },
    { status: 'partially_refunded' },
    { status: 'unfunded' },
    { status: 'pending' }, // the legacy pre-repo label nothing writes
    { status: 'not-a-real-state' }, // whitelist: the unknown answers NO
    { status: 'failed' }, // active-row reads exclude these; if one is
    { status: 'voided' }, //   passed anyway, the answer is still NO
  ];

  let asserted = 0;
  for (const status of ['assigned', 'in_progress', 'completed']) {
    for (const payment of OFFER) {
      assert.equal(
        canOfferJobFunding({ viewerId: OWNER, job: fundableJob(status), payment }),
        true,
        `${status} + ${payment ? payment.status : 'no ledger'} must offer funding — this combination stranding is AUD-P1-02`
      );
      asserted++;
    }
    for (const payment of NEVER) {
      assert.equal(
        canOfferJobFunding({ viewerId: OWNER, job: fundableJob(status), payment }),
        false,
        `${status} + ${payment.status} must NEVER offer checkout — money moved or unclassifiable`
      );
      asserted++;
    }
  }
  // Anti-vacuity: the whole matrix genuinely ran.
  assert.equal(asserted, 3 * (OFFER.length + NEVER.length));
});

test('funding is never offered outside the fundable statuses or to the wrong viewer', async () => {
  const { canOfferJobFunding } = await paymentsModule;

  for (const status of ['open', 'draft', 'cancelled', 'something_else']) {
    assert.equal(
      canOfferJobFunding({ viewerId: OWNER, job: fundableJob(status), payment: null }),
      false,
      `status ${status} must not offer funding — the server would refuse the authorize`
    );
  }

  // Only the job's owner (the payer) may fund.
  assert.equal(
    canOfferJobFunding({ viewerId: WORKER, job: fundableJob('assigned'), payment: null }),
    false,
    'the worker must never be offered the customer’s checkout'
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

// ---------------------------------------------------------------------------
// The surfaces render from THE one predicate — no third derivation copy
// ---------------------------------------------------------------------------

test('every funding CTA renders from canOfferJobFunding, and the replaced conditionals are gone', async () => {
  const [clientDetail, approve, payments] = await Promise.all([
    read('screens/ClientJobDetailScreen.tsx').then(stripComments),
    read('screens/ApproveOrDisputeScreen.tsx').then(stripComments),
    read('lib/payments.ts'),
  ]);

  assert.match(payments, /export function canOfferJobFunding/);

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
