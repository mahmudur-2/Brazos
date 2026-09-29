import { createContext, useContext, useMemo } from 'react';
import { useTheme, type ThemeColors } from '../lib/ThemeContext';
import {
  applyPaletteOverrides,
  useMetricsGeneration,
  usePaletteOverrides,
} from '../lib/designOverrides';
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
  // menu dial keeps this slice's identity, so it repaints nothing here.
  const overrides = usePaletteOverrides();
  // RUN T1 (C2/D5) — AND THE METRIC GENERATION, which is how a spacing or
  // radius dial reaches 102 files nobody edited. Every themed component calls
  // this hook, so subscribing here re-renders all of them on a metric write;
  // their `stylesFor(palette)` then sees the new generation and rebuilds. The
  // palette object itself is untouched by a metric, so a theme change and a
  // metric change stay two independent reasons to repaint.
  const generation = useMetricsGeneration();
  const pin = useContext(PalettePinContext);
  return useMemo(() => {
    let palette = applyPaletteOverrides(theme.palette, overrides, theme.isDark, 'app');
    let emerald = applyPaletteOverrides(theme.emerald, overrides, theme.isDark, 'emerald');
    if (pin === 'map' && theme.isDark) {
      palette = mapPalette(palette, theme.isDark);
      emerald = mapEmerald(emerald, theme.isDark);
    }
    if (palette === theme.palette && emerald === theme.emerald) return theme;
    return { ...theme, palette, emerald };
  }, [theme, overrides, generation, pin]);
}
