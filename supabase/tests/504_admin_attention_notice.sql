-- 504_admin_attention_notice.sql — production-36h S1, O1 file 1 (20261116420000_admin_attention.sql),
-- part 2: the notice timer notify_attention_admins() and its cron job brazos-admin-attention. A line
-- whose finish is app, stripe or developer (the cleanup line is stripe) is told to every active admin
-- once per episode; the 5 oldest owed lines get their own notice and the rest one summary; a line
-- that leaves and comes back within 24 hours is not told again, and is after 24 hours; worker, bank
-- and wait lines are never told; no notice and no seen row holds a contact, a name, an amount or a
-- Stripe id; each run reports itself.
--
-- THE CAST: Ada and Abe (active admins), Bob (banned admin), Cora (customer), Wade (worker), Wyn (a
-- worker with no payout account), Dell (a deleted account with a cleanup row), and the runner (RLS
-- bypassed), who runs the timer as cron does. Everything rolls back.
--
-- FIXTURE SURGERY, DECLARED (each line carries -- SURGERY): admin_attention_seen is emptied, so the
-- first run, made before any admin exists, proves that it marks no line as told (O1-06; the local stack
-- has no admin: tests.create_user makes none); the jobs and payments are raw rows by the runner (the cancelled
-- held payment is the shape 290 proves the ban leaves); a line leaves and comes back by its payment's
-- status set by hand; one line's last notice is moved 25 hours back; the cleanup row is inserted by the
-- runner with its step opened 2 hours ago (501 proves delete_my_account writes it); right before each
-- counted run, every line that is not this file's is marked as present and told (tests.o1n_run), so a
-- timer of the local stack that fails or turns late during the file changes no count.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(27);

create temp table fx (k text primary key, v uuid);

delete from public.admin_attention_seen;                                                       -- SURGERY

select tests.create_user('o1n.ada@brazos.test',  'Ada Admin')   as ada  \gset
select tests.create_user('o1n.abe@brazos.test',  'Abe Admin')   as abe  \gset
select tests.create_user('o1n.bob@brazos.test',  'Bob Banned')  as bob  \gset
select tests.create_user('o1n.cora@brazos.test', 'Cora Client') as cora \gset
select tests.create_user('o1n.wade@brazos.test', 'Wade Worker') as wade \gset
select tests.create_user('o1n.wyn@brazos.test',  'Wyn Waiting') as wyn  \gset
select tests.create_user('o1n.dell@brazos.test', 'Dell Gone')   as dell \gset
update auth.users set phone = '15550100011' where id = :'cora';                                -- SURGERY
update auth.users set phone = '15550100012' where id = :'wade';                                -- SURGERY
select tests.set_payouts(:'wyn', 'none');

-- A cancelled job whose held card payment ($80 + $6) is directed nowhere: a job_closed_money_held
-- line (finish app) since p_hours ago.
create or replace function tests.o1n_held(p_name text, p_hours integer) returns uuid language plpgsql as $$
declare
  v_job uuid;
  v_pay uuid;
begin
  insert into public.jobs (client_id, title, assigned_worker_id, status, cancelled_at)                   -- SURGERY
  values ((select v from fx where k = 'cora'), 'O1N ' || p_name, (select v from fx where k = 'wade'), 'cancelled',
          now() - make_interval(hours => p_hours))
  returning id into v_job;
  insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents,
                               provider, provider_ref, status)                                           -- SURGERY
  values (v_job, (select v from fx where k = 'cora'), (select v from fx where k = 'wade'), 8000, 800, 600,
          'stripe', 'pi_o1n_' || lower(p_name), 'held')
  returning id into v_pay;
  insert into fx values ('j_' || lower(p_name), v_job), ('p_' || lower(p_name), v_pay);
  return v_job;
end $$;

-- The line's key, as the list gives it.
create or replace function tests.o1n_key(p_name text) returns text language sql as $$
  select l.key from public.admin_attention_lines() l
   where l.job_id = (select v from fx where k = 'j_' || lower(p_name)) and l.code = 'job_closed_money_held'
