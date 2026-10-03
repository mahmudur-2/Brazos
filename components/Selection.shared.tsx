/**
 * FIX-RUN F12 — A CHOICE THAT CHANGES COLOUR WITHOUT SNAPPING: what both paths share.
 *
 * A chip, a pill, a segment, a switch's knob: when it is chosen its fill, its rim and its label
 * change colour, and until now they jumped. Three pieces make the change a short fade instead:
 *
 *   SelectionTint   an absolute layer under the host's content that paints the host's fill and
 *                   rim, from the rest pair to the chosen pair. The host keeps its border WIDTH
 *                   (so nothing moves) and draws its own fill and rim transparent.
 *   SelectionText   the label, its colour going from rest to chosen.
 *   SelectionThumb  a segmented control's one chosen fill, sliding from cell to cell.
 *
 * The 120 Hz path (`Selection.motion120.tsx`) interpolates the colours on the UI thread with
 * Reanimated and springs the thumb there. The fallback (`Selection.tsx`) cannot drive a colour
 * natively, so it crossfades two stacked layers by opacity on the native driver and lets a label
 * take its new colour at once; its thumb springs on the native driver.
 *
 * Under Reduce Motion (and until it is known) a host renders exactly what it always rendered and
 * none of these mount — selection simply snaps, and the screenshot harness stays byte-stable.
 */
import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { clearAlpha } from '../ui/colorAlpha';

/** Just long enough to read as a change of state rather than a flash. */
export const SELECT_FADE_MS = 140;

/** The thumb's throw: the press spring's stiffness, a little more mass for the travel. */
export const THUMB_SPRING = { stiffness: 320, damping: 28, mass: 0.8 } as const;

export type Paint = { fill: string; rim: string };

export type SelectionTintProps = {
  on: boolean;
  rest: Paint;
  chosen: Paint;
  /** The host's corner and border width, so the layer covers the host's box exactly. */
  radius: number;
  rimWidth: number;
  style?: StyleProp<ViewStyle>;
};

export type SelectionTextProps = {
  on: boolean;
  rest: string;
  chosen: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  children?: ReactNode;
};

export type SelectionThumbProps = {
  /** The chosen cell, or null for none (the thumb is not drawn). */
  index: number | null;
  /** One cell's width; the thumb is one cell wide and travels by whole cells. */
  cellWidth: number;
  /** Where the first cell starts inside the track's border. */
  inset: number;
  radius: number;
  color: string;
};

/**
 * The two ends of a colour fade. A `transparent` end becomes the OTHER end at alpha 0: fading
 * through transparent black would grey the middle of the fade.
 */
export function fadeEnds(from: string, to: string): [string, string] {
  return [from === 'transparent' ? clearAlpha(to) : from, to === 'transparent' ? clearAlpha(from) : to];
}

/** The layer covers the host's border box from inside its padding box. */
export function tintFrame(radius: number, rimWidth: number): ViewStyle {
  return {
    position: 'absolute',
    top: -rimWidth,
    left: -rimWidth,
    right: -rimWidth,
    bottom: -rimWidth,
    borderRadius: radius,
    borderWidth: rimWidth,
  };
}

/** The thumb sits on the first cell; its travel is a transform. */
export function thumbFrame({ cellWidth, inset, radius, color }: SelectionThumbProps): ViewStyle {
  return {
    position: 'absolute',
    top: inset,
    bottom: inset,
    left: inset,
    width: cellWidth,
    borderRadius: radius,
    backgroundColor: color,
  };
}
