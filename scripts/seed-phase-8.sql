-- ============================================================================
-- BRAZOS V2 · Phase 8 · staging seed (AUTONOMOUS_RUN §11)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/seed-phase-8.sql "$SUPABASE_DB_URL_STAGING"
--
-- STAGING ONLY. Run AFTER scripts/seed-phase-6.sql (identities). Safe to
-- re-run: resets only its own fixed-UUID rows.
--
-- Discovery fixtures at CONTROLLED distances from the Waco reference point
-- (31.5493, -97.1467) — the coordinates phase8-proof.sql and the device pass
-- both measure against. 1° latitude ≈ 69.05 miles, so:
--   near-2mi   Δlat +0.029  ≈  2.0 miles   (cleaning,   $40 budget)
--   near-4mi   Δlat -0.058  ≈  4.0 miles   (yard_work,  $90 budget)
--   far-20mi   Δlat +0.290  ≈ 20.0 miles   (handyman,   no budget)
-- A 5-mile radius must return exactly the first two; 25 miles all three.
-- Categories and budgets exercise every JobFilterSheet control.
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

create temp table seed8 (k text primary key, v uuid) on commit drop;
insert into seed8 (k, v) values
  ('customer',  'b6c00000-0000-4000-8000-000000000001'),
  ('job_near2', 'b8c00000-0000-4000-8000-000000000001'),
  ('job_near4', 'b8c00000-0000-4000-8000-000000000002'),
  ('job_far20', 'b8c00000-0000-4000-8000-000000000003');

do $$
begin
  if not exists (select 1 from public.profiles
                 where id = (select v from seed8 where k='customer')) then
    raise exception 'Run scripts/seed-phase-6.sql first';
  end if;
end $$;

-- Reset previous run.
delete from public.job_offers   where job_id in (select v from seed8 where k like 'job%');
delete from public.bids         where job_id in (select v from seed8 where k like 'job%');
delete from public.job_locations where job_id in (select v from seed8 where k like 'job%');
delete from public.jobs         where id in (select v from seed8 where k like 'job%');

insert into public.jobs (id, client_id, title, description, category, location,
                         budget_cents, budget_min_cents, budget_max_cents, status, created_at)
values
  ((select v from seed8 where k='job_near2'),
   (select v from seed8 where k='customer'),
   'Deep-clean a two-bed apartment',
   'Kitchen, two baths, floors throughout. Supplies provided.',
   'cleaning', 'Waco, TX', 4000, 3000, 4000, 'open', now() - interval '3 hours'),
  ((select v from seed8 where k='job_near4'),
   (select v from seed8 where k='customer'),
   'Clear the back fence line',
   'Brush and small limbs along ~80 feet of fence. Haul-away included.',
   'yard_work', 'Waco, TX', 9000, 9000, 9000, 'open', now() - interval '2 hours'),
  ((select v from seed8 where k='job_far20'),
   (select v from seed8 where k='customer'),
   'Rehang a sagging gate',
   'Wooden side gate dropped on its hinges; needs re-setting.',
   'handyman', 'West, TX', null, null, null, 'open', now() - interval '1 hour');

insert into public.job_locations (job_id, lat, lng, address_line)
values
  ((select v from seed8 where k='job_near2'), 31.5493 + 0.029, -97.1467, '1201 Probe Ln, Waco, TX'),
  ((select v from seed8 where k='job_near4'), 31.5493 - 0.058, -97.1467, '4400 Probe Dr, Waco, TX'),
  ((select v from seed8 where k='job_far20'), 31.5493 + 0.290, -97.1467, '100 Probe Rd, West, TX');

do $$
declare v_jobs int; v_locs int;
begin
  select count(*) into v_jobs from public.jobs
    where id in (select v from seed8 where k like 'job%') and status = 'open';
  select count(*) into v_locs from public.job_locations
    where job_id in (select v from seed8 where k like 'job%');
  raise notice 'SEED phase-8: % open jobs, % located', v_jobs, v_locs;
  if v_jobs <> 3 or v_locs <> 3 then
    raise exception 'SEED phase-8 incomplete — expected 3/3';
  end if;
end $$;

commit;
