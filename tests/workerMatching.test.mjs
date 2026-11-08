import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const phase39 = read('supabase/archive/phases/phase39_worker_semantic_matching.sql');
const phase40 = read('supabase/archive/phases/phase40_fix_semantic_match_return_type.sql');
const edgeFn = read('supabase/functions/worker-search/index.ts');
const workerSearch = read('lib/workerSearch.ts');
const screen = read('screens/WorkerSearchScreen.tsx');

// ===========================================================================
// The ranking model under test
// ===========================================================================
// The hybrid blend lives in match_workers_semantic(), which needs a database
// and a 384-dimension vector to run. Rather than restate the weights here —
// where they could quietly disagree with what is actually deployed — they are
// PARSED OUT OF THE MIGRATION and the assertions below run against whatever
// the SQL really declares. Change a weight in the SQL and these tests
// evaluate the new one; break the regression and they fail.
//
// Read from phase40, not phase39: phase40 replaces match_workers_semantic()
// wholesale (one column cast fixed, everything else byte-identical — see its
// header comment), so phase40 is the version actually live in the database.
// phase39's copy of this one function is historical only, frozen the moment
// phase40 shipped, exactly like every other already-deployed migration in
// this repo.
//
// What these fixtures cannot test is gte-small's judgement. `similarity` is
// supplied directly, standing in for the cosine similarity the model would
// produce. So what is under test is the part that was actually wrong: whether
// strong evidence of relevant completed work can still be beaten by a generic
// category tick.
//
// All fixtures are synthetic. No production account name or id appears.

function parseWeight(name) {
  const match = phase40.match(
    new RegExp(`${name}\\s+constant\\s+double precision\\s*:=\\s*([0-9.]+)\\s*;`)
  );
  assert.ok(match, `phase40 must declare ${name} as a literal so tests can read it`);
  return Number(match[1]);
}

const W = {
  semantic: parseWeight('w_semantic'),
  related: parseWeight('w_related_jobs'),
  rating: parseWeight('w_rating'),
  category: parseWeight('w_category'),
  history: parseWeight('w_history'),
};

/** Relevance floor below which a worker is not a defensible match. */
const FLOOR = Number(edgeFn.match(/const MIN_SIMILARITY = ([0-9.]+);/)[1]);
const RESULT_LIMIT = Number(workerSearch.match(/WORKER_RESULT_LIMIT = (\d+);/)[1]);

// n7: the rating term reads the worker-role REVEALED summary — shownAverage
// and revealedTotal, profile_review_summaries' row — which is what
// lib/workerSearch.ts's ratingScore() takes since n7 (the profile's legacy
// rating_avg / rating_count are read nowhere in the app;
// tests/legacyAggregateFence.test.mjs proves it). The shrinkage is the same
// formula phase40's blend applies server-side over its own columns until
// their retirement (docs/BACKLOG.md §v1.2); only the fixture field names moved.
function ratingScore(worker) {
  const count = worker.revealedTotal ?? 0;
  const avg = Math.min(Math.max((worker.shownAverage ?? 0) / 5, 0), 1);
  return 0.6 + (avg - 0.6) * Math.min(count / 5, 1);
}

function categoryScore(worker, searched) {
  if (searched.length === 0) return 0.5;
  const matched = (worker.categories ?? []).filter((c) => searched.includes(c));
  return Math.min(matched.length / searched.length, 1);
}

function finalScore(worker, searched) {
  return (
    W.semantic * worker.similarity +
    W.related * Math.min((worker.relatedCompleted ?? 0) / 5, 1) +
    W.rating * ratingScore(worker) +
    W.category * categoryScore(worker, searched) +
    W.history * Math.min((worker.completedTotal ?? 0) / 10, 1)
  );
}

/** Mirrors the filter + ORDER BY of match_workers_semantic(). */
function rank(workers, { searched = [], viewerId = null, floor = FLOOR } = {}) {
  return workers
    .filter((w) => w.id !== viewerId)
    .filter((w) => w.banned !== true)
    .filter((w) => w.embedded !== false)
    .filter((w) => w.similarity >= floor)
    .map((w) => ({ ...w, score: finalScore(w, searched) }))
    .sort(
      (a, b) =>
        b.score - a.score || b.similarity - a.similarity || a.id.localeCompare(b.id)
    );
}

const id = (n) => `${String(n).repeat(8)}-0000-4000-8000-${String(n).repeat(12)}`;

// The PDF page-8 scenario, with synthetic stand-ins for the two accounts.
const PACKER = {
  id: id(1),
  label: 'completed storage-packing work',
  // Evidence document reads "Pack a storage unit efficiently. moving".
  similarity: 0.78,
  // Advertises moving, NOT packing — which is the whole problem: the query
  // resolves to `packing` and this worker never matches it by string.
  categories: ['moving'],
  relatedCompleted: 0,
  completedTotal: 3,
  shownAverage: 4.6,
  revealedTotal: 4,
};

const GENERIC = {
  id: id(2),
  label: 'generic category tick only',
  similarity: 0.41,
  categories: ['packing', 'moving'],
  relatedCompleted: 0,
  completedTotal: 0,
  // Deliberately a perfect rating: it must not be enough on its own.
  shownAverage: 5,
  revealedTotal: 2,
};

// ===========================================================================
// 1-4 · Relevance
// ===========================================================================

