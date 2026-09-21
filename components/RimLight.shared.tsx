import type { ViewStyle } from 'react-native';
import { withAlpha, type ColorPalette } from '../lib/theme';
import { backgroundImageStyle, litBetween } from '../ui/primitives/LitSurface';

/**
 * THE RIM LIGHT — one point of a button's hairline, travelling lit.
 *
 * The picked Welcome page's motion (docs/mockups/html/lux/welcome-motion.html,
 * idea f, 2026-09-21): a soft gold light glides once round the lead button in
 * six seconds, under a cover painted with the button's own fill, so that only
 * the hairline shows it — the label never dims, the fill never sheens, and
 * nothing here reads as a spinner.
 *
 * Everything a viewer can see lives in this file: the lap, the light's size
 * and colours, the cover, and the ONE path function both drivers follow. The
 * reanimated sibling calls `rimPoint` on the UI thread inside a worklet; the
 * native-driver fallback samples it once on the JS thread into an
 * interpolation table. Neither owns a number of its own, so a binary with
 * worklets and one without cannot drift into two different lights.
 *
 * HONEST TO THE PHONE. The light is one View with a radial gradient
 * (`experimental_backgroundImage`, the way every lit surface here is drawn),
 * moved by translate and rotate alone; the cover is a View with the fill; the
 * clip is a border radius on a node with `overflow: 'hidden'`. No mask, no
 * blur, no library. Nothing animates a shadow, a radius or a layout.
 */

/** One lap of the light around the rim. Slow, by the operator's word. */
export const RIM_LAP_MS = 6000;

/** The light's box: an ellipse of this size, its long axis along the rim. */
export const RIM_LIGHT = { width: 120, height: 44 } as const;

/** How far inside the rim's outer edge the light's centre travels. */
export const RIM_INSET = 2;

/** The cover's inset from the rim's outer edge — what stays uncovered is the hairline. */
export const RIM_COVER_INSET = 1;

/** Samples per lap for the native driver's piecewise-linear interpolation. */
export const RIM_SAMPLES = 120;

export type RimLightProps = {
  /** The button's corner radius, so the light follows its shape exactly. */
  radius: number;
};

export type RimPoint = { x: number; y: number; angle: number };

/**
 * Where the light is at `progress` (0..1) of a lap: the centre of an element
 * travelling clockwise along a rounded rectangle `width` × `height` with
 * corner `radius`, `inset` inside its edge, and the tangent's angle in
 * degrees so the light's long axis turns with the rim round the corners.
 *
 * Starts at the top edge just past the top-left corner. Closed: the point at
 * 1 is the point at 0 and the angle there is 360, so a repeat never snaps.
 * A worklet, so the reanimated sibling can call it on the UI thread.
 */
export function rimPoint(
  progress: number,
  width: number,
  height: number,
  radius: number,
  inset: number
): RimPoint {
  'worklet';
  const w = width - 2 * inset;
  const h = height - 2 * inset;
  const r = Math.max(Math.min(radius - inset, w / 2, h / 2), 0.001);
  const ex = w - 2 * r;
  const ey = h - 2 * r;
  const arc = (Math.PI * r) / 2;
  const total = 2 * ex + 2 * ey + 4 * arc;
  const t = Math.min(Math.max(progress, 0), 1);
  let s = t * total;
  const x0 = inset;
  const y0 = inset;

  // The top edge, left to right.
  if (s < ex) return { x: x0 + r + s, y: y0, angle: 0 };
  s -= ex;
  // The top-right corner.
  if (s < arc) {
    const a = s / r;
    return { x: x0 + w - r + Math.sin(a) * r, y: y0 + r - Math.cos(a) * r, angle: (a * 180) / Math.PI };
  }
  s -= arc;
  // The right edge, downward.
  if (s < ey) return { x: x0 + w, y: y0 + r + s, angle: 90 };
  s -= ey;
  // The bottom-right corner.
  if (s < arc) {
    const a = s / r;
    return { x: x0 + w - r + Math.cos(a) * r, y: y0 + h - r + Math.sin(a) * r, angle: 90 + (a * 180) / Math.PI };
  }
  s -= arc;
  // The bottom edge, right to left.
  if (s < ex) return { x: x0 + w - r - s, y: y0 + h, angle: 180 };
  s -= ex;
  // The bottom-left corner.
  if (s < arc) {
    const a = s / r;
    return { x: x0 + r - Math.sin(a) * r, y: y0 + h - r + Math.cos(a) * r, angle: 180 + (a * 180) / Math.PI };
  }
  s -= arc;
  // The left edge, upward.
  if (s < ey) return { x: x0, y: y0 + h - r - s, angle: 270 };
  s -= ey;
  // The top-left corner, ending where the lap began.
  const a = Math.min(s / r, Math.PI / 2);
  return { x: x0 + r - Math.cos(a) * r, y: y0 + r - Math.sin(a) * r, angle: 270 + (a * 180) / Math.PI };
}

/**
 * The lap sampled for core `Animated`: `RIM_SAMPLES + 1` evenly spaced
 * progress values and, at each, the light's translate and rotate. The
 * native driver interpolates linearly between neighbours, which at 120
 * samples over a 740-point lap is a step of six points — under a soft light
 * 120 wide, not a thing an eye can find.
 */
export function rimSamples(width: number, height: number, radius: number) {
  const input: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const rotate: string[] = [];
  for (let i = 0; i <= RIM_SAMPLES; i += 1) {
    const progress = i / RIM_SAMPLES;
    const p = rimPoint(progress, width, height, radius, RIM_INSET);
    input.push(progress);
    x.push(p.x - RIM_LIGHT.width / 2);
    y.push(p.y - RIM_LIGHT.height / 2);
    rotate.push(`${i === RIM_SAMPLES ? 360 : p.angle}deg`);
  }
  return { input, x, y, rotate };
}

/**
 * The three layers, from the palette. The clip covers the button's border
 * box (it is mounted inside the padding box, hence the −1); the light is the
 * cream-cored gold ellipse; the cover is the button's own fill, inset by the
 * hairline, lit in dark and flat forest in light exactly as the button is.
 */
export function rimStylesFor(colors: ColorPalette, isDark: boolean, radius: number) {
  const clip: ViewStyle = {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: radius,
    overflow: 'hidden',
  };
  const light: ViewStyle[] = [
    {
      position: 'absolute',
      left: 0,
      top: 0,
      width: RIM_LIGHT.width,
      height: RIM_LIGHT.height,
    },
    backgroundImageStyle(
      `radial-gradient(ellipse closest-side at 50% 50%, ${withAlpha(colors.ink, 0.95)} 0%, ${withAlpha(colors.gold, 0.45)} 40%, ${withAlpha(colors.gold, 0)} 72%)`
    ),
  ];
  const cover: (ViewStyle | undefined)[] = [
    {
      position: 'absolute',
      top: RIM_COVER_INSET,
      left: RIM_COVER_INSET,
      right: RIM_COVER_INSET,
      bottom: RIM_COVER_INSET,
      borderRadius: radius - RIM_COVER_INSET,
      backgroundColor: colors.authCtaBottom,
    },
    litBetween({ top: colors.authCtaTop, bottom: colors.authCtaBottom, flat: !isDark }),
  ];
  return { clip, light, cover };
}
