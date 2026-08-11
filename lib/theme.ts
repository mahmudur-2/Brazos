import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { brand } from '../ui/tokens';

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

  text: '#1F2E22',
  textMuted: '#6B7566',
  textSubtle: '#9AA38F',

  background: '#F4F1E8',
  surface: '#FFFFFF',
  border: '#DDD6C4',

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
  primary: '#3E8863',
  primaryDark: '#2E6B4C',
  primarySoft: '#1E3328',
  onPrimary: '#F4F1E8',
  star: '#F59E0B',

  // Emerald tokens, lifted for dark surfaces. `forest` stays a fill colour
  // rather than being brightened: it is the colour of a filled card, and a
  // card that lightens in dark mode inverts the depth it exists to create.
  // `gold`/`mint`/`ink` are the ones that must move, since they are used as
  // content on, or tint behind, that fill.
  forest: '#0B3B2E',
  emerald: '#4E9E82',
  gold: '#D9B978',
  goldSoft: '#2C2617',
  mint: '#1C2E27',
  mint2: '#263D34',
  ink: '#F1EDE1',
  homeBackground: '#10170F',
  homeSlate: '#9CB09E',

  text: '#F1EDE1',
  textMuted: '#9CB09E',
  textSubtle: '#6E8272',

  background: '#10170F',
  surface: '#1B2620',
  border: '#2E3B33',

  success: '#6FAE59',
  successBg: '#1C2B18',
  warning: '#D08A3E',
  warningBg: '#2E2115',
  danger: '#D97561',
  dangerBg: '#301E19',
  info: '#5FA3A3',
  infoBg: '#1B2B2A',
  neutral: '#A79D8B',
  neutralBg: '#2A2620',

  white: '#FFFFFF',
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
 * The display serif used for Emerald headlines (Home's "Take a task off your
 * plate.", section titles, the hero CTA).
 *
 * No custom font is loaded anywhere in this app, deliberately — see
 * LaunchScreen's wordmark comment: bundling one for a handful of headlines
 * buys a font-loading flash on the very screens that most need to paint
 * instantly. These are the platform serifs, resolved the same way the launch
 * wordmark already resolves them, so the two can't drift.
 */
export const fonts = {
  display: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, "Times New Roman", serif',
  }) as TextStyle['fontFamily'],
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text },
  subheading: { fontSize: 17, fontWeight: '600', color: colors.text },
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

export const theme = { colors, spacing, radius, typography, fonts, shadows } as const;
