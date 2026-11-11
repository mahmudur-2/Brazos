-- 370_money_conservation.sql — lean B13, B16, B18, B20, B22 and the money parts of B17: the money
-- rules of docs/critical/money-safety.md proven end to end on the local stack.
--   Rule 1  money reaches the worker at most once;
--   Rule 2  nothing is sent for a row refunded, lost, disputed or charged another amount, and never
--           more than is left;
--   Rule 3  a repeated or old event, answer or key changes nothing;
--   Rule 4  every row the system will not move shows in payment_attention.
--
-- THE STRIPE BOOK. The provider is emulated by tests.mc_stripe over the temp table mc_book: one row
-- per request that reached it, with the idempotency key, the amount, and whether a transfer or
-- refund was MADE. Like the provider, it answers a key it saw in the last 24 hours with its first
-- answer, refuses that key with other parameters (400 idempotency_error), and treats an older key
-- as new. "How many transfers reached the worker" is the number of made rows, never a column of
-- payments. tests.mc_drain is one tick of process-settlements for one row, in its order: read the
-- ready queue, settlement_send_begin, POST, write back at once (the verdict mirrors
-- supabase/functions/process-settlements/classify.mjs, unit-tested in tests/moneySafety.test.mjs).
-- When settlement_send_begin does not exist (the schema before 20261112010300) it is the drain
-- before B16: nothing written back on success, record_settlement_attempt on a failure. That is how
-- each assertion below fails, before the fix, for the reason it names.
--
-- THE CAST: a customer, a worker with an enabled payout account, the runner (RLS bypassed; fixtures,
-- ground truth, the webhook's stand-in) and service_role (the drain's and the owner's RPCs). §N adds
-- a second customer for the two notices under a card dispute.
--
-- FIXTURE SURGERY, DECLARED. now() is fixed inside a transaction, so time moves only by surgery:
--   * tests.mc_age moves a payment's mc_book rows and its transfer/refund clocks back by an
--     interval (25 hours = "a day of silence"; the provider has forgotten the key).
--   * job_agreements.accepted_at is rewound (through its immutability trigger, as 340 does) for the
--     15-minute grace and the 7-day stuck mark.
--   * §D lowers transfer_cents by 100 after the first POST: the same key with other parameters.
--   * §H sets refund_cents on a released row, beyond and within what is left.
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(78);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated;
create temp table mc_book (
  n        serial primary key,
  key      text not null,
  payment_id uuid not null,
  kind     text not null,
  amount   integer not null,
  ref      text,
  made     boolean not null,
  http     integer not null,
  code     text,
  used_at  timestamptz not null
);

select tests.create_user('mc.customer@brazos.test', 'Mo Customer') as customer \gset
select tests.create_user('mc.worker@brazos.test',   'Mia Worker')  as worker   \gset
insert into fx values ('customer', :'customer'), ('worker', :'worker');
insert into public.payment_accounts (user_id, stripe_account_id, payouts_enabled, payouts_status)
values (:'worker', 'acct_mc_worker', true, 'enabled');

-- ---------------------------------------------------------------------------
-- Helpers (created inside the transaction, gone at rollback).
-- ---------------------------------------------------------------------------
create or replace function tests.mc_hire(p_title text, p_date date default null,
  p_start smallint default null, p_end smallint default null)
returns uuid language plpgsql as $$
declare
  v_customer uuid := (select v from fx where k = 'customer');
  v_worker   uuid := (select v from fx where k = 'worker');
  v_job uuid;
  v_offer uuid;
begin
  -- B10: this file hires many times inside one frozen now(), past the ten posts an hour one customer
  -- may make. The limit is not what this file tests (410_abuse_limits.sql is), so the runner starts
  -- each hire with both counters at zero.
  perform tests.clear_auth();
  update public.rate_counters set hits = 0 where user_id in (v_customer, v_worker);
  perform tests.authenticate_as(v_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Money probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000,
    p_address_line := '4 Proof Way',
    p_scheduled_date := p_date, p_arrival_start_hour := p_start, p_arrival_end_hour := p_end
  )).id into v_job;
  perform tests.authenticate_as(v_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Money bid');
  perform tests.authenticate_as(v_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- A funded job taken to completed and released by the customer: the transfer is asked for and
-- nothing is sent yet. Returns the payment id.
create or replace function tests.mc_released(p_title text) returns uuid language plpgsql as $$
declare
  v_job uuid := tests.mc_hire(p_title);
  v_pid uuid;
begin
  perform tests.test_fund_job(v_job);
  perform tests.authenticate_as((select v from fx where k = 'worker'));
  perform public.transition_job_status(v_job, 'in_progress');
  perform public.transition_job_status(v_job, 'completed', '["https://example.com/mc-done.jpg"]'::jsonb);
  perform tests.authenticate_as((select v from fx where k = 'customer'));
  v_pid := (public.release_job_payment(v_job)).id;
  perform tests.clear_auth();
  return v_pid;
end $$;

create or replace function tests.mc_funded(p_title text, p_date date default null,
  p_start smallint default null, p_end smallint default null) returns uuid language plpgsql as $$
begin
  return tests.test_fund_job(tests.mc_hire(p_title, p_date, p_start, p_end));
end $$;

-- SURGERY: rewind the snapshot's accepted_at through the immutability trigger (as 340).
create or replace function tests.mc_age_agreement(p_pid uuid, p_by interval) returns void language plpgsql as $$
begin
  alter table public.job_agreements disable trigger job_agreements_immutable;
  update public.job_agreements set accepted_at = accepted_at - p_by
   where job_id = (select job_id from public.payments where id = p_pid);
  alter table public.job_agreements enable trigger job_agreements_immutable;
end $$;

-- A provider event, stored and applied (the webhook's two steps).
create or replace function tests.mc_event(p_id text, p_type text, p_object jsonb) returns jsonb language plpgsql as $$
begin
  insert into public.payment_events (id, type, payload)
  values (p_id, p_type, jsonb_build_object('id', p_id, 'type', p_type, 'data', jsonb_build_object('object', p_object)))
  on conflict (id) do nothing;
  return public.apply_payment_event(p_id);
end $$;

-- A charge event as the provider sends it: no metadata, resolved by the PaymentIntent.
create or replace function tests.mc_charge_event(p_id text, p_type text, p_pid uuid, p_object jsonb) returns jsonb language plpgsql as $$
begin
  return tests.mc_event(p_id, p_type, p_object || jsonb_build_object(
    'payment_intent', (select provider_ref from public.payments where id = p_pid)));
end $$;

create or replace function tests.mc_dispute(p_id text, p_pid uuid, p_type text, p_status text) returns jsonb language plpgsql as $$
begin
  return tests.mc_charge_event(p_id, 'charge.dispute.' || p_type, p_pid, jsonb_build_object(
    'id', 'dp_' || left(md5(p_pid::text), 12), 'status', p_status,
    'amount', (select charge_amount_cents from public.payments where id = p_pid)));
end $$;

-- The provider. Scripts: ok (made, 200), ok_nowrite (made, 200, and the drain dies before the
-- write-back), lost (made, the answer never arrives), refused (400 balance_insufficient, nothing
-- made), refused_stop (400 charge_already_refunded), down (503, nothing made, nothing remembered).
create or replace function tests.mc_stripe(p_key text, p_pid uuid, p_kind text, p_amount integer, p_script text,
  out http integer, out code text, out ref text, out amount integer, out threw boolean)
language plpgsql as $$
declare
  b record;
begin
  threw := false;
  if p_script = 'down' then http := 503; return; end if;
  select * into b from mc_book where key = p_key and used_at > now() - interval '24 hours' order by n desc limit 1;
  if found then
    if b.amount is distinct from p_amount then http := 400; code := 'idempotency_error'; return; end if;
    http := b.http; code := b.code;
    if b.made then ref := b.ref; amount := b.amount; end if;
    return;
  end if;
  if p_script in ('ok', 'ok_nowrite', 'lost') then
    ref := (case when p_kind = 'transfer' then 'tr_' else 're_' end) || left(md5(p_key || clock_timestamp()::text), 14);
    insert into mc_book (key, payment_id, kind, amount, ref, made, http, code, used_at)
    values (p_key, p_pid, p_kind, p_amount, ref, true, 200, null, now());
    http := 200; amount := p_amount;
    if p_script = 'lost' then http := null; ref := null; amount := null; threw := true; end if;
  else
    code := case when p_script = 'refused_stop' then 'charge_already_refunded' else 'balance_insufficient' end;
    insert into mc_book (key, payment_id, kind, amount, ref, made, http, code, used_at)
    values (p_key, p_pid, p_kind, p_amount, null, false, 400, code, now());
    http := 400;
  end if;
end $$;

-- One tick of process-settlements for one row. p_attempt forces the attempt a STALE instance
-- read earlier (it skips the queue read, as an instance that read the row before would).
create or replace function tests.mc_drain(p_pid uuid, p_kind text, p_script text, p_attempt integer default null)
returns text language plpgsql as $$
declare
  v_new     boolean := to_regprocedure('public.settlement_send_begin(uuid,text,integer)') is not null;
  v_row     public.payments;
  v_attempt integer;
  v_amount  integer;
  v_key     text;
  v_ok      boolean;
  v_ans     record;
  v_next    text;
  v_err     text;
begin
  if p_attempt is null then
    if p_kind = 'transfer' then
      select p.* into v_row from public.payments p
       where p.id = p_pid and exists (select 1 from public.transfers_ready r where r.id = p_pid);
    else
      select p.* into v_row from public.payments p
       where p.id = p_pid and exists (select 1 from public.refunds_ready r where r.id = p_pid);
    end if;
    if not found then return 'not ready'; end if;
    v_attempt := case when p_kind = 'transfer' then v_row.transfer_attempts else v_row.refund_attempts end;
  else
    select * into v_row from public.payments where id = p_pid;
    v_attempt := p_attempt;
  end if;
  v_amount := case when p_kind = 'transfer' then v_row.transfer_cents else v_row.refund_cents end;
  v_key := (case when p_kind = 'transfer' then 'tr:' else 'rf:' end) || p_pid::text || ':' || v_attempt;

  if v_new then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform set_config('role', 'service_role', true);
    v_ok := public.settlement_send_begin(p_pid, p_kind, v_attempt);
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claims', '', true);
    if v_ok is not true then return 'blocked'; end if;
  end if;

  select * into v_ans from tests.mc_stripe(v_key, p_pid, p_kind, v_amount, p_script);

  -- The verdict, as classify.mjs settlementVerdict.
  if v_ans.threw then
    v_next := 'same_key'; v_err := 'no answer: the connection closed';
  elsif v_ans.http between 200 and 299 and v_ans.ref is not null and coalesce(v_ans.amount, 0) > 0 then
    v_next := 'write_back';
  elsif v_ans.code = 'idempotency_error' and v_ans.http <> 409 then
    v_next := 'stop';
  elsif v_ans.http between 400 and 499 and v_ans.http not in (401, 403, 409, 429) then
    v_next := case when p_kind = 'refund' and v_ans.code in ('charge_already_refunded', 'charge_disputed',
                                                             'refund_disputed_payment', 'amount_too_large')
                   then 'stop' else 'new_key' end;
  else
    v_next := 'same_key';
  end if;
  v_err := coalesce(v_err, v_ans.http::text || coalesce(' ' || v_ans.code, ''));

  if p_script = 'ok_nowrite' and v_next = 'write_back' then return 'nowrite'; end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
  if v_new then
    if v_next = 'write_back' then
      perform public.record_settlement_sent(p_pid, p_kind, v_ans.ref, v_ans.amount);
    else
      perform public.record_settlement_result(p_pid, p_kind, v_attempt, v_next, v_err);
    end if;
  elsif v_next <> 'write_back' then
    -- The drain before B16: success wrote nothing; a failure went to the R6b recorder.
    perform public.record_settlement_attempt(p_pid, p_kind,
      coalesce(not v_ans.threw and v_ans.http between 400 and 499 and v_ans.http not in (409, 429), false), v_err);
  end if;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return case when v_next = 'write_back' then 'sent' else v_next end;
end $$;

-- SURGERY: a day passes for one payment (its keys at the provider and its clocks).
create or replace function tests.mc_age(p_pid uuid, p_by interval) returns void language plpgsql as $$
begin
  update mc_book set used_at = used_at - p_by where payment_id = p_pid;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payments' and column_name = 'transfer_sent_at') then
    execute 'update public.payments set transfer_sent_at = transfer_sent_at - $2, refund_sent_at = refund_sent_at - $2 where id = $1'
      using p_pid, p_by;
  end if;
end $$;

-- Transfers (refunds) the provider made for a payment.
create or replace function tests.mc_made(p_pid uuid, p_kind text default 'transfer') returns bigint language sql as $$
  select count(*) from mc_book where payment_id = p_pid and kind = p_kind and made
$$;

-- Every payment_attention line of a payment ("what: reason", sorted), or why there is none.
create or replace function tests.mc_reasons(p_pid uuid) returns text language plpgsql as $$
declare v text;
begin
  if to_regclass('public.payment_attention') is null then return '<no payment_attention view>'; end if;
  execute 'select string_agg(what || '': '' || reason, '' | '' order by what, reason) from public.payment_attention where payment_id = $1'
    into v using p_pid;
  return coalesce(v, '<none>');
end $$;

-- An owner's or drain's RPC as service_role: its result, or its error message.
create or replace function tests.mc_try(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
  execute p_sql into v;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return 'ok: ' || coalesce(v, 'null');
exception when others then
  return 'error: ' || sqlerrm;
end $$;

create or replace function tests.mc_in(p_view text, p_pid uuid) returns bigint language plpgsql as $$
declare v bigint;
begin
  execute format('select count(*) from public.%I where id = $1', p_view) into v using p_pid;
  return v;
end $$;

-- Rule 4: rows that ask for a transfer or refund, are not ready, and are not listed.
create or replace function tests.mc_unlisted() returns integer language plpgsql as $$
declare v integer;
begin
  if to_regclass('public.payment_attention') is null then return -1; end if;
  execute $q$
    select count(*)::integer from public.payments p
     where p.provider = 'stripe'
       and ((p.release_requested_at is not null and coalesce(p.transfer_cents, 0) > 0 and p.transfer_ref is null
             and not exists (select 1 from public.transfers_ready r where r.id = p.id)
             and not exists (select 1 from public.payment_attention a where a.payment_id = p.id and a.what = 'transfer'))
         or (coalesce(p.refund_cents, 0) > 0 and p.refund_ref is null and p.status <> 'refunded'
             and not exists (select 1 from public.refunds_ready r where r.id = p.id)
             and not exists (select 1 from public.payment_attention a where a.payment_id = p.id and a.what = 'refund')))
  $q$ into v;
  return v;
end $$;

-- Rule 2: payments of this file (other than p_except) whose live transfers and refunds exceed
-- what the charge received.
create or replace function tests.mc_short_except(p_except uuid) returns integer language plpgsql as $$
declare v integer;
begin
  if to_regclass('public.payment_money') is null then return -1; end if;
  execute 'select count(*)::integer from public.payment_money m where m.left_cents < 0 and m.payment_id <> $1
             and m.payment_id in (select payment_id from mc_book)' into v using p_except;
  return v;
end $$;

create or replace function tests.mc_ny_today() returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- ---------------------------------------------------------------------------
-- §A. The normal path: one transfer, written back at once; the webhook and its replays change
--     nothing (rules 1, 3).
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-A normal') as pa \gset
select is(tests.mc_drain(:'pa', 'transfer', 'ok'), 'sent', 'A1: a ready transfer is sent');
select is((select status::text || '/' || (transfer_ref = (select ref from mc_book where payment_id = :'pa' and made order by n limit 1))::text
             from public.payments where id = :'pa'),
  'released/true', 'A2 (B16): the 2xx is written back at once: released, with the provider''s transfer id');
select is(tests.mc_drain(:'pa', 'transfer', 'ok'), 'not ready', 'A3 (B16): the next tick finds nothing to send');
select tests.mc_event('evt_mc_a_tc', 'transfer.created', jsonb_build_object(
  'id', (select ref from mc_book where payment_id = :'pa' and made order by n limit 1), 'amount', (select transfer_cents from public.payments where id = :'pa'),
  'metadata', jsonb_build_object('payment_id', :'pa')));
select to_jsonb(p) as row_a from public.payments p where id = :'pa' \gset
select tests.mc_event('evt_mc_a_tc', 'transfer.created', '{}'::jsonb);
select tests.mc_event('evt_mc_a_tc2', 'transfer.created', jsonb_build_object(
  'id', (select ref from mc_book where payment_id = :'pa' and made order by n limit 1), 'amount', (select transfer_cents from public.payments where id = :'pa'),
  'metadata', jsonb_build_object('payment_id', :'pa')));
select is((select to_jsonb(p) from public.payments p where id = :'pa'), :'row_a'::jsonb,
  'A4 (rule 3): the same transfer.created again, under its id or another, changes nothing');
select is(tests.mc_made(:'pa'), 1::bigint, 'A5 (rule 1): one transfer reached the worker');

-- ---------------------------------------------------------------------------
-- §B. Refused, then funded: exactly one transfer, on the next key, the same day.
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-B refused') as pb \gset
select is(tests.mc_drain(:'pb', 'transfer', 'refused'), 'new_key', 'B1: a 400 balance_insufficient takes a new key');
select is((select transfer_attempts || '/' || tests.mc_in('transfers_ready', :'pb') from public.payments where id = :'pb'),
  '1/1', 'B2: attempt 1, and the row is ready again at once (the worker does not wait for the owner)');
select is(tests.mc_drain(:'pb', 'transfer', 'ok'), 'sent', 'B3: the platform is funded: the next tick sends');
select is((select count(*) from mc_book where payment_id = :'pb' and made and key = 'tr:' || :'pb' || ':1'), 1::bigint,
  'B4: under the new key tr:<id>:1');
select is(tests.mc_drain(:'pb', 'transfer', 'ok') || '/' || tests.mc_made(:'pb'), 'not ready/1',
  'B5 (rule 1): refused then funded = exactly one transfer');

-- ---------------------------------------------------------------------------
-- §C. Unknown, then silence: the row stops and there is no second transfer.
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-C silence') as pc \gset
select is(tests.mc_drain(:'pc', 'transfer', 'lost'), 'same_key', 'C1: the answer is lost (the transfer was made): same key');
select is(tests.mc_drain(:'pc', 'transfer', 'down'), 'same_key', 'C2: a 503: same key');
select tests.mc_age(:'pc', interval '25 hours');
select is(tests.mc_in('transfers_ready', :'pc'), 0::bigint, 'C3 (B16): 23 hours after the key''s first use the row is not ready');
select is(tests.mc_drain(:'pc', 'transfer', 'ok') || '/' || tests.mc_made(:'pc'), 'not ready/1',
  'C4 (B16, rule 1): a day of silence never sends a second transfer once the provider has forgotten the key');
select ok(tests.mc_reasons(:'pc') like '%transfer: no answer for 23 hours under the same key%',
  'C5 (rule 4): the row shows in payment_attention');
select is(tests.mc_try(format('select public.record_settlement_sent(%L, %L, %L, %s)', :'pc', 'transfer',
            (select ref from mc_book where payment_id = :'pc' and made order by n limit 1), (select transfer_cents from public.payments where id = :'pc'))),
  'ok: true', 'C6: the owner finds the transfer in Stripe and records it');
select is((select status::text from public.payments where id = :'pc') || '/' || tests.mc_reasons(:'pc'), 'released/<none>',
  'C7: released, and gone from payment_attention');
select is(tests.mc_try(format('select public.settlement_send_reopen(%L, %L)', :'pc', 'transfer')),
  'error: A transfer is recorded for this payment; nothing to reopen', 'C8: reopen is refused once a transfer is recorded');

-- ---------------------------------------------------------------------------
-- §D. An idempotency error stops the row at once (the key was used with other parameters).
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-D idempotency') as pd \gset
select tests.mc_drain(:'pd', 'transfer', 'lost');
update public.payments set transfer_cents = transfer_cents - 100 where id = :'pd';   -- SURGERY (declared)
select is(tests.mc_drain(:'pd', 'transfer', 'ok'), 'stop', 'D1 (B16): 400 idempotency_error stops the row');
select is(tests.mc_drain(:'pd', 'transfer', 'ok') || '/' || tests.mc_made(:'pd'), 'not ready/1',
  'D2 (B16, rule 1): no new key follows an idempotency error: still one transfer');
select ok(tests.mc_reasons(:'pd') like '%transfer: stopped: the last answer needs a person%', 'D3 (rule 4): listed as stopped');

-- ---------------------------------------------------------------------------
-- §E. The owner's "it does not exist": a new attempt, one transfer; the refusals.
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-E reopen') as pe \gset
select tests.mc_drain(:'pe', 'transfer', 'down');
select is(tests.mc_try(format('select public.settlement_send_reopen(%L, %L)', :'pe', 'transfer')),
  'error: Nothing to reopen: the current transfer attempt is neither stopped nor past its 23 hours',
  'E1: reopen is refused while the attempt is still open');
select tests.mc_age(:'pe', interval '25 hours');
select is(tests.mc_try(format('select public.settlement_send_reopen(%L, %L)', :'pe', 'transfer')), 'ok: true',
  'E2: after 23 hours the owner reopens');
-- The drain runs in its own statement: a plain subquery reads the statement's snapshot.
select tests.mc_drain(:'pe', 'transfer', 'ok') as e3_drain \gset
select is(:'e3_drain' || '/' || tests.mc_made(:'pe')
          || '/' || (select count(*) from mc_book where payment_id = :'pe' and made and key = 'tr:' || :'pe' || ':1'),
  'sent/1/1', 'E3: one transfer, under the new key');
select is(tests.mc_try(format('select public.record_settlement_sent(%L, %L, %L, 100)', gen_random_uuid(), 'transfer', 'tr_none')),
  'error: Payment not found', 'E4: record_settlement_sent refuses an unknown payment');
select tests.mc_funded('MC-E held only') as pe2 \gset
select is(tests.mc_try(format('select public.record_settlement_sent(%L, %L, %L, 100)', :'pe2', 'transfer', 'tr_x')),
  'error: This payment never asked for a transfer', 'E5: … and a payment that never asked for a transfer');
select is(tests.mc_try(format('select public.record_settlement_sent(%L, %L, %L, 100)', :'pe', 'transfer', 'xx_1')),
  'error: A transfer id starts with tr_', 'E6: … and an id of another shape');
select is(tests.mc_try(format('select public.record_settlement_sent(%L, %L, %L, 100)', :'pe', 'transfer',
            (select ref from mc_book where payment_id = :'pa' and made order by n limit 1))),
  'error: Transfer ' || (select ref from mc_book where payment_id = :'pa' and made order by n limit 1) || ' is recorded on another payment',
  'E7: … and a transfer id recorded on another payment');

-- ---------------------------------------------------------------------------
-- §F. A replay of an old key is never sent; a stale answer changes nothing (rule 3).
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-F stale') as pf \gset
select tests.mc_drain(:'pf', 'transfer', 'refused');
select tests.mc_drain(:'pf', 'transfer', 'ok');
select tests.mc_age(:'pf', interval '25 hours');
select is(tests.mc_drain(:'pf', 'transfer', 'ok', 0), 'blocked',
  'F1 (B16): an instance holding attempt 0 is refused by settlement_send_begin');
select is(tests.mc_made(:'pf'), 1::bigint, 'F2 (rule 1): the old key tr:<id>:0 never reached the provider again');
select is(tests.mc_try(format('select public.record_settlement_result(%L, %L, 0, %L, %L)', :'pf', 'transfer', 'new_key', 'late answer')),
  'ok: false', 'F3 (rule 3): a late answer for attempt 0 is ignored');
select is((select transfer_attempts from public.payments where id = :'pf'), 1, 'F4: … and the counter did not move');

-- ---------------------------------------------------------------------------
-- §G. The drain dies after the POST and before the write-back: the same key next tick.
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-G crash') as pg \gset
select is(tests.mc_drain(:'pg', 'transfer', 'ok_nowrite'), 'nowrite', 'G1: the transfer is made, nothing is written back');
select tests.mc_drain(:'pg', 'transfer', 'ok') as g2_drain \gset
select is(:'g2_drain' || '/' || tests.mc_made(:'pg')
          || '/' || (select status::text from public.payments where id = :'pg'),
  'sent/1/released', 'G2 (rule 1): the next tick replays the same key: the provider''s first answer, one transfer, written back');

-- ---------------------------------------------------------------------------
-- §H. A refund after the transfer is never more than is left (B18).
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-H refund after transfer') as ph \gset
select tests.mc_drain(:'ph', 'transfer', 'ok');
update public.payments set refund_cents = charge_amount_cents, refund_reason = 'dispute_refund' where id = :'ph';  -- SURGERY
select is(tests.mc_in('refunds_due', :'ph'), 0::bigint, 'H1 (B18): a full refund after a transfer is not queued');
select ok(tests.mc_reasons(:'ph') like '%refund: refund is more than is left after the transfer%', 'H2 (rule 4): it is listed');
update public.payments set refund_cents = charge_amount_cents - transfer_cents where id = :'ph';                    -- SURGERY
select is(tests.mc_drain(:'ph', 'refund', 'ok'), 'sent', 'H3: a refund of what is left is sent');
select ok(tests.mc_reasons(:'ph') like '%refund: refund sent, not yet confirmed by charge.refunded%',
  'H4 (rule 4): a refund sent and not confirmed is listed');
select tests.mc_charge_event('evt_mc_h_cr', 'charge.refunded', :'ph', jsonb_build_object(
  'id', 'ch_mc_h', 'amount_refunded', (select refund_cents from public.payments where id = :'ph'),
  'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', (select refund_ref from public.payments where id = :'ph'))))));
select is((select status::text || '/' || (refunded_cents = charge_amount_cents - transfer_cents)::text from public.payments where id = :'ph')
          || '/' || tests.mc_reasons(:'ph'),
  'partially_refunded/true/<none>', 'H5: charge.refunded confirms it; nothing is left to do');

-- ---------------------------------------------------------------------------
-- §I, §J. A refund that landed before the transfer (B18).
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-I refunded') as pi9 \gset
select tests.mc_charge_event('evt_mc_i_cr', 'charge.refunded', :'pi9', jsonb_build_object(
  'id', 'ch_mc_i', 'amount_refunded', (select charge_amount_cents from public.payments where id = :'pi9'),
  'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', 're_mc_i_hand')))));
