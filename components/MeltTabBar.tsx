/**
 * 2026-09-30 (the build run, `docs/dispatch/MELT-TAB-BAR.md`) — THE MELT-THROUGH TAB BAR: the
 * chooser and the native-driver fallback.
 *
 * The 120 Hz path (`MeltTabBar.motion120.tsx`) needs worklets AND a recogniser — the finger drags
 * the bubble — so it is taken through the boundary the way `components/PeekSheet.tsx` takes its
 * pull. A binary without either, and every reader with Reduce Motion on, gets this file's bar: the
 * same pill, rows and colours, one bubble sliding from tab to tab (a spring on the native driver,
 * or a 180 ms timing with Reduce Motion), names cross-fading, the + squishing on press — no joints,
 * no tail, no stretch.
 *
 * THE BAR FLOATS. Its root is absolute at the screen's foot on every tab screen, so every scene
 * runs full height and scrolls under the pill; what content keeps clear of it is
 * `useScrollClearance()` / `usePinnedFooterPadding()` in ui/primitives/BottomNav.tsx, which read
 * the same footprint (`hooks/useNavInset.ts`).
 */
import { useEffect, useMemo, useRef, type ComponentType } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { canSwipe, canWorklet, motionCapability, resolveMotion120 } from '../lib/motion120';
import { meltBar, metricStyles } from '../lib/theme';
import {
  focusedSlotIndex,
  meltSlots,
  meltStyles,
  MeltRow,
  MeltTouchLayer,
  pillStyle,
  PlusGlyph,
  pressTab,
  UnderBarFade,
  useMeltMetrics,
  type MeltTabBarProps,
} from './MeltTabBar.shared';

export type { MeltTabBarProps } from './MeltTabBar.shared';

const LEAD = meltBar.bubble[0];

function MeltTabBarFallback(props: MeltTabBarProps) {
  const { tabs, onCreate, state } = props;
  // Keyed on whether there is a +, never on the handler's identity (a tree passes it inline).
  const hasCreate = onCreate != null;
  const slots = useMemo(() => meltSlots(tabs, hasCreate), [tabs, hasCreate]);
  const m = useMeltMetrics(slots.length);
  const reduced = useReducedMotion() === true;
  const focused = focusedSlotIndex(state, slots);
  const home = focused >= 0 ? m.centres[focused] : m.centres[0];
  const styles = stylesFor();
  const shared = meltStyles();

  const x = useRef(new Animated.Value(home - LEAD / 2)).current;
  const shown = useRef(new Animated.Value(focused >= 0 ? 1 : 0)).current;
  const chosen = useRef(slots.map((_, i) => new Animated.Value(i === focused ? 1 : 0))).current;
  const plusScale = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);

  useEffect(() => {
    const to = (value: Animated.Value, toValue: number) =>
      reduced
        ? Animated.timing(value, { toValue, duration: meltBar.reducedMs, useNativeDriver: USE_NATIVE_DRIVER })
        : Animated.spring(value, {
            toValue,
            stiffness: meltBar.fallbackSpring[0],
            damping: meltBar.fallbackSpring[1],
            mass: 1,
            useNativeDriver: USE_NATIVE_DRIVER,
          });
    const left = home - LEAD / 2;
    if (!placed.current) {
      placed.current = true;
      x.setValue(left);
      shown.setValue(focused >= 0 ? 1 : 0);
      chosen.forEach((c, i) => c.setValue(i === focused ? 1 : 0));
      return;
    }
    Animated.parallel([
      to(x, left),
      to(shown, focused >= 0 ? 1 : 0),
      ...chosen.map((c, i) => to(c, i === focused ? 1 : 0)),
    ]).start();
  }, [home, focused, reduced, x, shown, chosen]);

  // The "chosen" motion, one style per slot, the same object in both rows.
  const iconStyles = chosen.map((c) => ({
    transform: [{ translateY: c.interpolate({ inputRange: [0, 1], outputRange: [0, meltBar.iconDrop] }) }],
  }));
  const labelStyles = chosen.map((c) => ({
    opacity: c.interpolate({ inputRange: [0, 1 / meltBar.labelFade, 1], outputRange: [1, 0, 0] }),
    transform: [{ translateY: c.interpolate({ inputRange: [0, 1], outputRange: [0, -meltBar.labelRise] }) }],
  }));
  const top = (meltBar.height - LEAD) / 2;
  const createIndex = slots.findIndex((s) => s.kind === 'create');

  const squish = (toValue: number) =>
    reduced
      ? plusScale.setValue(1)
      : Animated.spring(plusScale, { toValue, stiffness: 900, damping: 40, mass: 1, useNativeDriver: USE_NATIVE_DRIVER }).start();

  return (
    <View pointerEvents="box-none" style={[styles.root, { height: m.bottom + meltBar.height }]}>
      <View style={pillStyle(m.isDark, m.pillWidth, m.bottom)}>
        <MeltRow
          slots={slots}
          centres={m.centres}
          width={m.pillWidth}
          variant="rest"
          color={m.rest}
          AView={Animated.View}
          AText={Animated.Text}
          iconStyles={iconStyles}
          labelStyles={labelStyles}
        />
        <Animated.View
          style={[
            shared.clip,
            { width: LEAD, height: LEAD, borderRadius: LEAD / 2, backgroundColor: m.bubble, top, opacity: shown },
            { transform: [{ translateX: x }] },
          ]}
        >
          <Animated.View style={[shared.layer, { width: m.pillWidth, top: -top, transform: [{ translateX: Animated.multiply(x, -1) }] }]}>
            <MeltRow
              slots={slots}
              centres={m.centres}
              width={m.pillWidth}
              variant="ink"
              color={m.ink}
              AView={Animated.View}
              AText={Animated.Text}
              iconStyles={iconStyles}
              labelStyles={labelStyles}
            />
          </Animated.View>
        </Animated.View>
        {createIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.plus,
              { left: m.centres[createIndex] - meltBar.plus / 2, backgroundColor: m.bubble, transform: [{ scale: plusScale }] },
            ]}
          >
            <PlusGlyph color={m.ink} />
          </Animated.View>
        ) : null}
        <MeltTouchLayer
          slots={slots}
          centres={m.centres}
          focused={focused}
          onTab={(name) => pressTab(props, name)}
          onCreate={onCreate}
          onCreatePressIn={() => squish(meltBar.plusPressed)}
          onCreatePressOut={() => squish(1)}
        />
      </View>
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  plus: {
    position: 'absolute',
    top: (meltBar.height - meltBar.plus) / 2,
    width: meltBar.plus,
    height: meltBar.plus,
    borderRadius: meltBar.plus / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

const Impl = resolveMotion120<ComponentType<MeltTabBarProps>>(
  { ...motionCapability, gestures: canSwipe() && canWorklet(), reanimated: canWorklet() },
  'gestures',
  () => require('./MeltTabBar.motion120').MeltTabBar as ComponentType<MeltTabBarProps>,
  MeltTabBarFallback
);

/**
 * The bar both trees pass as `tabBar`. Reduce Motion takes the fallback's plain slide. The soft
 * fade (fix run D13) is drawn first, so the pill of either path sits on it.
 */
export function MeltTabBar(props: MeltTabBarProps) {
  const reduced = useReducedMotion() === true;
  const Bar = reduced ? MeltTabBarFallback : Impl;
  return (
    <>
      <UnderBarFade state={props.state} />
      <Bar {...props} />
    </>
  );
}
