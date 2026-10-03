/**
 * 2026-09-30 (the build run, the smoothness pass) — A ROW THAT OPENS IN PLACE, 120 Hz: the same
 * fade, settle and half-turn as hooks/useDropdownPresence.ts, as Reanimated timings on the UI
 * thread. The body hands back to JS once, when a close has finished, to unmount its rows.
 */
import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
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
  // 2026-10-03 (the operator's phone): the content is measured in a layer of its own — absolute,
  // pinned to the top and both sides, free in height — never in the flow of the animated box.
  // In the flow, Yoga measures it against the box's current height, 0 before it opens, and a
  // scroller inside (the reuse strip's horizontal list) is clamped to what is available: it
  // reported 0, `contentHeight` stayed 0, and the strip never opened. Web flexbox never clamps,
  // so the harness saw it open. The box still animates to the measured height and clips.
  return (
    <Animated.View style={motion}>
      <View style={[style, MEASURING_LAYER]} onLayout={measure}>
        {children}
      </View>
    </Animated.View>
  );
}

/** Position only, no metric — a plain object, outside the lazy-sheet rule (tests/themeResolution). */
const MEASURING_LAYER: ViewStyle = { position: 'absolute', left: 0, right: 0, top: 0 };

export function DropdownChevron({ open, style, children }: DropdownRevealProps) {
  const progress = useOpenProgress(open);
  const motion = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}