select is(tests.mc_in('transfers_due', :'pi9'), 0::bigint, 'I1 (B18): a charge refunded in full is never transferred');
select ok(tests.mc_reasons(:'pi9') like '%transfer: payment is refunded: a person decides%', 'I2 (rule 4): listed');

select tests.mc_released('MC-J partial') as pj \gset
select tests.mc_charge_event('evt_mc_j_cr', 'charge.refunded', :'pj', jsonb_build_object(
  'id', 'ch_mc_j', 'amount_refunded', 1000,
  'refunds', jsonb_build_object('data', jsonb_build_array(jsonb_build_object('id', 're_mc_j_hand')))));
select is(tests.mc_in('transfers_due', :'pj'), 0::bigint, 'J1 (B18): a transfer larger than what is left after a refund is not sent');
select ok(tests.mc_reasons(:'pj') like '%transfer: transfer is more than is left after refunds%', 'J2 (rule 4): listed');
select tests.mc_charge_event('evt_mc_j_cr_old', 'charge.refunded', :'pj', jsonb_build_object('id', 'ch_mc_j', 'amount_refunded', 500));
select is((select refunded_cents from public.payments where id = :'pj'), 1000, 'J3 (rule 3): an older charge.refunded never lowers the refunded total');

-- ---------------------------------------------------------------------------
-- §K. Card disputes (B13).
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-K won') as pk1 \gset
select tests.mc_dispute('evt_mc_k1_c', :'pk1', 'created', 'needs_response');
select is(tests.mc_in('transfers_due', :'pk1'), 0::bigint, 'K1 (B13): no transfer while a card dispute is open');
select ok(tests.mc_reasons(:'pk1') like '%transfer: card dispute open: no transfer%', 'K2 (rule 4): listed');
select tests.mc_dispute('evt_mc_k1_w', :'pk1', 'closed', 'won');
select is((select (chargeback_at is null)::text || '/' || coalesce(chargeback_cents::text, 'null') from public.payments where id = :'pk1')
          || '/' || tests.mc_in('transfers_ready', :'pk1'),
  'true/null/1', 'K3 (B13): won: the block clears and the transfer is ready');

