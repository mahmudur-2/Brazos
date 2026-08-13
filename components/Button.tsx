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

type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, { height: number; fontSize: number; paddingHorizontal: number }> = {
  // For a bounded action that has to sit inline with other content (a
  // screen header, a card's title row) rather than stand alone the way
  // every other button on the app does — still >=44pt tall for a reliable
  // touch target.
  sm: { height: 44, fontSize: 13, paddingHorizontal: 14 },
  md: { height: 52, fontSize: 16, paddingHorizontal: 16 },
  lg: { height: 64, fontSize: 19, paddingHorizontal: 20 },
};

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /**
   * `destructive` is the secondary shape in the danger palette — red label,
   * red glyph, red border over a faint red tint. For actions that end
   * something (signing out, and nothing else today). Kept as a variant rather
   * than a per-call `palette` override so every destructive control in the
   * app is the same red without each caller re-deriving it.
   */
  variant?: 'primary' | 'secondary' | 'destructive';
  /** Taller, larger-text variant for buttons that need more visual weight. */
  size?: ButtonSize;
  /** Overrides fill/text colors, e.g. for the Map tab's dark mode. */
  palette?: ColorPalette;
  /** Small glyph rendered beside the title. Inherits the title's color so it
   *  can't drift from the variant's text treatment. */
  icon?: IoniconName;
  /**
   * Which side of the label the glyph sits on. Defaults to 'trailing', which
   * is what every existing caller renders — this prop was added for the
   * negotiation card, where the reference design leads each action with its
   * meaning (check / swap / X) so the three read as a set at a glance.
   */
  iconPosition?: 'leading' | 'trailing';
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
  iconPosition = 'trailing',
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';
  const isDestructive = variant === 'destructive';
  const sizeStyle = SIZES[size];

  // dangerBg is a pale tint of danger in the light palette and a dark one in
  // the dark palette, so `danger` text stays legible on it either way — the
  // same pairing the status badges already rely on.
  const fillStyle = isDestructive
    ? {
        backgroundColor: palette.dangerBg,
        borderWidth: 1,
        borderColor: palette.danger,
      }
    : isSecondary
    ? { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }
    : { backgroundColor: palette.primary };
  const textColor = isDestructive
    ? palette.danger
    : isSecondary
    ? palette.primary
    : palette.onPrimary;

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
          {/* Sized from the title rather than a fixed number so it stays
              matched to the text at every ButtonSize. The row centres on one
              axis, so the glyph and the label share a baseline whichever side
              it sits on. */}
          {iconPosition === 'leading' ? (
            <Ionicons name={icon} size={sizeStyle.fontSize + 1} color={textColor} />
          ) : null}
          <Text
            style={[styles.text, { fontSize: sizeStyle.fontSize, color: textColor }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {iconPosition === 'trailing' ? (
            <Ionicons name={icon} size={sizeStyle.fontSize + 1} color={textColor} />
          ) : null}
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
