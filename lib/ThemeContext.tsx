import { createContext, useContext, type PropsWithChildren } from 'react';
import { colors, type ColorPalette } from './theme';

/**
 * The theme resolution point — mounted once in App.tsx, read everywhere
 * through hooks/useThemeColors.ts (never through this file directly).
 *
 * 4D-3.5 SHIPS THIS PINNED TO LIGHT, deliberately. The dispatch's pre-made
 * decision: the resolution PATH exists now so the 4D-4 Light/Dark/System
 * setting is a change inside this provider rather than a rewrite of every
 * consumer — but in this stage the resolver returns the light palette
 * unconditionally. Specifically NOT here yet, all by design:
 *
 * - no `useColorScheme()` / Appearance read (app.json pins
 *   `userInterfaceStyle: "light"`, so the OS answer is a constant anyway;
 *   flipping that to "automatic" needs a native build — 4D-4, trap T1);
 * - no stored preference (4D-4 adds it via AsyncStorage, the
 *   modes/modeStorage.ts pattern — never SecureStore);
 * - no settings UI.
 *
 * 4D-4 turns `value` into real state resolved from those inputs; consumers
 * re-render through context exactly as they already do here.
 */

export type ResolvedTheme = {
  palette: ColorPalette;
  isDark: boolean;
};

const LIGHT_THEME: ResolvedTheme = { palette: colors, isDark: false };

const ThemeContext = createContext<ResolvedTheme>(LIGHT_THEME);

export function ThemeProvider({ children }: PropsWithChildren) {
  return <ThemeContext.Provider value={LIGHT_THEME}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}
