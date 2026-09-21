import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '../lib/theme';
import {
  RIM_INSET,
  RIM_LAP_MS,
  RIM_LIGHT,
  rimPoint,
  rimStylesFor,
  type RimLightProps,
} from './RimLight.shared';

/**
 * THE RIM LIGHT ON REANIMATED — the 120 Hz path.
 *
 * One of the file kinds allowed to name a vendor package directly; reached
 * only through `resolveMotion120` from ./RimLight.tsx, which requires it
 * solely when worklets are present AND the system has not asked for reduced
 * motion. On a binary without reanimated this file is never evaluated.
 *
 * ONE SHARED VALUE. A single 0 → 1 progress, driven by one linear
 * `withTiming` repeated forever; the light's translate and rotate are a
 * function of it, computed on the UI thread by the same `rimPoint` the
 * fallback samples. Nothing crosses the bridge once the lap has started.
 */
export function RimLight({ radius }: RimLightProps) {
  const { palette, isDark } = useThemeColors();
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: RIM_LAP_MS, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const width = box?.width ?? 0;
  const height = box?.height ?? 0;
  const lightStyle = useAnimatedStyle(() => {
    const p = rimPoint(progress.value, width, height, radius, RIM_INSET);
    return {
      transform: [
        { translateX: p.x - RIM_LIGHT.width / 2 },
        { translateY: p.y - RIM_LIGHT.height / 2 },
        { rotate: `${p.angle}deg` },
      ],
    };
  }, [width, height, radius]);

  const styles = rimStylesFor(palette, isDark, radius);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setBox((current) => (current && current.width === w && current.height === h ? current : { width: w, height: h }));
  };

  return (
    <View style={styles.clip} pointerEvents="none" onLayout={onLayout}>
      {box ? <Animated.View style={[styles.light, lightStyle]} /> : null}
      <View style={styles.cover} />
    </View>
  );
}
