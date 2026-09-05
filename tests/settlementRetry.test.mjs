import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFERRED_CODES,
  classifySettlementFailure,
} from '../supabase/functions/process-settlements/classify.mjs';

// ---------------------------------------------------------------------------
// The part of process-settlements a test in this repository can execute
// ---------------------------------------------------------------------------
//
// process-settlements is Deno and nothing here runs Deno, so the drain itself
// is unproven by any harness — said so in the run report rather than papered
// over. One piece is different: the CLASSIFICATION of a failed provider call
// into "rotate the idempotency key or keep it" and "deferred or failed". It is
// pure, it lives in its own .mjs file, and it is imported unchanged by the
// Deno function and by this file — the shape connect.test.mjs established.
//
// THE RULE UNDER TEST (R6b D1), as one predicate:
//   rotate = status >= 400 && status < 500 && status !== 409 && status !== 429
//   a throw is never a rotation
// and (D7): deferred = balance_insufficient, 409, 429, 5xx, a throw; failed =
// any other 4xx. The 5xx-does-not-rotate and 409-does-not-rotate cases are
// the ones that matter — rotated, each is a second payment — so they are
// EXECUTED here, not asserted as text.

/** A provider error response in the shape the API returns. */
const refusal = (status, code, message, type = 'invalid_request_error') => ({
  status,
  body: { error: { code, message, type } },
  threw: null,
});

/** Asserts BOTH flags, every case. */
const both = (verdict, rotate, deferred, label) => {
  assert.equal(verdict.rotate, rotate, `${label}: rotate must be ${rotate}`);
  assert.equal(verdict.deferred, deferred, `${label}: deferred must be ${deferred}`);
};

test('0 · the deferred vocabulary is balance_insufficient alone, and frozen', () => {
  assert.deepEqual([...DEFERRED_CODES], ['balance_insufficient']);
  assert.ok(Object.isFrozen(DEFERRED_CODES));
});

test('1 · 400 balance_insufficient rotates AND defers — ordinary timing, and rotation is what un-wedges the cached error', () => {
  const verdict = classifySettlementFailure(
    refusal(400, 'balance_insufficient', 'You have insufficient available funds in your Stripe account.')
  );
  both(verdict, true, true, '400 balance_insufficient');
  assert.equal(verdict.code, 'balance_insufficient');
  assert.equal(verdict.message, '400 balance_insufficient: You have insufficient available funds in your Stripe account.');
});

test('2 · a terminal 400 rotates and does not defer — it will refuse again until a human acts', () => {
  const cases = [
    ['no such destination', refusal(400, 'resource_missing', "No such destination: 'acct_1Nope'")],
    ['already refunded', refusal(400, 'charge_already_refunded', 'Charge ch_1 has already been refunded.')],
    ['a parameter error', refusal(400, 'parameter_invalid_integer', 'Invalid integer: 92.5')],
    ['a bad key', refusal(401, undefined, 'Invalid API Key provided', 'invalid_request_error')],
    ['a forbidden call', refusal(403, 'account_invalid', 'The provided key does not have access to account acct_1.')],
    ['a missing resource', refusal(404, 'resource_missing', 'No such payment_intent: pi_1')],
  ];
  for (const [label, outcome] of cases) {
    const verdict = classifySettlementFailure(outcome);
    both(verdict, true, false, label);
    assert.ok(verdict.message.startsWith(String(outcome.status)), `${label}: the message leads with the status`);
  }
});

test('3 · 402 rotates and does not defer', () => {
  const verdict = classifySettlementFailure(refusal(402, 'card_declined', 'Your card was declined.', 'card_error'));
  both(verdict, true, false, '402');
  assert.equal(verdict.rotate, true);
  assert.equal(verdict.code, 'card_declined');
});

test('4 · 409 keeps the key and defers — the original request may still be executing', () => {
  both(
    classifySettlementFailure(
      refusal(409, 'idempotency_key_in_use', 'There is currently another in-progress request using this Idempotent Key', 'idempotency_error')
    ),
    false,
    true,
    '409 idempotency_key_in_use'
  );
  both(
    classifySettlementFailure(refusal(409, 'lock_timeout', 'This object cannot be accessed right now because another API request or Stripe process is currently accessing it.')),
    false,
    true,
    '409 lock_timeout'
  );
  // The dangerous case, pinned on its own: a 409 rotated is a second payment.
  assert.equal(classifySettlementFailure(refusal(409, 'idempotency_key_in_use', 'in use')).rotate, false);
});

