-- ============================================================================
-- BRAZOS V2 · Phase 8 · automated radius-correctness proof (A–C)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase8-proof.sql "$SUPABASE_DB_URL_STAGING"
--
-- Run AFTER scripts/seed-phase-8.sql. Read-only through RLS as a seeded
-- worker identity (radius search is a worker surface); nothing is written,
-- so there is no rollback/residue section — the one fixture surgery of the
-- other proofs isn't needed here.
--
-- Sections:
--   A jobs_within_radius correctness against the controlled fixtures
--   B distance honesty: values ordered, in-tolerance, and the RPC's declared
--     row type carries NO raw coordinates
--   C the grid mechanism (job_hotspots) still sees the same area
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

create temp table probe (k text primary key, v uuid);
insert into probe (k, v) values
  ('wa', 'b6c00000-0000-4000-8000-000000000002');

create function pg_temp.become(p_key text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', (select v from probe where k = p_key), 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end $$;

select pg_temp.become('wa');

-- ---------------------------------------------------------------------------
-- A. RADIUS CORRECTNESS. 5 miles from the reference point: exactly the 2mi
--    and 4mi fixtures, never the 20mi one. 25 miles: all three.
-- ---------------------------------------------------------------------------
do $$
declare
  v_five int;
  v_five_far int;
  v_twentyfive int;
begin
  select count(*) into v_five
  from public.jobs_within_radius(31.5493, -97.1467, 5) r
  where r.id::text like 'b8c00000%';
  if v_five <> 2 then
    raise exception 'A: 5-mile radius returned % seeded jobs, expected exactly 2', v_five;
  end if;

  select count(*) into v_five_far
  from public.jobs_within_radius(31.5493, -97.1467, 5) r
  where r.id = 'b8c00000-0000-4000-8000-000000000003';
  if v_five_far <> 0 then
    raise exception 'A: the 20-mile job leaked into a 5-mile search';
  end if;

  select count(*) into v_twentyfive
  from public.jobs_within_radius(31.5493, -97.1467, 25) r
  where r.id::text like 'b8c00000%';
  if v_twentyfive <> 3 then
    raise exception 'A: 25-mile radius returned % seeded jobs, expected 3', v_twentyfive;
  end if;
  raise notice 'PASS A: radius boundaries hold (5mi -> 2 jobs, 25mi -> 3 jobs, far job excluded)';
end $$;

-- ---------------------------------------------------------------------------
-- B. DISTANCE HONESTY.
-- ---------------------------------------------------------------------------
do $$
declare
  v_d2 double precision;
  v_d4 double precision;
  v_result text;
begin
  select r.distance_miles into v_d2
  from public.jobs_within_radius(31.5493, -97.1467, 25) r
  where r.id = 'b8c00000-0000-4000-8000-000000000001';
  select r.distance_miles into v_d4
  from public.jobs_within_radius(31.5493, -97.1467, 25) r
  where r.id = 'b8c00000-0000-4000-8000-000000000002';

  -- 0.029° and 0.058° of latitude ≈ 2.00 and 4.00 miles; a generous ±0.25mi
  -- tolerance still catches a broken Haversine or a degrees/radians slip.
  if v_d2 is null or abs(v_d2 - 2.0) > 0.25 then
    raise exception 'B: 2-mile fixture measured % miles', v_d2;
  end if;
  if v_d4 is null or abs(v_d4 - 4.0) > 0.25 then
    raise exception 'B: 4-mile fixture measured % miles', v_d4;
  end if;
  if v_d2 >= v_d4 then
    raise exception 'B: distances are not ordered (% >= %)', v_d2, v_d4;
  end if;

  -- The RPC's DECLARED row type must carry no raw coordinates — the privacy
  -- property the phase41 comment promises, checked against the catalog
  -- rather than trusted to a comment.
  select pg_get_function_result('public.jobs_within_radius(double precision, double precision, double precision)'::regprocedure)
    into v_result;
  if v_result ilike '%lat %' or v_result ilike '% lng%' or v_result ilike '%latitude%' then
    raise exception 'B: jobs_within_radius declares raw coordinates in its row type: %', v_result;
  end if;
  raise notice 'PASS B: distances measure true (% / % mi), ordered, and the row type has no raw coordinates',
    round(v_d2::numeric, 2), round(v_d4::numeric, 2);
end $$;

-- ---------------------------------------------------------------------------
-- C. THE GRID MECHANISM SEES THE SAME AREA. job_hotspots() must produce at
--    least one cell within ~5 miles of the reference point now that seeded
--    open jobs with exact locations exist there — list and map draw from the
--    same ground truth.
-- ---------------------------------------------------------------------------
do $$
declare v_cells int;
begin
  select count(*) into v_cells
  from public.job_hotspots() h
  where abs(h.cell_lat - 31.5493) < 0.12 and abs(h.cell_lng - (-97.1467)) < 0.12;
  if v_cells < 1 then
    raise exception 'C: no hotspot cell near the seeded area — map and list have diverged';
  end if;
  raise notice 'PASS C: % hotspot cell(s) cover the seeded area — grid and radius agree', v_cells;
end $$;

-- ---------------------------------------------------------------------------
-- D. JOBS ROW PRIVACY (phase58 regression). Before the hardening run, a
--    legacy permissive policy let ANY authenticated user read EVERY job row.
--    An outsider (worker B — no offer on the pair's completed job) must now
--    see nothing of it, while the counted trust signal still answers through
--    client_job_stats().
-- ---------------------------------------------------------------------------
create temp table probe2 (k text primary key, v uuid);
insert into probe2 (k, v) values
  ('wb', 'b6c00000-0000-4000-8000-000000000003'),
  ('job_b', 'b6c00000-0000-4000-8000-00000000000b'),
  ('casey', 'b6c00000-0000-4000-8000-000000000001');
grant select on probe2 to authenticated;

do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select v from probe2 where k='wb'), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  if exists (select 1 from public.jobs where id = (select v from probe2 where k='job_b')) then
    raise exception 'D: an outsider can read a job they have no part in (the legacy leak is back)';
  end if;
  if (select posted from public.client_job_stats((select v from probe2 where k='casey'))) < 1 then
    raise exception 'D: client_job_stats no longer answers the trust signal';
  end if;
  raise notice 'PASS D: outsiders read zero foreign job rows; the counted trust signal survives';
end $$;

rollback;
