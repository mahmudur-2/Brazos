import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { brand, dark as emeraldDark, withAlpha as alpha } from '../ui/tokens';

// lib/theme.ts is the standard import surface for screens (CLAUDE.md): the
// §I helpers below are re-exported here so no screen ever needs to import
// ui/tokens.ts directly. `emeraldRadius` is §I's radius scale (10/13/14/17/
// 20/22) under an explicit name, since this file's own older `radius` scale
// (8/12/16/24) already claims the size names; the VALUES of both live in
// exactly one place.
export { withAlpha, layout, controls, glow } from '../ui/tokens';
export { radius as emeraldRadius } from '../ui/tokens';
// The ONE reactive palette read (4D-4): re-exported here so screens can take
// it from their standard import surface. The implementation lives in
// hooks/useThemeColors.ts, backed by lib/ThemeContext.tsx — this is the same
// binding, not a second hook. The import cycle this creates
// (theme → hooks/useThemeColors → ThemeContext → theme) is deliberate and
// safe: every module involved defers palette VALUE access to call time.
export { useThemeColors } from '../hooks/useThemeColors';

/**
 * Brazos design system — "Forest and earth".
 * Deep forest green primary on a warm cream background, grounded and natural.
 *
 * The `forest`/`gold`/`mint`/`ink` tokens below are the Emerald Trust palette,
 * lifted verbatim from the atlas stylesheet's `:root` block
 * (design-reference/emerald-auth-v1/.../style.css) — the same values
 * lib/authTheme.ts already carries for the auth surface. They live here too so
 * in-app screens rendering on the Emerald design (Home first) draw from the
 * one in-app token file rather than importing the auth surface's tokens or
 * hardcoding hexes. This is deliberately NOT a third palette: `primary` and
 * friends are untouched, and every existing screen keeps rendering exactly as
 * it did.
 *
 * PHASE 1 (2026-08-08): those seven Emerald hues are no longer written out
 * here as literals — they are spread from `brand` in ui/tokens.ts, which is
 * now the one authoritative definition of the palette. The VALUES are
 * unchanged (Phase 0 verified this file's copies were already byte-identical
 * to §I's), so every screen including the LOCKED 01-07/48 renders exactly as
 * before; there is simply one definition of "forest" in the repo now instead
 * of three. Everything below `brand` — `primary`, the status pairs, the
 * neutral scale — is this file's own older in-app language and is deliberately
 * left alone: new screens build on ui/tokens.ts, legacy screens keep this.
 */

export const colors = {
  primary: '#1F4D3A',
  primaryDark: '#173A2C',
  primarySoft: '#E3EBE2',
  // Cream content (text/icons) shown on a solid primary-filled surface —
  // buttons, selected chips, own chat bubbles, progress dots, etc.
  onPrimary: '#F4F1E8',
  /** Content on a `forest` fill. Forest is a deep green solid in BOTH
   *  palettes (Prestige v2 restored the green after v1's gold-primary
   *  experiment), so the content on it is cream in both. */
  onForest: '#F4F1E8',
  // Rating-star gold. Kept as an explicit token (not tied to status/primary)
  // since gold stars are a near-universal convention independent of theme.
  star: '#F59E0B',

  // --- Emerald Trust palette (atlas :root) -------------------------------
  // Spread from ui/tokens.ts's `brand` rather than restated: forest, emerald,
  // gold, goldSoft, mint, mint2, ink. `brand` is `as const`, so each keeps its
  // literal type here exactly as when they were written out inline.
  ...brand,
  /** Exact warm surface used by the approved Customer Home reference. */
  homeBackground: '#FAF5F1',
  /** The blue-slate secondary text used by the approved Customer Home reference. */
  homeSlate: '#526477',
  /** The "Switch to Worker" pill's ring. Light rides the same blue-slate the
   *  reference draws that ring in, so it matches `homeSlate` here. Dark does
   *  NOT: the ring there is its own cooler grey. Two roles, two tokens, so
   *  `homeSlate` can move without dragging the ring with it. */
  homeModeRing: '#526477',
  /** The Home reference's own soft hairline (search pill, map pill). Kept as
   *  a token so the unlocked screen carries no literals; dark maps it to the
   *  Prestige gold hairline. */
  homeHairline: '#F1EAE2',
  /** The Live Nearby pulse dot and its halo — reference greens in light,
   *  the Prestige emerald family in dark. */
  homeLive: '#0DBC5A',
  homeLiveHalo: '#7DE7A4',

  text: '#1F2E22',
  textMuted: '#6B7566',
  textSubtle: '#9AA38F',

  background: '#F4F1E8',
  surface: '#FFFFFF',
  border: '#DDD6C4',

  /** Inactive bottom-nav items (§I "inactive nav"; decision 4 names the
   *  role). Distinct from textSubtle so the bar can be tuned without moving
   *  every tertiary caption with it. */
  navInactive: '#839087',

  // Status palette (text + background pairs), warmed to sit naturally in the
  // forest/earth palette. Kept clearly distinct from `primary` (which is a
  // deep blue-green) so status badges still read at a glance — success leans
  // olive/moss, danger leans terracotta, etc.
  success: '#4C7A3D',
  successBg: '#E6EDD9',
  warning: '#9A5B1E',
  warningBg: '#F3E3C4',
  danger: '#A8432B',
  dangerBg: '#F3DCD2',
  info: '#3D6B6B',
  infoBg: '#DCE8E6',
  neutral: '#6B6255',
  neutralBg: '#EDE7DA',

  white: '#FFFFFF',
  /** Pure black — lightbox chrome, full-screen photo scrims and the
   *  mode-transition dim. A lightbox is black in BOTH themes (the industry
   *  convention this app follows), so the dark palette keeps the same value. */
  black: '#000000',
  /** Deep forest chrome behind media affordances (JobVideo's poster scrim and
   *  pill). Deliberately darker than `text` and cooler than `ink`: it sits on
   *  top of arbitrary video frames, where those two read washed out. */
  mediaChrome: '#0F1F17',
} as const;

