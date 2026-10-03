/**
 * FIX-RUN F10 — A PHOTO YOU CAN PINCH, PAN, DOUBLE-TAP AND (in the full-screen viewer) SWIPE AWAY:
 * what both paths share. The 120 Hz path (`ZoomableImage.motion120.tsx`) runs the gestures on the
 * UI thread with gesture-handler's recognisers and Reanimated springs; the fallback
 * (`ZoomableImage.tsx`) is the PanResponder body components/PhotoViewer.tsx always had, on the
 * native driver. The numbers and the arithmetic live here, once, so the two cannot drift.
 *
 *   pinch          scale between 1 and 4; released under 1.02 it springs home
 *   pan            only once zoomed, kept inside the picture's edges on release
 *   double tap     1 ↔ 2.5
 *   swipe away     at 1x only, and only where the host takes `onDismiss` (PhotoViewer); the layer
 *                  behind fades as the photo is pulled, 120pt or a flick lets it go
 *   long press     the host's `onLongPress` (share), once, never also a tap
 *
 * Reduce Motion does not apply: the photo follows a finger, it does not decorate.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const ZOOM_TAP_SCALE = 2.5;
/** Above this the photo counts as zoomed: one finger pans it, the pager holds still. */
export const ZOOMED_AT = 1.01;
/** A pinch released under this goes home rather than resting a hair off 1x. */
export const SNAP_HOME_UNDER = 1.02;
export const DOUBLE_TAP_MS = 280;
export const TAP_SLOP = 8;
export const DISMISS_DISTANCE = 120;
/** Points per millisecond — PanResponder's unit; gesture-handler reports per second. */
export const DISMISS_VELOCITY = 0.8;
export const DISMISS_MS = 200;
export const LONG_PRESS_MS = 500;
/** How the layer behind fades over a dismiss drag: gone by 300pt, never below .35. */
export const DRAG_FADE_DISTANCE = 300;
export const DRAG_FADE_FLOOR = 0.35;
/** Sideways pull while swiping away, damped so the drag reads as vertical. */
export const DRAG_X_DAMPING = 0.5;
/** Every settle — home, into bounds, the double-tap zoom — on one spring. */
export const ZOOM_SPRING = { stiffness: 220, damping: 24, mass: 0.8 } as const;

export function clampTo(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** How far a picture of this size may travel either way at this scale before an edge shows. */
export function panBound(scale: number, size: number): number {
  'worklet';
  return Math.max(0, ((scale - 1) * size) / 2);
}

/** The layer's opacity while the photo is pulled `dy` points away. */
export function dragFade(dy: number): number {
  'worklet';
  return clampTo(1 - Math.abs(dy) / DRAG_FADE_DISTANCE, DRAG_FADE_FLOOR, 1);
}

export type ZoomableImageProps = {
  /** The picture's box; the picture itself is `children`, laid out at this size. */
  width: number;
  height: number;
  children: ReactNode;
  /** The layer that fades while the photo is pulled away (PhotoViewer's black). */
  layerStyle?: StyleProp<ViewStyle>;
  /** Chrome drawn over the photo (close, share, report); it fades with the layer. */
  overlay?: ReactNode;
  /** Swipe up or down at 1x to let the photo go; called once it has left. Absent: no swipe. */
  onDismiss?: () => void;
  onLongPress?: () => void;
  /** Zoomed in or back at 1x — MediaViewer locks its pager while a page is zoomed. */
  onZoomedChange?: (zoomed: boolean) => void;
  /** A new value opens the photo fresh, at 1x and centred. */
  resetKey?: string | null;
};
