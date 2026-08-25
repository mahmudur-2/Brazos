import { Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../lib/theme';

// Dark-only by standing decision, like everything else under assets/prestige.
// It is an OPAQUE RGB raster (1290x2796 — PNG colour type 2, no alpha channel
// and no tRNS chunk, re-measured 2026-08-25), so mounting it under the light
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
 * layer exists to remove. The artwork is 1290x2796 (0.46137) against the
 * 393x852 the harness renders (0.46127), so the crop is about two hundredths of
 * one percent of the width; the mode is chosen for the rule, not for that
 * number, and a future artwork of any shape still fills the screen.
 *
 * WHAT IT CARRIES — RE-MEASURED 2026-08-25, AND THE NUMBERS THAT USED TO STAND
 * HERE DESCRIBED A DIFFERENT FILE. This docblock claimed a size this raster has
 * never had, and a vignette of 3.7 in the corners against 20.1 in the middle.
 * The centre of the file on disk reads 21.86 — while
 * assets/prestige/hero_armchair_customer.png measures 4.66 against 20.12 under
 * the identical probe. The retired numbers were the HERO's, not this layer's, so
 * they are replaced rather than carried forward, and the exact figures they
 * replace are recorded in HANDOFF.md rather than restated here: a stale WxH
 * sitting in this docblock is the specific thing that went wrong, and
 * tests/emeraldFences.test.mjs now fails on any size named here that is not
 * this file's own.
 *
 * The measurement below is re-derivable: Rec.601 luma over four corner boxes of
 * 10% of each dimension (129x280), against one 129x280 box centred in the frame.
 *
 *   corners   4.51 / 4.64 / 3.12 / 5.53   mean 4.45
 *   centre    21.86
 *   lift      4.91x
 *   frame     mean 11.23, min 0.70, max 53.13
 *
 * So: a real vignette, and dark throughout. Master 44's own ground is not flat
 * either (its side gutters run 0.0 to 6.4 rather than sitting on one value),
 * which is what this layer is for. It is still STRONGER than the master's: the
 * master's gutters average about 3.4 where this layer's outer 5% of columns
 * read 8.88 left and 7.67 right, a mean of 8.27. It is left alone anyway — the
 * only ways to close that gap are editing the raster's bytes or lowering the
 * layer's opacity, and lowering opacity blends towards `homeBackground`
 * (#02110D, luminance 13.5), which would make the gutters BRIGHTER. The palette
 * is frozen and the raster is not ours to repaint, so the difference is
 * recorded here rather than chased.
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
