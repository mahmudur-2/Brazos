import { Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../lib/theme';

// Dark-only by standing decision, like everything else under assets/prestige.
// It is an OPAQUE RGB raster (1080x2335), so mounting it under the light
// palette would drop a rectangle of the dark room onto the ivory ground —
// which is exactly what the roster in tests/themeResolution.test.mjs gates.
const HOME_ATMOSPHERE = require('../assets/prestige/home-atmosphere-dark.png');

/**
 * home(4) — the fixed atmosphere behind Customer Home and Worker Home.
 *
 * WHY A COMPONENT AND NOT TWO COPIES. Both homes need the identical layer, and
 * the gate, the inset arithmetic and the resize mode are the parts that are
 * easy to get subtly different. One implementation means one place to be
 * right, and one place the raster roster has to look.
 *
 * WHY IT DOES NOT SCROLL. It is absolutely positioned as a SIBLING of the
 * ScrollView, not a row inside it, so the page slides over a layer that never
 * moves. Putting it in the scroll content — even at index 0 — would make it
 * travel with the page, which is the specific thing this must not do.
 *
 * WHY THE NEGATIVE TOP. Both homes root at `SafeAreaView edges={['top']}`,
 * which is a View with `paddingTop: inset`. An absolutely positioned child is
 * laid out against its parent's PADDING box, so a plain `absoluteFill` would
 * start below the notch and leave a band of flat ground across the top of the
 * screen. Pulling the layer up by exactly that inset makes it full-bleed
 * without restructuring either screen's root or repainting SafeAreaView.
 *
 * The artwork is 1080x2335 (0.463) against a modern iPhone's ~0.462, so
 * `cover` scales it uniformly to fill and crops a hair rather than distorting
 * anything or letterboxing.
 */
export function HomeAtmosphere() {
  const { isDark } = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!isDark) return null;

  return (
    <Image
      source={HOME_ATMOSPHERE}
      style={[styles.layer, { top: -insets.top }]}
      resizeMode="cover"
      // Decorative: it carries no information a screen reader needs.
      accessible={false}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  // `top` is supplied at render from the live safe-area inset — see above.
  //
  // No `pointerEvents` is needed and the Image prop does not exist in this RN
  // version anyway: this is the FIRST child, so every sibling draws above it,
  // and the scroller covers the whole safe area. The only sliver it is the
  // topmost view for is the status-bar strip, which has nothing to tap.
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
