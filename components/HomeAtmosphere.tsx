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
 * FULL-BLEED WINS, AND `cover` IS WHAT THAT MEANS (home(13)). The layer has to
 * reach all four screen edges; where the image's shape and the screen's differ,
 * the overflow is CROPPED, never fitted. `contain` would honour the aspect by
 * letterboxing — bands of bare ground at two edges, which is the seam this
 * layer exists to remove. The artwork is 1080x2335 (0.4625) against a modern
 * iPhone's 0.4613, so the crop is about a quarter of one percent of the width;
 * the mode is chosen for the rule, not for that number, and a future artwork of
 * any shape still fills the screen.
 *
 * WHAT IT CARRIES, measured off the file rather than described: mean luminance
 * 3.7/255 in the four corners against 20.1 in the middle — a real vignette,
 * a 5.5x lift, and dark throughout. Master 44's own ground is not flat either
 * (its side gutters run 0.0 to 6.4 rather than sitting on one value), which is
 * what this layer is for. It is in fact STRONGER than the master's: the
 * master's gutters average about 3.4 where this reads 9.8. It is left alone
 * anyway — the only ways to close that gap are editing the raster's bytes or
 * lowering the layer's opacity, and lowering opacity blends towards
 * `homeBackground` (#03110E, luminance 13.8), which would make the gutters
 * BRIGHTER. The palette is frozen and the raster is not ours to repaint, so the
 * difference is recorded here rather than chased.
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
