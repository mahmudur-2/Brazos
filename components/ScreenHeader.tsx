import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { colors, spacing, type ColorPalette } from '../lib/theme';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  /** Makes the title/subtitle block tappable — e.g. chat's title opening the
   *  counterparty's profile. Omitted, the block renders inert as before. */
  onPressTitle?: () => void;
  /** Overrides title/subtitle/back-icon colors, e.g. for the Map tab's dark mode. */
  palette?: ColorPalette;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  onPressTitle,
  palette = colors,
}: ScreenHeaderProps) {
  const titles = (
    <>
      <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.subtitle, { color: palette.textMuted }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={palette.text} />
        </Pressable>
      ) : null}

      {onPressTitle ? (
        <Pressable style={styles.titles} onPress={onPressTitle}>
          {titles}
        </Pressable>
      ) : (
        <View style={styles.titles}>{titles}</View>
      )}

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  back: {
    marginLeft: -spacing.xs,
  },
  titles: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  right: {
    marginLeft: spacing.sm,
  },
});