$$;

-- One run of the timer, as cron makes it, with the rest of the local list held still: every line that is
-- not this file's (a timer of the local stack can fail or turn late at any minute, for example
-- brazos-drain-push, whose first run after a reset fails for the missing Vault secrets) is marked as
-- present and already told for its episode right before the run, so only this file's lines can be owed.
create or replace function tests.o1n_run() returns integer language plpgsql as $$
begin
  insert into public.admin_attention_seen as s (key, first_seen, last_seen, episode, episode_at, notified_episode, notified_at)
  select l.key, now(), now(), 1, now(), 1, now()                                                -- SURGERY
    from public.admin_attention_lines() l
   where not exists (select 1 from fx f
                      where f.v = l.job_id or f.v = l.payment_id or l.key = 'cleanup_customer_open:' || f.v::text)
  on conflict (key) do update
     set gone_at = null, last_seen = now(), notified_episode = s.episode, notified_at = coalesce(s.notified_at, now());
  return public.notify_attention_admins();
end $$;

-- One admin's admin_attention notices: the fixture names whose key is in the data (oldest first), then
-- the summaries' bodies.
create or replace function tests.o1n_told(p_admin uuid) returns text language sql as $$
  select coalesce((select string_agg(f.name || '#' || split_part(o.dedupe_key, ':', 5), ' ' order by f.name, o.dedupe_key)
                     from public.notification_outbox o
                     join (select substr(x.k, 3) as name, tests.o1n_key(substr(x.k, 3)) as key
                             from fx x where x.k like 'j\_k%') f on f.key = o.data ->> 'key'
                    where o.recipient_id = p_admin and o.type = 'admin_attention'), '-')
         || ' / ' ||
         coalesce((select string_agg(o.body, ' + ' order by o.created_at, o.body)
                     from public.notification_outbox o
                    where o.recipient_id = p_admin and o.type = 'admin_attention' and not (o.data ? 'key')), '-')
$$;

insert into fx values ('cora', :'cora'), ('wade', :'wade');

-- ---------------------------------------------------------------------------
-- §0. No active admin: a run tells no one and marks nothing as told; once an admin exists, the line is told.
-- ---------------------------------------------------------------------------
select tests.o1n_held('Z0', 80);
select tests.o1n_key('Z0') as z0key \gset
select is(public.notify_attention_admins(), 0, '0a: with no active admin, a run tells no line');
select is((select count(*) from public.admin_attention_seen s where s.notified_episode is not null or s.notified_at is not null)
          || ' ' || (select count(*) from public.admin_attention_seen s where s.key = :'z0key'),
  '0 1', '0b: … and marks no line as told, though it saw Z0''s line');
update public.profiles set is_admin = true where id in (:'ada', :'abe', :'bob');
update public.profiles set banned = true where id = :'bob';
select is(tests.o1n_run(), 1, '0c: an admin is added: the next run tells the line that was owed');
select is((select count(*) || ' ' || min(s.notified_episode)
             from public.notification_outbox o join public.admin_attention_seen s on s.key = o.data ->> 'key'
            where o.recipient_id = :'ada' and o.type = 'admin_attention' and o.data ->> 'key' = :'z0key'),
  '1 1', '0d: … Z0''s line reaches Ada once, and is marked told for its first episode');

select tests.o1n_held('K1', 70);
select tests.o1n_held('K2', 60);
select tests.o1n_held('K3', 50);
select tests.o1n_held('K4', 40);
select tests.o1n_held('K5', 30);
select tests.o1n_held('K6', 20);
select tests.o1n_held('K7', 10);
select tests.o1n_key('K1') as k1key \gset

-- ---------------------------------------------------------------------------
-- §1. The first run: the 5 oldest told one by one, the rest in one summary, to each active admin.
-- ---------------------------------------------------------------------------
select is(tests.o1n_run(), 7, '1a: seven new lines are told');
select is(tests.o1n_told(:'ada'), 'k1#1 k2#1 k3#1 k4#1 k5#1 / 2 more items on your list need you.',
  '1b: Ada: the five oldest lines, each its own notice (episode 1), and one summary for the other two');
