import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * B6 (production-36h) — THE OWNER'S "NEEDS ATTENTION" LIST, executed.
 *
 *   - lib/adminAttention.ts runs as written: its supabase import is a stand-in that answers like
 *     PostgREST; lib/disputes.ts (the report words), lib/time.ts, lib/titleCase.ts,
 *     lib/errorMessage.ts and lib/jobs.ts's formatBudget are the real code;
 *   - lib/appLinks.ts runs as written with Linking and lib/dialog replaced by loggers.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// A release build: userMessage() adds no developer line.
globalThis.__DEV__ = false;
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const fileUrl = (path) => pathToFileURL(join(root, path)).href;
const dataUrl = (js) => 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
const strip = (s) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function swap(source, pairs) {
  let out = source;
  for (const [from, to] of pairs) {
    assert.ok(out.includes(from), `expected: ${from}`);
    out = out.replace(from, () => to);
  }
  return out;
}

// The report words, from the file the customer's report screen reads (its supabase import idle).
const disputesUrl = dataUrl(
  stripTypeScriptTypes(swap(read('lib/disputes.ts'), [["import { supabase } from './supabase';", 'const supabase = null;']]), {
    mode: 'strip',
  })
);
const disputes = await import(disputesUrl);

// formatBudget, cut out of lib/jobs.ts as written.
const jobs = read('lib/jobs.ts');
const budgetAt = jobs.indexOf('export function formatBudget(');
const formatBudgetJs = stripTypeScriptTypes(jobs.slice(budgetAt, jobs.indexOf('\n}\n', budgetAt) + 2), { mode: 'strip' });
const budgetUrl = dataUrl(formatBudgetJs);
const { formatBudget } = await import(budgetUrl);

const rpcCalls = [];
let rpcAnswer = { data: [], error: null, status: 200 };
globalThis.__attention_supabase = {
  rpc: async (name, args) => {
    rpcCalls.push(args === undefined ? [name] : [name, args]);
    return typeof rpcAnswer === 'function' ? rpcAnswer(name, args) : rpcAnswer;
  },
};
const attention = await import(
  dataUrl(
    stripTypeScriptTypes(
      swap(read('lib/adminAttention.ts'), [
        ["import { supabase } from './supabase';", 'const supabase = globalThis.__attention_supabase;'],
        ["import { DISPUTE_REASON_LABELS, type DisputeReason } from './disputes';", `import { DISPUTE_REASON_LABELS } from '${disputesUrl}';`],
        ["import { isNetworkError, userMessage } from './errorMessage';", `import { isNetworkError, userMessage } from '${fileUrl('lib/errorMessage.ts')}';`],
        ["import { formatBudget } from './jobs';", `import { formatBudget } from '${budgetUrl}';`],
        ["import { formatClock, formatDay } from './time';", `import { formatClock, formatDay } from '${fileUrl('lib/time.ts')}';`],
        ["import { titleCase } from './titleCase';", `import { titleCase } from '${fileUrl('lib/titleCase.ts')}';`],
      ]),
      { mode: 'strip' }
    )
  )
);
const { formatClock, formatDay } = await import(fileUrl('lib/time.ts'));
const at = (iso) => `${formatDay(new Date(iso))} at ${formatClock(new Date(iso))}`;

/** A line of the contract, every column null or empty unless given. */
function line(over = {}) {
  return {
    key: 'k1',
    what: 'payment',
    reason: 'A payout is ready to send. The automatic payout finishes it within the hour.',
    since: '2026-11-16T14:05:00Z',
    overdue: false,
    cents: null,
    detail: null,
    code: 'payout_ready',
    finish: 'wait',
    payment_id: null,
    job_id: null,
    decisions: [],
    job_title: null,
    customer_first_name: null,
    worker_first_name: null,
    report_reason: null,
    report_details: null,
    report_at: null,
    customer_phone: null,
    customer_email: null,
    worker_phone: null,
    worker_email: null,
    arrived_at: null,
    work_started_at: null,
    completed_at: null,
    cancelled_at: null,
    decision_note: null,
    ...over,
  };
}

// ---------------------------------------------------------------- the calls

test('the list: rpc admin_attention with no arguments, the rows in the server\'s order; an empty list is empty', async () => {
  rpcCalls.length = 0;
  rpcAnswer = { data: [], error: null, status: 200 };
  assert.deepEqual(await attention.fetchAttention(), { data: [], error: null });
  rpcAnswer = { data: null, error: null, status: 200 };
  assert.deepEqual(await attention.fetchAttention(), { data: [], error: null });
  const rows = [line({ key: 'b' }), line({ key: 'a' }), line({ key: 'c' })];
  rpcAnswer = { data: rows, error: null, status: 200 };
  assert.deepEqual((await attention.fetchAttention()).data.map((r) => r.key), ['b', 'a', 'c']);
  assert.deepEqual(rpcCalls, [['admin_attention'], ['admin_attention'], ['admin_attention']]);
  assert.deepEqual(attention.ATTENTION_EMPTY, { title: 'All Clear', body: 'Nothing needs you right now.' });
});

test('a failure: a sentence the server raised (P0001) shows unchanged; every other failure through userMessage', async () => {
  const REFUSED = 'This decision is not open for this job now. Reload the list.';
  // A sentence with words userMessage would replace ("not found") still shows as the server wrote it.
  const OWN = 'This job was not found in the list any more. Reload the list.';
  assert.equal(attention.serverSentence({ code: 'P0001', message: REFUSED }), REFUSED);
  assert.equal(attention.serverSentence({ code: 'P0001', message: OWN }), OWN);
  // Not the server's own sentence: a schema skew, an access refusal, no answer at all.
  assert.equal(attention.serverSentence({ code: '42703', message: 'column x does not exist' }), 'This needs an app update. Update Brazos, then try again.');
  assert.equal(attention.serverSentence({ code: 'PGRST202', message: 'Could not find the function public.admin_attention' }), 'This needs an app update. Update Brazos, then try again.');
  assert.equal(attention.serverSentence({ code: '42501', message: 'permission denied for function admin_attention' }), 'You don’t have access to this.');
  assert.equal(attention.serverSentence({ message: 'TypeError: Network request failed' }), 'Can’t reach Brazos right now. Check your connection and try again.');
  assert.equal(attention.serverSentence({ code: 'P0001', message: '' }), 'Something went wrong. Please try again.');

  rpcAnswer = { data: null, error: { code: 'P0001', message: REFUSED, details: null, hint: null }, status: 400 };
  assert.deepEqual(await attention.fetchAttention(), { data: [], error: REFUSED });
  rpcCalls.length = 0;
  assert.deepEqual(await attention.decideIssue('job-1', 'customer'), { error: REFUSED });
  rpcAnswer = { data: null, error: null, status: 204 };
  assert.deepEqual(await attention.decideIssue('job-1', 'worker'), { error: null });
  assert.deepEqual(rpcCalls, [
    ['admin_decide_issue', { p_job_id: 'job-1', p_in_favour_of: 'customer' }],
    ['admin_decide_issue', { p_job_id: 'job-1', p_in_favour_of: 'worker' }],
  ]);
});

