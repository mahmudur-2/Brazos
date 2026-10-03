import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fix run, group F (built better) — the source fences for the F items.
 * Each test names the item it holds.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');

test('[static] F2: the boot path never statically imports the design studio or the catalog', () => {
  const boot = {
    'navigation/ModeShell.tsx': /components\/DesignStudioPanel/,
    'App.tsx': /dev-tools\/HomeDesignStudio/,
    'navigation/sharedStacks.tsx': /dev-tools\/ComponentCatalog/,
  };
  for (const [file, module] of Object.entries(boot)) {
    const src = strip(read(file));
    const statics = src.split('\n').filter((line) => /^\s*import\b/.test(line) && module.test(line));
    assert.deepEqual(statics, [], `${file} must not import ${module} at module scope`);
    assert.match(src, new RegExp(`require\\('[./]*${module.source}'\\)`), `${file} requires it lazily`);
  }
  // Each lazy require sits behind its own gate.
  assert.match(
    strip(read('navigation/ModeShell.tsx')),
    /const DesignStudioPanel = designStudioAvailable\s*\?\s*\(require\('\.\.\/components\/DesignStudioPanel'\)/,
  );
  assert.match(
    strip(read('App.tsx')),
    /const HomeDesignStudio = SHOW_HOME_DESIGN_STUDIO\s*\?\s*\(require\('\.\/dev-tools\/HomeDesignStudio'\)/,
  );
  assert.match(
    strip(read('navigation/sharedStacks.tsx')),
    /function ComponentCatalog\(\) \{\s*const \{ ComponentCatalog: Catalog \} =\s*require\('\.\.\/dev-tools\/ComponentCatalog'\)/,
  );
  assert.match(
    strip(read('navigation/sharedStacks.tsx')),
    /\{__DEV__ \? \(\s*<ProfileStack\.Screen name="ComponentCatalog" component=\{ComponentCatalog\} \/>/,
  );
});

test('[static] F18: the shell ground re-renders only its own view, and PostJob builds its dates once a day', () => {
  const shell = strip(read('navigation/ModeShell.tsx'));
  const modeShell = shell.slice(shell.indexOf('export function ModeShell()'), shell.indexOf('function ShellGroundView('));
  assert.ok(modeShell.length > 0, 'ModeShell precedes ShellGroundView');
  assert.doesNotMatch(modeShell, /useShellGroundState\(/, 'ModeShell holds no ground state');
  assert.match(shell, /function ShellGroundView\(\{ children \}: PropsWithChildren\) \{[\s\S]*?useShellGroundState\(\)/);
  assert.match(modeShell, /<ShellGroundView>\s*\{treeMode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>\}/);

  const post = strip(read('screens/PostJobScreen.tsx'));
  assert.match(post, /const dayKey = toLocalIsoDate\(new Date\(\)\);\s*const scheduleDates = useMemo\(upcomingDates, \[dayKey\]\);/);
  assert.doesNotMatch(post, /const scheduleDates = upcomingDates\(\)/);
});

test('[static] F24: the completed count names its unit, ReviewSection takes no prompt, the orphan bar tokens are gone', () => {
  assert.match(strip(read('screens/ProfileDetailsScreen.tsx')), /\{completed\} \{completed === 1 \? 'job' : 'jobs'\} completed/);
  const section = strip(read('components/ReviewSection.tsx'));
  assert.doesNotMatch(section, /\bprompt\??:/, 'the dead prop is gone from the props type');
  assert.match(section, /Thanks for rating \{revieweeFirstName\}\./);
  assert.match(section, /placeholder=\{`Share how it went with \$\{revieweeFirstName\}…`\}/);
  for (const host of ['screens/ClientJobDetailScreen.tsx', 'screens/ReviewAndTipScreen.tsx', 'screens/WorkerJobScreen.tsx']) {
    const src = strip(read(host));
    const block = src.slice(src.indexOf('<ReviewSection'));
    assert.doesNotMatch(block.slice(0, block.indexOf('/>')), /\bprompt=/, `${host} passes no prompt`);
  }
  const tokens = strip(read('ui/tokens.ts'));
  const bar = tokens.slice(tokens.indexOf('export const navBar = {'));
  assert.doesNotMatch(bar.slice(0, bar.indexOf('\n} as const;')), /\n\s*(gold|glyphColorDark):/);
});

// ---------------------------------------------------------------------------
// F19 — one date formatter. lib/time.ts imports nothing, so it loads from its
// file URL; the formatters run against fixed dates and a fixed "now".
// ---------------------------------------------------------------------------
const time = await import(new URL('../lib/time.ts', import.meta.url).href);

test('F19: formatDay and formatShortDay print one shape, with the year only when it is another one', () => {
  const now = new Date(2026, 9, 3, 12);
  assert.equal(time.formatDay(new Date(2026, 8, 30), { now }), 'Wed, Sep 30');
  assert.equal(time.formatDay(new Date(2025, 8, 30), { now }), 'Tue, Sep 30, 2025');
  assert.equal(time.formatShortDay(new Date(2026, 8, 30), { now }), 'Sep 30');
  assert.equal(time.formatShortDay(new Date(2027, 0, 4), { now }), 'Jan 4, 2027');
  assert.equal(time.formatWeekday(new Date(2026, 8, 30)), 'Wed');
  assert.equal(time.formatMonthYear(new Date(2026, 7, 15)), 'Aug 2026');
  assert.equal(time.formatClock(new Date(2026, 8, 30, 9, 30)), '9:30 AM');
  assert.equal(time.formatClock(new Date(2026, 8, 30, 21, 5)), '9:05 PM');
  // An unparseable date prints nothing, never "Invalid Date".
  assert.equal(time.formatDay(new Date('nope')), '');
  assert.equal(time.formatClock(new Date('nope')), '');
});

test('F19: a day key is read in the local calendar, and a bad key is null', () => {
  const now = new Date(2026, 9, 3);
  assert.equal(time.formatDayKey('2026-08-12', { now }), 'Wed, Aug 12');
  assert.equal(time.dateOfDayKey('2026-08-12').getDate(), 12, 'never shifted a day west of UTC');
  assert.equal(time.formatDayKey('not-a-date'), null);
  assert.equal(time.formatDayKey(null), null);
});

test('F19: a time zone moves the day and the year rule with it', () => {
  // 02:30 UTC on Jan 1 2027 is still Dec 31 2026 in New York.
  const instant = new Date(Date.UTC(2027, 0, 1, 2, 30));
  const now = new Date(Date.UTC(2026, 11, 31, 18));
  assert.equal(time.formatDay(instant, { timeZone: 'America/New_York', now }), 'Thu, Dec 31');
  assert.equal(time.formatClock(instant, { timeZone: 'America/New_York' }), '9:30 PM');
});

test('F19: the inbox stamp and the relative age fall back to the shared shapes', () => {
  const now = new Date(2026, 9, 3, 12).getTime();
  assert.equal(time.formatInboxStamp(new Date(2026, 8, 30, 12).toISOString(), now), 'Wed');
  assert.equal(time.formatInboxStamp(new Date(2026, 8, 12, 12).toISOString(), now), 'Sep 12');
  assert.equal(time.formatInboxStamp(new Date(2025, 8, 12, 12).toISOString(), now), '9/12/25');
});

test('[static] F19: no date or clock is formatted outside lib/time.ts', () => {
  const files = execFileSync('git', ['ls-files', '--', '*.ts', '*.tsx'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('supabase/') && !/\.web\.tsx?$/.test(f) && f !== 'lib/time.ts');
  // lib/repeatJobs.ts imports nothing by its own fence (tests/jobSeries.test.mjs), so it spells formatDay's shape itself.
  const EXEMPT = new Set(['lib/repeatJobs.ts']);
  const offenders = files.filter((f) => !EXEMPT.has(f) && /\.toLocale(Date|Time)String\(/.test(strip(read(f))));
  assert.deepEqual(offenders, [], 'format a day or a clock through lib/time.ts');
  assert.equal((strip(read('lib/repeatJobs.ts')).match(/\.toLocaleDateString\(/g) ?? []).length, 1);
});

// ---------------------------------------------------------------------------
// F6 — one rule set. lib/jobLifecycle.ts's imports are type-only, so it loads
// from its file URL.
// ---------------------------------------------------------------------------
const lifecycle = await import(new URL('../lib/jobLifecycle.ts', import.meta.url).href);

test('F6: nextWorkerStep — nothing on the trip before held, and the trip is optional once held', () => {
  const { nextWorkerStep } = lifecycle;
  const at = '2026-10-03T15:00:00Z';
  const rows = [
    // [job, held, step]
    [{ status: 'open' }, true, null],
    [{ status: 'completed' }, true, null],
    [{ status: 'cancelled' }, true, null],
    [{ status: 'assigned' }, false, 'message'],
    [{ status: 'assigned', en_route_at: at }, false, 'message'],
    [{ status: 'assigned', en_route_at: at, arrived_at: at }, false, 'message'], // arrived but unpaid
    [{ status: 'assigned' }, true, 'en_route'],
    [{ status: 'assigned', en_route_at: at }, true, 'arrived'],
    [{ status: 'assigned', arrived_at: at }, true, 'start'],
    [{ status: 'assigned', en_route_at: at, arrived_at: at }, true, 'start'],
    [{ status: 'in_progress' }, true, 'complete'],
  ];
  for (const [job, held, step] of rows) {
    assert.equal(nextWorkerStep({ job, held }), step, `${JSON.stringify(job)} held=${held}`);
  }
});

test('F6: isLiveJob is assigned or in progress, and nothing else', () => {
  const { isLiveJob, LIVE_JOB_STATUSES } = lifecycle;
  assert.deepEqual([...LIVE_JOB_STATUSES], ['assigned', 'in_progress']);
  for (const status of ['assigned', 'in_progress']) assert.equal(isLiveJob({ status }), true);
  for (const status of ['draft', 'open', 'completed', 'cancelled', '', null, undefined]) assert.equal(isLiveJob({ status }), false);
  assert.equal(isLiveJob(null), false);
});

test('[static] F6: no screen re-decides "held" or "live" inline', () => {
  const screens = execFileSync('git', ['ls-files', '--', 'screens/*.tsx', 'components/*.tsx'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !/\.web\.tsx$/.test(f));
  const heldInline = [];
  const liveInline = [];
  for (const file of screens) {
    const src = strip(read(file));
    if (/\.status === 'held'/.test(src)) heldInline.push(file);
    // The exact live pair. Checkout's three-status gate (assigned, in progress, completed) is the
    // phase58 fundable set, a different rule fenced in tests/fundingPath.test.mjs.
    if (/status === 'assigned' \|\| [\w?.]*status === 'in_progress'\)|status !== 'assigned' && [\w?.]*status !== 'in_progress'\)/.test(src)) liveInline.push(file);
  }
  assert.deepEqual(heldInline, [], 'read isHeld / isReleased / isReleaseRequested (lib/paymentRules.ts)');
  assert.deepEqual(liveInline, [], 'read isLiveJob (lib/jobLifecycle.ts)');
});
