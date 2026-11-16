-- 490_release_clock.sql — the release_clock migration (production-36h S4, step A): the automatic
-- approval deadline is the earlier of (told + 72 hours) and (completion + 168 hours), the Terms'
-- rule; release_due_at() and auto_release_due_payments() read that one rule; nobody gets less time
-- than the old rule gave; the told time is written by every outbox writer, once.
--
-- THE CAST: customer (pays, is told), worker (hired, paid), stranger (no part in anything),
-- customer2 and customer3 (more payers, so no customer meets the 10-jobs-an-hour limit), the service role
-- (set_config role/claims, as the drain runs), and the runner (RLS bypassed: fixtures, ground
-- truth, SURGERY, the cron's caller).
--
-- THE FIXTURE: every job is hired through the real RPCs (create_job, create_offer, accept_offer),
-- funded by tests.test_fund_job (held, stripe), worked to completed by the hired worker, which
-- enqueues the customer's job_completed notice (pending). Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each line carries -- SURGERY):
--   * jobs.completed_at is rewound (the clocks cannot be waited out; 030 §13 precedent);
--   * timer_runs.ok_at of auto-release-due-payments is moved back a day before §7's run (TIMERS);
--   * jobs.completion_told_at is rewound for a told time earlier than now (the trigger can only
--     write now());
--   * the job_completed outbox row is removed (never told), flipped to sent / skipped / failed as
--     the drain writes it, or given 5 attempts or an older created_at / sent_at;
--   * payments.chargeback_at, refund_cents and transfer_reversed_at are written directly (the card
--     dispute, refund and reversal paths need provider events this file does not replay);
--   * the told trigger is disabled for §3 only, to stand for a database written before release_clock;
--   * §3: a payment's status is set to paid_out or refunded (a job already settled before the fill);
--   * §6: a test-only trigger stands for a customer's approval committed after the sweep read its
--     candidates (one session cannot interleave two); §7: a completion time set null, older
--     checkouts set failed / voided, a held tip row inserted, payments paused by the runner (the
--     owner's switch).
--
-- THE GRID (§1) runs each case in a subtransaction that is rolled back (a BEGIN ... EXCEPTION
-- block), so 540 cases share one real job: completion age (71, 73, 100, 167, 168, 169 hours) ×
-- told state (none, pending, sent, skipped, failed, with told 0, 71, 72, 73 hours ago or at
-- completion) × block (none, approved, card dispute, refund, reversed transfer, open issue). The
-- expected moment is computed HERE, from the Terms' rule, never read from the server.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(66);

select tests.create_user('rc.customer@brazos.test',  'Rhea Customer')  as customer  \gset
select tests.create_user('rc.worker@brazos.test',    'Ravi Worker')    as worker    \gset
select tests.create_user('rc.stranger@brazos.test',  'Rory Stranger')  as stranger  \gset
select tests.create_user('rc.customer2@brazos.test', 'Rita Customer')  as customer2 \gset
select tests.create_user('rc.customer3@brazos.test', 'Remi Customer')  as customer3 \gset

-- Hire the worker on a fresh job through the real RPCs (350_unpaid_hire_close.sql's lc_hire shape).
create or replace function tests.rc_hire(p_customer uuid, p_worker uuid, p_title text)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Release clock probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000,
    p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Release clock bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- The hired worker starts and completes the job (030_payments.sql's r4_work shape).
create or replace function tests.rc_work(p_worker uuid, p_job uuid) returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_worker);
  perform public.transition_job_status(p_job, 'in_progress');
  perform public.transition_job_status(p_job, 'completed', '["https://example.com/rc-done.jpg"]'::jsonb);
  perform tests.clear_auth();
end $$;

-- Hired, funded (held), completed.
create or replace function tests.rc_job(p_customer uuid, p_worker uuid, p_title text) returns uuid language plpgsql as $$
declare v_job uuid;
begin
  v_job := tests.rc_hire(p_customer, p_worker, p_title);
  perform tests.test_fund_job(v_job);
  perform tests.rc_work(p_worker, v_job);
  return v_job;
end $$;

-- The drain's two writes, made as the service role (send-push's resolve_notification and the
-- claim's failed write), then back to the runner. service_role holds no USAGE on schema tests, so
-- the way back is set_config itself, as 110 §7 does it.
create or replace function tests.rc_resolve(p_id uuid, p_status text, p_error text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
  perform public.resolve_notification(p_id, p_status, p_error);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function tests.rc_claim() returns bigint language plpgsql as $$
declare v_n bigint;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
  select count(*) into v_n from public.claim_notification_batch(1);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return v_n;
end $$;

create or replace function tests.rc_notice(p_customer uuid, p_job uuid) returns uuid language sql as $$
  select o.id from public.notification_outbox o
   where o.recipient_id = p_customer and o.type = 'job_completed' and o.data ->> 'jobId' = p_job::text
$$;

-- ---------------------------------------------------------------------------
-- §0. ACCESS. Who may run what.
-- ---------------------------------------------------------------------------
select ok((select prosecdef and provolatile = 's' and proconfig @> array['search_path=public, pg_temp']
             from pg_proc where oid = 'public.release_due_at(public.jobs)'::regprocedure),
  '0: release_due_at is SECURITY DEFINER, STABLE, with a fixed search_path (it must read the payment columns authenticated may not select)');
select ok(has_function_privilege('authenticated', 'public.release_due_at(public.jobs)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.release_due_at(public.jobs)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.release_due_at(public.jobs)', 'EXECUTE'),
  '0: release_due_at: authenticated may execute it; anon and service_role may not');
select ok((select not prosecdef and provolatile = 's' from pg_proc where oid = 'public.auto_approval_deadline(uuid)'::regprocedure)
          and not has_function_privilege('authenticated', 'public.auto_approval_deadline(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.auto_approval_deadline(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.auto_approval_deadline(uuid)', 'EXECUTE'),
  '0: auto_approval_deadline (the rule) is invoker, stable and owner only');
select ok(not has_function_privilege('authenticated', 'public.stamp_completion_told()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.stamp_completion_told()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.stamp_completion_told()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.fill_completion_told_at()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.fill_completion_told_at()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.fill_completion_told_at()', 'EXECUTE'),
  '0: the stamp trigger function and the fill are owner only');
select ok(has_function_privilege('service_role', 'public.auto_release_due_payments()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.auto_release_due_payments()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.auto_release_due_payments()', 'EXECUTE'),
  '0: auto_release_due_payments stays service_role only (restated)');
select tests.authenticate_anon();
select throws_ok($$ select public.release_due_at(null::public.jobs) $$,
  '42501', 'permission denied for function release_due_at', '0: anon cannot ask for a deadline');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.auto_approval_deadline(gen_random_uuid()) $$,
  '42501', 'permission denied for function auto_approval_deadline', '0: a signed-in user cannot call the rule directly');
select tests.clear_auth();
select ok((select pg_get_triggerdef(t.oid) like '%AFTER INSERT OR UPDATE OF status ON public.notification_outbox%'
                  and pg_get_triggerdef(t.oid) like '%job_completed%'
                  and pg_get_triggerdef(t.oid) like '%stamp_completion_told()%'
             from pg_trigger t where t.tgname = 'notification_outbox_completion_told' and not t.tgisinternal),
  '0: the told stamp is an AFTER INSERT OR UPDATE OF status trigger on notification_outbox, for job_completed rows');

-- ---------------------------------------------------------------------------
-- §1. THE GRID. One real job; each case rolled back.
-- ---------------------------------------------------------------------------
select tests.rc_job(:'customer', :'worker', 'RC grid base') as jg \gset
select ok((select o.status = 'pending' and j.completion_told_at is null and j.completed_at = now()
             from public.jobs j join public.notification_outbox o on o.id = tests.rc_notice(:'customer', :'jg')
            where j.id = :'jg'),
  '1: runner: the base job is completed now, its notice is pending, and nothing is told yet (the fixture is real)');

create temp table rc_grid_rows (
  c_h integer, state text, told_h integer, block text,
  expected timestamptz, old_moment timestamptz,
  cust_due timestamptz, work_due timestamptz, str_due timestamptz,
  swept integer, reason text,
  primary key (c_h, state, told_h, block)
) on commit drop;

create or replace function tests.rc_grid(p_job uuid, p_customer uuid, p_worker uuid, p_stranger uuid)
returns integer language plpgsql as $$
declare
  v_block text; v_c integer; v_state text; v_told integer;
  v_cat timestamptz; v_tat timestamptz;
  v_expected timestamptz; v_old timestamptz;
  v_cust timestamptz; v_work timestamptz; v_str timestamptz;
  v_swept integer; v_reason text;
  v_row public.jobs;
  v_n integer := 0;
begin
  foreach v_block in array array['none', 'approved', 'card_dispute', 'refund', 'reversed', 'open_issue'] loop
  foreach v_c in array array[71, 73, 100, 167, 168, 169] loop
  foreach v_state in array array['none', 'pending', 'sent', 'skipped', 'failed'] loop
  foreach v_told in array (case when v_state in ('none', 'pending') then array[-1]
                                else array(select distinct t from unnest(array[0, 71, 72, 73, v_c]) t where t <= v_c order by t) end) loop
    v_cust := null; v_work := null; v_str := null; v_swept := null; v_reason := null;
    begin
      v_cat := now() - make_interval(hours => v_c);
      update public.jobs set completed_at = v_cat where id = p_job;   -- SURGERY
      v_tat := null;
      if v_state = 'none' then
        delete from public.notification_outbox where id = tests.rc_notice(p_customer, p_job);   -- SURGERY: never told
      elsif v_state in ('sent', 'skipped', 'failed') then
        update public.notification_outbox
           set status = v_state, sent_at = case when v_state = 'sent' then now() end
         where id = tests.rc_notice(p_customer, p_job);   -- SURGERY: as the drain writes it; the trigger stamps now()
        v_tat := now() - make_interval(hours => v_told);
        if v_told > 0 then
          update public.jobs set completion_told_at = v_tat where id = p_job;   -- SURGERY: told v_told hours ago
        end if;
      end if;

      if v_block = 'approved' then
        perform tests.authenticate_as(p_customer);
        perform public.release_job_payment(p_job);
        perform tests.clear_auth();
      elsif v_block = 'card_dispute' then
        update public.payments set chargeback_at = now() where job_id = p_job and kind = 'job_payment';   -- SURGERY
      elsif v_block = 'refund' then
        update public.payments set refund_cents = 500 where job_id = p_job and kind = 'job_payment';   -- SURGERY
      elsif v_block = 'reversed' then
        update public.payments set transfer_reversed_at = now() where job_id = p_job and kind = 'job_payment';   -- SURGERY
      elsif v_block = 'open_issue' then
        perform tests.authenticate_as(p_customer);
        perform public.open_job_dispute(p_job, 'incomplete', 'Release clock grid report');
        perform tests.clear_auth();
      end if;

      -- The expected moment, from the Terms: the earlier of told + 72 h and completion + 7 days;
      -- none while anything holds the payment.
      v_expected := case when v_block = 'none'
                         then least(v_tat + interval '72 hours', v_cat + interval '168 hours') end;
      -- The old rule's moment (20260930000100): 72 h after completion once told, 7 days at most.
      v_old := case when v_block = 'none'
                    then least(case when v_tat is not null then greatest(v_cat + interval '72 hours', v_tat) end,
                               v_cat + interval '168 hours') end;

      perform tests.authenticate_as(p_customer);
      select public.release_due_at(j) into v_cust from public.jobs j where j.id = p_job;
      perform tests.authenticate_as(p_worker);
      select public.release_due_at(j) into v_work from public.jobs j where j.id = p_job;
      perform tests.clear_auth();
      select * into v_row from public.jobs where id = p_job;
      perform tests.authenticate_as(p_stranger);
      v_str := public.release_due_at(v_row);
      perform tests.clear_auth();

      v_swept := public.auto_release_due_payments();
      select p.release_reason into v_reason from public.payments p where p.job_id = p_job and p.kind = 'job_payment';
      raise exception 'rc_grid_rollback';
    exception when raise_exception then
      if sqlerrm <> 'rc_grid_rollback' then raise; end if;
    end;
    perform tests.clear_auth();
    insert into rc_grid_rows values (v_c, v_state, v_told, v_block, v_expected, v_old,
                                     v_cust, v_work, v_str, v_swept, v_reason);
    v_n := v_n + 1;
  end loop; end loop; end loop; end loop;
  return v_n;
end $$;

select is(tests.rc_grid(:'jg', :'customer', :'worker', :'stranger'), 540, '1: the grid ran 540 cases');
select is((select string_agg(format('%s:%s:%s', block, n, nn), ',' order by block)
             from (select block, count(*) n, count(*) filter (where cust_due is not null) nn from rc_grid_rows group by block) s),
  'approved:90:0,card_dispute:90:0,none:90:90,open_issue:90:0,refund:90:0,reversed:90:0',
  '1: 90 cases per block; the customer sees a deadline only when nothing holds the payment (null whenever blocked)');
select is((select string_agg(format('%sh %s told %s %s: expected %s got %s', c_h, state, told_h, block, expected, cust_due), '; ')
             from rc_grid_rows where cust_due is distinct from expected),
  null, '1: customer: release_due_at is the expected moment in every case (computed in this test; null whenever blocked)');
select is((select string_agg(format('%sh %s told %s %s: expected %s got %s', c_h, state, told_h, block, expected, work_due), '; ')
             from rc_grid_rows where work_due is distinct from expected),
  null, '1: worker: the same moment in every case');
select is((select count(*) from rc_grid_rows where str_due is not null), 0::bigint,
  '1: stranger: null in every case, even holding the stored row');
select is((select string_agg(format('%sh %s told %s %s: swept %s reason %s', c_h, state, told_h, block, swept, reason), '; ')
             from rc_grid_rows
            where not case when expected <= now() then swept = 1 and reason = 'auto_approved'
                           else swept = 0 and reason is not distinct from (case when block = 'approved' then 'approved' end) end),
  null, '1: the sweep releases (auto_approved) exactly the cases whose expected moment has come, and touches no other');
select is((select count(*) from rc_grid_rows where coalesce(cust_due <= now(), false) <> (swept = 1)), 0::bigint,
  '1: ONE DEFINITION: the app''s field says "due" exactly when the sweep releases');
select is((select string_agg(format('%s:%s:%s', state, n, d), ',' order by state)
             from (select state, count(*) n, count(*) filter (where swept = 1) d from rc_grid_rows where block = 'none' group by state) s),
  'failed:26:18,none:6:2,pending:6:2,sent:26:18,skipped:26:18',
  '1: nothing holding it: cases and releases per told state (never told and pending wait for the 7 days)');
select is((select count(*) filter (where swept = 1) from rc_grid_rows), 58::bigint,
  '1: 58 of the 540 cases release; every one of them has nothing holding it');
select ok((select count(*) filter (where cust_due < old_moment) = 0 and count(*) filter (where cust_due > old_moment) > 0
             from rc_grid_rows where block = 'none'),
  '1: NO CUSTOMER GETS LESS TIME: no case''s deadline is earlier than the old rule''s moment, and a customer told late gets more');

-- ---------------------------------------------------------------------------
-- §2. THE TOLD TIME: every writer stamps it, once; nothing else does.
-- ---------------------------------------------------------------------------
-- T1, resolve_notification (send-push's path): pending does not stamp, sent does, then never moves.
select tests.rc_job(:'customer', :'worker', 'RC T1 resolve') as t1 \gset
select tests.rc_notice(:'customer', :'t1') as n1 \gset
select tests.rc_resolve(:'n1', 'pending', 'retry later');
select is((select completion_told_at from public.jobs where id = :'t1'), null::timestamptz,
  '2: service: a notice resolved back to pending (a retry) is not told');
select tests.authenticate_as(:'customer');
select is((select public.release_due_at(j) from public.jobs j where j.id = :'t1'), now() + interval '168 hours',
  '2: customer: not told yet, the deadline is completion + 7 days');
select tests.clear_auth();
select tests.rc_resolve(:'n1', 'sent');
select is((select completion_told_at from public.jobs where id = :'t1'), now(),
  '2: service: resolved sent, the told time is written (now)');
select tests.authenticate_as(:'customer');
select is((select public.release_due_at(j) from public.jobs j where j.id = :'t1'), now() + interval '72 hours',
  '2: customer: told now, the deadline is now + 72 hours');
select tests.clear_auth();
update public.jobs set completion_told_at = now() - interval '5 hours' where id = :'t1';   -- SURGERY: told 5 hours ago
select tests.rc_resolve(:'n1', 'failed', 'a later write');
select is((select completion_told_at from public.jobs where id = :'t1'), now() - interval '5 hours',
  '2: a later final write never moves the told time');

-- T2: other rows never stamp; claim_notification_batch's failed write does.
select tests.rc_job(:'customer', :'worker', 'RC T2 claim') as t2 \gset
insert into public.notification_outbox (recipient_id, category, type, title, body, data, status)
values (:'worker', 'jobs', 'job_completed', 'probe', 'probe', jsonb_build_object('jobId', :'t2'::text), 'sent');   -- SURGERY: the worker as recipient
insert into public.notification_outbox (recipient_id, category, type, title, body, data, status)
values (:'customer', 'job_updates', 'job_assigned', 'probe', 'probe', jsonb_build_object('jobId', :'t2'::text), 'sent');   -- SURGERY: another type
select is((select completion_told_at from public.jobs where id = :'t2'), null::timestamptz,
  '2: runner: a final job_completed row for someone other than the customer, and a final row of another type, do not tell the customer');
select lives_ok($$ insert into public.notification_outbox (recipient_id, category, type, title, body, data, status)
                   values ((select client_id from public.jobs where title = 'RC T2 claim'), 'jobs', 'job_completed', 'probe', 'probe', '{"jobId": "not-a-uuid"}'::jsonb, 'sent') $$,
  '2: runner: a final job_completed row whose jobId is not a uuid writes without error');
select lives_ok($$ insert into public.notification_outbox (recipient_id, category, type, title, body, data, status)
                   values ((select client_id from public.jobs where title = 'RC T2 claim'), 'jobs', 'job_completed', 'probe', 'probe', '{}'::jsonb, 'skipped') $$,
  '2: runner: … and so does one with no jobId at all');
update public.notification_outbox set attempts = 5 where id = tests.rc_notice(:'customer', :'t2');   -- SURGERY: five attempts used
select tests.rc_claim();
select is((select o.status || '/' || (j.completion_told_at = now())::text
             from public.jobs j join public.notification_outbox o on o.id = tests.rc_notice(:'customer', :'t2') where j.id = :'t2'),
  'failed/true', '2: service: claim_notification_batch ends the notice failed, and that writes the told time');

-- T3: a job that is not completed has no deadline; skipped (no device) tells.
select tests.rc_hire(:'customer', :'worker', 'RC T3 skipped') as t3 \gset
select tests.test_fund_job(:'t3');
select tests.authenticate_as(:'customer');
select is((select public.release_due_at(j) from public.jobs j where j.id = :'t3'), null::timestamptz,
  '2: customer: a hired, paid job that is not completed has no deadline');
select tests.clear_auth();
select tests.rc_work(:'worker', :'t3');
select tests.rc_resolve(tests.rc_notice(:'customer', :'t3'), 'skipped', 'no active push tokens');
select tests.authenticate_as(:'worker');
select is((select public.release_due_at(j) from public.jobs j where j.id = :'t3'), now() + interval '72 hours',
  '2: worker: the customer has no device (skipped) yet the feed shows the notice, so the 72 hours run from now');
select tests.clear_auth();
-- The stored row with its customer replaced by the caller, passed in as the caller.
create or replace function tests.rc_forged_due(p_job uuid, p_as uuid) returns timestamptz language plpgsql as $$
declare
  v_row public.jobs;
  v_due timestamptz;
begin
  select * into v_row from public.jobs where id = p_job;
  v_row.client_id := p_as;
  perform tests.authenticate_as(p_as);
  v_due := public.release_due_at(v_row);
  perform tests.clear_auth();
  return v_due;
end $$;
select is(tests.rc_forged_due(:'t3', :'customer'), now() + interval '72 hours',
  '2: control: the customer passing the row gets the deadline');
select is(tests.rc_forged_due(:'t3', :'stranger'), null::timestamptz,
  '2: stranger: a row that names the stranger as its customer still gets null (the parties are read from the stored job)');
-- The old sweep's two refusals the grid does not vary: the provider and the held status.
update public.jobs set completed_at = now() - interval '8 days', completion_told_at = now() - interval '8 days' where id = :'t3';   -- SURGERY
update public.payments set provider = 'sandbox' where job_id = :'t3' and kind = 'job_payment';   -- SURGERY
select is(public.auto_approval_deadline(:'t3'), null::timestamptz, '2: a sandbox row has no deadline, however old');
update public.payments set provider = 'stripe', status = 'authorized' where job_id = :'t3' and kind = 'job_payment';   -- SURGERY
select is(public.auto_approval_deadline(:'t3'), null::timestamptz, '2: a row that is not held has no deadline');
update public.payments set status = 'held' where job_id = :'t3' and kind = 'job_payment';   -- SURGERY: back to held, 8 days old
select is(public.auto_approval_deadline(:'t3'), now() - interval '8 days' + interval '72 hours', '2: control: held and stripe again, the deadline is back (and long past)');
update public.jobs set completed_at = now(), completion_told_at = now() where id = :'t3';   -- SURGERY: as it was, so no later sweep finds it due

-- ---------------------------------------------------------------------------
-- §3. THE FILL (release_clock_fill), for notices that were final before release_clock.
-- ---------------------------------------------------------------------------
-- F1 sent, F2 skipped, F4 failed: still held, so the fill writes them. F3 pending: not told.
-- F5 paid out, F6 refunded, F7 approved by the customer: settled or on its way, so no write.
select tests.rc_job(:'customer2', :'worker', 'RC F1 sent') as f1 \gset
select tests.rc_job(:'customer2', :'worker', 'RC F2 skipped') as f2 \gset
select tests.rc_job(:'customer2', :'worker', 'RC F3 pending') as f3 \gset
select tests.rc_job(:'customer2', :'worker', 'RC F4 failed') as f4 \gset
select tests.rc_job(:'customer2', :'worker', 'RC F5 paid') as f5 \gset
select tests.rc_job(:'customer2', :'worker', 'RC F6 refunded') as f6 \gset
select tests.rc_job(:'customer2', :'worker', 'RC F7 approved') as f7 \gset
select tests.authenticate_as(:'customer2');
select public.release_job_payment(:'f7');
select tests.clear_auth();
update public.payments set status = 'paid_out' where job_id = :'f5' and kind = 'job_payment';   -- SURGERY: paid before the fill
update public.payments set status = 'refunded', refund_cents = amount_cents where job_id = :'f6' and kind = 'job_payment';   -- SURGERY: refunded before the fill
alter table public.notification_outbox disable trigger notification_outbox_completion_told;   -- SURGERY: the database before release_clock
update public.notification_outbox set status = 'sent', sent_at = now() - interval '10 hours'
 where id in (tests.rc_notice(:'customer2', :'f1'), tests.rc_notice(:'customer2', :'f5'),
              tests.rc_notice(:'customer2', :'f6'), tests.rc_notice(:'customer2', :'f7'));   -- SURGERY
update public.notification_outbox set status = 'skipped', created_at = now() - interval '20 hours'
 where id = tests.rc_notice(:'customer2', :'f2');   -- SURGERY
update public.notification_outbox set status = 'failed', created_at = now() - interval '30 hours'
 where id = tests.rc_notice(:'customer2', :'f4');   -- SURGERY
alter table public.notification_outbox enable trigger notification_outbox_completion_told;
select is((select count(*) from public.jobs where id in (:'f1', :'f2', :'f3', :'f4', :'f5', :'f6', :'f7') and completion_told_at is null), 7::bigint,
  '3: runner: seven completed jobs with no told time (six notices final before the trigger, one pending)');
select is(public.fill_completion_told_at(), 3, '3: the fill writes exactly the three final notices whose payment is still held, unasked');
select is((select string_agg(coalesce((completion_told_at - now())::text, 'null'), ',' order by title)
             from public.jobs where id in (:'f1', :'f2', :'f3', :'f4', :'f5', :'f6', :'f7')),
  '-10:00:00,00:00:00,null,00:00:00,null,null,null',
  '3: sent: its sent_at; skipped and failed: the fill''s own time (their final moment is unknown); pending, paid out, refunded, approved: no write');
select is((select completion_told_at from public.jobs where id = :'t1'), now() - interval '5 hours',
  '3: a told time already written is never overwritten');
select is(public.fill_completion_told_at(), 0, '3: a second fill writes nothing');

-- ---------------------------------------------------------------------------
-- §4. CLOCK CHANGES (America/New_York): hours, not days.
-- ---------------------------------------------------------------------------
select tests.rc_job(:'customer2', :'worker', 'RC D1 spring') as d1 \gset
select tests.rc_job(:'customer2', :'worker', 'RC D2 fall') as d2 \gset
set local timezone = 'America/New_York';
select ok(timestamptz '2026-03-04 12:00:00-05' + interval '7 days' = timestamptz '2026-03-11 16:00:00+00'
          and timestamptz '2026-10-28 12:00:00-04' + interval '7 days' = timestamptz '2026-11-04 17:00:00+00'
          and timestamptz '2026-03-05 12:00:00-05' + interval '3 days' = timestamptz '2026-03-08 16:00:00+00'
          and timestamptz '2026-10-29 12:00:00-04' + interval '3 days' = timestamptz '2026-11-01 17:00:00+00',
  '4: control: in this session "7 days" and "3 days" across 2026-03-08 02:00 and 2026-11-01 01:00 are an hour short or long (so a days rule would fail below)');
update public.jobs set completed_at = '2026-03-04 12:00:00-05', completion_told_at = null where id = :'d1';   -- SURGERY
update public.jobs set completed_at = '2026-10-28 12:00:00-04', completion_told_at = null where id = :'d2';   -- SURGERY
select is(public.auto_approval_deadline(:'d1'), timestamptz '2026-03-11 17:00:00+00',
  '4: spring: never told, completion + exactly 168 hours across 2026-03-08 02:00');
select is(public.auto_approval_deadline(:'d2'), timestamptz '2026-11-04 16:00:00+00',
  '4: fall: never told, completion + exactly 168 hours across 2026-11-01 01:00');
update public.jobs set completion_told_at = '2026-03-05 12:00:00-05' where id = :'d1';   -- SURGERY
update public.jobs set completion_told_at = '2026-10-29 12:00:00-04' where id = :'d2';   -- SURGERY
select is(public.auto_approval_deadline(:'d1'), timestamptz '2026-03-08 17:00:00+00',
  '4: spring: told, told + exactly 72 hours across 2026-03-08 02:00');
select is(public.auto_approval_deadline(:'d2'), timestamptz '2026-11-01 16:00:00+00',
  '4: fall: told, told + exactly 72 hours across 2026-11-01 01:00');
select tests.authenticate_as(:'customer2');
select is((select string_agg(public.release_due_at(j)::text, ',' order by j.title) from public.jobs j where j.id in (:'d1', :'d2')),
  '2026-03-08 13:00:00-04,2026-11-01 11:00:00-05',
  '4: customer: release_due_at gives the same moments (shown in New York time)');
select tests.clear_auth();
reset timezone;
update public.jobs set completed_at = now(), completion_told_at = now() where id in (:'d1', :'d2');   -- SURGERY: back to now, so no later sweep finds them due

-- ---------------------------------------------------------------------------
-- §5. ONE DEFINITION, in the catalog.
-- ---------------------------------------------------------------------------
select ok((select prosrc like '%auto_approval_deadline(%' and prosrc !~* '72 hours|168 hours|7 days|notification_outbox'
             from pg_proc where oid = 'public.auto_release_due_payments()'::regprocedure),
  '5: the sweep reads the rule and restates none of it');
select ok((select prosrc like '%auto_approval_deadline(%' and prosrc !~* '72 hours|168 hours|7 days'
             from pg_proc where oid = 'public.release_due_at(public.jobs)'::regprocedure),
  '5: the app''s field reads the rule and restates none of it');
select is((select string_agg(p.proname, ',' order by p.proname) from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prosrc ~* 'completion_told_at\s*\+\s*interval'),
  'auto_approval_deadline', '5: the 72 hours from the told time are written in exactly one function');
select ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                        and p.proname <> 'auto_approval_deadline'
                        and p.prosrc ~* 'completed_at\s*\+\s*interval\s*''(7 days|168 hours)'''),
  '5: … and so is the 7-day limit');

-- ---------------------------------------------------------------------------
-- §6. LOCK, THEN DECIDE: a decision made after the sweep read its candidates is never written over.
-- ---------------------------------------------------------------------------
-- L1 and L2 are both due. A test-only trigger stands for the other customer approving (the write
-- release_job_payment makes) after the sweep's candidate read and before the sweep reaches that
-- row: when the sweep writes one, the trigger approves the other. One session cannot interleave two
-- transactions; two overlapping sessions are not run here.
select tests.rc_job(:'customer3', :'worker', 'RC L1 pair') as l1 \gset
select tests.rc_job(:'customer3', :'worker', 'RC L2 pair') as l2 \gset
update public.jobs set completed_at = now() - interval '100 hours', completion_told_at = now() - interval '80 hours'
 where id in (:'l1', :'l2');   -- SURGERY: both due 8 hours ago
create temp table rc_pair (payment_id uuid primary key) on commit drop;
insert into rc_pair select id from public.payments where job_id in (:'l1', :'l2') and kind = 'job_payment';
create or replace function tests.rc_pair_approve() returns trigger language plpgsql as $$
begin
  if new.release_reason = 'auto_approved' and old.release_requested_at is null
     and exists (select 1 from rc_pair where payment_id = new.id) then
    update public.payments p
       set release_requested_at = now(), release_reason = 'approved',
           transfer_cents = p.amount_cents - p.platform_fee_cents, updated_at = now()
     where p.id in (select payment_id from rc_pair where payment_id <> new.id)
       and p.release_requested_at is null;   -- SURGERY: the other customer's approval
  end if;
  return null;
end $$;
create trigger rc_pair_approve after update on public.payments
  for each row execute function tests.rc_pair_approve();   -- SURGERY: test-only, disabled below
select is((select count(*) from rc_pair r join public.payments p on p.id = r.payment_id
            where public.auto_approval_deadline(p.job_id) <= now()), 2::bigint,
  '6: runner: both payments are due before the sweep (both are candidates)');
select is(public.auto_release_due_payments(), 1,
  '6: the sweep writes one: the other was approved after its candidate read');
select is((select string_agg(p.release_reason, ',' order by p.release_reason) from rc_pair r join public.payments p on p.id = r.payment_id),
  'approved,auto_approved',
  '6: the approval that came after the candidate read stands; the sweep did not write over it');
alter table public.payments disable trigger rc_pair_approve;

-- ---------------------------------------------------------------------------
-- §7. CLOCK CASES beyond the grid.
-- ---------------------------------------------------------------------------
-- C1: a completed row with no completion time has no deadline.
select tests.rc_job(:'customer3', :'worker', 'RC C1 no completion time') as c1 \gset
update public.jobs set completed_at = null, completion_told_at = now() - interval '80 hours' where id = :'c1';   -- SURGERY: no completion time, told long ago
select is(public.auto_approval_deadline(:'c1'), null::timestamptz,
  '7: no completion time: no deadline, however long ago the customer was told');

-- C2: an issue opened, then withdrawn: the deadline comes back where it was, not restarted.
select tests.rc_job(:'customer3', :'worker', 'RC C2 issue withdrawn') as c2 \gset
update public.jobs set completed_at = now() - interval '100 hours', completion_told_at = now() - interval '80 hours' where id = :'c2';   -- SURGERY
select tests.authenticate_as(:'customer3');
select id as c2_issue from public.open_job_dispute(:'c2', 'incomplete', 'Release clock issue probe') \gset
select is((select public.release_due_at(j) from public.jobs j where j.id = :'c2'), null::timestamptz,
  '7: customer: an open issue holds the payment: no deadline');
select public.withdraw_job_dispute(:'c2_issue');
select is((select public.release_due_at(j) from public.jobs j where j.id = :'c2'), now() - interval '8 hours',
  '7: customer: the issue withdrawn, the deadline is told + 72 hours again (not restarted from the withdrawal)');
select tests.clear_auth();

-- C3: told after the 7 days had already run out: the cap decides.
select tests.rc_job(:'customer3', :'worker', 'RC C3 told after the cap') as c3 \gset
update public.jobs set completed_at = now() - interval '200 hours', completion_told_at = now() - interval '10 hours' where id = :'c3';   -- SURGERY: told 190 hours after completion
select is(public.auto_approval_deadline(:'c3'), now() - interval '32 hours',
  '7: told after the cap: completion + 168 hours still bounds it');

-- C4: a held tip beside the held job payment (begin_tip_payment waits for the release, so the
-- row is written here: the join's worst case).
select tests.rc_job(:'customer3', :'worker', 'RC C4 tip beside') as c4 \gset
update public.jobs set completed_at = now() - interval '100 hours', completion_told_at = now() - interval '80 hours' where id = :'c4';   -- SURGERY
insert into public.payments (job_id, offer_id, payer_id, payee_id, kind, amount_cents, platform_fee_cents,
                             customer_fee_cents, tax_cents, provider, status)
select j.id, j.accepted_offer_id, j.client_id, j.assigned_worker_id, 'tip', 100, 0, 0, 0, 'stripe', 'held'
  from public.jobs j where j.id = :'c4';   -- SURGERY: a held tip
select is(public.auto_approval_deadline(:'c4'), now() - interval '8 hours',
  '7: a held tip beside the job payment does not change the deadline');

-- C5: a failed and a voided older checkout beside the held one.
select tests.rc_hire(:'customer3', :'worker', 'RC C5 older checkouts') as c5 \gset
select tests.authenticate_as(:'customer3');
select id as c5_a from public.begin_job_payment(:'c5') \gset
select tests.clear_auth();
update public.payments set status = 'failed', last_error = 'card declined' where id = :'c5_a';   -- SURGERY: the first checkout failed
select tests.authenticate_as(:'customer3');
select id as c5_b from public.begin_job_payment(:'c5') \gset
select tests.clear_auth();
update public.payments set status = 'voided', last_error = 'funding window expired' where id = :'c5_b';   -- SURGERY: the second one voided
select tests.test_fund_job(:'c5');
select tests.rc_work(:'worker', :'c5');
update public.jobs set completed_at = now() - interval '100 hours', completion_told_at = now() - interval '80 hours' where id = :'c5';   -- SURGERY
select is(public.auto_approval_deadline(:'c5'), now() - interval '8 hours',
  '7: a failed and a voided older checkout beside the held one do not change the deadline');

-- C6 (A7-08): a recorded failed refund on the held payment reserves the whole charge
-- (payment_refund_reserved_cents, the reservation transfers_due reads).
select tests.rc_job(:'customer3', :'worker', 'RC C6 refund failed') as c6 \gset
update public.jobs set completed_at = now() - interval '100 hours', completion_told_at = now() - interval '80 hours' where id = :'c6';   -- SURGERY
insert into public.payment_refund_failures (refund_ref, payment_id, amount_cents, failure_reason)
select 're_rc_c6_failed', p.id, 500, 'expired_or_canceled_card'
  from public.payments p where p.job_id = :'c6' and p.kind = 'job_payment' and p.status = 'held';   -- SURGERY: a failed refund recorded
select is(public.auto_approval_deadline(:'c6'), null::timestamptz,
  '7: A7-08: a recorded failed refund holds the payment: no deadline (the reservation transfers_due reads)');

-- One sweep with payments paused (checkout closed): a payment already held keeps its clock.
update public.app_config set value = 'false'::jsonb where key = 'paymentsEnabled';   -- SURGERY: the owner pauses payments
select is((select value from public.app_config where key = 'paymentsEnabled'), 'false'::jsonb,
  '7: runner: payments are paused (no checkout can start)');
-- A7-06 CONTROL: p_run while record_timer_run raises (the report fails), all of it undone after
-- (the replaced body too, in this block). Answers "<the run's answer>/<how much p_count grew>", or
-- "raised: <error>" when the failed report undid the run (the old bare record_timer_run line).
create or replace function tests.run_with_report_failing(p_run text, p_count text) returns text language plpgsql as $$
declare v_before bigint; v_run text; v_after bigint;
begin
  execute p_count into v_before;
  create or replace function public.record_timer_run(p_name text, p_error text default null, p_stale_after interval default null)
    returns void language plpgsql as $b$ begin raise exception 'the report fails'; end $b$;
  execute 'select (' || p_run || ')::text' into v_run;
  execute p_count into v_after;
  raise exception using errcode = 'TR001', message = v_run || '/' || (v_after - v_before);
exception
  when sqlstate 'TR001' then return sqlerrm;
  when others then return 'raised: ' || sqlerrm;
end $$;
select is(tests.run_with_report_failing('public.auto_release_due_payments()',
                                          'select count(*) from public.payments where release_reason = ''auto_approved'''),
  '4/4', '7: A7-06: with the report failing, the same sweep still releases its four and returns 4 (undone after)');
update public.timer_runs set ok_at = now() - interval '1 day' where name = 'auto-release-due-payments';   -- SURGERY (TIMERS): only the next run can write now()
select is(public.auto_release_due_payments(), 4,
  '7: the sweep releases C2, C3, C4 and C5 while payments are paused, and nothing else');
select is((select (ok_at = now())::text || '/' || stale_after::text || '/' || (failing_since is null)::text
             from public.timer_runs where name = 'auto-release-due-payments'), 'true/00:40:00/true',
  '7: … and that same run reported itself to timer_runs (TIMERS: late after 40 minutes)');
select is((select string_agg(j.title || ':' || p.kind || ':' || coalesce(p.release_reason, 'none') || ':' || p.status,
                             ',' order by j.title, p.kind, p.status::text)
             from public.payments p join public.jobs j on j.id = p.job_id
            where j.id in (:'c1', :'c2', :'c3', :'c4', :'c5')),
  'RC C1 no completion time:job_payment:none:held,'
  'RC C2 issue withdrawn:job_payment:auto_approved:held,'
  'RC C3 told after the cap:job_payment:auto_approved:held,'
  'RC C4 tip beside:job_payment:auto_approved:held,RC C4 tip beside:tip:none:held,'
  'RC C5 older checkouts:job_payment:none:failed,RC C5 older checkouts:job_payment:auto_approved:held,RC C5 older checkouts:job_payment:none:voided',
  '7: only the held job payments are released: not the job with no completion time, not the tip, not the failed or voided checkouts');
select is((select coalesce(p.release_reason, 'none') || ':' || p.status from public.payments p
            where p.job_id = :'c6' and p.kind = 'job_payment'), 'none:held',
  '7: A7-08: … and the sweep leaves C6 held and unreleased');
update public.app_config set value = 'true'::jsonb where key = 'paymentsEnabled';   -- SURGERY: resumed

select * from finish();
rollback;
