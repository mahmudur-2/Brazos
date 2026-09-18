import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// a2 (2026-09-05) — customer Home shows the posted jobs that need the
// customer's move, and the Nearby card says when the job was posted.
//
// docs/DECISIONS.md 2026-09-05 entry (4). The SELECTION RULE lives in
// lib/homeAttention.ts and is EXECUTED here against the real
// lib/jobLifecycle.ts; HomeScreen's wiring and its position between the promo
// card and Nearby are pinned as text. Every expected next-action line is the
// string myJobsNextAction() itself returns for the same input — never a
// retyped literal, so this file can never drift from the one implementation.
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/homeAttention.ts executed for real. Its one runtime import is
// lib/jobLifecycle.ts — type-import-only itself, so it loads straight from its
// absolute URL the way tests/lifecycle.test.mjs loads it.
const lifecycleUrl = pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href;
const source = stripTypeScriptTypes(read('lib/homeAttention.ts'), { mode: 'strip' });
const relativeImport = "from './jobLifecycle';";
assert.ok(source.includes(relativeImport), 'the one runtime import must be jobLifecycle');
const { attentionItems, ATTENTION_CAP } = await import(
  toDataUrl(source.replace(relativeImport, () => `from '${lifecycleUrl}';`))
);
const { myJobsNextAction } = await import(lifecycleUrl);

/** The line the ONE implementation returns — never a literal retyped here. */
const lineFor = (state, extra = {}) =>
  myJobsNextAction({ perspective: 'customer', state, ...extra });

let seq = 0;
function job(overrides = {}) {
  seq += 1;
  return {
    id: `job-${String(seq).padStart(2, '0')}`,
    client_id: 'me',
    title: `Paint one bedroom ${seq}`,
    status: 'open',
    created_at: '2026-09-01T12:00:00.000Z',
    bid_count: 0,
    assigned_worker_id: null,
    en_route_at: null,
    arrived_at: null,
    completed_at: null,
    budget_cents: 5_000,
    final_amount_cents: null,
    ...overrides,
  };
}

function run({ posted, payments = {}, disputes = [], reviewed = [], nowMs }) {
  return attentionItems({
    posted,
    payments,
    openDisputeJobIds: new Set(disputes),
    reviewedJobIds: new Set(reviewed),
    nowMs,
  });
}

const held = { status: 'held', release_requested_at: null, provider: 'stripe' };

test('a2 · an open job with bids is a move, and carries the hub’s own bids-to-review line', () => {
  const withBids = job({ status: 'open', bid_count: 2 });
  const items = run({ posted: [withBids] });
  assert.equal(items.length, 1);
  assert.equal(items[0].job.id, withBids.id);
  assert.equal(items[0].state, 'open');
  assert.equal(items[0].line, lineFor('open', { bidCount: 2 }));
  // The line is the fact, not a mood: it names the count.
  assert.equal(items[0].line, '2 bids to review');
});

test('a2 · an open job with zero bids is a WAIT, not a move', () => {
  assert.deepEqual(run({ posted: [job({ status: 'open', bid_count: 0 })] }), []);
});

test('a2 · a hire with no payment row asks for checkout; once held it is the worker’s move', () => {
  const hire = job({ status: 'assigned', assigned_worker_id: 'worker-1' });
  const items = run({ posted: [hire] });
  assert.equal(items.length, 1);
  assert.equal(items[0].state, 'pending_payment');
  assert.equal(items[0].line, lineFor('pending_payment'));

  // Held = confirmed. Nothing is owed by the customer until the work is done.
  assert.deepEqual(run({ posted: [hire], payments: { [hire.id]: held } }), []);
});

test('a2 · a worker in motion is a move, and arrived outranks en route', () => {
  const enRoute = job({
    status: 'assigned',
    assigned_worker_id: 'worker-1',
    en_route_at: '2026-09-02T09:00:00.000Z',
  });
  const arrived = job({
    status: 'assigned',
    assigned_worker_id: 'worker-2',
    en_route_at: '2026-09-02T09:00:00.000Z',
    arrived_at: '2026-09-02T09:30:00.000Z',
  });

  const onlyEnRoute = run({ posted: [enRoute] });
  assert.equal(onlyEnRoute.length, 1);
  assert.equal(onlyEnRoute[0].state, 'en_route');
  assert.equal(onlyEnRoute[0].line, lineFor('en_route'));

  const onlyArrived = run({ posted: [arrived] });
  assert.equal(onlyArrived.length, 1);
  assert.equal(onlyArrived[0].state, 'arrived');
  assert.equal(onlyArrived[0].line, lineFor('arrived'));

  assert.deepEqual(
    run({ posted: [enRoute, arrived] }).map((item) => item.state),
    ['arrived', 'en_route']
  );
});

test('a2 · work in progress is the worker’s move, not the customer’s', () => {
  assert.deepEqual(run({ posted: [job({ status: 'in_progress' })] }), []);
});

