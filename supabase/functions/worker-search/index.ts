// ============================================================================
// Brazos · worker-search  (Supabase Edge Function, Deno)
//
// Semantic worker matching for screens/WorkerSearchScreen.tsx. Embeds the
// customer's request with the Edge Runtime's built-in gte-small model, tops up
// any missing or stale worker embeddings, then asks phase39's
// match_workers_semantic() for a hybrid semantic + reputation ranking.
//
//   Deploy:  npx supabase functions deploy worker-search
//   Invoke:  the app calls this through supabase.functions.invoke, which
//            attaches the signed-in user's access token automatically.
//
// Manual smoke test (replace $USER_JWT with a real signed-in access token):
//   curl -X POST "$SUPABASE_URL/functions/v1/worker-search" \
//     -H "Authorization: Bearer $USER_JWT" \
//     -H "apikey: $SUPABASE_ANON_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"query":"organize boxes in a warehouse","categories":["packing"]}'
//
// ---------------------------------------------------------------------------
// WHY PLAIN fetch RATHER THAN supabase-js
// ---------------------------------------------------------------------------
// Same reasoning as send-push: four RPCs and no client library keeps this
// dependency-free, with no import-map pinning and no version drift against the
// Deno runtime. It also makes the two different credentials below impossible
// to confuse, because each call names the key it uses at the call site.
//
// ---------------------------------------------------------------------------
// TWO CREDENTIALS, TWO JOBS — read before editing
// ---------------------------------------------------------------------------
//   * The SEARCHING USER's JWT calls match_workers_semantic(). That is what
//     makes auth.uid() inside the function the real caller, so "you are signed
//     in" and "exclude yourself from the results" are server-side facts rather
//     than something the client asserted about itself.
//   * The SERVICE ROLE key is used ONLY to read the refresh queue and write
//     generated vectors back. Those two RPCs are granted to service_role alone
//     (phase39 §6) and they are the only place a worker's source_text exists
//     outside the database.
//
// `apikey` and `Authorization` must ALWAYS name the same identity — see the
// Credentials type below. The first deployment of this function sent the anon
// key as `apikey` alongside a service-role bearer; PostgREST resolved those
// requests as `anon`, which phase39 revokes EXECUTE from, so every refresh RPC
// came back 401 and the corpus could never be built.
//
// The service-role key lives in this function's environment and NOWHERE else.
// It must never be added to app.json, .env, or any lib/ module — the Expo
// bundle is readable by anyone who installs the app.
//
// ---------------------------------------------------------------------------
// FAILURE IS A SUPPORTED OUTCOME
// ---------------------------------------------------------------------------
// Every failure path returns a non-2xx status. lib/workerSearch.ts treats any
// non-2xx (and any timeout) as "fall back to deterministic ranking" and labels
// the results accordingly. This function therefore never invents a result set
// to avoid erroring — an empty `results` array with mode "semantic" means
// "ranked, and nothing cleared the bar", which is a different and honest
// answer from "ranking was unavailable".
// ============================================================================

// Provided by the Edge Runtime; there is no npm package to install for it.
declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run(
        input: string,
        options: { mean_pool: boolean; normalize: boolean }
      ): Promise<number[]>;
    };
  };
};

const EMBEDDING_MODEL = 'gte-small';
const EMBEDDING_DIMENSIONS = 384;

/** Longest request text embedded. gte-small truncates at 512 tokens anyway. */
const MAX_QUERY_LENGTH = 300;
/** Results asked of the database. match_workers_semantic() caps at 30 itself. */
const DEFAULT_LIMIT = 12;
/**
 * Cosine similarity below which a worker is not a defensible match. Tuned
 * conservatively: gte-small puts unrelated English sentences well above zero,
 * so this floor removes only the clearly-irrelevant tail. Revisit against real
 * data once there are enough embedded workers to measure — see the handoff.
 */
const MIN_SIMILARITY = 0.3;

/**
 * Workers re-embedded per invocation. Small on purpose: this runs inline on a
 * search, so it is a latency budget, not a throughput target. At one row per
 * worker and a marketplace of this size, a handful of searches brings the
 * whole corpus current.
 */
const REFRESH_BATCH = 10;
/** Hard ceiling on the top-up pass, so a big backlog can't stall the search. */
const REFRESH_BUDGET_MS = 4000;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

