/**
 * F8 (fix run, 2026-10-03) — A BLOCK THAT STEPS ASIDE FOR THE KEYBOARD: what both paths share.
 *
 * Discover hides its intro and its "Popular services" row while the keyboard is up. They used to
 * unmount on keyboardDidShow / keyboardDidHide, which iOS fires only after the keyboard has STOPPED,
 * so the page snapped a beat after the keyboard settled. Now the screen listens on the WILL events
 * (iOS) and the block fades over the keyboard's own duration while the block below it travels to its
 * new place — on the UI thread where the binary has Reanimated (`KeyboardAway.motion120.tsx`), on the
 * native-driver opacity otherwise. With Reduce Motion both simply switch.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type KeyboardAwayProps = {
  /** Out of the page while true; it fades out, and back in when false. */
  hidden: boolean;
  /** The keyboard's own duration for this move, so the page and the keyboard read as one motion. */
  durationMs: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export type KeyboardShiftProps = {
  /** The same duration as the block that stepped aside above it. */
  durationMs: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};
