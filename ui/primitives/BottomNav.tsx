import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { radius, themedStyles, useThemeColors, type ColorPalette } from '../../lib/theme';

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
 * navigation/WorkerRoot.tsx). Since Stage 4D the two bars differ by design
 * (operator decision, docs/audits/STAGE4D_PLAN.md "Navigation — FINAL"):
 * the worker bar keeps the five classic tabs (WORKER_BAR_TABS), while the
 * customer bar shows four (CUSTOMER_BAR_TABS) with the raised [ + ] creation
 * button in the center slot. The customer tree still REGISTERS Map and MyJobs
 * as routes — their bar items are hidden via HIDDEN_TAB_ITEM_OPTIONS — because
 * the LOCKED Customer Home dispatches `getParent()?.navigate('Map')` and
 * notification routing dispatches into the MyJobs tab in both modes; both must
 * keep resolving on the tab navigator itself (React Navigation 7 does not
 * search child navigators for an untargeted NAVIGATE, so a route moved into a
 * child stack would silently stop resolving for those callers).
 */

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type BottomNavTabKey = 'Home' | 'Map' | 'MyJobs' | 'Discover' | 'Messages' | 'Profile';

/** Every bar item either tree can render, keyed for the item renderer. Bar
 *  ORDER lives in WORKER_BAR_TABS / CUSTOMER_BAR_TABS below, per mode. */
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
  // The customer's browse surface (workers and services — never job
  // postings). A compass, per the 4D-1a dispatch: same slot the Map tab
  // occupied, different promise.
  { key: 'Discover', label: 'Discover', icons: ['compass', 'compass-outline'] },
  { key: 'Messages', label: 'Messages', icons: ['chatbubbles', 'chatbubbles-outline'] },
  { key: 'Profile', label: 'Profile', icons: ['person', 'person-outline'] },
];

/** The worker bar — the five classic tabs, unchanged (LOCKED screen 48 sits
 *  above this exact bar). */
export const WORKER_BAR_TABS: BottomNavTabKey[] = ['Home', 'Map', 'MyJobs', 'Messages', 'Profile'];

/** The customer bar's four VISIBLE tabs. The center [ + ] slot sits between
 *  Discover and Messages and is an action, not a tab — see CenterCreateButton. */
export const CUSTOMER_BAR_TABS: BottomNavTabKey[] = ['Home', 'Discover', 'Messages', 'Profile'];

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

// Bar colours come from the RESOLVED palette (4D-4): bottomNavScreenOptions
// takes it as a parameter so it stays a plain function the catalog can call,
// and the trees pass the palette from useThemeColors — so the bar repaints on
// a theme change. Both palettes keep the background OPAQUE (surface), which is
// what keeps the well-known Android transparent-background + elevation
// black-rectangle bug structurally impossible — the elevation:0 override below
// still accompanies it, exactly as before. Emerald reskin note (unchanged):
// the active tint is `forest` (gold under Prestige) rather than `primary`, and
// the hairline is the ordinary border — the accent rides the active item, not
// the edge.

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
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
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
export function bottomNavScreenOptions(insetBottom: number, palette: ColorPalette) {
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
    tabBarActiveTintColor: palette.forest,
    tabBarInactiveTintColor: palette.textMuted,
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
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      elevation: 0,
    },
  });
}

/**
 * Registration options for a tab that must stay DISPATCHABLE but must not
 * appear in the bar. `display: 'none'` on the item's outer wrapper removes it
 * from the bar's layout entirely (no phantom flex slot — verified against the
 * installed @react-navigation/bottom-tabs 7.18.3 BottomTabBar.js, which merges
 * `tabBarItemStyle` onto each item's container).
 *
 * The customer tree uses this for Map and MyJobs: the LOCKED Customer Home's
 * "View map" pill dispatches `getParent()?.navigate('Map')` — an untargeted
 * NAVIGATE handled by the tab navigator itself, which React Navigation 7 never
 * forwards down into child navigators — and every notification / cross-tab
 * jump targets the MyJobs TAB in both modes (lib/navigationRef.ts). Keeping
 * both as hidden tab routes keeps every one of those dispatches resolving
 * while the bar shows only the four customer tabs plus the center action.
 */
export const HIDDEN_TAB_ITEM_OPTIONS: BottomTabNavigationOptions = {
  tabBarItemStyle: { display: 'none' },
};

