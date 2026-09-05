-- ============================================================================
-- BRAZOS V2 · Phase 10 · review integrity
--
-- Safe to re-run (idempotent). Apply with psql; verify with
-- `node scripts/verify-schema.mjs`.
--
-- What already held (audited, then PROVEN in scripts/phase10-proof.sql):
-- UNIQUE (job_id, reviewer_id); rating 1..5 CHECK; rating_avg/rating_count
-- maintained by the phase6 recompute trigger; and — the load-bearing part —
-- phase29 REVOKED direct INSERT on reviews and made create_review() the only
-- write path, which already enforces party-of-completed-job, the correct
-- counterparty, rating bounds and comment length. The Phase 10 DoD ("one
-- review per completed job enforced in DB") was therefore already true.
--
-- What this file adds is DEFENSE IN DEPTH: the phase6-era INSERT policy
-- still said only `reviewer_id = auth.uid()`, which is unreachable today
-- (the grant is revoked) but would become the only guard if a future
-- migration ever re-granted INSERT. The policy now states the full rule, so
-- the table tells the truth with or without the revoke. Strictly narrowing;
-- no reachable write path changes at all.
-- ============================================================================

begin;

drop policy if exists "users insert own reviews" on public.reviews;
drop policy if exists "reviews_insert_completed_party" on public.reviews;
create policy "reviews_insert_completed_party"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.is_active_user()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.status = 'completed'
        and (
          (j.client_id = auth.uid() and j.assigned_worker_id = reviewee_id)
          or (j.assigned_worker_id = auth.uid() and j.client_id = reviewee_id)
        )
    )
  );

comment on policy "reviews_insert_completed_party" on public.reviews is
  'Phase 10: a review is written only by a party of a COMPLETED job, only about the other party, once (the phase6 unique constraint). The rating trigger keeps aggregates in sync.';

create or replace function public.review_integrity_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.review_integrity_enabled() from public, anon;
grant execute on function public.review_integrity_enabled() to authenticated;

notify pgrst, 'reload schema';

commit;
