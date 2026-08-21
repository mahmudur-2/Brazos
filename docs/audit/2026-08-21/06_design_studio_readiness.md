# 06 — Design studio readiness

**Question this domain answers:** if the operator wants to tune the app's taste values live, with Fast Refresh, across every screen — what would the knob surface have to be, and how much of it already exists?

**Method:** a throwaway analyzer (`.audit-scratch/knobs.mjs`, never committed) parsed every `.tsx` under `screens/ components/ ui/primitives/ ui/templates/ navigation/`, stripped comments so documented measurements are not counted, and classified every style property as either a **hardcoded literal** or **token-driven**.

---

## Summary

| Measure | Value |
|-|-|
| Files inventoried | 119 |
| **Hardcoded taste values** | **2,155** |
| Token-driven values | 1,467 |
| **Token share** | **40.5%** |
| Existing studio knobs | **8**, Customer Home only |
| Existing studio coverage of Home's own literals | 8 of 108 (**7.4%**) |

**The headline: three out of five taste values in this app are typed into a `StyleSheet` by hand.** That is not a criticism of the code — most of them are deliberate, master-derived numbers — but it is the exact size of the gap a global design studio has to close.

---

## 1. Hardcoded values by family

| Family | Count | Most common values (count) |
|-|-|-|
| **type** (`fontSize`, `lineHeight`, `letterSpacing`, `fontWeight`) | **801** | 13(116) 14(111) 12(78) 20(58) 19(54) 15(53) 11(45) 18(38) 17(37) 16(35) |
| **size** (`height`, `width`, `min*`, `max*`) | **494** | 44(53) '100%'(41) 40(33) 72(23) 30(18) 32(17) 24(12) 34(12) 46(12) 48(12) |
| **icon** (`<Ionicons size={N}>`) | **306** | 18(70) 20(56) 16(26) 22(19) 14(18) 13(13) 26(10) 30(9) |
| **stroke** (`borderWidth` family) | **252** | **1(228)** 2(13) 1.5(5) 1.25(4) |
| **space** (`padding`, `margin`, `gap`) | **177** | 2(66) 0(15) 6(14) 3(13) 10(8) 8(7) 14(7) |
| **opacity** | **66** | 0.82(13) 0.85(12) 0.9(8) 0.8(5) 0.78(4) 0.72(4) |
| **radius** | **49** | 36(8) 2(5) 4(4) 5(4) 15(4) 12(3) 20(3) |
| **shadow** | **10** | — |

### What the histograms actually tell you

Each family has a different story, and they need different treatment:

- **`space` is essentially solved.** Only 177 literals, and 66 of them are the value `2` — sub-token micro-nudges, not layout. The `spacing` scale (`ui/tokens.ts:165-173`) has clearly won: real padding and margins go through it. **A global studio does not need a spacing knob per screen; it needs one that scales the existing `spacing` ramp.**

- **`stroke` is one number.** 228 of 252 hairlines are `borderWidth: 1`. That is a **single global knob** (`hairlineWidth`), not 252 dials. The four outliers at `1.25` and five at `1.5` are the Home mode-switch ring and the gold chip outlines — deliberate, and worth their own named knob.

- **`type` is the real work, and it is not one scale.** 801 literals spread across ten common sizes from 11 to 22, with no clustering into a ramp. `ui/tokens.ts:248-256` explains why: no custom font is bundled, and *"body copy therefore uses the platform sans… and display headlines use the platform serif the locked screens already render with."* Without a font, sizes were tuned per surface against the masters. **This family needs a real type scale before it can have a knob** — a studio slider over 801 unrelated numbers is not a control, it is a random-number generator.

- **`size` splits cleanly.** 53 instances of `44` are the touch-target floor (`controls.minTouchTarget` already exists and is used *once* — see `02_invariants.md` §I-8). 41 are `'100%'`. The rest are per-component geometry — thumbnails, avatars, hero slots — that belongs to the component, not to a global dial.

