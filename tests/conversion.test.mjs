import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ---------------------------------------------------------------------------
// 4D-3 — conversion and rebook. §3 post flow, §4 rebook, §5 compare bids,
// §6 worker-side conversion. Pure lib modules are EXECUTED (the moneyCeiling
// pattern); screen wiring that node cannot render is pinned against source.
// ---------------------------------------------------------------------------

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

/** lib/jobs.ts's REAL formatBudget, extracted verbatim at test time so money
 *  strings asserted here are the ones users see. */
const formatBudgetSource = (async () => {
  const jobsJs = stripTypeScriptTypes(await read('lib/jobs.ts'), { mode: 'strip' });
  const start = jobsJs.indexOf('export function formatBudget');
  const end = jobsJs.indexOf('\n}', start);
  assert.ok(start > 0 && end > start, 'formatBudget must exist in lib/jobs.ts');
  return jobsJs.slice(start, end + 2);
})();

/** Execute a lib module, replacing its `import ... from './jobs'` line (if
 *  any) with the real formatBudget so the module stays pure and runnable. */
async function importLibModule(path) {
  const js = stripTypeScriptTypes(await read(path), { mode: 'strip' });
  const inlined = js.replace(
    /import \{ formatBudget \} from '\.\/jobs';/,
    () => '',
  );
  const withHelper = inlined.includes('formatBudget')
    ? `${await formatBudgetSource}\n${inlined}`
    : inlined;
  assert.ok(!withHelper.includes("from './jobs'"), `${path}: the jobs import must be inlined`);
  return import(toDataUrl(withHelper));
}

const skillCategoriesModule = importLibModule('lib/skillCategories.ts');
const priceGuidanceModule = importLibModule('lib/priceGuidance.ts');
const validationModule = importLibModule('lib/validation.ts');

// ---------------------------------------------------------------------------
// §3.1 — the static price table, keyed by the real category list
// ---------------------------------------------------------------------------

test('§3.1 · every skill category resolves to a range or an explicit null', async () => {
  const { SKILL_CATEGORIES } = await skillCategoriesModule;
  const { PRICE_GUIDANCE, priceGuidanceFor } = await priceGuidanceModule;

  assert.equal(SKILL_CATEGORIES.length, 10, 'the §1.2 list is the ten skill keys');

  const expectedNulls = new Set(['dog_walking', 'packing']);
  for (const { key } of SKILL_CATEGORIES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(PRICE_GUIDANCE, key),
      `category "${key}" must be an explicit table entry, range or null`
    );
    const range = priceGuidanceFor(key);
    if (expectedNulls.has(key)) {
      assert.equal(range, null, `"${key}" has no seeded range and must stay null`);
    } else {
      assert.ok(range, `"${key}" must carry a seeded range`);
    }
  }

  const actualNulls = Object.entries(PRICE_GUIDANCE)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
    .sort();
  assert.deepEqual(actualNulls, [...expectedNulls].sort(), 'exactly the reported nulls');

  // 'other' is a JOB_CATEGORIES-only key — absent from the table, null from
  // the lookup, so the post flow's eleventh chip renders no guidance.
  assert.equal(priceGuidanceFor('other'), null);
  assert.equal(priceGuidanceFor(null), null);
  assert.equal(priceGuidanceFor('not-a-category'), null);
});

test('§3.1 · every range is ordered and inside the phase75 money ceiling', async () => {
  const { PRICE_GUIDANCE } = await priceGuidanceModule;
  const { MONEY_CEILING_CENTS } = await validationModule;

  for (const [key, range] of Object.entries(PRICE_GUIDANCE)) {
    if (range === null) continue;
    assert.ok(Number.isInteger(range.minCents) && Number.isInteger(range.maxCents), key);
    assert.ok(range.minCents > 0, `${key}: min must be positive cents`);
    assert.ok(range.minCents < range.maxCents, `${key}: min must be strictly under max`);
    assert.ok(range.maxCents <= MONEY_CEILING_CENTS, `${key}: max must be under the ceiling`);
  }
});

