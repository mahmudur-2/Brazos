/**
 * 2026-09-30 (the build run, the smoothness pass) — A DOCKED SHEET'S CARD, ITS MOTION: what both
 * paths share. The card slides up from below the screen on open (ease-out cubic, 300 ms) and back
 * down on close (ease-in cubic, 240 ms); with Reduce Motion it fades instead (160 / 140 ms). The
 * dim is not the card's: it covers the screen at once and leaves at once (LUX-LIST-2 #3), so only
 * this moves.
 *
 * THE SLIDE STARTS WHEN THE CARD HAS LAID OUT. The sheets mount their contents on open, and a
 * slide started in the same tick as that mount spends its first frames waiting on the render —
 * the stutter at the top of an opening sheet. Both paths therefore hold the card below the screen
 * until its first layout, then move it.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export const SHEET_OPEN_MS = 300;
export const SHEET_CLOSE_MS = 240;
export const SHEET_OPEN_REDUCED_MS = 160;
export const SHEET_CLOSE_REDUCED_MS = 140;

export type SheetCardProps = {
  /** Open or closing. The card stays mounted while it closes; `onClosed` says when it is gone. */
  visible: boolean;
  /** Called once the close has finished — the sheet unmounts its Modal then. */
  onClosed: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** The card's travel: the screen's height, so it starts wholly below the screen. */
export function sheetTravel(screenHeight: number): number {
  'worklet';
  return screenHeight;
}