select tests.mc_funded('MC-K inquiry') as pk2 \gset
select tests.mc_dispute('evt_mc_k2_c', :'pk2', 'created', 'warning_needs_response');
select is((select (chargeback_at is not null)::text || '/' || coalesce(chargeback_cents::text, 'null') from public.payments where id = :'pk2'),
  'true/null', 'K4 (B13): an inquiry blocks and takes nothing');
select tests.mc_dispute('evt_mc_k2_x', :'pk2', 'closed', 'warning_closed');
select is((select (chargeback_at is null)::text from public.payments where id = :'pk2'), 'true', 'K5 (B13): warning_closed clears the block');

select tests.mc_funded('MC-K prevented') as pk3 \gset
select tests.mc_dispute('evt_mc_k3_c', :'pk3', 'created', 'warning_needs_response');
select tests.mc_dispute('evt_mc_k3_x', :'pk3', 'closed', 'prevented');
select is((select (chargeback_at is not null)::text || '/' || last_error from public.payments where id = :'pk3'),
  'true/card dispute closed as prevented; a person must decide', 'K6 (B13): prevented keeps the block, with a reason');
select ok(tests.mc_reasons(:'pk3') like '%payment: card dispute still open or closed without proof the money stayed%',
  'K7 (rule 4): listed, though the row asks for nothing');

