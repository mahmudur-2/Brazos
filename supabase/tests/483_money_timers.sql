-- 483_money_timers.sql — money M2-1 (critic A4-09, money_timers): every automatic
-- money task I own has an expected row from the commit of its first record_timer_run caller, and so
-- do the lifecycle's three sweeps (A9 PART 2 c); a task that never reported is late after
-- expected_from + stale_after, and the two SQL tasks report each run, through report_timer_run, so a
-- report that fails with an ordinary error never undoes the run (A9-07, D); a statement timeout or a
-- cancel during the report still does (A12-05, report_timer_run's limit; not tested here). The edge
-- function's own report is tests/settlementRun.test.mjs.
--
-- FIXTURE SURGERY, DECLARED (now() is fixed inside a transaction): timer_runs.expected_from and ok_at
-- are moved back to make a task late; a payment's funding_due_at is moved back so the funding sweep
-- has a row to void; one processed event is stored 91 days old so the prune has a payload to remove;
-- record_timer_run is replaced by a body that raises (D, the red control's fault). Everything rolls
-- back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

create or replace function tests.tm_lines(p_name text) returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || a.ref || '/' || a.finish || '/' || coalesce(a.since::text, 'no since'), ' | ' order by a.code),
                  '<none>')
    from public.payment_attention a where a.what = 'system' and a.ref = 'task:' || p_name
$$;

-- E. The expected rows: the three tasks whose first caller is in this commit, and the lifecycle's three sweeps.
select is((select string_agg(name || '=' || stale_after::text, ',' order by name) from public.timer_runs where expected_from is not null),
  'auto-release-due-payments=00:40:00,brazos-admin-attention=00:40:00,brazos-job-series=04:00:00,brazos-process-settlements=00:20:00,brazos-prune-payment-events=25:00:00,close-unpaid-hires=01:00:00,expire-unfunded-payments=01:00:00',
  'E1: seven expected rows, each with its interval (A9 PART 2 c: the lifecycle''s sweeps, late after 40 minutes, 60 minutes and 4 hours; O1: the admin notice timer, late after 40 minutes)');
-- M2-3: the database's own scheduler runs the two SQL tasks every 15 minutes and every day, so a report
-- can already exist when this file runs; one made before its expected_from cannot.
select is((select count(*)::integer from public.timer_runs
            where expected_from is not null
              and (expected_from > now() or ok_at < expected_from or failing_since < expected_from)), 0,
  'E2: no expected row starts in the future, and no report predates its expected_from');
-- SURGERY (A9, item 6): a fresh fixture, so E3 does not depend on the minutes since the install: the
-- edge function is expected from now and has not reported yet.
update public.timer_runs set expected_from = now(), ok_at = null, failing_since = null, failed_at = null, error = null
 where name = 'brazos-process-settlements';
select is(tests.tm_lines('brazos-process-settlements'), '<none>', 'E3: a task within its interval is not listed');

-- L. A task that never reported is late.
-- SURGERY: the edge function was expected 21 minutes ago and never reported.
update public.timer_runs set expected_from = now() - interval '21 minutes' where name = 'brazos-process-settlements';
select is(tests.tm_lines('brazos-process-settlements'),
  'timer_late/task:brazos-process-settlements/developer/' || (now() - interval '1 minute')::text,
  'L1 (A4-09 i): never reported after 20 minutes: timer_late, since expected_from + 20 minutes');
select is((select a.reason from public.payment_attention a where a.ref = 'task:brazos-process-settlements'),
  'An automatic task has not finished on time. Ask your developer.', 'L2: the plain sentence of timer_late');
select ok((select a.detail from public.payment_attention a where a.ref = 'task:brazos-process-settlements') like 'task brazos-process-settlements: never reported since %',
  'L3: the detail says it never reported');

set local role service_role;
select public.record_timer_run('brazos-process-settlements', 'refunds: 1 defect');
reset role;
select is(tests.tm_lines('brazos-process-settlements'), 'timer_failed/task:brazos-process-settlements/developer/' || now()::text,
  'L4: its first report is a failure: timer_failed (the never-reported line ends)');
set local role service_role;
select public.record_timer_run('brazos-process-settlements', null);
reset role;
select is(tests.tm_lines('brazos-process-settlements'), '<none>', 'L5: a good run clears it');
-- SURGERY: the last good run was 21 minutes ago.
update public.timer_runs set ok_at = now() - interval '21 minutes' where name = 'brazos-process-settlements';
select is(tests.tm_lines('brazos-process-settlements'),
  'timer_late/task:brazos-process-settlements/developer/' || (now() - interval '1 minute')::text,
  'L6: after a good run, late again by the M1 rule (ok_at + stale_after); one line, not two');

