-- 501_account_cleanups.sql — production-36h S1, M3 (20261116410000_account_deletion_process.sql), part 2:
-- what delete_my_account deletes at once and what it keeps (every review, every job, the address of a
-- job with a hire: Privacy sections 6 and 7; every file; the payout account), what it hands to the
-- settlements timer (account_cleanups: the Stripe customer), and the proofs of the brief's point 5:
-- (a) a row never names another account's Stripe customer; (b) the payout account is never closed:
-- the payment_accounts columns the settlement drain reads (transfers_ready) stay as they were; (c)
-- every step is safe to repeat; (d) a row never finishes with its step not done; (e) the table has
-- row security on, no policy and no client right. Then the timer's claim (10 rows, a 10-minute lease,
-- due one minute early), the retry times (5 minutes in the first hour, then 1 hour) and the owner's
-- view (A10-06: the payment list's shape, a step open 1 hour); and (A10-03) a Stripe customer saved after the deletion goes to the cleanup row, never
-- to the tombstone. A10 small fixes: a repeat deletion returns quietly (1l, 1m); the lease is a true 10
-- minutes (7f, 7g). The Stripe call itself is tests/accountCleanup.test.mjs. That the drain pays a
-- payment owed to a deleted worker whose payouts are on is 482_attention_truth.sql T2.
--
-- THE CAST: Dana (posts jobs, works one job, is reviewed and reviews), Wes (her hired worker), Cal (a
-- customer Dana worked for, who reviewed her), Sam (a stranger who reports one of her posts), Nia (no
-- card, then a late one), Lia (a row for the guard), Ty (a live account with a customer), and twelve
-- accounts for the claim limit; the runner (the connection's own role, RLS bypassed)
-- writes the fixture rows and reads the ground truth. One storage.objects row (Dana's avatar) is a
-- fixture row: it shows that the deletion removes no file. Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(56);

select tests.create_user('m3c.dana@brazos.test', 'Dana Deleter') as dana \gset
select tests.create_user('m3c.wes@brazos.test',  'Wes Worker')   as wes  \gset
select tests.create_user('m3c.cal@brazos.test',  'Cal Customer') as cal  \gset
select tests.create_user('m3c.sam@brazos.test',  'Sam Stranger') as sam  \gset
select tests.create_user('m3c.nia@brazos.test',  'Nia None')     as nia  \gset
select public.set_payment_customer(:'dana', 'cus_m3_dana');
select public.set_payment_customer(:'wes', 'cus_m3_wes');
update public.profiles set language = 'es' where id = :'dana';

insert into public.jobs (client_id, title, status)
values (:'dana', 'M3 open post', 'open') returning id as j_open \gset
insert into public.jobs (client_id, title, status)
values (:'dana', 'M3 draft post', 'draft') returning id as j_draft \gset
insert into public.jobs (client_id, title, status)
values (:'dana', 'M3 reported post', 'open') returning id as j_rep \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'dana', 'M3 hired job', :'wes', 'completed', now() - interval '9 days') returning id as j_done \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'cal', 'M3 Dana worked', :'dana', 'completed', now() - interval '9 days') returning id as j_cal \gset
insert into public.job_locations (job_id, address_line)
values (:'j_open', '1 Open Street'), (:'j_rep', '2 Report Street'), (:'j_done', '3 Hired Street'), (:'j_cal', '4 Cal Street');

insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment)
values (:'j_done', :'dana', :'wes', 5, 'M3 by Dana') returning id as r_by \gset
insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment)
values (:'j_done', :'wes', :'dana', 4, 'M3 about Dana') returning id as r_about \gset
insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment)
values (:'j_cal', :'cal', :'dana', 2, 'M3 Cal about Dana');
insert into public.reports (reporter_id, reported_id, job_id, reason, description, status, subject_kind, subject_id)
values (:'sam', :'dana', :'j_rep', 'scam', 'M3 report on a post', 'open', 'job', :'j_rep');

insert into public.rate_counters (user_id, action, window_start, hits) values (:'dana', 'm3-probe', now(), 1);

insert into storage.objects (bucket_id, name) values ('avatars', :'dana' || '/avatar.jpg');

-- ---------------------------------------------------------------------------
-- 1. What goes at once, what is kept, and what the cleanup row records.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'dana');
select lives_ok($$ select public.delete_my_account() $$, '1a: Dana deletes her account');
select tests.clear_auth();

