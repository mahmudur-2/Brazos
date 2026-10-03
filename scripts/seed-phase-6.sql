-- ============================================================================
-- BRAZOS V2 · Phase 6 · staging seed (AUTONOMOUS_RUN §11)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/seed-phase-6.sql "$SUPABASE_DB_URL_STAGING"
--
-- STAGING ONLY — creates its own test identities (staging has no auth.users)
-- and puts two accounts into the exact state needed to tap through the Phase 6
-- screens on a physical device with zero manual setup taps.
--
-- Safe to re-run: each run RESETS the seeded fixtures to their starting state
-- (it deletes only rows keyed to the fixed b6c00000-… UUIDs below, then
-- recreates them). Nothing outside those ids is touched.
--
-- Identities (password for both: brazos-test-1234):
--   phase6.customer@brazos.test  — posts the jobs, approves, tips
--   phase6.worker@brazos.test    — arrival taps, checklist, completes
--
-- Fixtures:
--   Job A "Assemble a bookshelf"   assigned + accepted offer + payment HELD.
--     The full walk: WorkerJob stage taps → start → checklist → complete with
--     evidence → customer approves (release) → review & tip.
--   Job B "Mount a closet shelf"   already completed + payment HELD.
--     The shortcut straight to ApproveOrDispute / dispute / auto-release QA.
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

-- ---------------------------------------------------------------------------
-- 0. Fixed ids. b6c0 = "brazos 6 checkpoint" — collision-proof against real
--    data, greppable in any table.
-- ---------------------------------------------------------------------------
create temp table seed_ids (k text primary key, v uuid) on commit drop;
insert into seed_ids (k, v) values
  ('customer', 'b6c00000-0000-4000-8000-000000000001'),
  ('worker',   'b6c00000-0000-4000-8000-000000000002'),
  -- No fixtures of its own: exists so scripts/rls-probe-offers.mjs has the
  -- second worker its cross-user cases need.
  ('worker_b', 'b6c00000-0000-4000-8000-000000000003'),
  ('job_a',    'b6c00000-0000-4000-8000-00000000000a'),
  ('job_b',    'b6c00000-0000-4000-8000-00000000000b'),
  ('offer_a',  'b6c00000-0000-4000-8000-0000000000a1'),
  ('offer_b',  'b6c00000-0000-4000-8000-0000000000b1'),
  ('pay_a',    'b6c00000-0000-4000-8000-0000000000a2'),
  ('pay_b',    'b6c00000-0000-4000-8000-0000000000b2'),
  -- Job C: open with a live bid from EACH worker — the read-only RLS probe's
  -- cross-user cases need exactly this shape to run.
  ('job_c',    'b6c00000-0000-4000-8000-00000000000c'),
  ('offer_c1', 'b6c00000-0000-4000-8000-0000000000c1'),
  ('offer_c2', 'b6c00000-0000-4000-8000-0000000000c2');

-- ---------------------------------------------------------------------------
-- 1. Reset: remove every row from a previous run, children first. Deletes are
--    keyed to the seeded job/user ids only.
-- ---------------------------------------------------------------------------
delete from public.payments      where job_id in (select v from seed_ids where k like 'job%');
delete from public.job_disputes  where job_id in (select v from seed_ids where k like 'job%');
delete from public.job_checklist_items
                                 where job_id in (select v from seed_ids where k like 'job%');
delete from public.reviews       where job_id in (select v from seed_ids where k like 'job%');
delete from public.message_reads where job_id in (select v from seed_ids where k like 'job%');
delete from public.messages      where job_id in (select v from seed_ids where k like 'job%');
update public.jobs set accepted_offer_id = null
                                 where id in (select v from seed_ids where k like 'job%');
delete from public.job_offers    where job_id in (select v from seed_ids where k like 'job%');
delete from public.bids          where job_id in (select v from seed_ids where k like 'job%');
delete from public.job_locations where job_id in (select v from seed_ids where k like 'job%');
delete from public.jobs          where id in (select v from seed_ids where k like 'job%');

