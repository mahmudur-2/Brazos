import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { glow, layout, radius, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../../lib/theme';

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
 * navigation/WorkerRoot.tsx). The two bars are no longer the same five tabs:
 * emerald D1 gave the customer its own composition, and the worker kept 0d's.
 * Both are drawn as a floating pill with an emerald active item under a soft
 * glow.
 *
 *   WORKER    Home · Map · My Jobs · Messages · Profile        (0d, unchanged)
 *   CUSTOMER  Home · Discover · [ + ] · Messages · Profile     (emerald D1)
 *
 * THE CENTER [ + ] IS BACK, CUSTOMER ONLY (dark device pass, D3; kept by
 * emerald D4). 0d retired the 4D-era creation slot because no golden master
 * draws one and each of its three actions had a standing surface. The operator
 * reversed that half of decision 4: posting a job is the customer's whole
 * reason for opening the app and it was two taps behind a tab. It is an
 * ACTION, not a destination — its route is never focused and never draws
 * active. This is structural, so unlike a paint change it is visible in BOTH
 * themes, and it is a deliberate, recorded deviation from the master set.
 *
 * WHAT emerald D1 CHANGED, AND WHAT IT DELIBERATELY DID NOT
 * The customer bar lost its My Jobs ITEM and its Map ITEM; it gained a
 * Discover item pointing at the customer browse surface. Neither destination
 * was deleted — both stay REGISTERED on the tab navigator behind
 * HIDDEN_TAB_ITEM_OPTIONS, because React Navigation 7 resolves an untargeted
 * NAVIGATE against the tab navigator and its ancestors only (never down into
 * child navigators), so every existing dispatch — the [ + ] sheet's "My jobs",
 * SavedWorkers' jump into Discover, the customer Home's "View map" pill, and
 * all notification routing through the MyJobs tab — must find its route right
 * there on the navigator. Removing a route to remove a bar item would have
 * turned four working taps into crashes.
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
  // postings). A MAGNIFIER, not the compass 4D-1a gave it and not the map pin
  // Map keeps: emerald D1 names the search glyph explicitly, and searching is
  // what the destination underneath (WorkerSearchScreen) actually does.
  { key: 'Discover', label: 'Discover', icons: ['search', 'search-outline'] },
  { key: 'Messages', label: 'Messages', icons: ['chatbubbles', 'chatbubbles-outline'] },
  { key: 'Profile', label: 'Profile', icons: ['person', 'person-outline'] },
];

/** The worker bar — the five classic tabs, unchanged. Its Map is a JOB map and
 *  is correct; emerald D1 touches the customer bar only. */
export const WORKER_BAR_TABS: BottomNavTabKey[] = ['Home', 'Map', 'MyJobs', 'Messages', 'Profile'];

/**
 * The customer bar — FOUR destinations plus D4's creation ACTION, drawn as the
 * five slots emerald D1 specifies: `Home · Discover · [ + ] · Messages ·
 * Profile`.
 *
 * Two operator reversals live in this one line, both deliberate:
 *   - **My Jobs left the customer bar.** The screen, its route and every
 *     navigation to it are untouched — only the bar ITEM is gone. The customer
 *     reaches it through the [ + ] sheet's "My jobs" action, and the route
 *     stays registered (hidden) on the tab navigator so notification routing
 *     and every cross-tab jump still resolve. tests/mode.test.mjs asserts both
 *     halves of that.
 *   - **Map became Discover**, reversing decision 4 / manifest B-2's "Map,
 *     never Discover". Label, glyph AND destination: the slot now points at
 *     the customer's own browse surface (the Discover stack, rooted at
 *     WorkerSearchScreen) rather than the shared job map. Map itself stays
 *     REGISTERED and hidden — the customer Home's "View map" pill dispatches
 *     it, so removing the route would break that tap.
 */
export const CUSTOMER_BAR_TABS: BottomNavTabKey[] = ['Home', 'Discover', 'Messages', 'Profile'];

