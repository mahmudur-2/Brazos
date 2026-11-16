-- 491_unpaid_pause.sql — the unpaid_pause migration (production-36h S4, step A): close_unpaid_hires
-- closes nothing while payments are paused (read exactly as begin_job_payment reads the
-- paymentsEnabled key), and nothing in the 24 hours after payments come back on; app_config's
-- updated_at is when a setting's value last changed.
--
-- THE CAST: a customer, the hired worker, and the runner (RLS bypassed) playing the service role
-- the 15-minute timer runs as. Time moves through close_unpaid_hires(p_now), as in 350. Everything
-- rolls back.
--
-- FIXTURE SURGERY, DECLARED (each line carries -- SURGERY):
--   * app_config.updated_at is set directly: 2026-01-01 for maintenanceMessage (§1), 30 days ago
--     for paymentsEnabled (§2: a long-running database; the reset wrote the row minutes ago), and
--     10 hours after the hire (§4: payments came back on then; the trigger can only write now());
--   * the paymentsEnabled row is removed once (§5), as 030 §14 does, and put back;
--   * timer_runs.ok_at of close-unpaid-hires is moved back a day before §2's closing run (TIMERS).
-- NOT RUN HERE: a pause committed by another session during a run (two overlapping sessions). By
-- construction the run holds a share lock on the paymentsEnabled row to its end, so the pause's
-- UPDATE waits for the run to commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(29);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;

select tests.create_user('up.customer@brazos.test', 'Una Customer') as customer \gset
select tests.create_user('up.worker@brazos.test',   'Ugo Worker')   as worker   \gset

-- 350_unpaid_hire_close.sql's lc_hire, as it is there.
create or replace function tests.up_hire(p_customer uuid, p_worker uuid, p_cents integer, p_title text)
returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Lifecycle probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := p_cents, p_budget_max_cents := p_cents,
    p_address_line := '4 Proof Way'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := p_cents, p_job_id := v_job, p_message := 'Lifecycle bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- ---------------------------------------------------------------------------
-- §0. ACCESS.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.app_config_touch()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.app_config_touch()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.app_config_touch()', 'EXECUTE'),
  '0: the change-time trigger function has no caller grant');
select ok(has_function_privilege('service_role', 'public.close_unpaid_hires(timestamp with time zone)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.close_unpaid_hires(timestamp with time zone)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.close_unpaid_hires(timestamp with time zone)', 'EXECUTE'),
  '0: close_unpaid_hires stays service_role only (restated)');
select ok((select pg_get_triggerdef(t.oid) like '%BEFORE UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION app_config_touch()%'
             from pg_trigger t where t.tgname = 'app_config_touch' and not t.tgisinternal),
  '0: app_config_touch runs before every update of app_config');
select ok((select (length(prosrc) - length(replace(prosrc, 'app_config', ''))) / length('app_config') = 1
                  and prosrc ~* 'paymentsEnabled''\s+for\s+share'
             from pg_proc where oid = 'public.close_unpaid_hires(timestamp with time zone)'::regprocedure),
  '0: close_unpaid_hires reads the switch exactly once, for share (value and change time from one read; a pause waits for the run to end)');

-- ---------------------------------------------------------------------------
-- §0b. THE ONE-TIME INSTALLATION GRACE: before unpaid_pause no row's updated_at was kept, so the
--      migration wrote the install time on paymentsEnabled (on). Every other row keeps its
--      insert time, which the reset wrote in an earlier migration.
-- ---------------------------------------------------------------------------
select ok((select p.updated_at > m.updated_at and p.value = 'true'::jsonb
             from public.app_config p, public.app_config m
            where p.key = 'paymentsEnabled' and m.key = 'maintenanceMode'),
  '0b: runner: paymentsEnabled carries the install time (later than the rows inserted with it), so the first sweeps give every hire 24 hours');
select ok(exists (select 1 from public.app_config where key = 'paymentsEnabled'),
  '0b: A7-05: the paymentsEnabled row exists after the install (a missing row is created as on; read only: the baseline seeds it)');
-- What the sweep does with a change time (nothing closes until it is 24 hours old) is §4.

-- ---------------------------------------------------------------------------
-- §1. THE CHANGE TIME.
-- ---------------------------------------------------------------------------
update public.app_config set updated_at = '2026-01-01 00:00:00+00' where key = 'maintenanceMessage';   -- SURGERY
update public.app_config set value = value where key = 'maintenanceMessage';
select is((select updated_at from public.app_config where key = 'maintenanceMessage'), timestamptz '2026-01-01 00:00:00+00',
  '1: an update that leaves the value as it was keeps the change time');
update public.app_config set value = '"Back soon"'::jsonb where key = 'maintenanceMessage';
select is((select updated_at from public.app_config where key = 'maintenanceMessage'), now(),
  '1: a changed value writes the change time');
update public.app_config set value = '"Back later"'::jsonb, updated_at = '2020-01-01 00:00:00+00' where key = 'maintenanceMessage';
select is((select updated_at from public.app_config where key = 'maintenanceMessage'), now(),
  '1: a changed value cannot carry an older time with it');
update public.app_config set updated_at = '2026-01-01 00:00:00+00' where key = 'maintenanceMessage';   -- SURGERY
insert into public.app_config (key, value) values ('maintenanceMessage', '""'::jsonb)
  on conflict (key) do update set value = excluded.value;
select is((select updated_at from public.app_config where key = 'maintenanceMessage'), now(),
  '1: an upsert that changes the value writes it too');

