# 05 — Theme parity

**Method:** the token surfaces were parsed and compared mechanically (`.audit-scratch/contrast.mjs`, `.audit-scratch/drift.mjs`, neither committed), and WCAG 2.1 relative-luminance ratios computed from the literal hex values. Every finding was then confirmed against the source.

---

## Summary

| Check | Result |
|-|-|
| Token surfaces | **3** — `ui/tokens.ts`, `lib/theme.ts`, `lib/authTheme.ts` |
| Key parity, `ui/tokens.ts` light ↔ dark | ✅ **compile-enforced** |
| Key parity, `lib/theme.ts` light ↔ dark | ✅ **compile-enforced** |
| Tokens referenced with no light value | **0** ✅ |
| Tokens defined but never used | 3 (`ui/tokens.ts`), listed below |
| **Palette values that have DRIFTED apart** | **6 — P1, caused by the uncommitted `ui/tokens.ts` edit** |
| Body-text pairs below 4.5:1 | **7** (2 dark, 5 light) |
| Large-text / UI pairs below 3:1 | **5** |
| Components that would render invisibly under the opposite palette | **0 confirmed** ✅ |

---

## 1. The theme architecture (VERIFIED)

```
ui/tokens.ts                       lib/authTheme.ts
  brand   (7 shared hues) ──┬────►   authColors = { ...brand, +17 auth-only hexes }
  colors  (light, 11+brand)─┤                       ↑ 23 importers (locked auth flow)
  dark    (18)              │
       │                    │
       └──► lib/theme.ts ───┘
              colors      (light, 38 keys — legacy in-app language)
              darkColors  (dark,  38 keys)
              emeraldColors (a light remap, 5 importers)
                    │
                    ▼
            lib/ThemeContext.tsx  ──►  hooks/useThemeColors.ts  ──►  113 files
```

**Adoption is excellent and consistent (VERIFIED):**

| Access path | Files |
|-|-|
| `useThemeColors()` — the single reactive read | **113** |
| `themedStyles(...)` — palette-keyed `StyleSheet` factory | **90** |
| imports from `lib/theme` | 100 |
| `authColors` (auth surface) | 17 |
| `emeraldColors` (light remap) | 5 |
| **direct `darkColors` import in a screen/component** | **0** ✅ |
| **direct `ui/tokens.ts` import in a screen** | **0** ✅ |

Only **three** files in `screens/ components/ ui/` reference no theme source at all, and all three are legitimately palette-free: `components/AvatarPressable.tsx` (delegates to `Avatar`), `components/BrandLogo.tsx` (renders a raster), `components/FadeIn.tsx` (an animation wrapper with no chrome).

`hooks/useThemeColors.ts:13` is a one-line delegation to `useTheme()`, not a second hook — and its comment states the discipline that keeps the system coherent: *"This hook deliberately does not touch `useColorScheme()`: the OS appearance is one of the INPUTS the provider resolves, not something each consumer samples for itself."*

---

## 2. Key parity is compile-enforced, both surfaces ✅ (VERIFIED)

**`ui/tokens.ts`** — `dark` closes with `as const satisfies Record<ColorToken, string>` (`:157`), where `ColorToken = keyof typeof colors` (`:100`). The comment at `:116-119` states the guarantee:

> *"`light` and `dark` carry IDENTICAL key sets… enforced at compile time by the `satisfies` clause on `dark`: a key added to `colors` without a dark counterpart, or a dark-only key, is a type error, not a runtime surprise."*

Verified: zero light-only keys, zero dark-only keys. (The parser reports 7 "dark-only" names — `forest`, `emerald`, `gold`, `goldSoft`, `mint`, `mint2`, `ink` — because `colors` reaches them through `...brand` rather than restating them. They are present in both; that is a parsing artifact, not a gap.)

**`lib/theme.ts`** — `darkColors: ColorPalette` where `ColorPalette = { [K in keyof typeof colors]: string }` (`:120`). Same guarantee by a different mechanism. Verified: 38 keys each way, zero light-only, zero dark-only.

**There are no tokens referenced with no light-mode value.** That question is structurally unanswerable in the affirmative here — the type system forbids it.

---

## 3. **Six palette values have drifted apart — P1 (VERIFIED)**

