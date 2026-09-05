-- 20260930000400_job_pricing_mode.sql — chain A (a3): jobs.pricing_mode, the
-- customer's posted-price or open-bids choice, written by create_job() and
-- update_job_details().
--
-- THE DECISION: docs/DECISIONS.md 2026-09-05 entry (2) — the posted-price
-- choice at posting is IN v1 (docs/SCOPE.md "In v1", the line beginning
-- "Posted-price choice at posting"). At posting the customer chooses between
-- open bids (workers propose a price up to the stated maximum) and a posted
-- price (one budget_cents figure workers request the job at). NOT Instant
-- Book: a worker's request at the posted price is an ordinary offer the
-- customer still accepts and funds, so accept_offer() never reads the mode
-- and the assignment path stays mode-blind. The client repoint is a4.
--
-- THE VERSION: the newest migration at run start is
-- 20260930000300_nearby_alerts_default.sql, so this file takes 000400 — the
-- prompt's own number; no D5 substitution was needed. The pgTAP file is
-- supabase/tests/130_job_pricing_mode.sql, after 120.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) jobs.pricing_mode text not null default 'open_bids' — additive and
--       defaulted, so every row before this migration, the direct-offer
--       drafts create_offer() writes included, reads open_bids. Two CHECKs:
--       jobs_pricing_mode_known — the mode is one of two known values, an
--       allow-list, never a block-list (CLAUDE.md section Supabase) — and
--       jobs_posted_price_has_price — a posted-price row carries a
--       budget_cents. jobs' grants are table-level (baseline 7827-7829:
--       SELECT to anon and authenticated), so the column needs no grant of
--       its own; RLS is unchanged.
--   (2) create_job() gains p_pricing_mode text default 'open_bids' as its
--       LAST parameter (sixteen), three checks after the existing budget
--       checks, and pricing_mode in its insert. The fifteen-parameter
--       identity is removed in the same transaction — the house idiom for a
--       parameter-list change (.claude/rules/supabase.md) — so PostgREST sees
--       ONE overload and the fifteen-name call every installed build sends
--       (lib/jobs.ts createJob) resolves to it, inserting exactly the row it
--       inserts today plus pricing_mode 'open_bids'. Every other line of the
--       body is the baseline's (20260901000000_baseline.sql 1252-1355), the
--       legacy mirror coalesce(p_budget_max_cents, p_budget_min_cents,
--       p_budget_cents) included: for posted_price it resolves to
--       p_budget_cents.
--   (3) update_job_details() the same way (seventeen parameters; baseline
--       5162-5288), with pricing_mode = p_pricing_mode in its SET list. Its
--       open-with-zero-bids ownership rule is unchanged.
--   A function that is re-created loses its ACL, so each carries the
--   revoke/grant CLAUDE.md section Supabase requires in the migration that
--   creates it: revoked from public and anon, EXECUTE to authenticated only —
--   the one role the call-site inventory names (lib/jobs.ts createJob and
--   updateJob, both through supabase.rpc as the signed-in user).
--
-- WHAT THIS FILE DOES NOT TOUCH: accept_offer(), create_offer(),
-- counter_offer(), decline_offer(), withdraw_offer(), transition_job_status(),
-- quote_job_price(), snapshot_job_agreement(), and every payments / ledger /
-- settlement object — jobs is not a money table and this is not a money run.
-- No client code rides with it (a4). NOT destructive under
-- scripts/staging-scan.sh: `drop function` and `drop constraint if exists`
-- are not among its shapes (its header names the idempotent idiom as
-- unmatched by design), so the staging pipeline applies this file on push
-- with no operator tap. Reversible: one corrective migration restores the
-- fifteen- and sixteen-parameter identities and removes the column.

begin;

-- ---------------------------------------------------------------------------
-- 1. The column and its two CHECKs (D1). The constraint idiom is the one
--    20260905000000_stripe_foundation.sql used for jobs_cancel_reason_known.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists pricing_mode text not null default 'open_bids';
alter table public.jobs drop constraint if exists jobs_pricing_mode_known;
alter table public.jobs add constraint jobs_pricing_mode_known check (pricing_mode in ('open_bids', 'posted_price'));
alter table public.jobs drop constraint if exists jobs_posted_price_has_price;
alter table public.jobs add constraint jobs_posted_price_has_price check (pricing_mode <> 'posted_price' or budget_cents is not null);
comment on column public.jobs.pricing_mode is 'The customer''s posting choice (docs/DECISIONS.md 2026-09-05 entry (2)): open_bids - workers propose a price up to the stated maximum; posted_price - one budget_cents figure workers request the job at. Additive and defaulted: every row before this migration, the direct-offer drafts create_offer() writes included, reads open_bids. accept_offer() never reads it; a request at the posted price is an ordinary offer the customer accepts and funds.';

