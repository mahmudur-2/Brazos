import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { MENU_MOTION_MS, MENU_MOTION_OUT_MS } from '../lib/motion120';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type DropMenuItem = {
  key: string;
  label: string;
  icon?: IoniconName;
  onPress: () => void;
  /** Red label + glyph. The item still confirms wherever the action does. */
  destructive?: boolean;
  disabled?: boolean;
};

type DropMenuProps = {
  visible: boolean;
  onClose: () => void;
  items: DropMenuItem[];
  /** 'up' grows out of the top of its anchor (a composer's [ + ]); 'down' out
   *  of the bottom (a header's overflow dots). */
  direction?: 'up' | 'down';
  /** Which edge of the anchor's row the panel pins to. */
  align?: 'left' | 'right';
  /** Announced by the backdrop, so dismissing is reachable to a screen reader
   *  rather than being a tap on nothing. */
  closeLabel?: string;
};

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
 * THE MOTION. Translate + fade + a slight scale, all on transform/opacity, so
 * the whole thing runs on the native driver (and, on a build that has
 * reanimated, is the natural place for a `.motion120` sibling to take over —
 * the timings already come from the boundary). It grows FROM the anchor: a
 * drop-up starts 8pt low and rises, a dropdown starts 8pt high and falls, so
 * the origin of the motion is the button in both cases. Exit is faster than
 * entrance — a dismissal that takes as long as an arrival reads as sluggish.
 *
 * REDUCED MOTION is honoured by collapsing the duration to zero rather than by
 * removing the animation: the menu still appears and disappears in the same
 * places, it just does not travel.
 */
export function DropMenu({
  visible,
  onClose,
  items,
  direction = 'up',
  align = 'left',
  closeLabel = 'Close menu',
}: DropMenuProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
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

  const travel = direction === 'up' ? 8 : -8;
  const panelStyle = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };

  return (
    <>
      {/* Outside-tap dismissal. It covers the space the menu opens INTO —
          upward for a drop-up, downward for a dropdown — which is where a
          finger goes to get rid of it. */}
      <Pressable
        style={[styles.backdrop, direction === 'up' ? styles.backdropUp : styles.backdropDown]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
      />
      <Animated.View
        style={[
          styles.panel,
          direction === 'up' ? styles.panelUp : styles.panelDown,
          align === 'right' ? styles.panelRight : styles.panelLeft,
          panelStyle,
        ]}
        accessibilityViewIsModal
      >
        {items.map((item, index) => (
          <Pressable
            key={item.key}
            onPress={() => {
              // Close first, so the menu's exit overlaps whatever the action
              // opens instead of following it.
              onClose();
              item.onPress();
            }}
            disabled={item.disabled}
            style={({ pressed }) => [
              styles.item,
              index > 0 && styles.itemDivided,
              pressed && styles.itemPressed,
              item.disabled && styles.itemDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ disabled: !!item.disabled }}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={20}
                color={item.destructive ? colors.danger : colors.gold}
              />
            ) : null}
            <Text style={[styles.itemLabel, item.destructive && styles.itemLabelDestructive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    backdrop: {
      position: 'absolute',
      left: 0,
      right: 0,
      // Tall enough to cover the surface the menu opens over on any phone,
      // and clipped by whatever the anchor's own scroll container clips to.
      height: 900,
    },
    backdropUp: { bottom: '100%' },
    backdropDown: { top: '100%' },
    panel: {
      position: 'absolute',
      minWidth: 208,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      ...shadows.raised,
    },
    // 8pt clear of the control, in whichever direction it opens.
    panelUp: { bottom: '100%', marginBottom: spacing.sm },
    panelDown: { top: '100%', marginTop: spacing.sm },
    panelLeft: { left: 0 },
    panelRight: { right: 0 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // The 44pt touch floor, met by the drawn row rather than by hitSlop —
      // rows are adjacent here, so overlapping slop would steal each other's
      // taps.
      minHeight: 46,
      paddingHorizontal: spacing.lg,
    },
    itemDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    itemPressed: { backgroundColor: colors.primarySoft },
    itemDisabled: { opacity: 0.4 },
    itemLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    itemLabelDestructive: { color: colors.danger },
  })
);
