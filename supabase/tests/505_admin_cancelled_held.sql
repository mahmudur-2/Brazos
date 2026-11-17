-- 505_admin_cancelled_held.sql — production-36h S1, O1 (20261116420000_admin_attention.sql): the
-- job_closed_money_held line is refund only (the owner's decision, O1-F). A cancelled job whose held
-- payment is directed nowhere offers the customer only, also after its work started, with one plain
-- sentence; the worker call is refused and writes nothing; the refund gives back the whole charge
-- (price, Protection fee and tax); a reversed payout is the developer's (G-01); tip_payee_gone,
-- refund_failed and refund_failed_several are the developer's (O1-G); the code map changed no other
-- code's sentence or finish, and only the codes a line in the app can end have finish app.
--
-- THE CAST: Ada and Abe (active admins), Cora (the customer, banned by Abe), Wade (a worker with a
-- payout account), and the runner (RLS bypassed): fixtures and the ground truth. Everything rolls back.
--
-- THE PRODUCT PATH: each job is posted, bid on, accepted and funded through the client calls and the
-- payment event, and started by its worker through transition_job_status (so the recorder writes the
-- start); then ban_user cancels Cora's started jobs and leaves each held payment directed nowhere for
-- the operator (472 case (c)): two job_closed_money_held lines.
-- FIXTURE SURGERY, DECLARED (each line carries -- SURGERY): a fee schedule with a sales tax of 8.25% is
-- put in force before the jobs are priced (the local schedule has none; 030 inserts one the same way),
-- so each charge holds a price, a Protection fee and a tax.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(12);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('o1h.ada@brazos.test',  'Ada Admin')   as ada  \gset
select tests.create_user('o1h.abe@brazos.test',  'Abe Admin')   as abe  \gset
select tests.create_user('o1h.cora@brazos.test', 'Cora Client') as cora \gset
select tests.create_user('o1h.wade@brazos.test', 'Wade Worker') as wade \gset
update public.profiles set is_admin = true where id in (:'ada', :'abe');
insert into fx values ('cora', :'cora');

insert into public.fee_schedule (effective_from, customer_bps, worker_bps, worker_min_fee_cents, tip_customer_bps,
                                 tax_bps, cancel_fee_bps, cancel_fee_min_cents, cancel_fee_max_cents, tip_max_bps, tip_max_cents)
select now(), f.customer_bps, f.worker_bps, f.worker_min_fee_cents, f.tip_customer_bps,
       825, f.cancel_fee_bps, f.cancel_fee_min_cents, f.cancel_fee_max_cents, f.tip_max_bps, f.tip_max_cents
  from public.current_fee() f;                                                                 -- SURGERY

-- Cora posts a $50 job, the worker bids, Cora hires and pays, the worker starts. Returns the job.
create or replace function tests.o1h_started(p_name text, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_cora  uuid := (select v from fx where k = 'cora');
  v_job   uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_cora, p_worker);
  perform tests.authenticate_as(v_cora);
  select (public.create_job(
    p_title := 'O1H ' || p_name, p_description := 'Cancelled held probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '6 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Cancelled held bid');
  perform tests.authenticate_as(v_cora);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  perform tests.test_fund_job(v_job);
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(v_job, 'in_progress');
  perform tests.clear_auth();
  insert into fx values ('j_' || lower(p_name), v_job),
    ('p_' || lower(p_name), (select id from public.payments where job_id = v_job and kind = 'job_payment'));
  return v_job;
end $$;

-- The payment's direction: release reason / release asked now / transfer / refund / status.
create or replace function tests.o1h_money(p_name text) returns text language sql as $$
  select coalesce(p.release_reason, '-') || '/' || coalesce((p.release_requested_at = now())::text, 'none') || '/'
         || coalesce(p.transfer_cents, 0)::text || '/' || coalesce(p.refund_cents, 0)::text || '/' || p.status::text
    from public.payments p where p.id = (select v from fx where k = 'p_' || lower(p_name))
$$;

select tests.o1h_started('S1', :'wade') as s1 \gset
select tests.o1h_started('S2', :'wade') as s2 \gset
select tests.authenticate_as(:'abe');
select public.ban_user(:'cora');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §0. The fixture is the product's: two started jobs cancelled, each payment held and directed nowhere.
-- ---------------------------------------------------------------------------
select is((select string_agg(f.k || ' ' || j.status::text || ' ' || tests.o1h_money(substr(f.k, 3)) || ' '
                             || exists (select 1 from public.job_work_starts w where w.job_id = j.id)::text, ', ' order by f.k)
             from fx f join public.jobs j on j.id = f.v where f.k like 'j\_%'),
  'j_s1 cancelled -/none/0/0/held true, j_s2 cancelled -/none/0/0/held true',
  '0a: guard: ban_user cancelled the two started jobs and left each held payment directed nowhere, with the start recorded');
select is((select string_agg(p.amount_cents || '+' || p.customer_fee_cents || '+' || p.tax_cents || '=' || p.charge_amount_cents, ', ')
             from public.payments p where p.job_id in (:'s1', :'s2')),
  '5000+375+443=5818, 5000+375+443=5818',
  '0b: guard: each charge is the price, the Protection fee (7.5%) and the tax (8.25%)');

-- ---------------------------------------------------------------------------
-- §1. The list, read by Ada: the customer only, and why.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ada');
select is((select string_agg(f.k || ' ' || a.decisions::text || ' ' || coalesce(a.decision_note, '-'), ' | ' order by f.k)
             from public.admin_attention() a join fx f on f.v = a.job_id
            where a.code = 'job_closed_money_held'),
  'j_s1 {customer} The app cannot pay the worker of a cancelled job. If the worker must be paid, ask your developer. | '
  'j_s2 {customer} The app cannot pay the worker of a cancelled job. If the worker must be paid, ask your developer.',
  '1a: a cancelled held payment offers the customer only, also when the start of the work is recorded, and says why');
select is((select a.reason || ' / ' || a.finish from public.admin_attention() a where a.job_id = :'s1'),
  'This job was cancelled while its payment was still held. You can refund the customer here. To pay the worker, ask your developer. / app',
  '1b: the line''s sentence: the refund is here, paying the worker is the developer''s');
select tests.clear_auth();
select is((select md5(string_agg(code || '|' || reason || '|' || finish, E'\n' order by code)) || ' ' || count(*)
             from public.payment_attention_codes() where code not in ('job_closed_money_held', 'transfer_reversed', 'tip_payee_gone', 'refund_failed', 'refund_failed_several')),
  'fb94bee503446d0230a46b866f11c5d7 51',
  '1c: guard: every other code keeps its sentence and its finish (the digest of the map before O1, without the five codes O1 changed)');
select is((select reason || ' / ' || finish from public.payment_attention_codes() where code = 'transfer_reversed'),
  'The worker''s payout was taken back in Stripe. To settle this money, ask your developer. / developer',
  '1d: a reversed payout is the developer''s: no line in the app decides it (G-01)');
select is((select string_agg(code, ',' order by code) from public.payment_attention_codes() where finish = 'app'),
  'issue_no_show,issue_open,job_closed_money_held,transfer_issue_open',
  '1e: guard: finish app only on the codes that admin_attention() gives a decision (O1-G)');

-- ---------------------------------------------------------------------------
-- §2. The worker side is refused and writes nothing.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ada');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'s1'), 'P0001',
  'This decision is not open for this job now. Reload the list.',
  '2a: the worker of a cancelled job whose work started is refused, in the existing refusal form');
select tests.clear_auth();
select is(tests.o1h_money('S1') || ' ' || (select count(*) from public.admin_decisions d where d.job_id = :'s1')::text,
  '-/none/0/0/held 0', '2b: the refused call moved no money and wrote no record');

-- ---------------------------------------------------------------------------
-- §3. The refund gives back the whole charge.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ada');
select lives_ok(format($$ select public.admin_decide_issue(%L, 'customer') $$, :'s2'), '3a: guard: Ada refunds the customer of S2');
select tests.clear_auth();
select is((select p.amount_cents || '+' || p.customer_fee_cents || '+' || p.tax_cents || ' refund ' || p.refund_cents
                  || ' transfer ' || coalesce(p.transfer_cents, 0) || ' ' || p.refund_reason
             from public.payments p where p.job_id = :'s2'),
  '5000+375+443 refund 5818 transfer 0 dispute_refund',
  '3b: guard: the refund is the whole charge: the price 5000, the Protection fee 375 and the tax 443 cents, nothing to the worker');
select is((select string_agg(r.refund_cents::text, ',') from public.refunds_due r where r.job_id = :'s2'), '5818',
  '3c: guard: the refund queue takes the whole 5818 cents');

select * from finish();
rollback;