test('B7 R3: only P0001 passes unchanged: the engine text PostgREST also answers with HTTP 400 goes through userMessage', async () => {
  const { userMessage } = await import(fileUrl('lib/errorMessage.ts'));
  const DEFAULT = 'Something went wrong. Please try again.';
  // The critic's cases (B-06): a check constraint, a not-null, a bad uuid; each answered HTTP 400.
  const engine = [
    { code: '23514', message: 'new row for relation "job_payments" violates check constraint "job_payments_amount_check"' },
    { code: '23502', message: 'null value in column "worker_id" of relation "jobs" violates not-null constraint' },
    { code: '22P02', message: 'invalid input syntax for type uuid: "job-1"' },
  ];
  for (const error of engine) {
    assert.equal(attention.serverSentence(error), DEFAULT, error.code);
    rpcAnswer = { data: null, error: { ...error, details: null, hint: null }, status: 400 };
    assert.deepEqual(await attention.decideIssue('job-1', 'customer'), { error: DEFAULT }, error.code);
    assert.deepEqual(await attention.fetchAttention(), { data: [], error: DEFAULT }, error.code);
  }
  // Any code but P0001 takes the shared path, even with a readable sentence: "not found" is userMessage's.
  const OWN = 'This job was not found in the list any more. Reload the list.';
  for (const code of ['22023', 'P0002', 'p0001', '', null]) {
    const error = { code, message: OWN };
    assert.equal(attention.serverSentence(error), userMessage(error), String(code));
    assert.equal(attention.serverSentence(error), 'This isn’t available anymore.', String(code));
  }
  assert.equal(attention.serverSentence({ code: 'P0001', message: OWN }), OWN);
});

// ---------------------------------------------------------------- the card

test('a waiting line: the server\'s word in Title Case, its sentence uncut, the facts it has, no button', () => {
  const long = 'A refund was ready to send for more than an hour and Stripe has not answered yet. '.repeat(4).trim();
  const card = attention.attentionCard(line({ what: 'issue report', reason: long }));
  assert.equal(card.label, 'Issue Report');
  assert.equal(card.reason, long, 'never cut');
  assert.equal(card.overdue, false);
  assert.deepEqual(card.facts, [`Since ${at('2026-11-16T14:05:00Z')}`]);
  assert.deepEqual(card.buttons, []);
  assert.equal(card.people, null);
  assert.equal(card.report, null);
  assert.equal(card.times, null);
  assert.equal(card.note, null);
  assert.equal(card.details, null, 'no detail, no Details row');
  // A generic capital-letter function, no table of codes: every word of the contract.
  assert.deepEqual(
    ['payment', 'transfer', 'refund', 'system', 'event', 'issue report', 'account'].map((w) => attention.attentionCard(line({ what: w })).label),
    ['Payment', 'Transfer', 'Refund', 'System', 'Event', 'Issue Report', 'Account']
  );
});

test('an overdue line with a job and an amount: "Overdue", "Job: …", the amount through formatBudget, Details with detail and code', () => {
  const card = attention.attentionCard(
    line({ overdue: true, job_title: 'Rake and bag the front yard', cents: 10750, detail: 'transfer tr_1 failed: account_closed', code: 'transfer_refused' })
  );
  assert.equal(card.overdue, true);
  assert.deepEqual(card.facts, ['Job: Rake and bag the front yard', `Amount: ${formatBudget(10750)}`, `Since ${at('2026-11-16T14:05:00Z')}`]);
  assert.equal(formatBudget(10750), '$107.50');
  assert.equal(attention.attentionCard(line({ cents: 12500 })).facts[0], 'Amount: $125');
  assert.equal(attention.attentionCard(line({ cents: 0 })).facts[0], 'Amount: $0', 'zero cents is an amount');
  assert.deepEqual(card.details, { detail: 'transfer tr_1 failed: account_closed', code: 'transfer_refused' });
});

const DECIDING = {
  key: 'issue:job-7',
  what: 'issue report',
  reason: 'The customer reported a problem with this job. You decide who gets the payment.',
  job_id: 'job-7',
  payment_id: 'pay-7',
  cents: 9000,
  job_title: 'Assemble a bookcase',
  customer_first_name: 'Casey',
  worker_first_name: 'Deleted user',
  customer_phone: '+1 (555) 010-0001',
  customer_email: 'casey@example.test',
  worker_phone: null,
  worker_email: 'wren@example.test',
  report_reason: 'incomplete',
  report_details: 'The shelves are not attached.',
  report_at: '2026-11-15T18:30:00Z',
  arrived_at: '2026-11-15T15:00:00Z',
  work_started_at: null,
  completed_at: '2026-11-15T17:45:00Z',
  cancelled_at: null,
};

test('a line with both sides: both people, the report in the customer\'s words, the times, "Refund Customer" and "Pay Worker"', () => {
  const card = attention.attentionCard(line({ ...DECIDING, decisions: ['customer', 'worker'] }));
  assert.deepEqual(card.buttons, [
    { side: 'customer', label: 'Refund Customer' },
    { side: 'worker', label: 'Pay Worker' },
  ]);
  assert.deepEqual(card.people, [
    { role: 'Customer', name: 'Casey', phone: '+1 (555) 010-0001', email: 'casey@example.test' },
    { role: 'Worker', name: 'Deleted user', phone: null, email: 'wren@example.test' },
  ]);
  // The SAME words the customer's report screen shows.
  assert.equal(card.report.label, disputes.DISPUTE_REASON_LABELS.incomplete);
  assert.deepEqual(card.report, { label: 'Work is incomplete', details: 'The shelves are not attached.', at: at('2026-11-15T18:30:00Z') });
  assert.deepEqual(card.times, [
    { label: 'Arrived', value: at('2026-11-15T15:00:00Z') },
    { label: 'Started', value: 'Not recorded' },
    { label: 'Finished', value: at('2026-11-15T17:45:00Z') },
  ]);
  const cancelled = attention.attentionCard(line({ ...DECIDING, decisions: ['customer'], arrived_at: null, completed_at: null, cancelled_at: '2026-11-15T16:00:00Z' }));
  assert.deepEqual(cancelled.times, [
    { label: 'Arrived', value: 'Not recorded' },
    { label: 'Started', value: 'Not recorded' },
    { label: 'Cancelled', value: at('2026-11-15T16:00:00Z') },
  ]);
  // No report on the line: no report block.
  assert.equal(attention.attentionCard(line({ ...DECIDING, decisions: ['worker'], report_reason: null })).report, null);
});

