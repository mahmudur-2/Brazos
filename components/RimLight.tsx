import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import { motionCapability, resolveMotion120 } from '../lib/motion120';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { useThemeColors } from '../lib/theme';
import { RIM_LAP_MS, rimSamples, rimStylesFor, type RimLightProps } from './RimLight.shared';

export type { RimLightProps } from './RimLight.shared';

/**
 * THE RIM LIGHT ON THE NATIVE DRIVER — the same lap without worklets.
 *
 * This is what renders on a binary without reanimated. The lap is one
 * `Animated.loop` of a linear timing, and the light's translate and rotate
 * are interpolations over the shared module's sample table — the same path
 * the worklet computes, sampled once. Transform only, so the native driver
 * carries it whole; the JS thread is not consulted again.
 */
export function RimLightNative({ radius }: RimLightProps) {
  const { palette, isDark } = useThemeColors();
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!box) return;
    progress.setValue(0);
    const lap = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: RIM_LAP_MS,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );
    lap.start();
    return () => lap.stop();
  }, [box, progress]);

  const samples = useMemo(
    () => (box ? rimSamples(box.width, box.height, radius) : null),
    [box, radius]
  );
  const styles = rimStylesFor(palette, isDark, radius);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) =>
      current && current.width === width && current.height === height ? current : { width, height }
    );
  };

  return (
    <View style={styles.clip} pointerEvents="none" onLayout={onLayout}>
      {samples ? (
        <Animated.View
          style={[
            styles.light,
            {
              transform: [
                { translateX: progress.interpolate({ inputRange: samples.input, outputRange: samples.x }) },
                { translateY: progress.interpolate({ inputRange: samples.input, outputRange: samples.y }) },
                { rotate: progress.interpolate({ inputRange: samples.input, outputRange: samples.rotate }) },
              ],
            },
          ]}
        />
      ) : null}
      <View style={styles.cover} />
    </View>
  );
}

/**
 * Chosen ONCE, at module load. This one needs worklets and nothing else —
 * there is no gesture here, only a lap — so like the mark it asks for
 * `reanimated` alone.
 */
const Impl = resolveMotion120<ComponentType<RimLightProps>>(
  motionCapability,
  'reanimated',
  () => require('./RimLight.motion120').RimLight as ComponentType<RimLightProps>,
  RimLightNative
);

/**
 * The light, on whichever driver this binary has — and absent, whenever the
 * person using it has asked for reduced motion: the rim then simply rests at
 * its static gold, which is the button exactly as it is without this layer.
 *
 * REDUCED MOTION IS DECIDED HERE, above the boundary, so neither sibling is
 * mounted for it. `useReducedMotion` returns `null` until the setting has
 * been read, and its contract is that only an explicit `false` animates.
 */
export function RimLight(props: RimLightProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion !== false) return null;
  return <Impl {...props} />;
}