- **`icon` is highly clusterable.** 306 values but 70 are `18` and 56 are `20`; the top four values cover 171 of them. A five-step icon scale (`14 / 16 / 18 / 20 / 24`) would absorb the great majority.

- **`radius` is nearly clean already.** Only 49 literals against a `radius` token scale (`ui/tokens.ts:234-242`) that is clearly in use. The 8 instances of `36` are `searchRadius`'s half-height and its relatives.

---

## 2. The per-screen inventory

Full ranking by hardcoded count. `HARD` = hardcoded literals; `tok` = token-driven references in the same file. **The ratio between them is the readiness signal** — a file with high `tok` and low `HARD` is already studio-ready; the inverse is not.

| File | HARD | tok | radius | space | type | size | icon | stroke | opac | shadow |
|-|-|-|-|-|-|-|-|-|-|-|
| `screens/HomeScreen.tsx` | **108** | 30 | 3 | 29 | 30 | 27 | 7 | 8 | 4 | 0 |
| `screens/PostJobScreen.tsx` | 82 | 54 | 0 | 1 | 39 | 17 | 18 | 6 | 1 | 0 |
| `screens/ClientJobDetailScreen.tsx` | 74 | 70 | 1 | 1 | 21 | 25 | 15 | 10 | 1 | 0 |
| `screens/MyJobsHubScreen.tsx` | 73 | 41 | 1 | 6 | 24 | 24 | 8 | 6 | 1 | 3 |
| `screens/ProfileScreen.tsx` | 68 | 43 | 1 | 3 | 25 | 14 | 13 | 9 | 3 | 0 |
| `screens/WorkerSearchScreen.tsx` | 66 | 48 | 0 | 1 | 33 | 15 | 9 | 6 | 2 | 0 |
| `screens/BrowseJobsScreen.tsx` † | 65 | 30 | 1 | 18 | 22 | 11 | 9 | 2 | 2 | 0 |
| `screens/JobDetailScreen.tsx` | 58 | 47 | 0 | 4 | 28 | 11 | 12 | 3 | 0 | 0 |
| `screens/WorkerHomeScreen.tsx` | 58 | 26 | 0 | 8 | 19 | 18 | 5 | 4 | 4 | 0 |
| `components/OfferCard.tsx` | 54 | 37 | 1 | 2 | 25 | 14 | 8 | 2 | 2 | 0 |
| `components/PortfolioPicker.tsx` | 45 | 35 | 1 | 2 | 16 | 13 | 7 | 6 | 0 | 0 |
| `screens/CompareBidsScreen.tsx` | 43 | 28 | 0 | 3 | 22 | 3 | 7 | 7 | 1 | 0 |
| `screens/WorkerProfileScreen.tsx` | 41 | 26 | 0 | 1 | 21 | 4 | 8 | 4 | 3 | 0 |
| `screens/AccountSafetyScreen.tsx` | 37 | 19 | 0 | 2 | 13 | 6 | 10 | 5 | 1 | 0 |
| `screens/ProfileDetailsScreen.tsx` | 36 | 23 | 0 | 1 | 12 | 8 | 8 | 6 | 1 | 0 |
| `screens/WorkerJobScreen.tsx` | 36 | 24 | 1 | 1 | 16 | 8 | 7 | 3 | 0 | 0 |
| `screens/ChatScreen.tsx` | 33 | 24 | 2 | 1 | 12 | 8 | 5 | 4 | 1 | 0 |
| `screens/MapScreen.tsx` | 32 | 24 | 0 | 1 | 16 | 7 | 4 | 3 | 1 | 0 |
| `screens/ApproveOrDisputeScreen.tsx` | 31 | 15 | 2 | 0 | 15 | 8 | 1 | 5 | 0 | 0 |
| `screens/LegalGateScreen.tsx` | 31 | 23 | 0 | 6 | 9 | 9 | 4 | 3 | 0 | 0 |
| `screens/TrackWorkerScreen.tsx` | 31 | 12 | 1 | 2 | 10 | 7 | 3 | 8 | 0 | 0 |
| `screens/ProfileReviewsScreen.tsx` | 30 | 20 | 2 | 2 | 12 | 9 | 5 | 0 | 0 | 0 |
| `components/HotspotMap.web.tsx` ‡ | 28 | 20 | 0 | 0 | 7 | 8 | 7 | 5 | 1 | 0 |
| `components/WorkerJobCard.tsx` | 28 | 9 | 0 | 3 | 7 | 6 | 8 | 3 | 1 | 0 |
| `components/ChatBubble.tsx` | 27 | 14 | 3 | 6 | 7 | 7 | 1 | 3 | 0 | 0 |
| `components/MarketJobPreview.tsx` | 25 | 13 | 0 | 1 | 12 | 4 | 5 | 3 | 0 | 0 |
| `screens/ServicesPricingScreen.tsx` | 25 | 20 | 0 | 1 | 12 | 4 | 2 | 6 | 0 | 0 |
| `components/HubCard.tsx` | 23 | 12 | 0 | 3 | 10 | 4 | 3 | 3 | 0 | 0 |
| `screens/NotificationSettingsScreen.tsx` | 23 | 13 | 0 | 1 | 13 | 2 | 3 | 4 | 0 | 0 |
| `components/PastWork.tsx` | 22 | 18 | 1 | 0 | 11 | 5 | 2 | 3 | 0 | 0 |
| `screens/RouteArrivalScreen.tsx` | 22 | 9 | 1 | 2 | 10 | 2 | 4 | 3 | 0 | 0 |
| `screens/BidDetailScreen.tsx` | 21 | 19 | 0 | 0 | 12 | 3 | 3 | 2 | 1 | 0 |
| `screens/DeleteAccountScreen.tsx` | 21 | 12 | 0 | 2 | 12 | 1 | 3 | 2 | 1 | 0 |
| `screens/EarningsScreen.tsx` | 21 | 12 | 0 | 2 | 10 | 3 | 2 | 4 | 0 | 0 |
| `screens/PaymentMethodsScreen.tsx` | 21 | 13 | 0 | 0 | 12 | 2 | 3 | 4 | 0 | 0 |
| `screens/WorkerResultsScreen.tsx` | 21 | 12 | 2 | 1 | 6 | 8 | 3 | 1 | 0 | 0 |
| `components/HotspotMap.native.tsx` | 20 | 15 | 0 | 1 | 6 | 5 | 3 | 5 | 0 | 0 |
| `screens/WorkChecklistScreen.tsx` | 20 | 13 | 0 | 0 | 8 | 5 | 3 | 4 | 0 | 0 |
| `components/CountryPicker.tsx` | 19 | 13 | 3 | 1 | 5 | 6 | 3 | 1 | 0 | 0 |
| `components/BrowseJobCard.tsx` | 18 | 7 | 0 | 4 | 7 | 4 | 2 | 1 | 0 | 0 |
| `components/ConversationRow.tsx` | 18 | 6 | 1 | 3 | 6 | 3 | 4 | 1 | 0 | 0 |
| `ui/primitives/BottomNav.tsx` | 18 | 3 | 0 | 3 | 0 | 6 | 0 | 4 | 1 | 4 |
| `components/JobFilterSheet.tsx` | 17 | 9 | 2 | 0 | 7 | 6 | 0 | 2 | 0 | 0 |
| `components/ReviewSection.tsx` | 17 | 13 | 1 | 0 | 7 | 5 | 4 | 0 | 0 | 0 |
| `screens/NotificationsScreen.tsx` | 17 | 5 | 1 | 2 | 6 | 5 | 1 | 2 | 0 | 0 |
| `ui/primitives/JobCard.tsx` | 17 | 13 | 0 | 6 | 4 | 1 | 3 | 2 | 1 | 0 |
| `components/CategoryAccordion.tsx` | 16 | 14 | 1 | 0 | 3 | 2 | 6 | 4 | 0 | 0 |
| `components/OfferComposer.tsx` | 16 | 12 | 0 | 0 | 13 | 1 | 1 | 0 | 1 | 0 |
| `components/PhoneNumberInput.tsx` | 16 | 9 | 0 | 5 | 4 | 4 | 1 | 2 | 0 | 0 |
| `screens/AdminReportsScreen.tsx` | 16 | 15 | 1 | 0 | 10 | 3 | 2 | 0 | 0 | 0 |
| `components/OfferResponseActions.tsx` | 14 | 4 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 |
| `components/ServicePickerSheet.tsx` | 14 | 17 | 0 | 1 | 3 | 7 | 3 | 0 | 0 | 0 |
| `screens/CheckoutScreen.tsx` | 14 | 12 | 0 | 0 | 8 | 0 | 2 | 4 | 0 | 0 |
| `screens/SavedWorkersScreen.tsx` | 14 | 10 | 0 | 1 | 4 | 3 | 3 | 3 | 0 | 0 |
| `screens/VerifyPhoneScreen.tsx` | 14 | 12 | 1 | 1 | 2 | 8 | 1 | 1 | 0 | 0 |
| `screens/WelcomeScreen.tsx` | 14 | 8 | 0 | 4 | 0 | 1 | 0 | 1 | **8** | 0 |
| `components/Button.tsx` | 12 | 2 | 0 | 3 | 3 | 3 | 0 | 2 | 1 | 0 |
| `components/JobProgress.tsx` | 12 | 1 | 1 | 2 | 2 | 4 | 1 | 2 | 0 | 0 |
| `components/VoiceNote.tsx` | 12 | 2 | 1 | 2 | 1 | 6 | 1 | 1 | 0 | 0 |
| `screens/JobConfirmedScreen.tsx` | 12 | 8 | 0 | 1 | 6 | 1 | 1 | 3 | 0 | 0 |
| `screens/ReviewAndTipScreen.tsx` | 12 | 16 | 0 | 0 | 7 | 1 | 0 | 4 | 0 | 0 |
| `components/ChatComposer.tsx` | 11 | 9 | 1 | 0 | 3 | 3 | 0 | 2 | 2 | 0 |
| `components/JobVideo.tsx` | 11 | 6 | 0 | 0 | 1 | 5 | 2 | 1 | 2 | 0 |
| `components/ModeTransitionOverlay.tsx` | 11 | **0** | 3 | 0 | 0 | 5 | 0 | 0 | 3 | 0 |
| `components/SegmentedControl.tsx` | 11 | 3 | 0 | 1 | 2 | 3 | 0 | 1 | 1 | 3 |
| `screens/MessagesInboxScreen.tsx` | 11 | 11 | 1 | 2 | 4 | 3 | 1 | 0 | 0 | 0 |
| `ui/primitives/MediaGrid.tsx` | 11 | 8 | 0 | 2 | 0 | 4 | 3 | 1 | 1 | 0 |
| `components/AmountPrompt.tsx` | 10 | 11 | 0 | 0 | 6 | 3 | 0 | 1 | 0 | 0 |
| `components/MapPinIcon.tsx` | 10 | **0** | 5 | 0 | 0 | 2 | 0 | 1 | 2 | 0 |
| `components/SetupRow.tsx` | 10 | 4 | 0 | 1 | 3 | 4 | 1 | 1 | 0 | 0 |
| `screens/AppearanceScreen.tsx` | 10 | 5 | 0 | 0 | 3 | 3 | 2 | 1 | 1 | 0 |
| `ui/primitives/MediaUploader.tsx` | 10 | 4 | 0 | 1 | 0 | 4 | 3 | 2 | 0 | 0 |
| `components/ActionSheet.tsx` | 9 | 10 | 0 | 1 | 4 | 0 | 1 | 3 | 0 | 0 |
| `components/MarkdownText.tsx` | 9 | 6 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 0 |

