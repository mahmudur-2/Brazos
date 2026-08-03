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

function rpc(fn: string, args: Record<string, unknown>, bearer: string, timeoutMs: number) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY || SERVICE_KEY,
      Authorization: `Bearer ${bearer}`,
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
  if (!token) return null;
  // A service-role or anon key is not a user.
  if (token === SERVICE_KEY || (ANON_KEY && token === ANON_KEY)) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;

  const user = (await res.json()) as { id?: string };
  if (!user?.id) return null;
  return { token, userId: user.id };
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
async function refreshStaleEmbeddings(
  embed: (text: string) => Promise<number[]>
): Promise<number> {
  const startedAt = Date.now();
  try {
    const queueRes = await rpc(
      'worker_semantic_refresh_queue',
      { p_limit: REFRESH_BATCH },
      SERVICE_KEY,
      8000
    );
    if (!queueRes.ok) return 0;

    const rows = (await queueRes.json()) as QueueRow[];
    if (!Array.isArray(rows) || rows.length === 0) return 0;

    const embedded: { worker_id: string; source_hash: string; embedding: number[] }[] = [];
    for (const row of rows) {
      if (Date.now() - startedAt > REFRESH_BUDGET_MS) break;
      if (!row.source_text) continue;
      try {
        embedded.push({
          worker_id: row.worker_id,
          source_hash: row.source_hash,
          embedding: await embed(row.source_text),
        });
      } catch {
        // One unembeddable document must not discard the others in the batch.
        continue;
      }
    }
    if (embedded.length === 0) return 0;

    const applyRes = await rpc(
      'apply_worker_embeddings',
      { p_rows: embedded, p_model: EMBEDDING_MODEL },
      SERVICE_KEY,
      8000
    );
    if (!applyRes.ok) return 0;

    const applied = await applyRes.json();
    return typeof applied === 'number' ? applied : embedded.length;
  } catch {
    return 0;
  }
}

/** Whether anything at all has been embedded yet. */
async function hasEmbeddedCorpus(): Promise<boolean> {
  try {
    const res = await rpc('worker_semantic_coverage', {}, SERVICE_KEY, 5000);
    if (!res.ok) return false;
    const rows = (await res.json()) as { embedded?: number }[];
    const row = Array.isArray(rows) ? rows[0] : (rows as { embedded?: number });
    return (row?.embedded ?? 0) > 0;
  } catch {
    return false;
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
    return json({ error: 'method_not_allowed' }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500);
  }

  const caller = await requireUser(req);
  if (!caller) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { query?: unknown; categories?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_LENGTH) : '';
  if (query.length < 2) {
    return json({ error: 'query_too_short' }, 400);
  }

  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === 'string').slice(0, 5)
    : [];
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.min(Math.max(Math.trunc(body.limit), 1), 30)
      : DEFAULT_LIMIT;

  let session: { run: (t: string, o: { mean_pool: boolean; normalize: boolean }) => Promise<number[]> };
  try {
    session = new Supabase.ai.Session(EMBEDDING_MODEL);
  } catch (err) {
    return json({ error: `model_unavailable: ${err instanceof Error ? err.message : err}` }, 503);
  }

  const embed = async (text: string): Promise<number[]> => {
    const vector = await session.run(text, { mean_pool: true, normalize: true });
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector?.length}`);
    }
    return vector;
  };

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (err) {
    // Without a query vector there is no semantic ranking to do. Fall back.
    return json({ error: `embedding_failed: ${err instanceof Error ? err.message : err}` }, 503);
  }

  const refreshed = await refreshStaleEmbeddings(embed);

  // An empty corpus would make every query "no workers matched", which reads as
  // a real answer and is not one. Fall back until the backfill has run.
  if (!(await hasEmbeddedCorpus())) {
    return json({ error: 'corpus_empty' }, 503);
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
      // The USER's token, not the service role — see the header comment.
      caller.token,
      10000
    );
  } catch (err) {
    return json({ error: `rank_timeout: ${err instanceof Error ? err.message : err}` }, 504);
  }

  if (!matchRes.ok) {
    return json({ error: `rank_failed: ${matchRes.status} ${(await matchRes.text()).slice(0, 300)}` }, 502);
  }

  const rows = (await matchRes.json()) as MatchRow[];
  if (!Array.isArray(rows)) {
    return json({ error: 'rank_malformed' }, 502);
  }

  return json({
    mode: 'semantic',
    model: EMBEDDING_MODEL,
    refreshed,
    results: rows.map(toResult),
  });
});
