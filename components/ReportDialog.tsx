import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from './Button';
import { TextField } from './TextField';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { createReport, REPORT_REASONS, type ReportReason } from '../lib/moderation';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  scrimInDark,
  selectedInDark,
} from '../lib/theme';

type ReportDialogProps = {
  visible: boolean;
  reporterId: string;
  reportedId: string;
  reportedName: string;
  jobId?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

export function ReportDialog({
  visible,
  reporterId,
  reportedId,
  reportedName,
  jobId,
  onClose,
  onSubmitted,
}: ReportDialogProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setReason(null);
    setDescription('');
  }

  async function handleSubmit() {
    if (!reason) {
      await alertAsync('Pick a reason', 'Please choose what went wrong.');
      return;
    }
    setSubmitting(true);
    const { error } = await createReport({
      reporterId,
      reportedId,
      jobId,
      reason,
      description,
    });
    setSubmitting(false);

    if (error) {
      await alertAsync('Could not send report', userMessage(error));
      return;
    }

    reset();
    onClose();
    onSubmitted?.();
    await alertAsync(
      'Report sent',
      'Thanks — the Brazos team will review this. We may follow up if we need more detail.'
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, isDark && styles.backdropDark]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerWrap}
        >
          <View style={styles.sheet}>
            <Text style={styles.title}>Report {reportedName}</Text>
            <Text style={styles.subtitle}>
              This goes to the Brazos team. They won't be told who reported them.
            </Text>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.reasons}>
                {REPORT_REASONS.map((r) => {
                  const selected = reason === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      onPress={() => setReason(r.value)}
                      style={[
                        styles.reason,
                        selected && (isDark ? styles.reasonSelectedDark : styles.reasonSelected),
                      ]}
                    >
                      <Text
                        style={[
                          styles.reasonText,
                          selected &&
                            (isDark ? styles.reasonTextSelectedDark : styles.reasonTextSelected),
                        ]}
                      >
                        {r.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextField
                label="What happened? (optional)"
                value={description}
                onChangeText={setDescription}
                placeholder="Add any detail that would help us review this…"
                autoCapitalize="sentences"
                multiline
                numberOfLines={3}
                style={styles.multiline}
              />
            </ScrollView>

            <View style={styles.actions}>
              <Button
                title="Send report"
                onPress={handleSubmit}
                loading={submitting}
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  reset();
                  onClose();
                }}
                disabled={submitting}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // D7 — a modal scrim DIMS the parent. `text` is the CREAM in dark, so the
  // one expression that dims in light lightens in dark; dark scrims with the
  // page ground instead.
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.text, 0.35),
  },
  backdropDark: { backgroundColor: scrimInDark(colors.background) },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    maxHeight: '85%',
    ...shadows.raised,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  scroll: {
    marginTop: spacing.lg,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xs,
  },
  reasons: {
    gap: spacing.sm,
  },
  reason: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  reasonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  // emerald D6: one selection treatment — gold line, gold label, no fill.
  reasonSelectedDark: {
    borderColor: selectedInDark(colors).line,
    backgroundColor: selectedInDark(colors).fill,
  },
  reasonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  reasonTextSelected: {
    color: colors.primary,
  },
  reasonTextSelectedDark: {
    color: selectedInDark(colors).line,
  },
  multiline: {
    height: 84,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  }),
);
