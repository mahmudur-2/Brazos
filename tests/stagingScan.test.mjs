import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
  assert.match(r.stdout, /line 2: drop table if exists public\.b;/);
  assert.match(r.stdout, /STOPPING\. NOTHING HAS BEEN APPLIED\./);
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
