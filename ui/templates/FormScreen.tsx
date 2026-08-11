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
import { StepHeader } from '../primitives';
import { colors, controls, layout, radius, spacing, type as typeScale } from '../tokens';
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
  secondaryLabel,
  onSecondary,
  footerNote,
  state,
  insideTabs = true,
  children,
}: FormScreenProps) {
  const showFooter = Boolean(submitLabel && onSubmit);

  return (
    <SafeAreaView style={styles.safe} edges={insideTabs ? ['top'] : ['top', 'bottom']}>
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
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              // Only clear the floating nav when there is no footer to sit
              // above it; a footer already occupies that space.
              !showFooter && insideTabs && { paddingBottom: layout.floatingNavClearance },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>

          {showFooter ? (
            <View style={styles.footer}>
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
                    styles.primary,
                    // flex:2 so the primary always reads as the main action
                    // even next to a secondary with a longer label.
                    secondaryLabel ? styles.primaryWithSecondary : null,
                    pressed && styles.pressed,
                    (submitDisabled || submitLoading) && styles.disabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={submitLabel}
                  accessibilityState={{ disabled: submitDisabled || submitLoading }}
                >
                  <Text style={[styles.buttonLabel, styles.primaryLabel]}>
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

const styles = StyleSheet.create({
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
    paddingHorizontal: spacing.xl,
  },
  primary: {
    backgroundColor: colors.forest,
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
});
