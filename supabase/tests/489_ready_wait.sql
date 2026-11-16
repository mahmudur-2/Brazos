-- 489_ready_wait.sql — money M2, A5-04 (iv): a transfer or refund ready to send for more than 1 hour
-- without a break, with no try begun, is listed (transfer_not_started, refund_not_started); A12-03
-- part 1: with a try begun and no answer recorded, too (transfer_no_answer_yet, refund_no_answer_yet).
-- The table only sees.
--
--   W1  a release asked: note_ready_rows notes it with since = now().
--   W2  no line at 59 minutes; the line at 61 minutes, since = the note, its sentence word for word.
--   W3  a second note keeps since (no break).
--   W4  the row leaves the queue (an issue report): the line goes at once and the note drops it; it
--       comes back (the report withdrawn): a new clock.
--   W5  (A12-03 part 1) a try begun and no answer recorded: the code changes at once, before any note,
--       to transfer_no_answer_yet, with the same since (was: no line for up to 23 hours); the note
--       keeps the row; the write-back with its side's error: transfer_retrying, one line.
--   W6  a refused try (a new attempt): the old attempt leaves, the new one starts a new clock.
--   W7  a refund ready for 61 minutes: refund_not_started; its try begun: refund_no_answer_yet.
--   W12 (A12-03 part 1) every ready row of this file, first seen more than an hour ago, has a line of
--       its side; a row with a _no_answer_yet line has no other line of its side. KNOWN, older than
--       A12: a refused try whose next attempt has not started for an hour has two lines,
--       transfer_retrying and transfer_not_started.
--   W8  it only sees: no view and no function but note_ready_rows and payment_attention_more names the
--       table.
--   W9  who may touch it: RLS on, no policy, no grant; note_ready_rows is service_role only.
--   W10 (A9-03 b) a payout due again after a full reversal (a higher attempt, the reversal's message
--       kept) is noted and listed.
--   W11 (A9-03 c, d) 25 rows tried with no answer and never leaving, and that payout behind them: it is
--       first in the queue the drain reads (25 rows), and it is noted.
-- FIXTURE SURGERY, DECLARED: settlement_ready_since.since moved back (now() is fixed in a transaction).
-- Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(33);

select tests.create_user('rw.c1@brazos.test', 'Rae Customer') as c1 \gset
select tests.create_user('rw.w1@brazos.test', 'Rex Worker')   as w1 \gset

create or replace function tests.rw_hire(p_title text, p_customer uuid, p_worker uuid) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_offer uuid;
begin
  perform tests.clear_auth();
  -- SURGERY (B10, as 370): the limit on posts an hour is not what this file tests.
  update public.rate_counters set hits = 0 where user_id in (p_customer, p_worker);
  perform tests.authenticate_as(p_customer);
  select (public.create_job(
    p_title := p_title, p_description := 'Ready wait probe row, rolled back',
    p_category := 'other', p_location := 'Probe Area',
    p_budget_min_cents := 5000, p_budget_max_cents := 5000, p_address_line := '4 Queue Lane'
  )).id into v_job;
  perform tests.authenticate_as(p_worker);
  v_offer := public.create_offer(p_amount_cents := 5000, p_job_id := v_job, p_message := 'Queue bid');
  perform tests.authenticate_as(p_customer);
  perform public.accept_offer(v_offer);
  perform tests.clear_auth();
  return v_job;
end $$;

-- Funds, starts, completes and approves the job. Returns the payment id.
create or replace function tests.rw_released(p_job uuid) returns uuid language plpgsql as $$
declare
  v_pid uuid;
begin
  v_pid := tests.test_fund_job(p_job);
  perform tests.authenticate_as((select assigned_worker_id from public.jobs where id = p_job));
  perform public.transition_job_status(p_job, 'in_progress');
  perform public.transition_job_status(p_job, 'completed', '["https://example.com/rw-done.jpg"]'::jsonb);
  perform tests.authenticate_as((select client_id from public.jobs where id = p_job));
  perform public.release_job_payment(p_job);
  perform tests.clear_auth();
  return v_pid;
end $$;

create or replace function tests.rw_noted(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(s.kind || ':' || s.attempt::text || ':' || (now() - s.since)::text, ',' order by s.kind, s.attempt), '')
    from public.settlement_ready_since s where s.payment_id = p_pid
$$;

create or replace function tests.rw_codes(p_pid uuid) returns text language sql as $$
  select coalesce(string_agg(a.code, ',' order by a.code), '') from public.payment_attention a where a.payment_id = p_pid
