import type { ViewStyle } from 'react-native';
import { brand } from '../ui/tokens';

/**
 * Design tokens for the "Emerald Trust" launch/auth surface (Launch, Welcome,
 * Sign in, Create account).
 *
 * PHASE 1 (2026-08-08): the seven shared Emerald hues below now come from
 * `brand` in ui/tokens.ts — the one authoritative palette definition — rather
 * than being restated here. Values are unchanged (Phase 0 verified these were
 * already byte-identical), so the LOCKED auth screens 01-06 render exactly as
 * before. The auth-surface-only values (sand, launch gradient stops, backdrop
 * rgba strokes, onDark) stay here, because that is what they are: specific to
 * this surface, not app-wide tokens.
 *
 * These are NOT a second design system: they exist because the auth flow is the
 * one part of the app that renders on the emerald/ivory brand palette rather
 * than the in-app forest/cream palette in lib/theme.ts. Every value below is
 * lifted from the supplied reference stylesheet
 * (design-reference/emerald-auth-v1/.../style.css) so the screens can't drift
 * from it via scattered magic numbers.
 *
 * Where the reference is smaller than a real phone can use — it is a 390x844
 * static mock that packs 66 screens, so its buttons are 38px tall and its body
 * copy is 11px — the token is scaled up to the production size and the
 * reference value is recorded beside it. Touch targets stay >= 44pt per the
 * repo's mobile UX rules.
 */

export const authColors = {
  // forest, emerald, gold, goldSoft, mint, mint2, ink — from ui/tokens.ts.
  ...brand,
  /** --bg */
  bg: '#F4F1E8',
  /** --surface */
  surface: '#FFFFFF',
  /** --muted */
  muted: '#56605A',
  /** --line */
  line: '#DDE2DD',
  /** --danger */
  danger: '#9C3F35',
  /** .field-value.placeholder */
  placeholder: '#A0A6A1',

  /** Sand end of the welcome artwork ring (from .art-ring's gradient). */
  sand: '#F2E5CB',
  /** Midpoint of the ring gradient, used as its base fill. */
  sandMint: '#E4EBD6',

  onDark: '#FFFFFF',
  /** .launch p */
  onDarkMuted: '#CFE2DB',

  // Decorative backdrop (components/AuthBackdrop.tsx). Deliberately expressed
  // as rgba rather than as flat hexes with an `opacity` on the view: the rings
  // overlap, and stacking opaque strokes at view-level opacity would darken
  // every crossing point into a visible seam.
  /** Contour stroke — the strongest line in the backdrop, still barely there. */
  artLine: 'rgba(13, 107, 82, 0.09)',
  /** The outer rings of a contour cluster, fading out from artLine. */
  artLineFaint: 'rgba(13, 107, 82, 0.05)',
  /** Warm counterpoint, matched to --gold, for the long sweeping arcs. */
  artLineGold: 'rgba(200, 161, 91, 0.13)',
  /** A single soft wash behind a contour cluster, for depth rather than line. */
  artWash: 'rgba(211, 232, 223, 0.38)',

  // .launch-screen's radial-gradient(circle at 75% 20%, #2C8068, #064C3B 42%,
  // #032E24 100%) — reproduced as layered views, no gradient dependency.
  launchGlow: '#2C8068',
  launchMid: '#064C3B',
  launchDeep: '#032E24',
} as const;

/** Reference radii: .field-value 14, .btn 13, .card 20, .icon-btn 14. */
export const authRadius = {
  field: 14,
  /** 2026-09-28 (LUX-LIST-64 #6): fully round — half the 52 height, the Lux `.cta` 52/26.
   *  2026-09-28 (LUX-LIST-2 #2): softened to 22 — the operator found the pill too circular and
   *  picked the middle ground (option b): 8 pt of straight side on the 52 height. */
  button: 22,
  card: 20,
  chip: 17,
  iconButton: 14,
  /** .otp span 14 -> 16, to stay proportional to the taller cell below. */
  otpCell: 16,
  /** 2026-09-21 — the shipped Welcome page's controls (docs/mockups/html/lux/
   *  welcome-ship.html): the two boxed actions at radius 22, the badges at 20. */
  /** 2026-09-28 (#6): the Welcome's boxed actions take the one round 52 shape too —
   *  22 since LUX-LIST-2 #2, with every other auth button. */
  heroButton: 22,
  heroBadge: 20,
} as const;

