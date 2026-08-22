import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 6 guards — the active-work lifecycle.
 *
 * What must stay true:
 *   1. lib/jobLifecycle is THE derivation point (run addendum §1): confirmed
 *      is derived as assigned + held, arrival facts outrank payment state,
 *      and the completed fork (awaiting approval / disputed / done) follows
 *      the payment — executed against the real function, not prose.
 *   2. §9 ordering: the customer's review sits BEHIND the approve gate. The
 *      job screen only renders the inline ReviewSection on the legacy
 *      no-payment path; ReviewAndTip redirects while the payment is held.
 *   3. The §H.1 enum stays deferred: phase51 must not widen job_status.
 *   4. The phase32 lesson: every phase51 function carries an explicit
 *      GRANT EXECUTE, or it is unreachable from the app.
 *   5. Money keeps §H.3 honesty: release exists only behind the adapter,
 *      and no screen calls the release/tip RPCs directly.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const lifecycleUrl = pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href;
const {
  deriveJobLifecycle,
  deriveMyJobsTab,
  myJobsNextAction,
  releaseCountdownLabel,
  releaseDeadlineMs,
  trackStepIndex,
  JOB_LIFECYCLE_LABELS,
} = await import(lifecycleUrl);

test('confirmed is derived as assigned + held — never stored', () => {
  const base = { status: 'assigned', en_route_at: null, arrived_at: null };
  assert.equal(
    deriveJobLifecycle({ job: base, payment: { status: 'held' } }),
    'confirmed'
  );
  // No payment, or a payment short of held, is NOT confirmed.
  assert.equal(deriveJobLifecycle({ job: base, payment: null }), 'pending_payment');
  assert.equal(
    deriveJobLifecycle({ job: base, payment: { status: 'authorized' } }),
    'pending_payment'
  );
});

test('arrival declarations outrank payment state', () => {
  const enRoute = { status: 'assigned', en_route_at: '2026-08-09T10:00:00Z', arrived_at: null };
  const arrived = { ...enRoute, arrived_at: '2026-08-09T10:30:00Z' };
  // True whether or not the customer finished checkout.
  assert.equal(deriveJobLifecycle({ job: enRoute, payment: null }), 'en_route');
  assert.equal(deriveJobLifecycle({ job: enRoute, payment: { status: 'held' } }), 'en_route');
  assert.equal(deriveJobLifecycle({ job: arrived, payment: null }), 'arrived');
});

test('the completed fork follows the payment and the dispute', () => {
  const done = { status: 'completed', en_route_at: null, arrived_at: null };
  assert.equal(
    deriveJobLifecycle({ job: done, payment: { status: 'held' } }),
    'awaiting_approval'
  );
  assert.equal(
    deriveJobLifecycle({ job: done, payment: { status: 'held' }, hasOpenDispute: true }),
    'disputed'
  );
  assert.equal(
    deriveJobLifecycle({ job: done, payment: { status: 'released' } }),
    'completed'
  );
  // Legacy: completed with no payment at all is simply completed.
  assert.equal(deriveJobLifecycle({ job: done, payment: null }), 'completed');
});

test('the 72h clock is mirrored on read: an elapsed hold reads as completed', () => {
  // phase51's auto-release is checked on read (job_payment_state), and there
  // is no cron — so a held payment past completed_at + 72h has already
  // released from the server's point of view the moment anything looks. The
  // client mirror renders that truth early, exactly like effectiveOfferStatus.
  const HOUR = 3_600_000;
  const completedAt = '2026-08-01T00:00:00Z';
  const deadline = Date.parse(completedAt) + 72 * HOUR;
  const done = {
    status: 'completed',
    en_route_at: null,
    arrived_at: null,
    completed_at: completedAt,
  };

  assert.equal(releaseDeadlineMs(done), deadline);
  // Inside the window: still awaiting approval.
  assert.equal(
    deriveJobLifecycle({ job: done, payment: { status: 'held' } }, deadline - HOUR),
    'awaiting_approval'
  );
  // Past the window: the hold has effectively released.
  assert.equal(
    deriveJobLifecycle({ job: done, payment: { status: 'held' } }, deadline + HOUR),
    'completed'
  );
  // An open dispute freezes release — the server refuses the auto-release
  // while one exists, and so does the mirror.
  assert.equal(
    deriveJobLifecycle(
      { job: done, payment: { status: 'held' }, hasOpenDispute: true },
      deadline + HOUR
    ),
    'disputed'
  );
  // Pre-phase51 jobs carry no completed_at: the clock never runs.
  const legacy = { ...done, completed_at: null };
  assert.equal(releaseDeadlineMs(legacy), null);
  assert.equal(
    deriveJobLifecycle({ job: legacy, payment: { status: 'held' } }, deadline + HOUR),
    'awaiting_approval'
  );
});

