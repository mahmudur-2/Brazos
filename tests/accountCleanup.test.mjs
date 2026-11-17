// production-36h S1, M3: the account cleanup pass (supabase/functions/_shared/accountCleanup.ts, no
// imports), executed under node against a stubbed fetch that plays PostgREST and Stripe. What must
// stay true: a Stripe customer is gone for ever once deleted, so the pass deletes only the customer
// its claimed row names, and it makes no other request: no file removal, nothing toward a payout
// account, even when a claimed row carries more fields; the step is safe to repeat; an answer that
// throws, is cut, empty or not JSON is no answer (never done, never refused); mayStart is asked before
// each Stripe request, and a request it refuses leaves its step not done; it records a step, a status
// and a code only, logs one fixed line (no secret, no Stripe id) only when the claim, a record or the
// pass fails, hands those lines back for the run's report (A14-F F2), and never throws into the
// settlements run. The database half (the claim, the record,
// the five proofs) is supabase/tests/501_account_cleanups.sql.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const HELPER = 'supabase/functions/_shared/accountCleanup.ts';
const source = readFileSync(join(root, HELPER), 'utf8').replace(/\r\n/g, '\n');
const { runAccountCleanups, ...others } = await import(
  'data:text/javascript;charset=utf-8;base64,' +
    Buffer.from(stripTypeScriptTypes(source, { mode: 'strip' }), 'utf8').toString('base64')
);

const SUPABASE = 'https://proj.supabase.test';
const SERVICE = { apikey: 'service-key-not-real', Authorization: 'Bearer service-key-not-real', 'Content-Type': 'application/json' };
const STRIPE_KEY = 'sk_test_not_real';
const CUS = 'cus_Dana';
const ROW = {
  id: '00000000-0000-4000-8000-0000000000c1',
  stripe_customer_id: CUS,
  customer_done: false,
};

const json = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
/** A body that throws while it is read: the run's timeout cut it after the headers came. */
const cut = (status = 200) =>
  new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"id":')); c.error(new Error('aborted')); } }), { status });

/** The happy world: every service answers as it does when the step succeeds. Override by key. */
function world(overrides = {}) {
  const answers = {
    claim: () => json([ROW]),
    record: () => json(''),
    customer: () => json({ id: CUS, object: 'customer', deleted: true }),
    // The READ (GET) of the same customer; asked only after the DELETE answered an error.
    read: () => json({ id: CUS, object: 'customer', deleted: true }),
    unknown: () => json({ error: { code: 'not_stubbed' } }, 500),
    ...overrides,
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const call = { method, url, headers: init.headers ?? {}, body: init.body === undefined ? undefined : JSON.parse(init.body) };
    calls.push(call);
    const key =
      url === `${SUPABASE}/rest/v1/rpc/claim_account_cleanups` ? 'claim'
      : url === `${SUPABASE}/rest/v1/rpc/record_account_cleanup` ? 'record'
      : url === `https://api.stripe.com/v1/customers/${CUS}` && method === 'DELETE' ? 'customer'
      : url === `https://api.stripe.com/v1/customers/${CUS}` && method === 'GET' ? 'read'
      : 'unknown';
    call.key = key;
    return answers[key](call);
  };
  return { fetch, calls };
}

async function run(w, mayStart = () => true, logs = []) {
  const logged = [];
  const saved = ['log', 'info', 'warn', 'error', 'debug'].map((k) => [k, console[k]]);
  for (const [k] of saved) console[k] = (...args) => logged.push(args.join(' '));
  try {
    const result = await runAccountCleanups({
      fetch: w.fetch, mayStart, supabaseUrl: SUPABASE, serviceHeaders: SERVICE, stripeKey: STRIPE_KEY,
    });
    // A14-F F2: the pass hands back exactly the lines it logs, for the run's report.
    assert.deepEqual(result, logs, 'the pass hands back its failure lines');
  } finally {
    for (const [k, f] of saved) console[k] = f;
  }
  assert.deepEqual(logged, logs, 'the pass logs only the fixed failure lines');
  return w.calls;
}
const keys = (calls) => calls.map((c) => c.key);
const recorded = (calls) => calls.filter((c) => c.key === 'record').map((c) => c.body);

