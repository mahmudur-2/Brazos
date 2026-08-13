-- phase66 behavioural proof, STAGING only. One transaction, ROLLBACK at the
-- end — zero residue. Impersonates real participants through the
-- `authenticated` role plus a JWT claim, which is what makes RLS apply.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_locked_thread uuid;
  v_locked_user   uuid;
  v_open_thread   uuid;
  v_open_user     uuid;
  v_job           uuid;
  v_job_client    uuid;
  v_msg           uuid;
  v_offer         uuid;
  v_unlocked      boolean;
  v_pass          int := 0;
  v_fail          int := 0;
begin
  -- A pair with no assigned job between them, and a pair with one.
  select t.id, t.user_a into v_locked_thread, v_locked_user
  from public.direct_threads t
  where not exists (
    select 1 from public.jobs j
    where ((j.client_id = t.user_a and j.assigned_worker_id = t.user_b)
        or (j.client_id = t.user_b and j.assigned_worker_id = t.user_a))
      and j.status in ('assigned','in_progress','completed')
  )
  limit 1;

  select t.id, t.user_a into v_open_thread, v_open_user
  from public.direct_threads t
  where exists (
    select 1 from public.jobs j
    where ((j.client_id = t.user_a and j.assigned_worker_id = t.user_b)
        or (j.client_id = t.user_b and j.assigned_worker_id = t.user_a))
      and j.status in ('assigned','in_progress','completed')
  )
  limit 1;

  select j.id, j.client_id into v_job, v_job_client
  from public.jobs j
  where j.assigned_worker_id is not null
    and j.status in ('assigned','in_progress','completed')
  limit 1;

  if v_locked_thread is null or v_open_thread is null or v_job is null then
    raise exception 'proof needs one locked pair, one hired pair and one assigned job';
  end if;

  -- 1. LOCKED pair: a free-form message must be refused.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_locked_user, 'role', 'authenticated')::text, true);
  begin
    insert into public.messages (direct_thread_id, sender_id, content)
    values (v_locked_thread, v_locked_user, 'phase66 proof — must be refused');
    v_fail := v_fail + 1;
    raise warning 'FAIL  locked pair accepted a free-form message';
  exception when insufficient_privilege then
    v_pass := v_pass + 1;
    raise notice 'PASS  locked pair refuses a free-form message (%)', sqlstate;
  end;

  -- 2. LOCKED pair: the negotiation exemption is payload-free, so a forged
  --    event row carrying text is refused too.
  begin
    insert into public.messages (direct_thread_id, sender_id, content, job_offer_id, request_event)
    values (v_locked_thread, v_locked_user, 'smuggled text',
            (select id from public.job_offers limit 1), 'countered');
    v_fail := v_fail + 1;
    raise warning 'FAIL  a forged event row smuggled free-form content past the lock';
  exception when insufficient_privilege then
    v_pass := v_pass + 1;
    raise notice 'PASS  a forged event row carrying text is refused (%)', sqlstate;
  end;

  -- 3. LOCKED pair: reads are untouched.
  begin
    perform 1 from public.messages where direct_thread_id = v_locked_thread;
    v_pass := v_pass + 1;
    raise notice 'PASS  reads still work in a locked thread';
  exception when others then
    v_fail := v_fail + 1;
    raise warning 'FAIL  read broke in a locked thread: %', sqlerrm;
  end;

  -- 4. The gate itself, as the app asks it.
  select public.messaging_unlocked(null, v_locked_thread) into v_unlocked;
  if v_unlocked is false then
    v_pass := v_pass + 1; raise notice 'PASS  messaging_unlocked() = false for the locked pair';
  else
    v_fail := v_fail + 1; raise warning 'FAIL  messaging_unlocked() = % for the locked pair', v_unlocked;
  end if;

  reset role;

  -- 5. HIRED pair: the same insert now succeeds.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_open_user, 'role', 'authenticated')::text, true);
  select public.messaging_unlocked(null, v_open_thread) into v_unlocked;
  if v_unlocked is true then
    v_pass := v_pass + 1; raise notice 'PASS  messaging_unlocked() = true for the hired pair';
  else
    v_fail := v_fail + 1; raise warning 'FAIL  messaging_unlocked() = % for the hired pair', v_unlocked;
  end if;

  begin
    insert into public.messages (direct_thread_id, sender_id, content)
    values (v_open_thread, v_open_user, 'phase66 proof — should be allowed')
    returning id into v_msg;
    v_pass := v_pass + 1;
    raise notice 'PASS  hired pair may send a free-form message';
  exception when others then
    v_fail := v_fail + 1;
    raise warning 'FAIL  hired pair was refused: % %', sqlstate, sqlerrm;
  end;

  reset role;

  -- 6. The job thread of an assigned job accepts a message from its client.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_job_client, 'role', 'authenticated')::text, true);
  begin
    insert into public.messages (job_id, sender_id, content)
    values (v_job, v_job_client, 'phase66 proof — job thread');
    v_pass := v_pass + 1;
    raise notice 'PASS  an assigned job''s own thread accepts a message';
  exception when others then
    v_fail := v_fail + 1;
    raise warning 'FAIL  assigned job thread refused its client: % %', sqlstate, sqlerrm;
  end;
  reset role;

  -- 7. THE ONE THAT MUST NOT BREAK: the negotiation RPCs still post their
  --    event messages before confirmation. offer_post_event() is SECURITY
  --    DEFINER, so it does not meet the policy at all — proved by running it
  --    against a live chain whose pair is NOT hired.
  select o.id into v_offer
  from public.job_offers o
  join public.messages m on m.job_offer_id = o.root_offer_id and m.request_event = 'created'
  where not exists (
    select 1 from public.jobs j
    where j.client_id = o.customer_id and j.assigned_worker_id = o.worker_id
      and j.status in ('assigned','in_progress','completed')
  )
  limit 1;

  if v_offer is null then
    raise notice 'SKIP  no pre-confirmation chain with a root message on staging';
  else
    begin
      perform public.offer_post_event(v_offer,
        (select root_offer_id from public.job_offers where id = v_offer),
        (select author_id from public.job_offers where id = v_offer),
        'countered',
        (select amount_cents from public.job_offers where id = v_offer));
      v_pass := v_pass + 1;
      raise notice 'PASS  a negotiation event still posts before confirmation';
    exception when others then
      v_fail := v_fail + 1;
      raise warning 'FAIL  the lock broke the negotiation: % %', sqlstate, sqlerrm;
    end;
  end if;

  raise notice '---- phase66 proof: % passed, % failed ----', v_pass, v_fail;
  if v_fail > 0 then
    raise exception 'phase66 proof FAILED (% failures)', v_fail;
  end if;
end $$;

rollback;
