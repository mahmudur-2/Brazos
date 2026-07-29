-- phase27_dedupe_seeded_jobs.sql
--
-- phase23/phase24's seed scripts picked a random template independently for
-- every job (`order by random() limit 1` per row, or a fixed mod-cycle in
-- phase24). With dozens of jobs drawn per neighborhood from a template pool
-- of ~25-30, the same title/description/category/price landed on more than
-- one job — visible in the app as two pixel-identical cards back-to-back in
-- "Jobs in this zone". Both seed scripts are now fixed (bag-shuffle, draws
-- without replacement until the pool is exhausted) so this won't recur on a
-- fresh seed, but that fix doesn't retroactively touch rows already sitting
-- in the live database. This migration removes those.
--
-- "Duplicate" = same (title, category, budget_cents, location) — the exact
-- signature a reused template produces. For each such group this keeps the
-- oldest row (by created_at, then id as a tiebreak) and deletes the rest,
-- along with everything that references the deleted jobs.
--
-- Safe to run more than once: once no group has more than one row, it
-- deletes nothing.

do $$
declare
  v_dupe_ids uuid[];
begin
  select array_agg(id) into v_dupe_ids
  from (
    select id, row_number() over (
      partition by title, category, budget_cents, location
      order by created_at asc, id asc
    ) as rn
    from public.jobs
  ) ranked
  where rn > 1;

  if v_dupe_ids is null or array_length(v_dupe_ids, 1) = 0 then
    raise notice 'No duplicate seeded jobs found — nothing to remove.';
    return;
  end if;

  -- Break the jobs<->bids circular reference before deleting bids.
  update public.jobs set accepted_bid_id = null where id = any(v_dupe_ids);

  delete from public.bids where job_id = any(v_dupe_ids);

  -- job_locations/messages/reactions all cascade on job delete already
  -- (phase12/phase9/phase10); portfolio.source_job_id and reports.job_id
  -- set null (phase17/phase13). Explicit deletes below are just belt-and-
  -- suspenders so this migration doesn't depend on remembering that.
  delete from public.job_locations where job_id = any(v_dupe_ids);

  delete from public.jobs where id = any(v_dupe_ids);

  raise notice 'Removed % duplicate seeded job(s).', array_length(v_dupe_ids, 1);
end $$;
