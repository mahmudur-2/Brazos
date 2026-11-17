-- 472_ban_switch.sql — production-36h S1, M2: ban_switch (S4-01, S4-08, S4-10, P2-8, B1) proven on
-- the local stack; A8-01 (Terms section 12): a ban cancels every unfinished job of the account
-- through cancel_job_core()'s account_suspended mode, and the money keeps its rule.
--
-- THE CAST: two admins; a customer (Bea) and a worker (Wes) who are each banned; the people on the
-- other side of their business (Wyn, Win, Wil, Wim, Cal, Cora); a customer who deletes her account
-- (Dee) with her bidder and her direct-offer worker; and the runner (the connection's own role, RLS
-- bypassed) for the fixture rows and the ground truth. Everything rolls back; no commit.
--
-- THE A8-01 TABLE, one case per row: (a) the customer's open job: cancelled, no notice (nobody else
-- is on it); (b) the customer's hired job: cancelled, an undirected held payment refunded in full,
-- no fee, reason account_suspended, the worker told; (c) the customer's started job: cancelled, the
-- held payment left undirected for the operator (its job_closed_money_held line dated from the
-- cancellation: N1), the worker told; (d) the worker's hired or started job: cancelled, the money
-- by the same rule, the customer told in the words of the payment state; (e) a done job: untouched.
-- A payment that already has a direction keeps it: one case per such state in §5.
--
-- FIXTURE SURGERY, DECLARED: the hired jobs and their payments are raw rows by the runner, in the
-- shapes the product reaches through accept_offer + checkout (030_payments.sql proves those
-- writers) and the payment events (a card dispute, a late charge on a voided row, a release, a
-- refund); every open job, bid and direct offer is made through the client calls. The four
-- "controls" in §2 are the same moves made the normal way (cancel_job, withdraw_offer,
-- decline_offer), so §3, §5 and §8 can prove the other person is told exactly as on a normal
-- withdraw or decline. The sweep runs on the runner's clock.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(71);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;
create temp table seen (id uuid primary key);
grant select on seen to anon, authenticated, service_role;

select tests.create_user('bs.admin@brazos.test',  'Ada Admin')   as admin  \gset
select tests.create_user('bs.admin2@brazos.test', 'Abe Admin')   as admin2 \gset
select tests.create_user('bs.bea@brazos.test',    'Bea Banned')  as cust   \gset
select tests.create_user('bs.wes@brazos.test',    'Wes Banned')  as wk     \gset
select tests.create_user('bs.wyn@brazos.test',    'Wyn Worker')  as w1     \gset
select tests.create_user('bs.win@brazos.test',    'Win Worker')  as w2     \gset
select tests.create_user('bs.wil@brazos.test',    'Wil Worker')  as w3     \gset
select tests.create_user('bs.wim@brazos.test',    'Wim Worker')  as w4     \gset
select tests.create_user('bs.wex@brazos.test',    'Wex Worker')  as w5     \gset
select tests.create_user('bs.cal@brazos.test',    'Cal Client')  as c2     \gset
select tests.create_user('bs.dee@brazos.test',    'Dee Deleter') as del    \gset
select tests.create_user('bs.wo@brazos.test',     'Wo Worker')   as w6     \gset
select tests.create_user('bs.wu@brazos.test',     'Wu Worker')   as w7     \gset
update public.profiles set is_admin = true where id in (:'admin', :'admin2');
insert into fx values ('admin', :'admin'), ('admin2', :'admin2'), ('cust', :'cust'), ('wk', :'wk'),
  ('w1', :'w1'), ('w2', :'w2'), ('w3', :'w3'), ('w4', :'w4'), ('w5', :'w5'), ('c2', :'c2'),
  ('del', :'del'), ('w6', :'w6'), ('w7', :'w7');

-- B1: Bea signs in with one phone and typed another into her profile (fictional 555-01xx numbers).
update auth.users set phone = '15550107171' where id = :'cust';
update public.profiles set phone = '+15550107272' where id = :'cust';
insert into public.push_tokens (user_id, token, platform, active)
values (:'cust', 'ExponentPushToken[bs-bea]', 'ios', true), (:'w1', 'ExponentPushToken[bs-wyn]', 'ios', true);

-- Bea's jobs as customer, hired by Wyn (raw rows, declared above).
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cust', 'BS bea free', :'w1', 'assigned') returning id as ja_free \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'ja_free', :'cust', :'w1', 5000, 500, 375, 'stripe', 'pi_bs_free', 'held') returning id as pa_free \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, scheduled_date)
values (:'cust', 'BS bea late', :'w1', 'assigned', ((now() at time zone 'America/New_York')::date + 1)) returning id as ja_late \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'ja_late', :'cust', :'w1', 8000, 800, 600, 'stripe', 'pi_bs_late', 'held') returning id as pa_late \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cust', 'BS bea unfunded', :'w1', 'assigned') returning id as ja_unf \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'ja_unf', :'cust', :'w1', 4000, 400, 'stripe', 'unfunded') returning id as pa_unf \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cust', 'BS bea pending', :'w1', 'assigned') returning id as ja_pend \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status)
values (:'ja_pend', :'cust', :'w1', 4200, 420, 'stripe', 'pi_bs_pend', 'pending') returning id as pa_pend \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cust', 'BS bea started', :'w1', 'in_progress') returning id as ja_start \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status, held_at)
values (:'ja_start', :'cust', :'w1', 9000, 900, 675, 'stripe', 'pi_bs_start', 'held', now() - interval '2 days') returning id as pa_start \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'cust', 'BS bea done', :'w1', 'completed', now() - interval '1 day') returning id as ja_done \gset