test('a line with one side and a note: one button and the server\'s note; a note also stands without a button', () => {
  const NOTE = 'The worker side is not offered: the payment was never captured.';
  const card = attention.attentionCard(line({ ...DECIDING, decisions: ['customer'], decision_note: NOTE }));
  assert.deepEqual(card.buttons, [{ side: 'customer', label: 'Refund Customer' }]);
  assert.equal(card.note, NOTE);
  const waiting = attention.attentionCard(line({ decision_note: 'No side is offered while the bank decides the dispute.' }));
  assert.deepEqual(waiting.buttons, []);
  assert.equal(waiting.note, 'No side is offered while the bank decides the dispute.');
});

test('an unknown decision value is not drawn; nothing comes from code or finish', () => {
  const card = attention.attentionCard(line({ ...DECIDING, decisions: ['split', 'customer', 'customer', 'WORKER'], code: 'pay_worker', finish: 'app' }));
  assert.deepEqual(card.buttons, [{ side: 'customer', label: 'Refund Customer' }]);
  assert.deepEqual(attention.attentionCard(line({ ...DECIDING, decisions: ['split'] })).buttons, []);
  // Without its job a decision cannot be sent: no button.
  assert.deepEqual(attention.attentionCard(line({ ...DECIDING, job_id: null, decisions: ['customer', 'worker'] })).buttons, []);
  const lib = strip(read('lib/adminAttention.ts'));
  assert.doesNotMatch(lib, /\.finish\b/, 'the app never reads finish');
  assert.deepEqual([...lib.matchAll(/line\.code\b/g)].length, 1, 'code only goes into Details');
});

// ---------------------------------------------------------------- a decision

function decisionIo({ confirm = true, error = null } = {}) {
  const log = [];
  return {
    log,
    io: {
      confirm: async (o) => {
        log.push(`confirm ${o.title} / ${o.message} / ${o.confirmText}`);
        return confirm;
      },
      decide: async (jobId, side) => {
        log.push(`decide ${jobId} ${side}`);
        return { error };
      },
      alert: async (title, message) => log.push(`alert ${title}: ${message}`),
      reload: async () => log.push('reload'),
      guard: attention.decisionGuard((key, busy) => log.push(`busy ${key} ${busy}`)),
    },
  };
}

test('a decision that works: the card\'s buttons off from the tap, the confirmation, the call, the list read again, the buttons back', async () => {
  const deciding = line({ ...DECIDING, decisions: ['customer', 'worker'] });
  let run = decisionIo();
  await attention.runDecision(deciding, 'customer', run.io);
  assert.deepEqual(run.log, [
    'busy issue:job-7 true',
    'confirm Refund the customer? / This sends the payment back to the customer. You cannot undo it. / Refund',
    'decide job-7 customer',
    'reload',
    'busy issue:job-7 false',
  ]);
  run = decisionIo();
  await attention.runDecision(deciding, 'worker', run.io);
  assert.deepEqual(run.log, [
    'busy issue:job-7 true',
    'confirm Pay the worker? / This releases the payment to the worker. You cannot undo it. / Pay',
    'decide job-7 worker',
    'reload',
    'busy issue:job-7 false',
  ]);
  // "Cancel" sends nothing and gives the card back.
  run = decisionIo({ confirm: false });
  await attention.runDecision(deciding, 'customer', run.io);
  assert.deepEqual(run.log, ['busy issue:job-7 true', 'confirm Refund the customer? / This sends the payment back to the customer. You cannot undo it. / Refund', 'busy issue:job-7 false']);
});

test('a decision the server refuses: its sentence as it is, then the list is read again', async () => {
  const REFUSED = 'This decision is not open for this job now. Reload the list.';
  const run = decisionIo({ error: REFUSED });
  await attention.runDecision(line({ ...DECIDING, decisions: ['worker'] }), 'worker', run.io);
  assert.deepEqual(run.log.slice(2), ['decide job-7 worker', `alert Could not pay: ${REFUSED}`, 'reload', 'busy issue:job-7 false']);
  // End to end with the real decideIssue: the server's 400 sentence reaches the alert unchanged.
  rpcAnswer = { data: null, error: { code: 'P0001', message: REFUSED, details: null, hint: null }, status: 400 };
  const real = decisionIo();
  real.io.decide = attention.decideIssue;
  await attention.runDecision(line({ ...DECIDING, decisions: ['customer'] }), 'customer', real.io);
  assert.deepEqual(real.log.slice(-3), [`alert Could not refund: ${REFUSED}`, 'reload', 'busy issue:job-7 false']);
});

test('B7 R1: a decision Brazos never answered is "Not sure it went through", never "Could not refund/pay"; the list is read again', async () => {
  const NOT_SURE = 'alert Not sure it went through: Brazos did not answer. The decision may already be done. Reload the list before you decide again.';
  assert.deepEqual(attention.DECISION_UNANSWERED, {
    title: 'Not sure it went through',
    message: 'Brazos did not answer. The decision may already be done. Reload the list before you decide again.',
  });
  // postgrest-js's answers when fetch never got one: no connection, the client's own timeout
  // (lib/fetchTimeout.ts: "Request timeout"), a fetch that failed; all with status 0.
  const lost = [
    { message: 'TypeError: Network request failed', code: '' },
    { message: 'Error: Request timeout', code: '' },
    { message: 'TypeError: Failed to fetch', code: '' },
    { message: 'AbortError: The operation was aborted.', code: '' },
  ];
  for (const error of lost) {
    for (const [side, failed] of [['customer', 'Could not refund'], ['worker', 'Could not pay']]) {
      rpcAnswer = { data: null, error: { ...error, details: null, hint: null }, status: 0 };
      const run = decisionIo();
      run.io.decide = attention.decideIssue;
      await attention.runDecision(line({ ...DECIDING, decisions: [side] }), side, run.io);
      assert.deepEqual(run.log.slice(-3), [NOT_SURE, 'reload', 'busy issue:job-7 false'], `${error.message} ${side}`);
      assert.ok(!run.log.some((entry) => entry.startsWith(`alert ${failed}`)), `${error.message} ${side}`);
    }
  }
  // A call that threw: no answer either.
  const threw = decisionIo();
  threw.io.decide = async () => {
    throw new Error('boom');
  };
  await attention.runDecision(line({ ...DECIDING, decisions: ['customer'] }), 'customer', threw.io);
  assert.deepEqual(threw.log.slice(-3), [NOT_SURE, 'reload', 'busy issue:job-7 false']);
  // The server answered: its refusal, under the side's own title.
  const REFUSED = 'This decision is not open for this job now. Reload the list.';
  rpcAnswer = { data: null, error: { code: 'P0001', message: REFUSED, details: null, hint: null }, status: 400 };
  const answered = decisionIo();
  answered.io.decide = attention.decideIssue;
  await attention.runDecision(line({ ...DECIDING, decisions: ['worker'] }), 'worker', answered.io);
  assert.deepEqual(answered.log.slice(-3), [`alert Could not pay: ${REFUSED}`, 'reload', 'busy issue:job-7 false']);
});

