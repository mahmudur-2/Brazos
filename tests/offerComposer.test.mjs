import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// ---------------------------------------------------------------------------
// n5 (2026-09-04) — the take-home line: what the worker receives for the
// amount typed, from quote_job_price() and nothing else.
// ---------------------------------------------------------------------------

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

/**
 * lib/payments.ts executed for real: the supabase client stubbed to refuse
 * every call, paymentRules made absolute, and lib/jobs.ts's REAL formatBudget
 * inlined (the tests/conversion pattern) so the money string asserted is the
 * one users see. Function replacers throughout: the inlined source carries
 * `$$`, which a string replacement would rewrite.
 */
async function loadPayments() {
  const jobsJs = stripTypeScriptTypes(await read('lib/jobs.ts'), { mode: 'strip' });
  const start = jobsJs.indexOf('export function formatBudget');
  const end = jobsJs.indexOf('\n}', start);
  assert.ok(start > 0 && end > start, 'formatBudget must exist in lib/jobs.ts');
  const formatBudgetSource = jobsJs.slice(start, end + 2);

  let js = stripTypeScriptTypes(await read('lib/payments.ts'), { mode: 'strip' });
  const rulesUrl = pathToFileURL(join(root, 'lib/paymentRules.ts')).href;
  for (const [from, to] of [
    [
      "import { supabase } from './supabase';",
      "const supabase = { rpc() { throw new Error('no RPC in this test'); }, from() { throw new Error('no reads in this test'); } };",
    ],
    ["from './paymentRules';", `from '${rulesUrl}';`],
    ["import { formatBudget } from './jobs';", formatBudgetSource],
  ]) {
    assert.ok(js.includes(from), `expected the import: ${from}`);
    js = js.replace(from, () => to);
  }
  assert.ok(!/from '\.\//.test(js), 'every runtime import is stubbed, inlined or absolute');
  return import(toDataUrl(js));
}

test('n5 · workerTakeLine renders the quoted take as returned, and null for anything unknown', async () => {
  const { workerTakeLine } = await loadPayments();
  const quote = {
    job_price_cents: 5000,
    customer_fee_cents: 375,
    tax_cents: 0,
    total_cents: 5375,
    worker_fee_cents: 375,
    worker_receives_cents: 4625,
  };
  assert.equal(workerTakeLine(quote), 'You get $46.25 after the fee');
  // formatBudget's own tiers: whole dollars bare, cents to two places.
  assert.equal(workerTakeLine({ worker_receives_cents: 5000 }), 'You get $50 after the fee');
  assert.equal(workerTakeLine({ worker_receives_cents: 0 }), 'You get $0 after the fee');
  // Unknown is null, never a number.
  assert.equal(workerTakeLine(null), null);
  assert.equal(workerTakeLine(undefined), null);
  assert.equal(workerTakeLine({ worker_receives_cents: -1 }), null);
  assert.equal(workerTakeLine({ worker_receives_cents: 46.25 }), null, 'cents are integers');
  assert.equal(workerTakeLine({ worker_receives_cents: Number.NaN }), null);
});

test('n5 · the composer reads the quote through the one wrapper and does no fee arithmetic of its own', async () => {
  const composer = stripComments(await read('components/OfferComposer.tsx'));
  assert.match(
    composer,
    /import \{ quoteJobPrice, workerTakeLine, type JobPriceQuote \} from '\.\.\/lib\/payments';/
  );
  assert.match(composer, /quoteJobPrice\(quoteCents\)/);
  assert.match(composer, /workerTakeLine\(takeQuote\.quote\)/);
  // Debounced, cancelled on change and unmount; the answer is kept with the
  // amount it was asked for and rendered only while that amount stands.
  assert.match(composer, /const TAKE_LINE_DEBOUNCE_MS = 400;/);
  assert.match(composer, /setTimeout\(\(\) => \{\s*\n\s*quoteJobPrice\(quoteCents\)/);
  assert.match(composer, /clearTimeout\(timer\);/);
  assert.match(composer, /takeQuote\.cents === quoteCents/);
  // Bid context only — a customer's counter is not a worker's take — and the
  // line is a <Text> directly under the amount field.
  assert.match(composer, /<\/OfferAmountField>|editable=\{!submitting\}\s*\n\s*\/>\s*\n\s*\{isBid && takeLine \? \(\s*\n\s*<Text/);
  // No numeric literal between 0 and 1 multiplying an amount, no rate, no
  // percentage, and the figure is never operated on: the platformFee fence
  // covers the constant, this covers the composer.
  assert.doesNotMatch(composer, /\*\s*0?\.\d+\b|\b0?\.\d+\s*\*/, 'no fractional multiplier');
  assert.doesNotMatch(composer, /_bps|PLATFORM_FEE|\d+(\.\d+)?\s*%/, 'no rate or percentage');
  assert.doesNotMatch(
    composer,
    /worker_receives_cents\s*[-+*/]|[-+*/]\s*[\w.]*worker_receives_cents/,
    'the figure is shown as returned'
  );
});
