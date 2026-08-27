import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deriveJobLifecycle, trackStepIndex } from '../lib/jobLifecycle';
import { metricStyles, spacing, useThemeColors, type ColorPalette } from '../lib/theme';

const STEPS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
] as const;

export function JobProgress({
  status,
  palette: paletteProp,
}: {
  status: string;
  palette?: ColorPalette;
}) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  // Presentation over THE track (F-012): the raw status runs through the
  // canonical derivation, deliberately payment-blind, because the three
  // visual steps collapse the five-step track — the whole assigned family
  // (pending_payment/confirmed/en_route/arrived, track 0–2) is step 0 and
  // the whole completed family (awaiting_approval/disputed/completed,
  // track 4) is step 2, so no payment or dispute fact can move the drawing.
  const track = trackStepIndex(deriveJobLifecycle({ job: { status }, payment: null }));
  // Off the track (open, cancelled, a status this client cannot classify):
  // claim NOTHING — every step stays pending, never a fall-through that
  // draws "Assigned" as done for a job that was not.
  const current = track < 0 ? -1 : track <= 2 ? 0 : track === 3 ? 1 : 2;
  // Masters 6 and 17 draw the stepper as line-work: a done node is the deep
  // green disc inside a GOLD ring with a gold check, a pending node is a bare
  // grey ring around its numeral, and the connector behind a done node is
  // gold. Light keeps the Heritage filled dot.
  //
  // 2026-08-24: both nodes carry the 1pt ring in BOTH themes. It was dark-only,
  // which made a step a different size in light — a border insets a fixed-width
  // disc's content — and that is geometry forking on the palette rather than
  // colour. Light rings each node in the node's own fill, so it still reads as
  // the Heritage filled dot; only the colours differ, which is the rule.
  const doneNode = {
    borderWidth: 1,
    backgroundColor: isDark ? palette.forest : palette.primary,
    borderColor: isDark ? palette.gold : palette.primary,
  };
  const pendingNode = {
    borderWidth: 1,
    backgroundColor: isDark ? 'transparent' : palette.neutralBg,
    borderColor: isDark ? palette.navInactive : palette.neutralBg,
  };
  const checkColor = isDark ? palette.gold : palette.onPrimary;
  const doneLine = isDark ? palette.gold : palette.primary;

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const done = index <= current;
        return (
          <View key={step.key} style={styles.stepWrap}>
            <View style={styles.step}>
              <View style={[styles.dot, done ? doneNode : pendingNode]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={checkColor} />
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
                  index < current && { backgroundColor: doneLine },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
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
}));
