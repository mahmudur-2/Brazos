import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import {
  MARK_SPRING,
  OVER,
  POP_DOWN_SPRING,
  POP_PEAK,
  POP_UP_SPRING,
  markOpacity,
  markScale,
  type MarkPopProps,
  type SelectMarkProps,
} from './SelectMark.shared';

/**
 * THE ARRIVING MARK ON THE UI THREAD — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached only through
 * `resolveMotion120` from ./SelectMark.tsx, when worklets are present and motion is on. One
 * shared value per mark, sprung 0 ↔ 1; its opacity and scale (and the off face's opacity) are
 * functions of it on the UI thread. A tapped star's pop is one shared value sprung up and back.
 */
export function SelectMark({ on, mark, off }: SelectMarkProps) {
  const progress = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(on ? 1 : 0, MARK_SPRING);
  }, [on, progress]);
  const markMotion = useAnimatedStyle(() => ({
    opacity: markOpacity(progress.value),
    transform: [{ scale: markScale(progress.value) }],
  }));
  const offMotion = useAnimatedStyle(() => ({ opacity: 1 - markOpacity(progress.value) }));
  if (!off) return <Animated.View style={markMotion}>{mark}</Animated.View>;
  return (
    <View>
      <Animated.View style={offMotion}>{off}</Animated.View>
      <Animated.View style={[OVER, markMotion]}>{mark}</Animated.View>
    </View>
  );
}

export function MarkPop({ popKey, children }: MarkPopProps) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!popKey) return;
    scale.value = withSequence(withSpring(POP_PEAK, POP_UP_SPRING), withSpring(1, POP_DOWN_SPRING));
  }, [popKey, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={pop}>{children}</Animated.View>;
}
