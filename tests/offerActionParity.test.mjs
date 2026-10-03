import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

/**
 * The offer/counteroffer repair (Fixes A-F).
 *
 * Three questions the app used to answer differently on Chat and on My Jobs
 * are now answered once each, by pure modules this file EXECUTES:
 *
 *   isOfferActionableBy()  may this viewer accept / counter / decline?
 *   offerJobTarget()       which job screen does this card open, for whom?
 *   lib/offerCopy.ts       what does an actionable card say?
 *
 * The screens are then checked by source for actually delegating to them,
 * because a rule with a second copy beside it is not a rule.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/offers.ts EXECUTED for its pure rules — the same stubbing tests/
// counterResponse.test.mjs established. Nothing exercised below touches the
// supabase client or the profiles column list.
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
  return import(toDataUrl(stubbed));
})();

// lib/offerNavigation.ts and lib/offerCopy.ts import nothing at runtime, so
// they execute as-is. That is deliberate: the two rules most likely to be
// re-implemented in JSX are the two that are directly testable.
const navModule = (async () =>
  import(
    toDataUrl(stripTypeScriptTypes(await read('lib/offerNavigation.ts'), { mode: 'strip' }))
  ))();

const copyModule = (async () =>
  import(
    toDataUrl(
      // F19: offerCopy's one import is the import-free lib/time.ts, pointed at its file.
      stripTypeScriptTypes(await read('lib/offerCopy.ts'), { mode: 'strip' }).replace(
        "from './time'",
        `from '${new URL('../lib/time.ts', import.meta.url).href}'`,
      ),
    ),
  ))();

const CUSTOMER = 'customer-1';
const WORKER = 'worker-1';
const JOB = 'job-1';

/** A chain revision. Defaults describe a live offer awaiting the WORKER. */
function offer(over = {}) {
  return {
    id: 'offer-1',
    job_id: JOB,
    offer_type: 'direct_offer',
    parent_offer_id: null,
    root_offer_id: 'offer-1',
    customer_id: CUSTOMER,
    worker_id: WORKER,
    author_id: CUSTOMER,
    awaiting_id: WORKER,
    amount_cents: 12_000,
    message: null,
    status: 'pending',
    expires_at: null,
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:00.000Z',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1-5, 13 — one actionability rule, every state, both roles
// ---------------------------------------------------------------------------

test('an incoming live job offer is actionable by its recipient', async () => {
  const { isOfferActionableBy } = await offersModule;
  // A root offer (no parent) the customer sent; the worker owes the reply.
  assert.equal(isOfferActionableBy(offer(), WORKER), true);
});

test('an incoming live counteroffer is actionable by its recipient', async () => {
  const { isOfferActionableBy } = await offersModule;
  // A counter IS a revision with a parent. The worker countered, so the
  // customer owes the reply — and worker_id is STILL the worker on that row,
  // which is exactly the field that must not decide this (AUD-P1-01).
  const counter = offer({
    id: 'offer-2',
    parent_offer_id: 'offer-1',
    author_id: WORKER,
    awaiting_id: CUSTOMER,
  });
  assert.equal(isOfferActionableBy(counter, CUSTOMER), true);
  assert.equal(isOfferActionableBy(counter, WORKER), false);
});

test('an outgoing live offer is not actionable by its sender', async () => {
  const { isOfferActionableBy } = await offersModule;
  // The customer wrote it and the worker owes the reply: the sender sees a
  // waiting state, never Accept/Counter/Decline on their own price.
  assert.equal(isOfferActionableBy(offer(), CUSTOMER), false);
  // Belt and braces: even a row that somehow named its own author as the
  // awaiting party stays non-actionable.
  assert.equal(
    isOfferActionableBy(offer({ awaiting_id: CUSTOMER, author_id: CUSTOMER }), CUSTOMER),
    false
  );
});

test('superseded, declined, withdrawn and expired offers are not actionable', async () => {
  const { isOfferActionableBy } = await offersModule;
  for (const status of ['superseded', 'declined', 'withdrawn', 'expired', 'accepted']) {
    assert.equal(
      isOfferActionableBy(offer({ status, awaiting_id: null }), WORKER),
      false,
      `${status} must offer no monetary actions`
    );
    // Even if awaiting_id were somehow still set, the status alone settles it.
    assert.equal(
      isOfferActionableBy(offer({ status }), WORKER),
      false,
      `${status} must offer no monetary actions regardless of the turn`
    );
  }
});

test('a pending offer past its deadline is treated as expired, not live', async () => {
  const { isOfferActionableBy } = await offersModule;
  const lapsed = offer({ expires_at: '2026-08-12T00:00:00.000Z' });
  const now = Date.parse('2026-08-13T00:00:00.000Z');
  assert.equal(isOfferActionableBy(lapsed, WORKER, now), false);
  // Still live an hour before it lapses.
  assert.equal(
    isOfferActionableBy(lapsed, WORKER, Date.parse('2026-08-11T23:00:00.000Z')),
    true
  );
});

test('role reversal moves the turn and nothing else', async () => {
  const { isOfferActionableBy } = await offersModule;
  // Same chain, same participants, only the author/awaiting pair flips. Both
  // sides get exactly one actionable viewer, and it is never the author.
  const customerMoved = offer({ author_id: CUSTOMER, awaiting_id: WORKER });
  const workerMoved = offer({ author_id: WORKER, awaiting_id: CUSTOMER });

  assert.equal(isOfferActionableBy(customerMoved, WORKER), true);
  assert.equal(isOfferActionableBy(customerMoved, CUSTOMER), false);
  assert.equal(isOfferActionableBy(workerMoved, CUSTOMER), true);
  assert.equal(isOfferActionableBy(workerMoved, WORKER), false);
  // A third party is never actionable in either direction.
  assert.equal(isOfferActionableBy(customerMoved, 'someone-else'), false);
  assert.equal(isOfferActionableBy(workerMoved, 'someone-else'), false);
});

test('both actionable surfaces read the shared rule, not their own', async () => {
  const card = stripComments(await read('components/OfferCard.tsx'));
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));

  // Chat delegates outright.
  assert.match(card, /isOfferActionableBy\(offer, currentUserId\)/);
  assert.doesNotMatch(
    card,
    /offer\.awaiting_id === currentUserId/,
    'the chat card must not re-derive the turn beside the shared rule'
  );

  // The job detail's own derivation must use the same two facts and never
  // worker_id — the defect that made a customer counter read as "your bid".
  assert.match(detail, /activeBid\.awaiting_id === user\.id/);
  assert.match(detail, /activeBid\.author_id === user\.id/);
  assert.doesNotMatch(detail, /activeBid\.worker_id === user\.id/);
});

