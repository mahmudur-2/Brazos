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

test('[static] the pure rules modules carry no runtime import, and the boundary imports its rules', () => {
  const pure = stripComments(read('lib/payments/stripeRules.ts'));
  assert.doesNotMatch(pure, /^\s*import\s/m, 'lib/payments/stripeRules.ts must have no imports at all');
  assert.doesNotMatch(pure, /require\(/);
  const boundary = stripComments(read(BOUNDARY));
  assert.match(boundary, /from '\.\/stripeRules'/);
  // lib/paymentRules.ts (D24): type-only imports are erased; a value import
  // would drag the supabase client in and make the node suite scan instead
  // of execute.
  const paymentRules = stripComments(read('lib/paymentRules.ts'));
  assert.doesNotMatch(paymentRules, /^\s*import\s+(?!type\b)/m, 'lib/paymentRules.ts may import types only');
  assert.doesNotMatch(paymentRules, /require\(/);
  // And lib/payments.ts re-exports the four names, so no importer moved.
  const payments = stripComments(read('lib/payments.ts'));
  assert.match(
    payments,
    /export \{\s*canOfferJobFunding,\s*isHeld,\s*isReleased,\s*isReleaseRequested,?\s*\} from '\.\/paymentRules';/
  );
});

// ---------------------------------------------------------------------------
// 6b. The adapter (D3, D4, D19) — three providers, one boundary
// ---------------------------------------------------------------------------

test('[static] the adapter selects three ways, and the stripe provider refuses what has no stripe meaning', () => {
  const adapter = stripComments(read('lib/adapters/payments.ts'));
  const flat = flatten(read('lib/adapters/payments.ts'));
  // Three-way selection at module load, still declared from the env var.
  assert.match(flat, /resolution\.mode === 'sandbox' \? createSandboxPaymentProvider\(\) : resolution\.mode === 'stripe' \? createStripePaymentProvider\(\) : createDisabledPaymentProvider\(/);
  assert.match(adapter, /configured: process\.env\.EXPO_PUBLIC_PAYMENTS_MODE/);
  // D4: the interface gained beginJobCheckout, and every provider answers it.
  assert.match(adapter, /beginJobCheckout\(jobId: string\): Promise<CheckoutSessionResult>;/);
  assert.equal((adapter.match(/beginJobCheckout: async/g) ?? []).length, 3, 'sandbox, stripe and disabled each carry an arm');
  // The stripe provider reaches the card path through the one boundary and
  // never names the SDK itself.
  assert.match(adapter, /from '\.\.\/payments\/stripe'/);
  assert.doesNotMatch(adapter, /stripe-react-native/);
  assert.match(adapter, /return createPaymentSession\(jobId\);/);
  // Stripe release is release_job_payment; the sandbox pair is untouched.
  assert.match(adapter, /rpc\('release_job_payment', \{ p_job_id: jobId \}\)/);
  assert.match(adapter, /sandbox_release_job_payment/);
  assert.match(adapter, /sandbox_authorize_job_payment/);
  assert.match(adapter, /sandbox_hold_job_payment/);
  // D3: stripe tip refuses (no begin_tip_payment intent exists) and never says paid.
  assert.match(adapter, /tipWorker: async \(\) => \(stripeReady\(\) \? refuse\(STRIPE_TIP_MESSAGE\)/);
  assert.match(adapter, /STRIPE_TIP_MESSAGE =\s*'Tipping arrives in the next update\. Your approved payment is on its way to the worker\.'/);
  assert.doesNotMatch(adapter, /begin_tip_payment/);
  // D19: stripe cash-out refuses and never calls sandbox_cash_out.
  assert.match(flat, /cashOut: async \(\) => \(\{ data: \[\], error: \{ message: stripeReady\(\) \? STRIPE_CASH_OUT_MESSAGE : STRIPE_UNAVAILABLE_MESSAGE \},? \}\)/);
  assert.equal((adapter.match(/sandbox_cash_out/g) ?? []).length, 1, 'only the sandbox provider calls sandbox_cash_out');
  // D4: the sandbox two-step is refused in stripe mode; the sheet is refused in sandbox mode.
  assert.match(adapter, /authorizeJobPayment: async \(\) =>\s*stripeReady\(\) \? refuse\(STRIPE_NO_TWO_STEP_MESSAGE\) : unavailable\(\)/);
  assert.match(adapter, /protectJobPayment: async \(\) =>\s*stripeReady\(\) \? refuse\(STRIPE_NO_TWO_STEP_MESSAGE\) : unavailable\(\)/);
  assert.match(adapter, /beginJobCheckout: async \(\) => \(\{ data: null, error: \{ message: SANDBOX_NO_SHEET_MESSAGE \} \}\)/);
  // The SDK-absent / key-absent refusal guards every stripe method.
  const stripeProvider = adapter.slice(
    adapter.indexOf('function createStripePaymentProvider'),
    adapter.indexOf('function createDisabledPaymentProvider')
  );
  assert.equal((stripeProvider.match(/stripeReady\(\)/g) ?? []).length, 6, 'all six stripe methods consult stripeReady()');
  for (const message of ['STRIPE_TIP_MESSAGE', 'STRIPE_CASH_OUT_MESSAGE', 'STRIPE_NO_TWO_STEP_MESSAGE', 'SANDBOX_NO_SHEET_MESSAGE']) {
    const value = adapter.match(new RegExp(`${message} =\\s*'([^']+)'`));
    assert.ok(value, `${message} must be a literal sentence`);
    assert.doesNotMatch(value[1], /\bpaid\b/i, `${message} must never say paid`);
  }
  // The disabled provider still refuses everything.
  assert.match(adapter, /releaseJobPayment: refuse/);
  assert.match(adapter, /tipWorker: refuse/);
});

// ---------------------------------------------------------------------------
// 6c. CheckoutScreen's stripe branch (D4, D5, D6, D7, D13, D14, D15, D18, D22)
// ---------------------------------------------------------------------------

test('[static] CheckoutScreen takes the card through the adapter and the boundary, and polls before it claims held', () => {
  const src = read('screens/CheckoutScreen.tsx');
  const code = stripComments(src);
  // D18: the gate is disabled-only — stripe is not locked out.
  assert.match(code, /paymentsMode === 'disabled'/);
  assert.doesNotMatch(code, /paymentsMode !== 'sandbox'/);
  // D4: the SDK-absent / key-absent screen state is the one sentence, as a
  // permissionDenied state — never a spinner.
  assert.match(code, /stripe && !stripeReady\(\)[\s\S]{0,300}kind: 'permissionDenied'[\s\S]{0,200}STRIPE_UNAVAILABLE_MESSAGE/);
  // D5: create-payment through the adapter, the sheet through the boundary,
  // then the poll; the sandbox two-step is never called in stripe mode.
  assert.match(code, /paymentProvider\.beginJobCheckout\(job\.id\)/);
  assert.match(code, /presentCheckoutSheet\(session\.data\)/);
  assert.match(code, /from '\.\.\/lib\/payments\/stripe'/);
  assert.doesNotMatch(code, /stripe-react-native/);
  assert.doesNotMatch(code, /\.rpc\(|\.from\(|functions\.invoke/);
  assert.match(code, /onConfirm=\{stripe \? fundByCard : fundProtection\}/);
  // A dismissed sheet: no alert, no poll, one re-read.
  assert.match(code, /sheet\.outcome === 'dismissed'[\s\S]{0,200}await loadPayment\(\);\s*return;/);
  assert.doesNotMatch(code, /dismissed'[\s\S]{0,120}alertAsync/);
  // D7: the poll — the classifier, the two constants, seen initialised true,
  // and JobConfirmed only off a row that reads held.
  assert.match(code, /classifyCheckoutPoll\(\{ status: data\?\.status \?\? null, seen \}\)/);
  assert.match(code, /let seen = true;/);
  assert.match(code, /Date\.now\(\) - startedAt < CHECKOUT_POLL_TIMEOUT_MS/);
  assert.match(code, /await sleep\(CHECKOUT_POLL_INTERVAL_MS\)/);
  assert.match(code, /outcome === 'held'[\s\S]{0,120}navigation\.replace\('JobConfirmed'/);
  assert.match(code, /outcome === 'gone'[\s\S]{0,80}setPhase\('gone'\)/);
  assert.match(code, /if \(activeRef\.current\) setPhase\('timeout'\);/);
  // The sheet's success never navigates by itself: JobConfirmed is reached
  // only from the poll, the recheck, or the sandbox hold.
  const successPaths = code.match(/navigation\.replace\('JobConfirmed'/g) ?? [];
  assert.equal(successPaths.length, 4, 'held-continue, sandbox hold, the poll, and the recheck');
  assert.doesNotMatch(code, /outcome === 'completed'[\s\S]{0,200}JobConfirmed/);
  // The confirming state: the template's spinner, the words in the header,
  // and no action bar (DetailScreen drops it while the state is not ready).
  assert.match(code, /phase === 'confirming'\s*\?[\s\S]{0,200}\{ kind: 'loading', variant: 'spinner' \}/);
  assert.match(src, /subtitle=\{phase === 'confirming' \? 'Confirming your payment…' : job\.title\}/);
  // The third branch never says failed and never offers a second payment.
  const timeoutBlock = src.slice(src.indexOf("phase === 'timeout'\n            ? ["), src.indexOf("stripe && windowClosed"));
  assert.ok(timeoutBlock.length > 0, 'the timeout section exists');
  assert.doesNotMatch(timeoutBlock, /\bfail/i);
  assert.match(timeoutBlock, /hasn’t seen it\s+confirm yet/);
  assert.match(code, /phase === 'timeout' \|\| windowClosed \? \(\s*<Button title="Check again"/);
  // D13 / D22: the all-in total is the headline — the row's charge_amount_cents
  // or the quote's total_cents — and the bare agreed price is never the total.
  assert.match(code, /quoteJobPrice\(amountCents\)/);
  assert.match(code, /total: payment\.charge_amount_cents/);
  assert.match(code, /total: quote\.total_cents/);
  assert.match(code, /Total charged to your card/);
  assert.match(code, /`Protect \$\{formatBudget\(figures\.total\)\} by card`/);
  assert.match(code, /`Charge \$\{formatBudget\(figures\?\.total \?\? null\)\} to your card\?`/);
  assert.match(code, /disabled=\{funding \|\| !figures \|\| state\.kind !== 'ready'\}/);
  assert.match(code, /quoteError && !figures/);
  // D10: no client-side fee arithmetic — the sandbox fee row reads the ledger.
  assert.doesNotMatch(code, /platformFeeCents|PLATFORM_FEE_RATE|workerPayoutCents|\* 0\.|\/ 100 \*/);
  assert.match(code, /payment\.platform_fee_cents > 0/);
  // D14: the countdown reuses the one formatter; a closed window has no CTA.
  assert.match(code, /releaseCountdownLabel\(fundingDueMs as number, nowMs\)/);
  assert.match(code, /canOfferJobFunding\(\{ viewerId: user\?\.id, job, payment, nowMs \}\)/);
  assert.match(code, /windowClosed = hasWindow && nowMs >= /);
  // D15: the kill switch is read on focus and hides the CTA in every mode.
  assert.match(code, /fetchRemoteConfig\(\)\.then\(\(config\) => \{\s*if \(active\) setPaymentsEnabled\(config\.paymentsEnabled\);/);
  assert.match(code, /!paymentsEnabled \? undefined/);
  // D16: every sandbox string is behind the resolved mode; none renders in
  // stripe mode. The sandbox strings themselves are verbatim.
  assert.match(code, /SANDBOX — no real money moves\. No real money is charged/);
  assert.match(code, /'None in sandbox'/);
  assert.match(code, /Total \(sandbox\)/);
  assert.match(code, /Finish protecting funds \(sandbox\)/);
  assert.match(code, /This authorizes the sandbox amount and places it in protected\/held state/);
  // The stripe copy never says paid, and the sheet's success is never "held".
  const stripeCopy = [
    'Your card is charged the all-in total now, through the secure payment sheet.',
    'The payment was taken, but the app hasn’t seen it',
    'Nothing is held for this job.',
  ];
  for (const sentence of stripeCopy) assert.ok(src.includes(sentence), `missing: ${sentence}`);
  assert.doesNotMatch(code, /\bpaid\b(?! early)/i);
});

// ---------------------------------------------------------------------------
// 7. The kill switch's fallback (D15) — executed
// ---------------------------------------------------------------------------

test('D15 · paymentsEnabled falls back to true, and a failed config read never locks a customer out', async () => {
  // lib/remoteConfig.ts imports the supabase client, so it is executed the
  // way tests/fundingPath.test.mjs used to execute lib/payments.ts: types
  // stripped, the one value import stubbed to null. The stub THROWS inside
  // fetchRemoteConfig's try, which is exactly the failed-read path.
  const { stripTypeScriptTypes } = await import('node:module');
  const js = stripTypeScriptTypes(read('lib/remoteConfig.ts'), { mode: 'strip' });
  const stubbed = js.replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;');
  assert.notEqual(stubbed, js, 'the supabase import must be found and stubbed');
  const url = 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(stubbed, 'utf8').toString('base64');
  const config = await import(url);

  assert.equal(config.FALLBACK.paymentsEnabled, true, 'the permissive fallback: never lock a paying customer out');
  assert.deepEqual(Object.keys(config.FALLBACK).sort(), [
    'maintenanceMessage',
    'maintenanceMode',
    'minimumSupportedVersion',
    'paymentsEnabled',
    'postingEnabled',
  ]);

  const log = console.log;
  console.log = () => {};
  try {
    const result = await config.fetchRemoteConfig();
    assert.deepEqual(result, config.FALLBACK, 'a failed read resolves to FALLBACK, never rejects');
    assert.equal(result.paymentsEnabled, true);
  } finally {
    console.log = log;
  }

  // The merge honours a seeded false and ignores a wrongly-typed value — as
  // source, since merge() is not exported.
  const source = stripComments(read('lib/remoteConfig.ts'));
  assert.match(source, /paymentsEnabled: asBoolean\(byKey\.get\('paymentsEnabled'\), FALLBACK\.paymentsEnabled\)/);
  assert.match(source, /paymentsEnabled: boolean;/);
});
