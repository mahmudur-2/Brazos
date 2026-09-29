import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { metricStyles, useThemeColors } from '../lib/theme';
import { FocusRing } from './FocusRing';

type GlowTextInputProps = TextInputProps & {
  /** The corner of the input's own bordered box, which the glow hugs. */
  glowRadius: number;
  /** The layout the input used to take in its row (flex, margins) — the
   *  wrapper takes it now, so the glow sits exactly on the input's edge. */
  wrapStyle?: StyleProp<ViewStyle>;
};

/**
 * 2026-09-28 (LUX-LIST-64 #8) — a bordered TextInput that glows while it has
 * focus, the way every other field does (components/FocusRing.tsx): the rim
 * turns the mint at .55 and a soft 3pt ring shows around it. For the screens
 * that draw their own input rather than using TextField.
 */
export const GlowTextInput = forwardRef<TextInput, GlowTextInputProps>(function GlowTextInput(
  { glowRadius, wrapStyle, onFocus, onBlur, ...rest },
  ref
) {
  const styles = stylesFor();
  const { palette } = useThemeColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, wrapStyle]}>
      <TextInput
        ref={ref}
        {...rest}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      <FocusRing focused={focused} color={palette.emerald} radius={glowRadius} />
    </View>
  );
});

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    wrap: {
      position: 'relative',
    },
  })
);
