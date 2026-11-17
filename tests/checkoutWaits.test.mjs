import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * T2 (A4-M1) — checkout never waits without end. Two causes, both executed:
 *   1. on web, alertAsync never resolved (react-native-web's Alert.alert does
 *      nothing), so CheckoutScreen's `finally` never ran;
 *   2. on a phone, the native initPaymentSheet had no bound.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let loads = 0;
async function load(rel, stubs) {
  const key = `__checkoutWaits${++loads}`;
  globalThis[key] = stubs;
  const js = stripTypeScriptTypes(read(rel), { mode: 'strip' }).replace(
    /^import\s+\{([^}]*)\}\s+from\s+'([^']+)';?$/gm,
    (_, names, from) => {
      if (!(from in stubs)) throw new Error(`${rel}: no stub for ${from}`);
      return `const {${names.replace(/\s+as\s+/g, ': ')}} = globalThis.${key}[${JSON.stringify(from)}];`;
    }
  );
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));
}

const settles = (promise, ms = 50) =>
  Promise.race([promise.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);

test('T2: on web an awaited alert resolves (the browser alert), so the caller’s finally runs', async () => {
  const native = [];
  const shown = [];
  const dialog = await load('lib/dialog.ts', {
    'react-native': { Alert: { alert: (...a) => native.push(a) }, Platform: { OS: 'web' } },
    './modalPresence': { openModalCount: () => 0 },
  });
  const original = globalThis.alert;
  globalThis.alert = (text) => shown.push(text);
  try {
    assert.equal(await settles(dialog.alertAsync('Payment failed', 'Try again.')), true, 'the alert must end');
    assert.deepEqual(shown, ['Payment failed\n\nTry again.']);
    assert.equal(native.length, 0, 'react-native-web’s Alert draws nothing; it is not used there');
  } finally {
    globalThis.alert = original;
  }
});

test('T2: on a phone the alert still waits for its OK', async () => {
  const native = [];
  const dialog = await load('lib/dialog.ts', {
    'react-native': { Alert: { alert: (...a) => native.push(a) }, Platform: { OS: 'ios' } },
    './modalPresence': { openModalCount: () => 0 },
  });
  const pending = dialog.alertAsync('Payment failed');
  assert.equal(await settles(pending), false, 'no answer before the OK');
  native[0][2][0].onPress();
  assert.equal(await settles(pending), true);
});

async function loadStripe(vendor) {
  const originalRequire = globalThis.require;
  globalThis.require = (name) => {
    assert.equal(name, '@stripe/stripe-react-native');
    return vendor;
  };
  try {
    return await load('lib/payments/stripe.ts', {
      '../../config/env': { env: { EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'publishable-for-the-test' } },
      '../errorMessage': { userMessage: (m) => (typeof m === 'string' ? m : m?.message ?? '') },
      '../payments': { validatePayoutsOnboardingResponse: () => null, validatePayoutsStatusResponse: () => null },
      '../supabase': { supabase: null },
      './stripeRules': {
        classifySheetError: (e) => ({ outcome: e.code === 'Canceled' ? 'dismissed' : 'failed', message: e.message }),
        extractInvokeError: () => null,
        validateCheckoutResponse: () => null,
      },
    });
  } finally {
    globalThis.require = originalRequire;
  }
}
const SESSION = { customerId: 'cus', ephemeralKeySecret: 'ek', clientSecret: 'cs' };
const flush = () => new Promise((r) => setImmediate(r));

test('T2: a card sheet that never gets ready gives up at 20 s with the honest sentence, and nothing is presented', async (t) => {
  let presented = 0;
  const stripe = await loadStripe({
    initStripe: async () => {},
    initPaymentSheet: () => new Promise(() => {}), // never answers
    presentPaymentSheet: async () => ((presented += 1), {}),
  });
  assert.equal(stripe.SHEET_INIT_TIMEOUT_MS, 20_000);
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  let outcome = null;
  stripe.presentCheckoutSheet(SESSION).then((o) => (outcome = o));
  await flush();
  mock.timers.tick(stripe.SHEET_INIT_TIMEOUT_MS - 1);
  await flush();
  assert.equal(outcome, null, 'still waiting one millisecond before the bound');
  mock.timers.tick(1);
  await flush();
  assert.deepEqual(outcome, { outcome: 'failed', error: { message: stripe.SHEET_UNSHOWN_MESSAGE } });
  assert.equal(presented, 0, 'a sheet that never got ready is never presented: nothing can be charged');
  assert.equal(
    stripe.SHEET_UNSHOWN_MESSAGE,
    'The payment sheet could not be shown. Nothing was charged — you can try again.'
  );

  // The saved-card sheet takes the same bound.
  let saved = null;
  stripe
    .presentCardSetupSheet({ customerId: 'cus', setupIntentClientSecret: 'si', ephemeralKeySecret: 'ek' })
    .then((o) => (saved = o));
  await flush();
  mock.timers.tick(stripe.SHEET_INIT_TIMEOUT_MS);
  await flush();
  assert.deepEqual(saved, { outcome: 'failed', error: { message: stripe.SHEET_UNSHOWN_MESSAGE } });
});

test('T2: a sheet that gets ready in time is presented as before', async () => {
  let presented = 0;
  const stripe = await loadStripe({
    initStripe: async () => {},
    initPaymentSheet: async () => ({}),
    presentPaymentSheet: async () => ((presented += 1), {}),
  });
  assert.deepEqual(await stripe.presentCheckoutSheet(SESSION), { outcome: 'completed', error: null });
  assert.equal(presented, 1);
});
