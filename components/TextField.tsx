import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { metricStyles, radius, spacing, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { FocusRing } from './FocusRing';

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
  /** 2026-09-28 (LUX-LIST-64 #2): `accent` paints the caption the mint (the
   *  light token's green) — "Phone number" is said that way everywhere. */
  /** 2026-09-29 (LUX-LIST-2 #4): 'gold' — the kept-gold labels (light #86641A). */
  labelTone?: 'eyebrow' | 'accent' | 'gold';
} & TextInputProps;

/**
 * THE field label, on its own.
 *
 * Decision 8: a field label is a gold small-caps eyebrow. Masters 3, 4, 23, 24
 * and 30 all draw them that way (master 29 draws its two cream — B-9, settled
 * by the decision).
 * 2026-08-24: light draws the SAME eyebrow, in ink. It used to be a 13pt/600
 * sentence-case label — a different label, not the same one in a second
 * palette, and the widest instance of that fault in the app since every form in
 * it renders this component. The metrics are dark's, per the parity rule; only
 * the colour still forks.
 *
 * Exported because a form can contain a labelled control that is NOT a text
 * input — the posting wizard's budget DISPLAY pill is the first — and a second
 * hand-rolled copy of this treatment beside a real one is exactly how a form's
 * labels come to disagree. `TextField` renders this same component, so there is
 * one definition of the label and not two.
 */
export function FieldLabel({
  children,
  palette: paletteProp,
  tone = 'eyebrow',
}: {
  children: string;
  palette?: ColorPalette;
  tone?: 'eyebrow' | 'accent' | 'gold';
}) {
  const styles = stylesFor();
  const { palette: colors } = useThemeColors();
  const palette = paletteProp ?? colors;
  return (
    // 2026-09-27 (the Lux remake, ruling 4): gold in dark. 2026-09-28 (LUX-LIST-64
    // #48): the antique gold #86641A in light — the one eyebrow role.
    <Text style={[styles.label, { color: tone === 'accent' ? palette.emerald : tone === 'gold' ? palette.eyebrowGold : palette.eyebrow }]}>
      {children}
    </Text>
  );
}

export function TextField({
  label,
  error,
  hint,
  palette: paletteProp,
  labelTone = 'eyebrow',
  style,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  // 2026-09-28 (LUX-LIST-64 #8): the field you are typing in glows.
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <FieldLabel palette={palette} tone={labelTone}>
          {label}
        </FieldLabel>
        {hint ? <Text style={[styles.hint, { color: palette.textMuted }]}>{hint}</Text> : null}
      </View>
      <View style={styles.inputWrap}>
      <TextInput
        keyboardAppearance={isDark ? 'dark' : 'light'}
        multiline={multiline}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          // D5: a pill is the shape of a ONE-LINE field. A textarea that
          // inherits it bows its own corners away from the text block inside
          // it, so multi-line takes the card radius instead. Shape, not
          // colour — this lands in both themes.
          multiline && styles.inputMultiline,
          {
            color: palette.text,
            // 2026-09-27 (the Lux remake): the input is the Lux well — white
            // at .06 — inside the card it sits in; light keeps the white field.
            backgroundColor: isDark ? withAlpha(palette.white, 0.06) : palette.surface,
            borderColor: palette.border,
          },
          error && { borderColor: palette.danger },
          style,
        ]}
        placeholderTextColor={palette.textSubtle}
        autoCapitalize="none"
        {...rest}
      />
      <FocusRing
        focused={focused}
        color={error ? palette.danger : palette.emerald}
        radius={multiline ? radius.lg : radius.pill}
      />
      </View>
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  container: {
    gap: spacing.xs + 2,
  },
  // The glow is laid over the input, so the input sits in a box of its own.
  inputWrap: {
    position: 'relative',
  },
  // 2026-09-27 (the Lux remake, the operator's Post-a-job picture): the hint
  // ("Required · 0/80") sits right beside the label, not at the far right.
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: 12,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    // Masters 3/4/23/24/30 draw every SINGLE-LINE field as a full-round pill.
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    fontSize: 16,
  },
  inputMultiline: {
    borderRadius: radius.lg,
  },
  error: {
    fontSize: 12,
  },
}));
