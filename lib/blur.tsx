import type { ComponentType } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from './theme';

/**
 * RUN MOTION1 (C3) — THE ONE PLACE PERMITTED TO LOAD expo-blur.
 *
 * Same boundary, and the same two reasons, as lib/haptics.ts and
 * lib/clipboard.ts: one lazy, caught `require`, resolved once.
 *
 * THE VENDOR IS SHORT-CIRCUITED ON WEB BEFORE THE REQUIRE. `Platform.OS ===
 * 'web'` decides the handle is null without calling `load()` at all, so
 * nothing on web ever reaches expo-blur or its web shim — which paints a
 * `backdrop-filter` div with a TINT of its own, and a surface that gains a
 * tint in the screenshot harness is a surface whose render moved for a
 * feature it cannot see (RUN MOTION1's gate).
 *
 * WEB STILL BLURS — WITH CSS, COLOURLESSLY (2026-09-19, operator decision).
 * Until then web drew nothing here and every glass pane came out of the
 * harness as its flat fallback, so a glass sheet could not be judged from a
 * render at all: the operator compared a mockup with real blur against a
 * render with none and, rightly, saw two different things. Now `BlurLayer`
 * renders a plain View carrying `backdrop-filter: blur()` on web — no
 * colour, no tint, the same boundary — and Surface uses the material's REAL
 * scrim mix there, so the harness shows the glass the phone shows. The
 * fallback path below is unchanged for where no blur can draw.
 *
 * A BINARY THAT PREDATES THE PACKAGE. expo-blur is in package.json but not in
 * build 7, so the operator's current dev build has no ExpoBlurView native
 * module. A `require` of it there either throws or hands back something
 * without a BlurView; both end here as `null`.
 *
 * -------------------------------------------------------------------------
 * THE FALLBACK IS NOT IN THIS FILE, AND THAT IS THE DESIGN.
 *
 * `BlurLayer` renders the blur or NOTHING. It never paints a colour, and it is
 * never the surface — it is always the layer ON TOP of a surface the caller
 * has already painted opaquely. So the degraded case needs no code path at
 * all: with no native module the layer is absent and what shows is the solid
 * fill that was always underneath it. A blur boundary that painted its own
 * fallback colour would be a second ground, and the nav pill in particular
 * already has exactly one.
 * -------------------------------------------------------------------------
 */

/** expo-blur's tint vocabulary — the two this app uses. */
type BlurTint = 'light' | 'dark';

type BlurViewProps = {
  intensity?: number;
  tint?: BlurTint;
  style?: StyleProp<ViewStyle>;
};

type BlurViewComponent = ComponentType<BlurViewProps>;

function load(): BlurViewComponent | null {
  try {
    const vendor = require('expo-blur') as { BlurView?: unknown } | null;
    return typeof vendor?.BlurView === 'function' ? (vendor.BlurView as BlurViewComponent) : null;
  } catch {
    return null;
  }
}

/**
 * Resolved ONCE per process, and never at all on web. A native module cannot
 * appear or disappear while the app is running.
 */
const BlurView: BlurViewComponent | null = Platform.OS === 'web' ? null : load();

/** Whether this binary can actually blur: the vendor on native, CSS on web.
 *  Every caller still renders `BlurLayer` unconditionally; Surface reads this
 *  only to pick the material's fallback scrim where the layer will be absent. */
// 2026-09-29 (LUX-LIST-2 #9): the web ASKS whether it can draw a backdrop blur instead of assuming it —
// a browser (or preview) without `backdrop-filter` showed a see-through pop-up with the rows readable
// through it. Where the answer is no, Surface draws the material's solid fallback.
const webCanBlur = (): boolean => {
  const css = (globalThis as { CSS?: { supports?: (property: string, value: string) => boolean } }).CSS;
  if (!css || typeof css.supports !== 'function') return false;
  return css.supports('backdrop-filter', 'blur(1px)') || css.supports('-webkit-backdrop-filter', 'blur(1px)');
};
export const canBlur = Platform.OS === 'web' ? webCanBlur() : BlurView != null;

/**
 * How far through. 24 is a frosted pane rather than a smear: the pill's
 * hairline and the sheet's rounded top still read as edges, which is the whole
 * reason to blur rather than to dim harder.
 */
const BLUR_INTENSITY = 24;

/**
 * THE WEB ANALOGUE. expo-blur's `intensity` runs 0..100; CSS `blur()` takes a
 * radius in px. Half: the create sheet's clear pane (60) draws at 30px and
 * its light frost (50) at 25px — the mockups were drawn at 34 and 30 — and
 * the MOTION1 backdrops (24) at 12px.
 */
const WEB_PX_PER_INTENSITY = 0.5;

/** react-native-web forwards both keys straight to CSS; React Native's own
 *  ViewStyle has neither, hence the cast (the same shape LitSurface uses for
 *  `backgroundImage`). */
function webBlurStyle(px: number): ViewStyle {
  const blur = `blur(${px}px)`;
  return { backdropFilter: blur, WebkitBackdropFilter: blur } as unknown as ViewStyle;
}

export type BlurLayerProps = {
  /**
   * Omitted, the tint follows the app's own palette rather than the system
   * appearance — the two can disagree, and this app's dark mode is a choice a
   * user makes inside it.
   */
  tint?: BlurTint;
  intensity?: number;
  /** Defaults to filling the parent, which is what a backdrop layer wants. */
  style?: StyleProp<ViewStyle>;
};

export function BlurLayer({ tint, intensity = BLUR_INTENSITY, style }: BlurLayerProps) {
  const { isDark } = useThemeColors();
  if (Platform.OS === 'web') {
    const px = Math.round(intensity * WEB_PX_PER_INTENSITY);
    if (px <= 0) return null;
    return <View pointerEvents="none" style={[style ?? StyleSheet.absoluteFill, webBlurStyle(px)]} />;
  }
  if (!BlurView) return null;
  return (
    <BlurView
      tint={tint ?? (isDark ? 'dark' : 'light')}
      intensity={intensity}
      style={style ?? StyleSheet.absoluteFill}
    />
  );
}
