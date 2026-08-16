import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Stage 4A - payments availability is DECLARED, never inferred from the build.
 *
 * The bug: resolvePaymentsMode refused 'sandbox' whenever __DEV__ was false,
 * so checkout, release, tip and cash-out existed only on a dev-client build.
 * A release/TestFlight binary - the one the beta actually runs on - had no
 * payments loop at all.
 *
 * The resolver is pure, so the table below is EXECUTED against the real
 * function (the tests/sandboxCheckout.test.mjs mechanism: dynamic import of
 * the .ts module, no transpiler and no dev dependency), not pattern-matched
 * as prose. Two static guards ride along to keep the allow-list from being
 * widened toward a real provider.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const modeUrl = pathToFileURL(join(root, 'lib/adapters/paymentsMode.ts')).href;
const { resolvePaymentsMode } = await import(modeUrl);

/** The mode alone, for the table. */
const mode = (configured, dev) => resolvePaymentsMode({ configured, dev }).mode;

// ---------------------------------------------------------------------------
// The resolution table
// ---------------------------------------------------------------------------

test('a declared sandbox mode is honoured on EVERY build type', () => {
  assert.equal(mode('sandbox', true), 'sandbox');
  // The fix. This was 'disabled' before Stage 4A, which is what killed
  // payments on TestFlight.
  assert.equal(mode('sandbox', false), 'sandbox');
  assert.equal(
    resolvePaymentsMode({ configured: 'sandbox', dev: false }).configError,
    null,
    'declaring sandbox is a supported configuration, not an error to report'
  );
});

test('a declared disabled mode is honoured on every build type', () => {
  assert.equal(mode('disabled', true), 'disabled');
  assert.equal(mode('disabled', false), 'disabled');
  assert.equal(
    resolvePaymentsMode({ configured: 'disabled', dev: true }).configError,
    null
  );
});

test('an unset value reproduces the previous __DEV__ default exactly', () => {
  // This row is why shipping this change is not itself a behaviour change:
  // a build that declares nothing resolves exactly as it did before.
  for (const unset of [undefined, null, '', ' ', '   ', '\t', '\n', ' \t\n ']) {
    const shown = JSON.stringify(unset);
    assert.equal(mode(unset, true), 'sandbox', `${shown} in dev must be sandbox`);
    assert.equal(mode(unset, false), 'disabled', `${shown} in release must be disabled`);
    assert.equal(
      resolvePaymentsMode({ configured: unset, dev: false }).configError,
      null,
      `${shown} is the normal unconfigured case, not a misconfiguration`
    );
  }
});

test('the declared value is trimmed and case-folded before matching', () => {
  for (const value of ['  sandbox', 'sandbox  ', ' sandbox ', '\tsandbox\n', 'SANDBOX', 'SandBox', '  SANDBOX  ']) {
    assert.equal(mode(value, false), 'sandbox', `${JSON.stringify(value)} must read as sandbox`);
  }
  for (const value of ['  disabled', 'disabled  ', 'DISABLED', 'Disabled', ' \tDisAbLeD\n ']) {
    assert.equal(mode(value, true), 'disabled', `${JSON.stringify(value)} must read as disabled`);
  }
});

test('an unrecognised value fails CLOSED - in dev as well as in a release', () => {
  // An allow-list, not a block-list. Before Stage 4A an unknown value fell
  // back to the build default, so a typo silently enabled sandbox money in
  // dev; now anything unrecognised turns payments off and says why.
  const unrecognised = [
    'stripe',
    'sandbox2',
    'sand box',
    'sandbox,disabled',
    'true',
    '1',
    'on',
    'yes',
    'enabled',
    'off',
    'null',
    'undefined',
  ];
  for (const value of unrecognised) {
    for (const dev of [true, false]) {
      assert.equal(
        mode(value, dev),
        'disabled',
        `${JSON.stringify(value)} must not enable money (dev=${dev})`
      );
    }
    assert.ok(
      resolvePaymentsMode({ configured: value, dev: true }).configError,
      `${JSON.stringify(value)} must surface why payments are off`
    );
  }
});

test("'live', 'real' and 'production' are not modes and can never enable money", () => {
  // Named explicitly because these are the three values someone reaching for
  // a real provider would try first.
  for (const forbidden of ['live', 'real', 'production', 'LIVE', 'Real', ' Production ']) {
    for (const dev of [true, false]) {
      assert.equal(
        mode(forbidden, dev),
        'disabled',
        `${JSON.stringify(forbidden)} must resolve to disabled (dev=${dev})`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Static guards: the allow-list must not grow toward a real provider
// ---------------------------------------------------------------------------

test('the resolver admits exactly two modes and has no real-provider branch', async () => {
  const source = await read('lib/adapters/paymentsMode.ts');
  assert.match(source, /export type PaymentsMode = 'sandbox' \| 'disabled';/);

  const code = stripComments(source);
  for (const forbidden of ['live', 'real', 'production']) {
    assert.doesNotMatch(
      code,
      new RegExp(`===\\s*['"]${forbidden}['"]`),
      `paymentsMode.ts must not branch on '${forbidden}'`
    );
  }
});

test('the adapter declares availability from the env var, using dev only as the default', async () => {
  const adapter = await read('lib/adapters/payments.ts');
  assert.match(adapter, /configured: process\.env\.EXPO_PUBLIC_PAYMENTS_MODE/);
  assert.match(adapter, /dev: __DEV__/);
});

test('no payment surface gates itself on the build type', async () => {
  // The whole loop - fund, approve/release, tip, earnings, methods - asks the
  // adapter for the mode. A __DEV__ test on any of these would re-create the
  // defect in a second place.
  for (const file of [
    'screens/CheckoutScreen.tsx',
    'screens/ApproveOrDisputeScreen.tsx',
    'screens/ReviewAndTipScreen.tsx',
    'screens/EarningsScreen.tsx',
    'screens/PaymentMethodsScreen.tsx',
  ]) {
    const source = stripComments(await read(file));
    assert.doesNotMatch(source, /__DEV__/, `${file} must gate on paymentsMode, not __DEV__`);
  }
});

test('the simulated-money label is not itself gated on the build type', async () => {
  // Un-gated payments with no visible sandbox label is an App Review problem
  // and misleads testers, so the label has to survive onto a release build.
  const checkout = stripComments(await read('screens/CheckoutScreen.tsx'));
  assert.match(checkout, /SANDBOX/, 'checkout must carry a simulated-money label');
  assert.match(checkout, /No real money is charged/);
  assert.doesNotMatch(
    checkout,
    /__DEV__[\s\S]{0,200}SANDBOX/,
    'the sandbox label must not be behind a build-type condition'
  );
});
