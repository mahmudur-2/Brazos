import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  MENU_MOTION_MS,
  MENU_MOTION_OUT_MS,
  motionCapability,
  resolveMotion120,
} from '../lib/motion120';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import {
  DropMenuBackdrop,
  DropMenuItems,
  PANEL_SCALE_FROM,
  panelTravelFor,
  useDropMenuStyles,
  type DropMenuProps,
} from './DropMenu.shared';

export type { DropMenuItem, DropMenuProps } from './DropMenu.shared';

/**
 * ONE anchored menu for the whole app — the composer's attachment drop-up, the
 * chat header's overflow dropdown, and the inbox row's More sheet-of-actions
 * all render through this.
 *
 * WHY IT IS SHARED. Three menus written three times is three tempos, three
 * dismiss behaviours and three sets of touch targets. The motion in particular
 * has to be one thing: a menu that grows out of the control that opened it
 * reads as that control expanding, and a menu that arrives at a different
 * speed from its siblings reads as a different app.
 *
 * ANCHORING IS THE CALLER'S. This renders absolutely INSIDE whatever the
 * caller marks as the anchor (a `position: relative` box), pinned to the edge
 * `direction`/`align` name. That keeps the panel tied to the control on every
 * screen width without measuring anything — a measured menu is a menu that
 * flickers on the first frame.
 *
 * TWO DRIVERS, ONE MENU (2026-08-23). The implementation below is the
 * FALLBACK: core `Animated`, translate + fade + scale, all on the native
 * driver. `DropMenu.motion120.tsx` is the fast path — the same menu on a real
 * spring computed by a worklet — and it is selected at module load, once, by
 * `resolveMotion120`. Everything both paths draw lives in
 * ./DropMenu.shared.tsx, so the choice changes the DRIVER and nothing a user
 * can name.
 *
 * REDUCED MOTION is honoured by collapsing the duration to zero rather than by
 * removing the animation: the menu still appears and disappears in the same
 * places, it just does not travel. Both paths do this.
 */
function DropMenuFallback({
  visible,
  onClose,
  items,
  direction = 'up',
  align = 'left',
  closeLabel = 'Close menu',
}: DropMenuProps) {
  const { styles } = useDropMenuStyles();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  // Kept mounted through the exit animation — unmounting on `visible` alone
  // would make every dismissal a hard cut.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? MENU_MOTION_MS : MENU_MOTION_OUT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [progress, reducedMotion, visible]);

  if (!mounted || items.length === 0) return null;

  const travel = panelTravelFor(direction);
  const panelStyle = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) },
      {
        scale: progress.interpolate({ inputRange: [0, 1], outputRange: [PANEL_SCALE_FROM, 1] }),
      },
    ],
  };

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

/**
 * Chosen ONCE, at module load, not per render.
 *
 * A capability cannot change while the app runs, so re-deciding per render
 * would re-enter the chooser on every frame of a menu's own animation and
 * could not produce a different answer. The literal `require` is written here
 * rather than passed as a string because Metro resolves requires statically at
 * bundle time — see `resolveMotion120`.
 */
const Impl = resolveMotion120<ComponentType<DropMenuProps>>(
  motionCapability,
  'reanimated',
  () => require('./DropMenu.motion120').DropMenu as ComponentType<DropMenuProps>,
  DropMenuFallback
);

export function DropMenu(props: DropMenuProps) {
  return <Impl {...props} />;
}