// ---------------------------------------------------------------------------
// 6, 7, 8 — job navigation identity, live and accepted
// ---------------------------------------------------------------------------

test('a live offer with a valid job_id produces the correct navigation params', async () => {
  const { offerJobTarget } = await navModule;

  // The worker's live negotiation opens the marketplace job detail — the
  // screen that carries the respond card, and exactly where My Jobs sends the
  // same offer.
  assert.deepEqual(offerJobTarget(offer(), WORKER), {
    screen: 'JobDetail',
    jobId: JOB,
  });
  // The customer's own job opens their own job screen.
  assert.deepEqual(offerJobTarget(offer(), CUSTOMER), {
    screen: 'ClientJobDetail',
    jobId: JOB,
  });
});

test('a live counteroffer with a valid job_id produces the correct navigation params', async () => {
  const { offerJobTarget } = await navModule;
  // A counter inherits job_id from its parent by schema (composite FK), so
  // the destination is the same job — no title/timestamp heuristic anywhere.
  const counter = offer({
    id: 'offer-2',
    parent_offer_id: 'offer-1',
    author_id: WORKER,
    awaiting_id: CUSTOMER,
  });
  assert.deepEqual(offerJobTarget(counter, CUSTOMER), {
    screen: 'ClientJobDetail',
    jobId: JOB,
  });
  assert.deepEqual(offerJobTarget(counter, WORKER), {
    screen: 'JobDetail',
    jobId: JOB,
  });
});

test('an accepted offer keeps the job navigation it already had', async () => {
  const { offerJobTarget } = await navModule;
  const accepted = offer({ status: 'accepted', awaiting_id: null });
  // Screenshot 5's working reference, unchanged: the worker lands on their own
  // job screen and the customer on theirs.
  assert.deepEqual(offerJobTarget(accepted, WORKER), {
    screen: 'WorkerJob',
    jobId: JOB,
  });
  assert.deepEqual(offerJobTarget(accepted, CUSTOMER), {
    screen: 'ClientJobDetail',
    jobId: JOB,
  });
});

