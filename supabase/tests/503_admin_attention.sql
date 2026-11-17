-- 503_admin_attention.sql — production-36h S1, O1 file 1 (20261116420000_admin_attention.sql), part 1:
-- the list in the app (admin_attention) and the decision (admin_decide_issue). Who may call them; the
-- 27 columns; decisions are exactly the sides the server accepts now, with one plain sentence when a
-- side is not offered; the names, the issue's words, the sign-in contacts and the job's times only on
-- a line with a decision, none for a deleted account; the key never holds a Stripe id; the decision
-- goes through resolve_job_dispute, is refused on the admin's own job and on a side no line offers,
-- leaves one insert-only record, and its line leaves the list. The notice timer is 504; the cancelled
-- held payment on the product path is 505 (refund only), and here J2 (a recorded start) offers the
-- customer only.
--
-- THE CAST: Ada and Abe (active admins; Ada is also the customer of one job), Bob (banned admin), Nia
-- (no admin), Cora (customer), Wade (worker), Dell (a worker whose account is deleted), and the runner
-- (RLS bypassed): fixtures, resolve's own calls and the ground truth. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each line carries -- SURGERY): the jobs, payments and issue reports are
-- raw rows by the runner in the shapes the product reaches (290 and 030 prove those writers); J2 is
-- moved assigned -> in_progress -> cancelled by hand, so the recorder (502) writes its start; the
-- money facts of J4 (a card dispute), J5 (a transfer sent with no recorded result), J7 (a refund sent),
-- J9 (a reversed transfer), J11 (Dell's no-show claim on a job cancelled for it), J12 (Dell's reversed
-- cancellation fee), J13 (Wade's no-show claim under a card dispute) and V (a voided intent whose
-- cancel is unproven) are set by hand; Dell's
-- deletion is profiles.deleted_at set by the runner (delete_my_account is 500's); the sign-in phones
-- are written into auth.users (fictional 555-01xx numbers).
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(48);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

select tests.create_user('o1a.ada@brazos.test',  'Ada Admin')     as ada  \gset
select tests.create_user('o1a.abe@brazos.test',  'Abe Admin')     as abe  \gset
select tests.create_user('o1a.bob@brazos.test',  'Bob Banned')    as bob  \gset
select tests.create_user('o1a.nia@brazos.test',  'Nia Nobody')    as nia  \gset
select tests.create_user('o1a.cora@brazos.test', 'Cora Client')   as cora \gset
select tests.create_user('o1a.wade@brazos.test', 'Wade Worker')   as wade \gset
select tests.create_user('o1a.dell@brazos.test', 'Dell Departed') as dell \gset
update public.profiles set is_admin = true where id in (:'ada', :'abe', :'bob');
update public.profiles set banned = true where id = :'bob';
update auth.users set phone = '15550100001' where id = :'cora';                                -- SURGERY
update auth.users set phone = '15550100002' where id = :'wade';                                -- SURGERY
update auth.users set phone = '15550100003' where id = :'dell';                                -- SURGERY
update public.profiles set deleted_at = now() where id = :'dell';                              -- SURGERY
insert into fx values ('ada', :'ada'), ('abe', :'abe'), ('bob', :'bob'), ('nia', :'nia'), ('cora', :'cora'),
                      ('wade', :'wade'), ('dell', :'dell');

-- A job, its held card payment ($80 + $6 customer fee) and, when asked, an open issue report by the customer.
create or replace function tests.o1a_job(p_name text, p_client uuid, p_worker uuid, p_status text, p_issue boolean)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_pay uuid;
begin
  insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at, arrived_at)        -- SURGERY
  values (p_client, 'O1A ' || p_name, p_worker, p_status::public.job_status,
          case when p_status = 'completed' then now() - interval '1 day' end,
          case when p_status in ('completed', 'in_progress') then now() - interval '26 hours' end)
  returning id into v_job;
  insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents,
                               provider, provider_ref, status)                                           -- SURGERY
  values (v_job, p_client, p_worker, 8000, 800, 600, 'stripe', 'pi_o1a_' || lower(p_name), 'held')
  returning id into v_pay;
  if p_issue then
    insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)                     -- SURGERY
    values (v_job, v_pay, p_client, 'not_as_described', 'The shelf in ' || p_name || ' is crooked');
  end if;
  insert into fx values ('j_' || lower(p_name), v_job), ('p_' || lower(p_name), v_pay);
  return v_job;
