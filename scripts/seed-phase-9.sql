-- ============================================================================
-- BRAZOS V2 · Phase 9 · staging seed (AUTONOMOUS_RUN §11)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/seed-phase-9.sql "$SUPABASE_DB_URL_STAGING"
--
-- STAGING ONLY. Run AFTER scripts/seed-phase-6.sql. Safe to re-run: resets
-- only its own rows (matched by the PHASE9-SEED marker / seeded ids).
--
-- Gives Wren (phase6.worker) a self-service presence to tap through:
-- two published services, one draft, an availability note — and saves Wren
-- to Casey's list so Saved & past workers opens populated.
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

do $$
declare
  v_customer uuid := 'b6c00000-0000-4000-8000-000000000001';
  v_worker uuid := 'b6c00000-0000-4000-8000-000000000002';
begin
  if not exists (select 1 from public.profiles where id = v_worker) then
    raise exception 'Run scripts/seed-phase-6.sql first';
  end if;

  delete from public.worker_services
  where worker_id = v_worker and description like 'PHASE9-SEED%';

  insert into public.worker_services
    (worker_id, title, description, category, price_cents, price_unit, published, position)
  values
    (v_worker, 'Standard lawn mow & edge',
     'PHASE9-SEED Front and back, edges and blow-off included.',
     'yard_work', 4500, 'flat', true, 0),
    (v_worker, 'Furniture assembly',
     'PHASE9-SEED Flat-pack anything — bring the box, I bring the tools.',
     'furniture_assembly', 3500, 'hourly', true, 1),
    (v_worker, 'Gutter clean (draft)',
     'PHASE9-SEED Not ready to advertise yet.',
     'handyman', null, 'flat', false, 2);

  update public.profiles
     set accepting_work = true,
         availability_note = 'Weekday evenings and weekends'
   where id = v_worker;

  insert into public.saved_workers (user_id, worker_id)
  values (v_customer, v_worker)
  on conflict (user_id, worker_id) do nothing;

  raise notice 'SEED phase-9: 3 services (1 draft), availability set, Wren saved by Casey';
end $$;

commit;
