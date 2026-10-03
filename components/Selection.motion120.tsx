import { useEffect, useRef } from 'react';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  SELECT_FADE_MS,
  THUMB_SPRING,
  fadeEnds,
  thumbFrame,
  tintFrame,
  type SelectionTextProps,
  type SelectionThumbProps,
  type SelectionTintProps,
} from './Selection.shared';

/**
 * THE SELECTION FADE ON THE UI THREAD — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only through
 * `resolveMotion120` from ./Selection.tsx, when worklets are present. A colour IS drivable here:
 * each piece holds one shared value, 0 → 1, and its fill, rim or ink is `interpolateColor` of it
 * on the UI thread, so a chosen chip's colours move together on the display's own frames. The
 * thumb springs by transform, the same spring as the fallback.
 */
function useFade(on: boolean) {
  const progress = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(on ? 1 : 0, { duration: SELECT_FADE_MS });
  }, [on, progress]);
  return progress;
}

export function SelectionTint({ on, rest, chosen, radius, rimWidth, style }: SelectionTintProps) {
  const progress = useFade(on);
  const [fillFrom, fillTo] = fadeEnds(rest.fill, chosen.fill);
  const [rimFrom, rimTo] = fadeEnds(rest.rim, chosen.rim);
  const paint = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(progress.value, [0, 1], [fillFrom, fillTo]),
      borderColor: interpolateColor(progress.value, [0, 1], [rimFrom, rimTo]),
    }),
    [fillFrom, fillTo, rimFrom, rimTo]
  );
  return <Animated.View pointerEvents="none" style={[tintFrame(radius, rimWidth), style, paint]} />;
}

export function SelectionText({ on, rest, chosen, style, numberOfLines, children }: SelectionTextProps) {
  const progress = useFade(on);
  const [from, to] = fadeEnds(rest, chosen);
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(progress.value, [0, 1], [from, to]) }), [from, to]);
  return (
    <Animated.Text style={[style, ink]} numberOfLines={numberOfLines}>
      {children}
    </Animated.Text>
  );
}

export function SelectionThumb(props: SelectionThumbProps) {
  const { index, cellWidth } = props;
  const x = useSharedValue((index ?? 0) * cellWidth);
  const shown = useSharedValue(index == null ? 0 : 1);
  const placedWidth = useRef(cellWidth);
  useEffect(() => {
    const to = (index ?? 0) * cellWidth;
    // A new measure is a new place, not a move: the thumb lands there.
    if (placedWidth.current !== cellWidth) {
      placedWidth.current = cellWidth;
      x.value = to;
      shown.value = index == null ? 0 : 1;
      return;
    }
    x.value = withSpring(to, THUMB_SPRING);
    shown.value = withTiming(index == null ? 0 : 1, { duration: SELECT_FADE_MS });
  }, [cellWidth, index, shown, x]);
  const motion = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateX: x.value }] }));
  return <Animated.View pointerEvents="none" style={[thumbFrame(props), motion]} />;
}
