-- ============================================================================
-- BRAZOS V2 · Phase 9 · automated two-account proof (A–D)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase9-proof.sql "$SUPABASE_DB_URL_STAGING"
--
-- The established mechanism: ONE transaction, RLS engaged as PostgREST
-- engages it, the seeded phase-6 identities, RAISE on failure, ROLLBACK,
-- zero residue.
--
-- Sections:
--   A worker_services — owner manages; drafts owner-only; strangers can't write
--   B portfolio drafts — published=false invisible to everyone but the owner
--   C saved_workers — private to the saver in BOTH directions
--   D availability — written only through update_my_profile, validated,
--     publicly readable; protected keys still refused
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

create temp table probe (k text primary key, v uuid);
grant select, insert, update on probe to authenticated;
insert into probe (k, v) values
  ('c',  'b6c00000-0000-4000-8000-000000000001'),
  ('wa', 'b6c00000-0000-4000-8000-000000000002'),
  ('wb', 'b6c00000-0000-4000-8000-000000000003');

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
-- A. SERVICES.
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
insert into public.worker_services (worker_id, title, category, price_cents, published)
values ((select v from probe where k='wa'), 'PHASE9 PROOF mow & edge', 'yard_work', 4500, true),
       ((select v from probe where k='wa'), 'PHASE9 PROOF draft gutters', 'handyman', null, false);

do $$
begin
  if (select count(*) from public.worker_services
      where worker_id = (select v from probe where k='wa')
        and title like 'PHASE9 PROOF%') <> 2 then
    raise exception 'A: the owner cannot see their own draft + published services';
  end if;
  raise notice 'PASS A1: owner manages services incl. a draft';
end $$;

select pg_temp.become('c');
do $$
begin
  if (select count(*) from public.worker_services
      where worker_id = (select v from probe where k='wa')
        and title like 'PHASE9 PROOF%') <> 1 then
    raise exception 'A: a customer sees a number of services other than the 1 published';
  end if;
  begin
    insert into public.worker_services (worker_id, title, category)
    values ((select v from probe where k='wa'), 'PHASE9 PROOF forged', 'other');
    raise exception 'A: a STRANGER was allowed to write another worker''s services';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS A2: drafts invisible to customers; strangers cannot write (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- B. PORTFOLIO DRAFTS.
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
insert into public.portfolio_items (worker_id, photo_url, category, caption, published)
values ((select v from probe where k='wa'), 'https://example.com/phase9-pub.jpg', 'yard_work', 'PHASE9 PROOF public', true),
       ((select v from probe where k='wa'), 'https://example.com/phase9-draft.jpg', 'yard_work', 'PHASE9 PROOF draft', false);

select pg_temp.become('c');
do $$
begin
  if exists (select 1 from public.portfolio_items
             where caption = 'PHASE9 PROOF draft') then
    raise exception 'B: a portfolio DRAFT is publicly visible';
  end if;
  if not exists (select 1 from public.portfolio_items
                 where caption = 'PHASE9 PROOF public') then
    raise exception 'B: the published portfolio item is missing publicly';
  end if;
  raise notice 'PASS B: portfolio drafts are owner-only; published items public';
end $$;

-- ---------------------------------------------------------------------------
-- C. SAVED WORKERS — private in both directions.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
-- seed-phase-9 may have already persisted this exact save — the proof must
-- hold on a seeded database, so the insert is upsert-shaped.
insert into public.saved_workers (user_id, worker_id)
values ((select v from probe where k='c'), (select v from probe where k='wa'))
on conflict (user_id, worker_id) do nothing;

do $$
begin
  if (select count(*) from public.saved_workers
      where user_id = (select v from probe where k='c')) < 1 then
    raise exception 'C: the saver cannot read their own list';
  end if;
end $$;

select pg_temp.become('wa');
do $$
begin
  if (select count(*) from public.saved_workers) <> 0 then
    raise exception 'C: the SAVED WORKER can see who saved them';
  end if;
  begin
    insert into public.saved_workers (user_id, worker_id)
    values ((select v from probe where k='c'), (select v from probe where k='wb'));
    raise exception 'C: a user was allowed to write another user''s saved list';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS C: saved list private both directions; foreign writes refused (%)', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- D. AVAILABILITY through update_my_profile only.
-- ---------------------------------------------------------------------------
select pg_temp.become('wa');
select public.update_my_profile(
  '{"accepting_work": false, "availability_note": "PHASE9 PROOF weekends only"}'::jsonb
);

do $$
begin
  begin
    perform public.update_my_profile('{"rating_avg": 5}'::jsonb);
    raise exception 'D: a protected key was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS D1: protected keys still refused (%)', sqlerrm;
  end;
  begin
    perform public.update_my_profile(
      json_build_object('availability_note', repeat('x', 200))::jsonb
    );
    raise exception 'D: an over-long availability note was accepted';
  exception when others then
    if sqlerrm like '%was accepted%' then raise; end if;
    raise notice 'PASS D2: 140-char note limit enforced (%)', sqlerrm;
  end;
end $$;

select pg_temp.become('c');
do $$
declare v_accepting boolean; v_note text;
begin
  select accepting_work, availability_note into v_accepting, v_note
  from public.profiles
  where id = (select v from probe where k='wa');
  if v_accepting is distinct from false
     or v_note is distinct from 'PHASE9 PROOF weekends only' then
    raise exception 'D: the customer cannot read the availability truth (% / %)', v_accepting, v_note;
  end if;
  raise notice 'PASS D3: availability written by its owner is readable marketplace truth';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK + zero residue.
-- ---------------------------------------------------------------------------
rollback;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.worker_services where title like 'PHASE9 PROOF%';
  if v_count <> 0 then raise exception 'RESIDUE: services survived'; end if;
  select count(*) into v_count from public.portfolio_items where caption like 'PHASE9 PROOF%';
  if v_count <> 0 then raise exception 'RESIDUE: portfolio rows survived'; end if;
  -- The (customer, worker) save may legitimately persist from seed-phase-9;
  -- what must NOT survive is the foreign-write pair the proof attempted.
  select count(*) into v_count from public.saved_workers
  where worker_id = 'b6c00000-0000-4000-8000-000000000003';
  if v_count <> 0 then raise exception 'RESIDUE: the refused foreign save survived'; end if;
  select count(*) into v_count from public.profiles where availability_note like 'PHASE9 PROOF%';
  if v_count <> 0 then raise exception 'RESIDUE: availability survived'; end if;
  raise notice 'PASS RESIDUE: rollback left zero probe rows';
end $$;
