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
