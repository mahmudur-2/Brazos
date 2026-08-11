-- ============================================================================
-- BRAZOS V2 · Phase 7 · staging seed (AUTONOMOUS_RUN §11)
--
--   psql -X -v ON_ERROR_STOP=1 -f scripts/seed-phase-7.sql "$SUPABASE_DB_URL_STAGING"
--
-- STAGING ONLY. Run AFTER scripts/seed-phase-6.sql (it owns the identities
-- and jobs) and after supabase/phase52_offer_scoped_chat.sql is applied (it
-- owns the pair threads). Safe to re-run: it resets only its own messages.
--
-- What it adds for the device pass: one unread pre-hire message from Wren
-- (worker) to Casey (customer) on their pair thread — so Casey's Messages
-- tab opens with a real unread conversation attached to Wren's pending bid
-- on "Rake and bag the front yard".
-- ============================================================================

\pset pager off
\set ON_ERROR_STOP 1

begin;

do $$
declare
  v_customer uuid := 'b6c00000-0000-4000-8000-000000000001';
  v_worker uuid := 'b6c00000-0000-4000-8000-000000000002';
  v_thread uuid;
begin
  if not exists (select 1 from public.profiles where id = v_customer)
     or not exists (select 1 from public.profiles where id = v_worker) then
    raise exception 'Run scripts/seed-phase-6.sql first — the phase-6 identities are missing';
  end if;

  select id into v_thread
  from public.direct_threads
  where user_a = least(v_customer, v_worker)
    and user_b = greatest(v_customer, v_worker);
  if v_thread is null then
    raise exception 'No (Casey, Wren) thread — apply supabase/phase52_offer_scoped_chat.sql first';
  end if;

  -- Reset this seed's own rows, then write the starter message. Casey's read
  -- marker is rewound so the conversation shows as UNREAD on first open.
  delete from public.messages
  where direct_thread_id = v_thread and content like 'SEED phase-7:%';

  insert into public.messages (direct_thread_id, sender_id, content)
  values (
    v_thread, v_worker,
    'SEED phase-7: Hi! I bid on the yard work — happy to come by this afternoon if that suits.'
  );

  update public.direct_threads
     set user_a_read_at = case when user_a = v_customer then null else user_a_read_at end,
         user_b_read_at = case when user_b = v_customer then null else user_b_read_at end
   where id = v_thread;

  raise notice 'SEED phase-7: 1 unread pre-hire message on the (Casey, Wren) thread';
end $$;

commit;
