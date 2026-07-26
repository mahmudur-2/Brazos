-- ============================================================================
-- Brazos · Let a job's poster edit or delete their own listing, zero-bid only
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- THE FEATURE
--   A client can edit (title/description/category/location/budget/photos) or
--   delete a job they posted, but only while it has zero bids — once someone
--   has responded, changing or pulling the listing out from under them isn't
--   fair, so the app hides both options entirely at that point.
--
-- WHY THIS FILE
--   Editing reuses the existing "jobs_update_own" policy (client_id =
--   auth.uid(), no bid-count restriction) unchanged — it's already what lets
--   acceptBid() and cancellation update a job's status/assigned_worker_id
--   *after* bids exist, so it can't be narrowed to zero-bid-only without
--   breaking those flows. The zero-bid rule for editing is enforced by the
--   app only showing the Edit button in that state (same trust level as most
--   of this app's business rules — e.g. Hire Again's eligibility check).
--
--   Deletion is different: there's no existing DELETE policy on `jobs` at
--   all yet, and deleting is a single atomic action with no other legitimate
--   use case to protect (unlike UPDATE), so the zero-bid rule is enforced
--   here at the database level, not just hidden in the UI.
--
--   job_locations doesn't need its own delete policy for the delete-job flow
--   — job_locations.job_id has ON DELETE CASCADE back to jobs (see phase12),
--   so deleting the jobs row removes its location row automatically. It DOES
--   need a delete policy for editing, though: if a poster changes the
--   location text without re-pinning, the old coordinates no longer match
--   and the app deletes that stale row directly (see lib/jobs.ts
--   updateJob()) rather than leave a mismatched pin on the map.
-- ============================================================================

-- DELETE: a client may delete their own job only while it has no bids.
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_delete_own"
  on public.jobs for delete
  to authenticated
  using (
    client_id = auth.uid()
    and not exists (select 1 from public.bids b where b.job_id = jobs.id)
  );

-- DELETE: a client may drop their own job's saved coordinates (used when
-- editing invalidates them, not just when deleting the whole job).
drop policy if exists "job_locations_delete_owner" on public.job_locations;
create policy "job_locations_delete_owner"
  on public.job_locations for delete
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_locations.job_id and j.client_id = auth.uid()
    )
  );
