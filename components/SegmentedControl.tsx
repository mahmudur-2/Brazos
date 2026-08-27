import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  fonts,
  metricStyles,
  radius,
  selectedInDark,
  spacing,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

type Option<T extends string> = { label: string; value: T };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  /** null = nothing selected — a caller whose default state is outside the
   *  options (e.g. ClientJobDetail's stated default bid order) renders every
   *  segment unselected until the user picks one. */
  value: T | null;
  onChange: (value: T) => void;
  palette?: ColorPalette;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  palette: paletteProp,
}: SegmentedControlProps<T>) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  // Prestige decision 5 — separated cells instead of a filled well; the
  // active cell wears the surface fill under a gold hairline (dark; light
  // keeps its Heritage hairline) and speaks the serif; inactive cells stay
  // bare muted sans. Structure is the same in both themes.
  const activeBorder = isDark ? withAlpha(palette.gold, 0.55) : palette.border;
  // emerald D6: the chosen segment's LABEL is gold too, not just its hairline.
  // Master 23 draws the flat/ask pill — this exact control — that way, and it
  // is the same treatment every other chosen chip, pill and radio now carries.
  // The active cell keeps its surface fill: unlike a chip, a segment's fill is
  // what separates it from the bare cells beside it, so removing it would
  // erase the control rather than restyle it.
  const activeLabel = isDark ? selectedInDark(palette).line : palette.text;
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && [
                styles.segmentSelected,
                {
                  backgroundColor: palette.surface,
                  borderColor: activeBorder,
                  shadowColor: palette.text,
                },
              ],
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.label,
                { color: palette.textMuted },
                selected && [styles.labelSelected, { color: activeLabel }],
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    // Every cell carries the border WIDTH so selection never shifts layout;
    // only the active cell colours it in.
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelSelected: {
    // Decision 9: segmented labels join the serif voice when active.
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
}));
