-- ============================================================================
-- Brazos · Close the realtime coordinate leak on the Find Work feed
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- THE PROBLEM
--   Find Work's live feed (useOpenJobs) subscribes to Supabase Realtime
--   "Postgres Changes" on the `jobs` table. That mechanism reads directly off
--   the Postgres WAL (logical replication): for every row change it checks
--   RLS to decide *whether* a given subscriber may see the row at all, but
--   once a row passes that row-level check, it sends EVERY column in that
--   row — there is no column-level filtering step. Column-level GRANT/REVOKE
--   governs ordinary PostgREST `select` queries, but not this WAL-based
--   pipeline, because Realtime doesn't run a `select lat, lng from jobs` as
--   the subscriber's role — it replays raw tuples. Concretely: jobs.lat and
--   jobs.lng were being broadcast to every authenticated user browsing open
--   jobs, even though the app UI never shows exact coordinates to anyone but
--   the job's client or assigned worker.
--
-- THE FIX
--   The only way to structurally guarantee a column can never leak through
--   Postgres Changes is for that column not to exist on the replicated
--   table. So exact coordinates move off `jobs` entirely, onto a new
--   `job_locations` table that is:
--     - NOT added to the supabase_realtime publication (no live feed reads
--       it, so there's nothing to add it for),
--     - RLS-restricted to the job's client (read/write) and assigned worker
--       (read-only) — i.e. exactly the two parties who should ever see it,
--     - the ONLY place `job_hotspots()` / `jobs_in_cell()` now read
--       coordinates from (both updated below to match; their return shape
--       and privacy guarantees — aggregated cells only, no raw coordinates
--       to any client — are unchanged).
--   `jobs` itself no longer has lat/lng, so both the realtime feed AND any
--   `select('*')` query against `jobs` are safe by construction — there is
--   nothing left to accidentally leak, today or if this table changes later.
--
--   No app code currently reads or writes jobs.lat/lng (confirmed — nothing
--   geocodes a posted job yet), so this migration has zero blast radius on
--   existing behavior. The client-side query powering Find Work is also
--   tightened to an explicit column allowlist as defense in depth, so a
--   future `select('*')` there can't reopen this class of leak even if a new
--   sensitive column is added to `jobs`.
-- ============================================================================

-- 1. New table for exact coordinates, decoupled from the replicated `jobs`
--    table and never added to supabase_realtime.
create table if not exists public.job_locations (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

-- Migrate any existing jobs.lat/lng into the new table before the columns are
-- dropped. Guarded so re-running this file after the columns are already
-- gone doesn't error.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'lat'
  ) then
    insert into public.job_locations (job_id, lat, lng)
    select id, lat, lng from public.jobs
    where lat is not null and lng is not null
    on conflict (job_id) do update set lat = excluded.lat, lng = excluded.lng;
  end if;
end $$;

alter table public.job_locations enable row level security;

-- SELECT: only the job's client or its assigned worker — never anyone
-- browsing. (Nothing in the app UI surfaces this yet; this just makes sure
-- the capability is correctly scoped for when it is.)
drop policy if exists "job_locations_select_party" on public.job_locations;
create policy "job_locations_select_party"
  on public.job_locations for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_locations.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
  );

-- INSERT/UPDATE: only the job's client sets/updates its exact location (e.g.
-- once geocoding is added at post time) — the assigned worker can read it
-- but shouldn't be able to overwrite it.
drop policy if exists "job_locations_insert_owner" on public.job_locations;
create policy "job_locations_insert_owner"
  on public.job_locations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_locations.job_id and j.client_id = auth.uid()
    )
  );

drop policy if exists "job_locations_update_owner" on public.job_locations;
create policy "job_locations_update_owner"
  on public.job_locations for update
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_locations.job_id and j.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_locations.job_id and j.client_id = auth.uid()
    )
  );

-- 2. Remove exact coordinates from the table that gets replicated to every
--    browsing client. This is the actual fix for the realtime leak.
alter table public.jobs drop column if exists lat;
alter table public.jobs drop column if exists lng;

-- 3. Point the hotspot map's aggregation functions at job_locations instead.
--    Same signatures / return shapes / privacy guarantees as before — only
--    the FROM clause changes.
create or replace function public.job_hotspots()
returns table (
  ilat bigint,
  ilng bigint,
  cell_lat double precision,
  cell_lng double precision,
  job_count integer,
  categories jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  ),
  cell_cats as (
    select
      floor(loc.lat / p.dlat)::bigint as ilat,
      floor(loc.lng / p.dlng)::bigint as ilng,
      j.category::text as category,
      count(*)::int as n
    from public.jobs j
    join public.job_locations loc on loc.job_id = j.id
    cross join params p
    where j.status = 'open'
    group by 1, 2, 3
  )
  select
    cc.ilat,
    cc.ilng,
    (cc.ilat + 0.5) * p.dlat as cell_lat,
    (cc.ilng + 0.5) * p.dlng as cell_lng,
    sum(cc.n)::int as job_count,
    jsonb_object_agg(cc.category, cc.n) as categories
  from cell_cats cc
  cross join params p
  group by cc.ilat, cc.ilng, p.dlat, p.dlng;
$$;

comment on function public.job_hotspots() is
  'Aggregated open-job counts per ~0.27mi grid cell. Returns NO individual job coordinates.';

create or replace function public.jobs_in_cell(p_ilat bigint, p_ilng bigint)
returns table (
  id uuid,
  client_id uuid,
  title text,
  description text,
  category text,
  location text,
  budget_cents integer,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      0.27 / 69.0 as dlat,
      0.27 / (69.0 * cos(radians(40.7128))) as dlng
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join params p
  where j.status = 'open'
    and floor(loc.lat / p.dlat)::bigint = p_ilat
    and floor(loc.lng / p.dlng)::bigint = p_ilng
  order by j.created_at desc;
$$;

comment on function public.jobs_in_cell(bigint, bigint) is
  'Open jobs within one hotspot grid cell, WITHOUT lat/lng. Drill-down list for the map.';

revoke all on function public.job_hotspots() from public;
grant execute on function public.job_hotspots() to authenticated;

revoke all on function public.jobs_in_cell(bigint, bigint) from public;
grant execute on function public.jobs_in_cell(bigint, bigint) to authenticated;
