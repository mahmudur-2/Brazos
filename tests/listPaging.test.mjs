import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * C5 / A9 (A4-M1) — a read never stops at the API's row limit in silence, and
 * C6 — a failed jobs list never takes its cards' payment facts with it.
 * Each module runs for real: types stripped, every import swapped for a stub,
 * and a fake client that answers the way PostgREST does (max_rows included).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let loads = 0;
async function load(rel, stubs) {
  const key = `__listPaging${++loads}`;
  globalThis[key] = stubs;
  const js = stripTypeScriptTypes(read(rel), { mode: 'strip' }).replace(
    /^(import|export)\s+\{([^}]*)\}\s+from\s+'([^']+)';?$/gm,
    (_, kind, names, from) => {
      if (!(from in stubs)) throw new Error(`${rel}: no stub for ${from}`);
      const source = `globalThis.${key}[${JSON.stringify(from)}]`;
      if (kind === 'import') return `const {${names.replace(/\s+as\s+/g, ': ')}} = ${source};`;
      // A re-export may name a binding the module also imports: re-export it under a private name.
      const pairs = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.split(/\s+as\s+/));
      return pairs
        .map(([local, exported = local], i) => `const __re${i} = ${source}.${local}; export { __re${i} as ${exported} };`)
        .join(' ');
    }
  );
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));
}

const { API_MAX_ROWS } = await import(pathToFileURL(join(root, 'lib/supabaseTypes.ts')).href);
const earningsMath = await import(pathToFileURL(join(root, 'lib/earningsMath.ts')).href);
const queryKeys = await import(pathToFileURL(join(root, 'lib/queryKeys.ts')).href);

/** A query builder that records what was asked and answers through `answer(query)`. */
function fakeClient(answer) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, eq: [], gte: null, lte: null, inList: null, or: null, order: [], limit: null };
      queries.push(q);
      const b = {
        select: () => b,
        eq: (c, v) => (q.eq.push([c, v]), b),
        in: (c, v) => ((q.inList = [c, v]), b),
        or: (s) => ((q.or = s), b),
        gte: (c, v) => ((q.gte = [c, v]), b),
        lte: (c, v) => ((q.lte = [c, v]), b),
        order: (c, o) => (q.order.push([c, o.ascending]), b),
        limit: (n) => ((q.limit = n), b),
        then: (ok, bad) => Promise.resolve().then(() => answer(q)).then(ok, bad),
      };
      return b;
    },
  };
}

/** PostgREST's answer: newest first on (created_at, id), the keyset filter applied, cut at max_rows. */
function serve(rows, q) {
  let list = [...rows];
  if (q.or) {
    const m = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\."([^"]+)"\)$/.exec(q.or);
    assert.ok(m, `unexpected keyset filter: ${q.or}`);
    const [, lt, eq, id] = m;
    list = list.filter((r) => Date.parse(r.created_at) < Date.parse(lt) || (Date.parse(r.created_at) === Date.parse(eq) && r.id < id));
  }
  if (q.gte) list = list.filter((r) => Date.parse(r.created_at) >= Date.parse(q.gte[1]));
  if (q.lte) list = list.filter((r) => Date.parse(r.created_at) <= Date.parse(q.lte[1]));
  list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return list.slice(0, Math.min(q.limit ?? Infinity, API_MAX_ROWS));
}

test('API_MAX_ROWS is the max_rows the API is configured with', () => {
  const configured = /^max_rows\s*=\s*(\d+)\s*$/m.exec(read('supabase/config.toml'));
  assert.ok(configured, 'supabase/config.toml names max_rows');
  assert.equal(API_MAX_ROWS, Number(configured[1]));
});

// ---------------------------------------------------------------- earnings
const at = (minute) => new Date(Date.UTC(2026, 10, 1, 10, minute)).toISOString().replace('.000Z', '+00:00');
function ledger(count, jobCount) {
  return Array.from({ length: count }, (_, i) => ({
    id: `pay-${String(i).padStart(5, '0')}`,
    job_id: `job-${i % jobCount}`,
    payee_id: 'worker',
    kind: 'job_payment',
    amount_cents: 100,
    platform_fee_cents: 0,
    status: 'released',
    refund_cents: 0,
    transfer_cents: null,
    // 700 rows share one instant across the first page boundary: only the id can order them.
    created_at: i >= 600 && i < 1300 ? at(30) : at(i % 59),
  }));
}

async function loadEarnings(client) {
  return load('lib/earnings.ts', {
    './supabase': { supabase: client },
    './payments': {
      fetchPayoutsOnTheirWay: async () => new Set(),
      withPayoutFact: (p, set) => ({ ...p, payoutOnItsWay: set.has(p.id) }),
      workerTakeCents: (r) => r.amount_cents - r.platform_fee_cents,
    },
    './earningsMath': earningsMath,
    './supabaseTypes': { API_MAX_ROWS },
  });
}

test('C5: a ledger longer than one API answer is summed whole, each row once, ties at a page edge included', async () => {
  const rows = ledger(2501, 450);
  const client = fakeClient((q) => {
    if (q.table === 'payments') return { data: serve(rows, q), error: null };
    assert.ok(q.inList[1].length <= 200, `one jobs read asked for ${q.inList[1].length} ids`);
    return { data: q.inList[1].map((id) => ({ id, title: id, completed_at: null, status: 'completed' })), error: null };
  });
  const { fetchMyEarnings, JOB_ID_BATCH } = await loadEarnings(client);
  const { data, error } = await fetchMyEarnings('worker');
  assert.equal(error, null);
  assert.equal(data.availableCents, 2501 * 100, 'every row counted: one read would have stopped at 1000');
  const payments = client.queries.filter((q) => q.table === 'payments');
  assert.equal(payments.length, 3, '1000 + 1000 + 501');
  assert.deepEqual(payments[0].order, [['created_at', false], ['id', false]]);
  assert.ok(payments.every((q) => q.limit === API_MAX_ROWS));
  assert.equal(JOB_ID_BATCH, 200);
  assert.equal(client.queries.filter((q) => q.table === 'jobs').length, 3, '450 jobs in batches of 200');
});

