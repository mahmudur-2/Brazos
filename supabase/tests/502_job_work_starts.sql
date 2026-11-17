-- 502_job_work_starts.sql — production-36h S1, O1 (the recorder): 20261116415000_job_work_starts.sql.
-- A start through transition_job_status writes one job_work_starts row; no other status change writes
-- one; a repeated start keeps the first time; no client can read or write the table; the row stays
-- after ban_user cancels the job; and the record can never fail a start.
--
-- THE CAST: a customer, a worker, an admin (profiles.is_admin set by the runner, as 290 does) and the
-- runner (RLS bypassed): fixtures and the ground truth. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each line carries -- SURGERY): §3 moves a job's status by hand to show
-- that only assigned -> in_progress records, and moves a recorded time a day back so a repeated start
-- can be told from the first; §5 adds a NOT VALID check that refuses every new row, so the insert fails.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(19);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('o1r.customer@brazos.test', 'Cora Customer') as customer \gset
select tests.create_user('o1r.worker@brazos.test',   'Wil Worker')    as worker   \gset
select tests.create_user('o1r.admin@brazos.test',    'Ada Admin')     as admin    \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values ('customer', :'customer'), ('worker', :'worker'), ('admin', :'admin');

-- Hire at $50 and fund it.
create or replace function tests.o1r_hire(p_title text) returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := (select v from fx where k = 'worker');
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, v_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Recorder probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '5 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Recorder bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  perform tests.test_fund_job(v_job);
  return v_job;
end $$;

-- The worker starts the work: 'ok: in_progress' or 'error: <the sentence>'.
create or replace function tests.o1r_start(p_job uuid) returns text language plpgsql as $$
declare v_out text;
begin
  perform tests.authenticate_as((select fx.v from fx where fx.k = 'worker'));
  begin
    v_out := 'ok: ' || (public.transition_job_status(p_job, 'in_progress')).status::text;
  exception when others then
    v_out := 'error: ' || sqlerrm;
  end;
  perform tests.clear_auth();
  return v_out;
end $$;

-- The job's row: '<none>' or 'now' / the time.
create or replace function tests.o1r_row(p_job uuid) returns text language sql as $$
  select coalesce((select case when s.started_at = now() then 'now' else s.started_at::text end
                     from public.job_work_starts s where s.job_id = p_job), '<none>')
$$;

-- ---------------------------------------------------------------------------
-- §1. The shape: the table, its rights, the trigger.
-- ---------------------------------------------------------------------------
select is((select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end,
                             ', ' order by a.attnum)
             from pg_attribute a where a.attrelid = 'public.job_work_starts'::regclass and a.attnum > 0 and not a.attisdropped),
  'job_id uuid not null, started_at timestamp with time zone not null',
  '1a: job_work_starts holds job_id and started_at, both not null');
select is((select pg_get_constraintdef(c.oid) from pg_constraint c
            where c.conrelid = 'public.job_work_starts'::regclass and c.contype = 'f'),
  'FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE',
  '1b: job_id references jobs and goes with its job');
select is((select c.relrowsecurity::text || '/' || (select count(*) from pg_policies p
                                                      where p.schemaname = 'public' and p.tablename = 'job_work_starts')::text
             from pg_class c where c.oid = 'public.job_work_starts'::regclass),
  'true/0', '1c: row security on, no policy');
select is((select string_agg(r || ':' || p, ', ' order by r, p)
             from unnest(array['anon', 'authenticated', 'service_role']) r,
                  unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
            where has_table_privilege(r, 'public.job_work_starts', p)),
  'service_role:SELECT', '1d: no client right; the service role reads');
select ok((select p.prosecdef and p.proconfig = array['search_path=public, pg_temp']
             from pg_proc p where p.oid = 'public.record_job_work_start()'::regprocedure)
          and not has_function_privilege('anon', 'public.record_job_work_start()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.record_job_work_start()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.record_job_work_start()', 'EXECUTE'),
  '1e: the trigger function is SECURITY DEFINER with a pinned search_path, and no client may call it');
