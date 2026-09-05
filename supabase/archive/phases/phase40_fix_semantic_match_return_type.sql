-- BRAZOS · Phase 40 · fix match_workers_semantic() return-type mismatch
--
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Forward-only correction to phase39. Does not edit phase39_worker_semantic_
-- matching.sql — that file stays exactly as deployed; this migration only
-- replaces the one function proven broken, using its existing signature.
--
-- ===========================================================================
-- THE PROVEN DEFECT
-- ===========================================================================
-- Live Supabase Function Logs, from an actual failing request:
--
--   [worker-search] rank_failed: 400 42804
--   "Returned type verification_status does not match expected type text
--    in column 4"
--   "structure of query does not match function result type"
--
-- Postgres error 42804 names the ACTUAL type first, "Returned type
-- verification_status" — meaning `public.profiles.verification_status` is a
-- named type in its own right (an enum, created outside this repo's tracked
-- migrations — no `create type` for it appears anywhere under supabase/, so
-- it predates the migration history), not `text`. phase39's
-- match_workers_semantic() declares column 4 of its RETURNS TABLE as
-- `verification_status text`, then selects `p.verification_status` straight
-- from `profiles` with no cast. Postgres only enforces that match at
-- EXECUTION time for a `returns table` plpgsql function's `return query`, not
-- at CREATE time — which is exactly why `node scripts/verify-schema.mjs`
-- (limit=0, never executes the query body) and every prior code review missed
-- it, and why the function only failed the moment a real signed-in search ran
-- it end to end.
--
-- Every other returned column was checked against its actual source type and
-- confirmed correct — none of them is enum-backed:
--   worker_id            uuid            <- p.id (uuid)
--   full_name            text            <- p.full_name (text)
--   avatar_url           text            <- p.avatar_url (text)
--   verification_status  text            <- p.verification_status  *** FIXED ***
--   rating_avg           numeric         <- p.rating_avg (numeric; architecture.md)
--   rating_count         integer         <- p.rating_count (integer)
--   categories           text[]          <- p.categories (plain text[], no enum)
--   matched_categories   text[]          <- array(unnest text[] intersect text[])
--   evidence_categories  text[]          <- already explicitly ::text[] in phase39
--   related_completed    integer         <- count(*)::int
--   completed_total      integer         <- count(*)::int
--   semantic_score       double precision <- pgvector `<=>` result (float8)
--   final_score          double precision <- explicitly ::double precision
--   reason_code          text            <- case/when returning text literals
-- Only column 4 needed a change.
--
-- ===========================================================================
-- WHAT CHANGED FROM phase39
-- ===========================================================================
-- One line: `p.verification_status` -> `p.verification_status::text` in the
-- `scored` CTE, the single place in this function that reads it from
-- `profiles`. Every downstream reference (`blended`, the final `select`) just
-- carries that already-cast column through, so one cast at the source is the
-- entire fix. Ranking formula, weights, thresholds, auth.uid() validation,
-- SECURITY DEFINER, search_path, exclusions and grants are byte-for-byte the
-- same as phase39 — this file only re-asserts them because `create or replace
-- function` is how Postgres updates a function body, and re-stating the
-- grants after it keeps this migration idempotent and self-contained the same
-- way phase35–38 do when they replace an existing RPC.

begin;

set local search_path = public, extensions, pg_temp;

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
      -- THE FIX. p.verification_status is a named enum type in the live
      -- database (not text), which is why `return query` failed at execution
      -- time with 42804 even though this function's DDL created cleanly and
      -- verify-schema's limit=0 probe never noticed. Every other selected
      -- column below was checked against its real source type — see the file
      -- header — and none of them needed a cast.
      p.verification_status::text as verification_status,
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
  'Hybrid semantic + reputation worker ranking. Requires a signed-in caller, excludes the caller and banned accounts, and returns only card-renderable fields — never the embedding, source_text or evidence blob. phase40 cast verification_status to text; no other behavioural change from phase39.';

-- Unchanged from phase39, re-asserted because `create or replace function`
-- with an identical signature keeps existing grants in Postgres, but restating
-- them here makes this migration correct and idempotent on its own, without
-- depending on phase39 having run first in the same session.
revoke all on function public.match_workers_semantic(double precision[], text[], integer, double precision)
  from public, anon;
grant execute on function public.match_workers_semantic(double precision[], text[], integer, double precision)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