/** Where the [ + ] sits in CUSTOMER_BAR_TABS — after Discover, before
 *  Messages, so it lands dead centre of the five slots the customer bar
 *  actually draws. */
export const CUSTOMER_CREATE_SLOT = 2;

const TAB_BY_KEY = new Map(BOTTOM_NAV_TABS.map((tab) => [tab.key as string, tab]));

// Bottom tab bar sizing. @react-navigation/bottom-tabs 7.18.3 (the version
// installed here) bakes in — with nothing overriding them — a 25px icon
// (ICON_SIZE_ROUND in its TabBarIcon.js), a 10px label (labelBeneath in
// BottomTabItem.js), and a 49px bar content height (TABBAR_HEIGHT_UIKIT in
// BottomTabBar.js, before the device's safe-area bottom inset is added on top).
// None of those are exposed as constants to import, so they're reproduced here
// from the installed source rather than guessed.
//
// Icon and label are deliberate design sizes. emerald D3 sets them EXPLICITLY
// at 28pt and ~11pt, and those numbers are followed verbatim.
//
// RECORD THE DIRECTION, because the instruction and the effect disagree: D3 is
// headed "NAV ICONS: LARGER", but the values here were already 29/12 — a
// previous run had scaled them up from @react-navigation/bottom-tabs' own
// defaults (25pt icon, 10pt label). So 28/11 is a 1pt REDUCTION from what
// shipped, not an increase. It is applied anyway: an explicit number in the
// dispatch outranks the adjective in its heading, and 1pt at glyph size is
// imperceptible. What actually delivers D3's "larger and evenly spaced" is the
// slot arithmetic, not the glyph: emerald D1 took the customer bar from six
// drawn slots to five, so on the narrowest supported width (320pt) each slot
// went from 49.3pt to 59.2pt — a real 20% more room per item.
const TAB_ICON_SIZE = 28;
const TAB_LABEL_FONT_SIZE = 11;

// BottomTabItem.js's tabVerticalUiKit style wraps whatever tabBarIcon renders
// in 5px of padding on every side — not overridable — so the usable slot is
// always TAB_BAR_CONTENT_HEIGHT - 10. The stacked content below needs:
//
//   icon glyph box   31   (Ionicons renders in a Text box ~size + 3, NOT 28)
//   label            15   (marginTop 2 + lineHeight 13)
//   paddingBottom     3   (TAB_BOTTOM_GAP)
//   ------------------------
//   total            49
//
// so the slot must be >= 49, i.e. the bar >= 59. D3 says the pill grows in
// height only as much as needed for the labels not to clip; at 28/11 nothing
// is needed, so the height does NOT move. 70 leaves deliberate slack:
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
// The number itself lives in ui/tokens.ts as layout.floatingNavHeight, so the
// bar and every screen that has to clear it read ONE value (emerald(3)). This
// export stays because the bar's own arithmetic and the catalog are written in
// terms of it.
export const TAB_BAR_CONTENT_HEIGHT = layout.floatingNavHeight;
const TAB_ICON_WRAPPER_HEIGHT = TAB_BAR_CONTENT_HEIGHT - 10;
const TAB_BOTTOM_GAP = 3;

// The pill's float gap (Prestige 0d, decision 4). Horizontally it is the
// pill's inset from the screen edges; vertically it is the MINIMUM gap under
// the pill. On a notched device the bottom margin grows to the full reported
// inset (34) so the pill floats clear of the home indicator — the indicator
// lives in the background gap now, never inside the bar, which retires the
// docked era's fold-the-inset-into-the-height arithmetic.
export const TAB_BAR_FLOAT_MARGIN = layout.floatingNavGap;