-- Wes's jobs as worker, for Cal.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes hired', :'wk', 'assigned') returning id as jb_asg \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'jb_asg', :'c2', :'wk', 6000, 600, 450, 'stripe', 'pi_bs_wasg', 'held') returning id as pb_asg \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes started', :'wk', 'in_progress') returning id as jb_start \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status)
values (:'jb_start', :'c2', :'wk', 7000, 700, 525, 'stripe', 'pi_bs_wstart', 'held') returning id as pb_start \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes pending', :'wk', 'assigned') returning id as jb_pend \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status)
values (:'jb_pend', :'c2', :'wk', 4400, 440, 'stripe', 'pi_bs_wpend', 'pending') returning id as pb_pend \gset
-- A8-01 (d): Wes's other hired jobs for Cal, one per payment state the table names.
-- A card dispute open on an undirected held payment.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes dispute', :'wk', 'assigned') returning id as jb_disp \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status, chargeback_at)
values (:'jb_disp', :'c2', :'wk', 5200, 520, 390, 'stripe', 'pi_bs_wdisp', 'held', now() - interval '1 hour') returning id as pb_disp \gset
-- Not paid yet: a checkout never finished, and a checkout that failed (no live row).
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes unfunded', :'wk', 'assigned') returning id as jb_unf \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, status)
values (:'jb_unf', :'c2', :'wk', 3900, 390, 'stripe', 'unfunded') returning id as pb_unf \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes failed', :'wk', 'assigned') returning id as jb_fail \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status)
values (:'jb_fail', :'c2', :'wk', 3800, 380, 'stripe', 'pi_bs_wfail', 'failed') returning id as pb_fail \gset
-- A voided row a late charge came through on: its refund is already queued (funded_after_void).
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes late charge', :'wk', 'assigned') returning id as jb_lvoid \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, provider, provider_ref, status,
                             received_cents, refund_cents, refund_reason)
values (:'jb_lvoid', :'c2', :'wk', 3700, 370, 'stripe', 'pi_bs_wlvoid', 'voided', 3700, 3700, 'funded_after_void') returning id as pb_lvoid \gset
-- A payment that already has a direction, one per state.
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes release asked', :'wk', 'assigned') returning id as jb_rq \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             release_requested_at, transfer_cents, release_reason)
values (:'jb_rq', :'c2', :'wk', 4500, 450, 300, 'stripe', 'pi_bs_wrq', 'held', now() - interval '1 hour', 4050, 'approved') returning id as pb_rq \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes refund queued', :'wk', 'assigned') returning id as jb_rf \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             refund_cents, refund_reason)
values (:'jb_rf', :'c2', :'wk', 4600, 460, 300, 'stripe', 'pi_bs_wrf', 'held', 1000, 'dispute_refund') returning id as pb_rf \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes fee set', :'wk', 'assigned') returning id as jb_tx \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             transfer_cents, release_reason)
values (:'jb_tx', :'c2', :'wk', 4700, 470, 300, 'stripe', 'pi_bs_wtx', 'held', 500, 'cancellation_fee') returning id as pb_tx \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes released', :'wk', 'assigned') returning id as jb_rel \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             release_requested_at, transfer_cents, release_reason, released_at)
values (:'jb_rel', :'c2', :'wk', 4800, 480, 300, 'stripe', 'pi_bs_wrel', 'released', now() - interval '2 hours', 4320, 'approved', now() - interval '1 hour') returning id as pb_rel \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes paid out', :'wk', 'assigned') returning id as jb_po \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             release_requested_at, transfer_cents, release_reason, released_at)
values (:'jb_po', :'c2', :'wk', 4900, 490, 300, 'stripe', 'pi_bs_wpo', 'paid_out', now() - interval '2 hours', 4410, 'approved', now() - interval '1 hour') returning id as pb_po \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes refunded', :'wk', 'assigned') returning id as jb_rfd \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             refund_cents, refunded_cents, refund_reason)
values (:'jb_rfd', :'c2', :'wk', 5100, 510, 300, 'stripe', 'pi_bs_wrfd', 'refunded', 5400, 5400, 'worker_cancelled') returning id as pb_rfd \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'c2', 'BS wes part refunded', :'wk', 'assigned') returning id as jb_prf \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             refund_cents, refunded_cents, refund_reason)
values (:'jb_prf', :'c2', :'wk', 5300, 530, 300, 'stripe', 'pi_bs_wprf', 'partially_refunded', 1000, 1000, 'dispute_refund') returning id as pb_prf \gset

