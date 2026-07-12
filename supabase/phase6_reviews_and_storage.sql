-- ============================================================================
-- Brazos · Prompt 6 (complete + two-way review)
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Adds:
--   1. jobs.completion_photo_url column (worker's optional "done" photo)
--   2. reviews RLS (insert only by a party to a completed job; read own)
--   3. a one-review-per-reviewer-per-job unique index
--   4. a trigger that keeps each reviewee's rating_avg / rating_count in sync
--   5. the public `job-photos` storage bucket + policies
--
-- Status transitions (assigned -> in_progress -> completed) reuse the job
-- UPDATE policies from phase1_rls_and_realtime.sql (jobs_update_assigned_worker),
-- so run that file first if you haven't.
-- ============================================================================

-- 1. Worker's "done" photo URL --------------------------------------------------
alter table public.jobs
  add column if not exists completion_photo_url text;

-- 2 + 3. reviews: RLS + uniqueness ---------------------------------------------
alter table public.reviews enable row level security;

create unique index if not exists reviews_job_reviewer_uniq
  on public.reviews (job_id, reviewer_id);

-- INSERT: reviewer must be a party (client or assigned worker) to the COMPLETED
-- job, and the reviewee must be the other party. Enforces valid two-way reviews.
drop policy if exists "reviews_insert_party" on public.reviews;
create policy "reviews_insert_party"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.jobs j
      where j.id = reviews.job_id
        and j.status = 'completed'
        and (
          (j.client_id = auth.uid() and reviews.reviewee_id = j.assigned_worker_id)
          or (j.assigned_worker_id = auth.uid() and reviews.reviewee_id = j.client_id)
        )
    )
  );

-- SELECT: you can read reviews you wrote or received.
drop policy if exists "reviews_select_party" on public.reviews;
create policy "reviews_select_party"
  on public.reviews for select
  to authenticated
  using (reviewer_id = auth.uid() or reviewee_id = auth.uid());

-- 4. Keep reviewee rating_avg / rating_count in sync ---------------------------
-- SECURITY DEFINER so it can update the reviewee's profile row regardless of
-- profile RLS (the client never writes another user's rating directly).
create or replace function public.recompute_profile_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update public.profiles p
  set
    rating_count = (select count(*) from public.reviews r where r.reviewee_id = target),
    rating_avg = coalesce(
      (select avg(r.rating) from public.reviews r where r.reviewee_id = target),
      0
    )
  where p.id = target;
  return null;
end;
$$;

drop trigger if exists trg_reviews_rating on public.reviews;
create trigger trg_reviews_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_profile_rating();

-- 5. Storage bucket for job photos ---------------------------------------------
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

-- Public read of job photos (bucket is public); authenticated users can upload.
drop policy if exists "job_photos_read" on storage.objects;
create policy "job_photos_read"
  on storage.objects for select
  to public
  using (bucket_id = 'job-photos');

drop policy if exists "job_photos_insert" on storage.objects;
create policy "job_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'job-photos');
