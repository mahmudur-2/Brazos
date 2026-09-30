-- 200_hire_from_push.sql — idea 20's proofs: 20260930001200_hire_from_push.sql proven on the local
-- stack before the pipeline applies it anywhere. Nine assertions in four numbered groups; each says
-- what it proves. The saved card itself lives at the provider and is fenced offline
-- (tests/hireFromPush.test.mjs); nothing here touches a payment row's money.
--
-- THE CAST: a customer (Dana), two workers (Sam, Priya), and the runner — the connection's own role,
-- RLS bypassed — for the outbox reads and the service-role call. Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(9);

select tests.create_user('i20.customer@brazos.test', 'Dana Whitfield') as customer \gset
select tests.create_user('i20.sam@brazos.test', 'Sam Okafor') as sam \gset
select tests.create_user('i20.priya@brazos.test', 'Priya Natarajan') as priya \gset

select tests.authenticate_as(:'customer');
select (public.create_job(
  p_title := 'I20 assemble a sofa', p_description := 'probe row, rolled back',
  p_category := 'furniture_assembly', p_location := 'Park Slope', p_budget_cents := 9000
)).id as job \gset
select tests.authenticate_as(:'sam');
select public.create_offer(p_amount_cents := 8000, p_job_id := :'job', p_message := 'i20 bid') as offer_sam \gset
select tests.authenticate_as(:'priya');
select public.create_offer(p_amount_cents := 9000, p_job_id := :'job', p_message := 'i20 bid two') as offer_priya \gset
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 1. The bid's push: the total beside the buttons, and what the buttons need.
-- ---------------------------------------------------------------------------
select is(
  (select body from public.notification_outbox where recipient_id = :'customer' and dedupe_key = 'bid_received:' || :'offer_sam'),
  'Sam Okafor bid $80 · $86 all-in',
  '1a: the customer reads the bid and what they would pay (quote_job_price), since a button''s title cannot carry it'
);
select ok(
  (select data ->> 'offerId' = :'offer_sam' and data ->> 'categoryId' = 'bid_hire'
          and data ->> 'screen' = 'ClientJobDetail' and data ->> 'jobId' = :'job'
   from public.notification_outbox where recipient_id = :'customer' and dedupe_key = 'bid_received:' || :'offer_sam'),
  '1b: the push names the offer to accept (the bid is its root offer) and its button set'
);
select is(
  (select title || ' | ' || body from public.notification_outbox where recipient_id = :'sam' and type = 'bid_competition'),
  'Another bid came in | Someone else bid on I20 assemble a sofa. Your bid is still pending.',
  '1c: the rivals'' push is the baseline''s, word for word'
);

-- ---------------------------------------------------------------------------
-- 2. A declined saved card: the push that opens Checkout.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select public.accept_offer(:'offer_sam') as accepted \gset
select tests.clear_auth();
insert into public.payments (job_id, payer_id, payee_id, amount_cents, customer_fee_cents, platform_fee_cents, provider, status)
values (:'job', :'customer', :'sam', 8000, 600, 600, 'stripe', 'held')
returning id as payment \gset
select public.enqueue_payment_declined(:'payment') as declined \gset
select ok(
  (select title = 'Your card was declined' and category = 'jobs'
          and data ->> 'intent' = 'checkout' and data ->> 'jobId' = :'job' and data ->> 'screen' = 'ClientJobDetail'
   from public.notification_outbox where recipient_id = :'customer' and type = 'payment_declined'),
  '2a: the customer is told, always-on, and the push opens the job''s Checkout'
);
select is(
  (select body from public.notification_outbox where recipient_id = :'customer' and type = 'payment_declined'),
  'I20 assemble a sofa · Tap to pay in Checkout.',
  '2b: in plain words'
);

-- ---------------------------------------------------------------------------
-- 3. The repeat visit's Confirm push names its button set; the trigger is the same one.
-- ---------------------------------------------------------------------------
select ok(
  pg_get_functiondef('public.series_on_visit_change()'::regprocedure) like '%''categoryId'', ''series_confirm''%',
  '3a: the Confirm push carries the series_confirm button set'
);
select has_trigger('public', 'jobs', 'jobs_series_visit', '3b: and jobs_series_visit still fires it');

-- ---------------------------------------------------------------------------
-- 4. The ACLs (CLAUDE.md section Supabase).
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'public.enqueue_payment_declined(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.enqueue_payment_declined(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.enqueue_payment_declined(uuid)', 'EXECUTE'),
  '4a: only the payment function may send the declined push'
);
select ok(
  not has_function_privilege('authenticated', 'public.notify_on_bid()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.notify_on_bid()', 'EXECUTE'),
  '4b: the bid trigger is nobody''s to call'
);

select * from finish();
rollback;
