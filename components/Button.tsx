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
import { fonts, metricStyles, radius, spacing, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { useOverrideNumber, useOverrideString } from '../lib/designOverrides';

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
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const styles = stylesFor();
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  const isDisabled = disabled || loading;
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';
  const isDestructive = variant === 'destructive';
  const sizeStyle = SIZES[size];

  // RUN S2 (C8) — each variant's own dials, plus the shared press/disabled
  // set. Every default below is the expression this button has always used;
  // a dial replaces exactly its own value and nothing else.
  const heightDial = useOverrideNumber(`button.${variant}.height`);
  const padXDial = useOverrideNumber(`button.${variant}.padX`);
  const radiusDial = useOverrideNumber(`button.${variant}.radius`);
  const fillDial = useOverrideString(`button.${variant}.fill`);
  const fillAlphaDial = useOverrideNumber(`button.${variant}.fillAlpha`);
  const borderDial = useOverrideString(`button.${variant}.border`);
  const borderAlphaDial = useOverrideNumber(`button.${variant}.borderAlpha`);
  const textDial = useOverrideString(`button.${variant}.text`);
  const iconGapDial = useOverrideNumber('button.iconGap');
  const pressedOpacityDial = useOverrideNumber('button.pressedOpacity');
  const pressedScaleDial = useOverrideNumber('button.pressedScale');
  const disabledOpacityDial = useOverrideNumber('button.disabledOpacity');
  // C10 — a hero-only drop shadow, OFF (opacity 0) until dialled.
  const heroShadowOpacity = useOverrideNumber('button.primary.shadowOpacity');
  const heroShadowRadius = useOverrideNumber('button.primary.shadowRadius');
  const heroShadowY = useOverrideNumber('button.primary.shadowOffsetY');
  const heroShadowColor = useOverrideString('button.primary.shadowColor');

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
    ? {
        backgroundColor: palette.surface,
        borderWidth: 1,
        // Dark device pass: the standard control's hairline was `border` —
        // the FLAT equivalent of dim gold — which on a phone was
        // indistinguishable from the disabled fill's edge, so enabled and
        // disabled read as the same dead control. Decision 3 says this
        // hairline is GOLD, so in dark it is now real gold at the top of the
        // manifest's measured hairline tier (gold @ 25–55%), the same
        // expression the segmented control's active cell already uses.
        // Neither rule moved: disabled is still flat neutralBg, no border.
        borderColor: isDark ? withAlpha(palette.gold, 0.55) : palette.border,
      }
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
  const finalTextColor = !isDisabled && textDial != null ? textDial : textColor;

  // The dial overlay — applied AFTER fillStyle so a set dial wins, and empty
  // (so byte-inert) while nothing is set. Disabled keeps decision 3's flat
  // treatment: only the opacity dial may dim it.
  const baseFillColor =
    'backgroundColor' in fillStyle && typeof fillStyle.backgroundColor === 'string'
      ? fillStyle.backgroundColor
      : undefined;
  const dialStyle = isDisabled
    ? disabledOpacityDial != null
      ? { opacity: disabledOpacityDial }
      : null
    : {
        ...(radiusDial != null ? { borderRadius: radiusDial } : null),
        ...(fillDial != null || (fillAlphaDial != null && baseFillColor && baseFillColor !== 'transparent')
          ? {
              backgroundColor: withAlpha(
                fillDial ?? (baseFillColor as string),
                fillAlphaDial ?? 1,
              ),
            }
          : null),
        ...((borderDial != null || borderAlphaDial != null) && (isSecondary || isDestructive)
          ? {
              borderColor: withAlpha(
                borderDial ??
                  (isDestructive ? palette.danger : isDark ? palette.gold : palette.border),
                borderAlphaDial ?? (isSecondary && isDark ? 0.55 : 1),
              ),
            }
          : null),
      };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        {
          height: heightDial ?? sizeStyle.height,
          paddingHorizontal: padXDial ?? sizeStyle.paddingHorizontal,
        },
        fillStyle,
        dialStyle,
        variant === 'primary' && !isDisabled && heroShadowOpacity != null && heroShadowOpacity > 0
          ? {
              shadowColor: heroShadowColor ?? palette.black,
              shadowOpacity: heroShadowOpacity,
              shadowRadius: heroShadowRadius ?? 12,
              shadowOffset: { width: 0, height: heroShadowY ?? 4 },
              elevation: Math.round((heroShadowRadius ?? 12) / 2),
            }
          : null,
        state.pressed &&
          !isDisabled &&
          (pressedOpacityDial != null || pressedScaleDial != null
            ? {
                opacity: pressedOpacityDial ?? 0.85,
                transform: [{ scale: pressedScaleDial ?? 1 }],
              }
            : styles.pressed),
        typeof style === 'function' ? style(state) : style,
      ]}
      // E2E5: on iOS this Pressable is one element whose folded label is the
      // glyph plus the title when an icon is set; the explicit label is the
      // title alone, so an exact match hits it. A caller-supplied label wins.
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={finalTextColor} />
      ) : icon ? (
        <View style={[styles.row, iconGapDial != null && { gap: iconGapDial }]}>
          {/* Sized from the title rather than a fixed number so it stays
              matched to the text at every ButtonSize. The row centres on one
              axis, so the glyph and the label share a baseline whichever side
              it sits on. */}
          {iconPosition === 'leading' ? (
            <Ionicons name={icon} size={sizeStyle.fontSize + 1} color={finalTextColor} />
          ) : null}
          <Text
            style={[styles.text, { fontSize: sizeStyle.fontSize, color: finalTextColor }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {iconPosition === 'trailing' ? (
            <Ionicons name={icon} size={sizeStyle.fontSize + 1} color={finalTextColor} />
          ) : null}
        </View>
      ) : (
        <Text style={[styles.text, { fontSize: sizeStyle.fontSize, color: finalTextColor }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
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
}));
