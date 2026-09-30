-- 20260930000600_needed_today.sql — idea 12, "Need it today": jobs.needed_today, written by
-- create_job(), and the nearby alert that says so.
--
-- THE DECISION: docs/DECISIONS.md 2026-09-30 entry (1) — "Need it today" is IN v1 (docs/SCOPE.md
-- "In v1", the line beginning "Need it today"): a posting toggle on the Review step, off by default;
-- on, nearby workers get an instant alert and the job card shows a Today pill. Honest urgency,
-- never fake scarcity: the flag is the customer's own, set once when they post, and the pill is
-- the client's to show only on the day the job was posted.
--
-- THE VERSION: the newest migration at this run's start is 20260930000500_radius_cap_3000.sql, so
-- this file takes 000600. The pgTAP file is supabase/tests/140_needed_today.sql, after 130.
--
-- WHAT THIS FILE DOES, in one transaction:
--   (1) jobs.needed_today boolean not null default false — additive and defaulted, so every row
--       before this migration, and every row an installed build posts, reads false. jobs' grants
--       are table-level (baseline: SELECT to anon and authenticated), so the column needs no grant
--       of its own; RLS is unchanged.
--   (2) create_job() gains p_needed_today boolean default false as its LAST parameter (seventeen)
--       and needed_today in its insert. The sixteen-parameter identity is removed in the same
--       transaction — the house idiom for a parameter-list change (.claude/rules/supabase.md, and
--       20260930000400_job_pricing_mode.sql before it) — so PostgREST sees ONE overload and the
--       sixteen-name call every installed build sends (lib/jobs.ts createJob) resolves to it,
--       inserting exactly the row it inserts today plus needed_today false. Every other line of the
--       body is 20260930000400's. update_job_details() is untouched: the flag is set once, at
--       posting, which is when the alert goes out.
--   (3) notify_nearby_for_job(uuid) keeps its selection, its gate (should_notify, per worker) and
--       its dedupe key; only the title changes for a job needed today — "Needed today near you"
--       instead of "New job near you" — so the alert the nearby workers already get at once says
--       what is different about this one. create or replace keeps the function's identity, and
--       its ACL is restated (revoked from public, anon and authenticated: only the job_locations
--       trigger's SECURITY DEFINER function calls it, as the baseline arranged).
--   A function that is re-created loses its ACL, so create_job carries the revoke/grant CLAUDE.md
--   section Supabase requires in the migration that creates it: revoked from public and anon,
--   EXECUTE to authenticated only — the one role the call-site inventory names (lib/jobs.ts
--   createJob, through supabase.rpc as the signed-in user).
--
-- WHAT THIS FILE DOES NOT TOUCH: accept_offer(), transition_job_status(), every payments / ledger /
-- settlement object, notification_prefs, and the outbox's drain. NOT destructive under
-- scripts/staging-scan.sh: `drop function` is not among its shapes, so the staging pipeline
-- applies this file on push with no operator tap. Reversible: one corrective migration restores
-- the sixteen-parameter identity and the alert's single title, and removes the column.

begin;

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists needed_today boolean not null default false;
comment on column public.jobs.needed_today is 'Idea 12 (docs/DECISIONS.md 2026-09-30 entry (1)): the customer asked for the job today when posting it. Set once by create_job(); nearby workers'' alert says "Needed today near you"; the app shows a Today pill only on the day the job was posted. Additive and defaulted: every earlier row, and every row an installed build posts, reads false.';

-- ---------------------------------------------------------------------------
-- 2. create_job: the sixteen-parameter identity goes, the seventeen-parameter one takes its place
--    with p_needed_today LAST and DEFAULTED.
-- ---------------------------------------------------------------------------
drop function if exists public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text);

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
  p_pricing_mode text default 'open_bids',
  p_needed_today boolean default false
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
    needed_today,
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
    -- Idea 12: the customer's own "Need it today"; a null from any caller reads as no.
    coalesce(p_needed_today, false),
    p_scheduled_date, p_arrival_start_hour, p_arrival_end_hour,
    coalesce(p_photos, '[]'::jsonb), coalesce(p_videos, '[]'::jsonb), 'open'
  )
  returning * into v_job;

  -- The job_locations insert fires the nearby alert (notify_on_job_location), which reads the
  -- row above — needed_today included — inside this same transaction.
  if p_lat is not null or v_address is not null then
    insert into public.job_locations (job_id, lat, lng, address_line)
    values (v_job.id, p_lat, p_lng, v_address);
  end if;

  return v_job;
end;
$$;

revoke all on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean) from public, anon;
grant execute on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean) to authenticated;

comment on function public.create_job(text, text, public.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text, boolean) is
  'Posts a job for the signed-in caller (SECURITY DEFINER; authenticated only). a3 (2026-09-05): p_pricing_mode is the posting choice (open_bids or posted_price). Idea 12 (2026-09-30, docs/DECISIONS.md entry (1)): p_needed_today, last and defaulted to false, is the customer''s "Need it today"; nearby workers'' alert then says so. The fifteen- and sixteen-name calls installed builds send resolve here; migration 20260930000600 replaced the sixteen-parameter identity so PostgREST sees one overload.';

-- ---------------------------------------------------------------------------
-- 3. The nearby alert: the same selection, gate and dedupe; a job needed today says so.
-- ---------------------------------------------------------------------------
create or replace function public.notify_nearby_for_job(p_job_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_loc public.job_locations;
  v_candidate record;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null or v_job.status <> 'open' then
    return;
  end if;

  select * into v_loc from public.job_locations where job_id = p_job_id;
  if v_loc.job_id is null then
    return;
  end if;

  for v_candidate in
    select np.user_id
    from public.notification_prefs np
    join public.profiles p on p.id = np.user_id
    where np.nearby_jobs
      and np.home_lat is not null
      and np.home_lng is not null
      and np.user_id <> v_job.client_id
      and not coalesce(p.banned, false)
      and (
        p.categories is null
        or array_length(p.categories, 1) is null
        or v_job.category::text = any(p.categories)
      )
      and v_loc.lat between np.home_lat - (np.nearby_radius_miles / 69.0)
                        and np.home_lat + (np.nearby_radius_miles / 69.0)
      and 3958.8 * 2 * asin(sqrt(
            power(sin(radians(v_loc.lat - np.home_lat) / 2), 2)
            + cos(radians(np.home_lat)) * cos(radians(v_loc.lat))
              * power(sin(radians(v_loc.lng - np.home_lng) / 2), 2)
          )) <= np.nearby_radius_miles
  loop
    perform public.enqueue_notification(
      v_candidate.user_id,
      v_job.client_id,
      'nearby_jobs',
      'job_nearby',
      -- Idea 12: the customer asked for it today, and the alert says so.
      case when v_job.needed_today then 'Needed today near you' else 'New job near you' end,
      left(v_job.title, 80) || coalesce(' · ' || v_job.location, ''),
      jsonb_build_object('screen', 'JobDetail', 'jobId', v_job.id::text),
      'job_nearby:' || v_job.id::text || ':' || v_candidate.user_id::text
    );
  end loop;
end;
$$;

revoke all on function public.notify_nearby_for_job(uuid) from public, anon, authenticated;

commit;
