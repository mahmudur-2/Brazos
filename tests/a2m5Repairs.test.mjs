// A2-M5 PART 4a: the repair orders.
//   F1  while payments are paused, a hire waiting for its payment says so on Home's attention card and
//       on its My Jobs row, though both draw the stage rail of a live job; with payments open nothing changes.
//   F2  past the booked time, the customer's bid card never says "You countered — waiting…" for a bid that
//       waits on the customer.
// The lines are executed where they are pure (lib/jobLifecycle.ts, lib/offers.ts, and the screens'
// expressions extracted as written); the wiring around them is pinned as text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
// Comments out (a trailing // comment too), then one line.
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1').replace(/\s+/g, ' ');
const ONCE = (path, re) => {
  const all = [...code(path).matchAll(new RegExp(re.source, 'g'))];
  assert.equal(all.length, 1, `${path}: ${re} must match once`);
  return all[0][1];
};

const { myJobsNextAction, pausedPaymentNotice } = await import(pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href);

const PAUSED = 'Payments are paused — check back shortly';
const STATES = ['draft', 'open', 'pending_payment', 'confirmed', 'en_route', 'arrived', 'in_progress', 'awaiting_approval', 'disputed', 'completed', 'cancelled', 'unknown'];

test('F1 · [executed] the paused notice is the job page\'s paused line, for a hire waiting for its payment only, and only while paused', () => {
  assert.equal(pausedPaymentNotice({ state: 'pending_payment', checkoutOpen: false }), PAUSED);
  assert.equal(
    pausedPaymentNotice({ state: 'pending_payment', checkoutOpen: false }),
    myJobsNextAction({ perspective: 'customer', state: 'pending_payment', checkoutOpen: false }),
    'one set of words: the job page\'s line'
  );
  assert.doesNotMatch(PAUSED, /checkout|pay now|complete/i, 'no call to pay');
  for (const checkoutOpen of [true, undefined]) {
    assert.equal(pausedPaymentNotice({ state: 'pending_payment', checkoutOpen }), undefined, `open (${checkoutOpen}): no notice`);
  }
  for (const state of STATES.filter((s) => s !== 'pending_payment')) {
    assert.equal(pausedPaymentNotice({ state, checkoutOpen: false }), undefined, `${state}: no notice`);
  }
});

test('F1 · [executed] a live card keeps the notice as its action line; without one it is the card it was', () => {
  const expr = ONCE('components/HubCard.tsx', /const actionLine = (notice \?\? \(live \? undefined : nextAction\));/);
  const actionLine = new Function('notice', 'live', 'nextAction', `return ${expr};`);
  const LIVE = { stage: 'booked' };
  assert.equal(actionLine(PAUSED, LIVE, PAUSED), PAUSED, 'paused, live: the line shows beside the rail');
  assert.equal(actionLine(undefined, LIVE, 'Complete checkout — protect the payment'), undefined, 'open, live: the rail alone, as before');
  assert.equal(actionLine(undefined, null, '1 bid to review'), '1 bid to review', 'not live: the next-action line, as before');
  assert.equal(actionLine(undefined, undefined, undefined), undefined);
});

test('F1 · [static] both layouts draw the action line whether or not the rail is drawn', () => {
  const card = code('components/HubCard.tsx');
  const rowAt = card.indexOf("if (layout === 'row') {");
  const row = card.slice(rowAt, card.indexOf('<View style={styles.statusRow}>', rowAt));
  const full = card.slice(card.indexOf('<View style={styles.statusRow}>', rowAt));
  assert.match(row, /\{live \? <StageRail status=\{live\} onChat=\{onChat\} chatLabel=\{chatLabel\} thin \/> : null\} \{actionLine \? \(/, 'row: the rail, then the line');
  assert.match(full, /\{live \? <StageRail status=\{live\} onChat=\{onChat\} chatLabel=\{chatLabel\} \/> : null\}/, 'card: the rail');
  assert.match(full, /\{actionLine \? \( <View style=\{styles\.nextActionWrap\}>/, 'card: the line in the action area');
  assert.match(card, /const \[actionHead, actionTail\] = splitNextAction\(actionLine \?\? ''\);/);
  assert.doesNotMatch(card, /nextAction && !live|\) : nextAction \? \(/, 'no branch that hides the line behind the rail');
});

test('F1 · [static] Home\'s attention card and the customer\'s My Jobs row pass the pause they read; Home\'s recency list does not', () => {
  const NOTICE = /notice=\{pausedPaymentNotice\(\{ state, checkoutOpen \}\)\}/g;
  const home = code('screens/HomeScreen.tsx');
  assert.equal((home.match(NOTICE) ?? []).length, 1, 'Home: the attention card only ("Your jobs" makes no claim about what is owed)');
  const attention = home.slice(home.indexOf('items.slice(0, ATTENTION_CAP).map('), home.indexOf('items.slice(0, ATTENTION_CAP).map(') + 1600);
  assert.match(attention, /nextAction=\{line\} notice=\{pausedPaymentNotice\(\{ state, checkoutOpen \}\)\} live=\{live\}/);
  const hub = code('screens/MyJobsHubScreen.tsx');
  assert.equal((hub.match(NOTICE) ?? []).length, 1, 'My Jobs: the customer\'s posted row only');
  assert.match(hub, /perspective: 'customer', state, bidCount: job\.bid_count,[^}]*checkoutOpen, \}\)\} notice=\{pausedPaymentNotice\(\{ state, checkoutOpen \}\)\}/);
});

