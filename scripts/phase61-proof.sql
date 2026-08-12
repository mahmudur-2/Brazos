-- ===========================================================================
-- PHASE 2 / phase61 Â· proof that a marketplace-bid chain has a real thread
-- identity, end to end.
--
-- STAGING ONLY:
--   psql -v ON_ERROR_STOP=1 -f scripts/phase61-proof.sql -d "$SUPABASE_DB_URL_STAGING"
--
-- Every fixture is disposable and the whole script ends in ROLLBACK, so no
-- staging row survives it. Nothing pre-existing is mutated.
-- ===========================================================================
\pset pager off
\set ON_ERROR_STOP on
begin;

create temp table t_result(seq int, name text, expected text, actual text, pass boolean) on commit drop;
grant all on t_result to authenticated, anon;

-- --- fixtures ---------------------------------------------------------------
do $fx$
declare v_n int;
begin
  select count(*) into v_n from auth.users
   where id in ('f6100000-0000-4000-8000-00000000ca01',
                'f6100000-0000-4000-8000-00000000be01');
  if v_n > 0 then raise exception 'FIXTURE UUID COLLISION - aborting'; end if;
end
$fx$;

insert into auth.users (id, raw_user_meta_data) values
  ('f6100000-0000-4000-8000-00000000ca01', '{"full_name":"P61 Customer"}'::jsonb),
  ('f6100000-0000-4000-8000-00000000be01', '{"full_name":"P61 Worker"}'::jsonb);

-- The job the worker will bid on.
insert into public.jobs (id, client_id, title, status, visibility, budget_cents) values
  ('f6100000-0000-4000-8000-0000000000a1','f6100000-0000-4000-8000-00000000ca01',
   'P61 open job','open','open_market', 20000);

-- A SECOND, already-hired job between the SAME pair, with a chat message, so
-- the grouping assertion has something to group with.
insert into public.jobs (id, client_id, assigned_worker_id, title, status, visibility, budget_cents) values
  ('f6100000-0000-4000-8000-0000000000a2','f6100000-0000-4000-8000-00000000ca01',
   'f6100000-0000-4000-8000-00000000be01','P61 hired job','assigned','open_market', 15000);
insert into public.messages (job_id, sender_id, content) values
  ('f6100000-0000-4000-8000-0000000000a2','f6100000-0000-4000-8000-00000000be01','on my way');

-- ===========================================================================
-- The bid itself goes through the real RPC, as the worker.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6100000-0000-4000-8000-00000000be01","role":"authenticated"}';
do $bid$
declare v_offer uuid;
begin
  v_offer := public.create_offer(p_amount_cents => 18000,
                                 p_job_id => 'f6100000-0000-4000-8000-0000000000a1',
                                 p_message => 'I can do this Thursday');
  create temp table t_offer(id uuid) on commit drop;
  insert into t_offer values (v_offer);
end
$bid$;
reset role;
grant all on t_offer to authenticated, anon;

-- ---------------------------------------------------------------------------
-- TEST 1 - the chain has exactly ONE root message, bound to the pair thread.
-- ---------------------------------------------------------------------------
do $t1$
declare v_cnt int; v_job uuid; v_direct uuid; v_ok boolean; v_expected_thread uuid;
begin
  select count(*) into v_cnt
    from public.messages m join t_offer o on o.id = m.job_offer_id
   where m.request_event = 'created';
  select m.job_id, m.direct_thread_id into v_job, v_direct
    from public.messages m join t_offer o on o.id = m.job_offer_id
   where m.request_event = 'created';
  select t.id into v_expected_thread from public.direct_threads t
   where t.user_a = least('f6100000-0000-4000-8000-00000000ca01'::uuid,'f6100000-0000-4000-8000-00000000be01'::uuid)
     and t.user_b = greatest('f6100000-0000-4000-8000-00000000ca01'::uuid,'f6100000-0000-4000-8000-00000000be01'::uuid);

  v_ok := v_cnt = 1 and v_job is null and v_direct is not null and v_direct = v_expected_thread;
  insert into t_result values (1,'A marketplace bid posts exactly one root message, on the pair thread',
    '1 row, job_id NULL, direct_thread_id = the pair thread',
    'count=' || v_cnt || ', job_id is null=' || (v_job is null)
      || ', direct_thread_id matches pair thread=' || (v_direct = v_expected_thread), v_ok);
end
$t1$;

-- ---------------------------------------------------------------------------
-- TEST 2 - my_pending_offers() now resolves a thread key for the customer.
--          This is the pending-offer pill: the inbox keys `direct:<id>`.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6100000-0000-4000-8000-00000000ca01","role":"authenticated"}';
do $t2$
declare v_thread uuid; v_jobthread uuid; v_cnt int; v_ok boolean;
begin
  select count(*) into v_cnt from public.my_pending_offers() p join t_offer o on o.id = p.id;
  select p.direct_thread_id, p.thread_job_id into v_thread, v_jobthread
    from public.my_pending_offers() p join t_offer o on o.id = p.id;
  v_ok := v_cnt = 1 and v_thread is not null and v_jobthread is null;
  insert into t_result values (2,'Pending-offer pill: my_pending_offers() returns direct:<thread>, not direct:null',
    '1 pending row, direct_thread_id set, thread_job_id NULL',
    'rows=' || v_cnt || ', direct_thread_id set=' || (v_thread is not null)
      || ', thread_job_id null=' || (v_jobthread is null), v_ok);
