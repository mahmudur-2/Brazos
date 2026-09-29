import { useEffect } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '../lib/theme';
import {
  CHECK_LEGS,
  MARK_ENTRANCE_MS,
  MARK_RINGS,
  MARK_SPARKLES,
  legBox,
  markStylesFor,
  sparkleOffset,
  type SuccessMarkProps,
} from './SuccessMark.shared';

/**
 * THE MARK'S FAST PATH — the entrance, once.
 *
 * One of the file kinds allowed to name a vendor package directly; reached
 * only through `resolveMotion120` from ./SuccessMark.tsx, which requires it
 * solely when worklets are present AND the system has not asked for reduced
 * motion. On a binary without reanimated this file is never evaluated.
 *
 * ONE SHARED VALUE, NOT FOUR ANIMATIONS. Everything on screen is a function of
 * a single 0 -> 1 progress driven by one `withTiming`: the disc scales in over
 * the first third, the check's two legs draw themselves in sequence through
 * the middle (2026-09-27, ruling 14 — the short leg, then the long, each a
 * transform about its own start point on the UI thread), the rings expand and
 * fade across the middle, and each sparkle rises and fades around its own
 * phase. That is what makes "once" a property of the code rather than a
 * promise — there is exactly one animation, it has no callback, no
 * `withRepeat`, and no reverse, so when it lands on 1 the surface is static
 * and stays static.
 *
 * IT ENDS ON THE STILL FRAME. At progress 1 every interpolation below resolves
 * to the value SuccessMarkStill draws, so a build with worklets and a build
 * without are indistinguishable a second after the screen opens.
 *
 * The artwork itself — geometry, legs, sparkle table, stylesheet — is the
 * shared module's, so the two paths cannot become two marks.
 */
export function SuccessMark({ accessibilityLabel }: SuccessMarkProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = markStylesFor(colors);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: MARK_ENTRANCE_MS });
  }, [progress]);

  const discStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.18], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0, 0.38], [0.62, 1], 'clamp') }],
  }));

  // The rings expand THROUGH their resting size and fade as they pass it, so
  // the halo reads as one outward pulse that leaves the two rings behind.
  const innerRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.05, 0.3, 0.75, 1], [0, 1, 1, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0.05, 0.6], [0.7, 1], 'clamp') }],
  }));
  const outerRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.15, 0.45, 1], [0, 1, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0.15, 0.8], [0.6, 1], 'clamp') }],
  }));

  return (
    <View style={styles.field} accessible accessibilityLabel={accessibilityLabel}>
      <Animated.View
        style={[styles.ring, innerRingStyle, { width: MARK_RINGS[0], height: MARK_RINGS[0] }]}
      />
      <Animated.View
        style={[
          styles.ring,
          styles.ringOuter,
          outerRingStyle,
          { width: MARK_RINGS[1], height: MARK_RINGS[1] },
        ]}
      />

      <Animated.View style={[styles.disc, isDark && styles.discGlow, discStyle]}>
        <View style={styles.check}>
          {CHECK_LEGS.map((leg) => (
            <CheckLeg key={leg.key} leg={leg} progress={progress} />
          ))}
        </View>
      </Animated.View>

      {MARK_SPARKLES.map((sparkle) => (
        <Sparkle key={sparkle.key} sparkle={sparkle} progress={progress} color={colors.mark} />
      ))}
    </View>
  );
}

/**
 * One leg of the check, drawn over its own window of the progress: the bar
 * grows from its start point along its angle — the same transform the still
 * draws at 1 (legTransform in the shared module, spelled out here because a
 * worklet reads its inputs, not a helper).
 */
function CheckLeg({
  leg,
  progress,
}: {
  leg: (typeof CHECK_LEGS)[number];
  progress: { value: number };
}) {
  const styles = markStylesFor(useThemeColors().palette);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -leg.length / 2 },
      { rotate: `${leg.angle}deg` },
      { scaleX: interpolate(progress.value, [leg.from, leg.to], [0, 1], 'clamp') },
      { translateX: leg.length / 2 },
    ],
  }));

  return <Animated.View style={[styles.stroke, legBox(leg), style]} />;
}

/**
 * One sparkle: up and in around its phase, then settled.
 *
 * A component per sparkle because `useAnimatedStyle` is a hook and the table
 * is mapped — the same reason the slider's handle is not a loop body.
 */
function Sparkle({
  sparkle,
  progress,
  color,
}: {
  sparkle: (typeof MARK_SPARKLES)[number];
  progress: { value: number };
  color: string;
}) {
  const styles = markStylesFor(useThemeColors().palette);
  const from = Math.max(0, sparkle.phase - 0.25);
  const to = Math.min(1, sparkle.phase + 0.3);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [from, sparkle.phase, to], [0, 1, 1], 'clamp'),
    transform: [
      { translateY: interpolate(progress.value, [from, to], [8, 0], 'clamp') },
      { scale: interpolate(progress.value, [from, sparkle.phase], [0.5, 1], 'clamp') },
    ],
  }));

  return (
    <Animated.View style={[styles.sparkle, sparkleOffset(sparkle), style]}>
      <Ionicons name="sparkles" size={sparkle.size} color={color} />
    </Animated.View>
  );
}
