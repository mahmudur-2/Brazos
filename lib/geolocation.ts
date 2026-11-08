import * as Location from 'expo-location';
import { Sentry } from './observability/sentry';
import { publicLocationLabel } from './locationPrivacy';
import { reverseGeocodeArea } from './reverseGeocode';

export type ResolvedPlace = {
  label: string;
  lat: number;
  lng: number;
};

export type ResolveResult =
  | { ok: true; place: ResolvedPlace }
  | { ok: false; reason: 'denied' | 'unavailable'; message: string };

/** US state name → USPS abbreviation, so the native-geocoder fallback can also
 *  produce the "…, ST" ending. iOS returns `region` as a full name on some
 *  locales and as a code on others, hence the passthrough for 2-letter input. */
const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

function abbreviateState(region: string | null): string | null {
  if (!region) return null;
  const trimmed = region.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBREVIATIONS[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Fallback formatter for expo-location's on-device reverse geocode, matching
 * the "Area, City, ST" shape as closely as the native data allows. Only used
 * when Nominatim is unreachable: the iOS/Android geocoders top out at
 * borough/city granularity (their most specific field, `district`, returns
 * "Brooklyn" for a Flatbush address, never the neighbourhood), so this tier
 * cannot deliver true neighbourhood detail — see lib/reverseGeocode.ts for
 * the tier that does.
 *
 * PRIVACY: reads only district/city/region — never `street`/`streetNumber`.
 */
function formatNativePlace(place: Location.LocationGeocodedAddress): string {
  const district = place.district || place.subregion || null;
  const city = place.city || place.subregion || null;
  const state = abbreviateState(place.region ?? null);

  const parts: string[] = [];
  if (district) parts.push(district);
  if (city && city !== district) parts.push(city);
  if (state && state !== city) parts.push(state);

  return parts.join(', ');
}

/**
 * Requests foreground location permission (the same prompt the hotspot map
 * uses — granting it in either place covers both), reads the current GPS
 * position, and reverse-geocodes it to a neighbourhood-level area name.
 *
 * Label resolution is a two-tier fallback, each tier degrading gracefully
 * so a posted job always keeps its coordinates (and therefore its map pin)
 * even when the fancier lookups fail:
 *   1. Nominatim (see lib/reverseGeocode.ts) — "Neighborhood, Borough, ST".
 *   2. expo-location's native reverseGeocodeAsync — borough/city only.
 * When both fail the label is EMPTY — never the raw coordinates. A
 * "40.6501, -73.9496" label stored as a job's public location is a ~10 m fix
 * on someone's home (see lib/locationPrivacy.ts); the caller's existing
 * location input is where the user types an area name instead.
 *
 * Returns the raw coordinates too, so the caller can store them for the
 * hotspot map even though only the neighbourhood-level label is shown.
 */
export async function resolveCurrentPlace(): Promise<ResolveResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message:
        'Location permission is off. Enable it in Settings, or type the area in manually.',
    };
  }

  let latitude: number;
  let longitude: number;
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
  } catch (err) {
    console.error('[geolocation] getCurrentPositionAsync failed', err);
    Sentry?.captureException(err, {
      extra: { site: 'geolocation.resolveCurrentPlace', stage: 'position' },
    });
    // B11: the raw reason went to Sentry above; the person reads a plain line.
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Couldn’t find your location. Check that Location Services are on, or type the area instead.',
    };
  }

  // Coordinates are already secured above — everything past this point is
  // best-effort label resolution. No matter how many of these tiers fail,
  // we still return ok:true with the coordinates so the job keeps its map
  // pin; only the label gets coarser.
  let label = await reverseGeocodeArea(latitude, longitude);

  if (!label) {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results.length > 0) label = formatNativePlace(results[0]) || null;
    } catch (err) {
      // Reverse geocoding can fail independently of the GPS fix (no
      // network, or no provider on some Android builds). The coordinates
      // are still good; only the label stays empty.
      console.error('[geolocation] native reverseGeocodeAsync failed', err);
      Sentry?.captureException(err, {
        extra: { site: 'geolocation.resolveCurrentPlace', stage: 'nativeReverseGeocode' },
      });
    }
  }

  // PRIVACY: the label is never the raw coordinates. Double geocode failure
  // leaves it empty (the user types an area name in the existing location
  // input), and a coordinate-shaped string from either geocode tier is
  // scrubbed by the same one rule the write boundary enforces.
  return {
    ok: true,
    place: { label: publicLocationLabel(label) ?? '', lat: latitude, lng: longitude },
  };
}
