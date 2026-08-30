import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * R6a — the customer money path on Stripe, the client half.
 *
 * What must stay true:
 *   1. The resolver admits 'stripe' as a third mode beside sandbox and
 *      disabled, keeps the unset row exactly as it was, and still fails CLOSED
 *      on anything it does not recognise — executed against the real function.
 *   2. The poll classifier, the checkout-response validator, the invoke-error
 *      extractor and the sheet-outcome rule are pure and EXECUTED here (D24):
 *      every payment status classifies, every malformed payload is refused,
 *      every status code create-payment returns yields a sentence a user can
 *      read, and the raw "non-2xx" sentence never survives.
 *   3. '@stripe/stripe-react-native' is named in exactly ONE file of the app
 *      source tree — lib/payments/stripe.ts — and there only inside the caught
 *      loader; no StripeProvider exists anywhere. The tests/haptics.test.mjs
 *      counting-assertion shape: the sweep fails on zero as loudly as on two.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

const { resolvePaymentsMode } = await import(
  pathToFileURL(join(root, 'lib/adapters/paymentsMode.ts')).href
);
const rules = await import(pathToFileURL(join(root, 'lib/payments/stripeRules.ts')).href);
const {
  CHECKOUT_POLL_INTERVAL_MS,
  CHECKOUT_POLL_TIMEOUT_MS,
  CHECKOUT_RESPONSE_MALFORMED,
  INVOKE_ERROR_RAW,
  INVOKE_RELAY_DOWN,
  INVOKE_UNREACHABLE,
  SHEET_CANCELED_CODE,
  SHEET_FAILED_FALLBACK,
  classifyCheckoutPoll,
  classifySheetError,
  extractInvokeError,
  fallbackSentenceForStatus,
  serverErrorSentence,
  validateCheckoutResponse,
} = rules;

// ---------------------------------------------------------------------------
// 1. The resolver's new arm (D1)
// ---------------------------------------------------------------------------

const mode = (configured, dev) => resolvePaymentsMode({ configured, dev }).mode;

test('D1 · a declared stripe mode is honoured on every build type, without a config error', () => {
  for (const dev of [true, false]) {
    const resolution = resolvePaymentsMode({ configured: 'stripe', dev });
    assert.equal(resolution.mode, 'stripe', `stripe must resolve to stripe (dev=${dev})`);
    assert.equal(resolution.configError, null, 'declaring stripe is a supported configuration');
  }
  for (const value of ['  stripe', 'stripe  ', 'STRIPE', 'Stripe', '\tstripe\n']) {
    assert.equal(mode(value, false), 'stripe', `${JSON.stringify(value)} must read as stripe`);
  }
});

test('D1 · the unset row keeps its exact previous behaviour, and sandbox/disabled are unchanged', () => {
  for (const unset of [undefined, null, '', ' ', '\t\n']) {
    assert.equal(mode(unset, true), 'sandbox');
    assert.equal(mode(unset, false), 'disabled');
    assert.equal(resolvePaymentsMode({ configured: unset, dev: false }).configError, null);
  }
  assert.equal(mode('sandbox', false), 'sandbox');
  assert.equal(mode('disabled', true), 'disabled');
});

