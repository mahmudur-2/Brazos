import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Surface } from '../ui/primitives/Surface';
import { useThemeColors } from '../lib/theme';
import {
  CAPSULE_HIDDEN_Y,
  CAPSULE_IN_MS,
  CAPSULE_OUT_MS,
  PANE_IN_MS,
  PANE_OUT_MS,
  PANE_OVERHANG,
  PANE_SHADOW_WIDTH,
  capsuleLabel,
  leadingEdge,
  paneShadowStyle,
  paneTravel,
  runSequence,
  transitionStylesFor,
  type ModeTransitionRunProps,
} from './ModeTransitionOverlay.shared';

/**
 * THE WIPE ON REANIMATED — the 120 Hz path. Reached only through
 * `resolveMotion120` from ./ModeTransitionOverlay.tsx, which requires it on a
 * binary whose capability probe found worklets; every other binary renders
 * the native-driver sibling in that file, from the same shared choreography.
 *
 * Two shared values, two properties: the pane's translateX and the capsule's
 * translateY. Each `withTiming` ends in a worklet callback that hops to JS
 * exactly once (`runOnJS`) to tell the sequence it is done — the swap fires
 * from the cover's callback, the reveal from the sequence once the incoming
 * tree has painted. Nothing else crosses the bridge while the pane moves.
 */
export function ModeTransitionRun(props: ModeTransitionRunProps) {
  const { destination, width, topInset } = props;
  const { palette: colors, isDark } = useThemeColors();
  const styles = transitionStylesFor(colors);
  const travel = paneTravel(destination, width);
  const edge = leadingEdge(destination);

  const paneX = useSharedValue(travel.from);
  const capsuleY = useSharedValue(CAPSULE_HIDDEN_Y);

  useEffect(() => {
    return runSequence(props, {
      paneIn: (covered) => {
        paneX.value = withTiming(travel.cover, { duration: PANE_IN_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) runOnJS(covered)();
        });
      },
      paneOut: (revealed) => {
        paneX.value = withTiming(travel.to, { duration: PANE_OUT_MS, easing: Easing.inOut(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) runOnJS(revealed)();
        });
      },
      capsuleIn: () => {
        capsuleY.value = withTiming(0, { duration: CAPSULE_IN_MS, easing: Easing.out(Easing.back(1.2)) });
      },
      capsuleOut: (gone) => {
        capsuleY.value = withTiming(CAPSULE_HIDDEN_Y, { duration: CAPSULE_OUT_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) runOnJS(gone)();
        });
      },
    });
    // One run per mount: the overlay is remounted for every transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paneStyle = useAnimatedStyle(() => ({ transform: [{ translateX: paneX.value }] }));
  const capsuleStyle = useAnimatedStyle(() => ({ transform: [{ translateY: capsuleY.value }] }));

  return (
    <View style={styles.layer} accessibilityViewIsModal>
      <Animated.View
        style={[styles.pane, { width: width + 2 * PANE_OVERHANG }, paneStyle]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Switching to ${capsuleLabel(destination)}`}
      >
        {/* The leading edge: the rim on the pane's own edge, the specular line
            just inside it, the shadow strip just outside it (the pane's
            overhang keeps all three off-screen while it fully covers). */}
        <View style={[styles.rim, edge === 'left' ? { left: 0 } : { right: 0 }]} />
        {isDark ? <View style={[styles.specular, edge === 'left' ? { left: 1 } : { right: 1 }]} /> : null}
        <View
          style={[
            styles.shadow,
            paneShadowStyle(edge, colors),
            edge === 'left' ? { left: -PANE_SHADOW_WIDTH } : { right: -PANE_SHADOW_WIDTH },
          ]}
        />
      </Animated.View>

      <Animated.View style={[styles.capsuleWrap, { top: topInset + 8 }, capsuleStyle]} pointerEvents="none">
        <Surface material="menu" radius={20} corners="all" style={styles.capsule}>
          <View style={styles.capsuleDot} />
          <Text style={styles.capsuleText}>{capsuleLabel(destination)}</Text>
        </Surface>
      </Animated.View>
    </View>
  );
}