end $$;

-- One fixture line of the admin's list: code | decisions | the note's first words.
create or replace function tests.o1a_lines(p_names text[]) returns text language sql as $$
  select coalesce(string_agg(f.k || ' ' || a.code || ' ' || a.decisions::text || ' ' || coalesce(rtrim(left(a.decision_note, 24)), '-'),
                             ' | ' order by f.k, a.code), '<none>')
    from public.admin_attention() a
    join fx f on f.v = a.job_id and f.k = any (p_names)
   where a.code in ('issue_open', 'issue_no_show', 'transfer_issue_open', 'job_closed_money_held')
$$;

select tests.o1a_job('J1', :'cora', :'wade', 'completed', true) as j1 \gset
select tests.o1a_job('J2', :'cora', :'wade', 'assigned', false) as j2 \gset
update public.jobs set status = 'in_progress' where id = :'j2';                                -- SURGERY
update public.jobs set status = 'cancelled', cancelled_at = now() - interval '2 hours' where id = :'j2'; -- SURGERY
select tests.o1a_job('J3', :'ada', :'wade', 'completed', true) as j3 \gset
select tests.o1a_job('J4', :'cora', :'wade', 'completed', true) as j4 \gset
update public.payments set chargeback_at = now() where job_id = :'j4';                         -- SURGERY
select tests.o1a_job('J5', :'cora', :'wade', 'completed', true) as j5 \gset
update public.payments set release_requested_at = now(), release_reason = 'approved', transfer_cents = 7200,
       transfer_attempts = 1, transfer_sent_attempt = 1 where job_id = :'j5';                  -- SURGERY
select tests.o1a_job('J6', :'cora', :'wade', 'in_progress', true) as j6 \gset
select tests.o1a_job('J7', :'cora', :'wade', 'completed', true) as j7 \gset
update public.payments set refund_cents = 1000, refund_reason = 'dispute_refund', refund_ref = 're_o1a_j7'
 where job_id = :'j7';                                                                         -- SURGERY
select tests.o1a_job('J8', :'cora', :'dell', 'completed', true) as j8 \gset
select tests.o1a_job('J9', :'cora', :'wade', 'completed', false) as j9 \gset
update public.payments set release_requested_at = now(), release_reason = 'approved', transfer_cents = 7200,
       transfer_reversed_at = now() where job_id = :'j9';                                      -- SURGERY
select tests.o1a_job('J11', :'cora', :'dell', 'cancelled', false) as j11 \gset
update public.jobs set cancel_reason = 'customer_no_show' where id = :'j11';                   -- SURGERY
insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
values (:'j11', (select v from fx where k = 'p_j11'), :'dell', 'no_show', 'Nobody was home at J11'); -- SURGERY
select tests.o1a_job('J12', :'cora', :'dell', 'cancelled', true) as j12 \gset
update public.payments set release_requested_at = now(), release_reason = 'cancellation_fee', transfer_cents = 1500,
       transfer_reversed_at = now() where job_id = :'j12';                                     -- SURGERY
select tests.o1a_job('J13', :'cora', :'wade', 'cancelled', false) as j13 \gset
update public.jobs set cancel_reason = 'customer_no_show' where id = :'j13';                   -- SURGERY
insert into public.job_disputes (job_id, payment_id, opened_by, reason, details)
values (:'j13', (select v from fx where k = 'p_j13'), :'wade', 'no_show', 'Nobody was home at J13'); -- SURGERY
update public.payments set chargeback_at = now() where job_id = :'j13';                        -- SURGERY
select tests.o1a_job('V', :'cora', :'wade', 'cancelled', false) as jv \gset
update public.payments set status = 'voided', intent_cancel_at = now() - interval '2 hours'
 where job_id = :'jv';                                                                         -- SURGERY