$$;

-- ---------------------------------------------------------------------------
-- W1-W3. A release asked and never started.
-- ---------------------------------------------------------------------------
select tests.rw_hire('RW-W1 release', :'c1', :'w1') as j1 \gset
select tests.rw_released(:'j1') as p1 \gset
select transfer_attempts as a1 from public.payments where id = :'p1' \gset
select ok(public.note_ready_rows() >= 1, 'W1a: the note runs');
select is(tests.rw_noted(:'p1'), 'transfer:' || :'a1' || ':00:00:00', 'W1b: the ready transfer is noted on its attempt with since = now()');

update public.settlement_ready_since set since = now() - interval '59 minutes' where payment_id = :'p1';
select is(tests.rw_codes(:'p1'), '', 'W2a: ready for 59 minutes: no line');
update public.settlement_ready_since set since = now() - interval '61 minutes' where payment_id = :'p1';
select is((select concat_ws(' | ', a.code, a.what, a.since = now() - interval '61 minutes', a.overdue, a.cents = p.transfer_cents, a.finish, a.reason)
             from public.payment_attention a join public.payments p on p.id = a.payment_id where a.payment_id = :'p1'),
  'transfer_not_started | transfer | t | t | t | developer | The worker''s payout was first seen ready to send more than an hour ago, and its next try has not started. Ask your developer.',
  'W2b: ready for 61 minutes: transfer_not_started, since the first note, the payout amount, its sentence');
select public.note_ready_rows();
select is(tests.rw_noted(:'p1'), 'transfer:' || :'a1' || ':01:01:00', 'W3: a second note keeps since (no break)');

-- ---------------------------------------------------------------------------
-- W4. The row leaves the queue and comes back: a new clock.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'c1');
select (public.open_job_dispute(:'j1', 'damage', 'RW probe report')).id as d1 \gset
select tests.clear_auth();
select is(tests.rw_codes(:'p1'), 'issue_open,transfer_issue_open', 'W4a: out of the queue: the ready line goes at once, before any note');
select public.note_ready_rows();
select is(tests.rw_noted(:'p1'), '', 'W4b: the note drops a row the queue no longer offers');
select tests.authenticate_as(:'c1');
select public.withdraw_job_dispute(:'d1');
select tests.clear_auth();
select public.note_ready_rows();
select is(tests.rw_noted(:'p1'), 'transfer:' || :'a1' || ':00:00:00', 'W4c: back in the queue: a new clock');

-- ---------------------------------------------------------------------------
-- W5. A try begun.
-- ---------------------------------------------------------------------------
update public.settlement_ready_since set since = now() - interval '61 minutes' where payment_id = :'p1';
select is(tests.rw_codes(:'p1'), 'transfer_not_started', 'W5a: listed again after 61 minutes');
select is(public.settlement_send_begin(:'p1', 'transfer', :'a1'::integer, (select transfer_cents from public.payments where id = :'p1')),
  true, 'W5b: the send begins');
select is((select string_agg(concat_ws(' | ', a.code, a.what, a.since = now() - interval '61 minutes', a.overdue, a.cents = p.transfer_cents, a.finish, a.reason), ' ++ ')
             from public.payment_attention a join public.payments p on p.id = a.payment_id where a.payment_id = :'p1'),
  'transfer_no_answer_yet | transfer | t | t | t | developer | The worker''s payout was first seen ready to send more than an hour ago. A try has started, and the app has not recorded an answer for it yet. The app keeps trying by itself. Ask your developer if this stays.',
  'W5c (A12-03 part 1): a try begun, no answer recorded: one line, the code changes at once, before any note, the since stays, its sentence (was: no line)');
select public.note_ready_rows();
select is(tests.rw_noted(:'p1'), 'transfer:' || :'a1' || ':01:01:00', 'W5d: the note keeps a row whose try began, with its since (was: it dropped it)');
select is(tests.rw_codes(:'p1'), 'transfer_no_answer_yet', 'W5e: after the note: the same one line');
select public.record_settlement_result(:'p1', 'transfer', :'a1'::integer, 'same_key', 'transfer: no answer (RW probe)');
select is(tests.rw_codes(:'p1'), 'transfer_retrying', 'W5f: the write-back with its side''s error: the transfer arm''s line, and only it');

