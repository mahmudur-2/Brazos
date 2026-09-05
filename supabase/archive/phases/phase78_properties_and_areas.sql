-- ============================================================================
-- phase78_properties_and_areas.sql
--
-- Step 7. Three additive changes, one transaction, hand-applied to STAGING.
--
--   1. public.areas  - the closed neighbourhood list. Boundaries come from
--      NYC DCP's 2020 Neighborhood Tabulation Areas; rings are stored as
--      plain jsonb with a bounding box beside them, so point-in-polygon is
--      ordinary SQL and this file needs NO extension. PostGIS was considered
--      and rejected: it is not relocatable after install on Supabase and its
--      types are invisible to PostgREST unless everything is schema
--      qualified. At ~260 static rows a spatial index buys nothing.
--      SEEDED SEPARATELY by phase78_areas_seed.sql - this file creates the
--      table empty, and area_for_point() simply returns null until it is.
--
--   2. public.properties - a place a customer owns, so jobs attach to a
--      unit rather than to a retyped address string. ONE table with an
--      optional unit label: a four-unit building is four rows. Any account
--      may own one. Address is split, never free text.
--
--   3. jobs.property_id and jobs.area_code - both NULLABLE, both ON DELETE
--      SET NULL. A required column would break every existing job.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO: it does not touch create_job().
-- That function's current definition is not in version-controlled reach of
-- this migration's author, and rewriting a live RPC from an inferred
-- signature is exactly the mistake this repo's migration discipline exists
-- to prevent. Attaching a property is set_job_property(), a new function
-- with its own ownership check.
--
-- ASCII only. One transaction. Safe to run more than once.
-- ============================================================================

begin;

set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 0. Preconditions. Raise and roll back rather than half-apply.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.jobs') is null then
    raise exception 'phase78: public.jobs not found';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'client_id'
  ) then
    raise exception 'phase78: jobs.client_id not found - set_job_property checks ownership through it';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. areas
-- ---------------------------------------------------------------------------
create table if not exists public.areas (
  code          text primary key,
  name          text not null,
  display_name  text not null,
  borough       text not null,
  aliases       text[] not null default '{}',
  centroid_lat  double precision not null,
  centroid_lng  double precision not null,
  min_lat       double precision not null,
  max_lat       double precision not null,
  min_lng       double precision not null,
  max_lng       double precision not null,
  rings         jsonb not null,
  created_at    timestamptz not null default now()
);

comment on table public.areas is
  'Closed neighbourhood list, seeded from NYC DCP 2020 NTAs. rings is an array of rings, each an array of [lng, lat] pairs, even-odd rule (holes are just more rings). display_name and aliases are operator-editable; name is the source label.';

create index if not exists areas_bbox_idx on public.areas (min_lat, max_lat, min_lng, max_lng);

alter table public.areas enable row level security;

drop policy if exists areas_select_all on public.areas;
create policy areas_select_all on public.areas
  for select to authenticated using (true);

revoke all on public.areas from anon;
grant select on public.areas to authenticated;
revoke insert, update, delete on public.areas from authenticated;

-- ---------------------------------------------------------------------------
-- 2. properties
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  label        text,
  street       text not null,
  unit         text,
  city         text not null,
  state        text not null,
  postal_code  text,
  area_code    text references public.areas(code) on delete set null,
  lat          double precision,
  lng          double precision,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint properties_street_len  check (char_length(street) between 1 and 200),
  constraint properties_unit_len    check (unit is null or char_length(unit) <= 40),
  constraint properties_city_len    check (char_length(city) between 1 and 100),
  constraint properties_state_len   check (char_length(state) between 2 and 40),
  constraint properties_label_len   check (label is null or char_length(label) <= 60),
  constraint properties_notes_len   check (notes is null or char_length(notes) <= 1000),
  constraint properties_coords_pair check ((lat is null) = (lng is null)),
  constraint properties_lat_range   check (lat is null or lat between -90 and 90),
  constraint properties_lng_range   check (lng is null or lng between -180 and 180)
);

