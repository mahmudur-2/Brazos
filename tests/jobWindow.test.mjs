import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * A4 wiring (A4) - THE JOB-TIMING RULES IN THE APP. The server's rules are
 * job_window_over() and its refusals (20261116200400_post_window.sql) and
 * trip_day (20261116200300_trip_day.sql). The app mirrors the cutoff in
 * lib/paymentRules.ts jobWindowOver, shows each refusal word for word, and
 * points the worker to his own Cancel This Job beside the booked-day refusal.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
globalThis.__DEV__ = false;
const rules = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);
const copy = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);
const { userMessage } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);
const { jobWindowOver, BOOKED_TIME_PASSED } = rules;

test('jobWindowOver mirrors job_window_over: from the window end instant on, New York, 24 when open-ended, never undated', () => {
  // 20 November 2026 is EST (UTC-5): a 2 pm end is 19:00Z.
  const job = { scheduled_date: '2026-11-20', arrival_end_hour: 14 };
  assert.equal(jobWindowOver({ job, nowMs: Date.parse('2026-11-20T18:59:59Z') }), false, 'one second before the end');
  assert.equal(jobWindowOver({ job, nowMs: Date.parse('2026-11-20T19:00:00Z') }), true, 'the end instant itself (<=)');
  // No end hour: midnight after the day.
  const allDay = { scheduled_date: '2026-11-20', arrival_end_hour: null };
  assert.equal(jobWindowOver({ job: allDay, nowMs: Date.parse('2026-11-21T04:59:00Z') }), false);
  assert.equal(jobWindowOver({ job: allDay, nowMs: Date.parse('2026-11-21T05:00:00Z') }), true);
  // An undated job has no cutoff; an unreadable day is left to the server.
  assert.equal(jobWindowOver({ job: { scheduled_date: null, arrival_end_hour: 14 }, nowMs: Date.parse('2030-01-01T00:00:00Z') }), false);
  assert.equal(jobWindowOver({ job: { scheduled_date: 'soon', arrival_end_hour: 14 }, nowMs: Date.parse('2030-01-01T00:00:00Z') }), false);
  // The SQL it mirrors.
  const sql = read('supabase/migrations/20261116200400_post_window.sql');
  assert.match(sql, /select p_date is not null and public\.job_window_end\(p_date, p_end_hour\) <= p_at/);
  assert.match(read('supabase/migrations/20261111100000_lifecycle_shared.sql'), /coalesce\(p_arrival_end_hour, 24\)::int\)\)\s*at time zone 'America\/New_York'/);
});

test('R-E (A4-07): jobWindowEndMs is the one window-end formula, and every window check reads it', () => {
  // 20 November 2026 is EST (UTC-5).
  assert.equal(rules.jobWindowEndMs({ scheduled_date: '2026-11-20', arrival_end_hour: 14 }), Date.parse('2026-11-20T19:00:00Z'));
  assert.equal(rules.jobWindowEndMs({ scheduled_date: '2026-11-20', arrival_end_hour: null }), Date.parse('2026-11-21T05:00:00Z'), '24 when open-ended');
  assert.equal(rules.jobWindowEndMs({ scheduled_date: null, arrival_end_hour: 14 }), null, 'undated');
  assert.equal(rules.jobWindowEndMs({ scheduled_date: 'soon', arrival_end_hour: 14 }), null, 'unreadable');
  const src = read('lib/paymentRules.ts');
  assert.equal(src.split('arrival_end_hour ?? 24)').length - 1, 1, 'the formula is written once');
  assert.equal(src.split('const windowEnd = jobWindowEndMs(job);').length - 1, 3, 'the three window checks read it');
});

test('the four booked-time refusals are the server\'s own words, and every new timing refusal reaches the user as written', () => {
  const sql = read('supabase/migrations/20261116200400_post_window.sql');
  for (const sentence of Object.values(BOOKED_TIME_PASSED)) {
    assert.ok(sql.includes(`raise exception '${sentence.replace(/'/g, "''")}'`), sentence);
  }
  const trip = read('supabase/migrations/20261116200300_trip_day.sql');
  assert.match(trip, /raise exception 'This job is booked for %; the trip and the start open on that day\.',\s*to_char\(v_job\.scheduled_date, 'FMDay, FMMonth FMDD'\);/);
  const shown = [
    ...Object.values(BOOKED_TIME_PASSED),
    'This job is booked for Tuesday, December 1; the trip and the start open on that day.',
    'That time has already passed. Pick a later window or another day.',
    'Posting is paused right now. Please try again shortly.',
  ];
  for (const sentence of shown) {
    assert.equal(userMessage({ message: sentence, code: 'P0001' }), sentence, `${sentence} is shown unchanged`);
  }
  assert.ok(sql.includes("raise exception 'That time has already passed. Pick a later window or another day.'"));
});