select is(tests.o1n_told(:'abe'), tests.o1n_told(:'ada'), '1c: Abe gets the same');
select is((select count(*) from public.notification_outbox where recipient_id = :'bob' and type = 'admin_attention'),
  0::bigint, '1d: a banned admin gets nothing');
select is((select row(o.category, o.title, o.body, o.data, o.dedupe_key)::text
             from public.notification_outbox o
            where o.recipient_id = :'ada' and o.data ->> 'key' = tests.o1n_key('K1')),
  row('jobs', 'Brazos needs you',
      'This job was cancelled while its payment was still held. You can refund the customer here. To pay the worker, ask your developer.',
      jsonb_build_object('screen', 'ProfileMain', 'key', tests.o1n_key('K1')),
      'attention:' || tests.o1n_key('K1') || ':1:' || :'ada')::text,
  '1e: a notice: category jobs, the fixed title, the line''s plain sentence, the screen and the key, deduplicated per line, episode and admin');
select is((select row(o.category, o.title, o.data)::text from public.notification_outbox o
            where o.recipient_id = :'ada' and o.type = 'admin_attention' and not (o.data ? 'key')),
  row('jobs', 'Brazos needs you', '{"screen": "ProfileMain"}'::jsonb)::text,
  '1f: the summary: the same title, and the screen alone');

-- ---------------------------------------------------------------------------
-- §2. Episodes: nothing twice; a line back within 24 hours is not told again; after 24 hours it is.
-- ---------------------------------------------------------------------------
select is(tests.o1n_run(), 0, '2a: a second run tells nothing');
update public.payments set status = 'voided' where id = (select v from fx where k = 'p_k1');      -- SURGERY
select is(tests.o1n_run(), 0, '2b: K1 leaves the list: nothing is told');
select is((select (s.gone_at = now())::text from public.admin_attention_seen s where s.key = :'k1key'), 'true',
  '2c: … and its seen row records that it left');
update public.payments set status = 'held' where id = (select v from fx where k = 'p_k1');        -- SURGERY
select is(tests.o1n_run(), 0, '2d: K1 is back within 24 hours of its notice: not told again');
select is((select s.episode::text || '/' || s.notified_episode::text from public.admin_attention_seen s
            where s.key = :'k1key'), '2/1', '2e: … though its second episode has begun');
update public.admin_attention_seen set notified_at = now() - interval '25 hours'
 where key = :'k1key';                                                              -- SURGERY
select is(tests.o1n_run(), 1, '2f: 25 hours after its last notice, K1 is told');
select is(tests.o1n_told(:'ada'), 'k1#1 k1#2 k2#1 k3#1 k4#1 k5#1 / 2 more items on your list need you.',
  '2g: … once more, as episode 2');

-- ---------------------------------------------------------------------------
-- §3. Six new lines: five notices and a summary in the singular.
-- ---------------------------------------------------------------------------
select tests.o1n_held('K8', 9);
select tests.o1n_held('K9', 8);
select tests.o1n_held('KA', 7);
select tests.o1n_held('KB', 6);
select tests.o1n_held('KC', 5);
select tests.o1n_held('KD', 4);
select is(tests.o1n_run(), 6, '3a: six new lines are told');
select is(split_part(tests.o1n_told(:'ada'), ' / ', 2),
  '1 more item on your list needs you. + 2 more items on your list need you.',
  '3b: a second summary, for the one line past the five, in the singular (the first one stays)');

-- ---------------------------------------------------------------------------
-- §4. Which lines: a worker line never; the cleanup line (finish stripe) yes.
-- ---------------------------------------------------------------------------
-- SURGERY: a finished job whose payout waits for the worker's payout account.
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'cora', 'O1N worker line', :'wyn', 'completed', now() - interval '1 day') returning id as j_w \gset
-- SURGERY
insert into public.payments (job_id, payer_id, payee_id, amount_cents, platform_fee_cents, customer_fee_cents,
                             provider, provider_ref, status, release_requested_at, release_reason, transfer_cents)
