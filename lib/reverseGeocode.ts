/**
 * Neighbourhood-level reverse geocoding via OpenStreetMap's Nominatim.
 *
 * Split out from lib/geolocation.ts deliberately: this module imports nothing
 * from expo, so it can be exercised directly by a plain Node script against
 * the live API. This lookup has regressed twice by being changed without
 * being run, so keeping it testable in isolation is the point.
 *
 * PRIVACY: the returned label is intentionally neighbourhood-level only.
 * Nominatim also returns `road` / `house_number` for these coordinates and
 * this module never reads those fields — the exact position goes only to
 * job_locations for the map pin (see phase12), never into the job's visible
 * location text.
 */

export type NominatimAddress = {
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  suburb?: string;
  borough?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  /** e.g. "US-NY" — the source for the two-letter state abbreviation. */
  'ISO3166-2-lvl4'?: string;
};

const NOMINATIM_TIMEOUT_MS = 6000;
const USER_AGENT = 'BrazosApp/1.0 (job posting geocode)';

/**
 * Zoom 16, not 18. Verified against live data: at zoom 18 a Crown Heights
 * point resolves to "Eastern Parkway" (a sub-area), while zoom 16 gives the
 * expected "Crown Heights". Zoom 14 is worse still — it drops neighbourhood
 * coverage entirely for Sheepshead Bay, Crown Heights, Bed-Stuy and Canarsie.
 */
const ZOOM = 16;

/**
 * Where OSM has no named-neighbourhood polygon covering a point, Nominatim
 * backfills the SAME `neighbourhood` key with NYC's citywide Community
 * District tiling ("Brooklyn Community District 17"). That's an
 * administrative unit, not a neighbourhood, but it looks like a legitimate
 * answer — so it has to be rejected explicitly.
 */
const ADMIN_DISTRICT_PATTERN =
  /\b(community|council|school|police|fire|assembly|senate|congressional|precinct)\s+district\b|\bdistrict\s*\d+\b/i;

function validName(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return ADMIN_DISTRICT_PATTERN.test(trimmed) ? null : trimmed;
}

function firstValid(...candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    const v = validName(c);
    if (v) return v;
  }
  return null;
}

/** The neighbourhood proper. Tagged as `neighbourhood` on most OSM polygons but
 *  `quarter` on others (verified: Bed-Stuy → neighbourhood, Flatbush → quarter). */
export function neighbourhoodOf(address: NominatimAddress): string | null {
  return firstValid(address.neighbourhood, address.quarter, address.city_district);
}

/** The borough. In NYC `suburb` carries it (Brooklyn/Queens/…) while `city` is
 *  "New York" — so `suburb` is checked first, otherwise "East Flatbush, New
 *  York, NY" would lose the borough the user actually asked for. */
export function boroughOf(address: NominatimAddress): string | null {
  return firstValid(
    address.suburb,
    address.borough,
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.county
  );
}

/** Two-letter state code from ISO 3166-2 ("US-NY" → "NY"), falling back to the
 *  spelled-out state name when the ISO field is absent. */
export function stateCodeOf(address: NominatimAddress): string | null {
  const iso = address['ISO3166-2-lvl4'];
  if (iso && iso.includes('-')) {
    const part = iso.split('-')[1]?.trim();
    if (part) return part;
  }
  return address.state?.trim() || null;
}

/**
 * Assembles "Neighborhood, Borough, ST" — e.g. "East Flatbush, Brooklyn, NY".
 * Each piece is dropped if unavailable rather than substituted, so a partial
 * result degrades to "Brooklyn, NY" instead of inventing detail. `overrideHood`
 * carries a neighbourhood recovered from the ring probe below.
 */
export function formatArea(
  address: NominatimAddress,
  overrideHood?: string | null
): string {
  const hood = overrideHood ?? neighbourhoodOf(address);
  const borough = boroughOf(address);
  const state = stateCodeOf(address);

  const parts: string[] = [];
  if (hood) parts.push(hood);
  if (borough && borough !== hood) parts.push(borough);
  if (state && state !== borough) parts.push(state);

  return parts.join(', ');
}

async function fetchAddress(
  lat: number,
  lng: number,
  signal: AbortSignal
): Promise<NominatimAddress | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${lat}&lon=${lng}&zoom=${ZOOM}&addressdetails=1`;
  const response = await fetch(url, {
    signal,
    headers: {
      // Nominatim's usage policy requires an identifiable caller; a bare
      // React Native fetch User-Agent doesn't satisfy it.
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    console.error('[reverseGeocode] Nominatim HTTP error', response.status);
    return null;
  }
  const json = (await response.json()) as { address?: NominatimAddress };
  return json.address ?? null;
}

/**
 * Recovers a neighbourhood for points that fall in an OSM coverage gap by
 * sampling four points on a ~780m ring and taking the most common valid
 * neighbourhood among them (ties broken by N/E/S/W order).
 *
 * Verified necessary and sufficient against two real gaps: 864 E 46th St
 * (returns Community District 17 at every zoom) recovers "East Flatbush",
 * and a Bay Ridge point (no neighbourhood at any zoom) recovers "Bay Ridge"
 * by 2 votes to Fort Hamilton's 1 — the majority vote is what makes the
 * second case land on the right name rather than the neighbouring one.
 *
 * Only runs when the direct lookup failed, so the common path stays at a
 * single request.
 */
async function probeRingForNeighbourhood(
  lat: number,
  lng: number,
  signal: AbortSignal
): Promise<string | null> {
  const r = 0.007; // ~780m in latitude
  const lonScale = 1 / Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [
    [lat + r, lng],
    [lat, lng + r * lonScale],
    [lat - r, lng],
    [lat, lng - r * lonScale],
  ];

  const results = await Promise.all(
    ring.map(async ([plat, plng]) => {
      try {
        const address = await fetchAddress(plat, plng, signal);
        return address ? neighbourhoodOf(address) : null;
      } catch {
        return null;
      }
    })
  );

  const votes = new Map<string, number>();
  for (const name of results) {
    if (name) votes.set(name, (votes.get(name) ?? 0) + 1);
  }
  if (votes.size === 0) return null;

  // Highest vote count wins; Map preserves insertion order, so an exact tie
  // resolves to whichever name was seen first in N/E/S/W order.
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of votes) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Resolves coordinates to a "Neighborhood, Borough, ST" label, or null if
 * Nominatim is unreachable. Callers are expected to fall back to a coarser
 * source (the on-device geocoder) when this returns null.
 */
export async function reverseGeocodeArea(
  lat: number,
  lng: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);

  try {
    const address = await fetchAddress(lat, lng, controller.signal);
    if (!address) return null;

    let hood = neighbourhoodOf(address);
    if (!hood) {
      hood = await probeRingForNeighbourhood(lat, lng, controller.signal);
    }

    const label = formatArea(address, hood);
    return label || null;
  } catch (err) {
    // Network failure, timeout (AbortError) or rate limiting — all recoverable
    // by the caller's fallback tier.
    console.error('[reverseGeocode] lookup failed', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
