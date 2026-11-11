-- 334_read_path_indexes.sql — ledger B17, "missing indexes" (20261112000400_read_path_indexes.sql):
-- the two app reads that had no leading index get one. lib/notifications.ts reads notification_outbox
-- by recipient_id, newest first; lib/jobs.ts reads jobs by assigned_worker_id, newest first.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(4);

select is(
  (select i.indrelid::regclass from pg_index i where i.indexrelid = to_regclass('public.notification_outbox_recipient_created_idx')),
  'public.notification_outbox'::regclass,
  'B17: notification_outbox_recipient_created_idx exists on notification_outbox');
select ok(
  pg_get_indexdef(to_regclass('public.notification_outbox_recipient_created_idx')) like '%USING btree (recipient_id, created_at DESC)',
  'B17: … leading with recipient_id, newest first');
select is(
  (select i.indrelid::regclass from pg_index i where i.indexrelid = to_regclass('public.jobs_assigned_worker_created_idx')),
  'public.jobs'::regclass,
  'B17: jobs_assigned_worker_created_idx exists on jobs');
select ok(
  pg_get_indexdef(to_regclass('public.jobs_assigned_worker_created_idx')) like '%USING btree (assigned_worker_id, created_at DESC)',
  'B17: … leading with assigned_worker_id, newest first');

select * from finish();
rollback;
