/**
 * 2026-09-30 (the build run, `docs/dispatch/MELT-TAB-BAR.md`) — THE MELT-THROUGH TAB BAR'S BODY,
 * shared by the 120 Hz path (`MeltTabBar.motion120.tsx`) and the native-driver fallback
 * (`MeltTabBar.tsx`), so the two cannot drift into two bars: the slots, the metrics and colours,
 * the glyphs, the tab row the bubbles copy, the pill's own ground for the cut-outs, the touch and
 * accessibility layer, and the one tab-press path.
 *
 * THE ROW COPIES. The bar draws its tab row once in grey, and again — in ink, filled — inside every
 * bubble and connector, shifted by the holder's own position so each copy lines up with the grey
 * row exactly. That is how an icon turns dark precisely where a bubble covers it, half in and half
 * out, with no mask library. A cut-out does the reverse: a circle of the pill's own ground and the
 * grey row, carving the concave waist of a neck.
 */
import { useEffect, useMemo, useRef, type ComponentProps, type ComponentType } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap } from '../lib/haptics';
import { edgeFade, litCardStyle, meltBar, metricStyles, useThemeColors, withAlpha } from '../lib/theme';
import { BOTTOM_NAV_TABS, CUSTOMER_CREATE_SLOT, usePinnedFootActive, type BottomNavTabKey } from '../ui/primitives/BottomNav';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { pillBottomOffset, slotCentres, underBarFade } from '../lib/meltBarGeometry';

export type MeltTabBarProps = BottomTabBarProps & {
  /** The tree's drawn tabs, in order (CUSTOMER_BAR_TABS / WORKER_BAR_TABS). */
  tabs: readonly BottomNavTabKey[];
  /** The customer's + — opens the creation sheet. Absent on the worker tree. */
  onCreate?: () => void;
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type MeltSlot =
  | { kind: 'tab'; key: BottomNavTabKey; label: string; icons: readonly [IoniconName, IoniconName] }
  | { kind: 'create' };

/** The five slots a tree draws: its tabs, with the + in the customer's centre slot. */
export function meltSlots(tabs: readonly BottomNavTabKey[], hasCreate: boolean): MeltSlot[] {
  const slots: MeltSlot[] = tabs.map((key) => {
    const tab = BOTTOM_NAV_TABS.find((t) => t.key === key);
    return { kind: 'tab', key, label: tab?.label ?? key, icons: (tab?.icons ?? ['ellipse', 'ellipse-outline']) as readonly [IoniconName, IoniconName] };
  });
  if (hasCreate) slots.splice(CUSTOMER_CREATE_SLOT, 0, { kind: 'create' });
  return slots;
}

/** Which drawn slot holds the focused route; -1 while a hidden route (Map, MyJobs) is focused. */
export function focusedSlotIndex(state: BottomTabBarProps['state'], slots: readonly MeltSlot[]): number {
  const name = state.routes[state.index]?.name;
  return slots.findIndex((s) => s.kind === 'tab' && s.key === name);
}

/**
 * THE ONE TAB-PRESS PATH, the library's own (@react-navigation/bottom-tabs 7.18.3, BottomTabBar):
 * emit `tabPress` — the trees' `bottomNavScreenListeners` answer it with the haptic tap, and a
 * focused stack answers it by popping to its root — then navigate unless the tab was already
 * focused or a listener prevented it. The + never comes through here: it is an action.
 */
export function pressTab({ state, navigation }: Pick<BottomTabBarProps, 'state' | 'navigation'>, name: string): void {
  const index = state.routes.findIndex((r) => r.name === name);
  if (index < 0) return;
  const route = state.routes[index];
  const focused = index === state.index;
  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
  if (!focused && !event.defaultPrevented) {
    navigation.dispatch({ ...CommonActions.navigate(route.name, route.params), target: state.key });
  }
}

/** The + was pressed: the light haptic, then the tree's sheet. */
export function pressCreate(onCreate: (() => void) | undefined): void {
  if (!onCreate) return;
  tap();
  onCreate();
}

/** The bar's measurements and colours for this screen, inset and theme. */
export function useMeltMetrics(count: number) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { palette, isDark } = useThemeColors();
  const pillWidth = width - 2 * meltBar.sideInset;
  // One array per geometry, so what is built from it (the fast path's gesture) is not rebuilt by
  // every render.
  const centres = useMemo(() => slotCentres(pillWidth, count), [pillWidth, count]);
  return {
    pillWidth,
    centres,
    bottom: pillBottomOffset(insets.bottom, meltBar.bottomTuck, meltBar.bottomMin),
    isDark,
    bubble: palette.emerald,
    ink: palette.onForest,
    rest: withAlpha(palette.ink, isDark ? meltBar.restInkAlpha.dark : meltBar.restInkAlpha.light),
  };
}

const HOME_GLYPHS = {
  filled: require('../assets/glyphs/home-flat.png'),
  outline: require('../assets/glyphs/home-outline-flat.png'),
};