test('UB-01: an answer of 500 or more (a gateway after a commit) is "Not sure it went through"; a 4xx stays "Could not ..."', async () => {
  const NOT_SURE = 'alert Not sure it went through: Brazos did not answer. The decision may already be done. Reload the list before you decide again.';
  // postgrest-js keeps the real status and turns a non-JSON body into { message: <body text> }.
  for (const status of [500, 502, 503, 504]) {
    for (const [side, failed] of [['customer', 'Could not refund'], ['worker', 'Could not pay']]) {
      rpcAnswer = { data: null, error: { message: 'Bad gateway', details: null, hint: null, code: '' }, status };
      assert.equal((await attention.decideIssue('job-1', side)).unanswered, true, `${status}`);
      const run = decisionIo();
      run.io.decide = attention.decideIssue;
      await attention.runDecision(line({ ...DECIDING, decisions: [side] }), side, run.io);
      assert.deepEqual(run.log.slice(-3), [NOT_SURE, 'reload', 'busy issue:job-7 false'], `${status} ${side}`);
      assert.ok(!run.log.some((entry) => entry.startsWith(`alert ${failed}`)), `${status} ${side}`);
    }
  }
  // A 4xx answer is the server's refusal: "Could not ...".
  for (const status of [400, 403, 404, 409]) {
    rpcAnswer = { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid: "job-1"', details: null, hint: null }, status };
    const run = decisionIo();
    run.io.decide = attention.decideIssue;
    await attention.runDecision(line({ ...DECIDING, decisions: ['customer'] }), 'customer', run.io);
    assert.deepEqual(run.log.slice(-3), ['alert Could not refund: Something went wrong. Please try again.', 'reload', 'busy issue:job-7 false'], `${status}`);
  }
});

/** A promise and its resolve, to hold a step open. */
function gate() {
  let open;
  const promise = new Promise((resolve) => (open = resolve));
  return { promise, open };
}

test('B7 R2: one decision per card: two fast taps send one request; a tap during the reload sends none; "Cancel" frees the card', async () => {
  const deciding = line({ ...DECIDING, decisions: ['customer', 'worker'] });
  const log = [];
  const confirmGate = gate();
  const reloadGate = gate();
  const io = {
    confirm: async (o) => (log.push(`confirm ${o.confirmText}`), confirmGate.promise),
    decide: async (jobId, side) => (log.push(`decide ${jobId} ${side}`), { error: null }),
    alert: async (title) => log.push(`alert ${title}`),
    reload: async () => (log.push('reload'), reloadGate.promise),
    guard: attention.decisionGuard((key, held) => log.push(`held ${key} ${held}`)),
  };
  // Two taps in the same frame: Refund, then Refund again; then Pay on the same card.
  const first = attention.runDecision(deciding, 'customer', io);
  const second = attention.runDecision(deciding, 'customer', io);
  const third = attention.runDecision(deciding, 'worker', io);
  // The hold is taken at the tap, before the confirmation is even answered.
  assert.deepEqual(log, ['held issue:job-7 true', 'confirm Refund']);
  await second;
  await third;
  confirmGate.open(true);
  await tick();
  assert.deepEqual(log, ['held issue:job-7 true', 'confirm Refund', 'decide job-7 customer', 'reload']);
  // During the reload: both buttons stay off, and a tap sends nothing.
  await attention.runDecision(deciding, 'worker', io);
  await attention.runDecision(deciding, 'customer', io);
  assert.deepEqual(log, ['held issue:job-7 true', 'confirm Refund', 'decide job-7 customer', 'reload']);
  reloadGate.open();
  await first;
  assert.deepEqual(log.slice(-1), ['held issue:job-7 false']);
  assert.equal(log.filter((entry) => entry.startsWith('decide')).length, 1, 'one request');

  // "Cancel" frees the card at once: the next tap opens a confirmation again.
  const cancel = decisionIo({ confirm: false });
  await attention.runDecision(deciding, 'customer', cancel.io);
  await attention.runDecision(deciding, 'worker', cancel.io);
  assert.deepEqual(cancel.log.filter((entry) => entry.startsWith('confirm')).length, 2);
  assert.ok(!cancel.log.some((entry) => entry.startsWith('decide')));
  // A failed decision also keeps the card until the list was read again.
  const failed = decisionIo({ error: 'This decision is not open for this job now. Reload the list.' });
  await attention.runDecision(deciding, 'worker', failed.io);
  assert.deepEqual(failed.log.slice(-3), ['alert Could not pay: This decision is not open for this job now. Reload the list.', 'reload', 'busy issue:job-7 false']);
  // Another card is not held by this one.
  const other = decisionIo();
  const holdOpen = gate();
  // Card 7's Refund confirmation stays open; card 8's Pay confirmation is answered at once.
  other.io.confirm = async (o) => (o.confirmText === 'Refund' ? holdOpen.promise : true);
  const pending = attention.runDecision(deciding, 'customer', other.io);
  await attention.runDecision(line({ ...DECIDING, key: 'issue:job-8', job_id: 'job-8', decisions: ['worker'] }), 'worker', other.io);
  assert.ok(other.log.includes('decide job-8 worker'));
  holdOpen.open(false);
  await pending;
});

// ---------------------------------------------------------------- the phone and mail rows

test('the phone and mail rows: tel: and mailto: open the apps; a failure names the number or the address through lib/dialog', async () => {
  let js = stripTypeScriptTypes(read('lib/appLinks.ts'), { mode: 'strip' });
  js = swap(js, [
    ["import { Linking } from 'react-native';", 'const Linking = { openURL: (url) => globalThis.__attention_links.openURL(url) };'],
    ["import { alertAsync } from './dialog';", 'const alertAsync = (title, message) => globalThis.__attention_links.alert(title, message);'],
  ]);
  const links = await import(dataUrl(js));
  const run = async (opens, fn) => {
    const log = [];
    globalThis.__attention_links = {
      openURL: async (url) => {
        log.push(`open ${url}`);
        if (!opens) throw new Error('No app');
      },
      alert: async (title, message) => log.push(`alert ${title}: ${message}`),
    };
    await fn();
    return log;
  };
  assert.deepEqual(await run(true, () => links.openPhone('+1 (555) 010-0001')), ['open tel:+15550100001']);
  assert.deepEqual(await run(false, () => links.openPhone('+1 (555) 010-0001')), [
    'open tel:+15550100001',
    'alert Could not open your phone app: Call +1 (555) 010-0001.',
  ]);
  assert.deepEqual(await run(true, () => links.openMail('casey@example.test')), ['open mailto:casey@example.test']);
  assert.deepEqual(await run(false, () => links.openMail('casey@example.test')), [
    'open mailto:casey@example.test',
    'alert Could not open your mail app: Write to casey@example.test.',
  ]);
  // Support still opens the same way (T3), now through the same opener.
  assert.deepEqual(await run(false, () => links.openSupportMail()), [
    'open mailto:brazosmvp@gmail.com',
    'alert Could not open your mail app: Write to brazosmvp@gmail.com.',
  ]);
});

// The address openers as the screen reads them (Linking and lib/dialog idle).
const screenLinks = await import(
  dataUrl(
    swap(stripTypeScriptTypes(read('lib/appLinks.ts'), { mode: 'strip' }), [
      ["import { Linking } from 'react-native';", 'const Linking = null;'],
      ["import { alertAsync } from './dialog';", 'const alertAsync = null;'],
    ])
  )
);

test('B7 R4: only a plain address becomes a mailto: link; the critic\'s address and every address with ? & = % # , ; a space or a quote get none', async () => {
  const CRITIC = 'a?cc=x%40evil.com&body=hi@gmail.com';
  assert.equal(screenLinks.mailUrl(CRITIC), null);
  for (const address of [
    'a?b@example.com', 'a&b@example.com', 'a=b@example.com', 'a%b@example.com', 'a#b@example.com', 'a,b@example.com',
    'a;b@example.com', 'a b@example.com', 'a"b@example.com', "a'b@example.com", 'a@b@example.com', 'a@example.com?cc=x@evil.com',
    'a@example.com&body=hi', 'a@exa mple.com', 'a@localhost', 'a@-example.com', 'a@example.com.', '@example.com', 'a@', '',
  ]) {
    assert.equal(screenLinks.mailUrl(address), null, address);
  }
  assert.equal(screenLinks.mailUrl('casey@example.test'), 'mailto:casey@example.test');
  assert.equal(screenLinks.mailUrl('  first.last+tag@mail.example.co.uk '), 'mailto:first.last+tag@mail.example.co.uk');
  assert.equal(screenLinks.mailUrl('brazosmvp@gmail.com'), 'mailto:brazosmvp@gmail.com');

  // The opener never hands such an address to the mail app; it names it instead.
  const log = [];
  globalThis.__attention_links = {
    openURL: async (url) => log.push(`open ${url}`),
    alert: async (title, message) => log.push(`alert ${title}: ${message}`),
  };
  const links = await import(
    dataUrl(
      swap(stripTypeScriptTypes(read('lib/appLinks.ts'), { mode: 'strip' }), [
        ["import { Linking } from 'react-native';", 'const Linking = { openURL: (url) => globalThis.__attention_links.openURL(url) };'],
        ["import { alertAsync } from './dialog';", 'const alertAsync = (title, message) => globalThis.__attention_links.alert(title, message);'],
      ]) + '\n// r4'
    )
  );
  await links.openMail(CRITIC);
  assert.deepEqual(log, [`alert Could not open your mail app: Write to ${CRITIC}.`]);
});

// ---------------------------------------------------------------- the screen, run

const ts = (await import('node:module')).createRequire(import.meta.url)('typescript');
const screenSource = read('screens/AdminAttentionScreen.tsx');
const screenJs = ts
  .transpileModule(screenSource, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  .outputText.replace(/^import [\s\S]*?;$/gm, '')
  .replace(/^export function /gm, 'function ');
const fragment = 'Fragment';
const h = (type, props, ...children) => ({ type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } });
const anyKey = new Proxy({}, { get: (_, key) => (key === 'minTouchTarget' ? 44 : String(key)) });

/** One component's hooks across renders: state and refs by call order, the focus effect kept to call. */
function runtime() {
  const slots = [];
  let cursor = 0;
  const focus = [];
  return {
    hooks: {
      useState: (init) => {
        const at = cursor++;
        if (!(at in slots)) slots[at] = typeof init === 'function' ? init() : init;
        return [slots[at], (v) => (slots[at] = typeof v === 'function' ? v(slots[at]) : v)];
      },
      useRef: (init) => {
        const at = cursor++;
        if (!(at in slots)) slots[at] = { current: init };
        return slots[at];
      },
      useCallback: (fn) => fn,
      useFocusEffect: (fn) => focus.push(fn),
    },
    render(component, props) {
      cursor = 0;
      focus.length = 0;
      return component(props);
    },
    focus,
  };
}

function loadScreen(rt, over = {}) {
  const deps = {
    React: { createElement: h, Fragment: fragment },
    ...rt.hooks,
    FlatList: 'FlatList', Pressable: 'Pressable', RefreshControl: 'RefreshControl', Text: 'Text', View: 'View',
    SafeAreaView: 'SafeAreaView', Ionicons: 'Ionicons', DropdownBody: 'DropdownBody', DropdownChevron: 'DropdownChevron',
    Button: 'Button', Card: 'Card', EmptyState: 'EmptyState', TopBar: 'TopBar', ScreenStateView: 'ScreenStateView',
    StyleSheet: { create: (s) => s },
    ATTENTION_EMPTY: attention.ATTENTION_EMPTY,
    attentionCard: attention.attentionCard,
    runDecision: attention.runDecision,
    decisionGuard: attention.decisionGuard,
    decideIssue: async () => ({ error: null }),
    fetchAttention: async () => ({ data: [], error: null }),
    openMail: async () => {},
    openPhone: async () => {},
    mailUrl: screenLinks.mailUrl,
    alertAsync: async () => {},
    confirmAsync: async () => true,
    goBackOrHome: () => {},
    controls: anyKey, spacing: anyKey, textScale: anyKey,
    screenGround: () => ({}),
    themedStyles: (factory) => (colors) => factory(colors),
    useThemeColors: () => ({ palette: anyKey, isDark: false }),
    useScrollClearance: () => 0,
    SPINNER_STATE: { kind: 'loading', variant: 'spinner' },
    ...over,
  };
  const names = Object.keys(deps);
  return new Function(...names, `${screenJs}\nreturn { AdminAttentionScreen, AttentionCard, ContactRow };`)(...names.map((n) => deps[n]));
}

/** Every element of a tree, depth first. */
function elements(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => elements(n, out));
  else if (node && typeof node === 'object' && 'type' in node) {
    out.push(node);
    elements(node.props.children, out);
  }
  return out;
}
/** The words a tree shows: its text children and its buttons' titles, in order. */
function words(node) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'string' || typeof n === 'number') out.push(String(n));
    else if (n && typeof n === 'object' && 'type' in n) {
      if (n.type === 'Button') out.push(`[${n.props.title}${n.props.disabled ? ' off' : ''}]`);
      // A phone or mail row shows its number or address.
      if (typeof n.type === 'function' && n.type.name === 'ContactRow') out.push(`<${n.props.text}>`);
      walk(n.props.children);
    }
  };
  walk(node);
  return out;
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A card, drawn the way the list draws it. */
function drawCard(lineRow, busy = false) {
  const rt = runtime();
  const decided = [];
  const { AttentionCard } = loadScreen(rt);
  const tree = rt.render(AttentionCard, { line: lineRow, busy, onDecide: (l, side) => decided.push(`${l.key} ${side}`) });
  return { tree, decided };
}

