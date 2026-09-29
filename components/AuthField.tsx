import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { authSurface, useThemeColors, withAlpha } from '../lib/theme';
import { FocusRing } from './FocusRing';

type AuthFieldProps = {
  /** Rendered as the reference's small uppercase field caption. */
  label: string;
  error?: string | null;
  /**
   * Opt in to the Prestige mapping (masters 3/4 only). Absent, the field is
   * byte-identical to the Heritage ivory input every other auth screen uses.
   */
  themed?: boolean;
  /** Leading glyph inside the field — masters 3 and 4 give every field one. */
  leading?: ReactNode;
  /** Trailing control inside the field (master 4's password eye). */
  trailing?: ReactNode;
} & TextInputProps;

/**
 * A labelled input in the emerald auth style (uppercase caption, 54pt white
 * field, 14pt radius, hairline border that warms to emerald on focus).
 *
 * Not a change to components/TextField.tsx: that one carries the in-app cream
 * palette and is used by fifteen screens, so the auth surface gets its own
 * rather than threading a palette prop through all of them.
 */
export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, error, style, onFocus, onBlur, themed = false, leading, trailing, ...rest },
  ref
) {
  // 2026-09-28 (LUX-LIST-64 #8): focus is a state the glow reads — the ring
  // fades on the native driver (components/FocusRing.tsx), not a JS colour tween.
  const [focused, setFocused] = useState(false);
  const { palette, isDark } = useThemeColors();
  const surface = authSurface(palette, isDark);

  // Masters 3/4: gold field label, gold hairline, cream value on the screen's
  // own near-black. Untouched screens keep every Heritage value below.
  const idleLine = themed ? surface.line : authColors.line;
  const focusLine = themed ? palette.emerald : authColors.emerald;
  const danger = themed ? surface.danger : authColors.danger;

  const borderColor = error ? danger : idleLine;

  return (
    <View style={styles.container}>
      {/* 2026-09-28 (LUX-LIST-64 #1–#3): the caption is the mint (the light
          token's green in light) — sign-in and sign-up only; AuthField is
          theirs alone. */}
      <Text style={[styles.label, themed && { color: surface.fieldLabel }]}>{label}</Text>
      <View
        style={[
          styles.field,
          // 2026-09-27 (the Lux remake): in dark the field is the Lux well —
          // white at .06 — inside the pop-out card it sits in, not the ground.
          themed && { backgroundColor: isDark ? withAlpha(palette.white, 0.06) : surface.surface },
          { borderColor },
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <TextInput
          ref={ref}
          style={[
            styles.input,
            leading ? styles.inputWithLeading : null,
            themed && { color: surface.ink },
            style,
          ]}
          placeholderTextColor={themed ? surface.placeholder : authColors.placeholder}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
          {...rest}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        <FocusRing focused={focused} color={error ? danger : focusLine} radius={authRadius.field} />
      </View>
      {/* Nothing is reserved for this: the message adds 4pt when it appears,
          which is small enough that a validation error can't shove the submit
          button out from under a thumb. */}
      {error ? (
        <Text
          style={[styles.error, themed && { color: danger }]}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    ...authType.fieldLabel,
    color: authColors.muted,
    textTransform: 'uppercase',
    marginLeft: 2,
  },
  field: {
    minHeight: authSizes.field,
    backgroundColor: authColors.surface,
    borderWidth: 1,
    borderRadius: authRadius.field,
    // Row rather than centred so a leading glyph and a trailing control can
    // sit inside the field; with neither, a single child centres identically.
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    paddingLeft: authSpacing.lg - 2,
  },
  trailing: {
    paddingRight: authSpacing.lg - 2,
  },
  inputWithLeading: {
    paddingLeft: authSpacing.md,
  },
  input: {
    flex: 1,
    minWidth: 0,
    ...authType.fieldValue,
    color: authColors.ink,
    paddingHorizontal: authSpacing.lg - 2,
    paddingVertical: authSpacing.md,
    // Minus the wrapper's two 1pt borders, so the field measures exactly
    // authSizes.field and lines up with PhoneNumberInput's row when the two
    // are stacked in the same form.
    minHeight: authSizes.field - 2,
  },
  error: {
    fontSize: 13,
    color: authColors.danger,
    marginLeft: 2,
    marginTop: 2,
  },
});
