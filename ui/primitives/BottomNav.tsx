import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { colors } from '../../lib/theme';

/**
 * §I's `BottomNav` primitive — deferred from Phase 1, built here because Phase 2
 * is what makes it mode-aware.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 * It is the tab bar's whole visual language — icons, labels, sizing, colours,
 * safe-area arithmetic — in one place, consumed by both navigator trees and by
 * the dev catalog. It is NOT a replacement `tabBar` renderer. React Navigation's
 * own BottomTabBar still draws the real bar, configured by
 * `bottomNavScreenOptions()` below, because the current bar's correctness comes
 * from a long argument with that library's internals (see the arithmetic on
 * TAB_BAR_CONTENT_HEIGHT). Reimplementing the bar to satisfy a "primitive"
 * would risk exactly the pixel drift that Phase 2 must not introduce on LOCKED
 * screens 07/48, for no gain: there is still one implementation, and this is it.
 *
 * The catalog therefore renders `BottomNavPreview`, a static bar built from the
 * same item renderer and the same style constants — so a change here shows up
 * there, which is the point of the catalog.
 *
 * MODE AWARENESS lives in the two trees (navigation/CustomerRoot.tsx,
 * navigation/WorkerRoot.tsx), which mount the same five tabs against different
 * Home stacks. The bar itself is identical in both modes on purpose: the Home
 * tab means "the home of the mode you are in", and changing its icon or label
 * per mode would make the switch feel like a different app rather than the same
 * app in a different mode.
 */

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type BottomNavTabKey = 'Home' | 'Map' | 'MyJobs' | 'Messages' | 'Profile';

/** The five tabs, in bar order. Both trees register exactly these, in this order. */
export const BOTTOM_NAV_TABS: {
  key: BottomNavTabKey;
  label: string;
  /** [active, inactive] */
  icons: [IoniconName, IoniconName];
}[] = [
  { key: 'Home', label: 'Home', icons: ['home', 'home-outline'] },
  // A teardrop location-pin marker, not the map-square glyph — this tab is
  // "find work near you", and a pin reads as that more directly than a map.
  { key: 'Map', label: 'Map', icons: ['location', 'location-outline'] },
  { key: 'MyJobs', label: 'My Jobs', icons: ['briefcase', 'briefcase-outline'] },
  { key: 'Messages', label: 'Messages', icons: ['chatbubbles', 'chatbubbles-outline'] },
  { key: 'Profile', label: 'Profile', icons: ['person', 'person-outline'] },
];

const TAB_BY_KEY = new Map(BOTTOM_NAV_TABS.map((tab) => [tab.key as string, tab]));

// Bottom tab bar sizing. @react-navigation/bottom-tabs 7.18.3 (the version
// installed here) bakes in — with nothing overriding them — a 25px icon
// (ICON_SIZE_ROUND in its TabBarIcon.js), a 10px label (labelBeneath in
// BottomTabItem.js), and a 49px bar content height (TABBAR_HEIGHT_UIKIT in
// BottomTabBar.js, before the device's safe-area bottom inset is added on top).
// None of those are exposed as constants to import, so they're reproduced here
// from the installed source rather than guessed.
//
// Icon and label are deliberate design sizes, landed on after two rounds of
// feedback (a 35%/35% scale-up read too big; these are the midpoint). The bar
// height is NOT a taste value the same way — it's derived from what the content
// actually measures, see the arithmetic below.
const TAB_ICON_SIZE = 29;
const TAB_LABEL_FONT_SIZE = 12;

