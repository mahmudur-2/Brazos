-- 498_begin_order.sql — money M2, A9-03 (c): every begun try puts its row behind the rows that waited
-- longer, also a try that never writes back (settlement_send_begin sets updated_at; the queues are
-- oldest last change first in their order). This file reads the queue's rows only: inside one batch
-- the drain fetched, its turn rotates (rowOrder, index.ts), which this file does not run.
--
--   B1  transfers: one payout whose send never answers (begun, no write-back) and three other ready
--       payouts; runs with time for one try each, at the head of transfers_ready: every other row gets
--       its try before the poison row gets a second one. After its tries the poison row is still on the
--       owner's list with the code it had, the same since and overdue, and its 23-hour clock
--       (transfer_sent_at) did not move.
--   B2  the same for refunds (refunds_ready). Its since is updated_at (money_timers): it moves with the
--       begin, as with every landed write-back; the code and the overdue stay. The end of the bound:
--       once the attempt's first begin is past the 23-hour stop, the row is refund_no_answer, overdue,
--       though its last change is a minute old.
--   B3  settlement_send_begin: security definer, its search_path, service_role only.
--   B4  (A12-03 part 2) a refund a person recorded by hand (record_settlement_sent) keeps its
--       confirmation clock: on a fee split, the refund recorded, a day passes, then the fee's payout
--       begins and never writes back: refund_unconfirmed keeps its since and stays overdue. The drain's
--       own write-back keeps the clock its begin set. record_settlement_sent as it was: security
--       definer, its search_path, service_role only.
-- FIXTURE SURGERY, DECLARED: payments.updated_at moved back (now() is fixed in a transaction: each
-- run is a minute after the one before); in B4 refund_sent_at and updated_at moved back together.
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

select tests.create_user('bo.c1@brazos.test', 'Bea Customer') as c1 \gset
select tests.create_user('bo.w1@brazos.test', 'Bo Worker')    as w1 \gset

