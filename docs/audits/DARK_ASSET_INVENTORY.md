# Dark asset inventory — the operator's generation brief (Stage 4D-4, commit 5)

Written 2026-08-18 by the 4D-4 run. PRE-DECIDED: this run generates and edits
no image assets. This file is the complete list of raster assets that read
wrong on a dark background, where each renders, and what its dark variant
needs — so generating them later is one sitting of design work, not a hunt.

**Why nothing needed a code change in this commit:** after the commit-3 sweep,
every raster brand asset in the app renders either on a LOCKED light screen
(which stays light by operator decision until unlocked) or inside the
mode-transition panel, whose artwork carries its own baked background — i.e.
each light asset already sits on a correctly-toned light container. There is
no site where a light-baked image floats on a theme-driven surface. The first
unlock session changes that, which is when this list gets spent.

## Needs a dark variant (blocking a fully dark experience)

| Asset | Renders at | What the dark variant needs |
| --- | --- | --- |
| *(native splash — no `splash` key in app.json today)* | Cold start, before the first JS frame, every launch | Today the splash is Expo's default white — in dark mode every cold start opens with a white flash before the launch layer paints. The dark variant is CONFIG plus (optionally) art: an `expo-splash-screen`/`splash` config carrying `backgroundColor` `#0A1613` (ui/tokens `dark.bg`) with `dark` variant support, ideally with the leaf mark on it. Deliberately NOT changed this run (pre-decided: splash config rides the next asset pass). |
| `assets/brand/transition-customer.png` | ModeTransitionOverlay — the Customer→Worker/Worker→Customer switch panel | 1192×1319 artwork with baked ivory background and printed gold line. Dark variant: same composition on `#0A1613`/`#132A22`, gold line kept (the shimmer geometry in components/modeTransitionAssets.ts is measured per-image — re-measure for the new files). The overlay's `'#FFF3D6'` shimmer-core allowance migrates with these. |
| `assets/brand/transition-worker.png` | Same panel, other direction | Same spec as its sibling. |
| `assets/brand/customer-home-chair.png` | screens/HomeScreen.tsx (LOCKED) hero | Illustration sits on Home's warm cream. Dark variant: re-render on transparent or on `dark.surface` tone so the hero can sit on a dark card; wanted the day Home unlocks. |
| `assets/brand/customer-home-post-mark-hd.png` | screens/HomeScreen.tsx (LOCKED) post-job mark | Same treatment as the chair. |
| `assets/brand/worker-home-toolbox.png` | screens/BrowseJobsScreen.tsx (LOCKED atlas 48 — currently UNMOUNTED) | Lowest priority: the screen is on disk but not in either tree. Dark variant only if 48 remounts. |

## Reads acceptably in both themes (verify on device, likely no work)

| Asset | Renders at | Note |
| --- | --- | --- |
| `assets/brand/brazos-b-leaf.png` | components/BrandLogo.tsx → LOCKED auth screens (SignIn, EmailSignIn, CreateAccount…) | Emerald tile with squircle alpha mask — no baked white backing. Auth stays light this run, so nothing renders it on dark today; when auth unlocks, check the emerald tile against `dark.bg` (likely fine, tile is self-contained). |
| `assets/brand/app-icon-v2.png` | screens/LaunchScreen.tsx (LOCKED) | Same emerald tile family, on the launch layer's own branded background — the launch layer is light by design and covers the theme gate. |
| `assets/icon.png` | Home-screen icon, `expo.icon`, Android adaptive foreground | OS chrome, not a themed surface. iOS 18 dark/tinted icon variants are a nice-to-have: would need `ios.icon` dark/tinted entries — config work for the asset pass. |
| `assets/favicon.png` | Web only (frozen surface) | Out of scope — iOS is the product. |

## On disk but referenced by nothing (no dark work; candidates for a cleanup pass)

| Asset | Note |
| --- | --- |
| `assets/splash-icon.png` | Not wired into any `splash` config — see the splash row above; use it (or its dark twin) when the splash config lands. |
| `assets/android-icon-background.png`, `assets/android-icon-foreground.png`, `assets/android-icon-monochrome.png` | Unreferenced (app.json's adaptiveIcon points at `assets/icon.png` + `#082F27`). Android is deferred. |
| `assets/brazos-logo-source.png` | Source art for the mark; never rendered. |

## Vector surfaces already theme-correct (for completeness)

Ionicons glyphs, components/MapPinIcon.tsx, and every UI surface swept in
commit 3 read the resolved palette — no raster involved, nothing to generate.
