import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { metricStyles, radius, spacing, useThemeColors, withAlpha } from '../lib/theme';

/**
 * 2026-09-30 (the build run, idea 12) — THE TODAY PILL on a worker's job card: the customer asked
 * for the job today (lib/neededToday.ts decides when it shows — only on the day it was posted). The
 * app's gold in both appearances, a filled tint with no rim, the status pills' own shape.
 *
 * `sm` sits in a row of small chips and wears their metrics, so the row reads as one; `xs` is the
 * badge size, and `solid` gives it the ground's own fill for when it rides on a photo.
 */
export function TodayPill({
  size = 'sm',
  solid = false,
  style,
  onLayout,
}: {
  size?: 'sm' | 'xs';
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor();
  const ink = isDark ? colors.gold : colors.eyebrowGold;
  const tint = withAlpha(ink, isDark ? 0.16 : 0.12);
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.pill,
        size === 'xs' ? styles.pillXs : styles.pillSm,
        { backgroundColor: solid ? colors.background : tint },
        style,
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel="Needed today"
    >
      <Ionicons name="flash" size={size === 'xs' ? 10 : 12} color={ink} />
      <Text style={[size === 'xs' ? styles.labelXs : styles.labelSm, { color: ink }]}>Today</Text>
    </View>
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    // components/Chip.tsx's small chip: the same padding and type, so the pill and the category
    // chip beside it are one height.
    pillSm: {
      gap: spacing.xs,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm + 2,
    },
    pillXs: {
      gap: 3,
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
    },
    labelSm: {
      fontSize: 12,
      fontWeight: '700',
    },
    labelXs: {
      fontSize: 10,
      fontWeight: '700',
    },
  })
);
