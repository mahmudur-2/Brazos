-- B17 part 1 (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): a bid count
-- answers only about a job the caller may see.
--
-- job_offer_count(uuid) (20260901000000_baseline.sql:2451-2460) counted the bids on ANY job id for
-- anyone, and job_offer_counts(uuid[]) (:2470-2483) only checked that the caller was signed in. A
-- count is a status oracle: it tells a stranger that a private or hired job exists and how many
-- people bid on it. Both now answer for an open open-market job (what the market shows anyway),
-- and for the job's owner, its hired worker, or a worker who has an offer on it; for any other job
-- the batch leaves the id out and the single count is 0, as for a job with no bids. The single
-- count delegates to the batch, so the rule is written once. Callers: hooks/useOfferCounts.ts (the
-- market's lists) and hooks/useJobOwnerActions.ts (the owner's own job).
--
-- Additive: CREATE OR REPLACE on the same signatures; ACLs restated.

begin;

CREATE OR REPLACE FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) RETURNS TABLE("job_id" "uuid", "offer_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select o.job_id, count(*)::int
  from public.job_offers o
  join public.jobs j on j.id = o.job_id
  where auth.uid() is not null
    and p_job_ids is not null
    and array_length(p_job_ids, 1) <= 200
    and o.job_id = any (p_job_ids)
    and o.offer_type = 'marketplace_bid'
    and o.parent_offer_id is null
    and (
      (j.status = 'open' and j.visibility = 'open_market')
      or j.client_id = auth.uid()
      or j.assigned_worker_id = auth.uid()
      or exists (
        select 1 from public.job_offers mine
        where mine.job_id = j.id
          and mine.worker_id = auth.uid()
      )
    )
  group by o.job_id;
$$;

COMMENT ON FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) IS 'Batched bid counts (root marketplace bids), B17: only for an open open-market job, or a job the caller owns, is hired on, or has an offer on. Any other id, and a job with no bids, is absent; the caller treats a missing id as zero. Capped at 200 ids so this cannot become a bulk scan.';

REVOKE ALL ON FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."job_offer_counts"("p_job_ids" "uuid"[]) TO authenticated;

CREATE OR REPLACE FUNCTION "public"."job_offer_count"("p_job_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select c.offer_count from public.job_offer_counts(array[p_job_id]) c),
    0
  );
$$;

COMMENT ON FUNCTION "public"."job_offer_count"("p_job_id" "uuid") IS 'The bid count of one job, through job_offer_counts() and its rule (B17): 0 for a job the caller may not see, as for a job with no bids.';

REVOKE ALL ON FUNCTION "public"."job_offer_count"("p_job_id" "uuid") FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."job_offer_count"("p_job_id" "uuid") TO authenticated;

commit;
