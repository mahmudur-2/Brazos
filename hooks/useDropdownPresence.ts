import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { useReducedMotion } from './useReducedMotion';

/** How long a dropdown's rows take to arrive and to leave. */
export const DROPDOWN_OPEN_MS = 200;
export const DROPDOWN_CLOSE_MS = 160;

/**
 * 2026-09-29 (LUX-LIST-2 #7) — A ROW THAT OPENS IN PLACE (Profile's Legal and the other mode's tools).
 *
 * Opening mounts the rows under their parent and brings them in — a fade and a short drop from under
 * the parent row — while the parent's chevron turns over. Closing plays that backwards, then
 * unmounts the rows. Both are an opacity and a transform on the native driver: the height itself is
 * a layout property, which the native driver cannot move and RN's LayoutAnimation is banned from
 * moving (tests/motion120.test.mjs), so the list below steps to its new place and the rows animate
 * into it. With Reduce Motion the rows are simply there, or not.
 */
export function useDropdownPresence(open: boolean): {
  mounted: boolean;
  bodyStyle: Animated.WithAnimatedValue<ViewStyle>;
  chevronStyle: Animated.WithAnimatedValue<ViewStyle>;
} {
  const reduced = useReducedMotion() === true;
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reduced) {
      progress.setValue(open ? 1 : 0);
      setMounted(open);
      return;
    }
    if (open) setMounted(true);
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? DROPDOWN_OPEN_MS : DROPDOWN_CLOSE_MS,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    // `reduced` is read at the moment of each toggle; a change mid-flight waits for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return {
    mounted,
    bodyStyle: {
      opacity: progress,
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
    },
    chevronStyle: {
      transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
    },
  };
}
