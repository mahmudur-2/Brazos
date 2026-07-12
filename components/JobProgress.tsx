import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../lib/theme';

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

export function JobProgress({ status }: { status: string }) {
  const current = ORDER[status] ?? 0;

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const done = index <= current;
        return (
          <View key={step.key} style={styles.stepWrap}>
            <View style={styles.step}>
              <View style={[styles.dot, done && styles.dotDone]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.white} />
                ) : (
                  <Text style={styles.dotNumber}>{index + 1}</Text>
                )}
              </View>
              <Text style={[styles.label, done && styles.labelDone]}>{step.label}</Text>
            </View>
            {index < STEPS.length - 1 && (
              <View style={[styles.line, index < current && styles.lineDone]} />
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
    backgroundColor: colors.neutralBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: colors.primary,
  },
  dotNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelDone: {
    color: colors.text,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginTop: 12,
    marginHorizontal: -12,
  },
  lineDone: {
    backgroundColor: colors.primary,
  },
});
