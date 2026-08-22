import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 4D-2 — worker discovery. Batch B1: the map rebuild.
 *
 * lib/mapClustering.ts is pure (no React, no React Native) and is EXECUTED
 * here directly, the lib/conversationResolver.ts pattern. Screen and map
 * wiring that node cannot render is pinned against source, marked [static].
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const clusteringUrl = pathToFileURL(join(root, 'lib/mapClustering.ts')).href;
const { clusterPoints } = await import(clusteringUrl);

// One hotspot-cell-like point. 0.0039° lat ≈ the 0.27mi cell spacing.
const pt = (id, lat, lng, count = 1) => ({ id, lat, lng, count });

// ---------------------------------------------------------------------------
// B1 — grid clustering, executed
// ---------------------------------------------------------------------------

test('B1 · empty input clusters to no pins', () => {
  assert.deepEqual(clusterPoints([], { latDelta: 0.08 }), []);
});

test('B1 · zoomed out, adjacent cells merge into one pin whose count is the sum', () => {
  const points = [
    pt('a', 40.65, -73.95, 3),
    pt('b', 40.6539, -73.95, 2),
    pt('c', 40.65, -73.9451, 4),
  ];
  // 0.32° span / 8 divisions = 0.04° buckets — all three fall together.
  const pins = clusterPoints(points, { latDelta: 0.32 });
  assert.equal(pins.length, 1);
  assert.equal(pins[0].count, 9);
  assert.equal(pins[0].members.length, 3);
});

test('B1 · zoomed in, the same cells split into separate pins', () => {
  const points = [
    pt('a', 40.65, -73.95, 3),
    pt('b', 40.6539, -73.95, 2),
    pt('c', 40.65, -73.9451, 4),
  ];
  // 0.02° span / 8 divisions = 0.0025° buckets — finer than the cell spacing.
  const pins = clusterPoints(points, { latDelta: 0.02 });
  assert.equal(pins.length, 3);
  assert.deepEqual(
    pins.map((p) => p.count).sort((a, b) => a - b),
    [2, 3, 4]
  );
});

test('B1 · a merged pin sits at the count-weighted centroid of its members', () => {
  const pins = clusterPoints(
    [pt('a', 40.0, -73.0, 1), pt('b', 40.004, -73.0, 3)],
    { latDelta: 0.32 }
  );
  assert.equal(pins.length, 1);
  // (40.0·1 + 40.004·3) / 4 = 40.003 — pulled toward the heavier cell.
  assert.ok(Math.abs(pins[0].lat - 40.003) < 1e-9);
  assert.equal(pins[0].lng, -73.0);
});

test('B1 · output is deterministic and independent of input order', () => {
  const points = [
    pt('a', 40.65, -73.95, 3),
    pt('b', 40.6539, -73.95, 2),
    pt('c', 40.7, -73.9, 5),
    pt('d', 40.71, -73.91, 1),
  ];
  const forward = clusterPoints(points, { latDelta: 0.08 });
  const reversed = clusterPoints([...points].reverse(), { latDelta: 0.08 });
  assert.deepEqual(forward, reversed);
  // Pins arrive sorted by grid key; members sorted by id.
  assert.deepEqual(
    forward.map((p) => p.key),
    [...forward.map((p) => p.key)].sort()
  );
  for (const pin of forward) {
    assert.deepEqual(
      pin.members.map((m) => m.id),
      [...pin.members.map((m) => m.id)].sort()
    );
  }
});

test('B1 · a degenerate zoom delta cannot divide by zero or merge the whole city', () => {
  const points = [pt('a', 40.65, -73.95, 1), pt('b', 40.75, -73.85, 1)];
  const pins = clusterPoints(points, { latDelta: 0 });
  // The floor guard makes buckets finer than cell spacing — both points survive.
  assert.equal(pins.length, 2);
  for (const pin of pins) assert.ok(Number.isFinite(pin.lat) && Number.isFinite(pin.lng));
});