-- The A8-01 notice bodies, word for word (the DIRECTOR's table).
\set nb_neutral 'Brazos cancelled this job. Open it to see what happens with the payment.'
\set nb_full 'Brazos cancelled this job. Your payment is being refunded in full.'
\set nb_unpaid 'Brazos cancelled this job. It was not paid for yet.'
\set nb_dispute 'Brazos cancelled this job. Your bank is reviewing this payment. Your refund waits for the bank''s decision.'

-- Open jobs, bids and direct offers, through the client calls.
select tests.authenticate_as(:'cust');
select (public.create_job(p_title := 'BS bea open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '1 Probe Street')).id as ja_open \gset
select (public.create_job(p_title := 'BS bea open control', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '2 Probe Street')).id as ja_ctrl \gset
select public.create_offer(p_amount_cents := 4100, p_worker_id := :'w2', p_title := 'BS bea direct', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as d1 \gset
select public.create_offer(p_amount_cents := 4100, p_worker_id := :'w3', p_title := 'BS bea direct control', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as d0 \gset
select tests.authenticate_as(:'c2');
select (public.create_job(p_title := 'BS cal open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '3 Probe Street')).id as jb_open \gset
select (public.create_job(p_title := 'BS cal open control', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '4 Probe Street')).id as jb_ctrl \gset
select public.create_offer(p_amount_cents := 4300, p_worker_id := :'wk', p_title := 'BS cal direct to wes', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as d2 \gset
select public.create_offer(p_amount_cents := 4300, p_worker_id := :'w4', p_title := 'BS cal direct control', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as d3 \gset
select tests.authenticate_as(:'w1');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'ja_open', p_message := 'BS wyn bid') as b1 \gset
select tests.authenticate_as(:'w5');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'ja_ctrl', p_message := 'BS wex bid control') as b0 \gset
select public.create_offer(p_amount_cents := 4600, p_job_id := :'jb_ctrl', p_message := 'BS wex bid control 2') as b5 \gset
select tests.authenticate_as(:'wk');
select public.create_offer(p_amount_cents := 4600, p_job_id := :'jb_open', p_message := 'BS wes bid') as b2 \gset
select tests.clear_auth();
insert into fx values ('ja_open', :'ja_open'), ('ja_ctrl', :'ja_ctrl'), ('ja_start', :'ja_start'), ('d0', :'d0'),
  ('d3', :'d3'), ('b5', :'b5');

-- A report on Bea, which the ban will action.
insert into public.reports (reporter_id, reported_id, reason, description, status)
values (:'w1', :'cust', 'scam', 'probe report, rolled back', 'open') returning id as r1 \gset
insert into fx values ('r1', :'r1');

-- ---------------------------------------------------------------------------
-- 1. S4-10: refused before anything moves.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'w1');
select throws_ok($$ select public.ban_user((select v from fx where k = 'cust')) $$,
  'P0001', 'Only admins may ban users', '1a: a person who is not an admin cannot ban (guard)');
select tests.authenticate_as(:'admin');
select throws_ok($$ select public.ban_user((select v from fx where k = 'admin')) $$,
  'P0001', 'An admin account cannot be banned in the app.', '1b: S4-10: an admin cannot ban their own account');
select throws_ok($$ select public.ban_user((select v from fx where k = 'admin2')) $$,
  'P0001', 'An admin account cannot be banned in the app.', '1c: S4-10: an admin cannot ban another admin account');
select tests.clear_auth();
select is((select count(*) from public.profiles where id in (:'admin', :'admin2') and coalesce(banned, false)), 0::bigint,
  '1d: S4-10: neither admin account is banned');
select throws_ok(format($$ select public.cancel_job_core(%L, 'customer_cancelled', null) $$, :'ja_ctrl'),
  'P0001', 'Active authentication required',
  '1e: S4-01: the cancel core refuses a null actor (only the runner can reach it; no client and no service role may call it)');
select tests.authenticate_as(:'cust');
select throws_ok($$ select public.cancel_job((select v from fx where k = 'ja_ctrl'), 'account_suspended') $$,
  'P0001', 'Unknown cancellation reason',
  '1f: A8-01: a caller cannot pass the ban''s own reason: cancel_job() refuses account_suspended before the core');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 2. The controls: the same moves, made the normal way.
-- ---------------------------------------------------------------------------
select tests.clear_auth();
insert into seen select id from public.notification_outbox;
select tests.authenticate_as(:'cust');
select lives_ok($$ select public.cancel_job((select v from fx where k = 'ja_ctrl'), 'customer_cancelled') $$,
  '2a: control: Bea cancels her own open job the normal way (guard)');
select lives_ok($$ select public.withdraw_offer((select v from fx where k = 'd0')) $$,
  '2b: control: Bea withdraws a direct offer the normal way (guard)');
select tests.authenticate_as(:'w4');
select lives_ok($$ select public.decline_offer((select v from fx where k = 'd3')) $$,
  '2c: control: Wim declines Cal''s direct offer the normal way (guard)');
select tests.authenticate_as(:'w5');
select lives_ok($$ select public.withdraw_offer((select v from fx where k = 'b5')) $$,
  '2d: control: Wex withdraws his bid on Cal''s open job the normal way (guard)');
select tests.clear_auth();

-- What each control told the other person: every outbox row it made for them (none, for a bid).
create temp table ctl (k text primary key, s text);
insert into ctl values
  ('b0', (select o.status::text from public.job_offers o where o.id = :'b0') || ' / ' || coalesce((
     select string_agg(n.type, ',' order by n.type) from public.notification_outbox n
     where n.id not in (select id from seen) and n.recipient_id = :'w5' and n.data ->> 'jobId' = :'ja_ctrl'), 'no row')),
  ('b5', (select o.status::text from public.job_offers o where o.id = :'b5') || ' / ' || coalesce((
     select string_agg(n.type, ',' order by n.type) from public.notification_outbox n
     where n.id not in (select id from seen) and n.recipient_id = :'c2' and n.data ->> 'jobId' = :'jb_ctrl'), 'no row')),
  ('d0', (select concat_ws(' | ', o.status::text, n.category, n.type, n.title, n.body, n.data ->> 'screen')
          from public.job_offers o
          join public.messages m on m.job_offer_id = o.id and m.request_event = 'withdrawn'
          join public.notification_outbox n on n.dedupe_key = 'message:' || m.id::text and n.recipient_id = :'w3'
          where o.id = :'d0')),
  ('d3', (select concat_ws(' | ', o.status::text, n.category, n.type, n.title = 'Wim Worker', n.body, n.data ->> 'screen')
          from public.job_offers o
          join public.messages m on m.job_offer_id = o.id and m.request_event = 'declined'
          join public.notification_outbox n on n.dedupe_key = 'message:' || m.id::text and n.recipient_id = :'c2'
          where o.id = :'d3'));

-- ---------------------------------------------------------------------------
-- 3. The admin bans Bea, the customer.
-- ---------------------------------------------------------------------------
truncate seen;
insert into seen select id from public.notification_outbox;
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'cust'), (select v from fx where k = 'r1')) $$,
  '3a: the admin bans Bea, from the report (guard)');
select tests.clear_auth();
select is(
  (select string_agg(j.title || '=' || j.status::text, ', ' order by j.title) from public.jobs j
    where j.id in (:'ja_free', :'ja_late', :'ja_unf', :'ja_pend', :'ja_start', :'ja_done', :'ja_open')),
  'BS bea done=completed, BS bea free=cancelled, BS bea late=cancelled, BS bea open=cancelled, BS bea pending=cancelled, BS bea started=cancelled, BS bea unfunded=cancelled',
  '3b: A8-01: every unfinished job of Bea''s is cancelled, the started one and the one with a pending payment too; a done job is untouched (row e)'
);
select is(
  (select string_agg(j.title || '=' || (j.cancelled_at = now())::text || '/' || coalesce(j.cancelled_by::text, 'null')
                     || '/' || coalesce(j.cancel_reason, 'null'), ', ' order by j.title)
     from public.jobs j where j.id in (:'ja_free', :'ja_late', :'ja_unf', :'ja_pend', :'ja_start', :'ja_open')),
  'BS bea free=true/null/null, BS bea late=true/null/null, BS bea open=true/null/null, BS bea pending=true/null/null, BS bea started=true/null/null, BS bea unfunded=true/null/null',
  '3b2: A8-01: closed by Brazos: each is stamped cancelled_at, with cancelled_by and cancel_reason null'
);
select is(
  (select row(p.refund_cents, p.transfer_cents, p.release_reason, p.refund_reason, p.status::text) from public.payments p where p.id = :'pa_free'),
  row(5375, 0, null::text, 'account_suspended'::text, 'held'::text),
  '3c: A8-01 (b): a hired job''s undirected held payment is refunded in full, reason account_suspended'
);
select is(
  (select row(p.refund_cents, p.transfer_cents, p.release_reason, p.refund_reason, p.status::text) from public.payments p where p.id = :'pa_late'),
  row(8600, 0, null::text, 'account_suspended'::text, 'held'::text),
  '3d: A8-01 (b): due tomorrow too: the whole charge refunded, no cancellation fee, reason account_suspended'
);
select is((select status::text from public.payments where id = :'pa_unf'), 'voided',
  '3e: a checkout never finished is voided, as cancel_job() voids it (guard)');
select is(
  (select row(p.status::text, p.refund_cents, p.transfer_cents) from public.payments p where p.id = :'pa_pend'),
  row('pending'::text, null::integer, null::integer),
  '3f: A8-01: a payment still pending keeps its state (no direction is written); its job is cancelled (3b) (guard)'
);
select is(
  (select row(p.status::text, p.release_requested_at is null, coalesce(p.refund_cents, 0), coalesce(p.transfer_cents, 0))
     from public.payments p where p.id = :'pa_start'),
  row('held'::text, true, 0, 0),
  '3g: A8-01 (c): the started job''s held payment stays held and directed nowhere, for the operator (A11 review 2) (guard)'
);
select is(
  (select o.status::text from public.job_offers o where o.id = :'b1') || ' / ' || coalesce((
     select string_agg(n.type, ',' order by n.type) from public.notification_outbox n
     where n.id not in (select id from seen) and n.recipient_id = :'w1' and n.data ->> 'jobId' = :'ja_open'), 'no row'),
  (select s from ctl where k = 'b0'),
  '3h: S4-08: Wyn''s bid on Bea''s cancelled open job is settled exactly as Bea''s own cancel settles one (guard)'
);
-- What Wyn is sent about each of Bea's jobs he is on: exactly one row per cancelled job, nothing else.
create temp table want (who text, job text, type text, category text, title text, body text, data jsonb, dedupe text);
grant select on want to anon, authenticated, service_role;
insert into want
select 'w1', x::text, 'job_cancelled', 'jobs', 'Job cancelled', :'nb_neutral',
       jsonb_build_object('screen', 'WorkerJob', 'jobId', x::text), 'job_cancelled:' || x::text
  from unnest(array[:'ja_free', :'ja_late', :'ja_unf', :'ja_pend', :'ja_start']::uuid[]) x;
select bag_eq(
  $$ select 'w1'::text as who, n.data ->> 'jobId' as job, n.type, n.category, n.title, n.body, n.data, n.dedupe_key
       from public.notification_outbox n
      where n.id not in (select id from seen) and n.recipient_id = (select v from fx where k = 'w1')
        and n.data ->> 'jobId' in (select j.id::text from public.jobs j
                                    where j.client_id = (select v from fx where k = 'cust') and j.assigned_worker_id is not null) $$,
  $$ select * from want where who = 'w1' $$,
  '3i: A8-01 (b, c): Wyn gets ONE ''jobs'' notice per hired or started job the ban cancelled, title Job cancelled, the worker''s body word for word, routed to WorkerJob; nothing on the done job, no second push'
);
select is(
  (select count(*) from public.notification_outbox n where n.type = 'job_cancelled' and n.data ->> 'jobId' = :'ja_open'),
  0::bigint,
  '3i2: A8-01 (a): no notice on the cancelled open job (nobody else is on it; its bidder is 3h) (guard)'
);
select is(
  (select string_agg(m.job_id::text, ',' order by m.job_id::text) from public.messages m
    where m.sender_id = :'cust'
      and m.content = 'This job was cancelled automatically because this account was suspended by Brazos.'),
  (select string_agg(x::text, ',' order by x::text) from unnest(array[:'ja_free', :'ja_late', :'ja_unf', :'ja_pend', :'ja_start']::uuid[]) x),
  '3j: the thread line, word for word, on each job the ban cancelled that has another party, and only there'
);
select is(
  (select concat_ws(' | ', o.status::text, n.category, n.type, n.title, n.body, n.data ->> 'screen')
     from public.job_offers o
     join public.messages m on m.job_offer_id = o.id and m.request_event = 'withdrawn'
     join public.notification_outbox n on n.dedupe_key = 'message:' || m.id::text and n.recipient_id = :'w2'
     where o.id = :'d1'),
  (select s from ctl where k = 'd0'),
  '3k: S4-08: Bea''s direct offer to Win is withdrawn, and Win is told exactly as on Bea''s own withdraw'
);
select is(
  (select count(*) from public.notification_outbox n where n.id not in (select id from seen) and n.recipient_id = :'cust'),
  0::bigint,
  '3l: nothing is addressed to Bea (guard)'
);
select is(
  (select string_agg(p.id::text, ',' order by p.id::text) from public.payments p join public.jobs j on j.id = p.job_id
    where j.client_id = :'cust' and p.refund_reason = 'account_suspended'),
  (select string_agg(x::text, ',' order by x::text) from unnest(array[:'pa_free', :'pa_late']::uuid[]) x),
  '3m: A8-01: refund_reason account_suspended is written on the two undirected held payments of hired jobs, and nowhere else'
);
select is(
  (select row(
     (select bool_or(t.active) from public.push_tokens t where t.user_id = :'cust'),
     (select bool_or(t.active) from public.push_tokens t where t.user_id = :'w1'))),
  row(false, true),
  '3n: Bea''s push tokens are switched off; nobody else''s'
);
select is((select banned_until from auth.users where id = :'cust'), null::timestamptz,
  '3o: no sign-in ban: auth.users.banned_until is not set (Bea can still sign in and delete her account) (guard)');
select is(
  (select row(
     (select count(*) from public.banned_phones where phone = '+15550107171' and banned_profile_id = :'cust'),
     (select count(*) from public.banned_phones where phone = '+15550107272'))),
  row(1::bigint, 0::bigint),
  '3p: B1: the phone Bea signs in with is recorded; the phone she typed into her profile is not'
);
select is((select status from public.reports where id = :'r1'), 'actioned', '3q: the report is actioned (guard)');
select is(
  (select string_agg(j.title || '=' || p.status::text, ', ' order by j.title) from public.jobs j
     join public.payments p on p.job_id = j.id and p.kind = 'job_payment' and p.status not in ('failed', 'voided')
    where (j.client_id = :'cust' or j.assigned_worker_id = :'cust') and j.status = 'cancelled'
      and not ((p.status = 'held' and coalesce(p.refund_cents, 0) > 0)
               or p.status in ('refunded', 'partially_refunded'))),
  'BS bea pending=pending, BS bea started=held',
  '3r: A8-01: the only jobs the ban cancelled whose money has no direction are the started one (left for the operator, §4) and the one whose payment is still pending'
);

-- ---------------------------------------------------------------------------
-- 4. N1, Bea's started job (row c): cancelled by Brazos, its held payment on the operator's list.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'w1');
select is((select status::text from public.jobs where id = :'ja_start'), 'cancelled',
  '4a: N1: Wyn can still read the started job of the banned customer, and it is cancelled');
select throws_ok(
  $$ select public.transition_job_status((select v from fx where k = 'ja_start'), 'completed', '["jobs/bs-proof.jpg"]'::jsonb) $$,
  'P0001', 'Invalid job status transition',
  '4b: N1: the cancelled job can no longer be marked complete');
select tests.clear_auth();
select is(
  (select row(j.status::text, j.cancelled_at is not null, j.cancelled_by, j.cancel_reason) from public.jobs j where j.id = :'ja_start'),
  row('cancelled'::text, true, null::uuid, null::text),
  '4c: N1: cancelled_at stamped, cancelled_by and cancel_reason null'
);
select is(
  (select string_agg(a.code || '/' || coalesce(a.ref, 'null') || '/' || coalesce(a.cents::text, 'null') || '/' || a.finish, ' | ' order by a.code)
     from public.payment_attention a where a.payment_id = :'pa_start'),
  'job_closed_money_held/' || :'pa_start' || '/9675/app',
  '4d: N1: the held, undirected payment is one line on the operator''s list: job_closed_money_held, the whole charge, finished in the app'
);
select ok(
  (select a.since from public.payment_attention a where a.payment_id = :'pa_start' and a.code = 'job_closed_money_held')
    = (select j.cancelled_at from public.jobs j where j.id = :'ja_start'),
  '4e: N1: the line is dated from the cancellation, not from the funding two days earlier (null fails)'
);
select public.auto_release_due_payments();
select is(
  (select row(p.status::text, p.release_requested_at, coalesce(p.transfer_cents, 0), coalesce(p.refund_cents, 0))
     from public.payments p where p.id = :'pa_start'),
  row('held'::text, null::timestamptz, 0, 0),
  '4f: N1: the release sweep leaves it to the operator (guard)'
);

-- ---------------------------------------------------------------------------
-- 5. The admin bans Wes, the worker.
-- ---------------------------------------------------------------------------
truncate seen;
insert into seen select id from public.notification_outbox;
-- Each case's payment row as it was, to prove a payment with a direction is not touched.
create temp table snap (k text primary key, job uuid, pay uuid, pay_row jsonb);
grant select on snap to anon, authenticated, service_role;
insert into snap
select v.k, v.job, v.pay, (select to_jsonb(p) from public.payments p where p.id = v.pay)
  from (values ('pend', :'jb_pend'::uuid, :'pb_pend'::uuid), ('unf', :'jb_unf'::uuid, :'pb_unf'::uuid),
               ('fail', :'jb_fail'::uuid, :'pb_fail'::uuid), ('lvoid', :'jb_lvoid'::uuid, :'pb_lvoid'::uuid),
               ('rq', :'jb_rq'::uuid, :'pb_rq'::uuid), ('rf', :'jb_rf'::uuid, :'pb_rf'::uuid),
               ('tx', :'jb_tx'::uuid, :'pb_tx'::uuid), ('rel', :'jb_rel'::uuid, :'pb_rel'::uuid),
               ('po', :'jb_po'::uuid, :'pb_po'::uuid), ('rfd', :'jb_rfd'::uuid, :'pb_rfd'::uuid),
               ('prf', :'jb_prf'::uuid, :'pb_prf'::uuid)) v(k, job, pay);
-- One case: the job's status | its payment row is exactly as it was | the notice bodies on it.
create or replace function tests.bs_case(p_k text) returns text language sql as $$
  select (select j.status::text from public.jobs j where j.id = s.job)
      || ' | ' || ((select to_jsonb(p) from public.payments p where p.id = s.pay) = s.pay_row)::text
      || ' | ' || coalesce((select string_agg(n.body, ' + ') from public.notification_outbox n
                             where n.type = 'job_cancelled' and n.data ->> 'jobId' = s.job::text), '<no notice>')
    from snap s where s.k = p_k
$$;
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'wk')) $$, '5a: the admin bans Wes (guard)');
select tests.clear_auth();
select is(
  (select string_agg(distinct j.status::text, ',') || '/' || count(*)::text from public.jobs j
    where j.id in (:'jb_asg', :'jb_start', :'jb_pend', :'jb_disp', :'jb_unf', :'jb_fail', :'jb_lvoid',
                   :'jb_rq', :'jb_rf', :'jb_tx', :'jb_rel', :'jb_po', :'jb_rfd', :'jb_prf')),
  'cancelled/14',
  '5b: A8-01 (d): every one of Wes''s hired and started jobs is cancelled, whatever its payment state'
);
select is(
  (select string_agg(row(p.refund_cents, p.transfer_cents, p.release_reason, p.refund_reason, p.status::text)::text, '; ' order by p.amount_cents)
     from public.payments p where p.id in (:'pb_asg', :'pb_start')),
  '(6450,0,,account_suspended,held); (7525,0,,account_suspended,held)',
  '5c: A8-01 (d): an undirected held payment is refunded in full on the hired and on the started job, no fee, reason account_suspended'
);
select is(
  (select row(p.status::text, p.refund_cents, p.transfer_cents) from public.payments p where p.id = :'pb_pend'),
  row('pending'::text, null::integer, null::integer),
  '5d: a payment still pending keeps its state (guard)'
);
insert into want
select 'c2', v.job::text, 'job_cancelled', 'jobs', 'Job cancelled', v.body,
       jsonb_build_object('screen', 'ClientJobDetail', 'jobId', v.job::text), 'job_cancelled:' || v.job::text
  from (values (:'jb_asg'::uuid, :'nb_full'), (:'jb_start'::uuid, :'nb_full'), (:'jb_disp'::uuid, :'nb_dispute'),
               (:'jb_unf'::uuid, :'nb_unpaid'), (:'jb_fail'::uuid, :'nb_unpaid'),
               (:'jb_pend'::uuid, :'nb_neutral'), (:'jb_lvoid'::uuid, :'nb_neutral'),
               (:'jb_rq'::uuid, :'nb_neutral'), (:'jb_rf'::uuid, :'nb_neutral'), (:'jb_tx'::uuid, :'nb_neutral'),
               (:'jb_rel'::uuid, :'nb_neutral'), (:'jb_po'::uuid, :'nb_neutral'), (:'jb_rfd'::uuid, :'nb_neutral'),
               (:'jb_prf'::uuid, :'nb_neutral')) v(job, body);
