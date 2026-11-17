-- 500_account_deletion.sql — production-36h S1, M3 (20261116410000_account_deletion_process.sql), part 1:
-- the deletion check and the money lane's finding. "A customer can delete their account while the rest
-- of a partly refunded payment is still held. The deletion check treats partially_refunded as final for
-- the payer."
--
-- THE LEDGER, READ AT THE TRUNK (448551e). Only apply_payment_event writes partially_refunded: a
-- charge.refunded whose refunded total is below the charge, and it always writes refunded_cents and
-- refund_cents with it. Every refund the app itself asks for is either the whole charge (refund_cents =
-- charge_amount_cents: it ends refunded) or a late-cancellation or no-show fee split, which sets
-- release_requested_at in the same statement (cancel_job_core, resolve_job_dispute). So a stripe row
-- that is partially_refunded with release_requested_at null is a refund made outside the app, and the
-- rest of the charge is held until a person decides who gets it (money M1's refund_outside_app line).
-- Settled for the payer: the rest has a decided way out (release_requested_at) and no refund of it is
-- owed (payment_refund_owed, the money lane's rule; A10-05, section 6: a refund the app asked for has
-- landed, or it failed and was arranged another way). Settled for the payee: the rest has a decided
-- way out and the fee, if any, has left (transfer_ref). A sandbox row finalised in the statement that
-- wrote it and never blocks.
--
-- THE CAST: Cara (the customer, the payer), Wren (the worker, the payee), and the runner — the
-- connection's own role, RLS bypassed — for the fixture rows, which are raw rows walked by raw UPDATE
-- (the proof is about the gate, not the ledger's writers; 030 and 240 prove those). Everything rolls back.
-- Section 5 (A11-08) has its own cast: Dex deletes with pending offers on both sides; Cole, Gus, Ivy
-- and Pia are the customers on the other side, Kai a worker he is not part of. Section 6 (A10-05)
-- gives Cara and Wren seven more raw payment rows on jobs of their own (and the tip's paid-out job
-- payment), with their refund failures.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(27);

select tests.create_user('m3.cara@brazos.test', 'Cara Customer') as cara \gset
select tests.create_user('m3.wren@brazos.test', 'Wren Worker')   as wren \gset

insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cara', 'M3 finished job', :'wren', 'completed') returning id as job \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, status)
values (:'job', :'cara', :'wren', 8000, 800, 600, 'stripe', 'held') returning id as payment \gset

-- ---------------------------------------------------------------------------
-- 1. The finding: part of the charge refunded in Stripe, outside the app; the rest still held.
-- ---------------------------------------------------------------------------
update public.payments
   set status = 'partially_refunded', refund_cents = 3000, refunded_cents = 3000,
       release_requested_at = null, transfer_cents = 0, transfer_ref = null
 where id = :'payment';

select tests.authenticate_as(:'cara');
select is(
  (select row(b.kind, b.ref_id, b.label, b.detail) from public.account_deletion_blockers() b),
  row('payment_outgoing'::text, :'job'::uuid, 'Payment you sent'::text,
      'Part of this payment was refunded, and the rest is still held until support decides who gets it.'::text),
  '1a: the finding: the customer whose charge was refunded in part outside the app, the rest still held, is blocked'
);
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'ACCOUNT_DELETION_BLOCKED',
  '1b: and delete_my_account refuses them with the text the app matches');
select tests.authenticate_as(:'wren');
select is(
  (select row(b.kind, b.label, b.detail) from public.account_deletion_blockers() b),
  row('payment_incoming'::text, 'Payment owed to you'::text,
      'Part of this payment was refunded, and the rest is still held until support decides who gets it.'::text),
  '1c: the worker, who may still be paid that rest, waits with it'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 2. The app's own late-cancellation split, while its refund has landed only in part (a hand refund
--    came first): the customer is still owed money.
-- ---------------------------------------------------------------------------
update public.payments
   set refund_cents = 7000, refunded_cents = 3000, transfer_cents = 1600,
       release_reason = 'cancellation_fee', refund_reason = 'customer_cancelled_late',
       release_requested_at = now(), transfer_ref = null
 where id = :'payment';
select tests.authenticate_as(:'cara');
select is(
  (select row(b.kind, b.detail) from public.account_deletion_blockers() b),
  row('payment_outgoing'::text, 'Part of your refund has not reached your card yet.'::text),
  '2a: the customer whose refund has not fully landed is blocked, with the refund sentence'
);
select tests.authenticate_as(:'wren');
select is(
  (select b.detail from public.account_deletion_blockers() b),
  'The cancellation fee has not reached your payout account yet.',
  '2b: the worker still owed the fee keeps the fee sentence (A14 review, unchanged)'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 3. The controls: a landed late cancellation is final for both, as A14 ruled.
-- ---------------------------------------------------------------------------
update public.payments set refunded_cents = 7000 where id = :'payment';
select tests.authenticate_as(:'cara');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint,
  '3a: the customer whose refund landed, the rest going to the worker, may delete their account');
select tests.authenticate_as(:'wren');
select is((select count(*) from public.account_deletion_blockers()), 1::bigint,
  '3b: the worker waits until the fee has left');
select tests.clear_auth();
update public.payments set transfer_ref = 'tr_m3_fee', released_at = now() where id = :'payment';
select tests.authenticate_as(:'wren');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint,
  '3c: and may delete once transfer.created recorded it');
