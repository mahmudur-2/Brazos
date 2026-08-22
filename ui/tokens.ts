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
 * The floating nav pill's geometry, declared ONCE (emerald D3/emerald(3)).
 *
 * ui/primitives/BottomNav.tsx reads both of these for the bar it configures,
 * and every screen's bottom clearance below is derived from the same two
 * numbers — so a change to the bar's height can never desynchronise the
 * screens that have to clear it. Before this they were two hardcoded values
 * (a 70pt bar and a 68pt clearance) that happened to be close, and nothing
 * connected them.
 */
const FLOATING_NAV_HEIGHT = 70;
const FLOATING_NAV_GAP = 12;

/** §I: "screen gutter 16; card padding 14; card gap 10". */
export const layout = {
  screenGutter: 16,
  cardPadding: 14,
  cardGap: 10,
  /** The pill's own height. ui/primitives/BottomNav.tsx's
   *  TAB_BAR_CONTENT_HEIGHT is this value. */
  floatingNavHeight: FLOATING_NAV_HEIGHT,
  /**
   * The pill's float gap — its inset from the screen edges, and the MINIMUM
   * gap under it. ui/primitives/BottomNav.tsx's TAB_BAR_FLOAT_MARGIN is this
   * value. A bottom action footer or composer uses it as extra bottom padding
   * so its controls keep the same distance from the pill that the pill keeps
   * from the screen edge, instead of the footer band and the pill reading as
   * one continuous surface.
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
 * §I names Inter. Body copy uses the platform sans (undefined = system
 * default). The heading voice is Playfair Display: an operator decision of
 * 2026-08-22 superseded emerald-v2 DECISIONS.md D5 ("no bundled font") for
 * the three large heading roles ONLY — `display`, `h1`, `h2`. D5's
 * objection, a font-loading flash on the screens that most need to paint
 * instantly, is answered by a render gate instead: App.tsx resolves the two
 * static faces with expo-font's `useFonts` and holds the themed tree
 * unmounted (under the launch layer, which uses none of these roles) until
 * they resolve, so no frame ever paints a heading in the fallback face.
 *
 * `display` (the platform serif) is still a live token: it remains the voice
 * of 15pt card `title`s — Playfair degrades below ~18pt and card titles are
 * ubiquitous — and of every screen style that names `fonts.display` directly.
 */
export const fonts = {
  display: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, "Times New Roman", serif',
  }) as TextStyle['fontFamily'],
  /** Playfair Display statics, bundled in assets/fonts/ (OFL) and registered
   *  at the root by App.tsx. One name per face: once a real file is bundled,
   *  iOS no longer selects a face from `fontWeight`, so the weight lives in
   *  the family name and the three heading roles carry no fontWeight — a
   *  platform-synthesized bold on top of ExtraBold would double-embolden. */
  displayBold: 'PlayfairDisplay-Bold' as TextStyle['fontFamily'],
  displayExtraBold: 'PlayfairDisplay-ExtraBold' as TextStyle['fontFamily'],
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
 * home(3) — LETTER SPACING ON THE DISPLAY SERIF. The three heading roles carry
 * `letterSpacing: -1`. A display serif set at 21pt and up tracks loose by
 * default; pulling it in a point is what makes a heading read as one word
 * shape rather than a row of letters. It is deliberately NOT applied to
 * `title`, `body`, `sub`, `caption` or `eyebrow`: negative tracking closes up
 * small type until it smudges, and `eyebrow` wants the opposite (its +1.2 is
 * what makes 9pt uppercase legible). The same three-role decision is mirrored
 * in lib/theme.ts's `typography`, and tests/emeraldFences.test.mjs holds the
 * two surfaces to it.
 */
export const type = {
  display: { fontSize: 28, lineHeight: 29, fontFamily: fonts.displayExtraBold, letterSpacing: -1 },
  h1: { fontSize: 26, fontFamily: fonts.displayExtraBold, letterSpacing: -1 },
  h2: { fontSize: 21, fontFamily: fonts.displayBold, letterSpacing: -1 },
  // Prestige decision 9: card titles join the serif voice, both themes. At
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

export const shadows: Record<'card', ViewStyle> = {
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

export const tokens = {
  colors,
  brand,
  categoryAccents,
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
