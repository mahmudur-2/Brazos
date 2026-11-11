-- 337_drain_apikey_probe.sql — lean K1 (20261112020000_drain_apikey_probe.sql): the three drains send
-- the stored server key on apikey and as a Bearer token, drain_receipts() still wakes nothing when
-- nothing waits, and the probe is service_role only and reports status codes alone.
--
-- NOTHING IS SENT. pg_net sends a queued request only after its transaction commits; this file rolls
-- back, so the calls it queues are read from net.http_request_queue and never leave the database.
-- The real calls are the run's own (the timer-path run in the K1 report), not this file's.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(17);

-- ---------------------------------------------------------------------------
-- §1. Who may call what.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.drain_probe()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.drain_probe()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.drain_probe()', 'EXECUTE'),
  'K1: drain_probe() is service_role only');
select ok(has_function_privilege('service_role', 'public.drain_probe_status(jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.drain_probe_status(jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.drain_probe_status(jsonb)', 'EXECUTE'),
  'K1: drain_probe_status(jsonb) is service_role only');
select ok(not has_function_privilege('service_role', 'public.drain_receipts_post()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.drain_receipts_post()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.drain_receipts_post()', 'EXECUTE'),
  'K1: drain_receipts_post() is nobody''s to call but its two definer callers');
select ok(not has_function_privilege('service_role', 'public.drain_notification_outbox()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.drain_notification_outbox()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.drain_notification_outbox()', 'EXECUTE'),
  'K1: drain_notification_outbox() is owner-only, as on staging: cron and drain_probe() run it as its owner');
select ok(has_function_privilege('service_role', 'public.drain_settlements()', 'EXECUTE')
          and has_function_privilege('service_role', 'public.drain_receipts()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.drain_settlements()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.drain_receipts()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.drain_settlements()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.drain_receipts()', 'EXECUTE'),
  'K1: drain_settlements() and drain_receipts() stay service_role only');

-- ---------------------------------------------------------------------------
-- §2. Each call builds both headers from the one stored key.
-- ---------------------------------------------------------------------------
select ok((select p.prosrc ~ '''apikey'',\s*v_key' and p.prosrc ~ '''Authorization'',\s*''Bearer '' \|\| v_key'
             from pg_proc p where p.oid = 'public.drain_notification_outbox()'::regprocedure),
  'K1: drain_notification_outbox() sends the key on apikey and as a Bearer token');
select ok((select p.prosrc ~ '''apikey'',\s*v_key' and p.prosrc ~ '''Authorization'',\s*''Bearer '' \|\| v_key'
             from pg_proc p where p.oid = 'public.drain_settlements()'::regprocedure),
  'K1: drain_settlements() sends the key on apikey and as a Bearer token');
select ok((select p.prosrc ~ '''apikey'',\s*v_key' and p.prosrc ~ '''Authorization'',\s*''Bearer '' \|\| v_key'
             from pg_proc p where p.oid = 'public.drain_receipts_post()'::regprocedure),
  'K1: drain_receipts_post() sends the key on apikey and as a Bearer token');

-- ---------------------------------------------------------------------------
-- §3. No secret, no call: the probe raises the drain's own message.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('role', 'service_role', true);
select throws_ok($$ select public.drain_probe() $$,
  'P0001', 'drain_notification_outbox: vault secrets missing',
  'K1: service — with the Vault empty the probe refuses, naming the drain');

-- ---------------------------------------------------------------------------
-- §4. The probe queues one call to each function, with the stored key on both headers.
-- ---------------------------------------------------------------------------
select public.set_drain_secrets('http://127.0.0.1:1/functions/v1', 'probe-key-not-real');
select public.drain_probe() as probe \gset
select set_config('role', 'none', true);

select is((select array_agg(k order by k) from jsonb_object_keys(:'probe'::jsonb) k),
          array['process_settlements', 'send_push', 'send_receipts'],
  'K1: service — the probe answers one request id per function');

create temp table k1_queued as
select f.name, q.url, q.headers
  from (values ('send_push', '/send-push'), ('process_settlements', '/process-settlements'),
               ('send_receipts', '/send-receipts')) as f(name, path)
  left join net.http_request_queue q on q.id = (:'probe'::jsonb ->> f.name)::bigint
                                    and q.url like '%' || f.path;
select ok((select url is not null and headers ->> 'apikey' = 'probe-key-not-real'
                  and headers ->> 'Authorization' = 'Bearer probe-key-not-real'
             from k1_queued where name = 'send_push'),
  'K1: runner — the send-push call carries the key on apikey and as a Bearer token');
select ok((select url is not null and headers ->> 'apikey' = 'probe-key-not-real'
                  and headers ->> 'Authorization' = 'Bearer probe-key-not-real'
             from k1_queued where name = 'process_settlements'),
  'K1: runner — the process-settlements call carries the key on apikey and as a Bearer token');
select ok((select url is not null and headers ->> 'apikey' = 'probe-key-not-real'
                  and headers ->> 'Authorization' = 'Bearer probe-key-not-real'
             from k1_queued where name = 'send_receipts'),
  'K1: runner — the send-receipts call (the settlement entries'' fallback) carries it too');

-- ---------------------------------------------------------------------------
-- §5. The status: null while waiting, and never more than a status.
-- ---------------------------------------------------------------------------
select set_config('role', 'service_role', true);
select is(public.drain_probe_status(:'probe'::jsonb),
          '{"send_push": null, "process_settlements": null, "send_receipts": null}'::jsonb,
  'K1: service — before the commit nothing was sent, so each answer is still waiting (null)');
select is(public.drain_probe_status('{"send_push": "not-an-id", "extra": 1}'::jsonb),
          '{"send_push": null, "process_settlements": null, "send_receipts": null}'::jsonb,
  'K1: service — a bad id answers waiting, and only the three names are ever answered');
select set_config('role', 'none', true);
select ok((select p.prosrc !~* '(content|headers|error_msg|decrypted_secret)'
             from pg_proc p where p.oid = 'public.drain_probe_status(jsonb)'::regprocedure),
  'K1: drain_probe_status() reads no body, header, error text or secret');

-- ---------------------------------------------------------------------------
-- §6. The split kept drain_receipts()'s answer.
-- ---------------------------------------------------------------------------
select set_config('role', 'service_role', true);
select is(public.drain_receipts(), null::bigint,
  'K1: service — with no receipt waiting, drain_receipts() still calls nothing');
select set_config('role', 'none', true);

select * from finish();
rollback;
