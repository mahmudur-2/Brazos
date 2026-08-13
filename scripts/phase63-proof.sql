-- ===========================================================================
-- PHASE 4 / phase63 · proof of the 10-per-side, per-chain counter-offer cap.
--
-- STAGING ONLY:
--   psql -v ON_ERROR_STOP=1 -f scripts/phase63-proof.sql -d "$SUPABASE_DB_URL_STAGING"
--
-- Disposable fixtures; the whole script ends in ROLLBACK.
--
-- The actor is switched with set_config('request.jwt.claims', ..., true)
-- rather than SET ROLE, because counter_offer() is SECURITY DEFINER and
-- resolves the actor purely from auth.uid(), which reads that GUC. That is
-- what lets a 20-counter alternating negotiation be built in one session.
-- The concurrency half of this phase cannot be done from a single session and
-- is run separately as two psql processes (see FINDINGS.md).
-- ===========================================================================
\pset pager off
\set ON_ERROR_STOP on
begin;

create temp table t_result(seq int, name text, expected text, actual text, pass boolean) on commit drop;
grant all on t_result to authenticated;

do $fx$
declare v_n int;
begin
  select count(*) into v_n from auth.users
   where id in ('f6300000-0000-4000-8000-00000000ca01',
                'f6300000-0000-4000-8000-00000000be01',
                'f6300000-0000-4000-8000-00000000bf01');
  if v_n > 0 then raise exception 'FIXTURE UUID COLLISION - aborting'; end if;
end
$fx$;

insert into auth.users (id, raw_user_meta_data) values
  ('f6300000-0000-4000-8000-00000000ca01', '{"full_name":"P63 Customer"}'::jsonb),
  ('f6300000-0000-4000-8000-00000000be01', '{"full_name":"P63 WorkerOne"}'::jsonb),
  ('f6300000-0000-4000-8000-00000000bf01', '{"full_name":"P63 WorkerTwo"}'::jsonb);

insert into public.jobs (id, client_id, title, status, visibility, budget_cents) values
  ('f6300000-0000-4000-8000-0000000000a1','f6300000-0000-4000-8000-00000000ca01',
   'P63 deck rebuild','open','open_market', 50000);

-- ===========================================================================
-- Chain 1: worker one bids, then the two sides alternate ten counters each.
-- ===========================================================================
do $chain$
declare
  v_customer constant uuid := 'f6300000-0000-4000-8000-00000000ca01';
  v_worker   constant uuid := 'f6300000-0000-4000-8000-00000000be01';
  v_root uuid;
  v_pending uuid;
  i int;
  v_ok boolean;
  v_c int; v_w int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker, 'role', 'authenticated')::text, true);
  v_root := public.create_offer(p_amount_cents => 40000,
                                p_job_id => 'f6300000-0000-4000-8000-0000000000a1');
  v_pending := v_root;

  for i in 1..10 loop
    -- customer's i-th counter
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_customer, 'role', 'authenticated')::text, true);
    v_pending := public.counter_offer(v_pending, 40000 - i * 100);

    -- worker's i-th counter
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_worker, 'role', 'authenticated')::text, true);
    v_pending := public.counter_offer(v_pending, 40000 + i * 100);
  end loop;

  create temp table t_chain(root uuid, pending uuid) on commit drop;
  insert into t_chain values (v_root, v_pending);

  select count(*) filter (where o.author_id = v_customer),
         count(*) filter (where o.author_id = v_worker)
    into v_c, v_w
    from public.job_offers o
   where o.root_offer_id = v_root and o.parent_offer_id is not null;

  v_ok := v_c = 10 and v_w = 10;
  insert into t_result values (1,'Ten counters per side are accepted',
    'customer 10, worker 10', 'customer=' || v_c || ', worker=' || v_w, v_ok);
exception when others then
  insert into t_result values (1,'Ten counters per side are accepted',
    'customer 10, worker 10', 'ERROR ' || sqlstate || ': ' || sqlerrm, false);
end
$chain$;
grant all on t_chain to authenticated;

-- ---------------------------------------------------------------------------
-- TEST 2 - the ELEVENTH is refused server-side, by the cap.
--          Run as the real `authenticated` role, through the granted RPC.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6300000-0000-4000-8000-00000000ca01","role":"authenticated"}';
do $t2$
declare v_msg text; v_ok boolean; v_after int;
begin
  begin
    perform public.counter_offer(c.pending, 12345) from t_chain c;
    v_msg := 'NO ERROR - the 11th counter was accepted';
  exception when others then
    v_msg := sqlerrm;
  end;
  select count(*) into v_after
    from public.job_offers o, t_chain c
   where o.root_offer_id = c.root
     and o.author_id = 'f6300000-0000-4000-8000-00000000ca01'
     and o.parent_offer_id is not null;

  v_ok := v_msg like 'You have used all 10 counter-offers%' and v_after = 10;
  insert into t_result values (2,'The eleventh counter is refused server-side',
    'cap message naming 10, and the count stays 10',
    v_msg || ' / count after=' || v_after, v_ok);
