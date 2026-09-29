import { StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { fonts, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { getInitials } from '../lib/profiles';

type AvatarProps = {
  name?: string | null;
  uri?: string | null;
  size?: number;
  /** 2026-09-28 (LUX-LIST-64 #54): the initials' own size where a design states
   *  one (the Inbox row's 58 photo carries 20); otherwise 0.4 of the disc. */
  initialsSize?: number;
};

export function Avatar({ name, uri, size = 44, initialsSize }: AvatarProps) {
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
  //
  // 2026-09-28 (LUX-LIST-64 #25): the rim is the card's own 1pt hairline
  // (#325047 in dark) — never a gold ring — on the photo and the initials
  // alike, so a list mixing both reads as one. Light rims a photo in the
  // palette's hairline and an initials disc in its own fill.
  const ring = {
    borderWidth: 1,
    borderColor: isDark || !uri ? colors.avatarRim : colors.border,
  };

  if (uri) {
    return <RemoteImage uri={uri} style={[styles.image, dimension, ring]} />;
  }

  return (
    <View style={[styles.fallback, dimension, ring]}>
      <Text style={[styles.initials, { fontSize: initialsSize ?? size * 0.4 }]}>
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
  // #25: the deep green disc (#173A31 dark, #1F4A3C light) with cream initials.
  fallback: {
    backgroundColor: colors.avatarFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.avatarInk,
    // Decision 9: initials are serif in both themes; only the colour flips.
    fontFamily: fonts.display,
    fontWeight: '700',
  },
  }),
);