select is((select pg_get_triggerdef(t.oid) from pg_trigger t
            where t.tgrelid = 'public.jobs'::regclass and t.tgname = 'jobs_record_work_start'),
  'CREATE TRIGGER jobs_record_work_start AFTER UPDATE OF status ON public.jobs FOR EACH ROW WHEN (((old.status = ''assigned''::job_status) AND (new.status = ''in_progress''::job_status))) EXECUTE FUNCTION record_job_work_start()',
  '1f: the trigger fires after a status update, only from assigned to in_progress');

-- ---------------------------------------------------------------------------
-- §2. A start through transition_job_status writes one row.
-- ---------------------------------------------------------------------------
select tests.o1r_hire('O1R start') as j_a \gset
select is(tests.o1r_row(:'j_a'), '<none>', '2a: a hired, funded job that has not started has no row');
select is(tests.o1r_start(:'j_a'), 'ok: in_progress', '2b: the worker starts the work');
select is(tests.o1r_row(:'j_a') || '/' || (select count(*) from public.job_work_starts where job_id = :'j_a')::text,
  'now/1', '2c: the start wrote one row, at the start''s time');

-- ---------------------------------------------------------------------------
-- §3. No other status change records; a repeated start keeps the first time.
-- ---------------------------------------------------------------------------
select tests.o1r_hire('O1R other') as j_b \gset
update public.jobs set status = 'cancelled' where id = :'j_b';                                  -- SURGERY
select is(tests.o1r_row(:'j_b'), '<none>', '3a: assigned -> cancelled writes no row');
update public.jobs set status = 'completed' where id = :'j_a';                                  -- SURGERY
select is((select count(*) from public.job_work_starts where job_id = :'j_a'), 1::bigint,
  '3b: in_progress -> completed writes no second row');
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'customer', 'O1R inserted in progress', :'worker', 'in_progress') returning id as j_c \gset
select is(tests.o1r_row(:'j_c'), '<none>', '3c: a job written as in_progress (no update of its status) has no row: no backfill');
update public.job_work_starts set started_at = now() - interval '1 day' where job_id = :'j_a';  -- SURGERY
update public.jobs set status = 'assigned' where id = :'j_a';                                   -- SURGERY
update public.jobs set status = 'in_progress' where id = :'j_a';                                -- SURGERY
select is(tests.o1r_row(:'j_a'), (now() - interval '1 day')::text,
  '3d: a second assigned -> in_progress keeps the first time (on conflict do nothing)');

-- ---------------------------------------------------------------------------
-- §4. No client can read or write the table.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select throws_ok($$ select count(*) from public.job_work_starts $$, '42501',
  'permission denied for table job_work_starts', '4a: the customer cannot read the table');
select tests.authenticate_as(:'worker');
select throws_ok(format($$ insert into public.job_work_starts (job_id) values (%L) $$, :'j_b'), '42501',
  'permission denied for table job_work_starts', '4b: the worker cannot write a row');
select throws_ok(format($$ update public.job_work_starts set started_at = now() where job_id = %L $$, :'j_a'), '42501',
  'permission denied for table job_work_starts', '4c: the worker cannot change a row');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §5. The record never fails a start: a failed insert is a warning, and the start stands.
-- ---------------------------------------------------------------------------
select tests.o1r_hire('O1R refused insert') as j_e \gset
alter table public.job_work_starts add constraint o1r_refuse_all check (job_id is null) not valid; -- SURGERY
select is(tests.o1r_start(:'j_e') || '/' || tests.o1r_row(:'j_e'), 'ok: in_progress/<none>',
  '5a: the insert fails, the work still starts, and no row is written');
alter table public.job_work_starts drop constraint o1r_refuse_all;                              -- SURGERY

-- ---------------------------------------------------------------------------
-- §6. The row stays after ban_user cancels the job.
-- ---------------------------------------------------------------------------
select tests.o1r_hire('O1R banned') as j_d \gset
select is(tests.o1r_start(:'j_d'), 'ok: in_progress', '6a: the worker starts the work');
select tests.authenticate_as(:'admin');
select public.ban_user(:'customer');
select tests.clear_auth();
select is((select j.status::text || '/' || tests.o1r_row(j.id) from public.jobs j where j.id = :'j_d'),
  'cancelled/now', '6b: ban_user cancelled the job, and the record of its start is still there');

select * from finish();
rollback;
