#!/usr/bin/env node
/**
 * BRAZOS V2 · D1 REVIEW SEED (hardening run)
 *
 *   node scripts/seed-review.mjs
 *
 * STAGING ONLY (refuses the production ref). Seeds one DISTINCT job for
 * every reviewable phase 6-12 lifecycle state, ALL PRESENT SIMULTANEOUSLY,
 * against the two established review accounts — open the app as either and
 * every screen is populated without driving a single flow by hand.
 * Re-runnable: resets exactly its own rows (d1c0… UUIDs) first.
 *
 * Rows are inserted in their FINAL states (fixture surgery, the seed-phase-6
 * precedent) — this is a display fixture, not a flow proof; the flows are
 * proven by scripts/lifecycle-proof.mjs and the per-phase proofs.
 */
import { execFileSync } from 'node:child_process';
import { PRODUCTION_REF } from './supabase-ref.mjs';

const DB = process.env.SUPABASE_DB_URL_STAGING;
if (!DB) { console.error('SUPABASE_DB_URL_STAGING is not set'); process.exit(2); }
if (DB.includes(PRODUCTION_REF)) { console.error('REFUSING: production ref'); process.exit(2); }

const C = 'b6c00000-0000-4000-8000-000000000001'; // Casey (customer view)
const W = 'b6c00000-0000-4000-8000-000000000002'; // Wren  (worker view)
const B = 'b6c00000-0000-4000-8000-000000000003'; // Blake (second bidder)
const J = (n) => `d1c00000-0000-4000-8000-00000000000${n}`;

