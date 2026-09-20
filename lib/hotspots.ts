import { supabase } from './supabase';
import { withAlpha } from '../ui/colorAlpha';
import { fetchOpenJobsByIds, toOpenJob, type OpenJob } from './jobs';
import type { ClusterPin } from './mapClustering';

// Aggregated grid cell returned by the job_hotspots() RPC. Never contains
// individual job coordinates — only the cell center + counts.
export type HotspotCell = {
  ilat: number;
  ilng: number;
  cell_lat: number;
  cell_lng: number;
  job_count: number;
  categories: Record<string, number>;
};

/**
 * Color tiers by job count. `stroke` is each tier's base color — FUNCTIONAL/
 * SEMANTIC signals (heat), not brand colors, so they intentionally stay fixed
 * regardless of light/dark mode. A count of 0 renders nothing, but that never
 * actually occurs — job_hotspots() only returns cells with >=1 open job.
 */
export type HotspotTier = {
  key: 'low' | 'medium' | 'high' | 'peak';
  min: number;
  max: number;
  label: string;
  stroke: string;
};

export const HOTSPOT_TIERS: HotspotTier[] = [
  { key: 'low', min: 1, max: 4, label: '1–4 jobs', stroke: '#4FA8E8' },
  { key: 'medium', min: 5, max: 19, label: '5–19 jobs', stroke: '#5EBB6B' },
  { key: 'high', min: 20, max: 49, label: '20–49 jobs', stroke: '#EAB308' },
  { key: 'peak', min: 50, max: Number.POSITIVE_INFINITY, label: '50+ jobs', stroke: '#DC2626' },
];

/** The tier for a job count, or null only for a count of 0 (never actually returned). */
export function tierForCount(count: number): HotspotTier | null {
  if (count < 1) return null;
  return (
    HOTSPOT_TIERS.find((t) => count >= t.min && count <= t.max) ??
    HOTSPOT_TIERS[HOTSPOT_TIERS.length - 1]
  );
}

// ---------------------------------------------------------------------------
// Heat-glow rendering — approximates a soft radial gradient (react-native-maps'
// Circle only supports a flat fillColor, no native gradient) by layering
// several concentric, unstroked circles from largest/faintest to smallest/
// most-opaque. Alpha-compositing across the layers reads as a soft blur that
// fades at the edges, and adjacent cells' glows blend where they overlap —
// no hard grid-cell boundaries. A true native Heatmap overlay (react-native-
// maps has one) was ruled out: it only works with the Google Maps provider,
// and iOS is deliberately on Apple Maps here to avoid requiring an API key.
// ---------------------------------------------------------------------------

const MILES_PER_DEG_LAT = 69.0;
const CELL_MILES = 0.27;
const REF_LAT = 40.7128; // NYC — matches the SQL's fixed reference latitude
const CELL_DLAT = CELL_MILES / MILES_PER_DEG_LAT;
const CELL_DLNG = CELL_MILES / (MILES_PER_DEG_LAT * Math.cos((REF_LAT * Math.PI) / 180));
const GLOW_BASE_RADIUS_METERS = CELL_MILES * 1609.34 * 0.55;

/**
 * A cell's square footprint, in coordinates — NOT rendered visually (that
 * would reintroduce the hard-edged look), only used as an invisible tap
 * target. react-native-maps' Circle overlay has no onPress/tappable support
 * at all in this version (confirmed against its type defs), so hit-testing a
 * tap on the soft glow has to go through a Polygon instead, which does
 * support taps — rendered fully transparent, no stroke.
 */
export function cellPolygon(cell: { cell_lat: number; cell_lng: number }) {
  const halfLat = CELL_DLAT / 2;
  const halfLng = CELL_DLNG / 2;
  return [
    { latitude: cell.cell_lat - halfLat, longitude: cell.cell_lng - halfLng },
    { latitude: cell.cell_lat - halfLat, longitude: cell.cell_lng + halfLng },
    { latitude: cell.cell_lat + halfLat, longitude: cell.cell_lng + halfLng },
    { latitude: cell.cell_lat + halfLat, longitude: cell.cell_lng - halfLng },
  ];
}

