import { Image, StyleSheet, Text, View } from 'react-native';
import { fonts, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';
import { getInitials } from '../lib/profiles';

type AvatarProps = {
  name?: string | null;
  uri?: string | null;
  size?: number;
};

export function Avatar({ name, uri, size = 44 }: AvatarProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  // Prestige decision 8 — in dark every avatar wears the gold ring and the
  // fallback speaks gold initials on the deep-green fill; light keeps its
  // Heritage arrangement of primary fill and cream initials.
  //
  // 2026-08-24: the ring is drawn in BOTH, at one weight. It was dark-only,
  // which made an avatar a different SHAPE in light rather than the same shape
  // in a second palette — and 1.5pt of border insets the image, so the two
  // themes were cropping the photo differently too. Light rings in the
  // palette's hairline; only the colour forks.
  const ring = {
    borderWidth: 1.5,
    borderColor: isDark ? withAlpha(colors.gold, 0.75) : colors.border,
  };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension, ring]} />;
  }

  return (
    <View style={[styles.fallback, dimension, ring]}>
      <Text
        style={[styles.initials, isDark && { color: colors.gold }, { fontSize: size * 0.4 }]}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  image: {
    backgroundColor: colors.border,
  },
  fallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.onPrimary,
    // Decision 9: initials are serif in both themes; only the colour flips.
    fontFamily: fonts.display,
    fontWeight: '700',
  },
  }),
);
