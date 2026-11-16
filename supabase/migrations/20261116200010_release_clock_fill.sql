-- release_clock_fill — production-36h S4, step A (A-fix): the one-time fill of jobs.completion_told_at
-- for job_completed notices that were already final before release_clock.
--
-- WHY ITS OWN FILE. release_clock adds the column with ALTER TABLE, whose table lock is held until
-- that file commits. This file starts after it, so jobs are readable and writable while the fill
-- runs. fill_completion_told_at() (defined in release_clock) writes only completed jobs whose job
-- payment is still held with no release requested, fills null values only, and is safe to run twice:
-- a second run writes nothing.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/490_release_clock.sql §3.

begin;

select public.fill_completion_told_at();

commit;
