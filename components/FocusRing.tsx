import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { metricStyles, withAlpha } from '../lib/theme';

/** How long the glow takes to come up and go down — the field's old crossfade. */
export const FOCUS_RING_MS = 160;
/** The soft ring outside the field (sim.html `.in:focus-within`, 3px at .14). */
const HALO = 3;
const HALO_ALPHA = 0.14;
/** The field's own edge while typing — the accent at .55 over its 1pt rim. */
const EDGE_ALPHA = 0.55;

/**
 * 2026-09-28 (LUX-LIST-64 #8) — THE FIELD YOU ARE TYPING IN GLOWS.
 *
 * sim.html's `.in:focus-within{border-color:rgba(126,226,180,.55);box-shadow:0
 * 0 0 3px rgba(126,226,180,.14)}` in the app's own mint (the light token's green
 * in light): the rim turns the accent at .55 and a soft 3pt ring at .14 shows
 * around the field, only while it has focus. Drawn as two outlines laid over
 * the field — its edge exactly over the field's own 1pt border, the ring 3pt
 * outside it — and faded as ONE opacity on the native driver, so it rides the
 * 120 Hz display thread and nothing lays out again. Reduce Motion: it appears
 * and goes at once.
 *
 * Mount it as the LAST child of the bordered view (the field), which must not
 * clip its children. `radius` is the field's corner; `borderWidth` its rim.
 */
export function FocusRing({
  focused,
  color,
  radius,
  borderWidth = 1,
}: {
  focused: boolean;
  color: string;
  radius: number;
  borderWidth?: number;
}) {
  const styles = stylesFor();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: reducedMotion ? 0 : FOCUS_RING_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [focused, progress, reducedMotion]);

  const edgeInset = -borderWidth;
  const haloInset = -(borderWidth + HALO);
  return (
    <Animated.View pointerEvents="none" style={[styles.layer, { opacity: progress }]}>
      <View
        style={[
          styles.outline,
          {
            top: haloInset,
            left: haloInset,
            right: haloInset,
            bottom: haloInset,
            borderRadius: radius + HALO + borderWidth,
            borderWidth: HALO,
            borderColor: withAlpha(color, HALO_ALPHA),
          },
        ]}
      />
      <View
        style={[
          styles.outline,
          {
            top: edgeInset,
            left: edgeInset,
            right: edgeInset,
            bottom: edgeInset,
            borderRadius: radius,
            borderWidth,
            borderColor: withAlpha(color, EDGE_ALPHA),
          },
        ]}
      />
    </Animated.View>
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    layer: {
      ...StyleSheet.absoluteFillObject,
    },
    outline: {
      position: 'absolute',
    },
  })
);
