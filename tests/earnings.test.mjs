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
const { deriveEarnings } = await import(earningsUrl);

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
  ]);
  assert.equal(s.pendingCents, 10500);
  assert.equal(s.availableCents, 4500);
  assert.equal(s.transferredCents, 2000);
  assert.equal(s.feeCents, 0);
  // Empty ledger derives an all-zero wallet, never NaN or undefined.
  const empty = deriveEarnings([]);
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
  // Cash-out goes through the adapter, never the RPC.
  assert.match(src, /paymentProvider\.cashOut\(\)/);
  assert.ok(!src.includes("rpc('sandbox_cash_out'"), 'screen must not call the RPC');
  // Simulated, and disabled at zero.
  assert.match(src, /simulated/i);
  assert.match(src, /availableCents === 0/);
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
const FAKE = { countdown: () => '41h', timeAgo: () => '2 h ago' };

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
    `Held in protection ${EM} releases in 41h unless approved first`
  );
  // The clock has run: due, with no time named — the server's gate decides
  // when, and this client cannot know which branch it takes.
  assert.equal(
    earningsRowMeta(facts({ releaseDeadlineMs: NOW - HOUR }), NOW, FAKE),
    `Held in protection ${EM} automatic release is due`
  );
  // No clock at all (a job carrying no completed_at): today's plain sentence.
  assert.equal(earningsRowMeta(facts(), NOW, FAKE), 'Held in protection');
  // Released on the sandbox provider: today's exact strings, both reasons.
  assert.equal(
    earningsRowMeta(facts({ status: 'released', released_at: '2026-09-05T10:00:00Z' }), NOW, FAKE),
    'Released 2 h ago'
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
    'Released (auto) 2 h ago'
  );
  // Released on the card path: the bank leg as a DIRECTION, never a date —
  // the sentence notify_on_payment_release already sends a non-sandbox payee.
  // The provider test is an allow-list on sandbox, so a provider nobody has
  // heard of gets the real-money sentence too (the fail-safe direction).
  for (const provider of ['stripe', 'something_new']) {
    assert.equal(
      earningsRowMeta(
        facts({ status: 'released', provider, released_at: '2026-09-05T10:00:00Z' }),
        NOW,
        FAKE
      ),
      `Released 2 h ago ${EM} on its way to your bank`
    );
  }
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
  assert.match(job, /'APPROVED · SET UP PAYOUTS TO RECEIVE IT'/);
  assert.match(job, /approved the finished work\. \$\{PAYOUT_SETUP_NOTICE\}`/);
  assert.match(job, /navigateAcrossTabs\('Profile', 'Payouts', \{\}\)/, 'one tap to Payouts');
  assert.match(job, /if \(paymentsMode !== 'stripe'\) return;\s*fetchMyPayoutsStatus\(\)/, 'no RPC on the sandbox path');
  const home = await read('screens/WorkerHomeScreen.tsx');
  assert.match(home, /if \(!user \|\| paymentsMode !== 'stripe'\) return;/, 'Worker Home reads nothing on the sandbox path');
  assert.match(home, /\.filter\(\(row\) => payoutSetupNotice\(status\.data, \[row\]\) !== null\)/);
  assert.match(home, /Set up payouts to receive \{formatBudget\(payoutWaitCents\)\}/);
});

test('a6 · a missing timestamp is TRIMMED, not left with a trailing space', () => {
  // The choice pinned (D3): today's ternary rendered "Released " with a
  // trailing space when released_at was null. Trimmed here, so the card-path
  // suffix reads as one sentence instead of carrying a double space. The
  // visible line is unchanged — trailing space in a Text node renders as
  // nothing — and no other case moves.
  assert.equal(earningsRowMeta(facts({ status: 'released' }), NOW, FAKE), 'Released');
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

test('phase55 keeps the sandbox posture', async () => {
  const sql = await read('supabase/archive/phases/phase55_sandbox_cash_out.sql');
  assert.match(sql, /payee_id = v_actor/);
  assert.match(sql, /status = 'released'/);
  assert.match(sql, /grant execute on function public\.sandbox_cash_out\(\) to authenticated/);
  assert.match(sql, /revoke all on function public\.sandbox_cash_out\(\) from public, anon/);
  // It must never touch held money.
  assert.ok(!/'held'/.test(sql), 'cash-out must not reference held rows');
});
