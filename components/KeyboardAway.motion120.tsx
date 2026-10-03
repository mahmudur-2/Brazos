/**
 * F8 — A BLOCK THAT STEPS ASIDE FOR THE KEYBOARD, 120 Hz: the block fades in and out as a Reanimated
 * layout animation (its own worklets below), and the block below it glides to its new place with a
 * LinearTransition — both on the UI thread, over the keyboard's own duration, and at the same time:
 * an exiting block leaves the layout at once while it fades, so the glide does not wait for the fade.
 * No React Native LayoutAnimation (tests/motion120.test.mjs bans it). The first mount draws as it
 * is, with no fade.
 */
import { useEffect, useMemo, useRef } from 'react';
import Animated, { Easing, LinearTransition, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { KeyboardAwayProps, KeyboardShiftProps } from './KeyboardAway.shared';

// Built on the JS thread and captured by the worklets below (Reanimated's easings are worklets).
const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);

function fadeInOver(durationMs: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0 },
      animations: { opacity: withTiming(1, { duration: durationMs, easing: EASE_OUT }) },
    };
  };
}

function fadeOutOver(durationMs: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 1 },
      animations: { opacity: withTiming(0, { duration: durationMs, easing: EASE_IN }) },
    };
  };
}

export function KeyboardAway({ hidden, durationMs, style, children }: KeyboardAwayProps) {
  const reduced = useReducedMotion() !== false;
  const firstMount = useRef(true);
  useEffect(() => {
    firstMount.current = false;
  }, []);
  const entering = useMemo(() => fadeInOver(durationMs), [durationMs]);
  const exiting = useMemo(() => fadeOutOver(durationMs), [durationMs]);
  if (hidden) return null;
  return (
    <Animated.View
      style={style}
      entering={reduced || firstMount.current ? undefined : entering}
      exiting={reduced ? undefined : exiting}
    >
      {children}
    </Animated.View>
  );
}

export function KeyboardShift({ durationMs, style, children }: KeyboardShiftProps) {
  const reduced = useReducedMotion() !== false;
  return (
    <Animated.View style={style} layout={reduced ? undefined : LinearTransition.duration(durationMs)}>
      {children}
    </Animated.View>
  );
}