select is(
  (select row((select count(*) from public.reviews r where r.id = :'r_by'), p.rating_count, round(p.rating_avg, 1))
     from public.profiles p where p.id = :'wes'),
  row(1::bigint, 1, 5.0),
  '1b: the review she wrote about Wes is still there and still counts in his rating'
);
select is(
  array(select r.comment from public.reviews r where r.reviewee_id = :'dana' order by r.comment collate "C"),
  array['M3 Cal about Dana', 'M3 about Dana'],
  '1c: the reviews about her are still there'
);
select is(
  (select row(j.status::text, (select count(*) from public.job_locations l where l.job_id = j.id))
     from public.jobs j where j.id = :'j_open'),
  row('cancelled'::text, 0::bigint),
  '1d: her post nobody was hired for is still there and closed, and its address row is gone'
);
select is(
  array(select l.address_line from public.job_locations l
         where l.job_id in (:'j_open', :'j_rep', :'j_done', :'j_cal') order by 1),
  array['2 Report Street', '3 Hired Street', '4 Cal Street'],
  '1e: the address of the job she hired for stays, so do a reported post''s and a job''s she worked'
);
select is(
  (select row(p.full_name, p.language, (select count(*) from public.rate_counters rc where rc.user_id = :'dana'))
     from public.profiles p where p.id = :'dana'),
  row('Deleted user'::text, null::text, 0::bigint),
  '1f: the tombstone has no language, and her rate counters are gone'
);
select is(
  (select row(c.stripe_customer_id, c.customer_done, c.attempts, c.finished_at is null, c.next_attempt_at <= now())
     from public.account_cleanups c where c.user_id = :'dana'),
  row('cus_m3_dana'::text, false, 0, true, true),
  '1g: the row names her own Stripe customer, the step not done, due now'
);
select is(
  (select count(*) from storage.objects o where o.bucket_id = 'avatars' and o.name = :'dana' || '/avatar.jpg'),
  1::bigint,
  '1h: no file is removed: her avatar is still there'
);
select is(
  (select row(pa.stripe_customer_id, pa.stripe_account_id) from public.payment_accounts pa where pa.user_id = :'dana'),
  row('cus_m3_dana'::text, 'acct_test_' || replace(:'dana', '-', '')),
  '1i: payment_accounts keeps the customer until the timer has deleted it, and the payout account'
);
select tests.authenticate_as(:'nia');
select lives_ok($$ select public.delete_my_account() $$, '1j: Nia, with no card, deletes hers');
select tests.clear_auth();
select is(
  (select row(c.stripe_customer_id, c.customer_done, c.finished_at is not null)
     from public.account_cleanups c where c.user_id = :'nia'),
  row(null::text, true, true),
  '1k: a row with nothing to do is finished at once'
);
-- A10 small fix (2): the answer of Dana's deletion was lost and the app asks again.
create temp table dana_before as
select (select p::text from public.profiles p where p.id = :'dana') as prof,
       (select c::text from public.account_cleanups c where c.user_id = :'dana') as clean;
select tests.authenticate_as(:'dana');
select lives_ok($$ select public.delete_my_account() $$, '1l: a repeat of Dana''s deletion (its answer lost) returns quietly');
select tests.clear_auth();
select is(
  (select row(coalesce(current_setting('brazos.inactive_ok', true), ''),
              (select p::text from public.profiles p where p.id = :'dana') = b.prof,
              (select c::text from public.account_cleanups c where c.user_id = :'dana') = b.clean,
              (select count(*) from public.account_cleanups c where c.user_id = :'dana'))
     from dana_before b),
  row(''::text, true, true, 1::bigint),
  '1m: and changes nothing: the tombstone and its one cleanup row are as before, and the mark is empty'
);

select id as dana_row from public.account_cleanups where user_id = :'dana' \gset

-- ---------------------------------------------------------------------------
-- 2. (a) A row never names another account's Stripe customer, and never changes it.
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.account_cleanups (user_id, stripe_customer_id) values (%L, 'cus_m3_wes') $$, :'cal'),
  'P0001', 'account_cleanups: the Stripe customer is not this account''s own',
  '2a: (a) a row for Cal naming Wes''s customer is refused');
select throws_ok(
  format($$ update public.account_cleanups set stripe_customer_id = 'cus_m3_wes' where id = %L $$, :'dana_row'),
  'P0001', 'account_cleanups: the account and its Stripe customer never change',
  '2b: (a) a row''s customer id never changes');