test('the screen: a spinner first; an empty list is "All Clear" with pull-to-refresh; a failed read shows the server\'s sentence and Try again', async () => {
  let answer = { data: [], error: null };
  let reads = 0;
  const rt = runtime();
  const { AdminAttentionScreen } = loadScreen(rt, { fetchAttention: async () => (reads++, answer) });
  let tree = rt.render(AdminAttentionScreen);
  const header = elements(tree).find((e) => e.type === 'TopBar');
  assert.equal(header.props.title, 'Needs Attention');
  assert.deepEqual(elements(tree).find((e) => e.type === 'ScreenStateView').props.state, { kind: 'loading', variant: 'spinner' });
  rt.focus[0]();
  await tick();
  tree = rt.render(AdminAttentionScreen);
  const list = elements(tree).find((e) => e.type === 'FlatList');
  assert.deepEqual(list.props.data, []);
  assert.deepEqual(words(list.props.ListEmptyComponent), []);
  assert.equal(list.props.ListEmptyComponent.type, 'EmptyState');
  assert.equal(list.props.ListEmptyComponent.props.title, 'All Clear');
  assert.equal(list.props.ListEmptyComponent.props.body, 'Nothing needs you right now.');
  assert.equal(list.props.refreshControl.type, 'RefreshControl');
  // A failed read: the sentence and the retry; the retry reads again.
  answer = { data: [], error: 'This list is only for the Brazos owner.' };
  await list.props.refreshControl.props.onRefresh();
  await tick();
  tree = rt.render(AdminAttentionScreen);
  const state = elements(tree).find((e) => e.type === 'ScreenStateView').props.state;
  assert.equal(state.kind, 'error');
  assert.equal(state.message, 'This list is only for the Brazos owner.');
  answer = { data: [line()], error: null };
  const before = reads;
  state.onRetry();
  await tick();
  assert.equal(reads, before + 1);
  tree = rt.render(AdminAttentionScreen);
  assert.deepEqual(elements(tree).find((e) => e.type === 'FlatList').props.data.map((l) => l.key), ['k1']);
});

