/**
 * 2026-09-30 (the build run, the smoothness pass) — A ROW THAT OPENS IN PLACE: what both paths
 * share. The body fades in and settles 6pt down (ease-out cubic, 200 ms) and leaves the other way
 * (ease-in cubic, 160 ms), staying mounted until it has gone; the chevron turns half a turn with it
 * (hooks/useDropdownPresence.ts holds the timings). With Reduce Motion both simply switch.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** How far the body settles as it opens. */
export const DROPDOWN_SETTLE = 6;

export type DropdownRevealProps = {
  open: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};
