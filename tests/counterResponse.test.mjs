import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/offers.ts EXECUTED for its pure chain/expiry helpers: the supabase
// client and the profiles column list are stubbed — nothing exercised below
// touches either.
const offersModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/offers.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;')
    .replace(
      /import \{ PUBLIC_PROFILE_COLUMNS[^}]*\} from '\.\/profiles';/,
      "const PUBLIC_PROFILE_COLUMNS = 'id';"
    )
    // The ceiling only gates the RPC writers, which nothing here calls; its
    // real behavior is executed in tests/moneyCeiling.test.mjs.
    .replace(
      /import \{ moneyCeilingError \} from '\.\/validation';/,
      'const moneyCeilingError = () => null;'
    )
    // Same for the location-shape guard — executed in
    // tests/locationPrivacy.test.mjs.
    .replace(
      /import \{ coordinateLocationError \} from '\.\/locationPrivacy';/,
      'const coordinateLocationError = () => null;'
    )
    // R7C's funnel emitter, on the RPC writers only. Stubbed for the same
    // reason as the rest: the analytics module reaches config/env, which bare
    // Node ESM cannot resolve, and nothing exercised here emits anything.
    .replace(
      /import \{ track \} from '\.\/observability\/analytics';/,
      'const track = () => {};'
    );
  assert.match(stubbed, /const supabase = null;/, 'the supabase import must be stubbed');
  assert.match(stubbed, /const track = \(\) => \{\};/, 'the analytics import must be stubbed');
  assert.match(
    stubbed,
    /const PUBLIC_PROFILE_COLUMNS = 'id';/,
    'the profiles import must be stubbed'
  );
  return import(toDataUrl(stubbed));
})();

// ---------------------------------------------------------------------------
// AUD-P1-01 · the pending revision is not "my bid" — it is whoever wrote it
// ---------------------------------------------------------------------------
//
// After a customer counter, the chain's pending row still carries
// worker_id = the worker, but author_id = the customer and awaiting_id = the
// worker. Rendering "Your bid" + Withdraw off worker_id alone is the defect
// that deadlocked every marketplace counter: the worker saw the customer's
// amount as their own, and their one action (withdraw) is author-only, so
// the server refused it.

test('the worker job detail derives whose-terms/whose-move from author_id and awaiting_id', async () => {
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));

  assert.match(detail, /activeBid\.author_id === user\.id/);
  assert.match(detail, /activeBid\.awaiting_id === user\.id/);

  // The three server actions are wired for the respond state, and the counter
  // goes through the ONE canonical offer form.
  assert.match(detail, /acceptOffer\(activeBid\.id\)/);
  assert.match(detail, /declineOffer\(activeBid\.id\)/);
  assert.match(detail, /kind: 'counter'/);

  // Every action lands back in the canonical re-read — including refusals —
  // so a stale card is replaced by the server's truth.
  assert.match(detail, /const refreshMyOffer = useCallback/);
  const refusalReReads = [...detail.matchAll(/await refreshMyOffer\(\)/g)];
  assert.ok(
    refusalReReads.length >= 3,
    'accept/decline/withdraw paths must re-read canonical state after acting'
  );
});

test('withdraw renders only for the pending revision the viewer authored', async () => {
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));

  // The respond card (viewer owes the reply) sits between viewerOwesResponse
  // and the authored branch; Withdraw must not appear inside it.
  const respondStart = detail.indexOf('viewerOwesResponse ? (');
  const authoredStart = detail.indexOf(') : viewerAuthoredBid ? (');
  assert.ok(
    respondStart > 0 && authoredStart > respondStart,
    'the respond card must precede the authored card'
  );
  const respondCard = detail.slice(respondStart, authoredStart);
  assert.doesNotMatch(
    respondCard,
    /Withdraw/,
    'the counterparty’s pending revision must never offer Withdraw — it is author-only'
  );
  // And the respond card carries the three decisions plus attribution.
  // Both now come from the ONE shared actionable card (components/
  // OfferResponseActions.tsx over lib/offerCopy.ts), so Chat and Job Detail
  // cannot offer different labels for the same negotiation; attribution is by
  // first name since the phase62 copy change.
  assert.match(respondCard, /<OfferResponseActions/);
  assert.match(respondCard, /senderFirstName=\{posterFirstName\}/);
  assert.match(respondCard, /onAccept=\{\(\) => setConfirmResponse\('accept'\)\}/);
  assert.match(respondCard, /onCounter=/);
  assert.match(respondCard, /onDecline=\{\(\) => setConfirmResponse\('decline'\)\}/);
  // The superseded per-screen labels must not come back.
  assert.doesNotMatch(respondCard, /Accept for /);
  assert.doesNotMatch(respondCard, /Decline counter-offer/);

  // The authored card keeps Withdraw, and names counters as counters.
  const afterAuthored = detail.slice(authoredStart);
  assert.match(afterAuthored, /Withdraw bid/);
  assert.match(
    afterAuthored,
    /activeBid\.parent_offer_id \? 'Your counter-offer' : 'Your bid'/
  );
});

