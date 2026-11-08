import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Lean D4 — payments are 'stripe' | 'disabled', and they fail CLOSED.
 *
 * The card path runs only when the build declares EXPO_PUBLIC_PAYMENTS_MODE
 * 'stripe' AND carries the publishable key; anything else is disabled, and
 * the disabled provider refuses every money call. The sandbox practice-money
 * path, PostHog and i18n are gone, and stay gone.
 *
 * Static scans of source text (the adapter imports config/env and the
 * Supabase client, which bare Node ESM cannot load), comments stripped where
 * the claim is about code.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

function filesUnder(rel) {
  const out = [];
  for (const name of readdirSync(join(root, rel))) {
    const path = `${rel}/${name}`;
    if (statSync(join(root, path)).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

test('the env var admits only stripe or disabled, and defaults to disabled', () => {
  const env = flatten(read('config/env.ts'));
  assert.match(
    env,
    /EXPO_PUBLIC_PAYMENTS_MODE: z\.preprocess\(normalized, z\.enum\(\['stripe', 'disabled'\]\)\.default\('disabled'\)\)/
  );
  assert.doesNotMatch(env, /POSTHOG/);
});

test('the mode is stripe only with the declared mode AND the publishable key; otherwise disabled', () => {
  const adapter = flatten(read('lib/adapters/payments.ts'));
  assert.match(adapter, /export type PaymentsMode = 'stripe' \| 'disabled';/);
  assert.match(
    adapter,
    /export const paymentsMode: PaymentsMode = env\.EXPO_PUBLIC_PAYMENTS_MODE === 'stripe' && stripePublishableKey\(\) !== null \? 'stripe' : 'disabled';/
  );
  assert.match(
    adapter,
    /export const paymentProvider: PaymentProvider = paymentsMode === 'stripe' \? createStripePaymentProvider\(\) : createDisabledPaymentProvider\(DISABLED_MESSAGE\);/
  );
  // The refusal never claims money moved.
  const message = adapter.match(/const DISABLED_MESSAGE = '([^']+)';/);
  assert.ok(message, 'DISABLED_MESSAGE must be a literal sentence');
  assert.equal(message[1], 'Payments aren’t available right now. Nothing was charged or held.');
});

test('the disabled provider refuses every method the interface declares', () => {
  const adapter = stripComments(read('lib/adapters/payments.ts'));
  const iface = adapter.slice(adapter.indexOf('export type PaymentProvider = {'), adapter.indexOf('};', adapter.indexOf('export type PaymentProvider = {')));
  const methods = [...iface.matchAll(/^\s*(\w+)\(/gm)].map((m) => m[1]).filter((name) => name !== 'getMode');
  assert.deepEqual(methods.sort(), ['beginJobCheckout', 'beginTipCheckout', 'releaseJobPayment']);

  const start = adapter.indexOf('function createDisabledPaymentProvider');
  const disabled = adapter.slice(start, adapter.indexOf('\n}', start));
  assert.ok(start > 0, 'the disabled provider exists');
  assert.match(disabled, /getMode: \(\) => 'disabled'/);
  for (const name of methods) {
    assert.ok(
      new RegExp(`${name}: (refuse|async \\(\\) => \\(\\{ data: null, error: \\{ message \\} \\}\\))`).test(disabled),
      `the disabled provider must refuse ${name}`
    );
  }
  // Nothing in it can reach money.
  assert.doesNotMatch(disabled, /rpc\(|createPaymentSession|functions\.invoke/);
});

test('in disabled mode the money screens show the unavailable state and offer no money action', () => {
  const checkout = stripComments(read('screens/CheckoutScreen.tsx'));
  assert.match(checkout, /paymentsMode === 'disabled'\s*\?\s*\{\s*kind: 'permissionDenied',\s*title: 'Payments aren’t available right now'/);
  assert.match(checkout, /\) : !paymentsEnabled \? undefined : !stripe \? undefined : /);

  const review = stripComments(read('screens/ReviewAndTipScreen.tsx'));
  assert.match(review, /paymentsMode === 'disabled' \? \(\s*<Text style=\{styles\.cardNote\}>\s*Payments aren’t available right now, so tipping is unavailable\./);

  const payouts = stripComments(read('screens/PayoutsScreen.tsx'));
  assert.match(payouts, /: !stripe\s*\?\s*\{\s*kind: 'permissionDenied',[\s\S]{0,120}body: PAYOUTS_DISABLED_BODY,/);

  const earnings = stripComments(read('screens/EarningsScreen.tsx'));
  assert.doesNotMatch(earnings, /cashOut|Cash out/);
});

test('no sandbox string in the adapter, the env config or any screen', () => {
  const files = ['lib/adapters/payments.ts', 'config/env.ts', ...filesUnder('screens')];
  assert.ok(files.length > 30, 'the scan found the screens');
  for (const file of files) {
    assert.doesNotMatch(read(file), /sandbox/i, `${file} still names the sandbox`);
  }
});

test('PostHog and i18n are gone: no module, no package, no plugin, no script', () => {
  assert.ok(!existsSync(join(root, 'lib/observability/analytics.ts')), 'the analytics module is deleted');
  assert.ok(!existsSync(join(root, 'lib/adapters/paymentsMode.ts')), 'the three-way resolver is deleted');
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ['posthog-react-native', 'i18next', 'react-i18next', 'expo-localization', 'i18next-parser']) {
    assert.ok(!(name in deps), `${name} is still a dependency`);
  }
  assert.ok(!('i18n:extract' in (pkg.scripts ?? {})), 'the i18n:extract script is gone');
  assert.doesNotMatch(stripComments(read('app.config.ts')), /expo-localization/);
});