† dead screen (`10_dead_code.md` §A1) — 65 literals that will never render.
‡ frozen web surface — read-only, must not be touched.

**Fully token-driven, zero hardcoded values** (the model to aim at): `screens/SignInScreen.tsx` (10 tok / 0 hard), `screens/CounterofferScreen.tsx`, `components/PulseDot.tsx`, `components/Skeleton.tsx`, `ui/primitives/MoneyText.tsx`.

---

## 3. The existing knob pattern

Two files, and the pattern is clean and worth extending rather than replacing.

### `lib/homeDesignStudio.tsx` — the contract (44 lines)

```tsx
export type HomeDesignSettings = {
  heroFontSize: number;  screenPadding: number;  sectionGap: number;
  searchHeight: number;  searchRadius: number;   ctaHeight: number;
  ctaRadius: number;     jobCardRadius: number;
};

export const DEFAULT_HOME_DESIGN_SETTINGS: HomeDesignSettings = { … };

const HomeDesignStudioContext = createContext<HomeDesignSettings>(DEFAULT_HOME_DESIGN_SETTINGS);
export function HomeDesignStudioProvider({ settings, children }) { … }
export function useHomeDesignSettings() { return useContext(HomeDesignStudioContext); }
```

Three properties make this the right shape:

1. **The context defaults to the constant**, so `useHomeDesignSettings()` works whether or not a provider is mounted. In production no provider exists and every consumer gets the frozen default — a module constant with a stable identity, so no re-render cost.
2. **The screen applies knobs as a style override, not a replacement.** `screens/HomeScreen.tsx:743` — `{ borderRadius: design.jobCardRadius }` appended to the `styles.jobCard` array. The `StyleSheet` stays the source of everything the studio does not control.
3. **`DEFAULT_HOME_DESIGN_SETTINGS` is version-controlled.** Turning a dial in the browser is exploratory; committing the new default is the decision. `lib/homeDesignStudio.tsx:19` says so — *"This is the studio's DEFAULT, not a frozen value: the slider still runs 28..56."*

