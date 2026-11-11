import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 11 guards — earnings & money surfaces.
 *
 * What must stay true:
 *   1. Wallet buckets are a PURE SUM over payments rows — executed against
 *      the real deriveEarnings, and no other money source exists on the
 *      screen (no hand-kept balance, ever — §G).
 *   2. Cash-out is simulated, says so, and reaches the database only through
 *      the payment adapter.
 *   3. Labels stay honest: paid_out renders as transferred/simulated, and a
 *      zero-available wallet cannot offer a cash-out.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

// deriveEarnings is pure; its only import is a type. Import it for real.
const earningsUrl = pathToFileURL(join(root, "lib/earningsMath.ts")).href;
const { deriveEarnings, workerReceivesCents } = await import(earningsUrl);
// B23: the take is injected, as the screens inject lib/payments.ts workerTakeCents.
const take = (r) => r.amount_cents - r.platform_fee_cents;

// a6: the ledger's meta copy is pure too — no runtime imports at all, the
// formatters are injected — so it is executed here, not read as text.
const copyUrl = pathToFileURL(join(root, "lib/earningsCopy.ts")).href;
const { earningsRowMeta } = await import(copyUrl);

const row = (status, cents, fee = 0) => ({
  id: `${status}-${cents}`,
  job_id: 'j', offer_id: null, payer_id: 'c', payee_id: 'w',
  kind: 'job_payment', amount_cents: cents, platform_fee_cents: fee,
  provider: 'sandbox', provider_ref: null, status,
  authorized_at: null, held_at: null, released_at: null, release_reason: null,
  paid_out_at: null, created_at: '2026-08-09T00:00:00Z', updated_at: '2026-08-09T00:00:00Z',
  job_title: 'T',
});

test('the wallet is exactly a sum over rows', () => {
  const s = deriveEarnings([
    row('held', 6000), row('held', 4500),
    row('released', 4500, 0), row('paid_out', 2000),
  ], take);
  assert.equal(s.pendingCents, 10500);
  assert.equal(s.availableCents, 4500);
  assert.equal(s.transferredCents, 2000);
  assert.equal(s.feeCents, 0);
  // Empty ledger derives an all-zero wallet, never NaN or undefined.
  const empty = deriveEarnings([], take);
  assert.deepEqual(
    [empty.pendingCents, empty.availableCents, empty.transferredCents, empty.feeCents],
    [0, 0, 0, 0]
  );
});

test('the screen derives from the ledger and only the ledger', async () => {
  const src = await read('screens/EarningsScreen.tsx');
  assert.match(src, /fetchMyEarnings/);
  // No local arithmetic invents a balance: every displayed sum comes from
  // the summary object.
  assert.ok(!/\+=\s*|useState<number>/.test(src), 'no hand-kept balance state');
  // Lean D4: there is no cash-out (ruling 1) — never the RPC.
  assert.ok(!src.includes("rpc('sandbox_cash_out'"), 'screen must not call the RPC');
});

// ---------------------------------------------------------------------------
// a6 — the ledger's meta line: one sentence per payment state, no timing promise
// ---------------------------------------------------------------------------

// U+2014 as an escape, so every assertion below is against the em dash the
// screen's other strings already use; a hyphen typed into the module fails here.
const EM = '—';
const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-05T12:00:00Z');
// Injected formatters, fixed: the countdown and the relative time belong to
// lib/jobLifecycle.ts and lib/time.ts, and this module must not restate either.
const FAKE = { countdown: () => 'Sat at 3 PM', timeAgo: () => '2 h ago' };

const facts = (over = {}) => ({
  status: 'held',
  provider: 'sandbox',
  release_requested_at: null,
  release_reason: null,
  released_at: null,
  paid_out_at: null,
  releaseDeadlineMs: null,
  ...over,
});

