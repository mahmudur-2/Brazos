import { forwardRef, useRef, type ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';
import { authSurface, useThemeColors } from '../lib/theme';

// Border crossfade on focus. Colour can't run on the native driver, so this is
// a JS-driven value — one animated property on one view.
const FOCUS_MS = 160;

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
  const focus = useRef(new Animated.Value(0)).current;
  const { palette, isDark } = useThemeColors();
  const surface = authSurface(palette, isDark);

  const run = (to: number) =>
    Animated.timing(focus, {
      toValue: to,
      duration: FOCUS_MS,
      useNativeDriver: false,
    }).start();

  // Masters 3/4: gold field label, gold hairline, cream value on the screen's
  // own near-black. Untouched screens keep every Heritage value below.
  const idleLine = themed ? surface.line : authColors.line;
  const focusLine = themed ? palette.emerald : authColors.emerald;
  const danger = themed ? surface.danger : authColors.danger;

  const borderColor = error
    ? danger
    : focus.interpolate({
        inputRange: [0, 1],
        outputRange: [idleLine, focusLine],
      });

  return (
    <View style={styles.container}>
      <Text style={[styles.label, themed && { color: surface.accent }]}>{label}</Text>
      <Animated.View
        style={[
          styles.field,
          themed && { backgroundColor: isDark ? surface.bg : surface.surface },
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
            run(1);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            run(0);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
          {...rest}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Animated.View>
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
