-- 471_account_lock.sql — production-36h S1, A8-02 and A11-02 proven on the local stack: the account
-- lock (ban_switch 2c) is taken by accept_offer() and counter_offer() (shared, both parties; A11-09
-- for the counter), set_payment_customer() (shared; A11-06), ban_user() and delete_my_account()
-- (exclusive), each before any row lock (and
-- set_payment_customer's before it reads the account); begin_tip_payment() gives no new tip to
-- a suspended worker; begin_job_payment() refuses a hired worker who is no longer active; and the
-- repair pass (repair_suspended_jobs, run once by ban_switch) cancels every unfinished job that still
-- has a suspended party, the customer's row first.
--
-- THE CAST: an admin; for the locks a customer and a worker who make a hire (Ana, Wes), an account
-- the admin bans (Bo), an account that deletes itself (Dot), one whose Stripe customer the service
-- role saves (Sid), and a customer who counters a worker's bid (Cora, Wil); for the payments a
-- customer (Cy) and
-- the workers Tia (suspended), Tom (suspended, then deleted), Taj (active), Jo (suspended) and Jay
-- (active); for the repair pass two suspended accounts (Rex, a customer; Sue, a worker) and two
-- active ones (Wade, a worker; Cole, a customer). Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the hired, started and done jobs and their payments are raw rows by the
-- runner, in the shapes accept_offer + checkout + approval reach (030_payments.sql proves those
-- writers). A suspended account in sections 4, 5 and 6 is banned = true set by hand: the state a ban
-- before ban_switch, or a ban that raced a hire, left (A11-02). Tom's tombstone is deleted_at set by
-- hand on his banned row, the state delete_my_account leaves (it never clears banned). Jo is set
-- active again after section 5, so section 6 counts only its own jobs.
--
-- One session proves the locks are TAKEN (pg_locks, section 2). That a call which waited for one of
-- them then reads afresh is proven by hand with two sessions, not in this suite.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(30);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

-- The account lock rows this backend holds for one account: the modes, in order.
create function pg_temp.account_locks(p_id uuid) returns text language sql as $$
  select string_agg(l.mode, ', ' order by l.mode)
  from pg_catalog.pg_locks l
  where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted
    and l.classid = 400500 and l.objsubid = 2 and l.objid = hashtext(p_id::text)::oid
$$;

select tests.create_user('lk.admin@brazos.test', 'Ada Admin')     as admin \gset
select tests.create_user('lk.ana@brazos.test',   'Ana Customer')  as ana   \gset
select tests.create_user('lk.wes@brazos.test',   'Wes Worker')    as wes   \gset
select tests.create_user('lk.bo@brazos.test',    'Bo Banned')     as bo    \gset
select tests.create_user('lk.dot@brazos.test',   'Dot Deleter')   as dot   \gset
select tests.create_user('lk.cy@brazos.test',    'Cy Customer')   as cy    \gset
select tests.create_user('lk.tia@brazos.test',   'Tia Suspended') as tia   \gset
select tests.create_user('lk.tom@brazos.test',   'Tom Deleted')   as tom   \gset
select tests.create_user('lk.taj@brazos.test',   'Taj Active')    as taj   \gset
select tests.create_user('lk.jo@brazos.test',    'Jo Suspended')  as jo    \gset
select tests.create_user('lk.jay@brazos.test',   'Jay Active')    as jay   \gset
select tests.create_user('lk.rex@brazos.test',   'Rex Suspended') as rex   \gset
select tests.create_user('lk.sue@brazos.test',   'Sue Suspended') as sue   \gset
select tests.create_user('lk.wade@brazos.test',  'Wade Worker')   as wade  \gset
select tests.create_user('lk.cole@brazos.test',  'Cole Customer') as cole  \gset
select tests.create_user('lk.sid@brazos.test',   'Sid Saver')     as sid   \gset
select tests.create_user('lk.cora@brazos.test',  'Cora Counter')  as cora  \gset
select tests.create_user('lk.wil@brazos.test',   'Wil Worker')    as wil   \gset
update public.profiles set is_admin = true where id = :'admin';
insert into fx values ('bo', :'bo');

-- The A8-01 notice bodies, word for word (472).
\set nb_neutral 'Brazos cancelled this job. Open it to see what happens with the payment.'
\set nb_full 'Brazos cancelled this job. Your payment is being refunded in full.'

-- ---------------------------------------------------------------------------
-- 1. No client's door.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(f || ':' || r, ', ' order by f, r)
     from unnest(array['public.lock_account(uuid,boolean)', 'public.repair_suspended_jobs()']) f
     cross join unnest(array['anon', 'authenticated', 'service_role']) r
    where to_regprocedure(f) is null or has_function_privilege(r, to_regprocedure(f), 'execute')),
  null,
  '1: no client and no service role may call the account lock or the repair pass'
);