-- ---------------------------------------------------------------------------
-- W6. A refused try: a new attempt, a new clock.
-- ---------------------------------------------------------------------------
select public.record_settlement_result(:'p1', 'transfer', :'a1'::integer, 'new_key', 'transfer: refused (RW probe)');
select public.note_ready_rows();
select is(tests.rw_noted(:'p1'), 'transfer:' || (:'a1'::integer + 1)::text || ':00:00:00', 'W6: the next attempt is noted with a new clock');

-- ---------------------------------------------------------------------------
-- W7. A refund ready and never started.
-- ---------------------------------------------------------------------------
select tests.rw_hire('RW-W7 refund', :'c1', :'w1') as j2 \gset
select tests.test_fund_job(:'j2') as p2 \gset
select tests.authenticate_as(:'w1');
select public.cancel_job(:'j2', 'worker_cancelled');
select tests.clear_auth();
select public.note_ready_rows();
select is((select string_agg(s.kind, ',') from public.settlement_ready_since s where s.payment_id = :'p2'), 'refund', 'W7a: the ready refund is noted');
update public.settlement_ready_since set since = now() - interval '61 minutes' where payment_id = :'p2';
select is((select concat_ws(' | ', a.code, a.what, a.cents = p.refund_cents, a.finish, a.reason)
             from public.payment_attention a join public.payments p on p.id = a.payment_id where a.payment_id = :'p2'),
  'refund_not_started | refund | t | developer | The customer''s refund was first seen ready to send more than an hour ago, and its next try has not started. Ask your developer.',
  'W7b: ready for 61 minutes: refund_not_started, the refund amount, its sentence');
select public.settlement_send_begin(:'p2', 'refund', (select refund_attempts from public.payments where id = :'p2'),
                                    (select refund_cents from public.payments where id = :'p2'));
select is((select string_agg(concat_ws(' | ', a.code, a.what, a.since = now() - interval '61 minutes', a.overdue, a.cents = p.refund_cents, a.finish, a.reason), ' ++ ')
             from public.payment_attention a join public.payments p on p.id = a.payment_id where a.payment_id = :'p2'),
  'refund_no_answer_yet | refund | t | t | t | developer | The customer''s refund was first seen ready to send more than an hour ago. A try has started, and the app has not recorded an answer for it yet. The app keeps trying by itself. Ask your developer if this stays.',
  'W7c (A12-03 part 1): its try begun, no answer recorded: refund_no_answer_yet, one line, the same since, its sentence');

