/**
 * 2026-09-30 (the build run, the smoothness pass) — A SCREEN SECTION'S ENTRANCE, 120 Hz: the same
 * fade-and-lift spring and stagger as hooks/useEntrance.ts, run by Reanimated on the UI thread.
 * Like the fallback, nothing moves until Reduce Motion is known to be off.
 */
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { ENTRANCE_LIFT, ENTRANCE_SPRING, STAGGER_MS } from '../hooks/useEntrance';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { EntranceViewProps } from './EntranceView.shared';

export function EntranceView({ index = 0, style, children }: EntranceViewProps) {
  const animated = useReducedMotion() === false;
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!animated) return;
    progress.value = 0;
    progress.value = withDelay(index * STAGGER_MS, withSpring(1, ENTRANCE_SPRING));
  }, [animated, index, progress]);

  const motion = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * ENTRANCE_LIFT }],
  }));

  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}