test('D1 · anything unrecognised still fails CLOSED to disabled with the reason surfaced', () => {
  for (const value of ['stripe2', 'stripe,sandbox', 'stripe sandbox', 'live', 'real', 'production', 'card', 'on', '1']) {
    for (const dev of [true, false]) {
      const resolution = resolvePaymentsMode({ configured: value, dev });
      assert.equal(resolution.mode, 'disabled', `${JSON.stringify(value)} must not enable money (dev=${dev})`);
      assert.match(
        String(resolution.configError),
        /Unrecognized EXPO_PUBLIC_PAYMENTS_MODE/,
        `${JSON.stringify(value)} must surface why payments are off`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. The poll classifier (D7)
// ---------------------------------------------------------------------------

const EVERY_STATUS = [
  'unfunded',
  'authorized',
  'held',
  'released',
  'paid_out',
  'failed',
  'voided',
  'refunded',
  'partially_refunded',
  'pending', // the legacy pre-repo label nothing writes
  'not-a-real-state',
];

test('D7 · the poll classifies every payment status, and only held is success', () => {
  let asserted = 0;
  for (const status of EVERY_STATUS) {
    for (const seen of [true, false]) {
      const state = classifyCheckoutPoll({ status, seen });
      if (status === 'held') assert.equal(state, 'held');
      else if (status === 'failed' || status === 'voided') assert.equal(state, 'gone');
      else assert.equal(state, 'pending', `${status} must keep polling (seen=${seen})`);
      asserted++;
    }
  }
  assert.equal(asserted, EVERY_STATUS.length * 2, 'the whole matrix genuinely ran');
});

test('D7 · a row that was seen and is now null is the failed/voided signal; never-seen null is pending', () => {
  assert.equal(classifyCheckoutPoll({ status: null, seen: true }), 'gone');
  assert.equal(classifyCheckoutPoll({ status: undefined, seen: true }), 'gone');
  assert.equal(classifyCheckoutPoll({ status: null, seen: false }), 'pending');
  assert.equal(classifyCheckoutPoll({ status: undefined, seen: false }), 'pending');
});

test('D7 · the poll runs every 2 seconds for up to 30 seconds', () => {
  assert.equal(CHECKOUT_POLL_INTERVAL_MS, 2_000);
  assert.equal(CHECKOUT_POLL_TIMEOUT_MS, 30_000);
});

// ---------------------------------------------------------------------------
// 3. The checkout-response validator (D4)
// ---------------------------------------------------------------------------

const GOOD = {
  paymentId: '3d2f0b0a-9c1e-4f2b-8a7d-1234567890ab',
  clientSecret: 'pi_123_secret_456',
  customerId: 'cus_123',
  ephemeralKeySecret: 'ek_test_789',
};

test('D4 · one good payload yields exactly the four strings', () => {
  const result = validateCheckoutResponse({ ...GOOD, extra: 'ignored' });
  assert.equal(result.error, null);
  assert.deepEqual(result.data, GOOD);
});

test('D4 · four malformed payloads are refused with the one honest sentence', () => {
  const malformed = [
    ['a missing key', { paymentId: GOOD.paymentId, clientSecret: GOOD.clientSecret, customerId: GOOD.customerId }],
    ['an empty string', { ...GOOD, ephemeralKeySecret: '   ' }],
    ['a non-string value', { ...GOOD, paymentId: 42 }],
    ['not an object at all', 'ok'],
  ];
  let refused = 0;
  for (const [label, payload] of malformed) {
    const result = validateCheckoutResponse(payload);
    assert.equal(result.data, null, `${label} must not yield a session`);
    assert.equal(result.error.message, CHECKOUT_RESPONSE_MALFORMED, `${label} must carry the sentence`);
    refused++;
  }
  assert.equal(refused, 4);
  assert.match(CHECKOUT_RESPONSE_MALFORMED, /Nothing was charged/);
  // null and an array are refused the same way.
  assert.equal(validateCheckoutResponse(null).data, null);
  assert.equal(validateCheckoutResponse([GOOD]).data, null);
});

// ---------------------------------------------------------------------------
// 4. The invoke-error extractor (D6)
// ---------------------------------------------------------------------------

/** A FunctionsHttpError as supabase-js hands it back: context is the Response. */
const httpError = (status) => ({
  name: 'FunctionsHttpError',
  message: INVOKE_ERROR_RAW,
  context: { status, ok: false },
});

test('D6 · the server’s own sentence is shown as written for 400/401/409/502/500', () => {
  const table = [
    [400, 'Payments are paused right now. Nothing was charged.'],
    [400, 'Accept an offer before protecting a payment.'],
    [400, 'Job not found'],
    [400, 'Malformed request.'],
    [401, 'Sign in to protect a payment.'],
    [409, 'This payment has no amount to charge yet.'],
    [502, 'The payment provider is unavailable right now.'],
    [500, 'Could not start this payment.'],
  ];
  for (const [status, sentence] of table) {
    const { status: seen, message } = extractInvokeError(httpError(status), JSON.stringify({ error: sentence }));
    assert.equal(seen, status);
    assert.equal(message, sentence, `${status} must surface the server sentence verbatim`);
    assert.notEqual(message, INVOKE_ERROR_RAW);
  }
  // An already-parsed body is accepted too.
  assert.equal(extractInvokeError(httpError(400), { error: 'Job not found' }).message, 'Job not found');
});

test('D6 · a malformed context or body falls back per status, never to the raw non-2xx sentence', () => {
  const cases = [
    ['no body', httpError(502), null],
    ['a body that is not JSON', httpError(409), '<html>Bad Gateway</html>'],
    ['a JSON body without error', httpError(401), JSON.stringify({ ok: false })],
    ['an empty error string', httpError(400), JSON.stringify({ error: '   ' })],
    ['a context with no status', { name: 'FunctionsHttpError', message: INVOKE_ERROR_RAW, context: {} }, null],
    ['a null context', { name: 'FunctionsHttpError', message: INVOKE_ERROR_RAW, context: null }, 'x'],
    ['no error object at all', null, null],
    ['a bare string error', 'boom', null],
  ];
  for (const [label, error, body] of cases) {
    const { message } = extractInvokeError(error, body);
    assert.ok(message && typeof message === 'string', `${label} must yield a sentence`);
    assert.notEqual(message, INVOKE_ERROR_RAW, `${label} must not leak the raw sentence`);
    assert.doesNotMatch(message, /non-2xx|Edge Function/i, `${label} must read as prose`);
  }
  assert.equal(extractInvokeError(httpError(401), null).message, fallbackSentenceForStatus(401));
  assert.equal(extractInvokeError(httpError(409), null).message, fallbackSentenceForStatus(409));
  assert.equal(extractInvokeError(httpError(502), null).message, fallbackSentenceForStatus(502));
  assert.equal(extractInvokeError(httpError(500), null).message, fallbackSentenceForStatus(500));
  assert.equal(extractInvokeError(httpError(400), null).message, fallbackSentenceForStatus(400));
  // The fallbacks are plain, distinct sentences and never claim a charge.
  const fallbacks = [400, 401, 409, 502, 500].map(fallbackSentenceForStatus);
  assert.equal(new Set(fallbacks).size, 5);
  // "Nothing was charged" is the honest negation; an affirmed charge or "paid" is not.
  for (const sentence of fallbacks) assert.doesNotMatch(sentence, /\bpaid\b|(?<!nothing )was charged/i);
});

test('D6 · a network failure and a relay failure get their own plain sentences', () => {
  assert.equal(extractInvokeError({ name: 'FunctionsFetchError', context: new TypeError('fetch failed') }, null).message, INVOKE_UNREACHABLE);
  assert.equal(extractInvokeError({ name: 'FunctionsRelayError', context: { status: 500 } }, null).message, INVOKE_RELAY_DOWN);
  assert.equal(serverErrorSentence('{"error":"Job not found"}'), 'Job not found');
  assert.equal(serverErrorSentence('{"error":""}'), null);
  assert.equal(serverErrorSentence('not json'), null);
  assert.equal(serverErrorSentence(null), null);
});

// ---------------------------------------------------------------------------
// 5. The sheet outcome (D5)
// ---------------------------------------------------------------------------

test('D5 · a dismissed sheet is not an error; anything else fails with the provider’s sentence', () => {
  assert.equal(SHEET_CANCELED_CODE, 'Canceled');
  assert.deepEqual(classifySheetError({ code: 'Canceled', message: 'The payment has been canceled' }), { outcome: 'dismissed' });
  assert.deepEqual(
    classifySheetError({ code: 'Failed', message: 'Your card was declined.', localizedMessage: 'Your card was declined.' }),
    { outcome: 'failed', message: 'Your card was declined.' }
  );
  assert.deepEqual(classifySheetError({ code: 'Timeout', message: '' }), { outcome: 'failed', message: SHEET_FAILED_FALLBACK });
  assert.deepEqual(classifySheetError(null), { outcome: 'failed', message: SHEET_FAILED_FALLBACK });
  assert.match(SHEET_FAILED_FALLBACK, /Nothing was taken/);
});

// ---------------------------------------------------------------------------
// 6. The boundary is a boundary tree-wide (D2) — the haptics fence shape
// ---------------------------------------------------------------------------

const SCAN_DIRS = ['components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];
const ROOT_FILES = ['App.tsx', 'index.ts'];
const BOUNDARY = 'lib/payments/stripe.ts';
const PACKAGE = '@stripe/stripe-react-native';
// Legitimately name the package and are NOT app source: excluded from the sweep.
const EXCLUDED = ['app.config.ts', 'package.json', 'package-lock.json', 'node_modules'];

function* walk(dir) {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) yield* walk(rel);
    else if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry)) yield rel;
  }
}

test('[static] lib/payments/stripe.ts is the only app-source file that names the card SDK, inside a caught require', () => {
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  assert.ok(files.length > 100, `the sweep must enumerate the tree (saw ${files.length})`);
  assert.ok(files.includes(BOUNDARY), 'the boundary itself must be inside the swept tree');
  for (const excluded of EXCLUDED) {
    assert.ok(
      !files.some((file) => file === excluded || file.startsWith(`${excluded}/`)),
      `${excluded} legitimately names the package and must not be swept`
    );
  }

  const offenders = [];
  const providers = [];
  let boundaryHits = 0;
  for (const file of files) {
    const code = stripComments(read(file));
    const hits = (code.match(/@stripe\/stripe-react-native/g) ?? []).length;
    if (file === BOUNDARY) boundaryHits = hits;
    else if (hits > 0) offenders.push(file);
    if (/StripeProvider/.test(code)) providers.push(file);
  }
  assert.deepEqual(offenders, [], 'the card SDK must be reached through lib/payments/stripe.ts, never imported directly');
  assert.deepEqual(providers, [], 'no <StripeProvider> anywhere — it would be a static import');
  // Exactly once: zero means the boundary loads nothing, two means a second path.
  assert.equal(boundaryHits, 1, `${BOUNDARY} must name the package exactly once (saw ${boundaryHits})`);

  const boundary = stripComments(read(BOUNDARY));
  const flat = flatten(read(BOUNDARY));
  assert.doesNotMatch(boundary, /import[^;]*from '@stripe\/stripe-react-native'/, 'never a static import');
  assert.match(boundary, /require\('@stripe\/stripe-react-native'\)/, 'the one mention is the caught require');
  // The require sits inside load()'s try, and load() has exactly one call site:
  // the non-web arm of the Platform ternary, so web never executes the vendor.
  assert.match(flat, /function load\(\): StripeModule \| null \{ try \{ const vendor = require\('@stripe\/stripe-react-native'\)/);
  assert.match(flat, /\} catch \{ return null; \} \}/);
  const loadCalls = [...boundary.matchAll(/(?<!function )\bload\(\)/g)];
  assert.equal(loadCalls.length, 1, 'load() must have exactly one call site');
  assert.match(flat, /const stripe: StripeModule \| null = Platform\.OS === 'web' \? null : load\(\);/);
  // D2: initialisation is lazy, once, with the merchant identifier; D8: the
  // sheet carries no applePay parameter and is initialised as Brazos.
  assert.match(boundary, /merchantIdentifier: STRIPE_MERCHANT_IDENTIFIER/);
  assert.match(boundary, /STRIPE_MERCHANT_IDENTIFIER = 'merchant\.app\.brazos\.mobile'/);
  assert.match(boundary, /STRIPE_MERCHANT_DISPLAY_NAME = 'Brazos'/);
  assert.doesNotMatch(boundary, /applePay/);
  // D4: the unavailable sentence names the fix, never a spinner or a crash.
  assert.match(boundary, /can’t take card payments yet\. Update the app/);
});

test('[static] the pure rules module carries no runtime import, and the boundary imports it', () => {
  const pure = stripComments(read('lib/payments/stripeRules.ts'));
  assert.doesNotMatch(pure, /^\s*import\s/m, 'lib/payments/stripeRules.ts must have no imports at all');
  assert.doesNotMatch(pure, /require\(/);
  const boundary = stripComments(read(BOUNDARY));
  assert.match(boundary, /from '\.\/stripeRules'/);
});