test('the hub tabs bucket exactly as the 4D-1a mapping says', () => {
  // Active — open/taking bids, assigned (funded or not), en_route, arrived,
  // in_progress, draft.
  for (const state of [
    'draft', 'open', 'pending_payment', 'confirmed', 'en_route', 'arrived', 'in_progress',
  ]) {
    assert.equal(deriveMyJobsTab(state), 'active', `${state} must be Active`);
  }
  // Review — work finished, money still HELD (awaiting approval or frozen).
  assert.equal(deriveMyJobsTab('awaiting_approval'), 'review');
  assert.equal(deriveMyJobsTab('disputed'), 'review');
  // Closed — released/paid_out (derived 'completed'), cancelled.
  assert.equal(deriveMyJobsTab('completed'), 'closed');
  assert.equal(deriveMyJobsTab('cancelled'), 'closed');
  // A status this client cannot classify stays VISIBLE, never hidden.
  assert.equal(deriveMyJobsTab('unknown'), 'active');
});

test('next-action lines derive from lifecycle facts, and Review never means ratings', () => {
  const HOUR = 3_600_000;
  const now = Date.parse('2026-08-10T00:00:00Z');

  // The dispatch's three examples, verbatim in spirit:
  assert.equal(
    myJobsNextAction({ perspective: 'customer', state: 'open', bidCount: 3 }),
    '3 bids to review'
  );
  assert.equal(
    myJobsNextAction({
      perspective: 'customer',
      state: 'awaiting_approval',
      releaseDeadline: now + 41 * HOUR + 1,
      nowMs: now,
    }),
    'Approval needed — releases in 41h'
  );
  assert.equal(
    myJobsNextAction({ perspective: 'customer', state: 'completed', reviewedByMe: false }),
    'Leave a review'
  );

  // A completed-but-unrated job belongs in CLOSED carrying that action — the
  // Review tab is about held money, never star-ratings.
  assert.equal(deriveMyJobsTab('completed'), 'closed');
  assert.equal(
    myJobsNextAction({ perspective: 'worker', state: 'completed', reviewedByMe: true }),
    'Closed'
  );

  // The countdown, both sides of the hour floor.
  assert.equal(releaseCountdownLabel(now + 41 * HOUR + 1, now), '41h');
  assert.equal(releaseCountdownLabel(now + HOUR / 2, now), '<1h');

  // Money copy follows the payment state machine: a held payment "releases";
  // nothing is called paid before release.
  for (const perspective of ['customer', 'worker']) {
    for (const state of ['awaiting_approval', 'disputed', 'in_progress', 'confirmed']) {
      const line = myJobsNextAction({ perspective, state });
      assert.doesNotMatch(line, /\bpaid\b/i, `${perspective}/${state} must not claim paid`);
    }
  }

  // Every lifecycle state yields a non-empty line in both perspectives.
  for (const perspective of ['customer', 'worker']) {
    for (const state of Object.keys(JOB_LIFECYCLE_LABELS)) {
      const line = myJobsNextAction({ perspective, state });
      assert.ok(line && typeof line === 'string', `${perspective}/${state} needs a line`);
    }
  }
});

