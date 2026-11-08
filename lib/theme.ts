import type { Insets, TextStyle, ViewStyle } from 'react-native';
import {
  brand,
  controls,
  dark as emeraldDark,
  light as emeraldLight,
  constantAccents,
  shadows as tokenShadows,
  litCard as tokenLitCard,
  radius,
  spacing,
  type as tokenType,
  withAlpha as alpha,
  type EmeraldPalette,
} from '../ui/tokens';

// lib/theme.ts is the standard import surface for screens (CLAUDE.md): the
// §I helpers below are re-exported here so no screen ever needs to import
// ui/tokens.ts directly. `emeraldRadius` is the one corner scale under its
// older name — since fix run D8 it IS `radius` (8/12/16/24), and the VALUES
// live in exactly one place.
export { withAlpha, layout, controls, glow, paneEdges, paneFills, PANE_HALO_RING, wells, discs, meltBar, postTiles, fieldAccessory } from '../ui/tokens';
export type { PaneRim, PaneHalo, PaneFill } from '../ui/tokens';
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
  /** 2026-09-26 (the refresh) — the primary button's two stops. Light draws
   *  its primary flat (both stops the primary); dark draws the Emerald Lux CTA,
   *  a mint gradient (docs/mockups/html/lux/README.md "The CTA is a mint
   *  gradient pill"), with the Lux dark ink on it (`onPrimary`). */
  ctaTop: '#1F4D3A',
  ctaBottom: '#1F4D3A',
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

  // --- Theme-constant accents (RUN H2) ------------------------------------
  // postPillGreen, greetingSlate, greetingSlateDeep, referenceCoral — ONE
  // value in both palettes, by operator decision. Spread
  // from ui/tokens.ts's `constantAccents` (where the reasoning lives) into this
  // palette AND into `darkColors` below, which is the same arrangement `star`,
  // `black`, `white` and `mediaChrome` already have: a role that does not
  // change with the theme is declared identically on both sides rather than
  // being reached for across palettes at a call site.
  ...constantAccents,

  // --- Emerald Trust palette (atlas :root) -------------------------------
  // Spread from ui/tokens.ts's `brand` rather than restated: forest, emerald,
  // gold, goldSoft, mint, mint2, ink. `brand` is `as const`, so each keeps its
  // literal type here exactly as when they were written out inline.
  ...brand,
  /** The light page cream — one value with `background` and ui/tokens `bg` since fix run D10. */
  homeBackground: '#F4F1E8',
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
  /** 2026-09-18 — the customer Home's task card, by reference from the ONE
   *  definition in ui/tokens.ts (light: flat `surface` inside a `line`
   *  hairline; dark: the mockup's lit shades, on `darkColors` below). */
  taskCardLitTop: emeraldLight.taskCardLitTop,
  taskCardLitBottom: emeraldLight.taskCardLitBottom,
  taskCardEdge: emeraldLight.taskCardEdge,
  /** 2026-09-19 — the map pin's shades, by reference to ui/tokens.ts. */
  pinTop: emeraldLight.pinTop,
  pinBottom: emeraldLight.pinBottom,
  pinGlyph: emeraldLight.pinGlyph,
  /** 2026-09-21 — the Filters sheet's chosen green, by reference (light: the emerald). */
  emeraldBright: emeraldLight.emeraldBright,
  /** 2026-09-27 — the eyebrow role, by reference (light: the emerald; dark: the gold). */
  eyebrow: emeraldLight.eyebrow,
  /** 2026-09-29 (LUX-LIST-2 #4) — the kept-gold labels (light #86641A; dark the gold). */
  eyebrowGold: emeraldLight.eyebrowGold,
  /** 2026-09-29 (LUX-LIST-2 #8) — the feed's message kind (light #2F6FA8; dark #7DB9F0). */
  notifMessage: emeraldLight.notifMessage,
  /** 2026-09-27 — the wizard progress bar's green, by reference (ruling 6). */
  wizardProgress: emeraldLight.wizardProgress,
  /** 2026-09-28 (LUX-LIST-64) — the stage inks and their light fills, the
   *  initials avatar, money and the small marks, by reference to ui/tokens.ts
   *  (where each is reasoned). */
  stageAssigned: emeraldLight.stageAssigned,
  stageAssignedBg: emeraldLight.stageAssignedBg,
  stageProgress: emeraldLight.stageProgress,
  stageProgressBg: emeraldLight.stageProgressBg,
  stageReview: emeraldLight.stageReview,
  stageReviewBg: emeraldLight.stageReviewBg,
  avatarFill: emeraldLight.avatarFill,
  avatarRim: emeraldLight.avatarRim,
  avatarInk: emeraldLight.avatarInk,
  money: emeraldLight.money,
  mark: emeraldLight.mark,
  grey: emeraldLight.grey,
  waitingFill: emeraldLight.waitingFill,
  waitingInk: emeraldLight.waitingInk,
  barGround: emeraldLight.barGround,
  barRim: emeraldLight.barRim,
  draftFill: emeraldLight.draftFill,
  draftRim: emeraldLight.draftRim,
  draftInk: emeraldLight.draftInk,
  draftIcon: emeraldLight.draftIcon,
  publishInk: emeraldLight.publishInk,
  inboxPreview: emeraldLight.inboxPreview,
  inboxChipInk: emeraldLight.inboxChipInk,
  inboxRule: emeraldLight.inboxRule,
  dropGlyph: emeraldLight.dropGlyph,
  dropDanger: emeraldLight.dropDanger,
  dropRule: emeraldLight.dropRule,
  /** 2026-09-21 — the shipped Welcome page's auth roles, by reference to the
   *  ONE definition in ui/tokens.ts (light: the Heritage ink, muted, emerald
   *  and gold, the ivory ground flat, the forest CTA, the pale mint disc). */
  authInk: emeraldLight.authInk,
  authMuted: emeraldLight.authMuted,
  authAccent: emeraldLight.authAccent,
  authGold: emeraldLight.authGold,
  authGlintCore: emeraldLight.authGlintCore,
  authGlintHalo: emeraldLight.authGlintHalo,
  authBadgeFill: emeraldLight.authBadgeFill,
  authShade: emeraldLight.authShade,
  authGroundTop: emeraldLight.authGroundTop,
  authGroundMid: emeraldLight.authGroundMid,
  authGroundBottom: emeraldLight.authGroundBottom,
  heroDiscTop: emeraldLight.heroDiscTop,
  heroDiscMid: emeraldLight.heroDiscMid,
  heroDiscBottom: emeraldLight.heroDiscBottom,
  authCtaTop: emeraldLight.authCtaTop,
  authCtaBottom: emeraldLight.authCtaBottom,
  /** The task card's field ring, by reference to ui/tokens.ts: the green-grey
   *  secondary border (light #CBE0D7, dark #2F5140) that the HTML mockup's
   *  .field rule draws. Exposed 2026-09-18 because Home needed it and this
   *  palette had only `border`, which in dark is the warm hairline. */
  secondaryBorder: emeraldLight.secondaryBorder,

  text: '#1F2E22',
  /** Fix run E1: every light text ink clears WCAG AA (4.5:1) on the cream,
   *  the white card and the chip fill — tests/themeTokens.test.mjs computes it.
   *  Muted was #6B7566 (4.26:1), subtle #9AA38F (2.3:1). */
  textMuted: '#4E5949',
  textSubtle: '#5E6859',

  background: '#F4F1E8',
  surface: '#FFFFFF',
  border: '#DDD6C4',

  /** Inactive bottom-nav items (§I "inactive nav"; decision 4 names the
   *  role). Distinct from textSubtle so the bar can be tuned without moving
   *  every tertiary caption with it. */
  navInactive: '#5E6859',

  // Status palette (text + background pairs), warmed to sit naturally in the
  // forest/earth palette. Kept clearly distinct from `primary` (which is a
  // deep blue-green) so status badges still read at a glance — success leans
  // olive/moss, danger leans terracotta, etc. Fix run E1 deepened success and
  // warning a step so each clears 4.5:1 on the cream and on its own tint.
  success: '#457038',
  successBg: '#E6EDD9',
  warning: '#8C531B',
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
  // 2026-09-26 (the refresh) — EMERALD LUX GLASS in dark (DECISIONS (14), the
  // operator's pick; docs/mockups/html/lux/README.md is the system): mint is the
  // ONE action colour, so the primary fill is the mint of the Lux CTA with the
  // Lux dark ink on it; pressed/soft steps stay in that family.
  // 2026-09-27 (the Lux remake, ruling 5): ONE mint — #4FC58C is the action
  // colour and the CTA fill, both stops, so the CTA is flat ("one accent,
  // nothing brighter"); pressed steps one shade down.
  primary: '#4FC58C',
  primaryDark: '#3FB07A',
  primarySoft: '#1A362D',
  onPrimary: '#062018',
  ctaTop: '#4FC58C',
  ctaBottom: '#4FC58C',
  onForest: emeraldDark.onForest,
  star: '#F59E0B',
  // RUN H2's cross-theme trio, restated here from the SAME source object the
  // light palette spreads — so dark cannot drift to a second value for a role
  // whose whole definition is "the light one, in both themes".
  ...constantAccents,

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
  // The Lux ground's middle stop (the gradient itself is painted by the screen
  // roots that carry it); cream-muted slate; mint-neutral hairlines, never warm.
  homeBackground: '#0A1A17',
  homeSlate: '#A9B8B1',
  homeModeRing: '#6F807A',
  homeHairline: '#325047',
  homeLive: emeraldDark.emerald,
  homeLiveHalo: emeraldDark.mint2,
  // 2026-09-18 — the task card's lit shades, by reference: ui/tokens.ts `dark`
  // is the one home of the mockup's three hexes.
  taskCardLitTop: emeraldDark.taskCardLitTop,
  taskCardLitBottom: emeraldDark.taskCardLitBottom,
  taskCardEdge: emeraldDark.taskCardEdge,
  pinTop: emeraldDark.pinTop,
  pinBottom: emeraldDark.pinBottom,
  pinGlyph: emeraldDark.pinGlyph,
  emeraldBright: emeraldDark.emeraldBright,
  eyebrow: emeraldDark.eyebrow,
  eyebrowGold: emeraldDark.eyebrowGold,
  notifMessage: emeraldDark.notifMessage,
  wizardProgress: emeraldDark.wizardProgress,
  // 2026-09-28 (LUX-LIST-64): the stage, avatar, money and mark roles, by reference.
  stageAssigned: emeraldDark.stageAssigned,
  stageAssignedBg: emeraldDark.stageAssignedBg,
  stageProgress: emeraldDark.stageProgress,
  stageProgressBg: emeraldDark.stageProgressBg,
  stageReview: emeraldDark.stageReview,
  stageReviewBg: emeraldDark.stageReviewBg,
  avatarFill: emeraldDark.avatarFill,
  avatarRim: emeraldDark.avatarRim,
  avatarInk: emeraldDark.avatarInk,
  money: emeraldDark.money,
  mark: emeraldDark.mark,
  grey: emeraldDark.grey,
  waitingFill: emeraldDark.waitingFill,
  waitingInk: emeraldDark.waitingInk,
  barGround: emeraldDark.barGround,
  barRim: emeraldDark.barRim,
  draftFill: emeraldDark.draftFill,
  draftRim: emeraldDark.draftRim,
  draftInk: emeraldDark.draftInk,
  draftIcon: emeraldDark.draftIcon,
  publishInk: emeraldDark.publishInk,
  inboxPreview: emeraldDark.inboxPreview,
  inboxChipInk: emeraldDark.inboxChipInk,
  inboxRule: emeraldDark.inboxRule,
  dropGlyph: emeraldDark.dropGlyph,
  dropDanger: emeraldDark.dropDanger,
  dropRule: emeraldDark.dropRule,
  secondaryBorder: emeraldDark.secondaryBorder,
  // 2026-09-21 — the shipped Welcome page's auth roles, by reference to ui/tokens.ts.
  authInk: emeraldDark.authInk,
  authMuted: emeraldDark.authMuted,
  authAccent: emeraldDark.authAccent,
  authGold: emeraldDark.authGold,
  authGlintCore: emeraldDark.authGlintCore,
  authGlintHalo: emeraldDark.authGlintHalo,
  authBadgeFill: emeraldDark.authBadgeFill,
  authShade: emeraldDark.authShade,
  authGroundTop: emeraldDark.authGroundTop,
  authGroundMid: emeraldDark.authGroundMid,
  authGroundBottom: emeraldDark.authGroundBottom,
  heroDiscTop: emeraldDark.heroDiscTop,
  heroDiscMid: emeraldDark.heroDiscMid,
  heroDiscBottom: emeraldDark.heroDiscBottom,
  authCtaTop: emeraldDark.authCtaTop,
  authCtaBottom: emeraldDark.authCtaBottom,

  // Lux: cream ink, the grey-green muted; the ground's middle stop; the glass
  // card's flat equivalent (rgba(12,44,38,.52) over the ground); the mint-neutral
  // rim — "NEUTRAL / MINT HAIRLINES everywhere … never the warm gold line".
  text: '#F1EDE1',
  textMuted: '#A9B8B1',
  textSubtle: '#8FA19A',

  background: '#0A1A17',
  surface: '#0C241F',
  // 2026-09-27: the Lux rim, rgba(200,255,230,.20), flattened over the card.
  border: '#325047',
  navInactive: emeraldDark.navInactive,

  // Live-state greens ride the one mint; warning keeps the hot amber on the
  // gold wash; danger is the Lux page's soft coral, readable on the dark glass.
  success: '#4FC58C',
  successBg: '#1A362D',
  warning: '#F2B04F',
  warningBg: '#2B2A1D',
  // 2026-09-28 (#7): one dark error red, the Map's included. Fix run E2 lifted it
  // #D8604B → #E57A66, 3.7:1 → 4.7:1 on the lit card (the red Sign out).
  danger: '#E57A66',
  dangerBg: '#3A1F1B',
  info: '#7FC4C4',
  infoBg: '#16302E',
  neutral: '#A9A08F',
  neutralBg: '#23302C',

  white: '#FFFFFF',
  black: '#000000',
  mediaChrome: '#0F1F17',
} as const;

