import type { ComponentType } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from './theme';

/**
 * RUN MOTION1 (C3) — THE ONE PLACE PERMITTED TO LOAD expo-blur.
 *
 * Same boundary, and the same two reasons, as lib/haptics.ts and
 * lib/clipboard.ts: one lazy, caught `require`, resolved once.
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
 * Resolved ONCE per process. A native module cannot appear or disappear while
 * the app is running.
 */
const BlurView: BlurViewComponent | null = load();

/** Whether this binary can actually blur.
 *  Every caller still renders `BlurLayer` unconditionally; Surface reads this
 *  only to pick the material's fallback scrim where the layer will be absent. */
export const canBlur = BlurView != null;

/**
 * How far through. 24 is a frosted pane rather than a smear: the pill's
 * hairline and the sheet's rounded top still read as edges, which is the whole
 * reason to blur rather than to dim harder.
 */
const BLUR_INTENSITY = 24;

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
  if (!BlurView) return null;
  return (
    <BlurView
      tint={tint ?? (isDark ? 'dark' : 'light')}
      intensity={intensity}
      style={style ?? StyleSheet.absoluteFill}
    />
  );
}