test('§3.2 · the guidance copy is exact, formatBudget-formatted, and claims no locality', async () => {
  const { SKILL_CATEGORIES } = await skillCategoriesModule;
  const { priceGuidanceLines } = await priceGuidanceModule;

  const cleaning = priceGuidanceLines('cleaning');
  assert.ok(cleaning);
  // "Suggested starting range" — product decision 2026-08-18. "Typical"
  // overclaimed what a static seed table knows.
  assert.equal(cleaning[0], 'Suggested starting range: $60–$120');
  assert.equal(cleaning[1], 'A guide, not a quote. You set the budget.');

  for (const { key } of SKILL_CATEGORIES) {
    const lines = priceGuidanceLines(key);
    if (!lines) continue;
    const joined = lines.join(' ');
    assert.match(lines[0], /^Suggested starting range: \$[\d,]+–\$[\d,]+$/);
    assert.doesNotMatch(
      joined,
      /\b(here|nearby|in your area|near you|local|locally|around you)\b/i,
      `${key}: a static table cannot support a locality claim`
    );
  }

  assert.equal(priceGuidanceLines('dog_walking'), null, 'a null category renders NO guidance');
});

// ---------------------------------------------------------------------------
// §3.3 — the 20-trimmed-character description floor
// ---------------------------------------------------------------------------

test('§3.3 · the floor is 20 trimmed characters — 19 fails, 20 passes', async () => {
  const { JOB_DESCRIPTION_MIN_CHARS, descriptionCharsNeeded } = await validationModule;

  assert.equal(JOB_DESCRIPTION_MIN_CHARS, 20);
  assert.equal(descriptionCharsNeeded('a'.repeat(19)), 1, '19 characters fails');
  assert.equal(descriptionCharsNeeded('a'.repeat(20)), 0, '20 characters passes');
  assert.equal(
    descriptionCharsNeeded(`   ${'a'.repeat(19)}   `),
    1,
    'whitespace padding cannot buy the last character'
  );
  assert.equal(descriptionCharsNeeded(''), 20);
  assert.equal(descriptionCharsNeeded('a'.repeat(500)), 0);
});

test('§3.3 · the advance control is disabled by the floor, with the written count [static]', async () => {
  const screen = await read('screens/PostJobScreen.tsx');

  // The footer button's disabled expression carries the floor…
  assert.match(screen, /disabled=\{uploadingPhoto \|\| uploadingVideo \|\| \(step === 0 && descNeeded > 0\)\}/);
  // …and the count is written next to the field, never a raw error.
  assert.match(screen, /more \{descNeeded === 1 \? 'character' : 'characters'\} needed/);
});

// ---------------------------------------------------------------------------
// §3.4 — the photo nudge is a nudge, not a gate
// ---------------------------------------------------------------------------

test('§3.4 · the nudge renders, dismisses per-draft, and never blocks advancing [static]', async () => {
  const screen = await read('screens/PostJobScreen.tsx');
  const draft = await read('lib/postJobDraft.ts');

  assert.match(screen, /Jobs with a photo get more bids\./);
  assert.match(screen, /setPhotoNudgeDismissed\(true\)/, 'the nudge is dismissible');

  // The advance control's disabled expression must not mention the nudge or
  // the photo count — advancing with zero photos stays possible.
  const disabledExpr = screen.match(/disabled=\{uploadingPhoto[^}]*\}/)?.[0] ?? '';
  assert.ok(disabledExpr.length > 0, 'the footer disabled expression exists');
  assert.ok(!disabledExpr.includes('photoNudge'), 'nudge state cannot gate advancing');
  assert.ok(!disabledExpr.includes('photos.length'), 'photo count cannot gate advancing');

  // Dismissal is stored ON THE DRAFT (dies with it), not in a global setting.
  assert.match(draft, /photoNudgeDismissed: boolean/);
  assert.match(draft, /photoNudgeDismissed: parsed\.photoNudgeDismissed === true/);
  assert.ok(
    !draft.includes('brazos.photoNudge'),
    'no dedicated global storage key for the nudge'
  );
});