select public.set_payment_customer(:'sam', 'cus_m3_sam');
select lives_ok(
  format($$ insert into public.account_cleanups (user_id, stripe_customer_id) values (%L, 'cus_m3_sam') $$, :'sam'),
  '2c: (a) control: a row naming the account''s own customer is accepted');

-- ---------------------------------------------------------------------------
-- 3. (b) The payout account is never closed: what the settlement drain reads stays as it was.
-- ---------------------------------------------------------------------------
select pa.stripe_account_id as wes_acct, pa.payouts_enabled as wes_on
from public.payment_accounts pa where pa.user_id = :'wes' \gset
select tests.authenticate_as(:'wes');
select lives_ok($$ select public.delete_my_account() $$, '3a: Wes, who has a payout account, deletes his account');
select tests.clear_auth();
select public.record_account_cleanup(c.id, true, null) from public.account_cleanups c where c.user_id = :'wes';
select is(
  (select row(c.finished_at is not null, pa.stripe_account_id, pa.payouts_enabled, pa.stripe_customer_id)
     from public.account_cleanups c join public.payment_accounts pa on pa.user_id = c.user_id
    where c.user_id = :'wes'),
  row(true, :'wes_acct'::text, :'wes_on'::boolean, null::text),
  '3b: (b) his row finished: the payout account id and payouts_enabled, which transfers_ready reads, are as before; only the customer id is cleared'
);
select is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'account_cleanups'),
  'id,user_id,stripe_customer_id,customer_done,attempts,next_attempt_at,last_error,created_at,step_opened_at,finished_at',
  '3c: (b) a cleanup row has no file list and no payout account (A10-03 added step_opened_at, when the step was last opened)'
);
select is(
  pg_get_function_result('public.claim_account_cleanups(integer)'::regprocedure),
  'TABLE(id uuid, stripe_customer_id text, customer_done boolean)',
  '3d: (b) the claim hands the timer the customer step only'
);

-- ---------------------------------------------------------------------------
-- 4. (c) Every step is safe to repeat; the retry times.
-- ---------------------------------------------------------------------------
select public.record_account_cleanup(:'dana_row', false, 'customer: 500 api_error');
select is(
  (select row(c.customer_done, c.attempts, c.last_error, c.next_attempt_at = now() + interval '5 minutes', c.finished_at is null)
     from public.account_cleanups c where c.id = :'dana_row'),
  row(false, 1, 'customer: 500 api_error'::text, true, true),
  '4a: a failed try: attempts + 1, the error, the next try in 5 minutes (first hour)'
);
select public.record_account_cleanup(:'dana_row', false, 'customer: no answer');
select is(
  (select row(c.customer_done, c.attempts, c.last_error) from public.account_cleanups c where c.id = :'dana_row'),
  row(false, 2, 'customer: no answer'::text),
  '4b: (c) a second failed try counts again and keeps the step open'
);
select public.record_account_cleanup(:'dana_row', true, null);
select is(
  (select row(c.customer_done, c.finished_at = now(), c.last_error, c.attempts, pa.stripe_customer_id, pa.stripe_account_id is not null)
     from public.account_cleanups c join public.payment_accounts pa on pa.user_id = c.user_id
    where c.id = :'dana_row'),
  row(true, true, null::text, 2, null::text, true),
  '4c: the customer done: the row is finished, the error cleared, payment_accounts no longer names the customer and still holds the payout account'
);
select throws_ok(
  format($$ update public.account_cleanups set customer_done = false where id = %L $$, :'dana_row'),
  'P0001', 'account_cleanups: a step that is done stays done',
  '4d: (c) no write can undo a done step');
