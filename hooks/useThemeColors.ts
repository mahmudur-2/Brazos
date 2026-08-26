import { useMemo } from 'react';
import { useTheme, type ThemeColors } from '../lib/ThemeContext';
import { applyPaletteOverrides, usePaletteOverrides } from '../lib/designOverrides';

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
 *
 * RUN G1 (C2) — THIS IS THE TOKEN READ POINT, so the live design overrides
 * merge here: the studio's `gold` and `cardFill` dials fold into BOTH
 * resolved palettes before any consumer sees them. With no override set the
 * merge is an identity — the provider's own object comes back, so a fresh
 * app is byte-identical in behaviour and every palette-keyed style cache
 * works exactly as before.
 */
export function useThemeColors(): ThemeColors {
  const theme = useTheme();
  // RUN S2 (C1): the PALETTE SLICE, not the whole override set — a blur or
  // spacing dial keeps this slice's identity, so it repaints nothing here.
  const overrides = usePaletteOverrides();
  return useMemo(() => {
    const palette = applyPaletteOverrides(theme.palette, overrides, theme.isDark, 'app');
    const emerald = applyPaletteOverrides(theme.emerald, overrides, theme.isDark, 'emerald');
    if (palette === theme.palette && emerald === theme.emerald) return theme;
    return { ...theme, palette, emerald };
  }, [theme, overrides]);
}
