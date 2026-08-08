import AsyncStorage from '@react-native-async-storage/async-storage';
import { coerceAppMode, isAppMode, modeStorageKey, type AppMode } from './types';

/**
 * The device side of the mode preference. Kept apart from ./types.ts so the
 * keying and coercion rules stay executable by the tests.
 *
 * This is a *cache*, not the source of truth — profiles.active_mode is (see
 * supabase/phase42_active_mode.sql). It exists so the app can resolve a mode
 * before the network answers, and so it still resolves a sensible one when the
 * network never answers (offline, or a database where phase42 has not been
 * applied yet). That is the "safe local fallback when persistence is
 * unavailable" the architecture requires.
 *
 * Every operation is best-effort and non-throwing: a storage failure must never
 * be the reason a signed-in user cannot get into the app.
 */

/** The cached mode for this user, or null when there is none / it is unreadable. */
export async function readCachedMode(userId: string): Promise<AppMode | null> {
  try {
    const raw = await AsyncStorage.getItem(modeStorageKey(userId));
    return isAppMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort write. Deliberately returns nothing: the caller has already
 * switched the user's mode on screen, and there is no useful thing to do about
 * a failed cache write — the server copy is the durable one, and a missing
 * cache entry only costs one network read on next launch.
 */
export async function writeCachedMode(userId: string, mode: AppMode): Promise<void> {
  try {
    await AsyncStorage.setItem(modeStorageKey(userId), coerceAppMode(mode));
  } catch {
    // Intentionally swallowed — see above.
  }
}