This is the most important finding in this domain, and it is live in the working tree right now.

`lib/theme.ts`'s `darkColors` mirrors seventeen `ui/tokens.ts` `dark` values. Thirteen of them do it **by reference** (`forest: emeraldDark.forest`, `mint: emeraldDark.mint`, …) and are therefore drift-proof. **Six do it by writing the hex literal again**, and the uncommitted edit to `ui/tokens.ts` moved the token without moving the copy:

| `lib/theme.ts` key | line | value it still holds | `ui/tokens.ts` `dark` token it mirrored | that token is now |
|-|-|-|-|-|
| `primary` | `:147` | `#1E3A2C` | `dark.forest` | **`#1B3527`** |
| `primarySoft` | `:149` | `#11241C` | `dark.mint` | **`#0E1F18`** |
| `homeBackground` | `:167` | `#03110E` | `dark.bg` | **`#02110D`** |
| `background` | `:176` | `#03110E` | `dark.bg` | **`#02110D`** |
| `surface` | `:180` | `#0E1D17` | `dark.surface` | **`#0A1813`** |
| `successBg` | `:189` | `#11241C` | `dark.mint` | **`#0E1F18`** |

**Method:** `.audit-scratch/drift.mjs` parsed both palettes at `HEAD` *and* in the working tree, established which literals were byte-identical to a `dark` token at `HEAD`, then re-tested each against the current tokens. All seventeen mirrors matched at `HEAD`; six no longer do. This is **VERIFIED** by direct comparison, not inferred.

**Why each one matters:**

- **`primary` / `forest`.** `lib/theme.ts:144-146` states the intent explicitly: *"the primary role IS emeraldDark.forest."* Every other brand hue on the line below is written as a reference (`forest: emeraldDark.forest`), but `primary` is a hand-copied literal. The identity the comment asserts is now false.
- **`background` / `homeBackground` / `bg`.** These three are supposed to be **one ground**. `screens/HomeScreen.tsx:863` says so in as many words: *"`background` are both #03110E at HEAD and agree. It is one ground and one…"*. They no longer agree. A screen reading `colors.background` and a primitive reading the token `dark.bg` now paint two slightly different near-blacks — the classic recipe for a visible seam where a `ScrollView`'s content box meets its container.
- **`surface`** is the card ground. `#0E1D17` versus `#0A1813` is a four-step difference on a surface that appears on nearly every screen.

