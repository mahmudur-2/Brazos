import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  REFUND_STOP_CODES,
  settlementKey,
  settlementVerdict,
} from '../supabase/functions/process-settlements/classify.mjs';

// ---------------------------------------------------------------------------
// lean B16 / B17 — docs/critical/money-safety.md
// ---------------------------------------------------------------------------
//
// The drain's two pure decisions (classify.mjs) are EXECUTED here: the key of
// an attempt and the verdict on an answer. The drain itself is Deno and nothing
// here runs it; its order (begin, POST, write-back) is checked as source text,
// and the stories it produces (refused then funded, unknown then silence, an
// idempotency error, a replayed old key) run against the real schema in
// supabase/tests/370_money_conservation.sql. The app's payment selects are
// checked against the column grant (20261112010800) as text.

const ID = '3f2b6c1e-9a4d-4e7b-8c21-5d0f7a9b1c33';

const answer = (status, body) => ({ status, body, threw: null });
const refusal = (status, code, message, type = 'invalid_request_error') =>
  answer(status, { error: { code, message, type } });

test('1 · the key is the kind, the payment and the attempt: nothing else', () => {
  assert.equal(settlementKey('transfer', ID, 0), `tr:${ID}:0`);
  assert.equal(settlementKey('refund', ID, 3), `rf:${ID}:3`);
  assert.equal(settlementKey('transfer', ID.toUpperCase(), 1), `tr:${ID}:1`, 'one payment, one spelling');
  assert.notEqual(settlementKey('transfer', ID, 0), settlementKey('transfer', ID, 1), 'a new attempt is a new key');
  assert.notEqual(settlementKey('transfer', ID, 0), settlementKey('refund', ID, 0), 'a transfer never shares a refund key');
});

test('2 · the key never depends on the clock or on chance', () => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const first = settlementKey('transfer', ID, 2);
  try {
    Date.now = () => 0;
    Math.random = () => 0.999;
    assert.equal(settlementKey('transfer', ID, 2), first, 'at the epoch');
    Date.now = () => 8.64e15;
    Math.random = () => 0;
    assert.equal(settlementKey('transfer', ID, 2), first, 'at the end of time');
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
  const src = readFileSync(new URL('../supabase/functions/process-settlements/classify.mjs', import.meta.url), 'utf8')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /Date|Math\.random|crypto|performance|import\s/, 'classify.mjs reads no clock, no randomness, no module');
});

test('3 · a malformed key request is refused, never guessed', () => {
  for (const [label, call] of [
    ['an unknown kind', () => settlementKey('payout', ID, 0)],
    ['a missing kind', () => settlementKey(undefined, ID, 0)],
    ['an id that is not a uuid', () => settlementKey('transfer', 'pay_1', 0)],
    ['a missing id', () => settlementKey('transfer', undefined, 0)],
    ['a negative attempt', () => settlementKey('transfer', ID, -1)],
    ['a fractional attempt', () => settlementKey('transfer', ID, 1.5)],
    ['an attempt as text', () => settlementKey('transfer', ID, '1')],
    ['a missing attempt', () => settlementKey('transfer', ID)],
  ]) {
    assert.throws(call, TypeError, label);
  }
});

