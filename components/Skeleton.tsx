import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { radius, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { USE_NATIVE_DRIVER } from '../lib/motion';

/**
 * One opacity value drives every placeholder in the app, rather than each
 * block owning a loop. Several skeletons on screen then breathe together
 * instead of drifting out of phase with each other, and the cost is a single
 * animation no matter how many are mounted.
 */
const pulse = new Animated.Value(1);
let mounted = 0;
let loop: Animated.CompositeAnimation | null = null;

function start() {
  if (loop) return;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 0.45,
        duration: 700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(pulse, {
        toValue: 1,
        duration: 700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ])
  );
  loop.start();
}

function stop() {
  loop?.stop();
  loop = null;
  pulse.setValue(1);
}

/**
 * A loading placeholder block. Sized entirely by `style` — this only supplies
 * the fill, the corner and the pulse, so a caller can shape it into a
 * thumbnail, a line of text, or anything else without a variant prop.
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // Ref-counted so the loop only runs while something is actually waiting,
  // rather than ticking for the life of the process.
  useEffect(() => {
    mounted += 1;
    start();
    return () => {
      mounted -= 1;
      if (mounted <= 0) {
        mounted = 0;
        stop();
      }
    };
  }, []);

  return <Animated.View style={[styles.block, { opacity: pulse }, style]} />;
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  block: {
    backgroundColor: colors.neutralBg,
    borderRadius: radius.sm,
  },
  }),
);
