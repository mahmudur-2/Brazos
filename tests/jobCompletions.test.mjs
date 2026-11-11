import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// R6c (D5 / D6 / D7) — completion photos and the worker's take, pinned as text
// ---------------------------------------------------------------------------
//
// The guard itself is proven where it lives: supabase/tests/080_job_completions.sql
// executes transition_job_status() on the local stack (null, an empty array
// and a video-only payload refused; one photo completes and writes the row).
// What this file holds still is the CLIENT's side of D-14 and D7:
//   * the worker's complete flow never calls the RPC without a photo, passes
//     the uploaded URLs as p_completion_photos, and shows the RPC's own
//     sentence if it refuses anyway;
//   * the worker's take is derived in ONE place — lib/payments.ts's
//     workerTakeCents — and no screen carries fee arithmetic or a rate;
//   * Earnings' buckets and rows, and the worker's job card, read that take.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flatten = (s) => s.replace(/\s+/g, ' ').trim();

const worker = stripComments(read('screens/WorkerJobScreen.tsx'));
const workerFlat = flatten(worker);
const earnings = stripComments(read('screens/EarningsScreen.tsx'));
const payments = stripComments(read('lib/payments.ts'));
const paymentsFlat = flatten(payments);

// ---------------------------------------------------------------------------
// D6 — the worker's complete flow
// ---------------------------------------------------------------------------

test('1 · the complete flow requires a photo before the call, and passes the uploaded URLs as p_completion_photos', () => {
  const handler = worker.slice(worker.indexOf('async function handleComplete()'), worker.indexOf('return (', worker.indexOf('async function handleComplete()')));
  assert.ok(handler.length > 0, 'handleComplete exists');
  const guard = handler.indexOf('if (donePhotos.length === 0) {');
  const call = handler.indexOf("updateJobStatus(");
  assert.ok(guard > 0 && call > guard, 'the empty-gallery guard precedes the RPC call');
  const guardBlock = handler.slice(guard, call);
  assert.match(guardBlock, /return;/, 'an empty gallery returns without calling the RPC');
  assert.match(guardBlock, /if \(addNow\) await pickCompletionMedia\(\);/, 'the same picker is offered — no new upload machinery');
  assert.match(flatten(guardBlock), /title: 'Add a photo of the finished work',/);
  assert.match(
    flatten(guardBlock),
    /At least one photo of the finished work is required to mark this job complete — it’s what the customer approves against\. Add one now\?/
  );
  assert.doesNotMatch(worker, /Finish without/, 'there is no longer a way to finish without a photo');
  // The call: photos as the third argument, the clip (if any) as the fourth.
  assert.match(
    workerFlat,
    /const \{ error \} = await updateJobStatus\( params\.jobId, 'completed', donePhotos, doneVideo \? \[doneVideo\.url\] : \[\] \);/
  );
  // The RPC's own sentence, unchanged, if it refuses anyway.
  assert.match(workerFlat, /if \(error\) \{ await alertAsync\('Could not complete job', userMessage\(error\)\); return; \}/);
  // The caption and the card copy say the rule before the tap.
  assert.match(workerFlat, /A photo of the finished work is required to mark it complete\./);
  // C8: the hint no longer repeats the limit (the counter) or the requirement (the line above).
  assert.match(workerFlat, /Add photos of the finished work, plus one short video if you like — then mark it complete\./);
  assert.match(workerFlat, /\{donePhotos\.length\}\/\{MAX_DONE_PHOTOS\} photos/);
  assert.equal((workerFlat.match(/Add at least one photo|up to \{MAX_DONE_PHOTOS\}/g) ?? []).length, 0);
  // The uploader is the existing job-photos path.
  assert.match(worker, /uploadJobPhoto\(params\.jobId, asset\)/);
  assert.match(read('lib/storage.ts'), /const BUCKET = 'job-photos';/);
});

