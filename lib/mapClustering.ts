/**
 * Pure grid clustering for the worker discovery map (4D-2).
 *
 * Input is any set of weighted points — in practice job_hotspots() cells,
 * which are already privacy-aggregated (a cell center + a job count, never an
 * individual job's coordinates; see lib/hotspots.ts). Output is the pin set
 * the map renders at the current zoom: nearby points merge into one pin whose
 * position is the count-weighted centroid of its members and whose count is
 * their sum, so a pin's badge always states the real number of open jobs
 * under it.
 *
 * PRE-MADE DECISION (dispatch 4D-2 B1): this is deliberately NOT a clustering
 * library. It is a fixed-grid aggregation in ~60 lines, with no React and no
 * React Native imports, executed directly by `node --test` the way
 * lib/conversationResolver.ts is. The map component consumes its output as
 * plain markers.
 *
 * Determinism: callers may hand points in any order (network responses,
 * realtime refreshes). Members are sorted by id before any arithmetic and
 * pins are sorted by grid key, so the same point set always yields the same
 * pins in the same order — byte-stable keys included.
 */

export type ClusterablePoint = {
  /** Stable identity, e.g. a hotspot cell's `${ilat}:${ilng}`. */
  id: string;
  lat: number;
  lng: number;
  /** How many jobs this point represents (>= 1 for hotspot cells). */
  count: number;
};

export type ClusterPin = {
  /** Grid-bucket key — stable for a given point set and zoom. */
  key: string;
  /** Count-weighted centroid of the member points. */
  lat: number;
  lng: number;
  /** Sum of member counts — what the pin badge shows. */
  count: number;
  /** The aggregated points, sorted by id — the drill-down's cell list. */
  members: ClusterablePoint[];
};

export type ClusterOptions = {
  /** The visible region's latitudeDelta — the zoom signal. Zoomed out
   *  (larger delta) means coarser buckets and more merging. */
  latDelta: number;
  /** How many grid buckets span the visible height. Defaults to 8 — pins
   *  stay at least roughly a thumb apart at any zoom. */
  gridDivisions?: number;
};

/** Floors a coordinate into its grid row/column, tolerating negatives. */
function bucketIndex(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

export function clusterPoints(
  points: readonly ClusterablePoint[],
  options: ClusterOptions
): ClusterPin[] {
  if (points.length === 0) return [];

  const divisions = options.gridDivisions ?? 8;
  // Guard degenerate zoom values: a non-positive delta (transient map state)
  // must not divide by zero or collapse every point into one bucket. The
  // floor of 0.0008° (~0.05mi) is finer than a hotspot cell, so at extreme
  // zoom every cell is its own pin.
  const latDelta = Math.max(options.latDelta, 0.0008 * divisions);
  const cellSize = latDelta / divisions;

  // Sort by id BEFORE bucketing so member order — and therefore the centroid
  // floating-point accumulation order — never depends on input order.
  const sorted = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const buckets = new Map<string, ClusterablePoint[]>();
  for (const point of sorted) {
    const key = `${bucketIndex(point.lat, cellSize)}:${bucketIndex(point.lng, cellSize)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }

  const pins: ClusterPin[] = [];
  for (const [key, members] of buckets) {
    let count = 0;
    let latSum = 0;
    let lngSum = 0;
    for (const member of members) {
      count += member.count;
      latSum += member.lat * member.count;
      lngSum += member.lng * member.count;
    }
    pins.push({
      key,
      // count >= members.length >= 1 for hotspot cells, but a caller handing
      // zero-weight points must not produce NaN — fall back to a plain mean.
      lat: count > 0 ? latSum / count : members.reduce((s, m) => s + m.lat, 0) / members.length,
      lng: count > 0 ? lngSum / count : members.reduce((s, m) => s + m.lng, 0) / members.length,
      count,
      members,
    });
  }

  pins.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return pins;
}
