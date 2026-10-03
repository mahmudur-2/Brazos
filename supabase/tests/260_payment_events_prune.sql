-- 260_payment_events_prune.sql — FIX-RUN A19's proofs: 20261003000500_payment_events_prune.sql
-- proven on the local stack before the pipeline applies it anywhere.
--
-- THE CAST: the runner alone — payment_events is service_role's table, and the prune is a
-- scheduled function. Three raw rows: an old processed event, a fresh processed event, and an old
-- UNprocessed event. Everything rolls back; no commit.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(11);

insert into public.payment_events (id, type, payload, received_at, processed_at)
values
  ('evt_a19_old_done',  'payment_intent.succeeded', '{"id": "evt_a19_old_done", "type": "payment_intent.succeeded", "data": {"object": {"id": "pi_a19", "billing_details": {"name": "Cara Customer"}}}}'::jsonb, now() - interval '100 days', now() - interval '100 days'),
  ('evt_a19_fresh',     'payment_intent.succeeded', '{"id": "evt_a19_fresh", "type": "payment_intent.succeeded", "data": {"object": {"id": "pi_a19_fresh"}}}'::jsonb, now() - interval '10 days', now() - interval '10 days'),
  ('evt_a19_old_undone','charge.refunded',          '{"id": "evt_a19_old_undone", "type": "charge.refunded", "data": {"object": {"id": "ch_a19"}}}'::jsonb, now() - interval '100 days', null);

-- ---------------------------------------------------------------------------
-- 1. The prune: one row, the old processed one; the stub keeps id and type and drops the details.
-- ---------------------------------------------------------------------------
select is(public.prune_payment_event_payloads(), 1, '1a: exactly one payload is pruned');
select is(
  (select payload - 'pruned_at' from public.payment_events where id = 'evt_a19_old_done'),
  '{"id": "evt_a19_old_done", "type": "payment_intent.succeeded"}'::jsonb,
  '1b: the old processed payload is the stub — id and type, nothing of the cardholder'
);
select ok(
  (select (payload->>'pruned_at')::timestamptz > now() - interval '1 minute' from public.payment_events where id = 'evt_a19_old_done'),
  '1c: and it says when it was pruned'
);
select ok((select count(*) = 1 from public.payment_events where id = 'evt_a19_old_done'), '1d: the row itself stays — the idempotency record');
select is(
  (select payload->'data'->'object'->>'id' from public.payment_events where id = 'evt_a19_fresh'),
  'pi_a19_fresh',
  '1e: a fresh processed event is left whole'
);
select is(
  (select payload->'data'->'object'->>'id' from public.payment_events where id = 'evt_a19_old_undone'),
  'ch_a19',
  '1f: an old UNprocessed event is left whole — a defect to look at, not data to shred'
);

-- ---------------------------------------------------------------------------
-- 2. Idempotent, and the window is the caller's.
-- ---------------------------------------------------------------------------
select is(public.prune_payment_event_payloads(), 0, '2a: a second run prunes nothing');
select is(public.prune_payment_event_payloads(interval '1 day'), 1, '2b: a shorter window reaches the fresh processed event');

-- ---------------------------------------------------------------------------
-- 3. ACLs, the installer on a stack without pg_cron, and the comment that now tells the truth.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.prune_payment_event_payloads(interval)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.prune_payment_event_payloads(interval)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.prune_payment_event_payloads(interval)', 'EXECUTE'),
  '3a: the prune is the service role''s alone'
);
select ok(
  has_function_privilege('service_role', 'public.install_payment_events_prune()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.install_payment_events_prune()', 'EXECUTE')
  and public.install_payment_events_prune() in ('skipped: pg_cron absent', 'scheduled: brazos-prune-payment-events'),
  '3b: the installer is the service role''s, and it installs or skips cleanly'
);
select ok(
  (select obj_description('public.payment_events'::regclass, 'pg_class')) like '%prune_payment_event_payloads()%',
  '3c: the table comment names the function that prunes it'
);

select * from finish();
rollback;