test('a waiting card: the label, the sentence, the facts and no button; "Overdue" in the danger colour only when overdue', () => {
  const waiting = drawCard(line({ what: 'refund', job_title: 'Rake and bag the front yard', cents: 4250 }));
  assert.deepEqual(words(waiting.tree), [
    'Refund',
    'A payout is ready to send. The automatic payout finishes it within the hour.',
    'Job: Rake and bag the front yard',
    'Amount: $42.50',
    `Since ${at('2026-11-16T14:05:00Z')}`,
  ]);
  assert.equal(elements(waiting.tree).filter((e) => e.type === 'Button').length, 0);
  const late = drawCard(line({ overdue: true }));
  const mark = elements(late.tree).find((e) => e.type === 'Text' && e.props.children === 'Overdue');
  assert.ok(mark, 'the Overdue mark');
  assert.equal(mark.props.style.color, 'danger');
  // The sentence is never cut: no line limit on it.
  const reason = elements(late.tree).find((e) => e.props.children === line().reason);
  assert.equal(reason.props.numberOfLines, undefined);
});

test('a card with both sides: the people with their phone and mail rows, the report, the times, both buttons; a press decides that side', () => {
  const both = drawCard(line({ ...DECIDING, decisions: ['customer', 'worker'] }));
  assert.deepEqual(words(both.tree), [
    'Issue Report',
    DECIDING.reason,
    'Job: Assemble a bookcase',
    'Amount: $90',
    `Since ${at('2026-11-16T14:05:00Z')}`,
    'Customer: Casey', '<+1 (555) 010-0001>', '<casey@example.test>',
    'Worker: Deleted user', '<wren@example.test>',
    'Report: Work is incomplete', '“', 'The shelves are not attached.', '”', `Reported ${at('2026-11-15T18:30:00Z')}`,
    `Arrived: ${at('2026-11-15T15:00:00Z')}`, 'Started: Not recorded', `Finished: ${at('2026-11-15T17:45:00Z')}`,
    '[Refund Customer]', '[Pay Worker]',
  ]);
  const rows = elements(both.tree).filter((e) => typeof e.type === 'function' && e.type.name === 'ContactRow');
  assert.deepEqual(rows.map((r) => r.props.hint), ['Call +1 (555) 010-0001', 'Email casey@example.test', 'Email wren@example.test']);
  for (const button of elements(both.tree).filter((e) => e.type === 'Button')) button.props.onPress();
  assert.deepEqual(both.decided, ['issue:job-7 customer', 'issue:job-7 worker']);
  // While the call runs both buttons of the card are off.
  const busy = drawCard(line({ ...DECIDING, decisions: ['customer', 'worker'] }), true);
  assert.deepEqual(words(busy.tree).slice(-2), ['[Refund Customer off]', '[Pay Worker off]']);
});

test('a card with one side and a note: the note above the one button; an unknown value is not drawn; Details opens detail and code', () => {
  const NOTE = 'The worker side is not offered: the payment was never captured.';
  const one = drawCard(line({ ...DECIDING, decisions: ['customer', 'split'], decision_note: NOTE, detail: 'pi_3 requires_capture', code: 'issue_open' }));
  const shown = words(one.tree);
  assert.deepEqual(shown.slice(shown.indexOf(NOTE)), [NOTE, '[Refund Customer]', 'Details', 'pi_3 requires_capture', 'issue_open']);
  assert.equal(elements(one.tree).filter((e) => e.type === 'Button').length, 1);
  const body = elements(one.tree).find((e) => e.type === 'DropdownBody');
  assert.equal(body.props.open, false, 'Details is closed at first');
  for (const text of elements(body).filter((e) => e.type === 'Text')) assert.equal(text.props.selectable, true);
  // A note without a button still shows; no detail, no Details row.
  const noteOnly = drawCard(line({ decision_note: NOTE }));
  assert.ok(words(noteOnly.tree).includes(NOTE));
  assert.ok(!words(noteOnly.tree).includes('Details'));
});

