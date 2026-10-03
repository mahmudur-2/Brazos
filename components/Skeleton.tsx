import { useEffect } from 'react';
import { Animated, AppState, Easing, StyleSheet, type NativeEventSubscription, type StyleProp, type ViewStyle } from 'react-native';
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
/**
 * FIX-RUN F16 — the one module loop pauses while the app is in the background and picks up again
 * when it comes back, for as long as any placeholder is still mounted. It is one loop for the whole
 * app (above), so it asks the app's state rather than a screen's focus.
 */
let appState: NativeEventSubscription | null = null;

function onAppState(state: string) {
  if (state === 'active') {
    if (mounted > 0) start();
  } else {
    stop();
  }
}

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
    if (!appState) appState = AppState.addEventListener('change', onAppState);
    if (AppState.currentState !== 'background') start();
    return () => {
      mounted -= 1;
      if (mounted <= 0) {
        mounted = 0;
        stop();
        appState?.remove();
        appState = null;
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
