import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PropsWithChildren } from 'react';
import {
  radius,
  shadows,
  spacing,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  /** What a pressable card can DO, for a screen reader. A long-press is
   *  invisible without one — there is nothing on screen that says the gesture
   *  exists. Ignored on a card with no press handler at all. */
  accessibilityHint?: string;
  /** Overrides surface/border colors, e.g. for the Map tab's dark mode. Defaults to the light palette. */
  palette?: ColorPalette;
}>;

export function Card({
  children,
  style,
  onPress,
  onLongPress,
  accessibilityHint,
  palette: paletteProp,
}: CardProps) {
  const { palette: colors } = useThemeColors();
  const palette = paletteProp ?? colors;
  const paletteStyle = {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  };

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityHint={accessibilityHint}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.card,
          paletteStyle,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, paletteStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadows.card,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.997 }],
  },
});
