-- ============================================================================
-- Brazos · Live job hotspot map — server-side privacy aggregation
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- PRIVACY MODEL
--   Exact job coordinates (jobs.lat / jobs.lng) must never reach a client for
--   jobs the user doesn't own / isn't assigned to. These two SECURITY DEFINER
--   functions are the ONLY path the map uses to touch coordinates:
--     * job_hotspots()  -> returns ONLY aggregated grid cells (center, count,
--                          category breakdown). No individual coordinates.
--     * jobs_in_cell()  -> returns the open jobs in one cell WITHOUT lat/lng
--                          (same shape the Find Work browse already exposes).
--   Because they are SECURITY DEFINER (run as the function owner) they read
--   jobs.lat/lng server-side and hand back only safe, aggregated output. The
--   app calls these via RPC and never selects raw lat/lng itself.
--
-- GRID MATH (roughly-square ~0.27 mile cells, anchored to a fixed origin)
--   1 degree of latitude  ~= 69 miles everywhere.
--   1 degree of longitude ~= 69 * cos(latitude) miles — longitude compresses
--   toward the poles. A naive equal-degree grid would make cells tall-and-thin
--   at NYC's latitude. We correct with cos(REF_LAT) so cells are ~square.
--   We use a SINGLE fixed reference latitude (NYC, 40.7128) rather than each
--   job's own latitude on purpose: a per-row cos() would shift longitude cell
--   boundaries between latitude bands and create visible seams as the user
--   pans. A fixed reference keeps every cell boundary globally aligned (no
--   seams) and square specifically at NYC's latitude — the launch market.
--   The grid is anchored at the (0,0) origin (floor(coord / step)), NOT at the
--   user, so cells stay put as the user pans and zooms.
-- ============================================================================

-- 0.27 mi cell:  dlat = 0.27/69,  dlng = 0.27/(69*cos(40.7128°))
-- (kept inline in each function so there's no dependency on a shared object)

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
      floor(j.lat / p.dlat)::bigint as ilat,
      floor(j.lng / p.dlng)::bigint as ilng,
      j.category::text as category,
      count(*)::int as n
    from public.jobs j
    cross join params p
    where j.status = 'open'
      and j.lat is not null
      and j.lng is not null
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
  cross join params p
  where j.status = 'open'
    and j.lat is not null
    and j.lng is not null
    and floor(j.lat / p.dlat)::bigint = p_ilat
    and floor(j.lng / p.dlng)::bigint = p_ilng
  order by j.created_at desc;
$$;

comment on function public.jobs_in_cell(bigint, bigint) is
  'Open jobs within one hotspot grid cell, WITHOUT lat/lng. Drill-down list for the map.';

-- Only authenticated users may call these (the whole app is behind auth).
revoke all on function public.job_hotspots() from public;
grant execute on function public.job_hotspots() to authenticated;

revoke all on function public.jobs_in_cell(bigint, bigint) from public;
grant execute on function public.jobs_in_cell(bigint, bigint) to authenticated;
