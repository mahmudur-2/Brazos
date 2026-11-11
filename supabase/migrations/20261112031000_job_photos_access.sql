-- B9 and B17 part 2 (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): who may
-- list a job's photos, and when the hired worker may add or remove completion proof.
--
-- B9. job_photos_read (20260901000000_baseline.sql:7685) let every signed-in account list every
-- object in job-photos: every posting, review and completion file of every job. It now admits the
-- account's own postings/<uid>/ and reviews/<uid>/ folders, and a job's folder to that job's owner
-- and hired worker. Every upload path the app uses is readable by its uploader at the moment of the
-- upload (an upsert reads its own new row back): postings/<me>/…, reviews/<me>/…, <job>/… for the
-- hired worker. The app shows job photos through public URLs, which no policy governs.
--
-- B17 part 2. job_photos_insert (:7675-7677) and job_photos_delete_own_completion (:7661-7663) let
-- the assigned worker add or remove files in the job's folder in any status, so proof could change
-- after "Mark complete". Both now require the job to be in progress, the only time the app offers
-- the upload (screens/WorkerJobScreen.tsx). The posting branch of job_photos_insert is unchanged.
--
-- The jobs subqueries run as the reader, as before. Additive: ALTER POLICY, names kept.

begin;

alter policy job_photos_read on storage.objects using (
  bucket_id = 'job-photos'
  and (
    (
      (storage.foldername(name))[1] in ('postings', 'reviews')
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or exists (
      select 1
      from public.jobs j
      where j.id::text = (storage.foldername(objects.name))[1]
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
  )
);

alter policy job_photos_insert on storage.objects with check (
  bucket_id = 'job-photos'
  and public.is_active_user()
  and (
    (
      (storage.foldername(name))[1] = 'postings'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] <> 'postings'
      and exists (
        select 1
        from public.jobs j
        where j.id::text = (storage.foldername(objects.name))[1]
          and j.assigned_worker_id = auth.uid()
          and j.status = 'in_progress'
      )
    )
  )
);

alter policy job_photos_delete_own_completion on storage.objects using (
  bucket_id = 'job-photos'
  and (storage.foldername(name))[1] <> 'postings'
  and exists (
    select 1
    from public.jobs j
    where j.id::text = (storage.foldername(objects.name))[1]
      and j.assigned_worker_id = auth.uid()
      and j.status = 'in_progress'
  )
);

commit;