test('a2 · finished work with the money still held asks for approval', () => {
  const done = job({ status: 'completed' });
  const items = run({ posted: [done], payments: { [done.id]: held } });
  assert.equal(items.length, 1);
  assert.equal(items[0].state, 'awaiting_approval');
  assert.equal(items[0].line, lineFor('awaiting_approval'));
  // No completed_at, so phase51's clock never runs and no countdown is claimed.
  assert.equal(items[0].line, 'Approval needed — review the finished work');
});

test('a2 · an approved job asks for the review once, and never again', () => {
  const approved = job({ status: 'completed' });
  const payments = {
    [approved.id]: { ...held, release_requested_at: '2026-09-03T10:00:00.000Z' },
  };

  const unreviewed = run({ posted: [approved], payments });
  assert.equal(unreviewed.length, 1);
  assert.equal(unreviewed[0].state, 'completed');
  assert.equal(unreviewed[0].line, lineFor('completed', { reviewedByMe: false }));
  assert.equal(unreviewed[0].line, 'Leave a review');

  assert.deepEqual(run({ posted: [approved], payments, reviewed: [approved.id] }), []);
});

test('a2 · an open dispute is not a prompt: the customer already acted', () => {
  const disputed = job({ status: 'completed' });
  assert.deepEqual(
    run({ posted: [disputed], payments: { [disputed.id]: held }, disputes: [disputed.id] }),
    []
  );
});

test('a2 · cancelled, draft and unclassifiable rows never reach Home', () => {
  assert.deepEqual(run({ posted: [job({ status: 'cancelled' })] }), []);
  // The direct-offer rows create_offer() writes — never a "Finish posting" prompt.
  assert.deepEqual(run({ posted: [job({ status: 'draft' })] }), []);
  // A status this client cannot classify is omitted, never guessed at.
  assert.deepEqual(run({ posted: [job({ status: 'weird' })] }), []);
});

test('a2 · the urgency order is approval, payment, bids, arrived, en route, review', () => {
  const approve = job({ status: 'completed' });
  const pay = job({ status: 'assigned', assigned_worker_id: 'w1' });
  const bids = job({ status: 'open', bid_count: 3 });
  const arrived = job({
    status: 'assigned',
    assigned_worker_id: 'w2',
    arrived_at: '2026-09-02T09:30:00.000Z',
  });
  const enRoute = job({
    status: 'assigned',
    assigned_worker_id: 'w3',
    en_route_at: '2026-09-02T09:00:00.000Z',
  });
  const review = job({ status: 'completed' });

  const payments = {
    [approve.id]: held,
    [review.id]: { ...held, release_requested_at: '2026-09-03T10:00:00.000Z' },
  };
  // Shuffled in, so the order below is the rule's and not the input's.
  const items = run({
    posted: [enRoute, review, bids, approve, arrived, pay],
    payments,
  });
  assert.deepEqual(
    items.map((item) => item.state),
    ['awaiting_approval', 'pending_payment', 'open', 'arrived', 'en_route', 'completed']
  );
});

test('a2 · within one rank the newest post comes first, ties broken by id', () => {
  const older = job({ id: 'job-b', status: 'open', bid_count: 1, created_at: '2026-09-01T08:00:00.000Z' });
  const newer = job({ id: 'job-c', status: 'open', bid_count: 1, created_at: '2026-09-04T08:00:00.000Z' });
  const tie = job({ id: 'job-a', status: 'open', bid_count: 1, created_at: '2026-09-04T08:00:00.000Z' });

  assert.deepEqual(
    run({ posted: [older, newer, tie] }).map((item) => item.job.id),
    ['job-a', 'job-c', 'job-b']
  );
});

test('a2 · the cap is 3 and the function itself returns every item', () => {
  assert.equal(ATTENTION_CAP, 3);
  const five = [1, 2, 3, 4, 5].map(() => job({ status: 'open', bid_count: 1 }));
  const items = run({ posted: five });
  assert.equal(items.length, 5, 'the caller slices; the rule counts');
  assert.equal(items.slice(0, ATTENTION_CAP).length, 3);
});