**This is the same edit that turns the baseline red** (`01_environment.md` Finding #1). The tests catch the token change; **they do not catch the divergence it created**, because `emeraldFences.test.mjs:1436` asserts on `dark.bg` alone. So resolving Finding #1 by re-deriving the fences would leave this drift in place, silently.

**Recommendation, not applied.** Whichever way the operator resolves Finding #1, these six should become references rather than literals — `primary: emeraldDark.forest`, `background: emeraldDark.bg`, and so on — matching the thirteen that already are. That makes the class of bug unrepresentable rather than fixing one instance of it. Owner class **STRUCTURE**, and it must be sequenced **after** the operator settles the dial values.

---

## 4. WCAG contrast

Computed from literal hex values using the WCAG 2.1 relative-luminance formula. Thresholds: **4.5:1** body text, **3:1** large text (≥18.66px regular / ≥14px bold) and non-text UI boundaries (SC 1.4.11).

### 4.1 Dark palette (`ui/tokens.ts` `dark`) — strong

| fg / bg | ratio | body 4.5 | large 3.0 |
|-|-|-|-|
| `ink` / `bg` | **16.48** | PASS | PASS |
| `ink` / `surface` | 15.56 | PASS | PASS |
| `ink` / `mint` | 14.61 | PASS | PASS |
| `onForest` / `forest` | 11.32 | PASS | PASS |
| `warn` / `bg` | 10.20 | PASS | PASS |
| `ink` / `mint2` | 9.02 | PASS | PASS |
| `gold` / `bg` | 8.33 | PASS | PASS |
| `emerald` / `bg` | 7.22 | PASS | PASS |
| `muted` / `bg` | 7.08 | PASS | PASS |
| `gold` / `forest` | 5.72 | PASS | PASS |
| `navInactive` / `bg` | 5.33 | PASS | PASS |
| `danger` / `bg` | 5.23 | PASS | PASS |
| `emerald` / `forest` | 4.96 | PASS | PASS |
| `danger` / `surface` | 4.94 | PASS | PASS |
| **`danger` / `dangerSurface`** | **4.18** | **FAIL** | PASS |
| **`line` / `bg`** | **2.16** | FAIL | **FAIL** |
| **`line` / `surface`** | **2.04** | FAIL | **FAIL** |

The Prestige dark palette is genuinely well-built — every text role clears 4.5:1 comfortably, most by a wide margin.

### 4.2 Light palette (`ui/tokens.ts` `colors`)

| fg / bg | ratio | body 4.5 | large 3.0 |
|-|-|-|-|
| `danger` / `surface` | 6.61 | PASS | PASS |
| `danger` / `bg` | 5.96 | PASS | PASS |
| `danger` / `dangerSurface` | 5.49 | PASS | PASS |
| `warn` / `surface` | 4.67 | PASS | PASS |
| `muted` / `surface` | 4.63 | PASS | PASS |
| **`warn` / `bg`** | **4.21** | **FAIL** | PASS |
| **`muted` / `bg`** | **4.17** | **FAIL** | PASS |
| **`navInactive` / `surface`** | **3.33** | FAIL | PASS |
| **`navInactive` / `bg`** | **3.00** | FAIL | PASS (exactly at threshold) |
| **`line` / `bg`** | **1.18** | FAIL | **FAIL** |
| **`line` / `surface`** | **1.31** | FAIL | **FAIL** |

### 4.3 Legacy palette (`lib/theme.ts`) — where the real problems are

**Light:**

| fg / bg | ratio | body 4.5 | large 3.0 |
|-|-|-|-|
| `text` / `surface` | 14.26 | PASS | PASS |
| `text` / `background` | 12.63 | PASS | PASS |
| `primary` / `surface` | 9.63 | PASS | PASS |
| `onPrimary` / `primary` | 8.53 | PASS | PASS |
| `homeSlate` / `homeBackground` | 5.63 | PASS | PASS |
| `danger` / `dangerBg` | 4.56 | PASS | PASS |
| `textMuted` / `surface` | 4.81 | PASS | PASS |
| **`warning` / `warningBg`** | **4.27** | **FAIL** | PASS |
| **`textMuted` / `background`** | **4.26** | **FAIL** | PASS |
| **`success` / `successBg`** | **4.20** | **FAIL** | PASS |
| **`navInactive` / `background`** | **2.95** | FAIL | **FAIL** |
| **`textSubtle` / `surface`** | **2.62** | FAIL | **FAIL** |
| **`textSubtle` / `background`** | **2.32** | FAIL | **FAIL** |
| **`star` / `surface`** | **2.15** | FAIL | **FAIL** |

**Dark:**

| fg / bg | ratio | body 4.5 | large 3.0 |
|-|-|-|-|
| `text` / `background` | 16.45 | PASS | PASS |
| `onPrimary` / `primary` | 10.57 | PASS | PASS |
| `warning` / `warningBg` | 8.73 | PASS | PASS |
| `textMuted` / `background` | 7.07 | PASS | PASS |
| `success` / `successBg` | 6.08 | PASS | PASS |
| `textSubtle` / `background` | 5.32 | PASS | PASS |
| **`danger` / `dangerBg`** | **4.30** | **FAIL** | PASS |
| **`primary` / `background`** | **1.56** | FAIL | **FAIL** |
| **`primary` / `surface`** | **1.41** | FAIL | **FAIL** |

### 4.4 Reading the failures honestly

Not every FAIL is a defect. Sorted by whether it actually matters:

**Not defects — correct by role:**
- **`line` / `border` at 1.18–2.16.** These are hairline dividers. A divider is *supposed* to be barely-there; WCAG's 3:1 applies to UI components that convey state or boundaries a user must perceive, not to decorative rules. The dark palette's `line` (`#55482E`) is additionally load-bearing as a *design* decision — `ui/tokens.ts:145-148`: *"`line` stays the flat equivalent of a dim gold hairline — a warm metal, not a neutral grey: that is what makes Prestige read as Prestige."* **Leave alone.**

**Real, and worth fixing:**

- 🔴 **`primary` / `background` = 1.56 in dark (`lib/theme.ts:147` vs `:176`).** `primary` is a **fill** — buttons, selected chips, own chat bubbles, progress dots (its own comment at `:29-31` lists exactly those). A forest fill at 1.56:1 against the near-black ground means a filled primary button is very nearly indistinguishable from the page it sits on. Its *label* is fine (`onPrimary`/`primary` = 10.57), so the text is readable — but the **button's shape is not**. That is a WCAG 1.4.11 non-text-contrast failure on the app's most important control. **And §3 makes it worse:** `primary` is one of the six drifted literals, so it is currently a *stale* forest that no longer even matches the token it was copied from.

- 🟠 **`textSubtle` in light — 2.32 on `background`, 2.62 on `surface` (`lib/theme.ts:82`).** This is a text token, used for tertiary captions, and it fails both thresholds by a wide margin. `#9AA38F` on `#F4F1E8` is not readable body copy. Its dark counterpart is fine (5.32). **This is the clearest single accessibility defect found.**

- 🟠 **`star` / `surface` = 2.15 (`lib/theme.ts:38`, `#F59E0B` on white).** Amber on white. Rating stars are conventionally amber and the token's comment defends that (*"gold stars are a near-universal convention independent of theme"*), and a star is a filled glyph rather than text — so 3:1 is the applicable bar, and it misses that too. If stars ever carry a numeric rating in the same color, that number is unreadable. **NEEDS OPERATOR DECISION** — convention versus contrast is a design call, not an engineering one.

- 🟠 **`navInactive` — 2.95 light (`lib/theme.ts`) / 3.00 light (`ui/tokens.ts`).** Inactive tab labels, sitting exactly on or just under the large-text threshold. Tab labels are small text, so 4.5:1 is arguably the right bar and both fail it. Dark is fine (5.33).

- 🟡 **`muted`/`bg` 4.17, `warn`/`bg` 4.21, `textMuted`/`background` 4.26, `success`/`successBg` 4.20, `warning`/`warningBg` 4.27, dark `danger`/`dangerBg` 4.30, dark `danger`/`dangerSurface` 4.18.** Seven pairs clustered in the 4.17–4.30 band — all just under 4.5:1. Each would clear the bar with a one-step luminance nudge. These are **DIAL** findings: exact values are the operator's call, and the range needed is small and well-defined.

**The pattern worth naming:** every one of these sits in `lib/theme.ts`'s legacy palette or in the light half. The **Prestige dark palette that was pixel-derived from the masters passes essentially everything**. The accessibility debt is entirely in the older light-mode language that `ui/tokens.ts:63-68` already describes as *"deliberate and documented: the legacy values stay put so existing screens don't shift… A later phase migrates screen by screen."* That later phase has a concrete, measured target list now.

---

## 5. Components that render invisibly under the opposite palette — none confirmed ✅

Every hardcoded hex from `02_invariants.md` §I-7 was checked against both palettes for an invisible-text or invisible-surface outcome:

| hex | site | light | dark | verdict |
|-|-|-|-|-|
| `#6A736C` | `screens/HomeScreen.tsx:935` | n/a | vs `bg` `#02110D` = **4.16:1** | dark-only style (`modeSwitchDark`), border, adequate |
| `#0DBC5A` | `screens/BrowseJobsScreen.tsx:45` | on `#F4F1E8` = 2.09 | on `#03110E` = 6.65 | a **dot/track fill**, not text — and the screen is dead |
| `#7A5A18` | `screens/VerifyPhoneScreen.tsx:519,523` | on `#F6F3EA` = 6.28 | — | auth surface is **light-only**; fine |
| `#3E4F47` | `components/AuthNotice.tsx:31` | on `#F5E7E4` = 8.29 | — | light-only auth surface; fine |
| `#F5E7E4` | `components/AuthNotice.tsx:50` | a surface fill | — | light-only; fine |
| `#FFF3D6` | `components/ModeTransitionOverlay.tsx:449` | a fill on a branded transition panel | | not text |

**No invisible-text case exists.** The reason is structural: the auth flow that carries most of the hardcoded values renders on a light-only surface by design (`lib/authTheme.ts:16-18` — *"the auth flow is the one part of the app that renders on the emerald/ivory brand palette"*), so there is no dark path for those literals to break in.

`screens/BrowseJobsScreen.tsx:45`'s `AVAILABILITY_ONLINE_COLOR = '#0DBC5A'` is nonetheless a genuine hygiene finding for a different reason: it is **byte-identical to `lib/theme.ts:75`'s `homeLive` token**, which does have a dark counterpart (`emeraldDark.emerald`). A token existed and a literal was written anyway. It is moot today only because the screen is dead.

---

## 6. `homeSlate` — a token that exists only in the wrapper (P3, VERIFIED)

`lib/theme.ts:68` (light `#526477`) and `:168` (dark `#93A096`) define `homeSlate`. **It does not exist in `ui/tokens.ts`.**

It is used in **12 places**: `screens/HomeScreen.tsx:792, 805, 884, 976, 1231, 1236, 1240, 1254, 1258`, `screens/BrowseJobsScreen.tsx:519`, `screens/WorkerHomeScreen.tsx:546`, `dev-tools/HomeDesignStudio.tsx:128`.

CLAUDE.md says *"Token source of truth: `ui/tokens.ts`. `lib/theme.ts` wraps it."* A token that lives only in the wrapper inverts that. Contrast is fine in both palettes (5.63 light on `homeBackground`, 7.07 dark), so this is hygiene, not a defect. The same is true of `homeHairline`, `homeLive`, `homeLiveHalo` — four Home-specific tokens that live one level below the stated source of truth.

Note the collision this creates: `emeraldFences.test.mjs:1021` asserts `screens/HomeScreen.tsx` uses `colors.homeSlate` for the mode-switch ring, while the working tree replaced it with the literal `'#6A736C'`. So the one token that lives in the wrapper is also the one currently being bypassed.

---

## 7. Tokens defined but never used

| token | defined | used |
|-|-|-|
| `ui/tokens.ts` `dangerBorder` | `:88` | 0 direct references outside the definition |
| `ui/tokens.ts` `secondaryBorder` | `:90` | 0 direct references |
| `lib/theme.ts` `mediaChrome` | `:114` | 1 (`components/JobVideo.tsx`) — used, listed for completeness |

`dangerBorder` and `secondaryBorder` are §I-specified values with dark counterparts that no component reads. Harmless; they cost nothing and complete the palette. **P3, note only.**

`ui/tokens.ts:396` also exports an unused `ButtonVariant` type — see `10_dead_code.md` §B1.

---

## 8. The third token surface

`lib/authTheme.ts` is covered in full at `02_invariants.md` §I-25 and is not re-argued here. Two points relevant to *parity* specifically:

1. It is **light-only by design** — there is no `authDark`. That is correct (the auth flow renders on one palette), and it is why none of its 17 hexes can produce a dark-mode failure.
2. It declares parallel **non-color** scales — `authRadius:76`, `authSpacing:86`, `authSizes:101`, `authType:132`, `authShadows:167` — that shadow `ui/tokens.ts`'s `radius`, `spacing`, `controls`, `typography`, `shadows`. Four of its color values (`bg` `#F6F3EA`, `surface`, `muted`, `line`) are **byte-identical to `ui/tokens.ts`'s `colors`**. Those four could be spread from `colors` the way the seven brand hues already are at `:31`, shrinking the surface without changing a pixel. `lib/authTheme.ts` is on this run's locked list, so this is a recommendation for the operator, not an action.

---

## 9. Coverage

**100%** of both token surfaces and all 52 screens + 62 components were inventoried for theme source.

Two stated limits:
- **Contrast was computed on token *pairs*, not on rendered output.** Where a screen composes a token with `withAlpha()` (`ui/colorAlpha.ts`) or layers it over the `home-atmosphere-dark.png` raster, the effective ratio differs from the table. `components/HomeAtmosphere.tsx:42` notes the atmosphere layer is not flat — *"a 5.5x lift, and dark throughout"* — so dark-mode ratios over that region are approximations. Settling them requires rendering, which `scripts/home-shots.mjs` can do and this read-only audit did not.
- The pair list in §4 covers the combinations the app actually uses, chosen by reading the screens; it is not the full Cartesian product of 38 × 38 tokens.
