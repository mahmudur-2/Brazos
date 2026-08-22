/**
 * secureSessionStorage — the impure wiring for lib/secureSessionStorageCore.ts
 * and the ONLY place `expo-secure-store` is imported. The core is pure and
 * dependency-injected so its whole behavior runs under `node --test`; this
 * module hands it the three real surfaces it needs:
 *
 *   - loadSecureStore: a try/caught `require('expo-secure-store')`. In a build
 *     whose native side predates the module (the existing dev client), the
 *     module evaluation throws at require time; that reads as null here, which
 *     the core resolves to the dev-only AsyncStorage fallback (one unmissable
 *     `██ DEV FALLBACK ██` warning) or, in a non-dev build, a hard rejection —
 *     a release must never quietly store tokens in plain storage.
 *   - legacyStorage: AsyncStorage — the migration source for the one-time
 *     silent move of an existing session, and the dev-only fallback target.
 *   - isDev: `__DEV__` at this call site.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createSecureSessionStorage,
  type SecureStoreLike,
} from './secureSessionStorageCore';

function loadSecureStore(): SecureStoreLike | null {
  try {
    return require('expo-secure-store') as SecureStoreLike;
  } catch {
    return null;
  }
}

export const secureSessionStorage = createSecureSessionStorage({
  loadSecureStore,
  legacyStorage: AsyncStorage,
  isDev: __DEV__,
});
