import { useColorScheme } from 'react-native';
import { colors, darkColors, type ColorPalette } from '../lib/theme';

/**
 * Resolves the active color palette from the device's system appearance
 * setting, switching live if the user changes it while the app is open.
 * Currently only the Map tab consumes this — other screens intentionally
 * stay on the fixed light palette (see MapScreen/HotspotMap for the scoped
 * rollout), but the hook itself is app-wide-ready for future expansion.
 */
export function useThemeColors(): { palette: ColorPalette; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { palette: isDark ? darkColors : colors, isDark };
}
