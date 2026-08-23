import { useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { TextField } from './TextField';
import { Toggle } from '../ui/primitives';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import { blockUser, createReport, REPORT_REASONS, type ReportReason } from '../lib/moderation';
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

/** How long the confirmation holds before the sheet closes itself. Long
 *  enough to read six words, short enough not to feel stuck. */
const SENT_DISMISS_MS = 1600;

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
  // Opt-in, and it drives the EXISTING permanent block — lib/moderation's
  // blockUser, the same call the inbox row runs. Nothing new is stored and no
  // timed variant is implied here; that one waits on TIMED_BLOCK.
  const [alsoBlock, setAlsoBlock] = useState(false);
  // The sheet's own sent state. It replaces the alert that used to fire AFTER
  // the sheet had already closed — a confirmation that appears somewhere else
  // once the thing you were looking at is gone reads as an interruption
  // rather than as an answer.
  const [sent, setSent] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A sheet unmounted (or dismissed by the user) mid-confirmation must not
  // leave a timer that closes something else a second and a half later.
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  function reset() {
    setReason(null);
    setDescription('');
    setAlsoBlock(false);
    setSent(false);
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

    if (error) {
      setSubmitting(false);
      await alertAsync('Could not send report', userMessage(error));
      return;
    }

    // THE REPORT IS THE PRIMARY ACTION. A block that fails is named on its
    // own rather than being allowed to read as the report having failed —
    // the report is already filed at this point and saying otherwise would
    // make someone send it twice.
    if (alsoBlock) {
      const { error: blockError } = await blockUser(reporterId, reportedId);
      if (blockError) {
        setSubmitting(false);
        onSubmitted?.();
        await alertAsync('Reported, but not blocked', userMessage(blockError));
        reset();
        onClose();
        return;
      }
    }

    setSubmitting(false);
    setSent(true);
    onSubmitted?.();
    dismissTimer.current = setTimeout(() => {
      dismissTimer.current = null;
      reset();
      onClose();
    }, SENT_DISMISS_MS);
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
            {/* THE SENT STATE. It replaces the sheet's body rather than
                stacking on it, so there is exactly one thing on screen and
                nothing left to press by accident while it dismisses. */}
            {sent ? (
              <View style={styles.sentState}>
                <View style={styles.sentMark}>
                  <Ionicons name="checkmark" size={26} color={colors.onPrimary} />
                </View>
                <Text style={styles.sentTitle}>Sent to the Brazos team</Text>
                <Text style={styles.sentNote}>
                  {alsoBlock
                    ? `They can no longer message you. We may follow up if we need more detail.`
                    : 'We may follow up if we need more detail.'}
                </Text>
              </View>
            ) : (
            <>
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

              {/* OPT-IN, and it drives the block that already exists. Reporting
                  and blocking are the same moment for most people and were two
                  separate trips through two different menus. */}
              <View style={styles.blockRow}>
                <View style={styles.blockCopy}>
                  <Text style={styles.blockLabel}>Also block this person</Text>
                  <Text style={styles.blockNote}>
                    They won't be able to message you. You can undo this later from
                    the conversation.
                  </Text>
                </View>
                <Toggle
                  value={alsoBlock}
                  onValueChange={setAlsoBlock}
                  disabled={submitting}
                  accessibilityLabel={`Also block ${reportedName}`}
                />
              </View>
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
            </>
            )}
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
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  blockCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  blockLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  blockNote: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  sentState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  sentMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sentTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  sentNote: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
  }),
);