test('a6 · every payment state gets its own sentence, and nothing else gets one', () => {
  // D23's approved-payout-pending state, now REACHABLE on this screen: the
  // row stays held until the transfer lands, and it is not "held in
  // protection" any more — the customer's decision is made.
  assert.equal(
    earningsRowMeta(facts({ release_requested_at: '2026-09-05T11:00:00Z' }), NOW, FAKE),
    `Approved ${EM} payout on its way`
  );
  // Held with the release clock still running. The figure is the formatter's,
  // so the helper carries no time literal of its own.
  assert.equal(
    earningsRowMeta(facts({ releaseDeadlineMs: NOW + 41 * HOUR }), NOW, FAKE),
    `Held in protection ${EM} releases Sat at 3 PM unless approved first`
  );
  // The clock has run: due, with no time named — the server's gate decides
  // when, and this client cannot know which branch it takes.
  assert.equal(
    earningsRowMeta(facts({ releaseDeadlineMs: NOW - HOUR }), NOW, FAKE),
    `Held in protection ${EM} automatic release is due`
  );
  // No clock at all (a job carrying no completed_at): today's plain sentence.
  assert.equal(earningsRowMeta(facts(), NOW, FAKE), 'Held in protection');
  // Released: the bank leg as a DIRECTION, never a date — the sentence
  // notify_on_payment_release already sends a card-path payee. Both reasons.
  assert.equal(
    earningsRowMeta(facts({ status: 'released', released_at: '2026-09-05T10:00:00Z' }), NOW, FAKE),
    `Released 2 h ago ${EM} on its way to your bank`
  );
  assert.equal(
    earningsRowMeta(
      facts({
        status: 'released',
        release_reason: 'auto_approved',
        released_at: '2026-09-05T10:00:00Z',
      }),
      NOW,
      FAKE
    ),
    `Released (auto) 2 h ago ${EM} on its way to your bank`
  );
  // Transferred: today's string.
  assert.equal(
    earningsRowMeta(facts({ status: 'paid_out', paid_out_at: '2026-09-05T10:00:00Z' }), NOW, FAKE),
    'Transferred 2 h ago'
  );
  // Any other status invents no label. The screen's own status filter never
  // returns one, and the helper still refuses.
  assert.equal(earningsRowMeta(facts({ status: 'refunded' }), NOW, FAKE), '');
});