test('5 · 429 keeps the key and defers — the rate limiter runs ahead of the idempotency layer', () => {
  const verdict = classifySettlementFailure(refusal(429, 'rate_limit', 'Too many requests.', 'rate_limit_error'));
  both(verdict, false, true, '429');
  assert.equal(verdict.code, 'rate_limit');
});

test('6 · 500 keeps the key and defers — money may already have moved under this key', () => {
  both(classifySettlementFailure(refusal(500, 'api_error', 'Something went wrong on our end.', 'api_error')), false, true, '500');
  both(classifySettlementFailure({ status: 500, body: {}, threw: null }), false, true, '500 empty body');
  // The dangerous case, pinned on its own: a 5xx rotated is a second payment.
  assert.equal(classifySettlementFailure({ status: 500, body: {} }).rotate, false);
});

test('7 · 503 keeps the key and defers, and so does every other 5xx', () => {
  both(classifySettlementFailure({ status: 503, body: {}, threw: null }), false, true, '503');
  both(classifySettlementFailure({ status: 502, body: '<html>Bad Gateway</html>', threw: null }), false, true, '502 html');
  both(classifySettlementFailure({ status: 504, body: undefined, threw: null }), false, true, '504 no body');
});

test('8 · a throw keeps the key and defers — the request may have reached the provider', () => {
  const throws = [
    ['an Error', new Error('fetch failed')],
    ['a TypeError', new TypeError('fetch failed')],
    ['an abort', Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })],
    ['a string', 'ECONNRESET'],
    ['a number', 42],
    ['an object', { name: 'TimeoutError' }],
  ];
  for (const [label, threw] of throws) {
    const verdict = classifySettlementFailure({ status: undefined, body: undefined, threw });
    both(verdict, false, true, label);
    assert.equal(verdict.code, null, `${label}: no provider code`);
    assert.ok(verdict.message.startsWith('threw: '), `${label}: the message says it threw`);
  }
  // A throw wins over whatever status happens to be present.
  both(classifySettlementFailure({ status: 400, body: {}, threw: new Error('late') }), false, true, 'throw with a stale 4xx');
  assert.equal(classifySettlementFailure({ status: 400, body: {}, threw: new Error('fetch failed') }).message, 'threw: fetch failed');
});

test('9 · a malformed or empty body on a 4xx rotates, does not defer, and the message degrades rather than crashes', () => {
  const bodies = [
    ['an empty object', {}, '400: empty body'],
    ['undefined', undefined, '400: no body'],
    ['null', null, '400: no body'],
    ['an html string', '<html>Bad Request</html>', '400: <html>Bad Request</html>'],
    ['an array', [], '400: []'],
    ['error as a string', { error: 'nope' }, '400: {"error":"nope"}'],
    ['error with the wrong types', { error: { code: 5, message: null } }, '400: {"error":{"code":5,"message":null}}'],
    ['error with nothing in it', { error: {} }, '400: {"error":{}}'],
    ['a code and no message', { error: { code: 'resource_missing' } }, '400 resource_missing'],
    ['a message and no code', { error: { message: 'Bad request' } }, '400: Bad request'],
  ];
  for (const [label, body, message] of bodies) {
    const verdict = classifySettlementFailure({ status: 400, body, threw: null });
    both(verdict, true, false, label);
    assert.equal(typeof verdict.message, 'string', `${label}: a string message`);
    assert.ok(verdict.message.length > 0, `${label}: never empty`);
    assert.equal(verdict.message, message, `${label}: the degraded message`);
  }
  // Only balance_insufficient defers a 4xx; a malformed body never does.
  both(classifySettlementFailure({ status: 400, body: { error: { code: 'balance_insufficient' } } }), true, true, 'balance_insufficient with no message');
  assert.equal(classifySettlementFailure({ status: 400, body: { error: { code: 'balance_insufficient' } } }).message, '400 balance_insufficient');
  // A very long body is bounded, and a body that cannot be serialised does not throw.
  const long = classifySettlementFailure({ status: 400, body: 'x'.repeat(5000) });
  assert.ok(long.message.length <= 220, 'bounded');
  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => classifySettlementFailure({ status: 400, body: circular }));
  const longThrow = classifySettlementFailure({ threw: new Error('y'.repeat(5000)) });
  assert.ok(longThrow.message.length <= 320, 'a thrown message is bounded too');
});

