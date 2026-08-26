import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { glow, withAlpha, type MaterialName } from '../tokens';
import { useDesignOverrides, useMaterials } from '../../lib/designOverrides';
import { useThemeColors } from '../../lib/theme';
import { BlurLayer } from '../../lib/blur';

/**
 * RUN G1 (C1) — THE ONE GLASS SURFACE.
 *
 * Every emerald-glass surface in the app is this component wearing one of the
 * three materials in ui/tokens.ts (`materials`): chrome (the nav bar), sheet
 * (docked and floating dialog cards), menu (anchored popovers). The material
 * is DATA — blur strength, scrim mix, hairline mix — so a surface can never
 * invent its own glass, and the design studio (lib/designOverrides.ts, C2/C3)
 * can tune every wearer at once.
 *
 * FOUR LAYERS, IN ORDER: (1) the scrim fill — this view's own background, so
 * it is always under everything else; (2) blur, through lib/blur.tsx's
 * existing boundary, clipped to the corners; (3) the hairline border; (4) an
 * optional outer glow. The scrim carries legibility; the blur is decoration —
 * which is why the two fallback paths below lose only the blur.
 *
 * TWO FALLBACK PATHS, ONE BRANCH. Web never reaches expo-blur at all
 * (lib/blur.tsx short-circuits before the require), and Reduce Transparency
 * is the same request made by a person, so both render scrim-only at the
 * material's deeper `fallbackScrimAlpha` — the harness's web shots stay
 * meaningful and the accessibility rendering looks intentional, because it
 * is: the mix is data in the materials table, not an accident of a missing
 * module.
 *
 * LIGHT IS NOT GLASS THIS RUN. In the light theme this renders the solid
 * theme surface with the ordinary hairline — no blur, no scrim — so light
 * keeps its Heritage look while dark wears the glass. Geometry (radius,
 * border weight) is shared between the themes; only colours fork, which is
 * the parity rule tests/themeTokens.test.mjs enforces tree-wide.
 */

export type SurfaceProps = PropsWithChildren<{
  material: MaterialName;
  style?: StyleProp<ViewStyle>;
  /** Corner rounding; the material's own default applies when omitted. */
  radius?: number;
  /** Which corners round; the material's own default applies when omitted. */
  corners?: 'all' | 'top';
  /** Which edges draw the hairline. The nav bar wants only its top edge. */
  border?: 'all' | 'top';
  /**
   * Layer 4: an outer glow in this colour, dark theme only. The alpha is the
   * shared surface-glow strength so the studio's glow dial moves every
   * glowing surface at once.
   */
  glowColor?: string;
}>;

/**
 * The default strength of a Surface glow — the same 0.55 the active nav tab
 * has always glowed at, so glass and bar speak one visual language. The
 * design studio's glow dial (C2) overrides it live.
 */
export const SURFACE_GLOW_ALPHA = 0.55;

/**
 * Whether the person has asked iOS for Reduce Transparency — subscribed, so a
 * change in Settings reaches every mounted Surface without a relaunch. Web
 * returns false and never asks: the web branch below is the fallback path
 * already, so there is nothing for the API to add there.
 */
function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (alive) setReduced(enabled === true);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => setReduced(enabled === true),
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

export function Surface({
  material,
  style,
  radius,
  corners,
  border = 'all',
  glowColor,
  children,
}: SurfaceProps) {
  const { palette: colors, isDark } = useThemeColors();
  const reduceTransparency = useReduceTransparency();
  // The static table with the studio's live dials folded in (C2) — an
  // identity read while no dial is set.
  const overrides = useDesignOverrides();
  const spec = useMaterials()[material];

  const cornerRadius = radius ?? spec.radius ?? 0;
  const topOnly = (corners ?? (spec.radiusTopOnly ? 'top' : 'all')) === 'top';
  const corner: ViewStyle = topOnly
    ? { borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius }
    : { borderRadius: cornerRadius };
  const hairline: ViewStyle = border === 'top' ? { borderTopWidth: 1 } : { borderWidth: 1 };

  const flat = Platform.OS === 'web' || reduceTransparency;
  const scrimAlpha = flat ? spec.fallbackScrimAlpha : spec.scrimAlpha;

  const fill = isDark
    ? {
        backgroundColor: withAlpha(spec.scrimColor, scrimAlpha),
        borderColor: withAlpha(spec.borderColor, spec.borderAlpha),
      }
    : { backgroundColor: colors.surface, borderColor: colors.border };

  const halo =
    glowColor && isDark
      ? glow.halo(withAlpha(glowColor, overrides.glowAlpha ?? SURFACE_GLOW_ALPHA))
      : null;

  return (
    <View style={[corner, hairline, fill, halo, style]}>
      {isDark && !flat ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, corner, styles.clip]}>
          <BlurLayer intensity={spec.blur} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // The blur alone needs clipping to the corners; the scrim is the outer
  // view's own background, which already respects its radius. Clipping the
  // OUTER view instead would cancel the optional glow on iOS.
  clip: { overflow: 'hidden' },
});