### `dev-tools/HomeDesignStudio.tsx` — the harness (139 lines)

```tsx
type Control = { key: keyof HomeDesignSettings; label: string;
                 step: number; min: number; max: number; suffix: string };

const CONTROLS: Control[] = [
  { key: 'heroFontSize', label: 'Hero font size', step: 1, min: 28, max: 56, suffix: 'pt' },
  …
];
```

A flat `CONTROLS` array, `−`/`+` steppers clamped to `[min, max]`, a Reset, and a 393×852 phone viewport that renders **the real navigation tree** (`{children}` is `MainTabs`) rather than a mock. `App.tsx:27-31` gates it: `__DEV__ && Platform.OS === 'web' && …`.

**Two defects in the harness, both P3:**
- `dev-tools/HomeDesignStudio.tsx:107` — `backgroundColor: '#E8ECE9'` is a hardcoded hex (`02_invariants.md` §I-7).
- `:68` and `:80` — `stepButton` is 42×42, below the 44pt floor (`02_invariants.md` §I-8). A dev tool, but the app's own rule.

**And one structural note:** `10_dead_code.md` §A6 records that `App.tsx:25` imports `HomeDesignStudio` **unconditionally**. The render is gated; the import is not. So `dev-tools/HomeDesignStudio.tsx` (6.1 KB) and `lib/homeDesignStudio.tsx` ship in every release bundle. **This matters more once the studio grows** — a 30-knob studio with a control panel is not 6 KB. Any expansion should move to a lazy import or a `.dev.tsx` module resolution before it grows, not after.

