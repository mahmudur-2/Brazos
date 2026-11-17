-- job_work_starts — production-36h S1, O1 (the recorder). A durable record of the moment the work on a
-- job started, kept after the job is cancelled.
--
-- WHY: a cancelled job keeps no fact that its work had started. transition_job_status (assigned ->
-- in_progress) writes only jobs.status, and ban_user then overwrites that status with 'cancelled'
-- (20261116400200_ban_switch.sql), although the ban reads it to leave a started job's payment
-- undirected. A money decision on such a job needs a record, not an inference from the cancel paths
-- that exist today. jobs.arrived_at ("I'm here") is not the start: a worker can arrive and never start.
--
-- 1. NEW table job_work_starts (job_id primary key -> jobs, started_at). Row security on, no policy, no
--    client right; the service role reads it. Only the trigger below writes it.
-- 2. NEW trigger function record_job_work_start() and the AFTER UPDATE OF status trigger
--    jobs_record_work_start, only when old.status = 'assigned' and new.status = 'in_progress' (the one
--    start transition_job_status makes; it is the only status mover). One insert, on conflict do
--    nothing, so a repeated start keeps the first time. SECURITY DEFINER with a pinned search_path, so
--    no caller of a start can fail on a right; the insert sits in its own block and an error there is a
--    warning, so the record can never fail a start (limit: a cancelled statement still ends the start).
-- 3. NO BACKFILL: a start that nobody recorded is not written. A job started before this file has no row.
-- 0. The order rule: this file restates no existing function; it stops if one of its new names exists.

begin;

do $order_rule$
declare
  v_bad text;
begin
  select string_agg(n.sig, ', ' order by n.sig) into v_bad
  from (values ('public.record_job_work_start()')) as n(sig)
  where to_regprocedure(n.sig) is not null;
  if v_bad is null and to_regclass('public.job_work_starts') is not null then
    v_bad := 'public.job_work_starts';
  end if;
  if v_bad is null and exists (select 1 from pg_trigger t
                                where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_record_work_start') then
    v_bad := 'trigger jobs_record_work_start';
  end if;
  if v_bad is not null then
    raise exception 'job_work_starts: a name this file makes new already exists (re-derive from it): %', v_bad;
  end if;
end
$order_rule$;

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
create table public.job_work_starts (
  job_id     uuid primary key references public.jobs(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table public.job_work_starts enable row level security;
revoke all on table public.job_work_starts from public, anon, authenticated, service_role;
grant select on table public.job_work_starts to service_role;
comment on table public.job_work_starts is
  'O1 recorder: when the work on a job started (its first assigned -> in_progress), kept after the job is cancelled. Only the trigger jobs_record_work_start writes it; no backfill, so a job started before 20261116415000 has no row. RLS on, no policy; the service role reads it, no client right.';

-- ---------------------------------------------------------------------------
-- 2. The trigger.
-- ---------------------------------------------------------------------------
create or replace function public.record_job_work_start()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  begin
    insert into public.job_work_starts (job_id) values (new.id) on conflict (job_id) do nothing;
  exception when others then
    raise warning 'record_job_work_start %: %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.record_job_work_start() from public, anon, authenticated, service_role;
comment on function public.record_job_work_start() is
  'O1 recorder: AFTER UPDATE OF status on jobs, when assigned -> in_progress: one job_work_starts row, on conflict do nothing (the first start stays). SECURITY DEFINER with a pinned search_path; an error in the insert is a warning, so it never fails a start. No client may call it.';

create trigger jobs_record_work_start
  after update of status on public.jobs
  for each row
  when (old.status = 'assigned' and new.status = 'in_progress')
  execute function public.record_job_work_start();

commit;
