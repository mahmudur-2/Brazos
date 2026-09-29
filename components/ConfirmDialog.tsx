import { useModalPresence } from '../hooks/useModalPresence';
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
  scrimInDark,
  SCRIM_DARK_ALPHA,
} from '../lib/theme';
import { useOverrideNumber, useOverrideString } from '../lib/designOverrides';
import { BlurLayer } from '../lib/blur';
import { Surface } from '../ui/primitives/Surface';

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
  /** 2026-09-28 (#64, M-31): the Modal has actually appeared — the confirm
   *  host's watchdog (components/ConfirmHost.tsx) listens for it. */
  onShow?: () => void;
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
  onShow,
  palette: paletteProp,
}: ConfirmDialogProps) {
  const { palette: colors, isDark } = useThemeColors();
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const palette = paletteProp ?? colors;
  const styles = stylesFor(colors);
  // RUN S2 (C7) — the shared sheet-family backdrop dials. The card RADIUS
  // stays the pinned radius.xl: tests/postJobPublish.test.mjs D15 holds this
  // card and the budget editor to one xl radius, and that fence is not this
  // run's to move — the dialog-radius dial drives ActionSheet instead.
  const backdropColorDial = useOverrideString('sheet.backdropColor');
  const backdropAlphaDial = useOverrideNumber('sheet.backdropAlpha');
  const sheetShadowDial = useOverrideNumber('sheet.shadowOpacity');
  const backdropDial =
    backdropColorDial != null || backdropAlphaDial != null
      ? {
          backgroundColor: withAlpha(
            backdropColorDial ?? (isDark ? colors.background : colors.text),
            backdropAlphaDial ?? (isDark ? SCRIM_DARK_ALPHA : 0.35),
          ),
        }
      : null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={onShow}
      // Hardware back on Android maps to the same request-close event Modal
      // already uses on iOS swipe-to-dismiss gestures — only honored while
      // nothing is in flight, so a back-press can't abandon a submitting
      // confirm mid-request.
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <View style={[styles.backdrop, isDark && styles.backdropDark, backdropDial]}>
        {/* MOTION1 (C3): frosted over the scrim, under the panel. */}
        <BlurLayer />
        <View style={styles.centerWrap}>
          {/* G1 (C5): the card wears the sheet material — geometry (xl
              radius, hairline weight) is unchanged via the props, and the
              backdrop above is byte-identical. A caller-supplied palette
              still colours the copy and the buttons. */}
          <Surface material="menu" corners="all" radius={radius.xl} style={[styles.sheet, sheetShadowDial != null && { shadowOpacity: sheetShadowDial }]}>
            <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
            {message ? (
              <Text style={[styles.message, { color: palette.textMuted }]}>{message}</Text>
            ) : null}

            {/* 2026-09-28 (LUX-LIST-64 #64, audit M-31) — ONE DIALOG GRAMMAR,
                chosen once for every dialog (this one, AmountPrompt, the
                budget dialog): a pair, Cancel on the left, the action on the
                right — the iOS alert's own order. Cancel takes its word's
                width and the action the rest, so a long action ("Cash out
                (simulated)") still reads whole. */}
            <View style={styles.actions}>
              <Button
                title={cancelText}
                variant="secondary"
                palette={palette}
                onPress={onCancel}
                disabled={loading}
                style={styles.cancel}
              />
              <Button
                title={confirmText}
                variant={destructive ? 'destructive' : 'primary'}
                palette={palette}
                onPress={onConfirm}
                loading={loading}
                disabled={loading}
                style={styles.action}
              />
            </View>
          </Surface>
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
  backdropDark: { backgroundColor: scrimInDark(colors.background) },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  // G1 (C5): radius and hairline are the sheet material's now.
  sheet: {
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
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancel: {
    flexShrink: 0,
  },
  action: {
    flex: 1,
  },
  }),
);