-- ---------------------------------------------------------------------------
-- 2. Identities. Inserting auth.users fires public.handle_new_user (verified
--    present on staging), which creates the profiles rows. The identities row
--    is what lets GoTrue's email/password login find the account.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  s.v,
  'authenticated',
  'authenticated',
  case s.k when 'customer' then 'phase6.customer@brazos.test'
           when 'worker' then 'phase6.worker@brazos.test'
           else 'phase6.workerb@brazos.test' end,
  extensions.crypt('brazos-test-1234', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  case s.k when 'customer' then '{"full_name":"Casey Customer"}'::jsonb
           when 'worker' then '{"full_name":"Wren Worker"}'::jsonb
           else '{"full_name":"Blake Backup"}'::jsonb end,
  now(), now(), '', '', '', ''
from seed_ids s
where s.k in ('customer', 'worker', 'worker_b')
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  s.v,
  jsonb_build_object(
    'sub', s.v::text,
    'email', case s.k when 'customer' then 'phase6.customer@brazos.test'
                      when 'worker' then 'phase6.worker@brazos.test'
                      else 'phase6.workerb@brazos.test' end,
    'email_verified', true
  ),
  'email',
  s.v::text,
  now(), now(), now()
from seed_ids s
where s.k in ('customer', 'worker', 'worker_b')
  and not exists (
    select 1 from auth.identities i
    where i.user_id = s.v and i.provider = 'email'
  );

-- The trigger created the profiles; make sure both read as active, named
-- accounts whatever an earlier run left behind.
update public.profiles p
set full_name = case p.id
                  when (select v from seed_ids where k = 'customer') then 'Casey Customer'
                  when (select v from seed_ids where k = 'worker') then 'Wren Worker'
                  else 'Blake Backup'
                end,
    banned = false
where p.id in (select v from seed_ids where k in ('customer', 'worker', 'worker_b'));

-- ---------------------------------------------------------------------------
-- 3. Job A — assigned, offer accepted, payment HELD: the full-walk fixture.
--    State matches what accept_offer + the sandbox checkout would have left.
-- ---------------------------------------------------------------------------
insert into public.jobs (
  id, client_id, title, description, category, location,
  budget_cents, final_amount_cents, status, assigned_worker_id,
  scheduled_date, arrival_start_hour, arrival_end_hour, created_at
)
select
  (select v from seed_ids where k = 'job_a'),
  (select v from seed_ids where k = 'customer'),
  'Assemble a bookshelf',
  'Five-shelf bookcase, flat-packed in the living room. All hardware in the box.',
  'furniture_assembly',
  'Waco, TX',
  6000, 6000, 'assigned',
  (select v from seed_ids where k = 'worker'),
  (now() + interval '1 day')::date, 9, 12, now() - interval '2 hours';

insert into public.job_locations (job_id, lat, lng, address_line)
select (select v from seed_ids where k = 'job_a'), 31.5493, -97.1467,
       '1400 S 5th St, Waco, TX 76706';

insert into public.job_offers (
  id, job_id, offer_type, root_offer_id, customer_id, worker_id, author_id,
  awaiting_id, amount_cents, message, status, created_at, updated_at
)
select
  (select v from seed_ids where k = 'offer_a'),
  (select v from seed_ids where k = 'job_a'),
  'marketplace_bid',
  (select v from seed_ids where k = 'offer_a'),
  (select v from seed_ids where k = 'customer'),
  (select v from seed_ids where k = 'worker'),
  (select v from seed_ids where k = 'worker'),
  null,
  6000,
  'I can be there in the morning window — assembled plenty of these.',
  'accepted',
  now() - interval '90 minutes', now() - interval '80 minutes';

update public.jobs
set accepted_offer_id = (select v from seed_ids where k = 'offer_a')
where id = (select v from seed_ids where k = 'job_a');

insert into public.payments (
  id, job_id, offer_id, payer_id, payee_id, kind, amount_cents,
  platform_fee_cents, provider, provider_ref, status, authorized_at, held_at,
  created_at, updated_at
)
select
  (select v from seed_ids where k = 'pay_a'),
  (select v from seed_ids where k = 'job_a'),
  (select v from seed_ids where k = 'offer_a'),
  (select v from seed_ids where k = 'customer'),
  (select v from seed_ids where k = 'worker'),
  'job_payment', 6000, 0, 'sandbox',
  'sandbox_' || gen_random_uuid(),
  'held', now() - interval '75 minutes', now() - interval '74 minutes',
  now() - interval '75 minutes', now() - interval '74 minutes';

-- ---------------------------------------------------------------------------
-- 4. Job B — already completed with evidence, payment HELD: lands the
--    customer directly on the approve/dispute decision.
-- ---------------------------------------------------------------------------
insert into public.jobs (
  id, client_id, title, description, category, location,
  budget_cents, final_amount_cents, status, assigned_worker_id,
  completion_photos, completion_photo_url, completed_at, created_at
)
select
  (select v from seed_ids where k = 'job_b'),
  (select v from seed_ids where k = 'customer'),
  'Mount a closet shelf',
  'One 36-inch shelf on existing brackets; anchors already in the wall.',
  'tv_mounting',
  'Waco, TX',
  4500, 4500, 'completed',
  (select v from seed_ids where k = 'worker'),
  '[]'::jsonb, null,
  now() - interval '3 hours', now() - interval '2 days';

insert into public.job_locations (job_id, lat, lng, address_line)
select (select v from seed_ids where k = 'job_b'), 31.5461, -97.1139,
       '2201 Austin Ave, Waco, TX 76701';

insert into public.job_offers (
  id, job_id, offer_type, root_offer_id, customer_id, worker_id, author_id,
  awaiting_id, amount_cents, message, status, created_at, updated_at
)
select
  (select v from seed_ids where k = 'offer_b'),
  (select v from seed_ids where k = 'job_b'),
  'marketplace_bid',
  (select v from seed_ids where k = 'offer_b'),
  (select v from seed_ids where k = 'customer'),
  (select v from seed_ids where k = 'worker'),
  (select v from seed_ids where k = 'worker'),
  null,
  4500,
  'Quick one — I have the drill and level with me.',
  'accepted',
  now() - interval '2 days', now() - interval '2 days';

update public.jobs
set accepted_offer_id = (select v from seed_ids where k = 'offer_b')
where id = (select v from seed_ids where k = 'job_b');

insert into public.payments (
  id, job_id, offer_id, payer_id, payee_id, kind, amount_cents,
  platform_fee_cents, provider, provider_ref, status, authorized_at, held_at,
  created_at, updated_at
)
select
  (select v from seed_ids where k = 'pay_b'),
  (select v from seed_ids where k = 'job_b'),
  (select v from seed_ids where k = 'offer_b'),
  (select v from seed_ids where k = 'customer'),
  (select v from seed_ids where k = 'worker'),
  'job_payment', 4500, 0, 'sandbox',
  'sandbox_' || gen_random_uuid(),
  'held', now() - interval '2 days', now() - interval '2 days',
  now() - interval '2 days', now() - interval '2 days';

-- ---------------------------------------------------------------------------
-- 5. Job C — open, one pending bid from each worker. Exists for the RLS
--    probe's cross-user visibility cases (and doubles as a compare-bids
--    fixture on the customer device).
-- ---------------------------------------------------------------------------
insert into public.jobs (
  id, client_id, title, description, category, location,
  budget_cents, status, created_at
)
select
  (select v from seed_ids where k = 'job_c'),
  (select v from seed_ids where k = 'customer'),
  'Rake and bag the front yard',
  'Corner lot, two live oaks. Bags provided on the porch.',
  'yard_work',
  'Waco, TX',
  3500, 'open', now() - interval '1 hour';

