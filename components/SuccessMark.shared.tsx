import { StyleSheet } from 'react-native';
import { glow, radius, shadows, themedStyles, withAlpha, type ColorPalette } from '../lib/theme';

/**
 * THE PUBLISHED-JOB MARK — the artwork both drivers draw.
 *
 * Everything a viewer can see lives here: the geometry, the sparkle table and
 * the stylesheet. The two implementations differ ONLY in whether the pieces
 * move, so a build with worklets and a build without cannot drift into two
 * different marks.
 *
 * FLAT FILLS, AND NOTHING ELSE (L1). There is no gradient, blur or SVG library
 * in this app and none may be added: the disc is one solid fill, the rings are
 * border-only circles, and the "glow" is an iOS shadow plus those rings —
 * which is what `glow.halo` in ui/tokens already is.
 *
 * NO NODE CARRIES BOTH A SHADOW AND A CLIP. On iOS `overflow: 'hidden'` sets
 * masksToBounds, which clips the layer's own shadow off. Nothing here clips at
 * all — the disc's roundness is a border radius on a node with no overflow
 * rule — so the halo survives.
 */

/** The filled disc. */
export const MARK_DISC = 104;
/** The check inside it. */
export const MARK_CHECK = 54;
/** The concentric ring diameters, outward. */
export const MARK_RINGS = [140, 176] as const;
/** The artwork's box — the outermost ring plus room for the sparkles. */
export const MARK_FIELD = 200;

/**
 * The sparkles, as fractions of the field.
 *
 * A TABLE RATHER THAN TRIGONOMETRY, deliberately: these are placed by eye
 * around a disc that is not centred in its own field the way a circle of
 * points would be, and a formula would have to be fudged back to these
 * numbers anyway. `phase` is where each one peaks across the entrance, so
 * they arrive as a scatter instead of a pulse.
 */
export const MARK_SPARKLES = [
  { key: 'ne', x: 0.86, y: 0.2, size: 16, phase: 0.42 },
  { key: 'nw', x: 0.13, y: 0.29, size: 13, phase: 0.55 },
  { key: 'n', x: 0.52, y: 0.03, size: 12, phase: 0.34 },
  { key: 'se', x: 0.83, y: 0.79, size: 14, phase: 0.62 },
  { key: 'sw', x: 0.16, y: 0.76, size: 11, phase: 0.5 },
] as const;

/** How long the whole entrance takes. Roughly a second, once, never looped. */
export const MARK_ENTRANCE_MS = 950;

export type SuccessMarkProps = {
  /** Announced to a screen reader in place of the artwork. */
  accessibilityLabel: string;
};

/** A sparkle's absolute offset inside the field. */
export function sparkleOffset(sparkle: (typeof MARK_SPARKLES)[number]) {
  return {
    left: sparkle.x * MARK_FIELD - sparkle.size / 2,
    top: sparkle.y * MARK_FIELD - sparkle.size / 2,
  };
}

export const markStylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    field: {
      width: MARK_FIELD,
      height: MARK_FIELD,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Border-only circles behind the disc. Two of them, stepping down in
    // strength so the eye reads them as one halo rather than two rules.
    ring: {
      position: 'absolute',
      borderWidth: 1,
      borderRadius: radius.pill,
      borderColor: withAlpha(colors.emerald, 0.45),
    },
    ringOuter: {
      borderColor: withAlpha(colors.emerald, 0.22),
    },
    // Decision 3's one solid conversion fill, with decision 12's halo behind
    // it in dark. Light keeps its Heritage card shadow — the halo is a
    // Prestige treatment and gates on the palette, as every other caller of
    // it does.
    disc: {
      width: MARK_DISC,
      height: MARK_DISC,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.forest,
      ...shadows.card,
    },
    discGlow: glow.halo(withAlpha(colors.emerald, 0.55)),
    sparkle: {
      position: 'absolute',
    },
  }),
);
