/**
 * 2026-09-30 (the build run, the smoothness pass) — A DOCKED SHEET'S CARD, 120 Hz: the same slide
 * (or, with Reduce Motion, the same fade) as the fallback, as a Reanimated timing on the UI thread,
 * started at the card's first layout. The close hands back to JS once, when it has finished.
 */
import { useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  SHEET_CLOSE_MS,
  SHEET_CLOSE_REDUCED_MS,
  SHEET_OPEN_MS,
  SHEET_OPEN_REDUCED_MS,
  sheetTravel,
  type SheetCardProps,
} from './SheetCard.shared';

export function SheetCard({ visible, onClosed, style, children }: SheetCardProps) {
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion() === true;
  const progress = useSharedValue(0);
  const laidOut = useRef(false);

  const open = () => {
    progress.value = withTiming(1, {
      duration: reduced ? SHEET_OPEN_REDUCED_MS : SHEET_OPEN_MS,
      easing: Easing.out(Easing.cubic),
    });
  };

  useEffect(() => {
    if (visible) {
      if (laidOut.current) open();
      return;
    }
    progress.value = withTiming(
      0,
      { duration: reduced ? SHEET_CLOSE_REDUCED_MS : SHEET_CLOSE_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClosed)();
      }
    );
    // The open/close decision is the visibility's alone; the callbacks it reaches are read fresh.
  }, [visible]);

  const onLayout = () => {
    if (laidOut.current) return;
    laidOut.current = true;
    if (visible) open();
  };

  const motion = useAnimatedStyle(
    () =>
      reduced
        ? { opacity: progress.value }
        : { transform: [{ translateY: (1 - progress.value) * sheetTravel(height) }] },
    [reduced, height]
  );

  return (
    <Animated.View onLayout={onLayout} style={[style, motion]}>
      {children}
    </Animated.View>
  );
}
