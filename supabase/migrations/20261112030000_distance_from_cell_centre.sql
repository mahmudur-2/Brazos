-- B2 (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): a job's distance is
-- measured from its market cell, never from its exact point.
--
-- jobs_within_radius() ranked and filtered open jobs by the haversine distance to each job's exact
-- coordinates (20260930000500_radius_cap_3000.sql:32-43), and notify_nearby_for_job() matched a
-- worker's home against them (20260930000600_needed_today.sql:237-243). Half-mile snapping or not,
-- a stranger who moves the query point (or the home) walks the answer back to the door. Both now
-- measure from the centre of the job's 0.27-mile market cell: the grid job_hotspots() already shows
-- on the map (20260901000000_baseline.sql:2413-2416, 2434-2435), so neither says more than the map.
--
-- market_cell_centre(lat, lng): that grid's centre, one definition for both. Not security definer;
-- only the two definer functions below call it, so no role the app signs in as may.
--
-- Additive: CREATE OR REPLACE on the same signatures and columns; every ACL restated.

begin;

create or replace function public.market_cell_centre(
  p_lat double precision,
  p_lng double precision,
  out lat double precision,
  out lng double precision
)
language sql immutable
set search_path = public, pg_temp
as $$
  select (floor(p_lat / (0.27 / 69.0)) + 0.5) * (0.27 / 69.0),
         (floor(p_lng / (0.27 / (69.0 * cos(radians(40.7128))))) + 0.5)
           * (0.27 / (69.0 * cos(radians(40.7128))));
$$;

revoke all on function public.market_cell_centre(double precision, double precision) from public, anon, authenticated, service_role;

comment on function public.market_cell_centre(double precision, double precision) is
  'B2: the centre of the 0.27-mile market cell a point falls in (the job_hotspots grid). The only point jobs_within_radius and notify_nearby_for_job measure a job from.';

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
  cross join lateral public.market_cell_centre(loc.lat, loc.lng) c
  cross join lateral (
    select greatest(
             0.5,
             round((2 * 3958.8 * asin(least(1, sqrt(
               sin(radians((c.lat - p_lat) / 2)) ^ 2
               + cos(radians(p_lat)) * cos(radians(c.lat))
                 * sin(radians((c.lng - p_lng) / 2)) ^ 2
             ))) * 2)::numeric, 0) / 2.0
           )::double precision as snapped_miles
  ) d
  where j.status = 'open'
    and j.visibility = 'open_market'
    and d.snapped_miles <= b.radius_miles
  order by d.snapped_miles asc, j.created_at desc, j.id asc;
$$;

COMMENT ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) IS 'Open-market jobs within p_radius_miles of (p_lat, p_lng), nearest first, each measured to the centre of its 0.27-mile market cell (market_cell_centre, B2); the radius is clamped to 0.5..3000 miles (25 when absent). Never returns or measures raw stored coordinates, and never covers direct/draft jobs.';

REVOKE ALL ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."jobs_within_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_miles" double precision) TO authenticated;

-- The nearby alert: the same selection, gate and dedupe as 20260930000600_needed_today.sql:204-258,
-- with the job's cell centre in place of its exact point.
create or replace function public.notify_nearby_for_job(p_job_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_loc public.job_locations;
  v_cell record;
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

  -- B2: the cell, not the door.
  select * into v_cell from public.market_cell_centre(v_loc.lat, v_loc.lng);

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
      and v_cell.lat between np.home_lat - (np.nearby_radius_miles / 69.0)
                         and np.home_lat + (np.nearby_radius_miles / 69.0)
      and 3958.8 * 2 * asin(sqrt(
            power(sin(radians(v_cell.lat - np.home_lat) / 2), 2)
            + cos(radians(np.home_lat)) * cos(radians(v_cell.lat))
              * power(sin(radians(v_cell.lng - np.home_lng) / 2), 2)
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

revoke all on function public.notify_nearby_for_job(uuid) from public, anon, authenticated, service_role;

commit;