// F2: lib/offers.ts executed for its pure helpers, stubbed as tests/counterCap.test.mjs stubs it.
const offers = await import(
  'data:text/javascript;charset=utf-8;base64,' +
    Buffer.from(
      stripTypeScriptTypes(read('lib/offers.ts'), { mode: 'strip' })
        .replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;')
        .replace(/import \{ PUBLIC_PROFILE_COLUMNS[^}]*\} from '\.\/profiles';/, "const PUBLIC_PROFILE_COLUMNS = 'id';")
        .replace(/import \{ moneyCeilingError \} from '\.\/validation';/, 'const moneyCeilingError = () => null;')
        .replace(/import \{ serverNowMs \} from '\.\/serverClock';/, 'const serverNowMs = () => Date.now();')
        .replace(/import \{ coordinateLocationError \} from '\.\/locationPrivacy';/, 'const coordinateLocationError = () => null;')
        .replace(/import \{ track \} from '\.\/observability\/analytics';/, 'const track = () => {};'),
      'utf8'
    ).toString('base64')
);

test('F2 · [executed] past the booked time, a bid that waits on the customer shows its facts with no waiting line and no decision buttons', () => {
  const detail = 'screens/ClientJobDetailScreen.tsx';
  const card = 'components/OfferCard.tsx';
  // The page's own expressions, as written: the host's accept gate and the in-place turn.
  const canDecideBids = new Function('canAccept', 'windowOver', `return ${ONCE(detail, /const canDecideBids = (canAccept && !windowOver);/)};`);
  const turn = new Function('user', 'bid', 'isOfferActionableBy', `return ${ONCE(detail, /canDecide: (!!user && isOfferActionableBy\(bid, user\.id\)),/)};`);
  assert.match(code(detail), /canAccept=\{canDecideBids\}/);
  assert.match(code(detail), /inPlace=\{\{[^]*?\.\.\.bidTurn\(bid\),/);
  // The card's in-place branches, as written.
  const buttons = new Function('canAcceptThisOffer', 'inPlace', `return ${ONCE(card, /\) : (canAcceptThisOffer && inPlace\.canDecide) \? \( <View style=\{styles\.inPlaceActions\}>/)};`);
  const waiting = new Function('pendingNow', 'inPlace', `return ${ONCE(card, /\) : (pendingNow && !inPlace\.canDecide) \? \( <View style=\{styles\.inPlaceWaiting\}>/)};`);
  assert.match(code(card), /const canAcceptThisOffer = canAccept && offer\.status === 'pending';/);
  assert.match(code(card), /const pendingNow = effectiveOfferStatus\(offer\) === 'pending';/);
  assert.match(code(card), /You countered — waiting for \{name\} to respond\./);

  const CUSTOMER = { id: 'customer-1' };
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const draw = (bid, windowOver) => {
    const canAccept = canDecideBids(true, windowOver);
    const inPlace = { canDecide: turn(CUSTOMER, bid, offers.isOfferActionableBy) };
    const pendingNow = offers.effectiveOfferStatus(bid) === 'pending';
    const canAcceptThisOffer = canAccept && bid.status === 'pending';
    return { buttons: buttons(canAcceptThisOffer, inPlace), waiting: waiting(pendingNow, inPlace) };
  };
  // One pending bid from the worker, waiting on the customer (the seed's "Replace a doorknob").
  const workersBid = { status: 'pending', expires_at: future, awaiting_id: CUSTOMER.id, author_id: 'worker-1' };
  assert.deepEqual(draw(workersBid, true), { buttons: false, waiting: false }, 'past the window: facts only');
  assert.deepEqual(draw(workersBid, false), { buttons: true, waiting: false }, 'inside the window: Decline, Counter, Accept');
  // The customer's own counter is the newest offer: the waiting line is true, before and after the window.
  const customersCounter = { status: 'pending', expires_at: future, awaiting_id: 'worker-1', author_id: CUSTOMER.id };
  assert.deepEqual(draw(customersCounter, false), { buttons: false, waiting: true });
  assert.deepEqual(draw(customersCounter, true), { buttons: false, waiting: true });
});

// ---------------------------------------------------------------------------
// A2-M5 PART 4b: the look tickets (A2, A4-A7, A9, A10). Executed where the line is pure.
// ---------------------------------------------------------------------------

const { jobPillLabel, releaseDeadlineMs, isRefundFailureRecorded } = await import(pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href);
const rules = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);

test('A2 · [static] the success screen\'s main action is the shared main Button; the secondary keeps its form at the Button\'s height', () => {
  const t = code('ui/templates/SuccessScreen.tsx');
  assert.match(t, /import \{ Button \} from '\.\.\/\.\.\/components\/Button';/);
  assert.match(t, /if \(!secondary\) \{ return \( <Button key=\{action\.label\} title=\{action\.label\} onPress=\{action\.onPress\} style=\{actionsLayout === 'row' \? styles\.buttonInRow : undefined\} \/> \); \}/);
  // No variant passed: Button's primary, whose dark form carries the glow (shadows.ctaDark).
  assert.match(code('components/Button.tsx'), /variant = 'primary',/);
  assert.match(code('components/Button.tsx'), /variant === 'primary' && !isDisabled && isDark \? shadows\.ctaDark : null/);
  assert.doesNotMatch(t, /primary: \{ backgroundColor: colors\.forest, \}/, 'the template\'s own forest fill is gone');
  assert.match(t, /button: \{ minHeight: controls\.buttonHeightDefault,/);
  // The Job Confirmed screen still names its two actions as before (View Job is the main one).
  assert.match(code('screens/JobConfirmedScreen.tsx'), /label: 'View Job', onPress: \(\) => navigation\.popTo\('ClientJobDetail', \{ job \}\), \}, \{ label: `Message \$\{worker\?\.full_name \?\? 'worker'\}`, variant: 'secondary',/);
});

test('A4 · [executed] the worker\'s row for a reported issue says it once (the pill) and has no line; every other row keeps its line', () => {
  const expr = ONCE('screens/MyJobsHubScreen.tsx', /nextAction=\{ (state === 'disputed' \? undefined : myJobsNextAction\(\{ perspective: 'worker', state, reviewedByMe: reviewedJobIds\.has\(job\.id\), releaseDeadline: isRefundFailureRecorded\(payments\[job\.id\]\) \? null : releaseDeadlineMs\(job\), nowMs, \}\)) \}/);
  const line = new Function('state', 'myJobsNextAction', 'reviewedJobIds', 'job', 'isRefundFailureRecorded', 'payments', 'releaseDeadlineMs', 'nowMs', `return ${expr};`);
  const row = (state) => line(state, myJobsNextAction, new Set(), { id: 'j', release_due_at: null }, isRefundFailureRecorded, {}, releaseDeadlineMs, Date.now());
  assert.equal(row('disputed'), undefined);
  assert.equal(jobPillLabel('disputed', 'held'), 'Issue reported', 'the pill keeps the fact');
  for (const state of ['pending_payment', 'confirmed', 'en_route', 'arrived', 'in_progress', 'awaiting_approval', 'completed', 'cancelled']) {
    assert.equal(row(state), myJobsNextAction({ perspective: 'worker', state, reviewedByMe: false, releaseDeadline: null }), state);
  }
  // The customer's row and the shared line are untouched (the customer's job page shows that line).
  assert.equal(myJobsNextAction({ perspective: 'customer', state: 'disputed' }), 'Issue reported — release is frozen');
});

test('A5 · [static] the counter row says "Respond" twice, not three times: the pill and the one action line', () => {
  const hub = code('screens/MyJobsHubScreen.tsx');
  assert.match(hub, /subtitle=\{ awaitingMe \? `\$\{clientFirstName\} sent you a \$\{COUNTER_OFFER_WORD\}` : clientName \}/);
  assert.match(hub, /statusLabel=\{awaitingMe \? 'Respond' : undefined\}/);
  assert.match(hub, /if \(awaitingMe\) return `Respond to the \$\{COUNTER_OFFER_WORD\}`;/);
  assert.doesNotMatch(hub, /(counter-offer|\$\{COUNTER_OFFER_WORD\}) — respond/);
  // The who line wraps rather than cut "counter-offer" to "counter-…" (picture 26-MyJobsHub-worker-blake-counter).
  const card = code('components/HubCard.tsx');
  assert.match(card, /\{subtitle \? \( <Text style=\{styles\.rowWho\} numberOfLines=\{2\}> \{subtitle\} <\/Text> \) : null\}/);
});

test('A6 · [executed] every My Jobs row has its category · area line again; the age only on an open job', () => {
  const card = code('components/HubCard.tsx');
  const rowAt = card.indexOf("if (layout === 'row') {");
  const row = card.slice(rowAt, card.indexOf('<View style={styles.statusRow}>', rowAt));
  assert.match(row, /<Text style=\{styles\.rowTitle\} numberOfLines=\{1\}> \{title\} <\/Text> (?:\{\} )?\{metaLine \? \( <Text style=\{styles\.rowWho\} numberOfLines=\{2\}> \{timeLabel \? `\$\{metaLine\}\\u00A0· \$\{timeLabel\.replace\(\/ \/g, '\\u00A0'\)\}` : metaLine\} <\/Text> \) : null\} <View style=\{styles\.rowStatus\}>/, 'the quiet line sits under the title');
  const shown = new Function('metaLine', 'timeLabel', `return ${ONCE('components/HubCard.tsx', /\{(timeLabel \? `\$\{metaLine\}\\u00A0· \$\{timeLabel\.replace\(\/ \/g, '\\u00A0'\)\}` : metaLine)\}/)};`);
  // The age and its dot never split at a wrap: only the space after the dot can break.
  assert.equal(shown('Yard work · Waco, TX', '1h ago'), 'Yard work · Waco, TX\u00A0· 1h\u00A0ago');
  assert.equal(shown('Handyman · Castle Heights', 'just now'), 'Handyman · Castle Heights\u00A0· just\u00A0now');
  assert.equal(shown('Handyman · Castle Heights', undefined), 'Handyman · Castle Heights');
  const hub = code('screens/MyJobsHubScreen.tsx');
  const age = new Function('formatTimeAgoShort', `return function (open, createdAt) { ${ONCE('screens/MyJobsHubScreen.tsx', /function openJobAge\(open: boolean, createdAt: string\): string \| undefined \{ (return open \? formatTimeAgoShort\(createdAt\) : undefined;) \}/)} };`)(() => '2h ago');
  assert.equal(age(true, '2026-11-16T00:00:00Z'), '2h ago');
  assert.equal(age(false, '2026-11-16T00:00:00Z'), undefined);
  // All four row kinds: the line, and the age through the open-only rule.
  assert.equal((hub.match(/metaLine=\{metaLineFor\(job\)\}/g) ?? []).length, 4);
  assert.equal((hub.match(/timeLabel=\{openJobAge\(state === 'open', job\.created_at\)\}/g) ?? []).length, 2, 'working and posted: the derived state');
  assert.equal((hub.match(/timeLabel=\{openJobAge\(job\.status === 'open', job\.created_at\)\}/g) ?? []).length, 2, 'pending and settled bids: the job\'s status');
  assert.doesNotMatch(hub, /timeLabel=\{formatTimeAgo\(/);
  // Home's card layout is the loved one: its age stays where it was.
  assert.match(card, /\{timeLabel \? <Text style=\{styles\.time\}>\{timeLabel\}<\/Text> : null\}/);
});

test('A7 · [static] the availability note\'s hint is a short true example', () => {
  const screen = code('screens/ServicesPricingScreen.tsx');
  assert.match(screen, /placeholder="Availability note — e\.g\. Weekends"/);
  assert.doesNotMatch(screen, /Weekday evenings, weekends/);
  // That it fits the 320 pt field is shown by a picture (shots/m5-4b-320), not by this test.
});

test('A9 · [executed] past the booked time neither card of the bid promises "until <date>"', () => {
  const card = 'components/OfferCard.tsx';
  const expiry = new Function('pendingNow', 'inPlace', 'offerExpiryLabel', 'offer', `return ${ONCE(card, /const expiry = (pendingNow && !inPlace\.windowOver \? offerExpiryLabel\(offer\.expires_at\) : null);/)};`);
  const offer = { expires_at: '2026-11-23T12:00:00Z' };
  const label = () => 'Nov 23';
  assert.equal(expiry(true, { windowOver: true }, label, offer), null, 'past the window: no "Open until"');
  assert.equal(expiry(true, { windowOver: false }, label, offer), 'Nov 23');
  assert.equal(expiry(true, {}, label, offer), 'Nov 23', 'absent is false');
  assert.equal(expiry(false, { windowOver: false }, label, offer), null);
  assert.match(code(card), /\{expiry \? <Text style=\{styles\.inPlaceNote\}>Open until \{expiry\} — then it expires on its own\.<\/Text> : null\}/);
  assert.match(code('screens/ClientJobDetailScreen.tsx'), /countersRemaining: bidTurn\(bid\)\.countersLeft, \}\), windowOver, \}\}/);
  assert.match(code('screens/ClientJobDetailScreen.tsx'), /const windowOver = canAccept && jobWindowOver\(\{ job, nowMs: serverNowMs\(\) \}\);/);
  // The worker's own bid card (JobDetail): accept_offer's sentence for the worker, no date.
  const note = new Function('windowOver', 'BOOKED_TIME_PASSED', 'activeBid', 'offerExpiryLabel', `return ${ONCE('screens/JobDetailScreen.tsx', /<Text style=\{styles\.bidNote\}> (?:\{\} )?\{(windowOver \? BOOKED_TIME_PASSED\.workerAccept : activeBid\.expires_at \? `The customer can accept it until \$\{offerExpiryLabel\(activeBid\.expires_at\)\} — after that it expires on its own\. Check My Jobs for updates\.` : 'You’ve already bid on this job\. Check My Jobs for updates\.')\} <\/Text>/)};`);
  const past = note(true, rules.BOOKED_TIME_PASSED, offer, label);
  assert.equal(past, "This job's booked time has passed, so it can no longer be accepted. Ask the customer to post it again with a new time.");
  assert.doesNotMatch(past, /until|expires/);
  assert.match(note(false, rules.BOOKED_TIME_PASSED, offer, label), /^The customer can accept it until Nov 23 — after that it expires on its own\./);
  assert.match(code('screens/JobDetailScreen.tsx'), /const windowOver = jobWindowOver\(\{ job, nowMs: serverNowMs\(\) \}\);/);
});

