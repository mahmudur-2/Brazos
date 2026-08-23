import AsyncStorage from '@react-native-async-storage/async-storage';
import { distanceFilterStorageKey, type DistanceFilterMiles } from './discoveryFilter';

/**
 * The state half of the discovery distance filter — SESSION-ONLY since
 * 2026-08-22 (operator decision, reversing 4D-2 B3's persistence): every cold
 * start of the app begins at Any distance, and within a session the last
 * choice is kept in this in-memory map, shared by the Map screen and the
 * results list so moving between them keeps the selection.
 *
 * The read/write signatures kept their async shape so the two consuming
 * screens and JobDetail's match-reason read needed no change; both are still
 * best-effort and non-throwing.
 *
 * THE ONE AsyncStorage CALL LEFT IS AN ERASER. Builds before 2026-08-22
 * persisted the filter under distanceFilterStorageKey(); the first touch per
 * account now removes that value (fire-and-forget — a failed removal costs
 * nothing, since nothing reads the key any more) and nothing ever writes it
 * again. No migration file: the cleanup is this in-code removal, once.
 */

const sessionFilter = new Map<string, DistanceFilterMiles | null>();
const legacyCleared = new Set<string>();

function clearLegacyPersistedFilter(userId: string): void {
  if (legacyCleared.has(userId)) return;
  legacyCleared.add(userId);
  AsyncStorage.removeItem(distanceFilterStorageKey(userId)).catch(() => {
    // Best-effort — see the module docblock.
  });
}

/** This session's filter for the account; null means Any (or never chosen). */
export async function readDistanceFilter(userId: string): Promise<DistanceFilterMiles | null> {
  clearLegacyPersistedFilter(userId);
  return sessionFilter.get(userId) ?? null;
}

/** Records the selection for the rest of THIS session only. */
export async function writeDistanceFilter(
  userId: string,
  value: DistanceFilterMiles | null
): Promise<void> {
  clearLegacyPersistedFilter(userId);
  sessionFilter.set(userId, value);
}