test('C5: a failed jobs read fails the earnings read instead of summing without the job facts', async () => {
  const client = fakeClient((q) =>
    q.table === 'payments' ? { data: serve(ledger(5, 2), q), error: null } : { data: null, error: { message: 'network down' } }
  );
  const { fetchMyEarnings } = await loadEarnings(client);
  const result = await fetchMyEarnings('worker');
  assert.equal(result.data, null);
  assert.deepEqual(result.error, { message: 'network down' });
});

// ---------------------------------------------------------------- chat
async function loadMessages(client) {
  return load('lib/messages.ts', {
    './supabase': { supabase: client },
    './storage': { resolveChatMediaUrl: async (_b, u) => u, resolveChatMediaUrls: async (_b, list) => list },
    './supabaseTypes': { API_MAX_ROWS },
  });
}
const thread = (count, since) =>
  Array.from({ length: count }, (_, i) => ({
    id: `m-${String(i).padStart(5, '0')}`,
    created_at: new Date(Date.parse(since) + (i + 1) * 1000).toISOString(),
  }));

test('C5: a since-load the API cut short starts the next older page at its oldest row, not at since', async () => {
  const since = '2026-11-01T10:00:00.000Z';
  const rows = thread(1500, since);
  const client = fakeClient((q) => ({ data: serve(rows, q), error: null }));
  const { fetchMessages } = await loadMessages(client);
  const page = await fetchMessages({ jobId: 'job-1' }, { since });
  assert.equal(client.queries[0].limit, API_MAX_ROWS, 'the since-load asks for the cap out loud');
  assert.equal(page.data.length, 1000);
  assert.equal(page.cursor, page.data[0].created_at, 'the cursor is the oldest row the API returned');
  assert.notEqual(page.cursor, since, 'with `since` as the cursor, 500 messages would never load');
  assert.equal(page.hasMore, true);

  const short = await fetchMessages({ jobId: 'job-1' }, { since: rows[1496].created_at });
  assert.equal(short.data.length, 4);
  assert.equal(short.cursor, rows[1496].created_at, 'a load that reached its instant keeps since as its cursor');

  const older = await fetchMessages({ jobId: 'job-1' }, { before: rows[600].created_at });
  assert.equal(older.cursor, older.data[0].created_at);
});

test('C5: the chat store takes each page’s own cursor', () => {
  const hook = read('hooks/useConversationChat.ts');
  assert.match(hook, /next\[key\] = result\.error \? previous\[key\] \?\? null : result\.cursor;/);
  assert.match(hook, /\[key\]: result\.cursor \?\? previous\[key\] \?\? null/);
  assert.doesNotMatch(hook, /since \?\? result\.data\[0\]/);
});

// ---------------------------------------------------------------- hub
test('C6: a failed jobs list keeps its cards AND their payment and issue facts', async () => {
  const asked = {};
  const job = (id, extra) => ({ id, client_id: 'me', assigned_worker_id: 'w', ...extra });
  const hub = await load('hooks/useMyJobsHub.ts', {
    react: { useCallback: (f) => f },
    '@tanstack/react-query': { useQuery: () => ({}), useQueryClient: () => ({}) },
    '../lib/disputes': { fetchOpenDisputeJobIds: async (ids) => ((asked.disputes = ids), { data: new Set(ids.filter((i) => i === 'posted-1')), error: null }) },
    '../lib/errorMessage': { userMessage: (e) => e.message },
    '../lib/jobs': {
      fetchJobsByClient: async () => ({ data: [], error: { message: 'jobs read failed' } }),
      fetchJobsAssignedToWorker: async () => ({ data: [job('working-1', { client_id: 'c' })], error: null }),
    },
    '../lib/offers': {
      fetchPendingOffersByWorker: async () => ({ data: [], error: null }),
      fetchSettledOffersByWorker: async () => ({ data: [], error: null }),
    },
    '../lib/payments': {
      fetchJobPaymentStatusesByJobIds: async (ids) => ((asked.payments = ids), { data: Object.fromEntries(ids.map((i) => [i, { status: 'held' }])), error: null }),
    },
    '../lib/profiles': { fetchProfilesByIds: async () => ({ data: [], error: null }) },
    '../lib/queryKeys': queryKeys,
    '../lib/reviews': { fetchMyReviewedJobIds: async () => ({ data: new Set(), error: null }) },
    './useAuth': { useAuth: () => ({}) },
  });
  const previous = {
    posted: [job('posted-1')], working: [], pendingBids: [], settledBids: [],
    payments: { 'posted-1': { status: 'held' } }, openDisputeJobIds: new Set(['posted-1']),
    reviewedJobIds: new Set(), names: {}, error: null,
  };
  const next = await hub.readHub({ id: 'me' }, previous);
  assert.deepEqual(next.posted.map((j) => j.id), ['posted-1'], 'the failed list keeps its card');
  assert.deepEqual(asked.payments.sort(), ['posted-1', 'working-1'], 'facts are read for the kept card too');
  assert.deepEqual(next.payments['posted-1'], { status: 'held' }, 'the kept card keeps its held payment');
  assert.ok(next.openDisputeJobIds.has('posted-1'), 'and its open issue');
  assert.equal(next.error, 'jobs read failed');
});