test('10 · the predicate, stated once, holds over every status from 400 to 599', () => {
  for (let status = 400; status <= 599; status++) {
    const verdict = classifySettlementFailure({ status, body: {}, threw: null });
    const expectRotate = status < 500 && status !== 409 && status !== 429;
    assert.equal(verdict.rotate, expectRotate, `${status}: rotate`);
    // With no provider code a 4xx is failed and everything else is deferred.
    assert.equal(verdict.deferred, !expectRotate, `${status}: deferred`);
  }
});

test('11 · an unrecognised outcome never rotates: no status, a 2xx, a 3xx, a non-integer, a non-object', () => {
  for (const [label, outcome] of [
    ['no status', { body: {}, threw: null }],
    ['a 200', { status: 200, body: {}, threw: null }],
    ['a 302', { status: 302, body: {}, threw: null }],
    ['a fractional status', { status: 400.5, body: {}, threw: null }],
    ['a string status', { status: '400', body: {}, threw: null }],
    ['an empty outcome', {}],
    ['undefined', undefined],
    ['null', null],
    ['a string', 'boom'],
  ]) {
    const verdict = classifySettlementFailure(outcome);
    both(verdict, false, true, label);
    assert.equal(typeof verdict.message, 'string', `${label}: still a string message`);
  }
});

test('12 · every result carries both flags as booleans, a code that is null or a string, and a non-empty message', () => {
  const outcomes = [
    refusal(400, 'balance_insufficient', 'Insufficient funds'),
    refusal(400, 'resource_missing', 'No such destination'),
    refusal(402, 'card_declined', 'Declined'),
    refusal(409, 'idempotency_key_in_use', 'In use'),
    refusal(429, 'rate_limit', 'Slow down'),
    refusal(500, 'api_error', 'Oops'),
    { status: 503, body: {} },
    { threw: new Error('fetch failed') },
    { status: 400, body: undefined },
  ];
  for (const outcome of outcomes) {
    const verdict = classifySettlementFailure(outcome);
    assert.deepEqual(Object.keys(verdict).sort(), ['code', 'deferred', 'message', 'rotate']);
    assert.equal(typeof verdict.rotate, 'boolean');
    assert.equal(typeof verdict.deferred, 'boolean');
    assert.ok(verdict.code === null || typeof verdict.code === 'string');
    assert.equal(typeof verdict.message, 'string');
    assert.ok(verdict.message.length > 0);
  }
});

