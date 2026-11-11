// B10, the payment functions (docs/lean/AUDIT-LEDGER.md): one account cannot drive Stripe calls
// without bound. Deno cannot run here, so the shared limiter (supabase/functions/_shared/rateLimit.ts,
// no imports) is executed under node against a stubbed service RPC; the wiring in each of the four
// functions is fenced as text: after the caller is known, before the first Stripe call, answering 429.
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
const { overHourlyLimit, HOURLY_LIMITS, RATE_LIMITED } = await import(
  'data:text/javascript;charset=utf-8;base64,' +
    Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' }), 'utf8').toString('base64')
);

const USER = '00000000-0000-4000-8000-0000000000b1';
const answer = (body, status = 200) => async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

test('B10 · executed: one hit per call on the caller’s own hourly counter; over only when the database says so', async () => {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push([fn, args]);
    return answer(true)();
  };
  assert.equal(await overHourlyLimit(rpc, 'connect-status', USER), false, 'within the limit');
  assert.deepEqual(calls, [
    ['rate_limit_take', { p_user: USER, p_action: 'fn:connect-status', p_max: 300, p_window: '1 hour' }],
  ]);
  assert.equal(await overHourlyLimit(answer(false), 'create-payment', USER), true, 'over the limit');
});

test('B10 · executed: a fault in the check never stops a payment, and its log names no one', async () => {
  for (const [why, rpc] of [
    ['a refused RPC', answer({ message: 'permission denied' }, 403)],
    ['a server error', answer('oops', 500)],
    ['an unreadable answer', answer('not json')],
    ['an unexpected answer', answer({ hits: 3 })],
    ['a network failure', async () => { throw new TypeError(`fetch failed for ${USER}`); }],
  ]) {
    const [over, lines] = await quietly(() => overHourlyLimit(rpc, 'payment-methods', USER));
    assert.equal(over, false, `${why}: the call goes on`);
    assert.equal(lines.length, 1, `${why}: logged once`);
    assert.match(lines[0], /^payment-methods: rate limit check failed/);
    assert.ok(!lines[0].includes(USER), `${why}: the log carries no user id`);
  }
});

test('B10 · executed: the app shows a refused call’s sentence as written (lib/payments, read only)', async () => {
  const { extractInvokeError } = await import(pathToFileURL(join(root, 'lib/payments/stripeRules.ts')).href);
  const refused = { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status: 429, ok: false } };
  assert.deepEqual(extractInvokeError(refused, JSON.stringify({ error: RATE_LIMITED })), { status: 429, message: RATE_LIMITED });
});

const WIRING = [
  // function, the verified caller's id (lean K1: verifiedUser), the line where that id is known,
  // the first step the limiter must precede
  ['create-payment', 'caller.id', 'if (caller instanceof Response) return caller;', "fetch(`${SUPABASE_URL}/rest/v1/rpc/begin_tip_payment`"],
  ['payment-methods', 'userId', 'const userId = caller.id;', "if (action === 'list')"],
  ['connect-onboarding', 'userId', 'const userId = caller.userId;', "serviceRpc('get_payment_account'"],
  ['connect-status', 'userId', 'const userId = caller.id;', "serviceRpc('get_payment_account'"],
];

test('B10 · wired: each payment function checks after it knows the caller and before Stripe, answering 429', () => {
  for (const [fn, id, known, next] of WIRING) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    assert.match(src, /^import \{ overHourlyLimit, RATE_LIMITED \} from '\.\.\/_shared\/rateLimit\.ts';$/m, `${fn}: imports the limiter`);
    assert.match(src, /const (caller|user) = await verifiedUser\(req, /, `${fn}: the caller comes from the auth server`);
    const line = `if (await overHourlyLimit(serviceRpc, '${fn}', ${id})) return json({ error: RATE_LIMITED }, 429);`;
    assert.equal(src.split(line).length - 1, 1, `${fn}: exactly one limiter call`);
    assert.equal(src.split('overHourlyLimit(').length - 1, 1, `${fn}: no other limiter call`);
    const at = src.indexOf(line);
    const knownAt = src.indexOf(known);
    const nextAt = src.indexOf(next, knownAt);
    assert.ok(knownAt > 0 && knownAt < at, `${fn}: after the caller is known`);
    assert.ok(nextAt > at, `${fn}: before its next step`);
    // Every provider helper is defined above the handler; the handler calls none before the limiter,
    // and does call one after it.
    const STRIPE_CALL = /\b(stripe|stripeGet|stripeV2|listCards|ensureCustomer|storedCustomer)\(/;
    const handler = src.indexOf('Deno.serve(');
    assert.ok(handler > 0 && handler < knownAt, `${fn}: one handler`);
    assert.doesNotMatch(src.slice(handler, at), STRIPE_CALL, `${fn}: no provider call before the limiter`);
    assert.match(src.slice(at), STRIPE_CALL, `${fn}: the provider is reached after it`);
  }
});