select public.record_account_cleanup(:'dana_row', false, 'late answer');
select is(
  (select row(c.customer_done, c.finished_at = now(), c.last_error, c.attempts)
     from public.account_cleanups c where c.id = :'dana_row'),
  row(true, true, null::text, 2),
  '4e: (c) a try recorded after the row finished leaves it finished'
);
select public.record_account_cleanup(:'dana_row', true, null);
select is(
  (select row(c.customer_done, c.finished_at = now(), c.last_error, c.attempts)
     from public.account_cleanups c where c.id = :'dana_row'),
  row(true, true, null::text, 2),
  '4f: (c) the customer reported done again changes nothing'
);
select is(
  (select count(*) from public.claim_account_cleanups(10) c where c.id = :'dana_row'),
  0::bigint,
  '4g: a finished row is never claimed again'
);
select public.set_payment_customer(:'cal', 'cus_m3_cal');
insert into public.account_cleanups (user_id, stripe_customer_id, created_at)
values (:'cal', 'cus_m3_cal', now() - interval '2 hours') returning id as cal_row \gset
select public.record_account_cleanup(:'cal_row', false, 'customer: no answer');
select is(
  (select c.next_attempt_at = now() + interval '1 hour' from public.account_cleanups c where c.id = :'cal_row'),
  true,
  '4h: after the first hour the next try is 1 hour later'
);

-- ---------------------------------------------------------------------------
-- 5. (d) A row never finishes with its step not done.
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ update public.account_cleanups set finished_at = now() where id = %L $$, :'cal_row'),
  '23514', null,
  '5a: (d) a finish with the customer step not done is refused by the check');
select public.record_account_cleanup(:'cal_row', false, 'customer: 502 no code');
select is(
  (select row(c.finished_at is null, c.last_error) from public.account_cleanups c where c.id = :'cal_row'),
  row(true, 'customer: 502 no code'::text),
  '5b: (d) the step not done: the row stays open'
);

-- ---------------------------------------------------------------------------
-- 6. (e) Row security on, no policy, no client right; the functions and the view for the service role.
-- ---------------------------------------------------------------------------
select is(
  (select row(c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid)) from pg_class c
    where c.oid = 'public.account_cleanups'::regclass),
  row(true, 0::bigint),
  '6a: (e) account_cleanups has row security on and no policy'
);
select is(
  (select string_agg(r || ':' || x, ',' order by r, x)
     from unnest(array['public', 'anon', 'authenticated', 'service_role']) r,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) x
    where has_table_privilege(r, 'public.account_cleanups', x)),
  null,
  '6b: (e) no role but its owner holds any right on it'
);
select is(
  (select string_agg(f || ' ' || r, ', ' order by f, r)
     from unnest(array['public.claim_account_cleanups(integer)',
                       'public.record_account_cleanup(uuid,boolean,text)',
                       'public.payment_unsettled_for(public.payments,uuid)',
                       'public.account_cleanup_guard()']) f,
          unnest(array['public', 'anon', 'authenticated', 'service_role']) r
    where has_function_privilege(r, f::regprocedure, 'EXECUTE')),
  'public.claim_account_cleanups(integer) service_role, public.record_account_cleanup(uuid,boolean,text) service_role',
  '6c: (e) only the service role may claim or record, and nobody may call the money rule or the trigger function'
);
select is(
  (select string_agg(r || ':' || x, ',' order by r, x)
     from unnest(array['public', 'anon', 'authenticated', 'service_role']) r,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) x
    where has_table_privilege(r, 'public.account_cleanup_attention', x)),
  'service_role:SELECT',
  '6d: (e) the owner''s view: select for the service role only'
);
select tests.authenticate_as(:'cal');
select throws_ok($$ select * from public.account_cleanups $$, '42501', null, '6e: (e) a signed-in account cannot read the table');
select throws_ok($$ select * from public.claim_account_cleanups(10) $$, '42501', null, '6f: (e) nor claim rows');
select throws_ok($$ select * from public.account_cleanup_attention $$, '42501', null, '6g: (e) nor read the owner''s view');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 7. The claim: at most 10 rows, a 10-minute lease, due one minute early.
-- ---------------------------------------------------------------------------
update public.account_cleanups set next_attempt_at = now() + interval '1 day' where finished_at is null;
create temp table many as
select tests.create_user('m3c.many' || g || '@brazos.test') as uid from generate_series(1, 12) g;
select public.set_payment_customer(uid, 'cus_m3_many_' || replace(uid::text, '-', '')) from many;
insert into public.account_cleanups (user_id, stripe_customer_id, next_attempt_at)
select m.uid, pa.stripe_customer_id, now() - interval '1 minute'
from many m join public.payment_accounts pa on pa.user_id = m.uid;
select is((select count(*) from public.claim_account_cleanups(50)), 10::bigint, '7a: one claim hands out at most 10 rows');
select is(
  (select count(*) from public.account_cleanups c join many m on m.uid = c.user_id
    where c.next_attempt_at = now() + interval '10 minutes' + interval '1 minute'),
  10::bigint,
  '7b: each claimed row is leased for 10 minutes (A10 small fix 1: due again 10 minutes plus the early minute from now)'
);
select is((select count(*) from public.claim_account_cleanups(50)), 2::bigint, '7c: the next claim hands out the other 2, never a leased one');
update public.account_cleanups c set next_attempt_at = now() + interval '2 minutes' from many m where m.uid = c.user_id;
update public.account_cleanups c set next_attempt_at = now() + interval '30 seconds'
  from (select uid from many order by uid limit 5) m where m.uid = c.user_id;
