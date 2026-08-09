import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 5 guards — money honesty (§H.3) and the sandbox boundary.
 *
 * What must stay true:
 *   1. No real payment provider exists anywhere: no provider SDK dependency,
 *      no provider import, and the only provider the adapter knows is the
 *      sandbox one whose two calls are the phase50 RPCs.
 *   2. A release binary can never run sandbox money — executed against the
 *      real resolver, not asserted as prose.
 *   3. Screens reach money only through the adapter; nothing in the app
 *      writes the payments table directly.
 *   4. The checkout says SANDBOX on screen, confirms before funding, and is
 *      double-tap safe; Job Confirmed renders its celebration only when the
 *      ledger genuinely reads held.
 *   5. Nothing in Phase 5 can claim released/paid money: the captions live
 *      only in MoneyText/StatusPill's fixed §H.3 maps, and no client code
 *      calls anything that could move a payment past held.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const modeUrl = pathToFileURL(join(root, 'lib/adapters/paymentsMode.ts')).href;
const { resolvePaymentsMode } = await import(modeUrl);

test('a release binary can never run sandbox money', () => {
  const release = resolvePaymentsMode({ configured: 'sandbox', dev: false });
  assert.equal(release.mode, 'disabled');
  assert.ok(release.configError, 'refusing sandbox-in-release must surface a config error');

  // Defaults: sandbox only where __DEV__ is true; disabled everywhere else.
  assert.equal(resolvePaymentsMode({ configured: undefined, dev: true }).mode, 'sandbox');
  assert.equal(resolvePaymentsMode({ configured: undefined, dev: false }).mode, 'disabled');
  assert.equal(resolvePaymentsMode({ configured: '', dev: false }).mode, 'disabled');
  assert.equal(resolvePaymentsMode({ configured: 'disabled', dev: true }).mode, 'disabled');
  // Garbage falls back safely and says so.
  const garbage = resolvePaymentsMode({ configured: 'stripe', dev: true });
  assert.equal(garbage.mode, 'sandbox');
  assert.ok(garbage.configError);
});

test('no real payment provider exists at any layer', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const banned of ['stripe', 'braintree', 'paypal', 'adyen', 'square']) {
    assert.ok(
      !deps.some((d) => d.toLowerCase().includes(banned)),
      `no ${banned} dependency may exist in Phase 5`
    );
  }

  const [adapter, payments, checkout] = await Promise.all([
    read('lib/adapters/payments.ts'),
    read('lib/payments.ts'),
    read('screens/CheckoutScreen.tsx'),
  ]);
  const moneyCode = adapter + payments + checkout;
  assert.doesNotMatch(moneyCode, /from ['"]stripe|require\(['"]stripe/i);
  // The adapter's functional provider is the sandbox pair, and nothing else.
  assert.match(adapter, /sandbox_authorize_job_payment/);
  assert.match(adapter, /sandbox_hold_job_payment/);
});

test('money moves only through the adapter, and no client writes the ledger', async () => {
  const checkout = await read('screens/CheckoutScreen.tsx');
  assert.match(checkout, /paymentProvider\.authorizeJobPayment/);
  assert.match(checkout, /paymentProvider\.protectJobPayment/);
  // The screen holds no RPC strings and no table access of its own.
  assert.doesNotMatch(checkout, /\.rpc\(/);
  assert.doesNotMatch(checkout, /\.from\(/);

  // lib/payments reads the ledger; nothing anywhere inserts/updates it.
  const payments = await read('lib/payments.ts');
  assert.match(payments, /\.from\('payments'\)\s*\.select\(/s);
  for (const file of [
    'lib/payments.ts',
    'lib/adapters/payments.ts',
    'screens/CheckoutScreen.tsx',
    'screens/JobConfirmedScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/WorkerJobScreen.tsx',
  ]) {
    const source = await read(file);
    assert.doesNotMatch(
      source,
      /from\('payments'\)\s*\.\s*(insert|update|upsert|delete)/s,
      `${file} must not write the payments table directly`
    );
  }
});

test('the checkout is visibly sandbox, confirmed before funding, and double-tap safe', async () => {
  const checkout = await read('screens/CheckoutScreen.tsx');

  // The on-screen label, not just a code comment (06_DEFERRED rule).
  assert.match(checkout, /SANDBOX — development build\. No real money/);
  // The §H.3 explanation rows: authorize, hold, release-later.
  assert.match(checkout, /Nothing is charged/);
  assert.match(checkout, /funds can never leave protection/);
  // Confirmation with the exact consequence, then the guarded funding call.
  assert.match(checkout, /This authorizes the sandbox amount and places it in protected\/held state/);
  assert.match(checkout, /No real money is being charged in this development build/);
  assert.match(checkout, /fundingRef\.current\) return/);
  // Failure copy keeps the accepted offer explicitly intact.
  assert.match(checkout, /Your accepted offer is unchanged/);
});

test('Job Confirmed renders only over a genuinely held payment', async () => {
  const confirmed = await read('screens/JobConfirmedScreen.tsx');
  assert.match(confirmed, /isHeld\(payment\)/);
  // Anything short of held gets the truthful fallback, not the celebration.
  assert.match(confirmed, /Not confirmed yet/);
  assert.match(confirmed, /nothing has been released/i);
});

test('nothing in Phase 5 can label money released or paid', async () => {
  // The only sources of payment captions are the fixed maps.
  const moneyText = await read('ui/primitives/MoneyText.tsx');
  assert.match(moneyText, /"Paid" never appears before/);
  assert.doesNotMatch(moneyText, /caption[?]?:\s*string/);

  // No Phase-5 surface hand-writes a released/paid claim.
  for (const file of [
    'screens/CheckoutScreen.tsx',
    'screens/JobConfirmedScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/WorkerJobScreen.tsx',
  ]) {
    const source = await read(file);
    assert.doesNotMatch(
      source,
      /['">]\s*(?:Released to worker|Paid out|Payment released)\b/,
      `${file} must not hand-write a released/paid caption`
    );
  }

  // And no client code can reach past held: the only payment RPCs anywhere
  // are the two sandbox calls. A release/payout RPC CALL appearing in lib/
  // or screens/ means someone built Phase 6's money path early — fail loudly.
  for (const file of [
    'lib/payments.ts',
    'lib/adapters/payments.ts',
    'screens/CheckoutScreen.tsx',
    'screens/JobConfirmedScreen.tsx',
  ]) {
    const source = await read(file);
    assert.doesNotMatch(
      source,
      /\.rpc\(['"][^'"]*(release|payout|cash_out|capture)/i,
      `${file} must not call a release/payout path`
    );
  }
});