/**
 * THE SCALE THE SCREENS READ (RUN T1 C2; fix run D8, 2026-10-03).
 *
 * Spacing and radius are ONE live group each now: ui/tokens.ts's `spacing`
 * and `radius`, re-exported here, so `spacing.xl` is 24 and `radius.md` is 12
 * whichever surface a file imports them from. Before D8 this file built its
 * own groups while ui/tokens.ts kept §I's older numbers (`spacing.xl` 20,
 * `radius.md` 14) under the same names. The studio addresses them as
 * `theme.spacing.*` / `theme.radius.*`; `radius.pill` is a shape, no dial.
 * `emeraldRadius` (above) is the same binding under its older name.
 */
export { spacing, radius };

/**
 * The heading voice used for Emerald headlines (Home's "Take a task off your
 * plate.", section titles, the hero CTA).
 *
 * ONE SERIF ROLE, EVERYTHING ELSE THE SYSTEM SANS. `display` resolves to the
 * platform's own system sans, the same family body copy uses — the
 * 2026-08-22 serif retirement (docs/emerald-v2/DECISIONS.md D5's second
 * dated note) stands for every role that names it. Later the same day the
 * operator PARTIALLY reversed it (D5's third dated note): the customer Home
 * hero title — that one role, nothing else — took a serif back.
 *
 * 2026-08-23 CHANGES THE FACE, NOT THE ROLE. That title was set in a bundled
 * PlayfairDisplay-Bold static; it is now the PLATFORM's Georgia. One role
 * still, and the same lever — but no font file is registered any more, so
 * App.tsx's launch gate no longer waits on `expo-font`, and a face that ships
 * with iOS cannot arrive late enough to paint a frame in a fallback.
 * `assets/fonts/PlayfairDisplay-Bold.ttf` and its OFL license stay on disk,
 * required by nothing and bundled by nothing; the themeTokens fence pins
 * them there.
 *
 * CONSEQUENCE FOR WEIGHT, INVERTED. A bundled static made `fontWeight` inert
 * on iOS — the family name WAS the weight. A platform face does not: iOS
 * picks the cut from `fontWeight` again, so the hero style carries an
 * explicit one ('700', the weight the Bold static shipped). Drop it and the
 * hero renders at Georgia regular.
 *
 * `display` is kept as a NAMED ROLE rather than deleted: the screens reach the
 * heading voice through it, so it stays the single lever if that voice is ever
 * repointed again. tests/themeTokens.test.mjs fences this state: exactly one
 * screen style may name `displayHero`, and any other serif — quoted, tokened
 * or bundled — stays red.
 *
 * With no file bundled ANYWHERE now, `fontWeight` is load-bearing on iOS —
 * it is how the heading roles below get their weight, and since 2026-08-23
 * how the hero role gets its weight too. Removing one renders that heading
 * at normal.
 */
