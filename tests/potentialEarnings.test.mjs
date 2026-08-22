import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * A5 guard — Worker Home's POTENTIAL EARNINGS banner must never count the
 * viewer's own posted jobs: you cannot earn from your own job. The exclusion
 * is banner-only — the feed itself deliberately keeps those rows (their card
 * carries Edit), so no card changes. Since Batch F deleted the unmounted
 * atlas-48 browse screen and its authorized inline copy,
 * lib/earningsMath.ts's openJobsPotential() is the ONE implementation of the
 * rule, executed here for real rather than asserted about as text.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
const { openJobsPotential } = await import(
  toDataUrl(stripTypeScriptTypes(await read('lib/earningsMath.ts'), { mode: 'strip' }))
);

const job = (id, clientId, cents) => ({ id, client_id: clientId, budget_cents: cents });

test('POTENTIAL EARNINGS excludes rows where client_id === viewer, and the count matches', () => {
  const feed = [
    job('a', 'me', 5000), // viewer's own posted job — not earnable
    job('b', 'other-1', 12500),
    job('c', 'other-2', null), // budget-less job still counts, adds $0
    job('d', 'me', 999999), // second own job — also excluded
  ];
  const stats = openJobsPotential(feed, 'me');
  assert.equal(stats.cents, 12500, 'own budgets must not inflate the sum');
  assert.equal(stats.count, 2, '"across N jobs" must count the same rows the sum does');

  // A viewer with no posted jobs in the feed sees the full sum.
  const outsider = openJobsPotential(feed, 'someone-else');
  assert.equal(outsider.cents, 5000 + 12500 + 999999);
  assert.equal(outsider.count, 4);
});

test('a still-loading profile falls back to the whole feed, never a crash', () => {
  const feed = [job('a', 'me', 5000), job('b', 'other', 100)];
  // WorkerHomeScreen passes profile?.id, so a still-loading profile arrives
  // here as undefined (and a signed-out edge as null).
  for (const viewerId of [null, undefined]) {
    const stats = openJobsPotential(feed, viewerId);
    assert.equal(stats.cents, 5100);
    assert.equal(stats.count, 2);
  }
  // Empty feed derives zeros, never NaN or undefined.
  assert.deepEqual(openJobsPotential([], 'me'), { cents: 0, count: 0 });
});

test('the worker home derives its figure from the lib, not a private copy', async () => {
  const workerHome = await read('screens/WorkerHomeScreen.tsx');
  assert.match(workerHome, /openJobsPotential\(/);
  assert.doesNotMatch(
    workerHome,
    /client_id === profile\.id/,
    'WorkerHomeScreen must not carry its own inline copy of the exclusion'
  );
});
