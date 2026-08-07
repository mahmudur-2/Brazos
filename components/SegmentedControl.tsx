import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type ColorPalette } from '../lib/theme';

type Option<T extends string> = { label: string; value: T };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  palette?: ColorPalette;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  palette = colors,
}: SegmentedControlProps<T>) {
  return (
    <View
      style={[styles.container, { backgroundColor: palette.neutralBg }]}
      accessibilityRole="tablist"
    >
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
                { backgroundColor: palette.surface, shadowColor: palette.text },
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
                selected && [styles.labelSelected, { color: palette.text }],
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
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
  },
  pressed: {
    opacity: 0.78,
  },
});
