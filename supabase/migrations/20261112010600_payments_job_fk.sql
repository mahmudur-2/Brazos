-- 20261112010600_payments_job_fk.sql — lean B17: deleting a job never deletes its money record.
-- Spec: docs/critical/money-safety.md.
--
-- WHAT WAS WRONG. payments_job_id_fkey was ON DELETE CASCADE (baseline): a job deleted by any
-- path would take its payments rows with it, and with them the only record of a charge, a
-- transfer or a refund.
--
-- WHAT CHANGES. The same constraint, same name, same columns, without the cascade (NO ACTION):
-- deleting a job that has a payments row is refused with 23503. Today no path reaches it: the
-- one job delete is the owner's (policy jobs_delete_own -> can_delete_own_job: status open, no
-- bids, no job_offers), and a payments row exists only after accept_offer, which needs an
-- offer. delete_my_account and ban_user keep jobs; no RPC or sweep deletes one. The app maps
-- any refused delete to a plain sentence (lib/errorMessage.ts userMessage).
--
-- One ALTER, both actions in one statement: the constraint never stops existing. Not a
-- destructive shape under scripts/staging-scan.sh (no table, column or schema is dropped).

begin;

alter table public.payments
  drop constraint payments_job_id_fkey,
  add constraint payments_job_id_fkey foreign key (job_id) references public.jobs (id);

comment on constraint payments_job_id_fkey on public.payments is
  'B17 (20261112010600): NO ACTION, never cascade. A job with a payments row cannot be deleted; the money record outlives everything.';

commit;
