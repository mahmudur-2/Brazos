import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, useWindowDimensions, type ViewStyle } from 'react-native';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { useReducedMotion } from './useReducedMotion';

/** How long the card takes to rise and to fall. */
export const SHEET_OPEN_MS = 300;
export const SHEET_CLOSE_MS = 240;

/**
 * 2026-09-29 (LUX-LIST-2 #3) — THE ONE WAY A SLIDE-UP SHEET PRESENTS.
 *
 * The operator, on "View all" beside POPULAR SERVICES: "it animates by bringing the shadow up while it
 * goes up... it looks off.. i want the shadow to be instant the second you click". Every slide-up
 * sheet was a `<Modal animationType="slide">` with its dim INSIDE the sliding content, so the dim
 * travelled up the screen with the card. Now the Modal does not animate (`animationType="none"`):
 *
 * - OPENING: the dim covers the whole screen from the first frame (`dimVisible`), and only the card
 *   rises (`cardStyle`).
 * - CLOSING: the dim goes the moment the close begins (`dimVisible` false), the card falls, and only
 *   then does the Modal unmount (`mounted` false).
 * - REDUCE MOTION: the card fades in and out instead of sliding; the dim is instant either way.
 *
 * The card's motion is a transform or an opacity on the native driver — nothing runs on the JS thread
 * per frame (120 Hz). One hook, three callers (ServicePickerSheet, CreateSheet, ui/primitives/Sheet):
 * one implementation, never three copies (P3-31).
 */
export function useSheetPresence(visible: boolean): {
  mounted: boolean;
  dimVisible: boolean;
  cardStyle: Animated.WithAnimatedValue<ViewStyle>;
} {
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion() === true;
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.stopAnimation();
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: reduced ? 160 : SHEET_OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      return;
    }
    if (!mountedRef.current) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: reduced ? 140 : SHEET_CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    // `reduced` is read at the moment of each transition; a change mid-flight waits for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cardStyle: Animated.WithAnimatedValue<ViewStyle> = reduced
    ? { opacity: progress }
    : { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] };

  return { mounted, dimVisible: visible, cardStyle };
}
