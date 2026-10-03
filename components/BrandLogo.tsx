import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { authShadows } from '../lib/authTheme';
import { metricStyles } from '../lib/theme';

// The supplied brand mark, with its opaque white app-icon backing replaced by
// a squircle alpha mask so the emerald tile can sit on the emerald launch
// background and on ivory alike. The emblem itself is untouched — see the
// asset note in docs/architecture.md.
//
// Corner radius is baked into this file rather than applied via style
// (~21.5% of width, measured from its alpha channel), which is measurably
// more rounded than the export it was measured against
// (assets/brand/app-icon-v2.png, ~18.7% — the app icon and the launch mark
// until 2026-08-24, now neither; removed by fix run F23) — that file went through an extra masking
// pass this one didn't. Left as the default here so Sign In/Create Account,
// the only other callers, are untouched; LaunchScreen passes the shipped app
// icon explicitly instead of this component's default changing under it. See
// docs/emerald-v2/DECISIONS.md.
const SOURCE = require('../assets/brand/brazos-b-leaf.png');

type BrandLogoProps = {
  /** Rendered edge length in points. The mark is square; height follows. */
  size: number;
  /** Adds the reference's drop shadow. Off by default (flat on ivory). */
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the default mark — see the SOURCE comment above. */
  source?: ImageSourcePropType;
  /**
   * Corner radius in points, for a source whose rounding is NOT baked into
   * its alpha channel (the shipped app icon is a full-bleed opaque square).
   * Applied to the Image itself, never as overflow on the outer View: that
   * View carries the elevated drop shadow, and on iOS `overflow: 'hidden'`
   * (masksToBounds) would clip the shadow off the same node. The Image clips
   * its own bitmap, and the alpha-derived shadow then follows the rounded
   * silhouette exactly as it does for the baked-alpha default mark. Omitted —
   * every pre-existing caller — nothing is applied and the render is
   * unchanged.
   */
  radius?: number;
};

/**
 * The BRAZOS B-leaf mark. One component so every screen renders it at the
 * same aspect ratio with the same accessibility label, and so swapping the
 * asset later is a one-line change.
 */
export function BrandLogo({ size, elevated = false, style, source, radius }: BrandLogoProps) {
  const styles = stylesFor();
  return (
    <View
      style={[
        { width: size, height: size },
        elevated && authShadows.logo,
        style,
      ]}
    >
      <Image
        source={source ?? SOURCE}
        style={[styles.image, radius != null && { borderRadius: radius }]}
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

const stylesFor = metricStyles(() => StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
}));