-- ---------------------------------------------------------------------------
-- 2. The locks are taken (in the suite, one session: pg_locks of this backend).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'ana');
select (public.create_job(p_title := 'LK ana open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '1 Probe Street')).id as ja \gset
select tests.authenticate_as(:'wes');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'ja', p_message := 'LK wes bid') as bid \gset
select tests.authenticate_as(:'ana');
select is(public.accept_offer(:'bid'), :'ja'::uuid, '2a: Ana accepts Wes''s bid');
select tests.clear_auth();
select is(row(pg_temp.account_locks(:'ana'), pg_temp.account_locks(:'wes')), row('ShareLock'::text, 'ShareLock'::text),
  '2b: accept_offer holds both parties'' account locks, shared, until the transaction ends');

select tests.authenticate_as(:'admin');
select lives_ok($$ select public.ban_user((select v from fx where k = 'bo')) $$, '2c: the admin bans Bo');
select tests.clear_auth();
select is(pg_temp.account_locks(:'bo'), 'ExclusiveLock', '2d: ban_user holds the banned account''s lock, exclusive');

select tests.authenticate_as(:'dot');
select lives_ok($$ select public.delete_my_account() $$, '2e: Dot deletes her account');
select tests.clear_auth();
select is(pg_temp.account_locks(:'dot'), 'ExclusiveLock', '2f: delete_my_account holds the caller''s account lock, exclusive');

select is(pg_temp.account_locks(:'sid'), null, '2g: before the save, no account lock is held for Sid');
select is(public.set_payment_customer(:'sid', 'cus_lk_sid'), 'cus_lk_sid', '2h: the service role saves Sid''s new Stripe customer');
select is(pg_temp.account_locks(:'sid'), 'ShareLock', '2i: A11-06: set_payment_customer holds the account''s lock, shared');

select tests.authenticate_as(:'cora');
select (public.create_job(p_title := 'LK cora open', p_description := 'probe row, rolled back', p_category := 'other',
  p_location := 'Probe Area', p_budget_min_cents := 4000, p_budget_max_cents := 6000, p_address_line := '2 Probe Street')).id as jc \gset
select tests.authenticate_as(:'wil');
select public.create_offer(p_amount_cents := 4500, p_job_id := :'jc', p_message := 'LK wil bid') as wbid \gset
select tests.clear_auth();
select is(row(pg_temp.account_locks(:'cora'), pg_temp.account_locks(:'wil')), row(null::text, null::text),
  '2j: before the counter, no account lock is held for Cora or Wil (guard)');
select tests.authenticate_as(:'cora');
select isnt(public.counter_offer(:'wbid', 5000), null::uuid, '2k: Cora counters Wil''s bid (guard)');
select tests.clear_auth();
select is(row(pg_temp.account_locks(:'cora'), pg_temp.account_locks(:'wil')), row('ShareLock'::text, 'ShareLock'::text),
  '2l: A11-09: counter_offer holds both parties'' account locks, shared, until the transaction ends');

-- ---------------------------------------------------------------------------
-- 3. Before any row lock: the order in each body.
-- ---------------------------------------------------------------------------
select ok(
  (select s ~ $re$\nbegin\n  perform public\.require_active_caller\(\);\n$re$
      and position('select job_id, customer_id, worker_id into v_job.id, v_customer, v_worker' in s) > 0
      and position('perform public.lock_account(least(v_customer, v_worker), true);' in s)
          > position('select job_id, customer_id, worker_id into v_job.id, v_customer, v_worker' in s)
      and s ~ $re$perform public\.lock_account\(least\(v_customer, v_worker\), true\);\n  perform public\.lock_account\(greatest\(v_customer, v_worker\), true\);\n  perform public\.require_active_caller\(\);\n\n  select \* into v_job from public\.jobs where id = v_job\.id for update;$re$
      and position('for update' in s) > position('perform public.lock_account(greatest(v_customer, v_worker), true);' in s)
      and position('for share' in s) = 0
     from (select prosrc as s from pg_proc where oid = 'public.accept_offer(uuid)'::regprocedure) x),
  '3a: accept_offer: the guard, the plain read of the offer''s two parties, their account locks (shared, least then greatest), the guard again, then its first row lock'
);
select ok(
  (select s ~ $re$\nbegin\n  perform public\.require_active_caller\(\);\n$re$
      and position('select job_id, customer_id, worker_id into v_job_id, v_customer, v_worker' in s) > 0
      and position('perform public.lock_account(least(v_customer, v_worker), true);' in s)
          > position('select job_id, customer_id, worker_id into v_job_id, v_customer, v_worker' in s)
      and s ~ $re$perform public\.lock_account\(least\(v_customer, v_worker\), true\);\n  perform public\.lock_account\(greatest\(v_customer, v_worker\), true\);\n  perform public\.require_active_caller\(\);\n$re$
      and position('for update' in s) > position('perform public.lock_account(greatest(v_customer, v_worker), true);' in s)
      and position('for share' in s) = 0
     from (select prosrc as s from pg_proc where oid = 'public.counter_offer(uuid,integer)'::regprocedure) x),
  '3e: A11-09: counter_offer: the guard, the plain read of the offer''s two parties, their account locks (shared, least then greatest), the guard again, then its first row lock'
);
select ok(
  (select position('if not public.current_user_is_admin() then' in s) > 0
      and position('An admin account cannot be banned in the app.' in s) > position('if not public.current_user_is_admin() then' in s)
      and position('perform public.lock_account(p_target, false);' in s) > position('An admin account cannot be banned in the app.' in s)
      and position('for update' in s) > position('perform public.lock_account(p_target, false);' in s)
     from (select prosrc as s from pg_proc where oid = 'public.ban_user(uuid,uuid)'::regprocedure) x),
  '3b: ban_user: the admin checks, then the target''s account lock (exclusive), then its first row lock'
);
select ok(
  (select position('raise exception ''Not signed in'';' in s) > 0
      and position('perform public.lock_account(v_user, false);' in s) > position('raise exception ''Not signed in'';' in s)
      and position('for update' in s) > position('perform public.lock_account(v_user, false);' in s)
     from (select prosrc as s from pg_proc where oid = 'public.delete_my_account()'::regprocedure) x),
  '3c: delete_my_account: the signed-in check, then the caller''s account lock (exclusive), then its first row lock'
);
select ok(
  (select position('raise exception ''set_payment_customer: user id and customer id are required'';' in s) > 0
      and position('perform public.lock_account(p_user_id, true);' in s)
          > position('raise exception ''set_payment_customer: user id and customer id are required'';' in s)
      and position('from public.profiles p where p.id = p_user_id and p.deleted_at is not null' in s)
          > position('perform public.lock_account(p_user_id, true);' in s)
      and position('update public.account_cleanups c' in s) > position('perform public.lock_account(p_user_id, true);' in s)
      and position('insert into public.payment_accounts' in s) > position('perform public.lock_account(p_user_id, true);' in s)
     from (select prosrc as s from pg_proc where oid = 'public.set_payment_customer(uuid,text)'::regprocedure) x),
  '3d: A11-06: set_payment_customer: the argument check, then the account lock (shared), then the tombstone read and its writes'
);

-- ---------------------------------------------------------------------------
-- 4. Decision 1: no new tip to a SUSPENDED worker; a deleted worker's tip is the money lane's.
-- ---------------------------------------------------------------------------
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'cy', 'LK tip tia', :'tia', 'completed', now() - interval '1 day') returning id as jt1 \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'cy', 'LK tip tom', :'tom', 'completed', now() - interval '1 day') returning id as jt2 \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'cy', 'LK tip taj', :'taj', 'completed', now() - interval '1 day') returning id as jt3 \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status,
                             release_requested_at, transfer_cents, release_reason, released_at)