select bag_eq(
  $$ select 'c2'::text as who, n.data ->> 'jobId' as job, n.type, n.category, n.title, n.body, n.data, n.dedupe_key
       from public.notification_outbox n
      where n.id not in (select id from seen) and n.recipient_id = (select v from fx where k = 'c2')
        and n.data ->> 'jobId' in (select j.id::text from public.jobs j
                                    where j.assigned_worker_id = (select v from fx where k = 'wk')) $$,
  $$ select * from want where who = 'c2' $$,
  '5e: A8-01 (d): Cal gets ONE ''jobs'' notice per job the ban cancelled, title Job cancelled, the body the payment state earns word for word, routed to ClientJobDetail; no second push'
);
-- One case per payment state of row (d).
select is(tests.bs_case('unf'), 'cancelled | false | ' || :'nb_unpaid',
  '5e1: not paid yet, a checkout never finished: cancelled, the row voided, "It was not paid for yet."');
select is((select status::text from public.payments where id = :'pb_unf'), 'voided', '5e2: the unfinished checkout is voided (guard)');
select is(tests.bs_case('fail'), 'cancelled | true | ' || :'nb_unpaid',
  '5e3: not paid yet, the checkout failed (no live row): cancelled, the failed row untouched, "It was not paid for yet."');
select is(tests.bs_case('lvoid'), 'cancelled | true | ' || :'nb_neutral',
  '5e4: a late charge came through on the voided row (its refund queued once, funded_after_void): never "not paid", the neutral body');
