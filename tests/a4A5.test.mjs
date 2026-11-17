// A4 wiring (A5): the small logic tickets from the screen groups.
//   G4-1   the empty inbox says what to do next.
//   G1b-2  the customer's job page knows a review was left: no second "Leave a Review".
//   G1b-3  the job page's pinned button names no time, so it stays one line (the approval card says it).
//   G1b-4  while the owner's payments pause is on, a hire waiting for its payment is not told to check out.
// The lines are executed where they are pure (lib/jobLifecycle.ts, lib/homeAttention.ts, lib/inboxFilters.ts,
// and the job page's expressions extracted as written); the wiring around them is pinned as text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
// Comments out (a trailing // comment too), then one line.
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1').replace(/\s+/g, ' ');
const ONCE = (path, re) => {
  const all = [...code(path).matchAll(new RegExp(re.source, 'g'))];
  assert.equal(all.length, 1, `${path}: ${re} must match once`);
  return all[0][1];
};

const lifecycleUrl = pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href;
const { myJobsNextAction } = await import(lifecycleUrl);
const inbox = await import(pathToFileURL(join(root, 'lib/inboxFilters.ts')).href);
// lib/homeAttention.ts executed for real, its one runtime import pointed at lib/jobLifecycle.ts (as
// tests/homeAttention.test.mjs loads it).
const homeSource = stripTypeScriptTypes(read('lib/homeAttention.ts'), { mode: 'strip' });
assert.ok(homeSource.includes("from './jobLifecycle';"), 'the one runtime import must be jobLifecycle');
const { attentionItems } = await import(
  'data:text/javascript;charset=utf-8;base64,' +
    Buffer.from(homeSource.replace("from './jobLifecycle';", () => `from '${lifecycleUrl}';`), 'utf8').toString('base64')
);

const PAUSED = 'Payments are paused — check back shortly';
const CHECKOUT = 'Complete checkout — protect the payment';
const STATES = ['draft', 'open', 'pending_payment', 'confirmed', 'en_route', 'arrived', 'in_progress', 'awaiting_approval', 'disputed', 'completed', 'cancelled', 'unknown'];

test('A5 G1b-4 · [executed] a hire waiting for its payment says the pause while payments are paused, and only then', () => {
  const line = (extra) => myJobsNextAction({ perspective: 'customer', state: 'pending_payment', ...extra });
  assert.equal(line({}), CHECKOUT, 'a caller that does not read the pause: as before');
  assert.equal(line({ checkoutOpen: true }), CHECKOUT, 'payments on');
  assert.equal(line({ checkoutOpen: false }), PAUSED, 'payments paused: no checkout is asked for');
  // The worker's line names no checkout either way.
  for (const checkoutOpen of [undefined, true, false]) {
    assert.equal(myJobsNextAction({ perspective: 'worker', state: 'pending_payment', checkoutOpen }), 'Waiting on payment protection');
  }
  // No other state, in either perspective, reads the pause.
  for (const perspective of ['customer', 'worker']) {
    for (const state of STATES.filter((s) => s !== 'pending_payment')) {
      for (const reviewedByMe of [false, true]) {
        const base = { perspective, state, bidCount: 2, reviewedByMe, releaseDeadline: null };
        assert.equal(myJobsNextAction({ ...base, checkoutOpen: false }), myJobsNextAction(base), `${perspective} ${state}`);
      }
    }
  }
});

test('A5 G1b-4 · [executed] the Home attention line carries the pause it is given (absent is open)', () => {
  const hire = {
    id: 'job-01', client_id: 'me', title: 'Paint one bedroom', status: 'assigned', created_at: '2026-09-01T12:00:00.000Z',
    bid_count: 0, assigned_worker_id: 'worker-1', en_route_at: null, arrived_at: null, completed_at: null,
    budget_cents: 5_000, final_amount_cents: null,
  };
  const run = (extra) =>
    attentionItems({ posted: [hire], payments: {}, openDisputeJobIds: new Set(), reviewedJobIds: new Set(), ...extra });
  assert.deepEqual(run({}).map((item) => [item.state, item.line]), [['pending_payment', CHECKOUT]]);
  assert.deepEqual(run({ checkoutOpen: true }).map((item) => item.line), [CHECKOUT]);
  assert.deepEqual(run({ checkoutOpen: false }).map((item) => item.line), [PAUSED]);
  assert.match(code('lib/homeAttention.ts'), /nowMs, checkoutOpen: input\.checkoutOpen, \}\),/);
});

