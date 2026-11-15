// Pack 1, Codex R7-A3: ONE payout promise. A sentence that tells either party the worker's payout is
// on its way (or waits only on their payout setup) asks lib/paymentRules.ts isPayoutOnItsWay. Rounds
// 5, 6 and 7 each found one more sentence outside the rule; the census below lists every payout
// sentence in the app source with the guard it sits under, so a new one fails here until it is listed.
// Codex R8-A1: the rule is the database's fact (my_payouts_on_their_way, put on each row by the read
// that fetched it), because the columns the app reads cannot tell an open issue after the timer's
// approval (Failure A), a reversed transfer (Failure B) or a card dispute from a normal approval. The
// executed rows mirror supabase/tests/460_payout_on_its_way.sql row by row: the same app columns and
// the fact as the database answers it. They run the rule, the caption table, the Earnings line, the
// payout-setup notice, the screens' note guards (extracted as written) and the fetchers.
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
const { isCancellationFeeKept, isPayoutOnItsWay, isRefundArranged, isRefundFailed, isRefundQueued, isReleased, isReleaseRequested } = rules;
const { paymentCaption } = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);
const { earningsRowMeta } = await import(pathToFileURL(join(root, 'lib/earningsCopy.ts')).href);
const { workerReceivesCents } = await import(pathToFileURL(join(root, 'lib/earningsMath.ts')).href);

// lib/payments.ts, loaded the way tests/payouts.test.mjs loads it: its effectful imports stubbed or inlined.
// The stub's two methods are replaced per test (the fetchers below); by default every read throws.
const stub = { rpc: () => { throw new Error('no RPC'); }, from: () => { throw new Error('no read'); } };
globalThis.__payout_promise_supabase = stub;
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
const { PAYOUT_SETUP_NOTICE, payoutSetupNotice, workerTakeCents, fetchJobPaymentState, fetchJobTip, fetchPayoutsOnTheirWay } = await import(
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(paymentsJs, 'utf8').toString('base64')
);

