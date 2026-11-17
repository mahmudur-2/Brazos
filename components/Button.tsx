import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  dangerBright,
  fonts,
  metricStyles,
  radius,
  shadows,
  spacing,
  useThemeColors,
  wellStyle,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { PressScale } from './PressScale';

/** The press dims the button to this while the finger is down (PressScale `dim`). */
const PRESS_DIM = 0.85;

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
   * - `destructive` is THE ONE RED (A2-M2, ui/tokens.ts `dangerBright`): a solid
   *   #F83641 fill under a black label in both themes, with the red glow in
   *   dark and the soft card shadow in light. For actions that end something.
   *   Kept as a variant rather than a per-call `palette` override so every
   *   destructive control in the app is the same red without each caller
   *   re-deriving it — a pop-up's red confirm included (ConfirmDialog).
   * - `quiet` (A2-M2) is a WELL: the part sunk into the card it sits in
   *   (lib/theme.ts `wellStyle`), its label the mint in dark and the dark green
   *   in light. "Lift the container, not each outline": no shadow, no gradient.
   * Disabled (any variant) flattens: desaturated fill, muted text, no border.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'quiet';
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
  /**
   * A2-M3 — in a ROW, a button that keeps its own width (no `flex`) beside one that has a share
   * takes the row's height too, so the pair stays one height when the other's label wraps
   * (ConfirmDialog's Cancel). PressScale `fill="height"`. Never in a column.
   */
  pairHeight?: boolean;
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
  pairHeight = false,
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
  const isQuiet = variant === 'quiet';
  const sizeStyle = SIZES[size];
  // A2-M2 (direction B): a button given a share of its row keeps its pair's height (PressScale `fill`).
  const flatStyle = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style);
  const sharesRow = typeof flatStyle?.flex === 'number' && flatStyle.flex > 0;

  const fillStyle = isDisabled
    ? // Decision 3: disabled is a flat desaturated fill, no border — in every
      // variant, so a dead hero can never keep wearing the conversion green.
      { backgroundColor: palette.neutralBg }
    : isDestructive
    ? { backgroundColor: dangerBright.fill }
    : isQuiet
    ? wellStyle(palette, isDark)
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
        // 2026-09-27 (the Lux remake): the standard control's hairline is the
        // mint-neutral rim in dark (the Lux `.btn2`), never the warm gold line.
        borderColor: isDark ? withAlpha(palette.emerald, 0.35) : palette.border,
      }
    : isDark
    ? // 2026-09-26 (the refresh): the Emerald Lux CTA — a mint gradient pill
      // with the dark Lux ink (`onPrimary`); the flat primary under it is the
      // same mint, so a surface that cannot draw the gradient still reads right.
      {
        backgroundColor: palette.primary,
        experimental_backgroundImage: `linear-gradient(135deg, ${palette.ctaTop}, ${palette.ctaBottom})`,
      }
    : { backgroundColor: palette.primary };
  const textColor = isDisabled
    ? palette.textMuted
    : isDestructive
    ? dangerBright.label
    : isQuiet
    ? isDark
      ? palette.primary
      : palette.forest
    : isGhost
    ? isDark
      ? palette.emerald
      : palette.primary
    : isSecondary
    ? isDark
      ? palette.emerald
      : palette.primary
    : palette.onPrimary;
  // F1: a caller that dresses a button in its danger colour (palette.primary set to
  // palette.danger) gets red in dark too — dark's secondary would read emerald and drop it.
  const dangerDark = isDark && isSecondary && !isDisabled && !!paletteProp && paletteProp.primary === paletteProp.danger;
  const finalTextColor = dangerDark ? palette.danger : textColor;

  // A2-M2 (direction B): a label is never cut: up to two lines, centred, and smaller only past two.
  const label = (
    <Text
      style={[styles.text, { fontSize: sizeStyle.fontSize, color: finalTextColor }]}
      numberOfLines={2}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {title}
    </Text>
  );

  // FIX-RUN F12: the shared press — it sinks on a spring (the 120 Hz path where the binary has
  // worklets).
  return (
    <PressScale
      onPress={onPress}
      disabled={isDisabled}
      dim={PRESS_DIM}
      fill={sharesRow || (pairHeight ? 'height' : false)}
      style={(state) => [
        styles.base,
        {
          // 2026-09-26 (the refresh, audit M-36): a floor, not a ceiling, so
          // the label grows with Dynamic Type instead of clipping. A one-line
          // label still sits at exactly this height.
          minHeight: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
        },
        fillStyle,
        dangerDark && { borderColor: palette.danger },
        // 2026-09-27 (the operator's review): the Lux `.cta` glow under
        // every primary button in dark (ui/tokens.ts `shadows.ctaDark`).
        variant === 'primary' && !isDisabled && isDark ? shadows.ctaDark : null,
        // A2-M2: the red's glow in dark, the soft card shadow in light (direction 6).
        isDestructive && !isDisabled ? (isDark ? dangerBright.glow : shadows.card) : null,
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
        <View style={styles.row}>
          {/* Sized from the title rather than a fixed number so it stays
              matched to the text at every ButtonSize. The row centres on one
              axis, so the glyph and the label share a baseline whichever side
              it sits on. */}
          {iconPosition === 'leading' ? (
            <Ionicons name={icon} size={sizeStyle.fontSize + 1} color={finalTextColor} />
          ) : null}
          <View style={styles.labelBox}>{label}</View>
          {iconPosition === 'trailing' ? (
            <Ionicons name={icon} size={sizeStyle.fontSize + 1} color={finalTextColor} />
          ) : null}
        </View>
      ) : (
        label
      )}
    </PressScale>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    // Decision 9: button labels speak the display serif in both themes.
    fontFamily: fonts.display,
    fontWeight: '700',
    textAlign: 'center',
    // The two-line limit must never clip a glyph's edge at the label's box (react-native-web
    // draws the limit with `overflow: clip`); iOS truncates by layout, so this changes nothing there.
    overflow: 'visible',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Beside a glyph the label may still take its two lines rather than push the glyph out.
  labelBox: {
    flexShrink: 1,
  },
}));
