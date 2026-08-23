import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * The contract both keyboard-tracking paths implement.
 *
 * WHY THE SEAM IS A COMPONENT AND NOT A HOOK. The obvious shape would have
 * been a `.motion120` sibling for `useKeyboardOffset`, returning the offset the
 * caller already spreads into a transform. It cannot be: the fallback produces
 * a core `Animated.Value`, the fast path produces a reanimated shared value,
 * and neither animated view can consume the other's. A hook seam would hand
 * the caller a value whose TYPE depends on which binary it is running on,
 * which is precisely the leak the boundary exists to prevent.
 *
 * So the swappable unit is the animated view itself. Each path owns its
 * driver AND the view that driver can move, and the caller sees one component
 * with one prop list on every build.
 */
export type KeyboardRisingColumnProps = {
  /**
   * Whatever already holds the column clear of the screen bottom — the
   * floating nav pill's clearance, in chat's case. The keyboard covers that
   * clearance completely once it is up, so the rise is the keyboard height
   * MINUS this. Without the subtraction the column stops a nav-pill's height
   * above the keyboard, which is the dead band the `padding` version always
   * had.
   */
  insetBelow: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** The rise, given a keyboard height and the clearance already below the
 *  column. Never negative: on a device whose clearance exceeds the keyboard
 *  (a hardware keyboard's accessory bar, say) the column simply stays put.
 *
 *  Stated here so BOTH drivers compute the same number — the arithmetic is
 *  the part a user can perceive, and it must not exist twice. */
export function riseFor(keyboardHeight: number, insetBelow: number): number {
  return Math.max(0, keyboardHeight - insetBelow);
}
