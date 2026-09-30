/**
 * 2026-09-30 (the build run, the smoothness pass) — A FROSTED POP-UP'S PRESENTATION: what both
 * paths share.
 *
 * WHY THE POP-UPS STUTTERED. Every frosted dialog was a Modal with `animationType="fade"`, which
 * fades the whole modal view's alpha — the scrim's live blur AND the glass card's own blur with
 * it. iOS does not animate a visual-effect view's opacity: while the alpha is below 1 the blur
 * renders broken, then snaps whole at the end, which reads as a stutter however fast the frames
 * run. So nothing frosted fades here: the dim and its blur appear at once (the same "instant dim"
 * as the docked sheets, LUX-LIST-2 #3) and the card MOVES in — a small scale on a centred dialog,
 * a short rise on an action sheet — at full opacity. Closing reverses the move quickly, then the
 * whole modal goes at once. Reduce Motion: no move at all.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export const POP_OPEN_MS = 200;
export const POP_CLOSE_MS = 120;
/** A centred dialog grows from this scale. */
export const POP_FROM_SCALE = 0.94;
/** An action sheet rises this far. */
export const RISE_FROM = 40;

export type PopMotion = 'pop' | 'rise';

export type PopModalProps = {
  visible: boolean;
  onRequestClose?: () => void;
  onShow?: () => void;
  /**
   * The dialog's own backdrop style — its scrim colour AND its layout (flex, centring, padding).
   * The dim layer paints it; the content layer takes its layout with the colour cleared, so the
   * card sits exactly where the backdrop used to put it.
   */
  backdropStyle: StyleProp<ViewStyle>;
  /** A tap on the backdrop closes (the action sheet); absent, the backdrop takes no taps. */
  onBackdropPress?: () => void;
  /** The frosted layer over the scrim. Default true. */
  blur?: boolean;
  motion?: PopMotion;
  children: ReactNode;
};

/** The content layer's motion at progress p (0 hidden, 1 shown). */
export function popMotion(motion: PopMotion, p: number) {
  'worklet';
  return motion === 'rise'
    ? { transform: [{ translateY: (1 - p) * RISE_FROM }] }
    : { transform: [{ scale: POP_FROM_SCALE + (1 - POP_FROM_SCALE) * p }] };
}

/** The content layer takes the backdrop's layout and none of its colour. */
export const CLEAR_GROUND: ViewStyle = { backgroundColor: 'transparent' };