test('a2 · Home reads the hub, derives nothing itself, and sits below the pill and above the next job section', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));

  assert.match(home, /import \{ useMyJobsHub \} from '\.\.\/hooks\/useMyJobsHub';/);
  assert.match(home, /import \{ ATTENTION_CAP, attentionItems \} from '\.\.\/lib\/homeAttention';/);
  assert.match(home, /import \{ HubCard \} from '\.\.\/components\/HubCard';/);
  assert.match(home, /import \{ useFocusEffect, useNavigation \} from '@react-navigation\/native';/);
  assert.match(home, /import \{ formatTimeAgo, greetingFor \} from '\.\.\/lib\/time';/);

  // ONE aggregation: the hook is called here and in the hub, nowhere else.
  assert.equal((home.match(/useMyJobsHub\(\)/g) ?? []).length, 1);
  assert.match(home, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*void refreshMyJobs\(\);\s*\}, \[refreshMyJobs\]\)\s*\)/);
  // The hub's local metaLine helper is NOT duplicated here (P3-31).
  assert.doesNotMatch(home, /metaLineFor/);

  // POSITION: below the promo card's pill, above the next job section.
  //
  // 2026-09-17 — RE-POINTED, and the CLAIM is untouched. This fence read the
  // section below as "Nearby"; Nearby left the customer Home on operator
  // instruction and "Your jobs" took its slot. The two things asserted are
  // exactly what they were — the block must not push the pill off-screen (the
  // E2E money walk taps that pill without scrolling), and it must LEAD the job
  // sections rather than follow them, which is the 2026-09-05 ruling's own
  // word. Only the heading naming the section below it moved.
  const pill = 'Post a job ›';
  assert.equal((home.match(/Post a job ›/g) ?? []).length, 1, 'the walk taps one pill');
  assert.equal(
    (home.match(/accessibilityLabel="Post a job"/g) ?? []).length,
    1,
    'and one "Post a job" label'
  );
  const heading = (home.match(/Needs your attention/g) ?? []).length;
  assert.equal(heading, 1, 'the section heading is written once');
  const pillAt = home.indexOf(pill);
  const attentionAt = home.indexOf('Needs your attention');
  const nextSectionAt = home.indexOf('>Your jobs</Text>');
  assert.ok(pillAt > -1 && attentionAt > -1 && nextSectionAt > -1);
  assert.ok(attentionAt > pillAt, 'the block must not push the pill off-screen');
  assert.ok(attentionAt < nextSectionAt, 'and it leads the job sections, above "Your jobs"');

  // The card opens the full row it already holds; See all opens the hub.
  assert.match(home, /navigateAcrossTabs\('MyJobs', 'ClientJobDetail', \{ job \}\)/);
  assert.match(home, /onPress=\{\(\) => navigateAcrossTabs\('MyJobs'\)\}/);
  assert.match(home, /items\.slice\(0, ATTENTION_CAP\)/);
  assert.match(home, /items\.length > ATTENTION_CAP/);

  // Nothing new on Home carries a selector the E2E walk taps.
  for (const label of ['Create', 'Back to Home']) {
    assert.doesNotMatch(home, new RegExp(`>${label}<`), `${label} is not Home's to render`);
  }
});

// 2026-09-17 — RE-POINTED ONTO THE CARD THAT SURVIVED, not deleted.
//
// This test used to read `OpenJobCard`, the Nearby list's own card, and pin
// the posted-ago line docs/BACKLOG.md's card-facts item added to it. Nearby
// left the customer Home on operator instruction and that card went with it,
// so the SUBJECT moved — but the FACT it was protecting did not: every job
// card on this screen must still say how long the job has been sitting, and
// must still say who it is with. Both of Home's lists draw
// components/HubCard.tsx now, so both are read here.
test('a2 · every job card on Home says when it was posted and who it is with', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));

  // TWO lists — "Needs your attention" and "Your jobs" — and each hands the
  // card the posting's own age. Always drawn: jobs.created_at is NOT NULL, so
  // there is no branch to get wrong.
  assert.equal(
    (home.match(/timeLabel=\{formatTimeAgo\(job\.created_at\)\}/g) ?? []).length,
    2,
    'both job lists label the card with the posting’s age'
  );
  assert.equal(
    (home.match(/<HubCard/g) ?? []).length,
    2,
    'both lists draw the hub’s own card, and this screen defines no card of its own'
  );

  // THE COUNTERPARTY LINE IS ONE IMPLEMENTATION, CALLED TWICE (P3-31). It is
  // what carries the bid count, and two copies is how the same job would come
  // to be described differently one section apart.
  assert.equal(
    (home.match(/function counterpartyLine\(/g) ?? []).length,
    1,
    'the counterparty line is written once'
  );
  assert.equal(
    (home.match(/subtitle=\{counterpartyLine\(job, names\)\}/g) ?? []).length,
    2,
    'and both lists call it rather than restating it'
  );
  assert.match(
    home,
    /if \(job\.bid_count > 0\) return `\$\{job\.bid_count\} \$\{job\.bid_count === 1 \? 'bid' : 'bids'\} received`;/,
    'the bid count is stated from the row, never rounded or invented'
  );
});

test('a2 · the selection rule lives in lib/homeAttention.ts and imports only the derivation', () => {
  const module = stripComments(read('lib/homeAttention.ts'));
  const runtimeImports = [...module.matchAll(/^import [\s\S]*?from '[^']+';$/gm)]
    .map((match) => match[0])
    .filter((statement) => !/^import type/.test(statement));
  assert.equal(runtimeImports.length, 1, 'one runtime import: the lifecycle derivation');
  assert.match(runtimeImports[0], /from '\.\/jobLifecycle';/);
  // The copy is never rewritten here — the line comes from the one implementation.
  assert.match(module, /myJobsNextAction\(\{/);
  assert.doesNotMatch(module, /bids to review|Approval needed|Leave a review/);
});
