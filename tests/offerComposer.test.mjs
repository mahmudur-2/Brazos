import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 5 guards — the negotiation surface.
 *
 * What must stay true:
 *   1. OfferComposer is the ONE offer-terms form. Screens 52 (Submit Bid) and
 *      30 (Counteroffer) render it whole; the hire wizard (screen 26's entry)
 *      composes its shared amount field + validation. No screen regrows a
 *      parallel offer form.
 *   2. Every negotiation write goes through the lib/offers RPC wrappers —
 *      the composer touches no Supabase client of its own.
 *   3. Submission is double-tap safe and failure preserves entered terms.
 *   4. Withdraw and expiry (§H.2, phase50) stay wired: the client helpers
 *      exist, reads carry expires_at, and lapsed offers render as expired.
 *   5. SubmitBid/BidSent are registered in EVERY stack that mounts JobDetail
 *      — the PostJob/WorkerHomeStack registration gap (crashed on device
 *      2026-08-10, since fixed) is the navigation failure this pins down.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

test('OfferComposer is the canonical offer form for bid, counter, and hire terms', async () => {
  const [composer, submitBid, counteroffer, postJob] = await Promise.all([
    read('components/OfferComposer.tsx'),
    read('screens/SubmitBidScreen.tsx'),
    read('screens/CounterofferScreen.tsx'),
    read('screens/PostJobScreen.tsx'),
  ]);

  // The two full-form contexts.
  assert.match(submitBid, /<OfferComposer/);
  assert.match(submitBid, /kind: 'bid'/);
  assert.match(counteroffer, /<OfferComposer/);
  assert.match(counteroffer, /kind: 'counter'/);

  // The hire wizard shares the same field and the same validation rather
  // than keeping its own fork of "what is a valid offer amount".
  assert.match(postJob, /<OfferAmountField/);
  assert.match(postJob, /validateOfferAmount\(budget\)/);

  // One validation implementation, exported from the composer.
  assert.match(composer, /export function validateOfferAmount/);
  assert.match(composer, /export function OfferAmountField/);
});

test('the composer writes only through the offers RPC wrappers', async () => {
  const composer = await read('components/OfferComposer.tsx');

  assert.match(composer, /createMarketplaceOffer\(/);
  assert.match(composer, /counterOffer\(/);
  // No Supabase client of its own, no table writes, no raw RPC strings.
  assert.doesNotMatch(composer, /from ['"].*supabase['"]/);
  assert.doesNotMatch(composer, /\.from\(/);
  assert.doesNotMatch(composer, /\.rpc\(/);
});

test('submission is double-tap safe and failure preserves entered terms', async () => {
  const composer = await read('components/OfferComposer.tsx');

  // In-flight ref guard plus a disabled CTA.
  assert.match(composer, /submittingRef\.current\) return/);
  assert.match(composer, /disabled={submitting}/);
  // A failed submit alerts and returns — the fields are never reset, so the
  // user edits and retries instead of retyping.
  assert.doesNotMatch(composer, /setAmount\(''\)/);
  assert.doesNotMatch(composer, /setMessage\(''\)/);
});

test('worker job detail routes custom bids to SubmitBid instead of a second inline form', async () => {
  const detail = await read('screens/JobDetailScreen.tsx');

  assert.match(detail, /navigate\('SubmitBid', \{ job \}\)/);
  // The one inline path left is the listed-price quick bid; a revived custom
  // pitch form would need a message state feeding createMarketplaceOffer.
  assert.doesNotMatch(detail, /createMarketplaceOffer\(\{[^}]*message:\s*message\b/s);
});

test('withdraw and expiry stay wired end to end on the client', async () => {
  const offers = await read('lib/offers.ts');

  assert.match(offers, /\.rpc\('withdraw_offer'/);
  assert.match(offers, /export function isOfferLapsed/);
  assert.match(offers, /export function effectiveOfferStatus/);
  // Reads must carry the deadline or every lapse check silently passes.
  assert.match(offers, /expires_at, created_at, updated_at/);

  // The two entry points that surface withdraw.
  const [jobDetail, chat, offerCard] = await Promise.all([
    read('screens/JobDetailScreen.tsx'),
    read('screens/ChatScreen.tsx'),
    read('components/OfferCard.tsx'),
  ]);
  assert.match(jobDetail, /withdrawOffer\(/);
  assert.match(chat, /withdrawOffer\(/);
  // Thread cards offer withdraw ONLY to the pending revision's author while
  // the other side owes the reply.
  assert.match(offerCard, /offer\.author_id === currentUserId/);
  assert.match(offerCard, /offer\.awaiting_id !== currentUserId/);
});

test('SubmitBid and BidSent are registered wherever JobDetail is mounted', async () => {
  const [workerRoot, sharedStacks] = await Promise.all([
    read('navigation/WorkerRoot.tsx'),
    read('navigation/sharedStacks.tsx'),
  ]);

  // Worker Home stack.
  assert.match(workerRoot, /name="JobDetail"/);
  assert.match(workerRoot, /name="SubmitBid"/);
  assert.match(workerRoot, /name="BidSent"/);

  // MyJobs and Map both mount JobDetail; each must carry the bid routes too.
  const myJobs = sharedStacks.slice(
    sharedStacks.indexOf('function MyJobsStackNavigator'),
    sharedStacks.indexOf('function MessagesStackNavigator')
  );
  const map = sharedStacks.slice(sharedStacks.indexOf('function MapStackNavigator'));
  for (const [name, stack] of [
    ['MyJobs', myJobs],
    ['Map', map],
  ]) {
    assert.match(stack, /name="JobDetail"/, `${name} mounts JobDetail`);
    assert.match(stack, /name="SubmitBid"/, `${name} must register SubmitBid`);
    assert.match(stack, /name="BidSent"/, `${name} must register BidSent`);
  }

  // The customer hire loop lives with ClientJobDetail (MyJobs stack only).
  for (const route of ['CompareBids', 'BidDetail', 'Counteroffer', 'Checkout', 'JobConfirmed']) {
    assert.match(myJobs, new RegExp(`name="${route}"`), `MyJobs registers ${route}`);
  }
});