// Bar colours come from the RESOLVED palette (4D-4): bottomNavScreenOptions
// takes it as a parameter so it stays a plain function the catalog can call,
// and the trees pass the palette from useThemeColors — so the bar repaints on
// a theme change. Both palettes keep the background OPAQUE (surface), which is
// what keeps the well-known Android transparent-background + elevation
// black-rectangle bug structurally impossible — the elevation:0 override below
// still accompanies it, exactly as before. Prestige 0d (decision 4): the
// active tint is `emerald` with a soft glow in dark, the inactive tint is the
// §I `navInactive`, and the pill's hairline is the ordinary border — in dark
// that token IS the dim-gold hairline.
//
// -------------------------------------------------------------------------
// emerald D2 — THE WHITE BAND BEHIND THE PILL. What was actually painting it.
// -------------------------------------------------------------------------
// The operator photographed a white ground around the floating pill in dark
// mode. Every layer between the pill and the screen was audited, in both
// trees, against the INSTALLED @react-navigation sources:
//
//   tabBarStyle.backgroundColor      palette.surface  — this IS the pill. Kept:
//                                    it is the one painted surface by design.
//   options.tabBarBackground         NOT SET. BottomTabBar.tsx therefore falls
//                                    back to `colors.card`, which tabBarStyle
//                                    (merged last) already overrides. No
//                                    second ground exists.
//   BottomTabView's container        SafeAreaProviderCompat — `{ flex: 1 }`
//                                    plus a flexDirection. PAINTS NOTHING.
//   App.tsx LaunchGate root View     `{ flex: 1 }`. PAINTS NOTHING.
//   App.tsx outer SafeAreaProvider   no style. PAINTS NOTHING.
//   NavigationContainer theme        DOES reach the SCENES — @react-navigation/
//                                    elements' <Background> paints
//                                    colors.background inside <Screen> — but
//                                    the bar is a SIBLING of the scene
//                                    container, so the theme never reached the
//                                    bar row at all.
//
// So the answer is that NOTHING OF OURS was painting it. The pill floats by
// margins in normal layout flow, and every ancestor of that margin gap was
// transparent, so what showed through was the iOS root view — white by
// platform default. There was no layer to turn transparent; there was a
// missing ground. It is invisible in light (white on cream reads as a seam,
// not a band) and glaring in dark, which is exactly how it reached a dark
// device pass having survived every light one.
//
// THE FIX LIVES IN navigation/ModeShell.tsx, not here: it is the single parent
// of both trees, it already resolves the palette, and painting it covers the
// bar gap, the status-bar area and every other unpainted seam in one place.
// This file deliberately did NOT grow a second ground of its own.

/** Total vertical space the floating pill occupies on a device reporting this
 *  bottom inset — the pill's height plus the margin that floats it. */
export function bottomNavHeight(insetBottom: number): number {
  return TAB_BAR_CONTENT_HEIGHT + Math.max(insetBottom, TAB_BAR_FLOAT_MARGIN);
}

/**
 * The bottom inset a scrolling surface inside the tab navigator must reserve
 * so its last row clears the floating pill — emerald(3)'s ONE shared solution.
 *
 * WHY A HOOK AND NOT A TOKEN. It used to be `layout.floatingNavClearance`, a
 * flat 68 from §I. The pill's real footprint is its HEIGHT plus the margin that
 * floats it, and that margin grows to the device's home-indicator inset — 34 on
 * a notched iPhone — so the true figure is 82 on a phone with no inset and 104
 * on one with. 68 was short of it on every notched device, which is exactly why
 * the surfaces that DID apply the old token (Notifications, Services &
 * availability, Delete account) still had content under the pill on the device
 * pass, while the ones that applied nothing at all were simply worse. A static
 * token cannot see the inset; this can.
 *
 * Derived from the bar's own two constants, so emerald(2)'s height change — or
 * any future one — moves the screens with it and cannot desynchronise them.
 *
 * Surfaces with their own bottom action footer or composer do NOT put this on
 * their scroll content: the footer sits below the scroller, so it is the FOOTER
 * that has to clear the pill, and the content then clears both.
 */
