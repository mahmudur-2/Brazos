// B10, the payment functions (docs/lean/AUDIT-LEDGER.md): one account cannot drive Stripe calls
// without bound. active_account_rule (production-36h S1, M2): the same one question also asks whether
// the account is still active, and a check that cannot be answered refuses the call. Deno cannot run
// here, so the shared admission (supabase/functions/_shared/rateLimit.ts, no imports) is executed under
// node against a stubbed service RPC; the wiring in each of the four functions is fenced as text:
// right after the auth server named the caller, before any other database call and before Stripe.
// tests/edgeAdmission.test.mjs runs the four handlers themselves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const HELPER = 'supabase/functions/_shared/rateLimit.ts';
const source = read(HELPER);
const {
  admitCaller, admissionRefusal, refuseUnadmitted, HOURLY_LIMITS, RATE_LIMITED,
  ACCOUNT_SUSPENDED, ACCOUNT_INACTIVE, ACCOUNT_UNCHECKED,
} = await import(
  'data:text/javascript;charset=utf-8;base64,' +
    Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' }), 'utf8').toString('base64')
);

const USER = '00000000-0000-4000-8000-0000000000b1';
const answer = (body, status = 200) => async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** The database's one-word answer, as PostgREST sends a text result: a JSON string. */
const word = (w) => answer(JSON.stringify(w));

/** Runs fn with console.error captured; returns [result, logged lines]. */
async function quietly(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try {
    return [await fn(), lines];
  } finally {
    console.error = original;
  }
}

test('B10 · the limits: at least five times an hour of real use, never below the proposed numbers', () => {
  assert.deepEqual(HOURLY_LIMITS, {
    'create-payment': 150,
    'payment-methods': 600,
    'connect-onboarding': 100,
    'connect-status': 300,
  });
  // The proposal's floors (20, 60, 10, 60), and five times the counted legitimate maximum per hour
  // (30 checkouts, 120 card-list reads, 20 payout links, 60 status checks).
  for (const [fn, floor, busiest] of [
    ['create-payment', 20, 30],
    ['payment-methods', 60, 120],
    ['connect-onboarding', 10, 20],
    ['connect-status', 60, 60],
  ]) {
    assert.ok(HOURLY_LIMITS[fn] >= floor && HOURLY_LIMITS[fn] >= 5 * busiest, fn);
  }
  assert.equal(RATE_LIMITED, 'Too many tries in the last hour. Try again later.');
});

test('active_account_rule · the sentences: the database guard’s own words, and one for a check that cannot be answered', () => {
  assert.equal(ACCOUNT_SUSPENDED, 'This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake.');
  assert.equal(ACCOUNT_INACTIVE, 'This account is no longer active.');
  assert.equal(ACCOUNT_UNCHECKED, 'Brazos can’t check this account right now. Try again in a minute.');
  // The same words as the guard in the database: one source of truth for the person.
  const guard = read('supabase/migrations/20261116400500_active_account_rule.sql');
  assert.ok(guard.includes(`message = '${ACCOUNT_SUSPENDED}'`), 'the guard raises the suspended sentence');
  assert.ok(guard.includes(`message = '${ACCOUNT_INACTIVE}'`), 'the guard raises the inactive sentence');
});

test('B10 · executed: one call per request on the caller’s own counter, with the account check in the same call', async () => {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push([fn, args]);
    return word('ok')();
  };
  assert.equal(await admitCaller(rpc, 'connect-status', USER), 'ok', 'within the limit');
  assert.equal(await admitCaller(rpc, 'payment-methods', USER, { allowSuspended: true }), 'ok');
  assert.deepEqual(calls, [
    ['admit_user_call', { p_user: USER, p_action: 'fn:connect-status', p_max: 300, p_window: '1 hour', p_allow_suspended: false }],
    ['admit_user_call', { p_user: USER, p_action: 'fn:payment-methods', p_max: 600, p_window: '1 hour', p_allow_suspended: true }],
  ]);
  assert.equal(await admitCaller(word('limited'), 'create-payment', USER), 'limited', 'over the limit');
  assert.equal(await admitCaller(word('suspended'), 'create-payment', USER), 'suspended');
  assert.equal(await admitCaller(word('inactive'), 'create-payment', USER), 'inactive');
});

test('active_account_rule · executed: each answer maps to one status and one sentence; only ok goes on', () => {
  assert.equal(admissionRefusal('ok'), null);
  assert.deepEqual(admissionRefusal('limited'), { status: 429, error: RATE_LIMITED });
  assert.deepEqual(admissionRefusal('suspended'), { status: 401, error: ACCOUNT_SUSPENDED });
  assert.deepEqual(admissionRefusal('inactive'), { status: 401, error: ACCOUNT_INACTIVE });
  assert.deepEqual(admissionRefusal('unknown'), { status: 503, error: ACCOUNT_UNCHECKED });
});

