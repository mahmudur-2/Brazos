import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PropsWithChildren, ReactNode } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StepHeader, usePillReserve, usePinnedFooterPadding, useScrollClearance } from '../primitives';
import {
  controls,
  layout,
  radius,
  spacing,
  type EmeraldPalette,
  type as typeScale,
} from '../tokens';
import { screenGround, themedStyles, useThemeColors } from '../../lib/theme';
import { useOverrideNumber } from '../../lib/designOverrides';
import { ScreenStateView, isReady, type ScreenState } from './ScreenStates';

/**
 * The single-form / multi-step-wizard template (§I).
 *
 * The three things it exists to stop every form re-deriving:
 *
 * 1. Keyboard handling. `KeyboardAvoidingView` with `behavior="padding"` on
 *    iOS only, wrapping BOTH the scroller and the footer, so the submit
 *    control stays reachable with the keyboard open — CLAUDE.md's rule, which
 *    is easy to get subtly wrong per screen (wrap only the ScrollView and the
 *    footer ends up under the keyboard).
 * 2. Safe area. `edges` defaults to top-only because screens inside the tab
 *    navigator must not reserve the bottom inset a second time — MainTabs
 *    already owns it. Screens presented outside the tabs pass
 *    `insideTabs={false}`.
 * 3. The five non-ready states, via ScreenStates.
 */

type FormScreenProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  onBack?: () => void;

  /** Wizard mode: pass both and the step header renders. */
  step?: number;
  steps?: readonly string[];

  /** Primary action, pinned to the bottom above the keyboard. */
  submitLabel?: string;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  /** 2026-09-26 (the refresh, audit M-32/M-33): an irreversible commit —
   *  Delete my account — wears the danger fill, pinned like any other. */
  submitVariant?: 'primary' | 'destructive';
  /** Secondary action beside the primary — usually Back in a wizard. */
  secondaryLabel?: string;
  onSecondary?: () => void;

  /** Anything extra above the footer buttons (a total, a disclaimer). */
  footerNote?: ReactNode;

  state?: ScreenState;
  /** False when the screen is presented outside the bottom tab navigator. */
  insideTabs?: boolean;
}>;

export function FormScreen({
  title,
  subtitle,
  onBack,
  step,
  steps,
  submitLabel,
  onSubmit,
  submitDisabled = false,
  submitLoading = false,
  submitVariant = 'primary',
  secondaryLabel,
  onSecondary,
  footerNote,
  state,
  insideTabs = true,
  children,
}: FormScreenProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const showFooter = Boolean(submitLabel && onSubmit);
  // RUN S2 (C9) — the layout dials, live across every template screen.
  const pagePadDial = useOverrideNumber('layout.pagePadding');
  const topPadDial = useOverrideNumber('layout.contentTopPad');
  const sectionGapDial = useOverrideNumber('layout.formSectionGap');
  const layoutDial = {
    ...(pagePadDial != null ? { paddingHorizontal: pagePadDial } : null),
    ...(topPadDial != null ? { paddingTop: topPadDial } : null),
    ...(sectionGapDial != null ? { gap: sectionGapDial } : null),
  };
  // emerald(3): the pill's real footprint, read from the device rather than
  // from a flat token. Whichever of the two bottom elements is last on screen
  // takes it — the footer when there is one, the scroller when there is not.
  const navClearance = useScrollClearance();
  const footerPad = usePinnedFooterPadding();
  // With the keyboard up the pill is under it: the footer's reserve for it comes off the keyboard's
  // padding, so the pinned action sits on the keyboard.
  const pillReserve = usePillReserve();

  const destructiveUnarmed = submitVariant === 'destructive' && submitDisabled && !submitLoading;

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />

      {steps && steps.length > 0 && typeof step === 'number' ? (
        <StepHeader step={step} steps={steps} />
      ) : null}

      {!isReady(state) ? (
        <ScreenStateView state={state as Exclude<ScreenState, { kind: 'ready' }>} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          // iOS only: on Android the system already resizes the window, and
          // adding padding on top of that double-counts the keyboard.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={-pillReserve}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              layoutDial,
              // Only the LAST element on screen clears the pill. With a footer
              // that is the footer, and the content then clears both by
              // sitting above it.
              !showFooter && insideTabs && { paddingBottom: navClearance },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>

          {showFooter ? (
            <View
              style={[
                styles.footer,
                // home(7): this footer is PINNED, not scrolled. emerald(3)
                // gave it the pill's whole footprint on the reasoning that it
                // is the last thing above the pill — but the bar is laid out
                // in normal flow beneath this scene, so that space was already
                // reserved once and the footer reserved it again. ~104pt of
                // empty chrome under Back / Continue, Publish job, Cash out
                // and Delete my account. It takes its own breathing room now;
                // the clearance stays exactly where it is still needed, on the
                // scroller above when there is no footer at all.
                { paddingBottom: footerPad },
              ]}
            >
              {footerNote ? <View style={styles.footerNote}>{footerNote}</View> : null}
              <View style={styles.footerRow}>
                {secondaryLabel && onSecondary ? (
                  <Pressable
                    onPress={onSecondary}
                    style={({ pressed }) => [
                      styles.button,
                      styles.secondary,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={secondaryLabel}
                  >
                    <Text style={[styles.buttonLabel, styles.secondaryLabel]}>
                      {secondaryLabel}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={onSubmit}
                  disabled={submitDisabled || submitLoading}
                  style={({ pressed }) => [
                    styles.button,
                    submitVariant === 'destructive' ? styles.destructive : styles.primary,
                    // flex:2 so the primary always reads as the main action
                    // even next to a secondary with a longer label.
                    secondaryLabel ? styles.primaryWithSecondary : null,
                    pressed && styles.pressed,
                    // Fix run D11: a destructive submit that is not armed yet
                    // (Delete my account before DELETE is typed) is an OUTLINE
                    // in the danger colour at full strength — a half-opacity
                    // coral fill read as broken. Armed, it is the fill again;
                    // while it works it dims like any other.
                    destructiveUnarmed
                      ? styles.destructiveUnarmed
                      : (submitDisabled || submitLoading) && styles.disabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={submitLabel}
                  accessibilityState={{ disabled: submitDisabled || submitLoading }}
                >
                  <Text style={[styles.buttonLabel, styles.primaryLabel, destructiveUnarmed && styles.destructiveUnarmedLabel]}>
                    {submitLoading ? 'Working…' : submitLabel}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: layout.screenGutter,
    gap: spacing.lg,
  },
  footer: {
    padding: layout.screenGutter,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  footerNote: {
    gap: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    minHeight: controls.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg + spacing.xs,
  },
  primary: {
    backgroundColor: colors.forest,
  },
  destructive: {
    backgroundColor: colors.danger,
  },
  destructiveUnarmed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  destructiveUnarmedLabel: {
    color: colors.danger,
  },
  primaryWithSecondary: {
    flex: 2,
  },
  secondary: {
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
  },
  buttonLabel: {
    ...typeScale.title,
  },
  primaryLabel: {
    color: colors.onForest,
  },
  secondaryLabel: {
    color: colors.forest,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  }),
);
