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

test('phase55 keeps the sandbox posture', async () => {
  const sql = await read('supabase/archive/phases/phase55_sandbox_cash_out.sql');
  assert.match(sql, /payee_id = v_actor/);
  assert.match(sql, /status = 'released'/);
  assert.match(sql, /grant execute on function public\.sandbox_cash_out\(\) to authenticated/);
  assert.match(sql, /revoke all on function public\.sandbox_cash_out\(\) from public, anon/);
  // It must never touch held money.
  assert.ok(!/'held'/.test(sql), 'cash-out must not reference held rows');
});