// ---------------------------------------------------------------------------
// §3.2 — guidance visibility predicate (empty or unfocused, fresh posts only)
// ---------------------------------------------------------------------------

test('§3.2 · guidance shows only for a seeded category while the budget is empty or unfocused [static]', async () => {
  const screen = await read('screens/PostJobScreen.tsx');

  assert.match(screen, /const guidanceLines = isFreshPost \? priceGuidanceLines\(category\) : null;/);
  assert.match(screen, /\(bothBudgetsEmpty \|\| !budgetFocused\)/);
});

// ---------------------------------------------------------------------------
// §4 — rebook: saved and past workers
// ---------------------------------------------------------------------------

const rebookModule = importLibModule('lib/rebook.ts');

test('§4.1 · a worker in both populations appears once, under Saved', async () => {
  const { pastOnlyIds, rebookStripItems } = await rebookModule;

  const savedIds = new Set(['w1', 'w2']);
  assert.deepEqual(pastOnlyIds(['w2', 'w3', 'w1', 'w4'], savedIds), ['w3', 'w4']);
  assert.deepEqual(pastOnlyIds([], savedIds), []);
  assert.deepEqual(pastOnlyIds(['w9'], new Set()), ['w9']);

  // The strip applies the same rule even when handed overlapping inputs.
  const both = { id: 'w1', full_name: 'Ada Reyes', avatar_url: null };
  const items = rebookStripItems(
    [both],
    [both, { id: 'w2', full_name: 'Bo Chen', avatar_url: null }]
  );
  assert.deepEqual(
    items.map((i) => [i.id, i.saved]),
    [
      ['w1', true],
      ['w2', false],
    ],
    'the duplicate renders once, and as Saved'
  );
});

test('§4.3 · a tombstoned profile carries no Hire, and the label is phase67\'s, verbatim', async () => {
  const { DELETED_USER_LABEL, canHire, isTombstonedName, rebookStripItems } =
    await rebookModule;

  assert.equal(DELETED_USER_LABEL, 'Deleted user');
  // Pin the label against the migration that writes it — the client constant
  // and the tombstone UPDATE must never drift apart.
  const phase67 = await read('supabase/phase67_account_deletion.sql');
  assert.match(phase67, /set full_name\s+= 'Deleted user',/);

  assert.equal(canHire('Deleted user'), false);
  assert.equal(isTombstonedName('Deleted user'), true);
  assert.equal(canHire('Ada Reyes'), true);
  assert.equal(canHire(null), true, 'a merely-missing name is not a tombstone');

  // The strip is a hire shortcut, so tombstones never enter it at all.
  const items = rebookStripItems(
    [{ id: 'w1', full_name: 'Deleted user', avatar_url: null }],
    [{ id: 'w2', full_name: 'Deleted user', avatar_url: null }]
  );
  assert.deepEqual(items, []);
});