test('beside the booked-day refusal, one line points the worker to his own Cancel This Job', () => {
  const refusal = { message: 'This job is booked for Tuesday, December 1; the trip and the start open on that day.' };
  assert.equal(copy.isBookedDayRefusal(refusal), true);
  assert.equal(copy.isBookedDayRefusal({ message: 'Network request failed' }), false);
  assert.equal(copy.isBookedDayRefusal(null), false);
  assert.equal(
    copy.bookedDayCancelLine('Dana'),
    'If the day has to change, use Cancel This Job on this page. Dana is refunded in full.'
  );
  // The same promise the worker's own cancel confirm makes for a held payment.
  assert.match(copy.workerCancelConfirm({ customerFirstName: 'Dana', paid: 'held' }).message, /^Dana is refunded in full\./);
  const worker = read('screens/WorkerJobScreen.tsx');
  assert.match(worker, /return isBookedDayRefusal\(error\) \? `\$\{text\} \$\{bookedDayCancelLine\(clientFirstName\)\}` : text;/);
  assert.match(worker, /await alertAsync\('Could not start job', refusalText\(error\)\);/);
  assert.match(worker, /await alertAsync\('Could not update your status', refusalText\(markError\)\);/);
  assert.match(worker, /title="Cancel This Job"/, 'the button the line names is on the page');
});

