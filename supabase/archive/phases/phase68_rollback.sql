-- ============================================================================
-- Brazos - Phase 68 ROLLBACK
--
-- Undoes supabase/phase68_deleted_at_authorization.sql and nothing else.
--
-- It restores the five patched function bodies to their pre-phase68 form -
-- each taken verbatim from the file that was authoritative for it before
-- phase68 - and drops the phase68 sentinel so scripts/verify-schema.mjs goes
-- back to reporting phase68 as PENDING.
--
--   1. job_request_parties_ok(uuid, uuid)
--        restored from phase18_hire_requests_and_replies.sql:153
--   2. should_notify(uuid, uuid, text)
--        restored from phase56_notification_feed.sql:59
--   3. transition_job_status(uuid, text, jsonb, jsonb)
--        restored from phase58_hardening_fixes.sql:138
--   4. match_workers_semantic(double precision[], text[], integer, double precision)
--        restored from phase40_fix_semantic_match_return_type.sql:69
--   5. worker_semantic_refresh_queue(integer)
--        restored from phase39_worker_semantic_matching.sql:395
--
-- notify_nearby_for_job(uuid) is absent because phase68 never patched it.
--
-- SAFE TO RUN MORE THAN ONCE. Every statement is `create or replace function`
-- or a `drop ... if exists`, so a second run is a no-op and a run against a
-- database that never had phase68 applied simply rewrites the same bodies.
--
-- WHAT YOU LOSE BY RUNNING THIS
--   The five bodies go back to authorizing and filtering on profiles.banned
--   alone. A tombstoned account (phase67 profiles.deleted_at) is treated as
--   valid again by all five. That is the defect phase68 exists to fix, so run
--   this only to unblock something worse.
--
-- Four comments inside these bodies contained a U+2014 EM DASH in their source
-- files. They are written here with an ASCII hyphen instead, because this run
-- writes ASCII only. Comment text only; no behaviour differs.
-- ============================================================================

begin;

set local search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. job_request_parties_ok(uuid, uuid) - phase18 body
-- ---------------------------------------------------------------------------

create or replace function public.job_request_parties_ok(p_a uuid, p_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_blocked_between(p_a, p_b) then
    return false;
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id in (p_a, p_b) and p.banned
  ) then
    return false;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. should_notify(uuid, uuid, text) - phase56 body
-- ---------------------------------------------------------------------------

create or replace function public.should_notify(
  p_recipient uuid,
  p_actor uuid,
  p_category text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefs public.notification_prefs;
  v_allowed boolean;
begin
  if p_recipient is null then
    return false;
  end if;
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.id = p_recipient and p.banned) then
    return false;
  end if;
  if p_actor is not null then
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    if exists (
      select 1 from public.mutes m
      where m.muter_id = p_recipient and m.muted_id = p_actor
    ) then
      return false;
    end if;
    if exists (select 1 from public.profiles p where p.id = p_actor and p.banned) then
      return false;
    end if;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  if v_prefs.user_id is null then
    v_allowed := (p_category <> 'nearby_jobs');
  else
    v_allowed := case p_category
      when 'messages'      then v_prefs.messages
      when 'bids'          then v_prefs.bids
      when 'job_updates'   then v_prefs.job_updates
      when 'hire_requests' then v_prefs.hire_requests
      when 'nearby_jobs'   then v_prefs.nearby_jobs
      else true
    end;
  end if;

  return v_allowed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. transition_job_status(uuid, text, jsonb, jsonb) - phase58 body
-- ---------------------------------------------------------------------------

create or replace function public.transition_job_status(
  p_job_id uuid,
  p_status text,
  p_completion_photos jsonb default null,
  p_completion_videos jsonb default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found or v_user is null or v_job.assigned_worker_id <> v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user
      and not coalesce(p.banned, false)
  ) then
    raise exception 'Active authentication required';
  end if;

  -- phase58: a retry of a transition that already landed returns the row
  -- (the sibling-RPC idempotency pattern). The retry's media is ignored -
  -- the first call's payload already landed.
  if v_job.status::text = p_status then
    return v_job;
  end if;

  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. match_workers_semantic(...) - phase40 body
-- ---------------------------------------------------------------------------

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
      -- column below was checked against its real source type - see the file
      -- header - and none of them needed a cast.
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

-- ---------------------------------------------------------------------------
-- 5. worker_semantic_refresh_queue(integer) - phase39 body
-- ---------------------------------------------------------------------------

create or replace function public.worker_semantic_refresh_queue(p_limit integer default 25)
returns table (worker_id uuid, source_text text, source_hash text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  -- Workers who have never had a document built at all - a profile that
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

-- ---------------------------------------------------------------------------
-- 6. Drop the sentinel, so verify-schema reports phase68 PENDING again.
-- ---------------------------------------------------------------------------

drop function if exists public.phase68_deleted_at_authorization_enabled();

do $$
begin
  raise notice 'PHASE68 ROLLBACK: 5 function bodies restored, sentinel dropped.';
end $$;

commit;
