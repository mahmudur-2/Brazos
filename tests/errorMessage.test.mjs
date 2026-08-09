import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Ship-blocker guard — raw database text must never reach a user.
 *
 * The hardening run made failures visible instead of silently rendering
 * empty states, which surfaced PostgREST/Postgres strings on four device
 * screens ("column jobs.en_route_at does not exist"). Everything
 * user-visible now routes through lib/errorMessage.userMessage().
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

globalThis.__DEV__ = false; // production behaviour is what must be guarded
const { userMessage } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);

test('the four device errors never reach a user verbatim', () => {
  const observed = [
    { message: 'column jobs.en_route_at does not exist', code: '42703' },
    { message: 'column profiles_1.accepting_work does not exist', code: '42703' },
    { message: "Could not find the table 'public.worker_services' in the schema cache", code: 'PGRST205' },
    { message: 'column payments.released_at does not exist', code: '42703' },
  ];
  for (const error of observed) {
    const shown = userMessage(error);
    assert.ok(!shown.includes(error.message), `raw text leaked: ${shown}`);
    assert.ok(!/column|schema cache|public\./i.test(shown), `db vocabulary leaked: ${shown}`);
    assert.match(shown, /app update/i, 'version skew should tell the user to update');
  }
});

test('classification covers the states a user can act on', () => {
  assert.match(userMessage({ message: 'Network request failed' }), /connection/i);
  assert.match(userMessage({ message: 'permission denied for table payments', code: '42501' }), /access/i);
  assert.match(userMessage({ code: 'PGRST116', message: 'not found' }), /available/i);
  assert.match(userMessage({ code: '23505', message: 'duplicate key value' }), /already/i);
  // Our own RPC sentences ARE for users — they pass through.
  assert.equal(
    userMessage({ message: 'Funds release only after the job is completed' }),
    'Funds release only after the job is completed'
  );
  // …but engine text that merely lacks a code still does not.
  const leak = userMessage({ message: 'null value in column "amount_cents" violates not-null constraint' });
  assert.ok(!leak.includes('amount_cents'), leak);
  // A caller's fallback wins over the generic default.
  assert.equal(userMessage(null, 'Nothing was charged.'), 'Nothing was charged.');
});

test('every user-visible error surface in the lifecycle screens is routed', async () => {
  const SCREENS = [
    'ChatScreen', 'ClientJobDetailScreen', 'ServicesPricingScreen', 'EarningsScreen',
    'WorkerJobScreen', 'ReviewAndTipScreen', 'WorkChecklistScreen', 'SavedWorkersScreen',
    'NotificationsScreen', 'MessagesInboxScreen', 'JobDetailScreen',
    'ApproveOrDisputeScreen', 'CheckoutScreen', 'BidDetailScreen',
  ];
  for (const name of SCREENS) {
    const src = await read(`screens/${name}.tsx`);
    const offenders = src
      .split('\n')
      .filter((l) => /[Ee]rror\??\.message/.test(l) && !l.includes('console.'));
    assert.deepEqual(
      offenders,
      [],
      `${name} still shows raw error text:\n${offenders.join('\n')}`
    );
  }
});
