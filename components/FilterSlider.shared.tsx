/**
 * The contract both slider paths implement, and the arithmetic neither owns.
 *
 * WHY A SLIDER IS BUILT HERE RATHER THAN INSTALLED. No slider dependency is in
 * package.json and none may be added, so this is assembled from what the tree
 * already has: react-native-gesture-handler for the drag and
 * react-native-reanimated for the per-frame follow. Both are native packages
 * behind lib/motion120's boundary, which is why the drag lives in a
 * `.motion120` sibling and this file — the part every binary runs — names
 * neither of them.
 *
 * The fallback is NOT a degraded slider. A binary without the natives gets the
 * stepper the map's filter sheet already used, which is a control that works
 * rather than a track that cannot be dragged.
 */
import type { ReactNode } from 'react';

export type FilterSliderProps = {
  /** The row's caption, e.g. "Distance". */
  label: string;
  /** Inclusive bounds. `min` may be a meaningful floor (1 mile) or a zero. */
  min: number;
  max: number;
  /** The granularity every path snaps to. */
  step: number;
  value: number;
  onChange: (next: number) => void;
  /** How the current value reads. The slider never formats a value itself —
   *  miles and money are formatted by their own owners (distanceChipLabel,
   *  formatBudget), and a slider inventing either would be a second copy of a
   *  rule that already exists. */
  formatValue: (value: number) => string;
  /** Announced instead of the label when the control needs a fuller phrase. */
  accessibilityLabel?: string;
  /** Shown under the track — e.g. what the current value excludes. */
  footnote?: ReactNode;
};

/** The rail's thickness, and the handle that rides it. Shared so the two
 *  paths cannot draw two different sliders. */
export const SLIDER_TRACK_HEIGHT = 6;
export const SLIDER_THUMB_SIZE = 28;

/**
 * Where a value sits on the track, 0..1.
 *
 * 'worklet', and it MUST be the first statement: the motion120 sibling calls
 * this on the UI runtime, where an imported function without the directive
 * does not exist — the call throws, reanimated does not catch it, and the app
 * aborts. The JS-thread callers are indifferent; a worklet is still an
 * ordinary function over there. This is riseFor's lesson applied before it
 * could be relearned.
 */
export function fractionForValue(value: number, min: number, max: number): number {
  'worklet';
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * The nearest legal value for a position on the track.
 *
 * Snapping happens HERE rather than in either path, so a dragged slider and a
 * stepped one can never land on values the other cannot reach — the same
 * reason KeyboardRisingColumn keeps one `riseFor`.
 */
export function valueForFraction(
  fraction: number,
  min: number,
  max: number,
  step: number
): number {
  'worklet';
  const clamped = Math.min(1, Math.max(0, fraction));
  const raw = min + clamped * (max - min);
  const stepped = min + Math.round((raw - min) / step) * step;
  return Math.min(max, Math.max(min, stepped));
}
