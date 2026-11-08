import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Payments availability is DECLARED, never inferred from the build — and the
 * card path lives behind one boundary (R6a).
 *
 * The invariant this file fences, rewritten in R6a (its Stage 4A form
 * admitted two modes and treated 'stripe' as garbage):
 *
 *   1. The resolver admits exactly three modes — sandbox, stripe, disabled —
 *      keeps the unset row as it was, and fails CLOSED on anything else.
 *      Executed against the real function.
 *   2. No screen, component, hook or ui file imports the card SDK; only
 *      lib/payments/stripe.ts does, inside a caught require.
 *   3. No sandbox-only string is reachable in stripe mode: every sandbox
 *      sentence sits behind the resolved mode, and every one of them still
 *      renders — verbatim — in sandbox mode.
 *   4. No client-side fee arithmetic exists anywhere in the tree: the ledger
 *      row and quote_job_price() are the only fee sources.
 *   5. ReviewAndTip's gate and ApproveOrDispute's approve CTA both consult
 *      isReleaseRequested, so an approved stripe row (held, release
 *      requested) cannot bounce between the two screens.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const modeUrl = pathToFileURL(join(root, 'lib/adapters/paymentsMode.ts')).href;
const { resolvePaymentsMode } = await import(modeUrl);

/** The mode alone, for the table. */
const mode = (configured, dev) => resolvePaymentsMode({ configured, dev }).mode;

const SCAN_DIRS = ['components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];
const ROOT_FILES = ['App.tsx', 'index.ts'];

function* walk(dir) {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) yield* walk(rel);
    else if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry)) yield rel;
  }
}

function appSourceFiles() {
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  assert.ok(files.length > 100, `the sweep must enumerate the tree (saw ${files.length})`);
  return files;
}

// ---------------------------------------------------------------------------
// 1. The resolution table — executed
// ---------------------------------------------------------------------------

test('the three declared modes are honoured on EVERY build type', () => {
  for (const declared of ['sandbox', 'stripe', 'disabled']) {
    for (const dev of [true, false]) {
      const resolution = resolvePaymentsMode({ configured: declared, dev });
      assert.equal(resolution.mode, declared, `${declared} must resolve to itself (dev=${dev})`);
      assert.equal(resolution.configError, null, `declaring ${declared} is a supported configuration`);
    }
  }
});

test('an unset value reproduces the previous __DEV__ default exactly', () => {
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
  for (const value of ['  stripe', 'STRIPE', 'Stripe', '\tstripe\n']) {
    assert.equal(mode(value, false), 'stripe', `${JSON.stringify(value)} must read as stripe`);
  }
  for (const value of ['  disabled', 'disabled  ', 'DISABLED', 'Disabled', ' \tDisAbLeD\n ']) {
    assert.equal(mode(value, true), 'disabled', `${JSON.stringify(value)} must read as disabled`);
  }
});

test('an unrecognised value fails CLOSED - in dev as well as in a release', () => {
  // An allow-list, not a block-list: anything the resolver does not name
  // turns payments off and says why.
  const unrecognised = [
    'stripe2',
    'sandbox2',
    'sand box',
    'sandbox,disabled',
    'stripe,sandbox',
    'card',
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
      assert.equal(mode(value, dev), 'disabled', `${JSON.stringify(value)} must not enable money (dev=${dev})`);
    }
    assert.ok(
      resolvePaymentsMode({ configured: value, dev: true }).configError,
      `${JSON.stringify(value)} must surface why payments are off`
    );
  }
});

test("'live', 'real' and 'production' are not modes and can never enable money", () => {
  // Which provider account a build talks to is the publishable key's
  // business, never a mode word.
  for (const forbidden of ['live', 'real', 'production', 'LIVE', 'Real', ' Production ']) {
    for (const dev of [true, false]) {
      assert.equal(mode(forbidden, dev), 'disabled', `${JSON.stringify(forbidden)} must resolve to disabled (dev=${dev})`);
    }
  }
});