select is(
  (select row(p.refund_cents, p.transfer_cents, p.refund_reason, p.status::text,
              (select count(*) from public.refunds_due d where d.id = p.id),
              (select string_agg(n.body, ' + ') from public.notification_outbox n
                where n.type = 'job_cancelled' and n.data ->> 'jobId' = :'jb_disp'))
     from public.payments p where p.id = :'pb_disp'),
  row(5590, 0, 'account_suspended'::text, 'held'::text, 0::bigint, :'nb_dispute'::text),
  '5e5: a card dispute open: the full refund is directed (account_suspended) but waits for the bank (not in refunds_due), and Cal is told so'
);
-- 5e6, decision 21: the state has no writer (baseline.sql:162; scan of the 22 functions).
select is(tests.bs_case('pend'), 'cancelled | true | ' || :'nb_neutral',
  '5e6: a payment still pending: cancelled, the row untouched, the neutral body');
select is(tests.bs_case('rq'), 'cancelled | true | ' || :'nb_neutral',
  '5e7: held with its release asked for: cancelled, the row untouched (the worker''s pay keeps its way), the neutral body');
select is(tests.bs_case('rf'), 'cancelled | true | ' || :'nb_neutral',
  '5e8: held with a refund already queued: cancelled, the row untouched, the neutral body');