-- ---------------------------------------------------------------------------
-- W10. A payout due again after a full reversal.
-- ---------------------------------------------------------------------------
select tests.rw_hire('RW-W10 reversed', :'c1', :'w1') as j10 \gset
select tests.rw_released(:'j10') as p10 \gset
-- SURGERY: attempt 0 was sent and taken back in full (transfer_in_flight:352-361), then the release
-- was asked again (resolve_job_dispute's park branch, transfer_in_flight:186-194): attempt 1, the
-- reversal's message kept, its last change an hour ago.
insert into public.payment_transfers (transfer_ref, payment_id, amount_cents, reversed_cents)
  select 'tr_rw10', id, transfer_cents, transfer_cents from public.payments where id = :'p10';
update public.payments
   set transfer_sent_attempt = transfer_attempts, transfer_sent_at = now() - interval '2 days',
       transfer_attempts = transfer_attempts + 1, last_error = 'transfer reversed at the provider',
       updated_at = now() - interval '1 hour'
 where id = :'p10';
select ok(exists (select 1 from public.transfers_ready r where r.id = :'p10'), 'W10a: due again after a full reversal: in the queue');
select public.note_ready_rows();
update public.settlement_ready_since set since = now() - interval '61 minutes' where payment_id = :'p10';
select is(tests.rw_codes(:'p10'), 'transfer_not_started',
  'W10b: noted on its new attempt and listed after 61 minutes (the transfer arm lists no ready row whose last error is the reversal''s)');

-- ---------------------------------------------------------------------------
-- W11. 25 rows that never leave, and the payout behind them.
-- ---------------------------------------------------------------------------
create or replace function tests.rw_busy(p_n integer, p_customer uuid, p_worker uuid) returns integer language plpgsql as $$
declare
  v_pid uuid;
begin
  for i in 1..p_n loop
    v_pid := tests.rw_released(tests.rw_hire('RW-W11 busy ' || i, p_customer, p_worker));
    -- Tried this run with no answer (the same key next run): the row stays in the queue.
    perform public.settlement_send_begin(v_pid, 'transfer', 0, (select transfer_cents from public.payments where id = v_pid));
    perform public.record_settlement_result(v_pid, 'transfer', 0, 'same_key', 'transfer: no answer (RW probe)');
  end loop;
  return p_n;
end $$;
select tests.rw_busy(25, :'c1', :'w1');
select is((select count(*)::integer from public.transfers_ready r where r.transfer_attempts = 0), 25, 'W11a: 25 rows of attempt 0, tried and still in the queue');
select is((select r.id from public.transfers_ready r limit 1), :'p10'::uuid,
  'W11b: the payout whose last change is oldest is first in the queue the drain reads (was behind every row of attempt 0)');
select ok(:'p10'::uuid in (select r.id from public.transfers_ready r limit 25), 'W11c: inside the 25 rows the drain reads');
select public.note_ready_rows();
select ok(exists (select 1 from public.settlement_ready_since s where s.payment_id = :'p10'), 'W11d: it keeps its note');

-- ---------------------------------------------------------------------------
-- W12. A12-03 part 1: every ready row of this file, first seen more than an hour ago, has a line of
-- its side; a _no_answer_yet line is never a second one.
-- ---------------------------------------------------------------------------
-- The ready rows of this file (jobs titled RW-), each with its side and its lines of that side.
create or replace function tests.rw_ready_lines() returns table (title text, side text, codes text, n integer) language sql as $$
  select j.title, q.side,
         coalesce(string_agg(a.code, ',' order by a.code), ''), count(a.code)::integer
    from (select r.id, 'transfer'::text as side from public.transfers_ready r
          union all select r.id, 'refund' from public.refunds_ready r) q
    join public.payments p on p.id = q.id
    join public.jobs j on j.id = p.job_id and j.title like 'RW-%'
    left join public.payment_attention a on a.payment_id = q.id and a.what = q.side
   group by j.title, q.side
$$;
-- SURGERY: an hour and a minute pass for every note.
update public.settlement_ready_since set since = since - interval '61 minutes';
select is((select count(*)::integer from tests.rw_ready_lines()), 28, 'W12a: the 28 ready rows of this file (W1, W7, W10 and the 25 of W11)');
select is((select string_agg(title || ':' || side, ',') from tests.rw_ready_lines() where n = 0), null,
  'W12b: every one, first seen more than an hour ago, has a line of its side (begun, not begun, with or without an error)');
select is((select string_agg(title || ':' || codes, ',') from tests.rw_ready_lines() where codes like '%no_answer_yet%' and n > 1), null,
  'W12c: a row with a _no_answer_yet line has no other line of its side');
select is((select string_agg(title || ':' || codes, ',' order by title) from tests.rw_ready_lines() where n > 1),
  'RW-W1 release:transfer_not_started,transfer_retrying',
  'W12d: KNOWN, older than A12: a refused try whose next attempt has not started for an hour has two lines');

-- ---------------------------------------------------------------------------
-- W8. It only sees.
-- ---------------------------------------------------------------------------
select is((select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosrc like '%settlement_ready_since%'),
  'note_ready_rows,payment_attention_more',
  'W8a: only note_ready_rows (writes) and payment_attention_more (the owner''s list) name the table; no money function reads it');
select is((select count(*)::integer from pg_views where schemaname = 'public' and definition like '%settlement_ready_since%'), 0,
  'W8b: no view names it (the queues do not read it)');

-- ---------------------------------------------------------------------------
-- W9. Who may touch it.
-- ---------------------------------------------------------------------------
select is((select c.relrowsecurity::text || '/' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'settlement_ready_since')::text
             || '/' || has_table_privilege('service_role', 'public.settlement_ready_since', 'select')::text
             || '/' || has_table_privilege('authenticated', 'public.settlement_ready_since', 'select')::text
             || '/' || has_table_privilege('anon', 'public.settlement_ready_since', 'select')::text
             from pg_class c where c.oid = 'public.settlement_ready_since'::regclass),
  'true/0/false/false/false', 'W9a: RLS on, no policy, no grant to service_role, authenticated or anon');
select is(has_function_privilege('service_role', 'public.note_ready_rows()', 'execute')::text
          || '/' || has_function_privilege('authenticated', 'public.note_ready_rows()', 'execute')::text
          || '/' || has_function_privilege('anon', 'public.note_ready_rows()', 'execute')::text,
  'true/false/false', 'W9b: note_ready_rows: service_role only');
select tests.authenticate_as(:'c1');
select throws_ok($$ select public.note_ready_rows() $$, '42501', 'permission denied for function note_ready_rows',
  'W9c: a signed-in user cannot call note_ready_rows');
select tests.clear_auth();

select * from finish();
rollback;