-- S. The two SQL tasks report each run.
set local role service_role;
select count(*) from public.expire_unfunded_payments();
select public.prune_payment_event_payloads();
reset role;
select is((select string_agg(name || ':' || (ok_at = now())::text || ':' || coalesce(error, 'no error') || ':' || stale_after::text, ',' order by name)
             from public.timer_runs where name in ('expire-unfunded-payments', 'brazos-prune-payment-events')),
  'brazos-prune-payment-events:true:no error:25:00:00,expire-unfunded-payments:true:no error:01:00:00',
  'S1: each run is reported as a good run, with its interval kept');
-- SURGERY: the funding sweep last ran 61 minutes ago.
update public.timer_runs set ok_at = now() - interval '61 minutes' where name = 'expire-unfunded-payments';
select is(tests.tm_lines('expire-unfunded-payments'),
  'timer_late/task:expire-unfunded-payments/developer/' || (now() - interval '1 minute')::text,
  'S2: a funding sweep that stops is late after 1 hour');
select is((select count(*)::integer from cron.job where jobname in ('expire-unfunded-payments', 'brazos-prune-payment-events', 'brazos-process-settlements')),
  3, 'S3: the three names are the cron jobs'' names');

-- D. A9-07: a report that fails with an ordinary error never undoes the sweep (report_timer_run
-- catches it; a cancelled statement it does not catch).
select tests.create_user('tm.c1@brazos.test', 'Tam Customer') as c1 \gset
select tests.create_user('tm.w1@brazos.test', 'Tim Worker')   as w1 \gset
create or replace function tests.tm_try(p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  execute p_sql into v_out;
  return 'ok: ' || coalesce(v_out, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;
create or replace function tests.tm_unfunded(p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
  v_pid uuid;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := 'TM-D lapsed checkout', p_description := 'Money timers probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '3 Timer Lane'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Timer bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  v_pid := (public.begin_job_payment(v_job)).id;
  perform tests.clear_auth();
  perform public.attach_provider_ref(v_pid, 'pi_tm_' || left(md5(v_pid::text), 12));
  -- SURGERY: the funding window ended a minute ago.
  update public.payments set funding_due_at = now() - interval '1 minute' where id = v_pid;
  return v_pid;
end $$;
select tests.tm_unfunded(:'c1', :'w1') as dp \gset
-- SURGERY: one processed event, 91 days old, its payload still whole.
insert into public.payment_events (id, type, payload, received_at, processed_at)
values ('evt_tm_d_old', 'charge.refunded', '{"id": "evt_tm_d_old", "type": "charge.refunded", "data": {"object": {}}}'::jsonb,
        now() - interval '91 days', now() - interval '91 days');
-- The fault: every report raises.
create or replace function public.record_timer_run(p_name text, p_error text default null, p_stale_after interval default null)
returns void language plpgsql as $$ begin raise exception 'A9-07 probe: the report fails'; end $$;
-- As the runner (cron runs the sweeps as their owner; the sweeps are security definer).
select is(tests.tm_try(format('select count(*)::text || ''/'' || min(e.status::text) from public.expire_unfunded_payments() e where e.id = %L', :'dp')),
  'ok: 1/voided', 'D1 (A9-07): the funding sweep voids the lapsed payment though its report fails');
select is(tests.tm_try('select (public.prune_payment_event_payloads() >= 1)::text'), 'ok: true',
  'D2 (A9-07): the prune runs though its report fails');
select is((select (payload ? 'data')::text || '/' || (payload ? 'pruned_at')::text from public.payment_events where id = 'evt_tm_d_old')
          || ' ' || tests.tm_lines('expire-unfunded-payments'),
  'false/true timer_late/task:expire-unfunded-payments/developer/' || (now() - interval '1 minute')::text,
  'D3: the old payload is pruned; the failed report wrote nothing (the funding sweep is still late from S2)');

-- Z. The view is whole.
select is((select count(*)::integer from public.payment_attention a
            where not exists (select 1 from public.payment_attention_codes() s where s.code = a.code)), 0,
  'Z1: every line has a code in the map');
select is((select count(*)::integer from (select what, code, ref from public.payment_attention
                                           group by what, code, ref having count(*) > 1) d), 0,
  'Z2: what, code and ref still name one line');

select * from finish();
rollback;
