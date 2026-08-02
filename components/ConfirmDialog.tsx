import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, radius, shadows, spacing } from '../lib/theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm action, for actions that end or remove something. */
  destructive?: boolean;
  /** Shows a spinner on the confirm button and disables both actions. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The BRAZOS in-app replacement for native `Alert.alert`-style confirmation
 * popups — same cream card, rounded panel and dimmed backdrop as
 * ReportDialog, just without a form. Presentation only: it never calls an
 * RPC or owns business logic, only renders the two outcomes a caller wires
 * up via onConfirm/onCancel.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Hardware back on Android maps to the same request-close event Modal
      // already uses on iOS swipe-to-dismiss gestures — only honored while
      // nothing is in flight, so a back-press can't abandon a submitting
      // confirm mid-request.
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.centerWrap}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <View style={styles.actions}>
              <Button
                title={confirmText}
                variant={destructive ? 'destructive' : 'primary'}
                onPress={onConfirm}
                loading={loading}
                disabled={loading}
              />
              <Button
                title={cancelText}
                variant="secondary"
                onPress={onCancel}
                disabled={loading}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,46,34,0.35)',
  },
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
    ...shadows.raised,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
  },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
