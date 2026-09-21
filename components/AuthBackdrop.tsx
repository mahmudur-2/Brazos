import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { authColors } from '../lib/authTheme';
import { useThemeColors, withAlpha } from '../lib/theme';

/**
 * The decorative contour art behind the ivory auth screens.
 *
 * Built from plain bordered circles rather than SVG or a gradient: neither
 * `react-native-svg` nor `expo-linear-gradient` is installed, and adding either
 * for background ornament would be a dependency the flow doesn't otherwise
 * need. A circle whose centre is parked off-screen shows only an arc, and a few
 * concentric ones read as the contour lines on a survey map — which is the
 * whole effect.
 *
 * Placement is measured against the compositions rather than eyeballed. The
 * top-right corner is decorative on every auth screen, and Welcome leaves a
 * deep empty band between its body copy and its CTAs — those are the two places
 * a line can go. The bottom-left corner looks free but isn't: the CTAs reach to
 * within 20pt of it, so anything anchored there crosses a button. Every stroke
 * is a hairline at <= 13% alpha on ivory, behind the content, and takes no
 * touches.
 */

export type AuthBackdropVariant = 'full' | 'soft';

/**
 * 2026-09-21 — `full` IS THE SHIPPED WELCOME PAGE'S CORNER (docs/mockups/html/
 * lux/welcome-ship.html): five circles about one centre 1.221 widths across
 * and 0.047 heights above the frame, radii from 0.331 of the width in steps
 * of 0.0763, each a 1-pt gold hairline one step fainter than the one inside
 * it. Nothing else: the page has no wash disc and no mid-band sweep. The same
 * geometry and alphas in both themes; only the gold is the palette's.
 */
const WELCOME_CORNER = {
  cx: 1.221,
  cy: -0.047,
  radius: 0.3308,
  step: 0.0763,
  alphas: [0.36, 0.3, 0.24, 0.18, 0.12],
} as const;

type Ring = {
  size: number;
  /** Centre of the circle, in points from the top-left of the screen. */
  cx: number;
  cy: number;
  color: string;
};

/**
 * `count` concentric circles about one centre. The inner two carry the
 * strongest stroke and the rest fade out, so a cluster reads as one shape
 * dissolving rather than as a stack of identical rings.
 */
function contour(
  cx: number,
  cy: number,
  base: number,
  step: number,
  count: number,
  strokes: Strokes
): Ring[] {
  return Array.from({ length: count }, (_, i) => ({
    size: base + step * i,
    cx,
    cy,
    color: i < 2 ? strokes.line : strokes.faint,
  }));
}

/** A circle sized so its top edge lands at `top` — i.e. a shallow wide sweep. */
function sweep(cx: number, top: number, size: number, strokes: Strokes): Ring {
  return { size, cx, cy: top + size / 2, color: strokes.gold };
}

type Strokes = { line: string; faint: string; gold: string; wash: string };

/**
 * Masters 2/3/4 draw these arcs as gold hairlines over near-black. `themed`
 * is the same opt-in the rest of the auth surface takes: absent, or in light,
 * the Heritage ivory contour is unchanged.
 */
export function AuthBackdrop({
  variant = 'soft',
  themed = false,
}: {
  variant?: AuthBackdropVariant;
  themed?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const { palette, isDark } = useThemeColors();
  const full = variant === 'full';
  // Memoised so the ring list below keeps a stable dependency — a fresh
  // object every render would defeat its own useMemo.
  const strokes = useMemo<Strokes>(
    () =>
      themed && isDark
        ? {
            line: withAlpha(palette.gold, 0.3),
            faint: withAlpha(palette.gold, 0.14),
            gold: withAlpha(palette.gold, 0.18),
            wash: withAlpha(palette.forest, 0.34),
          }
        : {
            line: authColors.artLine,
            faint: authColors.artLineFaint,
            gold: authColors.artLineGold,
            wash: authColors.artWash,
          },
    [isDark, palette.forest, palette.gold, themed]
  );

  // The corner cluster, anchored just past the top-right so only each circle's
  // lower-left quadrant is on screen. `soft` is pulled tighter and further out
  // than `full`: the form screens put their eyebrow and heading where Welcome
  // has decorative artwork, so its arcs have to stop above that block.
  const anchor = full
    ? { cx: width, cy: -height * 0.02, base: width * 0.7, step: width * 0.26, count: 4, wash: width * 1.05 }
    : { cx: width * 1.04, cy: -height * 0.05, base: width * 0.42, step: width * 0.16, count: 3, wash: width * 0.75 };

  const rings = useMemo<Ring[]>(() => {
    if (full) {
      return WELCOME_CORNER.alphas.map((alpha, i) => ({
        // + 2: the page's circle is a content box with its 1-pt border outside.
        size: (WELCOME_CORNER.radius + WELCOME_CORNER.step * i) * width * 2 + 2,
        cx: width * WELCOME_CORNER.cx,
        cy: height * WELCOME_CORNER.cy,
        color: withAlpha(palette.authGold, alpha),
      }));
    }
    const list = contour(
      anchor.cx,
      anchor.cy,
      anchor.base,
      anchor.step,
      anchor.count,
      strokes
    );

    if (full) {
      // Two long, shallow sweeps through Welcome's empty mid-band — the lower
      // counterweight to the corner cluster, and the only place a full-width
      // line can cross without passing under something the user has to read.
      list.push(sweep(width * 0.5, height * 0.7, width * 2.6, strokes));
      list.push(sweep(width * 0.32, height * 0.77, width * 2.9, strokes));
    }

    return list;
  }, [
    anchor.base,
    anchor.count,
    anchor.cx,
    anchor.cy,
    anchor.step,
    full,
    height,
    palette.authGold,
    strokes,
    width,
  ]);

  return (
    <View style={styles.root}>
      {/* One soft fill under the corner cluster. Depth, not another line —
          without it the corner reads as wireframe rather than as artwork.
          Welcome's page carries its own haze in the scaffold's ground, so
          `full` draws none. */}
      {full ? null : (
      <View
        style={{
          position: 'absolute',
          left: anchor.cx - anchor.wash / 2,
          top: anchor.cy - anchor.wash / 2,
          width: anchor.wash,
          height: anchor.wash,
          borderRadius: anchor.wash / 2,
          backgroundColor: strokes.wash,
        }}
      />
      )}

      {rings.map((ring, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: ring.cx - ring.size / 2,
            top: ring.cy - ring.size / 2,
            width: ring.size,
            height: ring.size,
            borderRadius: ring.size / 2,
            // The page's arcs are 1 pt; the form screens' contour keeps its
            // two-hairline stroke.
            borderWidth: full ? 1 : StyleSheet.hairlineWidth * 2,
            borderColor: ring.color,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    // The circles are deliberately larger than the screen; without this they
    // would give a web window a scrollbar.
    overflow: 'hidden',
    pointerEvents: 'none',
  },
});
