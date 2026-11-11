-- 20261112000400_read_path_indexes.sql — ledger B17, "missing indexes"
-- (docs/critical/production-path.md, part E).
--
-- Two app reads had no index that leads with their filter:
--   lib/notifications.ts — notification_outbox by recipient_id, newest first (the list and the
--                          unread count);
--   lib/jobs.ts          — jobs by assigned_worker_id, newest first (the worker's jobs).
-- Plain create index (each takes a short lock on its table while it builds); safe to run twice.
--
-- Proof: supabase/tests/334_read_path_indexes.sql.

begin;

create index if not exists notification_outbox_recipient_created_idx
  on public.notification_outbox (recipient_id, created_at desc);

create index if not exists jobs_assigned_worker_created_idx
  on public.jobs (assigned_worker_id, created_at desc);

commit;
