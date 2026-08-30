import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// ---------------------------------------------------------------------------
// The tip branch of create-payment (R6c, D4), pinned as raw text
// ---------------------------------------------------------------------------
//
// create-payment is Deno and nothing here runs Deno, so the handler is
// unproven by any harness — said so in the run report rather than papered
// over. What CAN be held still is its shape: the tip RPC is reached only under
// the tip parameter, the job branch's call site is the same bytes it was
// before the tip existed, the tip amount is validated before any RPC, and the
// response never carries an amount. Each is a text assertion over the file,
// the shape tests/stripePayments.test.mjs established for the same function.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'supabase/functions/create-payment/index.ts';
const source = readFileSync(join(root, FILE), 'utf8');

/** Drop `//` comments so prose never counts as code. */
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, '');
/** Collapse whitespace so a call site can be pinned as one line. */
const flatten = (s) => s.replace(/\s+/g, ' ').trim();

const code = stripComments(source);
const flat = flatten(code);

const count = (haystack, needle) => haystack.split(needle).length - 1;

/** The job branch's call site, exactly as R6a shipped it (flattened). */
const JOB_CALL =
  "await fetch(`${SUPABASE_URL}/rest/v1/rpc/begin_job_payment`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_job_id: jobId }), })";

/** The tip branch's call site: same token, same key, the amount as the RPC's second argument. */
const TIP_CALL =
  "await fetch(`${SUPABASE_URL}/rest/v1/rpc/begin_tip_payment`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_job_id: jobId, p_amount_cents: tipAmountCents }), })";

test('1 · begin_tip_payment is called exactly once, and only under the tip parameter', () => {
  assert.equal(count(code, 'rpc/begin_tip_payment'), 1, 'one tip RPC call site');
  assert.equal(count(code, 'rpc/begin_job_payment'), 1, 'one job RPC call site');
  const expected = `const begun = tipAmountCents != null ? ${TIP_CALL} : ${JOB_CALL};`;
  assert.ok(flat.includes(expected), 'the two call sites hang off one ternary on tipAmountCents');
});

test('2 · the job branch call site is the same bytes it was before the tip existed', () => {
  assert.ok(flat.includes(JOB_CALL), 'begin_job_payment is still called with the caller token, the anon key and { p_job_id: jobId } alone');
  assert.doesNotMatch(code, /begin_job_payment[^\n]*p_amount_cents/, 'the job RPC never receives an amount');
});

test('3 · the tip amount is validated before any RPC call, and refused with a plain sentence', () => {
  const sentence = 'A tip must be a whole number of cents greater than zero.';
  assert.equal(count(code, sentence), 1);
  const handler = code.indexOf('Deno.serve(');
  const validation = code.indexOf(sentence, handler);
  const firstRpc = code.indexOf('/rest/v1/rpc/', handler);
  const firstServiceCall = code.indexOf('serviceRpc(', handler);
  assert.ok(handler > 0 && validation > handler, 'the validation lives in the handler');
  assert.ok(firstRpc > validation, 'the 400 precedes the user-token RPC call');
  assert.ok(firstServiceCall > validation, 'the 400 precedes every service_role RPC call');
  assert.match(
    flat,
    /if \(typeof rawTip !== 'number' \|\| !Number\.isInteger\(rawTip\) \|\| rawTip <= 0\) \{ return json\(\{ error: 'A tip must be a whole number of cents greater than zero\.' \}, 400\); \}/,
    'a non-integer or non-positive amount is a 400 — integer cents, strictly positive'
  );
  assert.match(flat, /const rawTip = body\.tipAmountCents \?\? body\.tip_amount_cents;/, 'both spellings are accepted');
  assert.match(flat, /let tipAmountCents: number \| null = null;/, 'absent means null, which is the job path');
});

test('4 · the response is the same four strings, and no amount ever leaves this function', () => {
  const response =
    'return json({ paymentId, customerId, clientSecret: intent.body.client_secret, ephemeralKeySecret: ephemeral.body.secret, });';
  assert.ok(flat.includes(response), 'the 200 body is exactly paymentId, customerId, clientSecret, ephemeralKeySecret');
  const start = flat.indexOf(response);
  const literal = flat.slice(start, start + response.length);
  assert.doesNotMatch(literal, /amount/i, 'no amount in the response literal');
  assert.equal(count(code, 'charge_amount_cents'), 3, 'the row column is read for the sanity check and the intent, never derived');
  assert.match(flat, /amount: String\(amount\),/, 'the one number sent to the provider is the row\'s own charge_amount_cents, tip or job alike');
});

test('5 · the intent idempotency key is unchanged — a tip row has its own id, so no key change was needed', () => {
  assert.equal(count(code, 'brazos-intent-${paymentId}'), 1);
  assert.doesNotMatch(code, /brazos-tip-/, 'no second key shape');
});

test('6 · the RPC refusal text is passed through verbatim on both branches, and the log names the RPC that refused', () => {
  assert.match(flat, /const message = detail\.message \?\? 'Could not start this payment\.';/);
  assert.match(flat, /return json\(\{ error: message \}, status\);/);
  assert.match(
    flat,
    /create-payment: \$\{tipAmountCents != null \? 'begin_tip_payment' : 'begin_job_payment'\} \$\{begun\.status\}: \$\{message\}/
  );
});

test('7 · neither RPC is ever called with the service key', () => {
  // The two user-token calls carry `Authorization: auth`; serviceRpc is for
  // the writes no client may make (customer, provider ref) and nothing else.
  assert.doesNotMatch(code, /serviceRpc\('begin_/, 'begin_* is never a service_role call');
  for (const fn of ['get_payment_customer', 'set_payment_customer', 'attach_provider_ref']) {
    assert.equal(count(code, `serviceRpc('${fn}'`), 1, `${fn} stays service_role`);
  }
});