export const fonts = {
  display: undefined as TextStyle['fontFamily'],
  /** The hero headlines' face. 2026-09-26 (the refresh): the system sans like
   *  every other role — the operator, pointing at the system face: "so i want
   *  this font… change any font from everywhere to this (default one i already
   *  have on the app)". The ROLE is kept so the four hero sites keep one lever;
   *  the naming styles keep their `fontWeight`, which the system face honours. */
  displayHero: undefined as TextStyle['fontFamily'],
} as const;

/**
 * 2026-09-26 (the refresh) — THE BOTTOM BAR KEEPS ITS OWN COLOURS. The operator:
 * "please dont touch the bottom nav bar... I like the current bottom nav bar".
 * The dark palette moved to Emerald Lux Glass; the bar reads THESE — the
 * palette it was drawn in — for every role it paints, so the refresh cannot
 * reach it. Light never moved, so light is the live palette itself.
 */
export const NAV_BAR_DARK = {
  background: '#02110D',
  surface: '#0A1813',
  emerald: '#5FAE81',
  gold: '#D4A24C',
  navInactive: '#7C8A80',
  onForest: '#F1EDE1',
  text: '#F1EDE1',
  textMuted: '#93A096',
  border: '#55482E',
} as const;

/** The palette the bottom bar paints with: the live one, with the bar's own
 *  frozen roles laid over it in dark. */
