/**
 * The Light/Dark/System appearance vocabulary (Stage 4D-4).
 *
 * Pure on purpose — no React, no React Native, no AsyncStorage import
 * anywhere in this file — so the coercion and resolution rules below can be
 * *executed* by tests/themeResolution.test.mjs rather than asserted about as
 * text. Same arrangement as modes/types.ts, and for the same reason.
 *
 * The preference is a DEVICE choice, deliberately: it is stored locally only
 * (lib/themePreferenceStorage.ts), never in a database column and never
 * synced — and it must resolve before auth does, so a per-user key would be
 * impossible anyway.
 */

/** Exactly three values. `system` follows the OS trait; the other two pin. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * What a device is on before it has ever said otherwise, and what every
 * unreadable/absent/invalid stored value falls back to. System, because a
 * user who has never opened the Appearance setting expects the app to follow
 * their phone.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * The single narrowing point. Anything that is not exactly one of the three
 * literals — null, undefined, 'Dark', a stale value from a future shape —
 * becomes the fallback rather than propagating.
 */
export function coerceThemePreference(
  value: unknown,
  fallback: ThemePreference = DEFAULT_THEME_PREFERENCE,
): ThemePreference {
  return isThemePreference(value) ? value : fallback;
}

/**
 * The device-local storage key. Versioned so a future shape change can take
 * a new key instead of migrating stored values — the modes/types.ts pattern,
 * minus the user scoping (see the module docblock).
 */
export const THEME_PREFERENCE_STORAGE_KEY = 'brazos.themePreference.v1';

/** What the app actually renders in. There is no third rendered state. */
export type ResolvedScheme = 'light' | 'dark';

/**
 * The one resolution rule: stored preference → system appearance → light.
 *
 * `system` is React Native's `useColorScheme()` answer, which is null (or on
 * some platforms undefined) when the OS has no opinion — that resolves LIGHT,
 * never dark: an unknown appearance must not surprise a user with a palette
 * flip.
 */
export function resolveColorScheme(
  preference: ThemePreference,
  system: 'light' | 'dark' | null | undefined,
): ResolvedScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