-- ---------------------------------------------------------------------------
-- 2. create_job (D2): the fifteen-parameter identity goes, the sixteen-
--    parameter one takes its place with p_pricing_mode LAST and DEFAULTED.
--    The body is the baseline's with three checks added after the budget
--    checks and pricing_mode added to the insert; nothing else moves.
-- ---------------------------------------------------------------------------
drop function if exists public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text);

create function public.create_job(
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_videos jsonb default '[]'::jsonb,
  p_budget_min_cents integer default null,
  p_budget_max_cents integer default null,
  p_scheduled_date date default null,
  p_arrival_start_hour smallint default null,
  p_arrival_end_hour smallint default null,
  p_address_line text default null,
  p_pricing_mode text default 'open_bids'
) returns public.jobs
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if (p_budget_min_cents is not null and p_budget_min_cents <= 0)
     or (p_budget_max_cents is not null and p_budget_max_cents <= 0) then
    raise exception 'Budget range values must be positive';
  end if;
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'Minimum budget cannot exceed maximum budget';
  end if;
  -- a3 (2026-09-05): the posting choice. An allow-list, never a block-list;
  -- a posted price is one amount and no range.
  if p_pricing_mode is null or p_pricing_mode not in ('open_bids', 'posted_price') then
    raise exception 'Pricing mode must be open_bids or posted_price';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_cents is null or p_budget_cents <= 0) then
    raise exception 'A posted price needs an amount';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_min_cents is not null or p_budget_max_cents is not null) then
    raise exception 'A posted price is one amount, not a range';
  end if;
  -- 10 photos per the screen-13 spec (was 5 before phase49).
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 10 then
    raise exception 'Photos must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  -- Server cap stays 2 (permissive superset) so already-installed builds that
  -- allow two clips keep working; the phase-4 UI itself offers one.
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;
  if (p_arrival_start_hour is null) <> (p_arrival_end_hour is null) then
    raise exception 'Arrival window needs both a start and an end';
  end if;
  if p_arrival_start_hour is not null
     and (p_arrival_start_hour not between 0 and 23
          or p_arrival_end_hour not between 1 and 24
          or p_arrival_start_hour >= p_arrival_end_hour) then
    raise exception 'Arrival window hours are invalid';
  end if;
  if v_address is not null and length(v_address) > 200 then
    raise exception 'Address must be at most 200 characters';
  end if;

  insert into public.jobs (
    client_id, title, description, category, location,
    budget_cents, budget_min_cents, budget_max_cents,
    pricing_mode,
    scheduled_date, arrival_start_hour, arrival_end_hour,
    photos, videos, status
  )
  values (
    v_user, btrim(p_title), btrim(p_description), p_category, btrim(p_location),
    -- Legacy single-budget mirror: the range's ceiling, so every pre-range
    -- reader (including the locked Worker Home) shows a real, stated number.
    coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents),
    p_budget_min_cents, p_budget_max_cents,
    p_pricing_mode,
    p_scheduled_date, p_arrival_start_hour, p_arrival_end_hour,
    coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb), 'open'
  )
  returning * into v_job;

  if p_lat is not null or v_address is not null then
    insert into public.job_locations (job_id, lat, lng, address_line)
    values (v_job.id, p_lat, p_lng, v_address);
  end if;

  return v_job;
end;
$$;

revoke all on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) from public, anon;
grant execute on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) to authenticated;

comment on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) is
  'Posts a job for the signed-in caller (SECURITY DEFINER; authenticated only). a3 (2026-09-05, docs/DECISIONS.md entry (2)): p_pricing_mode, last and defaulted to open_bids, is the customer''s posting choice - open_bids (a range or a maximum workers bid against) or posted_price (one budget_cents figure and no range, which workers request the job at). The fifteen-name call every installed build sends resolves here and writes open_bids; migration 20260930000400 replaced the fifteen-parameter identity so PostgREST sees one overload.';

