/**
 * FIX-RUN F12 — THE SELECTION FADE: the chooser and the native-driver fallback. What the three
 * pieces are, and why a host mounts them only when motion is on, is in ./Selection.shared.tsx.
 * The fallback crossfades two stacked layers by OPACITY (the native driver cannot drive a
 * colour), lets a label take its new colour at once, and springs the thumb by transform.
 */
import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, Text } from 'react-native';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import {
  SELECT_FADE_MS,
  THUMB_SPRING,
  thumbFrame,
  tintFrame,
  type SelectionTextProps,
  type SelectionThumbProps,
  type SelectionTintProps,
} from './Selection.shared';

export type { Paint, SelectionTextProps, SelectionThumbProps, SelectionTintProps } from './Selection.shared';

function TintFallback({ on, rest, chosen, radius, rimWidth, style }: SelectionTintProps) {
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const fade = Animated.timing(progress, {
      toValue: on ? 1 : 0,
      duration: SELECT_FADE_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    fade.start();
    return () => fade.stop();
  }, [on, progress]);
  const frame = tintFrame(radius, rimWidth);
  const restOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[frame, style, { backgroundColor: rest.fill, borderColor: rest.rim, opacity: restOpacity }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[frame, style, { backgroundColor: chosen.fill, borderColor: chosen.rim, opacity: progress }]}
      />
    </>
  );
}

function TextFallback({ on, rest, chosen, style, numberOfLines, children }: SelectionTextProps) {
  return (
    <Text style={[style, { color: on ? chosen : rest }]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

function ThumbFallback(props: SelectionThumbProps) {
  const { index, cellWidth } = props;
  const x = useRef(new Animated.Value((index ?? 0) * cellWidth)).current;
  const shown = useRef(new Animated.Value(index == null ? 0 : 1)).current;
  const placedWidth = useRef(cellWidth);
  useEffect(() => {
    const to = (index ?? 0) * cellWidth;
    // A new measure is a new place, not a move: the thumb lands there.
    if (placedWidth.current !== cellWidth) {
      placedWidth.current = cellWidth;
      x.setValue(to);
      shown.setValue(index == null ? 0 : 1);
      return;
    }
    const move = Animated.parallel([
      Animated.spring(x, { toValue: to, ...THUMB_SPRING, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(shown, { toValue: index == null ? 0 : 1, duration: SELECT_FADE_MS, useNativeDriver: USE_NATIVE_DRIVER }),
    ]);
    move.start();
    return () => move.stop();
  }, [cellWidth, index, shown, x]);
  return <Animated.View pointerEvents="none" style={[thumbFrame(props), { opacity: shown, transform: [{ translateX: x }] }]} />;
}

type SelectionModule = {
  SelectionTint: ComponentType<SelectionTintProps>;
  SelectionText: ComponentType<SelectionTextProps>;
  SelectionThumb: ComponentType<SelectionThumbProps>;
};

/** Chosen ONCE, at module load. Worklets alone. */
const Impl = resolveMotion120<SelectionModule>(
  motionCapability,
  'reanimated',
  () => require('./Selection.motion120') as SelectionModule,
  { SelectionTint: TintFallback, SelectionText: TextFallback, SelectionThumb: ThumbFallback }
);

export const SelectionTint = Impl.SelectionTint;
export const SelectionText = Impl.SelectionText;
export const SelectionThumb = Impl.SelectionThumb;
