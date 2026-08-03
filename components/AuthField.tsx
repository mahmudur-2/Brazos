import { forwardRef, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { authColors, authRadius, authSizes, authSpacing, authType } from '../lib/authTheme';

// Border crossfade on focus. Colour can't run on the native driver, so this is
// a JS-driven value — one animated property on one view.
const FOCUS_MS = 160;

type AuthFieldProps = {
  /** Rendered as the reference's small uppercase field caption. */
  label: string;
  error?: string | null;
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
  { label, error, style, onFocus, onBlur, ...rest },
  ref
) {
  const focus = useRef(new Animated.Value(0)).current;

  const run = (to: number) =>
    Animated.timing(focus, {
      toValue: to,
      duration: FOCUS_MS,
      useNativeDriver: false,
    }).start();

  const borderColor = error
    ? authColors.danger
    : focus.interpolate({
        inputRange: [0, 1],
        outputRange: [authColors.line, authColors.emerald],
      });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Animated.View style={[styles.field, { borderColor }]}>
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={authColors.placeholder}
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
      </Animated.View>
      {/* Nothing is reserved for this: the message adds 4pt when it appears,
          which is small enough that a validation error can't shove the submit
          button out from under a thumb. */}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
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
    justifyContent: 'center',
  },
  input: {
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
