# Light-mode parity audit — 2026-08-22

Read-only findings. No application code, style, or asset was changed by this
audit. The question answered: **when only the palette flips from dark to
light, does every screen still work** — readable text, visible borders,
correct artwork, no dark-only treatment left stranded?

## Header

* **HEAD at audit time:** `81478c4` on `mainexpo` (after the Playfair commit
  `341fae8` and the orphan-asset deletion `81478c4`).
* **The four palette files:**
  * `ui/tokens.ts` — `light` and `dark` carry identical key sets, enforced at
    compile time (`satisfies Record<ColorToken, string>`) and by an executed
    test (`tests/themeTokens.test.mjs`). Complete.
  * `lib/theme.ts` — `colors` (light) and `darkColors` share one typed shape
    (`ColorPalette`); a missing key is a type error. Complete.
  * `lib/authTheme.ts` — deliberately has **no dark set**: the auth/launch
    flow renders on the light ivory brand palette by design, except the three
    golden-master screens that convert through `authSurface(palette, isDark)`.
    Zero light-mode risk by construction (its literals ARE the light values).
  * `hooks/useThemeColors.ts` — a thin, correct wrapper over
    `lib/ThemeContext.tsx`; consumers are fenced to it
    (`tests/themeResolution.test.mjs` forbids screens importing `ui/tokens.ts`
    directly, and a permanent hex-literal contract scans `screens/`,
    `components/`, `ui/`, `hooks/`, `navigation/`, `modes/`).
  * The **only** static imports of the dark palette anywhere are the resolver
    itself (`lib/ThemeContext.tsx`) and `lib/theme.ts` building `darkColors` —
    no screen or component can render a dark value in light by import.
* **Sweep sizes:** 481 `isDark` occurrences across 83 files; 162 hex hits
  across 16 files (38 outside the four palette files, of which 16 are comment
  prose and 22 are code); 16 `rgb/rgba(` hits (1 in code outside the palette
  files and the `withAlpha` serializer); 10 bundled-asset `require()` sites,
  4 of them dark-authored Prestige art.
* **Severity counts: P0 0 · P1 0 · P2 10.** Light mode has no unusable or
  clearly-wrong surface in this tree; every finding below is polish or a
  latent hazard.

---

## (a) Palette and resolution path

Verdict: sound. Key parity is compile- and test-enforced on both surfaces;
resolution is single-pathed through the provider; screens' local `colors` is
the resolved palette (`const { palette: colors, isDark } = useThemeColors()`),
so helpers like `emeraldColorsFor(colors)` follow the theme. One finding:

| # | Sev | Where | Symptom | Proposed fix |
|---|-----|-------|---------|--------------|
| L-001 | P2 | `lib/theme.ts:129` | The static `emeraldColors` export (the Emerald mapping frozen onto the LIGHT palette) has zero live consumers — it exists "for legacy/locked callers" that no longer exist, and any future import of it would paint values that never flip with the theme. | Delete the export (or mark it deprecated pointing at `emeraldColorsFor()`), in a commit that says so. |

## (b) Hardcoded colour literals outside the four palette files

22 code literals + 1 rgba survive outside the palette files. None is
dark-tuned, so none breaks light — but none can flip, which is why each is
recorded. The 16 comment-prose hits (9 `screens/HomeScreen.tsx`, 2
`screens/PostJobScreen.tsx`, 1 each in `screens/ServicesPricingScreen.tsx`,
`screens/WelcomeScreen.tsx`, `screens/VerifyPhoneScreen.tsx`,
`screens/EmailSignInScreen.tsx`, `components/HomeAtmosphere.tsx`) are prose,
not hazards, and are excluded. A permanent fence
(`tests/themeResolution.test.mjs`) already bans literals in `screens/`,
`components/`, `ui/`, `hooks/`, `navigation/`, `modes/` with a per-file
allowlist — but does **not** scan `lib/`.

