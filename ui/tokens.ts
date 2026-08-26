import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * BRAZOS Emerald Trust — the authoritative design tokens.
 *
 * Source of truth: BRAZOS_MASTER_PLAN.md §I, which itself states the values
 * were "extracted verbatim from the locked screens' stylesheet (style.css)".
 * Nothing here is invented: every colour below is either quoted directly from
 * §I or is an existing repo value already confirmed byte-identical to it
 * (see docs/emerald-v2/DESIGN_SYSTEM_STATUS.md's verification table).
 *
 * WHY THIS FILE EXISTS, AND WHAT IT DOES NOT DO
 * Phase 0 found three overlapping sources of visual truth: lib/theme.ts (the
 * in-app palette), lib/authTheme.ts (the auth-surface palette), and scattered
 * inline constants. This file is the single authoritative one going forward.
 * It does NOT restyle anything that already exists: lib/theme.ts and
 * lib/authTheme.ts now import their shared brand hexes from `brand` below, so
 * there is one definition of "forest" in the codebase instead of three — but
 * every value they export is unchanged, so screens 01-07 and 48 (LOCKED)
 * render exactly as before. New screens import from here; legacy screens keep
 * working untouched until a later phase migrates them deliberately.
 *
 * REFERENCE-VS-DEVICE CONFLICTS ARE RESOLVED TOWARD THE DEVICE
 * §I's control sizes come from a 390x844 static mock that packs 66 screens,
 * so its buttons are 38pt tall and some of its type is 9-11pt. CLAUDE.md's
 * mobile rules require touch targets >= 44pt, and CLAUDE.md explicitly
 * overrides. Where the two disagree the reference number is recorded in a
 * comment and the shipped value is the one that works on a real phone — the
 * same resolution lib/authTheme.ts already made for the auth surface.
 */

// ---------------------------------------------------------------------------
// Brand colours (§I, verbatim)
// ---------------------------------------------------------------------------

/**
 * The seven Emerald brand hues. Declared `as const` so consumers that re-export
 * them (lib/theme.ts) keep their literal types rather than widening to string.
 *
 * These exact seven were verified in Phase 0 as already byte-identical in both
 * lib/theme.ts and lib/authTheme.ts — which is why re-pointing those files at
 * this object is a pure de-duplication with no visual consequence.
 */
export const brand = {
  /** --forest — primary fill for CTAs, display titles, active nav. */
  forest: '#064C3B',
  /** --emerald — lighter accent green for glyphs and eyebrows on cream. */
  emerald: '#0D6B52',
  /** --gold — sparkle accents, small-caps eyebrows, the brand monogram. */
  gold: '#C8A15B',
  /** --gold-soft — the blush/sand wash behind decorative artwork. */
  goldSoft: '#F3E7CE',
  /** --mint — sage fill for category tag pills. */
  mint: '#E5F1EC',
  /** --mint2 — one step deeper than mint, for borders on sage surfaces. */
  mint2: '#D3E8DF',
  /** --ink — near-black for display headlines. */
  ink: '#13201B',
} as const;

/**
 * The full §I palette. `bg`/`muted`/`line`/`danger` are §I's exact values —
 * note these differ slightly from lib/theme.ts's older in-app equivalents
 * (`background` #F4F1E8, `textMuted` #6B7566, `border` #DDD6C4, `danger`
 * #A8432B). That divergence is deliberate and documented: the legacy values
 * stay put so existing screens don't shift, and new screens built on these
 * templates get §I's real numbers. A later phase migrates screen by screen.
 */
export const colors = {
  ...brand,

  /** --bg — the warm ivory page background. */
  bg: '#F6F3EA',
  /** --surface — cards and sheets. */
  surface: '#FFFFFF',
  /** --muted — secondary text. */
  muted: '#6E7771',
  /** --line — hairline borders and dividers. */
  line: '#DDE2DD',
  /** --danger — destructive text and icons. */
  danger: '#9C3F35',

  /** Hot-amber warning accent — delete-account gates, warning headings
   *  (Prestige masters 31/32/41). A warning is amber in BOTH palettes and is
   *  never the danger red; the masters draw no red control at all. */
  warn: '#9A6B1F',

  /** §I: "danger surfaces #F5E7E4 / border #E9CAC5". */
  dangerSurface: '#F5E7E4',
  dangerBorder: '#E9CAC5',
  /** §I: "secondary border #CBE0D7" — the outline on mint/secondary controls. */
  secondaryBorder: '#CBE0D7',
  /** §I: "inactive nav #839087". */
  navInactive: '#839087',

  /** Content colour on a forest/emerald fill. Not a §I token — §I names the
   *  primary button "forest/white", so this is that white, given a name so
   *  callers stop writing '#FFFFFF' inline. */
  onForest: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;

/** A resolved §I palette — either `light` or `dark` below. What the theme
 *  hook hands to ui/ primitives and templates (4D-4). */
export type EmeraldPalette = Record<ColorToken, string>;

// ---------------------------------------------------------------------------
// Dual palettes — Heritage (light) and Emerald Prestige (dark)
// ---------------------------------------------------------------------------

/**
 * The Heritage light palette — exactly the §I palette above, under the name
 * the theme system resolves. `light` and `dark` carry IDENTICAL key sets
 * (STAGE4D_PLAN.md "Theme system"), enforced at compile time by the
 * `satisfies` clause on `dark`: a key added to `colors` without a dark
 * counterpart, or a dark-only key, is a type error, not a runtime surprise.
 */
export const light = colors;

/**
 * Emerald Prestige v2 — the dark palette, pixel-derived from the 43 golden
 * masters in docs/mockups/ (canonical values in BRAZOS_MOCKUP_MANIFEST.md's
 * measured-palette table; batch log in docs/mockups/PRESTIGE_RUN_REPORT.md).
 *
 * v2 INVERTS v1's gold-primary premise: `forest` is a DEEP GREEN again — the
 * one solid conversion fill of the whole master set — and `gold` is metal
 * line-work (eyebrows, hairlines, icons, rings), never a fill. Cream/gold
 * content on a forest fill is therefore correct in dark, exactly as in
 * light; `onForest` is the cream ink. Emphasized borders are gold through
 * withAlpha, never a new hex. `line` stays the flat equivalent of a dim gold
 * hairline — a warm metal, not a neutral grey: that is what makes Prestige
 * read as Prestige. `emerald` is the live-state color (money, Open, unread,
 * active nav); `warn` is the hot amber of the delete gates.
 */
export const dark = {
  forest: '#1B3527',
  emerald: '#5FAE81',
  gold: '#D4A24C',
  goldSoft: '#251E10',
  mint: '#0E1F18',
  mint2: '#254539',
  ink: '#F1EDE1',

  bg: '#02110D',
  surface: '#0A1813',
  muted: '#93A096',
  line: '#55482E',
  danger: '#D8604B',
  // Danger SURFACES keep their pre-v2 values by decision.
  dangerSurface: '#33201B',
  dangerBorder: '#4C2E26',
  secondaryBorder: '#2F5140',
  navInactive: '#7C8A80',
  onForest: '#F1EDE1',
  warn: '#F2B04F',
} as const satisfies Record<ColorToken, string>;

export { withAlpha } from './colorAlpha';

// ---------------------------------------------------------------------------
// Spacing (§I: 4-base — 4/8/12/16/20/24/32)
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/**
 * The bottom nav bar's geometry, declared ONCE (emerald D3/emerald(3)).
 *
 * ui/primitives/BottomNav.tsx reads both of these for the bar it configures,
 * and every screen's bottom clearance below is derived from the same two
 * numbers — so a change to the bar's height can never desynchronise the
 * screens that have to clear it.
 *
 * RUN PJ1 (C9) — THE BAR IS ATTACHED AND LARGER, on confirmed operator
 * decision, reversing the floating pill (56ff86a / RUN GROUND1 era): flush
 * to the bottom edge, full width, no side insets, with the home-indicator
 * inset carried INSIDE the bar as bottom padding. The content height rises
 * 25% (70 → 88) with the glyphs and labels scaled in proportion — the newest
 * Home master (44, 853x1844) still draws the ~65pt floating pill this
 * decision reverses, so its bar proportions are recorded in the run report
 * rather than matched. FLOATING_NAV_GAP survives as a design quantity, not a
 * float: it is the breathing room a pinned footer or composer keeps above
 * the bar (PINNED_FOOTER_BOTTOM_PADDING derives from it).
 */
const FLOATING_NAV_HEIGHT = 88;
const FLOATING_NAV_GAP = 12;

/** §I: "screen gutter 16; card padding 14; card gap 10". */
export const layout = {
  screenGutter: 16,
  cardPadding: 14,
  cardGap: 10,
  /** The bar's CONTENT height — the device's bottom inset rides inside the
   *  bar as padding on top of this (PJ1 C9). ui/primitives/BottomNav.tsx's
   *  TAB_BAR_CONTENT_HEIGHT is this value. The name keeps its history; the
   *  bar no longer floats. */
  floatingNavHeight: FLOATING_NAV_HEIGHT,
  /**
   * A pinned footer or composer's breathing room above the bar
   * (PINNED_FOOTER_BOTTOM_PADDING in ui/primitives/BottomNav.tsx), so its
   * controls never sit flush against the bar's top hairline. PJ1 (C9): the
   * bar itself no longer uses this as a margin — it is attached, full width,
   * flush to the bottom edge. The name keeps its history.
   */
  floatingNavGap: FLOATING_NAV_GAP,
  /**
   * §I: "bottom content never collides with the floating nav (respect its
   * 68pt + margins)".
   *
   * THIS IS NO LONGER A TOKEN. §I's flat 68 was the whole defect emerald(3)
   * fixes: the pill's real footprint is its height PLUS the margin that floats
   * it, and that margin grows to the device's home-indicator inset (34 on a
   * notched iPhone), so the true clearance is 82–104 depending on the device.
   * 68 was short of it on every notched phone, which is why surfaces that
   * already applied this token — Notifications, Services & availability,
   * Delete account — still scrolled under the pill on the device pass.
   *
   * A static token cannot express a runtime inset, so the clearance is now the
   * `useFloatingNavClearance()` hook in ui/primitives/BottomNav.tsx, derived
   * from floatingNavHeight and floatingNavGap below. The two numbers stay here
   * because they are design values; the arithmetic that needs the device lives
   * with the bar.
   */
  /**
   * On a wide window the mobile composition centres rather than stretching.
   * Mirrors lib/authTheme.ts's existing maxContentWidth for the same reason.
   */
  maxContentWidth: 420,
} as const;

// ---------------------------------------------------------------------------
// Radii (§I: xs 10 · sm 13 · md 14 · lg 17 · xl 20 · xxl 22 · pill 999)
// ---------------------------------------------------------------------------

export const radius = {
  xs: 10,
  sm: 13,
  md: 14,
  lg: 17,
  xl: 20,
  xxl: 22,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Typography (§I's scale)
// ---------------------------------------------------------------------------

/**
 * §I names Inter. NOTHING IS BUNDLED AND NOTHING IS A SERIF.
 *
 * No font file is REGISTERED by this app: App.tsx names no face and there is
 * no `useFonts` anywhere. (`assets/fonts/PlayfairDisplay-Bold.ttf` is still on
 * disk — recovered 2026-08-22, orphaned again 2026-08-23 — but nothing
 * requires it, so nothing bundles it.) Every role below resolves to the
 * platform's own system sans, the same family body copy has always used.
 *
 * FOUR decisions arrived at that. The first three were all 2026-08-22
 * (docs/emerald-v2/DECISIONS.md D5 carries them in order): bundle Playfair
 * Display for the three large heading roles; reverse that in full AND retire
 * the platform serif (Georgia on iOS) that had predated it; then re-bundle
 * Playfair for the customer Home hero title alone. The fourth, on 2026-08-23,
 * keeps that ONE serif role and moves it to the platform's Georgia — so the
 * app is back to shipping no font file at all. That role lives on
 * `lib/theme.ts`'s `fonts.displayHero`; every role below stays sans.
 *
 * `display` survives as a NAMED ROLE, not as a different face: roughly sixty
 * screen styles reach the heading voice through `fonts.display`, and keeping
 * it means the heading voice stays ONE lever rather than sixty. It resolving
 * to the same family as `body` today is the point, not an oversight.
 *
 * CONSEQUENCE FOR WEIGHT. With a real file bundled, iOS picks the face from
 * the family name and `fontWeight` goes inert; with nothing bundled it is
 * load-bearing again, and it is how the heading roles below get their
 * weight. Removing a `fontWeight` here renders that heading at normal.
 *
 * tests/themeTokens.test.mjs fences this state: it fails if any `fontFamily:`
 * in the tree names anything but these tokens, or if a `.ttf` reappears.
 */
export const fonts = {
  /** The heading voice. The system sans — see above; it is a distinct ROLE,
   *  not a distinct face, and it is the one lever for every heading style
   *  that names `fonts.display`. */
  display: undefined as TextStyle['fontFamily'],
  /** System sans. Explicitly undefined rather than a name, so each platform
   *  resolves its own default rather than us guessing at one. */
  body: undefined as TextStyle['fontFamily'],
} as const;

/**
 * §I's type scale, mapped px -> pt. `eyebrow` carries §I's full spec
 * (9/800, letter-spacing 1.2, uppercase, emerald) as a ready-to-spread style.
 *
 * The small end (`sub` 11, `caption` 10) is §I's own value and is kept: these
 * are secondary/caption roles, not body copy, and unlike touch targets there
 * is no CLAUDE.md rule they violate.
 *
 * home(3) — LETTER SPACING ON THE HEADING ROLES. The three heading roles carry
 * `letterSpacing: -1`. It was measured against a display serif set at 21pt and
 * up, which tracks loose by default; pulling it in a point is what makes a
 * heading read as one word shape rather than a row of letters. 2026-08-22:
 * those roles are now the system sans, which tracks tighter to begin with, and
 * this value is left exactly as it was — an OPERATOR DIAL to be re-measured on
 * device, not something this run guessed at. It is deliberately NOT applied to
 * `title`, `body`, `sub`, `caption` or `eyebrow`: negative tracking closes up
 * small type until it smudges, and `eyebrow` wants the opposite (its +1.2 is
 * what makes 9pt uppercase legible). The same three-role decision is mirrored
 * in lib/theme.ts's `typography`, and tests/emeraldFences.test.mjs holds the
 * two surfaces to it.
 */
export const type = {
  // The fontWeight on these three is load-bearing, not decoration: no face is
  // bundled, so iOS resolves the weight itself. See the `fonts` docblock.
  display: { fontSize: 28, lineHeight: 29, fontWeight: '800', fontFamily: fonts.display, letterSpacing: -1 },
  h1: { fontSize: 26, fontWeight: '800', fontFamily: fonts.display, letterSpacing: -1 },
  h2: { fontSize: 21, fontWeight: '700', fontFamily: fonts.display, letterSpacing: -1 },
  // Prestige decision 9: card titles join the heading voice, both themes. At
  // 15pt it stays on default tracking — see the docblock above.
  title: { fontSize: 15, fontWeight: '700', fontFamily: fonts.display },
  body: { fontSize: 14, fontWeight: '400' },
  sub: { fontSize: 11, fontWeight: '500' },
  caption: { fontSize: 10, fontWeight: '500' },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------------------
// Shadow (§I: color #10261D, opacity 0.08, radius ~14, offset (0,5), elev ~3)
// ---------------------------------------------------------------------------

export const shadows: Record<'card' | 'cardDark', ViewStyle> = {
  card: Platform.select({
    // boxShadow on web avoids RN-web's shadow* deprecation warnings, the same
    // way lib/theme.ts already handles it.
    web: { boxShadow: '0 5px 14px rgba(16,38,29,0.08)' },
    default: {
      shadowColor: '#10261D',
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
  }) as ViewStyle,
  /**
   * RUN GROUND1 (C4) — THE SAME DEPTH, FOR A GROUND THAT IS NEARLY BLACK.
   *
   * `card` above is arithmetically incapable of casting a shadow in the dark
   * palette, and this is not a matter of degree. Its colour is #10261D, whose
   * relative luminance is 32.7/255; the dark page ground is #02110D at 13.5
   * and the atmosphere raster over it measures about 11.5. Compositing 8% of
   * something BRIGHTER than the surface it lands on does not darken that
   * surface — it lifts it, by about a tenth of a level. Every card in dark has
   * therefore been drawing a shadow that either does nothing or very slightly
   * glows, and the promo card's edge has had nothing but its own hairline to
   * separate it from the page.
   *
   * SO THE COLOUR IS BLACK AND THE OPACITY IS REAL. A shadow can only be
   * darker than the thing it falls on, and on this ground the only colour that
   * is darker is black. 0.5 over a ground at 11.5 leaves 5.8 directly under
   * the card — a step of about 6/255 at full strength, and a measurable one at
   * the edges where the blur has thinned it.
   *
   * AND IT IS DELIBERATELY NOT STRONGER. ui/primitives/BottomNav.tsx records
   * an operator rejection of a black drop shadow on this same ground — 0.28 at
   * radius 8 under the [ + ] tile "read as a hole punched under" it — and the
   * lesson taken from that is about CONCENTRATION rather than about black:
   * that shadow was tight enough to draw a second dark ring. 16 of blur under
   * a 6pt offset spreads the same ink over roughly four times the area, so it
   * reads as the card lifting rather than as a mark on the page.
   *
   * DARK ONLY, AND THAT IS A DEPARTURE. tests/themeTokens.test.mjs's parity
   * fence holds that a theme decision may change a colour and nothing else —
   * shadowOpacity and shadowRadius are on its list by name. This token changes
   * both, per theme, on operator instruction (RUN GROUND1 C4), and it follows
   * the shape the tree already uses for a dark-only depth treatment: `glow` is
   * applied the same way, gated on isDark at its call sites. Light is
   * untouched: every site keeps `card` and only ADDS this one in dark.
   */
  cardDark: Platform.select({
    web: { boxShadow: '0 6px 16px rgba(0,0,0,0.5)' },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.5,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  }) as ViewStyle,
};

// ---------------------------------------------------------------------------
// Glow (Prestige, pre-made decision 12)
// ---------------------------------------------------------------------------

/**
 * The masters' soft halo — glowing gold/emerald text, the faint gold outer
 * glow on cards, the active nav glyph's aura. Defined ONCE here as shapes;
 * the colour arrives from the resolved palette at the call site, already
 * pushed through withAlpha (the shapes pass it straight through — native
 * shadowOpacity is 1 so the caller's alpha is the only dilution). Prestige
 * glow is a dark-palette treatment: light keeps its Heritage arrangements,
 * so callers gate on isDark.
 */
export const glow = {
  /** Outer halo for views — cards, avatar rings, the active nav glyph wrap. */
  halo: (color: string): ViewStyle =>
    Platform.select({
      web: { boxShadow: `0 0 14px ${color}` },
      default: {
        shadowColor: color,
        shadowOpacity: 1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
        elevation: 5,
      },
    }) as ViewStyle,
  /** Soft aura behind glowing text — money values, eyebrows, active labels. */
  text: (color: string): TextStyle => ({
    textShadowColor: color,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  }),
} as const;

// ---------------------------------------------------------------------------
// Materials — the emerald glass system (RUN G1, C1)
// ---------------------------------------------------------------------------

/**
 * The glass ink: the one deep emerald every material's scrim is mixed from.
 * Declared once, consumed only through ui/primitives/Surface.tsx — a second
 * spelling of this hex anywhere outside this file is a fence failure
 * (tests/blurBoundary.test.mjs).
 */
const GLASS_SCRIM = '#071B15';

export type MaterialName = 'chrome' | 'sheet' | 'menu';

export type MaterialSpec = {
  /** expo-blur intensity under the scrim — dark theme, native, transparency allowed. */
  blur: number;
  /** The scrim fill: `scrimColor` at `scrimAlpha`. The scrim carries
   *  legibility; the blur is decoration over whatever shows through. */
  scrimColor: string;
  scrimAlpha: number;
  /** The hairline: `borderColor` at `borderAlpha`. The colour is the brand
   *  mint — the pale green that reads as a line on near-black glass. */
  borderColor: string;
  borderAlpha: number;
  /** Scrim alpha when blur cannot render (web, and Reduce Transparency on
   *  device). A deliberate deeper mix so the flat rendering still reads as a
   *  designed surface — a decision recorded as data, not a degradation. */
  fallbackScrimAlpha: number;
  /** Default corner rounding; null = the caller supplies it (chrome). */
  radius: number | null;
  /** Sheets round their top corners only; everything else rounds all four. */
  radiusTopOnly: boolean;
};

/**
 * Three materials, as data. chrome is the nav bar's wear; sheet is the docked
 * and floating dialog surfaces; menu is the densest glass, for anchored
 * popovers. Consumed ONLY through ui/primitives/Surface.tsx, and tunable live
 * through lib/designOverrides.ts (RUN G1 C2) — these are the launch defaults.
 */
export const materials: Record<MaterialName, MaterialSpec> = {
  chrome: {
    blur: 30,
    scrimColor: GLASS_SCRIM,
    scrimAlpha: 0.55,
    borderColor: brand.mint,
    borderAlpha: 0.2,
    fallbackScrimAlpha: 0.85,
    radius: null,
    radiusTopOnly: false,
  },
  sheet: {
    blur: 40,
    scrimColor: GLASS_SCRIM,
    scrimAlpha: 0.72,
    borderColor: brand.mint,
    borderAlpha: 0.16,
    fallbackScrimAlpha: 0.92,
    radius: 28,
    radiusTopOnly: true,
  },
  menu: {
    blur: 50,
    scrimColor: GLASS_SCRIM,
    scrimAlpha: 0.82,
    borderColor: brand.mint,
    borderAlpha: 0.14,
    fallbackScrimAlpha: 0.95,
    radius: 16,
    radiusTopOnly: false,
  },
};

// RUN S2 (C5) — G1's two studio colour cycles (STUDIO_GOLD_CYCLE and
// STUDIO_CARD_FILL_CYCLE) are GONE: the design studio edits every palette
// token directly now (HSL steppers + validated hex, both themes), so a
// fixed three-hex cycle would be a second, poorer way to say the same
// thing. The gold and cardFill DIALS survive unchanged in
// lib/designOverrides.ts — only the canned hex lists retired.

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * §I: "Buttons: height 38 (small 28)".
 *
 * Both reference numbers are below CLAUDE.md's >= 44pt touch-target floor, and
 * CLAUDE.md overrides. Shipped heights are raised to 48/44; the reference
 * values are recorded here so the divergence is a decision on the record
 * rather than a number someone later "corrects" back into an accessibility
 * regression.
 */
export const controls = {
  /** §I reference: 38. Raised for the 44pt touch floor. */
  buttonHeight: 48,
  /** §I reference: 28. Raised to exactly the 44pt floor. */
  buttonHeightSmall: 44,
  /** Text inputs match the primary button so a form reads as one rhythm. */
  fieldHeight: 48,
  /** Square icon-only controls. */
  iconButton: 44,
  /** The minimum any tappable thing may be. CLAUDE.md, non-negotiable. */
  minTouchTarget: 44,
} as const;

/**
 * §I: "variants primary(forest/white), secondary(mint/forest), ghost,
 * light(white), danger, small". `small` is a size, not a variant, so it lives
 * on `controls` above; the five real variants are here.
 */
export const buttonVariants = {
  primary: { background: colors.forest, border: colors.forest, content: colors.onForest },
  secondary: { background: colors.mint, border: colors.secondaryBorder, content: colors.forest },
  ghost: { background: 'transparent', border: 'transparent', content: colors.forest },
  light: { background: colors.surface, border: colors.line, content: colors.forest },
  danger: { background: colors.dangerSurface, border: colors.dangerBorder, content: colors.danger },
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

// ---------------------------------------------------------------------------
// Per-category identity accents (L-002)
// ---------------------------------------------------------------------------

/**
 * The eleven job-category accents — the icon chip on job cards, job details,
 * the hub, the browse list and the portfolio picker. Every category used to
 * share one muted green square, so a list of jobs was only distinguishable by
 * reading each title; colour does that scanning work instead. `icon` is
 * whichever of white/dark reads with better contrast against that category's
 * `bg`.
 *
 * THESE LIVED IN lib/jobs.ts AS RAW HEXES UNTIL L-002
 * (docs/audit/2026-08-22/light_mode_parity.md). That put twenty-two colour
 * literals in a data-access module — outside all three sanctioned token
 * surfaces (CLAUDE.md "Design system and navigation"), and outside the hex
 * fence's scanned directories, so nothing would have caught a twelfth being
 * added. Moving them here changes no rendered pixel in either theme:
 * lib/jobs.ts's JOB_CATEGORY_COLORS IS this object, and
 * tests/themeTokens.test.mjs pins all twenty-two values against the
 * pre-refactor table.
 *
 * DELIBERATELY THEME-CONSTANT, and deliberately not a light/dark pair. A
 * category's colour is its identity — the same reason `star`, `black`,
 * `white` and `mediaChrome` carry one value in both palettes. Dark never
 * renders this table at all: every read of it sits on the FALSE branch of an
 * `isDark` ternary with gold in its place, which tests/emeraldFences.test.mjs
 * F5 enforces per consuming file. A dark half would be unreachable by
 * construction, and no golden master specifies one.
 *
 * NOT part of `colors`/`ColorToken`. These are eleven identity pairs, not
 * palette roles: folding them in would put twenty-two keys into every
 * resolved `EmeraldPalette` that no primitive reads, and would oblige the
 * dark palette to restate values it can never paint.
 */
export const categoryAccents = {
  handyman: { bg: '#3B6FA6', icon: '#FFFFFF' }, // blue
  cleaning: { bg: '#2E8B84', icon: '#FFFFFF' }, // teal
  moving: { bg: '#C56A2E', icon: '#FFFFFF' }, // orange
  dog_walking: { bg: '#7B5CA6', icon: '#FFFFFF' }, // purple
  yard_work: { bg: '#5A8F3C', icon: '#FFFFFF' }, // green (distinct from the brand's deeper forest green)
  errands: { bg: '#E0A93A', icon: '#3D2B0F' }, // amber — light enough to need a dark glyph
  furniture_assembly: { bg: '#8B6544', icon: '#FFFFFF' }, // brown/tan
  tv_mounting: { bg: '#5B6B75', icon: '#FFFFFF' }, // slate gray
  painting: { bg: '#B85C7A', icon: '#FFFFFF' }, // rose/pink
  packing: { bg: '#4A5A9E', icon: '#FFFFFF' }, // indigo
  other: { bg: '#6B7280', icon: '#FFFFFF' }, // neutral gray fallback
} as const;

// ---------------------------------------------------------------------------
// Theme-constant accents (RUN H2, extended by RUN H3)
// ---------------------------------------------------------------------------

/**
 * Four hues fixed to ONE value across both palettes.
 *
 * Two of them the operator drew OUT of the light palette and asked for in
 * BOTH: the centre [ + ] and the greeting paint with light's own green and
 * slate whether the device is light or dark. One is the reference's one UI
 * red, which the offline dot wears in both themes and the unread badge wears
 * in light.
 *
 * RUN H3 SWAPPED THE FOURTH AND ADDED A FIFTH, both on operator instruction and
 * both LIGHT-only in effect: `goldDeep` replaces H2's `greetingSlateDeep` as
 * the light [ + ]'s outline, and `creamInk` gives the light Post-a-job pill an
 * outline the light palette has no hue for. Neither is drawn in dark today —
 * they live here because a light-only hue has nowhere else to go that does not
 * cost a dark twin to drift (see DELIBERATELY THEME-CONSTANT below).
 *
 * WHY THEY ARE TOKENS AND NOT LITERALS AT THE CALL SITE. Reaching a light
 * value while rendering dark has exactly two wrong shapes: a raw hex in a
 * screen (banned outright — CLAUDE.md "Design system and navigation", and
 * fenced by tests/themeResolution.test.mjs's literal scan over six
 * directories), or a call site that imports the light palette and indexes it
 * beside the resolved one, which makes every such site its own small
 * definition of "the light green". Naming them once here leaves one place for
 * either value to move.
 *
 * DELIBERATELY THEME-CONSTANT, and deliberately NOT part of
 * `colors`/`ColorToken` — the same construction, and the same reasoning, as
 * `categoryAccents` above. A dark counterpart is not merely unneeded here, it
 * would be WRONG: the whole point of this table is that dark resolves to the
 * same value light does. Folding them into `colors` would oblige `dark` to restate
 * them (the `satisfies` clause), and a second entry is a second thing to drift.
 * lib/theme.ts spreads this object into both of its palettes instead, exactly
 * as `star`, `black`, `white` and `mediaChrome` already carry one value in
 * both — so screens read them off the resolved palette like any other role.
 *
 * `greetingSlate` restates the hex light's `homeSlate` carries rather than
 * importing it, because lib/theme.ts imports THIS file and not the reverse.
 * That is the same arrangement `homeModeRing` already has beside `homeSlate`
 * over there, and for the same stated reason: two roles, two tokens, so one
 * can move without dragging the other.
 */
export const constantAccents = {
  /** The light Post-a-job pill's green. It is light `emerald`, referenced
   *  rather than restated so there is still one definition of the hue. Fills
   *  the light [ + ] and the DARK Post-a-job pill; draws the dark [ + ]'s
   *  glyph and the light greeting name. */
  postPillGreen: brand.emerald,
  /** The light greeting grey — the value light's `homeSlate` carries. Rings
   *  the dark [ + ] and draws the light [ + ]'s glyph. */
  greetingSlate: '#526477',
  /**
   * RUN H3 — one shade darker than LIGHT's `gold` (#C8A15B), and the light
   * [ + ]'s outline. It REPLACES `greetingSlateDeep`, which H2 introduced for
   * this exact borderColor and which the operator has now reversed; that token
   * is deleted rather than left standing, because a value in this table with no
   * call site is a hue nobody reviews and the next reader cannot tell whether
   * it is a dial or a leftover.
   *
   * Derived, not sampled — every channel of `brand.gold` at 80%
   * (200,161,91 -> 160,129,73) — which is the same construction the retired
   * slate used, kept so "one shade deeper" means one arithmetic thing here.
   *
   * READ THE NAME CAREFULLY: this is theme-CONSTANT, like everything else in
   * this table, so it is LIGHT's gold deepened in BOTH palettes and is NOT
   * `dark.gold` (#D4A24C) deepened. Nothing in dark draws it today; it exists
   * as a constant for the same reason every entry here does, so light can reach
   * it off the resolved palette without indexing the light palette beside the
   * dark one. An OPERATOR DIAL — see CREATE_BUTTON_* in
   * ui/primitives/BottomNav.tsx.
   */
  goldDeep: '#A08149',
  /**
   * RUN H3 — THE APP'S CREAM, and the light Post-a-job pill's outline.
   *
   * The light palette has no cream at all: its `onForest`/`onPrimary` are
   * #F4F1E8, the app's light GROUND, and reading a ground as an outline is how
   * a border disappears into the page. The cream the operator asked for is the
   * one the DARK palette carries as its ink, so this is a cross-theme reach and
   * it is named here rather than performed at the call site — `dark.ink`
   * referenced, not restated, so there is still one definition of the hue.
   *
   * Light draws it; dark's own pill has no ring at all
   * (`heroButtonDark: borderColor: 'transparent'`), so this is theme-constant
   * in the same sense the rest of the table is: one value on both sides,
   * consumed by whichever palette has a use for it.
   */
  creamInk: dark.ink,
  /**
   * THE REFERENCE CORAL — the unread badge in light, and the worker's offline
   * dot in both themes.
   *
   * It is not invented and it is not `danger`. docs/mockups/'s manifest
   * measures it off the master set and records it as the set's ONE UI red:
   * "appears ONCE as UI: the offline dot on 43", where master 43 is Worker
   * Home. So the offline dot is not being GIVEN a coral — it is being returned
   * to the one the reference draws it in, which today renders as `danger`
   * (#A8432B in light, #D8604B in dark), a terracotta in one theme and a
   * different red in the other.
   *
   * IDENTIFIED, NOT CHOSEN. Every hex in the tracked tree and in
   * design-reference/ was swept for a warm red-orange that is light and
   * saturated; this is the only one that is a UI colour rather than a surface
   * tint (#F3DCD2, #F5E7E4, #E9CAC5), a category identity (#C56A2E "moving"),
   * a map heat value (#DC2626), or a palette `danger`. design-reference/'s
   * light set contains no coral at all.
   */
  referenceCoral: '#D54C2C',
} as const;

export const tokens = {
  colors,
  brand,
  categoryAccents,
  constantAccents,
  materials,
  spacing,
  layout,
  radius,
  type,
  fonts,
  shadows,
  glow,
  controls,
  buttonVariants,
} as const;
