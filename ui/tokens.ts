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
 * Emerald Prestige — the dark palette, authored to STAGE4D_PLAN.md's spec:
 * near-black emerald background, dark-green cards, gold hairline borders,
 * gold primary. ("Sage success" lives in lib/theme.ts's status pairs — this
 * §I palette has never carried a success key in either mode.)
 *
 * NOTHING RESOLVES TO THIS PALETTE YET. 4D-3.5 ships the resolver pinned to
 * `light` (lib/ThemeContext.tsx); these values first render when 4D-4 adds
 * the Light/Dark/System setting, flips app.json `userInterfaceStyle` to
 * "automatic" (T1), and does the full-screen sweep in both themes. Until that
 * sweep, per-key intent is recorded here so 4D-4 tunes values on a device
 * instead of re-deriving intent:
 *
 * - `forest` is the PRIMARY role (its docblock above: CTAs, display titles,
 *   active nav) — in Prestige that role is GOLD, with `onForest` flipped to a
 *   near-black so the gold fill keeps its contrast. Screens that use forest
 *   as a large CARD fill rather than as the primary accent read wrong under
 *   this mapping by design — restyling those cards onto `surface` is exactly
 *   the 4D-4 sweep's job, not a reason to un-gold the primary.
 * - `line` doubles as the "gold hairline border" anchor: a dimmed gold, not a
 *   neutral grey, is what makes Prestige read as Prestige.
 * - `emerald`/`gold`/`goldSoft`/`mint`/`mint2`/`ink` follow the established
 *   dark-surface liftings lib/theme.ts's darkColors pioneered; that file now
 *   reads its dark brand hues from HERE (one definition, per CLAUDE.md).
 */
export const dark = {
  forest: '#D9B978',
  emerald: '#4E9E82',
  gold: '#D9B978',
  goldSoft: '#2C2617',
  mint: '#1C2E27',
  mint2: '#2A4237',
  ink: '#F1EDE1',

  bg: '#0A1613',
  surface: '#132A22',
  muted: '#9FAFA5',
  line: '#4A3D24',
  danger: '#D97561',
  dangerSurface: '#33201B',
  dangerBorder: '#4C2E26',
  secondaryBorder: '#2E4A3E',
  navInactive: '#77857B',
  onForest: '#20180A',
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

/** §I: "screen gutter 16; card padding 14; card gap 10". */
export const layout = {
  screenGutter: 16,
  cardPadding: 14,
  cardGap: 10,
  /**
   * §I: "bottom content never collides with the floating nav (respect its
   * 68pt + margins)". Templates apply this as bottom content inset so a
   * scroll view's last row clears the tab bar. Screens inside the tab
   * navigator must NOT also add a bottom SafeArea edge — MainTabs already
   * owns that inset (CLAUDE.md, and the bug f3e75d0 was written to fix).
   */
  floatingNavClearance: 68,
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
 * §I names Inter. No custom font is bundled anywhere in this app and none
 * should be added — see lib/theme.ts's `fonts` comment and DECISIONS.md D5:
 * bundling one buys a font-loading flash on exactly the screens that most
 * need to paint instantly. Body copy therefore uses the platform sans
 * (undefined = system default), and display headlines use the platform serif
 * the locked screens already render with, so this scale cannot drift from
 * screens 07/48.
 */
export const fonts = {
  display: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, "Times New Roman", serif',
  }) as TextStyle['fontFamily'],
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
 */
export const type = {
  display: { fontSize: 28, lineHeight: 29, fontWeight: '800', fontFamily: fonts.display },
  h1: { fontSize: 26, fontWeight: '800', fontFamily: fonts.display },
  h2: { fontSize: 21, fontWeight: '700', fontFamily: fonts.display },
  title: { fontSize: 15, fontWeight: '700' },
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

export const tokens = {
  colors,
  brand,
  spacing,
  layout,
  radius,
  type,
  fonts,
  shadows,
  controls,
  buttonVariants,
} as const;