test('every derived state has a label and a track position that make sense', () => {
  for (const state of [
    'draft', 'open', 'pending_payment', 'confirmed', 'en_route', 'arrived',
    'in_progress', 'awaiting_approval', 'disputed', 'completed', 'cancelled', 'unknown',
  ]) {
    assert.ok(JOB_LIFECYCLE_LABELS[state], `label missing for ${state}`);
  }
  // The march is strictly ordered; off-track states report -1.
  assert.equal(trackStepIndex('confirmed'), 0);
  assert.equal(trackStepIndex('en_route'), 1);
  assert.equal(trackStepIndex('arrived'), 2);
  assert.equal(trackStepIndex('in_progress'), 3);
  assert.equal(trackStepIndex('completed'), 4);
  // Disputed is as far along as awaiting approval — the dispute changes the
  // money, not the distance travelled.
  assert.equal(trackStepIndex('disputed'), trackStepIndex('awaiting_approval'));
  assert.equal(trackStepIndex('open'), -1);
  assert.equal(trackStepIndex('cancelled'), -1);
});

test('JobProgress is presentation over the canonical track (F-012)', async () => {
  const progress = await read('components/JobProgress.tsx');
  // The step position flows through THE derivation and THE track index…
  assert.match(progress, /trackStepIndex\(deriveJobLifecycle\(/);
  // …the local status→index duplicate is gone and may not return, and the
  // old `?? 0` fall-through (any unknown status drew "Assigned" as done) is
  // replaced by an explicit claim-nothing branch.
  assert.doesNotMatch(progress, /const ORDER|\?\? 0/);
  assert.match(progress, /track < 0 \? -1/);
});

test('jobStage is presentation over the canonical derivation (F-012)', async () => {
  const stage = await read('lib/jobStage.ts');
  assert.match(stage, /deriveJobLifecycle\(\{ job: \{ status \}, payment: null \}\)/);
  // The raw-status switch is gone — the only switch left runs over the
  // DERIVED state, so a new status classifies in exactly one file.
  assert.doesNotMatch(stage, /switch \(status\)/);
  // decision 5: the unclassifiable state is an explicit branch, never an
  // accidental fall-through.
  assert.match(stage, /case 'unknown':/);
});

test('one title-caser: StatusBadge imports formatStatus from jobStage (F-012)', async () => {
  const badge = await read('components/StatusBadge.tsx');
  assert.match(badge, /import \{ formatStatus \} from '\.\.\/lib\/jobStage'/);
  assert.doesNotMatch(
    badge,
    /function formatStatus|\.replace\(\/_\/g/,
    'the character-identical local copy must not return'
  );
  // The pill's stale Phase 3 promises are gone and nothing promissory
  // replaced them — decision 9: the file states facts, not futures.
  const pill = await read('ui/primitives/StatusPill.tsx');
  assert.doesNotMatch(pill, /Phase 3|converge/i);
});

test('no module outside lib/jobLifecycle.ts maps a raw status to a step index (F-012)', () => {
  // A raw-status→number map literal is the JobProgress defect's signature;
  // the canonical file owns the only status→position knowledge.
  const statusIndexMap = /\b(?:open|assigned|in_progress|completed|cancelled|draft)\s*:\s*-?\d/;
  const offenders = [];
  const walk = (rel) => {
    for (const entry of readdirSync(join(root, rel))) {
      const relPath = `${rel}/${entry}`;
      const full = join(root, relPath);
      if (statSync(full).isDirectory()) {
        walk(relPath);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry) || relPath === 'lib/jobLifecycle.ts') continue;
      if (statusIndexMap.test(readFileSync(full, 'utf8'))) offenders.push(relPath);
    }
  };
  for (const dir of ['screens', 'components', 'ui', 'hooks', 'lib']) walk(dir);
  assert.deepEqual(offenders, [], 'raw status→step-index maps outside the canonical file');
});

test('screens derive lifecycle through the one helper, never locally', async () => {
  for (const screen of [
    'screens/TrackWorkerScreen.tsx',
    'screens/RouteArrivalScreen.tsx',
    'screens/WorkChecklistScreen.tsx',
  ]) {
    const src = await read(screen);
    assert.match(src, /deriveJobLifecycle|trackStepIndex/, `${screen} must use lib/jobLifecycle`);
    assert.ok(
      !/status\s*===\s*'assigned'\s*&&.*'held'/s.test(src),
      `${screen} must not re-derive confirmed locally`
    );
  }
});

test('§9 ordering: the inline review survives only on the legacy no-payment path', async () => {
  const src = await read('screens/ClientJobDetailScreen.tsx');
  // The completed branch forks on `payment ?` BEFORE any ReviewSection.
  const completedBlock = src.slice(src.indexOf("job.status === 'completed' ?"));
  const paymentFork = completedBlock.indexOf('payment ?');
  const reviewSection = completedBlock.indexOf('<ReviewSection');
  assert.ok(paymentFork >= 0, 'completed branch must fork on the payment');
  assert.ok(reviewSection > paymentFork, 'ReviewSection must sit behind the payment fork');
  // The approval CTA exists and routes to the approval surface.
  assert.match(completedBlock, /ApproveOrDispute/);
});

test('ReviewAndTip refuses to render its form while the payment is held', async () => {
  const src = await read('screens/ReviewAndTipScreen.tsx');
  assert.match(src, /payment && !released/, 'the held gate must exist');
  assert.match(src, /ApproveOrDispute/, 'the gate must route back to approval');
});

test('phase51 defers the §H.1 enum and grants every new function', async () => {
  const sql = await read('supabase/phase51_active_work_lifecycle.sql');
  assert.ok(
    !/alter\s+type\s+public\.job_status/i.test(sql),
    'phase51 must NOT widen job_status — the §H.1 enum migration is deferred'
  );
  for (const fn of [
    'mark_worker_arrival(uuid, text)',
    'sandbox_release_job_payment(uuid)',
    'job_payment_state(uuid)',
    'open_job_dispute(uuid, text, text)',
    'withdraw_job_dispute(uuid)',
    'sandbox_tip_worker(uuid, integer)',
    'active_work_lifecycle_enabled()',
  ]) {
    assert.ok(
      sql.includes(`grant execute on function public.${fn} to authenticated`),
      `phase51 must grant EXECUTE on ${fn} (the phase32 lesson)`
    );
    assert.ok(
      sql.includes(`revoke all on function public.${fn} from public, anon`),
      `phase51 must revoke PUBLIC/anon on ${fn}`
    );
  }
});

test('release and tip exist only behind the payment adapter', async () => {
  const adapter = await read('lib/adapters/payments.ts');
  assert.match(adapter, /sandbox_release_job_payment/);
  assert.match(adapter, /sandbox_tip_worker/);
  // The disabled provider refuses both — fail closed, not half-working.
  assert.match(adapter, /releaseJobPayment: refuse/);
  assert.match(adapter, /tipWorker: refuse/);

  // No screen reaches the money RPCs around the adapter.
  for (const screen of [
    'screens/ApproveOrDisputeScreen.tsx',
    'screens/ReviewAndTipScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/WorkerJobScreen.tsx',
  ]) {
    const src = await read(screen);
    assert.ok(
      !src.includes("rpc('sandbox_release_job_payment'") &&
        !src.includes("rpc('sandbox_tip_worker'"),
      `${screen} must go through paymentProvider, not the RPCs`
    );
  }
});

test('verify-schema covers phase51', async () => {
  const src = await read('scripts/verify-schema.mjs');
  assert.match(src, /phase51_active_work_lifecycle\.sql/);
  for (const rpc of [
    'mark_worker_arrival',
    'sandbox_release_job_payment',
    'job_payment_state',
    'open_job_dispute',
    'withdraw_job_dispute',
    'sandbox_tip_worker',
  ]) {
    assert.ok(src.includes(`'${rpc}'`), `verify-schema must probe ${rpc}`);
  }
});