end
$t2$;
reset role;

-- ---------------------------------------------------------------------------
-- TEST 3 - each side's count is independent: the worker's ten did not consume
--          the customer's ten, and vice versa. Both reached exactly 10 above,
--          which is only possible if the counts do not share an allowance.
-- ---------------------------------------------------------------------------
do $t3$
declare v_total int; v_c int; v_w int; v_ok boolean;
begin
  select count(*) into v_total from public.job_offers o, t_chain c
   where o.root_offer_id = c.root and o.parent_offer_id is not null;
  select count(*) filter (where o.author_id = 'f6300000-0000-4000-8000-00000000ca01'),
         count(*) filter (where o.author_id = 'f6300000-0000-4000-8000-00000000be01')
    into v_c, v_w
    from public.job_offers o, t_chain c
   where o.root_offer_id = c.root and o.parent_offer_id is not null;
  -- 20 counters in one chain, 10 attributable to each author.
  v_ok := v_total = 20 and v_c = 10 and v_w = 10;
  insert into t_result values (3,'The two sides count independently (20 counters in one chain)',
    'total 20 = 10 + 10', 'total=' || v_total || ', customer=' || v_c || ', worker=' || v_w, v_ok);
end
$t3$;

-- ---------------------------------------------------------------------------
-- TEST 4 - a SECOND chain on the SAME job is unaffected: the customer has
--          exhausted their ten against worker one, and still has a full
--          allowance against worker two.
-- ---------------------------------------------------------------------------
do $t4$
declare
  v_customer constant uuid := 'f6300000-0000-4000-8000-00000000ca01';
  v_worker2  constant uuid := 'f6300000-0000-4000-8000-00000000bf01';
  v_root2 uuid; v_next uuid; v_c2 int; v_c1 int; v_ok boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_worker2, 'role', 'authenticated')::text, true);
  v_root2 := public.create_offer(p_amount_cents => 30000,
                                 p_job_id => 'f6300000-0000-4000-8000-0000000000a1');

  -- the customer, capped out on chain 1, counters freely here
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_customer, 'role', 'authenticated')::text, true);
  v_next := public.counter_offer(v_root2, 29000);

  select count(*) into v_c2 from public.job_offers o
   where o.root_offer_id = v_root2 and o.author_id = v_customer
     and o.parent_offer_id is not null;
  select count(*) into v_c1 from public.job_offers o, t_chain c
   where o.root_offer_id = c.root and o.author_id = v_customer
     and o.parent_offer_id is not null;

  v_ok := v_next is not null and v_c2 = 1 and v_c1 = 10;
  insert into t_result values (4,'A second chain on the same job has its own allowance',
    'counter accepted; chain2 count 1 while chain1 stays 10',
    'accepted=' || (v_next is not null) || ', chain2=' || v_c2 || ', chain1=' || v_c1, v_ok);
exception when others then
  insert into t_result values (4,'A second chain on the same job has its own allowance',
    'counter accepted; chain2 count 1 while chain1 stays 10',
    'ERROR ' || sqlstate || ': ' || sqlerrm, false);
end
$t4$;

-- ---------------------------------------------------------------------------
-- TEST 5 - the cap counts COUNTERS only: the chain-opening bid is free.
-- ---------------------------------------------------------------------------
do $t5$
declare v_roots int; v_ok boolean;
begin
  select count(*) into v_roots from public.job_offers o, t_chain c
   where o.root_offer_id = c.root and o.parent_offer_id is null;
  -- exactly one root, and it is excluded from both sides' counts (test 3's
  -- total of 20 counters sits on top of it, in a chain of 21 rows)
  v_ok := v_roots = 1;
  insert into t_result values (5,'The chain-opening bid is not counted as a counter',
    'exactly 1 root row, excluded from the counts', 'roots=' || v_roots, v_ok);
end
$t5$;

-- ---------------------------------------------------------------------------
select seq, case when pass then 'PASS' else 'FAIL' end as result, name, actual
from t_result order by seq;

do $sum$
declare v_fail int; v_total int;
begin
  select count(*) filter (where not pass), count(*) into v_fail, v_total from t_result;
  if v_fail > 0 then
    raise notice '=== phase63 PROOF: %/% FAILED ===', v_fail, v_total;
  else
    raise notice '=== phase63 PROOF: ALL % CHECKS PASSED ===', v_total;
  end if;
end
$sum$;

rollback;