// Denser hotspots render as a modestly bigger glow, not just a more intense
// color — loosely inspired by Snap Map's "bigger, brighter = busier" feel.
const TIER_SIZE_SCALE: Record<HotspotTier['key'], number> = {
  low: 1,
  medium: 1.15,
  high: 1.3,
  peak: 1.5,
};

// Rings from outermost (largest, faintest) to innermost (smallest, most
// opaque). `scale` multiplies the base glow radius; `alpha` is that ring's
// fill opacity.
const GLOW_RINGS: { scale: number; alpha: number }[] = [
  { scale: 2.2, alpha: 0.1 },
  { scale: 1.7, alpha: 0.16 },
  { scale: 1.25, alpha: 0.24 },
  { scale: 0.85, alpha: 0.36 },
  { scale: 0.5, alpha: 0.55 },
];

export type GlowRing = {
  key: string;
  radiusMeters: number;
  fillColor: string;
};

/** Concentric ring geometry for one cell's soft heat-glow. Empty if below tier. */
export function glowRingsForCell(cell: HotspotCell): GlowRing[] {
  const tier = tierForCount(cell.job_count);
  if (!tier) return [];
  const sizeScale = TIER_SIZE_SCALE[tier.key];
  return GLOW_RINGS.map((ring, i) => ({
    key: `${cell.ilat}:${cell.ilng}:${i}`,
    radiusMeters: GLOW_BASE_RADIUS_METERS * sizeScale * ring.scale,
    fillColor: withAlpha(tier.stroke, ring.alpha),
  }));
}

/** The subset of react-native-maps' Region the clustering zoom signal needs. */
export type MapRegionSnapshot = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

// Shared props for the platform-specific map implementations
// (HotspotMap.native.tsx uses react-native-maps; HotspotMap.web.tsx uses
// OpenLayers because react-native-maps has no web support).
//
// The optional members below are the 4D-2 worker-discovery surface. They are
// OPTIONAL by design: the web implementation is frozen (CLAUDE.md) and simply
// never reads them, so on web the map keeps its pre-4D-2 glow-cell behavior
// in every mode while the native map renders clustered pins when a caller
// passes them. When `pins` is present (even empty) the native map suppresses
// the glow overlay — the two presentations never stack.
export type HotspotMapProps = {
  cells: HotspotCell[];
  loading: boolean;
  onSelectCell: (cell: HotspotCell) => void;
  /** Clustered worker-discovery pins (lib/mapClustering.ts output). */
  pins?: ClusterPin[];
  onSelectPin?: (pin: ClusterPin) => void;
  /** Fires when the user settles a pan/zoom — the clustering zoom signal. */
  onRegionChangeComplete?: (region: MapRegionSnapshot) => void;
  /** Fires once when the device's own position is obtained (permission
   *  granted and a fix acquired). Never fires otherwise — an absent location
   *  stays unknown, it is never guessed. */
  onUserLocation?: (location: { lat: number; lng: number }) => void;
  /** 2026-09-19: the pin the sheet is open on — drawn in the gold ring with
   *  its glow (the approved Map design). Native only; web ignores it. */
  selectedPinKey?: string | null;
  /** 2026-09-19: the approved design carries no locate button over the map
   *  (the search capsule and the sheet are the only chrome). Default false
   *  keeps every other caller as it was. Native only. */
  hideLocateButton?: boolean;
};

/**
 * Fetch aggregated hotspot cells. job_hotspots() already only returns cells
 * with >=1 open job, and every count from 1 up now maps to a tier (see
 * HOTSPOT_TIERS), so no further client-side filtering is needed.
 */
export async function fetchHotspots() {
  const { data, error } = await supabase.rpc('job_hotspots');
  return { data: (data ?? []) as HotspotCell[], error };
}

/**
 * Fetch the open jobs inside one cell (coordinate-free) for the drill-down list.
 *
 * jobs_in_cell() predates the phase13 `photos` column and the phase34 `videos`
 * column, so its rows carry neither — a job opened from the map would show a
 * category tile where every other surface shows the poster's photo, and its
 * detail screen would appear to have no media at all. Rather than change a
 * deployed security-definer RPC's return shape, the ids it returns are
 * re-read through the same column allowlist the browse feed uses, in one
 * batched query (never one per row).
 *
 * The RPC decides *which* jobs are in the cell; the hydrating select only
 * widens the projection on jobs the caller can already read (`fetchOpenJobs`
 * selects the same columns from the same table under the same RLS). If that
 * second query fails, the RPC's own rows are returned unchanged so the map
 * drill-down degrades to its previous behavior instead of breaking.
 */