test('the resolver admits exactly three modes and has no live/real/production branch', () => {
  const source = read('lib/adapters/paymentsMode.ts');
  assert.match(source, /export type PaymentsMode = 'sandbox' \| 'stripe' \| 'disabled';/);
  const code = stripComments(source);
  for (const forbidden of ['live', 'real', 'production']) {
    assert.doesNotMatch(code, new RegExp(`===\\s*['"]${forbidden}['"]`), `paymentsMode.ts must not branch on '${forbidden}'`);
  }
  assert.equal((code.match(/raw === '/g) ?? []).length, 4, "'', sandbox, stripe, disabled — and nothing else");
});

test('the adapter declares availability from the env var, using dev only as the default', () => {
  const adapter = read('lib/adapters/payments.ts');
  assert.match(adapter, /configured: process\.env\.EXPO_PUBLIC_PAYMENTS_MODE/);
  assert.match(adapter, /dev: __DEV__/);
});

test('no payment surface gates itself on the build type', () => {
  // The whole loop asks the adapter for the mode. A __DEV__ test on any of
  // these would re-create the Stage 4A defect in a second place.
  for (const file of [
    'screens/CheckoutScreen.tsx',
    'screens/ApproveOrDisputeScreen.tsx',
    'screens/ReviewAndTipScreen.tsx',
    'screens/EarningsScreen.tsx',
    'screens/PaymentMethodsScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/WorkerJobScreen.tsx',
    'screens/JobConfirmedScreen.tsx',
    'screens/JobDetailScreen.tsx',
    'lib/payments/stripe.ts',
  ]) {
    const source = stripComments(read(file));
    assert.doesNotMatch(source, /__DEV__/, `${file} must gate on paymentsMode, not __DEV__`);
  }
});

// ---------------------------------------------------------------------------
// 2. The card SDK has one door
// ---------------------------------------------------------------------------

test('no screen, component, hook or ui file imports the card SDK; only lib/payments/stripe.ts does', () => {
  const BOUNDARY = 'lib/payments/stripe.ts';
  const offenders = [];
  let boundaryHits = 0;
  for (const file of appSourceFiles()) {
    const code = stripComments(read(file));
    const hits = (code.match(/@stripe\/stripe-react-native/g) ?? []).length;
    if (file === BOUNDARY) boundaryHits = hits;
    else if (hits > 0) offenders.push(file);
    if (/StripeProvider|useStripe\(|usePaymentSheet\(/.test(code)) offenders.push(`${file} (hook or provider)`);
  }
  assert.deepEqual(offenders, [], 'the card SDK is reached through lib/payments/stripe.ts and nowhere else');
  assert.equal(boundaryHits, 1, 'the boundary names the package exactly once');
  const boundary = stripComments(read(BOUNDARY));
  assert.match(boundary, /require\('@stripe\/stripe-react-native'\)/);
  assert.doesNotMatch(boundary, /import[^;]*from '@stripe\/stripe-react-native'/);
});

// ---------------------------------------------------------------------------
// 3. Sandbox strings: every one still renders in sandbox mode, none in stripe
// ---------------------------------------------------------------------------

// The sandbox sentences, per file, verbatim. D16 kept them word for word until
// FIX-RUN B5 (2026-10-03, the operator's IN selection) rewrote them into one
// product register — "Test mode", "(test)", "Test cash-out" — each still inside
// its own mode guard. Losing one from sandbox mode fails here.
const SANDBOX_STRINGS = {
  'screens/CheckoutScreen.tsx': [
    'TEST MODE — no real money moves. No real money is charged,',
    'None in test mode',
    'Total (test)',
    '${PAY_AND_PROTECT} (test)',
    '${PAY_AND_PROTECT} ${formatBudget(amountCents)} (test)',
    'confirms the amount in test mode. Nothing is charged.',
    'This authorizes the amount and holds it in protection. Test mode — no real money is charged.',
  ],
  'screens/ApproveOrDisputeScreen.tsx': [
    'Released automatically after 72 hours with no issue reported. Test mode — no real money moved.',
    'You approved the work and the funds were released. Test mode — no real money moved.',
    'release waits while a report is open. Test mode, no real money.',
    'releases the held funds to the worker. It can’t be undone. Test mode — no real money moves.',
  ],
  'screens/ReviewAndTipScreen.tsx': [
    'Released automatically after 72 hours. Test mode — no real money moved.',
    'Released on your approval. Test mode — no real money moved.',
    'on top of the job payment. Test mode — no real money moved.',
    'Test mode, no real money.',
    'tip (test)',
    'Send tip (test)',
    'One tip per job. Test mode — no real money moves.',
  ],
  'screens/ClientJobDetailScreen.tsx': [
    'Test mode — no real money moves.',
  ],
  // C4 (2026-10-03): every payment eyebrow is paymentEyebrow(); its sandbox arm lives here.
  'lib/moneyCopy.ts': ['PAYMENT · TEST MODE'],
  // A5 (2026-10-03): the accept confirm's body is ONE text for the client's job page and Bid
  // detail, so its sandbox sentence lives in lib/offerCopy.ts, guarded by the `sandbox` flag the
  // two screens pass from the resolved mode (both screens stay listed so their guard is checked).
  'lib/offerCopy.ts': [
    'protect the payment in checkout, in test mode (no real money moves).',
  ],
  'screens/WorkerJobScreen.tsx': [
    'Released automatically after 72 hours with no response from the customer. Test mode — no real money.',
    'approved the finished work and the funds were released. Test mode — no real money.',
    'the funds release automatically. Test mode — no real money.',
    'released only after the finished work is approved — test mode, no real money.',
    'Test mode — no real money moves for this job.',
  ],
  'screens/JobConfirmedScreen.tsx': [
    'Test mode — no real money moved.',
  ],
  'screens/EarningsScreen.tsx': [
    'Test mode — no real money',
    'Test cash-outs',
    'Test cash-out complete',
    'moved to Transferred. Test mode — no real transfer exists.',
    'Cash out ${formatBudget(s.availableCents)} (test)',
    'This is a test cash-out: your released payments move to Transferred.',
    'Cash out (test)',
  ],
  'screens/PaymentMethodsScreen.tsx': [
    'Test mode: nothing here is a real charge.',
    'Test mode payments',
    'Test mode: checkout, protection, release and tips all work, but no card is charged and no real money ever moves.',
    'TEST MODE',
    'What test mode does',
  ],
  // 2026-09-29 (LUX-LIST-2 #7): the Payment methods row moved from Account & safety to the hub.
  'screens/ProfileScreen.tsx': ['Test mode · no stored card.'],
  // Its own "development build" sentence is gone (A5); the shared body above is what it renders.
  'screens/BidDetailScreen.tsx': [],
};

// A sandbox string is reachable only from one of these guards: the sandbox
// arm of a mode ternary, or the else-arm of a stripe ternary (which stripe
// mode never takes).
const MODE_GUARD = /paymentsMode === 'sandbox'|\bsandbox\s*\?|\bstripe\s*\?|!stripe\s*\?/g;
// ReviewAndTip's tip button sits ~3.5k characters of preset-chip JSX after
// the `stripe ?` that guards the whole tip block; the window covers it.
const GUARD_WINDOW = 5000;

test('every sandbox string still renders in sandbox mode — verbatim — and none is reachable in stripe mode', () => {
  let strings = 0;
  for (const [file, expected] of Object.entries(SANDBOX_STRINGS)) {
    const src = read(file);
    const code = stripComments(src);
    for (const sentence of expected) {
      assert.ok(src.includes(sentence), `${file} lost a sandbox sentence: ${sentence}`);
      strings++;
    }
    // Every line that carries the word in rendered text must sit inside a
    // guarded arm: a mode guard precedes it within the window.
    const lines = code.split('\n');
    let offset = 0;
    for (const line of lines) {
      const at = offset;
      offset += line.length + 1;
      // Style identifiers (styles.sandboxNote, `sandboxBanner: {`) are not copy.
      const copy = line.replace(/styles\.sandbox\w*/g, '').replace(/^\s*sandbox\w*:\s*\{?/, '');
      // FIX-RUN B5: the sandbox copy now says "Test mode" / "(test)" / "test
      // cash-out"; the detector follows the words so each line is still proven
      // to sit behind a mode guard (wider than before, never narrower).
      if (!/sandbox|test mode|\(test\)|test cash-out/i.test(copy)) continue;
      // The adapter import and a local `const sandbox = …` are not copy.
      if (/from '\.\.\/lib\/adapters\/payments'|const sandbox = paymentsMode/.test(line)) continue;
      // A guard line is its own guard (the window ends at the END of the
      // line); a copy line needs one before it.
      const before = code.slice(Math.max(0, at - GUARD_WINDOW), at + line.length);
      const guards = before.match(MODE_GUARD) ?? [];
      assert.ok(
        guards.length > 0,
        `${file}: sandbox copy with no mode guard within ${GUARD_WINDOW} chars before it — ${line.trim()}`
      );
      // And the resolved mode is the only gate: no build-type test near the
      // copy (the Stage 4A shape, /__DEV__[\s\S]{0,200}SANDBOX/, widened).
      assert.doesNotMatch(
        code.slice(Math.max(0, at - 400), at + line.length),
        /__DEV__/,
        `${file}: sandbox copy must gate on the resolved mode, not __DEV__ — ${line.trim()}`
      );
    }
    // D18: nothing gates the other way round (stripe would be locked out).
    assert.doesNotMatch(code, /paymentsMode !== 'sandbox'/, `${file} must not lock stripe out with a sandbox-only gate`);
  }
  assert.ok(strings >= 40, `the verbatim list is real (saw ${strings})`);
  // JobDetail dropped its sandbox sentence outright (D11): none may return.
  assert.doesNotMatch(stripComments(read('screens/JobDetailScreen.tsx')), /sandbox/i);
});

// ---------------------------------------------------------------------------
// 4. No client-side fee arithmetic anywhere in the tree
// ---------------------------------------------------------------------------

test('no client-side fee arithmetic exists anywhere in the tree', () => {
  const FEE_NAMES = /PLATFORM_FEE_RATE|platformFeeCents|workerPayoutCents|ESTIMATED_PLATFORM_FEE_RATE/;
  const FEE_MATH = /FEE_RATE\s*=\s*[\d.]|\*\s*\(\s*1\s*-\s*[\w.]*[Ff]ee|[Ff]ee[\w.]*\s*\*\s*[\d.]|[Rr]ate\s*\*\s*[\w.]*[Cc]ents|[Cc]ents\s*\*\s*[\w.]*[Rr]ate/;
  const offenders = [];
  for (const file of appSourceFiles()) {
    const code = stripComments(read(file));
    if (FEE_NAMES.test(code)) offenders.push(`${file} — names a client fee constant`);
    if (FEE_MATH.test(code)) offenders.push(`${file} — computes a fee`);
  }
  assert.deepEqual(offenders, [], 'fee figures come from the ledger row or quote_job_price(), never from client arithmetic');
  // The three surfaces read their figures from the two honest sources.
  const payments = stripComments(read('lib/payments.ts'));
  assert.match(payments, /export async function quoteJobPrice\(/);
  assert.match(payments, /rpc\('quote_job_price', \{ p_amount_cents: amountCents \}\)/);
  assert.match(stripComments(read('screens/JobDetailScreen.tsx')), /worker_receives_cents/);
  assert.match(stripComments(read('screens/CheckoutScreen.tsx')), /charge_amount_cents/);
  assert.match(stripComments(read('screens/EarningsScreen.tsx')), /formatBudget\(s\.feeCents\)/);
});

// ---------------------------------------------------------------------------
// 5. The approve/review loop cannot come back
// ---------------------------------------------------------------------------

test("ReviewAndTip's gate and ApproveOrDispute's approve CTA both consult isReleaseRequested", () => {
  const review = stripComments(read('screens/ReviewAndTipScreen.tsx'));
  const approve = stripComments(read('screens/ApproveOrDisputeScreen.tsx'));
  assert.match(review, /isReleaseRequested\(payment\)/);
  assert.match(review, /payment && !released && !releaseRequested/);
  assert.match(approve, /isReleaseRequested\(payment\)/);
  assert.match(approve, /const held = !!payment && isHeld\(payment\) && !releaseRequested;/);
  // The predicate is the one in lib/paymentRules.ts, re-exported by lib/payments.
  assert.match(stripComments(read('lib/paymentRules.ts')), /export function isReleaseRequested\(/);
  assert.match(read('lib/payments.ts'), /isReleaseRequested,?\s*\} from '\.\/paymentRules'/);
});

// ---------------------------------------------------------------------------
// 6. The simulated-money label survives onto a release binary
// ---------------------------------------------------------------------------

test('the simulated-money label is not itself gated on the build type', () => {
  // Un-gated payments with no visible sandbox label is an App Review problem
  // and misleads testers, so the label has to survive onto a release build.
  const checkout = stripComments(read('screens/CheckoutScreen.tsx'));
  assert.match(checkout, /TEST MODE/, 'checkout must carry a test-money label');
  assert.match(checkout, /No real money is charged/);
  assert.doesNotMatch(checkout, /__DEV__[\s\S]{0,200}(SANDBOX|TEST MODE)/, 'the sandbox label must not be behind a build-type condition');
  // Nor may it ASSERT a build type. The label survives onto a release binary,
  // so anything it claims has to be true there too — the money fact is, the
  // build fact is not.
  assert.doesNotMatch(checkout, /development build/, 'the sandbox copy must state the money fact, not the build type');
  // The one condition it may carry is the resolved mode.
  assert.match(checkout, /paymentsMode === 'sandbox'/, 'the banner is gated on the resolved payments mode');
});
