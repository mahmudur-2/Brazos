// tests/fixRunA.test.mjs — the FIX-RUN group A (money & safety) fences, 2026-10-03.
//
// Each test names its item in docs/dispatch/FIX-RUN.md. Source tests, like the rest of the
// suite: they read the files and pin the shapes that make each fix true, so a later edit that
// quietly undoes one goes red here with the item's name on it.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const code = (path) => flat(stripComments(read(path)));

test('A10 · "payout on its way" says what it waits for; the tip opens once the payment reaches the worker; the worker is nudged at the hire', () => {
  // A10a: the tip waits for the transfer, and the screen says why — and names the wait when it is
  // the worker's own payout setup.
  const review = code('screens/ReviewAndTipScreen.tsx');
  assert.match(
    review,
    /: !released \? \( <Text style=\{styles\.cardNote\}> A tip can be added once the job payment reaches \{workerName \?\? 'the worker'\}\. Yours is approved and on its way — if they haven’t set up payouts yet, it lands the moment they do\. <\/Text> \)/
  );
  assert.doesNotMatch(review, /The job payment releases first/);

  // The customer's job page: the eyebrow stays, and a note under the figure says what "on its
  // way" waits for — card path only (the sandbox releases on approval), never a "paid" claim.
  const detail = code('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /\? 'APPROVED · PAYOUT ON ITS WAY' : 'PAYMENT'\} <\/Text> <MoneyText cents=\{customerChargeCents\(payment\)\} state=\{payment\.status\} \/> (?:\{\} )?\{stripe && releaseRequested \? \( <Text style=\{styles\.paymentNote\}> The payment reaches \{workerFirstName\} once their payout account is ready — it shows as released when the transfer lands\. If they haven’t set up payouts yet, their job screen asks them to\. <\/Text> \) : null\}/);
  assert.doesNotMatch(detail, /paymentsMode !== 'sandbox'/, 'stripe is never locked out by a sandbox-only gate (D18)');

  // The worker's job page: a nudge to set up payouts from the hire onwards, before any payment
  // row exists — card path only, gone once enabled, and never beside the held-row PayoutNudge.
  const worker = code('screens/WorkerJobScreen.tsx');
  assert.match(
    worker,
    /\{live && paymentsMode === 'stripe' && payouts !== null && payouts !== 'enabled' && !waitingOnSetup \? \( <Pressable onPress=\{\(\) => navigateAcrossTabs\('Profile', 'Payouts', \{\}\)\}/
  );
  assert.match(worker, /<Text style=\{styles\.linkRowText\}>Set up payouts so the payment can reach you<\/Text>/);
  // The held-row rule is untouched: payoutSetupNotice stays the ONE derivation of "waiting on setup".
  assert.match(worker, /const waitingOnSetup = payment \? payoutSetupNotice\(payouts, \[payment\]\) !== null : false;/);
});

test('A12 · a reported issue says who decides and how fast; the operator has a runbook; no admin UI', () => {
  // Pick A12a, verbatim.
  const approve = code('screens/ApproveOrDisputeScreen.tsx');
  assert.ok(
    approve.includes('The payment stays held while this report is open — including the automatic release timer. Brazos will look at it and reply by email within 2 business days. Withdraw it below if things get sorted out.'),
    'the dispute note names who decides and the reply time'
  );
  // The resolver stays service_role only — the app never calls it.
  const sql = read('supabase/migrations/20260905000000_stripe_foundation.sql');
  assert.ok(sql.includes('grant execute on function public.resolve_job_dispute(uuid, text, text) to service_role;'));
  assert.doesNotMatch(read('lib/disputes.ts'), /resolve_job_dispute/, 'no client wrapper for the resolver');
  assert.doesNotMatch(code('screens/ApproveOrDisputeScreen.tsx'), /resolve_job_dispute/, 'the screen never calls it');
  assert.ok(existsSync(join(root, 'docs/runbooks/dispute-resolution.md')), 'the runbook exists');
  // The runbook exists, runs the resolver by name, and keeps the promise's clock.
  const runbook = read('docs/runbooks/dispute-resolution.md');
  assert.match(runbook, /resolve_job_dispute\(p_job_id, p_in_favour_of, p_note\)/);
  assert.match(runbook, /2 business\s+days/);
  assert.match(runbook, /'worker'/);
  assert.match(runbook, /'customer'/);
  assert.match(read('docs/README.md'), /dispute-resolution\.md/);
});

const ADDITIVE = /\bdrop\s+(table|column|schema)\b|\btruncate\b|\brename\s+(to|column)\b|\bdelete\s+from\b/i;
// A migration's header may NAME a destructive shape to say it avoids it; the scan is over code.
const sqlCode = (s) => s.replace(/^\s*--.*$/gm, '');

test('A11 · a ban queues the refund it strands, and the customer\'s job page shows the money on a cancelled job', () => {
  const sql = read('supabase/migrations/20261003000100_ban_refund.sql');
  assert.doesNotMatch(sqlCode(sql), ADDITIVE, 'additive — never a destructive shape');
  // The NEWEST list: R4's six, 20260915's funded_after_void, then the new reason — nothing dropped.
  assert.match(sql, /'customer_no_show', 'dispute_refund', 'funded_after_void', 'account_suspended'\)\);/, 'the new reason joins the newest list');
  assert.match(sql, /create or replace function public\.ban_user\(p_target uuid, p_report_id uuid default null\) returns void/);
  // Undirected held rows only, in cancel_job()'s worker_cancelled shape: the charge home, nothing to the worker.
  assert.match(
    sql.replace(/\s+/g, ' '),
    /update public\.payments set refund_cents = charge_amount_cents, transfer_cents = 0, refund_reason = 'account_suspended', status = case when provider = 'sandbox' then 'refunded'::public\.payment_status else status end, updated_at = v_now where job_id = v_job\.id and kind = 'job_payment' and status = 'held' and coalesce\(refund_cents, 0\) = 0 and coalesce\(transfer_cents, 0\) = 0 and release_requested_at is null;/
  );
  assert.match(sql, /raise exception 'Only admins may ban users';/, 'the admin gate stays');
  assert.match(sql, /revoke all on function public\.ban_user\(uuid, uuid\) from public, anon;\s*grant execute on function public\.ban_user\(uuid, uuid\) to authenticated;/);
  // The client: a cancelled job keeps reading its payment, so the refund shows.
  const detail = code('screens/ClientJobDetailScreen.tsx');
  assert.match(detail, /let active = true; if \(job\.status === 'open'\) return; Promise\.all\(\[fetchJobPaymentState\(job\.id\), fetchOpenJobDispute\(job\.id\)\]\)/);
  assert.doesNotMatch(detail, /job\.status === 'open' \|\| job\.status === 'cancelled'/);
});

test('A13 · the evening-before reminder follows the payment: held → both; unpaid → the customer is asked to protect it, the worker is not reminded', () => {
  const sql = read('supabase/migrations/20261003000200_reminders_payment_gate.sql');
  assert.doesNotMatch(sqlCode(sql), ADDITIVE);
  assert.match(sql, /create or replace function public\.enqueue_tomorrow_reminders\(p_today date default null\) returns integer/);
  // Allow-listed: held, never "not unfunded".
  assert.match(sql, /v_held := exists \(\s*select 1 from public\.payments p\s*where p\.job_id = v_job\.id and p\.kind = 'job_payment' and p\.status = 'held'\s*\);/);
  assert.match(sql, /if v_held then/);
  // The held shape is 20260930000900's, byte for byte.
  const old = read('supabase/migrations/20260930000900_tomorrow_reminders.sql');
  for (const line of [
    "'Tomorrow' || v_window || ' · ' || left(v_job.title, 80),",
    "jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v_job.id::text, 'categoryId', 'job_reminder_customer'),",
    "jsonb_build_object('screen', 'WorkerJob', 'jobId', v_job.id::text, 'categoryId', 'job_reminder_worker'),",
    "'job_reminder:' || v_job.id::text || ':' || v_job.assigned_worker_id::text || ':' || v_tomorrow::text",
  ]) {
    assert.ok(old.includes(line) && sql.includes(line), `kept verbatim: ${line}`);
  }
  // The unpaid shape: the customer, into Checkout, under the same dedupe key; nothing to the worker.
  const unpaidAt = sql.indexOf('-- Unpaid:');
  assert.ok(unpaidAt > -1, 'the unpaid branch is marked');
  const unpaid = sql.slice(unpaidAt, sql.indexOf('end if;', unpaidAt));
  assert.match(unpaid, /'Tomorrow' \|\| v_window \|\| ' · Protect the payment',/);
  assert.match(unpaid, /jsonb_build_object\('screen', 'ClientJobDetail', 'jobId', v_job\.id::text, 'intent', 'checkout', 'categoryId', 'job_reminder_customer'\),/);
  assert.match(unpaid, /'job_reminder:' \|\| v_job\.id::text \|\| ':' \|\| v_job\.client_id::text \|\| ':' \|\| v_tomorrow::text/);
  assert.doesNotMatch(unpaid, /WorkerJob|job_reminder_worker/);
  assert.match(sql, /revoke all on function public\.enqueue_tomorrow_reminders\(date\) from public, anon, authenticated;/);
});

test('A14 · a partly refunded job no longer blocks account deletion', () => {
  const sql = read('supabase/migrations/20261003000300_deletion_partial_refund.sql');
  assert.doesNotMatch(sqlCode(sql), ADDITIVE);
  assert.match(sql, /or p\.status not in \('released', 'paid_out', 'refunded', 'partially_refunded', 'failed', 'voided'\)/);
  assert.doesNotMatch(sql, /when 'partially_refunded' then/, 'its CASE line is gone with it');
  // Still an allow-list of terminal values: every non-terminal CASE sentence stays.
  for (const state of ['held', 'unfunded', 'pending', 'authorized']) assert.match(sql, new RegExp(`when '${state}'\\s+then`));
  assert.match(sql, /not in \('completed', 'cancelled', 'open', 'draft'\)/, 'the job gate is untouched');
  assert.match(sql, /not in \('resolved', 'withdrawn'\)/, 'the dispute gate is untouched');
  assert.match(sql, /revoke all on function public\.account_deletion_blockers\(\) from public, anon;\s*grant execute on function public\.account_deletion_blockers\(\) to authenticated;/);
});

test('A17 · money is formatted by one rule in SQL too, and the worker home\'s zero goes through formatBudget', () => {
  const sql = read('supabase/migrations/20261003000400_money_label_counter.sql');
  assert.doesNotMatch(sqlCode(sql), ADDITIVE);
  assert.match(sql, /create or replace function public\.notify_on_offer_counter\(\) returns trigger/);
  assert.match(sql, /\|\| public\.money_label\(new\.amount_cents\)/);
  assert.doesNotMatch(sqlCode(sql), /FM999999990\.00/, 'no second formatter');
  // money_label() is formatBudget()'s rule, already in the tree.
  assert.match(read('supabase/migrations/20260930001000_job_series.sql'), /when p_cents % 100 = 0 then to_char\(p_cents \/ 100, 'FM999,999,990'\)/);
  // No live function keeps the old formatter: the two baseline sites left are the deprecated shims' triggers.
  assert.doesNotMatch(sqlCode(read('supabase/migrations/20260930001200_hire_from_push.sql')), /FM999999990\.00/, 'notify_on_bid() already reads money_label()');
  const home = code('screens/WorkerHomeScreen.tsx');
  assert.match(home, /\{potential\.count === 0 \? formatBudget\(0\) : formatBudget\(potential\.cents\)\}/);
  assert.doesNotMatch(home, /'\$0'/, 'no hand-written money');
});

test('A19 · the 90-day prune of payment_events payloads exists, is an UPDATE, and is scheduled', () => {
  const sql = read('supabase/migrations/20261003000500_payment_events_prune.sql');
  assert.doesNotMatch(sqlCode(sql), ADDITIVE, 'a prune by UPDATE — never delete from');
  assert.match(sql, /create or replace function public\.prune_payment_event_payloads\(p_older_than interval default interval '90 days'\) returns integer/);
  assert.match(sql.replace(/\s+/g, ' '), /update public\.payment_events e set payload = jsonb_build_object\('id', e\.id, 'type', e\.type, 'pruned_at', now\(\)\) where e\.processed_at is not null and e\.received_at < now\(\) - p_older_than and e\.payload \? 'data';/);
  assert.match(sql, /revoke all on function public\.prune_payment_event_payloads\(interval\) from public, anon, authenticated;\s*grant execute on function public\.prune_payment_event_payloads\(interval\) to service_role;/);
  assert.match(sql, /perform cron\.schedule\('brazos-prune-payment-events', '30 3 \* \* \*',/);
  assert.match(sql, /if not public\.pg_function_present\('cron', 'schedule'\) then/);
  assert.match(sql, /comment on table public\.payment_events is\s*'[^']*prune_payment_event_payloads\(\)/, 'the table comment names the function');
});

test('A15 · a declined saved card never retries into the cached decline, and the decline push stays quiet while the app is in front', () => {
  // The key: tests/hireFromPush.test.mjs pins the rotation on latest_charge. Here, the app side.
  const push = read('lib/pushNotifications.ts');
  assert.match(push, /export function isQuietInForeground\(data: unknown\): boolean \{\s*const type = data && typeof data === 'object' \? \(data as \{ type\?: unknown \}\)\.type : undefined;\s*return type === 'payment_declined';\s*\}/);
  assert.match(flat(push), /handleNotification: async \(notification\) => \{ (?:\/\/[^]*? )?const quiet = isQuietInForeground\(notification\.request\.content\.data\); return \{ (?:\/\/[^]*? )?shouldShowBanner: !quiet, shouldShowList: true, shouldPlaySound: !quiet, shouldSetBadge: false, \}; \},/);
  // send-push puts the outbox type in data.type — the key the handler reads — and the decline's
  // outbox type is payment_declined.
  assert.match(read('supabase/functions/send-push/index.ts'), /data: \{ \.\.\.row\.data, type: row\.type, outboxId: row\.outbox_id \},/);
  assert.match(read('supabase/migrations/20260930001200_hire_from_push.sql'), /'payment_declined',/);
});

test('A18 · deleting the account removes the saved cards and keeps the payout account open for money still owed (pick A18a)', () => {
  const screen = code('screens/DeleteAccountScreen.tsx');
  assert.match(screen, /import \{ listSavedCards, removeSavedCard \} from '\.\.\/lib\/paymentMethods';/);
  // Before the row goes, on the card path, every saved card is detached through payment-methods —
  // best effort, never a reason to keep the account alive.
  assert.match(screen, /setDeleting\(true\); if \(paymentsMode === 'stripe'\) \{ const \{ data: cards \} = await listSavedCards\(\); await Promise\.all\(cards\.map\(\(card\) => removeSavedCard\(card\.id\)\.catch\(\(\) => null\)\)\); \} const \{ blocked, error \} = await deleteMyAccount\(\);/);
  // The copy says both halves.
  assert.match(screen, /Any card you saved for one-tap hiring\. It is removed from the payment provider before the account goes\./);
  assert.match(screen, /Your payout account stays open until every payment still owed to you has reached it/);
  // And the server keeps it: delete_my_account() never touches payment_accounts, and the tombstone
  // profile keeps the cascade from firing.
  const del = read('supabase/migrations/20260901000000_baseline.sql');
  const body = del.slice(del.indexOf('CREATE OR REPLACE FUNCTION "public"."delete_my_account"()'), del.indexOf('ALTER FUNCTION "public"."delete_my_account"()'));
  assert.ok(body.length > 0);
  assert.doesNotMatch(body, /payment_accounts/, 'the payout account is not deleted with the account');
  assert.match(read('supabase/migrations/20260905000000_stripe_foundation.sql'), /user_id uuid primary key references public\.profiles \(id\) on delete cascade,/);
  assert.match(body, /tombstone/i, 'the profile row stays as a tombstone');
});

test('A20 · the running-late day is the market\'s (America/New_York), as the server decides it', () => {
  const late = read('lib/runningLate.ts');
  assert.match(late, /export const MARKET_TIME_ZONE = 'America\/New_York';/);
  assert.match(late, /timeZone: MARKET_TIME_ZONE,/);
  assert.match(late, /export function isLateDay\(scheduledDate: string \| null \| undefined, now: Date = new Date\(\)\): boolean \{\s*if \(!scheduledDate\) return true;\s*return scheduledDate === marketDate\(now\);\s*\}/);
  // The server's clock, for the record.
  assert.match(read('supabase/migrations/20260930000700_running_late.sql'), /America\/New_York/);
});