-- ---------------------------------------------------------------------------
-- §0. The doors and the tables.
-- ---------------------------------------------------------------------------
select is((select string_agg(f || ':' || r, ', ' order by f, r)
             from unnest(array['public.admin_attention()', 'public.admin_decide_issue(uuid,text)',
                               'public.admin_attention_lines()', 'public.admin_issue_options(uuid,uuid)',
                               'public.refuse_admin_decision_change()', 'public.notify_attention_admins()',
                               'public.install_admin_attention_schedule()']) f,
                  unnest(array['anon', 'authenticated', 'service_role']) r
            where has_function_privilege(r, f::regprocedure, 'EXECUTE')),
  'public.admin_attention():authenticated, public.admin_decide_issue(uuid,text):authenticated, public.install_admin_attention_schedule():service_role',
  '0a: the app may call the list and the decision; the helpers and the timer are no client''s door (the timer runs as its owner); the service role may run the installer');
select is((select string_agg(p.proname || ' ' || p.prosecdef::text || ' ' || coalesce(public.active_guard_problem(p.oid), 'guard first')
                             || ' ' || array_to_string(p.proconfig, ','), ', ' order by p.proname)
             from pg_proc p where p.oid in ('public.admin_attention()'::regprocedure, 'public.admin_decide_issue(uuid,text)'::regprocedure)),
  'admin_attention true guard first search_path=public, pg_temp, admin_decide_issue true guard first search_path=public, pg_temp',
  '0b: both app doors are SECURITY DEFINER with a pinned search_path and the guard as their first statement');
select is((select string_agg(c.relname || ' ' || c.relrowsecurity::text || ' '
                             || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::text || ' '
                             || coalesce((select string_agg(r || ':' || pr, '+' order by r, pr)
                                            from unnest(array['anon', 'authenticated', 'service_role']) r,
                                                 unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) pr
                                           where has_table_privilege(r, c.oid, pr)), 'none'),
                             ', ' order by c.relname)
             from pg_class c where c.oid in ('public.admin_decisions'::regclass, 'public.admin_attention_seen'::regclass)),
  'admin_attention_seen true 0 service_role:SELECT, admin_decisions true 0 service_role:SELECT',
  '0c: both tables: row security on, no policy, no client right; the service role reads');
select is(pg_get_function_result('public.admin_attention()'::regprocedure),
  'TABLE(key text, what text, reason text, since timestamp with time zone, overdue boolean, cents integer, detail text, code text, finish text, payment_id uuid, job_id uuid, decisions text[], job_title text, customer_first_name text, worker_first_name text, report_reason text, report_details text, report_at timestamp with time zone, customer_phone text, customer_email text, worker_phone text, worker_email text, arrived_at timestamp with time zone, work_started_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, decision_note text)',
  '0d: the 27 columns of the contract, in its order');

-- ---------------------------------------------------------------------------
-- §1. Who may call.
-- ---------------------------------------------------------------------------
select tests.authenticate_anon();
select throws_ok($$ select count(*) from public.admin_attention() $$, '42501',
  'permission denied for function admin_attention', '1a: anon may not read the list');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'customer') $$, :'j1'), '42501',
  'permission denied for function admin_decide_issue', '1b: anon may not decide');
select tests.authenticate_as(:'nia');
select throws_ok($$ select count(*) from public.admin_attention() $$, 'P0001',
  'Only admins may see this list', '1c: a signed-in person who is no admin may not read the list');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'customer') $$, :'j1'), 'P0001',
  'Only admins may decide issues', '1d: … nor decide');
select tests.authenticate_as(:'bob');
select throws_ok($$ select count(*) from public.admin_attention() $$, 'P0001',
  'This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake.',
  '1e: a banned admin is refused by the guard, before the list');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'customer') $$, :'j1'), 'P0001',
  'This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake.',
  '1f: … and before a decision');
select tests.clear_auth();
select is((select count(*) from public.job_disputes where job_id = :'j1' and status = 'open'), 1::bigint,
  '1g: nothing was decided by a refused call');

-- ---------------------------------------------------------------------------
-- §2. The list, read by Ada.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ada');
select is(tests.o1a_lines(array['j_j1', 'j_j2', 'j_j3', 'j_j4']),
  'j_j1 issue_open {customer,worker} - | '
  'j_j2 job_closed_money_held {customer} The app cannot pay the w | '
  'j_j3 issue_open {} You cannot decide an iss | '
  'j_j4 issue_open {customer} The worker cannot be pai',
  '2a: an issue on a finished job offers both sides; a cancelled held payment the customer only, also with a recorded start (and says why); the admin''s own job nothing (and says why); a card dispute drops the worker (and says why)');
