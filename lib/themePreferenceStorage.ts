import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCE_STORAGE_KEY,
  coerceThemePreference,
  type ThemePreference,
} from './themePreference';

/**
 * The device side of the appearance preference. Kept apart from
 * ./themePreference.ts so the keying and coercion rules stay executable by
 * the tests — the modes/modeStorage.ts arrangement exactly.
 *
 * This is the WHOLE persistence story, by the 4D-4 pre-made decision: local
 * AsyncStorage only, no database column, no server sync. Every operation is
 * best-effort and non-throwing: a storage failure must never be the reason
 * the app cannot resolve a theme — it just resolves the default.
 */

/** The stored preference, or the default when there is none / it is unreadable. */
export async function readThemePreference(): Promise<ThemePreference> {
  try {
    return coerceThemePreference(await AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/**
 * Best-effort write. Deliberately returns nothing: the caller has already
 * repainted the app in the chosen theme, and there is no useful thing to do
 * about a failed cache write — a missing entry only costs falling back to
 * `system` on the next cold start.
 */
export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, coerceThemePreference(preference));
  } catch {
    // Intentionally swallowed — see above.
  }
}