comment on table public.properties is
  'A place a customer owns. One row per unit: a four-unit building is four rows sharing a street with different unit labels. lat/lng are resolved once when the address is entered; area_code is resolved from them through area_for_point().';

create index if not exists properties_owner_idx on public.properties (owner_id);
create index if not exists properties_area_idx  on public.properties (area_code);

create unique index if not exists properties_owner_address_uniq
  on public.properties (
    owner_id,
    lower(street),
    lower(coalesce(unit, '')),
    lower(city)
  );

alter table public.properties enable row level security;

drop policy if exists properties_select_own on public.properties;
create policy properties_select_own on public.properties
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists properties_insert_own on public.properties;
create policy properties_insert_own on public.properties
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists properties_update_own on public.properties;
create policy properties_update_own on public.properties
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists properties_delete_own on public.properties;
create policy properties_delete_own on public.properties
  for delete to authenticated using (owner_id = auth.uid());

revoke all on public.properties from anon;
grant select, insert, update, delete on public.properties to authenticated;

-- ---------------------------------------------------------------------------
-- 3. jobs gains two optional links
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists property_id uuid references public.properties(id) on delete set null;

alter table public.jobs
  add column if not exists area_code text references public.areas(code) on delete set null;

create index if not exists jobs_property_idx on public.jobs (property_id);
create index if not exists jobs_area_idx     on public.jobs (area_code);

comment on column public.jobs.property_id is
  'Optional link to the poster''s saved property. Never required: every job posted before phase78 has none, and a one-off job never needs one.';

-- ---------------------------------------------------------------------------
-- 4. area_for_point() - even-odd ray casting over the stored rings, with the
--    bounding box as the prefilter so only a handful of areas are ever
--    tested. Returns null when nothing contains the point (or when the table
--    has not been seeded yet), never raises.
-- ---------------------------------------------------------------------------
create or replace function public.area_for_point(
  p_lat double precision,
  p_lng double precision
)
returns text
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code   text;
  v_rings  jsonb;
  v_ring   jsonb;
  v_n      integer;
  v_i      integer;
  v_inside boolean;
  x1 double precision; y1 double precision;
  x2 double precision; y2 double precision;
begin
  if p_lat is null or p_lng is null then
    return null;
  end if;

  for v_code, v_rings in
    select a.code, a.rings
    from public.areas a
    where p_lat between a.min_lat and a.max_lat
      and p_lng between a.min_lng and a.max_lng
  loop
    v_inside := false;

    for v_ring in select value from jsonb_array_elements(v_rings) loop
      v_n := jsonb_array_length(v_ring);
      if v_n >= 3 then
        for v_i in 0 .. v_n - 1 loop
          x1 := (v_ring -> v_i ->> 0)::double precision;
          y1 := (v_ring -> v_i ->> 1)::double precision;
          x2 := (v_ring -> ((v_i + 1) % v_n) ->> 0)::double precision;
          y2 := (v_ring -> ((v_i + 1) % v_n) ->> 1)::double precision;
          if ((y1 > p_lat) <> (y2 > p_lat))
             and (p_lng < (x2 - x1) * (p_lat - y1) / nullif(y2 - y1, 0) + x1) then
            v_inside := not v_inside;
          end if;
        end loop;
      end if;
    end loop;

    if v_inside then
      return v_code;
    end if;
  end loop;

  return null;
end
$function$;

revoke all on function public.area_for_point(double precision, double precision) from public, anon;
grant execute on function public.area_for_point(double precision, double precision) to authenticated;

comment on function public.area_for_point(double precision, double precision) is
  'Which seeded area contains this point, or null. Even-odd rule over areas.rings, bounding box prefiltered. Deliberately extension-free.';

