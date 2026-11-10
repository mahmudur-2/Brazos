import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * P1 (lean) - CANCELLING A JOB. cancel_job() is the server authority; the app
 * calls it through lib/jobs.ts cancelJob, previews its money with the pure
 * mirror in lib/paymentRules.ts, and tells the customer / worker exactly what
 * happens through lib/moneyCopy.ts. The preview cases below are the SQL's own
 * (supabase/migrations/20261108000000_lean_v1.sql, cancel_job and
 * cancellation_fee_cents): in_progress always a fee; else free with no
 * scheduled_date, within 15 minutes of acceptance, or more than 24h before the
 * arrival anchor (America/New_York); else the fee, 20% floored $15 capped $35.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const rules = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);
const copy = await import(pathToFileURL(join(root, 'lib/moneyCopy.ts')).href);
const { cancellationFeeCents, customerCancelPreview, marketWallClockMs, noShowReportable } = rules;

const TERMS = {
  accepted_at: '2026-11-10T12:00:00Z',
  agreed_price_cents: 10000,
  cancel_fee_bps: 2000,
  cancel_fee_min_cents: 1500,
  cancel_fee_max_cents: 3500,
};
const HELD = { status: 'held', amount_cents: 10000, charge_amount_cents: 10750 };
const at = (iso) => Date.parse(iso);
// 2026-11-20 is EST (UTC-5): an 18:00 arrival start is 23:00Z, so the 24h cutoff is 2026-11-19T23:00Z.
const SCHEDULED = { status: 'assigned', scheduled_date: '2026-11-20', arrival_start_hour: 18 };

test('the cancellation fee is least(max, greatest(min, round(price*bps/10000))), never above the price', () => {
  assert.equal(cancellationFeeCents(TERMS, 10000), 2000); // 20%
  assert.equal(cancellationFeeCents(TERMS, 5000), 1500); // 20% = 1000, floored to the minimum
  assert.equal(cancellationFeeCents(TERMS, 50000), 3500); // 20% = 10000, capped
  assert.equal(cancellationFeeCents(TERMS, 1000), 1000); // the minimum would exceed the price
  assert.equal(cancellationFeeCents({ ...TERMS, cancel_fee_bps: 1250, cancel_fee_min_cents: 0 }, 10), 1); // 1.25 -> 1
  assert.equal(cancellationFeeCents({ ...TERMS, cancel_fee_bps: 1250, cancel_fee_min_cents: 0 }, 14), 2); // 1.75 -> 2
  assert.equal(cancellationFeeCents({ ...TERMS, cancel_fee_bps: 5000, cancel_fee_min_cents: 0 }, 5), 3); // 2.5 rounds half up
});

test('America/New_York wall time resolves across the DST change', () => {
  assert.equal(marketWallClockMs('2026-11-20', 18), at('2026-11-20T23:00:00Z')); // EST
  assert.equal(marketWallClockMs('2026-07-20', 18), at('2026-07-20T22:00:00Z')); // EDT
  assert.equal(marketWallClockMs('2026-11-20', 24), at('2026-11-21T05:00:00Z')); // hour 24 = next midnight
  assert.equal(marketWallClockMs('not a date', 1), null);
});

test('customer preview: in_progress always carries the fee, even with no scheduled date', () => {
  const p = customerCancelPreview({
    job: { status: 'in_progress', scheduled_date: null, arrival_start_hour: null },
    payment: HELD,
    terms: TERMS,
    nowMs: at('2026-11-10T20:00:00Z'),
  });
  assert.deepEqual(p, { kind: 'fee', feeCents: 2000, refundCents: 8750, nearBoundary: false });
});

test('customer preview: no scheduled date is free; the whole charge comes back', () => {
  const p = customerCancelPreview({
    job: { status: 'assigned', scheduled_date: null, arrival_start_hour: null },
    payment: HELD,
    terms: TERMS,
    nowMs: at('2026-11-12T00:00:00Z'),
  });
  assert.deepEqual(p, { kind: 'free', refundCents: 10750, nearBoundary: false });
});

test('customer preview: within 15 minutes of acceptance is free, one minute later is not (inside the 24h)', () => {
  const job = { ...SCHEDULED, scheduled_date: '2026-11-10', arrival_start_hour: 23 };
  const within = customerCancelPreview({ job, payment: HELD, terms: TERMS, nowMs: at('2026-11-10T12:15:00Z') });
  assert.equal(within.kind, 'free');
  assert.equal(within.nearBoundary, true);
  const after = customerCancelPreview({ job, payment: HELD, terms: TERMS, nowMs: at('2026-11-10T12:16:00Z') });
  assert.equal(after.kind, 'fee');
  assert.equal(after.feeCents, 2000);
});

test('customer preview: more than 24h before the arrival anchor is free, less is the fee', () => {
  const early = { ...TERMS, accepted_at: '2026-11-10T00:00:00Z' };
  const free = customerCancelPreview({ job: SCHEDULED, payment: HELD, terms: early, nowMs: at('2026-11-19T22:00:00Z') });
  assert.equal(free.kind, 'free');
  const fee = customerCancelPreview({ job: SCHEDULED, payment: HELD, terms: early, nowMs: at('2026-11-19T23:00:00Z') });
  assert.equal(fee.kind, 'fee', 'exactly 24h out is not "more than 24h"');
  assert.deepEqual(fee, { kind: 'fee', feeCents: 2000, refundCents: 8750, nearBoundary: false }); // time only moves forward: a fee never turns free
});

