import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  coerceStoredDistanceFilter,
  distanceFilterStorageKey,
  encodeDistanceFilter,
  type DistanceFilterMiles,
} from './discoveryFilter';

/**
 * The device side of the discovery distance filter (4D-2 B3) — AsyncStorage
 * following modes/modeStorage.ts exactly (the dispatch's pre-made decision:
 * AsyncStorage keyed per account, NOT SecureStore — a distance preference is
 * not a secret). Every operation is best-effort and non-throwing: a storage
 * failure must never break browsing, it only costs the remembered selection.
 */

/** The persisted filter for this user; null means Any (or nothing stored). */
export async function readDistanceFilter(userId: string): Promise<DistanceFilterMiles | null> {
  try {
    const raw = await AsyncStorage.getItem(distanceFilterStorageKey(userId));
    return coerceStoredDistanceFilter(raw);
  } catch {
    return null;
  }
}

/** Best-effort write; returns nothing for the modeStorage reason — the UI has
 *  already applied the selection, and there is nothing useful to do about a
 *  failed cache write. */
export async function writeDistanceFilter(
  userId: string,
  value: DistanceFilterMiles | null
): Promise<void> {
  try {
    await AsyncStorage.setItem(distanceFilterStorageKey(userId), encodeDistanceFilter(value));
  } catch {
    // Intentionally swallowed — see above.
  }
}
