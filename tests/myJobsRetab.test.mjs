import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * Stage 4D batch 1a — My Jobs mode purity and the Active/Review/Closed retab.
 *
 * What must stay true:
 *   1. The hub's perspective comes from ModeContext — never a hand-passed
 *      prop — and worker mode renders NO posting affordance: no "You posted"
 *      section, no "Post another job" control, no draft card.
 *   2. The tabs are Active / Review / Closed, bucketed through
 *      lib/jobLifecycle.ts (deriveJobLifecycle -> deriveMyJobsTab) — the
 *      screen keeps no local status-to-tab table (P3-31: one derivation).
 *   3. Every card's primary label is the derived next-action line
 *      (myJobsNextAction / the bid-fact helper); "View details" is secondary.
 *   4. The bucketing facts arrive as ONE batched query each (payments,
 *      open disputes, own reviews, settled bids) — never one per row.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const hub = await read('screens/MyJobsHubScreen.tsx');
const hubHook = await read('hooks/useMyJobsHub.ts');
const hubCode = stripComments(hub);
const card = await read('components/HubCard.tsx');

test('the tabs are Active / Review / Closed, derived through lib/jobLifecycle', () => {
  assert.match(hub, /\{ label: 'Active', value: 'active' \}/);
  assert.match(hub, /\{ label: 'Review', value: 'review' \}/);
  assert.match(hub, /\{ label: 'Closed', value: 'closed' \}/);
  assert.match(hubCode, /deriveMyJobsTab\(lifecycleOf\(j\)\) === filter/);
  assert.match(hubCode, /deriveJobLifecycle\(/);
  // The old local status table must not survive as a second derivation.
  assert.doesNotMatch(hubCode, /function matchesFilter/);
  assert.doesNotMatch(hubCode, /status === 'open' \|\| status === 'assigned'/);
});

test('perspective is ModeContext, and worker mode has no posting affordance', () => {
  assert.match(hubCode, /const \{ mode \} = useMode\(\)/);
  assert.match(hubCode, /const isCustomer = mode === 'customer'/);
  // The screen must not accept its perspective from outside: it takes no
  // props at all, so a hand-passed mode is structurally impossible.
  assert.match(hubCode, /export function MyJobsHubScreen\(\) \{/);
  // Posting affordances render only for customers: the empty-state CTA and
  // the resume-draft card are inside isCustomer gates. 2026-09-28 (LUX-LIST-64
  // #44): every "Post another job" left the screen — the list foot's pill and
  // the Active CTA — so the one button left is the empty-state "Post a job",
  // for an account with no jobs and no draft at all, and it is the GATE that
  // is asserted.
  assert.doesNotMatch(hubCode, /Post another job/);
  assert.match(
    hubCode,
    /\{isCustomer && posted\.length === 0 && !draft \? \(\s*<Pressable\s+onPress=\{openPostJob\}/,
    'the empty-state "Post a job" must be customer-gated'
  );
  const gateCount = [...hubCode.matchAll(/isCustomer \?/g)].length;
  assert.ok(gateCount >= 2, 'the perspective gates must stay');
  assert.match(hubCode, /const showDraft = isCustomer && filter === 'active'/);
  // Posted jobs render only in customer mode; accepted work and bids only in
  // worker mode.
  assert.match(hubCode, /isCustomer \? posted\.filter/);
  assert.match(hubCode, /isCustomer \? \[\] : working\.filter/);
  assert.match(hubCode, /!isCustomer && filter === 'active'/);
  assert.match(hubCode, /!isCustomer && filter === 'closed'/);
});

test('every card carries a derived next-action as its primary label', () => {
  // Jobs derive through the one lifecycle helper, with the release deadline.
  assert.match(hubCode, /nextAction=\{myJobsNextAction\(\{/);
  assert.match(hubCode, /releaseDeadline: releaseDeadlineMs\(job\)/);
  // Bids derive from offer facts in exactly one local helper.
  assert.match(hubCode, /function bidNextAction\(/);
  assert.match(hubCode, /nextAction=\{bidNextAction\(/);
  // The card renders it as primary, demoting View details to secondary.
  assert.match(card, /nextAction\?: string/);
  assert.match(card, /styles\.nextActionText/);
  assert.match(card, /detailsSecondary/);
});

test('the bucketing facts are batched reads, one query per fact', async () => {
  assert.match(hubHook, /fetchJobPaymentStatusesByJobIds\(jobIds\)/);
  assert.match(hubHook, /fetchOpenDisputeJobIds\(jobIds\)/);
  assert.match(hubHook, /fetchMyReviewedJobIds\(user\.id, jobIds\)/);
  assert.match(hubHook, /fetchSettledOffersByWorker\(user\.id\)/);
  // The per-job RPC (job_payment_state) must not be called in a loop here.
  assert.doesNotMatch(hubHook, /fetchJobPaymentState\b/);

  // And the batch functions are genuinely single queries over id lists.
  const payments = stripComments(await read('lib/payments.ts'));
  assert.match(payments, /\.in\('job_id', jobIds\)/);
  const disputes = stripComments(await read('lib/disputes.ts'));
  assert.match(disputes, /\.in\('job_id', jobIds\)\s*\.eq\('status', 'open'\)/);
  const reviews = stripComments(await read('lib/reviews.ts'));
  assert.match(reviews, /\.eq\('reviewer_id', reviewerId\)\s*\.in\('job_id', jobIds\)/);
});

test('settled bids are declined/expired only — chain internals stay hidden', async () => {
  const offers = stripComments(await read('lib/offers.ts'));
  assert.match(offers, /\.in\('status', \['declined', 'expired'\]\)/);
  // A lapsed pending row renders as expired through the one status rule.
  assert.match(hubCode, /effectiveOfferStatus\(bid, nowMs\) === 'expired'/);
});