test('a decision from the list: the confirmation, the call, the list read again; a refusal shows the server\'s words, then the list is read again', async () => {
  const REFUSED = 'This decision is not open for this job now. Reload the list.';
  const log = [];
  let refusal = null;
  let rows = [line({ ...DECIDING, decisions: ['customer', 'worker'] })];
  const rt = runtime();
  const { AdminAttentionScreen } = loadScreen(rt, {
    fetchAttention: async () => (log.push('read'), { data: rows, error: null }),
    confirmAsync: async (o) => (log.push(`confirm ${o.title}`), true),
    decideIssue: async (jobId, side) => (log.push(`decide ${jobId} ${side}`), { error: refusal }),
    alertAsync: async (title, message) => log.push(`alert ${title}: ${message}`),
  });
  rt.render(AdminAttentionScreen);
  rt.focus[0]();
  await tick();
  let tree = rt.render(AdminAttentionScreen);
  let list = elements(tree).find((e) => e.type === 'FlatList');
  let card = list.props.renderItem({ item: list.props.data[0] });
  assert.equal(card.props.busy, false);
  rows = [];
  card.props.onDecide(list.props.data[0], 'worker');
  await tick();
  await tick();
  assert.deepEqual(log, ['read', 'confirm Pay the worker?', 'decide job-7 worker', 'read']);
  tree = rt.render(AdminAttentionScreen);
  assert.deepEqual(elements(tree).find((e) => e.type === 'FlatList').props.data, [], 'the list as the server reads it now');

  log.length = 0;
  rows = [line({ ...DECIDING, decisions: ['customer'] })];
  refusal = REFUSED;
  rt.focus[0]();
  await tick();
  tree = rt.render(AdminAttentionScreen);
  list = elements(tree).find((e) => e.type === 'FlatList');
  card = list.props.renderItem({ item: list.props.data[0] });
  card.props.onDecide(list.props.data[0], 'customer');
  await tick();
  await tick();
  assert.deepEqual(log, ['read', 'confirm Refund the customer?', 'decide job-7 customer', `alert Could not refund: ${REFUSED}`, 'read']);
});

test('B7 R4 on the card: an address that is not plain is shown as text, with no link and nothing to press', () => {
  const CRITIC = 'a?cc=x%40evil.com&body=hi@gmail.com';
  const card = drawCard(line({ ...DECIDING, decisions: ['customer'], customer_email: CRITIC }));
  const rows = elements(card.tree).filter((e) => typeof e.type === 'function' && e.type.name === 'ContactRow');
  assert.deepEqual(rows.map((r) => r.props.hint), ['Call +1 (555) 010-0001', 'Email wren@example.test']);
  const shown = elements(card.tree).find((e) => e.type === 'Text' && e.props.children === CRITIC);
  assert.ok(shown, 'the address is shown');
  assert.equal(shown.props.selectable, true);
  assert.equal(shown.props.onPress, undefined);
  const words_ = words(card.tree);
  assert.deepEqual(words_.slice(words_.indexOf('Customer: Casey'), words_.indexOf('Worker: Deleted user')), ['Customer: Casey', '<+1 (555) 010-0001>', CRITIC]);
});

test('B7 R2 on the screen: two fast taps on a card send one request; both its buttons are off from the tap until the list was read again', async () => {
  const log = [];
  const confirmGate = gate();
  const rows = [line({ ...DECIDING, decisions: ['customer', 'worker'] })];
  const rt = runtime();
  const { AdminAttentionScreen, AttentionCard } = loadScreen(rt, {
    fetchAttention: async () => (log.push('read'), { data: rows, error: null }),
    confirmAsync: async (o) => (log.push(`confirm ${o.title}`), confirmGate.promise),
    decideIssue: async (jobId, side) => (log.push(`decide ${jobId} ${side}`), { error: null }),
  });
  rt.render(AdminAttentionScreen);
  rt.focus[0]();
  await tick();
  const drawn = () => {
    const tree = rt.render(AdminAttentionScreen);
    const list = elements(tree).find((e) => e.type === 'FlatList');
    return { list, item: list.props.renderItem({ item: list.props.data[0] }) };
  };
  let { item } = drawn();
  assert.equal(item.props.busy, false);
  // Refund, Refund again and Pay, before the first confirmation is answered.
  item.props.onDecide(rows[0], 'customer');
  item.props.onDecide(rows[0], 'customer');
  item.props.onDecide(rows[0], 'worker');
  ({ item } = drawn());
  assert.equal(item.props.busy, true, 'both buttons off from the tap');
  const cardRt = runtime();
  const offCard = cardRt.render(AttentionCard, { line: rows[0], busy: item.props.busy, onDecide: () => {} });
  assert.deepEqual(words(offCard).filter((w) => w.startsWith('[')), ['[Refund Customer off]', '[Pay Worker off]']);
  confirmGate.open(true);
  await tick();
  await tick();
  assert.deepEqual(log, ['read', 'confirm Refund the customer?', 'decide job-7 customer', 'read']);
  ({ item } = drawn());
  assert.equal(item.props.busy, false, 'the card is back once the list was read again');
});