test('4 · sent: a 2xx with the object id and a positive amount, and nothing else', () => {
  const t = settlementVerdict('transfer', answer(200, { id: 'tr_1', amount: 4625, object: 'transfer' }));
  assert.deepEqual(t, { result: 'sent', next: 'write_back', deferred: false, code: null, message: '200 tr_1', ref: 'tr_1', amount: 4625 });
  for (const id of ['re_1', 'pyr_1']) {
    const r = settlementVerdict('refund', answer(200, { id, amount: 750 }));
    assert.equal(r.next, 'write_back', id);
    assert.equal(r.ref, id);
  }
  for (const [label, kind, body] of [
    ['a refund id on a transfer', 'transfer', { id: 're_1', amount: 1 }],
    ['a transfer id on a refund', 'refund', { id: 'tr_1', amount: 1 }],
    ['no id', 'transfer', { amount: 1 }],
    ['no amount', 'transfer', { id: 'tr_1' }],
    ['a zero amount', 'transfer', { id: 'tr_1', amount: 0 }],
    ['an amount as text', 'transfer', { id: 'tr_1', amount: '4625' }],
    ['an empty body', 'refund', {}],
    ['no body', 'refund', undefined],
  ]) {
    const v = settlementVerdict(kind, answer(200, body));
    assert.equal(v.result, 'unknown', `${label}: unknown`);
    assert.equal(v.next, 'same_key', `${label}: the same key again, never a new one`);
    assert.equal(v.ref, null, `${label}: nothing to write back`);
  }
});

test('5 · refused: a 4xx that proves the key moved nothing takes a new key; balance_insufficient is only deferred', () => {
  const funds = settlementVerdict('transfer', refusal(400, 'balance_insufficient', 'Insufficient funds'));
  assert.equal(funds.result, 'refused');
  assert.equal(funds.next, 'new_key');
  assert.equal(funds.deferred, true, 'a wait for balance never needs the owner');
  for (const [status, code] of [[400, 'resource_missing'], [400, 'parameter_invalid_integer'], [402, 'card_declined'], [404, 'resource_missing'], [422, null]]) {
    const v = settlementVerdict('transfer', refusal(status, code, 'no'));
    assert.equal(v.next, 'new_key', `${status} ${code}`);
    assert.equal(v.deferred, false, `${status} ${code}: failed, not deferred`);
  }
});

test('6 · refunds: the four refusals that cannot fix themselves stop; the rest retry on a new key', () => {
  assert.deepEqual([...REFUND_STOP_CODES], ['charge_already_refunded', 'charge_disputed', 'refund_disputed_payment', 'amount_too_large']);
  assert.ok(Object.isFrozen(REFUND_STOP_CODES));
  for (const code of REFUND_STOP_CODES) {
    const r = settlementVerdict('refund', refusal(400, code, 'no'));
    assert.equal(r.next, 'stop', `refund ${code}: stop`);
    assert.equal(r.result, 'refused');
    assert.equal(settlementVerdict('transfer', refusal(400, code, 'no')).next, 'new_key', `transfer ${code}: a transfer is not stopped by a refund code`);
  }
  for (const code of ['balance_insufficient', 'resource_missing', 'charge_expired_for_capture', null]) {
    assert.equal(settlementVerdict('refund', refusal(400, code, 'no')).next, 'new_key', `refund ${code}: a new key`);
  }
});

test('7 · unknown: the same key for every answer that proves nothing about the key', () => {
  const cases = [
    ['401', refusal(401, null, 'Invalid API Key provided')],
    ['403', refusal(403, 'account_invalid', 'No access')],
    ['409 in use', refusal(409, 'idempotency_key_in_use', 'In use', 'idempotency_error')],
    ['409 lock', refusal(409, 'lock_timeout', 'Locked')],
    ['429', refusal(429, 'rate_limit', 'Slow down', 'rate_limit_error')],
    ['500', refusal(500, 'api_error', 'Oops', 'api_error')],
    ['503 no body', answer(503, undefined)],
    ['a 3xx', answer(302, {})],
    ['no status', answer(undefined, {})],
    ['a throw', { threw: new Error('fetch failed') }],
    ['a timeout', { threw: Object.assign(new Error('timed out'), { name: 'TimeoutError' }) }],
    ['nothing at all', undefined],
  ];
  for (const kind of ['transfer', 'refund']) {
    for (const [label, outcome] of cases) {
      const v = settlementVerdict(kind, outcome);
      assert.equal(v.result, 'unknown', `${kind} ${label}: unknown`);
      assert.equal(v.next, 'same_key', `${kind} ${label}: the same key`);
      assert.equal(v.deferred, true, `${kind} ${label}: deferred`);
    }
  }
});

