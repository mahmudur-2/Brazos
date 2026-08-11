import test from 'node:test';
import assert from 'node:assert/strict';
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
const { deriveJobLifecycle, trackStepIndex, JOB_LIFECYCLE_LABELS } = await import(lifecycleUrl);

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

test('screens derive lifecycle through the one helper, never locally', async () => {
  for (const screen of [
    'screens/TrackWorkerScreen.tsx',
    'screens/RouteArrivalScreen.tsx',
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
