import { type ComponentType } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useThemeColors } from '../lib/theme';
import {
  MARK_CHECK,
  MARK_RINGS,
  MARK_SPARKLES,
  markStylesFor,
  sparkleOffset,
  type SuccessMarkProps,
} from './SuccessMark.shared';

export type { SuccessMarkProps } from './SuccessMark.shared';

/**
 * THE STILL MARK — the same artwork, not moving.
 *
 * This is what renders on a binary without reanimated AND what renders when
 * the system asks for reduced motion. It is deliberately the FULL artwork
 * rather than a simplified one: reduced motion means no motion, not a smaller
 * mark, and a build without worklets is not a build that deserves less.
 *
 * Every ring and every sparkle is drawn at the value the entrance settles ON,
 * so the two paths end in the same frame.
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
        <Ionicons name="checkmark" size={MARK_CHECK} color={colors.onForest} />
      </View>

      {MARK_SPARKLES.map((sparkle) => (
        <Ionicons
          key={sparkle.key}
          name="sparkles"
          size={sparkle.size}
          color={colors.gold}
          style={[styles.sparkle, sparkleOffset(sparkle)]}
        />
      ))}
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
  SuccessMarkStill,
);

/**
 * The mark, on whichever driver this binary has — and still, whenever the
 * person using it has asked for that.
 *
 * REDUCED MOTION IS DECIDED HERE, above the boundary, so the animated sibling
 * is never even mounted for it. `useReducedMotion` returns `null` until the
 * setting has actually been read, and its own contract is that callers gate
 * the start of an animation on a NON-NULL value: an unknown answer must not
 * play, or the first frames run with motion and then snap. So only an explicit
 * `false` animates.
 */
export function SuccessMark(props: SuccessMarkProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion !== false || !canWorklet()) return <SuccessMarkStill {...props} />;
  return <Impl {...props} />;
}
