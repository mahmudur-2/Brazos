-- 333_notifications_failed.sql — ledger B17, "notifications never 'failed'"
-- (20261112000300_notifications_failed.sql): claim_notification_batch() now ends a pending row that
-- has used its five attempts as 'failed', with 'retries exhausted' when it carries no error, instead
-- of leaving it pending for ever. Everything else about the claim is unchanged.
--
-- THE FIXTURE: one recipient and five outbox rows written by the runner, dated in 2000 so they come
-- first in the claim's created_at order whatever else is pending. Assertions read only these rows,
-- except the last invariant, which is the point of the fix. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(10);

select tests.create_user('b17.recipient@brazos.test', 'Rita Recipient') as rcpt \gset

insert into public.notification_outbox (recipient_id, category, type, title, body, status, attempts, last_error, dedupe_key, created_at)
values
  (:'rcpt', 'messages', 'b17_exhausted', 'B17', 'exhausted', 'pending', 5, null,            'b17:exhausted', '2000-01-01 00:00:01+00'),
  (:'rcpt', 'messages', 'b17_kept',      'B17', 'kept',      'pending', 6, 'push: timeout', 'b17:kept',      '2000-01-01 00:00:02+00'),
  (:'rcpt', 'messages', 'b17_last_try',  'B17', 'last try',  'pending', 4, null,            'b17:last_try',  '2000-01-01 00:00:03+00'),
  (:'rcpt', 'messages', 'b17_sent',      'B17', 'sent',      'sent',    5, null,            'b17:sent',      '2000-01-01 00:00:04+00'),
  (:'rcpt', 'messages', 'b17_skipped',   'B17', 'skipped',   'skipped', 5, null,            'b17:skipped',   '2000-01-01 00:00:05+00');

create temp table claimed (round int, type text) on commit drop;
insert into claimed select 1, c.type from public.claim_notification_batch(100) c where c.recipient_id = :'rcpt';

select is((select string_agg(type, ',' order by type) from claimed where round = 1), 'b17_last_try',
  'B17: the first claim hands out the row with one attempt left, and neither row that has used five');
select is((select status || ' / ' || last_error from public.notification_outbox where dedupe_key = 'b17:exhausted'),
  'failed / retries exhausted',
  'B17: a pending row at five attempts ends failed, with the reason written');
select is((select status || ' / ' || last_error from public.notification_outbox where dedupe_key = 'b17:kept'),
  'failed / push: timeout',
  'B17: a row that already carries an error keeps it');
select is((select status || ' / ' || attempts from public.notification_outbox where dedupe_key = 'b17:last_try'),
  'pending / 5',
  'B17: the claimed row used its fifth attempt and is still pending, waiting for the sender''s answer');

insert into claimed select 2, c.type from public.claim_notification_batch(100) c where c.recipient_id = :'rcpt';
select is((select count(*) from claimed where round = 2), 0::bigint,
  'B17: the next claim hands out nothing for this recipient');
select is((select status || ' / ' || last_error from public.notification_outbox where dedupe_key = 'b17:last_try'),
  'failed / retries exhausted',
  'B17: … and the row whose fifth attempt failed is now failed');

select is((select string_agg(status || ':' || attempts, ',' order by dedupe_key) from public.notification_outbox
            where dedupe_key in ('b17:sent', 'b17:skipped')),
  'sent:5,skipped:5',
  'B17: sent and skipped rows are never touched');
select ok(not exists (select 1 from public.notification_outbox where status = 'pending' and attempts >= 5),
  'B17: after a claim no row anywhere is pending with five attempts used');

select ok(has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.claim_notification_batch(integer)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.claim_notification_batch(integer)', 'EXECUTE'),
  'B17: claim_notification_batch stays service_role only');
select ok(
  (select p.prosrc like '%quiet hours: stale by morning%' and p.prosrc like '%for update skip locked%'
     from pg_proc p where p.oid = 'public.claim_notification_batch(integer)'::regprocedure),
  'B17: the quiet-hours re-check and the skip-locked claim are still in the body');

select * from finish();
rollback;
