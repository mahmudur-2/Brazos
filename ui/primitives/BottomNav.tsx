import { useContext, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { NavigationRouteContext, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { glow, layout, spacing, themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../../lib/theme';
import { navBar } from '../tokens';
import { tap } from '../../lib/haptics';
import {
  getOverrideValue,
  useDesignOverrides,
  useOverrideFingerprint,
  useOverrideNumber,
  useOverrideString,
} from '../../lib/designOverrides';
import { useNavInset } from '../../hooks/useNavInset';
import { litFill } from './LitSurface';
import { Surface } from './Surface';

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
 * SavedWorkers' jump into Discover, and all notification routing through the
 * MyJobs tab — must find its route right there on the navigator. Removing a
 * route to remove a bar item would have turned working taps into crashes.
 *
 * home(9) removed the customer Home's "View map" pill, which used to be the
 * fourth of those dispatches. Map's REGISTRATION did not go with it: an
 * unreferenced hidden route costs one entry, while un-registering it is what
 * makes the next customer-side dispatch throw.
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
  // RUN H2 — LABEL and GLYPH only. The KEY stays 'Messages': it is the route
  // name both trees register and every cross-tab jump and notification route
  // resolves against, so renaming it would be a navigation change wearing a
  // copy change's clothes. The glyph becomes the three-dot bubble — a message
  // with something in it, rather than two empty bubbles.
  { key: 'Messages', label: 'Inbox', icons: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'] },
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
 *     REGISTERED and hidden. home(9) then took the customer's last link to it
 *     — Home's "View map" pill — and left the registration standing, because
 *     the route is the thing a future dispatch needs, not the pill.
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
// Icon and label are deliberate design sizes. emerald D3 set them EXPLICITLY
// at 28pt and ~11pt; RUN PJ1 (C9) scales both in proportion with the bar's
// 25% content-height rise (70 → 88): 28 × 1.25 = 35 and 11 × 1.25 = 13.75,
// rounded to 14. RUN S2 (C6): the two numbers are TOKENS now — ui/tokens.ts
// `navBar.iconSize` / `navBar.labelFontSize` — read live through the design
// studio's override layer ('nav.iconSize' / 'nav.labelSize' dials), and the
// old literals are fenced against returning here (tests/layout.test.mjs).
// The stack-fit arithmetic and its fence derive from the tokens, so a size
// that overflows the slot still fails there instead of clipping on device.

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

// RUN PJ1 (C9) — the bar is ATTACHED: flush to the bottom edge, full width,
// no side insets, with the home-indicator inset folded INSIDE the bar as
// bottom padding (the docked arithmetic the floating era retired, returned
// on confirmed operator decision — this reverses the floating pill, 56ff86a).
// This constant survives as the design QUANTITY the float gap named — the
// breathing room a pinned footer keeps above the bar
// (PINNED_FOOTER_BOTTOM_PADDING below) — and is no longer any margin of the
// bar's own.
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

/** The bar's STATIC no-dial footprint on a device reporting this bottom
 *  inset — content height plus the whole inset (PJ1 C9). Since G1 (C4/C6)
 *  the LIVE bar carries navBottomPad instead of the raw inset and the live
 *  clearance is hooks/useNavInset.ts; this arithmetic equals that hook's
 *  answer whenever no studio dial is set, and the motion model still reads
 *  it as the in-flow bar's reserved box. */
export function bottomNavHeight(insetBottom: number): number {
  return TAB_BAR_CONTENT_HEIGHT + insetBottom;
}

/**
 * The bottom inset a scrolling surface inside the tab navigator must reserve
 * so its last row clears the bar — emerald(3)'s ONE shared solution.
 *
 * WHY A HOOK AND NOT A TOKEN. It used to be `layout.floatingNavClearance`, a
 * flat 68 from §I, which could not see the device's home-indicator inset. The
 * attached bar's real footprint (PJ1 C9) is its content height plus the inset
 * it carries inside — 88 on a phone with no inset, 122 on a notched iPhone —
 * and a static token cannot see a runtime inset; this can.
 *
 * Derived from the bar's own geometry, so a height change — C9's included —
 * moves the screens with it and cannot desynchronise them.
 *
 * Surfaces with their own bottom action footer or composer do NOT put this on
 * their scroll content: the footer sits below the scroller, so it is the FOOTER
 * that has to clear the bar, and the content then clears both.
 *
 * RUN G1 (C6): the implementation IS hooks/useNavInset.ts — bar content
 * height + the live navBottomPad + the safe-area remainder, reading the same
 * studio override the bar reads, so one dial moves the bar and every
 * clearance at once. With no dial set the answer is exactly what this hook
 * has always returned (content + inset).
 */
export function useFloatingNavClearance(): number {
  return useNavInset();
}

/**
 * 2026-09-21 — WHAT A SCROLLING SURFACE PADS ITS END WITH, by where it is.
 *
 * THE DOUBLE COUNT, THE SECOND TIME. `useFloatingNavClearance()` reserves the
 * bar's whole footprint (~104pt on a notched iPhone) under scrolling content,
 * which was right when the bar floated over every screen. Since RUN G1 (C3)
 * the bar is out of the layout flow on the TWO HOMES ONLY (`isAtmosphereHome-
 * Route`, `position: 'absolute'`); everywhere else it is laid out IN the tab
 * row beneath the screen, so the scroller already ends at the bar's top edge
 * and the footprint padding sat on top of that as a hand's width of dead
 * space — the operator's finding on Available Jobs (docs/DECISIONS.md
 * 2026-09-20 sitting 2, (10): "the list ends 16pt above the bar").
 *
 * So the answer is by ROUTE: on a home, the bar's footprint (the content does
 * pass under it there); anywhere else, one ordinary spacing step. The route
 * is read from `NavigationRouteContext` directly rather than `useRoute()`, so
 * a surface rendered outside a navigator (the catalog, a fixture) gets the
 * small padding instead of a throw. `spacing.lg` is read at use time, like
 * every metric, so the studio's spacing dial still moves it.
 *
 * `useFloatingNavClearance()` is untouched: chat's keyboard rise subtracts
 * the footprint and the design studio's panel sits over it — those two want
 * the bar's real box, not a scroller's padding.
 */
export function useScrollClearance(): number {
  const route = useContext(NavigationRouteContext);
  const inset = useNavInset();
  return route && ATMOSPHERE_HOME_ROUTES.has(route.name) ? inset : spacing.lg;
}

/**
 * What a PINNED footer takes instead of the clearance above (home(7)).
 *
 * THE DOUBLE COUNT. `useFloatingNavClearance()` exists so SCROLLING content can
 * pass under the pill and still be readable at the end of its travel. A pinned
 * action footer does not travel: it is laid out above the bar, permanently. It
 * was being given the pill's whole footprint anyway — 70pt of bar plus the
 * home-indicator inset, ~104pt on a notched iPhone — as padding UNDER its own
 * button. That reserved the pill's space twice: once by the bar's real layout
 * box, and again inside the footer, which is what put a hand's width of empty
 * chrome under every Continue, Publish job and Cash out button.
 *
 * WHAT REPLACES IT is not a smaller guess at the same thing; it is a different
 * quantity — the footer's own breathing room. `floatingNavGap` is already
 * defined as exactly this distance (see its docblock in ui/tokens.ts: "a
 * bottom action footer or composer uses it as extra bottom padding so its
 * controls keep the same distance from the pill that the pill keeps from the
 * screen edge"), so the button ends up as far from the pill's top edge as the
 * pill sits from the screen's. Derived, like everything else here — nothing
 * about the bar is restated as a literal.
 *
 * The clearance hook is untouched and every scrolling surface still uses it.
 */
export const PINNED_FOOTER_BOTTOM_PADDING = layout.floatingNavGap;

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
  // G1 (C4): the studio's glow dial, when set, replaces the standing alpha.
  const { glowAlpha } = useDesignOverrides();
  // RUN S2 (C6) — the item dials, each its own primitive subscription. The
  // slot stays flex-driven: offsets are a transform on the CONTENT, so NO
  // per-item X offsets and no per-pair gaps exist — the row's geometry is
  // spread + centre clearance, responsively.
  const iconSize = useOverrideNumber('nav.iconSize') ?? navBar.iconSize;
  const labelSize = useOverrideNumber('nav.labelSize') ?? navBar.labelFontSize;
  const iconLabelGap = useOverrideNumber('nav.iconLabelGap') ?? navBar.iconLabelGap;
  const offsetX = useOverrideNumber('nav.itemOffsetX') ?? 0;
  const offsetY = useOverrideNumber('nav.itemOffsetY') ?? 0;
  const activeColor = useOverrideString('nav.activeColor');
  const inactiveColor = useOverrideString('nav.inactiveColor');
  const activeOpacity = useOverrideNumber('nav.activeOpacity') ?? 1;
  const inactiveOpacity = useOverrideNumber('nav.inactiveOpacity') ?? 1;
  const activeScale = useOverrideNumber('nav.activeScale') ?? 1;
  const tab = TAB_BY_KEY.get(routeName);
  const [active, inactive] = tab?.icons ?? (['ellipse', 'ellipse-outline'] as const);
  const label = tab?.label ?? routeName;
  // RUN N3 (2026-09-08) — THE FOCUSED TINT IS THE BAR'S OWN GREEN IN DARK.
  // `color` is what the library hands down from tabBarActiveTintColor /
  // tabBarInactiveTintColor, i.e. palette.emerald when focused; dark now
  // draws navBar.activeColorDark instead. NARROW ON BOTH AXES: only the
  // FOCUSED item is redirected (the resting ones still take `color`), and
  // only in dark — light falls through to the palette exactly as before, so
  // `dark.emerald` keeps painting every price, Open pill and live mark it
  // painted yesterday. The dial still wins over both.
  const shippedTint = focused && isDark ? navBar.activeColorDark : color;
  const tint = (focused ? activeColor : inactiveColor) ?? shippedTint;
  // Decision 4: the active glyph and label glow softly. A dark-Prestige
  // treatment — light keeps its flat Heritage bar; the shape lives at token
  // level (glow.text), only the colour is resolved here.
  const activeGlow =
    focused && isDark
      ? glow.text(withAlpha(colors.emerald, glowAlpha ?? ACTIVE_TAB_GLOW_ALPHA))
      : null;

  // RUN S3 (D15) — THE SQUARE PATCH AROUND THE FOCUSED GLYPH, AND WHY.
  //
  // `glow.text` is a textShadow, which RN turns into an NSShadow attribute on
  // the attributed string (Libraries/Text/RCTTextAttributes.mm, react-native
  // 0.81.5), and the paragraph view DRAWS that string inside its own
  // drawRect: — into `_layoutMetrics.getContentFrame()`, the box inside
  // padding and border (React/Fabric/.../Text/RCTParagraphComponentView.mm).
  // Drawing lands in the layer's own bounds-sized backing store, so with no
  // padding the contentFrame IS the bounds and an 8pt blur is cut off flat at
  // the glyph box's edge. That hard rectangular cut is the patch the operator
  // photographed — it is not a stray view and not a colour.
  //
  // THE FIX IS A BOX, NOT A DIFFERENT GLOW: pad each glowing Text by exactly
  // the shadow's own radius so the blur has somewhere to land, and take those
  // points straight back out with equal NEGATIVE MARGINS, so the laid-out
  // geometry is byte-identical — the outer box, including margins, is the
  // size it always was, and the glyph sits at the same absolute point inside
  // a larger backing store. The radius is READ from the shape rather than
  // restated, so the two can never drift apart. No ancestor clips it: the
  // library's item wrapper is `overflow: 'visible'` for every variant but
  // 'material' (BottomTabItem.tsx), which this bar is not.
  const bleed = activeGlow?.textShadowRadius ?? 0;
  const glyphGlowBox = bleed ? { padding: bleed, margin: -bleed } : null;
  const labelGlowBox = bleed
    ? {
        padding: bleed,
        // The icon-label gap survives intact: only the bleed comes off it.
        marginTop: iconLabelGap - bleed,
        marginBottom: -bleed,
        marginLeft: -bleed,
        marginRight: -bleed,
      }
    : null;

  // AND THE SECOND HALF: an untouched bar must composite IN PLACE. A non-unit
  // opacity or a transform forces the subtree onto its own offscreen layer,
  // whose edges are exactly where a blur gets cut. These dials are identity
  // until the operator moves them, so at identity they are not declared at
  // all rather than declared as no-ops.
  const dialledOpacity = focused ? activeOpacity : inactiveOpacity;
  const dialledScale = focused ? activeScale : 1;
  const moved = offsetX !== 0 || offsetY !== 0 || dialledScale !== 1;
  const contentDials = {
    ...(dialledOpacity !== 1 ? { opacity: dialledOpacity } : null),
    ...(moved
      ? {
          transform: [
            { translateX: offsetX },
            { translateY: offsetY },
            { scale: dialledScale },
          ],
        }
      : null),
  };

  return (
    <View style={[styles.tabItemContent, contentDials]}>
      <Ionicons
        name={focused ? active : inactive}
        size={iconSize}
        color={tint}
        style={[activeGlow, glyphGlowBox]}
      />
      <Text
        style={[
          styles.tabItemLabel,
          {
            color: tint,
            fontWeight: focused ? '700' : '500',
            fontSize: labelSize,
            lineHeight: labelSize + 2,
            marginTop: iconLabelGap,
          },
          activeGlow,
          labelGlowBox,
        ]}
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
 * `navBottomPad` — the bar's resolved bottom padding (G1 C4's flush formula,
 * or the studio dial; hooks/useNavInset.ts owns the arithmetic) — is passed
 * in rather than read from a hook here so this stays a plain function the
 * catalog can also call.
 */
/**
 * RUN GROUND1 (C3) — THE TWO ROUTES THE PILL ACTUALLY FLOATS OVER.
 *
 * Both trees name their first tab `Home`; the screen under it is `HomeMain` in
 * navigation/CustomerRoot.tsx and `WorkerHome` in navigation/WorkerRoot.tsx.
 * Those two are the only screens that mount components/HomeAtmosphere.tsx, and
 * they are the only two this changes anything for.
 *
 * WHY THE LEAF AND NOT THE TAB. `Home` is a STACK, so PostJob, WorkerSearch,
 * JobDetail and six more sit under the same tab route. Scoping to the tab
 * would give all of them a bar that is out of layout flow, which is a change
 * to how their ground reaches the bar row — and C3 is explicit that every
 * screen but the two homes behaves exactly as it did.
 * `getFocusedRouteNameFromRoute` is React Navigation's own answer to this
 * question and returns undefined until the nested navigator has state of its
 * own, which is the initial route — the home screen in both trees.
 */
const ATMOSPHERE_HOME_ROUTES = new Set(['HomeMain', 'WorkerHome']);

/** True only while one of those two screens is the focused leaf of this tab. */
export function isAtmosphereHomeRoute(route: { name: string }): boolean {
  const leaf = getFocusedRouteNameFromRoute(route);
  return route.name === 'Home' && (leaf === undefined || ATMOSPHERE_HOME_ROUTES.has(leaf));
}

/**
 * RUN G1 (C4) — the active tab's glow strength: the 0.55 the bar has always
 * glowed at, now named so the design studio's glow dial can replace it live.
 */
const ACTIVE_TAB_GLOW_ALPHA = 0.55;

/**
 * RUN G1 (C4) — the bar's chrome. A component rather than an inline element
 * so the studio's nav-radius dial is read as a hook and repaints the bar
 * live. The material owns the bar's fill AND its one edge, the top hairline;
 * `radius` rounds the top corners only when the dial asks (launch value 0:
 * square, flush).
 */
function NavChrome() {
  const { navRadius } = useDesignOverrides();
  return (
    <Surface
      material="chrome"
      border="top"
      corners="top"
      radius={navRadius ?? 0}
      style={StyleSheet.absoluteFill}
    />
  );
}

/**
 * RUN G1 (C4) — tab presses acknowledge with the light haptic tap. HAPTICS
 * ONLY, pinned to exactly this shape by tests/mode.test.mjs: no navigation,
 * no preventDefault, no mode logic — the mode-inference listener that fence
 * buried cannot come back through this object.
 */
export const bottomNavScreenListeners = {
  tabPress: () => {
    tap();
  },
} as const;

/**
 * RUN S2 (C6) — the bar-container dials the screenOptions factory reads.
 * `bottomNavScreenOptions` is a plain function (the catalog calls it), so it
 * cannot subscribe; the TREES subscribe through `useNavBarContainerDials()`
 * below and re-render, and the factory reads the store fresh on every call.
 */
const NAV_CONTAINER_DIAL_KEYS = [
  'nav.barHeight',
  'nav.padTop',
  'nav.padLeft',
  'nav.padRight',
  'nav.spread',
] as const;

/** Subscribes a tree to the bar-container dials — the returned fingerprint
 *  only exists to change when one of them does. */
export function useNavBarContainerDials(): string {
  return useOverrideFingerprint(NAV_CONTAINER_DIAL_KEYS);
}

/** A numeric bag dial, read non-reactively (the trees re-render for us). */
function dialNumber(key: string, fallback: number): number {
  const value = getOverrideValue(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function bottomNavScreenOptions(navBottomPad: number, palette: ColorPalette) {
  // RUN PJ1 (C9) — THE ATTACHED BAR. Flush to the bottom edge, full screen
  // width, no side insets and no float gap. RUN G1 (C4), THE FLUSH FIX: the
  // padding the bar carries inside is no longer the whole home-indicator
  // inset — the operator's direct complaint was that the row sat too high —
  // but max(inset − 16, 6), or the studio dial when set (the formula lives
  // in hooks/useNavInset.ts). This reverses the floating pill (RUN GROUND1 /
  // 56ff86a) on confirmed operator decision.
  //
  // IN FLOW EVERYWHERE EXCEPT THE TWO HOMES (RUN GROUND1, C3). BottomTabView
  // lays scenes and bar out in one column, so an in-flow bar reserves real
  // space and the scene stops above it. The two home routes still take the
  // bar OUT of flow so their full-bleed atmosphere reaches the screen's
  // bottom edge behind it, and they reserve the bar's box themselves with
  // useFloatingNavClearance() — the derived hook, never a static token. The
  // attached geometry is identical in both branches (`bottom: 0` on a
  // flush bar is where the column puts it anyway).

  return ({ route }: { route: { name: string } }): BottomTabNavigationOptions => {
    // S2 (C6): the container dials — content height, per-side padding, and
    // the symmetric spread that compresses the flex slots toward centre.
    const barHeight = dialNumber('nav.barHeight', TAB_BAR_CONTENT_HEIGHT);
    const spread = dialNumber('nav.spread', 0);
    return {
    headerShown: false,
    // RUN G1 (C4) — THE BAR WEARS CHROME. BottomTabBar.js renders this
    // element inside a pointerEvents="none" absoluteFill view under every tab
    // item, and with tabBarBackground set the library's own container paints
    // transparent — so the chrome Surface is the bar row's ONE painted layer.
    // Light renders the solid theme surface with the ordinary hairline (the
    // bar as it has always looked); dark wears the chrome material — scrim,
    // blur through lib/blur.tsx, mint hairline — and falls back to scrim-only
    // on web and under Reduce Transparency, so the harness render stays
    // meaningful and a binary without expo-blur shows a solid bar, never a
    // hole.
    tabBarBackground: () => <NavChrome />,
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
    tabBarIconStyle: { width: '100%', height: barHeight - 10 },
    tabBarStyle: {
      // getTabBarHeight() (bottom-tabs internals) uses a custom height
      // VERBATIM. G1 (C4): the box is content + navBottomPad — the flush
      // formula's pad or the studio dial, resolved by the trees — restated
      // explicitly so the item slots stay the content height whatever the
      // library's default does. S2 (C6): the content height is the
      // 'nav.barHeight' dial, defaulting to the token.
      height: barHeight + navBottomPad,
      paddingBottom: navBottomPad,
      paddingTop: dialNumber('nav.padTop', 0),
      paddingLeft: dialNumber('nav.padLeft', 0) + spread,
      paddingRight: dialNumber('nav.padRight', 0) + spread,
      // Full width, flush: no side margins, no bottom gap, no rounded pill.
      marginHorizontal: 0,
      marginBottom: 0,
      borderRadius: 0,
      borderWidth: 0,
      // BottomTabBar.tsx sets `borderTopWidth: StyleSheet.hairlineWidth` on
      // its own style, BEFORE tabBarStyle is merged; ZEROED here (G1 C4)
      // because the bar's ONE edge — the top hairline — is the chrome
      // material's now: mint on dark glass, the ordinary border in light,
      // drawn by the Surface so there are never two lines. No background
      // either: with tabBarBackground set the library's container goes
      // transparent, and the chrome is the one painted layer.
      borderTopWidth: 0,
      elevation: 0,
      // C3: out of flow on the two homes only. tabBarStyle is the LAST entry
      // in BottomTabBar.js's style array, so this wins over the library's own
      // conditional `position`, and the three offsets are needed because Yoga
      // gives an absolutely positioned child no implicit ones.
      ...(isAtmosphereHomeRoute(route)
        ? ({ position: 'absolute', left: 0, right: 0, bottom: 0 } as const)
        : null),
    },
    };
  };
}

/**
 * Registration options for a tab that must stay DISPATCHABLE but must not
 * appear in the bar. `display: 'none'` on the item's outer wrapper removes it
 * from the bar's layout entirely (no phantom flex slot — verified against the
 * installed @react-navigation/bottom-tabs 7.18.3 BottomTabBar.js, which merges
 * `tabBarItemStyle` onto each item's container).
 *
 * The customer tree uses this for the two destinations emerald D1 took off its
 * bar — `Map` and `MyJobs`. MyJobs is still dispatched by live code (the [ + ]
 * sheet's "My jobs", and every notification whose TAB_FOR_SCREEN entry is
 * MyJobs); those are untargeted NAVIGATEs handled by the tab navigator itself,
 * which React Navigation 7 never forwards down into child navigators, so the
 * route must stay registered even though the bar draws no item for it.
 *
 * Map has no customer-side caller left after home(9) took Home's "View map"
 * pill, and it stays registered regardless — hidden-but-registered is the
 * cheap state, and the expensive one is discovering the route is missing from
 * inside a crash. The WORKER tree draws Map as a real, visible tab and is
 * untouched by any of this. Discover was hidden this way before D1 and is now
 * the visible slot.
 */
export const HIDDEN_TAB_ITEM_OPTIONS: BottomTabNavigationOptions = {
  tabBarItemStyle: { display: 'none' },
};

/**
 * home(8) — THE CENTRE [ + ] WAS A FILLED GOLD CONTROL IN DARK, AND IS NOT ANY
 * MORE (2026-09-17). The record is kept because the gold was itself a reversal
 * and the next reader has to be able to see both moves.
 *
 * home(8) reversed decision 3's "no gold fills anywhere" for exactly this one
 * control, on operator instruction: a gold glyph and a gold ring on the
 * deep-green conversion fill became palette gold, filled, with dark content.
 * RUN N3 then moved that fill to the control's own warmer `navBar.gold`.
 *
 * 2026-09-17 REVERSES THE GOLD, on operator instruction, and hands this
 * control the SAME RECIPE the dark "Post a job" pill already draws —
 * `postPillGreen` under ui/primitives/LitSurface.tsx's lit wash, with no
 * highlight edge, no ring at all, and the app's cream as the glyph. The two
 * controls are now identical BY CONSTRUCTION rather than by two descriptions
 * agreeing, which is the whole point of taking the recipe instead of a colour:
 * no new hue enters the app and the screen's one conversion control and the
 * bar's one creation control cannot drift apart.
 *
 * WHAT THAT MEANS FOR tests/goldOnForest.test.mjs: the tree now has no gold
 * FILL in this file at all, so the exception that file recorded for
 * `createButtonDark` is deleted rather than left standing — its own deepEqual
 * treats a stale exception as a failure, which is why that is the correct
 * move and not a loosening.
 *
 * LIGHT IS UNTOUCHED, in every respect — fill, ring, glyph and glow. `flat:
 * !isDark` is what makes that true by construction: litFill returns
 * `undefined` in light, which React Native drops from a style array, so there
 * is no key, no node and no pixel.
 *
 * SIZE IS A SHARE OF THE PILL — see home(18) below. Home parity 2026-08-22:
 * light shares dark's whole geometry (size, centring, inset) and keeps only
 * its colours — the forest fill and the gold ring.
 *
 * THE BAR'S FOOTPRINT DOES NOT MOVE. The pill's height is
 * TAB_BAR_CONTENT_HEIGHT, a constant; this control lives inside a flex item of
 * fixed height and is raised by a TRANSFORM, which Yoga does not lay out. So
 * bottomNavHeight() and useFloatingNavClearance() are arithmetically untouched
 * by this change, and no clearance needed re-deriving — see the fence in
 * tests/layout.test.mjs.
 */
/**
 * home(18) — THE CONTROL IS A SHARE OF THE PILL, AND home(8) WAS THE WRONG
 * DENOMINATOR. This deliberately REVERSES home(8)'s overhang, on operator
 * instruction, and the reason is arithmetic rather than taste: the pill's
 * height is `layout.floatingNavHeight`, a CONSTANT. A control sized off the
 * SCREEN therefore changes its relationship to the pill on every device — on a
 * 320pt phone 0.149 gave 48 in a 70pt pill and on a 440pt one it gave 66 — and
 * a control that has to sit INSIDE something must be measured against that
 * something. At 393pt it resolved to 59, and the -14 lift then carried its top
 * edge 6pt out through the pill's own hairline.
 *
 * 0.857 is 60 in a 70pt pill: 85.7% of its height, inside the 85-88% the
 * dispatch specifies, with 5pt of clearance top and bottom. Master 44 draws no
 * [ + ] at all — its bar is the five classic tabs — so the bound is the
 * authority here and is recorded as such.
 *
 * THE FOOTPRINT STILL DOES NOT MOVE, and now by construction rather than by
 * argument: 60 fits inside the slot's own 67pt of usable height, so Yoga lays
 * it out without overflow and the transform only positions it.
 */
// home(18)'s pill-share ratios and RUN H2's glow dial live in ui/tokens.ts
// (`navBar.createSizeRatio` / `createGlyphRatio` / `createGlowAlpha`) since
// RUN S2 (C6) — the schema registry reads the same defaults the control does.

export function CenterCreateButton({ onPress }: { onPress: () => void }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN S2 (C6) — THE [ + ] IS FULLY INDEPENDENT: size, radius, fill, ring,
  // glow, glyph size/colour/offset are its own dials, inheriting nothing
  // from the tab items. `nav.centerClearance` is the ROW's dial: margins on
  // this flex slot push the neighbouring slots apart responsively.
  const barHeight = useOverrideNumber('nav.barHeight') ?? TAB_BAR_CONTENT_HEIGHT;
  const sizeDial = useOverrideNumber('create.size');
  const radiusDial = useOverrideNumber('create.radius');
  const fillDial = useOverrideString('create.fill');
  const ringDial = useOverrideString('create.border');
  const glowDial = useOverrideNumber('create.glowAlpha');
  const glowColorDial = useOverrideString('create.glowColor');
  const glyphSizeDial = useOverrideNumber('create.glyphSize');
  const glyphColorDial = useOverrideString('create.glyphColor');
  const glyphOffsetX = useOverrideNumber('create.glyphOffsetX') ?? 0;
  const glyphOffsetY = useOverrideNumber('create.glyphOffsetY') ?? 0;
  const centerClearance = useOverrideNumber('nav.centerClearance') ?? 0;

  // Home parity 2026-08-22: ONE geometry in both themes — home(18)'s share of
  // the pill, centred inside it. Light's frozen 52pt square raised 14 above
  // the slot is retired.
  //
  // 2026-08-23 FINISHES THE JOB: light's own COLOURS go too. Both themes now
  // draw the gold tile with the forest ring and the forest glyph, which is why
  // the glyph below is a single palette read rather than a theme ternary.
  //
  // RUN H2 GIVES THE COLOURS BACK PER THEME — the GEOMETRY stays shared, which
  // is the half the parity pass was actually about. Dark keeps its gold tile
  // and takes light's green for the glyph and light's slate for the ring.
  //
  // RUN H3 CHANGES LIGHT'S HALF ONLY, on operator instruction: light still
  // fills with that green, but the glyph is now GOLD and the ring follows it
  // one shade down. Dark is untouched in every respect — same tile, same ring,
  // same glyph — which is why the ternary below still reads
  // `colors.postPillGreen` on the dark side and only the light side moved.
  //
  // The glyph takes `colors.gold` off the RESOLVED palette rather than a
  // constant, because this branch only ever renders in light and light's gold
  // is what was asked for. The ring takes the theme-constant `goldDeep`
  // (ui/tokens.ts `constantAccents`) — one value on both sides of the palette
  // rather than a hex written here or a cross-palette reach.
  const size = sizeDial ?? Math.round(barHeight * navBar.createSizeRatio);
  // The control CENTRES in the pill. The slot packs to flex-end with
  // TAB_BOTTOM_GAP beneath it, so lifting by half the slack minus that gap
  // leaves the same clearance above and below.
  const raise = Math.round((barHeight - size) / 2) - TAB_BOTTOM_GAP;
  // Derived rather than fixed so the plus keeps its proportion inside the
  // control at any size — a fixed 32 would read hollow in the larger box.
  const glyph = glyphSizeDial ?? Math.round(size * navBar.createGlyphRatio);
  // One transform, built once, so the pressed state cannot drop the control on
  // touch-down by forgetting the lift.
  const lift = (pressed: boolean) => ({
    transform: pressed
      ? [{ translateY: -raise }, { scale: 0.96 }]
      : [{ translateY: -raise }],
  });
  // The glow (RUN H2's operator dial, tokenised as navBar.createGlowAlpha and
  // dial-replaceable): glow.halo pins shadowOpacity at 1 on native, so the
  // alpha here is the one dilution. ONE SHAPE, declared once, applied inline in
  // both themes — the depth never forks, only colours do, which is the rule
  // tests/themeTokens.test.mjs enforces tree-wide.
  //
  // 2026-09-17: the glow follows the FILL, as it always has. It was
  // `colors.gold` on both sides of the palette — dark's metal under dark's gold
  // tile, light's under light's green one — and dark's tile is no longer gold,
  // so dark's halo takes the new fill and light's is left exactly as it was.
  // A ternary on the COLOUR only: the shape, the radius and the alpha are one
  // declaration still, so this is a palette translation and not a second depth.
  const halo = glow.halo(
    withAlpha(
      glowColorDial ?? (isDark ? colors.postPillGreen : colors.gold),
      glowDial ?? navBar.createGlowAlpha
    )
  );

  // 2026-09-17 — THE TILE IS LIT, NOT FLAT, AND IT IS THE PILL'S OWN RECIPE.
  //
  // screens/HomeScreen.tsx lights the dark "Post a job" pill with exactly this
  // call — `postPillGreen` as the far stop, the palette's `emerald` as the
  // lift, lit(3)'s solved alpha — and the operator asked for the two controls
  // to be one thing. `highlight: false` is the one difference the operator
  // named: the pill carries a 1pt lighter top edge and this control does not.
  //
  // THE FILL DIAL STAYS LIVE. `create.fill` is the gradient's own far stop
  // rather than a flat colour underneath it, because a gradient whose last
  // stop is opaque paints over whatever `backgroundColor` sits below — so
  // reading the dial here is what keeps turning it doing something. With no
  // dial set this is byte-for-byte the pill's recipe.
  //
  // `flat: !isDark` returns `undefined` in light, which React Native drops
  // from a style array: no key, no node, no pixel. That is what makes "dark
  // only" a fact about the render rather than a claim about the source.
  const litTile = litFill({
    surface: fillDial ?? colors.postPillGreen,
    lift: colors.emerald,
    liftAlpha: navBar.createLiftAlpha,
    highlight: false,
    flat: !isDark,
  });

  return (
    <View style={[styles.createSlot, centerClearance ? { marginHorizontal: centerClearance } : null]}>
      <Pressable
        onPress={() => {
          // G1 (C4): the [ + ] acknowledges like every tab press. Its slot
          // replaces the library's pressable, so the shared tabPress listener
          // never fires here — the tap lives on the control itself.
          tap();
          onPress();
        }}
        style={({ pressed }) => [
          styles.createButton,
          // A TERNARY, not a dark-only override, because the two themes no
          // longer share a fill or a depth: layering a gold glow on top of a
          // black drop shadow would leave both declared, and on web the two
          // resolve through different properties, so "the later one wins" is
          // not a thing that can be relied on. One branch, one depth.
          isDark ? styles.createButtonDark : styles.createButtonLight,
          // The lit wash sits directly on the fill it lights. In light it is
          // `undefined` and this entry costs nothing at all.
          litTile,
          halo,
          { width: size, height: size },
          radiusDial != null ? { borderRadius: radiusDial } : null,
          fillDial ? { backgroundColor: fillDial } : null,
          ringDial ? { borderColor: ringDial } : null,
          pressed && styles.createButtonPressed,
          lift(pressed),
        ]}
        accessibilityRole="button"
        accessibilityLabel="Create"
        accessibilityHint="Post a job, hire someone again, or open your jobs"
      >
        <Ionicons
          name="add"
          size={glyph}
          // 2026-09-17: dark's glyph is the APP'S CREAM — `onForest`, which is
          // the dark palette's ink and the very value the dark "Post a job"
          // pill sets its label in. RUN N3's `navBar.glyphColorDark` was a
          // green for reading against a GOLD tile; the tile is that green now,
          // so the glyph has to be the content colour a green fill takes, and
          // the palette already names it. Referenced, never retyped. Light is
          // byte-identical: its arm is untouched.
          color={glyphColorDial ?? (isDark ? colors.onForest : colors.gold)}
          style={
            glyphOffsetX || glyphOffsetY
              ? { transform: [{ translateX: glyphOffsetX }, { translateY: glyphOffsetY }] }
              : undefined
          }
        />
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

  // A flat item list keeps every slot an equal flex column, exactly like the
  // real bar, where the action is one more Tab.Screen with its own button.
  const items: Array<{ kind: 'tab'; key: BottomNavTabKey } | { kind: 'create' }> = [];
  tabs.forEach((key, index) => {
    if (showCreateAction && index === CUSTOMER_CREATE_SLOT) items.push({ kind: 'create' });
    items.push({ kind: 'tab', key });
  });

  return (
    <View
      // C9 — mirrors the attached bar: content height plus the simulated
      // inset carried inside as bottom padding. G1 (C4): the paint is the
      // same chrome Surface the real bar wears, laid behind the items.
      style={[
        styles.previewBar,
        { height: TAB_BAR_CONTENT_HEIGHT + insetBottom, paddingBottom: insetBottom },
      ]}
      accessibilityRole="tablist"
    >
      <Surface material="chrome" border="top" corners="top" radius={0} style={StyleSheet.absoluteFill} />
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
    // fontWeight, size, lineHeight and the icon gap are set per-render from
    // the nav dials (S2 C6) — see BottomNavItem. Nothing static remains but
    // the role itself.
  },
  createSlot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: TAB_BOTTOM_GAP,
  },
  createButton: {
    // Width/height are supplied at render — one pill-ratio size for both
    // themes since the parity pass (home(18)'s arithmetic).
    //
    // RUN H2 EMPTIES THIS STYLE OF FILL AND RING — those fork per theme now
    // and live in the two branches below. THE DEPTH DOES NOT FORK, and that is
    // deliberate: a theme override that adds, removes or reshapes a shadow
    // makes light a different design rather than the same design in a second
    // palette, which is the rule tests/themeTokens.test.mjs enforces tree-wide.
    // So the glow is declared ONCE, here, and it is already per-theme without a
    // ternary — `colors` is the RESOLVED palette (this factory runs once per
    // palette), so dark draws #D4A24C and light draws #C8A15B from the same
    // line.
    // RUN N3 (2026-09-08): 18, the control's own corner. It was radius.lg
    // (17), a scale step a great deal of the tree draws — and 18 is not on
    // that scale, so the control carries its corner the way it already
    // carries its fill and its ring rather than the scale moving for it.
    // GEOMETRY, so it stays on the SHARED style and both themes get it.
    borderRadius: navBar.createRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // home(18): the lift is supplied at render, per theme — see CenterCreateButton.
    //
    // A GOLD GLOW, REPLACING THE BLACK DROP SHADOW this control used to carry
    // (opacity 0.28, radius 8, offset 0/3). On the #02110D Prestige ground a
    // black shadow under a gold tile reads as a hole punched in the bar rather
    // than as lift. `glow.halo` is the shared shape from ui/tokens.ts and the
    // colour arrives already pushed through withAlpha, which on native is the
    // ONLY dilution — the shape pins shadowOpacity at 1 for exactly that
    // reason. Strength is CREATE_BUTTON_GLOW_ALPHA above.
    //
    // NOTHING HERE MAY EVER CLIP. On iOS `overflow: 'hidden'` cancels a shadow
    // on the SAME node, so this node and `createSlot` both stay unclipped; if a
    // future clip is needed it goes on a child. The gold glow itself is applied
    // at render (S2 C6) so the create.glowAlpha dial replaces it live.
  },
  // home(8): filled palette gold with dark content. The FILL is the operator
  // reversal of decision 3's "no gold fills", and it survives RUN H2 untouched
  // — dark is still the gold tile. The box model is unchanged either way: RN
  // borders are inside the width.
  //
  // home(18) made the ring the dark content colour, because gold on gold is not
  // a ring. RUN H2 keeps that principle and changes the value: the ring is
  // light's greeting slate and the glyph is light's pill green, so the ring is
  // still not the fill's own colour and the glyph is still dark content on gold.
  //
  // The DEPTH is on the shared style above, not here — see the note there.
  // These two branches differ in COLOUR and in nothing else, which is what
  // makes them a palette translation rather than two designs.
  //
  // RUN S3 (D14) gave this ring the champagne `navBar.ringColorDark`, and
  // 2026-09-17 STOPS DRAWING A RING HERE AT ALL, on operator instruction: the
  // dark control has no outline of any kind. The token stays in ui/tokens.ts
  // — the studio's `create.border` dial still launches at it, and turning that
  // dial still paints a ring — but nothing draws it by default any more.
  //
  // THE RING GOES BY COLOUR, NOT BY WIDTH, and that is load-bearing rather
  // than tidy. `borderWidth: 1` lives on the shared style above because RN
  // lays a border INSIDE the box: zeroing it in one theme would move that
  // theme's content box by a point, which is a GEOMETRY fork and exactly what
  // tests/themeTokens.test.mjs forbids. 'transparent' removes the ring and
  // moves nothing — the same way screens/HomeScreen.tsx's `heroButtonDark`
  // already un-rings the dark "Post a job" pill, which is the control this one
  // is now built to match.
  createButtonDark: {
    // 2026-09-17: the flat far stop of the lit wash applied at render — the
    // light Post-a-job pill's green, theme-constant, and therefore the same
    // hue light's tile below carries. It is declared here and not on the
    // shared style because a fill on the shared style paints BOTH themes, and
    // the two branches must stay separately answerable.
    backgroundColor: colors.postPillGreen,
    borderColor: 'transparent',
  },
  // RUN H2: light stops sharing dark's tile. It fills with the light Post-a-job
  // pill's own green. Still an OPAQUE fill, so the shared elevation cannot
  // trigger the transparent-background Android rendering bug the bar's own
  // elevation:0 exists to avoid.
  //
  // RUN H3 — THE GLYPH AND THE RING GO GOLD, AND THIS IS AN OPERATOR REVERSAL
  // OF H2 RATHER THAN A DEFECT IN IT. H2 shipped light's slate glyph
  // (`greetingSlate`, #526477) inside a `greetingSlateDeep` (#42505F) ring,
  // correctly to the instruction it had. The operator reviewed the render and
  // asked for the glyph in light's GOLD instead, with the ring following it one
  // shade down; `greetingSlateDeep` had no other call site and is gone from
  // ui/tokens.ts rather than left behind as a hue nobody draws.
  //
  // THE FILL DOES NOT MOVE — it is still the Post-a-job pill's green, which is
  // what keeps `tests/goldOnForest.test.mjs` honest: this is a GLYPH colour and
  // a RING, the line-work gold has always been allowed to be, and
  // `createButtonDark` is still the tree's only gold FILL.
  //
  // The glyph reads `colors.gold` — the RESOLVED palette's, which in this
  // branch is always light's #C8A15B — while the ring reads the theme-constant
  // `goldDeep`, because "light's gold, deepened" has no per-theme meaning and
  // must not resolve to dark's gold deepened on a dark device.
  createButtonLight: {
    backgroundColor: colors.postPillGreen,
    borderColor: colors.goldDeep,
  },
  // home(18): the transform moved to the call site with the lift, so the pressed
  // state cannot fall out of step with the resting one.
  createButtonPressed: { opacity: 0.88 },
  // C9 — the attached bar's own vocabulary: full width, one top hairline —
  // both the chrome Surface's now (G1 C4), painted behind the items.
  previewBar: {
    flexDirection: 'row',
  },
  previewItem: {
    flex: 1,
    // Matches BottomTabItem.js's non-overridable 5px padding on every side.
    padding: 5,
    height: TAB_ICON_WRAPPER_HEIGHT + 10,
  },
  }),
);
