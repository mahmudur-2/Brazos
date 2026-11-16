-- 495_message_hire_quiet.sql — the message_hire_quiet migration (production-36h S4, B2): when the
-- worker says yes to the customer's own offer, the customer gets the hire notice (hire_notice) and
-- not a second "New message" push for the thread's "accepted" card. The card itself is written as
-- before; every other offer event, and chat, keeps its push.
--
-- THE CAST: customer (Hana, message notifications ON, one device), worker (Hugo, one device), and
-- the runner (RLS bypassed: ground truth). Devices are registered through register_push_token, the
-- app's own door. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(10);

select tests.create_user('mq.customer@brazos.test', 'Hana Customer') as customer \gset
select tests.create_user('mq.worker@brazos.test',   'Hugo Worker')   as worker   \gset

select tests.authenticate_as(:'customer');
select public.register_push_token('mq-token-customer', 'ios');
select tests.authenticate_as(:'worker');
select public.register_push_token('mq-token-worker', 'ios');
select tests.clear_auth();

-- The "New message" pushes one offer card made, by the card's offer and event.
create or replace function tests.mq_pushes(p_offer uuid, p_event text, p_recipient uuid) returns bigint language sql as $$
  select count(*) from public.notification_outbox o
    join public.messages m on o.dedupe_key = 'message:' || m.id::text
   where m.job_offer_id = p_offer and m.request_event = p_event
     and o.recipient_id = p_recipient and o.type = 'message'
$$;

-- ---------------------------------------------------------------------------
-- §0. ACCESS: the trigger function keeps no caller grant (restated).
-- ---------------------------------------------------------------------------
select ok((select prosecdef from pg_proc where oid = 'public.notify_on_message()'::regprocedure)
          and not has_function_privilege('anon', 'public.notify_on_message()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.notify_on_message()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.notify_on_message()', 'EXECUTE'),
  '0: notify_on_message is SECURITY DEFINER with no EXECUTE for anon, authenticated or service_role');
select is(public.should_notify(:'customer', :'worker', 'messages'), true,
  '0: control: Hana has messages on and a device, so a "New message" push can reach her');

-- ---------------------------------------------------------------------------
-- §1. A DIRECT OFFER from Hana, accepted by Hugo: the hire notice, and no "New message".
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'customer');
select public.create_offer(p_amount_cents := 5000, p_worker_id := :'worker', p_title := 'MQ fix the fence', p_category := 'other') as o1 \gset
select tests.authenticate_as(:'worker');
select public.accept_offer(:'o1') as j1 \gset
select tests.clear_auth();
select is((select count(*) from public.notification_outbox
            where recipient_id = :'customer' and type = 'hire_accepted' and data ->> 'jobId' = :'j1'::text), 1::bigint,
  '1: Hana gets the hire notice once (hire_notice)');
select is(tests.mq_pushes(:'o1', 'accepted', :'customer'), 0::bigint,
  '1: … and no "New message" push for the "accepted" card: one event, one push');
select is((select count(*) from public.messages where job_offer_id = :'o1' and request_event = 'accepted' and sender_id = :'worker'), 1::bigint,
  '1: the "accepted" card is in the thread as before (sent by Hugo)');
select is((select count(*) from public.message_reads where user_id = :'customer' and job_id = :'j1'), 0::bigint,
  '1: nothing moves Hana''s read marker on the job: the card counts as unread for her, as before');

-- ---------------------------------------------------------------------------
-- §2. CONTROLS: every other offer event keeps its push.
-- ---------------------------------------------------------------------------
-- A second direct offer: Hugo counters (Hana is told), Hana accepts the counter (Hugo is told: the
-- customer did the accepting, so no hire notice covers it).
select tests.authenticate_as(:'customer');
select public.create_offer(p_amount_cents := 6000, p_worker_id := :'worker', p_title := 'MQ paint the shed', p_category := 'other') as o2 \gset
select tests.authenticate_as(:'worker');
select public.counter_offer(:'o2', 6500) as o2c \gset
select tests.authenticate_as(:'customer');
select public.accept_offer(:'o2c') as j2 \gset
select tests.clear_auth();
select is(tests.mq_pushes(:'o2c', 'countered', :'customer'), 1::bigint,
  '2: Hugo''s counter reaches Hana as "New message", as before');
select is(tests.mq_pushes(:'o2c', 'accepted', :'worker'), 1::bigint,
  '2: Hana accepting Hugo''s counter reaches Hugo as "New message", as before');
select is((select count(*) from public.notification_outbox
            where recipient_id = :'customer' and type = 'hire_accepted' and data ->> 'jobId' = :'j2'::text), 0::bigint,
  '2: … and no hire notice to Hana for a hire she made herself');

-- ---------------------------------------------------------------------------
-- §3. ONE CHANGE: the live body plus one block.
-- ---------------------------------------------------------------------------
select ok((select prosrc like '%>>> message_hire_quiet%' and prosrc like '%o.author_id = j.client_id%'
                  and prosrc like '%''message:'' || new.id::text%'
             from pg_proc where oid = 'public.notify_on_message()'::regprocedure),
  '3: notify_on_message carries the message_hire_quiet block, and its push is otherwise as it was');

select * from finish();
rollback;
