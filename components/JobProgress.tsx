import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useThemeColors, type ColorPalette } from '../lib/theme';

const STEPS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
] as const;

const ORDER: Record<string, number> = {
  assigned: 0,
  in_progress: 1,
  completed: 2,
};

export function JobProgress({
  status,
  palette: paletteProp,
}: {
  status: string;
  palette?: ColorPalette;
}) {
  const { palette: colors } = useThemeColors();
  const palette = paletteProp ?? colors;
  const current = ORDER[status] ?? 0;

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const done = index <= current;
        return (
          <View key={step.key} style={styles.stepWrap}>
            <View style={styles.step}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: palette.neutralBg },
                  done && { backgroundColor: palette.primary },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color={palette.onPrimary} />
                ) : (
                  <Text style={[styles.dotNumber, { color: palette.textMuted }]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  { color: palette.textMuted },
                  done && { color: palette.text },
                ]}
              >
                {step.label}
              </Text>
            </View>
            {index < STEPS.length - 1 && (
              <View
                style={[
                  styles.line,
                  { backgroundColor: palette.border },
                  index < current && { backgroundColor: palette.primary },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  step: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 74,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  line: {
    flex: 1,
    height: 2,
    marginTop: 12,
    marginHorizontal: -12,
  },
});