values (:'j_w', :'cora', :'wyn', 8000, 800, 600, 'stripe', 'pi_o1n_w', 'held', now(), 'approved', 7200)
returning id as p_w \gset
update public.profiles set deleted_at = now() where id = :'dell';                              -- SURGERY
-- SURGERY: the cleanup row delete_my_account writes (501), its step opened 2 hours ago.
insert into public.account_cleanups (user_id, step_opened_at)
values (:'dell', now() - interval '2 hours') returning id as c_d \gset
insert into fx values ('p_w', :'p_w'), ('c_d', :'c_d');
select is((select string_agg(l.code || ' ' || l.finish, ', ' order by l.code) from public.admin_attention_lines() l
            where l.payment_id = :'p_w' or l.key = 'cleanup_customer_open:' || :'c_d'),
  'cleanup_customer_open stripe, transfer_no_payout_account worker',
  '4a: the fixtures: a payout that waits for the worker''s payout account (finish worker) and a cleanup line (finish stripe)');
select is(tests.o1n_run(), 1, '4b: one line is told');
select is((select string_agg(o.body, ' + ') from public.notification_outbox o
            where o.recipient_id = :'ada' and o.type = 'admin_attention'
              and o.data ->> 'key' in ('cleanup_customer_open:' || :'c_d',
                                       (select l.key from public.admin_attention_lines() l where l.payment_id = :'p_w'))),
  (select c.reason from public.account_cleanup_attention c where c.id = :'c_d'),
  '4c: the cleanup line is told and the worker line is not');

-- ---------------------------------------------------------------------------
-- §5. Nothing private in a notice or a seen row; the timer and its report.
-- ---------------------------------------------------------------------------
select is((select count(*) from public.notification_outbox o
            where o.type = 'admin_attention' and o.recipient_id in (:'ada', :'abe')
              and (o.title || ' ' || o.body || ' ' || o.data::text) ~* '1555010|o1n\.|cora|wade|wyn|dell|8600|86\.00|80\.00|pi_|cus_|acct_'),
  0::bigint, '5a: no notice holds a phone, an email, a name, an amount or a Stripe id');
select is((select string_agg(a.attname, ', ' order by a.attnum) from pg_attribute a
            where a.attrelid = 'public.admin_attention_seen'::regclass and a.attnum > 0 and not a.attisdropped)
          || ' / ' || (select count(*) from public.admin_attention_seen s
                        where s.key ~ '(pi|re|ch|cus|evt|tr|acct|dp)_[A-Za-z0-9]|@|1555010')::text,
  'key, first_seen, last_seen, gone_at, episode, episode_at, notified_episode, notified_at / 0',
  '5b: the seen table holds a key and times only, and no key holds a Stripe id or a contact');
select is((select j.schedule || ' ' || j.command || ' ' || j.active::text from cron.job j where j.jobname = 'brazos-admin-attention')
          || ' / ' || (select e.installer || ' ' || e.schedule || ' ' || e.command from public.expected_schedules() e
                        where e.jobname = 'brazos-admin-attention'),
  '*/10 * * * * select public.notify_attention_admins(); true / install_admin_attention_schedule */10 * * * * select public.notify_attention_admins();',
  '5c: the timer runs every 10 minutes, as the list of timers expects');
select is((select (r.ok_at = now())::text || '/' || r.stale_after::text || '/' || (r.expected_from is not null)::text
             from public.timer_runs r where r.name = 'brazos-admin-attention'),
  'true/00:40:00/true', '5d: each run reports itself; late after 40 minutes; expected since the file landed');
select ok((select (select count(*) from regexp_matches(p.prosrc, '\mreturn\M', 'g')) = 1
                  and p.prosrc ~ 'perform public\.report_timer_run\(''brazos-admin-attention'', interval ''40 minutes''\);\n\s*return\M'
                  and position('record_timer_run' in p.prosrc) = 0
             from pg_proc p where p.oid = 'public.notify_attention_admins()'::regprocedure),
  '5e: its one return comes right after its report, through report_timer_run only');

select * from finish();
rollback;