test('1 · similar meaning with different wording outranks a literal category match', () => {
  // "haul a couch down three flights" vs a worker whose completed work reads
  // "moved a sectional sofa downstairs" — no shared keyword at all.
  const paraphrase = {
    id: id(3),
    similarity: 0.74,
    categories: ['handyman'],
    relatedCompleted: 0,
    completedTotal: 2,
    shownAverage: 4.2,
    revealedTotal: 3,
  };
  const literal = {
    id: id(4),
    similarity: 0.36,
    categories: ['moving'],
    relatedCompleted: 0,
    completedTotal: 0,
    shownAverage: 4.8,
    revealedTotal: 6,
  };

  const ordered = rank([literal, paraphrase], { searched: ['moving'] });
  assert.equal(ordered[0].id, paraphrase.id);
});

test('2 · warehouse/boxes ranks storage-packing history above a category-only worker', () => {
  const ordered = rank([GENERIC, PACKER], { searched: ['packing'] });

  assert.deepEqual(
    ordered.map((w) => w.id),
    [PACKER.id, GENERIC.id],
    'a worker who completed storage-packing work must outrank one who only ticked the box'
  );

  // And not by a hair — the gap has to survive the generic worker also holding
  // a perfect rating and the only exact category match.
  assert.ok(
    ordered[0].score - ordered[1].score > 0.05,
    `expected a decisive gap, got ${ordered[0].score} vs ${ordered[1].score}`
  );
});

test('3 · exact category compatibility decides between equally relevant workers', () => {
  const base = {
    similarity: 0.6,
    relatedCompleted: 0,
    completedTotal: 1,
    shownAverage: 4.5,
    revealedTotal: 3,
  };
  const compatible = { ...base, id: id(5), categories: ['packing'] };
  const incompatible = { ...base, id: id(6), categories: ['dog_walking'] };

  const ordered = rank([incompatible, compatible], { searched: ['packing'] });
  assert.equal(ordered[0].id, compatible.id);
});

test('4 · more relevant completed jobs wins when relevance and category are equal', () => {
  const base = {
    similarity: 0.65,
    categories: ['moving'],
    completedTotal: 6,
    shownAverage: 4.4,
    revealedTotal: 5,
  };
  const experienced = { ...base, id: id(7), relatedCompleted: 4 };
  const novice = { ...base, id: id(8), relatedCompleted: 1 };

  const ordered = rank([novice, experienced], { searched: ['moving'] });
  assert.equal(ordered[0].id, experienced.id);
});

test('rating alone cannot lift an irrelevant worker over a clearly relevant one', () => {
  const relevant = {
    id: id(1),
    similarity: 0.8,
    categories: [],
    relatedCompleted: 0,
    completedTotal: 0,
    shownAverage: null,
    revealedTotal: 0,
  };
  const decorated = {
    id: id(2),
    similarity: 0.4,
    categories: ['packing'],
    relatedCompleted: 0,
    completedTotal: 10,
    shownAverage: 5,
    revealedTotal: 50,
  };

  const ordered = rank([decorated, relevant], { searched: ['packing'] });
  assert.equal(ordered[0].id, relevant.id);

  // The structural reason, asserted directly so a future re-weighting that
  // breaks it fails here rather than on a hand-checked example.
  assert.ok(
    W.semantic > W.rating + W.category,
    'relevance must outweigh rating and category combined'
  );
});

test('ranking weights are a complete, normalised set', () => {
  const total = W.semantic + W.related + W.rating + W.category + W.history;
  assert.ok(Math.abs(total - 1) < 1e-9, `weights must sum to 1, got ${total}`);
  // Completed-work evidence (relevance + related jobs) has to be worth more
  // than every reputation and category signal put together.
  assert.ok(W.semantic + W.related > W.rating + W.category + W.history);
});

// ===========================================================================
// 5-7 · Exclusions
// ===========================================================================

test('5 · an unrelated worker is dropped rather than used to fill the page', () => {
  const unrelated = {
    id: id(9),
    similarity: FLOOR - 0.01,
    categories: ['dog_walking'],
    relatedCompleted: 0,
    completedTotal: 20,
    shownAverage: 5,
    revealedTotal: 40,
  };

  const ordered = rank([PACKER, unrelated], { searched: ['packing'] });
  assert.deepEqual(ordered.map((w) => w.id), [PACKER.id]);

  // A short page is the correct answer; the SQL must not backfill to p_limit.
  assert.match(phase39, /where b\.sim >= v_floor/);
});

test('6 · the searching user is excluded server-side, not just in the client', () => {
  const ordered = rank([PACKER, GENERIC], { searched: ['packing'], viewerId: PACKER.id });
  assert.deepEqual(ordered.map((w) => w.id), [GENERIC.id]);

  // auth.uid() is read from the request JWT inside the function, so this is a
  // server-side fact rather than something the caller asserted.
  assert.match(phase39, /v_viewer\s+uuid := auth\.uid\(\);/);
  assert.match(phase39, /and p\.id <> v_viewer/);
  assert.match(phase39, /raise exception 'Sign in to search for workers\.'/);

  // The Edge Function must pass the USER's identity to the ranking call, or
  // auth.uid() would be null (or the service role) and the exclusion useless.
  // Scoped to the REAL ranking call inside Deno.serve, not the diagnostic
  // logNearMisses() probe earlier in the file (which also names
  // match_workers_semantic and is intentionally passed the caller's own
  // credentials too, but via a variable, not a literal SERVICE_KEY).
  assert.match(edgeFn, /userCredentials\(caller\.token\)/);
  const realRankingCall = edgeFn.slice(
    edgeFn.indexOf('let matchRes: Response;'),
    edgeFn.indexOf('if (!matchRes.ok)')
  );
  assert.match(realRankingCall, /'match_workers_semantic'/);
  assert.doesNotMatch(
    realRankingCall,
    /SERVICE_KEY/,
    'ranking must never be called with the service-role key'
  );
});

