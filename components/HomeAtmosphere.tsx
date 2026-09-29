import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metricStyles, screenGround, useThemeColors } from '../lib/theme';

/**
 * home(4) — the fixed ground behind Customer Home and Worker Home.
 *
 * 2026-09-27 (the Lux remake, ruling 9): THE GROUND IS THE LUX GRADIENT, drawn
 * by lib/theme.ts `screenGround()` — the one definition of it — in place of the
 * atmosphere raster this layer mounted until the remake. The raster stays on
 * disk beside its PNG master, mounted by nothing.
 *
 * WHY A COMPONENT AND NOT TWO COPIES. Both homes need the identical layer, and
 * the inset arithmetic is the part that is easy to get subtly different.
 *
 * WHY IT DOES NOT SCROLL. It is absolutely positioned as a SIBLING of the
 * ScrollView, not a row inside it, so the page slides over a layer that never
 * moves.
 *
 * WHY THE NEGATIVE TOP. Both homes root at `SafeAreaView edges={['top']}`,
 * which is a View with `paddingTop: inset`. An absolutely positioned child is
 * laid out against its parent's PADDING box, so a plain `absoluteFill` would
 * start below the notch and leave a band of flat ground across the top of the
 * screen. Pulling the layer up by exactly that inset makes it full-bleed
 * without restructuring either screen's root.
 *
 * Dark only, like everything the Homes draw over their ground; light renders
 * nothing and keeps its flat cream.
 */
export function HomeAtmosphere() {
  const styles = stylesFor();
  const { palette, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!isDark) return null;

  return (
    <View
      style={[styles.layer, { top: -insets.top }, screenGround(palette, isDark)]}
      pointerEvents="none"
      // Decorative: it carries no information a screen reader needs.
      accessible={false}
    />
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  // `top` is supplied at render from the live safe-area inset — see above.
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
}));
