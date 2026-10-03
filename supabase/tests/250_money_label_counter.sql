-- 250_money_label_counter.sql — FIX-RUN A17's proofs: 20261003000400_money_label_counter.sql proven
-- on the local stack before the pipeline applies it anywhere.
--
-- THE CAST: a customer (Cara) who posts and counters, a worker (Wren) who bids, through the real
-- RPCs (create_job, create_offer, counter_offer) so the trigger fires as the product fires it.
-- Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(6);

select tests.create_user('a17.customer@brazos.test', 'Cara Customer') as customer \gset
select tests.create_user('a17.worker@brazos.test',   'Wren Worker')   as worker   \gset

select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'A17 hang a mirror', p_description := 'probe row, rolled back',
  p_category := 'other', p_location := 'Park Slope', p_budget_cents := 15000
)).id as job \gset
select tests.authenticate_as(:'worker');
select public.create_offer(p_amount_cents := 14000, p_job_id := :'job', p_message := 'a17 bid') as offer \gset

-- ---------------------------------------------------------------------------
-- 1. A whole-dollar counter reads bare — formatBudget()'s rule, through money_label().
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select public.counter_offer(:'offer', 13500) as counter_whole \gset
select tests.clear_auth();
select is(
  (select body from public.notification_outbox where type = 'offer_countered' and recipient_id = :'worker' and data->>'jobId' = :'job' order by created_at desc limit 1),
  'Cara sent you a Counteroffer for $135 — your move.',
  '1a: "$135", never "$135.00" — the feed agrees with every screen'
);
select is(
  (select title from public.notification_outbox where type = 'offer_countered' and recipient_id = :'worker' and data->>'jobId' = :'job' order by created_at desc limit 1),
  'New counter-offer on A17 hang a mirror',
  '1b: the title is unchanged'
);
select is(
  (select data->>'screen' from public.notification_outbox where type = 'offer_countered' and recipient_id = :'worker' and data->>'jobId' = :'job' order by created_at desc limit 1),
  'JobDetail',
  '1c: the worker answers on their own surface, as before'
);

-- ---------------------------------------------------------------------------
-- 2. A counter with cents keeps two decimals.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'worker');
select public.counter_offer(:'counter_whole', 13550) as counter_cents \gset
select tests.clear_auth();
select is(
  (select body from public.notification_outbox where type = 'offer_countered' and recipient_id = :'customer' and data->>'jobId' = :'job' order by created_at desc limit 1),
  'Wren sent you a Counteroffer for $135.50 — your move.',
  '2a: "$135.50" with cents'
);
select is(
  (select data->>'screen' from public.notification_outbox where type = 'offer_countered' and recipient_id = :'customer' and data->>'jobId' = :'job' order by created_at desc limit 1),
  'ClientJobDetail',
  '2b: the customer answers on their job page, as before'
);

-- ---------------------------------------------------------------------------
-- 3. The function is the one money rule's: it reads money_label(), and the old formatter is gone.
-- ---------------------------------------------------------------------------
select ok(
  (select prosrc from pg_proc where oid = 'public.notify_on_offer_counter()'::regprocedure) like '%public.money_label(new.amount_cents)%'
  and (select prosrc from pg_proc where oid = 'public.notify_on_offer_counter()'::regprocedure) not like '%FM999999990.00%',
  '3: notify_on_offer_counter() reads money_label() and carries no second formatter'
);

select * from finish();
rollback;