---

## 4. Proposed knob schema

The design goal is **not** "a slider for each of the 2,155 literals." That is unusable and would take longer to build than to hand-tune. The goal is a small number of dials that move many values coherently.

Three tiers, in dependency order.

### Tier 1 — Global multipliers (8 knobs, cover ~1,100 values)

These scale the existing token ramps rather than replacing them. They are the highest leverage per knob in the whole schema.

```ts
export type GlobalDesignSettings = {
  /** Multiplies every `spacing.*` token. 0.8–1.3, step 0.05. Covers 177
   *  literal spaces plus every token-driven space in the app. */
  spacingScale: number;
  /** Multiplies every `radius.*` token. 0–2.0, step 0.05. `radius.pill`
   *  (999) is exempt — a pill is a pill at any scale. */
  radiusScale: number;
  /** Multiplies every `fontSize`. 0.85–1.25, step 0.01. Line heights follow
   *  via `lineHeightRatio` rather than scaling independently. */
  typeScale: number;
  /** Global line-height as a multiple of font size. 1.15–1.6, step 0.01.
   *  Replaces 200+ hand-paired lineHeight literals. */
  lineHeightRatio: number;
  /** The one hairline. 0.5–2, step 0.25. Replaces 228 `borderWidth: 1`. */
  hairlineWidth: number;
  /** Emphasized borders — gold chips, the mode-switch ring.
   *  0.75–2.5, step 0.25. Replaces the 1.25 and 1.5 outliers. */
  emphasisBorderWidth: number;
  /** Multiplies every `<Ionicons size>`. 0.8–1.3, step 0.05. */
  iconScale: number;
  /** Pressed-state opacity, one value. 0.6–1.0, step 0.02.
   *  Replaces the 0.72/0.78/0.8/0.82/0.85/0.9 spread (46 of 66 opacities). */
  pressedOpacity: number;
};
```

