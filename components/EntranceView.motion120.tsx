/**
 * 2026-09-30 (the build run, the smoothness pass) — A SCREEN SECTION'S ENTRANCE, 120 Hz: the same
 * fade-and-lift spring and stagger as hooks/useEntrance.ts, run by Reanimated on the UI thread.
 * Like the fallback, nothing moves until Reduce Motion is known to be off.
 */
import { useEffect, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { ENTRANCE_LIFT, ENTRANCE_SPRING, STAGGER_MS } from '../hooks/useEntrance';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { EntranceViewProps } from './EntranceView.shared';

export function EntranceView({ index = 0, skip = false, style, children }: EntranceViewProps) {
  // FIX-RUN F12: `skip` is read once, at mount (EntranceView.shared.tsx).
  const skipped = useRef(skip).current;
  // The stagger slot is the mount's too: a list row whose index shifts (a row added above it)
  // must not replay its entrance.
  const slot = useRef(index).current;
  const animated = useReducedMotion() === false && !skipped;
  // Hidden from the first frame when it will enter (as the fallback's value starts at 0), so a
  // section never paints whole, vanishes and fades back in.
  const progress = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) return;
    progress.value = 0;
    progress.value = withDelay(slot * STAGGER_MS, withSpring(1, ENTRANCE_SPRING));
  }, [animated, slot, progress]);

  const motion = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * ENTRANCE_LIFT }],
  }));

  // No style at all unless it enters: the house contract (hooks/usePressFeedback.ts), so a still
  // section carries no identity transform.
  return <Animated.View style={[style, animated ? motion : undefined]}>{children}</Animated.View>;
}
