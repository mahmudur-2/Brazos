import { StyleSheet } from 'react-native';
import { metricStyles } from '../lib/theme';

/**
 * 2026-09-28 (LUX-LIST-64 #35) — THE CHOSEN CHIP'S CHECK, the body both paths
 * share.
 *
 * A chosen choice chip carries a small check at its left, inside the pill. A
 * chip with its own glyph swaps the glyph for the check in the same box and
 * never changes width; a chip WITHOUT one grows by the check, and the operator
 * asked that it "widen smoothly". The check therefore sits in a slot whose
 * width goes from nothing to the check plus its gap: on Reanimated, on the UI
 * thread (./ChipCheck.motion120.tsx); on a binary without worklets, and for
 * anyone who has asked for reduced motion, the slot is simply there or not.
 * React Native's LayoutAnimation is banned in this tree (tests/motion120).
 */
export const CHIP_CHECK_MS = 180;
/** Between the check and the label — the chip's own glyph gap. */
export const CHIP_CHECK_GAP = 6;

export type ChipCheckProps = {
  shown: boolean;
  size: number;
  color: string;
};

/** The slot at full width: the check and its gap. */
export function chipCheckWidth(size: number): number {
  return size + CHIP_CHECK_GAP;
}

export const chipCheckStylesFor = metricStyles(() =>
  StyleSheet.create({
    // The slot clips, so a growing slot reveals the check from its left.
    slot: {
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
    },
  })
);
