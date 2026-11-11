// B9 and B17 part 2 (docs/lean/AUDIT-LEDGER.md): who may list job photos, and when completion proof
// may change. The behaviour is proven on the database (supabase/tests/400_access_matrix.sql §3,
// 040_authz.sql's storage section); this fences the migration's shape and the one client path it
// touches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const sql = read('supabase/migrations/20261112031000_job_photos_access.sql');
const policy = (name) => {
  const start = sql.indexOf(`alter policy ${name} on storage.objects`);
  const end = sql.indexOf('\n);', start);
  assert.ok(start >= 0 && end > start, `${name} must be restated`);
  return sql.slice(start, end);
};

test('B9 · listing job photos: your own postings and reviews folders, and the folders of your jobs', () => {
  const read = policy('job_photos_read');
  assert.match(read, /\(storage\.foldername\(name\)\)\[1\] in \('postings', 'reviews'\)\s*and \(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/);
  assert.match(read, /j\.id::text = \(storage\.foldername\(objects\.name\)\)\[1\]\s*and \(j\.client_id = auth\.uid\(\) or j\.assigned_worker_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(read, /using \(\s*bucket_id = 'job-photos'\s*\);/, 'the bucket-wide read is gone');
});

test('B17 · completion files are added and removed only while the job is in progress', () => {
  const insert = policy('job_photos_insert');
  assert.match(insert, /\(storage\.foldername\(name\)\)\[1\] = 'postings'\s*and \(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/, 'the posting branch is unchanged');
  assert.match(insert, /j\.assigned_worker_id = auth\.uid\(\)\s*and j\.status = 'in_progress'/);
  assert.match(insert, /public\.is_active_user\(\)/);
  assert.match(policy('job_photos_delete_own_completion'), /j\.assigned_worker_id = auth\.uid\(\)\s*and j\.status = 'in_progress'/);
  assert.doesNotMatch(sql, /drop |rename |truncate|delete from|create policy/i, 'altered in place, names kept, nothing destructive');
});

test('B9 · a completion photo gets a name of its own, like postings and reviews', () => {
  const storage = read('lib/storage.ts');
  const fn = storage.slice(storage.indexOf('export async function uploadJobPhoto('), storage.indexOf('export async function deleteJobPhoto('));
  assert.ok(fn.length > 0);
  assert.match(fn, /const unique = `\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 8\)\}`;/);
  assert.match(fn, /return uploadAsset\(BUCKET, `\$\{jobId\}\/\$\{unique\}\.\$\{ext\}`, asset\);/);
  // The worker screen still uploads through it while the job is in progress.
  assert.match(read('screens/WorkerJobScreen.tsx'), /uploadJobPhoto\(params\.jobId, asset\)/);
});