test('one exported function, no imports', () => {
  assert.equal(typeof runAccountCleanups, 'function');
  assert.deepEqual(Object.keys(others), []);
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.equal(source.match(/^export /gm).length, 1);
});

test('no file removal and no payout account request in the source: one Stripe path, the customer', () => {
  assert.doesNotMatch(source, /storage\/v1|\/v2\/core\/accounts|\/v1\/balance|\/close\b|Stripe-Account|Stripe-Version/);
  assert.deepEqual([...new Set(source.match(/https:\/\/[a-z.]+/g))], ['https://api.stripe.com']);
  assert.deepEqual([...new Set(source.match(/\/v1\/[a-z_]+/g))].sort(), ['/v1/customers', '/v1/rpc']);
});

test('the whole path: the customer, one record, nothing else', async () => {
  const calls = await run(world());
  assert.deepEqual(keys(calls), ['claim', 'customer', 'record']);
  const [claim, customer] = calls;
  assert.deepEqual(claim.body, { p_limit: 1 });
  assert.deepEqual(claim.headers, SERVICE);
  assert.deepEqual([customer.method, customer.headers], ['DELETE', { Authorization: `Bearer ${STRIPE_KEY}` }]);
  assert.deepEqual(recorded(calls), [{ p_id: ROW.id, p_customer: true, p_error: null }]);
  // The Stripe key goes only to Stripe, the service key only to the project.
  for (const c of calls) {
    const text = JSON.stringify(c.headers);
    if (c.url.startsWith('https://api.stripe.com/')) assert.doesNotMatch(text, /service-key/);
    else assert.doesNotMatch(text, /sk_test/);
  }
  // A claimed row that carries a file list or a payout account id still gets the customer step only.
  const extra = await run(world({ claim: () => json([{
    ...ROW, files: [{ bucket: 'avatars', name: 'u1/avatar.jpg' }], files_done: false,
    stripe_account_id: 'acct_1Dana', account_done: false, account_may_close: true,
  }]) }));
  assert.deepEqual(keys(extra), ['claim', 'customer', 'record']);
  assert.deepEqual(recorded(extra), [{ p_id: ROW.id, p_customer: true, p_error: null }]);
});

test('(c) the step is safe to repeat: a customer already gone is done when a read with the same key says deleted, and a done step is not sent again', async () => {
  const gone = await run(world({
    customer: () => json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, 404),
  }));
  assert.deepEqual(keys(gone), ['claim', 'customer', 'read', 'record']);
  assert.deepEqual([gone[2].method, gone[2].headers], ['GET', { Authorization: `Bearer ${STRIPE_KEY}` }]);
  assert.deepEqual(recorded(gone)[0], { p_id: ROW.id, p_customer: true, p_error: null });
  const later = await run(world({ claim: () => json([{ ...ROW, customer_done: true }]) }));
  assert.deepEqual(keys(later), ['claim', 'record']);
  assert.deepEqual(recorded(later)[0], { p_id: ROW.id, p_customer: true, p_error: null });
  const none = await run(world({ claim: () => json([{ ...ROW, stripe_customer_id: null, customer_done: true }]) }));
  assert.deepEqual(keys(none), ['claim', 'record']);
});

test('no answer is never a success: the step stays not done', async () => {
  const noAnswer = [() => { throw new Error('timeout'); }, () => json(''), () => json('not json'), () => cut(), () => json([])];
  for (const answer of noAnswer) {
    const customer = await run(world({ customer: answer }));
    assert.deepEqual(recorded(customer), [{ p_id: ROW.id, p_customer: false, p_error: 'customer: no answer' }]);
  }
});

test('a refusal is recorded by status and code only, and is never done', async () => {
  const expired = () => json({ error: { code: 'api_key_expired', message: `Expired API Key provided: ${STRIPE_KEY}` } }, 401);
  const calls = await run(world({ customer: expired, read: expired }));
  const [r] = recorded(calls);
  assert.deepEqual(r, { p_id: ROW.id, p_customer: false, p_error: 'customer: 401 api_key_expired; read: 401 api_key_expired' });
  assert.doesNotMatch(r.p_error, /sk_test|service-key/, 'no key');
  const odd = await run(world({ customer: () => json({ id: 'cus_Other', deleted: true }) }));
  assert.equal(recorded(odd)[0].p_customer, false, 'an answer about another object is not done');
  const notDeleted = await run(world({ customer: () => json({ id: CUS, object: 'customer' }) }));
  assert.deepEqual(recorded(notDeleted)[0], { p_id: ROW.id, p_customer: false, p_error: 'customer: 200 no code' });
});

