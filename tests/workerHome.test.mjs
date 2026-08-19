import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
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
  // Placement (4D-4 device pass): greeting row, then the hero headline,
  // then search, then the summary card that now carries the toggle.
  const greeting = screen.indexOf('styles.greetingRow');
  const hero = screen.indexOf('styles.heroBlock');
  const search = screen.indexOf('styles.searchField');
  const card = screen.indexOf('styles.summaryCard');
  assert.ok(greeting > 0 && hero > greeting && search > hero && card > search,
    'the search field must sit between the hero block and the summary card');
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

// ===========================================================================
// 4D-4 device pass — the approved worker-home anatomy (mockup 43), with the
// presence vocabulary still banned and the dark-palette defect resolved by
// construction: the summary card sits on surface with a gold hairline, so
// gold-family text can never land on a forest fill (gold in dark) here.
// ===========================================================================

test('the hero headline and subtitle render, second sentence on the GREEN accent', () => {
  assert.match(screen, /Get hired\./);
  assert.match(screen, /Get paid\./);
  assert.match(screen, /Grow your reputation\./);
  // The serif treatment is the customer Home headline's token usage,
  // mirrored: display face, 39/45, -0.3 tracking, ink.
  assert.match(code, /heroHeadline: \{\s*fontFamily: fonts\.display,\s*fontSize: 39,\s*lineHeight: 45,\s*fontWeight: '600',\s*letterSpacing: -0\.3,\s*color: colors\.ink,/);
  // The accent is emerald — the palette's green in BOTH modes — never
  // forest, which is the gold primary under Prestige.
  assert.match(code, /heroHeadlineAccent: \{ color: colors\.emerald \}/);
  // No illustration is invented, sourced, or referenced: the toolbox art
  // beside the mockup's headline is an operator asset.
  assert.doesNotMatch(code, /require\([^)]*\.(png|jpe?g|webp|gif)/);
  assert.doesNotMatch(code, /<Image\b|ImageBackground/);
});

test('the summary card: surface fill, gold hairline, divided halves, chips inside', () => {
  // Surface + gold border — the e195012 construction. Nothing on this
  // screen may fill with forest at all.
  assert.match(code, /summaryCard: \{[^}]*borderColor: colors\.gold/s);
  assert.match(code, /summaryCard: \{[^}]*backgroundColor: colors\.surface/s);
  assert.doesNotMatch(code, /backgroundColor: colors\.forest/);
  // The money figure is the green accent, the section label gold — both on
  // surface, both palette reads; money still formats only through
  // formatBudget().
  assert.match(code, /earningsAmount: \{[^}]*color: colors\.emerald/s);
  assert.match(code, /earningsEyebrow: \{[^}]*color: colors\.gold/s);
  assert.match(code, /formatBudget\(potential\.cents\)/);
  // The divided row: two halves split by a vertical divider.
  const order = ['styles.summaryRow', 'styles.availabilityHalf', 'styles.summaryDivider', 'styles.earningsHalf']
    .map((marker) => screen.indexOf(marker));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    'the summary row must hold availability, the divider, then earnings');
  // Both count chips sit INSIDE the summary card: walk the card's <View>
  // extent by tag balance and require the pill row before it closes.
  const open = screen.indexOf('<View style={styles.summaryCard}>');
  assert.ok(open > 0, 'the summary card container must exist');
  const tags = [...screen.slice(open).matchAll(/<View\b[^>]*\/>|<View\b|<\/View>/g)];
  let depth = 0;
  let end = -1;
  for (const tag of tags) {
    if (tag[0].endsWith('/>')) continue;
    depth += tag[0] === '</View>' ? -1 : 1;
    if (depth === 0) {
      end = open + tag.index;
      break;
    }
  }
  assert.ok(end > open, 'the summary card container must close');
  const pillRow = screen.indexOf('<View style={styles.pillRow}>');
  assert.ok(pillRow > open && pillRow < end, 'the count chips must render inside the summary card');
  assert.match(screen, /match your skills/);
  assert.match(screen, /within \$\{NEARBY_RADIUS_MILES\} miles|within \$\{NEARBY_RADIUS_MILES\}/);
});

test('the section heading reads Available Jobs with its feed dot; labels stay constrained', () => {
  assert.match(screen, /<Text style=\{styles\.sectionTitle\}>Available Jobs<\/Text>/);
  // The dot marks the jobs FEED and reads from the palette — it is not a
  // presence dot, and the availability half carries no dot at all.
  assert.match(code, /feedDot: \{[^}]*backgroundColor: colors\.emerald/s);
  const availabilityHalf = screen.slice(
    screen.indexOf('styles.availabilityHalf'),
    screen.indexOf('styles.summaryDivider')
  );
  assert.doesNotMatch(availabilityHalf, /[Dd]ot/);
  // The constrained labels hold: the control is Taking new work with its
  // exact explanatory line, and no visibility claim exists anywhere.
  assert.match(screen, /Taking new work/);
  assert.match(screen, /Shown on your public profile — it tells customers what to expect\./);
  assert.doesNotMatch(code, /Available now/i);
  assert.doesNotMatch(code, /visible to customers/i);
});