select is(tests.bs_case('tx'), 'cancelled | true | ' || :'nb_neutral',
  '5e9: held with a transfer already set (a cancellation fee): cancelled, the row untouched, the neutral body');
select is(tests.bs_case('rel'), 'cancelled | true | ' || :'nb_neutral',
  '5e10: released: cancelled, the row untouched (a ban never claws money back), the neutral body');
select is(tests.bs_case('po'), 'cancelled | true | ' || :'nb_neutral',
  '5e11: paid out: cancelled, the row untouched, the neutral body');
select is(tests.bs_case('rfd'), 'cancelled | true | ' || :'nb_neutral',
  '5e12: refunded: cancelled, the row untouched, the neutral body');
select is(tests.bs_case('prf'), 'cancelled | true | ' || :'nb_neutral',
  '5e13: partially refunded: cancelled, the row untouched, the neutral body');
select is(
  (select o.status::text from public.job_offers o where o.id = :'b2') || ' / ' || coalesce((
     select string_agg(n.type, ',' order by n.type) from public.notification_outbox n
     where n.id not in (select id from seen) and n.recipient_id = :'c2' and n.data ->> 'jobId' = :'jb_open'), 'no row'),
  (select s from ctl where k = 'b5'),
  '5f: S4-08: Wes''s bid on Cal''s open job is withdrawn, and Cal is told exactly as on a worker''s own withdraw'
);
select is(
  (select concat_ws(' | ', o.status::text, n.category, n.type, n.title = 'Wes Banned', n.body, n.data ->> 'screen')
     from public.job_offers o
     join public.messages m on m.job_offer_id = o.id and m.request_event = 'declined'
     join public.notification_outbox n on n.dedupe_key = 'message:' || m.id::text and n.recipient_id = :'c2'
     where o.id = :'d2'),
  (select s from ctl where k = 'd3'),
  '5g: S4-08: Cal''s direct offer waiting on Wes is declined, and Cal is told exactly as on a worker''s own decline'
);
select is(
  (select count(*) from public.notification_outbox n where n.id not in (select id from seen) and n.recipient_id = :'wk'),
  0::bigint,
  '5h: nothing is addressed to Wes (guard)'
);
select is(
  (select string_agg(j.title || '=' || p.status::text, ', ' order by j.title) from public.jobs j
     join public.payments p on p.job_id = j.id and p.kind = 'job_payment' and p.status not in ('failed', 'voided')
    where (j.client_id = :'wk' or j.assigned_worker_id = :'wk') and j.status = 'cancelled'
      and not ((p.status = 'held' and (coalesce(p.refund_cents, 0) > 0 or coalesce(p.transfer_cents, 0) > 0
                                       or p.release_requested_at is not null))
               or p.status in ('released', 'paid_out', 'refunded', 'partially_refunded'))),
  'BS wes pending=pending',
  '5i: A8-01: the only job Wes''s ban cancelled whose money has no direction is the one whose payment is still pending'
);

