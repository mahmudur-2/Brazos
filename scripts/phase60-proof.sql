-- ===========================================================================
-- PHASE 1 · adversarial tests for jobs_delete_own / can_delete_own_job()
-- STAGING ONLY. Every fixture is disposable and the whole script ends in
-- ROLLBACK, so no staging row survives it (R9).
-- ===========================================================================
\pset pager off
\set ON_ERROR_STOP on
begin;

create temp table t_result(seq int, name text, expected text, actual text, pass boolean) on commit drop;
grant all on t_result to authenticated, anon;

-- --- fixtures --------------------------------------------------------------
do $fx$
declare v_n int;
begin
  select count(*) into v_n from auth.users
   where id in ('f1000000-0000-4000-8000-00000000f001',
                'f1000000-0000-4000-8000-00000000f002',
                'f1000000-0000-4000-8000-00000000f003');
  if v_n > 0 then raise exception 'FIXTURE UUID COLLISION - aborting'; end if;
end
$fx$;

insert into auth.users (id, raw_user_meta_data) values
  ('f1000000-0000-4000-8000-00000000f001', '{"full_name":"RunFixture Owner"}'::jsonb),
  ('f1000000-0000-4000-8000-00000000f002', '{"full_name":"RunFixture Other"}'::jsonb),
  ('f1000000-0000-4000-8000-00000000f003', '{"full_name":"RunFixture Worker"}'::jsonb);

insert into public.jobs (id, client_id, title, status) values
  ('f1000000-0000-4000-8000-0000000000a1','f1000000-0000-4000-8000-00000000f001','RunFixture open no bids','open'),
  ('f1000000-0000-4000-8000-0000000000a2','f1000000-0000-4000-8000-00000000f001','RunFixture open with bid','open'),
  ('f1000000-0000-4000-8000-0000000000a3','f1000000-0000-4000-8000-00000000f001','RunFixture assigned','assigned'),
  ('f1000000-0000-4000-8000-0000000000a4','f1000000-0000-4000-8000-00000000f001','RunFixture in_progress','in_progress'),
  ('f1000000-0000-4000-8000-0000000000a5','f1000000-0000-4000-8000-00000000f001','RunFixture completed','completed'),
  ('f1000000-0000-4000-8000-0000000000a6','f1000000-0000-4000-8000-00000000f001','RunFixture cancelled','cancelled'),
  ('f1000000-0000-4000-8000-0000000000a7','f1000000-0000-4000-8000-00000000f001','RunFixture draft','draft'),
  ('f1000000-0000-4000-8000-0000000000a8','f1000000-0000-4000-8000-00000000f001','RunFixture probe','open');

insert into public.bids (id, job_id, worker_id, amount_cents) values
  ('f1000000-0000-4000-8000-0000000000b1','f1000000-0000-4000-8000-0000000000a2',
   'f1000000-0000-4000-8000-00000000f003', 4200);

-- ===========================================================================
-- TEST 1 - Owner CAN delete their own open job with zero bids.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-00000000f001","role":"authenticated"}';
do $t1$
declare v_n int; v_actual text; v_present boolean;
begin
  begin
    delete from public.jobs where id = 'f1000000-0000-4000-8000-0000000000a1';
    get diagnostics v_n = row_count;
    v_actual := 'delete affected ' || v_n || ' row(s)';
  exception when others then
    v_actual := 'ERROR ' || sqlstate || ': ' || sqlerrm;
  end;
  select exists(select 1 from public.jobs j where j.id='f1000000-0000-4000-8000-0000000000a1')
    into v_present;
  insert into t_result values (1,'Owner CAN delete own open job with zero bids',
    'job is gone', v_actual || ' / job still present=' || v_present, not v_present);
end
$t1$;
reset role;

-- ===========================================================================
-- TEST 2 - Owner CANNOT delete their own job that has >= 1 bid.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-00000000f001","role":"authenticated"}';
do $t2$
declare v_n int; v_actual text; v_present boolean;
begin
  begin
    delete from public.jobs where id = 'f1000000-0000-4000-8000-0000000000a2';
    get diagnostics v_n = row_count;
    v_actual := 'delete affected ' || v_n || ' row(s)';
  exception when others then
    v_actual := 'ERROR ' || sqlstate || ': ' || sqlerrm;
  end;
  select exists(select 1 from public.jobs j where j.id='f1000000-0000-4000-8000-0000000000a2') into v_present;
  insert into t_result values (2,'Owner CANNOT delete own job with >=1 bid',
    '0 rows affected AND job survives', v_actual || ' / job survives=' || v_present, v_present);
end
$t2$;
reset role;

-- ===========================================================================
-- TEST 3 - A DIFFERENT authenticated user CANNOT delete the job, ANY status.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-00000000f002","role":"authenticated"}';
do $t3$
declare
  r record; v_n int; v_all_survived boolean := true; v_detail text := '';
begin
  for r in select j.id, j.status::text as st from public.jobs j
            where j.id in ('f1000000-0000-4000-8000-0000000000a2',
                           'f1000000-0000-4000-8000-0000000000a3',
                           'f1000000-0000-4000-8000-0000000000a4',
                           'f1000000-0000-4000-8000-0000000000a5',
                           'f1000000-0000-4000-8000-0000000000a6',
                           'f1000000-0000-4000-8000-0000000000a7')
            order by j.status::text
  loop
    begin
      delete from public.jobs where id = r.id;
      get diagnostics v_n = row_count;
    exception when others then
      v_n := -1;
    end;
    if v_n <> 0 then v_all_survived := false; end if;
    v_detail := v_detail || r.st || '=' || v_n || 'rows; ';
  end loop;
  if v_detail = '' then
    v_all_survived := false;
    v_detail := 'NO FIXTURE JOBS VISIBLE TO NON-OWNER - loop never ran, see note';
  end if;
  insert into t_result values (3,'Non-owner CANNOT delete the job in ANY status',
    'every status: 0 rows affected', v_detail, v_all_survived);