| # | Sev | Where | Symptom | Proposed fix |
|---|-----|-------|---------|--------------|
| L-002 | P2 | `lib/jobs.ts:69-79` | The 11 category-badge colours (blue, teal, orange…) are fixed hexes that render identically in both themes; legible on light today, but invisible to the palette and OUTSIDE the hex-fence's scanned directories. | Move them to a named token group (or extend the fence to `lib/` with a recorded allowance saying they are theme-constant identity colours). |
| L-003 | P2 | `lib/hotspots.ts:32-35` | The 4 map heat-tier strokes (blue/green/amber/red) — same situation as L-002: theme-constant, fence-invisible. | Same treatment as L-002. |
| L-004 | P2 | `components/AuthNotice.tsx:31,50` | Notice text `#3E4F47` and wash `#F5E7E4` are light-tuned literals on the auth surface; correct in light, allowlisted because their token home (`lib/authTheme.ts`) was frozen when the fence landed. | Fold both into `lib/authTheme.ts` now that it is editable, and drop the allowlist entry. |
| L-005 | P2 | `components/CountryPicker.tsx:203` | Sheet scrim `rgba(11, 32, 25, 0.42)` is a hand-mixed near-ink that matches no token (ink is `19,32,27`); works in both themes but drifts from the one scrim vocabulary. | Replace with `withAlpha(authColors.ink, 0.42)` (or the palette ink) and drop its allowlist entry. |
| L-006 | P2 | `screens/VerifyPhoneScreen.tsx:519,523` | `#7A5A18` amber text on the resend/help copy — light-correct, on a light-by-decision auth screen, allowlisted. | Fold into `lib/authTheme.ts` (a `warnDeep` value) when that surface is next opened. |
| L-007 | P2 | `components/ModeTransitionOverlay.tsx:448` | Shimmer core `#FFF3D6` pairs with the baked LIGHT transition PNGs; correct in light, and its allowance is already on the record (migrates when dark variants of the PNGs are made). | No action until the transition assets get dark variants; then migrate both together. |
| L-008 | P2 | `dev-tools/HomeDesignStudio.tsx:107` | Studio chrome `#E8ECE9` — a dev-only web tool (`__DEV__` + web + `?studio=home`), unreachable in any production build. | Leave, or token-ify for tidiness; no user-facing risk. |
| L-009 | P2 | `components/HotspotMap.web.tsx:443` | `#e8eee9` map placeholder ground — lives on the FROZEN web surface no run may modify. | None available to a run; record only. Operator-owned if the web surface ever unfreezes. |

## (c) Palette-gated branches

Verdict: the sweep's idiom is uniformly light-complete. Of 481 `isDark`
occurrences, the dominant shape is `[styles.x, isDark && styles.xDark]` —
the light path is the base style by construction (203 `*Dark` style
applications, zero without a base). The JSX-level dark-only mounts are all
deliberate decoration with an approved light composition underneath:
`BrazosMonogram` watermarks (AccountSafety, PaymentMethods, Profile,
CompareBids), the Worker Home toolbox crop, and `HomeAtmosphere` (fails
closed: `if (!isDark) return null`). The five inverse gates (`!isDark`) are
light-only treatments (unread card, gold-outline chips, timeline dot) — light
is the side that HAS the treatment. One residue:

| # | Sev | Where | Symptom | Proposed fix |
|---|-----|-------|---------|--------------|
| L-010 | P2 | `screens/BidDetailScreen.tsx:201`, `screens/ProfileScreen.tsx:579`, `screens/SavedWorkersScreen.tsx:152` | In light, the bare `★` glyph on these three meta rows inherits the muted grey of the line it sits in (dark got the one gold-star treatment; `lib/theme.ts`'s own `starColors` docblock records "the light pass owns that call"). Stars read washed-out grey instead of gold in light. | Apply `starColors(palette, isDark).filled` on the light side of those three sites — the helper already expresses light correctly (`star` orange-gold). |

## (d) Baked-dark artwork

Verdict: clean — no dark-authored asset is reachable in light. All four
Prestige rasters are gated at their only render sites, and a roster fence in
`tests/themeResolution.test.mjs` stands behind them:

* `assets/prestige/hero_armchair_customer.png` — `screens/HomeScreen.tsx:433`, `isDark ?` ternary; light renders `assets/brand/customer-home-chair.png`.
* `assets/prestige/brazos_b_drape.png` — `screens/HomeScreen.tsx:622`, `isDark ?` ternary; light renders `assets/brand/brazos_b_drape.png`.
* `assets/prestige/hero_toolbox_worker.png` — `screens/WorkerHomeScreen.tsx:279`, `isDark ? <Image/> : null`; light keeps the approved full-width Heritage block.
* `assets/prestige/home-atmosphere-dark.png` — `components/HomeAtmosphere.tsx:56`, `if (!isDark) return null`.

The light-reachable rasters (`customer-home-chair`, brand `brazos_b_drape`,
`app-icon-v2`, `brazos-b-leaf`, both `transition-*` PNGs) are light-authored
or theme-neutral. (The transition PNGs lacking DARK variants is a known
dark-mode item on the record — not a light defect.)

## (e) Contrast hazards on light surfaces

Verdict: clean. Both `glow` call sites (`ui/primitives/BottomNav.tsx:313`,
`ui/primitives/Toggle.tsx:91`) are `isDark`-gated, so no gold halo lands on
cream. `selectedInDark()` is consumed only inside `*Dark` style keys or an
explicit `isDark ?` pick (`components/SegmentedControl.tsx:43`);
`scrimInDark()` only inside `backdropDark` keys, with the light scrims kept
(`text` @ 0.35 on dialogs, `ink` @ 0.45 on sheets — verified at
`components/ConfirmDialog.tsx:108`, `components/ReportDialog.tsx:179`,
`ui/primitives/Sheet.tsx:114`). The theme-constant tokens (`star`, `black`,
`white`, `mediaChrome`) each carry a recorded reason and read correctly on
light. Light's own hairlines (`border` `#DDD6C4`, `line` `#DDE2DD`,
`homeHairline` `#F1EAE2`) are Heritage values authored for the ivory ground.
No findings.

---

*No fix ordering is proposed and no batch is opened — the operator selects
what gets fixed.*