test('8 · an idempotency error stops the row at once, for both kinds', () => {
  for (const kind of ['transfer', 'refund']) {
    const v = settlementVerdict(kind, refusal(400, 'idempotency_error',
      'Keys for idempotent requests can only be used with the same parameters they were first used with.', 'idempotency_error'));
    assert.equal(v.next, 'stop', `${kind}: stop`);
    assert.equal(v.deferred, false, `${kind}: failed, a person looks`);
    // No code, only the type: still a stop.
    assert.equal(settlementVerdict(kind, answer(400, { error: { type: 'idempotency_error', message: 'x' } })).next, 'stop');
  }
});

test('9 · over every status from 100 to 599: a new key only for a 4xx that proves nothing moved', () => {
  for (const kind of ['transfer', 'refund']) {
    for (let status = 100; status <= 599; status++) {
      const v = settlementVerdict(kind, answer(status, {}));
      const refused = status >= 400 && status < 500 && ![401, 403, 409, 429].includes(status);
      assert.equal(v.next, refused ? 'new_key' : 'same_key', `${kind} ${status}`);
      assert.notEqual(v.next, 'write_back', `${kind} ${status}: never written back without an id`);
    }
  }
});

test('10 · every verdict has the same shape', () => {
  for (const [kind, outcome] of [
    ['transfer', answer(200, { id: 'tr_1', amount: 1 })],
    ['refund', refusal(400, 'charge_disputed', 'x')],
    ['transfer', refusal(400, 'balance_insufficient', 'x')],
    ['refund', { threw: 'ECONNRESET' }],
    ['transfer', answer(400, 'x'.repeat(5000))],
  ]) {
    const v = settlementVerdict(kind, outcome);
    assert.deepEqual(Object.keys(v).sort(), ['amount', 'code', 'deferred', 'message', 'next', 'ref', 'result']);
    assert.ok(['sent', 'refused', 'unknown'].includes(v.result));
    assert.ok(['write_back', 'new_key', 'same_key', 'stop'].includes(v.next));
    assert.equal(typeof v.deferred, 'boolean');
    assert.equal(typeof v.message, 'string');
    assert.ok(v.message.length > 0 && v.message.length <= 320, 'a bounded message');
  }
  assert.throws(() => settlementVerdict('payout', answer(200, {})), TypeError);
});

