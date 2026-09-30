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
import { useMemo, type ComponentProps, type ComponentType } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tap } from '../lib/haptics';
import { litCardStyle, meltBar, metricStyles, useThemeColors, withAlpha } from '../lib/theme';
import { BOTTOM_NAV_TABS, CUSTOMER_CREATE_SLOT, type BottomNavTabKey } from '../ui/primitives/BottomNav';
import { pillBottomOffset, slotCentres } from '../lib/meltBarGeometry';

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
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: lit.backgroundImage } as unknown as ViewStyle)
      : ({ experimental_backgroundImage: lit.experimental_backgroundImage } as ViewStyle)),
  };
}

/** The pill itself: the lit card at the bar's corner. */
export function pillStyle(isDark: boolean, width: number, bottom: number): ViewStyle[] {
  const styles = stylesFor();
  return [styles.pill, { width, bottom }, litCardStyle(isDark), { borderRadius: meltBar.radius }];
}

/**
 * THE TOUCH AND ACCESSIBILITY LAYER, topmost: one box per slot. Each tab is a `tab` with its name
 * (and the name as hidden text, which is how the screenshot harness finds it), the + keeps today's
 * "Create" label and hint. `pressable` (the fallback) makes them Pressables; the 120 Hz path lets
 * its one Pan take the touches and keeps these for VoiceOver.
 */
export function MeltTouchLayer({
  slots,
  centres,
  focused,
  pressable,
  onTab,
  onCreate,
  onCreatePressIn,
  onCreatePressOut,
}: {
  slots: readonly MeltSlot[];
  centres: readonly number[];
  focused: number;
  pressable: boolean;
  onTab: (name: string) => void;
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
          return pressable ? (
            <Pressable
              key="create"
              {...a11y}
              style={[styles.touch, place]}
              onPressIn={onCreatePressIn}
              onPressOut={onCreatePressOut}
              onPress={() => pressCreate(onCreate)}
            />
          ) : (
            <View key="create" {...a11y} accessible onAccessibilityTap={() => pressCreate(onCreate)} style={[styles.touch, place]} />
          );
        }
        const a11y = {
          accessibilityRole: 'tab' as const,
          accessibilityLabel: slot.label,
          accessibilityState: { selected: i === focused },
        };
        const hidden = <Text style={styles.hiddenLabel}>{slot.label}</Text>;
        return pressable ? (
          <Pressable key={slot.key} {...a11y} style={[styles.touch, place]} onPress={() => onTab(slot.key)}>
            {hidden}
          </Pressable>
        ) : (
          <View key={slot.key} {...a11y} accessible onAccessibilityTap={() => onTab(slot.key)} style={[styles.touch, place]}>
            {hidden}
          </View>
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