select tests.mc_released('MC-K lost after') as pk4 \gset
select tests.mc_drain(:'pk4', 'transfer', 'ok');
select tests.mc_dispute('evt_mc_k4_c', :'pk4', 'created', 'needs_response');
select tests.mc_dispute('evt_mc_k4_l', :'pk4', 'closed', 'lost');
select is((select status::text || '/' || coalesce(refund_cents::text, 'null') || '/' || tests.mc_in('refunds_due', id)
             from public.payments where id = :'pk4'),
  'refunded/null/0', 'K8 (B13): lost after the transfer: refunded, and no refund is queued on top');
select ok(tests.mc_reasons(:'pk4') like '%payment: money short%', 'K9 (B13, rule 4): the shortfall is listed');
select is((select short_cents from public.payment_money where payment_id = :'pk4'),
  (select transfer_cents from public.payments where id = :'pk4'), 'K10: short by exactly the transfer');

select tests.mc_released('MC-K lost before') as pk5 \gset
select tests.mc_dispute('evt_mc_k5_c', :'pk5', 'created', 'needs_response');
select tests.mc_dispute('evt_mc_k5_l', :'pk5', 'closed', 'lost');
select is(tests.mc_in('transfers_due', :'pk5'), 0::bigint, 'K11 (B13, B18): lost before the transfer: never transferred');

