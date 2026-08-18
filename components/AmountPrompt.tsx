import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { dollarsToCents } from '../lib/jobs';
import {
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

type AmountPromptProps = {
  visible: boolean;
  title: string;
  message?: string;
  /** Pre-fills the field, e.g. the current offer being countered. */
  initialCents?: number | null;
  confirmText?: string;
  onCancel: () => void;
  onSubmit: (cents: number) => void;
};

/**
 * Small modal for entering a dollar amount — used for counter-offers.
 *
 * Kept as a modal rather than a screen so a negotiation never navigates away
 * from the conversation it belongs to.
 */
export function AmountPrompt({
  visible,
  title,
  message,
  initialCents,
  confirmText = 'Submit',
  onCancel,
  onSubmit,
}: AmountPromptProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setValue(initialCents != null ? String(initialCents / 100) : '');
    setError(null);
  }, [visible, initialCents]);

  function handleSubmit() {
    const cents = dollarsToCents(value);
    if (cents == null) {
      setError('Enter an amount.');
      return;
    }
    if (Number.isNaN(cents) || cents <= 0) {
      setError('Enter a positive dollar amount.');
      return;
    }
    onSubmit(cents);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.inputRow}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              keyboardAppearance={isDark ? 'dark' : 'light'}
              style={styles.input}
              value={value}
              onChangeText={(t) => {
                setValue(t);
                if (error) setError(null);
              }}
              placeholder="0"
              placeholderTextColor={colors.textSubtle}
              keyboardType="numeric"
              autoFocus
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={onCancel}
              style={styles.btn}
            />
            <Button title={confirmText} onPress={handleSubmit} style={styles.btn} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.text, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 19,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  currency: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textMuted,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btn: {
    flex: 1,
    height: 46,
  },
  }),
);