select tests.clear_auth();
-- A refund outside the app after the release was asked for: the rest already has its way out.
update public.payments set refund_cents = 7000, refunded_cents = 7500 where id = :'payment';
select tests.authenticate_as(:'cara');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint,
  '3d: more refunded than the app asked, after the release was asked for, is final for the customer');
select tests.clear_auth();
-- A sandbox row finalised in the statement that wrote it.
update public.payments
   set provider = 'sandbox', release_requested_at = null, transfer_cents = 0, transfer_ref = null,
       refund_cents = 3000, refunded_cents = null
 where id = :'payment';
select tests.authenticate_as(:'cara');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint,
  '3e: a sandbox partly refunded row never blocks the customer');
select tests.authenticate_as(:'wren');
select is((select count(*) from public.account_deletion_blockers()), 0::bigint,
  '3f: nor the worker');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4. The old app's call shape: the same two functions, the same result shapes, the same grants.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(p.oid::regprocedure::text || ' returns ' || pg_get_function_result(p.oid)
                     || ' / ' || array_to_string(p.proacl, ' '), ' | ' order by p.proname)
     from pg_proc p
    where p.oid in ('public.delete_my_account()'::regprocedure, 'public.account_deletion_blockers()'::regprocedure)),
  'account_deletion_blockers() returns TABLE(kind text, ref_id uuid, label text, detail text) / postgres=X/postgres authenticated=X/postgres'
  || ' | delete_my_account() returns void / postgres=X/postgres authenticated=X/postgres',
  '4a: the old app''s two calls keep their signatures, their result shapes and their grants'
);

-- ---------------------------------------------------------------------------
-- 5. A11-08: at deletion every pending offer the person is part of is settled, on both sides, by the
--    rule ban_user() uses (settle_offers_of_suspended): what Dex sent is withdrawn, what waits on his
--    answer is declined, each with its chain event; an offer past its deadline is left to expire the
--    canonical way; an offer he is not part of is not touched. The other person is told as on a
--    withdraw or a decline: "New message" for a direct offer's event, nothing for a marketplace bid's.
--    Red controls: the trunk's deletion (sent offers only) fails 5b, 5c and 5d; the deletion without
--    the settlement fails 5a.
-- ---------------------------------------------------------------------------
select tests.create_user('m3.dex@brazos.test',  'Dex Worker')    as dex  \gset
select tests.create_user('m3.kai@brazos.test',  'Kai Worker')    as kai  \gset
select tests.create_user('m3.cole@brazos.test', 'Cole Customer') as cole \gset
select tests.create_user('m3.gus@brazos.test',  'Gus Customer')  as gus  \gset
select tests.create_user('m3.pia@brazos.test',  'Pia Customer')  as pia  \gset
select tests.create_user('m3.ivy@brazos.test',  'Ivy Customer')  as ivy  \gset