select is((select count(*) from public.claim_account_cleanups(50)), 5::bigint,
  '7d: a row due within one minute is claimed (a 5-minute timer never skips it); one due in 2 minutes waits');
select is((select count(*) from public.claim_account_cleanups(0)), 0::bigint, '7e: a limit of 0 claims nothing');
-- A10 small fix (1): the lease is a true 10 minutes. A row 7d claimed; time moves by moving its time back.
select uid as lease_uid from many order by uid limit 1 \gset
update public.account_cleanups set next_attempt_at = next_attempt_at - interval '9 minutes' where user_id = :'lease_uid';
select is((select count(*) from public.claim_account_cleanups(50) c join public.account_cleanups a on a.id = c.id
            where a.user_id = :'lease_uid'), 0::bigint,
  '7f: 9 minutes after its claim a leased row is not handed out again');
update public.account_cleanups set next_attempt_at = next_attempt_at - interval '1 minute' where user_id = :'lease_uid';
select is((select count(*) from public.claim_account_cleanups(50) c join public.account_cleanups a on a.id = c.id
            where a.user_id = :'lease_uid'), 1::bigint,
  '7g: 10 minutes after its claim it is');

-- ---------------------------------------------------------------------------
-- 8. The owner's view (A10-06, decision 15): the payment list's shape; a row is listed once its
--    customer step has been open for 1 hour since it was last opened, whether or not a try ran.
--    old: made 2 days ago, open exactly 1 hour, 2 tries; untried: open 2 hours, no try yet;
--    young: made and open 59 minutes; reopened: made November 1 but opened again 59 minutes ago;
--    done: finished.
-- ---------------------------------------------------------------------------
create temp table late as
select k, tests.create_user('m3c.late.' || k || '@brazos.test') as uid
from unnest(array['old', 'untried', 'young', 'reopened', 'done']) k;
select public.set_payment_customer(uid, 'cus_m3_late_' || k) from late;
insert into public.account_cleanups (user_id, stripe_customer_id, customer_done, attempts, created_at, step_opened_at, last_error, finished_at)
select l.uid, 'cus_m3_late_' || l.k, l.k = 'done',
       case when l.k = 'old' then 2 else 0 end,
       case l.k when 'old' then now() - interval '2 days'
                when 'untried' then now() - interval '2 hours'
                when 'young' then now() - interval '59 minutes'
                else timestamptz '2026-11-01 15:00:00+00' end,
       case l.k when 'old' then now() - interval '1 hour'
                when 'untried' then now() - interval '2 hours'
                when 'done' then timestamptz '2026-11-01 15:00:00+00'
                else now() - interval '59 minutes' end,
       case when l.k in ('old', 'young', 'reopened') then 'customer: 500 api_error' end,
       case when l.k = 'done' then now() end