/**
 * A tab's glyph: the outline at rest, the filled one inside the bubble. Home is the app's own glyph
 * with the chimney cut off (the brief's §3), baked white like `components/CategoryGlyph.tsx`'s three
 * and tinted — no SVG library is installed; every other tab stays its Ionicons pair.
 */
export function TabGlyph({ slot, filled, color }: { slot: Extract<MeltSlot, { kind: 'tab' }>; filled: boolean; color: string }) {
  const styles = stylesFor();
  if (slot.key === 'Home') {
    return (
      <Image
        source={filled ? HOME_GLYPHS.filled : HOME_GLYPHS.outline}
        style={[styles.homeGlyph, { tintColor: color }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return <Ionicons name={filled ? slot.icons[0] : slot.icons[1]} size={meltBar.icon} color={color} style={styles.glyph} />;
}

/** The + glyph, in the bubble's ink. */
export function PlusGlyph({ color }: { color: string }) {
  return <Ionicons name="add" size={meltBar.plusGlyph} color={color} />;
}

type AnyStyle = unknown;

/**
 * THE TAB ROW, pill-sized: a 64 × 64 column per tab (icon over name) on its slot's centre. The
 * `rest` row draws outlines in grey; the `ink` row — the copy inside the bubbles — filled glyphs
 * in the bubble's ink. `iconStyles` / `labelStyles` are the per-slot "chosen" motions (the icon
 * drops, the name rises and fades), the SAME style objects in every copy; `AView` / `AText` are
 * the path's own animated components.
 */
export function MeltRow({
  slots,
  centres,
  width,
  variant,
  color,
  AView,
  AText,
  iconStyles,
  labelStyles,
}: {
  slots: readonly MeltSlot[];
  centres: readonly number[];
  width: number;
  variant: 'rest' | 'ink';
  color: string;
  AView: ComponentType<any>;
  AText: ComponentType<any>;
  iconStyles: readonly AnyStyle[];
  labelStyles: readonly AnyStyle[];
}) {
  const styles = stylesFor();
  // Drawn up to thirteen times over (the rest row, the copies inside the bubbles and the cut-outs):
  // pictures only — VoiceOver reads the touch layer's one element per tab.
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.row, { width }]}
    >
      {slots.map((slot, i) =>
        slot.kind === 'create' ? null : (
          <View key={slot.key} style={[styles.column, { left: centres[i] - meltBar.column / 2 }]}>
            <AView style={[styles.iconBox, iconStyles[i]]}>
              <TabGlyph slot={slot} filled={variant === 'ink'} color={color} />
            </AView>
            <AText numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.label, { color }, labelStyles[i]]}>
              {slot.label}
            </AText>
          </View>
        )
      )}
    </View>
  );
}

/** The pill's own ground — the lit card's fill without its rim or lift — for the cut-outs. */
export function pillGround(isDark: boolean): ViewStyle {
  const lit = litCardStyle(isDark) as Record<string, unknown>;
  return {
    backgroundColor: lit.backgroundColor as string,
    ...({ experimental_backgroundImage: lit.experimental_backgroundImage } as ViewStyle),
  };
}

/**
 * Fix run D13 (pick a) — THE SOFT FADE BEHIND THE FLOATING BAR. Every scene runs full height under
 * the pill, so a scroller's rows showed in the margins round it — a second outline under the bar.
 * This strip, drawn by the bar BEFORE the pill (so the pill sits on it), ramps from nothing at the
 * line scrolling content clears (the pill's top plus its breathing room, `underBarFade()`) to the
 * page ground at the pill's centre line, and stays solid to the edge: the rows end in the ground,
 * and a list scrolled to its end is never washed (the strip once began 56 pt higher and faded the
 * last row by two thirds). The ground is the light cream, or in dark the bottom stop of the Lux
 * diagonal the screens paint (`screenGround()`), so its foot matches the page's.
 *
 * OFF where it would cover something: the Map tab (no page ground, the map is the ground), and any
 * focused screen that pins a footer or composer over the pill (`usePinnedFootActive()`). It takes
 * no touch. Its opacity rides the native driver; Reduce Motion lands it at once.
 */
export function UnderBarFade({ state }: { state: BottomTabBarProps['state'] }) {
  const styles = stylesFor();
  const { palette, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();
  const fadeStops = underBarFade(insets.bottom, meltBar);
  const footPinned = usePinnedFootActive();
  const reduceMotion = useReducedMotion();
  const onMap = state.routes[state.index]?.name === 'Map';
  const shown = !onMap && !footPinned;
  const opacity = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion !== false) {
      opacity.setValue(shown ? 1 : 0);
      return;
    }
    const fade = Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: 160,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    fade.start();
    return () => fade.stop();
  }, [opacity, shown, reduceMotion]);
  const ground = isDark ? palette.authGroundBottom : palette.background;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.underBarFade, { height: fadeStops.height, opacity }, edgeFade(ground, 180, fadeStops.solidAt)]}
    />
  );
}