select tests.authenticate_as(:'cole');
select (public.create_job(p_title := 'M3 cole open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '1 Probe Street')).id as j_cole \gset
select public.create_offer(p_amount_cents := 4100, p_worker_id := :'dex', p_title := 'M3 cole asks dex', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as d_in \gset
select tests.authenticate_as(:'gus');
select public.create_offer(p_amount_cents := 4200, p_worker_id := :'dex', p_title := 'M3 gus asks dex', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as d_gus \gset
select tests.authenticate_as(:'ivy');
select public.create_offer(p_amount_cents := 4300, p_worker_id := :'dex', p_title := 'M3 ivy asks dex', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as d_old \gset
select tests.authenticate_as(:'pia');
select (public.create_job(p_title := 'M3 pia open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '2 Probe Street')).id as j_pia \gset
select tests.authenticate_as(:'dex');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'j_cole', p_message := 'M3 dex bid') as b_out \gset
select public.create_offer(p_amount_cents := 4600, p_job_id := :'j_pia', p_message := 'M3 dex bid to pia') as b_pia \gset
select public.counter_offer(:'d_gus', 4250) as c_out \gset
select tests.authenticate_as(:'kai');
select public.create_offer(p_amount_cents := 4700, p_job_id := :'j_cole', p_message := 'M3 kai bid') as b_kai \gset
select tests.authenticate_as(:'pia');
select public.counter_offer(:'b_pia', 4400) as c_in \gset
select tests.clear_auth();
update public.job_offers set expires_at = now() - interval '1 minute' where id = :'d_old';

create temp table d8 (k text primary key, v uuid);
insert into d8 values ('b_out', :'b_out'), ('c_out', :'c_out'), ('d_in', :'d_in'), ('c_in', :'c_in'),
  ('d_old', :'d_old'), ('b_kai', :'b_kai');
-- Decision 11: two rows that must keep their titles: an alert about a message Pia sent (her counter,
-- a marketplace event with no push of its own; the row is written here, to Gus) and a job_completed
-- row that names Dex but whose key names no job of his; then the titles before.
insert into public.notification_outbox (recipient_id, category, type, title, body, dedupe_key)
select :'gus', 'messages', 'message', 'Pia Customer', 'probe', 'message:' || m.id::text
  from public.messages m
 where m.sender_id = :'pia' and m.request_event = 'countered'
   and not exists (select 1 from public.notification_outbox o where o.dedupe_key = 'message:' || m.id::text);
insert into public.notification_outbox (recipient_id, category, type, title, body, dedupe_key)
values (:'cole', 'jobs', 'job_completed', 'Dex finished the job', 'probe', 'job_completed:' || gen_random_uuid()::text);
-- A14-F F3: Lyn's alert rows of the six title kinds, each tied by its key to a job Dex was hired for
-- or a series he owns or left, and the controls: the same first name on another worker's job (Dex
-- Other), a title under an older name of Dex, a longer full name. Raw rows in the triggers' words.
select tests.create_user('m3.lyn@brazos.test',  'Lyn Customer') as lyn  \gset
select tests.create_user('m3.dexo@brazos.test', 'Dex Other')    as dexo \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'lyn', 'M3 F3 dex job', :'dex', 'completed') returning id as f3_job \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'lyn', 'M3 F3 other job', :'dexo', 'completed') returning id as f3_other \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'dex', 'M3 F3 dex repeat', :'kai', 'completed') returning id as f3_dex_origin \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'lyn', 'M3 F3 lyn repeat', null, 'completed') returning id as f3_lyn_origin \gset
insert into public.job_series (client_id, origin_job_id, cadence, worker_id, status)
values (:'dex', :'f3_dex_origin', 'weekly', :'kai', 'stopped') returning id as f3_stop \gset
insert into public.job_series (client_id, origin_job_id, cadence, dropped_worker_ids)
values (:'lyn', :'f3_lyn_origin', 'weekly', array[:'dex'::uuid]) returning id as f3_drop \gset
insert into public.notification_outbox (recipient_id, category, type, title, body, dedupe_key) values
  (:'lyn', 'jobs', 'hire_accepted', 'Dex accepted your offer', 'f3 tied', 'hire_accepted:' || :'f3_job' || ':' || :'dex'),
  (:'lyn', 'jobs', 'job_completed', 'Dex finished the job', 'f3 tied', 'job_completed:' || :'f3_job'),
  (:'lyn', 'job_updates', 'job_running_late', 'Dex Worker is running 20 min late', 'f3 tied', 'job_running_late:' || :'f3_job' || ':20:1'),
  (:'lyn', 'jobs', 'series_confirm', 'Dex can come Mon 9 AM', 'f3 tied', 'series_confirm:' || :'f3_job'),
  (:'lyn', 'job_updates', 'series_worker_dropped', 'Dex won''t take future visits', 'f3 tied', 'series_worker_dropped:' || :'f3_drop' || ':' || :'dex'),
  (:'kai', 'job_updates', 'series_stopped', 'Dex stopped repeating', 'f3 tied', 'series_stopped:' || :'f3_stop'),
  (:'lyn', 'jobs', 'hire_accepted', 'Dex accepted your offer', 'f3 control', 'hire_accepted:' || :'f3_other' || ':' || :'dexo'),
  (:'lyn', 'jobs', 'job_completed', 'Dex finished the job', 'f3 control', 'job_completed:' || :'f3_other'),
  (:'lyn', 'job_updates', 'job_running_late', 'Dexter Worker is running 10 min late', 'f3 control', 'job_running_late:' || :'f3_job' || ':10:2'),
  (:'lyn', 'job_updates', 'job_running_late', 'Dex Worker Jr is running 30 min late', 'f3 control', 'job_running_late:' || :'f3_job' || ':30:3');
create temp table d11_before as select id, title from public.notification_outbox;
create temp table d8_seen as select id from public.notification_outbox;

select tests.authenticate_as(:'dex');
select lives_ok($$ select public.delete_my_account() $$, '5: Dex, with offers on both sides, deletes his account');
select tests.clear_auth();

-- Each offer's status and the settlement events posted for it (event:sent by Dex).
create temp view d8_state as
select f.k, o.status::text || ' / ' || coalesce((
         select string_agg(m.request_event || ':' || (m.sender_id = :'dex')::text, ',' order by m.created_at)
           from public.messages m
          where m.job_offer_id = o.id and m.request_event in ('withdrawn', 'declined')), 'no event') as s
  from d8 f join public.job_offers o on o.id = f.v;

select is((select string_agg(k || '=' || s, ', ' order by k) from d8_state where k in ('b_out', 'c_out')),
  'b_out=withdrawn / withdrawn:true, c_out=withdrawn / withdrawn:true',
  '5a: what Dex sent (his bid, his counter to a hire request) is withdrawn, each with its chain event, Dex as actor');
select is((select string_agg(k || '=' || s, ', ' order by k) from d8_state where k in ('c_in', 'd_in', 'd_old')),
  'c_in=declined / declined:true, d_in=declined / declined:true, d_old=pending / no event',
  '5b: what waits on Dex''s answer (a hire request, a counter to his bid) is declined, each with its chain event, Dex as actor; the one past its deadline is left to expire');
select is(
  (select string_agg(b.message || '=' || b.status::text, ', ' order by b.message)
     from public.bids b where b.id in (:'b_out', :'b_pia', :'b_kai'))
  || ' | kai offer=' || (select s from d8_state where k = 'b_kai')
  || ' | cole job=' || (select j.status::text from public.jobs j where j.id = :'j_cole'),
  'M3 dex bid=withdrawn, M3 dex bid to pia=rejected, M3 kai bid=pending | kai offer=pending / no event | cole job=open',
  '5c: the bids projection follows both settlements; Kai''s bid on the same job, which Dex is not part of, and Cole''s job are not touched');
select is(
  (select string_agg(p.full_name || ': ' || concat_ws(' | ', n.category, n.type, n.body, n.data ->> 'screen'), ', ' order by p.full_name)
     from public.notification_outbox n join public.profiles p on p.id = n.recipient_id
    where n.id not in (select id from d8_seen)),
  'Cole Customer: messages | message | New message | Chat, Gus Customer: messages | message | New message | Chat',
  '5d: quiet but for the rule''s own push: one "New message" for each direct offer''s event (Cole''s declined request, Dex''s withdrawn counter to Gus); none for a marketplace bid''s');

-- Decision 11 (A11-10): other people's alert rows about a message Dex sent are shown under "Deleted
-- user": the one Gus had before (Dex's counter) and the two the settlement wrote; the body stays. A
-- row about a message Pia sent, a job_completed row naming Dex whose key names no job of his and a
-- bid_received body naming him keep what they say (the written limit, F10). Red control: the
-- deletion without (g) fails 5e.
select is(
  (select string_agg(p.full_name || ': ' || coalesce(b.title, '(new)') || ' -> ' || n.title || ' / ' || n.body,
                     ', ' order by p.full_name, b.title nulls last)
     from public.notification_outbox n
     join public.profiles p on p.id = n.recipient_id
     join public.messages m on n.dedupe_key = 'message:' || m.id::text
     left join d11_before b on b.id = n.id
    where m.sender_id = :'dex'),
  'Cole Customer: (new) -> Deleted user / New message, Gus Customer: Dex Worker -> Deleted user / New message, '
  'Gus Customer: (new) -> Deleted user / New message',
  '5e: decision 11: every alert row about a message Dex sent, older or written by the deletion, has the title Deleted user; the body stays');
select is(
  (select string_agg(n.type || ': ' || n.title || ' / ' || split_part(n.body, ' ·', 1), ', ' order by n.type, n.title, n.body)
     from public.notification_outbox n
    where (n.recipient_id in (:'cole', :'gus', :'pia') and n.type in ('job_completed', 'bid_received'))
       or (n.recipient_id = :'gus' and n.type = 'message' and n.title <> 'Deleted user')),
  'bid_received: New bid on M3 cole open / Dex bid $45, bid_received: New bid on M3 cole open / Kai bid $47, '
  'bid_received: New bid on M3 pia open / Dex bid $46, job_completed: Dex finished the job / probe, message: Pia Customer / probe',
  '5f: the written limit: a row about a message someone else sent, a job_completed title whose key names no job of Dex''s, and a bid_received body that name Dex keep what they say');

-- A14-F F3 (C14-04, (g2)): Lyn's and Kai's rows of the six title kinds tied to Dex by their key now
-- read "Deleted user" where his name was; the rest of each title and the body stay. Red control: the
-- deletion before A14-F leaves the six titles as they were.
select is(
  (select string_agg(n.type || ': ' || n.title || ' / ' || n.body, ', ' order by n.type)
     from public.notification_outbox n where n.body = 'f3 tied'),
  'hire_accepted: Deleted user accepted your offer / f3 tied, job_completed: Deleted user finished the job / f3 tied, '
  'job_running_late: Deleted user is running 20 min late / f3 tied, series_confirm: Deleted user can come Mon 9 AM / f3 tied, '
  'series_stopped: Deleted user stopped repeating / f3 tied, series_worker_dropped: Deleted user won''t take future visits / f3 tied',
  '5g: F3: each of the six kinds, tied to Dex by its key, has "Deleted user" in place of his name; the rest stays');
-- The controls: the same first name on another worker's job (hire_accepted and job_completed of Dex
-- Other), and two rows on Dex's own job whose title is not his name followed by the trigger's words
-- (an older name, a longer one) keep their titles.
select is(
  (select string_agg(n.type || ': ' || n.title, ', ' order by n.type, n.title)
     from public.notification_outbox n where n.body = 'f3 control'),
  'hire_accepted: Dex accepted your offer, job_completed: Dex finished the job, '
  'job_running_late: Dex Worker Jr is running 30 min late, job_running_late: Dexter Worker is running 10 min late',
  '5h: F3: a row about another person with the same first name, and a title that is not exactly Dex''s name and the trigger''s words, keep their titles');

