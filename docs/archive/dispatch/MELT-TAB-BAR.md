<!-- Copied 2026-09-30 from `.shots/refresh/navbar/handoff-brief.full.md` (the navbar chat; the operator approved the Melt-through bar on that chat's handoff page, `.shots/refresh/navbar/handoff.html`) so the brief is tracked. The operator, 2026-09-30: "last chat i changed the navbar... So can we add this to the list too for fully autonomous?" It runs FIRST in the one build run (every tab screen sits on the bar); its section 0 "One build run" is that run. -->

# Build brief: the Melt-through tab bar

Paste this into a new Claude Code session in the BRAZOS repository. It replaces the tab bar on both trees with the Melt-through bar the operator approved on the handoff page. Everything it needs is already installed.

## 0. Before you start

- Base branch `mainexpo`. This brief was written against HEAD `356a1b9` (2026-09-30). Confirm with `git log -1`. If HEAD has moved, read `HANDOFF.md` first and check nothing below conflicts with it.
- One build run: app code, tests and `HANDOFF.md`. No database, no production, no new package.
- The rules in `CLAUDE.md` this change touches most:
  - **Tokens.** New values go in `ui/tokens.ts`; screens read them through `lib/theme.ts`; no hex anywhere else.
  - **Motion boundary.** `react-native-reanimated` and `react-native-gesture-handler` are imported only by `*.motion120.tsx` siblings, reached through `resolveMotion120` in `lib/motion120`, with a native-driver fallback beside them. `tests/motion120.test.mjs` scans the tree for this.
  - **Git.** Stage by explicit path. `npm run verify` must pass before the one permitted push. Rewrite `HANDOFF.md` last.
- Installed and enough: `react-native-reanimated` 4.1.1, `react-native-gesture-handler` 2.28, `expo-image` 3.0, `expo-haptics`, `@expo/vector-icons`. Do not add Skia or `react-native-svg`.

## 1. The design, pinned

- **The pill.** 361 × 64 on a 393-pt screen: 16 pt from each side, its bottom edge 24 pt above the screen's bottom on a phone with a 34-pt home-indicator inset. It wears the app's lit card exactly: `litCardStyle(isDark)` from `lib/theme.ts` (the wash, the 1-pt mint rim, the white top edge, the lift shadow) with `borderRadius: 32`. Only the pill is lifted. The bubbles are flat.
- **Slots.** Five equal slots of 72.2 pt. Customer: Home · Discover · + · Inbox · Profile. Worker: Home · Map · My Jobs · Inbox · Profile (no +).
- **The chosen tab.** A flat 54-pt bubble in `palette.emerald` (#4FC58C dark, #0D6B52 light). The icon inside is the filled glyph in `palette.onForest` (#062018 dark, #FFFFFF light), centred at 25 pt, and its name is hidden.
- **The other tabs.** The outline glyph at 25 pt over its name (11 pt, weight 500, letter-spacing 0.01 em, 2-pt gap), both in light grey: #F1EDE1 at 60 % in dark, #13201B at 50 % in light.
- **The + bubble.** A flat 44-pt circle in the bubble colour, with Ionicons `add` at 28 pt in the ink colour, centred in the middle slot. It opens the existing `CreateSheet` exactly as today (`setCreateOpen(true)`). The sheet is unchanged.
- **Home.** The app's own `home` / `home-outline` glyphs with the chimney cut off (section 3).
- **Everything else on screen is unchanged.**

## 2. The motion, pinned

| What | Value |
| --- | --- |
| The moving bubble | three circles, 54 / 45 / 36 pt, all chasing the same x; springs (stiffness / damping, mass 1): 640 / 40, 380 / 30, 240 / 23 |
| Following a finger | the 54-pt circle switches to 1400 / 70 while dragging; the other two keep theirs |
| Press | the 54-pt circle swells 10 % (spring 520 / 30), back on release (380 / 22) |
| Stretch while moving | 54-pt circle: width × (1 + s), height × (1 − 0.45 s), s = min(\|velocity\| / 2600, 0.2) |
| Joints inside the moving bubble | fillet radius 40, always joined |
| The + joint | starts forming 9 pt away (fillet 12 × smoothstep), counts as joined at contact, keeps fillet 12 while the two part, so it pinches shut at about a 17-pt gap; while they overlap, the fillet eases 26 → 12 (from 12 pt of overlap to contact) |
| + pull | 2.5 pt toward the bubble it is joined to (spring 300 / 14) |
| + wobble | its scale is a spring 420 / 12: velocity −1.2 on joining, +3.2 on the snap; pressed 0.86 (900 / 40), released 1 (420 / 12) |
| Names | each tab has a 0 → 1 "chosen" value (spring 260 / 24): icon down 7.5 pt × value, name up 4 pt × value, name opacity 1 − 1.6 × value |
| Reduced motion | no swell, stretch or wobble; springs critically damped |

## 3. Home without the chimney

Two SVG assets, drawn with `expo-image` and `tintColor`, at `width: 25, height: 25.63`. The view box is the Ionicons font's own em box (512 wide; ascender 454 plus descender 71 tall), so each glyph sits exactly where the font draws its neighbours. Every other icon stays `Ionicons`. The paths are the app's own glyphs, read from `@expo/vector-icons`' `Ionicons.ttf`, with the chimney's commands cut out and the roof edge joined straight across.

`assets/icons/home-flat.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 525"><path fill="#000" d="M257 39Q267 39 273.5 43.5Q280 48 306 73L336 102L416 179L453 214Q490 249 493 253Q496 258 495.5 264.5Q495 271 490 275Q479 282 469 273Q436 244 267 81Q260 73 256 73Q252 73 245 80.5Q238 88 139.5 181.5Q41 275 38 277Q30 280 22 275Q17 271 16.5 264.5Q16 258 19 253Q21 250 128 147.5Q235 45 237 44Q239 42 244 40Q249 38 257 39ZM249 109Q249 109 249 109Q256 103 262 108Q266 111 352.5 194Q439 277 444 281Q444 281 448 286L448 374L448 462L445 467Q438 483 421 486Q415 487 366 486Q366 486 316 486L312 483Q308 481 306 477.5Q304 474 304 402Q304 402 303 330L301 328L299 326L256 326L213 326L211 328L209 330L208 402Q208 474 206 477.5Q204 481 200 483Q200 483 196 486L146 486Q90 487 82 483Q72 478 67 468Q67 468 64 462L64 374L64 286L68 281Q72 277 158.5 195Q245 113 249 109Z"/></svg>
```

`assets/icons/home-outline-flat.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 525"><path fill="#000" d="M244 40Q261 34 275 44Q277 46 307 74L336 102L417 179L454 215Q492 251 493 254Q497 258 495 266Q495 270 490 274Q485 278 480 278Q473 278 459 264L448 254L448 358Q448 461 446 465Q441 478 427 484L422 486L369 486L316 486L312 484Q308 481 306 478L304 475L304 403L303 330L301 328L299 326L256 326L213 326L211 328L209 330L208 403L208 475L206 478Q204 481 200 484L196 486L143 486L90 486L85 484Q70 478 66 464Q64 459 64 356.5Q64 254 63.5 254Q63 254 52 265Q36 281 26 277Q11 270 17 256Q19 253 31 241Q48 224 141.5 135Q235 46 237 44Q239 42 244 40ZM336 146Q257 70 256.5 70Q256 70 176 146L96 222L96 338L96 454L136 454L176 454L176 390L176 326L178 320Q185 305 200 297L205 295L256 295L307 295L312 297Q327 305 334 320L336 326L336 390L336 454L376 454L416 454L416 338L416 222L336 146Z"/></svg>
```

If `expo-image` will not tint the SVG on the device, export the same paths as @2x / @3x PNGs and use `Image` with `tintColor`. That needs no new package either.

## 4. Files

- `ui/tokens.ts`: a `meltBar` block with the geometry, springs and per-theme colours above. Read it through `lib/theme.ts`.
- `ui/primitives/MeltTabBar.shared.ts`: pure code with no React Native imports, so a test can execute it. It holds `neckShape`, `plusFillet`, the join and snap rule, the facing-end rule, slot centres and the per-tree tab lists.
- `ui/primitives/MeltTabBar.motion120.tsx`: the 120 Hz path, using Reanimated worklets and one gesture-handler Pan.
- `ui/primitives/MeltTabBar.tsx`: the chooser plus the native-driver fallback. Choose the way `components/PeekSheet.tsx` does, gestures AND worklets: `resolveMotion120({ ...motionCapability, gestures: canSwipe() && canWorklet(), reanimated: canWorklet() }, 'gestures', () => require('./MeltTabBar.motion120').MeltTabBar, MeltTabBarNative)`.
- `assets/icons/home-flat.svg`, `assets/icons/home-outline-flat.svg`: section 3.
- `navigation/CustomerRoot.tsx`, `navigation/WorkerRoot.tsx`: pass `tabBar={(props) => <MeltTabBar {...props} tabs={CUSTOMER_BAR_TABS} onCreate={() => setCreateOpen(true)} />}`. The worker tree passes `WORKER_BAR_TABS` and no `onCreate`.
- `hooks/useNavInset.ts`, and `useScrollClearance` in `ui/primitives/BottomNav.tsx`: the floating pill's footprint (section 8).
- `tests/meltTabBar.test.mjs`: new, plus the fence updates in section 10.

## 5. Drawing it with plain Views

Layers inside the pill, bottom to top:

1. **The pill:** `litCardStyle(isDark)` with `borderRadius: 32`.
2. **The grey row:** each tab is a 64 × 64 column (icon over name), centred on its slot.
3. **Three connectors.** Each is an `overflow: 'hidden'` View filled with the bubble colour. It holds a copy of the dark row and its own two cut-outs.
4. **The three bubbles.** Each is an `overflow: 'hidden'` circle holding a copy of the dark row.
5. **The + bubble.**
6. **The touch layer.**

- **Copies of a row.** Every copy of a row sits inside its holder at `translateX: -x, translateY: -y`, where (x, y) is the holder's top-left in pill coordinates. That is how the icon under a bubble turns dark exactly inside the bubble, half in and half out.
- **Cut-outs.** A cut-out is a circle View (`overflow: 'hidden'`, radius = fillet). It holds a pill-sized View with the pill's own gradient and a copy of the grey row, both offset the same way. It lives inside its connector, so it can only carve that connector, and because it carries the grey row it never hides an icon.
- **Which joints exist.** The two joints inside the moving bubble (54↔45, 45↔36) always exist. For the 54-pt circle, joint from its cap nearest the next circle: centre x ± (width − height) / 2, radius height / 2.
- **The + joint.** The + joins the end of the moving bubble that faces it: the circle whose edge reaches furthest toward the +, never a small circle tucked inside the big one. While the + sits between the circles' centres, there is no + joint, because the moving bubble's own shape carries it.

```ts
// P and Q: two circles on the pill's centre line; rc: the fillet radius.
// Returns null when there is nothing to draw.
export function neckShape(xp: number, rp: number, xq: number, rq: number, rc: number) {
  'worklet';
  const d = Math.abs(xq - xp), s = Math.sign(xq - xp) || 1;
  if (rc < 0.3 || d <= Math.abs(rp - rq) + 0.3) return null; // no fillet, or one inside the other
  const R1 = rp + rc, R2 = rq + rc;
  if (d >= R1 + R2) return null;
  const a = (d * d + R1 * R1 - R2 * R2) / (2 * d);
  const yo = Math.sqrt(Math.max(0, R1 * R1 - a * a));
  if (yo - rc < 0.6) return null;                            // the waist has pinched shut: the snap
  const xc = xp + s * a;                                     // the cut-outs' centre x
  const tp = { x: xp + ((xc - xp) * rp) / R1, y: (yo * rp) / R1 };
  const tq = { x: xq + ((xc - xq) * rq) / R2, y: (yo * rq) / R2 };
  // connector: x0..x1 wide, 2 × top tall, centred on the line; cut-outs: radius rc at (xc, ±yo)
  return { rc, xc, yo, x0: Math.min(tp.x, tq.x), x1: Math.max(tp.x, tq.x), top: Math.max(tp.y, tq.y) };
}

export function smooth(a: number, b: number, t: number) {   // smoothstep from a to b
  'worklet';
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

export const FILLET = { chain: 40, plus: 12, over: 26 };
export function plusFillet(gap: number, joined: boolean) {
  'worklet';
  if (gap <= 0) return FILLET.over + (FILLET.plus - FILLET.over) * smooth(-12, 0, gap);
  return joined ? FILLET.plus : FILLET.plus * smooth(9, 0, gap);
}
// Joining: not joined and gap < 0.5  -> joined; pull 2.5 toward it; + scale velocity -1.2.
// Snap:    joined, gap > 0 and neckShape(..., plusFillet(gap, true)) === null
//          -> not joined; pull back to 0; + scale velocity +3.2.
```

## 6. Motion on the UI thread

- **Shared values:** each circle's x and velocity, the press swell, the + pull, the + scale, and one "chosen" value per tab.
- **One `useFrameCallback` worklet runs everything.** It steps the springs with semi-implicit Euler in 4 ms substeps, the integrator the handoff page runs, so the feel matches it one to one:

  ```ts
  const n = Math.ceil(dt / 0.004) || 1, h = dt / n;
  for (let i = 0; i < n; i++) { const acc = -k * (x - target) - c * v; v += acc * h; x += v * h; }
  ```

  It then computes the stretch, the joints and the join/snap state, and writes the results to shared values. Each piece's `useAnimatedStyle` only reads them.
- **Transforms wherever possible.** Every position is a `translateX`/`translateY`. Only the stretched 54-pt circle, the three connectors and the cut-outs change size. Profile them on a ProMotion iPhone; if frames drop, draw the chain joints' cut-outs (fixed radius 40) at a fixed 80-pt size, moved by transform.
- **Names.** One animated style per tab for the icon's drop and one for the name, shared by every copy of the row. That is 8 styles, not one per copy.
- **Back to JS.** Only on release: `runOnJS(select)(key)`, as the other `*.motion120.tsx` files do. Nothing crosses the bridge while a finger moves.

## 7. Touch and navigation

- **One `Gesture.Pan().minDistance(0)` over the four tab slots:**
  - `onBegin`: swell to 1; all three circles target the finger's x, clamped between the first and last tab centre.
  - `onUpdate`: after 5 pt of travel, the 54-pt circle takes the finger-follow spring.
  - `onFinalize`: the nearest tab, `runOnJS(select)(key)`, swell back to 0.
- **The +** is its own `Pressable` (squish 0.86) calling `onCreate`.
- **`select(key)`.** Emit `tabPress` the way React Navigation's own bar does: `navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })`. Unless the event is prevented, then `navigation.navigate(route.name, route.params)`. This keeps `bottomNavScreenListeners` (the haptic `tap()`) and re-press-to-pop working. Never navigate to `Create`; it is an action, not a destination.
- **Hidden routes** (`Map`, `MyJobs` on the customer tree) stay registered. The bar draws only `CUSTOMER_BAR_TABS` / `WORKER_BAR_TABS`.
- **Accessibility.** Each slot gets `accessibilityRole="tab"`, `accessibilityState={{ selected }}` and its name as the label. The + keeps today's "Create" label and hint. Every slot is 72 × 64, above the 44-pt minimum.

## 8. Floating over the screens

- **The pill floats on every tab screen.** Today only the two homes take the bar out of flow. The custom `tabBar` renders `position: 'absolute'`, so every scene runs full height.
- **`useNavInset()` returns the pill's footprint:** 64 + bottom offset + 8 pt of breathing room, where bottom offset = max(insetBottom − 10, 12). That is 24 on a 34-pt-inset iPhone. `useScrollClearance()` then returns that footprint on every tab route, not only the homes. Pinned footers keep `PINNED_FOOTER_BOTTOM_PADDING` above the pill.
- **Retire today's bar configuration for the two trees:** `bottomNavScreenOptions`' `tabBarStyle` / `tabBarIcon` / `tabBarBackground` and `CenterCreateButton`. Keep `bottomNavScreenListeners`, `HIDDEN_TAB_ITEM_OPTIONS` and the tab lists.
- **The design studio's `nav.*` dials** would no longer drive anything. Remove them from `ui/designStudioSchema.ts` rather than leave them inert, and move their fences in the same commit.

## 9. Fallback and reduced motion

- **Without the native modules.** On a binary without Reanimated or gesture-handler (`lib/motion120` resolves it), draw the same pill, rows, bubble and + with the built-in `Animated` on the native driver:
  - the bubble slides between tabs with `Animated.spring` on `translateX` (stiffness 420, damping 34);
  - the names cross-fade;
  - there are no joints, no tail and no stretch;
  - taps go through `Pressable`.
- **Reduced motion** (`hooks/useReducedMotion`), on both paths: the fallback's motion with a 180 ms timing and no wobble.

## 10. Tests and checks

- **New `tests/meltTabBar.test.mjs`.** It executes `MeltTabBar.shared.ts` and checks that:
  - the + joint joins at contact and pinches shut between a 15- and a 19-pt gap;
  - `neckShape` returns null for nested circles;
  - the facing-end rule never picks a circle inside the 54-pt one;
  - the slot centres sit at 36.1, 108.3, 180.5, 252.7 and 324.9.
- **`tests/motion120.test.mjs`.** Add the new sibling to its roster.
- **Fences that pin today's bar.** Update each one's expected constants with a dated reason; never weaken its logic. Read each before changing it:
  - `tests/layout.test.mjs`
  - `tests/emeraldFences.test.mjs`
  - `tests/designStudio.test.mjs`
  - `tests/mode.test.mjs`
  - `tests/goldOnForest.test.mjs`
  - `tests/blurBoundary.test.mjs`
  - `tests/postJobPublish.test.mjs`
- **Checks.** `npm run verify` green. Render dark and light with `node scripts/shots.mjs --build` and compare against the handoff page.

## 11. Done means

- Both trees draw the new bar in dark and light, and the + opens the same `CreateSheet`.
- Every hidden-route dispatch still lands, and scrollers end above the pill.
- `npm run verify` passes and `HANDOFF.md` is rewritten.
- The operator checks the feel on a ProMotion iPhone. That is a device check only the operator can make.