test('A5 G1b-4 · [static] the job page and My Jobs pass the pause they read; the worker’s lines do not need it', () => {
  const detail = code('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /myJobsNextAction\(\{ perspective: 'customer', state: lifecycle, releaseDeadline: null, reviewedByMe: reviewedByMe === true, checkoutOpen: paymentsEnabled, \}\)/);
  // The page's own read of the pause (D15), unchanged: a failed read is open.
  assert.match(detail, /fetchRemoteConfig\(\)\.then\(\(config\) => \{ if \(!active\) return; setPaymentsEnabled\(config\.paymentsEnabled\);/);
  const hub = code('screens/MyJobsHubScreen.tsx');
  assert.match(hub, /import \{ fetchRemoteConfig \} from '\.\.\/lib\/remoteConfig';/);
  assert.match(
    hub,
    /const \[checkoutOpen, setCheckoutOpen\] = useState\(true\); useFocusEffect\( useCallback\(\(\) => \{ let active = true; void fetchRemoteConfig\(\)\.then\(\(config\) => \{ if \(active\) setCheckoutOpen\(config\.paymentsEnabled\); \}\); return \(\) => \{ active = false; \}; \}, \[\]\) \);/,
    'read on each focus; a stale answer after leaving is dropped'
  );
  const calls = [...hub.matchAll(/myJobsNextAction\(\{ perspective: '(customer|worker)',[^}]*\}\)/g)].map((m) => [m[1], /checkoutOpen,/.test(m[0])]);
  assert.deepEqual(calls, [['worker', false], ['customer', true]], 'the customer’s line gets it; the worker’s does not need it');
});

test('A5 G1b-2 · [executed] a review already left is not offered again: the button, the status line and the released card', () => {
  const detail = 'screens/ClientJobDetailScreen.tsx';
  const label = new Function('reviewedByMe', 'stripe', 'isReleased', 'payment', `return ${ONCE(detail,
    /label: (reviewedByMe === true \? 'See Your Review' : stripe \|\| !isReleased\(payment\) \? 'Leave a Review' : 'Review & Tip'),/)};`);
  const released = (p) => p.status === 'released';
  for (const stripe of [true, false]) {
    for (const payment of [{ status: 'released' }, { status: 'held' }]) {
      const before = stripe || !released(payment) ? 'Leave a Review' : 'Review & Tip';
      assert.equal(label(null, stripe, released, payment), before, 'not read yet (or the read failed): as before');
      assert.equal(label(false, stripe, released, payment), before, 'read, no review: as before');
      assert.equal(label(true, stripe, released, payment), 'See Your Review', 'reviewed: never "Leave a Review" again');
    }
  }
  const card = new Function('reviewedByMe', 'stripe', 'workerFirstName', `return ${ONCE(detail,
    /\{(reviewedByMe === true \? `Settled\. You left \$\{workerFirstName\} a review\.` : stripe \? `Settled\. Leave \$\{workerFirstName\} a review\.` : `Settled\. Leave \$\{workerFirstName\} a review or a tip\.`)\}/)};`);
  assert.equal(card(true, true, 'Sam'), 'Settled. You left Sam a review.');
  assert.equal(card(true, false, 'Sam'), 'Settled. You left Sam a review.');
  assert.equal(card(false, true, 'Sam'), 'Settled. Leave Sam a review.');
  assert.equal(card(null, false, 'Sam'), 'Settled. Leave Sam a review or a tip.');
  // The status line: the hub's own derivation, so a reviewed job reads "Closed" on both.
  assert.equal(myJobsNextAction({ perspective: 'customer', state: 'completed', releaseDeadline: null, reviewedByMe: true }), 'Closed');
  assert.equal(myJobsNextAction({ perspective: 'customer', state: 'completed', releaseDeadline: null, reviewedByMe: false }), 'Leave a review');
  // The approved-and-on-its-way card drops its review invitation once one is left.
  assert.match(code(detail), /lands\.\{reviewedByMe === true \? null : ' Leave a review whenever you like\.'\} <\/Text>/);
});

test('A5 G1b-2 · [static] the review fact is the hub’s own read, per job, on each focus while the job is completed', () => {
  const detail = code('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /import \{ fetchMyReviewedJobIds \} from '\.\.\/lib\/reviews';/);
  assert.match(detail, /const reviewedByMe = reviewRead\?\.jobId === job\.id \? reviewRead\.reviewed : null;/, 'another job’s answer is never used');
  assert.match(detail, /const reviewReadWanted = !!user && lifecycle === 'completed';/);
  assert.match(
    detail,
    /useFocusEffect\( useCallback\(\(\) => \{ if \(!reviewReadWanted \|\| !user\) return; let active = true; const readJobId = job\.id; fetchMyReviewedJobIds\(user\.id, \[readJobId\]\)\.then\( \(\{ data, error \}\) => \{ if \(!active \|\| error\) return; setReviewRead\(\{ jobId: readJobId, reviewed: data\.has\(readJobId\) \}\); \}, \(\) => undefined \); return \(\) => \{ active = false; \}; \}, \[reviewReadWanted, user, job\.id\]\) \);/,
    'a failed or late read changes nothing'
  );
  // The same read the hub makes (hooks/useMyJobsHub.ts): reviews by this reviewer on these jobs.
  assert.match(read('lib/reviews.ts'), /export async function fetchMyReviewedJobIds\(reviewerId: string, jobIds: string\[\]\) \{[^]*?\.from\('reviews'\)\s*\.select\('job_id'\)\s*\.eq\('reviewer_id', reviewerId\)\s*\.in\('job_id', jobIds\);/);
});

test('A5 G1b-3 · [static] the pinned button says "Review & Approve the Work" with no time; the card names the time once', () => {
  const detail = code('screens/ClientJobDetailScreen.tsx');
  // A2-M5 W1: Title Case, as the app's other buttons.
  assert.match(detail, /case 'awaiting_approval': return \{ label: 'Review & Approve the Work', onPress: openApproveOrDispute \};/);
  assert.equal((detail.match(/With no response, the funds release automatically \$\{releaseAtLabel\(approvalDeadline, serverNowMs\(\)\)\}/g) ?? []).length, 1);
});

test('A5 G1b-3 · [executed] the phone flow\'s tap finds the pinned button: the page\'s label, as written, matches the flow\'s selector as Maestro reads it', () => {
  // A4-R1 R-G (A4-11): the label is read from the page and the selector from
  // .maestro/06-customer-approve-review.yml; Maestro matches the whole text as a regex, ignoring capitals.
  const label = ONCE('screens/ClientJobDetailScreen.tsx', /case 'awaiting_approval': return \{ label: '([^']*)', onPress: openApproveOrDispute \};/);
  const selector = /- tapOn: "(Review & approve[^"]*)"/.exec(read('.maestro/06-customer-approve-review.yml'))?.[1];
  assert.ok(selector, 'the flow taps the approval button');
  assert.match(label, new RegExp(`^(?:${selector})$`, 'i'));
});

test('A5 G4-1 · [executed] the empty inbox says how a conversation starts and what to do for one', () => {
  assert.deepEqual(inbox.emptyStateFor('all'), {
    title: 'No messages yet',
    body: 'Conversations start once a bid is accepted. Post a job, or bid on one, to get started.',
  });
  // The other pills keep their own words.
  assert.equal(inbox.emptyStateFor('unread').body, 'You are caught up.');
});

test('A5 G1b-4 · [static] Home reads the pause on each focus the way My Jobs does and passes it to its attention list', () => {
  const home = code('screens/HomeScreen.tsx');
  assert.match(home, /import \{ fetchRemoteConfig \} from '\.\.\/lib\/remoteConfig';/);
  assert.match(
    home,
    /const \[checkoutOpen, setCheckoutOpen\] = useState\(true\); useFocusEffect\( useCallback\(\(\) => \{ let active = true; void fetchRemoteConfig\(\)\.then\(\(config\) => \{ if \(active\) setCheckoutOpen\(config\.paymentsEnabled\); \}\); return \(\) => \{ active = false; \}; \}, \[\]\) \);/,
    'a failed read is open (fetchRemoteConfig resolves to FALLBACK, paymentsEnabled true); a late answer after leaving is dropped'
  );
  assert.match(home, /attentionItems\(\{ posted, payments, openDisputeJobIds, reviewedJobIds, nowMs, checkoutOpen \}\), \[posted, payments, openDisputeJobIds, reviewedJobIds, nowMs, checkoutOpen\]/);
  assert.equal((home.match(/fetchRemoteConfig\(\)/g) ?? []).length, 1, 'one read');
});

test('A5 G1a-5 · [static] the live page\'s notify line follows the step above it: a request with a set price, a bid otherwise', () => {
  const live = code('components/JobLivePage.tsx');
  const line = new Function('posted', `return ${ONCE('components/JobLivePage.tsx', /<Text style=\{styles\.notifyText\}>\{(`We’ll let you know when the first \$\{posted \? 'request' : 'bid'\} arrives\.`)\}<\/Text>/)};`);
  assert.equal(line(true), 'We’ll let you know when the first request arrives.');
  assert.equal(line(false), 'We’ll let you know when the first bid arrives.');
  assert.match(live, /\[posted \? 'Requests arrive' : 'Bids arrive', 'From workers nearby'\]/);
  assert.match(live, /const posted = mode === 'posted_price';/);
});
