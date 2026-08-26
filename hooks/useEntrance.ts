import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { useReducedMotion } from './useReducedMotion';

/**
 * RUN MOTION1 (C2) — A STAGGERED ENTRANCE, AS A STYLE RATHER THAN A WRAPPER.
 *
 * components/FadeIn.tsx already animates a whole list arriving in place of a
 * loading state, and every screen that mounts it keeps it. This is the other
 * case: a screen whose sections are all present at first paint and should
 * arrive in reading order rather than together.
 *
 * WHY A HOOK AND NOT A COMPONENT. A wrapper component puts a NODE in the tree,
 * and a node changes layout — react-native-web's View is a flex container with
 * its own defaults, so a card that was a direct child of a `gap: 20` column
 * stops being one. Returning a STYLE means the caller's existing View simply
 * becomes an Animated.View with one more entry in its style array: same node,
 * same box, same DOM. Nothing about the resting layout can move, because
 * nothing about the layout is expressed here at all.
 *
 * WHAT IT SETTLES ON is exactly today's frame: opacity 1 and translateY 0. The
 * lift is 10pt, in the same register as FadeIn's 8 — enough to read as arrival,
 * not enough to read as a page transition.
 *
 * UNDER REDUCED MOTION IT RETURNS `undefined`, which is the same contract
 * hooks/usePressFeedback.ts keeps and for the same measured reason: the
 * screenshot harness renders with `prefers-reduced-motion: reduce`, and an
 * identity transform still promotes the element to its own compositing layer
 * and can move an antialiased edge by a level. A style that is not there
 * cannot do that. `useReducedMotion` is null until the setting has been read,
 * and only an explicit `false` animates.
 */

/** The gap between one section's start and the next's. */
export const STAGGER_MS = 70;

/** How far a section rises into place. */
const ENTRANCE_LIFT = 10;

/**
 * Soft but not slack: about 320ms to rest, no overshoot worth seeing. The last
 * section in a four-deep stagger is finished inside 550ms, which is well under
 * the harness's 2500ms settle window even if reduced motion were ever off.
 */
const ENTRANCE_SPRING = {
  stiffness: 140,
  damping: 20,
  mass: 0.9,
} as const;

export type EntranceStyle =
  | { opacity: Animated.Value; transform: [{ translateY: Animated.AnimatedInterpolation<number> }] }
  | undefined;

export function useEntrance(index = 0): EntranceStyle {
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const animated = reducedMotion === false;

  useEffect(() => {
    if (!animated) return;
    const animation = Animated.spring(progress, {
      toValue: 1,
      delay: index * STAGGER_MS,
      ...ENTRANCE_SPRING,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [animated, index, progress]);

  if (!animated) return undefined;
  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [ENTRANCE_LIFT, 0],
        }),
      },
    ],
  };
}