export function navBarPalette<P extends ColorPalette>(palette: P, isDark: boolean): P {
  return isDark ? { ...palette, ...NAV_BAR_DARK } : palette;
}

/**
 * 2026-09-27 (the Lux remake, ruling 2) — THE MAP AND THE FILTERS KEEP TODAY'S
 * COLOURS. "Map (worker and customer), the Filters sheet and its popups:
 * untouched … and their colours pinned to today's exact values". This is the
 * dark palette exactly as the repository shipped it before the remake (the
 * Prestige v2 set, every role those surfaces read), laid over the live one
 * for the subtree hooks/useThemeColors.ts pins (`PalettePinContext`,
 * value 'map'). Light never moved, so light is the live palette itself. The
 * pane materials and their edges are pinned beside it in ui/tokens.ts.
 */
export const MAP_DARK: ColorPalette = {
  primary: '#1B3527',
  primaryDark: '#162B21',
  primarySoft: '#0E1F18',
  ctaTop: '#1B3527',
  ctaBottom: '#1B3527',
  onPrimary: '#F1EDE1',
  onForest: '#F1EDE1',
  star: '#F59E0B',
  ...constantAccents,
  forest: '#1B3527',
  emerald: '#5FAE81',
  gold: '#D4A24C',
  goldSoft: '#251E10',
  mint: '#0E1F18',
  mint2: '#254539',
  ink: '#F1EDE1',
  homeBackground: '#02110D',
  homeSlate: '#93A096',
  homeModeRing: '#6A736C',
  homeHairline: '#55482E',
  homeLive: '#5FAE81',
  homeLiveHalo: '#254539',
  taskCardLitTop: '#15362B',
  taskCardLitBottom: '#0B2019',
  taskCardEdge: '#27473A',
  pinTop: '#224634',
  pinBottom: '#06180F',
  pinGlyph: '#EEE4C4',
  emeraldBright: '#84DFAA',
  eyebrow: '#D4A24C',
  eyebrowGold: '#D4A24C',
  notifMessage: '#7DB9F0',
  wizardProgress: '#5FAE81',
  // 2026-09-28: roles born after the pin; the Map's money and marks stay today's gold.
  stageAssigned: '#E9C170',
  stageAssignedBg: '#E9C170',
  stageProgress: '#FF9046',
  stageProgressBg: '#FF9046',
  stageReview: '#B9A6FF',
  stageReviewBg: '#B9A6FF',
  avatarFill: '#173A31',
  avatarRim: '#325047',
  avatarInk: '#F1EDE1',
  money: '#D4A24C',
  mark: '#D4A24C',
  grey: '#909594',
  waitingFill: '#073328',
  waitingInk: '#909594',
  barGround: '#0A231E',
  barRim: '#2C4D44',
  draftFill: '#081F19',
  draftRim: '#2E765A',
  draftInk: '#ABB4AE',
  draftIcon: '#AFB8B3',
  publishInk: '#030A12',
  inboxPreview: '#D5DED9',
  inboxChipInk: '#93A59D',
  inboxRule: '#C8FFE6',
  dropGlyph: '#9CC9B6',
  dropDanger: '#E57A66',
  dropRule: '#C8FFE6',
  secondaryBorder: '#2F5140',
  authInk: '#F3F1E8',
  authMuted: '#A9B8B1',
  authAccent: '#7EE2B4',
  authGold: '#E9C170',
  authGlintCore: '#FFE9B0',
  authGlintHalo: '#E9C170',
  authBadgeFill: '#0A2822',
  authShade: '#000000',
  authGroundTop: '#062421',
  authGroundMid: '#0A1A17',
  authGroundBottom: '#07110F',
  heroDiscTop: '#19553F',
  heroDiscMid: '#0F3B30',
  heroDiscBottom: '#0A2A23',
  authCtaTop: '#1C503F',
  authCtaBottom: '#0E3229',
  text: '#F1EDE1',
  textMuted: '#93A096',
  textSubtle: '#7C8A80',
  background: '#02110D',
  surface: '#0A1813',
  border: '#55482E',
  navInactive: '#7C8A80',
  success: '#5FAE81',
  successBg: '#0E1F18',
  warning: '#F2B04F',
  warningBg: '#251E10',
  danger: '#E57A66',
  dangerBg: '#301E19',
  info: '#5FA3A3',
  infoBg: '#1B2B2A',
  neutral: '#A79D8B',
  neutralBg: '#2A2620',
  white: '#FFFFFF',
  black: '#000000',
  mediaChrome: '#0F1F17',
};

