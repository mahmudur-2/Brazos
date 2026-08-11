import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 10 guards — reviews & reputation.
 *
 * What must stay true:
 *   1. create_review() stays the only reachable write path (phase29's
 *      revoke), and phase54's defense-in-depth policy states the full rule
 *      (party of a COMPLETED job, the OTHER party as reviewee).
 *   2. The reliability signal is counted, never estimated, and cancelled
 *      renders only when non-zero — no scary "0 cancelled" on every poster.
 *   3. §9 ordering is untouched: the customer review still sits behind the
 *      approve gate (ReviewAndTip), and the tip stays a ledger row.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

test('phase54 states the full review rule as defense in depth', async () => {
  const sql = await read('supabase/phase54_review_integrity.sql');
  assert.match(sql, /j\.status = 'completed'/);
  assert.match(sql, /j\.client_id = auth\.uid\(\) and j\.assigned_worker_id = reviewee_id/);
  assert.match(sql, /j\.assigned_worker_id = auth\.uid\(\) and j\.client_id = reviewee_id/);
  // It must NOT re-grant direct INSERT — the phase29 revoke is the door.
  assert.ok(!/grant insert on public\.reviews/.test(sql), 'no INSERT re-grant');
  assert.match(sql, /grant execute on function public\.review_integrity_enabled\(\) to authenticated/);
});

test('the reliability signal is counted and honest', async () => {
  const jobs = await read('lib/jobs.ts');
  const statsBlock = jobs.slice(jobs.indexOf('fetchClientJobStats'));
  assert.match(statsBlock, /eq\('status', 'cancelled'\)/);
  assert.match(statsBlock, /count: 'exact'/);

  const detail = await read('screens/JobDetailScreen.tsx');
  assert.match(detail, /posterStats\.cancelled > 0/, 'cancelled renders only when non-zero');
});

test('review ordering and the tip ledger stay as Phase 6 left them', async () => {
  const reviewAndTip = await read('screens/ReviewAndTipScreen.tsx');
  assert.match(reviewAndTip, /payment && !released/);
  const adapter = await read('lib/adapters/payments.ts');
  assert.match(adapter, /sandbox_tip_worker/);
});
