import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  glow,
  radius,
  selectedInDark,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { useDesignDial, useOverrideNumber, useOverrideValue } from '../lib/designOverrides';
import { SURFACE_GLOW_ALPHA } from '../ui/primitives/Surface';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * `default` is the original chip and is deliberately untouched — a muted label
 * on a white pill, filling with primary when selected. The three Emerald
 * variants below were added for the Home redesign:
 *
 * - `service`  white pill, forest icon + forest label. The quick-service
 *              chips. Same shape as `default`, but the label carries the brand
 *              green rather than reading as secondary text.
 * - `outlineGold` transparent fill behind a thin gold hairline. Used for the
 *              one control that sits on the page's own background rather than
 *              on a surface (Home's "Find work").
 * - `soft`     sage fill, no border. A non-interactive tag; pass no `onPress`
 *              and it renders as static text rather than a dead button.
 * - `filter`   the two-state feed control: sage when off, solid forest when
 *              on. Distinct from `default`'s selected state, which fills with
 *              `primary` — this one carries the Emerald `forest` so a row of
 *              filters matches the screen chrome around it.
 */
type ChipVariant = 'default' | 'service' | 'outlineGold' | 'soft' | 'filter';

type ChipProps = {
  label: string;
  icon?: IoniconName;
  selected?: boolean;
  onPress?: () => void;
  /** Tints the icon when unselected — e.g. each job category's own accent
   *  color, so a row of category chips reads as more than a single flat
   *  color. Selected state keeps its full-strength primary fill regardless,
   *  so which chip is chosen never depends on remembering a category color. */
  accentColor?: string;
  variant?: ChipVariant;
  /** `sm` is the tag-pill density — smaller text and tighter padding. It is
   *  only used by non-interactive `soft` tags, so it is allowed below the
   *  44pt touch minimum that every tappable chip still keeps. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  /** 2026-09-21: the chip's own layout, for a caller that must decide
   *  something from its measured width (the worker card's full-or-short
   *  category label). Forwarded to the outer view, whichever kind it is. */
  onLayout?: (event: LayoutChangeEvent) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function Chip({
  label,
  icon,
  selected = false,
  onPress,
  accentColor,
  variant = 'default',
  size = 'md',
  style,
  onLayout,
  accessibilityLabel,
  accessibilityHint,
}: ChipProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const small = size === 'sm';
  const isFilter = variant === 'filter';
  // emerald D6: ONE selected treatment in dark — gold outline, gold label, no
  // fill. Light keeps each variant's Heritage selected state untouched.
  const chosen = selectedInDark(colors);
  const goldSelected = selected && isDark;

  // Resolved once, so the icon and the label can never disagree about which
  // variant is being rendered. Prestige (master 44 / cross-cutting chip
  // vocabulary): in dark, service chips are sage with a GREEN glyph and a
  // CREAM label (master 44 draws them that way), and gold-outline chips
  // carry a gold glyph + cream label; light keeps the Heritage forest.
  const iconColor = goldSelected
    ? chosen.line
    : selected
    ? (isFilter ? colors.onForest : colors.onPrimary)
    : variant === 'service'
      ? (isDark ? colors.emerald : colors.forest)
      : variant === 'outlineGold'
        ? (isDark ? colors.gold : colors.forest)
        : variant === 'soft'
          ? colors.emerald
          : isFilter
            ? (accentColor ?? colors.ink)
            : (accentColor ?? colors.textMuted);

  const labelColor = goldSelected
    ? chosen.line
    : selected
    ? (isFilter ? colors.onForest : colors.onPrimary)
    : variant === 'service'
      ? (isDark ? colors.ink : colors.forest)
      : variant === 'outlineGold'
        ? (isDark ? colors.ink : colors.forest)
        : variant === 'soft'
          ? colors.emerald
          : isFilter
            ? colors.ink
            : colors.textMuted;

  const content = (
    <>
      {icon && <Ionicons name={icon} size={small ? 13 : 16} color={iconColor} />}
      <Text
        style={[styles.label, small && styles.labelSmall, { color: labelColor }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  // RUN S2 (C8) — the chip geometry dials; colours stay each variant's own.
  const padXDial = useOverrideNumber('chip.paddingX');
  const padYDial = useOverrideNumber('chip.paddingY');
  const radiusDial = useOverrideNumber('chip.radius');
  const gapDial = useOverrideNumber('chip.gap');
  const borderWidthDial = useOverrideNumber('chip.borderWidth');
  const minHeightDial = useOverrideNumber('chip.minHeight');
  // C10 — glow-on-selection: OFF by default; when the studio turns it on,
  // the CHOSEN chip lights (dark theme), the rest stay dark, and the global
  // glow dial sets the intensity.
  const chipGlowOn = useOverrideValue('glow.chipSelection') === true;
  const glowAlphaDial = useDesignDial('glowAlpha');
  const selectionGlow =
    chipGlowOn && goldSelected
      ? glow.halo(withAlpha(chosen.line, glowAlphaDial ?? SURFACE_GLOW_ALPHA))
      : null;
  const chipDial = {
    ...(padXDial != null ? { paddingHorizontal: padXDial } : null),
    ...(padYDial != null ? { paddingVertical: padYDial } : null),
    ...(radiusDial != null ? { borderRadius: radiusDial } : null),
    ...(gapDial != null ? { gap: gapDial } : null),
    ...(borderWidthDial != null ? { borderWidth: borderWidthDial } : null),
    ...(minHeightDial != null && onPress ? { minHeight: minHeightDial } : null),
  };

  const shape = [
    styles.chip,
    onPress && styles.chipInteractive,
    small && styles.chipSmall,
    chipDial,
    // Dark service chips wear the masters' sage fill; light keeps the white
    // pill unchanged (no style, so the base chip shows through).
    variant === 'service' && isDark && styles.chipServiceDark,
    variant === 'outlineGold' && styles.chipOutlineGold,
    variant === 'soft' && styles.chipSoft,
    isFilter && styles.chipFilter,
    // Order matters: the filter variant's own selected fill has to win over
    // both its unselected sage and `default`'s primary fill.
    selected && (isFilter ? styles.chipFilterSelected : styles.chipSelected),
    // emerald D6 — the ONE selected treatment in dark, replacing three: the
    // distance chip's gold outline (which masters 12 and 33 already drew), the
    // default variant's `primary` fill and the filter variant's forest fill.
    // Gold line, gold label, NO fill, so gold stays line-work and a chosen
    // chip reads as a step up from its neighbours rather than as a different
    // colour. Applied last so it wins over every variant's own selected fill;
    // light keeps each variant's Heritage pair untouched.
    goldSelected && { backgroundColor: chosen.fill, borderColor: chosen.line },
    selectionGlow,
    style,
  ];

  // A tag with no handler is a label, not a button. Rendering it as a
  // Pressable would put a focusable, screen-reader-announced control on screen
  // that does nothing when activated.
  if (!onPress) return <View style={shape} onLayout={onLayout}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={({ pressed }) => [...shape, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSmall: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    gap: spacing.xs,
  },
  chipInteractive: {
    minHeight: 44,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipServiceDark: {
    backgroundColor: colors.mint,
    borderColor: colors.mint2,
  },
  chipOutlineGold: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  chipSoft: {
    backgroundColor: colors.mint,
    borderColor: colors.mint,
  },
  chipFilter: {
    backgroundColor: colors.mint,
    borderColor: colors.mint,
  },
  chipFilterSelected: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  labelSmall: {
    fontSize: 12,
    fontWeight: '600',
  },
  }),
);
