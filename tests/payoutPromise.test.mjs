// Pack 1, Codex R7-A3: ONE payout promise. A sentence that tells either party the worker's payout is
// on its way (or waits only on their payout setup) asks lib/paymentRules.ts isPayoutOnItsWay: approved,
// no refund queued to the customer, no refund of it failed or arranged. The late-cancel fee is the one
// payout said beside a refund, under isCancellationFeeKept. Rounds 5, 6 and 7 each found one more
// sentence outside the rule; the census below lists every payout sentence in the app source with the
// guard it sits under, so a new one fails here until it is listed. The executed rows run the rule, the
// caption table, the Earnings line and the payout-setup notice on the rows Codex names.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
// Comments out (a trailing // comment too, so a guard's comment never counts as a sentence), then one line.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const code = (path) => strip(read(path)).replace(/\s+/g, ' ');

const rules = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);
const { isCancellationFeeKept, isPayoutOnItsWay, isRefundArranged, isRefundFailed, isRefundQueued, isReleaseRequested } = rules;
const { paymentCaption } = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);
const { earningsRowMeta } = await import(pathToFileURL(join(root, 'lib/earningsCopy.ts')).href);

// lib/payments.ts, loaded the way tests/payouts.test.mjs loads it: its effectful imports stubbed or inlined.
globalThis.__payout_promise_supabase = { rpc: () => { throw new Error('no RPC'); }, from: () => { throw new Error('no read'); } };
let paymentsJs = stripTypeScriptTypes(read('lib/payments.ts'), { mode: 'strip' });
const jobsJs = stripTypeScriptTypes(read('lib/jobs.ts'), { mode: 'strip' });
const fbStart = jobsJs.indexOf('export function formatBudget');
const formatBudgetSource = jobsJs.slice(fbStart, jobsJs.indexOf('\n}', fbStart) + 2);
for (const [from, to] of [
  ["import { supabase } from './supabase';", 'const supabase = globalThis.__payout_promise_supabase;'],
  ["from './paymentRules';", `from '${pathToFileURL(join(root, 'lib/paymentRules.ts')).href}';`],
  ["import { formatBudget } from './jobs';", formatBudgetSource],
]) {
  assert.ok(paymentsJs.includes(from), `expected the import: ${from}`);
  paymentsJs = paymentsJs.replace(from, () => to);
}
const { PAYOUT_SETUP_NOTICE, payoutSetupNotice } = await import(
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(paymentsJs, 'utf8').toString('base64')
);