test('settled chains render with no actions: only a pending row is actionable', async () => {
  const offers = stripComments(await read('lib/offers.ts'));
  // fetchMyOfferForJob returns ONLY the live pending revision — accepted,
  // declined, superseded, withdrawn and expired rows come back null, so no
  // card can offer actions on a settled chain.
  const fetchBlock = offers.slice(
    offers.indexOf('export async function fetchMyOfferForJob'),
    offers.indexOf('export async function fetchOfferChain')
  );
  assert.match(fetchBlock, /\.eq\('status', 'pending'\)/);

  const { effectiveOfferStatus, isOfferLapsed } = await offersModule;
  const now = Date.parse('2026-08-11T12:00:00Z');
  // A lapsed pending row renders as expired before any RPC touches it…
  assert.equal(
    effectiveOfferStatus(
      { status: 'pending', expires_at: '2026-08-10T12:00:00Z' },
      now
    ),
    'expired'
  );
  assert.equal(
    isOfferLapsed({ status: 'pending', expires_at: '2026-08-10T12:00:00Z' }, now),
    true
  );
  // …while a live one, or a pre-phase50 never-expires row, stays pending.
  assert.equal(
    effectiveOfferStatus(
      { status: 'pending', expires_at: '2026-08-12T12:00:00Z' },
      now
    ),
    'pending'
  );
  assert.equal(
    effectiveOfferStatus({ status: 'pending', expires_at: null }, now),
    'pending'
  );
  // Settled statuses pass through untouched, whatever the deadline says.
  for (const status of ['accepted', 'declined', 'superseded', 'withdrawn', 'expired']) {
    assert.equal(
      effectiveOfferStatus({ status, expires_at: '2026-08-10T12:00:00Z' }, now),
      status
    );
  }
});

test('countersRemaining counts the caller’s real revisions, not a cached number', async () => {
  const { countersRemaining, MAX_COUNTERS_PER_SIDE } = await offersModule;
  assert.equal(MAX_COUNTERS_PER_SIDE, 10);

  const chain = [
    { author_id: 'worker', parent_offer_id: null }, // the root bid is free
    { author_id: 'customer', parent_offer_id: 'a' },
    { author_id: 'worker', parent_offer_id: 'b' },
    { author_id: 'customer', parent_offer_id: 'c' },
  ];
  // Per side, independently: the worker has spent one of ten, the customer two.
  assert.equal(countersRemaining(chain, 'worker'), 9);
  assert.equal(countersRemaining(chain, 'customer'), 8);
  assert.equal(countersRemaining([], 'worker'), 10);
  // A third party in the same chain has spent nothing of their own.
  assert.equal(countersRemaining(chain, 'someone-else'), 10);
});

// ---------------------------------------------------------------------------
// Discoverability: the existing surfaces, keyed correctly
// ---------------------------------------------------------------------------

test('the inbox badge keys every chain by its thread, marketplace bids included', async () => {
  const inbox = stripComments(await read('screens/MessagesInboxScreen.tsx'));

  // Since phase61 a marketplace bid posts a root message into the pair's
  // direct thread, so my_pending_offers() resolves direct_thread_id for it and
  // it keys through the SAME branch a direct offer does.
  assert.match(inbox, /byThread\.add\(`job:\$\{r\.thread_job_id\}`\)/);
  assert.match(inbox, /byThread\.add\(`direct:\$\{r\.direct_thread_id\}`\)/);
  assert.match(inbox, /const awaitingRequest = pendingByThread\.has\(key\);/);

  // The counterparty-keyed fallback existed only because those ids were NULL.
  // phase61 removes the cause, so the workaround must not survive it —
  // a second badge source is a second thing to drift.
  assert.doesNotMatch(inbox, /pendingByCounterparty/);
  assert.doesNotMatch(inbox, /byCounterparty/);

  // The original defect shape — keying a null thread id into the row-key
  // namespace as `direct:null` — must not come back either.
  assert.doesNotMatch(
    inbox,
    /r\.thread_job_id \? `job:\$\{r\.thread_job_id\}` : `direct:\$\{r\.direct_thread_id\}`/
  );
});

test('the hub’s pending-offer card reads a counter awaiting the user as requiring a response', async () => {
  const hub = stripComments(await read('screens/MyJobsHubScreen.tsx'));

  assert.match(hub, /effectiveOfferStatus\(bid\) === 'pending'/);
  assert.match(hub, /bid\.awaiting_id === user\.id/);
  assert.match(hub, /bid\.author_id !== user\.id/);
  assert.match(hub, /sent you a Counteroffer — respond/);
  assert.match(hub, /'Their counter:'/);
  // It routes to the response surface (the worker job detail), same as before.
  assert.match(hub, /navigation\.navigate\('JobDetail', \{ job \}\)/);
});

// ---------------------------------------------------------------------------
// phase59 — the additive counter notification (NOT applied by this suite)
// ---------------------------------------------------------------------------

test('phase59 is idempotent, marketplace-scoped, and grants what it creates', async () => {
  const sql = await read('supabase/archive/phases/phase59_staging_counter_notification.sql');

  assert.match(sql, /create or replace function public\.notify_on_offer_counter\(\)/);
  assert.match(sql, /drop trigger if exists job_offers_notify_counter on public\.job_offers;/);
  // Counters only, marketplace only — direct-offer counters already notify
  // through their thread message.
  assert.match(sql, /new\.parent_offer_id is null/);
  assert.match(sql, /new\.offer_type <> 'marketplace_bid'/);
  // Through the existing pipeline with a dedupe key; never a second
  // bid_received (the shim harness pins zero of those per counter).
  assert.match(sql, /public\.enqueue_notification\(/);
  assert.match(sql, /'offer_countered:' \|\| new\.id::text/);
  assert.doesNotMatch(sql, /'bid_received'/);
  // The trigger function is sealed; the sentinel is granted (phase32 lesson).
  assert.match(
    sql,
    /revoke all on function public\.notify_on_offer_counter\(\) from public, anon, authenticated;/
  );
  assert.match(
    sql,
    /grant execute on function public\.counter_notification_enabled\(\) to authenticated;/
  );

  // And verify-schema knows the sentinel, so only a green verify counts as
  // applied.
  const verify = await read('scripts/verify-schema.mjs');
  assert.match(verify, /phase59_staging_counter_notification\.sql/);
  assert.match(verify, /counter_notification_enabled/);
});
