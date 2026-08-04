import { Platform, type ViewStyle } from 'react-native';

/**
 * Design tokens for the "Emerald Trust" launch/auth surface (Launch, Welcome,
 * Sign in, Create account).
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
  /** --bg */
  bg: '#F6F3EA',
  /** --surface */
  surface: '#FFFFFF',
  /** --ink */
  ink: '#13201B',
  /** --muted */
  muted: '#6E7771',
  /** --forest — primary fill for CTAs and the small brand chrome. */
  forest: '#064C3B',
  /** --emerald — accent for eyebrows, icons, focus rings. */
  emerald: '#0D6B52',
  /** --mint */
  mint: '#E5F1EC',
  /** --mint2 */
  mint2: '#D3E8DF',
  /** --gold — the launch wordmark, matched to the supplied logo's gold. */
  gold: '#C8A15B',
  /** --gold-soft */
  goldSoft: '#F3E7CE',
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
  button: 16,
  card: 20,
  chip: 17,
  iconButton: 14,
  /** .otp span 14 -> 16, to stay proportional to the taller cell below. */
  otpCell: 16,
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
  /** .btn height 38 -> 54. */
  button: 54,
  /** .field-value min-height 42 -> 54. */
  field: 54,
  /** .icon-btn 38 -> 44. */
  iconButton: 44,
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
} as const;

/** --shadow: 0 10px 28px rgba(16,38,29,.08), plus the softer .art-card lift. */
export const authShadows: Record<'card' | 'logo', ViewStyle> = {
  card: Platform.select({
    web: { boxShadow: '0 10px 28px rgba(16,38,29,0.08)' },
    default: {
      shadowColor: '#102A1D',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
  }) as ViewStyle,
  // .launch-logo box-shadow: 0 18px 40px rgba(0,0,0,.2)
  logo: Platform.select({
    web: { boxShadow: '0 18px 40px rgba(0,0,0,0.2)' },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
  }) as ViewStyle,
};
