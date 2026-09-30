/**
 * 2026-09-30 (the build run, the smoothness pass) — A DOCKED SHEET'S CARD: the chooser and the
 * native-driver fallback. The 120 Hz path (`SheetCard.motion120.tsx`) runs the same motion as a
 * Reanimated timing on the UI thread; a binary without worklets takes this file's core `Animated`
 * on the native driver. Both wait for the card's first layout before they move it
 * (SheetCard.shared.tsx says why).
 */
import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, Easing, useWindowDimensions } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import {
  SHEET_CLOSE_MS,
  SHEET_CLOSE_REDUCED_MS,
  SHEET_OPEN_MS,
  SHEET_OPEN_REDUCED_MS,
  sheetTravel,
  type SheetCardProps,
} from './SheetCard.shared';

export type { SheetCardProps } from './SheetCard.shared';

function SheetCardFallback({ visible, onClosed, style, children }: SheetCardProps) {
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion() === true;
  const progress = useRef(new Animated.Value(0)).current;
  const laidOut = useRef(false);

  const open = () => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? SHEET_OPEN_REDUCED_MS : SHEET_OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  useEffect(() => {
    if (visible) {
      if (laidOut.current) open();
      return;
    }
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: reduced ? SHEET_CLOSE_REDUCED_MS : SHEET_CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) onClosed();
    });
    // The open/close decision is the visibility's alone; the callbacks it reaches are read fresh.
  }, [visible]);

  const onLayout = () => {
    if (laidOut.current) return;
    laidOut.current = true;
    if (visible) open();
  };

  const motion = reduced
    ? { opacity: progress }
    : { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetTravel(height), 0] }) }] };

  return (
    <Animated.View onLayout={onLayout} style={[style, motion]}>
      {children}
    </Animated.View>
  );
}

const Impl = resolveMotion120<ComponentType<SheetCardProps>>(
  motionCapability,
  'reanimated',
  () => require('./SheetCard.motion120').SheetCard as ComponentType<SheetCardProps>,
  SheetCardFallback
);

export function SheetCard(props: SheetCardProps) {
  return <Impl {...props} />;
}