// ===========================================================================
// 4D-1b — one worker home. The LOCKED BrowseJobsScreen (atlas 48) stays on
// disk but is UNMOUNTED: no navigator registers it, nothing dispatches to it,
// and no landing value can resolve to it. T1–T7 are that contract.
// ===========================================================================

const SOURCE_DIRS = ['screens', 'components', 'lib', 'hooks', 'modes', 'ui', 'navigation'];
const sourceFiles = SOURCE_DIRS.flatMap((d) =>
  readdirSync(new URL(`../${d}`, import.meta.url), { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `${d}/${f.replace(/\\/g, '/')}`)
);

test('T1: the worker tree registers no route named BrowseJobs', () => {
  assert.doesNotMatch(workerRoot, /name="BrowseJobs"/);
  assert.doesNotMatch(workerRoot, /BrowseJobsScreen/);
});

test('T2+T3: nothing dispatches to BrowseJobs, and no landing value resolves to it', async () => {
  assert.ok(sourceFiles.length > 100, 'the source sweep must actually see the tree');
  const offenders = [];
  for (const file of sourceFiles) {
    const src = stripComments(await read(file));
    // T2 — every dispatch shape that has ever existed in this repo.
    if (/navigate\(\s*['"]BrowseJobs['"]/.test(src)) offenders.push(`${file}: navigate()`);
    if (/navigateAcrossTabs\([^)]*['"]BrowseJobs['"]/.test(src)) {
      offenders.push(`${file}: navigateAcrossTabs()`);
    }
    if (/screen:\s*['"]BrowseJobs['"]/.test(src)) offenders.push(`${file}: nested target`);
    // T3 — no landing-route, initial-route or mode-landing value. This is the
    // assertion that pins the reported wrong-landing symptom shut.
    if (/initialRouteName\s*=\s*["'{]?\s*["']BrowseJobs["']/.test(src)) {
      offenders.push(`${file}: initialRouteName`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('T3: landing decisions resolve modes, never route names', async () => {
  // A cold-start landing is a MODE (consumed by ModeProvider into
  // resolveInitialMode), not a navigation instruction — there is no route
  // name anywhere on that path for a stale screen to hide behind.
  const setupLanding = stripComments(await read('lib/setupLanding.ts'));
  assert.doesNotMatch(setupLanding, /navigate|BrowseJobs/);
  const types = await read('modes/types.ts');
  assert.match(types, /return landing === 'work' \? 'worker' : 'customer';/);
});

test('T4: the explicit initial route and declaration order agree — on WorkerHome', () => {
  const stripped = stripComments(workerRoot);
  const declared = stripped.match(/initialRouteName="([^"]+)"/);
  const firstRegistered = stripped.match(/<WorkerHomeStack\.Screen\s+name="([^"]+)"/);
  assert.ok(declared, 'the worker Home stack must declare initialRouteName');
  assert.ok(firstRegistered, 'the worker Home stack must register screens');
  // switchMode() mounts a TREE rather than resolving a route name
  // (ModeShell), so what a fresh worker mount lands on IS this stack's
  // initial route. The two values that could disagree — the explicit
  // contract and the declaration order — are compared, not hardcoded twice.
  assert.equal(declared[1], firstRegistered[1]);
  assert.equal(declared[1], 'WorkerHome');
  // …and Home is the worker tree's first tab, so the mount arrives here.
  assert.match(stripped, /<Tab\.Navigator[\s\S]*?<Tab\.Screen name="Home"/);
});

test('T5: WorkerResults mode:all is reachable from View all and from the Map header', async () => {
  assert.match(code, /navigation\.navigate\('WorkerResults', \{ mode: 'all' \}\)/);
  const map = stripComments(await read('screens/MapScreen.tsx'));
  assert.match(map, /mode === 'worker' \?/);
  assert.match(map, /navigateAcrossTabs\('Home', 'WorkerResults', \{ mode: 'all' \}\)/);
});

test('T6: one availability writer on the mounted worker surface — the server-side one', async () => {
  // The dashboard writes phase53 profiles.accepting_work through the
  // existing updateProfile() path; the device-local AsyncStorage hook has
  // exactly one consumer left — the locked, UNMOUNTED atlas-48 screen — so
  // no mounted surface can show a second, disagreeing availability truth.
  assert.match(code, /updateProfile\(user\.id, \{ accepting_work: next \}\)/);
  const users = [];
  for (const file of sourceFiles) {
    if (file === 'hooks/useWorkerAvailability.ts') continue;
    if (/useWorkerAvailability/.test(stripComments(await read(file)))) users.push(file);
  }
  assert.deepEqual(users.sort(), ['screens/BrowseJobsScreen.tsx']);
});

test('T7: the worker Home stack keeps its routes, in order, minus BrowseJobs', () => {
  const names = [
    ...stripComments(workerRoot).matchAll(/<WorkerHomeStack\.Screen\s+name="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.deepEqual(names, [
    'WorkerHome',
    'WorkerResults',
    'JobDetail',
    'SubmitBid',
    'BidSent',
    'Chat',
    'PostJob',
    'WorkerProfile',
    'ProfileReviews',
  ]);
});
