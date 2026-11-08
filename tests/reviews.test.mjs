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
 *      revoke), and it states the full rule (party of a COMPLETED job, the
 *      OTHER party as reviewee).
 *   2. The reliability signal is counted, never estimated, and cancelled
 *      renders only when non-zero — no scary "0 cancelled" on every poster.
 *   3. §9 ordering is untouched: the customer review still sits behind the
 *      approve gate (ReviewAndTip), and the tip stays a ledger row.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

test('phase54 states the full review rule as defense in depth', async () => {
  // phase54's INSERT policy was inert (no grant lets authenticated insert) and
  // went in lean D6; create_review() (R8a's, the newest) states the rule.
  const sql = await read('supabase/migrations/20260925000100_r8a_reputation.sql');
  const start = sql.indexOf('create function public.create_review(');
  assert.ok(start > 0, 'R8a must define create_review()');
  const createReview = sql.slice(start, sql.indexOf('\n$$;', start));
  assert.match(createReview, /if not found or v_job\.status <> 'completed' then/);
  assert.match(createReview, /\(v_job\.client_id = v_user and p_reviewee_id = v_job\.assigned_worker_id\)/);
  assert.match(createReview, /or \(v_job\.assigned_worker_id = v_user and p_reviewee_id = v_job\.client_id\)/);
  // It must NOT re-grant direct INSERT — the phase29 revoke is the door.
  const baseline = await read('supabase/migrations/20260901000000_baseline.sql');
  const tableGrant = baseline.match(/^GRANT ([A-Z,]+) ON TABLE "public"\."reviews" TO "authenticated";$/m)?.[1];
  assert.ok(tableGrant, 'the reviews grant must be findable');
  assert.ok(!tableGrant.split(',').includes('INSERT'), 'no INSERT grant');
  assert.ok(!/grant insert on public\.reviews/i.test(sql), 'no INSERT re-grant');
});

test('the reliability signal is counted and honest', async () => {
  const jobs = await read('lib/jobs.ts');
  const statsBlock = jobs.slice(jobs.indexOf('fetchClientJobStats'));
  assert.match(statsBlock, /eq\('status', 'cancelled'\)/);
  assert.match(statsBlock, /count: 'exact'/);

  const detail = await read('screens/JobDetailScreen.tsx');
  assert.match(detail, /posterStats\.cancelled > 0/, 'cancelled renders only when non-zero');
});

test('review ordering stays as Phase 6 left it', async () => {
  const reviewAndTip = await read('screens/ReviewAndTipScreen.tsx');
  assert.match(reviewAndTip, /payment && !released/);
});
