import * as Location from 'expo-location';

export type ResolvedPlace = {
  label: string;
  lat: number;
  lng: number;
};

export type ResolveResult =
  | { ok: true; place: ResolvedPlace }
  | { ok: false; reason: 'denied' | 'unavailable'; message: string };

/**
 * Builds a readable area name from a reverse-geocode result, e.g.
 * "Sheepshead Bay, Brooklyn". Prefers neighbourhood-level detail over a bare
 * city, falling back progressively as fields come back null (they vary a lot
 * by platform and region).
 */
function formatPlace(place: Location.LocationGeocodedAddress): string {
  const neighbourhood = place.district || place.subregion || null;
  const city = place.city || place.subregion || place.region || null;

  const parts: string[] = [];
  if (neighbourhood) parts.push(neighbourhood);
  if (city && city !== neighbourhood) parts.push(city);
  if (parts.length === 0 && place.region) parts.push(place.region);

  return parts.join(', ');
}

/**
 * Requests foreground location permission (the same prompt the hotspot map
 * uses — granting it in either place covers both), reads the current GPS
 * position, and reverse-geocodes it to an area name.
 *
 * Returns the raw coordinates too, so the caller can store them for the
 * hotspot map even though only the label is shown to the user.
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

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;

    let label = '';
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results.length > 0) label = formatPlace(results[0]);
    } catch {
      // Reverse geocoding can fail independently of the GPS fix (no network,
      // or no provider on some Android builds). The coordinates are still
      // good, so fall through to the coordinate label below.
    }

    if (!label) {
      label = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }

    return { ok: true, place: { label, lat: latitude, lng: longitude } };
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message:
        "Couldn't get your location. Check that location services are on, or type the area in manually.",
    };
  }
}
