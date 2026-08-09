-- phase49: post-a-job wizard fields (BRAZOS V2 Phase 4 — post-a-job slice).
--
-- What this adds, and why each lives where it does:
--
--   * jobs.budget_min_cents / jobs.budget_max_cents — screen 15's editable
--     MIN/MAX budget range (§G: jobs carry a "budget range"). The legacy
--     single jobs.budget_cents is NOT retired: every existing reader —
--     including the LOCKED Worker Home (screen 48) and its OPEN_JOB_COLUMNS
--     projection — renders it, so create_job/update_job_details now mirror
--     the range's ceiling into it (coalesce(max, min, legacy single)). One
--     writer, one rule, no client-side second representation.
--
--   * jobs.scheduled_date + jobs.arrival_start_hour/arrival_end_hour —
--     screen 14's date + arrival window. Deliberately on the PUBLIC jobs row,
--     not job_locations: a worker deciding whether to bid needs the window,
--     and a time window does not identify a household the way an address
--     does (Phase 4 brief). Stored as a date plus local wall-clock hours
--     rather than timestamptz so the window renders identically for every
--     viewer — "8–11 AM" is a promise about the job's own neighborhood, not
--     about any viewer's timezone. jobs.scheduled_for (timestamptz, phase-era
--     legacy) is unused by all app code and all 119 live rows; it is left
--     untouched rather than repurposed.
--
--   * job_locations.address_line becomes reachable from the posting flow:
--     job_locations IS the job_private_details surface (phase12 RLS: owner +
--     assigned worker only; phase43 added address_line/access_notes). The
--     wizard's exact service address goes here and nowhere else. lat/lng
--     become nullable-as-a-pair because a typed address has no GPS fix (the
--     app has no geocoder), and an address-only row is still a valid private
--     detail. Radius/hotspot RPCs filter on lat/lng arithmetic, so null-coord
--     rows simply never match — no behavior change for the map.
--
-- Idempotent: safe to run twice. Additive only: no policy, trigger, or
-- lifecycle RPC is touched. accept_bid / accept_offer / advance shims and the
-- bids projection are untouched.

begin;

-- ---------------------------------------------------------------------------
-- 1. jobs: budget range + scheduling window (public, coarse)
-- ---------------------------------------------------------------------------

alter table public.jobs add column if not exists budget_min_cents integer;
alter table public.jobs add column if not exists budget_max_cents integer;
alter table public.jobs add column if not exists scheduled_date date;
alter table public.jobs add column if not exists arrival_start_hour smallint;
alter table public.jobs add column if not exists arrival_end_hour smallint;

do $$ begin
  alter table public.jobs add constraint jobs_budget_range_valid check (
    (budget_min_cents is null or budget_min_cents > 0)
    and (budget_max_cents is null or budget_max_cents > 0)
    and (
      budget_min_cents is null
      or budget_max_cents is null
      or budget_min_cents <= budget_max_cents
    )
  );
exception when duplicate_object then null; end $$;

-- Hours are the job's own local wall clock: start 0–23, end 1–24 (24 = "until
-- midnight"), always as a pair, always forward.
do $$ begin
  alter table public.jobs add constraint jobs_arrival_window_valid check (
    ((arrival_start_hour is null) = (arrival_end_hour is null))
    and (
      arrival_start_hour is null
      or (
        arrival_start_hour between 0 and 23
        and arrival_end_hour between 1 and 24
        and arrival_start_hour < arrival_end_hour
      )
    )
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. job_locations: allow an exact address without device GPS coords
-- ---------------------------------------------------------------------------

alter table public.job_locations alter column lat drop not null;
alter table public.job_locations alter column lng drop not null;

do $$ begin
  alter table public.job_locations add constraint job_locations_coords_paired
    check ((lat is null) = (lng is null));
exception when duplicate_object then null; end $$;

-- A row exists to carry SOMETHING private/precise. Every pre-phase49 row has
-- coords (lat was NOT NULL until now), so this validates instantly.
do $$ begin
  alter table public.job_locations add constraint job_locations_not_empty
    check (lat is not null or address_line is not null);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. create_job: accept the new wizard fields
--    Parameter list changes, so per the standing rule: drop the exact old
--    signature, create the new one, re-grant (phase32 revoked defaults).
--    Every new parameter has a default, so an already-installed app build
--    calling with the old nine named arguments still resolves to this
--    function through PostgREST.
-- ---------------------------------------------------------------------------

drop function if exists public.create_job(
  text, text, public.job_category, text, integer, jsonb,
  double precision, double precision, jsonb
);

create or replace function public.create_job(
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
  p_address_line text default null
)
returns public.jobs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
    scheduled_date, arrival_start_hour, arrival_end_hour,
    photos, videos, status
  )
  values (
    v_user, btrim(p_title), btrim(p_description), p_category, btrim(p_location),
    -- Legacy single-budget mirror: the range's ceiling, so every pre-range
    -- reader (including the locked Worker Home) shows a real, stated number.
    coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents),
    p_budget_min_cents, p_budget_max_cents,
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

revoke all on function public.create_job(
  text, text, public.job_category, text, integer, jsonb,
  double precision, double precision, jsonb,
  integer, integer, date, smallint, smallint, text
) from public, anon;
grant execute on function public.create_job(
  text, text, public.job_category, text, integer, jsonb,
  double precision, double precision, jsonb,
  integer, integer, date, smallint, smallint, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. update_job_details: same new fields, and — critically — editing must not
--    destroy a saved private address. The old body deleted the job_locations
--    row whenever an edit arrived without coords; now the row is only removed
--    when the edit carries neither coords nor an address, and the upsert
--    preserves access_notes.
--    Compat note (recorded in BUILD_STATE): an already-installed pre-phase49
--    build editing a job clears range/window fields it never displayed —
--    its single-budget edit wins, same as its own UI shows.
-- ---------------------------------------------------------------------------

drop function if exists public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb,
  double precision, double precision, jsonb
);

create or replace function public.update_job_details(
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
  p_address_line text default null
)
returns public.jobs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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

revoke all on function public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb,
  double precision, double precision, jsonb,
  integer, integer, date, smallint, smallint, text
) from public, anon;
grant execute on function public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb,
  double precision, double precision, jsonb,
  integer, integer, date, smallint, smallint, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sentinel — created LAST inside this transaction, so its existence proves
--    everything above it committed. verify-schema keys the phase49 group's
--    PENDING→OK flip on this exact function.
-- ---------------------------------------------------------------------------

create or replace function public.post_wizard_fields_enabled()
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$ select true; $$;

comment on function public.post_wizard_fields_enabled() is
  'phase49 sentinel: budget range, scheduling window, and address-capable job_locations are live.';

revoke all on function public.post_wizard_fields_enabled() from public, anon;
grant execute on function public.post_wizard_fields_enabled() to authenticated;

commit;
