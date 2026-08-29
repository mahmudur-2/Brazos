-- 000_smoke.sql — the pgTAP harness, proven end to end.
--
-- One deliberately minimal test. It shows that the extension installs, that
-- the CLI's test runner reaches the LOCAL stack, and that the baseline
-- migration produced the schema. Every database test R3b adds builds on this
-- proof, so this file stays exactly this small.
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions, pg_temp;
select plan(2);

select ok(true, 'the pgTAP runner executes an assertion');
select has_table('public'::name, 'jobs'::name, 'the baseline created public.jobs');

select * from finish();
rollback;