test('§4 · SavedWorkersScreen: sections, suppressed Hire, no writes, no verification vocabulary [static]', async () => {
  const screen = await read('screens/SavedWorkersScreen.tsx');

  // Empty sections are omitted entirely (conditional spread), not rendered
  // as empty headers.
  assert.match(screen, /\.\.\.\(saved\.length > 0/);
  assert.match(screen, /\.\.\.\(past\.length > 0/);

  // The trust line's availability suffix requires accepting_work to be
  // EXPLICITLY false — null is unknown and renders nothing.
  assert.match(
    screen,
    /profile\.accepting_work === false \? ' · Not taking work right now' : ''/
  );

  // The dedup goes through the shared rule, not a local re-derivation.
  assert.match(screen, /pastOnlyIds\(/);

  // Hire is a navigation into the prefilled composer — the screen itself
  // performs no offer write of any kind.
  assert.match(screen, /navigation\.navigate\('PostJob', \{\s*hireWorkerId: profile\.id/);
  assert.ok(!screen.includes('createDirectOffer'), 'no direct-offer write from this screen');
  assert.ok(!screen.includes('supabase.rpc'), 'no raw RPC from this screen');
  assert.ok(!screen.includes('accept_offer'), 'no acceptance path from this screen');

  // A tombstoned row renders no Hire control.
  assert.match(screen, /\{canHire\(profile\.full_name\) \? \(/);

  // The verification badge died at 43d1e7f and must not return here.
  assert.ok(!/verif/i.test(screen), 'no verification vocabulary on this surface');
});

test('§4.4 · the rebook strip tops the search surface and "Hire someone again" resolves to SavedWorkers [static]', async () => {
  const search = await read('screens/WorkerSearchScreen.tsx');
  const root = await read('navigation/CustomerRoot.tsx');

  assert.match(search, /rebookStripItems\(/);
  assert.match(search, /Hire someone again/);
  assert.match(search, /navigateAcrossTabs\('Profile', 'SavedWorkers'\)/);
  // Strip taps open the SAME prefilled composer as the Hire control.
  assert.match(search, /hireWorkerId: item\.id/);
  // An empty strip renders nothing — the block is gated on having items.
  assert.match(search, /rebook\.length > 0 \? \(/);

  // §1.6 — the centre [+] sheet's row already lands on this screen; pin it so
  // a future re-route is a deliberate act.
  const sheetRow = root.slice(root.indexOf("key: 'hire-again'"));
  assert.ok(sheetRow.includes("navigateAcrossTabs('Profile', 'SavedWorkers')"));
});

// ---------------------------------------------------------------------------
// §5 — Compare Bids: deterministic order, defensible badge, honest trust row
// ---------------------------------------------------------------------------

const compareBidsModule = importLibModule('lib/compareBids.ts');

const bid = (id, amount, rating, ratingCount, createdAt = `2026-08-0${id.length}T00:00:00Z`) => ({
  id,
  amount_cents: amount,
  created_at: createdAt,
  worker: rating == null && ratingCount == null
    ? null
    : { rating_avg: rating, rating_count: ratingCount },
});

test('§5.4 · the sort is total and stable: rating desc, price asc, time asc, id', async () => {
  const { sortBidsDeterministic } = await compareBidsModule;

  const a = bid('a', 7000, 4.5, 10, '2026-08-01T00:00:00Z');
  const b = bid('b', 6000, 4.5, 3, '2026-08-02T00:00:00Z'); // same rating, cheaper
  const c = bid('c', 6000, 4.5, 8, '2026-08-01T00:00:00Z'); // ties price, earlier
  const d = bid('d', 5000, 4.9, 4, '2026-08-03T00:00:00Z'); // highest rating
  const e = bid('e', 1000, null, 0, '2026-08-01T00:00:00Z'); // unrated, cheapest of all

  const order = (list) => sortBidsDeterministic(list).map((x) => x.id);

  assert.deepEqual(order([a, b, c, d, e]), ['d', 'c', 'b', 'a', 'e']);
  // Total: any input permutation yields the identical output order.
  assert.deepEqual(order([e, d, c, b, a]), ['d', 'c', 'b', 'a', 'e']);
  assert.deepEqual(order([c, a, e, b, d]), ['d', 'c', 'b', 'a', 'e']);

  // Null ratings sort LAST, never interleaved by a substituted zero: the
  // unrated cheapest bid still trails a low-but-real 1.0 rating.
  const low = bid('l', 9000, 1.0, 5);
  assert.deepEqual(order([e, low]), ['l', 'e']);

  // Full tie except id — the id breaks it, both directions.
  const t1 = bid('t1', 4000, 4.0, 4, '2026-08-05T00:00:00Z');
  const t2 = bid('t2', 4000, 4.0, 9, '2026-08-05T00:00:00Z');
  assert.deepEqual(order([t2, t1]), ['t1', 't2']);
  assert.deepEqual(order([t1, t2]), ['t1', 't2']);
});

test('§5.4 · chips: no chip = the default rule; price leads by amount; rating restates the default', async () => {
  const { BID_SORT_CHIPS, sortBidsDeterministic, sortBidsForChip } = await compareBidsModule;

  // Exactly two chips, exactly this copy — the blended "Best value" is gone.
  assert.deepEqual(BID_SORT_CHIPS, [
    { label: 'Lowest price', value: 'price' },
    { label: 'Highest rated', value: 'rating' },
  ]);

  const a = bid('a', 7000, 4.5, 10, '2026-08-01T00:00:00Z');
  const b = bid('b', 6000, 4.5, 3, '2026-08-02T00:00:00Z');
  const d = bid('d', 5000, 4.9, 4, '2026-08-03T00:00:00Z');
  const e = bid('e', 1000, null, 0, '2026-08-01T00:00:00Z');
  const list = [a, b, d, e];

  const ids = (result) => result.map((x) => x.id);

  // No chip selected = the deterministic default, byte for byte.
  assert.deepEqual(ids(sortBidsForChip(list, null)), ids(sortBidsDeterministic(list)));

  // "Highest rated" is the default's leading key made explicit — same order.
  assert.deepEqual(ids(sortBidsForChip(list, 'rating')), ids(sortBidsDeterministic(list)));

  // "Lowest price" leads with amount; the unrated cheapest bid now leads.
  assert.deepEqual(ids(sortBidsForChip(list, 'price')), ['e', 'd', 'b', 'a']);

  // Price ties fall back to the SAME deterministic chain (rating desc first),
  // so equal rows can never swap between renders under any chip.
  const p1 = bid('p1', 4000, 4.8, 5, '2026-08-05T00:00:00Z');
  const p2 = bid('p2', 4000, 3.0, 5, '2026-08-04T00:00:00Z');
  assert.deepEqual(ids(sortBidsForChip([p2, p1], 'price')), ['p1', 'p2']);
});

test('§5.4 · ClientJobDetail consumes the one ordering source; the blended sort is fully gone [static]', async () => {
  const detail = await read('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /sortBidsForChip\(pendingBids, sort\)/);
  assert.match(detail, /BID_SORT_CHIPS/);
  assert.match(detail, /useState<BidSortChip \| null>\(null\)/, 'default = no chip = the stated rule');

  // The deleted symbols exist NOWHERE in app code any more.
  const offers = await read('lib/offers.ts');
  for (const gone of ['offerValueScore', 'sortOffers(', 'bestValueOfferId', 'OFFER_SORT_OPTIONS']) {
    assert.ok(!detail.includes(gone), `${gone} must not be referenced by ClientJobDetail`);
    assert.ok(!stripComments(offers).includes(gone), `${gone} must be deleted from lib/offers.ts`);
  }
  const card = await read('components/OfferCard.tsx');
  assert.ok(!card.includes('Best value'), 'the Best value badge left the card');
  assert.ok(!card.includes('isBestValue'), 'the badge prop left the card');
});

test('§5.1 · HIGHEST RATED fails closed: ties, thin records, and unknowns kill it', async () => {
  const { highestRatedBadgeId } = await compareBidsModule;

  const top = bid('top', 6000, 4.9, 5);
  const mid = bid('mid', 5000, 4.5, 7);
  const low = bid('low', 4000, 4.0, 3);

  // The clean case: strictly higher than every KNOWN rival rating, 3+ reviews.
  assert.equal(highestRatedBadgeId([mid, top, low]), 'top');

  // A tie at the top — no badge.
  const tie = bid('tie', 7000, 4.9, 6);
  assert.equal(highestRatedBadgeId([top, tie, low]), null);

  // Top rating built on fewer than 3 reviews — no badge.
  const thin = bid('thin', 3000, 5.0, 2);
  assert.equal(highestRatedBadgeId([thin, mid]), null);

  // Any UNRATED rival makes the comparison unknowable — no badge.
  const unrated = bid('u', 2000, null, 0);
  assert.equal(highestRatedBadgeId([top, unrated]), null);

  // A lone bid has nobody to out-rate — no badge.
  assert.equal(highestRatedBadgeId([top]), null);
  assert.equal(highestRatedBadgeId([]), null);
});

test('§5.3 · null on_time_pct never renders as 0%, and the completed figure is a SUM', async () => {
  const { onTimePercent, totalCompletedJobs, trustRowFor } = await compareBidsModule;

  assert.equal(onTimePercent(null), null);
  assert.equal(onTimePercent(undefined), null);
  assert.equal(onTimePercent(98), 98);
  assert.equal(onTimePercent(0.5), 50, 'a 0–1 stored scale normalizes like completion_rate');

  // D3 — per-category rows sum to the total; a single-category worker is not
  // undercounted to their largest category.
  assert.equal(totalCompletedJobs([{ count: 2 }, { count: 3 }, { count: 1 }]), 6);
  assert.equal(totalCompletedJobs([{ count: 7 }]), 7);
  assert.equal(totalCompletedJobs([]), 0);

  // D4 — "New worker" needs a null on_time_pct AND a KNOWN sub-3 job count.
  assert.deepEqual(trustRowFor(null, 2), { kind: 'new' });
  assert.deepEqual(trustRowFor(null, 0), { kind: 'new' });
  assert.equal(trustRowFor(null, 3).kind, 'facts');
  assert.equal(trustRowFor(98, 1).kind, 'facts', 'a known on_time_pct is a record, not a blank');
  const unknown = trustRowFor(null, null);
  assert.equal(unknown.kind, 'facts');
  assert.equal(unknown.onTimePct, null);
  assert.equal(unknown.completedJobs, null, 'unknown stays unknown — renders nothing');
});

test('§5 · the screen states the order, renders no ranking claim and no stray percentage [static]', async () => {
  const screen = await read('screens/CompareBidsScreen.tsx');
  const lib = await read('lib/compareBids.ts');

  // The stated rule is the implemented rule's own constant.
  assert.match(lib, /BID_ORDER_RULE = 'Sorted by rating, then lowest price, then earliest bid\.'/);
  assert.match(screen, /\{BID_ORDER_RULE\}/);

  // No ranking language, no blended score, no second acceptance path.
  assert.doesNotMatch(screen, /best value|best fit|top pick|recommended|suggested/i);
  assert.ok(!screen.includes('sortOffers'), 'the blended sort left this surface');
  assert.ok(!screen.includes('bestValueOfferId'), 'the value badge left this surface');
  assert.ok(!screen.includes('OFFER_SORT_OPTIONS'), 'no user-selectable ranking modes');
  // Comments may (and do) NAME the assignment rule; the CODE must not touch
  // it — acceptance stays one deliberate step away, on Bid Detail.
  const screenCode = stripComments(screen);
  assert.ok(
    !screenCode.includes('accept_offer') && !screenCode.includes('acceptOffer'),
    'acceptance stays on Bid Detail'
  );
  assert.match(screen, /navigation\.navigate\('BidDetail'/, 'rows route to the existing path');

  // The offer message is one line.
  assert.match(screen, /rowPitch\} numberOfLines=\{1\}/);

  // The only percent on this screen is on_time_pct's own rendering.
  assert.ok(!screen.includes('completionPercent'), 'completion% left this surface');
  const strippedPercents = screen.replace(/% on time/g, '');
  assert.ok(!strippedPercents.includes('%'), 'no percentage that is not on_time_pct');
});

// ---------------------------------------------------------------------------
// §6.1 — bid composer availability chips
// ---------------------------------------------------------------------------

const offerMessageModule = importLibModule('lib/offerMessage.ts');

test('§6.1 · zero selections leave the message byte-identical to today', async () => {
  const { availabilityLine, composeOfferMessage } = await offerMessageModule;

  assert.equal(availabilityLine(null, null), null);
  // Today's path is message.trim() — with no line, that is exactly the output.
  assert.equal(composeOfferMessage('  I bring my own tools.  ', null), 'I bring my own tools.');
  assert.equal(composeOfferMessage('', null), '');
});

test('§6.1 · the appended line matches the dispatch, one line, both fragments optional', async () => {
  const { availabilityLine, composeOfferMessage } = await offerMessageModule;

  assert.equal(
    availabilityLine({ kind: 'today' }, '1to2h'),
    'Can start today · about 1-2h'
  );
  assert.equal(availabilityLine({ kind: 'tomorrow' }, null), 'Can start tomorrow');
  assert.equal(availabilityLine(null, '2to4h'), 'About 2-4h');
  assert.equal(
    availabilityLine({ kind: 'day', label: 'Wed, Aug 26' }, 'under1h'),
    'Can start Wed, Aug 26 · under 1h'
  );

  const composed = composeOfferMessage('Pitch.', availabilityLine({ kind: 'today' }, '4hplus'));
  assert.equal(composed, 'Pitch.\nCan start today · about 4h+');
  assert.equal(composed.split('\n').length, 2, 'exactly ONE trailing line');
});

test('§6.1 · the 500 cap is mirrored: chips stand down before a send could exceed it', async () => {
  const { OFFER_MESSAGE_MAX, chipsAvailable, longestAvailabilityLineLength } =
    await offerMessageModule;

  assert.equal(OFFER_MESSAGE_MAX, 500);
  // Pin the server's own literal — create_offer's latest revision.
  const phase61 = await read('supabase/phase61_marketplace_thread_identity.sql');
  assert.match(phase61, /if length\(coalesce\(p_message, ''\)\) > 500 then/);

  const longest = longestAvailabilityLineLength(['Wed, Aug 26']);
  assert.ok(longest >= 'Can start Wed, Aug 26 · about 1-2h'.length);

  // Exactly at the boundary the chips still fit; one more character and they
  // disable rather than ever truncating a send.
  const fits = 'a'.repeat(OFFER_MESSAGE_MAX - 1 - longest);
  assert.equal(chipsAvailable(fits, longest), true);
  assert.equal(chipsAvailable(`${fits}b`, longest), false);
  assert.equal(chipsAvailable('a'.repeat(500), longest), false);
});

test('§6.1 · the day list starts after Tomorrow and labels like the posting flow', async () => {
  const { upcomingStartDays } = await offerMessageModule;

  const days = upcomingStartDays(3, new Date(2026, 7, 18)); // Tue Aug 18 2026
  assert.equal(days.length, 3);
  assert.deepEqual(
    days.map((d) => d.iso),
    ['2026-08-20', '2026-08-21', '2026-08-22'],
    'today and tomorrow are their own chips — the list begins the day after'
  );
  assert.match(days[0].label, /^\w{3}, \w{3} \d{1,2}$/);
});

test('§6.1 · composer wiring: bid-only chips, cleared on overflow, assembled through the one path [static]', async () => {
  const composer = await read('components/OfferComposer.tsx');

  // The chips live in the bid branch; a counter has no message and no chips.
  assert.match(composer, /\{isBid \? \(\s*<View style=\{styles\.chipSection\}>/);
  // The send assembles through the shared helpers — never a hand-built string.
  assert.match(
    composer,
    /message: composeOfferMessage\(message, availabilityLine\(startChoice, duration\)\)/
  );
  // Overflow disables AND clears, with the written reason.
  assert.match(composer, /pointerEvents=\{chipsOk \? 'auto' : 'none'\}/);
  assert.match(composer, /if \(!chipsOk && \(startMode !== null \|\| pickedDay !== null \|\| duration !== null\)\)/);
  assert.match(composer, /Shorten the pitch to\s+use these\./);
  // The pitch field mirrors the server cap as a full field, not an error.
  assert.match(composer, /maxLength=\{OFFER_MESSAGE_MAX\}/);
});

// ---------------------------------------------------------------------------
// §6.2 / §6.3 — service booking and explicit pricing states
// ---------------------------------------------------------------------------

test('§6.2 · a null price reads "Ask about this" and prefills no amount; ceilings run first [static]', async () => {
  const profileScreen = await read('screens/WorkerProfileScreen.tsx');

  assert.match(
    profileScreen,
    /service\.price_cents != null \? 'Book at listed price' : 'Ask about this'/
  );
  // The amount prefill exists ONLY in the priced branch.
  assert.match(
    profileScreen,
    /\.\.\.\(service\.price_cents != null \? \{ initialAmountCents: service\.price_cents \} : null\)/
  );
  // A stored over-ceiling price is refused with the written sentence before
  // any navigation — and the composer's createDirectOffer mirrors it again.
  assert.match(profileScreen, /moneyCeilingError\(service\.price_cents\)/);
  // The control opens the composer; this screen sends nothing itself.
  assert.ok(!stripComments(profileScreen).includes('createDirectOffer'));

  // The wizard seeds its amount only for the hire flow.
  const postJob = await read('screens/PostJobScreen.tsx');
  assert.match(postJob, /params\?\.hireWorkerId && params\?\.initialAmountCents != null/);
});

test('§6.3 · pricing is an explicit two-state choice; Ask me clears; ceilings refuse in writing [static]', async () => {
  const screen = await read('screens/ServicesPricingScreen.tsx');

  assert.match(screen, /\{ label: 'Flat price', value: 'flat' \}/);
  assert.match(screen, /\{ label: 'Ask me', value: 'ask' \}/);
  assert.match(screen, /if \(next === 'ask'\) setPrice\(''\)/);
  // The add control is gated on the written ceiling refusal…
  assert.match(screen, /const canAdd = title\.trim\(\)\.length > 0 && priceValid && !priceCeilingProblem && !adding;/);
  assert.match(screen, /\{priceCeilingProblem\}/);
  // …and the writes stay direct RLS-scoped DML through lib/services.ts.
  assert.ok(!stripComments(screen).includes('supabase.rpc'), 'no RPC was added for this table');
  // D8: no same-day-availability toggle exists to back.
  assert.ok(!/same.?day/i.test(screen));
});

test('§6.2 · over-ceiling amounts refuse with written text before any RPC', async () => {
  const { moneyCeilingError, MONEY_CEILING_CENTS } = await validationModule;

  assert.equal(moneyCeilingError(MONEY_CEILING_CENTS), null, 'exactly at the ceiling is legal');
  // Verbatim refusal copy — operator decision 2026-08-18.
  assert.equal(moneyCeilingError(MONEY_CEILING_CENTS + 1), 'Amount must be $100,000 or less.');
});

// ---------------------------------------------------------------------------
// §6.4 — profile completeness meter
// ---------------------------------------------------------------------------

const completenessModule = importLibModule('lib/profileCompleteness.ts');

test('§6.4 · four steps, complete at 4/4 (where the meter disappears)', async () => {
  const { profileCompleteness } = await completenessModule;

  const done = profileCompleteness({
    avatarUrl: 'https://x/avatar.jpg',
    bio: 'I fix things.',
    publishedServiceCount: 3,
    portfolioCount: 1,
  });
  assert.equal(done.complete, true);
  assert.equal(done.done, 4);
  assert.equal(done.total, 4);

  const partial = profileCompleteness({
    avatarUrl: null,
    bio: '   ',
    publishedServiceCount: 2,
    portfolioCount: 0,
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.done, 0);
  assert.deepEqual(
    partial.steps.map((s) => [s.key, s.done]),
    [
      ['avatar', false],
      ['bio', false],
      ['services', false],
      ['portfolio', false],
    ],
    'a whitespace bio and two published services are not done steps'
  );
});

test('§6.4 · the meter renders own-worker-profile only, and never at 4/4 [static]', async () => {
  const own = await read('screens/ProfileScreen.tsx');
  const other = await read('screens/WorkerProfileScreen.tsx');

  assert.match(
    own,
    /user && mode === 'worker' && meterCounts && !completeness\.complete && !isEditing/
  );
  // Each unmet step routes to the surface that fixes it.
  assert.match(own, /navigation\.navigate\('ServicesPricing'\)/);
  assert.match(own, /setPickerOpen\(true\)/);
  // No other user's profile carries a meter.
  assert.ok(!other.includes('profileCompleteness'));
});