export const authSpacing = {
  /** .auth / .welcome horizontal padding. */
  gutter: 20,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Heights. The reference's 38pt button and 42pt field are below the 44pt
 * minimum touch target the repo requires, so both are raised.
 */
export const authSizes = {
  /** .btn height 38 -> 54; 2026-09-28 (LUX-LIST-64 #6): 52, the Lux `.cta`,
   *  on every launch, sign-in, sign-up, verify, legal and setup button. */
  button: 52,
  /** The shipped Welcome page's boxed actions (52 since #6), its text link, its badges. */
  heroButton: 52,
  heroLink: 44,
  /** 42, not 40: the page's badge is a 40 content box inside a 1-pt border. */
  heroBadge: 42,
  /** .field-value min-height 42 -> 54. */
  field: 54,
  /** .icon-btn 38 -> 44. */
  iconButton: 44,
  /**
   * 2026-09-21 — the sign-in ship pages' back control (DECISIONS 21): the iOS
   * circular button's disc inside the 44 target, and its chevron one size
   * down from the bare 22 the untouched screens keep.
   */
  backCircle: 36,
  backChevron: 20,
  /** .auth-logo 52 -> 56. */
  logoAuth: 56,
  /**
   * A code cell. The reference's 42x50 renders as a rounded square once the
   * width is allowed to grow into the row; these are the portrait proportions
   * the shape is supposed to have — taller than the fields, and capped so six
   * of them stay a row of slots rather than stretching into tiles.
   */
  otpCell: 64,
  otpCellMaxWidth: 52,
  /** .launch-logo 104. */
  logoLaunch: 104,
  /**
   * The reference viewport is 390 wide. On a wide web window the mobile
   * composition is centred inside this instead of being stretched.
   */
  maxContentWidth: 420,
} as const;

/**
 * Type scale. `ref` in each comment is the reference stylesheet's value; the
 * mock's 8-11px sizes are display artefacts of a packed contact sheet, not
 * shippable mobile type.
 */
export const authType = {
  /** .eyebrow — ref 9/800/1.2 */
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 1.6 },
  /** .auth h1 — ref 31/1.05 */
  title: { fontSize: 30, fontWeight: '700', lineHeight: 35 },
  /** .welcome-copy h1 — ref 36/0.98 */
  display: { fontSize: 38, fontWeight: '800', lineHeight: 42 },
  /** .auth p / .welcome-copy p — ref 14/1.45 */
  body: { fontSize: 16, lineHeight: 24 },
  /** .field > span — ref 8/800/0.5 */
  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  /** .field-value — ref 11 */
  fieldValue: { fontSize: 16 },
  /** .btn — ref 11/800 */
  button: { fontSize: 16, fontWeight: '700' },
  /** .art-card — ref 10/800 */
  badge: { fontSize: 13, fontWeight: '700' },
  /** .info-strip — ref 10/1.35 */
  note: { fontSize: 13, lineHeight: 18 },
  /** .top-title strong — ref 15 */
  navTitle: { fontSize: 15, fontWeight: '700' },
  /**
   * The same bar, one step up, for a screen whose title is the only thing
   * naming what the user is doing. Verify phone uses it: it has no brand mark
   * and no form label, so 15pt read as chrome rather than as the heading of
   * the step.
   */
  navTitleLarge: { fontSize: 17, fontWeight: '700' },
  /** .launch h1 — ref 27/ls 5 */
  wordmark: { fontSize: 30, letterSpacing: 6 },
  /** .launch p — ref 12 */
  tagline: { fontSize: 14, letterSpacing: 0.2 },
  // 2026-09-21 — the shipped Welcome page's type (welcome-ship.html), measured
  // there: the eyebrow 13/700 tracked 2 on a 17 line; the display 44/47 tracked
  // −0.6 (the platform serif, weight 700 — the face is named at the call site);
  // the body 16/22; the boxed actions' label 17/600; the text link 16/600;
  // the badge 13/600 tracked 0.1.
  heroEyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 2, lineHeight: 17 },
  heroDisplay: { fontSize: 44, fontWeight: '700', lineHeight: 47, letterSpacing: -0.6 },
  heroBody: { fontSize: 16, lineHeight: 22 },
  heroButton: { fontSize: 17, fontWeight: '600' },
  heroLink: { fontSize: 16, fontWeight: '600' },
  heroBadge: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  // 2026-09-21 — the shipped Sign-in page's headline (docs/mockups/html/lux/
  // signin-ship-light.html): the Welcome's serif at the form size, 34/38
  // tracked −0.4, weight 700 — the face is named at the call site.
  heroTitle: { fontSize: 34, fontWeight: '700', lineHeight: 38, letterSpacing: -0.4 },
} as const;

/** --shadow: 0 10px 28px rgba(16,38,29,.08), plus the softer .art-card lift. */
export const authShadows: Record<'card' | 'logo', ViewStyle> = {
  card: {
    shadowColor: '#102A1D',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  // .launch-logo box-shadow: 0 18px 40px rgba(0,0,0,.2)
  logo: {
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
};
