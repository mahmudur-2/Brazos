// 2026-09-30 (the build run, idea 5) — RUNNING LATE, ONE TAP: the hired worker's 10 / 20 / 30 min
// chips, inside the progress card, tell the customer and move the arrival time until they arrive.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LATE_CHOICES, clockLabel, lateShiftMinutes, movedWindow } from '../lib/runningLate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

test('[executed] the window moves by the last tap, and only until the worker arrives', () => {
  assert.deepEqual([...LATE_CHOICES], [10, 20, 30]);
  assert.equal(lateShiftMinutes({ late_minutes: 20 }), 20);
  assert.equal(lateShiftMinutes({ late_minutes: 20, arrived_at: '2026-09-30T18:25:00Z' }), 0, 'arrived: history again');
  assert.equal(lateShiftMinutes({ late_minutes: 15 }), 0, 'a value outside the chips moves nothing');
  assert.equal(lateShiftMinutes({}), 0);
  assert.equal(clockLabel(18 * 60 + 20), '6:20 PM');
  assert.equal(clockLabel(6 * 60), '6 AM');
  assert.equal(clockLabel(24 * 60 + 20), '12:20 AM', 'past midnight wraps');
  assert.equal(movedWindow(18, 20, 20), '6:20–8:20 PM');
  assert.equal(movedWindow(11, 14, 30), '11:30 AM–2:30 PM');
  assert.equal(movedWindow(18, 20, 20, false), '6:20 PM–8:20 PM');
});

test('[static] both window labels move through the one rule — the live bar and card, and the job pages', () => {
  // lib/liveJobStatus.ts is read, not loaded (it imports siblings node cannot resolve bare); the
  // label on the job pages is executed in tests/stage4dInvariants.test.mjs beside lib/runningLate.ts.
  const live = flat(read('lib/liveJobStatus.ts'));
  assert.match(live, /const shift = lateShiftMinutes\(job\);/);
  assert.match(live, /window = movedWindow\(job\.arrival_start_hour, job\.arrival_end_hour, shift\);/);
  assert.match(live, /\} else if \(shift\) \{ \/\/ A flexible day has no window to move, so the delay is said instead\. window = `\$\{shift\} min late`;/);
  const jobs = flat(read('lib/jobs.ts'));
  assert.match(jobs, /\? movedWindow\(job\.arrival_start_hour, job\.arrival_end_hour, shift, false\)/);
});

test('[static] the server: one writer for the hired worker before arriving, one push to the customer', () => {
  const sql = read('supabase/migrations/20260930000700_running_late.sql');
  assert.match(sql, /add constraint jobs_late_minutes_known check \(late_minutes is null or late_minutes in \(10, 20, 30\)\);/);
  assert.match(sql, /if not found or v_job\.assigned_worker_id is distinct from v_user then/);
  assert.match(sql, /if v_job\.status <> 'assigned' or v_job\.arrived_at is not null then/);
  assert.match(sql, /'job_updates',\s*'job_running_late',/);
  assert.match(sql, /'job_running_late:' \|\| v_job\.id::text \|\| ':' \|\| p_minutes::text/);
  assert.match(sql, /revoke all on function public\.report_running_late\(uuid, integer\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.report_running_late\(uuid, integer\) to authenticated;/);
  assert.doesNotMatch(sql, /set status|assigned_worker_id =/, 'status and assignment are not this function\'s');
  assert.match(read('supabase/tests/040_authz.sql'), /report_running_late, respond_job_request/, 'the authz roster names it');
});

test('[static] the app: the three chips inside the progress card, before arriving, once the payment is held', () => {
  const jobs = read('lib/jobs.ts');
  assert.match(jobs, /\.rpc\('report_running_late', \{ p_job_id: jobId, p_minutes: minutes \}\)/);
  assert.match(jobs, /en_route_at, arrived_at, late_minutes, late_reported_at, completed_at`;/);
  const screen = flat(read('screens/WorkerJobScreen.tsx'));
  assert.match(screen, /\{job\.status === 'assigned' && !job\.arrived_at && !awaitingProtection \? \( <View style=\{styles\.lateBlock\}>/);
  // The words sit over the chips, so the told line and the chosen check never push a chip down.
  assert.match(screen, /'Running late\?'\} <\/Text> <View style=\{styles\.lateRow\}>/);
  assert.match(screen, /\{job\.late_minutes != null \? `\$\{clientFirstName\} was told ✓` : 'Running late\?'\}/);
  assert.match(screen, /\{LATE_CHOICES\.map\(\(minutes\) => \( <Chip key=\{minutes\} label=\{`\$\{minutes\} min`\}/);
  assert.match(screen, /selected=\{job\.late_minutes === minutes\}/);
});