values (:'jt1', :'cy', :'tia', 4800, 480, 300, 'stripe', 'pi_lk_tia', 'released', now() - interval '2 hours', 4320, 'approved', now() - interval '1 hour'),
       (:'jt2', :'cy', :'tom', 4800, 480, 300, 'stripe', 'pi_lk_tom', 'released', now() - interval '2 hours', 4320, 'approved', now() - interval '1 hour'),
       (:'jt3', :'cy', :'taj', 4800, 480, 300, 'stripe', 'pi_lk_taj', 'released', now() - interval '2 hours', 4320, 'approved', now() - interval '1 hour');
update public.profiles set banned = true where id in (:'tia', :'tom');
update public.profiles set deleted_at = now() where id = :'tom';

select tests.authenticate_as(:'cy');
select throws_ok(format($$ select public.begin_tip_payment(%L, 500) $$, :'jt1'),
  'P0001', 'This worker can no longer receive tips.', '4a: a tip to a suspended worker is refused');
select lives_ok(format($$ select public.begin_tip_payment(%L, 500) $$, :'jt2'),
  '4b: a tip to a deleted worker (banned before the deletion) is not refused: the money lane''s rule (480 H6e, 482 T1, T2)');
select lives_ok(format($$ select public.begin_tip_payment(%L, 500) $$, :'jt3'),
  '4c: control: the same tip to an active worker');
