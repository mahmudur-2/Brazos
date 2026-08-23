import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { MENU_MOTION_OUT_MS } from '../lib/motion120';
import {
  DropMenuBackdrop,
  DropMenuItems,
  PANEL_SCALE_FROM,
  panelTravelFor,
  useDropMenuStyles,
  type DropMenuProps,
} from './DropMenu.shared';

/**
 * THE DROPMENU'S FAST PATH — the same menu, driven by worklets.
 *
 * This file is one of the two places in the tree allowed to name
 * react-native-reanimated in an import position (the other is
 * lib/motion120/vendor.ts), and tests/motion120.test.mjs derives that rule by
 * scanning rather than from a list. It is never imported directly: DropMenu.tsx
 * reaches it through `resolveMotion120`, which only calls the require when
 * `motionCapability.reanimated` is true and falls back if the load throws. On
 * a binary without the native module this module is never evaluated.
 *
 * WHAT IS ACTUALLY BETTER HERE, since "it uses reanimated" is not a reason.
 * The core-Animated path drives one `Animated.Value` through a timing curve
 * and interpolates translate/opacity/scale off it. That is already on the
 * native driver and already smooth. What a worklet adds is:
 *
 *   1. A REAL SPRING rather than a fixed-duration curve. The panel settles
 *      instead of arriving, which is the difference a menu that grows out of a
 *      button needs to read as physical.
 *   2. NO JS ROUND TRIP to start it. The style is computed on the UI thread
 *      from a shared value, so the menu opens on the frame the tap lands even
 *      when JS is busy — which, at the moment a menu opens, it usually is.
 *
 * EVERYTHING ELSE IS SHARED, deliberately: items, backdrop, geometry, colours
 * and dismissal all come from ./DropMenu.shared, so the two paths cannot drift
 * into two different menus. The only thing this file owns is the driver.
 *
 * PARITY WITH THE FALLBACK is exact in the ways a user can perceive:
 *   - it grows FROM the anchor, using the shared `panelTravelFor`;
 *   - it exits FASTER than it enters (MENU_MOTION_OUT_MS), because a
 *     dismissal that takes as long as an arrival reads as sluggish;
 *   - reduced motion collapses the travel to zero WITHOUT removing the
 *     appearance, so the menu still arrives and leaves in the same places;
 *   - it renders nothing when closed and nothing when it has no items.
 */

/**
 * The settle. Damping high enough that the panel does not visibly bounce — a
 * menu is not a toy — with just enough give to read as physical rather than
 * as a fade. `MENU_MOTION_MS` is the fallback's timing equivalent; a spring
 * has no duration, so the two are matched by feel at the same travel.
 */
const PANEL_SPRING: WithSpringConfig = {
  damping: 22,
  stiffness: 260,
  mass: 0.7,
  overshootClamping: false,
};

export function DropMenu({
  visible,
  onClose,
  items,
  direction = 'up',
  align = 'left',
  closeLabel = 'Close menu',
}: DropMenuProps) {
  const { styles } = useDropMenuStyles();
  const reducedMotion = useReducedMotion();
  // 0 = closed (offset, small, transparent), 1 = open. One value, read on the
  // UI thread, so opening costs no JS frame.
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      // Still appears and disappears, just does not travel — the same
      // concession the fallback makes, by the same rule.
      progress.value = visible ? 1 : 0;
      return;
    }
    progress.value = visible
      ? withSpring(1, PANEL_SPRING)
      : withTiming(0, { duration: MENU_MOTION_OUT_MS });
  }, [visible, reducedMotion, progress]);

  const travel = panelTravelFor(direction);
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: travel * (1 - progress.value) },
      { scale: PANEL_SCALE_FROM + (1 - PANEL_SCALE_FROM) * progress.value },
    ],
  }));

  // Same two guards as the fallback, in the same order: a closed menu and an
  // empty menu both render nothing at all.
  if (!visible || items.length === 0) return null;

  return (
    <>
      <DropMenuBackdrop direction={direction} onClose={onClose} closeLabel={closeLabel} />
      <Animated.View
        style={[
          styles.panel,
          direction === 'up' ? styles.panelUp : styles.panelDown,
          align === 'right' ? styles.panelRight : styles.panelLeft,
          panelStyle,
        ]}
        accessibilityViewIsModal
      >
        <DropMenuItems items={items} onClose={onClose} />
      </Animated.View>
    </>
  );
}
