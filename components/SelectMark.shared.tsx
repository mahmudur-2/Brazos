/**
 * FIX-RUN F12 — A MARK THAT ARRIVES RATHER THAN APPEARS: what both paths share.
 *
 *   SelectMark   a radio's dot, a checkbox's tick, a chosen row's check: the mark scales up from
 *                0.6 and fades in on a short spring when chosen, and back out when not. With an
 *                `off` face (a checkbox's empty square) the two crossfade in the same box.
 *   MarkPop      a tapped star (StarRating) swells to 1.18 and settles back.
 *
 * The 120 Hz path (`SelectMark.motion120.tsx`) springs on the UI thread with Reanimated; the
 * fallback (`SelectMark.tsx`) runs the same springs on the native driver. Both are transform and
 * opacity only. Under Reduce Motion (and until it is known) neither mounts: the chooser renders
 * exactly the glyph the site always rendered, so the screenshot harness stays byte-stable.
 *
 * The row around the mark keeps its role and state (radio, checkbox: fix run E4); the mark is
 * the picture of it.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** Where the mark starts as it arrives. */
export const MARK_FROM = 0.6;
/** Brisk, with a whisper of overshoot so the mark lands rather than stops. */
export const MARK_SPRING = { stiffness: 380, damping: 22, mass: 0.6 } as const;
/** A tapped star's swell, and its settle. */
export const POP_PEAK = 1.18;
export const POP_UP_SPRING = { stiffness: 520, damping: 18, mass: 0.5 } as const;
export const POP_DOWN_SPRING = { stiffness: 300, damping: 20, mass: 0.6 } as const;

export type SelectMarkProps = {
  on: boolean;
  /** What is drawn when chosen. */
  mark: ReactNode;
  /** What is drawn when not (a checkbox's empty square); absent, nothing is. */
  off?: ReactNode;
};

export type MarkPopProps = {
  /** A new non-zero value pops the child once. */
  popKey: number;
  children: ReactNode;
};

/** The mark's opacity for a progress that a spring may carry past 1. */
export function markOpacity(progress: number): number {
  'worklet';
  return Math.max(0, Math.min(1, progress));
}

/** The mark's scale on the same progress. */
export function markScale(progress: number): number {
  'worklet';
  return MARK_FROM + (1 - MARK_FROM) * progress;
}

/** The off face sits in the flow and sizes the box; the mark is laid over it, centred. */
export const OVER: StyleProp<ViewStyle> = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  alignItems: 'center',
  justifyContent: 'center',
};
