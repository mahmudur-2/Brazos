import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { tap } from '../lib/haptics';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { useReducedMotion } from './useReducedMotion';

/**
 * RUN MOTION1 (C1) — ONE PRESS FEEDBACK, FOR EVERY PRIMITIVE CONTROL.
 *
 * A spring down to 0.97 on press-in, a spring back to 1 on release, and a
 * light haptic at the moment the finger lands. Every Pressable-based primitive
 * takes it from here rather than growing its own copy — which is what
 * components/AuthButton.tsx and components/SetupRow.tsx each did, at 0.985/100
 * /120 and 0.99/90/110 respectively. Those two are the auth and setup flows
 * and are left where they are; what this stops is the same divergence spreading
 * across the primitives.
 *
 * WHY A SPRING AND NOT A TIMING. A press is a physical event with a release,
 * and the two halves have to feel like one gesture: a spring interrupted
 * mid-flight carries its velocity into the reverse, where a timing restarts
 * from wherever it was and reads as a stutter on a fast double tap.
 *
 * -------------------------------------------------------------------------
 * WHY THE TRANSFORM DISAPPEARS ENTIRELY UNDER REDUCED MOTION, rather than
 * animating to the same resting value.
 *
 * `scripts/shots.mjs` renders with `prefers-reduced-motion: reduce` and
 * asserts it is in effect before it captures, so `useReducedMotion()` is TRUE
 * in every harness render. Playwright's animations flag freezes CSS
 * animations, not JS-driven `Animated` transforms, so a resting scale of 1 is
 * not enough on its own: react-native-web writes `transform: scale(1)` for it,
 * and a transform — even an identity one — promotes the element to its own
 * compositing layer and can change how its edges antialias. That is a
 * byte-difference in a screenshot for an animation that never played.
 *
 * So `style` is `undefined` unless motion is actually on. `useReducedMotion`
 * returns null until the setting has been read, and the contract is that only
 * an explicit `false` may animate — which is the same gate
 * components/SuccessMark.tsx applies above the motion120 boundary.
 *
 * THE HAPTIC IS NOT GATED ON IT. Reduced motion is a request about MOVEMENT.
 * lib/haptics is already a no-op on web and on any binary without the native
 * module, so there is nothing here for the harness to see either way.
 * -------------------------------------------------------------------------
 */

/** How far a control sinks under a finger. */
export const PRESS_SCALE = 0.97;

/**
 * Stiff and well damped: about 120ms to settle with no visible overshoot. A
 * bouncy press reads as a toy; this reads as the surface taking the weight.
 */
const PRESS_SPRING = {
  stiffness: 320,
  damping: 26,
  mass: 0.6,
} as const;

export type PressFeedback = {
  /** Spread onto the Animated.View that wraps the control, or omitted. */
  style: { transform: [{ scale: Animated.Value }] } | undefined;
  onPressIn: () => void;
  onPressOut: () => void;
};

export function usePressFeedback(): PressFeedback {
  const scale = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();
  const animated = reducedMotion === false;

  const spring = useCallback(
    (toValue: number) => {
      if (!animated) return;
      Animated.spring(scale, {
        toValue,
        ...PRESS_SPRING,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },
    [animated, scale],
  );

  const onPressIn = useCallback(() => {
    tap();
    spring(PRESS_SCALE);
  }, [spring]);

  const onPressOut = useCallback(() => spring(1), [spring]);

  return {
    style: animated ? { transform: [{ scale }] } : undefined,
    onPressIn,
    onPressOut,
  };
}
