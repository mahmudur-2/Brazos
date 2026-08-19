import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { fonts, spacing, useThemeColors, type ColorPalette } from '../lib/theme';

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
  /** Small glyph rendered inline immediately after the title text. Distinct
   *  from `right`, which pins its content to the far edge of the header. */
  titleIcon?: ReactNode;
  /** Bumps the title's own size. Defaults to the standard 24. */
  titleSize?: number;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  onPressTitle,
  palette: paletteProp,
  titleIcon,
  titleSize,
}: ScreenHeaderProps) {
  const { palette: colors } = useThemeColors();
  const palette = paletteProp ?? colors;
  const titleText = (
    <Text
      style={[
        styles.title,
        { color: palette.text },
        // flexShrink (not flex:1) so a long title truncates instead of
        // shoving titleIcon off the row — the icon stays adjacent either way.
        titleIcon ? styles.titleShrinkable : null,
        titleSize ? { fontSize: titleSize } : null,
      ]}
      numberOfLines={1}
    >
      {title}
    </Text>
  );

  const titles = (
    <>
      {titleIcon ? (
        <View style={styles.titleRow}>
          {titleText}
          {titleIcon}
        </View>
      ) : (
        titleText
      )}
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
  // Decision 9: a screen title is display type. Every master draws the
  // header title in the serif, both trees and both themes.
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleShrinkable: {
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  right: {
    marginLeft: spacing.sm,
  },
});