test('7 · banned and inactive accounts never appear or get embedded', () => {
  const banned = { ...PACKER, id: id(3), banned: true };
  const ordered = rank([banned, GENERIC], { searched: ['packing'] });
  assert.deepEqual(ordered.map((w) => w.id), [GENERIC.id]);

  // Both in the ranking and in the refresh queue — a banned account should not
  // even consume a model call.
  const matchFn = phase39.slice(phase39.indexOf('function public.match_workers_semantic'));
  assert.match(matchFn, /and coalesce\(p\.banned, false\) = false/);

  const queueFn = phase39.slice(
    phase39.indexOf('function public.worker_semantic_refresh_queue'),
    phase39.indexOf('function public.apply_worker_embeddings')
  );
  assert.match(queueFn, /coalesce\(pr\.banned, false\) = false/);
});

// ===========================================================================
// 8 · Determinism
// ===========================================================================

test('8 · ordering is stable across runs and independent of input order', () => {
  const tied = [id(1), id(2), id(3), id(4)].map((workerId) => ({
    id: workerId,
    similarity: 0.7,
    categories: ['moving'],
    relatedCompleted: 2,
    completedTotal: 5,
    shownAverage: 4.5,
    revealedTotal: 5,
  }));

  const forwards = rank(tied, { searched: ['moving'] }).map((w) => w.id);
  const backwards = rank([...tied].reverse(), { searched: ['moving'] }).map((w) => w.id);

  assert.deepEqual(forwards, backwards, 'identical scores must not depend on input order');
  assert.deepEqual(forwards, [...forwards].sort(), 'ties must break on id, ascending');

  // The SQL has to carry the same total ordering, or the page boundary itself
  // would shift between two identical searches.
  assert.match(phase39, /order by b\.final_score desc, b\.sim desc, b\.id asc/);
});

// ===========================================================================
// 9-11 · Failure, staleness, empty
// ===========================================================================

test('9 · the Edge Function signals every failure, and the client ranks one way only', () => {
  // Lean D5 removed the client's server ranking and its fallback (withTimeout,
  // rankWorkersOnServer): the app calls the one deterministic matcher, never
  // the Edge Function. The function itself stays until D6 drops it.
  assert.doesNotMatch(workerSearch, /functions\.invoke|rankWorkersOnServer|withTimeout/);
  assert.equal(
    (workerSearch.match(/export async function findWorkers/g) ?? []).length,
    1,
    'there must be exactly one deterministic matcher'
  );

  // And the Edge Function must actually signal failure rather than returning
  // an empty 200 that would read as "nobody matched".
  for (const failure of ['unauthorized', 'embedding_failed', 'corpus_empty', 'rank_failed']) {
    assert.ok(edgeFn.includes(failure), `missing failure path: ${failure}`);
  }
  assert.match(edgeFn, /return json\(\{ error: 'corpus_empty', detail \}, 503\);/);
});