select tests.clear_auth();
select is(
  (select string_agg(j.title || ' ' || j.status || ' ' || m.status || ' ' || coalesce(t.status::text, 'no tip'), ', ' order by j.title)
     from public.jobs j
     join public.payments m on m.job_id = j.id and m.kind = 'job_payment'
     left join public.payments t on t.job_id = j.id and t.kind = 'tip'
    where j.id in (:'jt1', :'jt2', :'jt3')),
  'LK tip taj completed released unfunded, LK tip tia completed released no tip, LK tip tom completed released unfunded',
  '4d: the refused tip made no row and changed nothing; the other two made their unfunded tip'
);

-- ---------------------------------------------------------------------------
-- 5. A11-02: begin_job_payment refuses a hired worker who is no longer active.
-- ---------------------------------------------------------------------------
insert into public.jobs (client_id, title, assigned_worker_id, status, final_amount_cents)
values (:'cy', 'LK pay jo', :'jo', 'assigned', 5000) returning id as jp1 \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, final_amount_cents)
values (:'cy', 'LK pay jay', :'jay', 'assigned', 5000) returning id as jp2 \gset
update public.profiles set banned = true where id = :'jo';

select tests.authenticate_as(:'cy');
select throws_ok(format($$ select public.begin_job_payment(%L) $$, :'jp1'),
  'P0001', 'Worker is not available', '5a: protecting the payment of a job whose hired worker is suspended is refused');
select lives_ok(format($$ select public.begin_job_payment(%L) $$, :'jp2'),
  '5b: control: the same job with an active worker gets its payment row');