test('[static] the screen: dialogs through lib/dialog, the phone and mail rows through lib/appLinks, no code or finish anywhere', () => {
  const code = strip(screenSource);
  assert.doesNotMatch(code, /Alert\.|Linking|LayoutAnimation|#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(code, /\.finish\b/);
  assert.deepEqual(code.match(/\.code\b/g), ['.code'], 'code only in Details');
  assert.match(code, /\{card\.details\.code\}/);
  assert.match(code, /runDecision\(line, side, \{ confirm: confirmAsync, decide: decideIssue, alert: alertAsync, reload: load, guard \}\)/);
  assert.match(code, /if \(guardRef\.current === null\) guardRef\.current = decisionGuard\(markBusy\);/);
  assert.match(code, /void openPhone\(person\.phone as string\)/);
  assert.match(code, /void openMail\(person\.email as string\)/);
});

// ---------------------------------------------------------------- the notice

/**
 * The router, run as written (lib/notificationRoutes.ts; its job read, navigator, dialog and crash
 * reporter replaced by loggers). A feed row now hands the router its type beside its data, as a push
 * always did (send-push: `{ ...row.data, type: row.type }`).
 */
const routerCalls = [];
globalThis.__notice_fetchJobById = async (jobId) => (routerCalls.push(`fetch ${jobId}`), { data: { id: jobId }, error: null });
globalThis.__notice_navigate = (tab, screen, params) => routerCalls.push(`navigate ${tab} ${screen ?? ''} ${JSON.stringify(params ?? null)}`);
globalThis.__notice_alert = async (title) => routerCalls.push(`alert ${title}`);
const router = await import(
  dataUrl(
    swap(stripTypeScriptTypes(read('lib/notificationRoutes.ts'), { mode: 'strip' }), [
      ["import { alertAsync } from './dialog';", 'const alertAsync = globalThis.__notice_alert;'],
      ["import { fetchJobById } from './jobs';", 'const fetchJobById = globalThis.__notice_fetchJobById;'],
      ["import { navigateAcrossTabs } from './navigationRef';", 'const navigateAcrossTabs = globalThis.__notice_navigate;'],
      ["import { Sentry } from './observability/sentry';", 'const Sentry = null;'],
    ])
  )
);

/** Every type the migrations emit, with the data each one carries (one row per shape it is sent in). */
const USUAL = [
  ['message', { screen: 'Chat', jobId: 'job-1' }],
  ['message', { screen: 'Chat', directThreadId: 'thread-1' }],
  ['bid_received', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['bid_received', { screen: 'ClientJobDetail', jobId: 'job-1', offerId: 'offer-1', categoryId: 'bid_hire' }],
  ['bid_competition', { screen: 'JobDetail', jobId: 'job-1' }],
  ['offer_countered', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['offer_countered', { screen: 'JobDetail', jobId: 'job-1' }],
  ['job_assigned', { screen: 'WorkerJob', jobId: 'job-1' }],
  ['job_completed', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['review_received', { screen: 'ProfileMain' }],
  ['hire_request', { screen: 'Chat', jobId: 'job-1' }],
  ['hire_countered', { screen: 'Chat', jobId: 'job-1' }],
  ['hire_accepted', { screen: 'Chat', jobId: 'job-1' }],
  ['hire_accepted', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['hire_declined', { screen: 'Chat', jobId: 'job-1' }],
  ['job_nearby', { screen: 'JobDetail', jobId: 'job-1' }],
  ['payment_released', { screen: 'WorkerJob', jobId: 'job-1' }],
  ['dispute_opened', { screen: 'WorkerJob', jobId: 'job-1' }],
  ['dispute_opened', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['job_cancelled', { screen: 'WorkerJob', jobId: 'job-1' }],
  ['job_cancelled', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['payment_declined', { screen: 'ClientJobDetail', jobId: 'job-1', intent: 'checkout' }],
  ['job_reminder', { screen: 'ClientJobDetail', jobId: 'job-1', categoryId: 'job_reminder_customer' }],
  ['job_reminder', { screen: 'WorkerJob', jobId: 'job-1', categoryId: 'job_reminder_worker' }],
  ['job_reminder', { screen: 'ClientJobDetail', jobId: 'job-1', intent: 'checkout', categoryId: 'job_reminder_customer' }],
  ['job_running_late', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['series_open', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['series_skipped', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['series_worker_dropped', { screen: 'ClientJobDetail', jobId: 'job-1' }],
  ['series_stopped', { screen: 'WorkerJob', jobId: 'job-1' }],
  ['series_stopped', {}],
  ['series_first_refusal', { screen: 'Chat', jobId: 'job-1' }],
  ['series_first_refusal', { screen: 'Chat', directThreadId: 'thread-1' }],
  ['series_confirm', { screen: 'ClientJobDetail', jobId: 'job-1', intent: 'checkout', categoryId: 'series_confirm' }],
  // B6 (the server lane, not yet in these migrations): a line's notice and the summary notice.
  ['admin_attention', { screen: 'ProfileMain', key: 'transfer:pay-1' }],
  ['admin_attention', { screen: 'ProfileMain' }],
];

/** Every type any migration passes to enqueue_notification (a `v_type` resolved inside its own function). */
function emittedTypes() {
  const types = new Set();
  const dir = join(root, 'supabase/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const m of sql.matchAll(/enqueue_notification\(\s*[^,()]+,\s*[^,]+?,\s*'([a-z_]+)',\s*(?:'([a-z_]+)'|(v_type))/g)) {
      if (m[2]) {
        types.add(m[2]);
        continue;
      }
      const start = sql.toLowerCase().lastIndexOf('create or replace function ', m.index);
      for (const a of sql.slice(start, m.index).matchAll(/v_type\s*:=\s*'([a-z_]+)'/g)) types.add(a[1]);
    }
  }
  return types;
}

async function routeOf(data) {
  routerCalls.length = 0;
  const bridge = { getMode: () => 'customer', switchMode: async (target) => (routerCalls.push(`switch ${target}`), true) };
  const routable = router.canRouteNotification(data);
  await router.handleNotificationData(data, bridge);
  return { routable, calls: [...routerCalls] };
}

test('the notice: with its type a feed tap routes as a push does; for every type but admin_attention the route is the same as without it', async () => {
  globalThis.__DEV__ = false;
  const silence = console.error;
  console.error = () => {};
  try {
    const emitted = emittedTypes();
    assert.ok(emitted.size >= 20, `the scan found ${emitted.size} types`);
    const covered = new Set(USUAL.map(([type]) => type));
    assert.deepEqual([...emitted].filter((type) => !covered.has(type)), [], 'every emitted type has its usual data here');
    const changed = [];
    for (const [type, data] of USUAL) {
      const without = await routeOf(data);
      const withType = await routeOf({ ...data, type });
      if (JSON.stringify(without) !== JSON.stringify(withType)) changed.push(type);
    }
    assert.deepEqual([...new Set(changed)], ['admin_attention'], 'only the owner\'s notice changes its route');
    // admin_attention: the owner's list with the type; the old Profile landing without it (an older build).
    assert.deepEqual(await routeOf({ screen: 'ProfileMain', key: 'transfer:pay-1', type: 'admin_attention' }), {
      routable: true,
      calls: ['navigate Profile AdminAttention null'],
    });
    assert.deepEqual(await routeOf({ screen: 'ProfileMain', type: 'admin_attention' }), { routable: true, calls: ['navigate Profile AdminAttention null'] });
    assert.deepEqual(await routeOf({ screen: 'ProfileMain', key: 'transfer:pay-1' }), { routable: true, calls: ['navigate Profile ProfileMain null'] });
  } finally {
    console.error = silence;
  }
});

test('[static] the notice: its icon is one the app already draws; both feed calls pass the row\'s type', () => {
  const feed = strip(read('screens/NotificationsScreen.tsx'));
  assert.match(feed, /admin_attention: 'shield-checkmark-outline',/);
  assert.match(strip(read('screens/AccountSafetyScreen.tsx')), /shield-checkmark-outline/, 'already drawn in the app');
  assert.match(feed, /handleNotificationData\(\{ \.\.\.notification\.data, type: notification\.type \}, modeBridge\)/);
  assert.match(feed, /canRouteNotification\(\{ \.\.\.n\.data, type: n\.type \}\)/);
  assert.doesNotMatch(feed, /handleNotificationData\(notification\.data|canRouteNotification\(n\.data\)/);
  // The push path already carries the type (send-push), so a push tap routes the same way.
  assert.match(read('supabase/functions/send-push/index.ts'), /data: \{ \.\.\.row\.data, type: row\.type, outboxId: row\.outbox_id \}/);
});