// 2026-09-28 (LUX-LIST-64 #63, audit M-14) — PAYOUT HONESTY. An approved card-
// path row that process-settlements cannot send (the worker's payouts are not
// enabled) must never read "on its way": the ledger names the worker's own
// step. The answer is payoutSetupNotice()'s (lib/payments.ts), asked by the
// caller and handed in — this import-free module never restates the rule.
test('#63 · an approved payment waiting on the payout setup says so, and only then', async () => {
  assert.equal(
    earningsRowMeta(
      facts({ provider: 'stripe', release_requested_at: '2026-09-05T11:00:00Z', waitingOnPayoutSetup: true }),
      NOW,
      FAKE
    ),
    `Approved ${EM} waiting on your payout setup`
  );
  // Enabled, unread or sandbox: today's sentence, unchanged.
  assert.equal(
    earningsRowMeta(
      facts({ provider: 'stripe', release_requested_at: '2026-09-05T11:00:00Z', waitingOnPayoutSetup: false }),
      NOW,
      FAKE
    ),
    `Approved ${EM} payout on its way`
  );
  // The flag never reaches past the approved state: a held row still in
  // protection is described by its clock, whatever the setup.
  assert.equal(earningsRowMeta(facts({ waitingOnPayoutSetup: true }), NOW, FAKE), 'Held in protection');

  // The screens ask the ONE rule, on the card path only.
  const screen = await read('screens/EarningsScreen.tsx');
  assert.match(screen, /waitingOnPayoutSetup: payoutSetupNotice\(payouts, \[row\]\) !== null,/);
  assert.match(screen, /navigateAcrossTabs\('MyJobs', 'WorkerJob', \{ jobId: row\.job_id \}\)/, 'a ledger row opens its job');
  const job = await read('screens/WorkerJobScreen.tsx');
  assert.match(job, /const waitingOnSetup = payment \? payoutSetupNotice\(payouts, \[payment\]\) !== null : false;/);
  // C4: the eyebrow is PAYMENT; the caption under the take names the step (lib/moneyCopy.ts).
  assert.match(job, /waitingOnPayoutSetup=\{waitingOnSetup\}/);
  assert.match(await read('lib/moneyCopy.ts'), /'Approved — waiting on your payout setup'/);
  assert.match(job, /approved the finished work\. \$\{PAYOUT_SETUP_NOTICE\}`/);
  assert.match(job, /navigateAcrossTabs\('Profile', 'Payouts', \{\}\)/, 'one tap to Payouts');
  assert.match(job, /if \(paymentsMode !== 'stripe'\) return;\s*fetchMyPayoutsStatus\(\)/, 'no RPC on the sandbox path');
  const home = await read('screens/WorkerHomeScreen.tsx');
  assert.match(home, /if \(!user \|\| paymentsMode !== 'stripe'\) return;/, 'Worker Home reads nothing on the sandbox path');
  assert.match(home, /\.filter\(\(row\) => payoutSetupNotice\(status\.data, \[row\]\) !== null\)/);
  assert.match(home, /Set up payouts to receive \{formatBudget\(payoutWaitCents\)\}/);
});

// B21 — the refund-queued branch of deriveEarnings runs on what the read returns: the row is
// built from exactly the columns lib/earnings.ts selects, as PostgREST would hand it back.
test('B21 · the read carries refund_cents and transfer_cents, so a refund-queued held row is not pending', async () => {
  const earnings = await read('lib/earnings.ts');
  const paymentsSelect = earnings.slice(earnings.indexOf(".from('payments')"), earnings.indexOf(".eq('payee_id'"));
  const columns = paymentsSelect.match(/\.select\(\s*'([^']+)'/)[1].split(',').map((c) => c.trim());
  const pick = (full) => ({ ...Object.fromEntries(columns.map((c) => [c, full[c]])), job_title: 'T' });
  // A late cancellation: most goes home, the fee goes to the worker. A full refund: nothing.
  const fee = pick({ ...row('held', 10000), refund_cents: 9750, transfer_cents: 1000 });
  const full = pick({ ...row('held', 10000), refund_cents: 10750, transfer_cents: 0 });
  assert.equal(deriveEarnings([fee], take).pendingCents, 1000);
  assert.equal(deriveEarnings([full], take).pendingCents, 0);
  // A plain held row is still pending in full.
  assert.equal(deriveEarnings([pick(row('held', 6000))], take).pendingCents, 6000);
});

// B21 — a tip is held, then on its way, then released: never "approved" (no one approves a tip) and
// never on the job's release clock. B1 queues a charged tip at once (release_requested_at set).
test('B21 · a tip row has its own sentence: on its way, never approved, no release clock', async () => {
  const tip = (over) => facts({ kind: 'tip', provider: 'stripe', ...over });
  const queued = '2026-09-05T11:00:00Z';
  assert.equal(earningsRowMeta(tip({ release_requested_at: queued }), NOW, FAKE), 'On its way to you');
  assert.equal(
    earningsRowMeta(tip({ release_requested_at: queued, waitingOnPayoutSetup: true }), NOW, FAKE),
    'Waiting on your payout setup'
  );
  // Held but not queued (B1's amount lock): no clock, even when the job has one.
  assert.equal(earningsRowMeta(tip({ releaseDeadlineMs: NOW + 41 * HOUR }), NOW, FAKE), `Held ${EM} not sent yet`);
  assert.equal(
    earningsRowMeta(tip({ status: 'released', released_at: '2026-09-05T10:00:00Z' }), NOW, FAKE),
    `Released 2 h ago ${EM} on its way to your bank`
  );
  for (const over of [{ release_requested_at: queued }, {}, { releaseDeadlineMs: NOW - HOUR }]) {
    assert.doesNotMatch(earningsRowMeta(tip(over), NOW, FAKE), /Approved|Paid|protection/);
  }
  // A job payment keeps its sentence.
  assert.equal(earningsRowMeta(facts({ release_requested_at: queued }), NOW, FAKE), `Approved ${EM} payout on its way`);
  // The screen hands the kind in.
  assert.match(await read('screens/EarningsScreen.tsx'), /kind: row\.kind,/);
});

// B23 — a cancelled job's row. The shapes are the local stack's own (a rolled-back probe of
// cancel_job, transfer.created and charge.refunded, 2026-11-11): $50 job, $3.75 worker fee,
// $53.75 charged; the late fee is $15.00 and goes to the worker whole (cancellation_fee_cents).
// Each row is built from exactly the columns the two reads select, as PostgREST hands them back.
const B23_QUEUED = '2026-09-05T11:00:00Z';
const B23_SENT = '2026-09-05T11:30:00Z';
async function b23Pick() {
  const earnings = await read('lib/earnings.ts');
  const paymentsSelect = earnings.slice(earnings.indexOf(".from('payments')"), earnings.indexOf(".eq('payee_id'"));
  const columns = paymentsSelect.match(/\.select\(\s*'([^']+)'/)[1].split(',').map((c) => c.trim());
  return (full, jobStatus) => ({
    ...Object.fromEntries(columns.map((c) => [c, full[c]])),
    job_title: 'T',
    job_status: jobStatus,
  });
}
const b23 = (over) => ({ ...row('held', 5000, 375), provider: 'stripe', refund_cents: null, transfer_cents: null, ...over });
const B23_CASES = {
  // A: free cancel, worker cancel, ban, or a refund decision — the whole charge goes home.
  A: b23({ refund_cents: 5375, transfer_cents: 0 }),
  // B: late cancel — the fee is queued for the worker, the rest goes home.
  B: b23({ refund_cents: 3875, transfer_cents: 1500, release_reason: 'cancellation_fee', release_requested_at: B23_QUEUED }),
  // C: transfer.created landed first — released_at stamped, the row stays held.
  C: b23({ refund_cents: 3875, transfer_cents: 1500, release_reason: 'cancellation_fee', release_requested_at: B23_QUEUED, released_at: B23_SENT }),
  // D: then charge.refunded — partially_refunded, the fee long sent.
  D: b23({ status: 'partially_refunded', refund_cents: 3875, transfer_cents: 1500, release_reason: 'cancellation_fee', release_requested_at: B23_QUEUED, released_at: B23_SENT }),
  // D2: charge.refunded landed first — partially_refunded, the fee not sent yet.
  D2: b23({ status: 'partially_refunded', refund_cents: 3875, transfer_cents: 1500, release_reason: 'cancellation_fee', release_requested_at: B23_QUEUED }),
  // E: a no-show claim — the job is cancelled, the row held and untouched until a decision.
  E: b23({}),
};
const b23Facts = (r, over = {}) => ({
  status: r.status, kind: r.kind, release_requested_at: r.release_requested_at, release_reason: r.release_reason,
  released_at: r.released_at, paid_out_at: r.paid_out_at, refund_cents: r.refund_cents,
  transfer_cents: r.transfer_cents, job_status: r.job_status, releaseDeadlineMs: null, ...over,
});

test('B23 · each cancelled-job case shows what the worker receives, on rows built from the real select', async () => {
  const pick = await b23Pick();
  const rows = Object.fromEntries(Object.entries(B23_CASES).map(([k, r]) => [k, pick(r, 'cancelled')]));
  // The sentences: where the money goes, never the job-payment words.
  assert.equal(earningsRowMeta(b23Facts(rows.A), NOW, FAKE), 'Refund on its way to the customer');
  assert.equal(earningsRowMeta(b23Facts(rows.B), NOW, FAKE), `Cancellation fee ${EM} on its way to you`);
  assert.equal(
    earningsRowMeta(b23Facts(rows.B, { waitingOnPayoutSetup: true }), NOW, FAKE),
    `Cancellation fee ${EM} waiting on your payout setup`
  );
  assert.equal(earningsRowMeta(b23Facts(rows.C), NOW, FAKE), `Cancellation fee ${EM} sent to your payout account`);
  assert.equal(earningsRowMeta(b23Facts(rows.D), NOW, FAKE), `Cancellation fee ${EM} sent to your payout account`);
  assert.equal(earningsRowMeta(b23Facts(rows.D2), NOW, FAKE), `Cancellation fee ${EM} on its way to you`);
  assert.equal(earningsRowMeta(b23Facts(rows.E), NOW, FAKE), `Held ${EM} waiting on a decision`);
  for (const r of Object.values(rows)) {
    assert.doesNotMatch(earningsRowMeta(b23Facts(r), NOW, FAKE), /Approved|protection|Released|\bpaid\b/);
  }
  // The amounts: what the ledger sends the worker, never the full take.
  assert.deepEqual(
    Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, workerReceivesCents(r, take)])),
    { A: 0, B: 1500, C: 1500, D: 1500, D2: 1500, E: 0 }
  );
  // The totals, beside a plain held job as the control: the fee card never counts a refunded
  // job's fee (none is kept: the whole cancellation fee goes to the worker).
  const control = pick(row('held', 5000, 375), 'completed');
  const s = deriveEarnings([...Object.values(rows), control], take);
  assert.deepEqual(
    [s.pendingCents, s.availableCents, s.transferredCents, s.feeCents],
    [1500 + 1500 + 4625, 1500 + 1500, 0, 375]
  );
  // The screen hands the facts in and shows the same amount.
  const screen = await read('screens/EarningsScreen.tsx');
  for (const f of ['refund_cents', 'transfer_cents', 'job_status']) {
    assert.match(screen, new RegExp(`${f}: row\\.${f},`), `the screen hands ${f} in`);
  }
  assert.match(screen, /<MoneyText cents=\{workerReceivesCents\(row, workerTakeCents\)\} state=\{row\.status\} captionHidden \/>/);
  // job_status comes off the jobs read, beside the title.
  const earnings = await read('lib/earnings.ts');
  const jobsSelect = earnings.slice(earnings.indexOf(".from('jobs')"), earnings.indexOf(".in('id', jobIds)"));
  assert.match(jobsSelect, /\bstatus\b/, "the jobs read carries the job's status");
  assert.match(earnings, /job_status: job\?\.status \?\? null,/, 'and the row carries it as job_status');
});

test('B23 · a fee that was sent counts as available, also after the refund (partially_refunded is read)', async () => {
  const earnings = await read('lib/earnings.ts');
  assert.match(earnings, /const EARNING_STATUSES = \['held', 'released', 'paid_out', 'partially_refunded'\] as const;/);
  const pick = await b23Pick();
  for (const k of ['C', 'D']) {
    const s = deriveEarnings([pick(B23_CASES[k], 'cancelled')], take);
    assert.deepEqual([s.pendingCents, s.availableCents, s.transferredCents], [0, 1500, 0], `${k}: the sent fee is available`);
  }
  const d2 = deriveEarnings([pick(B23_CASES.D2, 'cancelled')], take);
  assert.deepEqual([d2.pendingCents, d2.availableCents], [1500, 0], 'D2: refunded first, the fee still pending');
  // A refund by hand after the release (charge.refunded moves a released row to
  // partially_refunded): the amount is the transfer that was actually sent.
  const byHand = pick(
    { ...row('partially_refunded', 5000, 375), provider: 'stripe', refund_cents: 1000, transfer_cents: 4625, release_reason: 'approved', release_requested_at: B23_QUEUED, released_at: B23_SENT },
    'completed'
  );
  assert.equal(workerReceivesCents(byHand, take), 4625);
  assert.deepEqual([deriveEarnings([byHand], take).availableCents, deriveEarnings([byHand], take).feeCents], [4625, 0]);
  assert.equal(earningsRowMeta(b23Facts(byHand), NOW, FAKE), 'Partly refunded to the customer');
  // A full refund leaves the read (refunded is not an earning status) and still gets no label.
  assert.equal(earningsRowMeta(facts({ status: 'refunded' }), NOW, FAKE), '');
});

test('B23 · one amount function: the ledger row, the totals and Worker Home count the fee, never the full take', async () => {
  const home = await read('screens/WorkerHomeScreen.tsx');
  assert.match(home, /\.reduce\(\(sum, row\) => sum \+ workerReceivesCents\(row, workerTakeCents\), 0\);/);
  assert.match(await read('lib/earnings.ts'), /return \{ data: deriveEarnings\(rows, workerTakeCents\), error: null \};/);
  const screen = await read('screens/EarningsScreen.tsx');
  for (const bucket of ['s.pendingCents', 's.availableCents', 's.transferredCents']) {
    assert.ok(screen.includes(`cents={${bucket}}`), `${bucket} feeds its bucket`);
  }
  assert.doesNotMatch(screen, /deriveEarnings/, 'the screen no longer re-derives the summary');
  // Worker Home's line: the approved job's take and the queued fee, never the cancelled job's take.
  const pick = await b23Pick();
  const approved = pick({ ...row('held', 5000, 375), provider: 'stripe', release_requested_at: B23_QUEUED }, 'completed');
  assert.equal(workerReceivesCents(approved, take) + workerReceivesCents(pick(B23_CASES.B, 'cancelled'), take), 4625 + 1500);
});

test('a6 · a missing timestamp is TRIMMED, not left with a trailing space', () => {
  // The choice pinned (D3): today's ternary rendered "Released " with a
  // trailing space when released_at was null. Trimmed here, so the card-path
  // suffix reads as one sentence instead of carrying a double space. The
  // visible line is unchanged — trailing space in a Text node renders as
  // nothing — and no other case moves.
  assert.equal(
    earningsRowMeta(facts({ status: 'released', provider: 'stripe' }), NOW, FAKE),
    `Released ${EM} on its way to your bank`
  );
  assert.equal(earningsRowMeta(facts({ status: 'paid_out' }), NOW, FAKE), 'Transferred');
});

test('a6 · the two reads carry the columns the sentences need, and the copy lives in one place', async () => {
  const earnings = await read('lib/earnings.ts');
  // D1's defect was a predicate made unreachable by its own select. Each
  // select is asserted on its own slice, so neither can borrow the other's.
  const paymentsSelect = earnings.slice(
    earnings.indexOf(".from('payments')"),
    earnings.indexOf(".eq('payee_id'")
  );
  assert.match(paymentsSelect, /release_requested_at/);
  const jobsSelect = earnings.slice(
    earnings.indexOf(".from('jobs')"),
    earnings.indexOf(".in('id', jobIds)")
  );
  assert.match(jobsSelect, /completed_at/);

  const screen = await read('screens/EarningsScreen.tsx');
  assert.equal(
    (screen.match(/earningsRowMeta\(/g) ?? []).length,
    1,
    'one call — the rule is not restated on the screen'
  );
  // The ternary's own quoted literals are gone: the copy lives in the helper.
  // The buckets' note props (double-quoted JSX) are untouched.
  assert.ok(!screen.includes("'Held in protection'"), 'the meta ternary no longer carries the copy');
  assert.ok(!screen.includes('payout on its way'), 'the approved sentence lives in the helper');
  assert.match(screen, /note="Held in protection"/);
  assert.match(screen, /note="Released to you"/);

  // The no-timing-promise fence. The client holds no payout-schedule data, so
  // a bank-arrival estimate would be invented; the countdown token is the
  // formatter's, never a literal here.
  const copy = await read('lib/earningsCopy.ts');
  assert.doesNotMatch(copy, /business day/i);
  assert.doesNotMatch(copy, /\d+\s*(minutes|hours|days)\b/);
  assert.doesNotMatch(copy, /instant/i);
});
