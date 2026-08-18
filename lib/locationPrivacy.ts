/**
 * One rule for what may stand as a job's public location label.
 *
 * `jobs.location` is the APPROXIMATE, open-market area name ("Flatbush,
 * Brooklyn, NY"); precise coordinates live only in `job_locations` behind
 * RLS (owner + hired worker — phase12). A raw "40.6501, -73.9496" string in
 * the public column is a ~10 m fix on someone's home published to every
 * signed-in browser, so a coordinate-shaped string is (1) never produced as
 * a label (lib/geolocation.ts), (2) refused at the client write boundary
 * (createJob / updateJob / createDirectOffer), and (3) rendered as absent on
 * open-market reads (toOpenJob) in case a row was stored before this guard.
 */

/**
 * Matches ONLY when the FULL string is two signed decimals with 3+ decimal
 * places separated by a comma — the shape a raw GPS pair formats as. Never
 * broader, so real location text containing numbers ("123 Main St", "Apt
 * 4.5, Midwood", "Route 9, mile 12") passes: those are not two bare
 * high-precision decimals and nothing else.
 */
const COORDINATE_PAIR = /^\s*-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\s*$/;

export function isCoordinateShapedLocation(value: string | null | undefined): boolean {
  return typeof value === 'string' && COORDINATE_PAIR.test(value);
}

/**
 * Write-boundary guard: the sentence a poster reads instead of their GPS fix
 * being published. Null when the location is fine to store. Kept under
 * lib/errorMessage.ts isSafeToShow()'s 160-character gate so userMessage()
 * hands it through verbatim.
 */
export function coordinateLocationError(location: string): string | null {
  if (!isCoordinateShapedLocation(location)) return null;
  return 'That looks like exact GPS coordinates, which would reveal the precise spot. Use an area name instead, like "Flatbush, Brooklyn".';
}

/**
 * Open-market mask: a coordinate-shaped stored label renders as absent —
 * the same convention as unknown distance — so rows stored before the write
 * guard existed cannot leak a doorstep. Owner and assigned-worker surfaces
 * do not route through this; their exact address comes from job_locations
 * by design.
 */
export function publicLocationLabel(location: string | null): string | null {
  return location && !isCoordinateShapedLocation(location) ? location : null;
}
