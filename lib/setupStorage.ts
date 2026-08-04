import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseSetupRecord,
  serializeSetupRecord,
  setupStorageKey,
  type SetupRecord,
} from './setupState';

/**
 * The device side of setup completion. Kept apart from ./setupState.ts so the
 * keying and parsing rules stay executable by the tests.
 *
 * Every operation is best-effort and non-throwing: a storage failure must
 * never be the reason a signed-in user cannot get into the app.
 */

/**
 * The stored record for this user, or null when there is none, the value is
 * unreadable, or storage itself failed. A null answer means "show Setup" —
 * see parseSetupRecord for why that is the safe direction.
 */
export async function readSetupRecord(userId: string): Promise<SetupRecord | null> {
  try {
    return parseSetupRecord(await AsyncStorage.getItem(setupStorageKey(userId)));
  } catch {
    return null;
  }
}

/**
 * Writes completion for one user. Idempotent — the same call twice leaves the
 * same single value under the same key, so a double-tap cannot produce a
 * second record.
 *
 * Reports failure rather than swallowing it: the caller must not navigate as
 * though setup were saved when it was not.
 */
export async function writeSetupRecord(
  userId: string,
  record: SetupRecord
): Promise<{ error: Error | null }> {
  try {
    await AsyncStorage.setItem(setupStorageKey(userId), serializeSetupRecord(record));
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}
