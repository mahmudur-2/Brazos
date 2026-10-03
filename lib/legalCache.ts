import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRIVACY_VERSION, TERMS_VERSION } from './legal';

/**
 * FIX-RUN B6 (2026-10-03) — the last acceptance the SERVER confirmed, on this
 * device, so an offline start of an account that has already accepted the
 * current Terms and Privacy opens the app instead of a dead end.
 *
 * Written only after the server said so: an `accepted` read, or a successful
 * acceptCurrentDocuments() (the gate screen's markAccepted). It admits only
 * when the stored user AND both stored versions match the current ones, so a
 * version bump (B1's draft2) or another account on the same phone still needs
 * a connection. A server `needs_acceptance` always wins and clears it.
 *
 * Every read and write is best-effort and never throws: storage failing means
 * "no record", which is today's fail-closed answer.
 */

export type LegalCacheRecord = { userId: string; terms: string; privacy: string };

export type LegalVersions = { terms: string; privacy: string };

const KEY = 'brazos.legal.accepted.v1';

export const CURRENT_LEGAL_VERSIONS: LegalVersions = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION };

/** Pure: the stored value, or null for anything that is not a whole record. */
export function parseLegalCache(raw: string | null | undefined): LegalCacheRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LegalCacheRecord> | null;
    if (
      value &&
      typeof value.userId === 'string' &&
      typeof value.terms === 'string' &&
      typeof value.privacy === 'string'
    ) {
      return { userId: value.userId, terms: value.terms, privacy: value.privacy };
    }
  } catch {
    // Unreadable is the same as absent.
  }
  return null;
}

/** Pure: whether a record admits this user to these versions. */
export function legalCacheAdmits(
  record: LegalCacheRecord | null,
  userId: string,
  versions: LegalVersions
): boolean {
  return (
    !!record &&
    record.userId === userId &&
    record.terms === versions.terms &&
    record.privacy === versions.privacy
  );
}

/** A recorded server acceptance of the CURRENT versions by this user. */
export async function cachedAcceptanceFor(userId: string): Promise<boolean> {
  try {
    return legalCacheAdmits(parseLegalCache(await AsyncStorage.getItem(KEY)), userId, CURRENT_LEGAL_VERSIONS);
  } catch {
    return false;
  }
}

/** Record that the server holds this user's acceptance of the current versions. */
export async function rememberAcceptance(userId: string): Promise<void> {
  try {
    const record: LegalCacheRecord = { userId, ...CURRENT_LEGAL_VERSIONS };
    await AsyncStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Best effort: without it the next offline start shows the retry state.
  }
}

/** The server says acceptance is owed: nothing on this device may say otherwise. */
export async function forgetAcceptance(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Best effort.
  }
}
