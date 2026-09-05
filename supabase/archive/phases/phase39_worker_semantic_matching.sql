-- BRAZOS · Phase 39 · semantic worker matching (pgvector)
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Additive only. No existing table, column, policy, grant or function is
-- altered, so this can be applied before or after any app build: a client that
-- predates it simply never reaches the new function and keeps using the
-- deterministic ranking in lib/workerSearch.ts.
--
-- ===========================================================================
-- WHY
-- ===========================================================================
-- Requirement 8 of the requirements PDF: a query asking to "organize boxes in
-- a warehouse" surfaced a worker whose only qualification was ticking a broad
-- category, above a worker who had actually completed "pack a storage unit
-- efficiently".
--
-- That is not a weighting bug, it is a vocabulary bug. `jobs.category` is the
-- `job_category` enum; `profiles.categories` is a free text[] of the ten
-- SKILL_CATEGORIES keys. The deterministic matcher turns "boxes" into the
-- category key `packing` and then:
--
--   * shortlists candidates with `profiles.categories && '{packing}'`, and
--   * counts completed jobs whose `jobs.category` is in that same set.
--
-- Every completed job predating phase23 is filed under one of the original
-- seven enum values, so the "packing" bucket matches NO completed job at all.
-- The single strongest piece of evidence in the database — what this person
-- has actually finished — is discarded, and a category checkbox is all that is
-- left to rank on. Adding keywords cannot fix that; the two vocabularies have
-- to be compared by meaning rather than by string.
--
-- So: one embedding per worker, built from what they have actually done, and a
-- hybrid score that lets real completed work outweigh a generic category tick.
--
-- ===========================================================================
-- WHAT IS AND IS NOT EMBEDDED
-- ===========================================================================
-- IN, highest weight first:
--   * titles + categories of jobs this worker COMPLETED
--   * their own portfolio captions and categories (curated by them, and
--     already world-readable to signed-in users under phase17's
--     portfolio_select_all)
--   * their advertised categories and public bio (PUBLIC_PROFILE_COLUMNS)
--
-- OUT, deliberately:
--   * job DESCRIPTIONS. phase37 already established that a completed job's
--     free text is the client's own words about their own home, and refused to
--     return even the title on the reviews screen. Titles are used here only as
--     embedding input — `source_text` is never returned by any function
--     reachable from the app — and descriptions are not used at all.
--   * review text. Rating + review count are enough for this pass, and review
--     bodies are covered by phase6's reviews_select_party.
--   * names. Embedding a display name would let name similarity leak into
--     relevance, which is exactly the kind of unearned ranking signal
--     CLAUDE.md's "never invent marketplace data" rule exists to prevent.
--   * messages, phone, email, and every other private field.
--
-- ===========================================================================
-- WHAT LEAVES THE DATABASE
-- ===========================================================================
-- `worker_semantic_docs` has RLS on and NO policies, and every grant is
-- revoked from anon and authenticated, so neither the app nor a stolen
-- publishable key can read a row. Raw vectors, `source_text` and `evidence`
-- never appear in the return type of any function granted to `authenticated`.
-- match_workers_semantic() returns exactly what a result card renders.
--
-- ===========================================================================
-- REFRESH MODEL
-- ===========================================================================
-- No pgmq, pg_net or pg_cron — none of them are used by this project today and
-- a queue would be a lot of machinery for a table with one row per worker.
-- Instead:
--
--   * triggers on jobs / portfolio_items / profiles recompute `source_text`
--     and its md5 `source_hash` whenever the underlying evidence changes;
--   * `embedded_hash` records the hash the stored vector was actually computed
--     from, so `is_stale` is a GENERATED column and cannot drift out of sync
--     with reality the way a manually-set boolean flag would;
--   * the Edge Function re-embeds only rows where is_stale is true, capped per
--     invocation. Nothing re-embeds the whole table on a search.

begin;

set local search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 0. pgvector
-- ---------------------------------------------------------------------------
create extension if not exists vector with schema extensions;

-- Fail loudly and early rather than halfway through, if this database happens
-- to carry pgvector somewhere other than where Supabase installs it.
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';

  if v_schema is null then
    raise exception
      'pgvector is not installed. Run: create extension vector with schema extensions;';
  elsif v_schema <> 'extensions' then
    raise exception
      'pgvector is installed in schema "%", but this migration references extensions.vector. Move the extension or edit the type references before running.',
      v_schema;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Canonical per-worker semantic document