end
$t3$;
reset role;

-- TEST 3b - same, but driven from a fixed id list so RLS on SELECT cannot make
-- the loop vacuous (a vacuous pass would be a false negative).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-00000000f002","role":"authenticated"}';
do $t3b$
declare
  v_ids uuid[] := array[
    'f1000000-0000-4000-8000-0000000000a2',
    'f1000000-0000-4000-8000-0000000000a3',
    'f1000000-0000-4000-8000-0000000000a4',
    'f1000000-0000-4000-8000-0000000000a5',
    'f1000000-0000-4000-8000-0000000000a6',
    'f1000000-0000-4000-8000-0000000000a7']::uuid[];
  v_id uuid; v_n int; v_ok boolean := true; v_detail text := '';
begin
  foreach v_id in array v_ids loop
    begin
      delete from public.jobs where id = v_id;
      get diagnostics v_n = row_count;
    exception when others then
      v_n := -1;
    end;
    if v_n <> 0 then v_ok := false; end if;
    v_detail := v_detail || right(v_id::text,2) || '=' || v_n || '; ';
  end loop;
  insert into t_result values (31,'Non-owner delete attempts by explicit id (6 statuses)',
    'all six: 0 rows affected', v_detail, v_ok);
end
$t3b$;
reset role;

-- ===========================================================================
-- TEST 4 - An ANONYMOUS user CANNOT delete it.
-- ===========================================================================
set local role anon;
set local request.jwt.claims = '';
do $t4$
declare v_n int; v_actual text; v_ok boolean;
begin
  begin
    delete from public.jobs where id = 'f1000000-0000-4000-8000-0000000000a2';
    get diagnostics v_n = row_count;
    v_actual := 'delete affected ' || v_n || ' row(s)';
    v_ok := (v_n = 0);
  exception when others then
    v_actual := 'refused: SQLSTATE ' || sqlstate;
    v_ok := true;
  end;
  insert into t_result values (4,'Anonymous user CANNOT delete the job',
    '0 rows affected or hard refusal', v_actual, v_ok);
end
$t4$;
reset role;

-- ===========================================================================
-- TEST 5 - Authenticated NON-OWNER calling the helper DIRECTLY gets FALSE and
--          cannot distinguish not-owner / has-bids / no-such-job.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-00000000f002","role":"authenticated"}';
do $t5$
declare
  v_other_inprog boolean; v_other_with_bid boolean; v_other_assigned boolean; v_missing boolean;
  v_ok boolean; v_detail text;
begin
  v_other_inprog   := public.can_delete_own_job('f1000000-0000-4000-8000-0000000000a4');
  v_other_with_bid := public.can_delete_own_job('f1000000-0000-4000-8000-0000000000a2');
  v_other_assigned := public.can_delete_own_job('f1000000-0000-4000-8000-0000000000a3');
  v_missing        := public.can_delete_own_job('f1000000-0000-4000-8000-0000dead0000');

  v_ok := (v_other_inprog is false) and (v_other_with_bid is false)
      and (v_other_assigned is false) and (v_missing is false);

  v_detail := 'other-in_progress=' || v_other_inprog
           || ', other-open-with-bid=' || v_other_with_bid
           || ', other-assigned=' || v_other_assigned
           || ', nonexistent=' || v_missing
           || ' -> all four identical=' || v_ok;

  insert into t_result values (5,'Non-owner calling helper directly gets an indistinguishable FALSE',
    'false for all four, no distinguishing signal', v_detail, v_ok);
end
$t5$;
reset role;

-- TEST 5b - the owner's own view of the same helper, to prove FALSE is not
-- simply "always false" (a helper that denied everyone would pass test 5).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-00000000f001","role":"authenticated"}';
do $t5b$
declare v_open_clean boolean; v_open_bid boolean; v_assigned boolean; v_ok boolean;
begin
  v_open_clean := public.can_delete_own_job('f1000000-0000-4000-8000-0000000000a8');
  v_open_bid   := public.can_delete_own_job('f1000000-0000-4000-8000-0000000000a2');
  v_assigned   := public.can_delete_own_job('f1000000-0000-4000-8000-0000000000a3');
  v_ok := (v_open_clean is true) and (v_open_bid is false) and (v_assigned is false);
  insert into t_result values (51,'Helper is not blanket-false: owner sees true only for a clean open job',
    'true / false / false',
    'owner-open-clean=' || v_open_clean || ', owner-open-with-bid=' || v_open_bid
      || ', owner-assigned=' || v_assigned, v_ok);
exception when others then
  insert into t_result values (51,'Helper is not blanket-false: owner sees true only for a clean open job',
    'true / false / false', 'ERROR ' || sqlstate || ': ' || sqlerrm, false);
end
$t5b$;
reset role;

-- ===========================================================================
select seq,
       case when pass then 'PASS' else 'FAIL' end as result,
       name, actual
from t_result order by seq;

do $sum$
declare v_fail int; v_total int;
begin
  select count(*) filter (where not pass), count(*) into v_fail, v_total from t_result;
  if v_fail > 0 then
    raise notice '=== PHASE 1 ADVERSARIAL: %/% FAILED ===', v_fail, v_total;
  else
    raise notice '=== PHASE 1 ADVERSARIAL: ALL % CHECKS PASSED ===', v_total;
  end if;
end
$sum$;

rollback;