test('A10 · [static] notifications switched off on the phone is the quiet notice, not the red one; the words and Open Settings stay', () => {
  const s = code('screens/NotificationSettingsScreen.tsx');
  assert.match(s, /if \(pushState\.reason === 'denied'\) \{ return \{ tone: 'quiet', text: 'Notifications are turned off for Brazos on this device\. Turn them back on in your device Settings to start receiving them\.', settings: true, \}; \}/);
  const quiet = s.slice(s.indexOf("{notice && notice.tone === 'quiet' ? ("), s.indexOf(') : notice ? ('));
  assert.match(quiet, /<Card style=\{\[styles\.quietNotice, isDark && styles\.quietNoticeDark\]\}> <Ionicons name="information-circle-outline" size=\{20\} color=\{colors\.textMuted\} \/> <Text style=\{styles\.quietNoticeText\}>\{notice\.text\}<\/Text>/);
  assert.match(quiet, /<Text style=\{styles\.noticeRetry\}>Open Settings<\/Text>/);
  assert.doesNotMatch(quiet, /danger/, 'no red in the quiet notice');
  // The same form as the job page's booked-time notice (its fill, rim and corner).
  const form = /\{ flexDirection: 'row', alignItems: 'center', gap: spacing\.sm, borderRadius: radius\.xl, borderColor: colors\.mint2, backgroundColor: colors\.mint, \}/;
  assert.match(s, new RegExp('quietNotice: ' + form.source));
  assert.match(code('screens/ClientJobDetailScreen.tsx'), new RegExp('noticeCard: ' + form.source));
  // The other notices keep their tones (a broken setup is still a warning).
  assert.match(s, /tone: 'warn', text: 'Brazos couldn’t set up notifications on this phone\. Check your connection and try again\.', retry: true,/);
});