test('10 · missing and stale embeddings are handled without a manual flag', () => {
  // Staleness is derived, so it cannot drift out of step with the data.
  assert.match(
    phase39,
    /generated always as \(embedding is null or embedded_hash is distinct from source_hash\) stored/
  );

  // A worker with no vector is simply absent from ranking, never ranked at 0.
  const matchFn = phase39.slice(phase39.indexOf('function public.match_workers_semantic'));
  assert.match(matchFn, /where d\.embedding is not null/);

  const unembedded = { ...PACKER, id: id(4), embedded: false };
  assert.deepEqual(
    rank([unembedded, GENERIC], { searched: ['packing'] }).map((w) => w.id),
    [GENERIC.id]
  );

  // Only missing/stale rows are re-embedded — a search must not regenerate the
  // whole corpus — and the refresh is capped per invocation.
  assert.match(phase39, /where d\.is_stale/);
  assert.match(edgeFn, /const REFRESH_BATCH = \d+;/);
  assert.match(edgeFn, /const REFRESH_BUDGET_MS = \d+;/);

  // A vector generated from evidence that has since changed must be discarded
  // rather than written back as if it were current.
  assert.match(phase39, /and d\.source_hash = r\.source_hash;/);

  // Refreshing evidence must not delete the existing vector, or a worker would
  // vanish from search between the edit and the next refresh pass.
  const refreshFn = phase39.slice(
    phase39.indexOf('function public.refresh_worker_semantic_doc'),
    phase39.indexOf('function public.mark_worker_semantic_stale')
  );
  assert.doesNotMatch(refreshFn, /embedding\s*=\s*null/);

  // A refresh must never be able to fail the marketplace write that caused it.
  assert.match(phase39, /exception when others then\s*\n\s*raise notice 'worker semantic refresh skipped/);
});

test('11 · a below-floor semantic score ranks nobody, and a true no-match still shows', () => {
  // The SQL model drops a worker below MIN_SIMILARITY rather than ranking it
  // at a fabricated score.
  assert.deepEqual(rank([{ ...GENERIC, similarity: 0.1 }], { searched: ['packing'] }), []);

  // Lean D5: the client no longer ranks on the server, so its empty-result
  // fallback left with it; "no workers matched" is the deterministic
  // matcher's own empty answer, and the screen still has to show it. The
  // wording lives in the lib so it can name the applied category; the
  // unfiltered wording is still exactly what it was.
  assert.match(screen, /title=\{emptyResultTitle\(appliedCategoryLabel\)\}/);
  assert.match(workerSearch, /: 'No workers matched';/);
});

test('embedded workers are actually returned when a relevant one exists', () => {
  // The exact PDF page-8 phrasing this whole feature exists to answer.
  const QUERY = 'organize boxes in a warehouse';
  const packer = { ...PACKER, similarity: 0.62 };
  const unrelated = { ...GENERIC, id: id(5), similarity: 0.12 };

  const ordered = rank([unrelated, packer], { searched: ['packing'] });
  assert.deepEqual(ordered.map((w) => w.id), [packer.id]);
  assert.ok(QUERY.includes('boxes'), 'sanity: the fixture matches the query this test names');
});

test('diagnostic: near-miss scores are logged when the real ranking comes back empty', () => {
  // This is what actually made the live "No workers matched" report
  // diagnosable: the previous version had no way to see real cosine
  // similarity values anywhere Supabase Function Logs could show them.
  assert.match(edgeFn, /async function logNearMisses\(/);
  assert.match(edgeFn, /p_min_similarity: 0/);

  const gate = edgeFn.indexOf('if (rows.length === 0) {');
  const call = edgeFn.slice(gate, edgeFn.indexOf('return json({', gate));
  assert.match(call, /await logNearMisses\(queryEmbedding, categories, userCredentials\(caller\.token\)\)/);

  // The probe distinguishes "candidates existed but scored low" from "nobody
  // reached scoring at all" — those point at different bugs (the threshold
  // vs. the exclusion filters) and must not be logged identically.
  const probeFn = edgeFn.slice(
    edgeFn.indexOf('async function logNearMisses'),
    edgeFn.indexOf('type MatchRow')
  );
  assert.match(probeFn, /zero candidates even at floor 0/);
  assert.match(probeFn, /candidate\(s\) below floor \$\{MIN_SIMILARITY\}/);

  // Never logs anything beyond what match_workers_semantic already returns to
  // an authenticated caller — no new leak introduced by the diagnostic. Scoped
  // to the actual logFailure() call sites, since the surrounding function
  // legitimately discusses "queryEmbedding" and "embedding-null filtering" in
  // its parameter list and comments.
  const loggedStrings = [...probeFn.matchAll(/logFailure\(\s*'[^']*',\s*([\s\S]*?)\);/g)].map(
    (m) => m[1]
  );
  assert.ok(loggedStrings.length > 0, 'logNearMisses must actually call logFailure');
  for (const logged of loggedStrings) {
    assert.doesNotMatch(logged, /source_text|evidence\b|\bembedding\b/);
  }
});

// ===========================================================================
// 12 · Leakage
// ===========================================================================

test('12 · no raw vector or private evidence can reach a client', () => {
  // The embedding store is not in the API surface at all.
  assert.match(
    phase39,
    /revoke all on table public\.worker_semantic_docs from public, anon, authenticated;/
  );
  assert.match(phase39, /alter table public\.worker_semantic_docs enable row level security;/);
  assert.doesNotMatch(phase39, /create policy[^\n]*on public\.worker_semantic_docs/i);

  // What the one client-callable function is allowed to return.
  const matchFn = phase39.slice(phase39.indexOf('function public.match_workers_semantic'));
  const returns = matchFn.slice(matchFn.indexOf('returns table ('), matchFn.indexOf('language plpgsql'));
  for (const leak of ['embedding', 'source_text', 'evidence', 'phone', 'email', 'title', 'bio']) {
    assert.doesNotMatch(
      returns,
      new RegExp(`\\b${leak}\\b`),
      `match_workers_semantic must not return ${leak}`
    );
  }

  // source_text leaves the database in exactly one place, and only for the
  // service role.
  assert.equal(
    (phase39.match(/^\s*select d\.worker_id, d\.source_text, d\.source_hash$/gm) ?? []).length,
    1
  );
  assert.match(
    phase39,
    /grant execute on function public\.worker_semantic_refresh_queue\(integer\) to service_role;/
  );
  assert.match(
    phase39,
    /revoke all on function public\.worker_semantic_refresh_queue\(integer\) from public, anon, authenticated;/
  );
  assert.doesNotMatch(
    phase39,
    /grant execute on function public\.worker_semantic_refresh_queue\(integer\) to authenticated/
  );

  // The Edge Function maps the contract field by field. A spread would forward
  // any column added to the RPC later, so it must not appear.
  const toResult = edgeFn.slice(edgeFn.indexOf('function toResult'), edgeFn.indexOf('Deno.serve'));
  assert.doesNotMatch(toResult, /\.\.\.row/);
  for (const leak of ['sourceText', 'source_text', 'embedding', 'phone', 'email']) {
    assert.ok(!toResult.includes(leak), `worker-search response must not carry ${leak}`);
  }

  // The service-role credential exists only in the Edge Function environment.
  assert.match(edgeFn, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  for (const file of ['lib/workerSearch.ts', 'screens/WorkerSearchScreen.tsx', 'lib/supabase.ts']) {
    assert.doesNotMatch(
      read(file),
      /SERVICE_ROLE|service_role/,
      `${file} must not reference a service-role credential`
    );
  }

  // A user token is required, and a service-role key presented as one is not
  // a user.
  assert.match(edgeFn, /if \(token === SERVICE_KEY \|\| \(ANON_KEY && token === ANON_KEY\)\)/);
  assert.match(edgeFn, /\/auth\/v1\/user/);
});

test('service-role RPCs present a consistent credential pair', () => {
  // THE LIVE FAILURE THIS GUARDS. The first deployment sent
  // `apikey: ANON_KEY` alongside `Authorization: Bearer SERVICE_KEY`.
  // PostgREST resolved those calls as `anon`, which phase39 revokes EXECUTE
  // from, so worker_semantic_refresh_queue / apply_worker_embeddings /
  // worker_semantic_coverage all returned 401. Every one of those failures was
  // swallowed into `return 0`, the corpus stayed at embedded = 0 forever, and
  // the function answered 503 corpus_empty on every request.
  assert.match(edgeFn, /const serviceCredentials = \(\): Credentials => \(\{ apikey: SERVICE_KEY, bearer: SERVICE_KEY \}\)/);

  // rpc() must take the pair, never reach for a key itself.
  const rpcFn = edgeFn.slice(edgeFn.indexOf('function rpc('), edgeFn.indexOf('async function requireUser'));
  assert.match(rpcFn, /apikey: credentials\.apikey/);
  assert.match(rpcFn, /Authorization: `Bearer \$\{credentials\.bearer\}`/);
  assert.doesNotMatch(rpcFn, /ANON_KEY \|\| SERVICE_KEY/);

  // The three service_role-only RPCs must all use the service pair.
  for (const fn of [
    'worker_semantic_refresh_queue',
    'apply_worker_embeddings',
    'worker_semantic_coverage',
  ]) {
    const at = edgeFn.indexOf(`'${fn}'`);
    assert.ok(at > -1, `${fn} must be called`);
    assert.match(
      edgeFn.slice(at, at + 400),
      /serviceCredentials\(\)/,
      `${fn} is granted to service_role only and must use the service credential pair`
    );
  }
});

test('every failure path is logged so Supabase Logs can name the cause', () => {
  // The original function put the reason in the response body only, so
  // Function Logs showed nothing but booted/shutdown.
  assert.match(edgeFn, /function logFailure\(stage: string, detail: unknown\)/);
  assert.match(edgeFn, /console\.error\(`\[worker-search\] \$\{stage\}: \$\{message\}`\)/);

  // Each of the three 503 branches, and the silent steps that used to hide the
  // real cause behind them.
  for (const stage of [
    'model_unavailable',
    'embedding_failed',
    'corpus_empty',
    'refresh_queue_rpc',
    'apply_embeddings_rpc',
    'coverage_rpc',
    'rank_failed',
    'auth',
  ]) {
    assert.match(
      edgeFn,
      new RegExp(`logFailure\\('${stage}'`),
      `${stage} must log before it returns`
    );
  }

  // corpus_empty has to carry enough detail to tell a broken credential from a
  // corpus that genuinely has nothing to embed.
  assert.match(edgeFn, /refresh\(applied=\$\{refresh\.applied\}, queued=\$\{refresh\.queued\}/);
  assert.match(edgeFn, /coverage\(\$\{coverage \?/);
});

test('the embedding is normalised to a plain number array', () => {
  // A typed array would survive Array.isArray() being removed but still break
  // JSON.stringify — it serialises as {"0":…} rather than [ … ], which fails
  // apply_worker_embeddings' jsonb_typeof(...) = 'array' guard and the
  // float8[] cast on p_query_embedding.
  assert.match(edgeFn, /const vector = Array\.from\(raw \?\? \[\]\);/);
  assert.match(edgeFn, /vector\.length !== EMBEDDING_DIMENSIONS/);
  assert.match(edgeFn, /Number\.isFinite\(n\)/);

  // The documented call shape for the built-in model.
  assert.match(edgeFn, /new Supabase\.ai\.Session\(EMBEDDING_MODEL\)/);
  assert.match(edgeFn, /session\.run\(text, \{ mean_pool: true, normalize: true \}\)/);
  assert.match(edgeFn, /const EMBEDDING_MODEL = 'gte-small';/);
  assert.match(edgeFn, /const EMBEDDING_DIMENSIONS = 384;/);
});

// ===========================================================================
// 13 · Wording
// ===========================================================================

test('13 · the heading counts what is shown, never claims "best", and names its filter', () => {
  // Mirrors resultHeading(); the literals it depends on are asserted below.
  // Lean D5: one deterministic ranking, so the "best" qualifier (claimed only
  // when server ranking ran) left with the server ranking.
  const heading = (count, categoryLabel) => {
    const base =
      count >= RESULT_LIMIT
        ? `Top ${RESULT_LIMIT} matches`
        : `${count} ${count === 1 ? 'match' : 'matches'}`;
    return categoryLabel ? `${base} · ${categoryLabel}` : base;
  };

  assert.equal(heading(5), '5 matches');
  assert.equal(heading(1), '1 match');
  assert.equal(heading(RESULT_LIMIT), `Top ${RESULT_LIMIT} matches`);

  // A filtered search names its filter, in every shape the heading has.
  const LABEL = 'Dog Walking/Pet Care';
  assert.equal(heading(3, LABEL), `3 matches · ${LABEL}`);
  assert.equal(heading(1, LABEL), `1 match · ${LABEL}`);
  assert.equal(heading(RESULT_LIMIT, LABEL), `Top ${RESULT_LIMIT} matches · ${LABEL}`);

  // ...and an unlabelled call still returns exactly what it always returned,
  // so the unfiltered wording cannot drift in behind the label.
  for (const count of [5, 1, RESULT_LIMIT]) {
    assert.equal(heading(count, undefined), heading(count));
  }

  assert.match(
    workerSearch,
    /export function resultHeading\(count: number, categoryLabel\?: string\): string/
  );
  const headingFn = workerSearch.slice(
    workerSearch.indexOf('export function resultHeading'),
    workerSearch.indexOf('export function emptyResultTitle')
  );
  assert.match(headingFn, /\? `Top \$\{WORKER_RESULT_LIMIT\} matches`/);
  assert.match(headingFn, /: `\$\{count\} \$\{count === 1 \? 'match' : 'matches'\}`;/);
  assert.match(headingFn, /return categoryLabel \? `\$\{base\} · \$\{categoryLabel\}` : base;/);
  assert.doesNotMatch(headingFn, /'best '|best match/);

  // The empty state is worded in the same place, for the same reason: an
  // empty result that does not name its filter is the one most likely to be
  // read as a fault rather than an answer.
  const emptyTitle = (categoryLabel) =>
    categoryLabel ? `No ${categoryLabel} workers matched` : 'No workers matched';
  assert.equal(emptyTitle(), 'No workers matched');
  assert.equal(emptyTitle(LABEL), `No ${LABEL} workers matched`);
  assert.match(
    workerSearch,
    /export function emptyResultTitle\(categoryLabel\?: string\): string/
  );
  assert.match(
    workerSearch,
    /return categoryLabel \? `No \$\{categoryLabel\} workers matched` : 'No workers matched';/
  );

  // The screen must not be able to word either of these itself.
  assert.match(screen, /resultHeading\(state\.matches\.length, appliedCategoryLabel\)/);
  assert.match(screen, /title=\{emptyResultTitle\(appliedCategoryLabel\)\}/);
  // And the label it hands over is only ever the pinned chip's: a category the
  // typed text merely implied is never announced as one the customer chose.
  assert.match(
    screen,
    /const appliedCategoryLabel = pinnedCategory\s*\?\s*skillCategoryLabel\(pinnedCategory\)\s*:\s*undefined;/
  );
  assert.doesNotMatch(screen, /Top \$\{?WORKER_RESULT_LIMIT/);
  assert.doesNotMatch(screen, /\bAI\b|semantic|machine learning/i);
});

test('result explanations only ever restate stored evidence', () => {
  const reasonBlock = workerSearch.slice(workerSearch.indexOf('export function matchReasonText'));

  // Every claim in the PDF's "do not say" list.
  assert.doesNotMatch(reasonBlock, /\bexpert\b|available now|best in\b|top rated|highly rated/i);

  // Lean D5: the server-derived "related" and "similar work" wordings left
  // with server ranking; the one sentence left is a count worker_job_stats()
  // actually returned, so it cannot quote a client's job title.
  assert.match(reasonBlock, /const count = match\.completedInCategory;/);
  assert.match(reasonBlock, /return `\$\{count\} similar \$\{count === 1 \? 'job' : 'jobs'\} completed`;/);
  assert.doesNotMatch(reasonBlock, /Completed \$\{count\} related|Matched similar/);
  assert.match(phase39, /jsonb_each_text\(coalesce\(d\.evidence -> 'completed_by_category'/);
});

// ===========================================================================
// Security posture of the migration itself
// ===========================================================================

test('every phase39 function is security definer with a fixed search_path', () => {
  const functions = [
    'build_worker_semantic_source',
    'refresh_worker_semantic_doc',
    'mark_worker_semantic_stale',
    'worker_semantic_refresh_queue',
    'apply_worker_embeddings',
    'worker_semantic_coverage',
    'match_workers_semantic',
  ];

  for (const name of functions) {
    const start = phase39.indexOf(`function public.${name}`);
    assert.ok(start > -1, `phase39 must define ${name}`);
    const body = phase39.slice(start, start + 1600);
    assert.match(body, /security definer/i, `${name} must be security definer`);
    assert.match(
      body,
      /set search_path = public, extensions, pg_temp/i,
      `${name} must pin its search_path`
    );
  }

  // phase32 revoked the default EXECUTE grant, so anything the app needs must
  // be granted explicitly — and nothing else may be.
  assert.match(
    phase39,
    /grant execute on function public\.match_workers_semantic\([\s\S]*?\)\s*\n?\s*to authenticated, service_role;/
  );
  for (const internal of [
    'build_worker_semantic_source\\(uuid\\)',
    'refresh_worker_semantic_doc\\(uuid\\)',
    'mark_worker_semantic_stale\\(\\)',
  ]) {
    assert.match(
      phase39,
      new RegExp(`revoke all on function public\\.${internal} from public, anon, authenticated;`)
    );
    assert.doesNotMatch(
      phase39,
      new RegExp(`grant execute on function public\\.${internal} to (authenticated|anon|public)`)
    );
  }

  // Idempotent, and it must not weaken anything that already exists.
  assert.match(phase39, /create table if not exists public\.worker_semantic_docs/);
  assert.doesNotMatch(phase39, /drop table|drop policy(?![^\n]*worker_semantic)|alter table public\.(jobs|profiles|bids|reviews) /i);
});

// ===========================================================================
// phase40 · verification_status enum-vs-text return mismatch
// ===========================================================================
// THE LIVE FAILURE THIS GUARDS AGAINST. Real Supabase Function Logs, from an
// actual signed-in search:
//
//   [worker-search] rank_failed: 400 42804
//   "Returned type verification_status does not match expected type text
//    in column 4" / "structure of query does not match function result type"
//
// Postgres error 42804 names the ACTUAL column type first: `profiles.
// verification_status` is a named enum in the live database (created outside
// this repo's tracked migrations — no `create type` for it appears anywhere
// under supabase/), not `text`. phase39 declared column 4 of
// match_workers_semantic()'s RETURNS TABLE as `text` and selected
// `p.verification_status` with no cast. `node scripts/verify-schema.mjs`
// (limit=0, never executes the query body) and the original build's own
// tests could not have caught this: nothing short of actually running the
// function's `return query` surfaces a RETURNS TABLE column-type mismatch,
// which is exactly why it only failed the moment a real search ran it.

/** A RETURNS TABLE column declaration: `name type,` or `name type` (last one,
 *  no trailing comma). Column TYPE stops at the first comma at parenthesis
 *  depth 0, so `text[]`, `double precision` and `numeric` all parse correctly
 *  without needing one pattern per type shape. */
function parseReturnsTable(sql, functionName) {
  const start = sql.indexOf(`function public.${functionName}`);
  assert.ok(start > -1, `must define ${functionName}`);
  const tableStart = sql.indexOf('returns table (', start);
  const tableEnd = sql.indexOf('\n)', tableStart);
  const body = sql.slice(tableStart + 'returns table ('.length, tableEnd);
  return body
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter(Boolean)
    .map((line) => {
      const [name, ...typeParts] = line.split(/\s+/);
      return { name, type: typeParts.join(' ') };
    });
}

/**
 * Generalised detector, not a one-off string match: for every column in
 * match_workers_semantic()'s RETURNS TABLE, find the corresponding SELECT
 * expression in the query and verify it cannot return a type other than the
 * one declared. A column sourced from a KNOWN enum-backed base-table column
 * (only `profiles.verification_status`, documented in phase40's header) must
 * carry an explicit `::text` cast; anything else — a literal, an aggregate,
 * an already-cast expression — is accepted as-is. This is the shape of test
 * that would have failed on phase39 and passes on phase40.
 */
function assertNoEnumTextMismatch(sql, label) {
  const KNOWN_ENUM_BACKED_SOURCES = { verification_status: 'p.verification_status' };
  const columns = parseReturnsTable(sql, 'match_workers_semantic');
  assert.ok(columns.length >= 14, `${label}: RETURNS TABLE should have all 14 columns`);

  const fnStart = sql.indexOf('function public.match_workers_semantic');
  // Comments legitimately narrate WHY a column needs the fix — including the
  // bare source column name — so they are stripped before scanning for raw,
  // uncast occurrences. Same helper hardening.test.mjs and the phase39
  // evidence test already use.
  const body = sqlCode(sql.slice(fnStart, sql.indexOf('$$;', fnStart)));

  for (const col of columns) {
    if (col.type !== 'text') continue; // only bare `text` columns are at risk here
    const source = KNOWN_ENUM_BACKED_SOURCES[col.name];
    if (!source) continue; // not sourced from a column known to be enum-backed
    const escaped = source.replace('.', '\\.');
    const cast = new RegExp(`${escaped}::text\\b`);
    const bare = new RegExp(`(?<!::text\\s*as\\s+)\\b${escaped}\\b(?!::text)`, 'g');
    assert.match(
      body,
      cast,
      `${label}: column "${col.name}" is declared text but sourced from enum-backed ${source} with no ::text cast`
    );
    // Every occurrence of the raw source expression in the function body must
    // be the cast form — not just at least one of several.
    const rawOccurrences = (body.match(bare) ?? []).length;
    assert.equal(
      rawOccurrences,
      0,
      `${label}: found ${source} used without ::text somewhere in the function — the cast must cover every branch`
    );
  }
}

test('phase40 fixes the verification_status enum-vs-text return mismatch', () => {
  // Forward-only: a new file, phase39 itself is never edited.
  assert.doesNotMatch(phase39, /THE FIX\.|phase40/i);
  assert.match(phase40, /phase40/i);

  // THE regression this migration exists for: phase39, as deployed, has the
  // bug. This is what proves the detector actually detects something, rather
  // than trivially passing on any input.
  assert.throws(
    () => assertNoEnumTextMismatch(phase39, 'phase39'),
    /verification_status.*with no ::text cast/s,
    'the detector must actually fail against the known-broken phase39 definition'
  );

  // And phase40 must be clean.
  assertNoEnumTextMismatch(phase40, 'phase40');

  // Signature preserved exactly — same parameters, same defaults, same
  // RETURNS TABLE shape (name AND type, column for column) as phase39.
  const sig = (sql) =>
    sql.slice(
      sql.indexOf('create or replace function public.match_workers_semantic'),
      sql.indexOf('language plpgsql', sql.indexOf('function public.match_workers_semantic'))
    );
  assert.equal(
    sig(phase40).replace(/\s+/g, ' ').trim(),
    sig(phase39).replace(/\s+/g, ' ').trim(),
    'callable signature and RETURNS TABLE must be byte-identical to phase39'
  );

  // Ranking formula, thresholds and every exclusion preserved — spot-checked
  // against the same literals the original tests verify, now sourced from
  // phase40 (the live definition) instead of phase39 (superseded for this
  // one function the moment phase40 shipped).
  assert.match(phase40, /w_semantic     constant double precision := 0\.55;/);
  assert.match(phase40, /where b\.sim >= v_floor/);
  assert.match(phase40, /order by b\.final_score desc, b\.sim desc, b\.id asc/);
  assert.match(phase40, /v_viewer     uuid := auth\.uid\(\);/);
  assert.match(phase40, /raise exception 'Sign in to search for workers\.'/);
  assert.match(phase40, /and p\.id <> v_viewer/);
  assert.match(phase40, /and coalesce\(p\.banned, false\) = false/);
  assert.match(phase40, /security definer/i);
  assert.match(phase40, /set search_path = public, extensions, pg_temp/i);

  // Grants preserved: same authorised roles, still revoked from anon/public.
  assert.match(
    phase40,
    /revoke all on function public\.match_workers_semantic\([\s\S]*?\)\s*\n?\s*from public, anon;/
  );
  assert.match(
    phase40,
    /grant execute on function public\.match_workers_semantic\([\s\S]*?\)\s*\n?\s*to authenticated, service_role;/
  );

  // No other object touched — this is a single-function correction.
  assert.doesNotMatch(phase40, /create table|drop table|drop function|alter table/i);
});

/** Comments in phase39 legitimately name the evidence that was REJECTED and
 *  why, so they are stripped before asserting on what the SQL actually reads.
 *  Same treatment hardening.test.mjs gives lib/workerSearch.ts. */
function sqlCode(text) {
  return text
    .replace(/^\s*--[^\n]*$/gm, '')
    .replace(/comment on [\s\S]*?;\s*$/gm, '');
}

test('embedding evidence excludes job descriptions, review text and names', () => {
  const builder = sqlCode(
    phase39.slice(
      phase39.indexOf('function public.build_worker_semantic_source'),
      phase39.indexOf('function public.refresh_worker_semantic_doc')
    )
  );

  assert.match(builder, /j\.title/);
  assert.match(builder, /portfolio_items/);
  assert.match(builder, /pr\.bio/);

  for (const excluded of ['description', 'reviews', 'full_name', 'phone']) {
    assert.ok(
      !builder.includes(excluded),
      `semantic document must not be built from ${excluded}`
    );
  }

  // Only aggregates are stored in the half of the row the ranking reads from.
  const evidence = builder.slice(builder.indexOf('evidence := jsonb_build_object'));
  for (const leak of ['title', 'caption', 'description']) {
    assert.doesNotMatch(evidence, new RegExp(`\\b${leak}\\b`));
  }
});

test('the deterministic matcher is unchanged and is the only ranking', () => {
  // Same two candidate reads, same aggregate RPC, same exclusion.
  assert.match(workerSearch, /rpc\('worker_job_stats'/);
  assert.match(workerSearch, /\.overlaps\('categories', searchedCategories\)/);
  assert.match(workerSearch, /profile\.id === excludeUserId/);

  // No fabricated relevance in the score.
  const score = workerSearch.slice(
    workerSearch.indexOf('function scoreMatch'),
    workerSearch.indexOf('function sanitizeForFilter')
  );
  assert.doesNotMatch(score, /relevance/);
  // (Lean D5: the chip-without-text embedding guard left with server ranking.)
});

// ===========================================================================
// Free-text interpretation (interpretQuery)
// ===========================================================================
// interpretQuery turns what the customer typed on Home into service
// categories. It is pure, but it lives in a module that constructs the
// Supabase client at import time, and this suite has no build step to import
// TypeScript through — so these guard the properties of the matcher at the
// source level, the same way every other assertion in this file does.
//
// The behaviour they stand in for was verified directly against the compiled
// module: single intent, multi-intent ("sink leaking AND yard mowed" ->
// handyman + yard_work), transposition typos ("leakign", "cleanning"), and
// that pure noise returns nothing.

test('free-text interpretation scores each typed word once per category', () => {
  // Per-KEYWORD counting let one typed word score twice for the same category
  // ("cleaning" hitting both 'clean' and 'cleaning') and handed every category
  // with a long keyword list an advantage unrelated to the request. The fix is
  // a best-match-per-token inner loop, so the shape has to stay this way.
  assert.match(workerSearch, /for \(const token of tokens\) \{\s*\n\s*let best = 0;/);
  assert.match(workerSearch, /if \(weight > best\) best = weight;/);
  assert.match(workerSearch, /score \+= best;/);
});

test('ambiguous keywords are priced down by how many categories share them', () => {
  // A word filed under three categories must not carry the weight of one filed
  // under exactly one. Derived from the map rather than a hand-kept table, so
  // adding a keyword automatically re-prices everything that shares it.
  assert.match(workerSearch, /KEYWORD_BREADTH/);
  assert.match(workerSearch, /quality \/ \(KEYWORD_BREADTH\.get\(keyword\) \?\? 1\)/);
});

test('typo tolerance counts a transposition as one edit and stays bounded', () => {
  // Damerau, not plain Levenshtein: transposition is the most common real
  // typing error and plain Levenshtein prices it the same as two unrelated
  // substitutions.
  assert.match(workerSearch, /a\[i - 1\] === b\[j - 2\] && a\[i - 2\] === b\[j - 1\]/);

  // The budget is what keeps genuinely different words apart. "leaking" and
  // "cleaning" are two edits apart, as are "washing" and "walking" — allowing
  // two edits below nine characters matched all of them to each other.
  assert.match(
    workerSearch,
    /token\.length >= 9 \? 2 : token\.length >= 5 \? 1 : 0/
  );
});

test('free-text interpretation ignores filler and needs a real signal', () => {
  // Without a stopword list, "the"/"and"/"need" become fuzzy-match fodder.
  assert.match(workerSearch, /const STOPWORDS = new Set\(\[/);
  assert.match(workerSearch, /!STOPWORDS\.has\(token\)/);

  // And a lone weak fuzzy hit must not be enough to surface a category.
  assert.match(workerSearch, /MIN_CATEGORY_SCORE/);
  assert.match(workerSearch, /if \(score >= MIN_CATEGORY_SCORE\)/);
});

test('multi-word service phrases outrank their individual words', () => {
  // "pressure"/"washing" each drift; "pressure washing" does not. The phrase
  // pass is what stops "wall" (painting) beating "wall mount" (tv_mounting).
  assert.match(workerSearch, /const CATEGORY_PHRASES: Record<string, string\[\]>/);
  assert.match(workerSearch, /if \(normalized\.includes\(phrase\)\) score \+= PHRASE_SCORE;/);
  assert.ok(
    workerSearch.includes("'pressure washing'") && workerSearch.includes("'junk removal'"),
    'expected the phrase table to cover the services the Other sheet offers'
  );
});

test('free-text interpretation still returns at most three categories', () => {
  // The contract callers rely on: best first, capped, and an empty list when
  // nothing matched (which means "search by name", not "no results").
  assert.match(workerSearch, /\.slice\(0, 3\)\s*\n\s*\.map\(\(s\) => s\.key\);/);
});