test('2 · lib/jobs.ts hands the photos to transition_job_status as p_completion_photos', () => {
  const jobs = flatten(stripComments(read('lib/jobs.ts')));
  assert.match(
    jobs,
    /supabase\.rpc\('transition_job_status', \{ p_job_id: jobId, p_status: status, p_completion_photos: photoUrls \?\? null, p_completion_videos: videoUrls \?\? null, \}\)/
  );
});

test('3 · the guard and its record are in the migration and its proof, and the one 020 fence that completed without a photo now expects the refusal', () => {
  const migration = read('supabase/migrations/20260925000000_job_completions.sql');
  assert.equal(
    (migration.match(/At least one photo of the finished work is required to mark this job complete/g) ?? []).length,
    1
  );
  assert.match(migration, /if p_status = 'completed' and jsonb_array_length\(v_photos\) = 0 then/);
  assert.match(migration, /insert into public\.job_completions \(job_id, completed_by, photos\)/);
  // cardinality, not array_length: an empty array must be refused, and
  // array_length('{}', 1) is NULL — which a CHECK would let through.
  assert.match(migration, /check \(cardinality\(photos\) >= 1\)/);
  assert.doesNotMatch(migration, /array_length\(photos, 1\) >= 1/);
  assert.match(migration, /create or replace function public\.job_completions_enabled\(\)/);
  const proof = read('supabase/tests/080_job_completions.sql');
  assert.ok((proof.match(/At least one photo of the finished work is required to mark this job complete/g) ?? []).length >= 4);
  const lifecycle = read('supabase/tests/020_lifecycle.sql');
  assert.match(lifecycle, /G: the worker cannot complete job2 without a photo/);
  assert.match(lifecycle, /G: the worker completes job2 with a photo, without releasing it/);
  assert.doesNotMatch(lifecycle, /'completed'\) \$\$, 'G: the worker completes job2 without releasing it'/);
});

// ---------------------------------------------------------------------------
// D7 — the worker's take: one helper, no rate, no arithmetic on a screen
// ---------------------------------------------------------------------------

test('4 · workerTakeCents is the one arithmetic site for the take, and brazosFeeCents the one sum beside it', () => {
  assert.match(
    paymentsFlat,
    /export function workerTakeCents\(row: Pick<Payment, 'amount_cents' \| 'platform_fee_cents'>\): number \{ return row\.amount_cents - row\.platform_fee_cents; \}/
  );
  assert.match(
    paymentsFlat,
    /export function brazosFeeCents\( row: Pick<Payment, 'platform_fee_cents' \| 'customer_fee_cents'> \): number \{ return row\.platform_fee_cents \+ \(row\.customer_fee_cents \?\? 0\); \}/
  );
  assert.equal((payments.match(/amount_cents\s*-/g) ?? []).length, 1, 'one subtraction from amount_cents in the module');
  assert.doesNotMatch(payments, /_bps|\* 0\.\d|PLATFORM_FEE_RATE/, 'no rate anywhere in the module');
});

/** Every .ts/.tsx under screens/, lib/, components/, hooks/ and ui/ except the helper module. */
function clientSources() {
  const files = [];
  for (const dir of ['screens', 'lib', 'components', 'hooks', 'ui', 'navigation', 'modes']) {
    const base = join(root, dir);
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(relative(root, full).replace(/\\/g, '/'));
      }
    };
    walk(base);
  }
  // lib/paymentRules.ts is lib/payments.ts's pure half (the predicates moved there verbatim, R6a);
  // it also holds the cancel_job() mirror, whose cancel_fee_* columns come off the hire's own
  // job_agreements snapshot - a rate read from the server, never one written in the client.
  return files.filter((f) => f !== 'lib/payments.ts' && f !== 'lib/paymentRules.ts');
}