-- ---------------------------------------------------------------------------
-- 6. The admin lifts Bea's ban: the account comes back; what the ban settled does not.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'w1');
select throws_ok($$ select public.unban_user((select v from fx where k = 'cust')) $$,
  'P0001', 'Only admins may unban users', '6a: a person who is not an admin cannot unban (guard)');
select tests.authenticate_as(:'admin');
select lives_ok($$ select public.unban_user((select v from fx where k = 'cust')) $$, '6b: the admin lifts the ban (guard)');
select tests.clear_auth();
select is(
  (select row(p.banned, (select count(*) from public.banned_phones b where b.banned_profile_id = p.id)) from public.profiles p where p.id = :'cust'),
  row(false, 0::bigint),
  '6c: Bea is no longer banned and her phone is free again (guard)'
);
select is(
  (select row(
     (select count(*) from public.jobs j where j.id in (:'ja_free', :'ja_late', :'ja_unf', :'ja_open') and j.status = 'cancelled'),
     (select o.status::text from public.job_offers o where o.id = :'d1'),
     (select o.status::text from public.job_offers o where o.id = :'b1'))),
  row(4::bigint, 'withdrawn'::text, 'declined'::text),
  '6d: an unban does not bring back a cancelled job or a settled offer'
);

-- ---------------------------------------------------------------------------
-- 7. S4-08 after a DELETION: Dee leaves; the other people are told the same way.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'del');
select (public.create_job(p_title := 'BS dee open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '5 Probe Street')).id as jd_open \gset
select public.create_offer(p_amount_cents := 4100, p_worker_id := :'w7', p_title := 'BS dee direct', p_description := 'probe',
  p_category := 'other', p_location := 'Probe Area') as dd \gset
select tests.authenticate_as(:'w6');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'jd_open', p_message := 'BS wo bid') as bd \gset
select tests.clear_auth();
truncate seen;
insert into seen select id from public.notification_outbox;
select tests.authenticate_as(:'del');
select lives_ok($$ select public.delete_my_account() $$, '7a: Dee deletes her account (guard)');
select tests.clear_auth();
select is(
  (select o.status::text from public.job_offers o where o.id = :'bd') || ' / ' || coalesce((
     select string_agg(n.type, ',' order by n.type) from public.notification_outbox n
     where n.id not in (select id from seen) and n.recipient_id = :'w6' and n.data ->> 'jobId' = :'jd_open'), 'no row'),
  (select s from ctl where k = 'b0'),
  '7b: S4-08: Wo''s bid on Dee''s cancelled open job is settled exactly as a customer''s own cancel settles one (guard)'
);
select is(
  (select concat_ws(' | ', o.status::text, n.category, n.type, n.title, n.body, n.data ->> 'screen')
     from public.job_offers o
     join public.messages m on m.job_offer_id = o.id and m.request_event = 'withdrawn'
     join public.notification_outbox n on n.dedupe_key = 'message:' || m.id::text and n.recipient_id = :'w7'
     where o.id = :'dd'),
  replace((select s from ctl where k = 'd0'), 'Bea Banned', 'Deleted user'),
  '7c: S4-08: Dee''s direct offer to Wu is withdrawn, and Wu is told exactly as on her own withdraw, under the title Deleted user (A11-10 decision 11) (guard)'
);

-- ---------------------------------------------------------------------------
-- 8. P2-8: the report list with its subject, and dismissing a report.
-- ---------------------------------------------------------------------------
insert into public.reports (reporter_id, reported_id, job_id, reason, description, status, subject_kind, subject_id)
select :'w1', :'cust', :'ja_free', 'harassment', 'probe report, rolled back', 'open', 'message', m.id
from public.messages m
where m.job_id = :'ja_free' and m.sender_id = :'cust'
returning id as r2, subject_id as r2_msg \gset
insert into fx values ('r2', :'r2');
select tests.authenticate_as(:'admin');
select is(
  (select row(r.subject_kind, r.subject_id, r.subject_text, r.job_title) from public.admin_open_reports_v2() r where r.id = :'r2'),
  row('message'::text, :'r2_msg'::uuid, 'This job was cancelled automatically because this account was suspended by Brazos.'::text, 'BS bea free'::text),
  '8a: P2-8: an active admin sees the report''s subject: its kind, its id and the reported words'
);
select tests.authenticate_as(:'w2');
select is((select count(*) from public.admin_open_reports_v2()), 0::bigint, '8b: anyone else gets no rows');
select throws_ok($$ select public.dismiss_report((select v from fx where k = 'r2')) $$,
  'P0001', 'Only admins may dismiss reports', '8c: a person who is not an admin cannot dismiss a report');
select tests.authenticate_as(:'admin');
select is(public.dismiss_report(:'r2'), true, '8d: the admin dismisses the open report');
select is(public.dismiss_report(:'r2'), false, '8e: a report no longer open is not dismissed again (false, no error)');
select tests.clear_auth();
select is((select status from public.reports where id = :'r2'), 'dismissed', '8f: the report is dismissed');

select * from finish();
rollback;