/**
 * Nothing here reaches the user, so it can be specific. Every non-2xx return
 * and every swallowed step logs through this, because the previous version
 * collapsed all of them into a bare `return 0` and Supabase's Function Logs
 * showed only boot/shutdown — which is what made a permanent 503 impossible to
 * diagnose from the outside.
 */
function logFailure(stage: string, detail: unknown) {
  const message = detail instanceof Error ? detail.message : String(detail);
  console.error(`[worker-search] ${stage}: ${message}`);
}

/**
 * A PostgREST credential pair.
 *
 * `apikey` and `Authorization` MUST name the same identity. supabase-js always
 * sends the same key in both, and phase39 grants the refresh/apply/coverage
 * functions to `service_role` only — so presenting an anon `apikey` alongside a
 * service-role bearer resolves the request as `anon`, which has EXECUTE
 * revoked, and every service-role RPC comes back 401/403.
 */
type Credentials = { apikey: string; bearer: string };

/** Service-role identity, for the two RPCs granted to service_role alone. */
const serviceCredentials = (): Credentials => ({ apikey: SERVICE_KEY, bearer: SERVICE_KEY });

/** The searching user's identity: project apikey + their own access token,
 *  which is what makes auth.uid() the real caller inside the ranking. */
const userCredentials = (token: string): Credentials => ({
  apikey: ANON_KEY || SERVICE_KEY,
  bearer: token,
});

