-- BRAZOS · Phase 30 · restore atomic bid acceptance
--
-- Safe to run repeatedly. This is intentionally limited to the missing RPC
-- reported by production; it does not modify or delete user data.

begin;

create or replace function public.accept_bid(p_job_id uuid, p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_bid public.bids;
begin
  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if not found or v_user is null or v_job.client_id <> v_user then
    raise exception 'Job not found or not owned by caller';
  end if;
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if v_job.status <> 'open' or v_job.accepted_bid_id is not null then
    raise exception 'Job no longer accepts bids';
  end if;

  select * into v_bid
  from public.bids
  where id = p_bid_id
    and job_id = p_job_id
  for update;

  if not found or v_bid.status <> 'pending' then
    raise exception 'Bid is not pending for this job';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_bid.worker_id
      and not coalesce(p.banned, false)
  ) or public.is_blocked_between(v_user, v_bid.worker_id) then
    raise exception 'Worker is not available';
  end if;

  update public.jobs
  set
    status = 'assigned',
    assigned_worker_id = v_bid.worker_id,
    accepted_bid_id = v_bid.id,
    final_amount_cents = v_bid.amount_cents
  where id = p_job_id;

  update public.bids
  set status = case
    when id = p_bid_id then 'accepted'::public.bid_status
    else 'rejected'::public.bid_status
  end
  where job_id = p_job_id
    and status = 'pending';
end;
$$;

revoke all on function public.accept_bid(uuid, uuid) from public;
grant execute on function public.accept_bid(uuid, uuid) to authenticated;

-- Ask PostgREST to expose the new function immediately instead of waiting for
-- its normal schema-cache refresh.
notify pgrst, 'reload schema';

commit;
