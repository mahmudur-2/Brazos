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

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

// Shared props for the platform-specific map implementations
// (HotspotMap.native.tsx uses react-native-maps; HotspotMap.web.tsx is a
// card-list fallback because react-native-maps has no web support).
export type HotspotMapProps = {
  cells: HotspotCell[];
  loading: boolean;
  onSelectCell: (cell: HotspotCell) => void;
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