/**
 * The customer bar's center [ + ] — a rounded square in `colors.forest` with a
 * dark plus glyph, visually raised above the bar (4D-1a pre-made decision).
 * It is an ACTION, not a navigation destination: it opens the creation sheet
 * and never dispatches navigation, so it can never render an active state.
 *
 * Rendered through the dummy Create route's `tabBarButton`, which replaces the
 * library's pressable inside an `overflow: visible` item wrapper — so the
 * raised square can poke above the hairline without touching the bar's own
 * style object. The BUTTON is opaque forest (gold under Prestige) with its own
 * shadow; the bar keeps its opaque background and `elevation: 0` (see the
 * comment above bottomNavScreenOptions — nothing reintroduces transparency).
 */
export function CenterCreateButton({ onPress }: { onPress: () => void }) {
  const { palette: colors, emerald, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={styles.createSlot}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel="Create"
        accessibilityHint="Post a job, hire someone again, or open your jobs"
      >
        {/* Light keeps the 4D-1a dark-ink glyph on forest; dark needs the
            §I onForest (near-black) so the glyph reads on the gold fill —
            ColorPalette has no onForest, hence the emerald read. */}
        <Ionicons name="add" size={34} color={isDark ? emerald.onForest : colors.ink} />
      </Pressable>
    </View>
  );
}

/**
 * A static, non-navigating rendering of the bar, for the dev catalog. Uses the
 * same item renderer and the same constants as the real bar; it just cannot be
 * tapped, because there is nothing to navigate to from a catalog page.
 */
export function BottomNavPreview({
  activeKey,
  insetBottom = 0,
  tabs = WORKER_BAR_TABS,
  showCreateAction = false,
}: {
  activeKey: BottomNavTabKey;
  /** Simulate a notched device's home-indicator inset. */
  insetBottom?: number;
  /** Which bar layout to draw — worker five by default. */
  tabs?: BottomNavTabKey[];
  /** Insert the static customer [ + ] between Discover and Messages. */
  showCreateAction?: boolean;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const bottomInset = Math.min(insetBottom, TAB_BAR_SAFE_BOTTOM);

  // The customer layout raises the action between its 2nd and 3rd tabs; a
  // flat item list keeps every slot an equal flex column, like the real bar.
  const items: Array<{ kind: 'tab'; key: BottomNavTabKey } | { kind: 'create' }> = [];
  tabs.forEach((key, index) => {
    if (showCreateAction && index === 2) items.push({ kind: 'create' });
    items.push({ kind: 'tab', key });
  });

  return (
    <View
      style={[
        styles.previewBar,
        { height: TAB_BAR_CONTENT_HEIGHT + bottomInset, paddingBottom: bottomInset },
      ]}
      accessibilityRole="tablist"
    >
      {items.map((item) =>
        item.kind === 'create' ? (
          <View key="create" style={styles.previewItem}>
            <CenterCreateButton onPress={() => {}} />
          </View>
        ) : (
          <View key={item.key} style={styles.previewItem}>
            <BottomNavItem
              routeName={item.key}
              focused={item.key === activeKey}
              color={item.key === activeKey ? colors.forest : colors.textMuted}
            />
          </View>
        )
      )}
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  // Fills the Create route's item slot; the square inside is lifted so it
  // pokes above the hairline. Bottom-aligned like tabItemContent so the
  // raised amount is the translate, not layout guesswork.
  createSlot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: TAB_BOTTOM_GAP,
  },
  createButton: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    // Raised above the bar. iOS is the target (CLAUDE.md: Android deferred);
    // the slice above the bar's bounds still draws because the library's item
    // wrapper keeps overflow visible for the uikit variant.
    transform: [{ translateY: -14 }],
    // The button's own depth. It is OPAQUE forest, so this elevation cannot
    // trigger the transparent-background Android rendering bug the bar's own
    // elevation:0 exists to avoid — and the bar's style is untouched.
    shadowColor: colors.ink,
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  createButtonPressed: { opacity: 0.88, transform: [{ translateY: -14 }, { scale: 0.96 }] },
  previewBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  previewItem: {
    flex: 1,
    // Matches BottomTabItem.js's non-overridable 5px padding on every side.
    padding: 5,
    height: TAB_ICON_WRAPPER_HEIGHT + 10,
  },
  }),
);
