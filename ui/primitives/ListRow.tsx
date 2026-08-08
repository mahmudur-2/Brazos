import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { colors, controls, layout, spacing, type as typeScale } from '../tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The settings/list row (§I): optional leading glyph, title, optional
 * subtitle, optional trailing content, optional chevron.
 *
 * Text truncation is built in rather than left to each caller: a long title or
 * subtitle gets `numberOfLines` inside a `flex: 1` parent, so it truncates
 * instead of pushing the trailing control off-screen. That is CLAUDE.md's
 * mobile rule, applied once here so ~40 routes inherit it.
 */

type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: IoniconName;
  /** A value, badge, switch — anything trailing. Kept as a node so this
   *  component never grows a prop per possible accessory. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Shown only when the row navigates somewhere. */
  showChevron?: boolean;
  tone?: 'default' | 'danger';
  style?: StyleProp<ViewStyle>;
};

export function ListRow({
  title,
  subtitle,
  icon,
  trailing,
  onPress,
  showChevron = false,
  tone = 'default',
  style,
}: ListRowProps) {
  const titleColor = tone === 'danger' ? colors.danger : colors.ink;
  const glyphColor = tone === 'danger' ? colors.danger : colors.emerald;

  const content = (
    <>
      {icon ? <Ionicons name={icon} size={20} color={glyphColor} style={styles.icon} /> : null}
      {/* flex:1 is what makes the truncation above actually truncate. */}
      <View style={styles.text}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {showChevron && onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.navInactive} />
      ) : null}
    </>
  );

  // A row with no handler is a display row, not a button — rendering it as a
  // Pressable would announce a control to a screen reader that does nothing.
  if (!onPress) return <View style={[styles.row, style]}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: controls.minTouchTarget,
    paddingVertical: spacing.md,
    paddingHorizontal: layout.screenGutter,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.mint,
  },
  icon: {
    width: 24,
    textAlign: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typeScale.title,
  },
  subtitle: {
    ...typeScale.sub,
    color: colors.muted,
  },
  trailing: {
    flexShrink: 0,
  },
});