**`pressedOpacity` deserves a note.** The histogram shows six different pressed values in use — 0.82 (13×), 0.85 (12×), 0.9 (8×), 0.8 (5×), 0.78 (4×), 0.72 (4×). Nobody chose six; they accumulated. This is one knob and one decision.

### Tier 2 — Named component knobs (~18 knobs)

Values that recur across screens but are not a scale — each is a specific shape decision.

```ts
export type ComponentDesignSettings = {
  cardRadius: number;         // 0–28   — JobCard, HubCard, WorkerJobCard, OfferCard, Card
  cardPadding: number;        // 8–24   — layout.cardPadding, currently 14
  sheetRadius: number;        // 0–36   — Sheet, ActionSheet, ServicePickerSheet
  chipHeight: number;         // 28–52  — the 34/36 cluster from 02_invariants §I-8
  chipRadius: number;         // 0–999
  buttonHeight: number;       // 40–64  — controls.buttonHeight, currently 48
  buttonHeightSmall: number;  // 44–56  — currently 44, at the floor
  buttonRadius: number;       // 0–32
  fieldHeight: number;        // 40–64  — currently 48
  fieldRadius: number;        // 0–32
  avatarSize: number;         // 28–64
  thumbSize: number;          // 56–120 — job-card thumbnails (84 / 92 today)
  listRowMinHeight: number;   // 44–72  — currently controls.minTouchTarget
  screenGutter: number;       // 12–28  — layout.screenGutter, currently 16
  sectionGap: number;         // 8–32
  navHeight: number;          // 56–88  — layout.floatingNavHeight, currently 70
  navGap: number;             // 8–20   — layout.floatingNavGap, currently 12
  minTouchTarget: number;     // 44–56  — floor only, never below 44
};
```

**`minTouchTarget` must be clamped at 44 in the control definition itself**, not left to the operator. It is the one value in this schema where a lower number is a defect rather than a taste, and `ui/tokens.ts:379` already calls it *"non-negotiable."*

### Tier 3 — Per-screen overrides (the existing pattern, generalized)

Keep `HomeDesignSettings` exactly as it is and give the same treatment to the screens with the largest residual literal counts, in this order:

| Screen | HARD | proposed knobs |
|-|-|-|
| `screens/HomeScreen.tsx` | 108 | the existing 8, plus `heroSlotHeight`, `heroArtOffsetX/Y`, `promoCardHeight`, `bDrapeWidthRatio` |
| `screens/PostJobScreen.tsx` | 82 | `stepHeaderHeight`, `wizardGutter`, `dateChipWidth` |
| `screens/ClientJobDetailScreen.tsx` | 74 | `heroHeight`, `stepperDotSize`, `stepperGap` |
| `screens/MyJobsHubScreen.tsx` | 73 | `hubCardHeight`, `hubSectionGap` |
| `screens/WorkerHomeScreen.tsx` | 58 | `heroArtWidth/Height`, `pillHeight` |

```ts
export type DesignSettings = GlobalDesignSettings &
  ComponentDesignSettings & { screens: Partial<Record<ScreenKey, ScreenKnobs>> };
```

### Control metadata — extend the existing `Control` type

`dev-tools/HomeDesignStudio.tsx:10-17` needs three additions to carry Tier 1:

```ts
type Control = {
  key: string;
  label: string;
  step: number;
  min: number;
  max: number;
  suffix: string;
  group: 'global' | 'component' | 'screen';   // NEW — panel sectioning
  precision?: number;                          // NEW — multipliers need decimals
  floor?: number;                              // NEW — minTouchTarget's hard 44
};
```

`precision` is required because Tier 1 is multiplicative: `dev-tools/HomeDesignStudio.tsx:36-41`'s `adjust()` does integer arithmetic and would round `spacingScale` to 0 or 1.

---

## 5. Sequencing — what has to happen first

The schema above is not directly buildable today. Three things block it, in order:

1. **The baseline is red** (`01_environment.md` Finding #1), and one of the ten failures is `tests/homeDesignStudio.test.mjs:16` asserting `heroFontSize: 31` against a file that now says `33`. **The studio's own test is currently failing.** Nothing should extend the studio until the operator settles those dial values.

2. **Tier 1 needs the tokens to be functions, not constants.** `spacing`, `radius` and `controls` are `as const` objects read at module scope by 90 files through `themedStyles`. A multiplier means either resolving them through the context (which changes `themedStyles`'s WeakMap-per-palette caching, `lib/theme.ts:462-473`) or generating a scaled palette object and keying the cache on it. **The second is the safe path** — it preserves the existing cache contract exactly, since the cache is already keyed on palette identity.

3. **`type` needs a scale before it needs a knob.** 801 literals across ten unrelated sizes cannot be multiplied coherently — scaling `13` and `14` by 1.1 gives `14.3` and `15.4`, which is worse than either. Tier 1's `typeScale` is only meaningful after the sizes collapse onto a ramp. **That is a prerequisite refactor, not part of the studio.**

**Recommended order:** (a) resolve Finding #1 → (b) Tier 1's four *non-multiplicative* knobs (`hairlineWidth`, `emphasisBorderWidth`, `pressedOpacity`, `iconScale` — all direct substitutions with no token-resolution change) → (c) Tier 2 → (d) the type-scale refactor → (e) the remaining Tier 1 multipliers → (f) Tier 3.

Step (b) alone replaces **228 hairlines + 46 pressed opacities + 306 icon sizes = 580 literals, 27% of the total**, with no architectural change at all. It is by far the best ratio of value to risk in this domain.

---

## 6. Coverage

**100%** of `screens/`, `components/`, `ui/primitives/`, `ui/templates/`, `navigation/` was parsed.

Three stated limits:
- The analyzer counts **literal numbers in style properties**. A value computed from a local constant (`const TILE_HEIGHT = 120` then `height: TILE_HEIGHT`) counts as token-driven, because it is already named and centralized within its file — which is the right call for studio readiness, but means the true "magic number" count is somewhat higher than 2,155.
- Comments are stripped before counting, so the many documented master measurements in `screens/HomeScreen.tsx` do not inflate its 108.
- `.web.tsx` files are included in the table for completeness and marked frozen; `components/HotspotMap.web.tsx`'s 28 literals must not be touched.