from late l;
select is(
  (select row(a.code, a.reason, a.detail, a.attempts, a.since = now() - interval '1 hour', a.finish)
     from public.account_cleanup_attention a join late l on l.uid = a.user_id where l.k = 'old'),
  row('cleanup_customer_open'::text,
      'A deleted account''s Stripe customer is not deleted yet. The app tries again by itself. If this line stays, delete the customer named in the detail in the Stripe dashboard. If Stripe does not show that customer, ask your developer.'::text,
      'Stripe customer cus_m3_late_old; last try: customer: 500 api_error'::text, 2, true, 'stripe'::text),
  '8a: A10-06: code, the one sentence (what is not deleted, who finishes it and how), since the step was opened, a detail that names the customer and the last error, the tries, finish stripe'
);
select is(
  (select row(a.detail, a.attempts, a.since = now() - interval '2 hours')
     from public.account_cleanup_attention a join late l on l.uid = a.user_id where l.k = 'untried'),
  row('Stripe customer cus_m3_late_untried; last try: none recorded yet'::text, 0, true),
  '8b: A10-06: a step open 2 hours with no try yet is listed, and its detail says no try is recorded'
);
select is(
  (select array_agg(l.k order by l.k) from public.account_cleanup_attention a join late l on l.uid = a.user_id),
  array['old', 'untried'],
  '8c: A10-06: a step open 59 minutes is not listed yet, also on a row made on November 1 and opened again, and a finished row never is'
);
select is(
  (select array_agg(t.table_name || ': ' || t.cols order by t.table_name) from (
     select c.table_name::text as table_name,
            string_agg(c.column_name || ' ' || c.data_type, ', ' order by c.column_name) as cols
       from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name in ('account_cleanup_attention', 'payment_attention')
        and c.column_name in ('code', 'reason', 'since', 'detail', 'finish')
      group by c.table_name) t),
  array['account_cleanup_attention: code text, detail text, finish text, reason text, since timestamp with time zone',
        'payment_attention: code text, detail text, finish text, reason text, since timestamp with time zone'],
  '8d: A10-06: code, reason, since, detail and finish have the payment list''s names and types, so one reader can show both lists'
);

-- ---------------------------------------------------------------------------
-- 9. A10-03: a customer the provider made while the deletion ran (the late save: create-payment or
--    payment-methods was admitted before the deletion and stores its new customer after it) goes to
--    the cleanup row, never to the tombstone. Nia was deleted with no card (1k: her row finished).
-- ---------------------------------------------------------------------------
select id as nia_row from public.account_cleanups where user_id = :'nia' \gset
select is(public.set_payment_customer(:'nia', 'cus_m3_nia_late'), null::text,
  '9a: A10-03: the late save for a deleted account hands back no customer');
select is(
  (select count(*) from public.payment_accounts pa where pa.user_id = :'nia' and pa.stripe_customer_id is not null),
  0::bigint,
  '9b: A10-03: and puts no customer on the tombstone'
);
select is(
  (select row(c.stripe_customer_id, c.customer_done, c.finished_at is null, c.next_attempt_at = now(), c.step_opened_at = now())
     from public.account_cleanups c where c.id = :'nia_row'),
  row('cus_m3_nia_late'::text, false, true, true, true),
  '9c: A10-03: her cleanup row names it, and its step is open again, due now, opened now'
);
select is((select count(*) from public.claim_account_cleanups(10) c where c.id = :'nia_row' and c.stripe_customer_id = 'cus_m3_nia_late'),
  1::bigint, '9d: A10-03: the timer is handed it, so the customer is deleted at Stripe');
select is(
  (select row(public.set_payment_customer(:'nia', 'cus_m3_nia_other'),
              (select c.stripe_customer_id from public.account_cleanups c where c.id = :'nia_row'))),
  row(null::text, 'cus_m3_nia_late'::text),
  '9e: A10-03: a second, different late customer is not taken: the row keeps the first'
);
-- The guard: the one change of a customer id is the late one, opening the step, and no other account's.
select tests.create_user('m3c.lia@brazos.test', 'Lia Late') as lia \gset
select tests.create_user('m3c.ty@brazos.test', 'Ty Live') as ty \gset
select public.set_payment_customer(:'ty', 'cus_m3_ty');
insert into public.account_cleanups (user_id, stripe_customer_id, customer_done, finished_at)
values (:'lia', null, true, now()) returning id as lia_row \gset
select throws_ok(
  format($$ update public.account_cleanups set stripe_customer_id = 'cus_m3_lia' where id = %L $$, :'lia_row'),
  'P0001', 'account_cleanups: a late Stripe customer opens the step again and is no other account''s',
  '9f: A10-03: a customer id written without opening the step again is refused');
select throws_ok(
  format($$ update public.account_cleanups set stripe_customer_id = 'cus_m3_ty', customer_done = false, finished_at = null where id = %L $$, :'lia_row'),
  'P0001', 'account_cleanups: a late Stripe customer opens the step again and is no other account''s',
  '9g: A10-03: a live account''s customer (Ty''s, in payment_accounts, on no cleanup row) is refused, even with the step opened');
select throws_ok(
  format($$ update public.account_cleanups set step_opened_at = now() - interval '1 day' where id = %L $$, :'nia_row'),
  'P0001', 'account_cleanups: the account and its Stripe customer never change',
  '9h: A10-03: step_opened_at moves only with the late customer');

select * from finish();
rollback;