test('B1 · the clustering module is pure — no React, no React Native imports', async () => {
  const source = await read('lib/mapClustering.ts');
  assert.doesNotMatch(source, /from 'react/);
  assert.doesNotMatch(source, /from "react/);
  assert.doesNotMatch(source, /import .*supabase/);
});

// ---------------------------------------------------------------------------
// B1 — map wiring, pinned
// ---------------------------------------------------------------------------

test('[static] B1 · the native map renders pins when provided and suppresses the glow', async () => {
  const map = await read('components/HotspotMap.native.tsx');
  assert.match(map, /pins !== undefined\s*\?\s*pins\.map/);
  assert.match(map, /: cells\.flatMap/);
  assert.match(map, /Marker/);
  assert.match(map, /onSelectPin\?\.\(pin\)/);
  // emerald D9 wrapped this so the last region survives the theme-keyed
  // remount, but the caller's handler must still be called with the region it
  // always was — asserted here rather than just "the prop is present".
  assert.match(map, /onRegionChangeComplete=\{\(region\) => \{/);
  assert.match(map, /regionRef\.current = region;/);
  assert.match(map, /onRegionChangeComplete\?\.\(region\);/);
  // Pin badges are Text counts, not icon glyphs — safe with
  // tracksViewChanges={false} (no icon-font capture race).
  assert.match(map, /tracksViewChanges={false}/);
  assert.match(map, /{pin\.count}/);
});

test('[static] B1 · MapScreen: worker mode clusters cells into pins and opens the card sheet; customer keeps the glow drill-down', async () => {
  const screen = await read('screens/MapScreen.tsx');
  // Worker path: cluster → pin → sheet of WorkerJobCards → JobDetail in-stack.
  assert.match(screen, /clusterPoints\(/);
  assert.match(screen, /latDelta/);
  assert.match(screen, /onSelectPin={setActivePin}/);
  assert.match(screen, /fetchOpenJobsInCells\(memberCells\)/);
  assert.match(screen, /WorkerJobCard/);
  assert.match(screen, /navigation\.navigate\('JobDetail', { job }\)/);
  // Customer path untouched: glow cells still drill into CellJobs.
  assert.match(screen, /navigation\.navigate\('CellJobs'/);
  assert.match(screen, /const isWorker = mode === 'worker';/);
  // 4D-4: the map screen is themed now — resolved palette for chrome, tiles
  // follow via HotspotMap.native; the WEB map file itself stays frozen.
  assert.match(screen, /backgroundColor: colors\.background/);
  assert.match(screen, /useThemeColors/);
});

test('[static] B1 · the shared props stay optional so the frozen web map ignores them', async () => {
  const hotspots = await read('lib/hotspots.ts');
  assert.match(hotspots, /pins\?: ClusterPin\[\];/);
  assert.match(hotspots, /onSelectPin\?:/);
  assert.match(hotspots, /onRegionChangeComplete\?:/);
  assert.match(hotspots, /onUserLocation\?:/);
  // The frozen web implementation is byte-untouched by 4D-2 — it must not
  // even mention the new props.
  const webMap = await read('components/HotspotMap.web.tsx');
  assert.doesNotMatch(webMap, /onSelectPin|onRegionChangeComplete|onUserLocation/);
});

// ---------------------------------------------------------------------------
// B3 — the distance filter rules, executed
// ---------------------------------------------------------------------------

const discoveryFilterUrl = pathToFileURL(join(root, 'lib/discoveryFilter.ts')).href;
const {
  DISTANCE_FILTER_OPTIONS,
  coerceStoredDistanceFilter,
  distanceChipLabel,
  distanceFilterStorageKey,
  encodeDistanceFilter,
  formatDistanceMiles,
} = await import(discoveryFilterUrl);

test('B3 · storage round-trips every option, including Any', () => {
  assert.equal(coerceStoredDistanceFilter(encodeDistanceFilter(null)), null);
  for (const option of DISTANCE_FILTER_OPTIONS) {
    assert.equal(coerceStoredDistanceFilter(encodeDistanceFilter(option)), option);
  }
});

test('B3 · unrecognized stored values coerce to Any, never to a fake radius', () => {
  assert.equal(coerceStoredDistanceFilter(null), null);
  assert.equal(coerceStoredDistanceFilter(''), null);
  assert.equal(coerceStoredDistanceFilter('7'), null);
  assert.equal(coerceStoredDistanceFilter('NaN'), null);
  assert.equal(coerceStoredDistanceFilter('25mi'), null);
  assert.equal(coerceStoredDistanceFilter('-5'), null);
});

test('B3 · the storage key is per-account and versioned', () => {
  assert.equal(distanceFilterStorageKey('u1'), 'brazos.discovery.distance.v1.u1');
  assert.notEqual(distanceFilterStorageKey('u1'), distanceFilterStorageKey('u2'));
});

test('B3 · chip labels and distance formatting', () => {
  assert.equal(distanceChipLabel(null), 'Any distance');
  assert.equal(distanceChipLabel(5), '5 mi');
  // Half-mile-snapped server values render without invented precision.
  assert.equal(formatDistanceMiles(0.5), '0.5 mi away');
  assert.equal(formatDistanceMiles(2), '2 mi away');
  assert.equal(formatDistanceMiles(2.5), '2.5 mi away');
  assert.equal(formatDistanceMiles(10), '10 mi away');
});

test('B3 · the storage half follows the modeStorage pattern: AsyncStorage, best-effort, per-account key', async () => {
  const storage = stripComments(await read('lib/discoveryFilterStorage.ts'));
  assert.match(storage, /@react-native-async-storage\/async-storage/);
  assert.doesNotMatch(storage, /SecureStore/i);
  assert.match(storage, /distanceFilterStorageKey\(userId\)/);
  assert.match(storage, /catch/);
});

// ---------------------------------------------------------------------------
// B2 + B3 — cards and screens, pinned
// ---------------------------------------------------------------------------

test('[static] B2 · the full worker card carries distance and the arrival window, unknown renders nothing', async () => {
  const card = await read('components/WorkerJobCard.tsx');
  // Distance renders only from a real number (the server-computed
  // distance_miles); null/undefined renders no row at all.
  assert.match(card, /typeof distanceMiles === 'number'/);
  assert.match(card, /formatDistanceMiles\(distanceMiles\)/);
  // The arrival window comes from the ONE shared formatter in lib/jobs.ts —
  // no second derivation of the window label.
  assert.match(card, /arrivalWindowLabel\(job\)/);
  assert.doesNotMatch(card, /formatHour/);
  // Both are full-variant rows: the compact Home card keeps the locked
  // reference's exact field list.
  assert.match(card, /variant === 'full' && typeof distanceMiles === 'number'/);
  assert.match(card, /variant === 'full' && arrivalWindowLabel\(job\)/);
});

test('[static] B2 · the no-photo state is the category-glyph tile, never stock imagery', async () => {
  const card = await read('components/WorkerJobCard.tsx');
  assert.match(card, /thumbFallback/);
  assert.match(card, /categoryAccent\(job\.category\)/);
  assert.match(card, /onError=\{\(\) => setImageFailed\(true\)\}/);
  // No remote placeholder/stock fallback URL anywhere in the card.
  assert.doesNotMatch(stripComments(card), /https?:\/\//);
});

test('[static] B3 · both discovery surfaces render the shared chips and persist through the one storage module', async () => {
  const [results, map, chips] = await Promise.all([
    read('screens/WorkerResultsScreen.tsx'),
    read('screens/MapScreen.tsx'),
    read('components/DistanceChips.tsx'),
  ]);
  for (const screen of [results, map]) {
    assert.match(screen, /<DistanceChips/);
    assert.match(screen, /readDistanceFilter\(userId\)/);
    assert.match(screen, /writeDistanceFilter\(userId, next\)/);
  }
  // One chip control, one filter vocabulary.
  assert.match(chips, /DISTANCE_FILTER_OPTIONS/);
  assert.match(chips, /distanceChipLabel/);
});

// ---------------------------------------------------------------------------
// B5 — deterministic match reasons, executed
// ---------------------------------------------------------------------------

// matchReasons has VALUE imports from two sibling lib modules; node's ESM
// loader resolves runtime specifiers literally (no extension inference), so
// the conversion.test.mjs pattern applies: strip types, rewrite the two
// relative specifiers to absolute file URLs (both targets execute directly —
// their own imports are type-only), and import as a data URL.
const { stripTypeScriptTypes } = await import('node:module');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
const { deriveMatchReasons } = await (async () => {
  const js = stripTypeScriptTypes(await read('lib/matchReasons.ts'), { mode: 'strip' })
    .replace(
      "from './jobFilters'",
      `from '${pathToFileURL(join(root, 'lib/jobFilters.ts')).href}'`
    )
    .replace(
      "from './discoveryFilter'",
      `from '${pathToFileURL(join(root, 'lib/discoveryFilter.ts')).href}'`
    );
  assert.ok(!js.includes("from './"), 'every relative import must be rewritten');
  return import(toDataUrl(js));
})();

const reasonInput = (overrides = {}) => ({
  job: {
    category: 'cleaning',
    budget_cents: 10000,
    budget_min_cents: null,
    budget_max_cents: null,
    ...(overrides.job ?? {}),
  },
  workerCategories: ['cleaning', 'moving'],
  distanceMiles: 2,
  radiusMiles: 5,
  listedFlatPriceCents: 8000,
  ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'job')),
});

test('B5 · all three reasons hold on matching known facts, in fixed order', () => {
  const reasons = deriveMatchReasons(reasonInput());
  assert.deepEqual(
    reasons.map((r) => r.key),
    ['category', 'distance', 'budget']
  );
  assert.deepEqual(
    reasons.map((r) => r.label),
    ['Matches your skills', 'Within 5 miles', 'Budget covers your listed price']
  );
});

test('B5 · unknown facts yield NOTHING — never a guess, never a negative', () => {
  // Profile categories not loaded yet ≠ no categories.
  assert.deepEqual(
    deriveMatchReasons(reasonInput({ workerCategories: null, distanceMiles: null, listedFlatPriceCents: null })),
    []
  );
  // Known-but-unmet facts also yield nothing (no ✗ badges).
  assert.deepEqual(
    deriveMatchReasons(
      reasonInput({
        workerCategories: ['moving'],
        distanceMiles: 9,
        listedFlatPriceCents: 20000,
        job: { category: 'cleaning', budget_cents: 10000 },
      })
    ),
    []
  );
});

test('B5 · the distance threshold is the radius filter, falling back to the 5-mile nearby promise', () => {
  const withFilter = deriveMatchReasons(reasonInput({ radiusMiles: 10, distanceMiles: 8 }));
  assert.ok(withFilter.some((r) => r.key === 'distance' && r.label === 'Within 10 miles'));
  const anyFilter = deriveMatchReasons(reasonInput({ radiusMiles: null, distanceMiles: 4.5 }));
  assert.ok(anyFilter.some((r) => r.key === 'distance' && r.label === 'Within 5 miles'));
  assert.ok(
    !deriveMatchReasons(reasonInput({ radiusMiles: null, distanceMiles: 6 })).some(
      (r) => r.key === 'distance'
    )
  );
});

test('B5 · the budget reason compares against the SAME ceiling rule the feed filter uses', () => {
  // Range: ceiling is the max.
  const range = deriveMatchReasons(
    reasonInput({
      job: { category: 'cleaning', budget_cents: null, budget_min_cents: 4000, budget_max_cents: 9000 },
      listedFlatPriceCents: 8500,
    })
  );
  assert.ok(range.some((r) => r.key === 'budget'));
  // No stated budget at all: unknown, no claim either way.
  const open = deriveMatchReasons(
    reasonInput({
      job: { category: 'cleaning', budget_cents: null, budget_min_cents: null, budget_max_cents: null },
    })
  );
  assert.ok(!open.some((r) => r.key === 'budget'));
  // Exact equality counts as covered.
  const exact = deriveMatchReasons(reasonInput({ listedFlatPriceCents: 10000 }));
  assert.ok(exact.some((r) => r.key === 'budget'));
});

test('B5 · no percentages, no scores, no ranking language in the module code or labels', async () => {
  // Comment-stripped: the docblock legitimately STATES the ban; the code and
  // the rendered labels are what must never carry the vocabulary.
  const source = stripComments(await read('lib/matchReasons.ts')).toLowerCase();
  assert.ok(!source.includes('%'));
  assert.ok(!/\bscor|\brank|percent|best fit/.test(source));
});

// ---------------------------------------------------------------------------
// B4 + B5 — market job detail, pinned
// ---------------------------------------------------------------------------

test('[static] B4 · the scope of work renders directly under the title, above the logistics rows', async () => {
  const detail = await read('screens/JobDetailScreen.tsx');
  const title = detail.indexOf('<Text style={styles.title}>{job.title}</Text>');
  const description = detail.indexOf('{job.description ?');
  const locationRow = detail.indexOf('location-outline" size={20}');
  assert.ok(title > 0 && description > title, 'description must follow the title');
  assert.ok(locationRow > description, 'logistics rows must follow the scope of work');
});

test('[static] B4 · the detail renders approximate location only — no address field it has no right to', async () => {
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));
  // job.location is the approximate area string on the jobs row; the exact
  // address surface (job_locations / fetchJobLocation / address_line) must
  // not appear on the open-market detail.
  assert.match(detail, /job\.location \?\? 'No location set'/);
  assert.doesNotMatch(detail, /fetchJobLocation|address_line|job_locations/);
});

test('[static] B5 · the screen renders the module output and derives no reason itself', async () => {
  const detail = await read('screens/JobDetailScreen.tsx');
  assert.match(detail, /deriveMatchReasons\(/);
  assert.match(detail, /matchReasons\.map\(\(reason\)/);
  // Inputs are real data or null: profile categories, persisted radius, the
  // cheapest published flat price, the route-carried server distance.
  assert.match(detail, /readDistanceFilter\(userId\)/);
  assert.match(detail, /fetchWorkerServices\(userId\)/);
  assert.match(detail, /price_unit === 'flat'/);
  assert.match(detail, /typeof routeDistance === 'number' \? routeDistance : null/);
  // The comparison logic itself lives in the module, not the screen.
  const stripped = stripComments(detail);
  assert.doesNotMatch(stripped, /<=\s*threshold|budgetCeiling\(/);
});

test('[static] B5 · match reasons render only for the worker view of another poster\'s job', async () => {
  const detail = await read('screens/JobDetailScreen.tsx');
  assert.match(detail, /mode === 'worker' && !isOwnJob\s*\?\s*deriveMatchReasons/);
  assert.match(detail, /matchReasons\.length > 0 \?/);
});

test('[static] · NEARBY_RADIUS_MILES stays canonical in lib and re-exported for its consumer', async () => {
  const lib = await read('lib/discoveryFilter.ts');
  assert.match(lib, /export const NEARBY_RADIUS_MILES = 5;/);
  const results = await read('screens/WorkerResultsScreen.tsx');
  assert.match(results, /export { NEARBY_RADIUS_MILES };/);
  // WorkerHomeScreen's import keeps resolving from the same path.
  const workerHome = await read('screens/WorkerHomeScreen.tsx');
  assert.match(workerHome, /import { NEARBY_RADIUS_MILES } from '\.\/WorkerResultsScreen';/);
});

test('[static] B3 · the nearby title tracks the applied radius and a dead location is announced, not faked', async () => {
  const results = await read('screens/WorkerResultsScreen.tsx');
  // The header may never claim a radius the list is not applying.
  assert.match(results, /`Jobs Within \$\{radius \?\? NEARBY_RADIUS_MILES\} Miles`/);
  // A chosen radius with no usable location keeps the full feed and says so.
  assert.match(results, /Location is off — showing jobs at any distance\./);
  const map = await read('screens/MapScreen.tsx');
  assert.match(map, /Location is off — showing all areas\./);
  // A user-chosen radius pins the search widening ladder.
  assert.match(results, /radiusActive\s*\?\s*\[radius as number\]\s*:\s*\[5, 10, 15\]/);
});
