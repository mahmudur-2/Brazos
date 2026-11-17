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
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
// Comments out (a trailing // comment too, so a guard's comment never counts as a sentence), then one line.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const code = (path) => strip(read(path)).replace(/\s+/g, ' ');

const rules = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);
const { isCancellationFeeKept, isHeld, isPayoutOnItsWay, isRefundArranged, isRefundFailed, isRefundQueued, isReleased, isReleaseRequested } = rules;
const { paymentCaption } = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);
const { deriveJobLifecycle, isRefundFailureRecorded, myJobsNextAction, releaseAtLabel, releaseDeadlineMs } = await import(pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href);
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
const { PAYOUT_SETUP_NOTICE, payoutSetupNotice, workerTakeCents, fetchJobPaymentState, fetchJobTip, fetchPayoutsOnTheirWay, fetchJobPaymentStatusesByJobIds } = await import(
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
    re: /: !isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? 'Approved automatically\.' : 'Approved on your say-so\.' : payment\.release_reason === 'auto_approved' \? 'Approved automatically\. The payment is on its way to the worker and shows as released when the transfer lands\.' : 'Approved on your say-so\. The payment is on its way to the worker and shows as released when the transfer lands\.'/ },
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 3, why: `${UNDER_RULE}; the first sentence is the tip's condition, not a promise (A10a, kept on a refund row)`,
    re: /A tip can be added once the job payment reaches \{workerName \?\? 'the worker'\}\. \{isPayoutOnItsWay\(payment\) \? ' Yours is approved and on its way — if they haven’t set up payouts yet, it lands the moment they do\.' : null\}/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 2, why: `${UNDER_RULE} (the first sentence alone otherwise: a refund, an issue after the timer, a reversed transfer, a card dispute)`,
    re: /: releaseRequested && !isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? 'Approved automatically\.' : 'You approved the work\.' : releaseRequested \? payment\.release_reason === 'auto_approved' \? 'Approved automatically with no issue reported\. The payment is on its way to the worker and shows as released when the transfer lands\.' : 'You approved the work\. The payment is on its way to the worker and shows as released when the transfer lands\.'/ },
  // Codex R12-A1: from the note's guard, so the entry asks (the two sentences above are inside it).
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 3, why: 'the approve action itself, before any approval, unless a refund failure is recorded (R11-A2; a refund queued: R7-A3b, the owner decides)',
    re: /\{!released && !releaseRequested && releaseAllowed && isRefundFailureRecorded\(payment\) \? null : \( <Text style=\{styles\.paymentNote\}> \{released \? payment\.release_reason === 'auto_approved' \? 'Released automatically with no issue reported\.' : 'You approved the work and the payment was released to the worker\.' : releaseRequested && !isPayoutOnItsWay\(payment\) \? payment\.release_reason === 'auto_approved' \? 'Approved automatically\.' : 'You approved the work\.' : releaseRequested \? payment\.release_reason === 'auto_approved' \? 'Approved automatically with no issue reported\. The payment is on its way to the worker and shows as released when the transfer lands\.' : 'You approved the work\. The payment is on its way to the worker and shows as released when the transfer lands\.' : releaseAllowed \? 'Approving sends this payment on its way to the worker\. If something isn’t right, report the issue instead — release waits while a report is open\.'/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 1, why: 'the approve dialog, before any approval: what approving does, with no timing (R8-A1 vocabulary), unless a refund failure is recorded (R11-A2)',
    re: /\(isRefundFailureRecorded\(payment\) \? '' : '\\n\\n' \+ 'This approves the finished work and releases the payment to the worker\. It can’t be undone — the payout is sent on the provider’s schedule and shows as released when the transfer lands\.'\)/ },
  // Codex R12-A1: the release vocabulary's sentences on this page, each under the predicate. The three
  // labels are the owner's (Phase 15): the shorter words where a refund failure is recorded.
  // A4 wiring (P1): releaseAt asks the predicate (never().releaseAt); a time is shown only while it is ahead.
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 0, why: 'the timer, unless a refund failure is recorded (R11-A2) or the time is not ahead (P1)',
    re: /\{held && releaseAt != null && releaseAt > serverNowMs\(\) \? \( <Text style=\{styles\.paymentNote\}> Releases automatically \{releaseAtLabel\(releaseAt, serverNowMs\(\)\)\} if you do nothing\. <\/Text> \) : null\}/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 0, why: 'the approve button',
    re: /\? releaseAllowed \? isRefundFailureRecorded\(payment\) \? 'Approve the Work' : `Approve & Release Payment` : undefined/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 0, why: 'the approve dialog’s title',
    re: /title=\{isRefundFailureRecorded\(payment\) \? 'Approve the finished work\?' : 'Release the payment to the worker\?'\}/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 0, why: 'the approve dialog’s confirm button',
    re: /confirmText=\{isRefundFailureRecorded\(payment\) \? 'Approve' : 'Approve & Release'\}/ },
  { file: 'screens/ApproveOrDisputeScreen.tsx', hits: 0, why: 'the withdraw dialog: the second sentence alone where a refund failure is recorded (R11-A2)',
    re: /message=\{ \(isRefundFailureRecorded\(payment\) \? '' : 'Release is unfrozen once the report is withdrawn — including the automatic release timer\. '\) \+ 'You can approve the work yourself right after\.' \}/ },
  { file: 'screens/ClientJobDetailScreen.tsx', hits: 0, why: 'the approval note, unless a refund failure is recorded (R11-A2); its time only while ahead (P1)',
    re: /\{isRefundFailureRecorded\(payment\) \? null : \( <Text style=\{styles\.noticeText\}> Review what \{workerName\} submitted, then approve to release the held funds or report an issue\. \{approvalDeadline != null && approvalDeadline > serverNowMs\(\) \? ` With no response, the funds release automatically \$\{releaseAtLabel\(approvalDeadline, serverNowMs\(\)\)\}\.` : null\} <\/Text> \)\}/ },
  { file: 'screens/ReviewAndTipScreen.tsx', hits: 0, why: 'the review gate, unless a refund failure is recorded (R11-A2)',
    re: /body: isRefundFailureRecorded\(payment\) \? undefined : 'Release the held payment \(or report an issue\) before leaving your review — a review should never stand between the worker and their money\.',/ },
  { file: 'screens/ClientJobDetailScreen.tsx', hits: 1, why: UNDER_RULE,
    re: /\{stripe && isPayoutOnItsWay\(payment\) \? \( <Text style=\{styles\.paymentNote\}> The payment reaches \{workerFirstName\} once their payout account is ready — it shows as released when the transfer lands\. If they haven’t set up payouts yet, their job screen asks them to\. <\/Text> \) : null\}/ },
  { file: 'screens/ClientJobDetailScreen.tsx', hits: 2, why: `${UNDER_RULE} (no card otherwise; the pinned review button stays; the review is offered until one is left, A5)`,
    re: /\) : isPayoutOnItsWay\(payment\) \? \( <Card palette=\{emeraldColors\} style=\{\[styles\.approvalCard, isDark && styles\.hairlineDark\]\}> <Text style=\{styles\.approvalTitle\}>Work Approved — Payout on Its Way<\/Text> <Text style=\{styles\.noticeText\}> You approved \{workerName\}’s work\. The payment is on its way to them and shows as released when the transfer lands\.\{reviewedByMe === true \? null : ' Leave a review whenever you like\.'\} <\/Text> <\/Card> \) : null/ },
  // The worker.
  { file: 'screens/WorkerJobScreen.tsx', hits: 1, why: 'the import of the setup sentence',
    re: /isReleaseRequested, PAYOUT_SETUP_NOTICE, payoutSetupNotice,/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 1, why: `the late-cancel fee, ${UNDER_RULE} or once its transfer was sent (released_at); the first sentence alone otherwise`,
    re: /if \(isCancellationFeeKept\(payment\)\) \{ return isPayoutOnItsWay\(payment\) \|\| !!payment\.released_at \? `This job was cancelled late\. The cancellation fee is on its way to you; the rest goes back to \$\{clientName\}\.` : 'This job was cancelled late\.'; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 4, why: `${UNDER_RULE} (a refund queued says the payment goes back first; the approval alone after)`,
    re: /if \(isReleaseRequested\(payment\) && isRefundQueued\(payment\) && !isCancellationFeeKept\(payment\)\) \{ return `\$\{clientName\}’s payment goes back to them\.`; \} if \(isPayoutOnItsWay\(payment\) && waitingOnSetup\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically with no response from \$\{clientName\}\. \$\{PAYOUT_SETUP_NOTICE\}` : `\$\{clientName\} approved the finished work\. \$\{PAYOUT_SETUP_NOTICE\}`; \} if \(isPayoutOnItsWay\(payment\)\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically with no response from \$\{clientName\}\. Your payout is on its way and shows as released when the transfer lands\.` : `\$\{clientName\} approved the finished work\. Your payout is on its way and shows as released when the transfer lands\.`; \} if \(isReleaseRequested\(payment\)\) \{ return payment\.release_reason === 'auto_approved' \? `Approved automatically with no response from \$\{clientName\}\.` : `\$\{clientName\} approved the finished work\.`; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 0, why: 'an open issue: the first sentence alone where a refund failure is recorded (R12-A1)',
    re: /if \(lifecycle === 'disputed'\) \{ const issue = `\$\{clientName\} reported an issue, which holds the funds while it’s open\.`; if \(isRefundFailureRecorded\(payment\)\) return issue; return `\$\{issue\} Sort it out together in chat — release resumes when the report is withdrawn or resolved\.`; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 0, why: 'waiting on approval: the first sentence alone where a refund failure is recorded (R11-A2) or no time is ahead (P1)',
    re: /if \(lifecycle === 'awaiting_approval'\) \{ const waiting = `Waiting on \$\{clientName\} to approve the finished work\.`; const releaseAt = isRefundFailureRecorded\(payment\) \? null : releaseDeadlineMs\(job\); const now = serverNowMs\(\); if \(releaseAt == null \|\| releaseAt <= now\) return waiting; return `\$\{waiting\} If they don’t respond, the funds release automatically \$\{releaseAtLabel\(releaseAt, now\)\}\.`; \}/ },
  { file: 'screens/WorkerJobScreen.tsx', hits: 0, why: 'the payout nudge’s only use (components/PayoutNudge.tsx), under payoutSetupNotice',
    re: /\{waitingOnSetup \? \( <View style=\{styles\.payoutNudge\}> <PayoutNudge / },
  // F10 (owner, 2026-11-16): the link now says "Set up payouts"; only its hint keeps the phrase.
  { file: 'screens/WorkerJobScreen.tsx', hits: 1, why: 'a live job (assigned or in progress) with no approved payment waiting: the ask at the hire',
    re: /\{live && paymentsMode === 'stripe' && payouts !== null && payouts !== 'enabled' && !waitingOnSetup \? \( <Pressable onPress=\{\(\) => navigateAcrossTabs\('Profile', 'Payouts', \{\}\)\} style=\{\(\{ pressed \}\) => \[styles\.linkRow, pressed && styles\.pressed\]\} accessibilityRole="button" accessibilityLabel="Set Up Payouts" accessibilityHint="Opens Payouts so the payment can reach you" > <Ionicons name="wallet-outline" size=\{20\} color=\{colors\.emerald\} \/> <Text style=\{styles\.linkRowText\}>Set Up Payouts<\/Text>/ },
  { file: 'screens/WorkerHomeScreen.tsx', hits: 3, why: 'payoutWaitCents sums only the rows payoutSetupNotice names (pinned below)',
    re: /\{payoutWaitCents != null \? \( <PressScale [^]*?accessibilityLabel=\{`Set up payouts to receive \$\{formatBudget\(payoutWaitCents\)\}`\} > [^]*?Set up payouts to receive \{formatBudget\(payoutWaitCents\)\} <\/Text> <Text style=\{styles\.needsJob\} numberOfLines=\{1\}> Approved — waiting on your payout setup <\/Text>/ },
  { file: 'screens/EarningsScreen.tsx', hits: 1, why: 'the total of the paid_out rows: money already transferred (R8-A1 vocabulary)',
    re: /label="TRANSFERRED" icon="arrow-up-circle-outline" cents=\{s\.transferredCents\} note="Transferred to you"/ },
  { file: 'screens/PayoutsScreen.tsx', hits: 2, why: ABOUT,
    re: /strong="Approved payments transfer on their own" text="when a customer approves your finished work, the payment is released and transferred to you on the provider’s schedule\."/ },
  { file: 'components/PayoutNudge.tsx', hits: 2, why: 'shown only where payoutSetupNotice says so (pinned below)', via: /<PayoutNudge\b/,
    re: /accessibilityLabel=\{`Set up payouts to receive \$\{amount\}`\} > <Ionicons name="wallet-outline" size=\{18\} color=\{colors\.mark\} \/> <Text style=\{styles\.text\} numberOfLines=\{1\}> Set up payouts to receive / },
  // The copy modules.
  { file: 'lib/payments.ts', hits: 1, why: 'the Payouts page for a worker with no payout account: about the account, no payment named',
    re: /body: 'Set up payouts to receive what you earn\./ },
  { file: 'lib/payments.ts', hits: 1, why: `the Payouts page for an enabled account: ${ABOUT}`,
    re: /body: 'Approved payments are transferred to you on the provider’s schedule\. There is nothing to trigger here\.'/ },
  { file: 'lib/payments.ts', hits: 2, why: 'the setup sentence itself', via: /(?<!import \{[^}]*)\bPAYOUT_SETUP_NOTICE\b(?! =)/,
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
  // Codex R12-A1: the clock's sentences. The time is the caller's argument, null where a refund failure
  // is recorded: every releaseDeadlineMs( call asks the predicate (the clock scan in R11-A2's test).
  { file: 'lib/earningsCopy.ts', hits: 0, why: 'the Earnings clock: no deadline, no time',
    re: /const deadline = row\.releaseDeadlineMs; if \(deadline == null\) return 'Held in protection'; if \(deadline > nowMs\) \{ return `Held in protection — releases \$\{f\.countdown\(deadline, nowMs\)\} unless approved first`; \} return 'Held in protection — automatic release is due';/ },
  { file: 'lib/jobLifecycle.ts', hits: 0, why: 'the hub lines: no deadline, no time',
    re: /case 'awaiting_approval': if \(perspective === 'customer'\) \{ return releasesAt \? `Approval needed — releases \$\{releasesAt\}` : 'Approval needed — review the finished work'; \} return releasesAt \? `Waiting on approval — releases \$\{releasesAt\}` : 'Waiting on customer approval';/ },
  { file: 'lib/liveJobStatus.ts', hits: 0, why: 'the card’s detail: no deadline, no time',
    re: /: releasesAt \? `approve, or it releases \$\{releasesAt\}` : 'approve the work',/ },
  { file: 'lib/moneyCopy.ts', hits: 0, why: 'held before approval: the worker’s line asks both refund facts here; the customer’s failure captions open the function (executed: rows 14a, 14c)',
    re: /if \(!customer && \(facts\.refundFailed \|\| facts\.refundArranged\)\) return HELD_IN_PROTECTION; return customer \? `\$\{HELD_IN_PROTECTION\} — released when you approve` : `\$\{HELD_IN_PROTECTION\} — yours when the customer approves`;/ },
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

// Codex R12-A1: the release vocabulary. Every user-visible text in the four folders (a string, a template
// by its literal parts, JSX text: read by the TypeScript parser; one word alone, an import or a type is not
// a sentence) that holds one of these words has a class. P promises that an approval, the clock, a
// withdrawal or a resolution releases or pays THIS payment: it lies in a census entry whose match ASKS (the
// predicate, the payout fact, or a name built from them and pinned elsewhere: approvalDeadline in
// never().detailDeadline; releaseAt in never().releaseAt (A4 wiring P1); waitingOnSetup and payoutWaitCents from payoutSetupNotice, the fact; releasesAt
// and deadline from the caller's clock, which the clock scan holds to the predicate), or every use of it
// does (`via`). Every other text is on NO_PROMISE with its class and why: C a condition or a refusal, F a
// fact about the past, G how payouts work with no payment named, N not a release or a payout of a payment.
const VOCABULARY = /\b(?:releas(?:e|es|ed|ing)|resum(?:e|es|ed)|unfrozen|frozen|on its way|yours when|72 hours|automatic(?:ally)?|payouts?|paid out|transfer(?:s|red)?|reaches)\b/i;
const ASKS = /isRefundFailureRecorded\(|isPayoutOnItsWay\(|\.payoutOnItsWay\b|facts\.refundFailed \|\| facts\.refundArranged|approvalDeadline != null|releaseAt != null|\{waitingOnSetup \?|payoutWaitCents != null|releasesAt \?|deadline == null/;
const NO_PROMISE = {
  'screens/ApproveOrDisputeScreen.tsx': [
    ['F', 'the release answer: nothing was released', /^(The payment was not released|We checked again: the funds are still held and nothing was released\. Check your connection and try again\.|Could not release the payment|\$\{userMessage\(result\.error, 'Check your connection and try again\.'\)\}\\n\\nThe funds are exactly where they were — nothing was released\.)$/],
    ['C', 'the release answer lost: approving again releases nothing twice', /^(We couldn’t confirm the release|We couldn’t reach Brazos to check whether the payment was released\. Check your connection, then pull to refresh before you decide\. Approving again is safe — a payment is released only once\.)$/],
    ['C', 'an open issue (the customer): the payment stays held while it is open', /^The payment stays held while this report is open — including the automatic release timer\. Brazos will look at it and reply within 2 business days. Withdraw it below if things get sorted out\.$/],
    ['C', 'no protected payment: nothing to release until checkout finishes (no refund of it can have failed)', /^(The payment is authorized — not charged — but checkout never finished, so there is nothing to release yet\. Finish checkout to protect the funds; approval releases them afterwards\.|This job finished without a protected payment, so there is nothing to release yet — the worker can’t be paid until the payment is protected and then released\.|This job finished without a protected payment, so there is nothing to release — you can still review the work from the job screen\.)$/],
  ],
  'screens/CheckoutScreen.tsx': [
    ['C', 'before the charge: released only after approval or the clock (no refund of it can have failed)', /^(happens only after you approve the completed work — or automatically 72 hours after you’re told the work is complete \(7 days after the work is marked complete at the latest\) if you don’t respond\. Reporting an issue holds the funds instead\.|\$\{cardLabel\(savedCard\)\} is charged the all-in total now\. Once the payment confirms, the funds are held in protection until you approve the finished work — releasing them is a separate, deliberate step after the job is done\.|Your card is charged the all-in total now, through the secure payment sheet\. Once the payment confirms, the funds are held in protection until you approve the finished work — releasing them is a separate, deliberate step after the job is done\.)$/],
  ],
  'screens/ClientJobDetailScreen.tsx': [
    ['C', 'no protected payment: the worker is paid only once it is protected and released', /^The work is finished, but the worker can’t be paid until the payment is protected and then released\.$/],
    ['F', 'released', /^Payment Released$/],
  ],
  'screens/CompareBidsScreen.tsx': [['G', 'a protection tile: evidence before release', /^Before release$/]],
  'screens/DeleteAccountScreen.tsx': [['G', 'the payout account outlives the account', /^Your payout account stays open until every payment still owed to you has reached it — nothing you earned is lost with the account\.$/]],
  'screens/EarningsScreen.tsx': [
    ['N', 'the screen title', /^Earnings & Payouts$/],
    ['F', 'the totals: released, transferred', /^(Released to you|Transferred to you)$/],
  ],
  'screens/EmailSignInScreen.tsx': [['N', 'a reset link', /^If an account uses \$\{trimmedEmail\}, a reset link is on its way\. Open it on this phone to set a new password\.$/]],
  'screens/JobConfirmedScreen.tsx': [['C', 'just hired: held until approved, nothing released', /^(\$\{workerName\} is hired and your payment is protected\. Funds stay held until the work is done and approved — nothing has been released\.|Your card was charged\. Nothing reaches the worker until you approve the finished work\.)$/]],
  'screens/MyJobsHubScreen.tsx': [['G', 'a section’s empty line', /^Work you’ve submitted for approval lands here until funds release\.$/]],
  'screens/PayoutsScreen.tsx': [['G', 'the payout account and how payouts work', /^(Payments aren’t available right now, so there is no payout account to set up\.|The payment provider needs an email address for your payout account\.|Could not (start|open) payout setup|Payouts are on the card path only|Refresh payout status|PAYOUT STATUS|Email address for your payout account|How payouts work|Approved payments transfer on their own|when a customer approves your finished work, the payment is released and transferred to you on the provider’s schedule\.|there is nothing to trigger\. Earnings shows each payment as held, released and transferred as it happens\.)$/]],
  'screens/PostJobScreen.tsx': [['N', 'a job request', /^Your request is on its way\.$/]],
  'screens/ProfileScreen.tsx': [['N', 'a menu row', /^Earnings & Payouts$/]],
  'screens/ReviewAndTipScreen.tsx': [['F', 'released', /^(Released automatically\.|Released on your approval\.)$/]],
  'screens/VerifyPhoneScreen.tsx': [['N', 'a sign-in code', /^A new code is on its way\. The previous one no longer works\.$/]],
  'screens/WorkerHomeScreen.tsx': [['N', 'the job feed', /^No open jobs right now — new jobs appear here automatically as customers post them\.$/]],
  'screens/WorkerJobScreen.tsx': [
    ['F', 'released', /^(Released automatically with no response from the customer\.|\$\{clientName\} approved the finished work and the payment was released\.)$/],
    ['C', 'held: released only after approval (Phase 14: unchanged)', /^\$\{clientName\} placed the funds in protection\. They’re released only after the finished work is approved\.$/],
    ['C', 'a live job: the payment reaches the worker only through a payout account', /^(Set Up Payouts|Opens Payouts so the payment can reach you|Set up payouts so the payment can reach you)$/],
  ],
  'screens/WorkerResultsScreen.tsx': [['N', 'the job feed', /^(Nothing open nearby right now — new jobs appear automatically as customers post them\.|New jobs appear here automatically as customers post them\.)$/]],
  'components/DraftCard.tsx': [['N', 'a draft job', /^(Resumes your unpublished job|Resume where you left off — workers can’t see it until you publish\.)$/]],
  'lib/earningsCopy.ts': [
    ['N', 'a refund going home', /^Refund on its way to the customer$/],
    ['F', 'released or transferred', /^(Released \(auto\) \$\{when\}|Released \$\{when\}|\$\{base\} — on its way to your bank|Transferred \$\{row\.paid_out_at \? f\.timeAgo\(row\.paid_out_at\) : ''\})$/],
  ],
  'lib/jobLifecycle.ts': [['C', 'an open issue: release is frozen while it is open', /^Issue reported — release is frozen$/]],
  // B6: the owner's own decision, asked before it is sent (the server says whether the side is open).
  'lib/adminAttention.ts': [['C', 'the owner’s decision, asked before it is sent', /^This releases the payment to the worker\. You cannot undo it\.$/]],
  'lib/legal/privacyPolicy.ts': [['G', 'the Privacy Policy (approved; not touched)', /^# Brazos Privacy Policy /]],
  'lib/legal/termsOfService.ts': [['G', 'the Terms of Service (approved; not touched)', /^# Brazos Terms of Service /]],
  'lib/moneyCopy.ts': [['F', 'paid out', /^Paid out$/]],
  'lib/navigation.ts': [['N', 'the switch to Worker Mode for Payouts', /^Payouts are part of your worker side\. Viewing them means switching to Worker Mode — your posted jobs stay exactly where they are\.$/]],
  'lib/offerCopy.ts': [['G', 'a payout account before offers', /^(Finish Payout Set-Up First|You need a payout account before you can send offers\.|Set Up Payouts|Your payout account is under review\. You can send offers once it is on\.)$/]],
  'lib/payments.ts': [['G', 'the Payouts page: the account, no payment named', /^(Payouts aren’t set up yet|Set up payouts to receive what you earn\. It’s a short setup in your browser, and you’re brought back here when it’s done\.|Set up payouts|Payout setup isn’t finished|Something is still needed before payouts can start\. Pick up where you left off — the setup resumes in your browser\.|Finish setting up payouts|Payouts under review|Payouts are set up|Approved payments are transferred to you on the provider’s schedule\. There is nothing to trigger here\.|Your payout status could not be read right now\. Try again\.|The payout setup could not be started right now\. Nothing changed — try again\.)$/]],
  'lib/phoneAuth/mode.ts': [['N', 'a software release', /^development-only mock provider, which cannot run in a release\.$/]],
};
// The user-visible texts of a file that hold the vocabulary: `raw` as code() has it (quotes included),
// `text` without them.
const sentences = (file) => {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const visit = (node) => {
    const quoted = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
    if (quoted && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || ts.isLiteralTypeNode(node.parent))) return;
    if (quoted || node.kind === ts.SyntaxKind.JsxText) {
      const raw = node.getText(sf).replace(/\s+/g, ' ').trim();
      const words = ts.isTemplateExpression(node) ? [node.head, ...node.templateSpans.map((s) => s.literal)].map((p) => p.text).join('') : quoted ? node.text : raw;
      if (VOCABULARY.test(words) && /\S\s+\S/.test(words.trim())) {
        out.push({ raw, text: (quoted ? raw.slice(1, -1) : raw).trim(), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
      }
      if (!ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};

test('R7-A3, R8-A1, R12-A1 · [static] census: every payout sentence, and every sentence of the release vocabulary, is listed under its guard or its class', () => {
  const files = ['screens', 'components', 'ui', 'lib'].flatMap(sourceFiles);
  const unlisted = [];
  const broken = [];
  const ranges = {};
  for (const file of files) {
    const src = code(file);
    ranges[file] = [];
    for (const entry of CENSUS.filter((e) => e.file === file)) {
      const all = [...src.matchAll(new RegExp(entry.re.source, 'g'))];
      const inside = all.length === 1 ? (all[0][0].match(PROMISE) ?? []).length : -1;
      if (all.length !== 1 || inside !== entry.hits) {
        broken.push(`${file}: the entry "${entry.why}" matches ${all.length} time(s), ${inside} phrase(s) (expected once, ${entry.hits})`);
        continue;
      }
      ranges[file].push({ a: all[0].index, b: all[0].index + all[0][0].length, entry, asks: ASKS.test(all[0][0]) });
    }
    for (const hit of src.matchAll(PROMISE)) {
      if (!ranges[file].some(({ a, b }) => hit.index >= a && hit.index < b)) {
        unlisted.push(`${file}: "${src.slice(Math.max(0, hit.index - 90), hit.index + 40)}"`);
      }
    }
  }
  // Codex R12-A1: an entry shown through a name (a component, a constant) asks where every use of the name asks.
  const within = (file, at, ok) => ranges[file].some((r) => at >= r.a && at < r.b && ok(r));
  for (const range of Object.values(ranges).flat().filter((r) => r.entry.via)) {
    const uses = files.flatMap((file) => [...code(file).matchAll(new RegExp(range.entry.via.source, 'g'))].map((m) => [file, m.index]));
    range.asks = uses.length > 0 && uses.every(([file, at]) => within(file, at, (r) => r.asks && !r.entry.via));
  }
  // Codex R12-A1: each sentence of the vocabulary is on NO_PROMISE, or every place it stands asks.
  const unasked = [];
  const used = new Set();
  for (const file of files) {
    const src = code(file);
    for (const { raw, text, line } of sentences(file)) {
      const said = (NO_PROMISE[file] ?? []).find(([, , re]) => re.test(text));
      if (said) {
        used.add(said);
        continue;
      }
      const at = [];
      for (let i = src.indexOf(raw); i > -1; i = src.indexOf(raw, i + 1)) at.push(i);
      if (at.length === 0 || !at.every((i) => within(file, i, (r) => r.asks))) unasked.push(`${file}:${line}: "${text.slice(0, 140)}"`);
    }
  }
  const stale = Object.entries(NO_PROMISE).flatMap(([file, list]) => list.filter((item) => !used.has(item)).map(([cls, why]) => `${file}: ${cls}, ${why}`));
  // The lists in one message, so a red run names every guard that is missing and every sentence outside.
  assert.deepEqual({ broken, unlisted, unasked, stale }, { broken: [], unlisted: [], unasked: [], stale: [] },
    'a payout or release sentence outside the census (put a promise under the predicate or the payout fact, then list it; anything else on NO_PROMISE with its class)');
  for (const entry of CENSUS) assert.ok(files.includes(entry.file), `${entry.file} is scanned`);
  for (const [file, list] of Object.entries(NO_PROMISE)) {
    assert.ok(files.includes(file), `${file} is scanned`);
    for (const [cls, why] of list) assert.match(cls, /^[CFGN]$/, `${file}: ${why}`);
  }
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
  // A4-M1 (C5): the payments side is now every page (readEveryEarningRow), still beside the fact.
  assert.match(earnings, /const \[\{ data, error \}, onTheirWay\] = await Promise\.all\(\[readEveryEarningRow\(userId\), fetchPayoutsOnTheirWay\(\)\]\);/);
  assert.match(earnings, /const payments = data\.map\(\(p\) => withPayoutFact\(p, onTheirWay\)\);/);
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
    /case 'completed': return payment && \(isReleased\(payment\) \|\| releaseRequested\) \? \{ label: reviewedByMe === true \? 'See Your Review' : stripe \|\| !isReleased\(payment\) \? 'Leave a Review' : 'Review & Tip', onPress: \(\) => navigation\.navigate\('ReviewAndTip', \{ job \}\), \} : null;/,
    'an approved row, a refund queued or not, keeps its review button ("See Your Review" once one is left, A5)'
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
  // Codex R11-A2: never approved (refund_cents 0), a hand refund of the charge failed (14a) or then arranged (14c).
  '14a never approved, hand refund failed': { ...JOB, release_requested_at: null, release_reason: null, transfer_cents: 0, refund_failed_at: AT, payoutOnItsWay: false },
  '14c never approved, hand refund arranged': { ...JOB, release_requested_at: null, release_reason: null, transfer_cents: 0, refund_arranged_at: AT, payoutOnItsWay: false },
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
  '14a never approved, hand refund failed': [FAILED, 'Held in protection', 'Held in protection', 'Held in protection', 'Held in protection', false],
  '14c never approved, hand refund arranged': [ARRANGED, 'Held in protection', 'Held in protection', 'Held in protection', 'Held in protection', false],
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
    /\) : (isPayoutOnItsWay\(payment\)) \? \( <Card palette=\{emeraldColors\} style=\{\[styles\.approvalCard, isDark && styles\.hairlineDark\]\}> <Text style=\{styles\.approvalTitle\}>Work Approved — Payout on Its Way/)};`),
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
    detailCard: NOTES.detailCard(isPayoutOnItsWay, row) ? 'Work Approved — Payout on Its Way' : null,
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
    detailNote: 'The payment reaches Sam once their payout account is ready', detailCard: 'Work Approved — Payout on Its Way',
    workerLive: 'Sam approved the finished work. Your payout is on its way and shows as released when the transfer lands.',
  });
  assert.equal(notesFor(ROWS['01t normal approval by the timer (05 before its issue)']).approve, `Approved automatically with no issue reported.${ON_ITS_WAY}`);
  assert.equal(notesFor(ROWS['02 waiting only on payout setup'], 'action_needed').workerLive, `Sam approved the finished work. ${PAYOUT_SETUP_NOTICE}`);
  // Failure A: the worker's page says the issue first (lifecycle 'disputed', pinned below); the customer's pages the approval alone.
  assert.deepEqual(notesFor(ROWS['05 open issue after approval (Failure A)']), {
    approve: 'Approved automatically.', review: 'Approved automatically.', tipCard: null,
    detailNote: null, detailCard: null, workerLive: 'Approved automatically with no response from Sam.',
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
  // F2b (G1-2): the rest refunded (partially_refunded) is still the kept-fee shape: the fee promised under the fact.
  assert.equal(NOTES.workerFee(isCancellationFeeKept, isPayoutOnItsWay, ROWS['F2b fee waiting on payout setup, the rest refunded'], 'Sam'), LONG);
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

// ---------------------------------------------------------------------------
// Codex R11-A2: never approved, and a refund of the charge failed (arranged since or not). Approval is
// accepted, but the database holds back the whole charge (supabase/tests/460_payout_on_its_way.sql, the
// approval of 14a and 14c): no sentence before the approval may say approving or the clock releases the
// payment. Every such sentence asks isRefundFailureRecorded (lib/jobLifecycle.ts) and says less; row 12,
// the control, reads every sentence as before.
// ---------------------------------------------------------------------------
const ONCE = (file, re) => {
  const all = [...code(file).matchAll(new RegExp(re.source, 'g'))];
  assert.equal(all.length, 1, `${file}: ${re.source.slice(0, 60)} (once)`);
  return all[0][1];
};
const run = (args, body) => new Function(...args, `return ${body};`);
// Read inside the test, so a guard that is gone fails that test alone.
const never = () => ({
  // A4 wiring (P1): the page's time is releaseAt, the predicate's answer; the guard shows it only while ahead.
  releaseAt: run(['isRefundFailureRecorded', 'releaseDeadlineMs', 'payment', 'job'], ONCE('screens/ApproveOrDisputeScreen.tsx',
    /const releaseAt = (isRefundFailureRecorded\(payment\) \? null : releaseDeadlineMs\(job\));/)),
  timer: run(['held', 'releaseAt', 'serverNowMs'], ONCE('screens/ApproveOrDisputeScreen.tsx',
    /\{(held && releaseAt != null && releaseAt > serverNowMs\(\)) \? \( <Text style=\{styles\.paymentNote\}> Releases automatically/)),
  detailTime: run(['approvalDeadline', 'releaseAtLabel', 'serverNowMs'], ONCE('screens/ClientJobDetailScreen.tsx',
    /then approve to release the held funds or report an issue\. \{(approvalDeadline != null && approvalDeadline > serverNowMs\(\) \? ` With no response, the funds release automatically \$\{releaseAtLabel\(approvalDeadline, serverNowMs\(\)\)\}\.` : null)\} <\/Text>/)),
  noteHidden: run(['released', 'releaseRequested', 'releaseAllowed', 'isRefundFailureRecorded', 'payment'], ONCE('screens/ApproveOrDisputeScreen.tsx',
    /\{(!released && !releaseRequested && releaseAllowed && isRefundFailureRecorded\(payment\)) \? null : \( <Text style=\{styles\.paymentNote\}> \{released/)),
  approveNote: run(['releaseAllowed'], ONCE('screens/ApproveOrDisputeScreen.tsx', /: (releaseAllowed \? '[^']*' : '[^']*')\}/)),
  dialog: run(['isRefundFailureRecorded', 'payment'], ONCE('screens/ApproveOrDisputeScreen.tsx',
    /nothing more is charged\.` \+ \((isRefundFailureRecorded\(payment\) \? '' : '\\n\\n' \+ '[^']*')\)/)),
  withdraw: run(['isRefundFailureRecorded', 'payment'], ONCE('screens/ApproveOrDisputeScreen.tsx',
    /message=\{ (\(isRefundFailureRecorded\(payment\) \? '' : '[^']*'\) \+ '[^']*') \}/)),
  // Phase 15: the owner's three shorter labels, where a refund failure is recorded.
  button: run(['isRefundFailureRecorded', 'payment'], ONCE('screens/ApproveOrDisputeScreen.tsx',
    /\? releaseAllowed \? (isRefundFailureRecorded\(payment\) \? '[^']*' : `[^`]*`) : undefined/)),
  title: run(['isRefundFailureRecorded', 'payment'], ONCE('screens/ApproveOrDisputeScreen.tsx', /title=\{(isRefundFailureRecorded\(payment\) \? '[^']*' : '[^']*')\}/)),
  confirm: run(['isRefundFailureRecorded', 'payment'], ONCE('screens/ApproveOrDisputeScreen.tsx', /confirmText=\{(isRefundFailureRecorded\(payment\) \? '[^']*' : '[^']*')\}/)),
  detailDeadline: run(['isRefundFailureRecorded', 'releaseDeadlineMs', 'payment', 'job'], ONCE('screens/ClientJobDetailScreen.tsx',
    /const approvalDeadline = (isRefundFailureRecorded\(payment\) \? null : releaseDeadlineMs\(job\));/)),
  detailNote: run(['isRefundFailureRecorded', 'payment'], ONCE('screens/ClientJobDetailScreen.tsx',
    /<Text style=\{styles\.approvalTitle\}>The Work Is Done — Your Call<\/Text> (?:\{\} )?\{(isRefundFailureRecorded\(payment\)) \? null : \( <Text style=\{styles\.noticeText\}> Review what \{workerName\} submitted, then approve to release the held funds/)),
  reviewGate: run(['isRefundFailureRecorded', 'payment'], ONCE('screens/ReviewAndTipScreen.tsx',
    /title: 'Approve the work first', body: (isRefundFailureRecorded\(payment\) \? undefined : '[^']*'),/)),
  earningsClock: run(['isRefundFailureRecorded', 'releaseDeadlineMs', 'row'], ONCE('screens/EarningsScreen.tsx',
    /releaseDeadlineMs: (isRefundFailureRecorded\(row\) \? null : releaseDeadlineMs\(\{ release_due_at: row\.job_release_due_at \?\? null \}\)),/)),
  homeLine: run(['isRefundFailureRecorded', 'releaseDeadlineMs', 'input', 'job'], ONCE('lib/homeAttention.ts',
    /releaseDeadline: (isRefundFailureRecorded\(input\.payments\[job\.id\]\) \? null : releaseDeadlineMs\(job\)),/)),
  cardTime: run(['refundFailure', 'releaseDeadlineMs', 'job'], ONCE('lib/liveJobStatus.ts',
    /liveJobStatus\(\{ state, job, releaseDeadline: (refundFailure \? null : releaseDeadlineMs\(job\)), surface: 'card', nowMs \}\)/)),
});

test('R11-A2 · never approved: no release or timer sentence beside a recorded refund failure; row 12 as before', () => {
  const NEVER = never();
  const COMPLETED = '2026-11-15T08:00:00Z';
  // A4 wiring (P1): the server's time, read as release_due_at (the job) and job_release_due_at (Earnings).
  const DUE = new Date(Date.parse(COMPLETED) + 72 * 3_600_000).toISOString();
  const CLOCK = () => Date.parse(COMPLETED);
  const job = { id: 'job-1', completed_at: COMPLETED, release_due_at: DUE };
  const due = releaseDeadlineMs(job);
  assert.ok(due > Date.parse(COMPLETED), 'the control has a clock');
  const APPROVING = 'Approving sends this payment on its way to the worker. If something isn’t right, report the issue instead — release waits while a report is open.';
  const PAUSED = 'Payments are paused right now, so approval is unavailable for the moment. If something isn’t right, you can still report the issue.';
  const RELEASES = '\n\nThis approves the finished work and releases the payment to the worker. It can’t be undone — the payout is sent on the provider’s schedule and shows as released when the transfer lands.';
  const UNFROZEN = 'Release is unfrozen once the report is withdrawn — including the automatic release timer. You can approve the work yourself right after.';
  const GATE = 'Release the held payment (or report an issue) before leaving your review — a review should never stand between the worker and their money.';
  for (const name of ['12 never approved', '14a never approved, hand refund failed', '14c never approved, hand refund arranged']) {
    const row = ROWS[name];
    const recorded = name !== '12 never approved';
    assert.equal(isRefundFailureRecorded(row), recorded, `${name}: the predicate`);
    assert.equal(isRefundFailureRecorded(row), isRefundFailed(row) || isRefundArranged(row), `${name}: the same set as the two captions`);
    assert.equal(isReleaseRequested(row), false, `${name}: never approved`);
    const p = { [job.id]: row };
    const said = {
      timer: NEVER.timer(true, NEVER.releaseAt(isRefundFailureRecorded, releaseDeadlineMs, row, job), CLOCK),
      approveNote: NEVER.noteHidden(false, false, true, isRefundFailureRecorded, row) ? null : NEVER.approveNote(true),
      paused: NEVER.noteHidden(false, false, false, isRefundFailureRecorded, row) ? null : NEVER.approveNote(false),
      dialog: NEVER.dialog(isRefundFailureRecorded, row),
      withdraw: NEVER.withdraw(isRefundFailureRecorded, row),
      button: NEVER.button(isRefundFailureRecorded, row),
      title: NEVER.title(isRefundFailureRecorded, row),
      confirm: NEVER.confirm(isRefundFailureRecorded, row),
      detailCta: NEVER.detailDeadline(isRefundFailureRecorded, releaseDeadlineMs, row, job),
      detailNote: !NEVER.detailNote(isRefundFailureRecorded, row),
      reviewGate: NEVER.reviewGate(isRefundFailureRecorded, row),
      earningsClock: NEVER.earningsClock(isRefundFailureRecorded, releaseDeadlineMs, { ...row, job_release_due_at: DUE }),
      customerLine: myJobsNextAction({ perspective: 'customer', state: 'awaiting_approval', releaseDeadline: NEVER.homeLine(isRefundFailureRecorded, releaseDeadlineMs, { payments: p }, job), nowMs: Date.parse(COMPLETED) }),
      workerLine: myJobsNextAction({ perspective: 'worker', state: 'awaiting_approval', releaseDeadline: NEVER.homeLine(isRefundFailureRecorded, releaseDeadlineMs, { payments: p }, job), nowMs: Date.parse(COMPLETED) }),
      cardTime: NEVER.cardTime(isRefundFailureRecorded(row), releaseDeadlineMs, job),
      workerCaption: workerCaption(row, 'enabled'),
    };
    assert.deepEqual(said, recorded ? {
      timer: false, approveNote: null, paused: PAUSED, dialog: '', withdraw: 'You can approve the work yourself right after.',
      button: 'Approve the Work', title: 'Approve the finished work?', confirm: 'Approve',
      detailCta: null, detailNote: false, reviewGate: undefined, earningsClock: null,
      customerLine: 'Approval needed — review the finished work', workerLine: 'Waiting on customer approval',
      cardTime: null, workerCaption: 'Held in protection',
    } : {
      timer: true, approveNote: APPROVING, paused: PAUSED, dialog: RELEASES, withdraw: UNFROZEN,
      button: 'Approve & Release Payment', title: 'Release the payment to the worker?', confirm: 'Approve & Release',
      detailCta: due, detailNote: true, reviewGate: GATE, earningsClock: due,
      customerLine: myJobsNextAction({ perspective: 'customer', state: 'awaiting_approval', releaseDeadline: due, nowMs: Date.parse(COMPLETED) }),
      workerLine: myJobsNextAction({ perspective: 'worker', state: 'awaiting_approval', releaseDeadline: due, nowMs: Date.parse(COMPLETED) }),
      cardTime: due, workerCaption: 'Held in protection — yours when the customer approves',
    }, name);
    if (!recorded) {
      assert.match(said.customerLine, /^Approval needed — releases /, 'control: the hub names the time');
      assert.match(said.workerLine, /^Waiting on approval — releases /, 'control: the worker hub names the time');
    }
    // Earnings, the line itself: the clock as the caller passes it.
    const earned = earningsRowMeta({ ...row, releaseDeadlineMs: said.earningsClock, waitingOnPayoutSetup: false, payoutOnItsWay: false }, Date.parse(COMPLETED), FAKE);
    assert.equal(earned, recorded ? 'Held in protection' : 'Held in protection — releases Sat at 3 PM unless approved first', `${name}: Earnings`);
  }
  // The callers: the pinned button names no time (A5, G1b-3: the approval card says it); every hub line and card asks the predicate.
  assert.match(code('screens/ClientJobDetailScreen.tsx'), /case 'awaiting_approval': return \{ label: 'Review & Approve the Work', onPress: openApproveOrDispute \};/);
  assert.equal((code('screens/MyJobsHubScreen.tsx').match(/releaseDeadline: isRefundFailureRecorded\(payments\[job\.id\]\) \? null : releaseDeadlineMs\(job\),/g) ?? []).length, 2, 'both hub lines');
  for (const file of ['screens/MyJobsHubScreen.tsx', 'screens/HomeScreen.tsx']) {
    assert.match(code(file), /postedCardLive\(\{ job, state(?:: lifecycleOf\(job\))?, paymentStatus: payments\[job\.id\]\?\.status, workerName: [^}]*nowMs, refundFailure: isRefundFailureRecorded\(payments\[job\.id\]\), \}\)/, `${file}: the card asks it`);
  }
  // No other caller names the clock without asking. Codex R12-A2: ui/ too, and the one that asks elsewhere
  // is exempt only where it stands (pinned once; the call right after the pin): HomeScreen's live bar,
  // whose surface 'bar' says "check the work". A4 wiring (P1): the approval page reads the clock once, in
  // releaseAt, which asks the predicate, so it is no longer exempt.
  const EXEMPT = [
    ['screens/HomeScreen.tsx', /const status = liveJobStatus\(\{ state: pick\.state, job: pick\.job, releaseDeadline: (?=releaseDeadlineMs\(pick\.job\), surface: 'bar', nowMs, \}\);)/],
  ].map(([file, re]) => {
    const all = [...code(file).matchAll(new RegExp(re.source, 'g'))];
    assert.equal(all.length, 1, `${file}: the exempt clock, once`);
    return `${file}@${all[0].index + all[0][0].length}`;
  });
  const unguarded = ['screens', 'components', 'ui', 'lib'].flatMap(sourceFiles).flatMap((file) =>
    [...code(file).matchAll(/releaseDeadlineMs\s*\(/g)].map((m) => [file, m.index, code(file).slice(Math.max(0, m.index - 80), m.index)]));
  // Codex R13-A2: a reversed guard (`!… ? null :`) passes the clock where a refund failure is recorded.
  const ASKED = /((?<!!)isRefundFailureRecorded\([^)]*\) \? null : |(?<!!)refundFailure \? null : |export function |!isRefundFailureRecorded\(payment\) && )$/;
  assert.deepEqual(unguarded.filter(([file, at, before]) => !ASKED.test(before) && !EXEMPT.includes(`${file}@${at}`)).map(([f, , before]) => `${f}: ${before}`), [],
    'every release clock a sentence reads asks the predicate');
});

// Codex R12-A1: the worker's whole payment note, as written (the open issue is one of its branches).
const workerMessage = () => new Function('deriveJobLifecycle', 'isCancellationFeeKept', 'isPayoutOnItsWay', 'isRefundQueued', 'isReleased', 'isReleaseRequested',
  'isRefundFailureRecorded', 'isHeld', 'PAYOUT_SETUP_NOTICE', 'waitingOnSetup', 'job', 'payment', 'issueOpen', 'clientName', 'releaseDeadlineMs', 'releaseAtLabel', 'serverNowMs', ONCE('screens/WorkerJobScreen.tsx',
    /<Text style=\{styles\.paymentNote\}> \{\(\(\) => \{ (const lifecycle = deriveJobLifecycle\(\{ job, payment, hasOpenDispute: issueOpen \}\);[^]*?) \}\)\(\)\}/));

// Codex R12-A1: rows 14a and 14c with an open issue, before and after the approval (as 460 answers it: the
// transfer queued, the fact false), read the issue alone: withdrawing or resolving releases nothing. Row 12,
// the control, reads that release resumes (after its approval with the issue open: Failure A, the fact false).
test('R12-A1 · the worker’s note, an issue open or not, before and after approval: never that release resumes beside a recorded refund failure', () => {
  const note = workerMessage();
  // A4 wiring (P1): the job carries the server's time, 72 hours after AT; the note is read at AT.
  const NOW = Date.parse(AT);
  const DUE = NOW + 72 * 3_600_000;
  const message = (row, issueOpen) => note(deriveJobLifecycle, isCancellationFeeKept, isPayoutOnItsWay, isRefundQueued, isReleased, isReleaseRequested,
    isRefundFailureRecorded, isHeld, PAYOUT_SETUP_NOTICE, payoutSetupNotice('enabled', [row]) !== null, { status: 'completed', release_due_at: new Date(DUE).toISOString() }, row, issueOpen, 'Sam',
    releaseDeadlineMs, releaseAtLabel, () => NOW);
  const ISSUE = 'Sam reported an issue, which holds the funds while it’s open.';
  for (const name of ['12 never approved', '14a never approved, hand refund failed', '14c never approved, hand refund arranged']) {
    const recorded = name !== '12 never approved';
    const before = ROWS[name];
    const after = (issueOpen) => ({ ...before, release_requested_at: AT, release_reason: 'approved', transfer_cents: 4625, payoutOnItsWay: !recorded && !issueOpen });
    assert.deepEqual({
      issueBefore: message(before, true), issueAfter: message(after(true), true), before: message(before, false), after: message(after(false), false),
    }, recorded ? {
      issueBefore: ISSUE, issueAfter: ISSUE, before: 'Waiting on Sam to approve the finished work.', after: 'Sam approved the finished work.',
    } : {
      issueBefore: `${ISSUE} Sort it out together in chat — release resumes when the report is withdrawn or resolved.`,
      issueAfter: `${ISSUE} Sort it out together in chat — release resumes when the report is withdrawn or resolved.`,
      before: `Waiting on Sam to approve the finished work. If they don’t respond, the funds release automatically ${releaseAtLabel(DUE, NOW)}.`,
      after: 'Sam approved the finished work. Your payout is on its way and shows as released when the transfer lands.',
    }, name);
  }
});

// G1-2 and G1-4: the worker's whole note and the customer's cancelled-money note, as written.
const message = (row, jobStatus) => workerMessage()(deriveJobLifecycle, isCancellationFeeKept, isPayoutOnItsWay, isRefundQueued, isReleased, isReleaseRequested,
  isRefundFailureRecorded, isHeld, PAYOUT_SETUP_NOTICE, payoutSetupNotice('enabled', [row]) !== null, { status: jobStatus }, row, false, 'Sam',
  releaseDeadlineMs, releaseAtLabel, Date);
const moneyNoteFor = () => new Function('isRefundFailed', 'isRefundArranged', 'isCancellationFeeKept', 'isRefundQueued', 'workerFirstName', 'row', ONCE('screens/ClientJobDetailScreen.tsx',
  /const moneyNoteFor = \(row: Payment \| null\) => \{ ([^]*?) \}; const cancelledMoneyNote/));

// A4 wiring (P1): the release time is the server's (jobs.release_due_at, 20261116200000_release_clock.sql),
// and its timer runs every 10 minutes, so the time can pass before the money moves. Every sentence that names
// it, as written, names it only while it is ahead; a passed time, no time and a read without the field name
// no moment (the customer's hub line and the card then ask for the review, Earnings says the release is due).
test('P1 · the server’s release time is named only while it is ahead: a passed or absent time names no moment', () => {
  const NEVER = never();
  const NOW = Date.parse('2026-11-18T08:00:00Z');
  const CLOCK = () => NOW;
  const row = ROWS['12 never approved'];
  assert.equal(isRefundFailureRecorded(row), false, 'the control row: no refund failure');
  const at = (ms) => ({ id: 'job-1', status: 'completed', completed_at: '2026-11-15T08:00:00Z', release_due_at: ms == null ? null : new Date(ms).toISOString() });
  const shown = (job) => {
    const deadline = NEVER.detailDeadline(isRefundFailureRecorded, releaseDeadlineMs, row, job);
    const hub = NEVER.homeLine(isRefundFailureRecorded, releaseDeadlineMs, { payments: { [job.id]: row } }, job);
    return {
      approvePage: NEVER.timer(true, NEVER.releaseAt(isRefundFailureRecorded, releaseDeadlineMs, row, job), CLOCK),
      detailNote: NEVER.detailTime(deadline, releaseAtLabel, CLOCK),
      workerNote: workerMessage()(deriveJobLifecycle, isCancellationFeeKept, isPayoutOnItsWay, isRefundQueued, isReleased, isReleaseRequested,
        isRefundFailureRecorded, isHeld, PAYOUT_SETUP_NOTICE, false, job, row, false, 'Sam', releaseDeadlineMs, releaseAtLabel, CLOCK),
      customerHub: myJobsNextAction({ perspective: 'customer', state: 'awaiting_approval', releaseDeadline: hub, nowMs: NOW }),
      workerHub: myJobsNextAction({ perspective: 'worker', state: 'awaiting_approval', releaseDeadline: hub, nowMs: NOW }),
      earnings: earningsRowMeta({ ...row, releaseDeadlineMs: NEVER.earningsClock(isRefundFailureRecorded, releaseDeadlineMs, { ...row, job_release_due_at: job.release_due_at }),
        waitingOnPayoutSetup: false, payoutOnItsWay: false }, NOW, FAKE),
    };
  };
  const ahead = NOW + 5 * 3_600_000;
  const label = releaseAtLabel(ahead, NOW);
  assert.deepEqual(shown(at(ahead)), {
    approvePage: true,
    detailNote: ` With no response, the funds release automatically ${label}.`,
    workerNote: `Waiting on Sam to approve the finished work. If they don’t respond, the funds release automatically ${label}.`,
    customerHub: `Approval needed — releases ${label}`,
    workerHub: `Waiting on approval — releases ${label}`,
    earnings: 'Held in protection — releases Sat at 3 PM unless approved first',
  }, 'ahead: every surface names the server’s time');
  const PASSED = {
    approvePage: false,
    detailNote: null,
    workerNote: 'Waiting on Sam to approve the finished work.',
    customerHub: 'Approval needed — review the finished work',
    workerHub: 'Waiting on customer approval',
    earnings: 'Held in protection — automatic release is due',
  };
  for (const ms of [NOW, NOW - 60_000, NOW - 3 * 86_400_000]) {
    assert.deepEqual(shown(at(ms)), PASSED, `passed ${(NOW - ms) / 1000} s ago: no moment, never a broken promise`);
  }
  const NONE = { ...PASSED, earnings: 'Held in protection' };
  // A4 wiring (A5, G1b-3): the job page's pinned button names no time in any state (the approval card does).
  const primary = ONCE('screens/ClientJobDetailScreen.tsx', /const primaryAction: \{ label: string; onPress: \(\) => void \} \| null = \(\(\) => \{ ([^]*?) \}\)\(\);/);
  assert.doesNotMatch(primary, /releaseAtLabel|approvalDeadline|releases/, 'the pinned button never names a time');
  assert.deepEqual(shown(at(null)), NONE, 'no time from the server');
  const { release_due_at: _gone, ...bare } = at(ahead);
  assert.deepEqual(shown(bare), NONE, 'a read without the field (an RPC result, a snapshot)');
  assert.deepEqual(shown({ ...at(ahead), release_due_at: 'soon' }), NONE, 'an unreadable time');
  // The card and the Home bar: the same strict guard, in lib/liveJobStatus.ts (not executable here: its runtime
  // imports), so a passed time leaves 'approve the work' on the card and 'check the work' on the bar.
  assert.match(code('lib/liveJobStatus.ts'), /case 'awaiting_approval': \{ const releasesAt = input\.releaseDeadline != null && input\.releaseDeadline > nowMs \? releaseAtLabel\(input\.releaseDeadline, nowMs\) : null; return \{ step: 3, fills: \[1, 1, 1, 0\.55\], head: STAGE\.done, detail: surface === 'bar' \? 'check the work' : releasesAt \? `approve, or it releases \$\{releasesAt\}` : 'approve the work',/);
  // The job reads: the field rides on every JOB_COLUMNS select, each one on the table `jobs` (a computed field
  // fails a read anywhere else), and on the Earnings job read; an RPC result maps to null.
  const jobs = read('lib/jobs.ts');
  assert.match(jobs, /const JOB_COLUMNS =\s*`\$\{OPEN_JOB_COLUMNS\}, [^`]*, completed_at, release_due_at`;/);
  const uses = [...jobs.matchAll(/\.from\('([a-z_]+)'\)\s*\.select\(`\$\{JOB_COLUMNS\}/g)].map((m) => m[1]);
  assert.deepEqual(uses, ['jobs', 'jobs', 'jobs'], 'every JOB_COLUMNS read is a select on jobs');
  assert.equal((jobs.match(/\$\{JOB_COLUMNS\}/g) ?? []).length, 3, 'and there is no other');
  assert.doesNotMatch(jobs, /[(,]\s*JOB_COLUMNS/, 'nor a bare use');
  // The embedded job of an offer (lib/offers.ts) is an open-job projection: it never carries the field.
  assert.doesNotMatch(read('lib/offers.ts') + read('lib/jobSeries.ts'), /release_due_at|\bJOB_COLUMNS\b/);
  assert.match(jobs, /release_due_at: typeof row\.release_due_at === 'string' \? row\.release_due_at : null,/);
  const earnings = read('lib/earnings.ts');
  assert.match(earnings, /\.from\('jobs'\)\s*\.select\('id, title, status, release_due_at'\)/);
  assert.match(earnings, /job_release_due_at: job\?\.release_due_at \?\? null,/);
  // The app keeps no 72-hour rule of its own.
  assert.doesNotMatch(read('lib/jobLifecycle.ts'), /AUTO_RELEASE_HOURS|72 \* 3_600_000|completed \+/);
});

test('G1-2 · a late-cancel fee after the rest’s refund landed: still the fee to both parties; every held row as before', () => {
  const note = moneyNoteFor();
  const customer = (row) => note(isRefundFailed, isRefundArranged, isCancellationFeeKept, isRefundQueued, 'Sam', row);
  const LONG = 'This job was cancelled late. The cancellation fee is on its way to you; the rest goes back to Sam.';
  const FEE_REST = 'The cancellation fee goes to Sam; the rest goes back to your card — usually within 5–10 business days.';
  const LANDED = { ...FEE, status: 'partially_refunded' };
  for (const [name, row, worker] of [
    ['fee on its way', { ...LANDED, payoutOnItsWay: true }, LONG],
    ['fee sent', { ...LANDED, released_at: AT, payoutOnItsWay: false }, LONG],
    ['fee blocked', { ...LANDED, payoutOnItsWay: false }, 'This job was cancelled late.'],
  ]) {
    assert.equal(isCancellationFeeKept(row), true, `${name}: the fee is kept`);
    assert.equal(message(row, 'cancelled'), worker, `${name}: the worker`);
    assert.equal(customer(row), FEE_REST, `${name}: the customer`);
  }
  // The failed-refund note keeps today's result: on a partly refunded row the rest already landed.
  assert.equal(customer({ ...LANDED, refund_failed_at: AT, payoutOnItsWay: false }), 'The refund to your card didn’t go through. Brazos will arrange it another way.');
  assert.equal(customer(ROWS['F6 fee, the refund of the rest failed']),
    'The cancellation fee goes to Sam. The refund of the rest to your card didn’t go through; Brazos will arrange it another way.');
  // A customer decision (transfer 0) or a partly refunded job payment is no fee.
  assert.equal(isCancellationFeeKept({ ...LANDED, transfer_cents: 0 }), false, 'decided for the customer');
  assert.equal(isCancellationFeeKept({ ...JOB, status: 'partially_refunded' }), false, 'a job payment partly refunded');
  // Every other status: the old rule, exactly.
  for (const status of ['unfunded', 'pending', 'authorized', 'held', 'released', 'paid_out', 'failed', 'voided', 'refunded']) {
    for (const row of [...Object.values(ROWS), FEE, JOB]) {
      const r = { ...row, status };
      assert.equal(isCancellationFeeKept(r), isRefundQueued(r) && (r.transfer_cents ?? 0) > 0, `${status}: as before`);
    }
  }
});

test('G1-4 · the worker’s note on a completed job: “hasn’t paid yet” only where nothing was charged', () => {
  const W25 = { ...JOB, status: 'refunded', refund_cents: 5375, transfer_cents: 0, payoutOnItsWay: false };
  assert.equal(message(W25, 'completed'), 'Sam’s payment goes back to them.', 'W25: refunded in full');
  assert.equal(message({ ...JOB, status: 'partially_refunded', refund_cents: 0, payoutOnItsWay: false }, 'completed'), null, 'partly refunded, no payout fact: nothing');
  const UNPAID = { ...JOB, release_requested_at: null, release_reason: null, transfer_cents: 0, payoutOnItsWay: false };
  for (const status of ['unfunded', 'pending', 'authorized', 'failed', 'voided']) {
    assert.equal(message({ ...UNPAID, status }, 'assigned'), 'The customer hasn’t paid yet. Nothing is held for this job.', `${status}: as before`);
  }
  assert.equal(message({ ...UNPAID, status: 'unknown' }, 'assigned'), null, 'an unknown status says nothing');
});

test('R11-A2 · the hub read carries both refund facts, so the hub and Home can ask', async () => {
  const rows = [
    { job_id: 'job-12', status: 'held', release_requested_at: null, provider: 'stripe', refund_failed_at: null, refund_arranged_at: null },
    { job_id: 'job-14a', status: 'held', release_requested_at: null, provider: 'stripe', refund_failed_at: AT, refund_arranged_at: null },
    { job_id: 'job-14c', status: 'held', release_requested_at: null, provider: 'stripe', refund_failed_at: null, refund_arranged_at: AT },
  ];
  let selected = null;
  const q = { select: (s) => { selected = s; return q; }, in: () => q, eq: () => q, not: () => Promise.resolve({ data: rows, error: null }) };
  stub.from = () => q;
  try {
    const { data, error } = await fetchJobPaymentStatusesByJobIds(rows.map((r) => r.job_id));
    assert.equal(error, null);
    assert.equal(selected, 'job_id, status, release_requested_at, provider, refund_failed_at, refund_arranged_at');
    assert.deepEqual(Object.fromEntries(Object.entries(data).map(([id, p]) => [id, isRefundFailureRecorded(p)])), { 'job-12': false, 'job-14a': true, 'job-14c': true });
  } finally {
    stub.from = () => { throw new Error('no read'); };
  }
});