-- ---------------------------------------------------------------------------
-- 6. A10-05 (decision 7): "owed" is the money lane's payment_refund_owed(payments), called, never
--    copied. Raw rows in the end states the ledger's writers leave (499 R5b, R6 and R7b; 426 G13-G15
--    for a held row whose refund failed and was arranged):
--    r   the reader's case: charge 8,600, fee 1,600 transferred, the app's 7,000 refund failed, 3,000
--        refunded through Stripe, the rest arranged another way and recorded (resolve_refund_failure);
--    h   a whole-charge refund (the worker cancelled) failed and was arranged: the row stays held;
--    hq  the same whole-charge refund still queued, not sent;
--    hs  a held fee split whose 7,000 refund failed and was arranged, the fee not sent yet;
--    t   a tip paid to the worker, part refunded by hand in Stripe, its transfer still queued;
--    b   KNOWN LIMIT (7b): a fee split, 3,000 refunded by hand, a second hand refund failed and was
--        arranged, the refund asked never recorded as sent (refund_ref null);
--    bh  KNOWN LIMIT (7b): the same on a held whole-charge refund (499 R7b's shape).
--    Red controls: the trunk's rule (refunded_cents below refund_cents, held always open, the fee
--    sentence) fails 6a, 6b and 6d; a rule that settles every held whole-charge refund fails 6c (hq)
--    and 6e (bh); one that settles every held row with no refund owed fails 6c (hs); one that ends
--    the customer's wait at refund_arranged_at fails 6e (b) and 6f.
-- ---------------------------------------------------------------------------
create temp table d7 (k text primary key, job uuid);
with j as (
  insert into public.jobs (client_id, title, assigned_worker_id, status)
  select :'cara', 'M3 A10-05 ' || k, :'wren', (case when k = 't' then 'completed' else 'cancelled' end)::public.job_status
    from unnest(array['r', 'h', 'hq', 'hs', 't', 'b', 'bh']) k
  returning id, title)