-- ---------------------------------------------------------------------------
-- §L. Reversals (B16, rule 3).
-- ---------------------------------------------------------------------------
select tests.mc_released('MC-L reversal') as pl \gset
select tests.mc_drain(:'pl', 'transfer', 'ok');
select tests.mc_event('evt_mc_l_r1', 'transfer.reversed', jsonb_build_object(
  'id', (select ref from mc_book where payment_id = :'pl' and made order by n limit 1), 'amount', (select transfer_cents from public.payments where id = :'pl'),
  'amount_reversed', 1000, 'reversed', false, 'metadata', jsonb_build_object('payment_id', :'pl')));
select is((select status::text || '/' || (transfer_reversed_at is null)::text from public.payments where id = :'pl'),
  'released/true', 'L1 (B16): a partial reversal does not park the row');
select ok(tests.mc_reasons(:'pl') like '%was reversed in part: a person decides%', 'L2 (rule 4): listed');
select tests.mc_event('evt_mc_l_r2', 'transfer.reversed', jsonb_build_object(
  'id', (select ref from mc_book where payment_id = :'pl' and made order by n limit 1), 'amount', (select transfer_cents from public.payments where id = :'pl'),
  'amount_reversed', (select transfer_cents from public.payments where id = :'pl'), 'reversed', true,
  'metadata', jsonb_build_object('payment_id', :'pl')));
