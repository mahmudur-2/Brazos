import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { colors, fonts, spacing } from '../lib/theme';

type SectionHeaderProps = {
  title: string;
  /** Optional trailing link, e.g. "View all →". Omitted entirely when absent
   *  rather than rendered as a disabled control. */
  actionLabel?: string;
  onAction?: () => void;
  /** Rendered under the title — the live-activity row on Home, for instance.
   *  Kept as a slot so this component never has to know what a caller wants
   *  to put there. */
  children?: ReactNode;
};

/**
 * The Emerald section heading: a serif display title, with an optional
 * trailing action on the same baseline.
 *
 * The action is only interactive when it has both a label and a handler, so a
 * caller can't accidentally render an arrow that goes nowhere.
 */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  children,
}: SectionHeaderProps) {
  const showAction = !!actionLabel && !!onAction;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>

        {showAction ? (
          <Pressable
            onPress={onAction}
            hitSlop={10}
            style={styles.action}
            accessibilityRole="button"
          >
            <Text style={styles.actionLabel}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={15} color={colors.forest} />
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    // flexShrink so a long title truncates instead of shoving the action off
    // the row — the action is the thing that must never become unreachable.
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    // Keeps the tap target honest without padding the text away from the
    // title's baseline.
    minHeight: 44,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.forest,
  },
});
