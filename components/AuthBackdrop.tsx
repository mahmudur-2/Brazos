import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { authColors } from '../lib/authTheme';

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
function contour(cx: number, cy: number, base: number, step: number, count: number): Ring[] {
  return Array.from({ length: count }, (_, i) => ({
    size: base + step * i,
    cx,
    cy,
    color: i < 2 ? authColors.artLine : authColors.artLineFaint,
  }));
}

/** A circle sized so its top edge lands at `top` — i.e. a shallow wide sweep. */
function sweep(cx: number, top: number, size: number): Ring {
  return { size, cx, cy: top + size / 2, color: authColors.artLineGold };
}

export function AuthBackdrop({ variant = 'soft' }: { variant?: AuthBackdropVariant }) {
  const { width, height } = useWindowDimensions();
  const full = variant === 'full';

  // The corner cluster, anchored just past the top-right so only each circle's
  // lower-left quadrant is on screen. `soft` is pulled tighter and further out
  // than `full`: the form screens put their eyebrow and heading where Welcome
  // has decorative artwork, so its arcs have to stop above that block.
  const anchor = full
    ? { cx: width, cy: -height * 0.02, base: width * 0.7, step: width * 0.26, count: 4, wash: width * 1.05 }
    : { cx: width * 1.04, cy: -height * 0.05, base: width * 0.42, step: width * 0.16, count: 3, wash: width * 0.75 };

  const rings = useMemo<Ring[]>(() => {
    const list = contour(anchor.cx, anchor.cy, anchor.base, anchor.step, anchor.count);

    if (full) {
      // Two long, shallow sweeps through Welcome's empty mid-band — the lower
      // counterweight to the corner cluster, and the only place a full-width
      // line can cross without passing under something the user has to read.
      list.push(sweep(width * 0.5, height * 0.7, width * 2.6));
      list.push(sweep(width * 0.32, height * 0.77, width * 2.9));
    }

    return list;
  }, [anchor.base, anchor.count, anchor.cx, anchor.cy, anchor.step, full, height, width]);

  return (
    <View style={styles.root}>
      {/* One soft fill under the corner cluster. Depth, not another line —
          without it the corner reads as wireframe rather than as artwork. */}
      <View
        style={{
          position: 'absolute',
          left: anchor.cx - anchor.wash / 2,
          top: anchor.cy - anchor.wash / 2,
          width: anchor.wash,
          height: anchor.wash,
          borderRadius: anchor.wash / 2,
          backgroundColor: authColors.artWash,
        }}
      />

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
            borderWidth: StyleSheet.hairlineWidth * 2,
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
