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
