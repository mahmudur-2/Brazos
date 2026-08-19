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
import { fonts, radius, spacing, useThemeColors, type ColorPalette } from '../lib/theme';

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
   * The Prestige button law (pre-made decision 3):
   * - `primary` is the HERO — the one solid forest fill a screen is allowed
   *   (Post a job, search-go, Choose best-fit). Everything else steps down.
   * - `secondary` is the STANDARD — surface fill, hairline border (the dark
   *   palette's `border` IS the dim-gold hairline), serif label: cream ink in
   *   dark, Heritage forest in light.
   * - `ghost` is bare serif text — gold in dark, Heritage forest in light.
   * - `destructive` is the secondary shape in the danger palette — red label,
   *   red glyph, red border over a faint red tint. For actions that end
   *   something (signing out, and nothing else today). Kept as a variant
   *   rather than a per-call `palette` override so every destructive control
   *   in the app is the same red without each caller re-deriving it.
   * Disabled (any variant) flattens: desaturated fill, muted text, no border.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
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
  palette: paletteProp,
  icon,
  iconPosition = 'trailing',
  style,
  ...rest
}: ButtonProps) {
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';
  const isDestructive = variant === 'destructive';
  const sizeStyle = SIZES[size];

  // dangerBg is a pale tint of danger in the light palette and a dark one in
  // the dark palette, so `danger` text stays legible on it either way — the
  // same pairing the status badges already rely on.
  const fillStyle = isDisabled
    ? // Decision 3: disabled is a flat desaturated fill, no border — in every
      // variant, so a dead hero can never keep wearing the conversion green.
      { backgroundColor: palette.neutralBg }
    : isDestructive
    ? {
        backgroundColor: palette.dangerBg,
        borderWidth: 1,
        borderColor: palette.danger,
      }
    : isGhost
    ? { backgroundColor: 'transparent' }
    : isSecondary
    ? { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }
    : { backgroundColor: palette.primary };
  const textColor = isDisabled
    ? palette.textMuted
    : isDestructive
    ? palette.danger
    : isGhost
    ? isDark
      ? palette.gold
      : palette.primary
    : isSecondary
    ? isDark
      ? palette.ink
      : palette.primary
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
  text: {
    // Decision 9: button labels speak the display serif in both themes.
    fontFamily: fonts.display,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