test('A11-10, the 404 rule: one test per answer shape; done only on a deleted answer about this customer', async () => {
  const missing = () => json({ error: { type: 'invalid_request_error', code: 'resource_missing' } }, 404);
  const live = () => json({ id: CUS, object: 'customer' });
  const shapes = [
    // [name, DELETE answer, READ answer, the calls, the record]
    ['DELETE success', undefined, undefined,
      ['claim', 'customer', 'record'], [true, null]],
    ['DELETE 404, then READ deleted', missing, undefined,
      ['claim', 'customer', 'read', 'record'], [true, null]],
    ['DELETE 500, then READ deleted', () => json({ error: { code: 'api_error' } }, 500), undefined,
      ['claim', 'customer', 'read', 'record'], [true, null]],
    ['DELETE 404, then READ 404', missing, missing,
      ['claim', 'customer', 'read', 'record'],
      [false, 'customer: this Stripe key does not know this customer (another account or another mode)']],
    ['DELETE error, then READ of a live customer', () => json({ error: { code: 'resource_missing' } }, 400), live,
      ['claim', 'customer', 'read', 'record'], [false, 'customer: 400 resource_missing; read: 200 not deleted']],
    ['DELETE 404, then READ of another customer', missing, () => json({ id: 'cus_Other', object: 'customer', deleted: true }),
      ['claim', 'customer', 'read', 'record'], [false, 'customer: 404 resource_missing; read: 200 not deleted']],
    ['a network error on the DELETE', () => { throw new Error('reset'); }, undefined,
      ['claim', 'customer', 'record'], [false, 'customer: no answer']],
    ['DELETE 404, then a network error on the READ', missing, () => { throw new Error('reset'); },
      ['claim', 'customer', 'read', 'record'], [false, 'customer: 404 resource_missing; read: no answer']],
  ];
  for (const [name, customer, read, expected, [p_customer, p_error]] of shapes) {
    const calls = await run(world({ ...(customer && { customer }), ...(read && { read }) }));
    assert.deepEqual(keys(calls), expected, name);
    assert.deepEqual(recorded(calls), [{ p_id: ROW.id, p_customer, p_error }], name);
  }
});

test('the READ is a Stripe request too: mayStart is asked before it, and a refused READ leaves the step open', async () => {
  const firstK = (k) => { let n = 0; return () => (n += 1) <= k; };
  const failing = { customer: () => json({ error: { code: 'api_error' } }, 500) };
  const refused = await run(world(failing), firstK(3));
  assert.deepEqual(keys(refused), ['claim', 'customer', 'record']);
  assert.deepEqual(recorded(refused), [{ p_id: ROW.id, p_customer: false, p_error: 'customer: 500 api_error; read: out of time' }]);
  const allowed = await run(world(failing), firstK(4));
  assert.deepEqual(keys(allowed), ['claim', 'customer', 'read', 'record']);
  assert.deepEqual(recorded(allowed), [{ p_id: ROW.id, p_customer: true, p_error: null }]);
});

test('out of time: mayStart before the claim, each row and the Stripe request; a refused request leaves its step not done', async () => {
  assert.deepEqual(await run(world(), () => false), []);
  // mayStart answers yes k times, then no. Its questions, in order: the claim, the row, the customer;
  // then the second row.
  const firstK = (k) => { let n = 0; return () => (n += 1) <= k; };
  const two = () => json([ROW, { ...ROW, id: 'row-2' }]);
  const cases = [
    [1, ['claim'], null],
    [2, ['claim', 'record'], [false, 'customer: out of time']],
    [3, ['claim', 'customer', 'record'], [true, null]],
  ];
  for (const [k, expected, record] of cases) {
    const calls = await run(world({ claim: two }), firstK(k));
    assert.deepEqual(keys(calls), expected, `yes ${k} times`);
    if (record) {
      const [p_customer, p_error] = record;
      assert.deepEqual(recorded(calls), [{ p_id: ROW.id, p_customer, p_error }], `yes ${k} times`);
    }
  }
});

