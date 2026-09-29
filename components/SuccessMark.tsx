import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useThemeColors } from '../lib/theme';
import {
  CHECK_LEGS,
  MARK_ENTRANCE_MS,
  MARK_RINGS,
  MARK_SPARKLES,
  legBox,
  legTransform,
  markStylesFor,
  sparkleOffset,
  type SuccessMarkProps,
} from './SuccessMark.shared';

export type { SuccessMarkProps } from './SuccessMark.shared';

/**
 * THE STILL MARK — the same artwork, not moving.
 *
 * This is what renders when the system asks for reduced motion. It is
 * deliberately the FULL artwork rather than a simplified one: reduced motion
 * means no motion, not a smaller mark.
 *
 * Every ring, both legs of the check and every sparkle are drawn at the value
 * the entrance settles ON, so every path ends in the same frame.
 */
export function SuccessMarkStill({ accessibilityLabel }: SuccessMarkProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = markStylesFor(colors);

  return (
    <View style={styles.field} accessible accessibilityLabel={accessibilityLabel}>
      {MARK_RINGS.map((size, index) => (
        <View
          key={size}
          style={[styles.ring, index > 0 && styles.ringOuter, { width: size, height: size }]}
        />
      ))}

      <View style={[styles.disc, isDark && styles.discGlow]}>
        <View style={styles.check}>
          {CHECK_LEGS.map((leg) => (
            <View key={leg.key} style={[styles.stroke, legBox(leg), { transform: legTransform(leg, 1) }]} />
          ))}
        </View>
      </View>

      {MARK_SPARKLES.map((sparkle) => (
        <Ionicons
          key={sparkle.key}
          name="sparkles"
          size={sparkle.size}
          color={colors.mark}
          style={[styles.sparkle, sparkleOffset(sparkle)]}
        />
      ))}
    </View>
  );
}

/**
 * 2026-09-27 (the Lux remake, ruling 14) — THE FALLBACK ENTRANCE, on core
 * `Animated` with the native driver: the motion boundary's own rule for a
 * binary without worklets (lib/motion120). ONE value, one timing, the same
 * windows the fast path reads — the disc in over the first third, the check's
 * two legs drawn in sequence through the middle, the rings' pulse, the
 * sparkles' scatter — and every interpolation clamps, so it too ends on the
 * still frame. Transform and opacity only, so the driver never leaves the
 * UI thread for it.
 */
export function SuccessMarkAnimated({ accessibilityLabel }: SuccessMarkProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = markStylesFor(colors);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: MARK_ENTRANCE_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [progress]);

  const over = (inputRange: number[], outputRange: number[]) =>
    progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });

  return (
    <View style={styles.field} accessible accessibilityLabel={accessibilityLabel}>
      <Animated.View
        style={[
          styles.ring,
          { width: MARK_RINGS[0], height: MARK_RINGS[0] },
          { opacity: over([0.05, 0.3, 0.75, 1], [0, 1, 1, 1]), transform: [{ scale: over([0.05, 0.6], [0.7, 1]) }] },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          styles.ringOuter,
          { width: MARK_RINGS[1], height: MARK_RINGS[1] },
          { opacity: over([0.15, 0.45, 1], [0, 1, 1]), transform: [{ scale: over([0.15, 0.8], [0.6, 1]) }] },
        ]}
      />

      <Animated.View
        style={[
          styles.disc,
          isDark && styles.discGlow,
          { opacity: over([0, 0.18], [0, 1]), transform: [{ scale: over([0, 0.38], [0.62, 1]) }] },
        ]}
      >
        <View style={styles.check}>
          {CHECK_LEGS.map((leg) => (
            <Animated.View
              key={leg.key}
              style={[
                styles.stroke,
                legBox(leg),
                {
                  transform: [
                    { translateX: -leg.length / 2 },
                    { rotate: `${leg.angle}deg` },
                    { scaleX: over([leg.from, leg.to], [0, 1]) },
                    { translateX: leg.length / 2 },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>

      {MARK_SPARKLES.map((sparkle) => {
        const from = Math.max(0, sparkle.phase - 0.25);
        const to = Math.min(1, sparkle.phase + 0.3);
        return (
          <Animated.View
            key={sparkle.key}
            style={[
              styles.sparkle,
              sparkleOffset(sparkle),
              {
                opacity: over([from, sparkle.phase, to], [0, 1, 1]),
                transform: [
                  { translateY: over([from, to], [8, 0]) },
                  { scale: over([from, sparkle.phase], [0.5, 1]) },
                ],
              },
            ]}
          >
            <Ionicons name="sparkles" size={sparkle.size} color={colors.mark} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Chosen ONCE, at module load. This one needs worklets and nothing else —
 * there is no gesture here, only an entrance — so unlike the slider it asks
 * for `reanimated` alone.
 */
const Impl = resolveMotion120<ComponentType<SuccessMarkProps>>(
  motionCapability,
  'reanimated',
  () => require('./SuccessMark.motion120').SuccessMark as ComponentType<SuccessMarkProps>,
  SuccessMarkAnimated,
);

/**
 * The mark, on whichever driver this binary has — and still, whenever the
 * person using it has asked for that.
 *
 * REDUCED MOTION IS DECIDED HERE, above the boundary, so neither animated
 * sibling is even mounted for it. `useReducedMotion` returns `null` until the
 * setting has actually been read, and its own contract is that callers gate
 * the start of an animation on a NON-NULL value: an unknown answer must not
 * play, or the first frames run with motion and then snap. So only an explicit
 * `false` animates — on the fast path where this binary has worklets, on the
 * native-driver fallback where it does not.
 */
export function SuccessMark(props: SuccessMarkProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion !== false) return <SuccessMarkStill {...props} />;
  if (!canWorklet()) return <SuccessMarkAnimated {...props} />;
  return <Impl {...props} />;
}
