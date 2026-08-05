import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors, radius, spacing } from '../lib/theme';

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
 *              on a surface (Home's "Switch to Worker").
 * - `soft`     sage fill, no border. A non-interactive tag; pass no `onPress`
 *              and it renders as static text rather than a dead button.
 */
type ChipVariant = 'default' | 'service' | 'outlineGold' | 'soft';

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
  accessibilityLabel,
  accessibilityHint,
}: ChipProps) {
  const small = size === 'sm';

  // Resolved once, so the icon and the label can never disagree about which
  // variant is being rendered.
  const iconColor = selected
    ? colors.onPrimary
    : variant === 'service' || variant === 'outlineGold'
      ? colors.forest
      : variant === 'soft'
        ? colors.emerald
        : (accentColor ?? colors.textMuted);

  const labelColor = selected
    ? colors.onPrimary
    : variant === 'service' || variant === 'outlineGold'
      ? colors.forest
      : variant === 'soft'
        ? colors.emerald
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

  const shape = [
    styles.chip,
    small && styles.chipSmall,
    variant === 'outlineGold' && styles.chipOutlineGold,
    variant === 'soft' && styles.chipSoft,
    selected && styles.chipSelected,
    style,
  ];

  // A tag with no handler is a label, not a button. Rendering it as a
  // Pressable would put a focusable, screen-reader-announced control on screen
  // that does nothing when activated.
  if (!onPress) return <View style={shape}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [...shape, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipOutlineGold: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  chipSoft: {
    backgroundColor: colors.mint,
    borderColor: colors.mint,
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
});