// ---------------------------------------------------------------------------
// The census. `hits` is how many payout phrases the entry holds; `why` says why it may say them.
// ---------------------------------------------------------------------------
// Case-blind: "On its way to you" opens a sentence as often as it ends one. Codex R8-A1: and the
// words that say the payout is sent or transferred.
const PROMISE = /on its way|payment reaches|lands the moment|waiting on your payout setup|PAYOUT_SETUP_NOTICE|Set up payouts to receive|can reach you|payout is sent|transferred to you|payments transfer/gi;
const UNDER_RULE = 'under isPayoutOnItsWay';
const ABOUT = 'about how payouts work, no payment named (R8-A1 vocabulary)';
const CENSUS = [
  // The customer.
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 1, why: UNDER_RULE,
    re: /: isPayoutOnItsWay\(tip\) \? `Your tip is on its way to \$\{workerName \?\? 'the worker'\} on top of the job payment\.`/ },
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 2, why: `${UNDER_RULE} (the first sentences alone otherwise)`,
    re: /: !isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? 'Approved automatically after 72 hours\.' : 'Approved on your say-so\.' : payment\.release_reason === 'auto_approved' \? 'Approved automatically after 72 hours\. The payment is on its way to the worker and shows as released when the transfer lands\.' : 'Approved on your say-so\. The payment is on its way to the worker and shows as released when the transfer lands\.'/ },
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 3, why: `${UNDER_RULE}; the first sentence is the tip's condition, not a promise (A10a, kept on a refund row)`,
    re: /A tip can be added once the job payment reaches \{workerName \?\? 'the worker'\}\. \{isPayoutOnItsWay\(payment\) \? ' Yours is approved and on its way — if they haven’t set up payouts yet, it lands the moment they do\.' : null\}/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 2, why: `${UNDER_RULE} (the first sentence alone otherwise: a refund, an issue after the timer, a reversed transfer, a card dispute)`,
    re: /: releaseRequested && !isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? 'Approved automatically after 72 hours\.' : 'You approved the work\.' : releaseRequested \? payment\.release_reason === 'auto_approved' \? 'Approved automatically after 72 hours with no issue reported\. The payment is on its way to the worker and shows as released when the transfer lands\.' : 'You approved the work\. The payment is on its way to the worker and shows as released when the transfer lands\.'/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 1, why: 'the approve action itself, before any approval (never-approved refund rows: R7-A3b, the owner decides)',
    re: /: releaseAllowed \? 'Approving sends this payment on its way to the worker\. If something isn’t right, report the issue instead — release waits while a report is open\.'/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 1, why: 'the approve dialog, before any approval: what approving does, with no timing (R8-A1 vocabulary)',
    re: /'This approves the finished work and releases the payment to the worker\. It can’t be undone — the payout is sent on the provider’s schedule and shows as released when the transfer lands\.'/ },
  { file: 'screens/ClientJobDetailScreen.tsx', hits: 1, why: UNDER_RULE,
    re: /\{stripe && isPayoutOnItsWay\(payment\) \? \( <Text style=\{styles\.paymentNote\}> The payment reaches \{workerFirstName\} once their payout account is ready — it shows as released when the transfer lands\. If they haven’t set up payouts yet, their job screen asks them to\. <\/Text> \) : null\}/ },
  { file: 'screens/ClientJobDetailScreen.tsx', hits: 2, why: `${UNDER_RULE} (no card otherwise; the pinned "Leave a review" stays)`,
    re: /\) : isPayoutOnItsWay\(payment\) \? \( <Card palette=\{emeraldColors\} style=\{\[styles\.approvalCard, isDark && styles\.hairlineDark\]\}> <Text style=\{styles\.approvalTitle\}>Work approved — payout on its way<\/Text> <Text style=\{styles\.noticeText\}> You approved \{workerName\}’s work\. The payment is on its way to them and shows as released when the transfer lands\. Leave a review whenever you like\. <\/Text> <\/Card> \) : null/ },
  // The worker.
  { file: 'screens/WorkerJobScreen.tsx', hits: 1, why: 'the import of the setup sentence',
    re: /isReleaseRequested, PAYOUT_SETUP_NOTICE, payoutSetupNotice,/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 1, why: `the late-cancel fee, ${UNDER_RULE} or once its transfer was sent (released_at); the first sentence alone otherwise`,
    re: /if \(isCancellationFeeKept\(payment\)\) \{ return isPayoutOnItsWay\(payment\) \|\| !!payment\.released_at \? `This job was cancelled late\. The cancellation fee is on its way to you; the rest goes back to \$\{clientName\}\.` : 'This job was cancelled late\.'; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 4, why: `${UNDER_RULE} (a refund queued says the payment goes back first; the approval alone after)`,
    re: /if \(isReleaseRequested\(payment\) && isRefundQueued\(payment\) && !isCancellationFeeKept\(payment\)\) \{ return `\$\{clientName\}’s payment goes back to them\.`; \} if \(isPayoutOnItsWay\(payment\) && waitingOnSetup\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically after 72 hours with no response from \$\{clientName\}\. \$\{PAYOUT_SETUP_NOTICE\}` : `\$\{clientName\} approved the finished work\. \$\{PAYOUT_SETUP_NOTICE\}`; \} if \(isPayoutOnItsWay\(payment\)\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically after 72 hours with no response from \$\{clientName\}\. Your payout is on its way and shows as released when the transfer lands\.` : `\$\{clientName\} approved the finished work\. Your payout is on its way and shows as released when the transfer lands\.`; \} if \(isReleaseRequested\(payment\)\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically after 72 hours with no response from \$\{clientName\}\.` : `\$\{clientName\} approved the finished work\.`; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 2, why: 'a live job (assigned or in progress) with no approved payment waiting: the ask at the hire',
    re: /\{live && paymentsMode === 'stripe' && payouts !== null && payouts !== 'enabled' && !waitingOnSetup \? \( <Pressable onPress=\{\(\) => navigateAcrossTabs\('Profile', 'Payouts', \{\}\)\} style=\{\(\{ pressed \}\) => \[styles\.linkRow, pressed && styles\.pressed\]\} accessibilityRole="button" accessibilityLabel="Set up payouts" accessibilityHint="Opens Payouts so the payment can reach you" > <Ionicons name="wallet-outline" size=\{20\} color=\{colors\.emerald\} \/> <Text style=\{styles\.linkRowText\}>Set up payouts so the payment can reach you<\/Text>/ },
  { file: 'screens/WorkerHomeScreen.tsx', hits: 3, why: 'payoutWaitCents sums only the rows payoutSetupNotice names (pinned below)',
    re: /\{payoutWaitCents != null \? \( <PressScale [^]*?accessibilityLabel=\{`Set up payouts to receive \$\{formatBudget\(payoutWaitCents\)\}`\} > [^]*?Set up payouts to receive \{formatBudget\(payoutWaitCents\)\} <\/Text> <Text style=\{styles\.needsJob\} numberOfLines=\{1\}> Approved — waiting on your payout setup <\/Text>/ },
  { file: 'screens/EarningsScreen.tsx', hits: 1, why: 'the total of the paid_out rows: money already transferred (R8-A1 vocabulary)',
    re: /label="TRANSFERRED" icon="arrow-up-circle-outline" cents=\{s\.transferredCents\} note="Transferred to you"/ },
  { file: 'screens/PayoutsScreen.tsx', hits: 2, why: ABOUT,
    re: /strong="Approved payments transfer on their own" text="when a customer approves your finished work, the payment is released and transferred to you on the provider’s schedule\."/ },
  { file: 'components/PayoutNudge.tsx', hits: 2, why: 'shown only where payoutSetupNotice says so (pinned below)',
    re: /accessibilityLabel=\{`Set up payouts to receive \$\{amount\}`\} > <Ionicons name="wallet-outline" size=\{18\} color=\{colors\.mark\} \/> <Text style=\{styles\.text\} numberOfLines=\{1\}> Set up payouts to receive / },
  // The copy modules.
  { file: 'lib/payments.ts', hits: 1, why: 'the Payouts page for a worker with no payout account: about the account, no payment named',
    re: /body: 'Set up payouts to receive what you earn\./ },
  { file: 'lib/payments.ts', hits: 1, why: `the Payouts page for an enabled account: ${ABOUT}`,
    re: /body: 'Approved payments are transferred to you on the provider’s schedule\. There is nothing to trigger here\.'/ },
  { file: 'lib/payments.ts', hits: 2, why: 'the setup sentence itself',
    re: /export const PAYOUT_SETUP_NOTICE = 'An approved payment is waiting on your payout setup before it can be sent to you\.';/ },
  { file: 'lib/payments.ts', hits: 1, why: `${UNDER_RULE}: the database's fact on the row (executed below)`,
    re: /return rows\.some\(\(row\) => row\.payoutOnItsWay === true\) \? PAYOUT_SETUP_NOTICE : null;/ },
  { file: 'lib/moneyCopy.ts', hits: 2, why: `a held tip with no refund queued, ${UNDER_RULE} (payoutOnItsWay; executed below)`,
    re: /if \(facts\.tip && !facts\.refundQueued\) \{ if \(facts\.status === 'held'\) \{ if \(!facts\.payoutOnItsWay\) return null; return customer \? `Tip on its way to \$\{name \?\? 'your worker'\}` : `Tip from \$\{name \?\? 'the customer'\} — on its way`; \}/ },
  { file: 'lib/moneyCopy.ts', hits: 4, why: 'the refund going home (the customer’s fee sentence stays); the worker’s fee under payoutOnItsWay or once sent (feeSent); the worker reads nothing beside a failed or arranged refund',
    re: /if \(facts\.refundQueued\) \{ if \(facts\.feeKept\) \{ if \(customer\) return `Refund on its way — the cancellation fee goes to \$\{name \?\? 'your worker'\}`; return facts\.payoutOnItsWay \|\| facts\.feeSent \? 'Cancellation fee — on its way to you' : null; \} if \(!customer && \(facts\.refundFailed \|\| facts\.refundArranged\)\) return null; return customer \? 'Refund on its way — back on your card in a few days' : 'Refund on its way to the customer'; \}/ },
  { file: 'lib/moneyCopy.ts', hits: 3, why: `${UNDER_RULE} (payoutOnItsWay): after the refund branch, after the customer's failure captions and an open issue`,
    re: /if \(facts\.releaseRequested\) \{ if \(!facts\.payoutOnItsWay\) return null; if \(customer\) return `Approved — on its way to \$\{name \?\? 'your worker'\}`; return facts\.waitingOnPayoutSetup \? 'Approved — waiting on your payout setup' : 'Approved — on its way to you'; \}/ },
  { file: 'lib/earningsCopy.ts', hits: 2, why: `the kept fee: sent (released_at), else ${UNDER_RULE} (payoutOnItsWay)`,
    re: /if \(row\.release_reason === 'cancellation_fee' && \(row\.transfer_cents \?\? 0\) > 0\) \{ if \(row\.released_at\) return 'Cancellation fee — sent to your payout account'; if \(!row\.payoutOnItsWay\) return 'Held — not sent yet'; return row\.waitingOnPayoutSetup \? 'Cancellation fee — waiting on your payout setup' : 'Cancellation fee — on its way to you'; \}/ },
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

test('R7-A3, R8-A1 · [static] census: every payout sentence in the app source is listed under its guard', () => {
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

test('R7-A3, R8-A1 · [static] the callers ask the one rule: the fact reaches every caption, the Earnings line and the nudges', () => {
  // Every MoneyText that can say "Approved — on its way" passes the refund facts and the payout fact.
  for (const file of ['screens/ReviewAndTipScreen.tsx', 'screens/ApproveOrDisputeScreen.tsx', 'screens/ClientJobDetailScreen.tsx', 'screens/WorkerJobScreen.tsx']) {
    const src = code(file);
    const cards = [];
    for (let i = src.indexOf('<MoneyText'); i > -1; i = src.indexOf('<MoneyText', i + 1)) cards.push(src.slice(i, src.indexOf('/>', i)));
    const approving = cards.filter((card) => card.includes('releaseRequested='));
    assert.ok(approving.length >= 1, `${file}: a card with the approval`);
    for (const card of approving) {
      for (const fact of ['refundQueued={isRefundQueued(payment)}', 'refundFailed={isRefundFailed(payment)}', 'refundArranged={isRefundArranged(payment)}', 'payoutOnItsWay={isPayoutOnItsWay(payment)}']) {
        assert.ok(card.includes(fact), `${file}: the approved card passes ${fact}`);
      }
    }
  }
  // A tip's caption: the live tip passes its queued refund and its fact; the replaced tip (fetchJobRefundIssue
  // reads only a failed or arranged refund) shows the customer's failure caption first.
  const review = code('screens/ReviewAndTipScreen.tsx');
  assert.match(review, /<MoneyText cents=\{tip\.amount_cents\} state=\{tip\.status\} tip refundQueued=\{isRefundQueued\(tip\)\} refundFailed=\{isRefundFailed\(tip\)\} refundArranged=\{isRefundArranged\(tip\)\} payoutOnItsWay=\{isPayoutOnItsWay\(tip\)\}/);
  assert.match(code('lib/payments.ts'), /\.in\('status', \['failed', 'voided'\]\) \.or\('refund_failed_at\.not\.is\.null,refund_arranged_at\.not\.is\.null'\)/);
  // The Earnings line asks the rule; the rows carry the fact (fetchMyEarnings reads it beside them).
  assert.match(code('screens/EarningsScreen.tsx'), /waitingOnPayoutSetup: payoutSetupNotice\(payouts, \[row\]\) !== null, payoutOnItsWay: isPayoutOnItsWay\(row\),/);
  const earnings = code('lib/earnings.ts');
  assert.match(earnings, /const \[\{ data, error \}, onTheirWay\] = await Promise\.all\(\[ supabase \.from\('payments'\)/);
  assert.match(earnings, /\.order\('created_at', \{ ascending: false \}\), fetchPayoutsOnTheirWay\(\), \]\);/);
  assert.match(earnings, /const payments = \(\(data \?\? \[\]\) as PaymentColumns\[\]\)\.map\(\(p\) => withPayoutFact\(p, onTheirWay\)\);/);
  // The lifecycle reads put the fact on the row; the reads that do not ask write false in plain sight.
  const lib = code('lib/payments.ts');
  for (const name of ['fetchJobPaymentState', 'fetchJobTip']) {
    const start = lib.indexOf(`export async function ${name}(`);
    const body = lib.slice(start, lib.indexOf('export ', start + 1));
    assert.ok(body.includes('fetchPayoutsOnTheirWay()') && body.includes('withPayoutFact('), `${name} reads the fact beside the row`);
  }
  assert.equal((lib.match(/payoutOnItsWay: false \}/g) ?? []).length, 2, 'fetchJobPayment and fetchJobRefundIssue: false');
  assert.match(code('lib/adapters/payments.ts'), /return \{ data: data \? \{ \.\.\.\(data as PaymentColumns\), payoutOnItsWay: false \} : null, error: null \};/);
  // The report and its withdrawal change the fact: the screen reads the payment again.
  const approve = code('screens/ApproveOrDisputeScreen.tsx');
  for (const name of ['submitReport', 'withdrawReport']) {
    const start = approve.indexOf(`async function ${name}()`);
    const body = approve.slice(start, approve.indexOf('void load(); }', start) + 'void load(); }'.length);
    assert.ok(start > -1 && !body.slice(1).includes('async function'), `${name}: void load() inside it`);
    assert.match(body, /return; \} setDispute\([^;]*\);[^}]*void load\(\); \}$/, `${name}: void load() last, after it succeeds`);
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
  // Executed on Codex's row and on Failure A: approved, so the button shows and the gate lets the review through.
  assert.equal(isReleaseRequested(ROWS['11 refund queued, no fee']), true);
  assert.equal(isReleaseRequested(ROWS['05 open issue after approval (Failure A)']), true);
});

// ---------------------------------------------------------------------------
// The executed rows: supabase/tests/460_payout_on_its_way.sql, row by row. The columns are what that
// file's diag lines print the app reads; payoutOnItsWay is the database's answer there. issueOpen is
// what the job screens pass beside the row (an open job_disputes row); setup is the worker's payouts.
// ---------------------------------------------------------------------------
const AT = '2026-11-15T10:00:00Z';
const JOB = { provider: 'stripe', kind: 'job_payment', status: 'held', release_requested_at: AT, released_at: null, release_reason: 'approved',
  amount_cents: 5000, platform_fee_cents: 375, refund_cents: 0, transfer_cents: 4625, refund_failed_at: null, refund_arranged_at: null, job_status: 'completed' };
const TIMER = { ...JOB, release_reason: 'auto_approved' };
const FEE = { ...JOB, release_reason: 'cancellation_fee', refund_cents: 3875, transfer_cents: 1500, job_status: 'cancelled' };
const TIP = { ...JOB, kind: 'tip', release_reason: null, amount_cents: 1000, platform_fee_cents: 0, transfer_cents: 1000 };
const RELEASED = { ...JOB, status: 'released', released_at: AT };
const ROWS = {
  '01 normal approval': { ...JOB, payoutOnItsWay: true },
  '01t normal approval by the timer (05 before its issue)': { ...TIMER, payoutOnItsWay: true },
  '02 waiting only on payout setup': { ...JOB, payoutOnItsWay: true, setup: 'action_needed' },
  '03 late-cancel fee queued (F1)': { ...FEE, payoutOnItsWay: true },
  '04 queued tip': { ...TIP, payoutOnItsWay: true },
  '04b tip transfer reversed': { ...TIP, payoutOnItsWay: false },
  '05 open issue after approval (Failure A)': { ...TIMER, payoutOnItsWay: false, issueOpen: true },
  '06 transfer reversed (Failure B)': { ...JOB, payoutOnItsWay: false },
  '07 card dispute open': { ...JOB, payoutOnItsWay: false },
  '08 attempt stopped': { ...JOB, payoutOnItsWay: true },
  '08b attempt past 23 hours, no answer': { ...JOB, payoutOnItsWay: true },
  '09a sent, answer lost, transfer.created not applied': { ...JOB, payoutOnItsWay: true },
  '09b sent, drain recorded it, transfer.created not applied': { ...RELEASED, payoutOnItsWay: false },
  '09c fee sent and recorded, refund still queued (F3)': { ...FEE, released_at: AT, payoutOnItsWay: false },
  '10 released': { ...RELEASED, payoutOnItsWay: false },
  '11 refund queued, no fee': { ...JOB, refund_cents: 5375, transfer_cents: 0, payoutOnItsWay: false },
  '12 never approved': { ...JOB, release_requested_at: null, release_reason: null, transfer_cents: 0, payoutOnItsWay: false },
  '13a hand refund failed, part of the charge': { ...JOB, refund_failed_at: AT, payoutOnItsWay: false },
  '13c hand refund failed, part, then arranged': { ...JOB, refund_arranged_at: AT, payoutOnItsWay: false },
  'F2 fee waiting on payout setup': { ...FEE, payoutOnItsWay: true, setup: 'action_needed' },
  'F2b fee waiting on payout setup, the rest refunded': { ...FEE, status: 'partially_refunded', payoutOnItsWay: true, setup: 'action_needed' },
  'F4 fee, card dispute before the send': { ...FEE, payoutOnItsWay: false },
  'F5 fee reversed after the send': { ...FEE, payoutOnItsWay: false },
  'F6 fee, the refund of the rest failed': { ...FEE, refund_failed_at: AT, payoutOnItsWay: false },
};
// The app's columns of a row (what tests.pw_app compares): the fact is not one of them.
const cols = ({ payoutOnItsWay, issueOpen, setup, ...row }) => JSON.stringify(row);

// The facts a screen hands MoneyText (the worker's job card and the customer cards alike).
const facts = (row, over = {}) => ({
  status: row.status,
  releaseRequested: isReleaseRequested(row),
  issueOpen: !!row.issueOpen,
  refundQueued: isRefundQueued(row),
  feeKept: isCancellationFeeKept(row),
  feeSent: !!row.released_at,
  refundFailed: isRefundFailed(row),
  refundArranged: isRefundArranged(row),
  payoutOnItsWay: isPayoutOnItsWay(row),
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
const workerCaption = (row, status) => paymentCaption(facts(row, { waitingOnPayoutSetup: payoutSetupNotice(status, [row]) !== null }), 'worker');
const FAILED = 'Refund didn’t go through — Brazos will arrange it';
const ARRANGED = 'Refunded another way';
const PAYOUT = /^Approved — on its way to|^Approved — waiting on your payout setup|^Tip on its way to|^Tip from .* — on its way|^Cancellation fee — on its way to you|^Cancellation fee — waiting on your payout setup|payout on its way|^On its way to you|^Waiting on your payout setup/;
const SAID = new Set(['09c fee sent and recorded, refund still queued (F3)']); // the fee sent: said by released_at

// Word for word, as the screens and Earnings show each row: the customer's caption (job page and
// approval page, issueOpen as passed), the worker's caption and Earnings line with payouts enabled and
// with no payout account, and whether the payout-setup notice names the row.
const SHOWN = {
  '01 normal approval': ['Approved — on its way to Sam', 'Approved — on its way to you', 'Approved — waiting on your payout setup', 'Approved — payout on its way', 'Approved — waiting on your payout setup', true],
  '01t normal approval by the timer (05 before its issue)': ['Approved — on its way to Sam', 'Approved — on its way to you', 'Approved — waiting on your payout setup', 'Approved — payout on its way', 'Approved — waiting on your payout setup', true],
  '02 waiting only on payout setup': ['Approved — on its way to Sam', 'Approved — on its way to you', 'Approved — waiting on your payout setup', 'Approved — payout on its way', 'Approved — waiting on your payout setup', true],
  '03 late-cancel fee queued (F1)': ['Refund on its way — the cancellation fee goes to Sam', 'Cancellation fee — on its way to you', 'Cancellation fee — on its way to you', 'Cancellation fee — on its way to you', 'Cancellation fee — waiting on your payout setup', true],
  '04 queued tip': ['Tip on its way to Sam', 'Tip from Sam — on its way', 'Tip from Sam — on its way', 'On its way to you', 'Waiting on your payout setup', true],
  '04b tip transfer reversed': [null, null, null, 'Held — not sent yet', 'Held — not sent yet', false],
  '05 open issue after approval (Failure A)': ['Held — you reported an issue', 'Held — the customer reported an issue', 'Held — the customer reported an issue', 'Held — not sent yet', 'Held — not sent yet', false],
  '06 transfer reversed (Failure B)': [null, null, null, 'Held — not sent yet', 'Held — not sent yet', false],
  '07 card dispute open': [null, null, null, 'Held — not sent yet', 'Held — not sent yet', false],
  '08 attempt stopped': ['Approved — on its way to Sam', 'Approved — on its way to you', 'Approved — waiting on your payout setup', 'Approved — payout on its way', 'Approved — waiting on your payout setup', true],
  '08b attempt past 23 hours, no answer': ['Approved — on its way to Sam', 'Approved — on its way to you', 'Approved — waiting on your payout setup', 'Approved — payout on its way', 'Approved — waiting on your payout setup', true],
  '09a sent, answer lost, transfer.created not applied': ['Approved — on its way to Sam', 'Approved — on its way to you', 'Approved — waiting on your payout setup', 'Approved — payout on its way', 'Approved — waiting on your payout setup', true],
  '09b sent, drain recorded it, transfer.created not applied': ['Paid', 'You received', 'You received', 'Released 2 h ago — on its way to your bank', 'Released 2 h ago — on its way to your bank', false],
  '09c fee sent and recorded, refund still queued (F3)': ['Refund on its way — the cancellation fee goes to Sam', 'Cancellation fee — on its way to you', 'Cancellation fee — on its way to you', 'Cancellation fee — sent to your payout account', 'Cancellation fee — sent to your payout account', false],
  '10 released': ['Paid', 'You received', 'You received', 'Released 2 h ago — on its way to your bank', 'Released 2 h ago — on its way to your bank', false],
  '11 refund queued, no fee': ['Refund on its way — back on your card in a few days', 'Refund on its way to the customer', 'Refund on its way to the customer', 'Refund on its way to the customer', 'Refund on its way to the customer', false],
  '12 never approved': ['Held in protection — released when you approve', 'Held in protection — yours when the customer approves', 'Held in protection — yours when the customer approves', 'Held in protection', 'Held in protection', false],
  '13a hand refund failed, part of the charge': [FAILED, null, null, 'Held — not sent yet', 'Held — not sent yet', false],
  '13c hand refund failed, part, then arranged': [ARRANGED, null, null, 'Held — not sent yet', 'Held — not sent yet', false],
  'F2 fee waiting on payout setup': ['Refund on its way — the cancellation fee goes to Sam', 'Cancellation fee — on its way to you', 'Cancellation fee — on its way to you', 'Cancellation fee — on its way to you', 'Cancellation fee — waiting on your payout setup', true],
  'F2b fee waiting on payout setup, the rest refunded': ['Partly refunded', 'Partly refunded to the customer', 'Partly refunded to the customer', 'Cancellation fee — on its way to you', 'Cancellation fee — waiting on your payout setup', true],
  'F4 fee, card dispute before the send': ['Refund on its way — the cancellation fee goes to Sam', null, null, 'Held — not sent yet', 'Held — not sent yet', false],
  'F5 fee reversed after the send': ['Refund on its way — the cancellation fee goes to Sam', null, null, 'Held — not sent yet', 'Held — not sent yet', false],
  'F6 fee, the refund of the rest failed': [FAILED, null, null, 'Held — not sent yet', 'Held — not sent yet', false],
};

test('R8-A1 · the rows: the app columns cannot tell them apart; the fact the database answers does', () => {
  assert.deepEqual(Object.keys(SHOWN), Object.keys(ROWS), 'one expected line per row');
  // tests.pw_app's three groups: the same columns, different facts.
  for (const group of [
    ['01 normal approval', '06 transfer reversed (Failure B)', '07 card dispute open', '08 attempt stopped'],
    ['01t normal approval by the timer (05 before its issue)', '05 open issue after approval (Failure A)'],
    ['03 late-cancel fee queued (F1)', 'F4 fee, card dispute before the send', 'F5 fee reversed after the send'],
    ['04 queued tip', '04b tip transfer reversed'],
  ]) {
    assert.equal(new Set(group.map((name) => cols(ROWS[name]))).size, 1, `${group.join(', ')}: the same app columns`);
    assert.equal(new Set(group.map((name) => ROWS[name].payoutOnItsWay)).size, 2, `${group.join(', ')}: the fact differs`);
  }
  for (const [name, row] of Object.entries(ROWS)) assert.equal(isPayoutOnItsWay(row), row.payoutOnItsWay, `${name}: the rule is the fact`);
  // A row the fact never reached (a hand-built row, an older reader) is not on its way.
  assert.equal(isPayoutOnItsWay(JSON.parse(cols(ROWS['01 normal approval']))), false, 'no fact: say less');
});

test('R8-A1 · payoutSetupNotice: the database’s fact, on every row, and nothing when the payouts are enabled or unread', () => {
  for (const [name, row] of Object.entries(ROWS)) {
    for (const status of ['none', 'action_needed', 'under_review']) {
      assert.equal(payoutSetupNotice(status, [row]) !== null, SHOWN[name][5], `${name}, ${status}`);
      assert.equal(payoutSetupNotice(status, [row]) !== null, row.payoutOnItsWay, `${name}, ${status}: the fact`);
    }
    assert.equal(payoutSetupNotice('enabled', [row]), null, `${name}: enabled says nothing`);
    assert.equal(payoutSetupNotice(null, [row]), null, `${name}: unread says nothing`);
  }
  assert.equal(payoutSetupNotice('none', Object.values(ROWS)), PAYOUT_SETUP_NOTICE, 'the Payouts page: one sentence for all the rows');
  // The worker's nudge names what still travels to them (the card's own figure).
  assert.equal(workerReceivesCents(ROWS['02 waiting only on payout setup'], workerTakeCents), 4625);
  assert.equal(workerReceivesCents(ROWS['F2 fee waiting on payout setup'], workerTakeCents), 1500);
  assert.equal(workerReceivesCents(ROWS['F2b fee waiting on payout setup, the rest refunded'], workerTakeCents), 1500, 'the fee, once the rest is refunded');
});

test('R8-A1 · the caption and the Earnings line, word for word on every row; a payout promised only under the fact', () => {
  for (const [name, row] of Object.entries(ROWS)) {
    const [customer, worker, workerSetup, earned, earnedSetup] = SHOWN[name];
    assert.equal(paymentCaption(facts(row), 'customer'), customer, `${name}: the customer`);
    assert.equal(workerCaption(row, 'enabled'), worker, `${name}: the worker`);
    assert.equal(workerCaption(row, 'none'), workerSetup, `${name}: the worker, no payout account`);
    assert.equal(meta(row, 'enabled'), earned, `${name}: Earnings`);
    assert.equal(meta(row, 'none'), earnedSetup, `${name}: Earnings, no payout account`);
    // The invariant beside the words: a payout is promised only under the fact (the fee once sent says so).
    for (const line of [customer, worker, workerSetup, earned, earnedSetup]) {
      if (line && PAYOUT.test(line)) assert.ok(row.payoutOnItsWay || SAID.has(name), `${name}: "${line}" without the fact`);
    }
  }
  // Codex R8-A1 (D3): the review page passes no issue; on Failure A it says nothing rather than "on its way".
  assert.equal(paymentCaption(facts(ROWS['05 open issue after approval (Failure A)'], { issueOpen: undefined }), 'customer'), null);
});

// The screens' guards, extracted as written and run on the rows.
const extract = (file, re) => {
  const m = code(file).match(re);
  assert.ok(m, `${file}: ${re.source.slice(0, 60)}`);
  return m[1];
};
const NOTES = {
  approve: new Function('releaseRequested', 'isPayoutOnItsWay', 'payment', `return ${extract('screens/ApproveOrDisputeScreen.tsx',
    /: (releaseRequested && !isPayoutOnItsWay\(payment\) \? [^]*? : 'You approved the work\. The payment is on its way to the worker and shows as released when the transfer lands\.')/)} : null;`),
  review: new Function('isPayoutOnItsWay', 'payment', `return ${extract('screens/ReviewAndTipScreen.tsx',
    /: (!isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? '[^']*' : '[^']*' : payment\.release_reason === 'auto_approved' \? '[^']*' : '[^']*')/)};`),
  tipCard: new Function('isPayoutOnItsWay', 'payment', `return ${extract('screens/ReviewAndTipScreen.tsx',
    /\{(isPayoutOnItsWay\(payment\) \? ' Yours is approved[^']*' : null)\}/)};`),
  tipLine: new Function('isRefundFailed', 'isRefundArranged', 'isPayoutOnItsWay', 'isReleased', 'tip', 'workerName', `return ${extract('screens/ReviewAndTipScreen.tsx',
    /const where = (isRefundFailed\(tip\) \|\| isRefundArranged\(tip\) \? null : isPayoutOnItsWay\(tip\) \? `[^`]*` : isReleased\(tip\) \? `[^`]*` : null);/)};`),
  detailNote: new Function('stripe', 'isPayoutOnItsWay', 'payment', `return ${extract('screens/ClientJobDetailScreen.tsx',
    /\{(stripe && isPayoutOnItsWay\(payment\)) \? \( <Text style=\{styles\.paymentNote\}> The payment reaches/)};`),
  detailCard: new Function('isPayoutOnItsWay', 'payment', `return ${extract('screens/ClientJobDetailScreen.tsx',
    /\) : (isPayoutOnItsWay\(payment\)) \? \( <Card palette=\{emeraldColors\} style=\{\[styles\.approvalCard, isDark && styles\.hairlineDark\]\}> <Text style=\{styles\.approvalTitle\}>Work approved — payout on its way/)};`),
  workerFee: new Function('isCancellationFeeKept', 'isPayoutOnItsWay', 'payment', 'clientName', `${extract('screens/WorkerJobScreen.tsx',
    /(if \(isCancellationFeeKept\(payment\)\) \{ return isPayoutOnItsWay\(payment\) \|\| !!payment\.released_at \? `[^`]*` : '[^']*'; \})/)} return undefined;`),
  workerLive: new Function('isReleaseRequested', 'isRefundQueued', 'isCancellationFeeKept', 'isPayoutOnItsWay', 'waitingOnSetup', 'PAYOUT_SETUP_NOTICE', 'clientName', 'payment', `${extract('screens/WorkerJobScreen.tsx',
    /(if \(isReleaseRequested\(payment\) && isRefundQueued\(payment\) && !isCancellationFeeKept\(payment\)\) \{[^]*? if \(isReleaseRequested\(payment\)\) \{ return [^;]*; \})/)} return undefined;`),
};
const ON_ITS_WAY = ' The payment is on its way to the worker and shows as released when the transfer lands.';
const notesFor = (row, status = 'enabled') => {
  const waitingOnSetup = payoutSetupNotice(status, [row]) !== null;
  return {
    approve: NOTES.approve(isReleaseRequested(row), isPayoutOnItsWay, row),
    review: NOTES.review(isPayoutOnItsWay, row),
    tipCard: NOTES.tipCard(isPayoutOnItsWay, row),
    detailNote: NOTES.detailNote(true, isPayoutOnItsWay, row) ? 'The payment reaches Sam once their payout account is ready' : null,
    detailCard: NOTES.detailCard(isPayoutOnItsWay, row) ? 'Work approved — payout on its way' : null,
    workerLive: NOTES.workerLive(isReleaseRequested, isRefundQueued, isCancellationFeeKept, isPayoutOnItsWay, waitingOnSetup, PAYOUT_SETUP_NOTICE, 'Sam', row) ?? null,
  };
};

test('R8-A1 · the screens’ notes: Failure A, Failure B, a card dispute and the reversed or disputed fee promise nothing; the controls as before', () => {
  // The held, approved job payments the customer's approval and review pages and the worker's job page describe.
  for (const [name, row] of Object.entries(ROWS)) {
    if (row.kind !== 'job_payment' || row.status !== 'held' || row.job_status === 'cancelled' || !row.release_requested_at) continue;
    const n = notesFor(row);
    const promised = Object.values(n).filter((line) => line && new RegExp(PROMISE.source, 'i').test(line));
    assert.equal(promised.length > 0, row.payoutOnItsWay, `${name}: ${JSON.stringify(n)}`);
  }
  // Word for word: the controls (01, 01t), Failure A (05), Failure B (06), the card dispute (07).
  assert.deepEqual(notesFor(ROWS['01 normal approval']), {
    approve: `You approved the work.${ON_ITS_WAY}`, review: `Approved on your say-so.${ON_ITS_WAY}`,
    tipCard: ' Yours is approved and on its way — if they haven’t set up payouts yet, it lands the moment they do.',
    detailNote: 'The payment reaches Sam once their payout account is ready', detailCard: 'Work approved — payout on its way',
    workerLive: 'Sam approved the finished work. Your payout is on its way and shows as released when the transfer lands.',
  });
  assert.equal(notesFor(ROWS['01t normal approval by the timer (05 before its issue)']).approve, `Approved automatically after 72 hours with no issue reported.${ON_ITS_WAY}`);
  assert.equal(notesFor(ROWS['02 waiting only on payout setup'], 'action_needed').workerLive, `Sam approved the finished work. ${PAYOUT_SETUP_NOTICE}`);
  // Failure A: the worker's page says the issue first (lifecycle 'disputed', pinned below); the customer's pages the approval alone.
  assert.deepEqual(notesFor(ROWS['05 open issue after approval (Failure A)']), {
    approve: 'Approved automatically after 72 hours.', review: 'Approved automatically after 72 hours.', tipCard: null,
    detailNote: null, detailCard: null, workerLive: 'Approved automatically after 72 hours with no response from Sam.',
  });
  for (const name of ['06 transfer reversed (Failure B)', '07 card dispute open', '13a hand refund failed, part of the charge']) {
    assert.deepEqual(notesFor(ROWS[name]), {
      approve: 'You approved the work.', review: 'Approved on your say-so.', tipCard: null, detailNote: null, detailCard: null,
      workerLive: 'Sam approved the finished work.',
    }, name);
  }
  const worker = code('screens/WorkerJobScreen.tsx');
  const disputedAt = worker.indexOf("if (lifecycle === 'disputed') {");
  const payoutAt = worker.indexOf('if (isPayoutOnItsWay(payment) && waitingOnSetup) {');
  assert.ok(disputedAt >= 0 && payoutAt >= 0, 'both branches are in WorkerJobScreen.tsx');
  assert.ok(disputedAt < payoutAt, 'the worker reads the open issue before any payout sentence');
  // The tip: on its way under the fact; the reversed tip says nothing about where it is.
  assert.equal(NOTES.tipLine(isRefundFailed, isRefundArranged, isPayoutOnItsWay, isReleased, ROWS['04 queued tip'], 'Sam'),
    'Your tip is on its way to Sam on top of the job payment.');
  assert.equal(NOTES.tipLine(isRefundFailed, isRefundArranged, isPayoutOnItsWay, isReleased, ROWS['04b tip transfer reversed'], 'Sam'), null);
  // The worker's late-cancel note: the fee promised under the fact or once sent; the first sentence alone otherwise.
  const LONG = 'This job was cancelled late. The cancellation fee is on its way to you; the rest goes back to Sam.';
  for (const [name, expected] of [
    ['03 late-cancel fee queued (F1)', LONG], ['F2 fee waiting on payout setup', LONG], ['09c fee sent and recorded, refund still queued (F3)', LONG],
    ['F6 fee, the refund of the rest failed', 'This job was cancelled late.'],
    ['F4 fee, card dispute before the send', 'This job was cancelled late.'], ['F5 fee reversed after the send', 'This job was cancelled late.'],
  ]) {
    assert.equal(NOTES.workerFee(isCancellationFeeKept, isPayoutOnItsWay, ROWS[name], 'Sam'), expected, name);
  }
  // F2b: the rest refunded (partially_refunded) is not the kept-fee shape; the next sentence describes it, as before.
  assert.equal(NOTES.workerFee(isCancellationFeeKept, isPayoutOnItsWay, ROWS['F2b fee waiting on payout setup, the rest refunded'], 'Sam'), undefined);
});

test('R8-A1 · the fetchers: the fact beside the row; a failed or missing read says less and never blocks the row', async () => {
  const row = { id: 'pay-1', job_id: 'job-1', status: 'held', release_requested_at: AT, transfer_cents: 4625, refund_cents: 0 };
  const tip = { ...row, id: 'tip-1', kind: 'tip' };
  const chain = (data) => {
    const q = { select: () => q, eq: () => q, not: () => q, maybeSingle: () => Promise.resolve({ data, error: null }) };
    return q;
  };
  const answers = {
    named: () => Promise.resolve({ data: ['pay-1', 'tip-1'], error: null }),
    none: () => Promise.resolve({ data: [], error: null }),
    missing: () => Promise.resolve({ data: null, error: { message: 'Could not find the function public.my_payouts_on_their_way' } }),
    odd: () => Promise.resolve({ data: { id: 'pay-1' }, error: null }),
    rejects: () => Promise.reject(new Error('network')),
    throws: () => { throw new Error('no client'); },
  };
  const expected = { named: true, none: false, missing: false, odd: false, rejects: false, throws: false };
  for (const [how, answer] of Object.entries(answers)) {
    for (const approved of [true, false]) {
      const read = { ...row, release_requested_at: approved ? AT : null };
      stub.rpc = (name, args) => {
        if (name === 'job_payment_state') return Promise.resolve({ data: { ...read, job_id: args.p_job_id }, error: null });
        if (name === 'my_payouts_on_their_way') return answer();
        throw new Error(`unexpected RPC ${name}`);
      };
      stub.from = () => chain({ ...tip, release_requested_at: read.release_requested_at });
      const state = await fetchJobPaymentState('job-1');
      assert.equal(state.error, null, `${how}: the payment read stands`);
      assert.equal(state.data?.id, 'pay-1', `${how}: the row is returned`);
      // D4, the snapshot guard: a row read before its approval never carries the fact.
      assert.equal(state.data.payoutOnItsWay, expected[how] && approved, `${how}, approved ${approved}: the fact`);
      const tipRead = await fetchJobTip('job-1');
      assert.equal(tipRead.data?.id, 'tip-1', `${how}: the tip is returned`);
      assert.equal(tipRead.data.payoutOnItsWay, expected[how] && approved, `${how}, approved ${approved}: the tip's fact`);
    }
    stub.rpc = (name) => (name === 'my_payouts_on_their_way' ? answer() : Promise.resolve({ data: null, error: null }));
    assert.equal((await fetchPayoutsOnTheirWay()).size, expected[how] ? 2 : 0, `${how}: the set`);
  }
  stub.rpc = () => { throw new Error('no RPC'); };
  stub.from = () => { throw new Error('no read'); };
});