-- ---------------------------------------------------------------------------
-- §2. CONTROL: payments on for a long time; a hire closes 24 hours after it, as before.
-- ---------------------------------------------------------------------------
update public.app_config set updated_at = now() - interval '30 days' where key = 'paymentsEnabled';   -- SURGERY
select tests.up_hire(:'customer', :'worker', 4000, 'UP C control') as jc \gset
select is(public.close_unpaid_hires(now() + interval '23 hours'), 0, '2: control: 23 hours after the hire nothing closes');
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
select is(tests.run_with_report_failing('public.close_unpaid_hires(now() + interval ''25 hours'')',
                                          'select count(*) from public.jobs where status = ''cancelled'' and cancel_reason = ''unpaid'''),
  '1/1', '2: A7-06: with the report failing, the same run still closes the unpaid job and returns 1 (undone after)');
update public.timer_runs set ok_at = now() - interval '1 day' where name = 'close-unpaid-hires';   -- SURGERY (TIMERS): only the next run can write now()
select is(public.close_unpaid_hires(now() + interval '25 hours'), 1, '2: control: 25 hours after the hire the unpaid job closes');
select is((select (ok_at = now())::text || '/' || stale_after::text || '/' || (failing_since is null)::text
             from public.timer_runs where name = 'close-unpaid-hires'), 'true/01:00:00/true',
  '2: … and that same run reported itself to timer_runs (TIMERS: late after 60 minutes)');
select is((select status::text || '/' || cancel_reason from public.jobs where id = :'jc'), 'cancelled/unpaid',
  '2: control: … as unpaid, exactly as before');

-- ---------------------------------------------------------------------------
-- §3. PAUSED: the customer cannot pay, so nothing closes, however long.
-- ---------------------------------------------------------------------------
select tests.up_hire(:'customer', :'worker', 4000, 'UP A paused') as ja \gset
insert into fx values ('ja', :'ja');
update public.app_config set value = 'false'::jsonb where key = 'paymentsEnabled';
select is((select updated_at from public.app_config where key = 'paymentsEnabled'), now(),
  '3: pausing payments is a change: the change time is now');
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'ja')) $$,
  'P0001', 'Payments are paused right now. Please try again shortly.',
  '3: customer: checkout refuses while paused (the reading the sweep now shares)');
select tests.clear_auth();
select is(public.close_unpaid_hires(now() + interval '25 hours'), 0, '3: paused: 25 hours after the hire nothing closes');
select is(public.close_unpaid_hires(now() + interval '30 days'), 0, '3: paused: 30 days after the hire nothing closes');
select is((select status::text from public.jobs where id = :'ja'), 'assigned', '3: … the hire is still assigned');
update public.app_config set value = '"true"'::jsonb where key = 'paymentsEnabled';
select tests.authenticate_as(:'customer');
select throws_ok($$ select public.begin_job_payment((select v from fx where k = 'ja')) $$,
  'P0001', 'Payments are paused right now. Please try again shortly.',
  '3: customer: the string "true" is not on for checkout (only the jsonb boolean true is)');
select tests.clear_auth();
select is(public.close_unpaid_hires(now() + interval '25 hours'), 0, '3: … nor for the sweep');

-- ---------------------------------------------------------------------------
-- §4. BACK ON: a full 24 hours to pay from the moment payments came back.
-- ---------------------------------------------------------------------------
update public.app_config set value = 'true'::jsonb where key = 'paymentsEnabled';
select is((select updated_at from public.app_config where key = 'paymentsEnabled'), now(),
  '4: payments back on: the change time is now');
update public.app_config set updated_at = now() + interval '10 hours' where key = 'paymentsEnabled';   -- SURGERY: back on 10 hours after the hire
select is(public.close_unpaid_hires(now() + interval '33 hours'), 0,
  '4: 33 hours after the hire but 23 after payments came back on: nothing closes');
select is(public.close_unpaid_hires(now() + interval '35 hours'), 1,
  '4: 25 hours after payments came back on: the unpaid hire closes');
select is((select status::text || '/' || cancel_reason || '/' || (cancelled_by is null)::text from public.jobs where id = :'ja'),
  'cancelled/unpaid/true', '4: … as unpaid, closed by nobody');
select is((select count(*) from public.notification_outbox
            where recipient_id = :'customer' and type = 'job_cancelled' and data ->> 'jobId' = :'ja'::text
              and data ->> 'screen' = 'ClientJobDetail' and title = 'Your job was closed'
              and body = 'UP A paused: it was not paid within 24 hours of the hire. Post it again when you are ready.'),
  1::bigint, '4: the customer is told once, in the same words as before');
select is((select count(*) from public.notification_outbox
            where recipient_id = :'worker' and type = 'job_cancelled' and data ->> 'jobId' = :'ja'::text
              and data ->> 'screen' = 'WorkerJob' and title = 'A job was closed'
              and body = 'UP A paused: the customer did not pay within 24 hours of the hire.'),
  1::bigint, '4: the worker is told once, in the same words as before');

-- ---------------------------------------------------------------------------
-- §5. THE NAMED LIMIT: an absent key is on (begin_job_payment's reading) and carries no change
--     time, so it gives no grace.
-- ---------------------------------------------------------------------------
select tests.up_hire(:'customer', :'worker', 4000, 'UP D absent key') as jd \gset
delete from public.app_config where key = 'paymentsEnabled';   -- SURGERY: as 030 §14
select is(public.close_unpaid_hires(now() + interval '25 hours'), 1,
  '5: no paymentsEnabled row: payments are on, and the hire closes 25 hours after it');
insert into public.app_config (key, value) values ('paymentsEnabled', 'true'::jsonb);

select * from finish();
rollback;