// ---------------------------------------------------------------------------
// The drain, as source text: begin, then POST, then write-back, in both passes.
// ---------------------------------------------------------------------------
test('11 · each pass begins before it posts and writes back after, with the attempt it read', () => {
  const src = readFileSync(new URL('../supabase/functions/process-settlements/index.ts', import.meta.url), 'utf8');
  assert.match(src, /^import \{ settlementKey, settlementVerdict \} from '\.\/classify\.mjs';$/m);
  const one = src.indexOf('// Pass one:');
  const two = src.indexOf('// Pass two:');
  const serve = src.indexOf('Deno.serve(');
  assert.ok(one > -1 && two > one && serve > two, 'the two passes and the handler, in order');
  for (const [kind, pass, path] of [
    ['transfer', src.slice(one, two), "'/v1/transfers'"],
    ['refund', src.slice(two, serve), "'/v1/refunds'"],
  ]) {
    const attempt = pass.indexOf(`const attempt = row.${kind}_attempts ?? 0;`);
    const begin = pass.indexOf(`await beginSend('${kind}', row.id, attempt);`);
    const skip = pass.indexOf('if (!begun) {');
    const post = pass.indexOf(path);
    const key = pass.indexOf(`settlementKey('${kind}', row.id, attempt)`);
    const settle = pass.indexOf(`await settle(counts, '${kind}', row.id, attempt, outcome);`);
    assert.ok(attempt > -1 && begin > attempt, `${kind}: the attempt is read, then begin`);
    assert.ok(skip > begin && post > skip, `${kind}: a false begin skips the row before the POST`);
    assert.ok(key > post, `${kind}: the POST carries the attempt's key`);
    assert.ok(settle > key, `${kind}: the answer is written back after the POST`);
    assert.equal(pass.split('await settle(').length - 1, 1, `${kind}: one write-back per row`);
    assert.equal(pass.split(path).length - 1, 1, `${kind}: one POST per row`);
    assert.match(pass, /outcome = \{ threw: err \?\? 'unknown' \};/, `${kind}: a throw is an answer too`);
  }
  assert.match(src, /'settlement_send_begin',\s*\{ p_payment_id: paymentId, p_kind: kind, p_attempt: attempt \}/);
  assert.match(src, /'record_settlement_sent',\s*\{ p_payment_id: paymentId, p_kind: kind, p_ref: verdict\.ref, p_amount_cents: verdict\.amount \}/);
  assert.match(src, /'record_settlement_result',\s*\{ p_payment_id: paymentId, p_kind: kind, p_attempt: attempt, p_next: verdict\.next, p_error: verdict\.message \}/);
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /record_settlement_attempt/, 'the R6b recorder is no longer called');
  assert.doesNotMatch(code, /`(tr|rf):\$\{/, 'no key is built outside settlementKey');
  assert.doesNotMatch(code, /Date\.now|new Date/, 'the drain keeps no clock of its own; the database does');
});

// ---------------------------------------------------------------------------
// B17: every column the app selects from payments is granted to authenticated.
// ---------------------------------------------------------------------------
const columnsOf = (list) => list.split(',').map((c) => c.trim()).filter(Boolean);

/** Build 10 (9b0064f), frozen: the installed app's payment selects. */
const BUILD_10_SELECTS = Object.freeze([
  'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at, charge_amount_cents, customer_fee_cents, tax_cents, funding_due_at, release_requested_at, transfer_cents, refund_cents, refund_reason',
  'job_id, status, release_requested_at, provider',
  'id, job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents, provider, provider_ref, status, authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at, release_requested_at',
]);

test('12 · the column grant covers every payment select of the app and of build 10', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261112010800_payments_column_grants.sql', import.meta.url), 'utf8');
  const grant = migration.match(/grant select \(([^)]*)\)\s+on table public\.payments to authenticated;/);
  assert.ok(grant, 'the column grant is found');
  const granted = new Set(columnsOf(grant[1]));
  assert.equal(granted.size, 26, 'twenty-six columns');
  assert.match(migration, /revoke select on table public\.payments from authenticated;/, 'the whole-table grant is withdrawn first');

  const selects = [];
  const payments = readFileSync(new URL('../lib/payments.ts', import.meta.url), 'utf8');
  const constant = payments.match(/const PAYMENT_COLUMNS =\s*'([^']*)';/);
  assert.ok(constant, 'PAYMENT_COLUMNS is found');
  for (const [file, text] of [['lib/payments.ts', payments], ['lib/earnings.ts', readFileSync(new URL('../lib/earnings.ts', import.meta.url), 'utf8')]]) {
    const reads = [...text.matchAll(/\.from\('payments'\)\s*\.select\(\s*(?:'([^']*)'|(PAYMENT_COLUMNS))\s*\)/g)];
    assert.equal(reads.length, text.split(".from('payments')").length - 1, `${file}: every payments read has a select this test can read`);
    for (const m of reads) selects.push([file, m[1] ?? constant[1]]);
  }
  assert.ok(selects.length >= 4, 'the four app reads are found');
  for (const list of BUILD_10_SELECTS) selects.push(['build 10', list]);
  for (const [where, list] of selects) {
    for (const column of columnsOf(list)) {
      assert.ok(granted.has(column), `${where}: payments.${column} is selected but not granted`);
    }
  }
  assert.ok(!selects.some(([, list]) => list.trim() === '*'), 'no app read selects *');
});
