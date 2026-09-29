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
 *
 * 2026-09-27 (the Lux remake, ruling 14) — THE CHECK DRAWS ITSELF. The glyph
 * is two STROKES of the disc's ink — the short leg, then the long — each a
 * rounded bar that grows from its own start point along its own angle. The
 * growth is a transform (a scaleX about the bar's left end), never a layout,
 * so the fast path runs it on the UI thread and the fallback on the native
 * driver; the still draws both legs full. The geometry is stated inside the
 * MARK_CHECK box, so the mark's size is still one number.
 */

/** The filled disc. */
export const MARK_DISC = 104;
/** The check inside it. */
export const MARK_CHECK = 54;
/** The concentric ring diameters, outward. */
export const MARK_RINGS = [140, 176] as const;
/** The artwork's box — the outermost ring plus room for the sparkles. */
export const MARK_FIELD = 200;
/** A stroke's thickness. */
export const CHECK_STROKE = 6;

/**
 * The two legs of the check, inside the MARK_CHECK box: each starts at (x, y),
 * runs `length` along `angle` (clockwise from the x axis), and is drawn over
 * the progress window [from, to] — the short leg first, the long leg from
 * the join. The join is the vertex at (22, 40); the long leg ends at (46, 12).
 */
export const CHECK_LEGS = [
  { key: 'short', x: 9, y: 27, length: 19, angle: 45, from: 0.36, to: 0.56 },
  { key: 'long', x: 22, y: 40, length: 37, angle: -49, from: 0.56, to: 0.9 },
] as const;

/** Where a leg's bar sits inside the check box before its transform. */
export function legBox(leg: (typeof CHECK_LEGS)[number]) {
  return { left: leg.x, top: leg.y - CHECK_STROKE / 2, width: leg.length, height: CHECK_STROKE };
}

/**
 * A leg's transform at a given growth (0..1): pivot to the left end, turn to
 * the leg's angle, scale along it, pivot back — so the bar grows out of its
 * start point rather than from its centre.
 */
export function legTransform(leg: (typeof CHECK_LEGS)[number], scaleX: number) {
  return [
    { translateX: -leg.length / 2 },
    { rotate: `${leg.angle}deg` },
    { scaleX },
    { translateX: leg.length / 2 },
  ];
}

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
    // The check box the two legs are drawn in, centred in the disc.
    check: {
      width: MARK_CHECK,
      height: MARK_CHECK,
    },
    // One leg: a rounded bar of the disc's ink, positioned by legBox() and
    // grown by legTransform().
    stroke: {
      position: 'absolute',
      borderRadius: CHECK_STROKE / 2,
      backgroundColor: colors.onForest,
    },
    sparkle: {
      position: 'absolute',
    },
  }),
);
