import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanSql } from '../scripts/migration-scan.mjs';

// scripts/staging-scan.sh, executed for real against fixture migrations. The staging pipeline and
// the production button both run it, and other builders call `bash scripts/staging-scan.sh false
// <files>` today: that call must keep its exit codes (0 safe, 1 flagged, 2 wrong call).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = join(ROOT, 'scripts', 'staging-scan.sh');
const SAFE = 'supabase/migrations/20260101000000_safe.sql';
const DROP = 'supabase/migrations/20260102000000_drop.sql';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'brazos-scan-'));
  mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(join(dir, SAFE), 'create table if not exists public.a (id int);\ngrant select, truncate on public.a to authenticated;\n');
  writeFileSync(join(dir, DROP), '-- a comment that says drop table is fine\ndrop table if exists public.b;\n');
  return dir;
}

function scan(args, input) {
  const dir = fixture();
  try {
    return spawnSync('bash', [SCAN, ...args], { cwd: dir, input, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The pinned CLI's table: every cell in backticks, sometimes a box-drawing bar instead of a pipe.
const table = (rows) =>
  ['   Local          | Remote         | Time (UTC)', '  ----------------|----------------|-----------']
    .concat(rows.map(([local, remote]) => `   ${local ? `\`${local}\`` : ''} │ ${remote ? `\`${remote}\`` : ''} │ 2026-01-01`))
    .join('\n');

test('the existing call keeps working: a safe file exits 0', () => {
  const r = scan(['false', SAFE]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok {3}supabase\/migrations\/20260101000000_safe\.sql/);
});

test('a flagged file stops with exit 1 and names the line, before anything is applied', () => {
  const r = scan(['false', DROP]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FLAG supabase\/migrations\/20260102000000_drop\.sql/);
  assert.match(r.stdout, /line 2: drop table if exists public\.b; \(review required: removes table b\)/);
  assert.match(r.stdout, /STOPPING\. NOTHING HAS BEEN APPLIED\./);
});

// F01: a risk detector, never a safety claim, in every outcome.
test('no outcome of the scan calls a file safe; a flag says review required', () => {
  for (const args of [['false', SAFE], ['false', DROP], ['true', DROP]]) {
    const r = scan(args);
    assert.doesNotMatch(r.stdout + r.stderr, /safe(?!\.sql)|destructive shape/i, args.join(' '));
  }
  assert.match(scan(['false', DROP]).stdout, /Review required: a statement above may remove, rename or change something/);
});

// The statement reader (scripts/migration-scan.mjs): each case is [sql, the flagged lines and the start
// of each reason]. The old line-based scan missed or invented every flag marked "old".
const CASES = [
  // old missed: a statement split over lines, and one after a -- inside a string
  ['drop\n  table public.b;', [[1, 'removes table b']]],
  ["insert into public.a (t) values ('a -- b'); drop table public.c;", [[1, 'removes table c']]],
  // old invented: the words inside a block comment (nested), a string, an E'string' and a $tag1$ body
  ['/* a /* b */ drop table public.x; */\ncreate table public.a (id int);', []],
  ["comment on table public.a is 'we never drop table public.a';", []],
  ["comment on table public.a is E'it\\'s; drop table public.a';", []],
  ['create function public.f() returns void language plpgsql as $tag1$ begin delete from public.t; end $tag1$;', []],
  // old missed: code that runs at once
  ['do $tag1$ begin perform 1; end $tag1$;', [[1, 'a DO block runs at once']]],
  ['update public.a set x = 1;', [[1, 'changes or removes rows already in the database']]],
  ['select public.install_schedules();', [[1, 'a SELECT that runs code at once']]],
  ["select cron.schedule('a', '* * * * *', $$ select 1 $$);\nselect pg_catalog.set_config('search_path', '', false);", [[1, 'a SELECT that runs code at once']]],
  // RM4-R P1: a scheduled job's command is an emptied string, so cron.schedule is never let through by its name
  ["select cron.schedule('purge', '0 * * * *', 'delete from public.jobs');", [[1, 'a SELECT that runs code at once']]],
  ["select cron.schedule('purge', '0 * * * *', $cmd$ delete from public.jobs $cmd$);", [[1, 'a SELECT that runs code at once']]],
  // RM4-R P2: with standard_conforming_strings off a backslash escapes a quote, which the reader does not follow
  ["set standard_conforming_strings = off;\ncomment on table public.a is 'a\\''; drop table public.jobs; comment on table public.a is 'b\\'';", [[1, 'the scan cannot read']]],
  ['set standard_conforming_strings = on;', []],
  // RM4-R P3: PostgreSQL ends a -- comment at a lone CR too; a CRLF file keeps its line numbers
  ['-- note\rdrop table public.b;', [[2, 'removes table b']]],
  ['create table public.a (id int);\r\n\r\ndrop table public.b;\r\n', [[3, 'removes table b']]],
  // old patterns with no statement-level case before
  ['truncate public.a;', [[1, 'changes or removes rows already in the database']]],
  ['delete from public.a where true;', [[1, 'changes or removes rows already in the database']]],
  ['alter table public.a drop column b;', [[1, 'removes, renames or changes an existing column or table']]],
  ['alter table public.a rename to c;', [[1, 'renames something']]],
  ['drop schema s;', [[1, 'removes schema s']]],
  // answer 4: a function made again with another parameter list; equal lists after folding pass
  [
    'drop function if exists public.f(uuid, text);\ncreate or replace function public.f(p_id uuid, p_reason text, p_extra int default 0) returns void language sql as $$ select 1 $$;',
    [[1, 'makes function f again with other parameters: (uuid, text) became (p_id uuid, p_reason text, p_extra int)']],
  ],
  ['DROP FUNCTION public.f(UUID,  text);\ncreate function public.f(p_id uuid, p_reason TEXT, out n int) returns int language sql as $$ select 1 $$;', []],
  ['drop function public.f(timestamptz);\ncreate function public.f(p_at timestamp with time zone) returns int language sql as $$ select 1 $$;', [[1, 'makes function f again with other parameters']]],
  ['drop function public.f(uuid);', [[1, 'removes function f, and this file does not make it again']]],
  ['create function public.f(p uuid) returns int language sql as $$ select 1 $$;\ndrop function public.f(uuid);', [[2, 'removes function f, and this file does not make it again']]],
  ['drop function public.f(uuid) cascade;\ncreate function public.f(p uuid) returns int language sql as $$ select 1 $$;', [[1, 'CASCADE can remove other objects too']]],
  // answer 3: policy changes are definitions; a policy removed for good is not
  ['drop policy if exists "Read own" on public.a;\ncreate policy "Read own" on public.a for select using (true);\nalter policy "Read own" on public.a using (false);', []],
  ['drop policy if exists p on public.a;', [[1, 'removes policy p on a, and this file does not make it again']]],
  // rights: taken from what this file made earlier is part of making it; from anything else, review
  ['create table public.a (id int);\nrevoke all on table public.a from anon;\ngrant select, truncate on public.a to authenticated;', []],
  ['revoke select on public.b from authenticated;', [[1, 'takes a right away from something this file does not make']]],
  ['revoke all on table public.a from anon;\ncreate table if not exists public.a (id int);', [[1, 'takes a right away from something this file does not make']]],
  ['alter table public.a add column b int, enable row level security;\nalter table public.a alter column b set default 0;', []],
  ['alter table public.a alter column b type bigint;', [[1, 'removes, renames or changes an existing column or table']]],
  ['alter table public.a rename column b to c;', [[1, 'renames something']]],
  ["comment on table public.a is 'never closed;", [[1, 'the scan cannot read this statement to its end']]],
];

test('the scan reads statements: quotes, comments and $tag$ bodies never count, and each risky statement is flagged', async (t) => {
  for (const [sql, want] of CASES) {
    await t.test(JSON.stringify(sql), () => {
      const got = scanSql(sql);
      assert.deepEqual(got.map((f) => f.line), want.map(([line]) => line), sql);
      got.forEach((f, j) => assert.ok(f.reason.startsWith(want[j][1]), `${sql}\n${f.reason}`));
    });
  }
});

// F13: the batch pending for production at the last green press (b850a4b), under this scan.
test('the pending production batch is flagged exactly where a person must read it', () => {
  const lines = (name) => scanSql(readFileSync(join(ROOT, 'supabase/migrations', name), 'utf8')).map((f) => f.line);
  assert.deepEqual(lines('20261115000000_transfer_in_flight.sql'), [381]);
  assert.deepEqual(lines('20261115000300_drop_set_payouts_enabled.sql'), [14]);
  assert.deepEqual(lines('20261116000000_access_allow_list.sql'), [31, 32, 38, 39, 40, 41, 42, 43, 44, 45, 47]);
  for (const n of ['0100_payer_money_rpcs', '0200_work_start_money_rule', '0400_receipt_and_push_claims', '0500_money_notices', '0600_refund_failed_and_event_order', '0700_intent_cancel', '0800_worker_fee_no_minimum']) {
    assert.deepEqual(lines(`2026111500${n}.sql`), [], n);
  }
});

// RM4-R P4: a scan that throws is exit 2 (a broken scan), never exit 1 (a flag the override could pass).
// staging-scan.sh refuses a path that is not a file with exit 2 before it calls node, so the node part runs alone.
test('a scan that fails on its input exits 2 with one line and no stack', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brazos-scan-'));
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'migration-scan.mjs'), dir], { encoding: 'utf8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('allow_destructive true lets a flagged file through and still prints it', () => {
  const r = scan(['true', DROP]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /FLAG/);
  assert.match(r.stdout, /OVERRIDE IN EFFECT/);
});

test('a wrong first argument exits 2', () => {
  assert.equal(scan(['maybe', SAFE]).status, 2);
  assert.equal(scan(['false', 'supabase/migrations/missing.sql']).status, 2);
});

test('the stop text speaks for both pipelines, staging and production', () => {
  const r = scan(['false', DROP]);
  assert.match(r.stdout, /staging/i);
  assert.match(r.stdout, /production/i);
});

test('--pending-files resolves the versions the database lacks to files', () => {
  const r = scan(['--pending-files', '-'], table([['20260101000000', '20260101000000'], ['20260102000000', '']]));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [DROP]);
});

test('--applied-count counts the versions the database holds', () => {
  const count = (rows) => {
    const r = scan(['--applied-count', '-'], table(rows));
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  assert.equal(count([['20260101000000', ''], ['20260102000000', '']]), '0', 'an empty database holds nothing');
  assert.equal(count([['20260101000000', '20260101000000'], ['20260102000000', '']]), '1');
  // A version the database holds but this checkout lacks still counts as applied.
  assert.equal(count([['', '20251231000000'], ['20260101000000', '20260101000000']]), '2');
});

test('--applied-count refuses a table it cannot read rather than answer 0', () => {
  const r = scan(['--applied-count', '-'], 'Connecting to remote database...\nsomething else entirely\n');
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '', 'a FATAL never prints a count');
  assert.match(r.stderr, /FATAL/);
});