test('a dead revision and a stranger get no destination at all', async () => {
  const { offerJobTarget, isOfferJobOpenable } = await navModule;
  for (const status of ['declined', 'withdrawn', 'expired', 'superseded']) {
    assert.equal(isOfferJobOpenable(status), false);
    assert.equal(offerJobTarget(offer({ status }), WORKER), null);
  }
  assert.equal(offerJobTarget(offer(), 'someone-else'), null);
  assert.equal(offerJobTarget(null, WORKER), null);
  assert.equal(offerJobTarget(offer(), null), null);
});

test('chat routes an offer card through the shared target, not a second scheme', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  // The card is tappable exactly when the shared rule says there is somewhere
  // to go — no `status === 'accepted'` gate left anywhere.
  assert.match(chat, /onOpenJob=\{\s*request && offerJobTarget\(request, user\?\.id\)/);
  assert.doesNotMatch(chat, /request\?\.status === 'accepted'\s*\n?\s*\?/);

  // And it dispatches the three routes the rest of the app already uses,
  // through the one guarded cross-tab helper.
  assert.match(chat, /const target = offerJobTarget\(request, user\.id\);/);
  assert.match(chat, /navigateAcrossTabs\('MyJobs', 'WorkerJob', \{ jobId: target\.jobId \}\)/);
  assert.match(chat, /navigateAcrossTabs\('MyJobs', 'JobDetail', \{ job: toOpenJob\(request\.job\) \}\)/);
  assert.match(chat, /navigateAcrossTabs\('MyJobs', 'ClientJobDetail', \{ job: fetchedJob \}\)/);

  // The identity is the offer's own job_id — never a title, time or user
  // match standing in for it.
  const nav = stripComments(await read('lib/offerNavigation.ts'));
  assert.match(nav, /jobId: offer\.job_id/);
  assert.doesNotMatch(nav, /title|created_at/);
});

test('My Jobs and Chat send the same offer to the same screen', async () => {
  const { offerJobTarget } = await navModule;
  const hub = stripComments(await read('screens/MyJobsHubScreen.tsx'));

  // My Jobs' three destinations, unchanged, are the three this rule returns.
  assert.match(hub, /navigation\.navigate\('JobDetail', \{ job \}\)/);
  assert.match(hub, /navigation\.navigate\('ClientJobDetail', \{ job \}\)/);
  assert.match(hub, /navigation\.navigate\('WorkerJob', \{ jobId: job\.id \}\)/);

  assert.equal(offerJobTarget(offer(), WORKER).screen, 'JobDetail');
  assert.equal(offerJobTarget(offer(), CUSTOMER).screen, 'ClientJobDetail');
  assert.equal(
    offerJobTarget(offer({ status: 'accepted', awaiting_id: null }), WORKER).screen,
    'WorkerJob'
  );
});

// ---------------------------------------------------------------------------
// 14 — one set of mutation semantics, not one per surface
// ---------------------------------------------------------------------------