create or replace function tests.bo_hire(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Begin order probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '6 Queue Lane'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Order bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- A payout asked: funds, starts, completes and approves the job. Returns the payment id.
create or replace function tests.bo_payout(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid := tests.bo_hire(p_title, p_customer, p_worker);
  v_pid uuid;
begin
  v_pid := tests.test_fund_job(v_job);
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform public.transition_job_status(v_job, 'completed', '["https://example.com/bo-done.jpg"]'::jsonb);
  perform tests.authenticate_as(p_customer);
  perform public.release_job_payment(v_job);
  perform tests.clear_auth();
  return v_pid;
end $$;

-- A refund asked: funds the job, then the worker cancels it. Returns the payment id.
create or replace function tests.bo_refund(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid := tests.bo_hire(p_title, p_customer, p_worker);
  v_pid uuid;
begin
  v_pid := tests.test_fund_job(v_job);
  perform tests.authenticate_as(p_worker);
  perform public.cancel_job(v_job, 'worker_cancelled');
  perform tests.clear_auth();
  return v_pid;
end $$;

-- p_n runs, each with time for one try: the head of the queue the drain reads. The poison row
-- (p_ids[1]) is begun and never writes back (its send never answers and the run ends); every other
-- row's try writes back (no answer, the same key next run). Returns the names in the order tried.
create or replace function tests.bo_runs(p_kind text, p_ids uuid[], p_names text[], p_n integer) returns text language plpgsql as $$
declare
  v_head uuid;
  v_attempt integer;
  v_cents integer;
  v_order text[] := '{}';
begin
  for i in 1..p_n loop
    if p_kind = 'transfer' then
      select r.id, r.transfer_attempts, r.transfer_cents into v_head, v_attempt, v_cents from public.transfers_ready r limit 1;
    else
      select r.id, r.refund_attempts, r.refund_cents into v_head, v_attempt, v_cents from public.refunds_ready r limit 1;
    end if;
    v_order := v_order || coalesce(p_names[array_position(p_ids, v_head)], '?');
    if not public.settlement_send_begin(v_head, p_kind, v_attempt, v_cents) then
      raise exception 'bo_runs: the begin refused %', v_head;
    end if;
    if v_head is distinct from p_ids[1] then
      perform public.record_settlement_result(v_head, p_kind, v_attempt, 'same_key', p_kind || ': no answer (BO probe)');
    end if;
    -- SURGERY: the next run is a minute later.
    update public.payments set updated_at = updated_at - interval '1 minute' where id = any (p_ids);
  end loop;
  return array_to_string(v_order, ',');
end $$;

-- The poison row's line: code, since, overdue.
create or replace function tests.bo_line(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || a.since::text || '/' || a.overdue::text, ',' order by a.code), '<none>')
    from public.payment_attention a where a.payment_id = p_pid
$$;
create or replace function tests.bo_code(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || a.overdue::text, ',' order by a.code), '<none>')
    from public.payment_attention a where a.payment_id = p_pid
$$;

-- ---------------------------------------------------------------------------
-- B1. Transfers.
-- ---------------------------------------------------------------------------
select tests.bo_payout('BO-B1 poison', :'c1', :'w1') as tp \gset
select tests.bo_payout('BO-B1 a', :'c1', :'w1') as ta \gset
select tests.bo_payout('BO-B1 b', :'c1', :'w1') as tb \gset
select tests.bo_payout('BO-B1 c', :'c1', :'w1') as tc \gset
-- The poison row was tried once before, and that try wrote back (no answer): it is on the list.
select public.settlement_send_begin(:'tp', 'transfer', 0, (select transfer_cents from public.payments where id = :'tp'));
select public.record_settlement_result(:'tp', 'transfer', 0, 'same_key', 'transfer: no answer (BO probe)');
-- SURGERY: the last changes, oldest first: the poison row, then a, b, c.
update public.payments set updated_at = now() - interval '4 hours' where id = :'tp';
update public.payments set updated_at = now() - interval '3 hours' where id = :'ta';
update public.payments set updated_at = now() - interval '2 hours' where id = :'tb';
update public.payments set updated_at = now() - interval '1 hour'  where id = :'tc';
select is((select count(*)::integer from public.transfers_ready), 4, 'B1a: the four payouts are the transfer queue');
select tests.bo_line(:'tp') as tp_line \gset
select transfer_sent_at as tp_sent from public.payments where id = :'tp' \gset
select is(tests.bo_code(:'tp'), 'transfer_retrying/false', 'B1b: before its tries the poison row is listed: transfer_retrying, not overdue');
select is(tests.bo_runs('transfer', array[:'tp', :'ta', :'tb', :'tc']::uuid[], array['poison', 'a', 'b', 'c'], 5),
  'poison,a,b,c,poison', 'B1c: every other payout gets its try before the poison row gets a second one');
select is(tests.bo_line(:'tp'), :'tp_line', 'B1d: after its tries the poison row has the same line: the same code, since and overdue');
select is((select transfer_sent_at from public.payments where id = :'tp'), :'tp_sent'::timestamptz,
  'B1e: its 23-hour clock (transfer_sent_at, the attempt''s first begin) did not move');

-- ---------------------------------------------------------------------------
-- B2. Refunds.
-- ---------------------------------------------------------------------------
select tests.bo_refund('BO-B2 poison', :'c1', :'w1') as rp \gset
select tests.bo_refund('BO-B2 a', :'c1', :'w1') as ra \gset
select tests.bo_refund('BO-B2 b', :'c1', :'w1') as rb \gset
select tests.bo_refund('BO-B2 c', :'c1', :'w1') as rc \gset
select public.settlement_send_begin(:'rp', 'refund', 0, (select refund_cents from public.payments where id = :'rp'));
select public.record_settlement_result(:'rp', 'refund', 0, 'same_key', 'refund: no answer (BO probe)');
update public.payments set updated_at = now() - interval '4 hours' where id = :'rp';
update public.payments set updated_at = now() - interval '3 hours' where id = :'ra';
update public.payments set updated_at = now() - interval '2 hours' where id = :'rb';
update public.payments set updated_at = now() - interval '1 hour'  where id = :'rc';
select is((select count(*)::integer from public.refunds_ready), 4, 'B2a: the four refunds are the refund queue');
select refund_sent_at as rp_sent from public.payments where id = :'rp' \gset
select is(tests.bo_code(:'rp'), 'refund_retrying/false', 'B2b: before its tries the poison row is listed: refund_retrying, not overdue');
select is(tests.bo_runs('refund', array[:'rp', :'ra', :'rb', :'rc']::uuid[], array['poison', 'a', 'b', 'c'], 5),
  'poison,a,b,c,poison', 'B2c: every other refund gets its try before the poison row gets a second one');
select is(tests.bo_code(:'rp'), 'refund_retrying/false', 'B2d: after its tries the poison row has the same code and overdue (its since is its last change)');
select is((select refund_sent_at from public.payments where id = :'rp'), :'rp_sent'::timestamptz,
  'B2e: its 23-hour clock (refund_sent_at, the attempt''s first begin) did not move');
-- SURGERY: the attempt's first begin 24 hours back; its last begin stays one run (a minute) back.
update public.payments set refund_sent_at = now() - interval '24 hours' where id = :'rp';
select is((select (now() - p.updated_at)::text from public.payments p where p.id = :'rp') || ' ' || tests.bo_code(:'rp'),
  '00:01:00 refund_no_answer/true',
  'B2f: the end of the bound: past the 23-hour stop the row is refund_no_answer, overdue, though its last change is a minute old');

-- ---------------------------------------------------------------------------
-- B3. The function as it was: security definer, its search_path, service_role only.
-- ---------------------------------------------------------------------------
select is((select p.prosecdef::text || '/' || array_to_string(p.proconfig, ';')
             || '/' || has_function_privilege('service_role', p.oid, 'execute')::text
             || '/' || has_function_privilege('authenticated', p.oid, 'execute')::text
             || '/' || has_function_privilege('anon', p.oid, 'execute')::text
             from pg_proc p where p.oid = 'public.settlement_send_begin(uuid, text, integer, integer)'::regprocedure),
  'true/search_path=public, pg_temp/true/false/false', 'B3: security definer, search_path public, pg_temp, service_role only');

-- ---------------------------------------------------------------------------
-- B4. A12-03 part 2: a refund recorded by hand keeps its confirmation clock.
-- ---------------------------------------------------------------------------
-- A fee split: the worker started, the customer cancelled: the fee's payout and the rest's refund
-- are both asked.
create or replace function tests.bo_fee_split(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid := tests.bo_hire(p_title, p_customer, p_worker);
  v_pid uuid;
begin
  v_pid := tests.test_fund_job(v_job);
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform tests.authenticate_as(p_customer);
  perform public.cancel_job(v_job, 'customer_cancelled');
  perform tests.clear_auth();
  return v_pid;
end $$;
create or replace function tests.bo_unconfirmed(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || (now() - a.since)::text || '/' || a.overdue::text, ',' order by a.code), '<none>')
    from public.payment_attention a where a.payment_id = p_pid and a.code = 'refund_unconfirmed'
$$;

select tests.bo_fee_split('BO-B4 hand', :'c1', :'w1') as hp \gset
select transfer_attempts as hpa, transfer_cents as hpt, refund_cents as hpr from public.payments where id = :'hp' \gset
-- The refund was found in Stripe and recorded by hand; the drain never began it.
select is(public.record_settlement_sent(:'hp', 'refund', 're_bo4_hand', :hpr::integer)::text
          || '/' || (select (refund_sent_attempt is null)::text from public.payments where id = :'hp'),
  'true/true', 'B4a: a refund recorded by hand, never begun by the drain');
-- SURGERY: a day and an hour pass (the refund's clock and the row's last change, together).
update public.payments set refund_sent_at = refund_sent_at - interval '25 hours', updated_at = updated_at - interval '25 hours'
 where id = :'hp';
select is(tests.bo_unconfirmed(:'hp'), 'refund_unconfirmed/1 day 01:00:00/true', 'B4b: not confirmed for a day: refund_unconfirmed, overdue');
select is(public.settlement_send_begin(:'hp', 'transfer', :hpa::integer, :hpt::integer), true,
  'B4c: the fee''s payout begins, and its send never writes back');
select is(tests.bo_unconfirmed(:'hp'), 'refund_unconfirmed/1 day 01:00:00/true',
  'B4d: the begin of the payout does not move the refund''s clock: the same since, still overdue (was since = the begin, not overdue)');

-- The drain's own write-back: the clock its begin set is kept.
select tests.bo_refund('BO-B4 drain', :'c1', :'w1') as dp \gset
select refund_cents as dpr from public.payments where id = :'dp' \gset
select public.settlement_send_begin(:'dp', 'refund', 0, :dpr::integer);
-- SURGERY: the begin was two hours ago.
update public.payments set refund_sent_at = now() - interval '2 hours' where id = :'dp';
select public.record_settlement_sent(:'dp', 'refund', 're_bo4_drain', :dpr::integer);
select is((select (now() - refund_sent_at)::text || '/' || (refund_ref = 're_bo4_drain')::text
             || '/' || has_function_privilege('service_role', 'public.record_settlement_sent(uuid, text, text, integer)', 'execute')::text
             || '/' || has_function_privilege('authenticated', 'public.record_settlement_sent(uuid, text, text, integer)', 'execute')::text
             || '/' || has_function_privilege('anon', 'public.record_settlement_sent(uuid, text, text, integer)', 'execute')::text
             || '/' || (select p.prosecdef::text || '/' || array_to_string(p.proconfig, ';') from pg_proc p
                          where p.oid = 'public.record_settlement_sent(uuid, text, text, integer)'::regprocedure)
             from public.payments where id = :'dp'),
  '02:00:00/true/true/false/false/true/search_path=public, pg_temp',
  'B4e: the drain''s write-back keeps the clock its begin set; record_settlement_sent: security definer, search_path public, pg_temp, service_role only');

select * from finish();
rollback;