// BottomTabItem.js's tabVerticalUiKit style wraps whatever tabBarIcon renders
// in 5px of padding on every side — not overridable — so the usable slot is
// always TAB_BAR_CONTENT_HEIGHT - 10. The stacked content below needs:
//
//   icon glyph box   32   (Ionicons renders in a Text box ~size + 3, NOT 29)
//   label            16   (marginTop 2 + lineHeight 14)
//   paddingBottom     3   (TAB_BOTTOM_GAP)
//   ------------------------
//   total            51
//
// so the slot must be >= 51, i.e. the bar >= 61. 70 leaves deliberate slack:
// the bar was 55 (a 45px slot) for several iterations, which is where the
// icons-crossing-the-hairline bug came from, and because tabItemContent packs
// to flex-end any overflow goes out the TOP, through the hairline. The Emerald
// reskin removed a 7px active dot from this stack, which only widened the
// margin — the height is left where it is rather than re-tightened around the
// exact content, since nothing is gained by sitting close to that edge.
//
// Careful with the icon line: react-native-web collapses the label's <Text>
// layout box to ~1px instead of 14, which made the old 55/45 combination
// measure as fitting exactly on web while overflowing on device. Any harness
// measurement of this stack taken on web reads ~13px shorter than native —
// don't size this from a web number without adding that back.
export const TAB_BAR_CONTENT_HEIGHT = 70;
const TAB_ICON_WRAPPER_HEIGHT = TAB_BAR_CONTENT_HEIGHT - 10;
const TAB_BOTTOM_GAP = 3;

// How much room to leave below the labels for the home indicator. iOS reports
// insets.bottom = 34 on notched devices, and reserving all of it was what left
// the visible band of empty white under the labels: the content area stops at
// 70px and the remaining 34 is pure padding. The indicator itself only occupies
// roughly the bottom 13px, so 16 clears it with margin while cutting that dead
// space by more than half. Devices reporting a smaller inset keep their own
// (the Math.min below), since they need less, not more.
export const TAB_BAR_SAFE_BOTTOM = 16;

// Deliberately hardcoded, NOT sourced from useThemeColors() — that hook's
// useColorScheme() dependency was forcing the navigator's screenOptions (and
// this style object) to recompute on every system light/dark flip. Android has
// a well-known rendering bug where a `transparent` background combined with a
// nonzero `elevation` renders as a solid black rectangle instead of a proper
// shadow — see the elevation:0 override below, which only reliably wins over
// the library's own default elevation:8 (BottomTabBar.js's `bottom` style) once
// it's actually applied; a recompute is exactly the kind of moment where a
// transient style could briefly fall back to that default. An opaque background
// makes that whole bug class structurally impossible regardless of timing, on
// top of removing the theme dependency itself. Values below reuse the app's
// existing light-palette tokens (not new hex literals) so this can't silently
// drift. Proper light/dark tab bar theming comes later.
//
// Emerald reskin: the active tint is `forest` (the atlas's deep green, which is
// also what the Home screen's own chrome uses) rather than `primary`, and the
// hairline is the ordinary border rather than gold — the reference separates
// the bar with a plain hairline and carries the accent colour on the active
// item itself, not on the edge.
const TAB_BAR_BACKGROUND = colors.surface;
const TAB_HAIRLINE_COLOR = colors.border;
export const TAB_ACTIVE_COLOR = colors.forest;
export const TAB_INACTIVE_COLOR = colors.textMuted;

/** How tall the whole bar is on a device reporting this bottom inset. */
export function bottomNavHeight(insetBottom: number): number {
  return TAB_BAR_CONTENT_HEIGHT + Math.min(insetBottom, TAB_BAR_SAFE_BOTTOM);
}

/**
 * One tab's icon + label. Rendered inside the library's own item wrapper for
 * the real bar, and directly by BottomNavPreview for the catalog, so both show
 * the same thing.
 */
