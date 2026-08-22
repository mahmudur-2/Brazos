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

/**
 * The server-write debt marker (F-042). Set when set_active_mode() failed
 * after its retry, so the NEXT resolution knows the local cache is AHEAD of
 * the server — a stale remote answer must not silently revert the user's
 * switch — and re-pushes the choice. Cleared the moment a server write lands.
 * Scoped and versioned exactly like the cache key above, for the same
 * two-accounts-one-device reason.
 */
export function pendingModeWriteKey(userId: string): string {
  return `brazos.mode.pendingWrite.v1.${userId}`;
}

/** The mode still owed to the server, or null when nothing is owed. */
export async function readPendingModeWrite(userId: string): Promise<AppMode | null> {
  try {
    const raw = await AsyncStorage.getItem(pendingModeWriteKey(userId));
    return isAppMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function writePendingModeWrite(userId: string, mode: AppMode): Promise<void> {
  try {
    await AsyncStorage.setItem(pendingModeWriteKey(userId), coerceAppMode(mode));
  } catch {
    // Best-effort: an unwritable flag costs cross-device sync, not the app.
  }
}

export async function clearPendingModeWrite(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(pendingModeWriteKey(userId));
  } catch {
    // The debt is paid server-side; a sticky flag only re-pushes the same
    // value on the next resolution.
  }
}
