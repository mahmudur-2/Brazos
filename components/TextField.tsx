import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, spacing, type ColorPalette } from '../lib/theme';

type TextFieldProps = {
  label: string;
  /** Inline validation message, shown below the input in red with a
   *  matching red border. Omit (or pass undefined/null) when the field is
   *  valid — the border/message only appear while this is set. */
  error?: string | null;
  /** Shown below the input alongside — or instead of — error, e.g. a live
   *  character count. Doesn't affect the border color. */
  hint?: string;
  /** Customer/Map surfaces can opt into their palette without changing the
   * shared default used by the rest of the app. */
  palette?: ColorPalette;
} & TextInputProps;

export function TextField({
  label,
  error,
  hint,
  palette = colors,
  style,
  ...rest
}: TextFieldProps) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: palette.textMuted }]}>{hint}</Text> : null}
      </View>
      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
          error && { borderColor: palette.danger },
          style,
        ]}
        placeholderTextColor={palette.textSubtle}
        autoCapitalize="none"
        {...rest}
      />
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs + 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    fontSize: 16,
  },
  error: {
    fontSize: 12,
  },
});