select is(tests.o1a_lines(array['j_j5', 'j_j6', 'j_j7', 'j_j8']),
  'j_j5 issue_open {} A payment to the worker | '
  'j_j5 transfer_issue_open {} A payment to the worker | '
  'j_j6 issue_open {} This job is not finished | '
  'j_j7 issue_open {} A refund to the customer | '
  'j_j8 issue_open {customer} The worker''s account was',
  '2b: nothing while a transfer''s result is not recorded, on an unfinished job, or when a refund was sent; a deleted worker''s finished job offers the customer only');
select is((select string_agg(f.k || ' ' || a.code || ' ' || a.decisions::text || ' ' || coalesce(a.decision_note, '-'), ' | ' order by f.k)
             from public.admin_attention() a join fx f on f.v = a.job_id
            where f.k in ('j_j8', 'j_j11', 'j_j12') and a.code in ('issue_open', 'issue_no_show')),
  'j_j11 issue_no_show {customer} The worker''s account was deleted, so the worker cannot be paid in the app. | '
  'j_j12 issue_open {customer} The worker''s account was deleted, so the worker cannot be paid in the app. | '
  'j_j8 issue_open {customer} The worker''s account was deleted, so the worker cannot be paid in the app.',
  '2n: a deleted payee is offered in no branch (a finished job, a no-show claim, a reversed cancellation fee), and the note says why');
select is((select string_agg(a.code || ' ' || a.decisions::text || ' ' || coalesce(a.decision_note, '-'), ' | ')
             from public.admin_attention() a where a.job_id = :'j13' and a.code = 'issue_no_show'),
  'issue_no_show {customer} The worker cannot be paid while the customer''s bank reviews a card dispute on this payment.',
  '2o: a no-show claim under an open card dispute offers the customer only, with the card sentence (G-02)');
select is((select row(a.job_title, a.customer_first_name, a.worker_first_name, a.report_reason, a.report_details,
                      a.report_at is not null, a.customer_phone, a.customer_email, a.worker_phone, a.worker_email,
                      a.arrived_at = now() - interval '26 hours', a.work_started_at, a.completed_at = now() - interval '1 day',
                      a.cancelled_at, a.what, a.finish, a.cents)::text
             from public.admin_attention() a where a.job_id = :'j1' and a.code = 'issue_open'),
  row('O1A J1', 'Cora', 'Wade', 'not_as_described', 'The shelf in J1 is crooked', true, '15550100001', 'o1a.cora@brazos.test',
      '15550100002', 'o1a.wade@brazos.test', true, null::timestamptz, true, null::timestamptz, 'issue report', 'app', null::integer)::text,
  '2c: a line with a decision carries the title, both first names, the issue''s words and time, both sign-in contacts and the job''s times');
select is((select row(a.job_title, a.customer_first_name, a.worker_first_name, a.report_reason, a.customer_phone, a.worker_phone,
                      a.work_started_at = now(), a.cancelled_at = now() - interval '2 hours', a.cents, a.finish)::text
             from public.admin_attention() a where a.job_id = :'j2' and a.code = 'job_closed_money_held'),
  row('O1A J2', 'Cora', 'Wade', null::text, '15550100001', '15550100002', true, true, 8600, 'app')::text,
  '2d: the cancelled held payment: no issue words, and the recorded start of the work (job_work_starts) with the cancel time');
select is((select row(a.job_title, a.decisions, a.customer_first_name, a.worker_first_name, a.report_reason, a.report_details,
                      a.report_at, a.customer_phone, a.customer_email, a.worker_phone, a.worker_email,
                      a.arrived_at, a.work_started_at, a.completed_at, a.cancelled_at, a.decision_note)::text
             from public.admin_attention() a where a.job_id = :'j3' and a.code = 'issue_open'),
  row('O1A J3', '{}'::text[], null::text, null::text, null::text, null::text, null::timestamptz, null::text, null::text, null::text,
      null::text, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz,
      'You cannot decide an issue on your own job. Ask another admin or your developer.')::text,
  '2e: the admin''s own job: the title and the reason only, no name, word, contact or time');
