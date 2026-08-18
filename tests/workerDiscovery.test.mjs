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
  assert.match(map, /onRegionChangeComplete={onRegionChangeComplete}/);
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
  // The frozen-web pins (tests/pwa.test.mjs): fixed light palette, no theme hook.
  assert.match(screen, /backgroundColor: colors\.background/);
  assert.doesNotMatch(screen, /useThemeColors/);
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