insert into d7 (k, job) select replace(j.title, 'M3 A10-05 ', ''), j.id from j;
-- The tip's job payment (a tip needs one, enforce_tip_ceiling), paid out: it blocks nobody.
insert into public.payments (job_id, payer_id, payee_id, provider, status, amount_cents, platform_fee_cents, customer_fee_cents,
                             release_requested_at, transfer_cents, transfer_ref)
select f.job, :'cara', :'wren', 'stripe', 'paid_out', 8000, 800, 600, now(), 7200, 'tr_m3_d7_t_job'
  from d7 f where f.k = 't';
insert into public.payments (job_id, payer_id, payee_id, kind, provider, status, amount_cents, platform_fee_cents,
                             customer_fee_cents, tax_cents, release_requested_at, transfer_cents, transfer_ref,
                             refund_cents, refunded_cents, refund_ref, refund_arranged_at)
select f.job, :'cara', :'wren', v.kind::public.payment_kind, 'stripe', v.status::public.payment_status, v.amount, v.fee,
       v.charge - v.amount, 0, case when v.asked then now() end, v.transfer, v.transfer_ref,
       v.refund, v.refunded, v.refund_ref, case when v.arranged then now() end
  from d7 f
  join (values
    ('r',  'job_payment', 'partially_refunded', 8000, 800, 8600, true,  1600, 'tr_m3_d7_r', 7000, 3000, 're_m3_d7_r_app',  true),
    ('h',  'job_payment', 'held',               5000, 500, 5375, false, 0,    null,         5375, null, 're_m3_d7_h_app',  true),
    ('hq', 'job_payment', 'held',               5000, 500, 5375, false, 0,    null,         5375, null, null,              false),
    ('hs', 'job_payment', 'held',               8000, 800, 8600, true,  1600, null,         7000, null, 're_m3_d7_hs_app', true),
    ('t',  'tip',         'partially_refunded', 1000, 0,   1000, true,  1000, null,         400,  400,  null,              false),
    ('b',  'job_payment', 'partially_refunded', 8000, 800, 8600, true,  1600, 'tr_m3_d7_b', 7000, 3000, null,              true),
    ('bh', 'job_payment', 'held',               5000, 500, 5375, false, 0,    null,         5375, null, null,              true)
  ) as v(k, kind, status, amount, fee, charge, asked, transfer, transfer_ref, refund, refunded, refund_ref, arranged)
    on v.k = f.k;
