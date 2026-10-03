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

test('payments availability is declared, never inferred from the build type', () => {
  // Stage 4A (2026-08-15) rewrote this assertion. It previously required that
  // a release binary could NEVER run sandbox money. That rule left checkout,
  // release, tip and cash-out dead on TestFlight - the build the beta is
  // exercised on - so availability now comes from EXPO_PUBLIC_PAYMENTS_MODE
  // and the build type is only the default. What did NOT change: sandbox is
  // still the only functional provider, and it is still labelled on screen.
  const release = resolvePaymentsMode({ configured: 'sandbox', dev: false });
  assert.equal(release.mode, 'sandbox');
  assert.equal(release.configError, null);

  // Defaults are untouched: a build that declares nothing behaves as before.
  assert.equal(resolvePaymentsMode({ configured: undefined, dev: true }).mode, 'sandbox');
  assert.equal(resolvePaymentsMode({ configured: undefined, dev: false }).mode, 'disabled');
  assert.equal(resolvePaymentsMode({ configured: '', dev: false }).mode, 'disabled');
  assert.equal(resolvePaymentsMode({ configured: 'disabled', dev: true }).mode, 'disabled');
  // Garbage now fails CLOSED rather than falling back to the build default:
  // an allow-list, not a block-list. Full table in tests/paymentsMode.test.mjs.
  // ('stripe' itself became the third mode in R6a — tests/stripePayments.test.mjs.)
  const garbage = resolvePaymentsMode({ configured: 'sandbox2', dev: true });
  assert.equal(garbage.mode, 'disabled');
  assert.ok(garbage.configError);
});

test('no real payment provider exists at any layer', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  // THE ONE PERMITTED EXCEPTION, and it is named as an exact literal so the
  // hole can never widen by accident. @stripe/stripe-react-native is the
  // native CLIENT SDK: it tokenizes a card against a PUBLISHABLE key and can
  // move no money by itself. It is not a provider here either — the resolver
  // above still treats the string 'stripe' as garbage and fails closed, so
  // the sandbox pair remains the only functional provider in the app.
  const ALLOWED_PROVIDER_SDK = '@stripe/stripe-react-native';

  // THE BARE SERVER SDK IS BANNED BY EXACT NAME, PERMANENTLY. `stripe` is the
  // secret-key package, and a secret key inside a mobile bundle is the whole
  // reason this fence exists. It gets its own assertion rather than relying on
  // the substring sweep below, so narrowing that sweep can never quietly
  // re-admit it.
  assert.ok(
    !deps.includes('stripe'),
    'the bare `stripe` server SDK may never be a dependency'
  );

  for (const banned of ['stripe', 'braintree', 'paypal', 'adyen', 'square']) {
    assert.ok(
      !deps.some((d) => d !== ALLOWED_PROVIDER_SDK && d.toLowerCase().includes(banned)),
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
  // Stage 4A-tail: the label states the MONEY fact, not the build fact —
  // sandbox payments now run on a release binary, so "development build" was
  // false on TestFlight. It is also gated on the resolved mode, not __DEV__.
  assert.match(checkout, /TEST MODE — no real money moves\. No real money is charged/);
  assert.doesNotMatch(checkout, /(SANDBOX|TEST MODE) — development build/);
  assert.match(
    checkout,
    /paymentsMode === 'sandbox'[\s\S]{0,400}styles\.sandboxBanner/,
    'the sandbox banner must render iff the resolved payments mode is sandbox'
  );
  // The §H.3 explanation rows: authorize, hold, and (since Phase 6) the
  // honest release story — approval or the 72h clock, frozen by a report.
  assert.match(checkout, /Nothing is charged/);
  assert.match(checkout, /happens only after you approve the completed work/);
  assert.match(checkout, /automatically 72 hours/);
  // Confirmation with the exact consequence, then the guarded funding call.
  assert.match(checkout, /This authorizes the amount and holds it in protection/);
  // Same correction as the banner: the consequence copy names sandbox, not the
  // build type, because the build type no longer decides whether money runs.
  assert.match(checkout, /Test mode — no real money is charged/);
  assert.doesNotMatch(checkout, /in this development build/);
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

test('money can only be labelled released where the ledger truthfully is', async () => {
  // Phase 6 note (2026-08-09, itemised in DECISIONS.md): this guard's Phase-5
  // form asserted release could not exist AT ALL — that was Phase 5's
  // deliberately narrow world. Phase 6 built the release path, so the guard
  // now protects what is permanent about §H.3: released wording appears only
  // on surfaces that gate on the ledger's real released state, and the
  // pre-release surfaces still cannot claim it at all.

  // The only sources of payment captions are the fixed maps.
  const moneyText = await read('ui/primitives/MoneyText.tsx');
  assert.match(moneyText, /"Paid" never appears before/);
  assert.doesNotMatch(moneyText, /caption[?]?:\s*string/);
  // A6 (2026-10-03): ONE state map — MoneyText reads StatusPill's byte-frozen PAYMENT_LABELS and
  // keeps no copy; the viewer override is a second FIXED map, settled states only, keyed by the
  // mode from ModeContext and never by a prop. Under the customer's charge the settled caption is
  // "Paid"; under the worker's take, "You received". Nothing unsettled may be overridden.
  assert.match(moneyText, /import \{ PAYMENT_LABELS, type PaymentStatus \} from '\.\/StatusPill';/);
  assert.doesNotMatch(moneyText, /const CAPTIONS/, 'no second state-caption map');
  const viewerMap = moneyText.slice(moneyText.indexOf('const VIEWER_CAPTIONS'), moneyText.indexOf('};', moneyText.indexOf('const VIEWER_CAPTIONS')));
  assert.match(viewerMap, /customer: \{ released: 'Paid', paid_out: 'Paid' \},/);
  assert.match(viewerMap, /worker: \{ released: 'You received' \},/);
  assert.doesNotMatch(viewerMap, /unfunded|authorized|held|failed|voided|refunded/, 'only settled states take a viewer caption');
  assert.match(moneyText, /const perspective = useModePerspective\(\);/);
  assert.match(moneyText, /const caption = state \? VIEWER_CAPTIONS\[perspective\]\[state\] \?\? PAYMENT_LABELS\[state\] : null;/);
  assert.doesNotMatch(moneyText, /viewer\??:|perspective\??:/, 'the viewer is never a prop');

  // The pre-release surfaces (checkout, the held celebration) still cannot
  // hand-write a released/paid claim — nothing is released there, ever.
  for (const file of ['screens/CheckoutScreen.tsx', 'screens/JobConfirmedScreen.tsx']) {
    const source = await read(file);
    assert.doesNotMatch(
      source,
      /['">]\s*(?:Released to worker|Paid out|Payment released)\b/,
      `${file} must not hand-write a released/paid caption`
    );
  }

  // The lifecycle surfaces may say released — but only behind isReleased()
  // over the ledger row, and they must read it through the clock-running
  // job_payment_state() so the label can never outrun the database.
  for (const file of [
    'screens/ClientJobDetailScreen.tsx',
    'screens/WorkerJobScreen.tsx',
  ]) {
    const source = await read(file);
    assert.match(source, /isReleased\(/, `${file} must gate released copy on the ledger`);
    assert.match(source, /fetchJobPaymentState\(/, `${file} must read through job_payment_state`);
  }

  // The pre-release surfaces still cannot CALL a release/payout path — the
  // adapter (covered by tests/lifecycle.test.mjs) is the only door.
  for (const file of [
    'lib/payments.ts',
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
