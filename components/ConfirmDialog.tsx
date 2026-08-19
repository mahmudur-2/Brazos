import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

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
  palette?: ColorPalette;
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
  palette: paletteProp,
}: ConfirmDialogProps) {
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  const styles = stylesFor(colors);
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
      <View style={[styles.backdrop, isDark && styles.backdropDark]}>
        <View style={styles.centerWrap}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
            {message ? (
              <Text style={[styles.message, { color: palette.textMuted }]}>{message}</Text>
            ) : null}

            <View style={styles.actions}>
              <Button
                title={confirmText}
                variant={destructive ? 'destructive' : 'primary'}
                palette={palette}
                onPress={onConfirm}
                loading={loading}
                disabled={loading}
              />
              <Button
                title={cancelText}
                variant="secondary"
                palette={palette}
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // D7 — a modal scrim DIMS the parent. `text` is the CREAM in dark, so the
  // one expression that dims in light lightens in dark; dark scrims with the
  // page ground instead.
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.text, 0.35),
  },
  backdropDark: { backgroundColor: withAlpha(colors.background, 0.7) },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    ...shadows.raised,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
  },
  message: {
    fontSize: 14,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  }),
);