test('it never throws into the run, and a failure leaves one fixed line: no secret, no Stripe id', async () => {
  const claims = [
    [() => { throw new Error('down'); }, 'no answer'],
    [() => json(''), 'no answer'],
    [() => cut(), 'no answer'],
    [() => json({ message: `bad key ${STRIPE_KEY}` }, 500), 500],
    [() => json({ rows: [] }), 200],
  ];
  for (const [claim, status] of claims) {
    assert.deepEqual(keys(await run(world({ claim }), undefined, [`account cleanup: the claim failed (${status})`])), ['claim']);
  }
  await run(world({ claim: () => json([null, ROW]) }), undefined, ['account cleanup: the pass stopped on a fault']);
  const notSaved = "account cleanup: a row's result was not saved (no answer)";
  const calls = await run(world({ claim: () => json([ROW, { ...ROW, id: 'row-2' }]), record: () => { throw new Error('down'); } }), undefined, [notSaved, notSaved]);
  assert.equal(recorded(calls).length, 2, 'a failed record does not stop the next row');
  await run(world({ record: () => json({ message: `cus ${CUS}` }, 500) }), undefined, ["account cleanup: a row's result was not saved (500)"]);
  await run(world({ record: () => new Response(null, { status: 204 }) }));
  const syncThrow = { fetch: () => { throw new Error('sync'); }, calls: [] };
  assert.deepEqual(await run(syncThrow, undefined, ['account cleanup: the claim failed (no answer)']), []);
});

test('A14-F F2: the pass\'s own failures go back to the run; a Stripe refusal, a missing customer and lost time stay on the row', async () => {
  // Each of the three failure kinds is handed back as its one line (the run helper compares the
  // handed-back lines with the logged ones); red control: the pass before A14-F handed back nothing.
  await run(world({ claim: () => json({ message: 'down' }, 503) }), undefined, ['account cleanup: the claim failed (503)']);
  await run(world({ record: () => json('', 500) }), undefined, ["account cleanup: a row's result was not saved (500)"]);
  await run(world({ claim: () => json([null]) }), undefined, ['account cleanup: the pass stopped on a fault']);
  // Not the run's: the row records them (account_cleanup_attention lists it after 1 hour).
  const refused = () => json({ error: { code: 'api_key_expired' } }, 401);
  const missing = () => json({ error: { code: 'resource_missing' } }, 404);
  for (const [w, mayStart] of [
    [world({ customer: refused, read: refused }), undefined],
    [world({ customer: missing, read: missing }), undefined],
    [world(), (() => { let n = 0; return () => (n += 1) <= 2; })()],
  ]) {
    const calls = await run(w, mayStart, []);
    assert.equal(recorded(calls).length, 1, 'the row records it');
    assert.equal(recorded(calls)[0].p_customer, false);
  }
});

test('decision 12: the settlement run calls the pass once, after its money passes and before its report, only while its worst case fits, and the pass claims one row', () => {
  const drain = readFileSync(join(root, 'supabase/functions/process-settlements/index.ts'), 'utf8').replace(/\r\n/g, '\n');
  const call = '\n  if (fits(run, 4)) errors.push(...await runAccountCleanups({ fetch: (url, init) => fetch(url, timed(run, init)), '
    + 'mayStart: () => fits(run, 2), supabaseUrl: SUPABASE_URL, serviceHeaders: serviceHeaders(), stripeKey: STRIPE_SECRET_KEY }));\n';
  assert.equal(drain.split("\nimport { runAccountCleanups } from '../_shared/accountCleanup.ts';\n").length - 1, 1, 'one import');
  assert.equal(drain.split('runAccountCleanups(').length - 1, 1, 'one call');
  const loop = drain.indexOf('\n  for (const name of turnOrder(run.turn, PASS_NAMES) as PassName[]) {\n');
  const loopEnd = drain.indexOf('\n  }\n', loop);
  const at = drain.indexOf(call);
  const report = drain.indexOf('\n  const reported = await reportRun(');
  assert.ok(loop > -1 && loopEnd > loop, 'the pass loop');
  assert.ok(at > loopEnd, 'after the pass loop has ended');
  assert.ok(report > at, 'before the report');
  assert.equal(source.split('rpc({ p_limit: 1 })').length - 1, 1, 'the claim asks for one row');
});