test('customer preview: no charge, or a figure the client cannot know', () => {
  const base = { job: SCHEDULED, terms: TERMS, nowMs: at('2026-11-19T23:30:00Z') };
  assert.deepEqual(customerCancelPreview({ ...base, payment: null }), { kind: 'no_charge' });
  assert.deepEqual(customerCancelPreview({ ...base, payment: { ...HELD, status: 'unfunded' } }), { kind: 'no_charge' });
  assert.equal(customerCancelPreview({ ...base, payment: { ...HELD, status: 'released' } }), null);
  assert.equal(customerCancelPreview({ ...base, payment: HELD, terms: null }), null, 'no agreement snapshot');
  assert.equal(
    customerCancelPreview({ ...base, payment: HELD, terms: { ...TERMS, agreed_price_cents: 9000 } }),
    null,
    'the SQL would read the current fee schedule'
  );
  assert.equal(customerCancelPreview({ ...base, payment: { ...HELD, charge_amount_cents: null } }), null);
});

test('no-show gates: assigned, arrived, scheduled, and past scheduled_date + arrival_end_hour (default 24)', () => {
  const job = { status: 'assigned', arrived_at: '2026-11-20T22:00:00Z', scheduled_date: '2026-11-20', arrival_end_hour: 20 };
  // The window ends 20:00 EST = 2026-11-21T01:00Z.
  assert.equal(noShowReportable({ job, nowMs: at('2026-11-21T00:59:00Z') }), false);
  assert.equal(noShowReportable({ job, nowMs: at('2026-11-21T01:00:00Z') }), false, 'now <= window end is refused');
  assert.equal(noShowReportable({ job, nowMs: at('2026-11-21T01:01:00Z') }), true);
  assert.equal(noShowReportable({ job: { ...job, arrival_end_hour: null }, nowMs: at('2026-11-21T04:59:00Z') }), false);
  assert.equal(noShowReportable({ job: { ...job, arrival_end_hour: null }, nowMs: at('2026-11-21T05:01:00Z') }), true);
  const later = at('2026-11-22T00:00:00Z');
  assert.equal(noShowReportable({ job: { ...job, arrived_at: null }, nowMs: later }), false);
  assert.equal(noShowReportable({ job: { ...job, scheduled_date: null }, nowMs: later }), false);
  assert.equal(noShowReportable({ job: { ...job, status: 'in_progress' }, nowMs: later }), false);
});

test('the customer confirm states the money exactly, and that it cannot be undone', () => {
  const format = (c) => `$${(c / 100).toFixed(2)}`;
  const opts = { workerFirstName: 'Sam', format };
  const free = copy.customerCancelConfirm({ kind: 'free', refundCents: 10750, nearBoundary: false }, opts);
  assert.match(free.message, /Free — you get \$107\.50 back in full\./);
  assert.match(free.message, /can’t be undone/);
  const fee = copy.customerCancelConfirm({ kind: 'fee', feeCents: 2000, refundCents: 8750, nearBoundary: false }, opts);
  assert.match(fee.message, /A \$20\.00 cancellation fee goes to Sam; \$87\.50 comes back to you\./);
  assert.match(fee.message, /can’t be undone/);
  assert.equal(fee.confirmText, 'Cancel job');
  const none = copy.customerCancelConfirm({ kind: 'no_charge' }, opts);
  assert.match(none.message, /no money moves/);
  const unknown = copy.customerCancelConfirm(null, opts);
  assert.match(unknown.message, /may go to Sam/);
  assert.doesNotMatch(unknown.message, /\$\d/, 'no figure when the client cannot know one');
  assert.match(copy.customerCancelConfirm({ kind: 'free', refundCents: 1, nearBoundary: true }, opts).message, /only minutes away/);
});

test('the worker confirms claim only what the SQL does: a full refund, and a no-show that moves no money', () => {
  const cancel = copy.workerCancelConfirm({ customerFirstName: 'Dana', paid: 'held' });
  assert.match(cancel.message, /Dana is refunded in full/);
  assert.doesNotMatch(cancel.message, /reliab|reputation|rating|score/i, 'no code applies a reliability effect');
  assert.match(copy.workerCancelConfirm({ customerFirstName: 'Dana', paid: 'unpaid' }).message, /hasn’t paid yet/);
  const noShow = copy.noShowConfirm({ customerFirstName: 'Dana', paid: 'held' });
  assert.match(noShow.message, /opens a claim and moves no money until Brazos reviews it/);
});

test('cancelJob calls cancel_job with the job id and a reason, and answers in plain words', () => {
  const src = read('lib/jobs.ts');
  assert.match(src, /\.rpc\('cancel_job', \{ p_job_id: jobId, p_reason: reason \}\)/);
  assert.match(src, /type CancelJobReason = 'customer_cancelled' \| 'worker_cancelled' \| 'customer_no_show'/);
  assert.match(src, /message: userMessage\(error, /, 'the raw RPC text never reaches a screen');
});

test('the screens wire the actions through cancelJob with a ref guard, a confirm and no Alert', () => {
  const customer = read('screens/ClientJobDetailScreen.tsx');
  assert.match(customer, /cancelJob\(cancelledJobId, 'customer_cancelled'\)/);
  assert.match(customer, /cancellingRef\.current/);
  assert.match(customer, /customerCancelConfirm\(/);
  const worker = read('screens/WorkerJobScreen.tsx');
  assert.match(worker, /handleExit\('worker_cancelled'\)/);
  assert.match(worker, /handleExit\('customer_no_show'\)/);
  assert.match(worker, /noShowReportable\(\{ job \}\)/);
  assert.match(worker, /exitingRef\.current/);
  for (const text of [customer, worker]) assert.doesNotMatch(text, /Alert\.alert/);
  const del = read('screens/DeleteAccountScreen.tsx');
  assert.match(del, /navigateAcrossTabs\('MyJobs', 'ClientJobDetail'/);
  assert.match(del, /navigateAcrossTabs\('MyJobs', 'WorkerJob'/);
});
