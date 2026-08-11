-- ============================================================================
-- Brazos · Exact-radius job discovery for Worker Home's "within 5 miles"
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- THE PROBLEM
--   Worker Home's "X within 5 miles" pill and its results screen were built
--   on job_hotspots()/jobs_in_cell() (phase12) — a coarse ~0.27mi GRID CELL
--   system meant for map density visualization, not exact-radius claims. A
--   cell "within 5 miles" only means its CENTER is within 5 miles; the real
--   jobs inside it can be anywhere in that 0.27mi square. That's fine for a
--   map glow, not for a number the UI states as fact.
--
-- THE FIX
--   One new security-definer RPC, jobs_within_radius(), doing real Haversine
--   great-circle distance from job_locations (exact coordinates, already
--   RLS-locked to each job's client/assigned worker — see phase12) against a
--   caller-supplied point. It returns ordinary public job fields plus a
--   computed distance_miles — never the raw lat/lng of any job it isn't the
--   caller's own. This is the same privacy shape phase12 already uses for
--   job_hotspots()/jobs_in_cell(): aggregate/derived output only, never a
--   SELECT a browsing worker could run against job_locations directly (RLS
--   still blocks that entirely).
--
--   job_hotspots()/jobs_in_cell() are UNTOUCHED — still there for the map's
--   density view. This migration doesn't remove or alter them.
--
--   FIX (first run rejected by Postgres): jobs.photos/jobs.videos are jsonb
--   (phase13/phase34 — arrays of storage URLs stored as a JSON array, not a
--   Postgres text[]), but this function's RETURNS TABLE originally declared
--   them as text[]. `j.photos`/`j.videos` in the SELECT were always the
--   right jsonb values; only the declared return type was wrong, hence
--   "42P13: return type mismatch ... Final statement returns jsonb instead
--   of text[] at column 10". No client change needed: PostgREST serializes
--   both shapes as a plain JSON array over the wire, and lib/jobs.ts's
--   toPhotoArray() already just checks Array.isArray() on whatever arrives.
-- ============================================================================

create or replace function public.jobs_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision
)
returns table (
  id uuid,
  client_id uuid,
  title text,
  description text,
  category text,
  location text,
  budget_cents integer,
  status text,
  created_at timestamptz,
  photos jsonb,
  videos jsonb,
  distance_miles double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at,
    j.photos, j.videos,
    d.distance_miles
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join lateral (
    -- Haversine great-circle distance, in miles (Earth radius 3958.8mi) —
    -- same radius constant lib/hotspots.ts uses client-side, so a
    -- pre-resolved center point behaves identically wherever it's measured.
    select 2 * 3958.8 * asin(sqrt(
      sin(radians((loc.lat - p_lat) / 2)) ^ 2
      + cos(radians(p_lat)) * cos(radians(loc.lat))
        * sin(radians((loc.lng - p_lng) / 2)) ^ 2
    )) as distance_miles
  ) d
  where j.status = 'open'
    and d.distance_miles <= p_radius_miles
  order by d.distance_miles asc;
$$;

comment on function public.jobs_within_radius(double precision, double precision, double precision) is
  'Open jobs within p_radius_miles of (p_lat, p_lng), nearest first, with a computed distance_miles. Never returns any job''s raw stored coordinates.';

revoke all on function public.jobs_within_radius(double precision, double precision, double precision) from public;
grant execute on function public.jobs_within_radius(double precision, double precision, double precision) to authenticated;
