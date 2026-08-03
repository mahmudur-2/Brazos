import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { authShadows } from '../lib/authTheme';

// The supplied brand mark, with its opaque white app-icon backing replaced by
// a squircle alpha mask so the emerald tile can sit on the emerald launch
// background and on ivory alike. The emblem itself is untouched — see the
// asset note in docs/architecture.md.
const SOURCE = require('../assets/brand/brazos-b-leaf.png');

type BrandLogoProps = {
  /** Rendered edge length in points. The mark is square; height follows. */
  size: number;
  /** Adds the reference's drop shadow. Off by default (flat on ivory). */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The BRAZOS B-leaf mark. One component so every screen renders it at the
 * same aspect ratio with the same accessibility label, and so swapping the
 * asset later is a one-line change.
 */
export function BrandLogo({ size, elevated = false, style }: BrandLogoProps) {
  return (
    <View
      style={[
        { width: size, height: size },
        elevated && authShadows.logo,
        style,
      ]}
    >
      <Image
        source={SOURCE}
        style={styles.image}
        // The mark must never be stretched or cropped — 'contain' keeps its
        // 1:1 ratio whatever the container rounds to.
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel="BRAZOS"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});