select tests.clear_auth();
select is(
  (select string_agg(j.title || ' ' || j.status || ' ' || coalesce(p.status::text, 'no payment'), ', ' order by j.title)
     from public.jobs j
     left join public.payments p on p.job_id = j.id and p.kind = 'job_payment'
    where j.id in (:'jp1', :'jp2')),
  'LK pay jay assigned unfunded, LK pay jo assigned no payment',
  '5c: the refusal made no payment row and changed nothing'
);
update public.profiles set banned = false where id = :'jo';

-- ---------------------------------------------------------------------------
-- 6. A11-02: the repair pass.
-- ---------------------------------------------------------------------------
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'rex', 'LK rex hired', :'wade', 'assigned') returning id as j1 \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'rex', 'LK rex started both', :'sue', 'in_progress') returning id as j2 \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cole', 'LK sue hired', :'sue', 'assigned') returning id as j3 \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'rex', 'LK rex done', :'wade', 'completed', now() - interval '1 day') returning id as j4 \gset
insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cole', 'LK cole hired', :'wade', 'assigned') returning id as j5 \gset
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents, provider, provider_ref, status, held_at)
values (:'j1', :'rex',  :'wade', 5000, 500, 375, 'stripe', 'pi_lk_j1', 'held', now() - interval '1 day'),
       (:'j2', :'rex',  :'sue',  6000, 600, 450, 'stripe', 'pi_lk_j2', 'held', now() - interval '1 day'),
       (:'j3', :'cole', :'sue',  7000, 700, 525, 'stripe', 'pi_lk_j3', 'held', now() - interval '1 day'),
       (:'j5', :'cole', :'wade', 8000, 800, 600, 'stripe', 'pi_lk_j5', 'held', now() - interval '1 day');
update public.profiles set banned = true where id in (:'rex', :'sue');

select is(public.repair_suspended_jobs(), 3, '6a: the pass cancels the three unfinished jobs that have a suspended party');
select bag_eq(
  $$ select j.title, j.status::text as job_status, j.cancelled_at is not null as stamped, p.status::text as payment_status,
            coalesce(p.refund_cents, 0) = p.charge_amount_cents as full_refund, p.refund_reason
       from public.jobs j
       left join public.payments p on p.job_id = j.id and p.kind = 'job_payment'
      where j.title in ('LK rex hired', 'LK rex started both', 'LK sue hired', 'LK rex done', 'LK cole hired') $$,
  $$ values ('LK rex hired',        'cancelled', true,  'held',      true,          'account_suspended'),
            ('LK rex started both', 'cancelled', true,  'held',      false,         null::text),
            ('LK sue hired',        'cancelled', true,  'held',      true,          'account_suspended'),
            ('LK rex done',         'completed', false, null::text,  null::boolean, null::text),
            ('LK cole hired',       'assigned',  false, 'held',      false,         null::text) $$,
  '6b: cancelled and stamped; an undirected held payment refunded in full (account_suspended); on the started job of two suspended parties the customer''s row decides (held, directed nowhere); a done job and the active pair''s job untouched'
);
select bag_eq(
  $$ select n.recipient_id, n.data ->> 'jobId', n.title, n.body
       from public.notification_outbox n
      where n.type = 'job_cancelled'
        and n.data ->> 'jobId' in (select j.id::text from public.jobs j where j.title like 'LK %') $$,
  format($$ values (%L::uuid, %L, 'Job cancelled', %L), (%L::uuid, %L, 'Job cancelled', %L) $$,
         :'wade', :'j1', :'nb_neutral', :'cole', :'j3', :'nb_full'),
  '6c: each active other party gets the ban''s one notice in the words of the payment state (a suspended one gets none)'
);
select is(public.repair_suspended_jobs(), 0, '6d: a second run finds nothing');
select is(
  (select count(*) from public.jobs j
     join public.profiles p on p.id in (j.client_id, j.assigned_worker_id)
    where coalesce(p.banned, false) and p.deleted_at is null
      and (j.status in ('assigned', 'in_progress') or (j.status = 'open' and p.id = j.client_id))),
  0::bigint,
  '6e: after the pass no unfinished job has a suspended party'
);

select * from finish();
rollback;