function rpc(
  fn: string,
  args: Record<string, unknown>,
  credentials: Credentials,
  timeoutMs: number
) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: credentials.apikey,
      Authorization: `Bearer ${credentials.bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Confirms the bearer token really is a signed-in end user.
 *
 * PostgREST would reject a forged JWT on its own, and match_workers_semantic()
 * raises when auth.uid() is null, so this is defence in depth rather than the
 * only gate. What it uniquely catches is a SERVICE-ROLE key presented as if it
 * were a user: that token is valid to PostgREST but has no auth.uid(), and it
 * must never be able to drive a user-facing search.
 */
async function requireUser(req: Request): Promise<{ token: string; userId: string } | null> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    logFailure('auth', 'no bearer token on the request');
    return null;
  }
  // A service-role or anon key is not a user.
  if (token === SERVICE_KEY || (ANON_KEY && token === ANON_KEY)) {
    logFailure('auth', 'a project API key was presented as a user token');
    return null;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logFailure('auth', `/auth/v1/user responded ${res.status}`);
      return null;
    }

    const user = (await res.json()) as { id?: string };
    if (!user?.id) {
      logFailure('auth', 'user lookup returned no id');
      return null;
    }
    return { token, userId: user.id };
  } catch (err) {
    logFailure('auth', err);
    return null;
  }
}

type QueueRow = { worker_id: string; source_text: string; source_hash: string };

/**
 * Embeds whichever worker documents are missing or stale, up to the batch cap
 * and the time budget.
 *
 * Deliberately best-effort: a failure here degrades result quality for one
 * search, so it is swallowed and reported as a count rather than allowed to
 * fail a search that the already-embedded workers can answer perfectly well.
 */
type RefreshOutcome = {
  /** Rows the database accepted. */
  applied: number;
  /** Rows the queue offered. 0 means nothing was stale, or nothing had
   *  evidence worth embedding — a data state, not a failure. */
  queued: number;
  /** Set when a step failed outright, as opposed to having no work to do. */
  failure: string | null;
};

/**
 * Embeds whichever worker documents are missing or stale, up to the batch cap
 * and the time budget.
 *
 * Still best-effort — a failure here degrades one search rather than failing
 * it — but it now REPORTS what happened instead of collapsing every outcome
 * into 0. "The queue was empty" and "the queue returned 403" are completely
 * different problems and used to be indistinguishable.
 */
async function refreshStaleEmbeddings(
  embed: (text: string) => Promise<number[]>
): Promise<RefreshOutcome> {
  const startedAt = Date.now();
  const empty: RefreshOutcome = { applied: 0, queued: 0, failure: null };

  try {
    const queueRes = await rpc(
      'worker_semantic_refresh_queue',
      { p_limit: REFRESH_BATCH },
      serviceCredentials(),
      8000
    );
    if (!queueRes.ok) {
      const failure = `refresh_queue ${queueRes.status}: ${(await queueRes.text()).slice(0, 300)}`;
      logFailure('refresh_queue_rpc', failure);
      return { ...empty, failure };
    }

    const rows = (await queueRes.json()) as QueueRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      // Not an error: either everything is current, or no worker has any
      // evidence to embed yet. The corpus check below tells them apart.
      return empty;
    }

    const embedded: { worker_id: string; source_hash: string; embedding: number[] }[] = [];
    let embedFailure: string | null = null;
    for (const row of rows) {
      if (Date.now() - startedAt > REFRESH_BUDGET_MS) break;
      if (!row.source_text) continue;
      try {
        embedded.push({
          worker_id: row.worker_id,
          source_hash: row.source_hash,
          embedding: await embed(row.source_text),
        });
      } catch (err) {
        // One unembeddable document must not discard the others in the batch,
        // but it must not vanish either.
        embedFailure = err instanceof Error ? err.message : String(err);
        logFailure(`embed_worker_doc ${row.worker_id}`, err);
      }
    }
    if (embedded.length === 0) {
      return { applied: 0, queued: rows.length, failure: embedFailure ?? 'no document embedded' };
    }

    const applyRes = await rpc(
      'apply_worker_embeddings',
      { p_rows: embedded, p_model: EMBEDDING_MODEL },
      serviceCredentials(),
      8000
    );
    if (!applyRes.ok) {
      const failure = `apply_embeddings ${applyRes.status}: ${(await applyRes.text()).slice(0, 300)}`;
      logFailure('apply_embeddings_rpc', failure);
      return { applied: 0, queued: rows.length, failure };
    }

    const applied = await applyRes.json();
    const count = typeof applied === 'number' ? applied : embedded.length;
    if (count === 0) {
      // Every row was rejected by apply_worker_embeddings' source_hash guard,
      // which means the evidence moved underneath this pass.
      logFailure('apply_embeddings_wrote_nothing', `offered ${embedded.length} rows, wrote 0`);
    }
    return { applied: count, queued: rows.length, failure: null };
  } catch (err) {
    logFailure('refresh_pass', err);
    return { ...empty, failure: err instanceof Error ? err.message : String(err) };
  }
}

type Coverage = { embedded: number; stale: number; total: number };

/** Corpus health, so an empty result set can be told apart from an unbuilt index. */
async function readCoverage(): Promise<Coverage | null> {
  try {
    const res = await rpc('worker_semantic_coverage', {}, serviceCredentials(), 5000);
    if (!res.ok) {
      logFailure('coverage_rpc', `${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body = await res.json();
    const row = (Array.isArray(body) ? body[0] : body) as Partial<Coverage> | undefined;
    if (!row) return null;
    return {
      embedded: row.embedded ?? 0,
      stale: row.stale ?? 0,
      total: row.total ?? 0,
    };
  } catch (err) {
    logFailure('coverage_rpc', err);
    return null;
  }
}

type MatchRow = {
  worker_id: string;
  full_name: string | null;
  avatar_url: string | null;
  verification_status: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  categories: string[] | null;
  matched_categories: string[] | null;
  evidence_categories: string[] | null;
  related_completed: number | null;
  completed_total: number | null;
  semantic_score: number | null;
  final_score: number | null;
  reason_code: string | null;
};

/**
 * Field-by-field, never a spread of the database row.
 *
 * This is the last place a column added to match_workers_semantic() later
 * could leak to the client by accident, so the mapping is written out in full
 * on purpose. Nothing here carries an embedding, a job title, a caption, a
 * phone number or an email.
 */