// `colors` is `as const`, so `typeof colors` would lock every field to its
// literal hex value — widen each to `string` so `darkColors` (and any other
// palette) can hold different hex values with the same shape.
export type ColorPalette = { [K in keyof typeof colors]: string };

/** Customer-facing Emerald Trust mapping for shared controls. Defaults remain
 * `colors` everywhere else; screens opt into this palette explicitly. */
export const emeraldColors: ColorPalette = {
  ...colors,
  primary: colors.forest,
  primaryDark: colors.forest,
  primarySoft: colors.mint,
  text: colors.ink,
  border: colors.mint2,
  neutralBg: colors.mint,
};

/**
 * Dark-mode variant of the forest/earth palette, same shape as `colors`.
 * Primary green is lifted in luminance versus the light palette — the light
 * palette's deep `#1F4D3A` reads fine on cream but loses contrast against a
 * near-black background, so dark mode uses a brighter forest green instead.
 * Status colors keep their light-palette hue family (moss/ochre/terracotta/
 * teal/taupe) but are brightened for legibility on dark surfaces, with dark,
 * low-alpha-style "Bg" tints instead of the light palette's pale tints.
 */
export const darkColors: ColorPalette = {
  // Prestige v2: the masters' ONE solid conversion fill is the deep forest,
  // so the primary role IS emeraldDark.forest; pressed/soft steps stay in
  // the same family. Content on it is the cream ink, both palettes.
  primary: '#1B3527',
  primaryDark: '#162B21',
  primarySoft: '#0E1F18',
  onPrimary: '#F1EDE1',
  onForest: emeraldDark.onForest,
  star: '#F59E0B',

  // Brand hues in dark come from the ONE authoritative dark palette
  // (ui/tokens.ts `dark`, the Emerald Prestige v2 set — pixel-derived from
  // the 43 golden masters) rather than being restated here — the same
  // de-duplication Phase 1 did for the light brand. v2 restored `forest` to
  // a deep green and reserved gold for line-work; see the notes on `dark`
  // in ui/tokens.ts.
  forest: emeraldDark.forest,
  emerald: emeraldDark.emerald,
  gold: emeraldDark.gold,
  goldSoft: emeraldDark.goldSoft,
  mint: emeraldDark.mint,
  mint2: emeraldDark.mint2,
  ink: emeraldDark.ink,
  homeBackground: '#02110D',
  homeSlate: '#93A096',
  homeModeRing: '#6A736C',
  homeHairline: '#55482E',
  homeLive: emeraldDark.emerald,
  homeLiveHalo: emeraldDark.mint2,

  text: '#F1EDE1',
  textMuted: '#93A096',
  textSubtle: '#7C8A80',

  background: '#02110D',
  // The dim-gold hairline is what makes Prestige read as Prestige: `border`
  // is the flat equivalent of gold at hairline alpha, not a neutral grey.
  surface: '#0A1813',
  border: '#55482E',
  navInactive: emeraldDark.navInactive,

  // Live-state/status greens ride the v2 emerald; warning rides the masters'
  // hot amber on the goldSoft wash. Danger SURFACES keep pre-v2 values.
  success: '#5FAE81',
  successBg: '#0E1F18',
  warning: '#F2B04F',
  warningBg: '#251E10',
  danger: '#D8604B',
  dangerBg: '#301E19',
  info: '#5FA3A3',
  infoBg: '#1B2B2A',
  neutral: '#A79D8B',
  neutralBg: '#2A2620',

  white: '#FFFFFF',
  black: '#000000',
  mediaChrome: '#0F1F17',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * The heading voice used for Emerald headlines (Home's "Take a task off your
 * plate.", section titles, the hero CTA).
 *
 * ONE SERIF ROLE, EVERYTHING ELSE THE SYSTEM SANS. `display` resolves to the
 * platform's own system sans, the same family body copy uses — the
 * 2026-08-22 serif retirement (docs/emerald-v2/DECISIONS.md D5's second
 * dated note) stands for every role that names it. Later the same day the
 * operator PARTIALLY reversed it (D5's third dated note): the customer Home
 * hero title — that one role, nothing else — returns to Playfair Display.
 * `displayHero` carries that face: the Bold static recovered byte-identical
 * from the pre-retirement commit (assets/fonts/, with its OFL license),
 * registered by App.tsx's LaunchGate exactly the way the pre-retirement code
 * registered it. With a real file bundled iOS stops selecting a face from
 * `fontWeight`, so the hero style names the family and carries no weight —
 * the same convention the bundling era used.
 *
 * `display` is kept as a NAMED ROLE rather than deleted: the screens reach the
 * heading voice through it, so it stays the single lever if that voice is ever
 * repointed again. tests/themeTokens.test.mjs fences this state: exactly one
 * screen style may name `displayHero`, and any other serif — quoted, tokened
 * or bundled — stays red.
 *
 * With no file bundled for the SANS roles, `fontWeight` is load-bearing on
 * iOS — it is how the heading roles below get their weight. Removing one
 * renders that heading at normal.
 */
export const fonts = {
  display: undefined as TextStyle['fontFamily'],
  /** The customer Home hero title's face — the ONE serif role (D5, third
   *  dated note). Everything else stays on `display`'s system sans. */
  displayHero: 'PlayfairDisplay-Bold' as TextStyle['fontFamily'],
} as const;

export const typography = {
  // Prestige decision 9: the heading roles carry the display voice in BOTH
  // themes (structure and type are theme-independent; only colours resolve
  // per palette). Body/label/caption stay on the platform sans — and since
  // 2026-08-22 so does the display voice itself, so the distinction is now
  // one of ROLE and weight rather than of face.
  //
  // home(3): those three heading roles — and only those three — take
  // `letterSpacing: -1`, mirroring `display`/`h1`/`h2` in ui/tokens.ts. Body,
  // label and caption are small, and negative tracking closes small type up
  // until it smudges. The value was measured against a serif and is left
  // untouched by the sans reversal: an operator dial for a device pass.
  //
  // Every fontWeight below is load-bearing: no face is bundled, so iOS picks
  // the weight itself. See the `fonts` docblock above.
  title: { fontSize: 28, fontWeight: '800', fontFamily: fonts.display, letterSpacing: -1, color: colors.text },
  heading: { fontSize: 22, fontWeight: '700', fontFamily: fonts.display, letterSpacing: -1, color: colors.text },
  subheading: { fontSize: 17, fontWeight: '600', fontFamily: fonts.display, letterSpacing: -1, color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: '500', color: colors.textSubtle },
} as const;

/** Soft, grounded shadows. Uses boxShadow on web to avoid deprecation warnings. */
export const shadows: Record<'card' | 'raised', ViewStyle> = {
  card: Platform.select({
    web: { boxShadow: '0 1px 3px rgba(31,46,34,0.07), 0 1px 2px rgba(31,46,34,0.05)' },
    default: {
      shadowColor: '#1F2E22',
      shadowOpacity: 0.07,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  }) as ViewStyle,
  raised: Platform.select({
    web: { boxShadow: '0 8px 24px rgba(31,46,34,0.14)' },
    default: {
      shadowColor: '#1F2E22',
      shadowOpacity: 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  }) as ViewStyle,
};

/**
 * The Emerald Trust mapping as a FUNCTION of the resolved palette (4D-4).
 * `emeraldColors` above is exactly this mapping applied to the light palette;
 * it stays exported for legacy/locked callers. Swept screens call this with
 * the palette from useThemeColors so the mapping follows the theme — under
 * Prestige v2, `forest` is a deep green in both palettes (ui/tokens.ts `dark`).
 */
export function emeraldColorsFor(palette: ColorPalette): ColorPalette {
  return {
    ...palette,
    primary: palette.forest,
    primaryDark: palette.forest,
    primarySoft: palette.mint,
    text: palette.ink,
    border: palette.mint2,
    neutralBg: palette.mint,
  };
}

/**
 * The auth surface's Prestige mapping (golden masters 2, 3 and 4).
 *
 * Only Welcome, Create account and Email create account convert — every other
 * auth screen keeps the Heritage ivory that lib/authTheme.ts defines, so the
 * shared auth components take an opt-in `themed` flag and resolve through
 * this ONE mapping rather than each restating it. Not a token surface: like
 * emeraldColorsFor() above, it is a function of the resolved palette.
 *
 * `accent` is the colour those masters give eyebrows, field labels and field
 * glyphs — gold in dark, and in light the emerald the Heritage screens
 * already use, so the light rendering does not move.
 */
export function authSurface(palette: ColorPalette, isDark: boolean) {
  return {
    bg: palette.background,
    surface: palette.surface,
    ink: palette.ink,
    muted: palette.textMuted,
    /** Field and card hairlines: gold line-work in dark. */
    line: isDark ? palette.gold : palette.border,
    accent: isDark ? palette.gold : palette.emerald,
    danger: palette.danger,
    placeholder: palette.textSubtle,
  } as const;
}

/**
 * THE one rating-star treatment (dark device pass).
 *
 * A rating star was drawn four different ways across the app — the `star`
 * token (an orange-gold), the Prestige `gold`, the neutral `border` for an
 * empty star, and on Saved & past workers a bare `★` inheriting the muted
 * grey of the meta line it sat in. The masters draw ONE star: gold, filled
 * or outlined (master 27 shows both in the same row, 22 and 46 the filled
 * one). Like `emeraldColorsFor()` and `authSurface()` this is a function of
 * the resolved palette, not a new token surface.
 *
 * Light keeps the `star` token it has always rendered and the neutral
 * empty-star border — the VALUES did not move. What moved is reach: the dark
 * pass left the three bare-`★`-in-a-sentence spans (BidDetail, Profile, Saved
 * & past workers) painting through `isDark ? goldStyle : undefined`, so the
 * light half of those three fell back to inheriting the meta line's muted
 * grey instead of resolving here at all. The light pass (L-010) repointed all
 * three at `starColors(palette, isDark).filled`, so this helper is now the
 * ONE star treatment in BOTH palettes rather than in dark only.
 */
export function starColors(palette: ColorPalette, isDark: boolean) {
  return {
    /** A star that counts toward the score. */
    filled: isDark ? palette.gold : palette.star,
    /** A star that does not — outlined, never absent. */
    empty: isDark ? alpha(palette.gold, 0.45) : palette.border,
  } as const;
}

/**
 * THE one "this option is chosen" treatment in dark (emerald D6).
 *
 * Masters 11, 23 and 24 draw selection the same way and the app did not: a
 * gold outline on the distance chips, but EMERALD on the service-category
 * chips, the filter-sheet chips and radios, the tip presets, the report
 * reasons and the flat/ask pill — which master 23 draws gold. Two vocabularies
 * for one idea, and in dark the emerald one barely reads, because `mint` and
 * `emerald` sit close together on a near-black ground.
 *
 * One treatment: a full-strength gold line and a gold label for the chosen
 * option, no fill (gold is line-work — decision 3, enforced by
 * tests/goldOnForest.test.mjs), and the rest of the group on the hairline tier
 * so "chosen" reads as a step UP rather than as a different colour.
 *
 * LIGHT IS NOT EXPRESSED HERE AT ALL. Every control keeps the Heritage
 * selected state it already had, so a caller applies this behind `isDark &&`
 * and the light rendering stays byte-identical. Like `authSurface()`,
 * `starColors()` and `emeraldColorsFor()`, this is a function of the resolved
 * palette rather than a new token surface.
 */
export function selectedInDark(palette: ColorPalette) {
  return {
    /** The chosen option's outline, and its label and glyph. */
    line: palette.gold,
    /** Gold never fills a control, so a chosen option carries no fill. */
    fill: 'transparent',
    /** The other options in the same group — the manifest's measured hairline
     *  tier, so a group of outlined chips still has a clear winner. */
    idleLine: alpha(palette.gold, 0.35),
  } as const;
}

/**
 * THE modal scrim in dark (emerald D8).
 *
 * A scrim DIMS the page behind it; it does not erase it. Master 11 draws the
 * filter sheet over a header that stays readable, and the dark device pass
 * caught the creation sheet doing the opposite — the page behind it crushed to
 * unreadable. Every sheet and dialog in the tree had independently landed on
 * the SAME expression, `withAlpha(ground, 0.7)`, so the creation sheet was not
 * an outlier: seven copies of one number were all too strong, and the filter
 * sheet the operator named as the reference was one of them.
 *
 * 0.55 over a near-black ground is a clear dim with the page still legible
 * underneath, which is what the master draws. One value, one place, so the
 * next sheet cannot pick its own.
 *
 * LIGHT IS NOT EXPRESSED HERE. Each surface keeps the light scrim it already
 * had (`text` @ 35% on the dialogs, `ink` @ 45% on the sheets) — those were
 * never the complaint, and a shared light value would have repainted six
 * surfaces nobody reported.
 */
export const SCRIM_DARK_ALPHA = 0.55;

export function scrimInDark(ground: string): string {
  return alpha(ground, SCRIM_DARK_ALPHA);
}

/**
 * THE one disabled treatment (emerald D7, restating decision 3).
 *
 * A flat neutral fill, muted text, NO border — in every variant, so a dead
 * control can never keep wearing the conversion green, and so enabled and
 * disabled are told apart by their FILL rather than by an opacity dim that
 * fades a green button into a paler green button. `components/Button.tsx` has
 * carried this inline since 0c; this is the same rule, exported, for the
 * hand-rolled controls that never went through the primitive.
 *
 * The enabled side of the pair is not here: standard controls keep the gold
 * hairline the dark pass gave them, which is what makes the two unmistakable.
 */
export function disabledControl(palette: ColorPalette) {
  return {
    backgroundColor: palette.neutralBg,
    borderColor: 'transparent',
    color: palette.textMuted,
  } as const;
}

/**
 * `typography` above bakes the LIGHT text colors in at module scope (its
 * values predate theming). Swept screens that spread those styles take them
 * from here instead, colored by the resolved palette; the sizes and weights
 * are the same six entries and deliberately stay in one place — this function
 * reads them from `typography` so the two can never drift.
 */
export function typographyFor(palette: ColorPalette): Record<keyof typeof typography, TextStyle> {
  return {
    title: { ...typography.title, color: palette.text },
    heading: { ...typography.heading, color: palette.text },
    subheading: { ...typography.subheading, color: palette.text },
    body: { ...typography.body, color: palette.text },
    label: { ...typography.label, color: palette.textMuted },
    caption: { ...typography.caption, color: palette.textSubtle },
  };
}

/**
 * Trap-1 helper (4D-4): color-bearing styles must be COMPUTED from the
 * resolved palette, never captured at module scope — a stylesheet built at
 * import time freezes whatever palette was live and never repaints on a
 * theme change. Wrap the stylesheet factory in this at module scope:
 *
 *   const stylesFor = themedStyles((colors) =>
 *     StyleSheet.create({ card: { backgroundColor: colors.surface } }));
 *   // in the component:
 *   const { palette } = useThemeColors();
 *   const styles = stylesFor(palette);
 *
 * Nothing runs at import time; the factory runs once per palette (WeakMap
 * keyed on the palette object) and the result is shared by every instance,
 * so this costs what the module-scope StyleSheet it replaces cost.
 */
export function themedStyles<P extends object, T>(
  factory: (colors: P) => T,
): (palette: P) => T {
  const cache = new WeakMap<P, T>();
  return (palette) => {
    const cached = cache.get(palette);
    if (cached) return cached;
    const built = factory(palette);
    cache.set(palette, built);
    return built;
  };
}

export const theme = { colors, spacing, radius, typography, fonts, shadows } as const;
