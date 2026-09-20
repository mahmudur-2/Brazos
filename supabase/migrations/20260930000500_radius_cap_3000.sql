-- 2026-09-19 — the job-radius ceiling rises from 50 to 3,000 miles.
--
-- The worker filter's Custom distance list runs to 3,000 (lib/discoveryFilter.ts
-- DISTANCE_CUSTOM_VALUES, operator ruling of 2026-09-19). jobs_within_radius()
-- clamped every request to 50, so a radius past 50 was silently answered as
-- 50 — a control that lies. The clamp moves to 3,000; the floor (0.5) and the
-- default (25 when the caller passes 0/NULL) are unchanged, and so is every
-- other line of the body: the same half-mile-snapped distance, the same
-- open-market-only predicate, the same column list, no raw coordinates.
--
-- Additive: CREATE OR REPLACE on an existing function, no DROP, no RENAME.
-- The ACL is the function's own and is preserved by CREATE OR REPLACE
-- (revoked from PUBLIC, granted to authenticated — baseline lines 8081-8082);
-- restated below anyway, per CLAUDE.md §Supabase, so this file stands alone.

CREATE OR REPLACE FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) RETURNS TABLE("id" "uuid", "client_id" "uuid", "title" "text", "description" "text", "category" "text", "location" "text", "budget_cents" integer, "status" "text", "created_at" timestamp with time zone, "photos" "jsonb", "videos" "jsonb", "distance_miles" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with bounded as (
    select least(greatest(coalesce(nullif(p_radius_miles, 0), 25), 0.5), 3000)::double precision as radius_miles
  )
  select
    j.id, j.client_id, j.title, j.description,
    j.category::text, j.location, j.budget_cents, j.status, j.created_at,
    j.photos, j.videos,
    d.snapped_miles as distance_miles
  from public.jobs j
  join public.job_locations loc on loc.job_id = j.id
  cross join bounded b
  cross join lateral (
    select greatest(
             0.5,
             round((2 * 3958.8 * asin(least(1, sqrt(
               sin(radians((loc.lat - p_lat) / 2)) ^ 2
               + cos(radians(p_lat)) * cos(radians(loc.lat))
                 * sin(radians((loc.lng - p_lng) / 2)) ^ 2
             ))) * 2)::numeric, 0) / 2.0
           )::double precision as snapped_miles
  ) d
  where j.status = 'open'
    and j.visibility = 'open_market'
    and d.snapped_miles <= b.radius_miles
  order by d.snapped_miles asc, j.created_at desc, j.id asc;
$$;

COMMENT ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) IS 'Open-market jobs within p_radius_miles of (p_lat, p_lng), nearest first; the radius is clamped to 0.5..3000 miles (25 when absent). Never returns raw stored coordinates, and never covers direct/draft jobs.';

REVOKE ALL ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) TO authenticated;
