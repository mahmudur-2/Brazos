import { supabase } from './supabase';
import type { OpenJob } from './jobs';

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
 * Color tiers by job count. These are FUNCTIONAL/SEMANTIC signals (heat), not
 * brand colors — they intentionally stay fixed regardless of the app theme.
 * `stroke` is the ring/outline, `fill` is the semi-transparent interior.
 * Counts of 0-4 render nothing (no tier).
 */
export type HotspotTier = {
  key: 'low' | 'medium' | 'high' | 'peak';
  min: number;
  max: number;
  label: string;
  stroke: string;
  fill: string;
};

export const HOTSPOT_TIERS: HotspotTier[] = [
  { key: 'low', min: 5, max: 14, label: '5–14 jobs', stroke: '#5EBB6B', fill: 'rgba(94,187,107,0.35)' },
  { key: 'medium', min: 15, max: 29, label: '15–29 jobs', stroke: '#EAB308', fill: 'rgba(234,179,8,0.35)' },
  { key: 'high', min: 30, max: 49, label: '30–49 jobs', stroke: '#DC2626', fill: 'rgba(220,38,38,0.38)' },
  { key: 'peak', min: 50, max: Number.POSITIVE_INFINITY, label: '50+ jobs', stroke: '#C2410C', fill: 'rgba(194,65,12,0.5)' },
];

/** The tier for a job count, or null when there's nothing to highlight (0-4). */
export function tierForCount(count: number): HotspotTier | null {
  if (count < 5) return null;
  return (
    HOTSPOT_TIERS.find((t) => count >= t.min && count <= t.max) ??
    HOTSPOT_TIERS[HOTSPOT_TIERS.length - 1]
  );
}

// Grid step, in degrees — MUST match the constants inside the job_hotspots()
// SQL function so client-drawn cell squares line up with the server's grid.
// These are just the grid resolution (not job coordinates), so they're safe to
// have on the client.
const MILES_PER_DEG_LAT = 69.0;
const CELL_MILES = 0.27;
const REF_LAT = 40.7128; // NYC — fixed reference so cells stay aligned (no seams)
export const CELL_DLAT = CELL_MILES / MILES_PER_DEG_LAT;
export const CELL_DLNG =
  CELL_MILES / (MILES_PER_DEG_LAT * Math.cos((REF_LAT * Math.PI) / 180));

/** The four corner coordinates of a cell's square, for drawing a map polygon. */
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

// Shared props for the platform-specific map implementations
// (HotspotMap.native.tsx uses react-native-maps; HotspotMap.web.tsx is a
// card-list fallback because react-native-maps has no web support).
export type HotspotMapProps = {
  cells: HotspotCell[];
  loading: boolean;
  onSelectCell: (cell: HotspotCell) => void;
};

/** Fetch aggregated hotspot cells (only cells with >=1 open job come back). */
export async function fetchHotspots() {
  const { data, error } = await supabase.rpc('job_hotspots');
  // Only surface cells that actually reach a tier (>=5). Below that we render
  // nothing, per the tier spec.
  const cells = ((data ?? []) as HotspotCell[]).filter((c) => c.job_count >= 5);
  return { data: cells, error };
}

/** Fetch the open jobs inside one cell (coordinate-free) for the drill-down list. */
export async function fetchJobsInCell(ilat: number, ilng: number) {
  const { data, error } = await supabase.rpc('jobs_in_cell', {
    p_ilat: ilat,
    p_ilng: ilng,
  });
  return { data: (data ?? []) as OpenJob[], error };
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
