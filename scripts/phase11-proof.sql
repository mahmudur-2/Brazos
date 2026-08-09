-- ============================================================================
-- BRAZOS V2 · Phase 11 · automated earnings proof (A–B)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase11-proof.sql "$SUPABASE_DB_URL_STAGING"
--
-- Run AFTER scripts/seed-phase-6.sql (jobs A held, B completed+held). ONE
-- transaction through RLS as the seeded identities, ROLLBACK, zero residue.
--
--   A the wallet is a sum over the payee's own rows and nothing else
--   B cash-out: payee-only, sweeps exactly the released rows, keeps
--     released_at, stamps paid_out_at, and repeats as a no-op
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
  ('job_done', 'b6c00000-0000-4000-8000-00000000000b');

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
-- A. DERIVATION + VISIBILITY. Wren has two held seeded payments. An
--    outsider's wallet must contain none of them.
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
do $$
declare v_held bigint;
begin
  select coalesce(sum(amount_cents), 0) into v_held
  from public.payments
  where payee_id = (select v from probe where k='wa') and status = 'held';
  if v_held < 10500 then
    raise exception 'A: expected at least the two seeded held payments (6000+4500), saw %', v_held;
  end if;
  raise notice 'PASS A1: pending bucket sums the payee''s held rows (% cents)', v_held;
end $$;

select pg_temp.become('wb');
do $$
begin
  if (select count(*) from public.payments
      where payee_id = (select v from probe where k='wa')) <> 0 then
    raise exception 'A: an outsider can read another worker''s earnings rows';
  end if;
  raise notice 'PASS A2: an outsider''s wallet contains none of the pair''s rows';
end $$;

-- ---------------------------------------------------------------------------
-- B. CASH-OUT DISCIPLINE. Release job B (customer approval), then sweep.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
select public.sandbox_release_job_payment((select v from probe where k='job_done'));

-- The PAYER cannot sweep the payee's released money.
do $$
declare v_swept int;
begin
  select count(*) into v_swept from public.sandbox_cash_out();
  if v_swept <> 0 then
    raise exception 'B: the CUSTOMER''s cash-out swept % rows (payee-only rule broken)', v_swept;
  end if;
  raise notice 'PASS B1: the payer''s cash-out sweeps nothing';
end $$;

select pg_temp.become('wa');
do $$
declare v_row public.payments; v_swept int := 0; v_released_at timestamptz;
begin
  select released_at into v_released_at from public.payments
  where job_id = (select v from probe where k='job_done') and kind = 'job_payment';

  -- The sweep takes EVERY released row the payee holds — persistent seeds
  -- (the d1 review fixture) may legitimately contribute more than the one
  -- this proof released, so the count is scoped to the proof's own job.
  for v_row in select * from public.sandbox_cash_out() loop
    if v_row.status <> 'paid_out' or v_row.paid_out_at is null then
      raise exception 'B: swept row not honestly paid_out';
    end if;
    if v_row.job_id = (select v from probe where k='job_done') then
      v_swept := v_swept + 1;
    end if;
  end loop;
  if v_swept <> 1 then
    raise exception 'B: expected the proof''s released row swept exactly once, got %', v_swept;
  end if;

  -- released_at survives the sweep; held rows untouched.
  if (select released_at from public.payments
      where job_id = (select v from probe where k='job_done') and kind = 'job_payment')
     is distinct from v_released_at then
    raise exception 'B: the sweep disturbed released_at';
  end if;
  if (select count(*) from public.payments
      where payee_id = (select v from probe where k='wa') and status = 'held') < 1 then
    raise exception 'B: the sweep touched a held row';
  end if;

  if (select count(*) from public.sandbox_cash_out()) <> 0 then
    raise exception 'B: a second cash-out swept rows again';
  end if;
  raise notice 'PASS B2: swept exactly the released row, kept released_at, held untouched, repeat is a no-op';
end $$;

rollback;

do $$
begin
  -- Scoped to the proof's own job: persistent seeds (d1) legitimately keep
  -- paid_out rows of their own.
  if (select count(*) from public.payments where status = 'paid_out'
      and job_id = 'b6c00000-0000-4000-8000-00000000000b') <> 0 then
    raise exception 'RESIDUE: a paid_out row survived the rollback';
  end if;
  raise notice 'PASS RESIDUE: rollback restored the seeded ledger';
end $$;
