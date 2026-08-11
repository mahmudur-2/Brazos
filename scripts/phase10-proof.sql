-- ============================================================================
-- BRAZOS V2 · Phase 10 · automated review-integrity proof (A–C)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase10-proof.sql "$SUPABASE_DB_URL_STAGING"
--
-- Run AFTER scripts/seed-phase-6.sql (job B "Mount a closet shelf" is the
-- completed fixture). ONE transaction through RLS as the seeded identities,
-- ROLLBACK, zero residue. Fixture surgery, declared: any review left on the
-- seeded job by a previous device pass is cleared first (rolled back too).
--
--   A the DoD rule: only a party, only a completed job, only the other party
--   B one review per (job, reviewer); aggregates move with the insert
--   C the tip is already a ledger row (re-asserted from phase6-proof's G)
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

create temp table probe (k text primary key, v uuid);
grant select, insert, update on probe to authenticated;
insert into probe (k, v) values
  ('c',  'b6c00000-0000-4000-8000-000000000001'),
  ('wa', 'b6c00000-0000-4000-8000-000000000002'),
  ('wb', 'b6c00000-0000-4000-8000-000000000003'),
  ('job_done', 'b6c00000-0000-4000-8000-00000000000b'),   -- completed fixture
  ('job_live', 'b6c00000-0000-4000-8000-00000000000a');   -- assigned fixture

-- Fixture surgery (owner, rolled back): clear prior device-pass reviews so
-- the unique-constraint case below tests THIS transaction's insert.
delete from public.reviews where job_id = (select v from probe where k='job_done');

create function pg_temp.become(p_key text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', (select v from probe where k = p_key), 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end $$;

-- ---------------------------------------------------------------------------
-- A. THE BOUNDARY — through create_review(), the ONLY write path (phase29
--    revoked direct INSERT; the phase54 policy is defense-in-depth behind
--    that revoke). Direct INSERT refusal is asserted last.
-- ---------------------------------------------------------------------------
select pg_temp.become('wb');
do $$
begin
  begin
    perform public.create_review(
      (select v from probe where k='job_done'),
      (select v from probe where k='wa'), 5, 'PHASE10 PROOF outsider', '[]'::jsonb);
    raise exception 'A: an OUTSIDER was allowed to review a job they were not part of';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS A1: an outsider cannot review the pair''s job (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('c');
do $$
begin
  begin
    perform public.create_review(
      (select v from probe where k='job_live'),
      (select v from probe where k='wa'), 5, 'PHASE10 PROOF too early', '[]'::jsonb);
    raise exception 'A: a review was accepted before the job completed';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS A2: no review before completed (%)', sqlerrm;
  end;
  begin
    perform public.create_review(
      (select v from probe where k='job_done'),
      (select v from probe where k='wb'), 5, 'PHASE10 PROOF wrong reviewee', '[]'::jsonb);
    raise exception 'A: a review naming a NON-party reviewee was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS A3: the reviewee must be the other party (%)', sqlerrm;
  end;
  begin
    insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment)
    values ((select v from probe where k='job_done'), (select v from probe where k='c'),
            (select v from probe where k='wa'), 5, 'PHASE10 PROOF direct insert');
    raise exception 'A: a DIRECT insert into reviews was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS A4: direct table inserts stay revoked (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- B. ONE PER JOB + AGGREGATES — the legitimate path.
-- ---------------------------------------------------------------------------
do $$
declare v_before int; v_after int; v_avg numeric;
begin
  select rating_count into v_before from public.profiles
  where id = (select v from probe where k='wa');

  perform public.create_review(
    (select v from probe where k='job_done'),
    (select v from probe where k='wa'), 5, 'PHASE10 PROOF legitimate', '[]'::jsonb);

  select rating_count, rating_avg into v_after, v_avg from public.profiles
  where id = (select v from probe where k='wa');
  if v_after <> coalesce(v_before, 0) + 1 then
    raise exception 'B: rating_count did not move with the insert (% -> %)', v_before, v_after;
  end if;
  if v_avg is null or v_avg < 1 or v_avg > 5 then
    raise exception 'B: rating_avg out of range after insert (%)', v_avg;
  end if;

  begin
    perform public.create_review(
      (select v from probe where k='job_done'),
      (select v from probe where k='wa'), 4, 'PHASE10 PROOF duplicate', '[]'::jsonb);
    raise exception 'B: a second review of the same job by the same reviewer was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS B: one review per (job, reviewer); aggregates moved % -> %, avg %', v_before, v_after, v_avg;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- C. THE TIP IS A LEDGER ROW (shape re-assertion; the full flow is
--    phase6-proof G). kind='tip' exists in the enum and the one-active
--    partial unique covers (job, kind) pairs.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payment_kind' and e.enumlabel = 'tip'
  ) then
    raise exception 'C: payment_kind has no tip label';
  end if;
  if not exists (
    select 1 from pg_indexes
    where tablename = 'payments' and indexname = 'payments_one_active_per_job_kind'
  ) then
    raise exception 'C: the one-active-per-(job,kind) index is missing';
  end if;
  raise notice 'PASS C: tips are ledger rows under the one-per-job discipline';
end $$;

rollback;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.reviews where comment like 'PHASE10 PROOF%';
  if v_count <> 0 then raise exception 'RESIDUE: % probe reviews survived', v_count; end if;
  raise notice 'PASS RESIDUE: rollback left zero probe rows';
end $$;
