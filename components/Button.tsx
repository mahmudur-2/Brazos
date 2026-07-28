import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors, radius, spacing, type ColorPalette } from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type ButtonSize = 'md' | 'lg';

const SIZES: Record<ButtonSize, { height: number; fontSize: number; paddingHorizontal: number }> = {
  md: { height: 52, fontSize: 16, paddingHorizontal: 16 },
  lg: { height: 64, fontSize: 19, paddingHorizontal: 20 },
};

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  /** Taller, larger-text variant for buttons that need more visual weight. */
  size?: ButtonSize;
  /** Overrides fill/text colors, e.g. for the Map tab's dark mode. */
  palette?: ColorPalette;
  /** Small glyph rendered after the title. Inherits the title's color so it
   *  can't drift from the variant's text treatment. */
  icon?: IoniconName;
} & Omit<PressableProps, 'onPress' | 'disabled'>;

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  palette = colors,
  icon,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';
  const sizeStyle = SIZES[size];

  const fillStyle = isSecondary
    ? { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }
    : { backgroundColor: palette.primary };
  const textColor = isSecondary ? palette.primary : palette.onPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
        },
        fillStyle,
        state.pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : icon ? (
        <View style={styles.row}>
          <Text style={[styles.text, { fontSize: sizeStyle.fontSize, color: textColor }]}>
            {title}
          </Text>
          {/* Sized from the title rather than a fixed number so it stays
              matched to the text at every ButtonSize. */}
          <Ionicons name={icon} size={sizeStyle.fontSize + 1} color={textColor} />
        </View>
      ) : (
        <Text style={[styles.text, { fontSize: sizeStyle.fontSize, color: textColor }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
