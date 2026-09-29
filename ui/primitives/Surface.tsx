import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { glow, withAlpha, PANE_HALO_RING, type MaterialName, type PaneFill, type PaneHalo, type PaneRim } from '../tokens';
import { useDesignOverrides, useMaterials } from '../../lib/designOverrides';
import { metricStyles, useThemeColors } from '../../lib/theme';
import { BlurLayer, canBlur } from '../../lib/blur';
import { backgroundImageStyle } from './LitSurface';

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
 * ONE FALLBACK RULE. Where no blur can draw — Reduce Transparency, or a
 * binary without the native module (`canBlur`) — the surface renders
 * scrim-only at the material's deeper `fallbackScrimAlpha`, so the
 * accessibility rendering looks intentional, because it is: the mix is data
 * in the materials table, not an accident of a missing module. 2026-09-19:
 * web is no longer such a place — lib/blur.tsx blurs there with a colourless
 * CSS backdrop-filter — so the screenshot harness renders every glass
 * surface at the material's REAL mix, the way the phone does.
 *
 * LIGHT IS NOT GLASS — WITH ONE NAMED EXCEPTION. In the light theme this
 * renders the solid theme surface with the ordinary hairline — no blur, no
 * scrim — so light keeps its Heritage look while dark wears the glass.
 * 2026-09-18: a material MAY carry a `light` recipe (ui/tokens.ts
 * LightGlassSpec), and then it wears glass in light too, from THOSE numbers.
 * Only the [+] create sheet's `clear` does (operator decision, "L2 Frost",
 * for that sheet alone); the other three carry no block and stay flat by
 * construction. Geometry (radius, border weight) is shared between the
 * themes; only colours fork, which is the parity rule
 * tests/themeTokens.test.mjs enforces tree-wide.
 *
 * THE FIFTH LAYER, OPTIONAL: a 1pt bright inner edge along the top
 * (`highlightAlpha`), the specular line a lit pane shows — the mockup's own
 * `inset 0 1px 0`, drawn AS that inset shadow (2026-09-29, LUX-LIST-2 #6), so it
 * follows the corner arcs and fades into the sides. It was a straight 1pt strip,
 * which crossed into the arcs and read as "a weird overlapping line on top".
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
   * 2026-09-20 (sitting 2, item 13) — THIS pane's own rim, in place of the
   * material's: a colour, an alpha, and a width (1 unless `'hairline'`, one
   * physical pixel). Dark glass only; light stays flat and ignores it. The
   * values live in ui/tokens.ts `paneEdges`, never at a call site.
   */
  rim?: PaneRim;
  /**
   * The soft glow OUTSIDE the rim: `alphas.length` rings, each
   * PANE_HALO_RING points, in `color` at that alpha, fading outward. Plain
   * Views — no shadow, no blur — so a pane that moves every frame (the jobs
   * sheet under a finger) keeps its frames; a shadow on a translucent view
   * is re-rasterised on every frame its content changes. The rings sit
   * outside this view's box: a parent that clips must leave them room (the
   * peek sheet's frame does). Dark glass only.
   */
  halo?: PaneHalo;
  /**
   * 2026-09-21 — THIS pane's own fill (ui/tokens.ts `paneFills`): the tint
   * drawn as the reference's gradient itself, in place of the material's
   * flat scrim AND its sheen — one layer where those two were. Dark glass
   * only, and only where the glass draws: the flat fallback (Reduce
   * Transparency, no blur) keeps the material's own scrim, as the sheen
   * does. The values live in ui/tokens.ts, never at a call site.
   */
  fill?: PaneFill;
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
  rim,
  halo: haloSpec,
  fill: fillSpec,
  glowColor,
  children,
}: SurfaceProps) {
  const styles = stylesFor();
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
  const rimWidth = rim?.width === 'hairline' ? StyleSheet.hairlineWidth : rim?.width ?? 1;
  const hairline: ViewStyle = border === 'top' ? { borderTopWidth: rimWidth } : { borderWidth: rimWidth };

  const flat = reduceTransparency || !canBlur;
  // 2026-09-18 — WHICH RECIPE THIS THEME WEARS. Dark: the material itself.
  // Light: the material's `light` block when it carries one (only `clear`
  // does), else no glass at all — the flat theme surface, exactly as before.
  // One resolved shape, so the fill, the blur and the edge below read one
  // set of numbers whichever theme is on.
  const glass = isDark ? spec : spec.light ?? null;
  const scrimAlpha = glass ? (flat ? glass.fallbackScrimAlpha : glass.scrimAlpha) : 1;
  // The pane's own gradient replaces the scrim where the glass draws; the
  // scrim is transparent under it so the blurred page shows through the
  // gradient's own alpha, as it does through the reference's. 2026-09-28
  // (LUX-LIST-64 #53): a fill may carry its own LIGHT gradient, drawn only
  // where the material is glass in light too (the ••• dropdown's frost).
  const gradient = fillSpec && glass && !flat ? (isDark ? fillSpec : fillSpec.light ?? null) : null;

  const fill = glass
    ? {
        backgroundColor: gradient ? 'transparent' : withAlpha(glass.scrimColor, scrimAlpha),
        // This pane's own rim when it names one (dark glass only), else the material's.
        borderColor:
          rim && isDark ? withAlpha(rim.color, rim.alpha) : withAlpha(glass.borderColor, glass.borderAlpha),
      }
    : { backgroundColor: colors.surface, borderColor: colors.border };
  const highlightAlpha = glass?.highlightAlpha ?? 0;
  // The sheen is the dark recipe's alone (a light pane is flat by ruling),
  // and it draws only where the glass does — never over a fallback scrim.
  // Its light is the spec's own colour — white unless the material says
  // otherwise (the pane's is the brand mint since recipe "D", 2026-09-20).
  const sheen = isDark && !flat && !gradient && spec.sheen ? spec.sheen : null;
  const sheenColor = sheen?.color ?? colors.white;

  const haloColor = glowColor && isDark ? withAlpha(glowColor, overrides.glowAlpha ?? SURFACE_GLOW_ALPHA) : null;
  // Native keeps the halo on the legacy shadow props; on web it joins the one boxShadow below.
  const halo = haloColor && Platform.OS !== 'web' ? glow.halo(haloColor) : null;
  // 2026-09-27 (the Lux remake) — the flat card's drop shadow, from the
  // material's own numbers (dark: the Lux 0 10px 30px black .35; light: the
  // auth surface's soft card shadow). Only the `card` material carries one:
  // a blurred pane that moves under a finger would re-rasterise it per frame.
  // 2026-09-29 (LUX-LIST-2 #6) — ONE boxShadow: the inset top edge, the material's lift and (web) the
  // glow, the way the reference writes `.card`. React Native 0.81 draws `boxShadow` natively
  // (inset included) on the new architecture; the web draws the same CSS.
  const edge = glass && highlightAlpha > 0 ? withAlpha(glass.highlightColor ?? glass.borderColor, highlightAlpha) : null;
  const shadowParts = [
    edge ? `inset 0 1px 0 ${edge}` : null,
    glass?.shadow ? `0 ${glass.shadow.y}px ${glass.shadow.radius * 2}px ${withAlpha(glass.shadow.color, glass.shadow.alpha)}` : null,
    haloColor && Platform.OS === 'web' ? `0 0 14px ${haloColor}` : null,
  ].filter(Boolean);
  const shadow: ViewStyle | null = shadowParts.length ? ({ boxShadow: shadowParts.join(', ') } as ViewStyle) : null;
  // The material's lit wash (the card's), in whichever theme it is drawn.
  const wash = glass?.wash ? backgroundImageStyle(`linear-gradient(180deg, ${glass.wash.top} 0%, ${glass.wash.bottom} 100%)`) : null;
  // The glow rings, outside the rim, dark glass only: ring i sits
  // (i + 1) rings out, with corners that grow by the same amount so the
  // arcs stay concentric with the pane's.
  const rings =
    haloSpec && glass && isDark
      ? haloSpec.alphas.map((ringAlpha, index) => {
          const reach = PANE_HALO_RING * (index + 1);
          const ringRadius = cornerRadius + reach;
          const ringCorner: ViewStyle = topOnly
            ? { borderTopLeftRadius: ringRadius, borderTopRightRadius: ringRadius }
            : { borderRadius: ringRadius };
          const ringEdge: ViewStyle =
            border === 'top'
              ? { top: -reach, left: -reach, right: -reach, height: reach + cornerRadius, borderTopWidth: PANE_HALO_RING }
              : { top: -reach, left: -reach, right: -reach, bottom: -reach, borderWidth: PANE_HALO_RING };
          return (
            <View
              key={index}
              pointerEvents="none"
              style={[styles.ring, ringCorner, ringEdge, { borderColor: withAlpha(haloSpec.color, ringAlpha) }]}
            />
          );
        })
      : null;

  return (
    <View style={[corner, hairline, fill, wash, halo, shadow, style]}>
      {rings}
      {/* RUN S3 (D11) — THE BLUR MOUNTS ONLY WHERE IT CAN BE SEEN. A material
          with no blur, or with an opaque scrim over it, renders an expo-blur
          view that nothing can show through: pure cost, zero pixels. The
          chrome material is exactly that since D11 (blur 0, scrim 1), so the
          nav bar stops mounting a BlurView it cannot use. Sheet and menu are
          unaffected — both still blur under a translucent scrim. */}
      {glass && !flat && glass.blur > 0 && scrimAlpha < 1 ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, corner, styles.clip]}>
          <BlurLayer intensity={glass.blur} />
        </View>
      ) : null}
      {gradient ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            corner,
            backgroundImageStyle(
              `linear-gradient(${gradient.angle}deg, ${withAlpha(gradient.from.color, gradient.from.alpha)} 0%, ${withAlpha(gradient.to.color, gradient.to.alpha)} 100%)`
            ),
          ]}
        />
      ) : null}
      {sheen ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            corner,
            backgroundImageStyle(
              `linear-gradient(115deg, ${withAlpha(sheenColor, sheen.fromAlpha)} 0%, ${withAlpha(sheenColor, 0)} 34%, ${withAlpha(sheenColor, 0)} 70%, ${withAlpha(sheenColor, sheen.toAlpha)} 100%)`
            ),
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  // The blur alone needs clipping to the corners; the scrim is the outer
  // view's own background, which already respects its radius. Clipping the
  // OUTER view instead would cancel the optional glow on iOS.
  clip: { overflow: 'hidden' },
  // A glow ring: a bordered box outside the pane, no fill of its own.
  ring: { position: 'absolute', backgroundColor: 'transparent' },
}));