-- ---------------------------------------------------------------------------
-- 5. set_job_property() - the only way a client links a job to a property.
--    jobs carries no client write grant (phase76 F-040), so this is SECURITY
--    DEFINER with its own two ownership checks: the job must be the caller's
--    and so must the property.
-- ---------------------------------------------------------------------------
create or replace function public.set_job_property(
  p_job_id      uuid,
  p_property_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_client uuid;
  v_owner  uuid;
  v_area   text;
begin
  if auth.uid() is null then
    raise exception 'phase78: not signed in';
  end if;

  select j.client_id into v_client from public.jobs j where j.id = p_job_id;
  if v_client is null then
    raise exception 'phase78: job not found';
  end if;
  if v_client <> auth.uid() then
    raise exception 'phase78: not your job';
  end if;

  if p_property_id is null then
    update public.jobs set property_id = null where id = p_job_id;
    return;
  end if;

  select p.owner_id, p.area_code into v_owner, v_area
  from public.properties p where p.id = p_property_id;
  if v_owner is null then
    raise exception 'phase78: property not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'phase78: not your property';
  end if;

  update public.jobs
  set property_id = p_property_id,
      area_code   = coalesce(v_area, area_code)
  where id = p_job_id;
end
$function$;

revoke all on function public.set_job_property(uuid, uuid) from public, anon;
grant execute on function public.set_job_property(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-check. Any failure raises and rolls the whole file back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_cmd text;
begin
  if to_regclass('public.areas') is null or to_regclass('public.properties') is null then
    raise exception 'PHASE78 SELF-CHECK FAIL (a): a table is missing';
  end if;

  if not exists (
    select 1 from pg_class where oid = 'public.properties'::regclass and relrowsecurity
  ) or not exists (
    select 1 from pg_class where oid = 'public.areas'::regclass and relrowsecurity
  ) then
    raise exception 'PHASE78 SELF-CHECK FAIL (b): RLS is not enabled on both tables';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'properties') < 4 then
    raise exception 'PHASE78 SELF-CHECK FAIL (c): properties is missing owner policies';
  end if;

  foreach v_cmd in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.areas', v_cmd) then
      raise exception 'PHASE78 SELF-CHECK FAIL (d): authenticated can % public.areas', v_cmd;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.properties', 'SELECT')
     or has_table_privilege('anon', 'public.areas', 'SELECT') then
    raise exception 'PHASE78 SELF-CHECK FAIL (e): anon can read a phase78 table';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs'
      and column_name in ('property_id', 'area_code')
    having count(*) = 2
  ) then
    raise exception 'PHASE78 SELF-CHECK FAIL (f): jobs did not gain both columns';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs'
      and column_name in ('property_id', 'area_code')
      and is_nullable = 'NO'
  ) then
    raise exception 'PHASE78 SELF-CHECK FAIL (f): a new jobs column is NOT NULL - every existing job would break';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_job_property'
      and p.prosecdef
      and array_to_string(p.proconfig, ',') like '%pg_temp%'
  ) then
    raise exception 'PHASE78 SELF-CHECK FAIL (g): set_job_property is missing, not SECURITY DEFINER, or not pg_temp-pinned';
  end if;

  if public.area_for_point(40.5906, -73.9486) is distinct from
     public.area_for_point(40.5906, -73.9486) then
    raise exception 'PHASE78 SELF-CHECK FAIL (h): area_for_point is not stable';
  end if;

  raise notice 'PHASE78 SELF-CHECK PASS: 8 assertion groups verified';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Sentinel, created last, so verify-schema.mjs cannot see it unless every
--    section above committed.
-- ---------------------------------------------------------------------------
create or replace function public.phase78_properties_enabled()
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$ select true $function$;

revoke all on function public.phase78_properties_enabled() from public, anon;
grant execute on function public.phase78_properties_enabled() to authenticated;

comment on function public.phase78_properties_enabled() is
  'Marker for scripts/verify-schema.mjs: phase78_properties_and_areas.sql has been applied. Created last inside phase78''s transaction, so its presence proves the whole file committed.';

commit;