select tests.mc_event('evt_mc_l_late', 'transfer.created', jsonb_build_object(
  'id', (select ref from mc_book where payment_id = :'pl' and made order by n limit 1), 'amount', (select transfer_cents from public.payments where id = :'pl'),
  'metadata', jsonb_build_object('payment_id', :'pl')));
select is((select status::text || '/' || (transfer_reversed_at is not null)::text || '/' || coalesce(transfer_ref, 'null')
             || '/' || tests.mc_in('transfers_due', id) from public.payments where id = :'pl'),
  'held/true/null/0', 'L3 (B16, rule 3): reversed in full it is parked, and a late transfer.created does not un-park it');

-- ---------------------------------------------------------------------------
-- §M, §N. The charge itself (B17 amount check, B22).
-- ---------------------------------------------------------------------------
select tests.mc_hire('MC-M amount') as jm \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'jm')).id as pm \gset
select tests.clear_auth();
select public.attach_provider_ref(:'pm', 'pi_mc_m');
select tests.mc_event('evt_mc_m_s', 'payment_intent.succeeded', jsonb_build_object('id', 'pi_mc_m',
  'amount_received', (select charge_amount_cents - 1 from public.payments where id = :'pm'),
  'metadata', jsonb_build_object('payment_id', :'pm')));