export function useFloatingNavClearance(): number {
  const insets = useSafeAreaInsets();
  return bottomNavHeight(insets.bottom);
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
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const tab = TAB_BY_KEY.get(routeName);
  const [active, inactive] = tab?.icons ?? (['ellipse', 'ellipse-outline'] as const);
  const label = tab?.label ?? routeName;
  // Decision 4: the active glyph and label glow softly. A dark-Prestige
  // treatment — light keeps its flat Heritage bar; the shape lives at token
  // level (glow.text), only the colour is resolved here.
  const activeGlow = focused && isDark ? glow.text(withAlpha(colors.emerald, 0.55)) : null;

  return (
    <View style={styles.tabItemContent}>
      <Ionicons
        name={focused ? active : inactive}
        size={TAB_ICON_SIZE}
        color={color}
        style={activeGlow}
      />
      <Text
        style={[styles.tabItemLabel, { color, fontWeight: focused ? '700' : '500' }, activeGlow]}
        numberOfLines={1}
        // D3: no label may clip or truncate. The slot is wide enough for
        // "Messages" and "Discover" at 11pt down to a 320pt screen, but an
        // accessibility text size can still overrun it, and numberOfLines={1}
        // turns that into an ellipsis rather than a wrap. Capping the scale is
        // the standard iOS tab-bar treatment and the only option here that
        // keeps every label whole.
        maxFontSizeMultiplier={1.2}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The Tab.Navigator `screenOptions` both trees use — identical configuration
 * in customer and worker mode, so the chrome cannot drift between modes.
 *
 * `insetBottom` is passed in rather than read from a hook here so this stays a
 * plain function the catalog can also call.
 */
export function bottomNavScreenOptions(insetBottom: number, palette: ColorPalette) {
  // The floating pill (Prestige 0d). The bar stays in normal layout flow —
  // BottomTabView lays scenes and bar in one column — so these MARGINS reserve
  // real space and no screen content can slide beneath the pill; nothing here
  // is absolutely positioned. The home indicator lives in the bottom gap: the
  // margin grows to the full reported inset on a notched device.
  const bottomMargin = Math.max(insetBottom, TAB_BAR_FLOAT_MARGIN);

  return ({ route }: { route: { name: string } }): BottomTabNavigationOptions => ({
    headerShown: false,
    // Decision 4 — the ONE active rule that replaced the masters' five
    // competing treatments (manifest B-1): emerald active, navInactive rest.
    tabBarActiveTintColor: palette.emerald,
    tabBarInactiveTintColor: palette.navInactive,
    tabBarShowLabel: false,
    tabBarIcon: ({ focused, color }) => (
      <BottomNavItem routeName={route.name} focused={focused} color={color} />
    ),
    // Wraps the whole icon+label block (see tabItemContent), not just the icon
    // — width:'100%' so longer labels like "Messages" have the full tab column
    // to lay out in, instead of the library's default 31px-wide icon-only box.
    tabBarIconStyle: { width: '100%', height: TAB_ICON_WRAPPER_HEIGHT },
    tabBarStyle: {
      // getTabBarHeight() (bottom-tabs internals) uses a custom height
      // VERBATIM; the safe-area inset now lives in the float margin, not the
      // height, so the content slot arithmetic above stays exact.
      height: TAB_BAR_CONTENT_HEIGHT,
      marginHorizontal: TAB_BAR_FLOAT_MARGIN,
      marginBottom: bottomMargin,
      borderRadius: radius.xl,
      borderWidth: 1,
      // BottomTabBar.tsx sets `borderTopWidth: StyleSheet.hairlineWidth` on its
      // own style, BEFORE tabBarStyle is merged. A specific edge width beats
      // the borderWidth shorthand, so the pill's top edge was drawing at 0.5
      // while its other three drew at 1 — a visibly lighter arc across the top
      // of a rounded pill. Restated explicitly so the ring is one weight.
      borderTopWidth: 1,
      // In dark this token IS the dim-gold hairline; light keeps its Heritage
      // hairline. borderTopColor rides along because the library's base style
      // sets it and a mismatched top edge would show on the rounded pill.
      borderColor: palette.border,
      borderTopColor: palette.border,
      backgroundColor: palette.surface,
      // Kills BottomTabBar.js's own `paddingBottom: insets.bottom` (tabBarStyle
      // is merged last) — the float margin owns the home-indicator clearance.
      paddingBottom: 0,
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
 * The customer tree uses this for the two destinations emerald D1 took off its
 * bar — `Map` and `MyJobs`. Both are still dispatched by live code
 * (HomeScreen's "View map" pill via getParent(), the [ + ] sheet's "My jobs",
 * and every notification whose TAB_FOR_SCREEN entry is MyJobs), and all of
 * those are untargeted NAVIGATEs handled by the tab navigator itself, which
 * React Navigation 7 never forwards down into child navigators. So the routes
 * must stay registered on the navigator even though the bar draws no item for
 * them. Discover was hidden this way before D1 and is now the visible slot.
 */
export const HIDDEN_TAB_ITEM_OPTIONS: BottomTabNavigationOptions = {
  tabBarItemStyle: { display: 'none' },
};

/**
 * The customer creation slot (D3, kept by emerald D4): a raised disc between
 * Discover and Messages that OPENS A SHEET rather than navigating.
 *
 * The gold is LINE-WORK — a gold ring and a gold glyph on the deep-green
 * conversion fill — not a gold fill. Decision 3 forbids gold fills and
 * tests/goldOnForest.test.mjs enforces it tree-wide; the same resolution
 * prestige(4b) reached for the timeline connector, and the shape the set
 * already uses for a circular gold control (master 1's inset arrow, 19's send
 * button, 46's back squircle). One rule in both themes: gold on forest is
 * correct in both under palette v2.
 */
export function CenterCreateButton({ onPress }: { onPress: () => void }) {
  const { palette: colors } = useThemeColors();
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
        <Ionicons name="add" size={32} color={colors.gold} />
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
  /** Draw D3's customer [ + ] at CUSTOMER_CREATE_SLOT. */
  showCreateAction?: boolean;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const bottomMargin = Math.max(insetBottom, TAB_BAR_FLOAT_MARGIN);

  // A flat item list keeps every slot an equal flex column, exactly like the
  // real bar, where the action is one more Tab.Screen with its own button.
  const items: Array<{ kind: 'tab'; key: BottomNavTabKey } | { kind: 'create' }> = [];
  tabs.forEach((key, index) => {
    if (showCreateAction && index === CUSTOMER_CREATE_SLOT) items.push({ kind: 'create' });
    items.push({ kind: 'tab', key });
  });

  return (
    <View
      style={[styles.previewBar, { height: TAB_BAR_CONTENT_HEIGHT, marginBottom: bottomMargin }]}
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
              color={item.key === activeKey ? colors.emerald : colors.navInactive}
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
  createSlot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: TAB_BOTTOM_GAP,
  },
  createButton: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    // The one solid conversion fill, ringed in gold — gold is line-work here,
    // never the fill (decision 3, enforced by tests/goldOnForest.test.mjs).
    backgroundColor: colors.forest,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    // Raised above the pill. iOS is the target (CLAUDE.md: Android deferred);
    // the slice above the bar's bounds still draws because the library's item
    // wrapper keeps overflow visible for the uikit variant.
    transform: [{ translateY: -14 }],
    // The button's own depth. It is an OPAQUE fill, so this elevation cannot
    // trigger the transparent-background Android rendering bug the bar's own
    // elevation:0 exists to avoid — and the bar's style is untouched.
    shadowColor: colors.black,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  createButtonPressed: { opacity: 0.88, transform: [{ translateY: -14 }, { scale: 0.96 }] },
  previewBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: TAB_BAR_FLOAT_MARGIN,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewItem: {
    flex: 1,
    // Matches BottomTabItem.js's non-overridable 5px padding on every side.
    padding: 5,
    height: TAB_ICON_WRAPPER_HEIGHT + 10,
  },
  }),
);