select is((select row(a.worker_first_name, a.worker_phone, a.worker_email, a.customer_first_name, a.customer_phone)::text
             from public.admin_attention() a where a.job_id = :'j8' and a.code = 'issue_open'),
  row('Deleted user', null::text, null::text, 'Cora', '15550100001')::text,
  '2f: a deleted account: ''Deleted user'' and no contact, though auth.users still holds them');
select is((select count(*) from public.admin_attention() a
            where cardinality(a.decisions) = 0
              and (a.customer_first_name is not null or a.worker_first_name is not null or a.report_reason is not null
                   or a.report_details is not null or a.report_at is not null or a.customer_phone is not null
                   or a.customer_email is not null or a.worker_phone is not null or a.worker_email is not null
                   or a.arrived_at is not null or a.work_started_at is not null or a.completed_at is not null
                   or a.cancelled_at is not null)),
  0::bigint, '2g: no line without a decision carries a name, an issue''s words, a contact or a time');
select is((select count(*) from public.admin_attention() a
            where a.code not in ('issue_open', 'issue_no_show', 'transfer_issue_open', 'job_closed_money_held')
              and (cardinality(a.decisions) > 0 or a.decision_note is not null)),
  0::bigint, '2h: every other line offers no decision and has no note');
select is((select string_agg(a.code || ' ' || (a.job_title is not distinct from 'O1A J9')::text, ', ' order by a.code)
             from public.admin_attention() a where a.job_id = :'j9'),
  'transfer_reversed true', '2i: the title is on every line with a job, also one without a decision');
select is((select a.key from public.admin_attention() a where a.code = 'cancel_unconfirmed' and a.job_id = :'jv'),
  'cancel_unconfirmed:' || (select v from fx where k = 'p_v')::text || ':' || md5('pi_o1a_v'),
  '2j: a key is code:payment:md5(ref), so a Stripe id in the ref never shows in the key');
select is((select count(*) from public.admin_attention() a where a.key ~ '(pi|re|ch|cus|evt|tr|acct|dp)_[A-Za-z0-9]'),
  0::bigint, '2k: no key on the list holds a Stripe id');
select ok((select bool_and(a.ord = a.want)
             from (select row_number() over () as ord,
                          row_number() over (order by x.since, x.key) as want
                     from public.admin_attention() x) a),
  '2l: the list comes ordered by since, then key');
select tests.authenticate_as(:'abe');
select is(tests.o1a_lines(array['j_j3']), 'j_j3 issue_open {customer,worker} -',
  '2m: Ada''s own job offers both sides to another admin');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- §3. The decision.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ada');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'both') $$, :'j1'), 'P0001',
  'Resolve in favour of the worker or the customer', '3a: a side that is neither is refused');
select throws_ok($$ select public.admin_decide_issue(gen_random_uuid(), 'customer') $$, 'P0001',
  'Job not found', '3b: a job that does not exist is refused');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'customer') $$, :'j3'), 'P0001',
  'You cannot decide an issue on your own job. Ask another admin or your developer.',
  '3c: the admin''s own job is refused');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j2'), 'P0001',
  'This decision is not open for this job now. Reload the list.',
  '3d: a side the line does not offer is refused (the worker on a cancelled held payment, though its start is recorded)');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j4'), 'P0001',
  'This decision is not open for this job now. Reload the list.',
  '3e: … the worker under a card dispute');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'customer') $$, :'j9'), 'P0001',
  'This decision is not open for this job now. Reload the list.',
  '3f: a job with no decision line is refused, though resolve_job_dispute would act on its reversed transfer');
select tests.clear_auth();
select is((select row(p.refund_cents, coalesce(p.transfer_cents, 0), p.release_requested_at is null)::text
             from public.payments p where p.job_id = :'j2'),
  row(null::integer, 0, true)::text, '3g: the refused calls moved no money');

select tests.authenticate_as(:'ada');
select lives_ok(format($$ select public.admin_decide_issue(%L, 'customer') $$, :'j2'),
  '3h: Ada refunds the customer of the cancelled held payment');