test('5 · no client file outside the helper subtracts a fee from an amount, adds fees together, or names a rate', () => {
  const offenders = [];
  for (const file of clientSources()) {
    const code = stripComments(read(file));
    // A fee subtracted from an amount, a fee column in arithmetic, or two fee
    // columns added. (A sort comparator's `a.amount_cents - b.amount_cents`
    // is not fee arithmetic and is not matched.)
    if (
      /amount_cents\s*-\s*[A-Za-z_.()]*fee|platform_fee_cents\s*[-+*/]|[-+]\s*(row|payment|p|tip)\.platform_fee_cents|customer_fee_cents\s*\+|\+\s*(row|payment|p|tip)\.customer_fee_cents/.test(
        code
      )
    ) {
      offenders.push(file);
    }
    if (/_bps\b/.test(code) && !/quote|fee_schedule/i.test(file)) offenders.push(`${file} (bps)`);
  }
  assert.deepEqual(offenders, [], 'fee arithmetic lives in lib/payments.ts and nowhere else');
});

test('6 · Earnings buckets and rows read the take through the helper, bucketed by the one deriveEarnings', () => {
  // B23: the ledger read derives the buckets with the take injected (lib/earnings.ts), and a
  // row shows lib/earningsMath.ts workerReceivesCents — the take, or a job sent home's fee.
  assert.match(read('lib/earnings.ts'), /deriveEarnings\(rows, workerTakeCents\)/);
  assert.doesNotMatch(earnings, /deriveEarnings/, 'the screen does not re-derive the buckets');
  for (const bucket of ['s.pendingCents', 's.availableCents', 's.transferredCents']) {
    assert.ok(earnings.includes(`cents={${bucket}}`), `${bucket} feeds its bucket`);
  }
  assert.match(earnings, /<MoneyText cents=\{workerReceivesCents\(row, workerTakeCents\)\} state=\{row\.status\} captionHidden \/>/);
  assert.doesNotMatch(earnings, /cents=\{row\.amount_cents\}/);
  assert.match(earnings, /note="Held in protection"/);
  assert.match(earnings, /note="Released to you"/);
  // FIX-RUN B5: product copy, the fee by its one name (C4's glossary).
  assert.match(earnings, /Protection fees on these jobs: \{formatBudget\(s\.feeCents\)\}\./);
});

