/**
 * 2026-09-30 (the build run, the smoothness pass) — A SCREEN SECTION'S ENTRANCE: what both paths
 * share. The section fades in and lifts 10pt on a soft spring, staggered 70 ms per index, once per
 * mount (hooks/useEntrance.ts holds the numbers); with Reduce Motion it is simply there.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type EntranceViewProps = {
  /** The stagger slot: 0 arrives first. */
  index?: number;
  /**
   * FIX-RUN F12 — read at mount: true and the section is simply there (a list row mounting after
   * its list's first batch; hooks/useEntrance.ts useEntered).
   */
  skip?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};