select is(tests.o1a_lines(array['j_j2']), '<none>', '3i: … and its line leaves the list');
select lives_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j1'),
  '3j: Ada decides the issue on J1 for the worker');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j1'), 'P0001',
  'This decision is not open for this job now. Reload the list.',
  '3k: a second decision on the same job is refused: its line has left');
select tests.clear_auth();
select is((select row(p.refund_cents, p.transfer_cents, p.refund_reason)::text from public.payments p where p.job_id = :'j2'),
  row(8600, 0, 'dispute_refund')::text, '3l: J2: the full charge is to be refunded, by resolve_job_dispute''s own rule');
select is((select row(p.release_reason, p.release_requested_at = now(), p.transfer_cents, p.refund_cents, d.status::text, d.resolution_note)::text
             from public.payments p join public.job_disputes d on d.job_id = p.job_id where p.job_id = :'j1'),
  row('dispute_resolved', true, 7200, 0, 'resolved', 'Decided in the app by a Brazos admin.')::text,
  '3m: J1: the payout is asked for the worker''s share and the issue is resolved with a note that names no one');
select is((select string_agg(f.k || ' ' || (d.admin_id = :'ada')::text || ' ' || (d.payment_id = p.id)::text || ' ' || d.side
                             || ' ' || (d.decided_at = now())::text, ', ' order by f.k)
             from public.admin_decisions d join fx f on f.v = d.job_id
             join public.payments p on p.job_id = d.job_id),
  'j_j1 true true worker true, j_j2 true true customer true',
  '3n: one record per decision: the admin, the job, the payment, the side, the time');
select throws_ok($$ update public.admin_decisions set side = 'customer' $$, 'P0001',
  'admin_decisions is a record: a row is never changed or removed', '3o: a record is never changed …');
select throws_ok($$ delete from public.admin_decisions $$, 'P0001',
  'admin_decisions is a record: a row is never changed or removed', '3p: … or removed');

-- G-04: the worker side of a deleted payee is refused in every branch and writes nothing.
select tests.authenticate_as(:'ada');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j8'), 'P0001',
  'This decision is not open for this job now. Reload the list.', '3q: a deleted payee on a finished job is refused');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j11'), 'P0001',
  'This decision is not open for this job now. Reload the list.', '3r: … on a no-show claim');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j12'), 'P0001',
  'This decision is not open for this job now. Reload the list.', '3s: … on a reversed cancellation fee');
select tests.clear_auth();
select is((select string_agg(f.k || ' ' || coalesce(p.release_reason, '-') || '/' || coalesce(p.transfer_cents, 0) || '/'
                             || coalesce(p.refund_cents, 0) || '/' || (p.transfer_reversed_at is not null)::text || ' ' || d.status::text
                             || ' ' || (select count(*) from public.admin_decisions x where x.job_id = p.job_id), ', ' order by f.k)
             from fx f join public.payments p on p.id = f.v join public.job_disputes d on d.job_id = p.job_id
            where f.k in ('p_j8', 'p_j11', 'p_j12')),
  'p_j11 -/0/0/false open 0, p_j12 cancellation_fee/1500/0/true open 0, p_j8 -/0/0/false open 0',
  '3t: the refused calls moved no money, closed no issue and wrote no record');

-- G-02: the worker side of a no-show claim is refused while a card dispute is open, and writes nothing.
select tests.authenticate_as(:'ada');
select throws_ok(format($$ select public.admin_decide_issue(%L, 'worker') $$, :'j13'), 'P0001',
  'This decision is not open for this job now. Reload the list.', '3u: a no-show claim under an open card dispute: the worker is refused');
select tests.clear_auth();
select is((select coalesce(p.release_reason, '-') || '/' || coalesce(p.transfer_cents, 0) || '/' || coalesce(p.refund_cents, 0)
                  || '/' || (p.release_requested_at is null)::text || ' ' || d.status::text
                  || ' ' || (select count(*) from public.admin_decisions x where x.job_id = p.job_id)
             from public.payments p join public.job_disputes d on d.job_id = p.job_id where p.job_id = :'j13'),
  '-/0/0/true open 0', '3v: the refused call moved no money, closed no claim and wrote no record');

select * from finish();
rollback;
