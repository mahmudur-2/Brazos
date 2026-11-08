import { createContext, useContext, useMemo } from 'react';
import { useTheme, type ThemeColors } from '../lib/ThemeContext';
import { mapEmerald, mapPalette } from '../lib/theme';

/**
 * 2026-09-27 (the Lux remake, ruling 2) — A PINNED PALETTE FOR A SUBTREE.
 *
 * "Map (worker and customer), the Filters sheet and its popups: untouched —
 * layout, glass, behaviour — and their colours pinned to today's exact values
 * ('Pin today's colours'), so the palette change cannot reach them." The pin
 * is a React context read HERE, at the one palette read point, so every
 * component under a pinned subtree — the pane, the peek row, the chips, the
 * popover — resolves the pinned palette without being edited; `'map'` is
 * lib/theme.ts `mapPalette()`, the dark palette as it was before the remake.
 * Light never moved, so the pin is an identity there.
 */
export type PalettePin = 'map';
export const PalettePinContext = createContext<PalettePin | null>(null);

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
  const theme = useTheme();
  const pin = useContext(PalettePinContext);
  return useMemo(() => {
    let palette = theme.palette;
    let emerald = theme.emerald;
    if (pin === 'map' && theme.isDark) {
      palette = mapPalette(palette, theme.isDark);
      emerald = mapEmerald(emerald, theme.isDark);
    }
    if (palette === theme.palette && emerald === theme.emerald) return theme;
    return { ...theme, palette, emerald };
  }, [theme, pin]);
}
