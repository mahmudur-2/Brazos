import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  controls,
  layout,
  radius,
  spacing,
  type EmeraldPalette,
  type as typeScale,
} from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The shared "nothing here" surface, used directly by screens and by every
 * template's empty/error/offline/permission-denied states (§I).
 *
 * One component covers all four because they are the same shape — a glyph, a
 * plain-language title, a sentence explaining what happened, and at most one
 * action — and keeping them as one is what stops four near-identical
 * treatments drifting apart across ~40 routes. What differs between them is
 * the `tone`, which only changes the glyph's colour, not the layout.
 */

type EmptyStateProps = {
  icon?: IoniconName;
  title: string;
  /** One or two sentences. Say what happened and what to do about it. */
  body?: string;
  /** Omit for a genuinely terminal state. A button with nothing useful behind
   *  it is worse than no button. */
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'attention';
};

export function EmptyState({
  icon = 'ellipse-outline',
  title,
  body,
  actionLabel,
  onAction,
  tone = 'neutral',
}: EmptyStateProps) {
  const { emerald: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const glyphColor = tone === 'attention' ? colors.danger : colors.emerald;
  const glyphBg = tone === 'attention' ? colors.dangerSurface : colors.mint;

  return (
    <View style={styles.wrap}>
      <View style={[styles.glyph, { backgroundColor: glyphBg }]}>
        <Ionicons name={icon} size={26} color={glyphColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenGutter,
    // Keeps a long body from running edge to edge on a large phone.
    paddingVertical: spacing.xxxl,
  },
  glyph: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typeScale.h2,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    ...typeScale.body,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: layout.maxContentWidth,
  },
  action: {
    minHeight: controls.buttonHeightSmall,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    marginTop: spacing.xs,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionLabel: {
    ...typeScale.title,
    color: colors.onForest,
  },
  }),
);