export function BottomNavItem({
  routeName,
  focused,
  color,
}: {
  routeName: string;
  focused: boolean;
  color: string;
}) {
  const tab = TAB_BY_KEY.get(routeName);
  const [active, inactive] = tab?.icons ?? (['ellipse', 'ellipse-outline'] as const);
  const label = tab?.label ?? routeName;

  return (
    <View style={styles.tabItemContent}>
      <Ionicons name={focused ? active : inactive} size={TAB_ICON_SIZE} color={color} />
      <Text
        style={[styles.tabItemLabel, { color, fontWeight: focused ? '700' : '500' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The Tab.Navigator `screenOptions` both trees use. Identical configuration in
 * customer and worker mode, which is what keeps the chrome under LOCKED screens
 * 07 and 48 pixel-for-pixel unchanged.
 *
 * `insetBottom` is passed in rather than read from a hook here so this stays a
 * plain function the catalog can also call.
 */
export function bottomNavScreenOptions(insetBottom: number) {
  // getTabBarHeight() (bottom-tabs internals) uses a custom tabBarStyle.height
  // VERBATIM when one is set, rather than adding the safe-area inset on top of
  // it the way the default 49px computation does — so the inset has to be
  // folded in by hand. Without this, TAB_BAR_CONTENT_HEIGHT would be the whole
  // bar on a notched device and the home indicator would eat into the content
  // slot, re-creating the overflow that height is sized to avoid.
  const bottomInset = Math.min(insetBottom, TAB_BAR_SAFE_BOTTOM);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  return ({ route }: { route: { name: string } }): BottomTabNavigationOptions => ({
    headerShown: false,
    tabBarActiveTintColor: TAB_ACTIVE_COLOR,
    tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
    tabBarShowLabel: false,
    tabBarIcon: ({ focused, color }) => (
      <BottomNavItem routeName={route.name} focused={focused} color={color} />
    ),
    // Wraps the whole icon+label block (see tabItemContent), not just the icon
    // — width:'100%' so longer labels like "Messages" have the full tab column
    // to lay out in, instead of the library's default 31px-wide icon-only box.
    tabBarIconStyle: { width: '100%', height: TAB_ICON_WRAPPER_HEIGHT },
    tabBarStyle: {
      height: tabBarHeight,
      // MUST accompany the height above. BottomTabBar.js applies
      // `paddingBottom: insets.bottom` (the full 34 on a notched device) to the
      // bar; tabBarStyle is merged last so this overrides it. Without it the
      // bar would be 86 tall with 34 of padding, leaving the content only 52 of
      // the 70 it needs — re-creating the overflow the height was sized to
      // avoid.
      paddingBottom: bottomInset,
      backgroundColor: TAB_BAR_BACKGROUND,
      borderTopColor: TAB_HAIRLINE_COLOR,
      elevation: 0,
    },
  });
}

/**
 * A static, non-navigating rendering of the bar, for the dev catalog. Uses the
 * same item renderer and the same constants as the real bar; it just cannot be
 * tapped, because there is nothing to navigate to from a catalog page.
 */
export function BottomNavPreview({
  activeKey,
  insetBottom = 0,
}: {
  activeKey: BottomNavTabKey;
  /** Simulate a notched device's home-indicator inset. */
  insetBottom?: number;
}) {
  const bottomInset = Math.min(insetBottom, TAB_BAR_SAFE_BOTTOM);

  return (
    <View
      style={[
        styles.previewBar,
        { height: TAB_BAR_CONTENT_HEIGHT + bottomInset, paddingBottom: bottomInset },
      ]}
      accessibilityRole="tablist"
    >
      {BOTTOM_NAV_TABS.map((tab) => {
        const focused = tab.key === activeKey;
        return (
          <View key={tab.key} style={styles.previewItem}>
            <BottomNavItem
              routeName={tab.key}
              focused={focused}
              color={focused ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills TAB_ICON_WRAPPER_HEIGHT and packs against the bottom instead of the
  // top — see the comment on TAB_ICON_WRAPPER_HEIGHT/TAB_BOTTOM_GAP.
  tabItemContent: {
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: TAB_BOTTOM_GAP,
  },
  tabItemLabel: {
    // fontWeight is set per-render (bold when focused) — see BottomNavItem.
    fontSize: TAB_LABEL_FONT_SIZE,
    lineHeight: TAB_LABEL_FONT_SIZE + 2,
    marginTop: 2,
  },
  previewBar: {
    flexDirection: 'row',
    backgroundColor: TAB_BAR_BACKGROUND,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: TAB_HAIRLINE_COLOR,
  },
  previewItem: {
    flex: 1,
    // Matches BottomTabItem.js's non-overridable 5px padding on every side.
    padding: 5,
    height: TAB_ICON_WRAPPER_HEIGHT + 10,
  },
});