// ---------------------------------------------------------------------------
// The census. `hits` is how many payout phrases the entry holds; `why` says why it may say them.
// ---------------------------------------------------------------------------
// Case-blind: "On its way to you" opens a sentence as often as it ends one.
const PROMISE = /on its way|payment reaches|lands the moment|waiting on your payout setup|PAYOUT_SETUP_NOTICE|Set up payouts to receive|can reach you/gi;
const UNDER_RULE = 'under isPayoutOnItsWay';
const CENSUS = [
  // The customer.
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 1, why: UNDER_RULE,
    re: /: isPayoutOnItsWay\(tip\) \? `Your tip is on its way to \$\{workerName \?\? 'the worker'\} on top of the job payment\.`/ },
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 2, why: `${UNDER_RULE} (the first sentences alone beside a refund)`,
    re: /: !isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? 'Approved automatically after 72 hours\.' : 'Approved on your say-so\.' : payment\.release_reason === 'auto_approved' \? 'Approved automatically after 72 hours\. The payment is on its way to the worker and shows as released when the transfer lands\.' : 'Approved on your say-so\. The payment is on its way to the worker and shows as released when the transfer lands\.'/ },
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 3, why: `${UNDER_RULE}; the first sentence is the tip's condition, not a promise (A10a, kept on a refund row)`,
    re: /A tip can be added once the job payment reaches \{workerName \?\? 'the worker'\}\. \{isPayoutOnItsWay\(payment\) \? ' Yours is approved and on its way — if they haven’t set up payouts yet, it lands the moment they do\.' : null\}/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 2, why: `${UNDER_RULE} (the first sentence alone beside a refund)`,
    re: /: releaseRequested && !isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? isRefundQueued\(payment\) \? 'Approved automatically after 72 hours\.' : 'Approved automatically after 72 hours with no issue reported\.' : 'You approved the work\.' : releaseRequested \? payment\.release_reason === 'auto_approved' \? 'Approved automatically after 72 hours with no issue reported\. The payment is on its way to the worker and shows as released when the transfer lands\.' : 'You approved the work\. The payment is on its way to the worker and shows as released when the transfer lands\.'/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 1, why: 'the approve action itself, before any approval (never-approved refund rows: R7-A3b, the owner decides)',
    re: /: releaseAllowed \? 'Approving sends this payment on its way to the worker\. If something isn’t right, report the issue instead — release waits while a report is open\.'/ },
  { file: 'screens/ClientJobDetailScreen.tsx', hits: 1, why: UNDER_RULE,
    re: /\{stripe && isPayoutOnItsWay\(payment\) \? \( <Text style=\{styles\.paymentNote\}> The payment reaches \{workerFirstName\} once their payout account is ready — it shows as released when the transfer lands\. If they haven’t set up payouts yet, their job screen asks them to\. <\/Text> \) : null\}/ },
  { file: 'screens/ClientJobDetailScreen.tsx', hits: 2, why: `${UNDER_RULE} (no card beside a refund; the pinned "Leave a review" stays)`,
    re: /\) : isPayoutOnItsWay\(payment\) \? \( <Card palette=\{emeraldColors\} style=\{\[styles\.approvalCard, isDark && styles\.hairlineDark\]\}> <Text style=\{styles\.approvalTitle\}>Work approved — payout on its way<\/Text> <Text style=\{styles\.noticeText\}> You approved \{workerName\}’s work\. The payment is on its way to them and shows as released when the transfer lands\. Leave a review whenever you like\. <\/Text> <\/Card> \) : null/ },
  // The worker.
  { file: 'screens/WorkerJobScreen.tsx', hits: 1, why: 'the import of the setup sentence',
    re: /isReleaseRequested, PAYOUT_SETUP_NOTICE, payoutSetupNotice,/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 1, why: 'the late-cancel fee (isCancellationFeeKept)',
    re: /if \(isCancellationFeeKept\(payment\)\) \{ return `This job was cancelled late\. The cancellation fee is on its way to you; the rest goes back to \$\{clientName\}\.`; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 4, why: `${UNDER_RULE} (a refund queued says the payment goes back first; the approval alone after)`,
    re: /if \(isReleaseRequested\(payment\) && isRefundQueued\(payment\) && !isCancellationFeeKept\(payment\)\) \{ return `\$\{clientName\}’s payment goes back to them\.`; \} if \(isPayoutOnItsWay\(payment\) && waitingOnSetup\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically after 72 hours with no response from \$\{clientName\}\. \$\{PAYOUT_SETUP_NOTICE\}` : `\$\{clientName\} approved the finished work\. \$\{PAYOUT_SETUP_NOTICE\}`; \} if \(isPayoutOnItsWay\(payment\)\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically after 72 hours with no response from \$\{clientName\}\. Your payout is on its way and shows as released when the transfer lands\.` : `\$\{clientName\} approved the finished work\. Your payout is on its way and shows as released when the transfer lands\.`; \} if \(isReleaseRequested\(payment\)\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically after 72 hours with no response from \$\{clientName\}\.` : `\$\{clientName\} approved the finished work\.`; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 2, why: 'a live job (assigned or in progress) with no approved payment waiting: the ask at the hire',
    re: /\{live && paymentsMode === 'stripe' && payouts !== null && payouts !== 'enabled' && !waitingOnSetup \? \( <Pressable onPress=\{\(\) => navigateAcrossTabs\('Profile', 'Payouts', \{\}\)\} style=\{\(\{ pressed \}\) => \[styles\.linkRow, pressed && styles\.pressed\]\} accessibilityRole="button" accessibilityLabel="Set up payouts" accessibilityHint="Opens Payouts so the payment can reach you" > <Ionicons name="wallet-outline" size=\{20\} color=\{colors\.emerald\} \/> <Text style=\{styles\.linkRowText\}>Set up payouts so the payment can reach you<\/Text>/ },
  { file: 'screens/WorkerHomeScreen.tsx', hits: 3, why: 'payoutWaitCents sums only the rows payoutSetupNotice names (pinned below)',
    re: /\{payoutWaitCents != null \? \( <PressScale [^]*?accessibilityLabel=\{`Set up payouts to receive \$\{formatBudget\(payoutWaitCents\)\}`\} > [^]*?Set up payouts to receive \{formatBudget\(payoutWaitCents\)\} <\/Text> <Text style=\{styles\.needsJob\} numberOfLines=\{1\}> Approved — waiting on your payout setup <\/Text>/ },
  { file: 'components/PayoutNudge.tsx', hits: 2, why: 'shown only where payoutSetupNotice says so (pinned below)',
    re: /accessibilityLabel=\{`Set up payouts to receive \$\{amount\}`\} > <Ionicons name="wallet-outline" size=\{18\} color=\{colors\.mark\} \/> <Text style=\{styles\.text\} numberOfLines=\{1\}> Set up payouts to receive / },
  // The copy modules.
  { file: 'lib/payments.ts', hits: 1, why: 'the Payouts page for a worker with no payout account: about the account, no payment named',
    re: /body: 'Set up payouts to receive what you earn\./ },
  { file: 'lib/payments.ts', hits: 2, why: 'the setup sentence itself',
    re: /export const PAYOUT_SETUP_NOTICE = 'An approved payment is waiting on your payout setup before it can be sent to you\.';/ },
  { file: 'lib/payments.ts', hits: 1, why: `${UNDER_RULE} or the kept fee, spelled out (executed below)`,
    re: /\(row\) => row\.provider === 'stripe' && row\.status === 'held' && !!row\.release_requested_at && \(\(row\.refund_cents \?\? 0\) > 0 \? \(row\.transfer_cents \?\? 0\) > 0 : row\.refund_failed_at == null && row\.refund_arranged_at == null\) \); return waiting \? PAYOUT_SETUP_NOTICE : null;/ },
  { file: 'lib/moneyCopy.ts', hits: 2, why: 'a tip with no refund queued (the screens pass isRefundQueued(tip); executed below)',
    re: /if \(facts\.tip && !facts\.refundQueued\) \{ if \(facts\.status === 'held'\) return customer \? `Tip on its way to \$\{name \?\? 'your worker'\}` : `Tip from \$\{name \?\? 'the customer'\} — on its way`;/ },
  { file: 'lib/moneyCopy.ts', hits: 4, why: 'the refund going home, and the kept fee (isCancellationFeeKept); the worker reads nothing beside a failed or arranged refund',
    re: /if \(facts\.refundQueued\) \{ if \(facts\.feeKept\) \{ return customer \? `Refund on its way — the cancellation fee goes to \$\{name \?\? 'your worker'\}` : 'Cancellation fee — on its way to you'; \} if \(!customer && \(facts\.refundFailed \|\| facts\.refundArranged\)\) return null; return customer \? 'Refund on its way — back on your card in a few days' : 'Refund on its way to the customer'; \}/ },
  { file: 'lib/moneyCopy.ts', hits: 3, why: `${UNDER_RULE}: after the refund branch, after the customer's failure captions, and null for the worker beside a failure`,
    re: /if \(facts\.releaseRequested\) \{ if \(customer\) return `Approved — on its way to \$\{name \?\? 'your worker'\}`; if \(facts\.refundFailed \|\| facts\.refundArranged\) return null; return facts\.waitingOnPayoutSetup \? 'Approved — waiting on your payout setup' : 'Approved — on its way to you'; \}/ },
  { file: 'lib/earningsCopy.ts', hits: 2, why: 'the kept fee (release_reason cancellation_fee with a transfer)',
    re: /if \(row\.release_reason === 'cancellation_fee' && \(row\.transfer_cents \?\? 0\) > 0\) \{ if \(row\.released_at\) return 'Cancellation fee — sent to your payout account'; return row\.waitingOnPayoutSetup \? 'Cancellation fee — waiting on your payout setup' : 'Cancellation fee — on its way to you'; \}/ },
  { file: 'lib/earningsCopy.ts', hits: 1, why: 'the refund going home', re: /if \(row\.status === 'held'\) return 'Refund on its way to the customer';/ },
  { file: 'lib/earningsCopy.ts', hits: 2, why: `a tip, ${UNDER_RULE} (payoutOnItsWay)`,
    re: /if \(!row\.release_requested_at \|\| !row\.payoutOnItsWay\) return 'Held — not sent yet'; return row\.waitingOnPayoutSetup \? 'Waiting on your payout setup' : 'On its way to you';/ },
  { file: 'lib/earningsCopy.ts', hits: 2, why: `${UNDER_RULE} (payoutOnItsWay, asked by the caller: pinned below)`,
    re: /if \(row\.release_requested_at\) \{ if \(!row\.payoutOnItsWay\) return 'Held — not sent yet'; return row\.waitingOnPayoutSetup \? 'Approved — waiting on your payout setup' : 'Approved — payout on its way'; \}/ },
  { file: 'lib/earningsCopy.ts', hits: 1, why: 'released: the transfer landed', re: /return `\$\{base\} — on its way to your bank`;/ },
  // Not money.
  { file: 'screens/EmailSignInScreen.tsx', hits: 1, why: 'a reset link', re: /a reset link is on its way\./ },
  { file: 'screens/PostJobScreen.tsx', hits: 1, why: 'a job request', re: /'Your request is on its way\.'/ },
  { file: 'screens/VerifyPhoneScreen.tsx', hits: 1, why: 'a sign-in code', re: /'A new code is on its way\./ },
];

const sourceFiles = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(root, dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(relative(root, path));
    return /\.(ts|tsx)$/.test(name) ? [relative(root, path).replace(/\\/g, '/')] : [];
  });

test('R7-A3 · [static] census: every payout sentence in the app source is listed under its guard', () => {
  const files = ['screens', 'components', 'ui', 'lib'].flatMap(sourceFiles);
  const unlisted = [];
  const broken = [];
  for (const file of files) {
    const src = code(file);
    const ranges = [];
    for (const entry of CENSUS.filter((e) => e.file === file)) {
      const all = [...src.matchAll(new RegExp(entry.re.source, 'g'))];
      const inside = all.length === 1 ? (all[0][0].match(PROMISE) ?? []).length : -1;
      if (all.length !== 1 || inside !== entry.hits) {
        broken.push(`${file}: the entry "${entry.why}" matches ${all.length} time(s), ${inside} phrase(s) (expected once, ${entry.hits})`);
        continue;
      }
      ranges.push([all[0].index, all[0].index + all[0][0].length]);
    }
    for (const hit of src.matchAll(PROMISE)) {
      if (!ranges.some(([a, b]) => hit.index >= a && hit.index < b)) {
        unlisted.push(`${file}: "${src.slice(Math.max(0, hit.index - 90), hit.index + 40)}"`);
      }
    }
  }
  // Both lists in one message, so a red run names every guard that is missing and every sentence outside.
  assert.deepEqual({ broken, unlisted }, { broken: [], unlisted: [] }, 'a payout sentence outside the census (put it under isPayoutOnItsWay, then list it)');
  for (const entry of CENSUS) assert.ok(files.includes(entry.file), `${entry.file} is scanned`);
});

test('R7-A3 · [static] the callers ask the one rule: the facts reach every caption, the Earnings line and the nudges', () => {
  // Every MoneyText that can say "Approved — on its way" passes the refund facts beside the approval.
  for (const file of ['screens/ReviewAndTipScreen.tsx', 'screens/ApproveOrDisputeScreen.tsx', 'screens/ClientJobDetailScreen.tsx', 'screens/WorkerJobScreen.tsx']) {
    const src = code(file);
    const cards = [];
    for (let i = src.indexOf('<MoneyText'); i > -1; i = src.indexOf('<MoneyText', i + 1)) cards.push(src.slice(i, src.indexOf('/>', i)));
    const approving = cards.filter((card) => card.includes('releaseRequested='));
    assert.ok(approving.length >= 1, `${file}: a card with the approval`);
    for (const card of approving) {
      for (const fact of ['refundQueued={isRefundQueued(payment)}', 'refundFailed={isRefundFailed(payment)}', 'refundArranged={isRefundArranged(payment)}']) {
        assert.ok(card.includes(fact), `${file}: the approved card passes ${fact}`);
      }
    }
  }
  // A tip's caption: the live tip passes its queued refund; the replaced tip (fetchJobRefundIssue reads only a
  // failed or arranged refund) shows the customer's failure caption first.
  const review = code('screens/ReviewAndTipScreen.tsx');
  assert.match(review, /<MoneyText cents=\{tip\.amount_cents\} state=\{tip\.status\} tip refundQueued=\{isRefundQueued\(tip\)\} refundFailed=\{isRefundFailed\(tip\)\} refundArranged=\{isRefundArranged\(tip\)\}/);
  assert.match(code('lib/payments.ts'), /\.in\('status', \['failed', 'voided'\]\) \.or\('refund_failed_at\.not\.is\.null,refund_arranged_at\.not\.is\.null'\)/);
  // The Earnings line asks the rule and reads the columns it needs.
  assert.match(code('screens/EarningsScreen.tsx'), /waitingOnPayoutSetup: payoutSetupNotice\(payouts, \[row\]\) !== null, payoutOnItsWay: isPayoutOnItsWay\(row\),/);
  const select = code('lib/earnings.ts').match(/\.select\( '([^']+)' \)/)[1].split(', ');
  for (const column of ['release_requested_at', 'refund_cents', 'transfer_cents', 'refund_failed_at', 'refund_arranged_at']) {
    assert.ok(select.includes(column), `fetchMyEarnings reads ${column}`);
  }
  // The setup nudges follow payoutSetupNotice: the worker's job card and Worker Home.
  const worker = code('screens/WorkerJobScreen.tsx');
  assert.match(worker, /const waitingOnSetup = payment \? payoutSetupNotice\(payouts, \[payment\]\) !== null : false;/);
  assert.match(worker, /\{waitingOnSetup \? \( <View style=\{styles\.payoutNudge\}> <PayoutNudge /);
  assert.match(code('screens/WorkerHomeScreen.tsx'), /\.filter\(\(row\) => payoutSetupNotice\(status\.data, \[row\]\) !== null\)/);
  assert.match(code('screens/PayoutsScreen.tsx'), /const setupNotice = status && rows \? payoutSetupNotice\(status, rows\) : null;/);
});

test('R7-A3 · [static] without the approved card, the review stays one tap away (the pinned button and the review gate)', () => {
  const detail = code('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /const releaseRequested = !!payment && isReleaseRequested\(payment\);/);
  assert.match(
    detail,
    /case 'completed': return payment && \(isReleased\(payment\) \|\| releaseRequested\) \? \{ label: stripe \|\| !isReleased\(payment\) \? 'Leave a review' : 'Review & tip', onPress: \(\) => navigation\.navigate\('ReviewAndTip', \{ job \}\), \} : null;/,
    'an approved row, a refund queued or not, keeps "Leave a review"'
  );
  const review = code('screens/ReviewAndTipScreen.tsx');
  assert.match(review, /const releaseRequested = !!payment && isReleaseRequested\(payment\);/);
  assert.match(review, /: payment && !released && !releaseRequested \? \{ kind: 'empty' as const, title: 'Approve the work first',/, 'the review opens on an approved row');
  // Executed on Codex's row: approved, so the button shows and the gate lets the review through.
  assert.equal(isReleaseRequested(ROWS.codex), true);
});

// ---------------------------------------------------------------------------
// The executed rows.
// ---------------------------------------------------------------------------
const AT = '2026-11-15T10:00:00Z';
const base = { provider: 'stripe', kind: 'job_payment', status: 'held', release_requested_at: AT, refund_failed_at: null, refund_arranged_at: null };
const ROWS = {
  normal: { ...base, release_reason: 'approved', transfer_cents: 4975, refund_cents: 0 },
  normalAuto: { ...base, release_reason: 'auto_approved', transfer_cents: 4975, refund_cents: 0 },
  // Codex R7-A3: approved by the timer, an issue reported, decided for the customer: refund queued, both flags null.
  codex: { ...base, release_reason: 'auto_approved', transfer_cents: 0, refund_cents: 5375 },
  failed: { ...base, release_reason: 'auto_approved', transfer_cents: 0, refund_cents: 5375, refund_failed_at: AT },
  arranged: { ...base, release_reason: 'auto_approved', transfer_cents: 0, refund_cents: 5375, refund_arranged_at: AT },
  handFailed: { ...base, release_reason: 'approved', transfer_cents: 4975, refund_cents: 0, refund_failed_at: AT },
  handArranged: { ...base, release_reason: 'approved', transfer_cents: 4975, refund_cents: 0, refund_arranged_at: AT },
  // The split row: approval time, a refund and a transfer (the late-cancel or no-show fee).
  split: { ...base, release_reason: 'cancellation_fee', transfer_cents: 375, refund_cents: 5000, job_status: 'cancelled' },
  tip: { ...base, kind: 'tip', release_reason: null, transfer_cents: 500, refund_cents: 0 },
  // A refund directed home sets transfer_cents = 0 (cancel_job, resolve_job_dispute), on a tip too.
  tipRefund: { ...base, kind: 'tip', release_reason: null, transfer_cents: 0, refund_cents: 500 },
};
const ON_ITS_WAY = new Set(['normal', 'normalAuto', 'tip']);
// The facts a screen hands MoneyText (the worker's job card and the customer cards alike).
const facts = (row, over = {}) => ({
  status: row.status,
  releaseRequested: isReleaseRequested(row),
  refundQueued: isRefundQueued(row),
  feeKept: isCancellationFeeKept(row),
  refundFailed: isRefundFailed(row),
  refundArranged: isRefundArranged(row),
  tip: row.kind === 'tip',
  counterpartFirstName: 'Sam',
  ...over,
});
const FAKE = { countdown: () => 'Sat at 3 PM', timeAgo: () => '2 h ago' };
const meta = (row, status) =>
  earningsRowMeta(
    { ...row, releaseDeadlineMs: null, waitingOnPayoutSetup: payoutSetupNotice(status, [row]) !== null, payoutOnItsWay: isPayoutOnItsWay(row) },
    Date.parse(AT),
    FAKE
  );

test('R7-A3 · isPayoutOnItsWay: approved, no refund queued, failed or arranged', () => {
  for (const [name, row] of Object.entries(ROWS)) {
    assert.equal(isPayoutOnItsWay(row), ON_ITS_WAY.has(name), name);
  }
  assert.equal(isPayoutOnItsWay({ status: 'held', release_requested_at: null }), false, 'held, not approved');
  assert.equal(isPayoutOnItsWay({ status: 'released', release_requested_at: AT }), false, 'released is said as released');
});

test('R7-A3 · payoutSetupNotice (lib/payments.ts, spelled out) agrees with the rule or the kept fee, on every row', () => {
  for (const [name, row] of Object.entries(ROWS)) {
    const expected = isPayoutOnItsWay(row) || (isReleaseRequested(row) && isCancellationFeeKept(row));
    for (const status of ['none', 'action_needed', 'under_review']) {
      assert.equal(payoutSetupNotice(status, [row]) !== null, expected, `${name}, ${status}`);
    }
    assert.equal(payoutSetupNotice('enabled', [row]), null, `${name}: enabled says nothing`);
  }
  // The rows the notice names: the normal approval and the kept fee (it still waits on the worker's setup).
  assert.equal(payoutSetupNotice('none', [ROWS.normal]), PAYOUT_SETUP_NOTICE);
  assert.equal(payoutSetupNotice('none', [ROWS.split]), PAYOUT_SETUP_NOTICE, 'the split row: the kept fee waits on the setup');
  assert.equal(payoutSetupNotice('none', [ROWS.codex]), null, "Codex's row: nothing waits on the setup");
  assert.equal(payoutSetupNotice('none', [ROWS.handFailed]), null, 'a refund of it failed: say less');
});

test('R7-A3 · the caption: no payout promised outside the rule; the normal case and the split row word for word', () => {
  const PAYOUT = /^Approved — on its way to|^Approved — waiting on your payout setup|^Tip on its way to|^Tip from .* — on its way/;
  for (const [name, row] of Object.entries(ROWS)) {
    for (const viewer of ['customer', 'worker']) {
      for (const waiting of [false, true]) {
        const caption = paymentCaption(facts(row, { waitingOnPayoutSetup: viewer === 'worker' && waiting }), viewer) ?? '';
        assert.equal(PAYOUT.test(caption), ON_ITS_WAY.has(name), `${name}, ${viewer}${waiting ? ', waiting on setup' : ''}: "${caption}"`);
      }
    }
  }
  // The normal case, as at d4a9adc.
  assert.equal(paymentCaption(facts(ROWS.normal), 'customer'), 'Approved — on its way to Sam');
  assert.equal(paymentCaption(facts(ROWS.normal), 'worker'), 'Approved — on its way to you');
  assert.equal(paymentCaption(facts(ROWS.normal, { waitingOnPayoutSetup: true }), 'worker'), 'Approved — waiting on your payout setup');
  assert.equal(paymentCaption(facts(ROWS.tip), 'customer'), 'Tip on its way to Sam');
  // Codex's row: the refund, to both.
  assert.equal(paymentCaption(facts(ROWS.codex), 'customer'), 'Refund on its way — back on your card in a few days');
  assert.equal(paymentCaption(facts(ROWS.codex), 'worker'), 'Refund on its way to the customer');
  assert.equal(paymentCaption(facts(ROWS.tipRefund), 'customer'), 'Refund on its way — back on your card in a few days');
  // A failed or arranged refund: the customer's own captions; the worker reads nothing.
  assert.equal(paymentCaption(facts(ROWS.failed), 'customer'), 'Refund didn’t go through — Brazos will arrange it');
  assert.equal(paymentCaption(facts(ROWS.arranged), 'customer'), 'Refunded another way');
  for (const name of ['failed', 'arranged', 'handFailed', 'handArranged']) {
    assert.equal(paymentCaption(facts(ROWS[name]), 'worker'), null, `${name}: the worker`);
  }
  // The split row: the kept fee is never silent.
  assert.equal(paymentCaption(facts(ROWS.split), 'customer'), 'Refund on its way — the cancellation fee goes to Sam');
  assert.equal(paymentCaption(facts(ROWS.split), 'worker'), 'Cancellation fee — on its way to you');
  assert.equal(paymentCaption(facts(ROWS.split, { refundFailed: true }), 'worker'), 'Cancellation fee — on its way to you',
    'the kept fee stays beside a failed refund of the rest');
});

test('R7-A3 · the Earnings line: the normal case word for word, the refund and the kept fee said, nothing promised beside a failure', () => {
  assert.equal(meta(ROWS.normal, 'enabled'), 'Approved — payout on its way');
  assert.equal(meta(ROWS.normal, 'none'), 'Approved — waiting on your payout setup');
  assert.equal(meta(ROWS.codex, 'none'), 'Refund on its way to the customer');
  assert.equal(meta(ROWS.handFailed, 'none'), 'Held — not sent yet');
  assert.equal(meta(ROWS.handArranged, 'enabled'), 'Held — not sent yet');
  assert.equal(meta(ROWS.split, 'enabled'), 'Cancellation fee — on its way to you');
  assert.equal(meta(ROWS.split, 'none'), 'Cancellation fee — waiting on your payout setup');
  assert.equal(meta(ROWS.tip, 'enabled'), 'On its way to you');
  assert.equal(meta(ROWS.tip, 'none'), 'Waiting on your payout setup');
  // A tip whose refund (a hand refund in Stripe) failed or was arranged: no payout promised.
  assert.equal(meta({ ...ROWS.tip, refund_failed_at: AT }, 'enabled'), 'Held — not sent yet');
  assert.equal(meta({ ...ROWS.tip, refund_arranged_at: AT }, 'none'), 'Held — not sent yet');
});
