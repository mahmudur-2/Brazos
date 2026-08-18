import { Image, StyleSheet, Text, View } from 'react-native';
import { themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { getInitials } from '../lib/profiles';

type AvatarProps = {
  name?: string | null;
  uri?: string | null;
  size?: number;
};

export function Avatar({ name, uri, size = 44 }: AvatarProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension]} />;
  }

  return (
    <View style={[styles.fallback, dimension]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{getInitials(name)}</Text>
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
    fontWeight: '700',
  },
  }),
);