function toResult(row: MatchRow) {
  return {
    workerId: row.worker_id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    verificationStatus: row.verification_status,
    ratingAvg: row.rating_avg,
    ratingCount: row.rating_count,
    categories: row.categories ?? [],
    matchedCategories: row.matched_categories ?? [],
    evidenceCategories: row.evidence_categories ?? [],
    relatedCompleted: row.related_completed ?? 0,
    completedTotal: row.completed_total ?? 0,
    relevance: row.semantic_score,
    score: row.final_score,
    reason: row.reason_code,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    logFailure('method_not_allowed', req.method);
    return json({ error: 'method_not_allowed' }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    logFailure('config', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500);
  }

  const caller = await requireUser(req);
  if (!caller) {
    // requireUser has already logged the specific reason.
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { query?: unknown; categories?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch (err) {
    logFailure('invalid_json', err);
    return json({ error: 'invalid_json' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_LENGTH) : '';
  if (query.length < 2) {
    logFailure('query_too_short', `length ${query.length}`);
    return json({ error: 'query_too_short' }, 400);
  }

  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === 'string').slice(0, 5)
    : [];
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.min(Math.max(Math.trunc(body.limit), 1), 30)
      : DEFAULT_LIMIT;

  let session: {
    run: (t: string, o: { mean_pool: boolean; normalize: boolean }) => Promise<ArrayLike<number>>;
  };
  try {
    session = new Supabase.ai.Session(EMBEDDING_MODEL);
  } catch (err) {
    logFailure('model_unavailable', err);
    return json({ error: `model_unavailable: ${err instanceof Error ? err.message : err}` }, 503);
  }

  /**
   * Array.from(), NOT the raw return value.
   *
   * The runtime is documented to return the embedding but not its exact JS
   * type, and a typed array (Float32Array) would break TWO things silently:
   * `Array.isArray` would reject it, and `JSON.stringify` would serialise it as
   * {"0":…,"1":…} rather than [ … ] — which PostgREST would hand to Postgres as
   * a jsonb OBJECT, failing apply_worker_embeddings' `jsonb_typeof(...) =
   * 'array'` guard and the float8[] cast on p_query_embedding. Normalising here
   * makes both shapes correct instead of betting on one.
   */
  const embed = async (text: string): Promise<number[]> => {
    const raw = await session.run(text, { mean_pool: true, normalize: true });
    const vector = Array.from(raw ?? []);
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`);
    }
    if (!vector.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new Error('embedding contained a non-finite value');
    }
    return vector;
  };

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (err) {
    // Without a query vector there is no semantic ranking to do. Fall back.
    logFailure('embedding_failed', err);
    return json({ error: `embedding_failed: ${err instanceof Error ? err.message : err}` }, 503);
  }

  const refresh = await refreshStaleEmbeddings(embed);

  // An empty corpus would make every query "no workers matched", which reads as
  // a real answer and is not one — so it stays a 503 and the client falls back.
  // The check is SKIPPED when this pass just wrote vectors, because then the
  // corpus is provably non-empty and the extra round trip only adds latency.
  if (refresh.applied === 0) {
    const coverage = await readCoverage();
    if (!coverage || coverage.embedded === 0) {
      // Everything needed to tell the three causes apart: a broken service-role
      // credential (refresh.failure set), a corpus with nothing worth embedding
      // (queued 0, total > 0), or a backfill that was never run (total 0).
      const detail =
        `refresh(applied=${refresh.applied}, queued=${refresh.queued}, ` +
        `failure=${refresh.failure ?? 'none'}) ` +
        `coverage(${coverage ? `embedded=${coverage.embedded}, stale=${coverage.stale}, total=${coverage.total}` : 'unavailable'})`;
      logFailure('corpus_empty', detail);
      return json({ error: 'corpus_empty', detail }, 503);
    }
  }

  let matchRes: Response;
  try {
    matchRes = await rpc(
      'match_workers_semantic',
      {
        p_query_embedding: queryEmbedding,
        p_categories: categories,
        p_limit: limit,
        p_min_similarity: MIN_SIMILARITY,
      },
      // The USER's identity, not the service role — see the header comment.
      userCredentials(caller.token),
      10000
    );
  } catch (err) {
    logFailure('rank_timeout', err);
    return json({ error: `rank_timeout: ${err instanceof Error ? err.message : err}` }, 504);
  }

  if (!matchRes.ok) {
    const detail = `${matchRes.status} ${(await matchRes.text()).slice(0, 300)}`;
    logFailure('rank_failed', detail);
    return json({ error: `rank_failed: ${detail}` }, 502);
  }

  const rows = (await matchRes.json()) as MatchRow[];
  if (!Array.isArray(rows)) {
    logFailure('rank_malformed', 'ranking RPC did not return an array');
    return json({ error: 'rank_malformed' }, 502);
  }

  return json({
    mode: 'semantic',
    model: EMBEDDING_MODEL,
    refreshed: refresh.applied,
    results: rows.map(toResult),
  });
});