test('7 · the worker’s job card shows the take, and the three-line breakdown off the row’s columns once the charge landed', () => {
  // C4: the caption's facts ride along (approval, issue, payout setup) — the figure is the take.
  // Final sweep: the cancellation facts ride along too (tests/cancelledMoney.test.mjs).
  assert.match(worker, /<MoneyText\s+cents=\{workerTakeCents\(payment\)\}\s+state=\{payment\.status\}\s+releaseRequested=\{isReleaseRequested\(payment\)\}\s+issueOpen=\{issueOpen\}\s+waitingOnPayoutSetup=\{waitingOnSetup\}\s+refundQueued=\{isRefundQueued\(payment\)\}\s+feeKept=\{isCancellationFeeKept\(payment\)\}\s+\/>/);
  assert.doesNotMatch(worker, /cents=\{payment\.amount_cents\}/);
  // Stripe only, and only on a held / released / paid_out row — never unfunded, and (final
  // sweep) never on a held row whose refund is queued: a cancelled job's money is going home.
  assert.match(
    workerFlat,
    /\{paymentsMode === 'stripe' && payment\.charge_amount_cents != null && \(\(isHeld\(payment\) && !isRefundQueued\(payment\)\) \|\| isReleased\(payment\)\) \? \(/
  );
  const breakdown = workerFlat.slice(workerFlat.indexOf('<View style={styles.breakdown}>'), workerFlat.indexOf('</View> ) : null} </Card>'));
  assert.ok(breakdown.length > 0);
  // A2 (2026-10-03): the first line is "paid" ONLY once the money has left
  // protection — a held row reads "held", because the money is still the
  // customer's. The branch is fenced as written so no "paid" can render on
  // status 'held', and the fee line carries the app's one fee name.
  assert.match(
    breakdown,
    /<Text style=\{styles\.breakdownLabel\}> \{isHeld\(payment\) \? 'Customer’s payment · held' : 'Customer paid'\} <\/Text> <Text style=\{styles\.breakdownValue\}> \{formatBudget\(payment\.charge_amount_cents\)\}/
  );
  assert.doesNotMatch(breakdown, />Customer paid</, 'no unconditional "paid" label on the worker breakdown');
  assert.doesNotMatch(breakdown, /Brazos Protection/, 'one fee name: "Protection fee" (C4)');
  assert.match(breakdown, /Protection fee<\/Text> <Text style=\{styles\.breakdownValue\}>\{formatBudget\(brazosFeeCents\(payment\)\)\}/);
  assert.match(breakdown, /You get<\/Text> <Text style=\{styles\.breakdownStrongValue\}> \{formatBudget\(workerTakeCents\(payment\)\)\}/);
  // The customer-facing held-amount surfaces are R7's and untouched here.
  for (const file of ['screens/JobConfirmedScreen.tsx', 'screens/ClientJobDetailScreen.tsx', 'screens/ApproveOrDisputeScreen.tsx']) {
    assert.doesNotMatch(read(file), /workerTakeCents|brazosFeeCents/, `${file} is not a worker-facing surface`);
  }
});

test('8 · A8 — the worker is never offered a start the server refuses: no "Start anyway" before the payment is held', () => {
  // transition_job_status() refuses assigned → in_progress unless a job_payment row is held
  // (20260925000000_job_completions.sql), so a start offered before held could only fail.
  const sql = read('supabase/migrations/20260925000000_job_completions.sql');
  assert.match(sql, /if v_job\.status = 'assigned' and p_status = 'in_progress' then\s+if not exists \(\s+select 1 from public\.payments p\s+where p\.job_id = p_job_id and p\.kind = 'job_payment'[\s\S]*?and p\.status = 'held'/);
  assert.doesNotMatch(worker, /Start anyway|startAnyway/);
  // F6: the step is lib/jobLifecycle.ts's nextWorkerStep, fed the held fact (executed in
  // tests/fixRunF.test.mjs: no 'start' and no trip step until held, arrival or not).
  assert.match(workerFlat, /const step = live && job \? nextWorkerStep\(\{ job, held: !!payment && isHeld\(payment\) \}\) : null;/);
  assert.match(workerFlat, /const awaitingProtection = step === 'message';/);
  assert.match(workerFlat, /const beforeArrival = step === 'en_route' \|\| step === 'arrived'; const canSkipToStart = beforeArrival;/);
  // Unheld: the pinned primary is the conversation, and the note says what it waits for.
  assert.match(workerFlat, /: step === 'message' \? \{ title: `Message \$\{clientName\}`, onPress: \(\) => navigation\.navigate\('Chat', \{ jobId: job\.id \}\), loading: false \}/);
  assert.match(workerFlat, /: \{ title: 'Start job', onPress: handleStart,/, 'Start is the one remaining step, reached only past the held check');
  assert.match(worker, /Waiting for \$\{clientName\} to protect the payment\./);
});

test('[static] C8 · a screen says each money and photo sentence once', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Job confirmed: the caption under the charge is the one "held" — no pill beside it.
  const confirmed = strip(readFileSync(join(root, 'screens/JobConfirmedScreen.tsx'), 'utf8'));
  assert.doesNotMatch(confirmed, /StatusPill/);
  assert.equal((confirmed.match(/held in protection/gi) ?? []).length, 0, 'the caption carries it');
  // The customer's held card: the caption says "released when you approve"; no second sentence does.
  const client = strip(readFileSync(join(root, 'screens/ClientJobDetailScreen.tsx'), 'utf8'));
  assert.doesNotMatch(client, /Funds stay held until you approve/);
  // The worker's finish card: the limit once (the counter), the requirement once (by the button).
  assert.equal((workerFlat.match(/MAX_DONE_PHOTOS\}/g) ?? []).length >= 1, true);
  assert.equal((workerFlat.match(/is required to mark it complete/g) ?? []).length, 1);
});
