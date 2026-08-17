import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * Stage 4D batch 1a — the new Worker Home dashboard.
 *
 * What must stay true:
 *   1. The worker Home stack roots at WorkerHome; the LOCKED BrowseJobsScreen
 *      (atlas 48) stays mounted after it, unmodified, as "View all".
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

test('WorkerHome roots the worker stack and BrowseJobs is its View all', () => {
  // Registration order in the stack: WorkerHome first, the locked feed second.
  const home = workerRoot.indexOf('name="WorkerHome" component={WorkerHomeScreen}');
  const browse = workerRoot.indexOf('name="BrowseJobs" component={BrowseJobsScreen}');
  assert.ok(home > 0, 'WorkerHome must be registered');
  assert.ok(browse > home, 'BrowseJobs must stay mounted right after WorkerHome');
  // The View all action lands on the locked screen.
  assert.match(code, /navigation\.navigate\('BrowseJobs'\)/);
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