insert into public.payment_refund_failures (refund_ref, payment_id, amount_cents, failure_reason, arranged_at, arranged_note)
select v.ref, p.id, v.cents, 'expired_or_canceled_card', now(), v.note
  from (values
    ('r',  're_m3_d7_r_app',   7000, 'Stripe refunded 30.00 by hand; 40.00 went back by bank transfer.'),
    ('h',  're_m3_d7_h_app',   5375, 'Refunded 53.75 by bank transfer.'),
    ('hs', 're_m3_d7_hs_app',  7000, 'Refunded 70.00 by bank transfer.'),
    ('b',  're_m3_d7_b_hand',  4000, 'The 40.00 hand refund went back by bank transfer.'),
    ('bh', 're_m3_d7_bh_hand', 2000, 'The 20.00 hand refund went back by bank transfer.')
  ) as v(k, ref, cents, note)
  join d7 f on f.k = v.k
  join public.payments p on p.job_id = f.job and p.kind = 'job_payment';

-- What one person's deletion check says about the listed rows: 'k=detail, ...', or none. The check
-- runs as that person; the join to d7 runs as the runner.
create function pg_temp.d7_seen(p_user uuid, p_keys text[]) returns text language plpgsql as $$
declare
  v_rows jsonb;
  v_seen text;