/** The pill itself: the lit card at the bar's corner. */
export function pillStyle(isDark: boolean, width: number, bottom: number): ViewStyle[] {
  const styles = stylesFor();
  return [styles.pill, { width, bottom }, litCardStyle(isDark), { borderRadius: meltBar.radius }];
}

/**
 * THE TOUCH AND ACCESSIBILITY LAYER, topmost: one Pressable per slot, on both paths. Each tab is a
 * `tab` with its name (and the name as hidden text, which is how the screenshot harness finds it),
 * the + keeps today's "Create" label and hint. A TAP IS ALWAYS THE PLATFORM'S OWN PRESS: the 120 Hz
 * path used to read taps off its Pan, and on a phone a press whose release never reached the Pan
 * chose nothing and left the bubble held (the operator's report, 2026-09-30) — so the Pan now only
 * drags, and the press-in / press-out hooks let that path swell the bubble under the finger.
 */
export function MeltTouchLayer({
  slots,
  centres,
  focused,
  onTab,
  onTabPressIn,
  onTabPressOut,
  onCreate,
  onCreatePressIn,
  onCreatePressOut,
}: {
  slots: readonly MeltSlot[];
  centres: readonly number[];
  focused: number;
  onTab: (name: string, slot: number) => void;
  onTabPressIn?: (slot: number) => void;
  onTabPressOut?: (slot: number) => void;
  onCreate?: () => void;
  onCreatePressIn?: () => void;
  onCreatePressOut?: () => void;
}) {
  const styles = stylesFor();
  return (
    <>
      {slots.map((slot, i) => {
        const place = { left: centres[i] - SLOT_TOUCH / 2 };
        if (slot.kind === 'create') {
          const a11y = {
            accessibilityRole: 'button' as const,
            accessibilityLabel: 'Create',
            accessibilityHint: 'Post a job, hire someone again, or open your jobs',
          };
          return (
            <Pressable
              key="create"
              {...a11y}
              style={[styles.touch, place]}
              onPressIn={onCreatePressIn}
              onPressOut={onCreatePressOut}
              onPress={() => pressCreate(onCreate)}
            />
          );
        }
        const a11y = {
          accessibilityRole: 'tab' as const,
          accessibilityLabel: slot.label,
          accessibilityState: { selected: i === focused },
        };
        const hidden = <Text style={styles.hiddenLabel}>{slot.label}</Text>;
        return (
          <Pressable
            key={slot.key}
            {...a11y}
            style={[styles.touch, place]}
            onPressIn={onTabPressIn ? () => onTabPressIn(i) : undefined}
            onPressOut={onTabPressOut ? () => onTabPressOut(i) : undefined}
            onPress={() => onTab(slot.key, i)}
          >
            {hidden}
          </Pressable>
        );
      })}
    </>
  );
}

/** Every slot is this wide at the pill's full height — above the 44pt minimum. */
const SLOT_TOUCH = 72;

/** Where the icon column's content starts, so icon + gap + name centre in the 64pt column. */
const LABEL_LINE = 13;
const COLUMN_TOP = (meltBar.column - (meltBar.icon + meltBar.labelGap + LABEL_LINE)) / 2;

/** The holder and layer styles both paths build their bubbles from. */
export function meltStyles() {
  return stylesFor();
}

const stylesFor = metricStyles(() => StyleSheet.create({
  underBarFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  /** A holder that clips what it carries: a bubble, a connector or a cut-out. */
  clip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  /** A copy of a row or of the pill's ground, laid at the pill's origin inside its holder. */
  layer: { position: 'absolute', left: 0, top: 0, height: meltBar.height },
  pill: { position: 'absolute', left: meltBar.sideInset, height: meltBar.height },
  row: { position: 'absolute', left: 0, top: 0, height: meltBar.height },
  column: { position: 'absolute', top: 0, width: meltBar.column, height: meltBar.column, alignItems: 'center', paddingTop: COLUMN_TOP },
  iconBox: { width: meltBar.icon, height: meltBar.icon, alignItems: 'center', justifyContent: 'center' },
  glyph: { width: meltBar.icon, height: meltBar.icon, lineHeight: meltBar.icon, textAlign: 'center' },
  homeGlyph: { width: meltBar.icon, height: meltBar.homeIconHeight },
  label: {
    marginTop: meltBar.labelGap,
    width: meltBar.column,
    textAlign: 'center',
    fontSize: meltBar.labelSize,
    lineHeight: LABEL_LINE,
    fontWeight: meltBar.labelWeight,
    letterSpacing: meltBar.labelTracking,
  },
  touch: { position: 'absolute', top: 0, width: SLOT_TOUCH, height: meltBar.height },
  hiddenLabel: { position: 'absolute', opacity: 0, fontSize: 1 },
}));