test('active_account_rule · executed: a fault in the check refuses the call (503), never lets it through, and its log names no one', async () => {
  for (const [why, rpc] of [
    ['a refused RPC', answer({ message: 'permission denied' }, 403)],
    ['a server error', answer('oops', 500)],
    ['an unreadable answer', answer('not json')],
    ['an unexpected answer', answer({ hits: 3 })],
    ['an old database without the check (a boolean)', answer(true)],
    ['a network failure', async () => { throw new TypeError(`fetch failed for ${USER}`); }],
  ]) {
    const [refused, lines] = await quietly(() => refuseUnadmitted(rpc, 'payment-methods', USER));
    assert.deepEqual(refused, { status: 503, error: ACCOUNT_UNCHECKED }, `${why}: refused`);
    assert.equal(lines.length, 1, `${why}: logged once`);
    assert.match(lines[0], /^payment-methods: account check failed/);
    assert.ok(!lines[0].includes(USER), `${why}: the log carries no user id`);
  }
});

test('B10 · executed: the app shows a refused call’s sentence as written (lib/payments, read only)', async () => {
  const { extractInvokeError } = await import(pathToFileURL(join(root, 'lib/payments/stripeRules.ts')).href);
  for (const [status, sentence] of [[429, RATE_LIMITED], [401, ACCOUNT_SUSPENDED], [401, ACCOUNT_INACTIVE], [503, ACCOUNT_UNCHECKED]]) {
    const refused = { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status, ok: false } };
    assert.deepEqual(extractInvokeError(refused, JSON.stringify({ error: sentence })), { status, message: sentence });
  }
});

const WIRING = [
  // function, the verified caller's id (lean K1: verifiedUser), where the admission's scope starts,
  // the line where that id is known, the first step the admission must precede
  ['create-payment', 'caller.id', 'Deno.serve(', 'if (caller instanceof Response) return caller;', "fetch(`${SUPABASE_URL}/rest/v1/rpc/begin_tip_payment`"],
  ['payment-methods', 'userId', 'Deno.serve(', "if (action !== 'list' && action !== 'setup' && action !== 'remove')", "if (action === 'list')"],
  // S4-12: onboarding reads the caller's payout status before anything else; the check comes first.
  ['connect-onboarding', 'user.id', 'async function resolveCaller(', 'if (user instanceof Response) return user;', 'rest/v1/rpc/my_payouts_status'],
  ['connect-status', 'userId', 'Deno.serve(', 'const userId = caller.id;', "serviceRpc('get_payment_account'"],
];

test('B10 + active_account_rule · wired: each payment function asks right after it knows the caller, before any other database call and before Stripe', () => {
  for (const [fn, id, scope, known, next] of WIRING) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    assert.match(src, /^import \{ refuseUnadmitted \} from '\.\.\/_shared\/rateLimit\.ts';$/m, `${fn}: imports the admission`);
    assert.doesNotMatch(src, /overHourlyLimit/, `${fn}: the old fail-open limiter is gone`);
    assert.match(src, /const (caller|user) = await verifiedUser\(req, /, `${fn}: the caller comes from the auth server`);
    const opening = `const denied = await refuseUnadmitted(serviceRpc, '${fn}', ${id}`;
    assert.equal(src.split(opening).length - 1, 1, `${fn}: exactly one admission call`);
    assert.equal(src.split('refuseUnadmitted(').length - 1, 1, `${fn}: no other admission call`);
    const at = src.indexOf(opening);
    const refusalLine = 'if (denied) return json({ error: denied.error }, denied.status);';
    assert.ok(src.indexOf(refusalLine, at) > at && src.indexOf(refusalLine, at) - at < 200, `${fn}: the refusal answers at once`);
    const scopeAt = src.indexOf(scope);
    const knownAt = src.indexOf(known);
    const nextAt = src.indexOf(next, knownAt);
    assert.ok(scopeAt > 0 && scopeAt < knownAt && knownAt < at, `${fn}: after the caller is known`);
    assert.ok(nextAt > at, `${fn}: before its next step`);
    // Every provider helper is defined above the handler; nothing between the scope's start and the
    // admission calls the database or the provider (verifiedUser, the auth server, excepted).
    const STRIPE_CALL = /\b(stripe|stripeGet|stripeV2|listCards|ensureCustomer|storedCustomer)\(/;
    const before = src.slice(scopeAt, at);
    assert.doesNotMatch(before, STRIPE_CALL, `${fn}: no provider call before the admission`);
    assert.doesNotMatch(before, /\bserviceRpc\(|\bfetch\(/, `${fn}: no database call before the admission`);
    assert.match(src.slice(at), STRIPE_CALL, `${fn}: the provider is reached after it`);
  }
  // payment-methods: a suspended account may list and remove its own cards, not save a new one (C1).
  assert.match(read('supabase/functions/payment-methods/index.ts'),
    /refuseUnadmitted\(serviceRpc, 'payment-methods', userId, \{ allowSuspended: action !== 'setup' \}\)/);
});