begin
  perform tests.authenticate_as(p_user);
  select coalesce(jsonb_agg(jsonb_build_object('ref', b.ref_id, 'detail', b.detail)), '[]'::jsonb) into v_rows
    from public.account_deletion_blockers() b;
  perform tests.clear_auth();
  select coalesce(string_agg(f.k || '=' || (e ->> 'detail'), ', ' order by f.k), 'none') into v_seen
    from pg_temp.d7 f join jsonb_array_elements(v_rows) e on (e ->> 'ref')::uuid = f.job
   where f.k = any (p_keys);
  return v_seen;
end $$;

select is(pg_temp.d7_seen(:'cara', array['r']) || ' | ' || pg_temp.d7_seen(:'wren', array['r']),
  'none | none',
  '6a: A10-05, the reader''s case: the refund failed and was arranged another way, the fee reached the worker: neither side is blocked');
select is(pg_temp.d7_seen(:'cara', array['h']) || ' | ' || pg_temp.d7_seen(:'wren', array['h']),
  'none | none',
  '6b: A10-05: a held row whose whole charge went to a refund that failed and was arranged is settled for both sides');
select is(pg_temp.d7_seen(:'cara', array['hq', 'hs']) || ' | ' || pg_temp.d7_seen(:'wren', array['hq', 'hs']),
  'hq=This payment is being held for a job and has not been released., hs=This payment is being held for a job and has not been released.'
  || ' | hq=This payment is being held for a job and has not been released., hs=This payment is being held for a job and has not been released.',
  '6c: a whole-charge refund still queued, and a held fee split whose refund was arranged with the fee not sent, still block both sides');
select is(pg_temp.d7_seen(:'cara', array['t']) || ' | ' || pg_temp.d7_seen(:'wren', array['t']),
  'none | t=This tip has not reached your payout account yet.',
  '6d: A10-05 (P10): a partly refunded tip whose transfer is queued blocks the worker with the tip sentence, not the fee sentence; the customer, whose refund landed, is not blocked');
select is(pg_temp.d7_seen(:'cara', array['b', 'bh']) || ' | ' || pg_temp.d7_seen(:'wren', array['b', 'bh']),
  'b=Part of your refund has not reached your card yet., bh=This payment is being held for a job and has not been released.'
  || ' | bh=This payment is being held for a job and has not been released.',
  '6e: KNOWN LIMIT (7b): an arranged hand refund on a row with no refund_ref keeps the refund owed, so the deletion stays refused with these words');
-- A refund on the reader's payment fails after the arrangement (499 R6).
insert into public.payment_refund_failures (refund_ref, payment_id, amount_cents, failure_reason)
select 're_m3_d7_r_hand2', p.id, 1000, 'expired_or_canceled_card'
  from public.payments p join d7 f on f.job = p.job_id where f.k = 'r' and p.kind = 'job_payment';
update public.payments p set refund_failed_at = now() from d7 f where f.job = p.job_id and f.k = 'r';
select is(pg_temp.d7_seen(:'cara', array['r']) || ' | ' || pg_temp.d7_seen(:'wren', array['r']),
  'r=Part of your refund has not reached your card yet. | none',
  '6f: A10-05: a refund that fails after the arrangement blocks the customer again (no exemption for an earlier refund_arranged_at)');

select * from finish();
rollback;