// ---------------------------------------------------------------- PART 4b: the W-tickets (words)
test('W1-W4 · [static] the buttons and links read in Title Case, as the app\'s other buttons', () => {
  assert.match(code('screens/ClientJobDetailScreen.tsx'), /case 'awaiting_approval': return \{ label: 'Review & Approve the Work', onPress: openApproveOrDispute \};/);
  const services = code('screens/ServicesPricingScreen.tsx');
  assert.match(services, /accessibilityLabel="Add Service" > <Text style=\{\[styles\.addButtonText, !canAdd && styles\.addButtonTextDisabled\]\}> \{adding \? 'Adding…' : 'Add Service'\} <\/Text>/);
  const feed = code('screens/NotificationsScreen.tsx');
  assert.match(feed, /<Text style=\{styles\.markAll\}>Mark All Read<\/Text>/);
  assert.match(feed, /onPress=\{\(\) => navigation\.navigate\('NotificationSettings'\)\} [^>]*accessibilityLabel="Notification Settings"/, 'the gear says the screen\'s own title');
  assert.match(code('screens/WorkerProfileScreen.tsx'), /label="Report This Profile"/);
  for (const [file, old] of [['screens/ClientJobDetailScreen.tsx', 'Review & approve the work'], ['screens/ServicesPricingScreen.tsx', "'Add service'"], ['screens/NotificationsScreen.tsx', '>Mark all read<'], ['screens/NotificationsScreen.tsx', '"Notification settings"'], ['screens/WorkerProfileScreen.tsx', 'Report this profile']]) {
    assert.ok(!code(file).includes(old), `${file}: ${old} is gone`);
  }
});

