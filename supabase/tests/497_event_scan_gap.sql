-- 497_event_scan_gap.sql — money M2, A9-02: a time the event scan could not read stays on the owner's
-- list (event_scan_gap) until a developer clears it; no later clean scan removes it.
--
--   G1  a page overflow whose read ends after the covered time: a line; then a clean scan: still there.
--   G2  two scans more than the window apart: a line from the end of the covered time.
--   G3  a run that died with no report, then a scan inside the window: no line.
--   G4  an overflow that reaches back into covered time: no line (nothing can be missing there).
--   G5  the developer clears a line with a note; a blank note is refused.
--   G6  who may touch it: RLS on, no policy, no grant; both functions service_role only.
--   G7  the very first scan (no covered_to) counts from the start of its own window: read whole, no
--       line; cut, the part of its own window it did not read, and covered_to is set.
-- FIXTURE SURGERY, DECLARED: event_scan_coverage.covered_to is set to a time before now() (now() is
-- fixed in a transaction). Everything rolls back.
\set tests_included 1
\ir _helpers.sql

begin;
set local search_path = public, extensions, pg_temp;
select plan(19);

create or replace function tests.sg_cover(p_ago interval) returns void language sql as $$
  insert into public.event_scan_coverage as c (only_row, covered_to) values (true, now() - p_ago)
  on conflict (only_row) do update set covered_to = excluded.covered_to
$$;
create or replace function tests.sg_epoch(p_ago interval) returns bigint language sql as $$
  select extract(epoch from now() - p_ago)::bigint
$$;
create or replace function tests.sg_lines() returns text language sql as $$
  select coalesce(string_agg(a.code || '/' || (now() - a.since)::text || '/' || a.finish, ' | ' order by a.since), '<none>')
    from public.payment_attention a where a.code = 'event_scan_gap'
$$;

-- G1. A page overflow, then a clean scan.
select tests.sg_cover('10 minutes');
select is(public.record_event_scan(tests.sg_epoch('1 hour'), tests.sg_epoch('5 minutes')), true,
  'G1a: the scan stopped at its page limit 5 minutes back; the covered time ended 10 minutes back: a gap');
select is(tests.sg_lines(), 'event_scan_gap/00:10:00/developer', 'G1b: one line, since the end of the covered time');
select ok((select a.detail from public.payment_attention a where a.code = 'event_scan_gap')
            like 'Stripe events from % to % were not all read by the event scan: compare Stripe''s events of that time with payment_events, apply what is missing, then clear_event_scan_gap(%',
  'G1c: the detail names from when to when, and the call that clears it');
select is((select a.reason from public.payment_attention a where a.code = 'event_scan_gap'),
  'Some messages from Stripe about payments in one period may not have reached the app, so a payment change from that time, such as a failed refund, may be missing from the app. The period is in the detail. Your developer compares Stripe''s events of that period with the app, then clears this line. Ask your developer.',
  'G1d: its sentence');
select is(public.record_event_scan(tests.sg_epoch('59 minutes'), tests.sg_epoch('59 minutes')), false, 'G1e: a clean scan of its whole window: no new gap');
select is(tests.sg_lines(), 'event_scan_gap/00:10:00/developer', 'G1f: the line is still there after the clean scan');

-- G2. Two scans more than the window apart.
select tests.sg_cover('2 hours');
select tests.sg_epoch('1 hour') as g2_window \gset
select is(public.record_event_scan(:g2_window, :g2_window), true, 'G2a: the covered time ended 2 hours back, this window starts 1 hour back: a gap');
select is((select (g.missing_from = now() - interval '2 hours')::text || '/' || (g.missing_to = to_timestamp(:g2_window))::text
             from public.event_scan_gaps g order by g.id desc limit 1), 'true/true',
  'G2b: from the end of the covered time (2 hours back) to the start of this window (the second the scan was given)');

-- G3. A run that died with no report, then a scan inside the window.
select tests.sg_cover('10 minutes');
select is(public.record_event_scan(tests.sg_epoch('1 hour'), tests.sg_epoch('1 hour')), false, 'G3: the window reaches back past the covered time: no gap');

-- G4. An overflow that reaches back into covered time.
select tests.sg_cover('10 minutes');
select is(public.record_event_scan(tests.sg_epoch('1 hour'), tests.sg_epoch('20 minutes')), false, 'G4: read back to 20 minutes, covered to 10 minutes back: no gap');
select is((select count(*)::integer from public.payment_attention a where a.code = 'event_scan_gap'), 2, 'G4b: the two lines of G1 and G2, no more');

-- G5. The developer clears a line.
select ok(public.clear_event_scan_gap((select min(id) from public.event_scan_gaps), 'compared: one refund.failed applied by hand'), 'G5a: cleared with a note');
select is((select count(*)::integer from public.payment_attention a where a.code = 'event_scan_gap'), 1, 'G5b: that line goes; the other stays');
select throws_ok($$ select public.clear_event_scan_gap((select max(id) from public.event_scan_gaps), '  ') $$, 'P0001',
  'Say what the comparison with Stripe found', 'G5c: a blank note is refused');

-- G6. Who may touch it.
select is((select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || (select count(*) from pg_policies p where p.tablename = c.relname)::text
             || ':' || has_table_privilege('service_role', c.oid, 'select')::text || ':' || has_table_privilege('authenticated', c.oid, 'select')::text, ',' order by c.relname)
             from pg_class c where c.oid in ('public.event_scan_coverage'::regclass, 'public.event_scan_gaps'::regclass)),
  'event_scan_coverage:true:0:false:false,event_scan_gaps:true:0:false:false', 'G6a: RLS on, no policy, no grant');
select is(has_function_privilege('service_role', 'public.record_event_scan(bigint, bigint)', 'execute')::text
          || '/' || has_function_privilege('authenticated', 'public.record_event_scan(bigint, bigint)', 'execute')::text
          || '/' || has_function_privilege('service_role', 'public.clear_event_scan_gap(bigint, text)', 'execute')::text
          || '/' || has_function_privilege('authenticated', 'public.clear_event_scan_gap(bigint, text)', 'execute')::text
          || '/' || has_function_privilege('anon', 'public.clear_event_scan_gap(bigint, text)', 'execute')::text,
  'true/false/true/false/false', 'G6b: both functions service_role only');

-- G7. The very first scan.
delete from public.event_scan_coverage;
select is(public.record_event_scan(tests.sg_epoch('1 hour'), tests.sg_epoch('1 hour')), false, 'G7a: the very first scan read its whole window: no line');
delete from public.event_scan_coverage;
select tests.sg_epoch('1 hour') as g7_window, tests.sg_epoch('5 minutes') as g7_read \gset
select is(public.record_event_scan(:g7_window, :g7_read), true, 'G7b: the very first scan was cut 5 minutes back: a gap');
select is((select (g.missing_from = to_timestamp(:g7_window))::text || '/' || (g.missing_to = to_timestamp(:g7_read))::text
             from public.event_scan_gaps g order by g.id desc limit 1)
          || '/' || (select (now() - c.covered_to)::text from public.event_scan_coverage c),
  'true/true/00:01:00', 'G7c: from the start of its own window (1 hour back) to the oldest event it read (5 minutes back), the seconds the scan was given; covered_to a minute ago');

select * from finish();
rollback;