/** The palette a pinned map subtree resolves: today's dark, or the live light. */
export function mapPalette<P extends ColorPalette>(palette: P, isDark: boolean): P {
  return isDark ? { ...palette, ...MAP_DARK } : palette;
}

/** The §I (ui/tokens.ts) dark roles the remake moved, as they were — for the
 *  same pinned subtree's `emerald` read. */
export const MAP_EMERALD_DARK: Partial<EmeraldPalette> = {
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
  danger: '#E57A66',
  secondaryBorder: '#2F5140',
  onForest: '#F1EDE1',
  taskCardLitTop: '#15362B',
  taskCardLitBottom: '#0B2019',
  taskCardEdge: '#27473A',
  eyebrow: '#D4A24C',
  eyebrowGold: '#D4A24C',
  notifMessage: '#7DB9F0',
  wizardProgress: '#5FAE81',
  authAccent: '#7EE2B4',
  authGold: '#E9C170',
  authGlintHalo: '#E9C170',
};

export function mapEmerald<P extends EmeraldPalette>(palette: P, isDark: boolean): P {
  return isDark ? { ...palette, ...MAP_EMERALD_DARK } : palette;
}

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

/** Soft, grounded shadows. */
export const shadows: Record<'card' | 'raised' | 'cardDark' | 'ctaDark', ViewStyle> = {
  /**
   * RUN GROUND1 (C4) — SURFACED HERE, DEFINED ONCE, IN ui/tokens.ts.
   *
   * lib/theme.ts is the standard import surface for screens (CLAUDE.md), and
   * the files that spread a card shadow take `shadows` from here rather than
   * from the token file. Re-exporting the whole record is not possible — this
   * module owns a `shadows` of its own — so the one entry is surfaced by
   * reference. Copying its numbers instead would put two sets of them in the
   * tree, which is the specific failure the token exists to prevent.
   *
   * Its docblock in ui/tokens.ts carries the measurement and the reasoning.
   */
  cardDark: tokenShadows.cardDark,
  // 2026-09-27 (the operator's review): the Lux CTA glow, surfaced the same way.
  ctaDark: tokenShadows.ctaDark,
  card: {
    shadowColor: '#1F2E22',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#1F2E22',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
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
    /** Field and card hairlines. 2026-09-27 (the Lux remake): mint-neutral in
     *  dark, never the warm gold line — gold is for the labels, the eyebrows,
     *  the money and the greeting's name (ruling 4), lines are the Lux rim. */
    line: isDark ? alpha(palette.emerald, 0.28) : palette.border,
    accent: isDark ? palette.gold : palette.emerald,
    /** 2026-09-28 (LUX-LIST-64 #1–#3): a sign-in/up FIELD's caption is the
     *  mint in dark and the light token's green in light (the Lux `.field
     *  svg{color:var(--acc)}`), no longer the gold eyebrow; its glyph is the
     *  mint in dark and the forest #064C3B in light (#47). */
    fieldLabel: palette.emerald,
    fieldGlyph: palette.forest,
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
  // 2026-09-27 (the Lux remake, ruling 11) — the chosen option lights MINT,
  // not gold: "the chip keeps its dark glass; the icon and text turn #4FC58C
  // and the rim lights mint". The shape of the treatment is unchanged (a line
  // and a label, no fill); only the colour moved, with the ruling.
  return {
    /** The chosen option's outline, and its label and glyph. */
    line: palette.emerald,
    /** The accent never fills a control, so a chosen option carries no fill. */
    fill: 'transparent',
    /** The other options in the same group — the hairline tier, so a group of
     *  outlined chips still has a clear winner. */
    idleLine: alpha(palette.emerald, 0.3),
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
/**
 * 2026-09-27 (the Lux remake, ruling 4) — THE EYEBROW: every small section
 * heading (POPULAR SERVICES, YOUR JOBS, NEEDS YOUR ATTENTION, GETTING THERE,
 * FINAL SETUP, BEFORE YOU START, STEP 1 OF 4, BRAZOS MARKETPLACE…) is the Lux
 * page's eyebrow — small caps, tracked, 700 — GOLD in dark and, because gold
 * on the cream ground fails contrast for small text, EMERALD in light. One
 * measure for both themes; only the colour forks — through the `eyebrow`
 * palette role, so a heading names one token. The measure is the Lux
 * `.eyebrow` (11.5/700/1.6) at whole points. ONE SPELLING (fix run D7): this is
 * ui/tokens.ts's `type.eyebrow`, and every section label spreads it unchanged.
 */
export const EYEBROW_TYPE = tokenType.eyebrow satisfies TextStyle;

export function eyebrowStyle(palette: { eyebrow: string }): TextStyle {
  return { ...EYEBROW_TYPE, color: palette.eyebrow };
}

/**
 * 2026-09-27 (the Lux remake, ruling 9) — THE GROUND of every dark screen: the
 * Lux diagonal, `linear-gradient(165deg, #062421 0%, #0A1A17 55%, #07110F
 * 100%)`, read from the three auth ground stops so there is one definition of
 * it (ui/tokens.ts `dark.authGround*`). Spread onto a screen's root OVER its
 * flat `background`, which stays underneath as the fallback. Light returns
 * null and keeps its flat cream — its three stops are equal, so nothing would
 * draw. The style key is the one every lit surface uses
 * (ui/primitives/LitSurface.tsx): `experimental_backgroundImage`.
 */
/**
 * 2026-09-29 (LUX-LIST-2 #6) — THE LIT CARD for a hand-styled card, tile or icon square: the same
 * numbers the `card` material wears (ui/tokens.ts `litCard`) — the wash, the 1pt rim, the top edge as
 * an inset shadow and the lift, in ONE boxShadow on both platforms. Spread it LAST over a card's own
 * style: it owns the fill, the rim and the shadow in both themes. `kind: 'tile'` takes the softer light
 * shadow of a tile or icon square.
 */
export function litCardStyle(isDark: boolean, kind: 'card' | 'tile' = 'card'): ViewStyle {
  const look = isDark ? tokenLitCard.dark : tokenLitCard.light;
  const lift = kind === 'tile' ? look.tileShadow : look.shadow;
  const parts = [
    look.edge ? `inset 0 1px 0 ${alpha(look.edge.color, look.edge.alpha)}` : null,
    `0 ${lift.y}px ${lift.radius * 2}px ${alpha(lift.color, lift.alpha)}`,
  ].filter(Boolean);
  const gradient = `linear-gradient(180deg, ${look.top} 0%, ${look.bottom} 100%)`;
  return {
    backgroundColor: look.bottom,
    experimental_backgroundImage: gradient,
    borderWidth: 1,
    borderColor: alpha(look.rim.color, look.rim.alpha),
    boxShadow: parts.join(', '),
  } as ViewStyle;
}

/**
 * 2026-09-29 (LUX-LIST-2 #7) — the lit card's own ground (its lower stop), for a ring that has to
 * read as the card behind it: Profile's overlapping faces cut into each other with it.
 */
export function litCardGround(isDark: boolean): string {
  return (isDark ? tokenLitCard.dark : tokenLitCard.light).bottom;
}

export function screenGround(
  palette: { authGroundTop: string; authGroundMid: string; authGroundBottom: string },
  isDark: boolean,
): ViewStyle | null {
  if (!isDark) return null;
  const gradient = `linear-gradient(165deg, ${palette.authGroundTop} 0%, ${palette.authGroundMid} 55%, ${palette.authGroundBottom} 100%)`;
  return { experimental_backgroundImage: gradient } as ViewStyle;
}

/**
 * Fix run D11 / D13 — AN EDGE FADE: a gradient from the ground's own colour at
 * zero alpha to that colour, solid from `solidAt` percent on, along `angle`
 * (CSS degrees: 90 runs left → right, 180 top → bottom). Laid over the edge of
 * something that scrolls under it — the inbox pills' right edge, the strip
 * under the floating tab bar — so content ends in the ground rather than at a
 * cut. Zero alpha of the SAME colour, never `transparent`, so the ramp never
 * passes through grey. The same style shape as `screenGround()`.
 */
export function edgeFade(to: string, angle = 90, solidAt = 100): ViewStyle {
  const gradient = `linear-gradient(${angle}deg, ${alpha(to, 0)} 0%, ${to} ${solidAt}%)`;
  return { experimental_backgroundImage: gradient } as ViewStyle;
}

/** One answer per drawn size, so a control's hitSlop keeps its identity across renders. */
const touchSlopCache = new Map<string, Insets>();

/**
 * Fix run E3 — the hitSlop that lifts a control drawn `height` tall (and, when
 * given, `width` wide) to the 44pt touch floor without changing what it draws:
 * the house rule "hitSlop over drawn size" (ui/primitives/Toggle.tsx). Each
 * axis gets half the shortfall on either side, rounded up, and nothing once
 * the drawn size already meets the floor; with no `width` the sides get none,
 * for a text link whose label is wider than the floor already.
 */
export function touchSlop(height: number, width?: number): Insets {
  const key = `${height}|${width ?? ''}`;
  const cached = touchSlopCache.get(key);
  if (cached) return cached;
  const floor = controls.minTouchTarget;
  const vertical = Math.max(0, Math.ceil((floor - height) / 2));
  const horizontal = width == null ? 0 : Math.max(0, Math.ceil((floor - width) / 2));
  const insets = { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
  touchSlopCache.set(key, insets);
  return insets;
}

/** One answer per drawn size, as touchSlop(): the two styles keep their identity across renders. */
const slopRoomCache = new Map<number, { scroller: ViewStyle; content: ViewStyle; slop: number }>();

/**
 * E3 review (2026-10-03) — THE ROOM A HORIZONTAL SCROLLER MAKES FOR ITS PILLS' SLOP. A hitSlop
 * reaches through a parent whose overflow is visible: Yoga folds every child's hitSlop into the
 * parent's overflow inset (YogaLayoutableShadowNode.cpp, getContentBounds), and the hit test lets
 * a touch past such a parent's edge. A ScrollView is `overflow: scroll`, so its inset is empty and
 * iOS rejects any touch outside its frame (RCTScrollViewComponentView betterHitTest); an
 * `overflow: hidden` ancestor clips the same way. So a 34pt pill in a horizontal row stayed a
 * 34pt target whatever its slop said. The scroller takes the slop as a negative vertical margin
 * and the content container gives it back as padding: the scroller's frame grows by the slop on
 * each side, the pills' slop now ends at that frame, and nothing drawn moves. `scroller` goes on
 * the ScrollView's `style`, `content` on its `contentContainerStyle`
 * (tests/touchTargets.test.mjs scans every horizontal scroller that holds a slopped control);
 * `slop` is the number itself, for a scroller with a vertical margin of its own to keep that
 * margin net of the room (an edge margin beats `marginVertical`).
 */
export function slopRoom(height: number): { scroller: ViewStyle; content: ViewStyle; slop: number } {
  const cached = slopRoomCache.get(height);
  if (cached) return cached;
  const slop = touchSlop(height).top ?? 0;
  const room = { scroller: { marginVertical: 0 - slop }, content: { paddingVertical: slop }, slop };
  slopRoomCache.set(height, room);
  return room;
}

/** The height one line of `style` draws: its lineHeight, else the platform's ~1.2 em. */
export function textLine(style: TextStyle): number {
  return style.lineHeight ?? Math.ceil((style.fontSize ?? 14) * 1.2);
}

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

/**
 * A sheet that carries no colour, built once on first use rather than at
 * import:
 *
 *   const stylesFor = metricStyles(() => StyleSheet.create({ … }));
 *   // in the component:
 *   const styles = stylesFor();
 *
 * A sheet that carries RESOLVED colour belongs in `themedStyles` above: this
 * one takes no palette, so it cannot repaint on a theme change.
 */
export function metricStyles<T>(factory: () => T): () => T {
  let cached: T | undefined;
  return () => {
    if (cached === undefined) cached = factory();
    return cached;
  };
}

export const theme = { colors, spacing, radius, typography, fonts, shadows } as const;