test('LOOK-R L-4a · [executed] the price-unit chip beside "Price in dollars" is capitalised like its sibling chips', () => {
  const chip = new Function('priceUnit', `return ${ONCE('screens/ServicesPricingScreen.tsx', /<Text style=\{styles\.unitToggleText\}> \{(priceUnit === 'flat' \? '[^']*' : '[^']*')\} <\/Text>/)};`);
  assert.equal(chip('flat'), 'Flat');
  assert.equal(chip('hourly'), '/hr');
});

test('LOOK-R L-4c · [static] the past-window notice on the customer\'s job page carries "Post Again", the + sheet\'s own reuse call', () => {
  const call = "navigateAcrossTabs('Home', 'PostJob', { reuseJobId: job.id })";
  const page = code('screens/ClientJobDetailScreen.tsx');
  const notice = ONCE('screens/ClientJobDetailScreen.tsx', /\{windowOver \? \( (<Card [^]*?<\/Card>) \) : null\}/);
  assert.ok(notice.includes('{BOOKED_TIME_PASSED.customerAccept}'), 'the notice keeps its own words');
  assert.ok(notice.includes(`<Button title="Post Again" variant="secondary" onPress={() => ${call}} />`), notice);
  assert.equal(page.split('Post Again').length, 2, 'one "Post Again" on the page');
  // The same call the + sheet's "Reuse a Past Job" makes: no second path into a reused post.
  assert.ok(code('navigation/CustomerRoot.tsx').includes(call));
});

test('W5 · [executed] the worker\'s withdraw button names what it withdraws: a counter-offer on a "Your Counter-Offer" card, a bid on a bid card', () => {
  const detail = 'screens/JobDetailScreen.tsx';
  const title = new Function('activeBid', `return ${ONCE(detail, /<Button title=\{(activeBid\.parent_offer_id \? 'Withdraw Counter-Offer' : 'Withdraw Bid')\} variant="destructive" size="sm" onPress=\{\(\) => setConfirmWithdrawVisible\(true\)\}/)};`);
  const header = new Function('activeBid', `return ${ONCE(detail, /<Text accessibilityRole="header" style=\{styles\.sectionTitle\}> \{(activeBid\.parent_offer_id \? 'Your Counter-Offer' : 'Your Bid')\} <\/Text>/)};`);
  const counter = { parent_offer_id: 'o-1' };
  const bid = { parent_offer_id: null };
  assert.deepEqual([header(counter), title(counter)], ['Your Counter-Offer', 'Withdraw Counter-Offer']);
  assert.deepEqual([header(bid), title(bid)], ['Your Bid', 'Withdraw Bid']);
  // The same two words the chat's offer card uses for the worker's counter.
  assert.match(code('components/OfferCard.tsx'), /'Withdraw Counter-Offer'/);
});

test('W6 · [static] the finished work\'s video caption is "Finished Work" on every page, the form of the worker page and of the section title', () => {
  for (const file of ['screens/ApproveOrDisputeScreen.tsx', 'screens/ClientJobDetailScreen.tsx', 'screens/WorkerJobScreen.tsx']) {
    const s = code(file);
    assert.match(s, /<JobVideo [^>]*label="Finished Work" \/>/, file);
    assert.doesNotMatch(s, /label="Finished work"/, file);
  }
  assert.match(code('screens/ClientJobDetailScreen.tsx'), /\? 'Before & After' : 'Finished Work'/);
});

test('W7 · [static] the skip link\'s accessibility label is its visible words', () => {
  const s = code('screens/WorkerJobScreen.tsx');
  assert.match(s, /accessibilityLabel="Already There\? Start the Job" > <Text style=\{styles\.skipLinkText\}>Already There\? Start the Job<\/Text>/);
  assert.doesNotMatch(s, /Start job now/);
});