test('a cancelled job whose payment is still held with no direction says Brazos reviews it, never refunded or paid', () => {
  const worker = read('screens/WorkerJobScreen.tsx');
  // A2-M5 T3: and directed nowhere, as the server's list has it (no transfer, no release asked).
  assert.match(worker, /const heldForReview =\s+lifecycle === 'cancelled' &&\s+!!payment &&\s+isHeld\(payment\) &&\s+!isRefundQueued\(payment\) &&\s+\(payment\.transfer_cents \?\? 0\) === 0 &&\s+!isReleaseRequested\(payment\);/);
  assert.match(worker, /if \(heldForReview\) return 'This job’s payment is held until Brazos reviews it\.';/);
  // A2-M5 4d-1: no take and no "yours when the customer approves": the held payment stands in the
  // hero place in the breakdown row's words (tests/a2m5Repairs.test.mjs draws the card).
  assert.match(worker, /\{heldForReview \? \(\s+payment\.charge_amount_cents != null \? \(\s+<View style=\{styles\.heldFact\}>\s+<MoneyText cents=\{payment\.charge_amount_cents\} state=\{payment\.status\} captionHidden \/>\s+<Text style=\{styles\.heldFactLabel\}>Customer’s Payment · Held<\/Text>/);
  // The refund and the fee are decided first: a queued refund is never "held for review".
  const note = worker.slice(worker.indexOf("if (lifecycle === 'cancelled') {"), worker.indexOf("return 'This job was cancelled. Nothing is held for it.';"));
  assert.ok(note.indexOf('isRefundQueued(payment)') < note.indexOf('if (heldForReview)'));
});

test('an open job past its booked window offers no accept, counter or decline, and says the server\'s sentence', () => {
  const detail = read('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /const windowOver = canAccept && jobWindowOver\(\{ job, nowMs: serverNowMs\(\) \}\);\s*const canDecideBids = canAccept && !windowOver;/);
  assert.match(detail, /canAccept=\{canDecideBids\}/);
  assert.match(detail, /!canDecideBids \|\| !cardsRead\) return;/, 'an Accept & pay push opens no confirm after the window');
  assert.match(detail, /\{windowOver \? \([\s\S]{0,400}<Text style=\{styles\.noticeText\}>\{BOOKED_TIME_PASSED\.customerAccept\}<\/Text>/);
  assert.match(read('lib/jobSeries.ts'), /A visit that is today or gone by then \(after a posting pause,\s*\* say\) is never posted/);
});

// A4 wiring (priority 2): the worker's market job page. A new bid is refused once the window is over
// (refuse_offer_after_window), so neither bid path, nor the payout card that stands in for them, is offered,
// and the page says the server's sentence in its own notice card, in place of the "send a new one below" note.
test('the market job page past its booked window offers no bid and says the server\'s sentence', () => {
  const page = read('screens/JobDetailScreen.tsx');
  const flat = page.replace(/\s+/g, ' ');
  assert.match(page, /import \{ BOOKED_TIME_PASSED, jobWindowOver \} from '\.\.\/lib\/paymentRules';/);
  assert.match(page, /const windowOver = jobWindowOver\(\{ job, nowMs: serverNowMs\(\) \}\);/);
  // Executed as written: the one condition both bid buttons and the payout card hang on.
  const showBidBar = new Function('isOwnJob', 'checking', 'activeBid', 'windowOver',
    `return ${/const showBidBar = ([^;]+);/.exec(page)[1]};`);
  assert.equal(showBidBar(false, false, null, false), true, 'before the window: offered');
  assert.equal(showBidBar(false, false, null, true), false, 'after it: not offered');
  assert.equal(showBidBar(true, false, null, false), false, 'own job: never');
  assert.equal(showBidBar(false, false, { id: 'b' }, false), false, 'a live bid: never');
  assert.match(flat, /const floatingBid = showBidBar && !payoutsGateShown;/);
  assert.match(flat, /\{showBidBar && !payoutsGateShown \? \( <FloatingAction title="Write a Bid"/, 'Write a Bid and the listed-price bid');
  assert.match(flat, /\{showBidBar && payoutsGateShown \? \( <PayoutsGateCard status=\{payouts\} framed \/> \) : null\}/);
  assert.equal((flat.match(/showBidBar/g) ?? []).length, 4, 'no other bid surface');
  assert.match(
    flat,
    /\{windowOver \? \( (?:\/\/[^<]*)?<Card style=\{styles\.noticeCard\}> <Ionicons name="time-outline" size=\{20\} color=\{colors\.textMuted\} \/> <Text style=\{styles\.noticeText\}>\{BOOKED_TIME_PASSED\.newBid\}<\/Text> <\/Card> \) : bidLapsed \? \(/,
    'the server\'s sentence, in place of "You can send a new one below"'
  );
  assert.equal(rules.BOOKED_TIME_PASSED.newBid, "This job's booked time has passed, so it is closed to new bids.");
});

// A4 wiring (priority 2): the customer's bid page and the compare page, and the one offer form. Past the
// window accept_offer refuses an acceptance and refuse_offer_after_window a new bid or counter on a market job.
test('the bid page past the booked window offers no accept or counter, keeps Decline, and says the server\'s sentence', () => {
  const page = read('screens/BidDetailScreen.tsx');
  const flat = page.replace(/\s+/g, ' ');
  assert.match(page, /import \{ BOOKED_TIME_PASSED, jobWindowOver \} from '\.\.\/lib\/paymentRules';/);
  assert.match(page, /const canDecide = effective === 'pending' && isMyTurn;[^]*?const windowOver = jobWindowOver\(\{ job, nowMs: serverNowMs\(\) \}\);/);
  assert.match(
    flat,
    /\.\.\.\(canDecide && windowOver \? \[ \{ (?:\/\/[^<]*)?content: \( <View style=\{\[styles\.waitingCard, litCardStyle\(isDark\)\]\}> <Ionicons name="time-outline" size=\{18\} color=\{colors\.textMuted\} \/> <Text style=\{styles\.waitingText\}>\{BOOKED_TIME_PASSED\.customerAccept\}<\/Text> <\/View> \), \}, \] : canDecide \? \[/,
    'the sentence in place of the three consequence lines'
  );
  assert.match(flat, /\{windowOver \? null : \( <Button title=\{COUNTER_OFFER_ACTION_LABEL\}/, 'no Counter');
  assert.match(flat, /\{windowOver \? null : \( <Button title=\{acceptOfferActionLabel\(formatBudget\(offer\.amount_cents\), false\)\}/, 'no Accept');
  assert.match(flat, /<View style=\{styles\.actionRow\}> <Button title=\{declineOfferActionLabel\(false\)\}/, 'Decline stays, unconditioned');
  assert.equal((flat.match(/windowOver \? null/g) ?? []).length, 2);
  // Decline is not refused after the window: the trigger is on INSERT (a new bid or counter) only.
  const sql = read('supabase/migrations/20261116200400_post_window.sql');
  assert.match(sql, /a BEFORE INSERT trigger on job_offers/);
});

test('the compare page past the booked window says the server\'s sentence in its framing line', () => {
  const page = read('screens/CompareBidsScreen.tsx');
  assert.match(page, /const windowOver = jobWindowOver\(\{ job, nowMs: serverNowMs\(\) \}\);/);
  const framing = new Function('windowOver', 'BOOKED_TIME_PASSED', `return ${/<Text style=\{styles\.headerFraming\}>\s*\{([^}]+)\}\s*<\/Text>/.exec(page)[1]};`);
  assert.equal(framing(true, BOOKED_TIME_PASSED), BOOKED_TIME_PASSED.customerAccept);
  assert.equal(framing(false, BOOKED_TIME_PASSED), 'Price matters, but fit, reliability and included work determine value.');
  // The page performs no write: each row still opens the bid page, which offers no accept after the window.
  assert.doesNotMatch(page, /acceptOffer|counterOffer|declineOffer/);
});

test('the offer form past the booked window sends nothing and says the server\'s sentence for the side that sends', async () => {
  const form = read('components/OfferComposer.tsx');
  assert.match(form, /import \{ BOOKED_TIME_PASSED, jobWindowOver \} from '\.\.\/lib\/paymentRules';/);
  // Executed as written: the condition, the title and the sentence.
  const m = /if \((context\.kind === 'bid' \? jobWindowOver\(\{ job: context\.job, nowMs: serverNowMs\(\) \}\) : !!context\.jobWindow && jobWindowOver\(\{ job: context\.jobWindow, nowMs: serverNowMs\(\) \}\))\) \{\s*await alertAsync\(\s*([^,]+),\s*([^;]+?)\s*\);\s*return;\s*\}/.exec(form);
  assert.ok(m, 'the guard');
  const said = [];
  const guard = new Function('context', 'isBid', 'jobWindowOver', 'BOOKED_TIME_PASSED', 'alertAsync', 'serverNowMs',
    `return (async () => { if (${m[1]}) { await alertAsync(${m[2]}, ${m[3]}); return 'stopped'; } return 'sent'; })();`);
  const run = (context, serverNowMs = () => Date.now()) => guard(context, context.kind === 'bid', jobWindowOver, BOOKED_TIME_PASSED, async (t, b) => { said.push([t, b]); }, serverNowMs);
  const over = { scheduled_date: '2020-01-02', arrival_end_hour: 14 };
  const ahead = { scheduled_date: '2999-01-02', arrival_end_hour: 14 };
  const offer = { customer_id: 'c', worker_id: 'w', awaiting_id: 'w' };
  assert.equal(await run({ kind: 'bid', job: ahead }), 'sent');
  assert.equal(await run({ kind: 'bid', job: { scheduled_date: null, arrival_end_hour: null } }), 'sent', 'undated: no cutoff');
  assert.equal(await run({ kind: 'bid', job: over }), 'stopped');
  assert.equal(await run({ kind: 'counter', offer, jobWindow: over }), 'stopped', 'the worker counters');
  assert.equal(await run({ kind: 'counter', offer: { ...offer, awaiting_id: 'c' }, jobWindow: over }), 'stopped', 'the customer counters');
  assert.equal(await run({ kind: 'counter', offer, jobWindow: ahead }), 'sent');
  assert.equal(await run({ kind: 'counter', offer: { ...offer, awaiting_id: 'c' } }), 'sent', 'no window from the host: the server decides');
  // A4-R1: the server's time decides, not the phone's: the same window by a server clock past it.
  const pastAhead = () => Date.parse('3000-01-01T00:00:00Z');
  assert.equal(await run({ kind: 'bid', job: ahead }, pastAhead), 'stopped', 'the server says over');
  assert.equal(await run({ kind: 'counter', offer, jobWindow: over }, () => Date.parse('2020-01-01T00:00:00Z')), 'sent', 'the server says open');
  assert.deepEqual(said, [
    ['Could not send bid', BOOKED_TIME_PASSED.newBid],
    ['Could not send counter-offer', BOOKED_TIME_PASSED.newBid],
    ['Could not send counter-offer', BOOKED_TIME_PASSED.customerCounter],
    ['Could not send bid', BOOKED_TIME_PASSED.newBid],
  ]);
  // It runs first, before any field check, and before the in-flight guard is taken.
  assert.match(form, /async function handleSubmit\(\) \{\s*if \(submittingRef\.current\) return;\s*\/\/[^]*?if \(context\.kind === 'bid' \? jobWindowOver/);
  assert.ok(form.indexOf("context.kind === 'bid' ? jobWindowOver") < form.indexOf('const { amountCents, problem } = validateOfferAmount(amount);'));
  // The worker's market job page hands its counter form the job's window; the customer's counter sheet
  // (screens/CounterofferScreen.tsx) passes none, and its hosts offer no counter after the window.
  assert.match(read('screens/JobDetailScreen.tsx'), /countersRemaining: countersLeft,\s*\/\/[^\n]*\n\s*jobWindow: job,/);
  assert.doesNotMatch(read('screens/CounterofferScreen.tsx'), /jobWindow/);
});