test('Chat and the job detail drive the same negotiation RPCs', async () => {
  const [chat, detail, offers] = await Promise.all([
    read('screens/ChatScreen.tsx').then(stripComments),
    read('screens/JobDetailScreen.tsx').then(stripComments),
    read('lib/offers.ts').then(stripComments),
  ]);

  // Every write is an RPC in the one negotiation module. No screen assembles
  // its own call, and none touches the table.
  for (const fn of ['acceptOffer', 'declineOffer', 'counterOffer']) {
    assert.match(chat, new RegExp(`${fn}\\(`), `chat must call ${fn}()`);
  }
  assert.match(detail, /acceptOffer\(/);
  assert.match(detail, /declineOffer\(/);
  // The job detail counters through OfferComposer, which calls counterOffer().
  assert.match(
    stripComments(await read('components/OfferComposer.tsx')),
    /counterOffer\(/
  );

  for (const source of [chat, detail]) {
    assert.doesNotMatch(
      source,
      /from\('job_offers'\)/,
      'no screen may read or write job_offers directly'
    );
  }
  for (const fn of ['accept_offer', 'decline_offer', 'counter_offer']) {
    assert.match(offers, new RegExp(`rpc\\('${fn}'`), `${fn} must stay an RPC`);
  }
});

// ---------------------------------------------------------------------------
// 15 — the counter cap is untouched by this work
// ---------------------------------------------------------------------------

test('the counter cap is still 10 per side, per chain', async () => {
  const { MAX_COUNTERS_PER_SIDE, countersRemaining } = await offersModule;
  assert.equal(MAX_COUNTERS_PER_SIDE, 10);

  const chain = [offer()];
  for (let i = 0; i < 10; i += 1) {
    chain.push(offer({ id: `c${i}`, author_id: WORKER, parent_offer_id: 'offer-1' }));
  }
  assert.equal(countersRemaining(chain, WORKER), 0);
  // The other side's allowance is independent and untouched.
  assert.equal(countersRemaining(chain, CUSTOMER), 10);

  // Server-side cap unchanged: phase63 is still the newest counter_offer().
  const sql = await read('supabase/archive/phases/phase63_counteroffer_cap_ten_per_side.sql');
  assert.match(sql, /create or replace function public\.counter_offer\(/);
  assert.match(sql, /10/);
});

// ---------------------------------------------------------------------------
// Fix D / E — one card format, no clipping, no Message button
// ---------------------------------------------------------------------------

test('the actionable card uses the required labels, order and icons', async () => {
  const {
    acceptOfferActionLabel,
    acceptOfferConfirmText,
    COUNTER_OFFER_ACTION_LABEL,
    declineOfferActionLabel,
    offerNoun,
    offerResponseHeading,
    acceptOfferConfirmTitle,
    declineOfferConfirmTitle,
    firstNameOf,
  } = await copyModule;

  // 2026-09-28 (LUX-LIST-64 #64, audit M-17) — ONE NOUN PER AUDIENCE, sentence
  // case: a worker reads "offer" for what a customer sent, a customer reads
  // "bid" for what a worker sent; every confirmation repeats its button's verb
  // and noun. (Were: 'Accept Offer ($110)', 'Send Counter Offer', 'Decline
  // Offer', 'sent you a Counteroffer' / 'an Offer', whichever side read them.)
  assert.equal(offerNoun(true), 'offer');
  assert.equal(offerNoun(false), 'bid');
  assert.equal(acceptOfferActionLabel('$110', true), 'Accept offer ($110)');
  assert.equal(acceptOfferActionLabel('$110', false), 'Accept bid ($110)');
  assert.equal(acceptOfferConfirmText(true), 'Accept offer');
  assert.equal(acceptOfferConfirmText(false), 'Accept bid');
  // 2026-09-30 (decision C): with the server's quote the customer's button names the total;
  // a worker's never does, whatever it is handed.
  assert.equal(acceptOfferConfirmText(false, '$129'), 'Accept & pay $129');
  assert.equal(acceptOfferConfirmText(true, '$129'), 'Accept offer');
  assert.equal(acceptOfferConfirmText(false, undefined), 'Accept bid');
  assert.equal(COUNTER_OFFER_ACTION_LABEL, 'Send counter-offer');
  assert.equal(declineOfferActionLabel(true), 'Decline offer');
  assert.equal(declineOfferActionLabel(false), 'Decline bid');
  assert.equal(offerResponseHeading('Mahmudur', true, true), 'Mahmudur sent you a counter-offer');
  assert.equal(offerResponseHeading('Mahmudur', false, true), 'Mahmudur sent you an offer');
  assert.equal(offerResponseHeading('Sam', true, false), 'Sam sent you a new bid');
  assert.equal(offerResponseHeading('Sam', false, false), 'Sam sent you a bid');
  assert.equal(acceptOfferConfirmTitle('$110', true), 'Accept this offer for $110?');
  assert.equal(acceptOfferConfirmTitle('$110', false), 'Accept this bid for $110?');
  assert.equal(declineOfferConfirmTitle('$110', true), 'Decline this $110 offer?');
  assert.equal(declineOfferConfirmTitle('$110', false), 'Decline this $110 bid?');
  assert.equal(firstNameOf('Mahmudur Rahman', 'They'), 'Mahmudur');
  assert.equal(firstNameOf('   ', 'They'), 'They');
  assert.equal(firstNameOf(null, 'They'), 'They');
});

test('A5 — the accept confirmation body is one text: three money lines, then what the tap does', async () => {
  const { acceptOfferConfirmMessage } = await copyModule;
  const quote = { priceLabel: '$120', feeLabel: '$9', totalLabel: '$129' };
  const lines = 'Agreed price $120 · Protection fee $9 · Total charged $129.\n\n';
  const selects = 'This selects their bid for the job — the other active bids will no longer be eligible.';
  // Card path, no saved card: checkout is next.
  assert.equal(acceptOfferConfirmMessage({ quote, sandbox: false }), `${lines}${selects} Next you’ll protect the payment in checkout.`);
  // Card path, the confirm names the saved card: it is charged now — only with a quote.
  assert.equal(
    acceptOfferConfirmMessage({ quote, sandbox: false, savedCardLabel: 'Visa ···· 4242' }),
    `${lines}${selects} Visa ···· 4242 is charged the total now, and the funds are held in protection until you approve the work.`
  );
  assert.equal(
    acceptOfferConfirmMessage({ quote: null, sandbox: false, savedCardLabel: 'Visa ···· 4242' }),
    `${selects} Next you’ll protect the payment in checkout.`,
    'no quote, no "charged now" — the card pays only against a total the confirm showed'
  );
  // Sandbox: its sentence, and never "development build".
  const sandbox = acceptOfferConfirmMessage({ quote, sandbox: true });
  assert.equal(sandbox, `${lines}${selects} Next you’ll authorize and protect the payment in checkout, in test mode (no real money moves).`);
  assert.doesNotMatch(sandbox, /development build/);
  // Without a quote the money lines are left out, never guessed.
  assert.doesNotMatch(acceptOfferConfirmMessage({ quote: null, sandbox: false }), /Agreed price|Protection fee|Total charged/);
  // Both accept paths read the helper and name the total on the button (the job page already did).
  for (const file of ['screens/ClientJobDetailScreen.tsx', 'screens/BidDetailScreen.tsx']) {
    const src = (await read(file)).replace(/\s+/g, ' ');
    assert.match(src, /message=\{acceptOfferConfirmMessage\(\{/, `${file} renders the shared body`);
    assert.doesNotMatch(src, /This selects (their|this) bid for the job/, `${file} carries no body of its own`);
  }
  const bid = (await read('screens/BidDetailScreen.tsx')).replace(/\s+/g, ' ');
  assert.match(bid, /confirmText=\{acceptOfferConfirmText\(false, quote \? formatBudget\(quote\.total_cents\) : undefined\)\}/);
  assert.match(bid, /quoteJobPrice\(offerAmountCents\)/, 'the quote is the server’s, never a rate computed here');

  const actions = stripComments(await read('components/OfferResponseActions.tsx'));
  // Order is Accept, Counter, Decline, each led by its glyph. Measured inside
  // the rendered block, so the import list at the top cannot satisfy it.
  const rendered = actions.slice(actions.indexOf('<View style={styles.actions}>'));
  assert.ok(rendered.length > 0, 'the actions block must exist');
  const order = ['acceptOfferActionLabel(', 'COUNTER_OFFER_ACTION_LABEL', 'declineOfferActionLabel(']
    .map((needle) => rendered.indexOf(needle));
  assert.ok(order.every((i) => i > 0), 'all three actions must render');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Accept, then Counter, then Decline');

  assert.match(actions, /icon="checkmark"/);
  assert.match(actions, /icon="swap-horizontal"/);
  assert.match(actions, /icon="close"/);
  assert.match(actions, /variant="destructive"/);
  assert.doesNotMatch(actions, /iconPosition="trailing"/);

  // No hardcoded colours, and no Message control on an actionable card.
  assert.doesNotMatch(actions, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(actions, /Message /);
});

test('the explanatory copy cannot collide with the first action', async () => {
  const actions = stripComments(await read('components/OfferResponseActions.tsx'));

  // The note keeps its measured height (explicit lineHeight) and the column
  // separates its children with a gap — so nothing depends on a device size.
  assert.match(actions, /note: \{[\s\S]*?lineHeight: 19,/);
  assert.match(actions, /root: \{[\s\S]*?gap: spacing\.sm,/);
  assert.match(actions, /actions: \{[\s\S]*?gap: spacing\.sm,/);
  assert.doesNotMatch(actions, /position: 'absolute'/);
  assert.doesNotMatch(actions, /useWindowDimensions|Dimensions\.get/);
  assert.doesNotMatch(actions, /height: \d/, 'no fixed heights around the copy');
});

test('the two actionable surfaces render the one card and no Message CTA', async () => {
  const card = stripComments(await read('components/OfferCard.tsx'));
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));

  assert.match(card, /<OfferResponseActions/);
  assert.match(detail, /<OfferResponseActions/);

  // The respond card's Message button is gone — free-form messaging is not
  // available before the job is confirmed, so an actionable card is by
  // definition a place it must not appear.
  const respondStart = detail.indexOf('viewerOwesResponse ? (');
  const authoredStart = detail.indexOf(') : viewerAuthoredBid ? (');
  const respondCard = detail.slice(respondStart, authoredStart);
  assert.ok(respondStart > 0 && authoredStart > respondStart);
  assert.doesNotMatch(respondCard, /Message \$\{poster/);
});

// ---------------------------------------------------------------------------
// Fix B — a just-arrived offer cannot be erased by an older read
// ---------------------------------------------------------------------------

test('overlapping thread-offer reads merge instead of overwriting', async () => {
  const { mergeThreadOffers } = await offersModule;

  const root = offer({ id: 'a', created_at: '2026-08-13T00:00:00.000Z' });
  const child = offer({
    id: 'b',
    parent_offer_id: 'a',
    created_at: '2026-08-13T00:05:00.000Z',
    updated_at: '2026-08-13T00:05:00.000Z',
    author_id: WORKER,
    awaiting_id: CUSTOMER,
  });

  // The newest counter has landed; the older, smaller read answers last.
  const afterFresh = mergeThreadOffers([root], [root, child], ['a', 'b']);
  const afterStale = mergeThreadOffers(afterFresh, [root], ['a', 'b']);
  assert.deepEqual(
    afterStale.map((o) => o.id),
    ['a', 'b'],
    'the late older answer must not erase the just-arrived offer'
  );

  // A genuinely fresher row still wins.
  const updated = { ...root, status: 'superseded', updated_at: '2026-08-13T00:05:00.000Z' };
  assert.equal(mergeThreadOffers([root], [updated], ['a'])[0].status, 'superseded');
  // A stale copy of the same row does not.
  assert.equal(mergeThreadOffers([updated], [root], ['a'])[0].status, 'superseded');

  // Offers the thread no longer references are pruned, so this cannot grow.
  assert.deepEqual(mergeThreadOffers([root, child], [], ['b']).map((o) => o.id), ['b']);
});

test('a failed thread-offer read leaves the cards alone', async () => {
  const hook = stripComments(await read('hooks/useJobOffers.ts'));
  assert.match(hook, /const \{ data, error \} = await fetchOffersByIds\(ids\);/);
  const guard = hook.indexOf('if (error)');
  const write = hook.indexOf('setOffers((prev) =>');
  assert.ok(guard > 0 && guard < write, 'the error guard must precede the write');
  assert.match(hook, /mergeThreadOffers\(/);
  // The merge is measured against the CURRENT id set, not the one this read
  // captured — that is what makes the outcome order-independent.
  assert.match(hook, /idKeyRef\.current/);
});

test('the offer card carries the job facts it has, not a bare amount', async () => {
  const card = stripComments(await read('components/OfferCard.tsx'));
  const offers = stripComments(await read('lib/offers.ts'));

  // Title, category, location, description, media and time all render from
  // the embedded job row.
  assert.match(card, /\{job\.title\}/);
  assert.match(card, /JOB_CATEGORY_LABELS\[job\.category\]/);
  assert.match(card, /job\.location/);
  assert.match(card, /\{job\.description\}/);
  assert.match(card, /styles\.mediaThumb/);
  assert.match(card, /formatTimeAgo\(message\.created_at\)/);

  // The embed is the full browse projection, so a card and the screen it
  // opens are built from the same row — including the budget range and
  // arrival window a narrower list used to drop.
  assert.match(offers, /const OFFER_JOB_EMBED =/);
  for (const column of [
    'budget_min_cents',
    'budget_max_cents',
    'scheduled_date',
    'arrival_start_hour',
    'arrival_end_hour',
  ]) {
    assert.ok(
      offers.includes(`${column}`),
      `the offer's job embed must carry ${column}`
    );
  }
  // Every job-embedding offer read uses the one embed, so Chat and both My
  // Jobs surfaces (live bids and Stage 4D's settled bids) see the same job.
  assert.equal(
    (offers.match(/\$\{OFFER_JOB_EMBED\}/g) ?? []).length,
    3,
    'all job-embedding offer reads must share the one projection'
  );
});