// ---------------------------------------------------------------------------
// The drain itself, as raw text — this repository's normal fence shape for a
// Deno handler nothing here can load.
// ---------------------------------------------------------------------------
test('13 · the drain (raw text): refunds_due select names refund_attempts, both keys carry their counter, classify.mjs is imported by relative path, the recorder runs in both passes, and (n4b) only an ENABLED payout account is paid', () => {
  const src = readFileSync(new URL('../supabase/functions/process-settlements/index.ts', import.meta.url), 'utf8');

  // The refunds query reads the counter the key is built from; the transfers
  // query still reads its own.
  assert.match(src, /refunds_due\?select=id,provider_ref,refund_cents,refund_attempts&/, 'refunds_due select names refund_attempts');
  assert.match(src, /transfers_due\?select=id,payee_id,transfer_cents,transfer_attempts&/, 'transfers_due select still names transfer_attempts');

  // Both idempotency keys carry their counter, and the counter-less refund
  // key — the one that could not be rotated even by hand — is gone.
  assert.match(src, /`tr:\$\{row\.id\}:\$\{row\.transfer_attempts \?\? 0\}`/, 'the transfer key is tr:<id>:<transfer_attempts>');
  assert.match(src, /`rf:\$\{row\.id\}:\$\{row\.refund_attempts \?\? 0\}`/, 'the refund key is rf:<id>:<refund_attempts>');
  assert.ok(!/`rf:\$\{row\.id\}`/.test(src), 'the counter-less refund key is gone');

  // The classifier is the sibling this file executes, imported by relative
  // path, and it is what decides rotate and deferred.
  assert.match(src, /^import \{ classifySettlementFailure \} from '\.\/classify\.mjs';$/m, 'classify.mjs is imported by relative path');
  assert.match(src, /const verdict = classifySettlementFailure\(outcome\);/, 'and its verdict is the one the drain acts on');
  assert.match(src, /await recordAttempt\(kind, paymentId, verdict\.rotate, verdict\.message\)/, 'rotate comes from the verdict, never from the drain');

  // record_settlement_attempt is called through the one recorder, and the
  // recorder runs in both passes — on a refusal and on a throw alike.
  assert.match(src, /serviceRpc\('record_settlement_attempt', \{/, 'the recorder calls record_settlement_attempt through serviceRpc');
  assert.match(src, /p_payment_id: paymentId,\s*p_kind: kind,\s*p_rotate: rotate,\s*p_error: error,/, 'with the four arguments the RPC declares');
  const one = src.indexOf('// Pass one:');
  const two = src.indexOf('// Pass two:');
  const serve = src.indexOf('Deno.serve(');
  assert.ok(one > -1 && two > one && serve > two, 'the two pass sections and the handler are found, in order');
  const passOne = src.slice(one, two);
  const passTwo = src.slice(two, serve);
  assert.match(passOne, /await recordFailure\(counts, 'transfer', row\.id, failure\);/, 'pass one records every non-success as a transfer');
  assert.match(passTwo, /await recordFailure\(counts, 'refund', row\.id, failure\);/, 'pass two records every non-success as a refund');
  assert.equal((passOne.match(/failure = \{ threw: err \?\? 'unknown' \};/g) ?? []).length, 1, 'pass one turns a throw into a recorded failure');
  assert.equal((passTwo.match(/failure = \{ threw: err \?\? 'unknown' \};/g) ?? []).length, 1, 'pass two turns a throw into a recorded failure');
  assert.match(src, /if \(!recorded\) counts\.defects\+\+;/, 'a row that could not be recorded counts as a defect');

  // n4b (2026-09-05): the drain pays only a payee whose payout account is
  // ENABLED — payment_accounts.payouts_enabled, derived by set_payouts_status()
  // — and a payee without one is counted blocked BEFORE the first provider
  // call in pass one, so nothing is fired and no idempotency key is spent.
  assert.match(
    src,
    /payment_accounts\?select=user_id,stripe_account_id&payouts_enabled=eq\.true&user_id=in\.\(/,
    'the payee lookup carries payouts_enabled=eq.true'
  );
  const blockedAt = passOne.indexOf('counts.blocked++');
  const transferAt = passOne.indexOf("'/v1/transfers'");
  assert.ok(blockedAt > -1, 'pass one has a blocked branch');
  assert.ok(transferAt > -1, 'pass one makes a /v1/transfers request');
  assert.ok(blockedAt < transferAt, 'the blocked branch runs before the first /v1/transfers request in runTransfers');

  // The tally the operator reads.
  assert.match(src, /\(\): Tally => \(\{ attempted: 0, succeeded: 0, deferred: 0, failed: 0, defects: 0, blocked: 0 \}\)/, 'the tally is { attempted, succeeded, deferred, failed, defects, blocked }');

  // Success still writes nothing back — said at both success sites, and no
  // ref is written from a response anywhere in the file.
  assert.equal((src.match(/SUCCESS WRITES NOTHING BACK/g) ?? []).length, 2, 'both success branches say nothing is written back');
  assert.ok(!/attach_provider_ref/.test(src.replace(/\/\/[^\n]*/g, '')), 'no ref is attached from here');
  assert.ok(!/transfer_ref|refund_ref/.test(src.replace(/\/\/[^\n]*/g, '')), 'and neither ref column is named outside a comment');
});
