-- ============================================================
-- PROD_APPLY step: supabase/phase51_active_work_lifecycle.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · Phase 6 · active-work lifecycle: arrival tracking, checklist,
-- disputes, and the first path a payment may take past `held`.
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs` — SQL Editor "success" is not proof.
--
-- What this deliberately does NOT do (AUTONOMOUS_RUN §9 / addendum):
--   * No job_status enum widening. en_route/arrived are NOT statuses — they
--     are static, monotonic timestamps on the jobs row, and "confirmed" stays
--     DERIVED as assigned + held (lib/jobLifecycle.ts is the one derivation
--     point). The §H.1 enum migration rides the version-gate phase.
--   * No live location. The tracking scope is exactly two worker-declared
--     moments: en route and arrived.
--   * No provider SDK. Release/tip stay inside the phase50 sandbox: real
--     ledger rows, honest states, no real money, provider CHECK unchanged.
-- ============================================================================

begin;

-- 1. Dispute enums ------------------------------------------------------------
--
-- Statuses are Postgres enums by repo rule. `resolved` exists for the human/
-- admin resolution step (a later phase); nothing in this phase writes it.

do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'dispute_status' and n.nspname = 'public') then
    create type public.dispute_status as enum ('open', 'withdrawn', 'resolved');
  end if;
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'dispute_reason' and n.nspname = 'public') then
    create type public.dispute_reason as enum
      ('not_as_described', 'incomplete', 'damage', 'no_show', 'other');
  end if;
end $$;

-- 2. jobs: arrival + completion timestamps ------------------------------------
--
-- Monotonic facts, not statuses: each is stamped once by its RPC and never
-- cleared or rewound. Old installed builds never select or write these
-- columns, so nothing is stranded (§ backward compatibility).

alter table public.jobs
  add column if not exists en_route_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists completed_at timestamptz;

comment on column public.jobs.en_route_at is
  'When the assigned worker tapped "I''m on my way" (mark_worker_arrival). Static declaration — there is no live location anywhere. NULL for jobs worked before phase51 or where the worker skipped it.';
comment on column public.jobs.arrived_at is
  'When the assigned worker tapped "I''ve arrived" (mark_worker_arrival). Setting it backfills en_route_at so the pair can never read arrived-but-never-en-route.';
comment on column public.jobs.completed_at is
  'When transition_job_status moved this job to completed. Drives the 72h auto-release clock (job_payment_state). NULL for jobs completed before phase51 — their clock never runs, deliberately.';

-- 3. payments: release audit fields -------------------------------------------

alter table public.payments
  add column if not exists released_at timestamptz,
  add column if not exists release_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_release_reason_known'
  ) then
    alter table public.payments
      add constraint payments_release_reason_known
      check (release_reason is null or release_reason in ('approved', 'auto_approved'));
  end if;
end $$;

comment on column public.payments.released_at is
  'When the job_payment left held for released. Stamped only by sandbox_release_job_payment / the 72h auto-release inside job_payment_state; tips are born released and stamp it at insert.';
comment on column public.payments.release_reason is
  '''approved'' = the customer approved the finished work; ''auto_approved'' = the 72h on-read clock ran out. NULL for tips and for anything not yet released.';

-- 4. job_checklist_items -------------------------------------------------------
--
-- Screen 57's work plan. The assigned worker owns the rows (writes); the
-- customer can read along. Direct RLS DML rather than RPCs — the same
-- treatment message_reads has: per-user working state scoped to its job, with
-- no money or lifecycle authority anywhere in it.

create table if not exists public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  position integer not null default 0,
  label text not null check (length(btrim(label)) between 1 and 200),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists job_checklist_items_job_idx
  on public.job_checklist_items (job_id, position, created_at);

alter table public.job_checklist_items enable row level security;

-- Both parties read; only the assigned worker writes, and only while the job
-- is actually being worked (assigned/in_progress). A completed job's
-- checklist is a record, not a to-do list.
drop policy if exists "checklist_select_parties" on public.job_checklist_items;
create policy "checklist_select_parties"
  on public.job_checklist_items for select
  to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id
      and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
  ));

drop policy if exists "checklist_insert_worker" on public.job_checklist_items;
create policy "checklist_insert_worker"
  on public.job_checklist_items for insert
  to authenticated
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_id
      and j.assigned_worker_id = auth.uid()
      and j.status in ('assigned', 'in_progress')
  ));

drop policy if exists "checklist_update_worker" on public.job_checklist_items;
create policy "checklist_update_worker"
  on public.job_checklist_items for update
  to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id
      and j.assigned_worker_id = auth.uid()
      and j.status in ('assigned', 'in_progress')
  ))
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_id
      and j.assigned_worker_id = auth.uid()
      and j.status in ('assigned', 'in_progress')
  ));

drop policy if exists "checklist_delete_worker" on public.job_checklist_items;
create policy "checklist_delete_worker"
  on public.job_checklist_items for delete
  to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id
      and j.assigned_worker_id = auth.uid()
      and j.status in ('assigned', 'in_progress')
  ));

-- phase29 posture: grants tell the same story RLS enforces.
revoke all on public.job_checklist_items from public, anon;
grant select, insert, update, delete on public.job_checklist_items to authenticated;

-- 5. job_disputes --------------------------------------------------------------
--
-- Screen 36's "report an issue". A NEW table rather than extending the
-- moderation `reports` table (that one is no-show/unsafe/harassment aimed at
-- admins; this one is a two-party payment freeze with its own lifecycle) —
-- recorded as a NEEDS REVIEW decision in DECISIONS.md. Writes are RPC-only:
-- an open dispute freezes money, which makes it lifecycle authority.

create table if not exists public.job_disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  payment_id uuid references public.payments(id),
  opened_by uuid not null references public.profiles(id),
  reason public.dispute_reason not null,
  details text check (details is null or length(details) <= 2000),
  status public.dispute_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);

-- One live dispute per job. Withdrawn/resolved rows stay as history.
create unique index if not exists job_disputes_one_open_per_job
  on public.job_disputes (job_id)
  where status = 'open';

create index if not exists job_disputes_job_idx
  on public.job_disputes (job_id, created_at desc);

alter table public.job_disputes enable row level security;

drop policy if exists "disputes_select_parties" on public.job_disputes;
create policy "disputes_select_parties"
  on public.job_disputes for select
  to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id
      and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
  ));

revoke all on public.job_disputes from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.job_disputes from authenticated;
grant select on public.job_disputes to authenticated;

-- 6. mark_worker_arrival() -----------------------------------------------------
--
-- The §9 tracking scope, whole: two static, monotonic, idempotent moments.
-- Only while `assigned` — arrival precedes starting work; a worker who starts
-- without marking either simply leaves them NULL. Deliberately NOT gated on
-- the payment being held: blocking "I'm on my way" because the customer
-- hasn't finished checkout would punish the wrong party. The customer-side
-- surfaces keep showing pending-payment until they fund (DECISIONS.md).

create or replace function public.mark_worker_arrival(
  p_job_id uuid,
  p_step text
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_step not in ('en_route', 'arrived') then
    raise exception 'Unknown arrival step';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if v_job.status <> 'assigned' then
    raise exception 'Arrival can only be marked before the job is started';
  end if;

  update public.jobs
     set en_route_at = coalesce(en_route_at, now()),
         arrived_at = case
           when p_step = 'arrived' then coalesce(arrived_at, now())
           else arrived_at
         end
   where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.mark_worker_arrival(uuid, text) from public, anon;
grant execute on function public.mark_worker_arrival(uuid, text) to authenticated;

comment on function public.mark_worker_arrival(uuid, text) is
  'The assigned worker declares en_route or arrived on an assigned job. Monotonic + idempotent: timestamps are set once, never cleared; arrived backfills en_route. No live location exists anywhere.';

-- 7. transition_job_status: stamp completed_at ---------------------------------
--
-- Same signature as phase35 (no drop needed), same checks, same transitions —
-- the ONLY change is stamping jobs.completed_at when the job completes, which
-- starts the 72h auto-release clock. Old builds calling this RPC get the
-- stamp for free; nothing about their call shape changes.

create or replace function public.transition_job_status(
  p_job_id uuid,
  p_status text,
  p_completion_photos jsonb default null,
  p_completion_videos jsonb default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found or v_user is null or v_job.assigned_worker_id <> v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user
      and not coalesce(p.banned, false)
  ) then
    raise exception 'Active authentication required';
  end if;
  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.transition_job_status(uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.transition_job_status(uuid, text, jsonb, jsonb)
  to authenticated;

-- 8. sandbox_release_job_payment() ---------------------------------------------
--
-- The third sandbox RPC (§9 pre-authorized): held -> released, and the FIRST
-- function anywhere that moves a payment past held. Authorization lives HERE,
-- not in navigation order: only the job's owner (who is the payer), only on a
-- completed job, only from held, and never while a dispute is open. A repeat
-- call after success returns the released row unchanged — never twice.

create or replace function public.sandbox_release_job_payment(p_job_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  -- Same lock order as authorize/hold: job row first, then the payment.
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found then
    raise exception 'This job has no payment to release';
  end if;
  if v_payment.payer_id <> v_actor then
    raise exception 'Only the payer can release this payment';
  end if;

  -- Idempotent success: already past held means the release (or the sandbox
  -- payout that followed it) already happened. Return the truth, change nothing.
  if v_payment.status in ('released', 'paid_out') then
    return v_payment;
  end if;

  if v_job.status <> 'completed' then
    raise exception 'Funds release only after the job is completed';
  end if;
  if exists (
    select 1 from public.job_disputes d
    where d.job_id = p_job_id and d.status = 'open'
  ) then
    raise exception 'An open issue report is holding this payment';
  end if;
  if v_payment.status <> 'held' then
    raise exception 'This payment is not held (%)', v_payment.status;
  end if;

  update public.payments
     set status = 'released',
         released_at = now(),
         release_reason = 'approved',
         updated_at = now()
   where id = v_payment.id
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.sandbox_release_job_payment(uuid) from public, anon;
grant execute on function public.sandbox_release_job_payment(uuid) to authenticated;

comment on function public.sandbox_release_job_payment(uuid) is
  'SANDBOX ONLY — no real money. The customer''s approval moves the job''s payment held -> released (idempotent once released). Refuses while a dispute is open, before completion, and from any state but held.';

-- 9. job_payment_state(): the on-read 72h auto-release + party read ------------
--
-- The repo has no cron (on-read-check only, like offer expiry). Lifecycle
-- surfaces read the payment through THIS rather than a bare table select, so
-- the auto-release clock is checked exactly when someone looks. 72h from
-- jobs.completed_at; jobs completed before phase51 have no stamp and no
-- clock. Auto-release respects the same dispute freeze as manual release.

create or replace function public.job_payment_state(p_job_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if not found or (v_job.client_id <> v_actor
                   and v_job.assigned_worker_id is distinct from v_actor) then
    raise exception 'Job not found';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if not found then
    return null;
  end if;

  if v_payment.status = 'held'
     and v_job.status = 'completed'
     and v_job.completed_at is not null
     and now() >= v_job.completed_at + interval '72 hours'
     and not exists (
       select 1 from public.job_disputes d
       where d.job_id = p_job_id and d.status = 'open'
     ) then
    update public.payments
       set status = 'released',
           released_at = now(),
           release_reason = 'auto_approved',
           updated_at = now()
     where id = v_payment.id
    returning * into v_payment;
  end if;

  return v_payment;
end;
$$;

revoke all on function public.job_payment_state(uuid) from public, anon;
grant execute on function public.job_payment_state(uuid) to authenticated;

comment on function public.job_payment_state(uuid) is
  'The job''s active job_payment row for its two parties, running the 72h auto-release check on the way (release_reason ''auto_approved''). NULL when checkout never ran. The on-read pattern, same as offer expiry — there is no cron.';

-- 10. open_job_dispute() / withdraw_job_dispute() ------------------------------
--
-- Screen 36's "report an issue" and its undo. Opening freezes release (both
-- the manual RPC and the auto-clock check the open row). Resolution is a
-- human step in a later phase — no RPC writes 'resolved'.

create or replace function public.open_job_dispute(
  p_job_id uuid,
  p_reason text,
  p_details text default null
)
returns public.job_disputes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
  v_dispute public.job_disputes;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if p_reason is null or p_reason not in
     ('not_as_described', 'incomplete', 'damage', 'no_show', 'other') then
    raise exception 'Unknown issue reason';
  end if;
  if p_details is not null and length(p_details) > 2000 then
    raise exception 'Issue details are limited to 2000 characters';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.status <> 'completed' then
    raise exception 'An issue can be reported once the work is submitted as complete';
  end if;

  -- Idempotent-ish: an already-open report is returned rather than doubled.
  select * into v_dispute
  from public.job_disputes
  where job_id = p_job_id and status = 'open';
  if found then
    return v_dispute;
  end if;

  -- The freeze only means something while the money is still holdable.
  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if found and v_payment.status in ('released', 'paid_out') then
    raise exception 'This payment was already released and can no longer be held';
  end if;

  insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
  values (p_job_id, v_payment.id, v_actor, p_reason::public.dispute_reason, p_details)
  returning * into v_dispute;

  return v_dispute;
exception
  when unique_violation then
    select * into v_dispute
    from public.job_disputes
    where job_id = p_job_id and status = 'open';
    return v_dispute;
end;
$$;

revoke all on function public.open_job_dispute(uuid, text, text) from public, anon;
grant execute on function public.open_job_dispute(uuid, text, text) to authenticated;

comment on function public.open_job_dispute(uuid, text, text) is
  'The customer reports an issue on a completed job, freezing release (manual and auto) while it stays open. One open report per job; a second call returns the existing one. Refused once the payment has released.';

create or replace function public.withdraw_job_dispute(p_dispute_id uuid)
returns public.job_disputes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_dispute public.job_disputes;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_dispute
  from public.job_disputes
  where id = p_dispute_id
  for update;
  if not found or v_dispute.opened_by <> v_actor then
    raise exception 'Issue report not found';
  end if;
  if v_dispute.status = 'withdrawn' then
    return v_dispute;   -- retry of a withdraw that already landed
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'Only an open issue report can be withdrawn';
  end if;

  update public.job_disputes
     set status = 'withdrawn',
         resolved_at = now()
   where id = v_dispute.id
  returning * into v_dispute;

  return v_dispute;
end;
$$;

revoke all on function public.withdraw_job_dispute(uuid) from public, anon;
grant execute on function public.withdraw_job_dispute(uuid) to authenticated;

comment on function public.withdraw_job_dispute(uuid) is
  'The opener withdraws their own open issue report (idempotent on withdrawn), unfreezing release. Resolution by anyone else is a later, human phase.';

-- 11. sandbox_tip_worker() ------------------------------------------------------
--
-- Screen 37's tip, as a REAL ledger row (kind='tip') — wallet math derives
-- from payments rows, never a hand-kept number. Release-first by §9: a tip
-- can only follow the job_payment actually releasing. A tip is born
-- 'released' (there is no escrow step for a gratuity); the one-active-per-
-- (job,kind) index plus the idempotent re-read make a double tap one tip.

create or replace function public.sandbox_tip_worker(
  p_job_id uuid,
  p_amount_cents integer
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_tip public.payments;
  v_main public.payments;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.status <> 'completed' or v_job.assigned_worker_id is null then
    raise exception 'Tips are for completed jobs';
  end if;

  -- One tip per job; a retry returns the existing row.
  select * into v_tip
  from public.payments
  where job_id = p_job_id and kind = 'tip'
    and status not in ('failed', 'voided');
  if found then
    return v_tip;
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000 then
    raise exception 'Tip must be between $0.01 and $1,000';
  end if;

  select * into v_main
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided');
  if not found or v_main.status not in ('released', 'paid_out') then
    raise exception 'The job payment releases first — then a tip can be added';
  end if;

  insert into public.payments (
    job_id, offer_id, payer_id, payee_id, kind,
    amount_cents, platform_fee_cents,
    provider, provider_ref, status, released_at
  )
  values (
    v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id,
    'tip', p_amount_cents, 0,
    'sandbox', 'sandbox_' || gen_random_uuid(), 'released', now()
  )
  returning * into v_tip;

  return v_tip;
exception
  when unique_violation then
    select * into v_tip
    from public.payments
    where job_id = p_job_id and kind = 'tip'
      and status not in ('failed', 'voided');
    return v_tip;
end;
$$;

revoke all on function public.sandbox_tip_worker(uuid, integer) from public, anon;
grant execute on function public.sandbox_tip_worker(uuid, integer) to authenticated;

comment on function public.sandbox_tip_worker(uuid, integer) is
  'SANDBOX ONLY — no real money. One tip ledger row per completed job, only after the job_payment released. Born ''released''; capped at $1,000.';

-- 12. verify-schema sentinel ---------------------------------------------------

create or replace function public.active_work_lifecycle_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.active_work_lifecycle_enabled() from public, anon;
grant execute on function public.active_work_lifecycle_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- PROD_APPLY step: supabase/phase52_offer_scoped_chat.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · Phase 7 · offer-scoped pre-hire chat
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- THE GAP THIS CLOSES
--   Job-thread chat (phase8/13 policies) is client + assigned worker only —
--   correct, because a job thread is one thread and pre-hire there are many
--   bidders who must never see each other's words. Direct-offer pairs already
--   get a per-pair `direct_threads` row (phase36's create_job_request calls
--   ensure_direct_thread), so THEY can talk pre-hire. Marketplace-bid pairs
--   get nothing: a customer looking at a bid cannot ask "when could you
--   start?" without accepting first.
--
--   The master plan's Phase 7 rule: a conversation exists from the moment an
--   offer first links two users — messaging is allowed once an offer/bid
--   exists between the pair, and pre-hire chat is OFFER-scoped (the per-pair
--   thread), never the job thread. Addresses are never auto-inserted
--   anywhere: job_locations RLS (owner + hired worker) is untouched, and a
--   thread contains only what the two people type into it.
--
-- MECHANISM
--   An AFTER INSERT trigger on job_offers (the phase47 pattern) calls the
--   existing ensure_direct_thread() for the offer's pair. A trigger rather
--   than editing create_offer(): every path that inserts an offer row —
--   create_offer, counter_offer, any future one — gets the guarantee, and
--   the big negotiation RPC bodies stay exactly as phase50 left them.
--
--   Deliberately NOT changed: the conversations view still lists a direct
--   thread only once it has a message. The thread existing quietly from the
--   first offer means the pair CAN talk (RLS grants it); the inbox surfaces
--   it when someone actually says something. Screens reach the silent thread
--   from the offer surfaces (BidDetail / the worker's own-bid card), so a
--   customer with ten bids does not get ten empty inbox rows.
-- ============================================================================

begin;

-- 1. The trigger ---------------------------------------------------------------

create or replace function public.ensure_thread_for_offer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- ensure_direct_thread orders the pair and upserts; parties are distinct by
  -- job_offers_parties_distinct. Any failure here must not lose the offer
  -- insert itself — the thread is a convenience the next read can rebuild.
  begin
    perform public.ensure_direct_thread(new.customer_id, new.worker_id);
  exception when others then
    raise warning 'ensure_thread_for_offer skipped for offer %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Internal plumbing, same posture as ensure_direct_thread itself: no direct
-- EXECUTE for clients — it runs only as the trigger.
revoke all on function public.ensure_thread_for_offer() from public, anon, authenticated;

drop trigger if exists job_offers_thread_autocreate on public.job_offers;
create trigger job_offers_thread_autocreate
  after insert on public.job_offers
  for each row
  execute function public.ensure_thread_for_offer();

comment on function public.ensure_thread_for_offer() is
  'AFTER INSERT on job_offers: guarantees the pair''s direct_threads row exists from the first offer between two users (phase52 — offer-scoped pre-hire chat). Never fails the offer insert.';

-- 2. Backfill ------------------------------------------------------------------
--
-- Pairs whose offers predate this trigger get their thread now, so a live
-- negotiation that started yesterday can talk today. Bounded: one row per
-- distinct pair with a still-pending offer; ensure_direct_thread upserts.

do $$
declare
  v_pair record;
  v_count int := 0;
begin
  for v_pair in
    select distinct customer_id, worker_id
    from public.job_offers
    where status = 'pending'
  loop
    perform public.ensure_direct_thread(v_pair.customer_id, v_pair.worker_id);
    v_count := v_count + 1;
  end loop;
  raise notice 'phase52 backfill: ensured threads for % live offer pair(s)', v_count;
end $$;

-- 3. verify-schema sentinel ----------------------------------------------------

create or replace function public.offer_scoped_chat_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.offer_scoped_chat_enabled() from public, anon;
grant execute on function public.offer_scoped_chat_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- PROD_APPLY step: supabase/phase53_worker_self_service.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · Phase 9 · worker self-service: services & pricing, saved
-- workers, portfolio drafts, availability.
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- Four additive pieces, all backward compatible with installed builds:
--   1. worker_services — the screen-64/25 services & pricing model. The
--      portfolio_items treatment: direct RLS DML by the owner, published
--      rows readable by any signed-in user.
--   2. saved_workers — screen 46 (+ the deferred Rebook 08). Private to the
--      saver: not even the saved worker can see the row.
--   3. portfolio_items.published — drafts. Default TRUE so every existing
--      row (and every insert from an installed build) stays public exactly
--      as before; only a new build can deliberately save a draft.
--   4. profiles.accepting_work / availability_note — the screen-66
--      availability facts. Public marketplace columns (column-granted like
--      phase29's list); written ONLY through update_my_profile(), which is
--      re-created with the two keys added to its allowlist.
-- ============================================================================

begin;

-- 1. worker_services -----------------------------------------------------------

create table if not exists public.worker_services (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  category text not null check (length(btrim(category)) > 0),
  /** NULL = "ask for a quote" — a real answer, not a zero. */
  price_cents integer check (price_cents is null or price_cents > 0),
  price_unit text not null default 'flat' check (price_unit in ('flat', 'hourly')),
  published boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_services_worker_idx
  on public.worker_services (worker_id, position, created_at);

alter table public.worker_services enable row level security;

drop policy if exists "services_select_visible" on public.worker_services;
create policy "services_select_visible"
  on public.worker_services for select
  to authenticated
  using (published = true or worker_id = auth.uid());

drop policy if exists "services_insert_own" on public.worker_services;
create policy "services_insert_own"
  on public.worker_services for insert
  to authenticated
  with check (worker_id = auth.uid() and public.is_active_user());

drop policy if exists "services_update_own" on public.worker_services;
create policy "services_update_own"
  on public.worker_services for update
  to authenticated
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid() and public.is_active_user());

drop policy if exists "services_delete_own" on public.worker_services;
create policy "services_delete_own"
  on public.worker_services for delete
  to authenticated
  using (worker_id = auth.uid());

revoke all on public.worker_services from public, anon;
grant select, insert, update, delete on public.worker_services to authenticated;

comment on table public.worker_services is
  'Screens 64/25: a worker''s advertised services with optional pricing. Owner-managed via direct RLS DML (the portfolio_items treatment); published rows are public marketplace info, drafts are owner-only. price_cents NULL means "ask" — never rendered as $0.';

-- 2. saved_workers -------------------------------------------------------------

create table if not exists public.saved_workers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, worker_id),
  constraint saved_workers_not_self check (user_id <> worker_id)
);

alter table public.saved_workers enable row level security;

-- Private to the saver in BOTH directions: a worker cannot enumerate who
-- saved them, and nobody can read anyone else's list.
drop policy if exists "saved_select_own" on public.saved_workers;
create policy "saved_select_own"
  on public.saved_workers for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saved_insert_own" on public.saved_workers;
create policy "saved_insert_own"
  on public.saved_workers for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists "saved_delete_own" on public.saved_workers;
create policy "saved_delete_own"
  on public.saved_workers for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.saved_workers from public, anon;
grant select, insert, delete on public.saved_workers to authenticated;

-- 3. portfolio drafts ----------------------------------------------------------

alter table public.portfolio_items
  add column if not exists published boolean not null default true;

-- The old select policy exposed every row to every signed-in user. Narrowed:
-- drafts are visible only to their owner. Existing rows defaulted to
-- published=true, so nothing an installed build shows today disappears.
drop policy if exists "portfolio_select_all" on public.portfolio_items;
drop policy if exists "portfolio_select_visible" on public.portfolio_items;
create policy "portfolio_select_visible"
  on public.portfolio_items for select
  to authenticated
  using (published = true or worker_id = auth.uid());

comment on column public.portfolio_items.published is
  'FALSE = a draft only its owner can see (phase53). Defaults TRUE so installed builds'' inserts keep behaving exactly as before the column existed.';

-- 4. availability on profiles --------------------------------------------------

alter table public.profiles
  add column if not exists accepting_work boolean not null default true,
  add column if not exists availability_note text
    check (availability_note is null or length(availability_note) <= 140);

-- Public marketplace facts, same column-grant mechanism as phase29's list.
grant select (accepting_work, availability_note) on public.profiles to authenticated;

comment on column public.profiles.accepting_work is
  'Screen 66: whether the worker is currently taking new work. Display truth only — nothing blocks a customer from sending an offer; the worker declines as usual.';
comment on column public.profiles.availability_note is
  'Screen 66: a short free-text availability line ("Weekday evenings, weekends"). 140 chars.';

-- update_my_profile: same signature, allowlist widened with the two new
-- keys + their validations. Body otherwise phase29's, unchanged.
create or replace function public.update_my_profile(p_patch jsonb)
returns setof public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_categories text[];
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_user() then
    raise exception 'Suspended accounts cannot update profiles';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'Profile update must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as k(key)
    where k.key not in (
      'full_name', 'phone', 'avatar_url', 'bio', 'language', 'categories',
      'accepting_work', 'availability_note'
    )
  ) then
    raise exception 'Profile update contains a protected or unknown field';
  end if;

  if p_patch ? 'full_name'
     and (length(btrim(coalesce(p_patch->>'full_name', ''))) < 1
          or length(btrim(p_patch->>'full_name')) > 100) then
    raise exception 'Full name must be between 1 and 100 characters';
  end if;
  if p_patch ? 'phone'
     and (length(btrim(coalesce(p_patch->>'phone', ''))) < 7
          or length(btrim(p_patch->>'phone')) > 30) then
    raise exception 'Phone number is invalid';
  end if;
  if p_patch ? 'avatar_url'
     and p_patch->>'avatar_url' is not null
     and length(p_patch->>'avatar_url') > 2048 then
    raise exception 'Avatar URL is too long';
  end if;
  if p_patch ? 'bio'
     and length(coalesce(p_patch->>'bio', '')) > 200 then
    raise exception 'Bio is too long';
  end if;
  if p_patch ? 'language'
     and p_patch->>'language' not in ('en', 'es') then
    raise exception 'Unsupported language';
  end if;
  if p_patch ? 'categories' then
    if jsonb_typeof(p_patch->'categories') <> 'array'
       or jsonb_array_length(p_patch->'categories') > 20 then
      raise exception 'Categories must be an array with at most 20 entries';
    end if;
    select coalesce(array_agg(c.value), '{}'::text[])
      into v_categories
      from jsonb_array_elements_text(p_patch->'categories') as c(value);
  end if;
  if p_patch ? 'accepting_work'
     and jsonb_typeof(p_patch->'accepting_work') <> 'boolean' then
    raise exception 'accepting_work must be true or false';
  end if;
  if p_patch ? 'availability_note'
     and length(coalesce(p_patch->>'availability_note', '')) > 140 then
    raise exception 'Availability note is limited to 140 characters';
  end if;

  update public.profiles p
  set
    full_name = case
      when p_patch ? 'full_name' then btrim(p_patch->>'full_name')
      else p.full_name
    end,
    phone = case
      when p_patch ? 'phone' then btrim(p_patch->>'phone')
      else p.phone
    end,
    avatar_url = case
      when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '')
      else p.avatar_url
    end,
    bio = case
      when p_patch ? 'bio' then nullif(btrim(p_patch->>'bio'), '')
      else p.bio
    end,
    language = case
      when p_patch ? 'language' then p_patch->>'language'
      else p.language
    end,
    categories = case
      when p_patch ? 'categories' then v_categories
      else p.categories
    end,
    accepting_work = case
      when p_patch ? 'accepting_work' then (p_patch->'accepting_work')::boolean
      else p.accepting_work
    end,
    availability_note = case
      when p_patch ? 'availability_note'
        then nullif(btrim(p_patch->>'availability_note'), '')
      else p.availability_note
    end
  where p.id = v_user;

  if not found then
    raise exception 'Profile not found';
  end if;

  return query select p.* from public.profiles p where p.id = v_user;
end;
$$;

revoke all on function public.update_my_profile(jsonb) from public, anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- 5. verify-schema sentinel ----------------------------------------------------

create or replace function public.worker_self_service_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.worker_self_service_enabled() from public, anon;
grant execute on function public.worker_self_service_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- PROD_APPLY step: supabase/phase54_review_integrity.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · Phase 10 · review integrity
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- What already held (audited, then PROVEN in scripts/phase10-proof.sql):
-- UNIQUE (job_id, reviewer_id); rating 1..5 CHECK; rating_avg/rating_count
-- maintained by the phase6 recompute trigger; and — the load-bearing part —
-- phase29 REVOKED direct INSERT on reviews and made create_review() the only
-- write path, which already enforces party-of-completed-job, the correct
-- counterparty, rating bounds and comment length. The Phase 10 DoD ("one
-- review per completed job enforced in DB") was therefore already true.
--
-- What this file adds is DEFENSE IN DEPTH: the phase6-era INSERT policy
-- still said only `reviewer_id = auth.uid()`, which is unreachable today
-- (the grant is revoked) but would become the only guard if a future
-- migration ever re-granted INSERT. The policy now states the full rule, so
-- the table tells the truth with or without the revoke. Strictly narrowing;
-- no reachable write path changes at all.
-- ============================================================================

begin;

drop policy if exists "users insert own reviews" on public.reviews;
drop policy if exists "reviews_insert_completed_party" on public.reviews;
create policy "reviews_insert_completed_party"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.is_active_user()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.status = 'completed'
        and (
          (j.client_id = auth.uid() and j.assigned_worker_id = reviewee_id)
          or (j.assigned_worker_id = auth.uid() and j.client_id = reviewee_id)
        )
    )
  );

comment on policy "reviews_insert_completed_party" on public.reviews is
  'Phase 10: a review is written only by a party of a COMPLETED job, only about the other party, once (the phase6 unique constraint). The rating trigger keeps aggregates in sync.';

create or replace function public.review_integrity_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.review_integrity_enabled() from public, anon;
grant execute on function public.review_integrity_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- PROD_APPLY step: supabase/phase55_sandbox_cash_out.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · Phase 11 · simulated cash-out (released -> paid_out)
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- The wallet's three buckets are DERIVED from payments rows (§G: never a
-- hand-kept balance): pending = held, available = released, transferred =
-- paid_out. This file adds the one missing motion — the payee sweeping their
-- released rows to paid_out — and the timestamp that records it. SANDBOX:
-- no bank, no transfer, no provider; the labels say "simulated" on screen.
-- ============================================================================

begin;

alter table public.payments
  add column if not exists paid_out_at timestamptz;

comment on column public.payments.paid_out_at is
  'When the payee''s simulated cash-out swept this row released -> paid_out (phase55). Sandbox only — no real transfer exists.';

-- The payee sweeps every released row they are owed. Affecting zero rows is
-- a fine, honest answer (nothing to cash out) — an empty set, never an
-- error, so a double tap is a no-op by construction.
create or replace function public.sandbox_cash_out()
returns setof public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  return query
  update public.payments
     set status = 'paid_out',
         paid_out_at = now(),
         updated_at = now()
   where payee_id = v_actor
     and status = 'released'
  returning *;
end;
$$;

revoke all on function public.sandbox_cash_out() from public, anon;
grant execute on function public.sandbox_cash_out() to authenticated;

comment on function public.sandbox_cash_out() is
  'SANDBOX ONLY — no real money. Sweeps the caller''s released rows (job payments and tips) to paid_out, stamping paid_out_at. Zero released rows returns an empty set; repeat calls are no-ops.';

create or replace function public.sandbox_cash_out_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.sandbox_cash_out_enabled() from public, anon;
grant execute on function public.sandbox_cash_out_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- PROD_APPLY step: supabase/phase56_notification_feed.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · Phase 12 · the in-app notification feed (screen 42)
--
-- Safe to re-run (idempotent). Apply with psql; verify with verify-schema.
--
-- phase20 already built the pipeline: notification_outbox (dedupe_key,
-- prefs-gated via should_notify) fed by triggers on messages, job status,
-- negotiation events, reviews and nearby jobs — a delivery QUEUE with no
-- client access and no sender (the honest no-op delivery adapter). Phase 12
-- turns the same rows into the recipient's in-app feed and completes the
-- event map with the two Phase-6 moments it predates:
--   1. read_at + recipient-only SELECT + column-granted UPDATE(read_at)
--   2. payments released -> notify the payee (approval / auto-approval)
--   3. job_disputes opened -> notify the worker
-- ============================================================================

begin;

-- 1. Feed access ---------------------------------------------------------------

alter table public.notification_outbox
  add column if not exists read_at timestamptz;

alter table public.notification_outbox enable row level security;

drop policy if exists "outbox_select_recipient" on public.notification_outbox;
create policy "outbox_select_recipient"
  on public.notification_outbox for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "outbox_update_recipient" on public.notification_outbox;
create policy "outbox_update_recipient"
  on public.notification_outbox for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- The recipient may write exactly ONE column: their read marker. Delivery
-- bookkeeping (status/attempts/sent_at) stays server-side.
revoke all on public.notification_outbox from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.notification_outbox from authenticated;
grant select on public.notification_outbox to authenticated;
grant update (read_at) on public.notification_outbox to authenticated;

comment on column public.notification_outbox.read_at is
  'When the recipient opened this in their feed (phase56). The recipient''s only writable column.';

-- 2. should_notify: drop the push-token gate -----------------------------------
--
-- phase20's should_notify refused to enqueue when the recipient had no
-- active push token — correct for a pure delivery queue ("don't grow rows
-- that can never be sent"), wrong now that the same rows ARE the in-app
-- feed: an event belongs in the feed whether or not a device is registered.
-- Recreated identically minus that final gate; every preference, mute,
-- block and ban check stays exactly as phase20 wrote it.

create or replace function public.should_notify(
  p_recipient uuid,
  p_actor uuid,
  p_category text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefs public.notification_prefs;
  v_allowed boolean;
begin
  if p_recipient is null then
    return false;
  end if;
  if p_actor is not null and p_actor = p_recipient then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.id = p_recipient and p.banned) then
    return false;
  end if;
  if p_actor is not null then
    if public.is_blocked_between(p_recipient, p_actor) then
      return false;
    end if;
    if exists (
      select 1 from public.mutes m
      where m.muter_id = p_recipient and m.muted_id = p_actor
    ) then
      return false;
    end if;
    if exists (select 1 from public.profiles p where p.id = p_actor and p.banned) then
      return false;
    end if;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_recipient;
  if v_prefs.user_id is null then
    v_allowed := (p_category <> 'nearby_jobs');
  else
    v_allowed := case p_category
      when 'messages'      then v_prefs.messages
      when 'bids'          then v_prefs.bids
      when 'job_updates'   then v_prefs.job_updates
      when 'hire_requests' then v_prefs.hire_requests
      when 'nearby_jobs'   then v_prefs.nearby_jobs
      else true
    end;
  end if;

  return v_allowed;
end;
$$;

revoke all on function public.should_notify(uuid, uuid, text) from public, anon, authenticated;

-- 3. Payment released -> the payee hears about it ------------------------------

create or replace function public.notify_on_payment_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
begin
  if new.status = 'released' and old.status is distinct from 'released'
     and new.kind = 'job_payment' then
    v_title := case when new.release_reason = 'auto_approved'
      then 'Payment released automatically'
      else 'Your work was approved' end;
    perform public.enqueue_notification(
      new.payee_id,
      new.payer_id,
      'jobs',
      'payment_released',
      v_title,
      'The payment is released to you in the sandbox ledger.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'payment_released:' || new.id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_on_payment_release() from public, anon, authenticated;

drop trigger if exists payments_notify_release on public.payments;
create trigger payments_notify_release
  after update on public.payments
  for each row
  execute function public.notify_on_payment_release();

-- 3. Dispute opened -> the worker hears about it -------------------------------

create or replace function public.notify_on_dispute()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid;
begin
  select assigned_worker_id into v_worker from public.jobs where id = new.job_id;
  if v_worker is not null then
    perform public.enqueue_notification(
      v_worker,
      new.opened_by,
      'jobs',
      'dispute_opened',
      'An issue was reported',
      'The customer reported an issue with the finished work — the payment holds while it''s open.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.job_id::text),
      'dispute_opened:' || new.id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_on_dispute() from public, anon, authenticated;

drop trigger if exists job_disputes_notify on public.job_disputes;
create trigger job_disputes_notify
  after insert on public.job_disputes
  for each row
  execute function public.notify_on_dispute();

-- 4. verify-schema sentinel ----------------------------------------------------

create or replace function public.notification_feed_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.notification_feed_enabled() from public, anon;
grant execute on function public.notification_feed_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- PROD_APPLY step: supabase/phase57_direct_thread_message_notifications.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · hardening run · direct-thread messages reach the feed
--
-- Safe to re-run (idempotent). Apply with psql; verify with verify-schema.
--
-- DEFECT (proven by code path, caught by the A2 lifecycle proof):
-- notify_on_message() resolves the recipient from public.jobs by
-- new.job_id and returns early when the job row is absent — which is every
-- DIRECT-THREAD message, because those rows carry direct_thread_id and a
-- NULL job_id (phase36). Phase 7 made the pair's direct thread the pre-hire
-- conversation, so a bidder's "could I come by at nine?" produced no feed
-- row and no push enqueue at all. The job-thread path, previews, dedupe and
-- the hire-request double-buzz guard are unchanged; the direct branch
-- resolves the recipient from the thread's two participants instead.
-- ============================================================================

begin;

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
  v_thread public.direct_threads;
  v_recipient uuid;
  v_preview text;
begin
  -- Hire-request events also insert a message row (phase18). Those are
  -- notified from the negotiation triggers, which know the state — notifying
  -- here as well would double-buzz for a single action.
  if new.job_request_id is not null then
    return new;
  end if;

  if new.job_id is not null then
    select * into v_job from public.jobs where id = new.job_id;
    if v_job.id is null then
      return new;
    end if;
    v_recipient := case
      when v_job.client_id = new.sender_id then v_job.assigned_worker_id
      else v_job.client_id
    end;
  elsif new.direct_thread_id is not null then
    -- phase57: the pre-hire pair thread. The recipient is simply the other
    -- participant.
    select * into v_thread from public.direct_threads where id = new.direct_thread_id;
    if v_thread.id is null then
      return new;
    end if;
    v_recipient := case
      when v_thread.user_a = new.sender_id then v_thread.user_b
      else v_thread.user_a
    end;
  else
    return new;
  end if;

  if v_recipient is null then
    return new;
  end if;

  v_preview := case
    when new.audio_url is not null then 'Voice message'
    when new.image_url is not null and coalesce(btrim(new.content), '') = '' then 'Photo'
    when new.image_url is not null then '📷 ' || new.content
    else new.content
  end;

  perform public.enqueue_notification(
    v_recipient,
    new.sender_id,
    'messages',
    'message',
    public.notify_display_name(new.sender_id),
    left(coalesce(nullif(btrim(v_preview), ''), 'New message'), 140),
    case
      when new.job_id is not null then
        jsonb_build_object('screen', 'Chat', 'jobId', new.job_id::text)
      else
        jsonb_build_object('screen', 'Chat', 'directThreadId', new.direct_thread_id::text)
    end,
    'message:' || new.id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_on_message() from public, anon, authenticated;

create or replace function public.direct_thread_notifications_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.direct_thread_notifications_enabled() from public, anon;
grant execute on function public.direct_thread_notifications_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- PROD_APPLY step: supabase/phase58_hardening_fixes.sql
-- ============================================================

-- ============================================================================
-- BRAZOS V2 · hardening run · three proven Phase-A fixes
--
-- Safe to re-run (idempotent). Apply with psql; verify with verify-schema.
--
--   1. DROP the legacy permissive jobs SELECT policy. Policies OR together,
--      so "jobs are viewable by authenticated users" (auth.role() =
--      'authenticated') silently defeated the four narrow policies phases
--      43-46 built (open+active / own / assigned worker / offer party) —
--      any signed-in user could read EVERY job row, including draft
--      direct-offer negotiations that are private by design. Dropping it is
--      strictly narrowing. KNOWN TRADE-OFF (recorded in DECISIONS.md):
--      installed builds' cross-user posted/completed counts (the JobDetail
--      trust signal) now undercount, because those were only ever readable
--      through the leak. No read or write path errors — the counts read
--      lower. client_job_stats() below is the sanctioned replacement.
--   2. client_job_stats(p_client_id) — SECURITY DEFINER counts (posted,
--      completed, cancelled) so the trust signal survives the policy drop
--      without reopening row access.
--   3. sandbox_authorize_job_payment: the unfundable-job race. The worker
--      could Start (assigned -> in_progress, no payment precondition — a
--      deliberate phase51 decision) BEFORE checkout, after which authorize
--      refused forever ("not awaiting payment") and the job ran to
--      completed with an empty ledger — release and tip permanently
--      impossible. Deterministically reproduced. Authorize now accepts
--      assigned/in_progress/completed; everything else is unchanged.
--   4. transition_job_status: idempotent-success branch. A retry of a
--      transition that already landed returned "Invalid job status
--      transition" instead of the row — the only 6-12 lifecycle RPC that
--      punished a double-tap. Now returns the current row when the job is
--      already in the requested state (the retry's media is deliberately
--      ignored; the first call's payload already landed).
-- ============================================================================

begin;

-- 1. The leak ------------------------------------------------------------------

drop policy if exists "jobs are viewable by authenticated users" on public.jobs;

-- 2. The trust-signal replacement ---------------------------------------------

create or replace function public.client_job_stats(p_client_id uuid)
returns table (posted bigint, completed bigint, cancelled bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where status <> 'draft'),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled')
  from public.jobs
  where client_id = p_client_id;
$$;

revoke all on function public.client_job_stats(uuid) from public, anon;
grant execute on function public.client_job_stats(uuid) to authenticated;

comment on function public.client_job_stats(uuid) is
  'Counted (never estimated) posting history for any client — the JobDetail trust signal. SECURITY DEFINER because the counts deliberately cover rows the viewer cannot read row-wise after phase58 dropped the legacy permissive policy.';

-- 3. Authorize after start ------------------------------------------------------

create or replace function public.sandbox_authorize_job_payment(p_job_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_payment public.payments;
  v_amount integer;
begin
  if v_actor is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_actor then
    raise exception 'Job not found';
  end if;
  if v_job.assigned_worker_id is null or v_job.accepted_offer_id is null then
    raise exception 'This job has no accepted offer to fund yet';
  end if;
  -- phase58: was `<> 'assigned'`. The worker may legitimately have started
  -- (or even finished) before the customer funded — late funding must stay
  -- possible or the ledger can never exist for this job.
  if v_job.status not in ('assigned', 'in_progress', 'completed') then
    raise exception 'This job is not awaiting payment';
  end if;

  select * into v_payment
  from public.payments
  where job_id = p_job_id and kind = 'job_payment'
    and status not in ('failed', 'voided')
  for update;
  if found then
    return v_payment;
  end if;

  v_amount := coalesce(v_job.final_amount_cents, v_job.budget_cents);
  if v_amount is null or v_amount <= 0 then
    raise exception 'This job has no agreed amount to authorize';
  end if;

  insert into public.payments (
    job_id, offer_id, payer_id, payee_id, kind,
    amount_cents, platform_fee_cents,
    provider, provider_ref, status, authorized_at
  )
  values (
    v_job.id, v_job.accepted_offer_id, v_actor, v_job.assigned_worker_id,
    'job_payment', v_amount, 0,
    'sandbox', 'sandbox_' || gen_random_uuid(), 'authorized', now()
  )
  returning * into v_payment;

  return v_payment;
exception
  when unique_violation then
    select * into v_payment
    from public.payments
    where job_id = p_job_id and kind = 'job_payment'
      and status not in ('failed', 'voided');
    return v_payment;
end;
$$;

revoke all on function public.sandbox_authorize_job_payment(uuid) from public, anon;
grant execute on function public.sandbox_authorize_job_payment(uuid) to authenticated;

-- 4. Idempotent transition retries ----------------------------------------------

create or replace function public.transition_job_status(
  p_job_id uuid,
  p_status text,
  p_completion_photos jsonb default null,
  p_completion_videos jsonb default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
  v_videos jsonb := coalesce(p_completion_videos, '[]'::jsonb);
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found or v_user is null or v_job.assigned_worker_id <> v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user
      and not coalesce(p.banned, false)
  ) then
    raise exception 'Active authentication required';
  end if;

  -- phase58: a retry of a transition that already landed returns the row
  -- (the sibling-RPC idempotency pattern). The retry's media is ignored —
  -- the first call's payload already landed.
  if v_job.status::text = p_status then
    return v_job;
  end if;

  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
      or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;
  if jsonb_typeof(v_videos) <> 'array' or jsonb_array_length(v_videos) > 1 then
    raise exception 'Completion videos must be an array with at most 1 entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_videos) as video(value)
    where jsonb_typeof(video.value) <> 'string'
      or length(video.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion video must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::public.job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end,
    completion_videos = case
      when p_status = 'completed' and p_completion_videos is not null then v_videos
      else completion_videos
    end,
    completed_at = case
      when p_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.transition_job_status(uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.transition_job_status(uuid, text, jsonb, jsonb)
  to authenticated;

-- 5. verify-schema sentinel ------------------------------------------------------

create or replace function public.hardening_fixes_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.hardening_fixes_enabled() from public, anon;
grant execute on function public.hardening_fixes_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;

