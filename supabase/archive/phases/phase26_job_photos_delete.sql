-- ============================================================================
-- Brazos · job-photos delete policy
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- phase6 gave the `job-photos` bucket SELECT and INSERT policies, but never
-- DELETE — there was no code path that removed a photo after uploading one.
-- PostJobScreen and WorkerJobScreen now do (removing a photo from the picker
-- before submit also deletes it from storage, instead of leaving an orphaned
-- file with nothing pointing at it), so a DELETE policy is needed.
--
-- `job-photos` holds two unrelated path shapes sharing one bucket:
--   postings/{userId}/{unique}.{ext}   — PostJobScreen's attachments
--   {jobId}/{timestamp}.{ext}          — WorkerJobScreen's completion photos
--
-- A single "authenticated can delete anything in this bucket" policy would
-- let any signed-in user delete any other user's already-submitted job
-- photos by guessing/observing the public URL shape — not acceptable. These
-- two policies instead scope delete to exactly what each upload path's own
-- code is allowed to remove: your own posting photos, or completion photos
-- on a job you're the assigned worker for.
-- ============================================================================

drop policy if exists "job_photos_delete_own_posting" on storage.objects;
create policy "job_photos_delete_own_posting"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = 'postings'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "job_photos_delete_own_completion" on storage.objects;
create policy "job_photos_delete_own_completion"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] <> 'postings'
    and exists (
      select 1
      from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and j.assigned_worker_id = auth.uid()
    )
  );
