import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { PINNED_FOOTER_BOTTOM_PADDING } from '../ui/primitives';

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
   *
   * ALREADY is the load-bearing word, and it is why this must never be applied
   * as padding on the way through. It names something the surrounding layout
   * has reserved on the column's behalf; a column that reserves it a second
   * time counts it twice. See COLUMN_BOTTOM_PADDING below.
   */
  insetBelow: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * What the column reserves BELOW itself — at rest and risen alike.
 *
 * THE CHAT CLEARANCE DOUBLE COUNT WAS HERE. Both driver paths used to apply
 * `insetBelow` as this padding: the floating pill's whole footprint, ~104pt on
 * a notched iPhone. But the pill is not absolutely positioned. Read down the
 * chain: `bottomNavScreenOptions` leaves the bar in normal layout flow and
 * floats it with margins ("nothing here is absolutely positioned"), and
 * @react-navigation/bottom-tabs takes it out of flow ONLY when it is hidden
 * (`position: isTabBarHidden ? 'absolute' : undefined`), while BottomTabView
 * lays the scene container out as a `flex: 1` sibling ABOVE the bar. So a chat
 * scene already ENDS at the pill's top edge. Reserving the footprint again
 * inside the column reserved it twice.
 *
 * That is home(7)'s finding arriving late. It found the same double count under
 * every pinned Continue / Publish job / Cash out button and answered it with
 * PINNED_FOOTER_BOTTOM_PADDING — whose docblock already names a COMPOSER as
 * well as a footer. Chat's was the one that got away, because its clearance had
 * been delegated into this component and travelled as a prop.
 *
 * It also explains why the band measured the SAME in both states. At rest the
 * composer sat a pill's height above the pill. Risen, `riseFor` had already
 * subtracted the clearance from the keyboard's height — correctly — and this
 * padding then held the column that same distance above the keyboard.
 *
 * `insetBelow` keeps its one honest job as the subtrahend in `riseFor`, and the
 * column keeps only a pinned element's own breathing room. The two states stay
 * symmetric by construction: the padding does not change with the rise, and the
 * rise lands the column's bottom on the keyboard, so the composer sits this far
 * above the pill at rest and this far above the keyboard risen.
 */
export const COLUMN_BOTTOM_PADDING = PINNED_FOOTER_BOTTOM_PADDING;

/** The rise, given a keyboard height and the clearance already below the
 *  column. Never negative: on a device whose clearance exceeds the keyboard
 *  (a hardware keyboard's accessory bar, say) the column simply stays put.
 *
 *  Stated here so BOTH drivers compute the same number — the arithmetic is
 *  the part a user can perceive, and it must not exist twice. */
export function riseFor(keyboardHeight: number, insetBelow: number): number {
  return Math.max(0, keyboardHeight - insetBelow);
}