select is((select status::text || '/' || (received_cents = charge_amount_cents - 1)::text || '/' || last_error from public.payments where id = :'pm'),
  'held/true/charged a different amount than this payment; nothing is sent until a person decides',
  'M1 (B17): a charge for another amount is recorded with a reason');
select tests.authenticate_as(:'worker');
select public.transition_job_status(:'jm', 'in_progress');
select public.transition_job_status(:'jm', 'completed', '["https://example.com/mc-done.jpg"]'::jsonb);
select tests.authenticate_as(:'customer');
select public.release_job_payment(:'jm');
select tests.clear_auth();
select is(tests.mc_in('transfers_due', :'pm'), 0::bigint, 'M2 (B17): it is never transferred');
select ok(tests.mc_reasons(:'pm') like '%transfer: charged a different amount than this payment%', 'M3 (rule 4): listed');

select tests.mc_hire('MC-N declined') as jn \gset
select tests.authenticate_as(:'customer');
select (public.begin_job_payment(:'jn')).id as pn \gset
select tests.clear_auth();
select public.attach_provider_ref(:'pn', 'pi_mc_n');
select tests.mc_event('evt_mc_n_f', 'payment_intent.payment_failed', jsonb_build_object('id', 'pi_mc_n',
  'metadata', jsonb_build_object('payment_id', :'pn')));
select is((select status::text from public.payments where id = :'pn'), 'unfunded',
  'N1 (B22): a declined card changes nothing: the intent stays open for another card');
select tests.mc_event('evt_mc_n_s', 'payment_intent.succeeded', jsonb_build_object('id', 'pi_mc_n',
  'amount_received', (select charge_amount_cents from public.payments where id = :'pn'),
  'metadata', jsonb_build_object('payment_id', :'pn')));
select is((select status::text || '/' || coalesce(refund_cents::text, 'null') from public.payments where id = :'pn'), 'held/null',
  'N2 (B22): the second card''s charge holds the payment; nothing is refunded');

-- ---------------------------------------------------------------------------
-- §R. Refund refusals: which retry and which stop.
-- ---------------------------------------------------------------------------
select tests.mc_funded('MC-R retry', tests.mc_ny_today() - 1, 9::smallint, 12::smallint) as pr1 \gset
select tests.mc_age_agreement(:'pr1', interval '1 hour');
select tests.authenticate_as(:'customer');
select public.cancel_job((select job_id from public.payments where id = :'pr1'), 'customer_cancelled');
select tests.clear_auth();
select is(tests.mc_drain(:'pr1', 'refund', 'refused') || '/' || tests.mc_in('refunds_ready', :'pr1'), 'new_key/1',
  'R1: a refund refused for another reason takes a new key and stays ready');
select is(tests.mc_drain(:'pr1', 'refund', 'ok') || '/' || tests.mc_made(:'pr1', 'refund'), 'sent/1', 'R2: then one refund');

select tests.mc_funded('MC-R stop', tests.mc_ny_today() - 1, 9::smallint, 12::smallint) as pr2 \gset
select tests.mc_age_agreement(:'pr2', interval '1 hour');
select tests.authenticate_as(:'customer');
select public.cancel_job((select job_id from public.payments where id = :'pr2'), 'customer_cancelled');
select tests.clear_auth();
select is(tests.mc_drain(:'pr2', 'refund', 'refused_stop') || '/' || tests.mc_in('refunds_ready', :'pr2'), 'stop/0',
  'R3: charge_already_refunded stops the refund');
select ok(tests.mc_reasons(:'pr2') like '%refund: stopped: the last answer needs a person%', 'R4 (rule 4): listed');

-- ---------------------------------------------------------------------------
-- §O. Addition 1 (named): THE LIFECYCLE REFUNDS NEVER SEND A ROW UNDER A CARD DISPUTE. cancel_job's
--     free cancel and the hourly close_no_show_hires both queue a full refund through
--     queue_free_cancel_refund without reading chargeback_at; the queues hold it, attention lists it.
-- ---------------------------------------------------------------------------
select tests.mc_funded('MC-O free cancel', tests.mc_ny_today() - 1, 9::smallint, 12::smallint) as po1 \gset
select tests.mc_funded('MC-O no-show close', tests.mc_ny_today() - 1, 9::smallint, 12::smallint) as po2 \gset
select tests.mc_dispute('evt_mc_o1_c', :'po1', 'created', 'needs_response');
select tests.mc_dispute('evt_mc_o2_c', :'po2', 'created', 'needs_response');
select tests.mc_age_agreement(:'po1', interval '1 hour');
select tests.authenticate_as(:'customer');
select public.cancel_job((select job_id from public.payments where id = :'po1'), 'customer_cancelled');
select tests.clear_auth();
select public.close_no_show_hires((((tests.mc_ny_today() - 1)::timestamp + interval '12 hours') at time zone 'America/New_York') + interval '25 hours');
select is(jsonb_build_object(
    'refunds_queued', (select count(*) from public.payments where id in (:'po1', :'po2') and refund_cents = charge_amount_cents),
    'in_refunds_due', tests.mc_in('refunds_due', :'po1') + tests.mc_in('refunds_due', :'po2'),
    'in_transfers_due', tests.mc_in('transfers_due', :'po1') + tests.mc_in('transfers_due', :'po2'),
    'listed', (tests.mc_reasons(:'po1') like '%refund: card dispute open: no refund%')
              and (tests.mc_reasons(:'po2') like '%refund: card dispute open: no refund%')),
  jsonb_build_object('refunds_queued', 2, 'in_refunds_due', 0, 'in_transfers_due', 0, 'listed', true),
  'O1 (B13, addition 1): cancel_job''s free cancel and close_no_show_hires queue the refund, but a row under a card dispute is never sent and shows in payment_attention');