insert into public.job_offers (
  id, job_id, offer_type, root_offer_id, customer_id, worker_id, author_id,
  awaiting_id, amount_cents, message, status, expires_at, created_at, updated_at
)
select
  s.v,
  (select v from seed_ids where k = 'job_c'),
  'marketplace_bid',
  s.v,
  (select v from seed_ids where k = 'customer'),
  w.v,
  w.v,
  (select v from seed_ids where k = 'customer'),
  case s.k when 'offer_c1' then 3200 else 3600 end,
  case s.k when 'offer_c1' then 'Can start this afternoon.' else 'Tomorrow morning works best for me.' end,
  'pending',
  now() + interval '7 days',
  now() - interval '30 minutes', now() - interval '30 minutes'
from seed_ids s
join seed_ids w on w.k = case s.k when 'offer_c1' then 'worker' else 'worker_b' end
where s.k in ('offer_c1', 'offer_c2');

-- ---------------------------------------------------------------------------
-- 6. Report what exists now.
-- ---------------------------------------------------------------------------
do $$
declare
  v_users int;
  v_jobs int;
  v_payments int;
begin
  select count(*) into v_users from auth.users
    where id in (select v from seed_ids where k in ('customer','worker','worker_b'));
  select count(*) into v_jobs from public.jobs
    where id in (select v from seed_ids where k like 'job%')
      and (select count(*) from public.job_offers o
           where o.job_id = (select v from seed_ids where k = 'job_c')
             and o.status = 'pending') = 2;
  select count(*) into v_payments from public.payments
    where id in (select v from seed_ids where k like 'pay%')
      and status = 'held';
  raise notice 'SEED phase-6: % users, % jobs, % held payments', v_users, v_jobs, v_payments;
  if v_users <> 3 or v_jobs <> 3 or v_payments <> 2 then
    raise exception 'SEED phase-6 incomplete — expected 3 users / 3 jobs / 2 held payments';
  end if;
end $$;

commit;
