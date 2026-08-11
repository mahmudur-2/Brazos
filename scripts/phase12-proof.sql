-- ============================================================================
-- BRAZOS V2 · Phase 12 · automated notification-feed proof (A–B)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/phase12-proof.sql "$SUPABASE_DB_URL_STAGING"
--
-- Run AFTER scripts/seed-phase-6.sql. ONE transaction through RLS as the
-- seeded identities, ROLLBACK, zero residue.
--
--   A events write feed rows: dispute opened, payment released, message
--   B the feed is recipient-only, and the recipient can write read_at and
--     nothing else
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
-- A. EVENTS -> FEED ROWS.
-- ---------------------------------------------------------------------------
select pg_temp.become('c');
select public.open_job_dispute((select v from probe where k='job_done'), 'incomplete', 'PHASE12 PROOF');
do $$
declare v_dispute uuid;
begin
  select id into v_dispute from public.job_disputes
  where job_id = (select v from probe where k='job_done') and status = 'open';
  perform public.withdraw_job_dispute(v_dispute);
end $$;
select public.sandbox_release_job_payment((select v from probe where k='job_done'));
insert into public.messages (job_id, sender_id, content)
values ((select v from probe where k='job_done'), (select v from probe where k='c'),
        'PHASE12 PROOF checking in');

select pg_temp.become('wa');
do $$
declare v_dispute int; v_release int; v_message int;
begin
  select count(*) into v_dispute from public.notification_outbox
  where recipient_id = (select v from probe where k='wa') and type = 'dispute_opened';
  select count(*) into v_release from public.notification_outbox
  where recipient_id = (select v from probe where k='wa') and type = 'payment_released';
  select count(*) into v_message from public.notification_outbox
  where recipient_id = (select v from probe where k='wa') and type = 'message'
    and body like '%PHASE12 PROOF%';
  if v_dispute < 1 then raise exception 'A: no dispute_opened feed row'; end if;
  if v_release < 1 then raise exception 'A: no payment_released feed row'; end if;
  if v_message < 1 then raise exception 'A: no message feed row'; end if;
  raise notice 'PASS A: dispute (%), release (%), message (%) all wrote feed rows', v_dispute, v_release, v_message;
end $$;

-- ---------------------------------------------------------------------------
-- B. RECIPIENT-ONLY + read_at-only.
-- ---------------------------------------------------------------------------
select pg_temp.become('wb');
do $$
begin
  if (select count(*) from public.notification_outbox
      where recipient_id = (select v from probe where k='wa')) <> 0 then
    raise exception 'B: an outsider can read another user''s feed';
  end if;
  raise notice 'PASS B1: the feed is recipient-only';
end $$;

select pg_temp.become('wa');
do $$
declare v_id uuid;
begin
  select id into v_id from public.notification_outbox
  where recipient_id = (select v from probe where k='wa') and type = 'payment_released'
  limit 1;

  update public.notification_outbox set read_at = now() where id = v_id;
  if (select read_at from public.notification_outbox where id = v_id) is null then
    raise exception 'B: the recipient could not mark their row read';
  end if;

  begin
    update public.notification_outbox set status = 'sent' where id = v_id;
    raise exception 'B: the recipient was allowed to write delivery bookkeeping';
  exception when others then
    if sqlerrm like '%was allowed%' then raise; end if;
    raise notice 'PASS B2: read_at writable, delivery columns refused (%)', sqlerrm;
  end;
end $$;

rollback;

do $$
begin
  if (select count(*) from public.notification_outbox where body like '%PHASE12 PROOF%') <> 0 then
    raise exception 'RESIDUE: probe feed rows survived';
  end if;
  raise notice 'PASS RESIDUE: rollback left zero probe rows';
end $$;