export async function fetchJobsInCell(ilat: number, ilng: number) {
  const { data, error } = await supabase.rpc('jobs_in_cell', {
    p_ilat: ilat,
    p_ilng: ilng,
  });
  if (error) return { data: [] as OpenJob[], error };

  const rows: OpenJob[] = (data ?? []).map(toOpenJob);
  const { data: hydrated, error: hydrateError } = await fetchOpenJobsByIds(
    rows.map((j) => j.id)
  );

  return { data: hydrateError ? rows : hydrated, error: null };
}

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance between two points, in miles. */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** An open job as jobs_within_radius() returns it — real fields plus a
 *  server-computed distance. Never a job's raw stored coordinates. */
export type NearbyJob = OpenJob & { distance_miles: number };

/**
 * Exact job-level distance, server-side — Worker Home's "X within N miles"
 * pill and its results screen both call this, so a stated radius claim is
 * backed by real Haversine distance against job_locations (phase12's
 * RLS-locked exact-coordinate table), not hotspot-cell membership. See
 * supabase/phase41_jobs_within_radius.sql for the RPC itself: it never
 * returns any job's raw lat/lng, only public fields + distance_miles, and a
 * job with no job_locations row (no precise coordinates recorded) is
 * excluded by the RPC's own join rather than guessed at.
 */
export async function fetchJobsWithinRadius(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<{ data: NearbyJob[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('jobs_within_radius', {
    p_lat: lat,
    p_lng: lng,
    p_radius_miles: radiusMiles,
  });
  if (error) return { data: [], error };

  const rows: NearbyJob[] = (data ?? []).map((row: any) => ({
    ...toOpenJob(row),
    distance_miles: row.distance_miles,
  }));
  return { data: rows, error: null };
}

/**
 * Hotspot cells whose center falls within `miles` of a point. This is the
 * one privacy-respecting way to answer "jobs near X" on the client: a job's
 * own exact coordinates were removed from the `jobs` table entirely (phase12)
 * and live in `job_locations`, readable only by its poster and assigned
 * worker — job_hotspots()'s cell centers are the closest real geographic
 * signal an open-jobs browse can see. At the 0.27mi cell size, a cell
 * qualifying by its center is never meaningfully further than the requested
 * radius plus a fraction of a mile.
 */
export function cellsWithinMiles(
  cells: HotspotCell[],
  lat: number,
  lng: number,
  miles: number
): HotspotCell[] {
  return cells.filter((cell) => milesBetween(lat, lng, cell.cell_lat, cell.cell_lng) <= miles);
}

/**
 * The real open jobs inside a set of cells, deduped by id. One `jobs_in_cell`
 * call per cell, run in parallel and bounded by how many cells actually fall
 * in the requested radius — never the whole board's cells, and never called
 * on every Home render (only when a caller actually needs the job list, not
 * just the count — see cellsWithinMiles + summed job_count for that).
 */
export async function fetchOpenJobsInCells(
  cells: HotspotCell[]
): Promise<{ data: OpenJob[]; error: { message: string } | null }> {
  if (cells.length === 0) return { data: [], error: null };

  const results = await Promise.all(cells.map((cell) => fetchJobsInCell(cell.ilat, cell.ilng)));

  const firstError = results.find((r) => r.error)?.error ?? null;
  const byId = new Map<string, OpenJob>();
  for (const result of results) {
    for (const job of result.data) byId.set(job.id, job);
  }
  // Partial failure still returns whatever cells succeeded — one bad cell
  // shouldn't blank out an otherwise-real result set.
  return { data: Array.from(byId.values()), error: byId.size === 0 ? firstError : null };
}

/** Human-readable category summary for a cell, e.g. "Cleaning · Handyman · +2". */
export function summarizeCategories(
  categories: Record<string, number>,
  labels: Record<string, string>
): string {
  const names = Object.keys(categories).map((k) => labels[k] ?? k);
  if (names.length <= 3) return names.join(' · ');
  return `${names.slice(0, 3).join(' · ')} · +${names.length - 3}`;
}