const SQL = `
begin;

-- ---- reset this seed's rows (children first) --------------------------------
do $$
declare v_jobs uuid[] := (select coalesce(array_agg(id), '{}') from public.jobs where id::text like 'd1c00000%');
begin
  delete from public.notification_outbox where dedupe_key like 'd1seed:%';
  delete from public.reviews where job_id = any(v_jobs);
  -- Disputes reference payments — children strictly first.
  delete from public.job_disputes where job_id = any(v_jobs);
  delete from public.payments where job_id = any(v_jobs) or id::text like 'd1c00000%';
  delete from public.job_checklist_items where job_id = any(v_jobs);
  delete from public.message_reads where job_id = any(v_jobs);
  delete from public.messages where job_id = any(v_jobs);
  update public.jobs set accepted_offer_id = null where id = any(v_jobs);
  delete from public.job_offers where job_id = any(v_jobs);
  delete from public.bids where job_id = any(v_jobs);
  delete from public.job_locations where job_id = any(v_jobs);
  delete from public.jobs where id = any(v_jobs);
end $$;

do $$
begin
  if not exists (select 1 from public.profiles where id = '${C}') then
    raise exception 'Run scripts/seed-phase-6.sql first (accounts)';
  end if;
end $$;

-- One row per lifecycle state. extra drives timestamps/payments below.
create temp table d1 (n int, title text, status public.job_status,
  worker uuid, amount int, extra text) on commit drop;
insert into d1 values
  (1, 'REVIEW · Open with two bids to compare', 'open', null, 4000, 'bids'),
  (2, 'REVIEW · Confirmed — funds held, before arrival', 'assigned', '${W}', 5000, 'held'),
  (3, 'REVIEW · Worker en route', 'assigned', '${W}', 5500, 'held+enroute'),
  (4, 'REVIEW · Worker arrived', 'assigned', '${W}', 6000, 'held+arrived'),
  (5, 'REVIEW · In progress with checklist', 'in_progress', '${W}', 6500, 'held+checklist'),
  (6, 'REVIEW · Done — awaiting your approval', 'completed', '${W}', 7000, 'held+evidence'),
  (7, 'REVIEW · Done — issue reported (frozen)', 'completed', '${W}', 7500, 'held+dispute'),
  (8, 'REVIEW · Approved — review & tip open', 'completed', '${W}', 8000, 'released'),
  (9, 'REVIEW · Fully settled — tipped, reviewed, cashed out', 'completed', '${W}', 8500, 'paidout');

insert into public.jobs (id, client_id, title, description, category, location,
  budget_cents, final_amount_cents, status, assigned_worker_id,
  en_route_at, arrived_at, completed_at, completion_photos, created_at)
select
  ('d1c00000-0000-4000-8000-00000000000' || n)::uuid, '${C}', title,
  'Seeded review fixture — every lifecycle state at once.', 'handyman', 'Waco, TX',
  amount, case when status <> 'open' then amount end, status, worker,
  case when extra like '%enroute%' or extra like '%arrived%' or extra like '%checklist%'
         or extra like '%evidence%' or extra like '%dispute%' or extra in ('released','paidout')
       then now() - interval '3 hours' end,
  case when extra like '%arrived%' or extra like '%checklist%' or extra like '%evidence%'
         or extra like '%dispute%' or extra in ('released','paidout')
       then now() - interval '2 hours' end,
  case when status = 'completed' then now() - interval '90 minutes' end,
  case when extra like '%evidence%' or extra like '%dispute%' or extra in ('released','paidout')
       then '["https://placehold.co/640x480/jpg?text=After"]'::jsonb else '[]'::jsonb end,
  now() - (interval '1 hour' * n)
from d1;

insert into public.job_locations (job_id, lat, lng, address_line)
select ('d1c00000-0000-4000-8000-00000000000' || n)::uuid,
  31.5493 + n * 0.002, -97.1467, n || '00 Review Row, Waco, TX'
from d1;

-- Accepted offer for every worked job; two competing pending bids on job 1.
insert into public.job_offers (id, job_id, offer_type, root_offer_id, customer_id,
  worker_id, author_id, awaiting_id, amount_cents, message, status, expires_at, created_at, updated_at)
select ('d1c00000-0000-4000-8000-0000000000a' || n)::uuid,
  ('d1c00000-0000-4000-8000-00000000000' || n)::uuid,
  'marketplace_bid', ('d1c00000-0000-4000-8000-0000000000a' || n)::uuid,
  '${C}', worker, worker, null, amount, 'Seeded accepted offer', 'accepted',
  null, now() - (interval '1 hour' * n), now()
from d1 where worker is not null;

update public.jobs j set accepted_offer_id = ('d1c00000-0000-4000-8000-0000000000a' || d1.n)::uuid
from d1 where j.id = ('d1c00000-0000-4000-8000-00000000000' || d1.n)::uuid and d1.worker is not null;

insert into public.job_offers (id, job_id, offer_type, root_offer_id, customer_id,
  worker_id, author_id, awaiting_id, amount_cents, message, status, expires_at, created_at, updated_at)
values
  ('d1c00000-0000-4000-8000-0000000000c1', '${J(1)}', 'marketplace_bid',
   'd1c00000-0000-4000-8000-0000000000c1', '${C}', '${W}', '${W}', '${C}',
   3800, 'Can start tomorrow morning.', 'pending', now() + interval '7 days', now(), now()),
  ('d1c00000-0000-4000-8000-0000000000c2', '${J(1)}', 'marketplace_bid',
   'd1c00000-0000-4000-8000-0000000000c2', '${C}', '${B}', '${B}', '${C}',
   4200, 'Available this weekend.', 'pending', now() + interval '7 days', now(), now());

-- Payments: held for 2-7, released for 8, paid_out (+ a paid-out tip) for 9.
insert into public.payments (id, job_id, offer_id, payer_id, payee_id, kind,
  amount_cents, platform_fee_cents, provider, provider_ref, status,
  authorized_at, held_at, released_at, release_reason, paid_out_at, created_at, updated_at)
select ('d1c00000-0000-4000-8000-0000000000b' || n)::uuid,
  ('d1c00000-0000-4000-8000-00000000000' || n)::uuid,
  ('d1c00000-0000-4000-8000-0000000000a' || n)::uuid,
  '${C}', worker, 'job_payment', amount, 0, 'sandbox', 'sandbox_' || gen_random_uuid(),
  case when extra = 'released' then 'released'::public.payment_status
       when extra = 'paidout' then 'paid_out'::public.payment_status
       else 'held'::public.payment_status end,
  now() - interval '3 hours', now() - interval '3 hours',
  case when extra in ('released','paidout') then now() - interval '1 hour' end,
  case when extra in ('released','paidout') then 'approved' end,
  case when extra = 'paidout' then now() - interval '30 minutes' end,
  now() - interval '3 hours', now()
from d1 where worker is not null;

insert into public.payments (id, job_id, offer_id, payer_id, payee_id, kind,
  amount_cents, platform_fee_cents, provider, provider_ref, status,
  released_at, paid_out_at, created_at, updated_at)
values ('d1c00000-0000-4000-8000-0000000000d9', '${J(9)}',
  'd1c00000-0000-4000-8000-0000000000a9', '${C}', '${W}', 'tip', 1000, 0,
  'sandbox', 'sandbox_' || gen_random_uuid(), 'paid_out',
  now() - interval '1 hour', now() - interval '30 minutes', now() - interval '1 hour', now());

-- Checklist on job 5; open dispute on job 7; mutual reviews on job 9.
insert into public.job_checklist_items (job_id, position, label, done, done_at) values
  ('${J(5)}', 0, 'Prep and mask the area', true, now() - interval '1 hour'),
  ('${J(5)}', 1, 'Second coat and cleanup', false, null);

insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
values ('${J(7)}', 'd1c00000-0000-4000-8000-0000000000b7', '${C}', 'incomplete',
  'Seeded open issue — the freeze/withdraw surface.');

insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment)
values ('${J(9)}', '${C}', '${W}', 5, 'Seeded: fantastic work, spotless finish.'),
       ('${J(9)}', '${W}', '${C}', 5, 'Seeded: clear brief, easy access.')
on conflict (job_id, reviewer_id) do nothing;

-- A live unread chat (job 2) + two feed rows so Messages/Notifications open populated.
insert into public.messages (job_id, sender_id, content)
values ('${J(2)}', '${W}', 'Seeded: I''ll be there in the 9–12 window — anything I should know?');

select public.enqueue_notification('${C}', '${W}', 'jobs', 'status',
  'Wren Worker', 'Seeded: "Done — awaiting your approval" was just completed.',
  jsonb_build_object('screen','ClientJobDetail','jobId','${J(6)}'), 'd1seed:status6');
select public.enqueue_notification('${W}', '${C}', 'jobs', 'payment_released',
  'Your work was approved', 'Seeded: the payment for "Approved — review & tip open" released.',
  jsonb_build_object('screen','WorkerJob','jobId','${J(8)}'), 'd1seed:release8');

do $$
declare v_jobs int; v_pay int;
begin
  select count(*) into v_jobs from public.jobs where id::text like 'd1c00000%';
  select count(*) into v_pay from public.payments where id::text like 'd1c00000%';
  raise notice 'SEED review: % jobs across every lifecycle state, % ledger rows', v_jobs, v_pay;
  if v_jobs <> 9 then raise exception 'expected 9 seeded jobs, got %', v_jobs; end if;
end $$;

commit;
`;

// Windows argv is codepage-encoded — the em dashes and middle dots in the
// seeded titles arrive mangled via -c. Feed the SQL over stdin as UTF-8.
// The catch exists because a failed execFileSync echoes its full argv —
// including the connection string — into the error; never let that print.
try {
  execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-', DB], {
    input: Buffer.from(SQL, 'utf8'),
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
} catch {
  console.error('seed-review: psql failed (see the psql error above). No secrets echoed.');
  process.exit(1);
}

console.log('\nSeeded. Sign in on the device with:');
console.log('  CUSTOMER  phase6.customer@brazos.test  /  brazos-test-1234   (Casey)');
console.log('  WORKER    phase6.worker@brazos.test    /  brazos-test-1234   (Wren)');
console.log('Every lifecycle state is live at once — see REVIEW_GUIDE.md for the walk.');
