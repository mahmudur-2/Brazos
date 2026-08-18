import { useTheme } from '../lib/ThemeContext';
import type { ColorPalette } from '../lib/theme';

/**
 * The single reactive palette read. Backed by lib/ThemeContext.tsx's
 * ThemeProvider — which 4D-3.5 ships pinned to the light palette (see that
 * file for what 4D-4 adds). This hook no longer touches `useColorScheme()`:
 * the OS appearance is one of the INPUTS the provider will resolve in 4D-4,
 * not something each consumer samples for itself.
 *
 * The return shape is unchanged from the pre-provider version, so existing
 * consumers (components/MapPinIcon.tsx) compile and render identically.
 */
export function useThemeColors(): { palette: ColorPalette; isDark: boolean } {
  const { palette, isDark } = useTheme();
  return { palette, isDark };
}
