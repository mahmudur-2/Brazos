-- 478_active_account_helpers.sql — production-36h S1, M2: the A2 matrix (S4-02). Each helper the
-- guard leaves out (the exempt ones that answer a question) is asked, with arguments about OTHER
-- people, by a banned caller, a deleted caller, a caller with no profile, an active stranger, and
-- (the control) the active counterpart. None may throw; none may tell an inactive caller anything
-- about anyone else; none may tell more than the row policies already do.
--
-- THE CAST: Vic, the person asked about (an active worker); Cara, who hired him (the counterpart);
-- Bart, who hired him once and is then banned; Dina, who deletes her account; Sid, a stranger; a
-- signed-in token whose user has no profile; an admin who bans Bart; and the runner for the fixture
-- rows. Everything rolls back; no commit.
--
-- FIXTURE SURGERY, DECLARED: the jobs and the review are raw rows by the runner; the review is dated
-- eight days back so it is revealed. val_of() is this file's pg_temp helper: it runs one query and
-- returns its value as text, or ERROR and the state when it throws.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(7);

create temp table fx (k text primary key, v uuid);
grant select, insert on fx to anon, authenticated, service_role;

create function pg_temp.val_of(p_sql text) returns text language plpgsql as $f$
declare
  v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'ERROR ' || sqlstate;
end
$f$;
grant execute on function pg_temp.val_of(text) to anon, authenticated, service_role;

select tests.create_user('ah.admin@brazos.test', 'Ada Admin')   as admin \gset
select tests.create_user('ah.vic@brazos.test',   'Vic Worker')  as vic   \gset
select tests.create_user('ah.cara@brazos.test',  'Cara Client') as cara  \gset
select tests.create_user('ah.bart@brazos.test',  'Bart Banned') as bart  \gset
select tests.create_user('ah.dina@brazos.test',  'Dina Gone')   as dina  \gset
select tests.create_user('ah.sid@brazos.test',   'Sid Stranger') as sid  \gset
update public.profiles set is_admin = true where id = :'admin';

insert into public.jobs (client_id, title, assigned_worker_id, status)
values (:'cara', 'AH cara hired vic', :'vic', 'assigned') returning id as j_cara \gset
insert into public.jobs (client_id, title, assigned_worker_id, status, completed_at)
values (:'bart', 'AH bart hired vic', :'vic', 'completed', now() - interval '9 days') returning id as j_bart \gset
insert into public.jobs (client_id, title, status)
values (:'vic', 'AH vic own open job', 'open') returning id as j_vic \gset
insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment, created_at)
values (:'j_bart', :'vic', :'bart', 4, 'AH review by vic', now() - interval '8 days') returning created_at as rev_at \gset

select tests.authenticate_as(:'admin');
select public.ban_user(:'bart');
select tests.authenticate_as(:'dina');
select public.delete_my_account();
select tests.clear_auth();

-- One row of answers per caller: every exempt helper that answers a question, about Vic, his job,
-- Cara's job with him, Bart's job with him and Vic's real review (and the same review with one id
-- changed, a review that does not exist).
create temp table asked (sql text not null);
grant select on asked to anon, authenticated, service_role;
insert into asked values (format($q$
  select concat_ws(' ',
    'banned=' || pg_temp.val_of($i$select public.current_user_is_banned()::text$i$),
    'me=' || pg_temp.val_of($i$select public.is_active_user()::text$i$),
    'admin=' || pg_temp.val_of($i$select public.current_user_is_admin()::text$i$),
    'vic_active=' || pg_temp.val_of($i$select public.is_profile_active(%1$L)::text$i$),
    'vic_visible=' || pg_temp.val_of($i$select public.profile_visible(%1$L)::text$i$),
    'del_vic_job=' || pg_temp.val_of($i$select public.can_delete_own_job(%2$L)::text$i$),
    'msg_cara=' || pg_temp.val_of($i$select public.messaging_unlocked(%3$L, null)::text$i$),
    'msg_bart=' || pg_temp.val_of($i$select public.messaging_unlocked(%4$L, null)::text$i$),
    'review=' || pg_temp.val_of($i$select public.review_is_revealed(%4$L, %1$L, %5$L, %6$L)::text$i$),
    'fake_review=' || pg_temp.val_of($i$select public.review_is_revealed(%4$L, %1$L, %7$L, %6$L)::text$i$),
    'blockers=' || pg_temp.val_of($i$select count(*)::text from public.account_deletion_blockers()$i$),
    'vic_row=' || pg_temp.val_of($i$select count(*)::text from public.profiles where id = %1$L$i$))
$q$, :'vic', :'j_vic', :'j_cara', :'j_bart', :'bart', :'rev_at', :'sid'));

-- ---------------------------------------------------------------------------
-- 1. The callers who must learn nothing about anyone else.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'bart');
select is(pg_temp.val_of((select sql from asked)),
  'banned=true me=false admin=false vic_active=false vic_visible=false del_vic_job=false msg_cara=false msg_bart=false review=false fake_review=false blockers=0 vic_row=0',
  '1a: S4-02: a banned caller learns only that it is banned; every question about others is false, nothing throws');
select tests.authenticate_as(:'dina');
select is(pg_temp.val_of((select sql from asked)),
  'banned=false me=false admin=false vic_active=false vic_visible=false del_vic_job=false msg_cara=false msg_bart=false review=false fake_review=false blockers=0 vic_row=0',
  '1b: S4-02: a deleted caller''s token learns nothing, nothing throws');
select tests.authenticate_as(gen_random_uuid());
select is(pg_temp.val_of((select sql from asked)),
  'banned=false me=false admin=false vic_active=false vic_visible=false del_vic_job=false msg_cara=false msg_bart=false review=false fake_review=false blockers=0 vic_row=0',
  '1c: S4-02: a token with no profile row learns nothing, nothing throws');

-- ---------------------------------------------------------------------------
-- 2. The active callers: no more than the row policies and the public readers already tell.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'sid');
select is(pg_temp.val_of((select sql from asked)),
  'banned=false me=true admin=false vic_active=true vic_visible=false del_vic_job=false msg_cara=false msg_bart=false review=true fake_review=false blockers=0 vic_row=1',
  '2a: an active stranger: Vic is active (his profile row is readable anyway), no pair rights, the revealed review (shown by profile_reviews anyway) and never a review that does not exist');
select tests.authenticate_as(:'cara');
select is(pg_temp.val_of((select sql from asked)),
  'banned=false me=true admin=false vic_active=true vic_visible=true del_vic_job=false msg_cara=true msg_bart=false review=true fake_review=false blockers=1 vic_row=1',
  '2b: control: the active counterpart gets her pair''s answers (guard)');
select tests.authenticate_as(:'vic');
select is(pg_temp.val_of('select public.can_delete_own_job(' || quote_literal(:'j_vic') || ')::text'), 'true',
  '2c: control: Vic may delete his own untouched open job (guard)');

-- ---------------------------------------------------------------------------
-- 3. The same answers come back for the policies' own reads: no recursion, nothing throws.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'bart');
select is(
  pg_temp.val_of('select count(*)::text from public.reviews') || ' / '
  || pg_temp.val_of('select count(*)::text from public.job_offers') || ' / '
  || pg_temp.val_of('select count(*)::text from public.bids') || ' / '
  || pg_temp.val_of('select count(*)::text from public.profiles where id = auth.uid()'),
  '0 / 0 / 0 / 1',
  '3a: a banned caller''s reads through the helper-using policies return, empty, without recursion or error (its own profile row stays)');
select tests.clear_auth();

select * from finish();
rollback;