-- ---------------------------------------------------------------------------
-- §N. B24, B8 follow-up (20261112010900): a notice never says "refunded in full" while a card
--     dispute holds the refund. The two disputed jobs belong to a customer of their own, so "no
--     row for that customer says refunded in full" reads every notice that customer has.
-- ---------------------------------------------------------------------------
select tests.create_user('mc.n.customer@brazos.test', 'Nia Customer') as ncustomer \gset
update fx set v = :'ncustomer' where k = 'customer';
select tests.mc_funded('MC-N close disputed', tests.mc_ny_today() - 1, 9::smallint, 12::smallint) as pn1 \gset
select tests.mc_funded('MC-N cancel disputed') as pn2 \gset
update fx set v = :'customer' where k = 'customer';
select tests.mc_funded('MC-N close plain', tests.mc_ny_today() - 1, 9::smallint, 12::smallint) as pn3 \gset
select tests.mc_funded('MC-N cancel plain') as pn4 \gset
select tests.mc_dispute('evt_mc_n1_c', :'pn1', 'created', 'needs_response');
select tests.mc_dispute('evt_mc_n2_c', :'pn2', 'created', 'needs_response');
select tests.authenticate_as(:'worker');
select public.cancel_job((select job_id from public.payments where id = :'pn2'), 'worker_cancelled');
select public.cancel_job((select job_id from public.payments where id = :'pn4'), 'worker_cancelled');
select tests.clear_auth();
select public.close_no_show_hires((((tests.mc_ny_today() - 1)::timestamp + interval '12 hours') at time zone 'America/New_York') + interval '25 hours');

select is(jsonb_build_object(
    'body', (select n.body from public.notification_outbox n
              where n.recipient_id = :'ncustomer' and n.type = 'job_cancelled'
                and n.data ->> 'jobId' = (select job_id::text from public.payments where id = :'pn1')),
    'refunded_in_full', (select count(*) from public.notification_outbox n
                          where n.recipient_id = :'ncustomer' and n.body ilike '%refunded in full%')),
  jsonb_build_object(
    'body', 'MC-N close disputed: the worker did not arrive, so the job was closed. Your bank is reviewing this payment. Your money comes back when the bank decides.',
    'refunded_in_full', 0),
  'N1 (B24): close_no_show_hires under a card dispute tells the customer the bank is reviewing the payment, and no notice to that customer says refunded in full');
select is(jsonb_build_object(
    'body', (select n.body from public.notification_outbox n
              where n.recipient_id = :'ncustomer' and n.type = 'job_cancelled'
                and n.data ->> 'jobId' = (select job_id::text from public.payments where id = :'pn2')),
    'refunded_in_full', (select count(*) from public.notification_outbox n
                          where n.recipient_id = :'ncustomer' and n.body ilike '%refunded in full%')),
  jsonb_build_object(
    'body', 'The worker cancelled this job. Your bank is reviewing this payment. Your money comes back when the bank decides.',
    'refunded_in_full', 0),
  'N2 (B8): cancel_job worker_cancelled under a card dispute tells the customer the bank is reviewing the payment, and no notice to that customer says refunded in full');
select is((select n.body from public.notification_outbox n
            where n.recipient_id = :'customer' and n.type = 'job_cancelled'
              and n.data ->> 'jobId' = (select job_id::text from public.payments where id = :'pn3')),
  'MC-N close plain: the worker did not arrive, so your payment is being refunded in full.',
  'N3 (B24): without a card dispute, close_no_show_hires keeps today''s notice');
select is((select n.body from public.notification_outbox n
            where n.recipient_id = :'customer' and n.type = 'job_cancelled'
              and n.data ->> 'jobId' = (select job_id::text from public.payments where id = :'pn4')),
  'The worker cancelled this job. Your payment is being refunded in full.',
  'N4 (B8): without a card dispute, cancel_job worker_cancelled keeps today''s notice');

-- ---------------------------------------------------------------------------
-- §P. Addition 2: a held job payment on a job that never ends is listed after 7 days.
-- ---------------------------------------------------------------------------
select tests.mc_funded('MC-P undated 8 days') as pp1 \gset
select tests.mc_funded('MC-P undated 6 days') as pp2 \gset
select tests.mc_funded('MC-P dated 9 days ago', tests.mc_ny_today() - 9, 9::smallint, 12::smallint) as pp3 \gset
select tests.mc_age_agreement(:'pp1', interval '8 days');
select tests.mc_age_agreement(:'pp2', interval '6 days');
select tests.authenticate_as(:'worker');
select public.transition_job_status((select job_id from public.payments where id = :'pp3'), 'in_progress');
select tests.clear_auth();
select ok(tests.mc_reasons(:'pp1') like '%payment: job still assigned more than 7 days after its date (or its hire)%',
  'P1 (addition 2): an assigned job with no date, hired 8 days ago, is listed');
select is(tests.mc_reasons(:'pp2'), '<none>', 'P2: hired 6 days ago, it is not');
select ok(tests.mc_reasons(:'pp3') like '%payment: job still in_progress more than 7 days after its date%',
  'P3: a job in progress 9 days after its date is listed');

-- ---------------------------------------------------------------------------
-- §Z. The rules over every row of this file (and the seed).
-- ---------------------------------------------------------------------------
select is((select coalesce(max(c), 0) from (select count(*) c from mc_book where made and kind = 'transfer' group by payment_id) x),
  1::bigint, 'Z1 (rule 1): no payment reached the worker twice');
select is(tests.mc_unlisted(), 0, 'Z2 (rule 4): every row asking for a transfer or a refund is ready or in payment_attention');
select is(tests.mc_short_except(:'pk4'), 0,
  'Z3 (rule 2): apart from the lost dispute, no payment of this file sent more than it received');

select * from finish();
rollback;
