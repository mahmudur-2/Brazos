import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { meltBar } from '../ui/tokens';
import { pillBottomOffset, pillFootprint } from '../lib/meltBarGeometry';

/**
 * THE INSET CONTRACT, in one place — 2026-09-30 (the build run, docs/dispatch/MELT-TAB-BAR.md §8),
 * for the floating Melt-through pill.
 *
 *     pill offset  = max(insetBottom − meltBar.bottomTuck, meltBar.bottomMin)   24 on a 34pt inset
 *     pill top     = meltBar.height + pill offset                              88
 *     clearance    = pill top + meltBar.breathing                              96
 *
 * `useNavInset()` is the height scrolling CONTENT must clear; `usePillTop()` is where the pill's
 * top edge sits, which a pinned footer lifts its controls over. This replaces the attached bar's
 * flush formula and its two studio dials (navBottomPad, nav.barHeight), retired with that bar; the
 * arithmetic itself is `lib/meltBarGeometry.ts`, the one copy the bar and every clearance share.
 */

/** Where the pill's top edge sits above the screen's bottom edge. */
export function usePillTop(): number {
  const insets = useSafeAreaInsets();
  return meltBar.height + pillBottomOffset(insets.bottom, meltBar.bottomTuck, meltBar.bottomMin);
}

/** The height scrolling content must clear: the pill, its offset, and the breathing room above. */
export function useNavInset(): number {
  const insets = useSafeAreaInsets();
  return pillFootprint(insets.bottom, meltBar);
}