-- ---------------------------------------------------------------------------
-- ONE row per worker, deliberately. An earlier sketch had separate embeddings
-- per completed job and per portfolio item; that means N vectors to keep fresh
-- per worker, N ways for them to disagree, and a ranking step that has to
-- decide how to combine them. A single document per worker is refreshed
-- atomically and ranked with one distance operation.
--
-- 384 dimensions: the width of Supabase Edge Runtime's built-in `gte-small`.
-- Changing model means changing this width, which is why embedding_model is
-- stored per row rather than assumed.
create table if not exists public.worker_semantic_docs (
  worker_id uuid primary key references public.profiles(id) on delete cascade,
  -- Embedding input. NEVER returned to a client.
  source_text text not null default '',
  -- Aggregates only (counts and category keys) — no titles, no captions, no
  -- free text. This is the part the ranking function is allowed to read from.
  evidence jsonb not null default '{}'::jsonb,
  -- md5 of source_text. Cheap change detection, not a security primitive, and
  -- md5() is core Postgres so this needs no pgcrypto dependency.
  source_hash text not null default '',
  embedding extensions.vector(384),
  embedding_model text,
  -- The source_hash the stored vector was computed from.
  embedded_hash text,
  generated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Staleness is derived, never set. A vector is stale if it does not exist, or
-- if the evidence has moved on since it was generated.
alter table public.worker_semantic_docs
  add column if not exists is_stale boolean
  generated always as (embedding is null or embedded_hash is distinct from source_hash) stored;

create index if not exists worker_semantic_docs_stale_idx
  on public.worker_semantic_docs (updated_at)
  where is_stale;

-- Approximate-nearest-neighbour index. Guarded because it is a pure
-- optimisation: with one row per worker an exact scan is correct and fast, and
-- a missing ANN index must not stop the rest of the migration from applying.
do $$
begin
  create index if not exists worker_semantic_docs_embedding_idx
    on public.worker_semantic_docs
    using hnsw (embedding extensions.vector_cosine_ops);
exception when others then
  raise notice
    'ANN index skipped (%). Exact search is still correct at current scale.', sqlerrm;
end;
$$;

alter table public.worker_semantic_docs enable row level security;

-- No policies are created on purpose. RLS-on-with-no-policy denies everything,
-- and the grants below remove the table from PostgREST's surface entirely, so
-- the only paths in are the SECURITY DEFINER functions in this file.
revoke all on table public.worker_semantic_docs from public, anon, authenticated;

comment on table public.worker_semantic_docs is
  'One semantic document + embedding per worker, built from completed work, portfolio and public profile. Not readable by anon or authenticated at all: reachable only through the SECURITY DEFINER functions in phase39.';

-- ---------------------------------------------------------------------------
-- 2. Building the document
-- ---------------------------------------------------------------------------
-- Category keys are underscored machine values (`yard_work`, `tv_mounting`).
-- Embedding them raw would waste the model on tokens no human wrote, so they
-- are spelled out. Doing it with replace() rather than a hand-written label
-- table means a category added to the enum later needs no change here.
create or replace function public.build_worker_semantic_source(p_worker uuid)
returns table (source_text text, evidence jsonb, source_hash text)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_completed_titles text[] := '{}';
  v_completed_by_category jsonb := '{}'::jsonb;
  v_completed_total integer := 0;
  v_portfolio_captions text[] := '{}';
  v_portfolio_categories text[] := '{}';
  v_profile_categories text[] := '{}';
  v_bio text;
  v_text text;
begin
  if p_worker is null then
    return;
  end if;

  -- Completed work, most recent first. Capped: gte-small truncates at 512
  -- tokens, so a worker with 200 finished jobs would otherwise push their
  -- portfolio and bio out of the window entirely.
  select
    coalesce(array_agg(t.title order by t.created_at desc), '{}'),
    count(*)::int
  into v_completed_titles, v_completed_total
  from (
    select j.title, j.created_at
    from public.jobs j
    where j.assigned_worker_id = p_worker
      and j.status = 'completed'
      and j.title is not null
    order by j.created_at desc
    limit 25
  ) t;

  select coalesce(jsonb_object_agg(c.category, c.n), '{}'::jsonb)
  into v_completed_by_category
  from (
    select j.category::text as category, count(*)::int as n
    from public.jobs j
    where j.assigned_worker_id = p_worker
      and j.status = 'completed'
    group by j.category
  ) c;

  select
    coalesce(array_agg(p.caption) filter (where p.caption is not null), '{}'),
    coalesce(array_agg(distinct p.category), '{}')
  into v_portfolio_captions, v_portfolio_categories
  from (
    select pi.caption, pi.category
    from public.portfolio_items pi
    where pi.worker_id = p_worker
    order by pi.display_order, pi.created_at
    limit 20
  ) p;

  select coalesce(pr.categories, '{}'), nullif(btrim(coalesce(pr.bio, '')), '')
  into v_profile_categories, v_bio
  from public.profiles pr
  where pr.id = p_worker;

  -- Ordered strongest evidence first, so that if gte-small's 512-token window
  -- truncates anything it truncates the weakest signal.
  v_text := concat_ws(
    E'\n',
    nullif(array_to_string(v_completed_titles, '. '), ''),
    nullif(
      replace(array_to_string(array(select jsonb_object_keys(v_completed_by_category)), ', '), '_', ' '),
      ''
    ),
    nullif(replace(array_to_string(v_portfolio_categories, ', '), '_', ' '), ''),
    nullif(array_to_string(v_portfolio_captions, '. '), ''),
    nullif(replace(array_to_string(v_profile_categories, ', '), '_', ' '), ''),
    v_bio
  );

  v_text := left(btrim(coalesce(v_text, '')), 2000);

  source_text := v_text;
  evidence := jsonb_build_object(
    'completed_total', v_completed_total,
    'completed_by_category', v_completed_by_category,
    'portfolio_categories', to_jsonb(v_portfolio_categories),
    'profile_categories', to_jsonb(v_profile_categories),
    'has_bio', v_bio is not null
  );
  source_hash := md5(v_text);
  return next;
end;
$$;

comment on function public.build_worker_semantic_source(uuid) is
  'Assembles one worker''s embedding input from completed job titles/categories, portfolio, advertised categories and public bio. Job descriptions, review text and names are deliberately excluded.';

-- ---------------------------------------------------------------------------
-- 3. Keeping it fresh
-- ---------------------------------------------------------------------------
create or replace function public.refresh_worker_semantic_doc(p_worker uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_src record;
begin
  if p_worker is null then
    return;
  end if;

  select * into v_src from public.build_worker_semantic_source(p_worker);
  if not found then
    return;
  end if;

  insert into public.worker_semantic_docs as d
    (worker_id, source_text, evidence, source_hash, updated_at)
  values
    (p_worker, v_src.source_text, v_src.evidence, v_src.source_hash, now())
  on conflict (worker_id) do update
    set source_text = excluded.source_text,
        evidence    = excluded.evidence,
        source_hash = excluded.source_hash,
        updated_at  = now()
    -- Only when something actually moved. Without this, any touch of a job row
    -- would bump updated_at and reshuffle the refresh queue for no reason.
    where d.source_hash is distinct from excluded.source_hash
       or d.evidence    is distinct from excluded.evidence;

  -- embedded_hash is deliberately NOT cleared here. Leaving the old vector in
  -- place means a worker whose evidence just changed keeps ranking on their
  -- previous (slightly stale) document instead of vanishing from search until
  -- the next refresh pass. is_stale already flags it for re-embedding.
end;
$$;

comment on function public.refresh_worker_semantic_doc(uuid) is
  'Recomputes one worker''s semantic document and hash. Leaves any existing embedding in place; the changed hash marks it stale via the generated is_stale column.';

-- A refresh must never be able to fail the marketplace write that triggered
-- it. Completing a job matters; regenerating a search document does not.
create or replace function public.mark_worker_semantic_stale()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  begin
    if tg_table_name = 'jobs' then
      if tg_op <> 'DELETE' and new.assigned_worker_id is not null then
        perform public.refresh_worker_semantic_doc(new.assigned_worker_id);
      end if;
      -- Reassignment has to update the worker who LOST the job too.
      if tg_op = 'UPDATE'
         and old.assigned_worker_id is not null
         and old.assigned_worker_id is distinct from new.assigned_worker_id then
        perform public.refresh_worker_semantic_doc(old.assigned_worker_id);
      end if;

    elsif tg_table_name = 'portfolio_items' then
      if tg_op = 'DELETE' then
        perform public.refresh_worker_semantic_doc(old.worker_id);
      else
        perform public.refresh_worker_semantic_doc(new.worker_id);
      end if;

    elsif tg_table_name = 'profiles' then
      if tg_op <> 'DELETE' then
        perform public.refresh_worker_semantic_doc(new.id);
      end if;
    end if;
  exception when others then
    raise notice 'worker semantic refresh skipped: %', sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_worker_semantic_stale on public.jobs;
create trigger jobs_worker_semantic_stale
  after insert or update of status, assigned_worker_id, title, category
  on public.jobs
  for each row execute function public.mark_worker_semantic_stale();

drop trigger if exists portfolio_items_worker_semantic_stale on public.portfolio_items;
create trigger portfolio_items_worker_semantic_stale
  after insert or update or delete
  on public.portfolio_items
  for each row execute function public.mark_worker_semantic_stale();

drop trigger if exists profiles_worker_semantic_stale on public.profiles;
create trigger profiles_worker_semantic_stale
  after insert or update of bio, categories
  on public.profiles
  for each row execute function public.mark_worker_semantic_stale();

-- ---------------------------------------------------------------------------
-- 4. Service-role surface (the Edge Function only)
-- ---------------------------------------------------------------------------
-- This is the ONLY place source_text leaves the database, and it is granted to
-- service_role alone. `authenticated` never sees it.
create or replace function public.worker_semantic_refresh_queue(p_limit integer default 25)
returns table (worker_id uuid, source_text text, source_hash text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  -- Workers who have never had a document built at all — a profile that
  -- existed before this migration, or one created while triggers were the only
  -- thing maintaining rows. Bounded by the same cap.
  perform public.refresh_worker_semantic_doc(m.id)
  from (
    select pr.id
    from public.profiles pr
    left join public.worker_semantic_docs d on d.worker_id = pr.id
    where d.worker_id is null
      and coalesce(pr.banned, false) = false
    limit v_limit
  ) m;

  return query
  select d.worker_id, d.source_text, d.source_hash
  from public.worker_semantic_docs d
  join public.profiles pr on pr.id = d.worker_id
  where d.is_stale
    and coalesce(pr.banned, false) = false
    -- A worker with no completed work, no portfolio, no categories and no bio
    -- has nothing to embed. Spending a model call on '' would produce a vector
    -- that matches everything equally badly.
    and length(btrim(d.source_text)) > 0
  order by d.updated_at asc
  limit v_limit;
end;
$$;

comment on function public.worker_semantic_refresh_queue(integer) is
  'service_role only. Up to p_limit workers whose embedding is missing or stale, with the text to embed. The only function that returns source_text.';

create or replace function public.apply_worker_embeddings(p_rows jsonb, p_model text)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  update public.worker_semantic_docs d
     set embedding       = (r.embedding)::extensions.vector(384),
         embedding_model = p_model,
         embedded_hash   = r.source_hash,
         generated_at    = now(),
         updated_at      = now()
  from (
    select (e ->> 'worker_id')::uuid as worker_id,
           (e ->> 'source_hash')     as source_hash,
           (e -> 'embedding')::text  as embedding
    from jsonb_array_elements(p_rows) e
    where jsonb_typeof(e -> 'embedding') = 'array'
  ) r
  where d.worker_id = r.worker_id
    -- The evidence changed while the model was running. Writing this vector
    -- with the NEW hash would mark a stale embedding fresh and it would never
    -- be regenerated, so the result is dropped and re-queued next pass.
    and d.source_hash = r.source_hash;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.apply_worker_embeddings(jsonb, text) is
  'service_role only. Stores generated vectors, ignoring any whose source hash moved while the model was running.';

create or replace function public.worker_semantic_coverage()
returns table (embedded integer, stale integer, total integer)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    count(*) filter (where d.embedding is not null)::int,
    count(*) filter (where d.is_stale)::int,
    count(*)::int
  from public.worker_semantic_docs d;
$$;

comment on function public.worker_semantic_coverage() is
  'service_role only. Corpus health, so the Edge Function can fall back rather than return an empty result set when nothing has been embedded yet.';

-- ---------------------------------------------------------------------------
-- 5. Ranking (called with the SEARCHING USER's JWT, never the service role)
-- ---------------------------------------------------------------------------
-- Taking the embedding as float8[] rather than text keeps the numeric type
-- check at the API boundary instead of inside a cast. auth.uid() is read from
-- the request JWT, which is what makes "exclude me" and "signed in" real
-- server-side facts rather than client assertions.
create or replace function public.match_workers_semantic(
  p_query_embedding double precision[],
  p_categories text[] default '{}',
  p_limit integer default 12,
  p_min_similarity double precision default 0.30
)
returns table (
  worker_id uuid,
  full_name text,
  avatar_url text,
  verification_status text,
  rating_avg numeric,
  rating_count integer,
  categories text[],
  matched_categories text[],
  evidence_categories text[],
  related_completed integer,
  completed_total integer,
  semantic_score double precision,
  final_score double precision,
  reason_code text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  -- RANKING WEIGHTS. Declared as plain literals on purpose: tests/
  -- workerMatching.test.mjs reads them straight out of this file and drives its
  -- ranking assertions with whatever is actually deployed here, so the weights
  -- and the regression they are supposed to guarantee cannot drift apart.
  --
  -- w_semantic dominates because the defect being fixed is precisely a generic
  -- category tick outranking real, relevant completed work. w_rating is held
  -- low enough that a well-reviewed but irrelevant worker cannot climb over a
  -- clearly more relevant one: the most rating can ever contribute is 0.15,
  -- while the semantic gap between a paraphrase match and an unrelated
  -- document is worth several times that.
  w_semantic     constant double precision := 0.55;
  w_related_jobs constant double precision := 0.15;
  w_rating       constant double precision := 0.15;
  w_category     constant double precision := 0.10;
  w_history      constant double precision := 0.05;

  v_viewer     uuid := auth.uid();
  v_query      extensions.vector(384);
  v_limit      integer := least(greatest(coalesce(p_limit, 12), 1), 30);
  v_floor      double precision := least(greatest(coalesce(p_min_similarity, 0.30), 0), 1);
  v_categories text[] := coalesce(p_categories, '{}');
begin
  if v_viewer is null then
    raise exception 'Sign in to search for workers.' using errcode = '42501';
  end if;

  if p_query_embedding is null or coalesce(array_length(p_query_embedding, 1), 0) <> 384 then
    raise exception 'Query embedding must have exactly 384 dimensions.' using errcode = '22023';
  end if;

  v_query := ('[' || array_to_string(p_query_embedding, ',') || ']')::extensions.vector(384);

  return query
  with stats as (
    select
      j.assigned_worker_id as wid,
      count(*)::int as completed_total,
      count(*) filter (where j.category::text = any (v_categories))::int as related_completed
    from public.jobs j
    where j.status = 'completed'
      and j.assigned_worker_id is not null
    group by j.assigned_worker_id
  ),
  scored as (
    select
      p.id,
      p.full_name,
      p.avatar_url,
      p.verification_status,
      p.rating_avg,
      p.rating_count,
      coalesce(p.categories, '{}'::text[]) as categories,
      -- ORDER BY, because INTERSECT guarantees no ordering of its own and the
      -- first entry ends up in the result explanation. Cardinality is all the
      -- score uses, but the sentence under a card should not change between
      -- two identical searches.
      array(
        select unnest(coalesce(p.categories, '{}'::text[]))
        intersect
        select unnest(v_categories)
        order by 1
      ) as matched_categories,
      -- Which categories this worker's COMPLETED work is actually in, taken
      -- from the aggregate half of `evidence`. Never any free text, so a result
      -- explanation structurally cannot quote a client's job title.
      array(
        select t.k
        from jsonb_each_text(coalesce(d.evidence -> 'completed_by_category', '{}'::jsonb)) t(k, v)
        order by (t.v)::int desc, t.k
        limit 2
      )::text[] as evidence_categories,
      -- Cosine similarity. Clamped at 0 so an opposed vector cannot go
      -- negative and drag a worker below someone with no evidence at all.
      greatest(0::double precision, 1 - (d.embedding <=> v_query)) as sim,
      coalesce(s.completed_total, 0) as completed_total,
      coalesce(s.related_completed, 0) as related_completed
    from public.worker_semantic_docs d
    join public.profiles p on p.id = d.worker_id
    left join stats s on s.wid = p.id
    where d.embedding is not null
      -- Never rank the searcher against themselves.
      and p.id <> v_viewer
      -- Banned/inactive accounts stay out, matching is_profile_active().
      and coalesce(p.banned, false) = false
  ),
  blended as (
    select
      sc.*,
      (
        w_semantic * sc.sim
        + w_related_jobs * least(sc.related_completed / 5.0, 1)
        + w_rating * (
            -- Same shrinkage as ratingScore() in lib/workerSearch.ts: neutral
            -- 0.6 for an unreviewed worker, pulled toward the real average only
            -- as the review count earns it.
            0.6 + (least(greatest(coalesce(sc.rating_avg, 0) / 5.0, 0), 1) - 0.6)
                  * least(coalesce(sc.rating_count, 0) / 5.0, 1)
          )
        + w_category * (
            case
              when cardinality(v_categories) = 0 then 0.5
              else least(cardinality(sc.matched_categories)::numeric / cardinality(v_categories), 1)
            end
          )
        + w_history * least(sc.completed_total / 10.0, 1)
      )::double precision as final_score
    from scored sc
  )
  select
    b.id,
    b.full_name,
    b.avatar_url,
    b.verification_status,
    b.rating_avg,
    b.rating_count,
    b.categories,
    b.matched_categories,
    b.evidence_categories,
    b.related_completed,
    b.completed_total,
    b.sim,
    b.final_score,
    case
      when b.related_completed > 0 then 'related_completed'
      when b.completed_total > 0   then 'similar_work'
      when cardinality(b.matched_categories) > 0 then 'lists_category'
      else 'general'
    end as reason_code
  from blended b
  -- Below the floor the match is not defensible, so the row is dropped rather
  -- than used to pad the page out to p_limit.
  where b.sim >= v_floor
  -- id is the final tie-break so two identically-scored workers always come
  -- back in the same order, run to run.
  order by b.final_score desc, b.sim desc, b.id asc
  limit v_limit;
end;
$$;

comment on function public.match_workers_semantic(double precision[], text[], integer, double precision) is
  'Hybrid semantic + reputation worker ranking. Requires a signed-in caller, excludes the caller and banned accounts, and returns only card-renderable fields — never the embedding, source_text or evidence blob.';

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
-- phase32 turned OFF the default EXECUTE grant for functions created in this
-- schema, so each function is unreachable until granted here.

-- Internal: reachable only from the SECURITY DEFINER functions above.
revoke all on function public.build_worker_semantic_source(uuid) from public, anon, authenticated;
revoke all on function public.refresh_worker_semantic_doc(uuid) from public, anon, authenticated;
revoke all on function public.mark_worker_semantic_stale() from public, anon, authenticated;

-- Server-side only. A service-role key exists solely in the Edge Function's
-- environment and must never be shipped in the Expo bundle.
revoke all on function public.worker_semantic_refresh_queue(integer) from public, anon, authenticated;
grant execute on function public.worker_semantic_refresh_queue(integer) to service_role;

revoke all on function public.apply_worker_embeddings(jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_worker_embeddings(jsonb, text) to service_role;

revoke all on function public.worker_semantic_coverage() from public, anon, authenticated;
grant execute on function public.worker_semantic_coverage() to service_role;

-- The only new function the app itself may call, and only while signed in.
revoke all on function public.match_workers_semantic(double precision[], text[], integer, double precision)
  from public, anon;
grant execute on function public.match_workers_semantic(double precision[], text[], integer, double precision)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ===========================================================================
-- INITIAL BACKFILL — run ONCE, after this migration, before searching
-- ===========================================================================
-- The triggers above only fire on future writes, so every existing profile
-- starts with no document at all. This builds them (text + hash only; the
-- vectors are generated by the Edge Function's refresh pass).
--
--   select public.refresh_worker_semantic_doc(id) from public.profiles;
--
-- Then generate the vectors by invoking the Edge Function once per batch of 25
-- until worker_semantic_coverage() reports stale = 0 — see
-- supabase/functions/worker-search/index.ts for the exact curl command.
