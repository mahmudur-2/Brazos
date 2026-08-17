import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * Stage 4D batch 1a — the new Worker Home dashboard.
 *
 * What must stay true:
 *   1. The worker Home stack roots at WorkerHome — explicitly, via
 *      initialRouteName — and every job-list intent lands on WorkerResults.
 *   2. The taking-new-work toggle is the phase53 profiles.accepting_work
 *      field through the existing updateProfile() path — AVAILABILITY, not
 *      presence. The words "online"/"offline"/"live" never appear: that is
 *      the device-local useWorkerAvailability vocabulary, which this screen
 *      deliberately does not use.
 *   3. Every figure comes from an existing source: openJobsPotential() from
 *      lib/earningsMath.ts, jobMatchesSkills() for the skill count, phase41's
 *      jobs_within_radius (via lib/hotspots) for the nearby count — the same
 *      sources the locked screen's own pills use.
 *   4. Mode changes only through switchMode(); the screen never drives the
 *      transition overlay itself.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const screen = await read('screens/WorkerHomeScreen.tsx');
const workerRoot = await read('navigation/WorkerRoot.tsx');
const code = stripComments(screen);

test('WorkerHome roots the worker stack and View all lands on WorkerResults', () => {
  const home = workerRoot.indexOf('name="WorkerHome" component={WorkerHomeScreen}');
  assert.ok(home > 0, 'WorkerHome must be registered');
  // 4D-1b D6: the landing route is an explicit contract, not a side effect
  // of declaration order.
  assert.match(workerRoot, /initialRouteName="WorkerHome"/);
  // Every job-list intent resolves to the one list surface.
  assert.match(code, /navigation\.navigate\('WorkerResults', \{ mode: 'all' \}\)/);
});

test("the search field mirrors the locked 48's dispatch and sits above the toggle", () => {
  // 4D-1b D2: the one route to WorkerResults mode 'search', byte-for-byte
  // the locked screen's own param shape — trim first, never dispatch empty.
  assert.match(code, /const trimmed = query\.trim\(\);/);
  assert.match(code, /if \(!trimmed\) return;/);
  assert.match(
    code,
    /navigation\.navigate\('WorkerResults', \{ mode: 'search', query: trimmed \}\)/
  );
  assert.match(screen, /placeholder="Search for jobs or areas"/);
  // Placement: directly below the greeting/switch row, above the
  // taking-new-work card.
  const greeting = screen.indexOf('styles.greetingRow');
  const search = screen.indexOf('styles.searchField');
  const toggle = screen.indexOf('styles.availabilityCard');
  assert.ok(greeting > 0 && search > greeting && toggle > search,
    'the search field must sit between the greeting row and the availability card');
});

test('the toggle is phase53 accepting_work through the existing profile path', () => {
  assert.match(code, /profile\?\.accepting_work \?\? true/);
  assert.match(code, /updateProfile\(user\.id, \{ accepting_work: next \}\)/);
  // Availability, never presence: the device-local online/offline hook and its
  // vocabulary must not appear here.
  assert.doesNotMatch(code, /useWorkerAvailability/);
  assert.doesNotMatch(code, /\b[Oo]nline\b|\b[Oo]ffline\b|\b[Ll]ive\b/);
  assert.match(screen, /Taking new work/);
});

test('every figure derives from an existing source, none is invented', () => {
  assert.match(code, /openJobsPotential\(jobs, profile\?\.id\)/);
  assert.match(code, /jobMatchesSkills\(job, myCategories\)/);
  assert.match(code, /fetchJobsWithinRadius\(/);
  assert.match(code, /NEARBY_RADIUS_MILES/);
  // The nearby check never prompts on mount — permission is only read.
  assert.match(code, /getForegroundPermissionsAsync\(\)/);
  // No placeholder marketplace data: the skill pill degrades to an honest
  // instruction, not a fake count.
  assert.match(screen, /Add skills to see matches/);
});

test('mode changes only through switchMode(), and layout follows the tab rules', () => {
  assert.match(code, /void switchMode\('customer'\)/);
  assert.doesNotMatch(code, /useModeTransition/);
  assert.match(code, /edges=\{\['top'\]\}/);
  assert.match(screen, /paddingBottom: 0/);
});
