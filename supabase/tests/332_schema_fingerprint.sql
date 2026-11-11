-- 332_schema_fingerprint.sql — ledger B7, second half (20261112000200_schema_fingerprint.sql):
-- public.schema_fingerprint() is the plain catalog reader scripts/verify-schema.mjs compares. This
-- file proves it is service_role only, returns the 19 sections, is stable, and that each kind of
-- change moves exactly the section that names it (the alarm). What the script then removes and why
-- is tests/verifySchema.test.mjs's to prove.
--
-- FIXTURE SURGERY, DECLARED: §3 creates a probe table, enum, function, policy, index, grant change,
-- publication member and removes one timer, all inside this transaction; everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(19);

create function tests.fp_changed(a jsonb, b jsonb) returns text language sql immutable as $f$
  select coalesce(string_agg(k, ',' order by k), '(none)')
    from (select jsonb_object_keys(a) as k) keys
   where a -> k is distinct from b -> k
$f$;

-- ---------------------------------------------------------------------------
-- §1. Shape and access.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.schema_fingerprint()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.schema_fingerprint()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.schema_fingerprint()', 'EXECUTE'),
  'B7: schema_fingerprint() is service_role only');
select is(
  (select string_agg(k, ',' order by k) from jsonb_object_keys(public.schema_fingerprint()) k),
  'buckets,columns,constraints,default_privileges,enums,extensions,function_grants,functions,indexes,migrations,policies,realtime,schedules,server,storage_policies,table_grants,tables,triggers,views',
  'B7: it returns the 19 sections');
select is(
  (select count(*) from jsonb_each(public.schema_fingerprint()) e where jsonb_typeof(e.value) <> 'array'),
  0::bigint,
  'B7: every section is a list');
select is(public.schema_fingerprint(), public.schema_fingerprint(), 'B7: two calls give the same value');

-- ---------------------------------------------------------------------------
-- §2. It reads what it says (positive controls on known rows).
-- ---------------------------------------------------------------------------
select ok(
  (public.schema_fingerprint() -> 'realtime') @> '[{"member": "public.jobs"}, {"member": "public.job_offers"}, {"member": "public.messages"}]'::jsonb,
  'B7: realtime lists the published tables');
select ok(
  (public.schema_fingerprint() -> 'schedules') @> '[{"jobname": "brazos-drain-push", "schedule": "* * * * *", "active": true}]'::jsonb,
  'B7: schedules lists the timers');
select ok(
  (public.schema_fingerprint() -> 'tables') @> '[{"name": "job_locations", "rls": true}]'::jsonb,
  'B7: tables carries row security');
select ok(
  (public.schema_fingerprint() -> 'migrations') @> '[{"version": "20261112000200"}]'::jsonb,
  'B7: migrations lists the applied versions');

-- ---------------------------------------------------------------------------
-- §3. The alarm: each change moves exactly its own sections.
-- ---------------------------------------------------------------------------
create temp table fp (step int primary key, v jsonb) on commit drop;
insert into fp values (0, public.schema_fingerprint());

create table public.b7_probe (id bigint primary key, note text);
insert into fp values (1, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 0), (select v from fp where step = 1)),
  'columns,constraints,indexes,table_grants,tables',
  'B7 alarm: a new table moves tables, columns, its key constraint and index, and its grants');

alter table public.b7_probe enable row level security;
insert into fp values (2, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 1), (select v from fp where step = 2)),
  'tables', 'B7 alarm: switching row security on moves tables only');

create policy b7_probe_read on public.b7_probe for select to authenticated using (true);
insert into fp values (3, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 2), (select v from fp where step = 3)),
  'policies', 'B7 alarm: a new policy moves policies only');

grant update (note) on public.b7_probe to anon;
insert into fp values (4, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 3), (select v from fp where step = 4)),
  'table_grants', 'B7 alarm: a grant change moves table_grants only');

create index b7_probe_note_idx on public.b7_probe (note);
insert into fp values (5, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 4), (select v from fp where step = 5)),
  'indexes', 'B7 alarm: a new index moves indexes only');

alter publication supabase_realtime add table public.b7_probe;
insert into fp values (6, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 5), (select v from fp where step = 6)),
  'realtime', 'B7 alarm: a new publication member moves realtime only');

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'brazos-drain-push';
insert into fp values (7, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 6), (select v from fp where step = 7)),
  'schedules', 'B7 alarm: a lost timer moves schedules only');

create function public.b7_probe_fn() returns integer language sql as $f$ select 1 $f$;
insert into fp values (8, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 7), (select v from fp where step = 8)),
  'function_grants,functions', 'B7 alarm: a new function moves functions and function_grants');

create or replace function public.b7_probe_fn() returns integer language sql as $f$ select 2 $f$;
insert into fp values (9, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 8), (select v from fp where step = 9)),
  'functions', 'B7 alarm: a changed function body moves functions only');

create type public.b7_probe_kind as enum ('one', 'two');
insert into fp values (10, public.schema_fingerprint());
select is(tests.fp_changed((select v from fp where step = 9), (select v from fp where step = 10)),
  'enums', 'B7 alarm: a new enum moves enums only');

select ok(
  (select p.prosrc !~* 'decrypted_secret|vault\.' from pg_proc p where p.oid = 'public.schema_fingerprint()'::regprocedure),
  'B7: the fingerprint never reads the Vault');

select * from finish();
rollback;