// ---------------------------------------------------------------------------
// A2-M5 PART 4c: W8, A11, T3. Executed where the line is pure.
// ---------------------------------------------------------------------------

// lib/offerCopy.ts executed for its pure copy, its two imports stubbed (the day label is fixed here).
const copy = await import(
  'data:text/javascript;charset=utf-8;base64,' +
    Buffer.from(
      stripTypeScriptTypes(read('lib/offerCopy.ts'), { mode: 'strip' })
        .replace(/import \{ formatShortDay \} from '\.\/time';/, "const formatShortDay = () => 'Nov 23';")
        .replace(/import \{ CANCELLATION_DISCLOSURE \} from '\.\/moneyCopy';/, "const CANCELLATION_DISCLOSURE = '';"),
      'utf8'
    ).toString('base64')
);

test('W8 · [executed] the withdraw dialog says what its button said: a counter-offer for a counter, a bid for a bid', () => {
  const detail = 'screens/JobDetailScreen.tsx';
  const dialog = code(detail).slice(code(detail).indexOf('<ConfirmDialog visible={confirmWithdrawVisible}'));
  const part = (re) => new Function('activeBid', `return ${ONCE(detail, re)};`);
  const title = part(/title=\{(activeBid\?\.parent_offer_id \? 'Withdraw your counter-offer\?' : 'Withdraw your bid\?')\}/);
  const message = part(/message=\{(`This withdraws your pending \$\{activeBid\?\.parent_offer_id \? 'counter-offer' : 'bid'\} — the customer will no longer be able to accept it\. You can send a new bid afterwards if you change your mind\.`)\}/);
  // A2-M5 4d-2: the dialog's button is "Withdraw Counter" (the form of "Withdraw Bid"), so it stays on
  // one line at 375 pt; the page's own button keeps "Withdraw Counter-Offer".
  const confirm = part(/confirmText=\{(activeBid\?\.parent_offer_id \? 'Withdraw Counter' : 'Withdraw Bid')\}/);
  const button = part(/<Button title=\{(activeBid\.parent_offer_id \? 'Withdraw Counter-Offer' : 'Withdraw Bid')\} variant="destructive"/);
  assert.match(dialog, /^<ConfirmDialog visible=\{confirmWithdrawVisible\} title=\{activeBid\?\.parent_offer_id/, 'the three are the withdraw dialog\'s own');
  const counter = { parent_offer_id: 'o-1' };
  const bid = { parent_offer_id: null };
  assert.deepEqual([button(counter), title(counter), confirm(counter)], ['Withdraw Counter-Offer', 'Withdraw your counter-offer?', 'Withdraw Counter']);
  assert.match(message(counter), /^This withdraws your pending counter-offer — /);
  // A bid keeps its words, the ones flow 03 matches.
  assert.deepEqual([button(bid), title(bid), confirm(bid)], ['Withdraw Bid', 'Withdraw your bid?', 'Withdraw Bid']);
  assert.equal(message(bid), 'This withdraws your pending bid — the customer will no longer be able to accept it. You can send a new bid afterwards if you change your mind.');
});

test('A11 · [executed] past the booked time the worker\'s card for answering a counter shows its facts and the server\'s sentence: no "Respond by", no buttons', () => {
  const detail = 'screens/JobDetailScreen.tsx';
  const card = 'components/OfferResponseActions.tsx';
  // The page's note and the card's badge, as written.
  const note = new Function('windowOver', 'BOOKED_TIME_PASSED', 'offerResponseNote', 'offerExpiryLabel', 'activeBid', `return ${ONCE(detail, /note=\{ (windowOver \? BOOKED_TIME_PASSED\.workerAccept : offerResponseNote\(\{ viewerIsWorker: true, expiresLabel: offerExpiryLabel\(activeBid\.expires_at\), \}\)) \}/)};`);
  const badge = new Function('actionsClosed', 'YOUR_MOVE_BADGE_LABEL', `return ${ONCE(card, /<StatusBadge status="pending" label=\{(actionsClosed \? undefined : YOUR_MOVE_BADGE_LABEL)\} \/>/)};`);
  // The buttons, the payouts gate and the counter form all stand behind the same flag.
  assert.match(code(detail), /actionsClosed=\{windowOver\}/);
  assert.match(code(detail), /const windowOver = jobWindowOver\(\{ job, nowMs: serverNowMs\(\) \}\);/);
  assert.match(code(detail), /\{payoutsGateShown && !windowOver \? \(/);
  assert.match(code(detail), /\{showCounterForm && !windowOver \? \(/);
  assert.match(code(card), /\{actionsClosed \? null : \( <View style=\{styles\.actions\}> <View style=\{styles\.pair\}>/);
  assert.match(code(card), /actionsClosed = false, \}: OfferResponseActionsProps\)/, 'absent is false: the chat card is unchanged');

  const counter = { expires_at: '2026-11-23T12:00:00Z' };
  const past = note(true, rules.BOOKED_TIME_PASSED, copy.offerResponseNote, copy.offerExpiryLabel, counter);
  assert.equal(past, "This job's booked time has passed, so it can no longer be accepted. Ask the customer to post it again with a new time.");
  assert.doesNotMatch(past, /Respond by|expires/);
  assert.equal(badge(true, copy.YOUR_MOVE_BADGE_LABEL), undefined, 'the plain Pending state, not "Your move"');
  // Inside the window the card is what it was.
  assert.equal(note(false, rules.BOOKED_TIME_PASSED, copy.offerResponseNote, copy.offerExpiryLabel, counter), 'Their price for this job — accepting assigns you the work at this amount. Respond by Nov 23 — after that it expires on its own.');
  assert.equal(badge(false, copy.YOUR_MOVE_BADGE_LABEL), 'Your move');
});

test('T3 · [executed] the worker\'s cancelled job says "held until Brazos reviews it" only for a payment held and directed nowhere', () => {
  const worker = 'screens/WorkerJobScreen.tsx';
  const held = new Function('lifecycle', 'payment', 'isHeld', 'isRefundQueued', 'isReleaseRequested', `return ${ONCE(worker, /const heldForReview = (lifecycle === 'cancelled' && !!payment && isHeld\(payment\) && !isRefundQueued\(payment\) && \(payment\.transfer_cents \?\? 0\) === 0 && !isReleaseRequested\(payment\));/)};`);
  const run = (lifecycle, payment) => held(lifecycle, payment, rules.isHeld, rules.isRefundQueued, rules.isReleaseRequested);
  const HELD = { status: 'held', refund_cents: 0, transfer_cents: 0, release_requested_at: null };
  // The server's case (payment_attention job_closed_money_held): a suspended customer's started job.
  assert.equal(run('cancelled', HELD), true);
  assert.equal(run('cancelled', { ...HELD, refund_cents: null, transfer_cents: null }), true, 'never-set columns read as none');
  // Every other cancelled job keeps today's sentence (or its own refund or fee sentence before it).
  assert.equal(run('cancelled', { ...HELD, refund_cents: 6000 }), false, 'a refund queued');
  assert.equal(run('cancelled', { ...HELD, transfer_cents: 500 }), false, 'a transfer directed');
  assert.equal(run('cancelled', { ...HELD, release_requested_at: '2026-11-16T00:00:00Z' }), false, 'a release asked');
  for (const status of ['refunded', 'partially_refunded', 'released', 'paid_out', 'unfunded', 'voided']) {
    assert.equal(run('cancelled', { ...HELD, status }), false, status);
  }
  assert.equal(run('cancelled', null), false, 'no payment row');
  assert.equal(run('in_progress', HELD), false, 'a live job is not cancelled');
  // The sentence and the fallback, in that order, after the refund and fee sentences.
  const note = code(worker);
  assert.match(note, /if \(heldForReview\) return 'This job’s payment is held until Brazos reviews it\.'; return 'This job was cancelled\. Nothing is held for it\.';/);
  // The row the worker reads carries the four columns (job_payment_state through payment_for_party, which nulls none of them).
  assert.match(read('lib/payments.ts'), /status, [^']*release_requested_at, transfer_cents, refund_cents/);
});

// ---------------------------------------------------------------------------
// A2-M5 PART 4d-1: the worker's payment card on a cancelled job held for Brazos's review shows facts
// only. The card is drawn to its words from its JSX as written (TypeScript's JSX transform, the page's
// own heldForReview and paymentCard), with MoneyText compiled the same way; lib/payments.ts's fee
// helpers and lib/jobs.ts's formatBudget run for real (the tests/offerComposer.test.mjs loader), and
// the payment rules, the lifecycle, the captions and the receive figure are imported as they are.
// ---------------------------------------------------------------------------

const toDataUrl = (js) => 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
const payments = await (async () => {
  const jobsJs = stripTypeScriptTypes(read('lib/jobs.ts'), { mode: 'strip' });
  const start = jobsJs.indexOf('export function formatBudget');
  const end = jobsJs.indexOf('\n}', start);
  assert.ok(start > 0 && end > start, 'formatBudget must exist in lib/jobs.ts');
  let js = stripTypeScriptTypes(read('lib/payments.ts'), { mode: 'strip' });
  for (const [from, to] of [
    [
      "import { supabase } from './supabase';",
      "const supabase = { rpc() { throw new Error('no RPC in this test'); }, from() { throw new Error('no reads in this test'); } };",
    ],
    ["from './paymentRules';", `from '${pathToFileURL(join(root, 'lib/paymentRules.ts')).href}';`],
    ["import { formatBudget } from './jobs';", jobsJs.slice(start, end + 2)],
  ]) {
    assert.ok(js.includes(from), `expected the import: ${from}`);
    js = js.replace(from, () => to);
  }
  assert.ok(!/from '\.\//.test(js), 'every runtime import is stubbed, inlined or absolute');
  return import(toDataUrl(js));
})();
const lifecycleLib = await import(pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href);
const moneyCopy = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);
const earningsMath = await import(pathToFileURL(join(root, 'lib/earningsMath.ts')).href);

const compileJsx = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: 'h', jsxFragmentFactory: 'Frag', target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^"use strict";\s*/, '');
const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
// A component runs; a Text is one run of words; anything else is its children.
const words = (node) => {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(words);
  if (typeof node !== 'object') return [String(node)];
  if (typeof node.type === 'function') return words(node.type({ ...node.props, children: node.children }));
  if (node.type === 'Text') return [words(node.children).join('')];
  return words(node.children);
};
const anyStyle = new Proxy({}, { get: () => ({}) });
const between = (source, from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} … ${to}`);
  return source.slice(start, end);
};

const moneyTextSource = between(read('ui/primitives/MoneyText.tsx'), 'export function MoneyText(', 'const stylesFor').replace('export ', '');
const MoneyTextDrawn = new Function('scope', `with (scope) { ${compileJsx(moneyTextSource)} return MoneyText; }`)({
  h, View: 'View', Text: 'Text', formatBudget: payments.formatBudget, paymentCaption: moneyCopy.paymentCaption,
  useThemeColors: () => ({ emerald: {} }), stylesFor: () => anyStyle, useModePerspective: () => 'worker', SETTLED: ['released', 'paid_out'],
});
const workerCardJs = compileJsx(between(read('screens/WorkerJobScreen.tsx'), '  const heldForReview =', '\n  return ('));

function drawWorkerCard({ job, payment }) {
  const scope = {
    h, Frag: ({ children }) => children, View: 'View', Text: 'Text',
    Card: ({ children }) => children, HeldPulse: ({ children }) => children, Ionicons: () => null, ReleasedTick: () => null,
    MoneyText: MoneyTextDrawn, PayoutNudge: ({ cents }) => h('Text', null, `[payout nudge ${payments.formatBudget(cents)}]`),
    isWorker: true, job, payment, isDark: false, colors: {}, styles: anyStyle, spacing: { xs: 4 },
    issueOpen: false, waitingOnSetup: false, clientName: 'Casey', paymentsMode: 'stripe', navigateAcrossTabs: () => {},
    // The page's own lifecycle line: deriveJobLifecycle({ job, payment, hasOpenDispute: issueOpen }).
    lifecycle: lifecycleLib.deriveJobLifecycle({ job, payment, hasOpenDispute: false }),
    paymentEyebrow: moneyCopy.paymentEyebrow, formatBudget: payments.formatBudget,
    brazosFeeCents: payments.brazosFeeCents, workerTakeCents: payments.workerTakeCents, PAYOUT_SETUP_NOTICE: payments.PAYOUT_SETUP_NOTICE,
    isCancellationFeeKept: payments.isCancellationFeeKept, isHeld: payments.isHeld, isRefundQueued: payments.isRefundQueued,
    isReleased: payments.isReleased, isReleaseRequested: payments.isReleaseRequested,
    isPayoutOnItsWay: rules.isPayoutOnItsWay, isRefundArranged: rules.isRefundArranged, isRefundFailed: rules.isRefundFailed,
    workerReceivesCents: earningsMath.workerReceivesCents,
    deriveJobLifecycle: lifecycleLib.deriveJobLifecycle, isRefundFailureRecorded: lifecycleLib.isRefundFailureRecorded,
    releaseAtLabel: lifecycleLib.releaseAtLabel, releaseDeadlineMs: lifecycleLib.releaseDeadlineMs,
  };
  return words(new Function('scope', `with (scope) { ${workerCardJs} return paymentCard; }`)(scope));
}

test('4d-1 · [executed] a cancelled job held for review: the held payment and the sentence, no "$0", no fee, no "You Get"; every other card is what it was', () => {
  // The picture's row: $35 job, $2.63 each side's fee, $37.63 charged and held.
  const ROW = {
    id: 'p-1', status: 'held', amount_cents: 3500, platform_fee_cents: 263, customer_fee_cents: 263, charge_amount_cents: 3763,
    refund_cents: 0, transfer_cents: 0, release_requested_at: null, released_at: null, held_at: '2026-11-16T10:00:00Z', release_reason: null,
  };
  const cancelled = { id: 'j-1', status: 'cancelled' };
  const held = drawWorkerCard({ job: cancelled, payment: ROW });
  assert.deepEqual(held, ['PAYMENT', '$37.63', 'Customer’s Payment · Held', 'This job’s payment is held until Brazos reviews it.']);
  assert.ok(!held.includes('$0'), 'no figure that reads as the worker\'s result');
  assert.ok(!held.some((w) => /You Get|Protection Fee|\$32\.37|\$5\.26|yours/i.test(w)), 'no take, no fee, no "yours" caption');
  // A held row with no charge amount (none in practice) draws no figure at all, never "No budget set".
  assert.deepEqual(drawWorkerCard({ job: cancelled, payment: { ...ROW, charge_amount_cents: null } }), ['PAYMENT', 'This job’s payment is held until Brazos reviews it.']);

  // Every other card, word for word as the same drawing gave it before 4d-1 (on d2f67cb).
  assert.deepEqual(drawWorkerCard({ job: cancelled, payment: { ...ROW, status: 'voided', held_at: null } }), [
    'PAYMENT', '$0', 'Payment cancelled', 'This job was cancelled. Nothing is held for it.',
  ], 'a cancelled job with nothing held');
  assert.deepEqual(drawWorkerCard({ job: cancelled, payment: { ...ROW, refund_cents: 3763 } }), [
    'PAYMENT', '$0', 'Refund on its way to the customer', 'This job was cancelled. Casey’s payment goes back to them.',
  ], 'a cancelled job whose refund is queued');
  assert.deepEqual(drawWorkerCard({ job: { id: 'j-1', status: 'in_progress' }, payment: ROW }), [
    'PAYMENT', '$32.37', 'Held in protection — yours when the customer approves',
    'Casey placed the funds in protection. They’re released only after the finished work is approved.',
    'Customer’s Payment · Held', '$37.63', 'Protection Fee', '$5.26', 'You Get', '$32.37',
  ], 'an in-progress job');
  assert.deepEqual(drawWorkerCard({ job: { id: 'j-1', status: 'completed' }, payment: { ...ROW, status: 'released', released_at: '2026-11-16T11:00:00Z', release_reason: 'approved' } }), [
    'PAYMENT', '$32.37', 'You received', 'Casey approved the finished work and the payment was released.',
    'Customer Paid', '$37.63', 'Protection Fee', '$5.26', 'You Get', '$32.37',
  ], 'a released job');
});
