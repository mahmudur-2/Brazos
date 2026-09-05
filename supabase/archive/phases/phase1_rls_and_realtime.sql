-- ============================================================================
-- Brazos · Phase 1 RLS policies + realtime enablement
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Covers what Prompt 3 (Post a Job / My Jobs) and Prompt 4 (Browse / Bid) need:
--   * clients can post and read their own jobs
--   * any signed-in user can browse OPEN jobs
--   * job owners can read the bids on their jobs (powers the bid count)
--   * workers can place and read their own bids
--   * the worker browse feed gets live updates via realtime on `jobs`
-- A few owner/assigned-worker UPDATE policies are included so Prompt 5
-- (accept a bid) and Prompt 6 (complete) work without revisiting this file.
-- ============================================================================

-- Make sure RLS is on (no-op if already enabled).
alter table public.jobs enable row level security;
alter table public.bids enable row level security;

-- ----------------------------------------------------------------------------
-- jobs
-- ----------------------------------------------------------------------------

-- SELECT: any authenticated user can see open jobs (worker browse feed).
drop policy if exists "jobs_select_open" on public.jobs;
create policy "jobs_select_open"
  on public.jobs for select
  to authenticated
  using (status = 'open');

-- SELECT: clients can always see their own jobs (My Jobs, any status).
drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own"
  on public.jobs for select
  to authenticated
  using (client_id = auth.uid());

-- SELECT: the assigned worker can see the job they were picked for.
drop policy if exists "jobs_select_assigned_worker" on public.jobs;
create policy "jobs_select_assigned_worker"
  on public.jobs for select
  to authenticated
  using (assigned_worker_id = auth.uid());

-- INSERT: a client can only create jobs owned by themselves.
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own"
  on public.jobs for insert
  to authenticated
  with check (client_id = auth.uid());

-- UPDATE: the owning client can update their job (e.g. assign / cancel).
drop policy if exists "jobs_update_own" on public.jobs;
create policy "jobs_update_own"
  on public.jobs for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- UPDATE: the assigned worker can update their job (e.g. in_progress / done).
drop policy if exists "jobs_update_assigned_worker" on public.jobs;
create policy "jobs_update_assigned_worker"
  on public.jobs for update
  to authenticated
  using (assigned_worker_id = auth.uid())
  with check (assigned_worker_id = auth.uid());

-- ----------------------------------------------------------------------------
-- bids
-- ----------------------------------------------------------------------------

-- SELECT: workers can read their own bids (My Bids).
drop policy if exists "bids_select_own" on public.bids;
create policy "bids_select_own"
  on public.bids for select
  to authenticated
  using (worker_id = auth.uid());

-- SELECT: a job's owner can read all bids on that job (bid count, Prompt 5).
drop policy if exists "bids_select_job_owner" on public.bids;
create policy "bids_select_job_owner"
  on public.bids for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = bids.job_id
        and j.client_id = auth.uid()
    )
  );

-- INSERT: a worker can only place a bid as themselves.
drop policy if exists "bids_insert_own" on public.bids;
create policy "bids_insert_own"
  on public.bids for insert
  to authenticated
  with check (worker_id = auth.uid());

-- UPDATE: a worker can update their own bid (e.g. withdraw).
drop policy if exists "bids_update_own" on public.bids;
create policy "bids_update_own"
  on public.bids for update
  to authenticated
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid());

-- UPDATE: a job's owner can update bids on their job (accept / reject, Prompt 5).
drop policy if exists "bids_update_job_owner" on public.bids;
create policy "bids_update_job_owner"
  on public.bids for update
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = bids.job_id
        and j.client_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Realtime — add tables to the supabase_realtime publication (guarded so
-- re-running doesn't error with "already member of publication").
-- `jobs` powers the live worker browse feed; `bids` is added too so bid
-- updates can stream live in later prompts.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bids'
  ) then
    alter publication supabase_realtime add table public.bids;
  end if;
end $$;