-- ---------------------------------------------------------------------------
-- 3. update_job_details (D3): the same move, seventeen parameters, the same
--    three checks after its budget checks, pricing_mode in its SET list. The
--    open-with-zero-bids ownership rule is the baseline's, unchanged.
-- ---------------------------------------------------------------------------
drop function if exists public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text);

create function public.update_job_details(
  p_job_id uuid,
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null,
  p_videos jsonb default '[]'::jsonb,
  p_budget_min_cents integer default null,
  p_budget_max_cents integer default null,
  p_scheduled_date date default null,
  p_arrival_start_hour smallint default null,
  p_arrival_end_hour smallint default null,
  p_address_line text default null,
  p_pricing_mode text default 'open_bids'
) returns public.jobs
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_address text := nullif(btrim(coalesce(p_address_line, '')), '');
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Job not found';
  end if;
  if v_job.client_id <> v_user then
    raise exception 'Only the job poster can edit this job';
  end if;
  if v_job.status <> 'open' then
    raise exception 'Only open jobs can be edited';
  end if;
  if exists (select 1 from public.job_offers o where o.job_id = p_job_id)
     or exists (select 1 from public.bids b where b.job_id = p_job_id) then
    raise exception 'Jobs with bids can no longer be edited';
  end if;

  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if (p_budget_min_cents is not null and p_budget_min_cents <= 0)
     or (p_budget_max_cents is not null and p_budget_max_cents <= 0) then
    raise exception 'Budget range values must be positive';
  end if;
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'Minimum budget cannot exceed maximum budget';
  end if;
  -- a3 (2026-09-05): the posting choice. An allow-list, never a block-list;
  -- a posted price is one amount and no range.
  if p_pricing_mode is null or p_pricing_mode not in ('open_bids', 'posted_price') then
    raise exception 'Pricing mode must be open_bids or posted_price';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_cents is null or p_budget_cents <= 0) then
    raise exception 'A posted price needs an amount';
  end if;
  if p_pricing_mode = 'posted_price' and (p_budget_min_cents is not null or p_budget_max_cents is not null) then
    raise exception 'A posted price is one amount, not a range';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 10 then
    raise exception 'Photos must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_videos, '[]'::jsonb)) > 2 then
    raise exception 'Videos must be an array with at most 2 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_videos, '[]'::jsonb)) as video(value)
    where jsonb_typeof(video.value) <> 'string'
       or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each video must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;
  if (p_arrival_start_hour is null) <> (p_arrival_end_hour is null) then
    raise exception 'Arrival window needs both a start and an end';
  end if;
  if p_arrival_start_hour is not null
     and (p_arrival_start_hour not between 0 and 23
          or p_arrival_end_hour not between 1 and 24
          or p_arrival_start_hour >= p_arrival_end_hour) then
    raise exception 'Arrival window hours are invalid';
  end if;
  if v_address is not null and length(v_address) > 200 then
    raise exception 'Address must be at most 200 characters';
  end if;

  update public.jobs
  set
    title = btrim(p_title),
    description = btrim(p_description),
    category = p_category,
    location = btrim(p_location),
    pricing_mode = p_pricing_mode,
    budget_cents = coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents),
    budget_min_cents = p_budget_min_cents,
    budget_max_cents = p_budget_max_cents,
    scheduled_date = p_scheduled_date,
    arrival_start_hour = p_arrival_start_hour,
    arrival_end_hour = p_arrival_end_hour,
    photos = coalesce(p_photos, '[]'::jsonb),
    videos = coalesce(p_videos, '[]'::jsonb)
  where id = p_job_id
  returning * into v_job;

  if p_lat is null and v_address is null then
    delete from public.job_locations where job_id = p_job_id;
  else
    insert into public.job_locations (job_id, lat, lng, address_line)
    values (p_job_id, p_lat, p_lng, v_address)
    on conflict (job_id) do update
      set lat = excluded.lat,
          lng = excluded.lng,
          address_line = excluded.address_line;
  end if;

  return v_job;
end;
$$;

revoke all on function public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) from public, anon;
grant execute on function public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) to authenticated;

comment on function public.update_job_details(uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text) is
  'Edits the caller''s own open job while it has zero offers and zero bids (SECURITY DEFINER; authenticated only). a3 (2026-09-05, docs/DECISIONS.md entry (2)): p_pricing_mode, last and defaulted to open_bids, rewrites the posting choice under the same three checks as create_job; the sixteen-name call every installed build sends resolves here and writes open_bids. Migration 20260930000400 replaced the sixteen-parameter identity so PostgREST sees one overload.';

commit;
