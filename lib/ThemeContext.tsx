import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { ActivityIndicator, Appearance, StyleSheet, View, useColorScheme } from 'react-native';
import { colors, darkColors, type ColorPalette } from './theme';
import {
  DEFAULT_THEME_PREFERENCE,
  resolveColorScheme,
  type ThemePreference,
} from './themePreference';
import { readThemePreference, writeThemePreference } from './themePreferenceStorage';

/**
 * The theme resolution point — mounted once in App.tsx, read everywhere
 * through hooks/useThemeColors.ts (never through this file directly).
 *
 * 4D-3.5 shipped this pinned to light; 4D-4 makes it real. The resolution
 * order is stored preference → system appearance → light
 * (lib/themePreference.ts owns the rule; this provider owns the inputs):
 *
 * - The stored preference is read from AsyncStorage BEFORE the themed tree
 *   first paints — the ModeShell neutral-loader pattern. In App.tsx this
 *   provider sits under the launch layer, which covers the gate from the
 *   first frame, so a cold start in dark mode never flashes a light tree.
 * - The system appearance arrives via useColorScheme(), which subscribes to
 *   Appearance change events — a live OS flip repaints while the preference
 *   is `system`.
 * - A pinned preference is pushed down to the NATIVE side with
 *   Appearance.setColorScheme (RN 0.81.5 has it; react-native-web does not,
 *   hence the guard), so the keyboard, system alerts, share sheets and Apple
 *   Maps tiles follow the in-app choice instead of the OS. Applied at
 *   bootstrap with the stored value, not only on change.
 *
 * MODULE-SCOPE RULE (trap 1): nothing in this file may touch a palette VALUE
 * at module scope — lib/theme.ts re-exports the one reactive hook, so the
 * import graph is circular and only lazy (call-time) value access is safe.
 */

export type ThemeColors = {
  /** The resolved palette — the ONLY object components may style from. */
  palette: ColorPalette;
  isDark: boolean;
  /** The stored choice, for the Appearance setting screen. */
  preference: ThemePreference;
  /** Persists, repaints, and syncs native surfaces — the one mutation path. */
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeColors | null>(null);

/**
 * Native surfaces (keyboard, alerts, share sheets, MapKit tiles) follow the
 * OS trait unless told otherwise. A pinned Light/Dark tells them; `system`
 * hands control back with null. react-native-web's Appearance has no
 * setColorScheme (verified against the installed 0.21 source), so the guard
 * keeps the web bundle from crashing — web simply keeps its JS-side theme.
 */
function applyNativeColorScheme(preference: ThemePreference) {
  if (typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(preference === 'system' ? null : preference);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  // null = the stored preference is still being read; the gate below holds a
  // neutral loader for that beat instead of guessing a palette and swapping.
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);
  const systemScheme = useColorScheme();

  useEffect(() => {
    let alive = true;
    void readThemePreference().then((stored) => {
      if (!alive) return;
      // Bootstrap-apply so native surfaces honor the stored choice from the
      // first themed frame, not from the first visit to the setting.
      applyNativeColorScheme(stored);
      setPreferenceState(stored);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyNativeColorScheme(next);
    void writeThemePreference(next);
  }, []);

  const effective = preference ?? DEFAULT_THEME_PREFERENCE;
  const isDark = resolveColorScheme(effective, systemScheme) === 'dark';
  const palette: ColorPalette = isDark ? darkColors : colors;

  const value = useMemo<ThemeColors>(
    () => ({ palette, isDark, preference: effective, setPreference }),
    [palette, isDark, effective, setPreference],
  );

  if (preference === null) {
    // The system scheme is known synchronously, so the gate leans on it: a
    // dark phone gets a dark loader. (The one wrong-for-a-beat case — a
    // pinned dark preference on a light phone — stays invisible because the
    // launch layer covers this gate; see App.tsx.)
    const gate = systemScheme === 'dark' ? darkColors : colors;
    return (
      <View style={[styles.gate, { backgroundColor: gate.background }]}>
        <ActivityIndicator size="large" color={gate.primary} />
      </View>
    );
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeColors {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return value;
}

const styles = StyleSheet.create({
  // Colorless on purpose — the background is resolved at render time above.
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
