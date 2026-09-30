/**
 * 2026-09-30 (the build run, the smoothness pass) — A ROW THAT OPENS IN PLACE, 120 Hz: the same
 * fade, settle and half-turn as hooks/useDropdownPresence.ts, as Reanimated timings on the UI
 * thread. The body hands back to JS once, when a close has finished, to unmount its rows.
 */
import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DROPDOWN_CLOSE_MS, DROPDOWN_OPEN_MS } from '../hooks/useDropdownPresence';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { DROPDOWN_SETTLE, type DropdownRevealProps } from './DropdownReveal.shared';

function useOpenProgress(open: boolean, onClosed?: () => void) {
  const reduced = useReducedMotion() === true;
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      progress.value = open ? 1 : 0;
      if (!open) onClosed?.();
      return;
    }
    progress.value = withTiming(
      open ? 1 : 0,
      { duration: open ? DROPDOWN_OPEN_MS : DROPDOWN_CLOSE_MS, easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic) },
      (finished) => {
        if (finished && !open && onClosed) runOnJS(onClosed)();
      }
    );
    // The motion follows `open` alone; onClosed is a stable setter.
  }, [open, reduced]);
  return progress;
}

export function DropdownBody({ open, style, children, grow = false }: DropdownRevealProps) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  const progress = useOpenProgress(open, () => setMounted(false));
  // A growing body: the content's own height, measured as it lays out (it may change while open —
  // the reuse strip's rows arrive after the sheet opens).
  const contentHeight = useSharedValue(0);
  const motion = useAnimatedStyle(() =>
    grow
      ? { opacity: progress.value, height: progress.value * contentHeight.value, overflow: 'hidden' }
      : { opacity: progress.value, transform: [{ translateY: (progress.value - 1) * DROPDOWN_SETTLE }] }
  );
  if (!mounted) return null;
  if (!grow) return <Animated.View style={[style, motion]}>{children}</Animated.View>;
  const measure = (event: LayoutChangeEvent) => {
    contentHeight.value = event.nativeEvent.layout.height;
  };
  return (
    <Animated.View style={motion}>
      <View style={style} onLayout={measure}>
        {children}
      </View>
    </Animated.View>
  );
}

export function DropdownChevron({ open, style, children }: DropdownRevealProps) {
  const progress = useOpenProgress(open);
  const motion = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}
