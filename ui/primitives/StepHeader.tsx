import { StyleSheet, Text, View } from 'react-native';
import { layout, radius, spacing, type EmeraldPalette, type as typeScale } from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';

/**
 * The wizard progress header (§I) — a segmented bar plus "Step N of M" and the
 * current step's name.
 *
 * A segmented bar rather than a continuous one because the post-a-job wizard
 * has a known, small number of discrete steps; a percentage bar would imply
 * finer progress than exists. PostJobScreen currently draws its own version of
 * this inline; this is the shared one that FormScreen's wizard mode uses, so
 * future wizards do not each re-derive it.
 */

type StepHeaderProps = {
  /** Zero-based. */
  step: number;
  /** Step names, in order. Length is the total. */
  steps: readonly string[];
};

export function StepHeader({ step, steps }: StepHeaderProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const total = steps.length;
  // Guard rather than trust: an out-of-range index would otherwise render an
  // empty label and a bar that looks finished.
  const index = Math.min(Math.max(step, 0), total - 1);

  return (
    <View style={styles.wrap}>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      >
        {steps.map((name, i) => (
          <View
            key={name}
            style={[styles.segment, i <= index ? styles.segmentDone : styles.segmentTodo]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        {/* Eyebrow law (decision 6): "Step N of M" is a structural label —
            gold in dark; light keeps the Heritage emerald. */}
        <Text style={[styles.counter, isDark && { color: colors.gold }]}>
          Step {index + 1} of {total}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {steps[index]}
        </Text>
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.md,
  },
  track: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  segment: {
    // flex:1 so any number of steps divides the width evenly — no per-count
    // magic numbers, and it adapts to any screen size.
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
  },
  segmentDone: {
    backgroundColor: colors.forest,
  },
  segmentTodo: {
    backgroundColor: colors.mint2,
  },
  labels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  counter: {
    ...typeScale.eyebrow,
    color: colors.emerald,
    flexShrink: 0,
  },
  name: {
    ...typeScale.sub,
    color: colors.muted,
    // Shrinks and truncates rather than pushing the counter off-screen.
    flexShrink: 1,
  },
  }),
);
