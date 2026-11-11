-- B3 (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): the hired worker reads
-- the exact address only while the job is theirs to do.
--
-- job_locations_select_party (20260901000000_baseline.sql:7266-7268) let the assigned worker read the
-- customer's address forever: after the job was completed, and after it was cancelled. The owner
-- still reads it always; the hired worker now only while the job is assigned or in progress, the
-- span in which they travel there and work. The worker's screen already shows the address only
-- then (screens/WorkerJobScreen.tsx, isLiveJob), and the header's approximate area afterwards.
--
-- The jobs subquery runs as the reader, as before. Statuses are an allow-list. Additive: ALTER POLICY.

begin;

alter policy job_locations_select_party on public.job_locations using (
  exists (
    select 1
    from public.jobs j
    where j.id = job_locations.job_id
      and (
        j.client_id = auth.uid()
        or (j.assigned_worker_id = auth.uid() and j.status in ('assigned', 'in_progress'))
      )
  )
);

comment on policy job_locations_select_party on public.job_locations is
  'B3: the job''s owner always; the hired worker only while the job is assigned or in progress. Nobody else.';

commit;