end
$t2$;

-- ---------------------------------------------------------------------------
-- TEST 3 - the chain produces EXACTLY ONE conversation row, and it groups
--          with the pair's other thread under the same counterparty.
-- ---------------------------------------------------------------------------
do $t3$
declare
  v_direct_rows int; v_pair_rows int; v_others int; v_ok boolean; v_detail text;
  v_thread uuid;
begin
  select m.direct_thread_id into v_thread
    from public.messages m join t_offer o on o.id = m.job_offer_id
   where m.request_event = 'created';

  -- exactly one conversation row for that thread, as seen BY THE CUSTOMER
  -- through the security_invoker view
  select count(*) into v_direct_rows
    from public.conversations c where c.direct_thread_id = v_thread;

  -- both fixture conversations resolve to the same counterparty (the worker)
  select count(*) into v_pair_rows
    from public.conversations c
   where (c.direct_thread_id = v_thread or c.job_id = 'f6100000-0000-4000-8000-0000000000a2')
     and 'f6100000-0000-4000-8000-00000000be01' in (c.client_id, c.assigned_worker_id);

  -- and the direct row carries no job title, which is what makes the inbox
  -- fall through to its 'Direct messages' subtitle
  select count(*) into v_others
    from public.conversations c
   where c.direct_thread_id = v_thread and c.job_title is null;

  v_ok := v_direct_rows = 1 and v_pair_rows = 2 and v_others = 1;
  v_detail := 'conversation rows for the chain=' || v_direct_rows
           || ', rows grouping under the worker=' || v_pair_rows
           || ', direct row with NULL job_title=' || v_others;
  insert into t_result values (3,'One conversation row, grouped under the same counterparty, subtitle resolvable',
    '1 / 2 / 1', v_detail, v_ok);
end
$t3$;
reset role;

-- ---------------------------------------------------------------------------
-- TEST 4 - offer_post_event() now works for marketplace chains: a customer
--          counter posts a `countered` event into the same thread. This is
--          the half of AUD-P1-01 that made the worker's reply surface exist.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"f6100000-0000-4000-8000-00000000ca01","role":"authenticated"}';
do $t4$
declare v_new uuid; v_events int; v_thread uuid; v_ok boolean;
begin
  select m.direct_thread_id into v_thread
    from public.messages m join t_offer o on o.id = m.job_offer_id
   where m.request_event = 'created';

  select public.counter_offer(o.id, 16000) into v_new from t_offer o;

  select count(*) into v_events
    from public.messages m
   where m.direct_thread_id = v_thread and m.request_event = 'countered';

  v_ok := v_new is not null and v_events = 1;
  insert into t_result values (4,'A counter on a marketplace chain posts a thread event (offer_post_event no longer no-ops)',
    'counter created and exactly 1 countered event in the pair thread',
    'counter id set=' || (v_new is not null) || ', countered events=' || v_events, v_ok);
exception when others then
  insert into t_result values (4,'A counter on a marketplace chain posts a thread event (offer_post_event no longer no-ops)',
    'counter created and exactly 1 countered event in the pair thread',
    'ERROR ' || sqlstate || ': ' || sqlerrm, false);
end
$t4$;
reset role;

-- ---------------------------------------------------------------------------
-- TEST 5 - no double-notify: the marketplace chain's messages must NOT also
--          raise generic 'message' notifications (phase61 Â§2 guard).
-- ---------------------------------------------------------------------------
do $t5$
declare v_generic int; v_counter int; v_ok boolean;
begin
  select count(*) into v_generic
    from public.notification_outbox n
   where n.dedupe_key like 'message:%'
     and n.dedupe_key in (
       select 'message:' || m.id::text from public.messages m
        join t_offer o on o.id = m.job_offer_id
     );
  select count(*) into v_counter
    from public.notification_outbox n
   where n.type = 'offer_countered'
     and n.recipient_id = 'f6100000-0000-4000-8000-00000000be01';
  v_ok := v_generic = 0 and v_counter >= 1;
  insert into t_result values (5,'No double-notify: offer-event messages raise no generic "message" row',
    '0 generic message rows for the chain, >=1 offer_countered',
    'generic=' || v_generic || ', offer_countered=' || v_counter, v_ok);
exception when others then
  insert into t_result values (5,'No double-notify: offer-event messages raise no generic "message" row',
    '0 generic message rows for the chain, >=1 offer_countered',
    'ERROR ' || sqlstate || ': ' || sqlerrm, false);
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
    raise notice '=== phase61 PROOF: %/% FAILED ===', v_fail, v_total;
  else
    raise notice '=== phase61 PROOF: ALL % CHECKS PASSED ===', v_total;
  end if;
end
$sum$;

rollback;

