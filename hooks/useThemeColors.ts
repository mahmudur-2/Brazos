import { useTheme, type ThemeColors } from '../lib/ThemeContext';

/**
 * The single reactive palette read. Backed by lib/ThemeContext.tsx's
 * ThemeProvider, which since 4D-4 resolves stored preference → system
 * appearance → light. This hook deliberately does not touch
 * `useColorScheme()`: the OS appearance is one of the INPUTS the provider
 * resolves, not something each consumer samples for itself.
 *
 * `palette` and `isDark` are what components style from; `preference` and
 * `setPreference` exist for the Appearance setting screen. lib/theme.ts
 * re-exports this hook so screens can take it from their standard import.
 */
export function useThemeColors(): ThemeColors {
  return useTheme();
}
