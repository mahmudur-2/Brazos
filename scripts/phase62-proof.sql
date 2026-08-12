-- ===========================================================================
-- PHASE 3 / phase62 · proof of the counter-offer notification copy and its
-- routing payload.
--
-- STAGING ONLY:
--   psql -v ON_ERROR_STOP=1 -f scripts/phase62-proof.sql -d "$SUPABASE_DB_URL_STAGING"
--
-- Disposable fixtures; the whole script ends in ROLLBACK.
-- ===========================================================================
\pset pager off
\set ON_ERROR_STOP on
begin;

create temp table t_result(seq int, name text, expected text, actual text, pass boolean) on commit drop;
grant all on t_result to authenticated, anon;

do $fx$
declare v_n int;
begin
  select count(*) into v_n from auth.users
   where id in ('f6200000-0000-4000-8000-00000000ca01',
                'f6200000-0000-4000-8000-00000000be01');
  if v_n > 0 then raise exception 'FIXTURE UUID COLLISION - aborting'; end if;
end
$fx$;

-- A two-word name, so "first name only" is actually observable.
insert into auth.users (id, raw_user_meta_data) values
  ('f6200000-0000-4000-8000-00000000ca01', '{"full_name":"Marguerite Vandersteen"}'::jsonb),
  ('f6200000-0000-4000-8000-00000000be01', '{"full_name":"P62 Worker"}'::jsonb);

insert into public.jobs (id, client_id, title, status, visibility, budget_cents) values
  ('f6200000-0000-4000-8000-0000000000a1','f6200000-0000-4000-8000-00000000ca01',
   'P62 fence repair','open','open_market', 20000);

-- worker bids
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6200000-0000-4000-8000-00000000be01","role":"authenticated"}';
do $bid$
declare v_offer uuid;
begin
  v_offer := public.create_offer(p_amount_cents => 18000,
                                 p_job_id => 'f6200000-0000-4000-8000-0000000000a1');
  create temp table t_offer(id uuid) on commit drop;
  insert into t_offer values (v_offer);
end
$bid$;
reset role;
grant all on t_offer to authenticated, anon;

-- customer counters
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6200000-0000-4000-8000-00000000ca01","role":"authenticated"}';
do $ctr$
begin
  perform public.counter_offer(o.id, 16000) from t_offer o;
end
$ctr$;
reset role;

-- ---------------------------------------------------------------------------
-- TEST 1 - copy: first name only, and the named action.
-- ---------------------------------------------------------------------------
do $t1$
declare v_body text; v_ok boolean;
begin
  select n.body into v_body
    from public.notification_outbox n
   where n.type = 'offer_countered'
     and n.recipient_id = 'f6200000-0000-4000-8000-00000000be01'
   order by n.created_at desc limit 1;

  v_ok := v_body is not null
      and v_body like 'Marguerite sent you a Counteroffer%'
      and v_body not like '%Vandersteen%'
      and v_body not like '%countered%';

  insert into t_result values (1,'Counter notification uses first name + "sent you a Counteroffer"',
    'starts "Marguerite sent you a Counteroffer", no surname, no bare "countered"',
    coalesce(v_body,'<no notification row>'), v_ok);
end
$t1$;

-- ---------------------------------------------------------------------------
-- TEST 2 - the money in the copy is still true.
-- ---------------------------------------------------------------------------
do $t2$
declare v_body text; v_ok boolean;
begin
  select n.body into v_body
    from public.notification_outbox n
   where n.type = 'offer_countered'
     and n.recipient_id = 'f6200000-0000-4000-8000-00000000be01'
   order by n.created_at desc limit 1;
  v_ok := v_body like '%$160.00%';
  insert into t_result values (2,'The countered amount is still stated, and correct',
    'contains $160.00 for a 16000-cent counter', coalesce(v_body,'<none>'), v_ok);
end
$t2$;

-- ---------------------------------------------------------------------------
-- TEST 3 - the deep link addresses the JOB, on the awaiting party's own
--          response surface (unchanged from phase59, asserted so it stays).
-- ---------------------------------------------------------------------------
do $t3$
declare v_data jsonb; v_ok boolean;
begin
  select n.data into v_data
    from public.notification_outbox n
   where n.type = 'offer_countered'
     and n.recipient_id = 'f6200000-0000-4000-8000-00000000be01'
   order by n.created_at desc limit 1;

  -- the worker owes the reply, so their surface is JobDetail, for THIS job
  v_ok := v_data ->> 'screen' = 'JobDetail'
      and v_data ->> 'jobId' = 'f6200000-0000-4000-8000-0000000000a1';

  insert into t_result values (3,'Payload deep-links to Job details for that specific job',
    'screen=JobDetail, jobId=<the job>', coalesce(v_data::text,'<none>'), v_ok);
end
$t3$;

-- ---------------------------------------------------------------------------
select seq, case when pass then 'PASS' else 'FAIL' end as result, name, actual
from t_result order by seq;

do $sum$
declare v_fail int; v_total int;
begin
  select count(*) filter (where not pass), count(*) into v_fail, v_total from t_result;
  if v_fail > 0 then
    raise notice '=== phase62 PROOF: %/% FAILED ===', v_fail, v_total;
  else
    raise notice '=== phase62 PROOF: ALL % CHECKS PASSED ===', v_total;
  end if;
end
$sum$;

rollback;
