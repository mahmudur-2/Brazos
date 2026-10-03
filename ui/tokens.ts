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
  bg: '#F4F1E8',
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

  /**
   * 2026-09-18 — THE CUSTOMER HOME'S TASK CARD: lit in dark, flat in light.
   *
   * docs/mockups/html/home-redesign.html draws the dark card as a
   * top-to-bottom gradient between two shades inside its own edge — three
   * values no palette carried, so they are named here (the `dark` block
   * below holds the mockup's hexes) and the screen names the tokens, never a
   * hex. LIGHT DRAWS THE SAME CARD FLAT: `surface` inside a `line` hairline,
   * which is exactly what the three resolve to on this side — restated
   * rather than referenced because an object literal cannot read its own
   * keys, the same reason `dark.onForest` restates `dark.ink`. One card, one
   * set of roles, two palettes; screens/HomeScreen.tsx reads all three in
   * both themes and gates only the GRADIENT on the theme.
   */
  /** The card's top stop. Light: `surface`. */
  taskCardLitTop: '#FFFFFF',
  /** The card's bottom stop, and its flat fill under the gradient. Light: `surface`. */
  taskCardLitBottom: '#FFFFFF',
  /** The card's 1pt edge. Light: `line`. */
  taskCardEdge: '#DDE2DD',
  /** 2026-09-19 — the map pin, from the approved Map design's reference
   *  sheet (its --pin-top / --pin-bottom / --pin-ink): the head is lit from
   *  `pinTop` to `pinBottom`, the briefcase drawn in `pinGlyph`. Light:
   *  a white-to-mint head with a forest glyph. */
  pinTop: '#F9FDF4',
  pinBottom: '#E4F2DF',
  pinGlyph: '#426D48',
  /**
   * 2026-09-21 — THE CHOSEN GREEN on the Filters sheet and its popups: the
   * chosen pill's fill (.16), rim (.48) and ink, the Best Match tick, the
   * Sort caret, the popup's chosen row and tick. The approved sheet
   * (docs/mockups/html/map-explore-filters-dark.html) draws them in #84dfaa
   * where the app drew `dark.emerald` #5FAE81 at the same alphas, which the
   * operator read as "very dim" — DECISIONS 2026-09-20 sitting 3, (2). Light
   * is the emerald restated (an object literal cannot read its own keys), so
   * light is unchanged by value. NOT a change to `emerald`: D0 and the nav
   * pin that green.
   */
  emeraldBright: '#0D6B52',
  /**
   * 2026-09-27 (the Lux remake, ruling 4) — THE EYEBROW'S COLOUR: every small
   * section heading and field label reads this role — the emerald in light
   * (gold on the cream ground fails contrast for small text) and today's gold
   * in dark. A role rather than an `isDark` fork at sixty call sites, so a
   * heading style names ONE token in both themes. Light restates the emerald
   * (an object literal cannot read its own keys).
   */
  // 2026-09-28 (#48): light labels were the antique gold #86641A.
  // 2026-09-29 (LUX-LIST-2 #4): back to the emerald #0D6B52 — the operator's
  // boxes on the #86641A sheet kept 25 labels gold; those read eyebrowGold.
  eyebrow: '#0D6B52',
  /** 2026-09-29 (LUX-LIST-2 #4) — the 25 labels that stay antique gold in light. */
  eyebrowGold: '#86641A',
  /** 2026-09-29 (LUX-LIST-2 #8) — the notification feed's MESSAGE kind: a soft blue, its one use. */
  notifMessage: '#2F6FA8',
  /**
   * 2026-09-27 (the Lux remake, ruling 6) — the Post-a-job PROGRESS BAR keeps
   * today's green: the Prestige emerald in dark, the Heritage emerald in
   * light. Pinned as its own role because `emerald` moved to the one mint.
   */
  wizardProgress: '#0D6B52',
  /**
   * 2026-09-21 — THE WELCOME PAGE AS SHIPPED (docs/mockups/html/lux/
   * welcome-ship.html and welcome-ship-light.html, the operator's pick with
   * the rim glint; DECISIONS 18): the auth surface's roles, one value per
   * palette, so the screen can be matched to its page in BOTH themes from
   * tokens alone. Dark carries the page's own hexes (the Emerald Lux Glass
   * ink, muted, mint accent and gold — which differ from the in-app dark
   * `ink`/`gold` by a few levels, deliberately: the auth flow is the one
   * surface on its own palette, lib/authTheme.ts); light carries the light
   * page's: the Heritage ink, muted, emerald and gold, the ivory ground
   * (flat — three equal stops), the forest CTA (two equal stops), the pale
   * mint disc. The gradients are gated on the theme where a stop pair is
   * equal (`litBetween` flat), never on a colour fork in a screen.
   */
  authInk: '#13201B',
  authMuted: '#6E7771',
  authAccent: '#0D6B52',
  authGold: '#C8A15B',
  authGlintCore: '#FFF6DE',
  authGlintHalo: '#E8C98C',
  authBadgeFill: '#FFFFFF',
  authShade: '#10261D',
  authGroundTop: '#F4F1E8',
  authGroundMid: '#F4F1E8',
  authGroundBottom: '#F4F1E8',
  heroDiscTop: '#F6F9F4',
  heroDiscMid: '#DEEBE1',
  heroDiscBottom: '#CDDCCF',
  authCtaTop: '#064C3B',
  authCtaBottom: '#064C3B',
  /**
   * 2026-09-28 (LUX-LIST-64) — THE STAGE COLOURS, one role per job stage, so a
   * status pill, the Inbox job chip, the Home live bar's Sonar dot and the
   * stage rail all say "Assigned" / "In progress" / "Review work" in the same
   * hue. Light is the FILLED recipe the app's light pills already use (a pale
   * tint under the ink, the rim near-invisible): `stageAssigned` #8A6414 on
   * #F5EAD2 and `stageReview` #5B45C7 on #ECE7FF are the approved reference
   * pages' own (docs/mockups/html/refs/home-tucked-in.html,
   * inbox-clean-list.html); `stageProgress` #9A4608 on #FBE2CA is the
   * operator's peach (#46). Dark draws the ink itself, outlined (see `dark`).
   */
  stageAssigned: '#8A6414',
  stageAssignedBg: '#F5EAD2',
  stageProgress: '#9A4608',
  stageProgressBg: '#FBE2CA',
  stageReview: '#5B45C7',
  stageReviewBg: '#ECE7FF',
  /** 2026-09-28 (#25) — an initials avatar: the deep green disc with cream
   *  initials, its rim the fill itself in light (the reference's own). */
  avatarFill: '#1F4A3C',
  avatarRim: '#1F4A3C',
  avatarInk: '#F1EDE1',
  /** 2026-09-28 (#40) — MONEY IS WHITE: a price is ink, never the gold
   *  ("gold for money" ends). Light: the near-black display ink. */
  money: '#13201B',
  /**
   * 2026-09-28 (#47) — A MARK: the small non-destructive icons and glyphs
   * that wore the brand gold (a menu row's glyph, the chat ⋯, the swipe
   * buttons, the create sheet, the job card's sparkle, the success tick…).
   * Gold in dark, as today; the deep forest green in light, where the gold
   * read as too much gold on the cream. Brand and ratings (the wordmark,
   * stars, read ticks, toggle knobs) keep `gold`.
   */
  mark: '#064C3B',
  /** 2026-09-28 (LUX-LIST-64) — THE GREY the operator names #909594: a quiet
   *  state that is not text — an unchosen Start-in tile (#9), the Inbox's empty
   *  glyph (#26), the media limit pills' words (#33). One value, both themes. */
  grey: '#909594',
  /** 2026-09-28 (#10, #41) — A PRIMARY THAT IS WAITING: its fill and ink until it
   *  can be tapped (the job-summary page's `.publish:disabled`). Light is the
   *  app's own disabled fill (`neutralBg`, emerald D7) under the same grey. */
  waitingFill: '#EDE7DA',
  waitingInk: '#909594',
  /** 2026-09-28 (#41) — THE POSTING BAR (refs/bottom-bar.html): its ground and
   *  top line, and the quiet Save draft button's fill, rim and ink. Light: the
   *  light tab bar's own ground and line (refs/home-tucked-in.html), a white
   *  pill under the sage rim with the muted ink. */
  barGround: '#FBFAF6',
  barRim: '#E6DFD3',
  draftFill: '#FFFFFF',
  draftRim: '#B9D3C6',
  draftInk: '#5F6B66',
  /** 2026-09-28 (#41) — the Save draft glyph, a shade off its words (#AFB8B3 in
   *  dark), and the commitment's ink (#030A12 in dark, measured on the
   *  reference's Publish). Light: the muted ink, and the light primary's cream. */
  draftIcon: '#5F6B66',
  publishInk: '#F4F1E8',
  /** 2026-09-28 (#54) — THE INBOX ROW (refs/inbox-clean-list.html, version 9):
   *  the message under the name (#2E3A35 light, #D5DED9 dark), the job chip's
   *  quiet ink (#6B7A73 / #93A59D), and the hairline between rows (#E6DFD3 in
   *  light; dark draws #C8FFE6 at .11 — the alpha rides at the call site). */
  inboxPreview: '#2E3A35',
  inboxChipInk: '#6B7A73',
  inboxRule: '#E6DFD3',
  /** 2026-09-28 (#53) — THE ••• GLASS DROPDOWN's glyphs (#4E6A5F light, #9CC9B6
   *  dark), its red rows (#A8432B light, #E36A53 dark — the reference's own red,
   *  for this menu), and its group rule (#0E6B52 / #C8FFE6, at .12). */
  dropGlyph: '#4E6A5F',
  dropDanger: '#A8432B',
  dropRule: '#0E6B52',
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
  // 2026-09-26 (the refresh) — EMERALD LUX GLASS (DECISIONS (14), the operator's
  // pick; docs/mockups/html/lux/README.md is the system). `forest` is the mint of
  // the Lux CTA (its gradient #8DF0C0 → #4FC58C, flat at its middle) with the Lux
  // dark ink on it; `emerald` is mint #7EE2B4, the ONE action colour; `gold` is
  // the Lux gold, for money and eyebrows only; cream ink, grey-green muted; the
  // ground's middle stop and the glass card's flat equivalent; mint-neutral
  // lines, never the warm gold hairline.
  // 2026-09-27 (the Lux remake, docs/dispatch/LUX-REMAKE.md rulings 4 and 5):
  // ONE mint, #4FC58C — the darker stop of the Lux CTA gradient — as the
  // action colour AND the CTA fill ("one accent, nothing brighter"); the gold
  // is today's Prestige gold #D4A24C, never the Lux #E9C170 ("please dont
  // change any gold colors besides that"). The rim is the Lux glass rim
  // (rgba(200,255,230,.20)) flattened over the card fill.
  forest: '#4FC58C',
  emerald: '#4FC58C',
  gold: '#D4A24C',
  goldSoft: '#2B2A1D',
  mint: '#1A362D',
  mint2: '#2F5A4A',
  // The cream the light [ + ] and pill are built from (H3) — kept at the
  // Prestige cream, which the Lux ink #F3F1E8 matches to the eye.
  ink: '#F1EDE1',

  bg: '#0A1A17',
  surface: '#0C241F',
  muted: '#A9B8B1',
  line: '#325047',
  // 2026-09-28 (#7): the dark error red is the Map's #D8604B everywhere.
  danger: '#D8604B',
  // Danger SURFACES keep their pre-v2 values by decision.
  dangerSurface: '#33201B',
  dangerBorder: '#4C2E26',
  secondaryBorder: '#2C4A42',
  navInactive: '#7C8A80',
  onForest: '#062018',
  warn: '#F2B04F',
  // 2026-09-18 — the task card's lit shades; 2026-09-26 in the Lux glass: the
  // card's lit top settling into its flat glass, inside the mint-neutral rim.
  taskCardLitTop: '#11342C',
  taskCardLitBottom: '#0B211C',
  taskCardEdge: '#2E4E46',
  // 2026-09-19 — the map pin's dark shades, the reference sheet's own.
  pinTop: '#224634',
  pinBottom: '#06180F',
  pinGlyph: '#EEE4C4',
  // 2026-09-21 — the Filters sheet's chosen green, the approved mockup's own
  // (--emerald there); see the `colors` block above for the roles.
  emeraldBright: '#84DFAA',
  // 2026-09-27 — the eyebrow role: today's gold in dark (ruling 4).
  eyebrow: '#D4A24C',
  // 2026-09-29 (LUX-LIST-2 #4) — the kept-gold labels: the same gold in dark.
  eyebrowGold: '#D4A24C',
  // 2026-09-29 (LUX-LIST-2 #8) — the feed's message kind, a soft blue.
  notifMessage: '#7DB9F0',
  // 2026-09-27 — the wizard's progress bar keeps today's #5FAE81 (ruling 6).
  wizardProgress: '#5FAE81',
  // 2026-09-21 — the shipped Welcome page's own numbers (welcome-ship.html):
  // the Emerald Lux Glass ink, muted, accent and gold; the glint's cream core
  // (its halo IS the gold); the badge glass; black as the shade; the Lux
  // ground (#062421 → #0A1A17 → #07110F, the one ground the lux README
  // names); the lit disc's three stops; the hero CTA's two. See the `colors`
  // block above for the roles.
  authInk: '#F3F1E8',
  authMuted: '#A9B8B1',
  // 2026-09-27 (the Lux remake): the auth accent is the one mint and the auth
  // gold is today's gold — rulings 4 and 5 reach the auth surface too.
  authAccent: '#4FC58C',
  authGold: '#D4A24C',
  authGlintCore: '#FFE9B0',
  authGlintHalo: '#D4A24C',
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
  // 2026-09-28 (LUX-LIST-64): the stage inks in dark — Assigned the Lux gold
  // #E9C170 (#20), In progress the bright orange #FF9046 (#46), Review work the
  // lavender #B9A6FF (#54). A dark pill draws its ink with the rim at .55 and a
  // .09 wash of the same (the reference pill), so each `…Bg` is the ink itself.
  stageAssigned: '#E9C170',
  stageAssignedBg: '#E9C170',
  stageProgress: '#FF9046',
  stageProgressBg: '#FF9046',
  stageReview: '#B9A6FF',
  stageReviewBg: '#B9A6FF',
  // #25: the initials avatar — fill #173A31, the card-border rim #325047, cream.
  avatarFill: '#173A31',
  avatarRim: '#325047',
  avatarInk: '#F1EDE1',
  // #40: money is the Lux ink.
  money: '#F3F1E8',
  // #47: marks stay today's gold in dark.
  mark: '#D4A24C',
  grey: '#909594',
  // #10, #41: the waiting primary — #909594 on #073328.
  waitingFill: '#073328',
  waitingInk: '#909594',
  // #41: the posting bar — #0A231E under a #2C4D44 line; Save draft #081F19 in a
  // 1.5pt #2E765A rim with #ABB4AE words (refs/bottom-bar.html, measured).
  barGround: '#0A231E',
  barRim: '#2C4D44',
  draftFill: '#081F19',
  draftRim: '#2E765A',
  draftInk: '#ABB4AE',
  draftIcon: '#AFB8B3',
  publishInk: '#030A12',
  // #54: the Inbox row — the brighter message, the chip's ink, the row rule (at .11).
  inboxPreview: '#D5DED9',
  inboxChipInk: '#93A59D',
  inboxRule: '#C8FFE6',
  // #53: the ••• dropdown — its glyphs, its red rows, its group rule (at .12).
  dropGlyph: '#9CC9B6',
  dropDanger: '#E36A53',
  dropRule: '#C8FFE6',
} as const satisfies Record<ColorToken, string>;

export { withAlpha } from './colorAlpha';

// ---------------------------------------------------------------------------
// The live-metric bridge (RUN T1, C1)
// ---------------------------------------------------------------------------

/**
 * RUN T1 — WHY THE METRIC SOURCE IS INSTALLED RATHER THAN IMPORTED.
 *
 * `spacing`, `radius`, `controls` and three of `layout`'s keys resolve their
 * value through this slot on every read (C2), which is how a studio dial
 * reaches all 102 `themedStyles` consumers without one of them being edited.
 * The obvious spelling — importing `liveMetric` from lib/designOverrides.ts —
 * is a module CYCLE: that file already imports `materials` from here at module
 * scope, so whichever of the two the bundler evaluates first would read the
 * other's `const` inside its temporal dead zone. This file therefore imports
 * nothing new; lib/designOverrides.ts installs ITS `liveMetric` into the slot
 * at load, and until it does every getter answers with its shipped default —
 * which is exactly what "no override set" has to mean.
 */
export type MetricSource = {
  /** One metric's override, keyed `<group>.<key>`; undefined at its default. */
  read: (key: string) => number | undefined;
  /** Monotonic, bumped on every metric write — what the style caches key on. */
  generation: () => number;
};

let metricSource: MetricSource | null = null;

/** Install the live override store. lib/designOverrides.ts is the one caller;
 *  `null` uninstalls it, which is what an executed fence does between cases. */
export function setMetricSource(source: MetricSource | null): void {
  metricSource = source;
}

/** What a live token getter resolves to, or undefined when untouched. This is
 *  lib/designOverrides.ts's `liveMetric` once that module has loaded. */
export function liveMetric(key: string): number | undefined {
  return metricSource ? metricSource.read(key) : undefined;
}

/** 0 until the first metric is written — the identity generation. */
export function metricGeneration(): number {
  return metricSource ? metricSource.generation() : 0;
}

/**
 * A token group whose named metrics are LIVE: every property is a getter that
 * resolves through the slot above on each read and falls back to the shipped
 * literal beside it. That is the whole reach mechanism — a consumer keeps
 * writing `spacing.lg` and `radius.pill` and is never edited, because the
 * READ moved rather than the call site.
 *
 * `fixed` members are plain values, not getters, and carry no dial: a group
 * member that is a SHAPE (`radius.pill`) or a FLOOR (`controls.minTouchTarget`)
 * is not a size someone should be able to turn, and `layout`'s remaining keys
 * are derived nav geometry rather than design quantities. Their literal types
 * survive, which is why `radius.pill` is still `999` and not `number`.
 */
export function metricGroup<L extends Record<string, number>, F extends Record<string, number>>(
  group: string,
  live: L,
  fixed: F,
): Readonly<Record<keyof L, number>> & Readonly<F> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(live)) {
    Object.defineProperty(out, key, {
      enumerable: true,
      get: () => liveMetric(`${group}.${key}`) ?? live[key],
    });
  }
  for (const key of Object.keys(fixed)) {
    Object.defineProperty(out, key, { enumerable: true, value: fixed[key] });
  }
  return out as Readonly<Record<keyof L, number>> & Readonly<F>;
}

// ---------------------------------------------------------------------------
// Spacing — ONE scale (fix run D8, 2026-10-03): 4/8/12/16/24/32
// ---------------------------------------------------------------------------

/**
 * THE SHIPPED SPACING SCALE, spelled ONCE, and the only one.
 *
 * Until fix run D8 this tree carried two: §I's (`xl` 20, `xxl` 24, `xxxl` 32),
 * read by the ui/ primitives and templates, and lib/theme's older one (`xl` 24,
 * `xxl` 32), read by 92 files — so `spacing.xl` meant 20 or 24 depending on
 * the import. They are one now. The numbers are lib/theme's, because that is
 * what most of the app already draws; the §I call sites were re-spelled so
 * their pixels stayed (`xl` 20 → `lg + xs`, `xxl` 24 → `xl`, `xxxl` 32 →
 * `xxl`). `spacing` below and lib/theme's `spacing` are the SAME live group,
 * addressed by the studio as `theme.spacing.*`.
 *
 * `SPACING_DEFAULTS` survives as a name for the same table (nothing deleted).
 */
export const THEME_SPACING_DEFAULTS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** The same table under its older §I name (fix run D8: one scale). */
export const SPACING_DEFAULTS = THEME_SPACING_DEFAULTS;

/** THE one live spacing group. lib/theme.ts re-exports this binding. */
export const spacing = metricGroup('theme.spacing', THEME_SPACING_DEFAULTS, {});

export const THEME_RADIUS_DEFAULTS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/**
 * The bottom nav bar's geometry, declared ONCE (emerald D3/emerald(3)).
 *
 * ui/primitives/BottomNav.tsx reads both of these for the bar it configures,
 * and every screen's bottom clearance below is derived from the same two
 * numbers — so a change to the bar's height can never desynchronise the
 * screens that have to clear it.
 *
 * RUN PJ1 (C9) — THE BAR IS ATTACHED, on confirmed operator decision,
 * reversing the floating pill (56ff86a / RUN GROUND1 era): flush to the
 * bottom edge, full width, no side insets, with the home-indicator inset
 * carried INSIDE the bar as bottom padding. FLOATING_NAV_GAP survives as a
 * design quantity, not a float: it is the breathing room a pinned footer or
 * composer keeps above the bar (PINNED_FOOTER_BOTTOM_PADDING derives from
 * it).
 *
 * RUN N3 (2026-09-08) — THE 25% RISE IS REVERSED. PJ1 took the content
 * height 70 → 88 and scaled the glyphs and labels with it (28/11 → 35/14);
 * the operator dialled all three back on the device and this run bakes what
 * they landed on — 88 → 70, 35 → 30, 14 → 12. That is a REVERSAL of PJ1's
 * bar rise, recorded as one in docs/DECISIONS.md rather than as a tightening
 * of it: the height returns to exactly the number PJ1 raised it from, and
 * the glyph and label land BELOW their pre-rise 28/11 values rather than on
 * them. The newest Home master (44, 853x1844) draws a ~65pt bar, which this
 * moves toward without matching.
 */
const FLOATING_NAV_HEIGHT = 70;
const FLOATING_NAV_GAP = 12;

/**
 * §I: "screen gutter 16; card padding 14; card gap 10" — the three LIVE ones.
 * Everything else `layout` carries is derived nav geometry, not a design
 * quantity, so it stays a plain value below (T1, D1).
 */
export const LAYOUT_METRIC_DEFAULTS = {
  screenGutter: 16,
  cardPadding: 14,
  cardGap: 10,
} as const;

export const layout = metricGroup('layout', LAYOUT_METRIC_DEFAULTS, {
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
} as const);

// ---------------------------------------------------------------------------
// Radii (§I: xs 10 · sm 13 · md 14 · lg 17 · xl 20 · xxl 22 · pill 999)
// ---------------------------------------------------------------------------

/** The six SIZES, live and dialled. */
export const RADIUS_DEFAULTS = {
  xs: 10,
  sm: 13,
  md: 14,
  lg: 17,
  xl: 20,
  xxl: 22,
} as const;

/**
 * RUN T1 (C4/D8) — THE HAIRLINE, AS SHIPPED.
 *
 * Four surfaces in the tree draw a divider today and three of them agree
 * exactly — components/DropMenu.shared.tsx's row separator, ReportDialog's
 * block row and the Appearance screen's row rule are all
 * `borderTopWidth: StyleSheet.hairlineWidth` over `colors.border`, with no
 * inset. That is what ui/primitives/Divider.tsx defaults to. (The fourth,
 * components/JobOwnerActions.tsx, draws a flat `1` instead; the three that
 * agree win, and DropMenu is the most central of them.)
 *
 * THICKNESS 0 MEANS THE PLATFORM HAIRLINE. `StyleSheet.hairlineWidth` is a
 * device quantity — 0.5 on a 2x screen, 0.33 on a 3x one — so it cannot BE a
 * dial default without the studio showing a different number per phone. 0 is
 * therefore "whatever this screen's hairline is", the same "automatic until
 * touched" idiom `nav.bottomPad` already uses, and any positive value is that
 * many points. The colour is not here: a divider's colour is a palette role
 * (`border`), resolved per theme, not a constant.
 */
export const DIVIDER_DEFAULTS = {
  /** 0 = the platform hairline. */
  thickness: 0,
  /** Indent from both ends — 0 is the full-bleed rule every surface draws. */
  inset: 0,
} as const;

export const radius = metricGroup('radius', RADIUS_DEFAULTS, {
  /** Not a size and therefore not a dial: 999 is how a rounded rectangle is
   *  spelled as a CAPSULE in React Native. Turning it down would not make a
   *  smaller pill, it would make a rounded rectangle — a different shape. */
  pill: 999,
} as const);

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

export const shadows: Record<'card' | 'cardDark' | 'ctaDark', ViewStyle> = {
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
  // 2026-09-27 (the Lux remake, ruling 8): the Lux glass card's drop shadow,
  // `0 10px 30px rgba(0,0,0,.35)` — the "3D pop-out" every dark card wears.
  // A CSS blur of 30 is a native shadowRadius of 15.
  // 2026-09-27 (the operator's review, "more 3D popping out"): one notch past
  // the Lux `0 10px 30px .35` — `0 12px 34px .42`, the same shadow the `card`
  // material carries — so a hand-styled card and a material card lift alike.
  cardDark: Platform.select({
    web: { boxShadow: '0 12px 34px rgba(0,0,0,0.42)' },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.42,
      shadowRadius: 17,
      shadowOffset: { width: 0, height: 12 },
      elevation: 9,
    },
  }) as ViewStyle,
  // The Lux `.cta` glow, `0 10px 24px rgba(79,197,140,.30)`: the mint CTA's
  // lift in dark. The fill stays the one flat mint (ruling 5); only the
  // shadow under it is the reference's.
  ctaDark: Platform.select({
    web: { boxShadow: '0 10px 24px rgba(79,197,140,0.30)' },
    default: {
      shadowColor: '#4FC58C',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 10 },
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

/**
 * 2026-09-20 (sitting 2) — THE PANE'S OWN INK, richer: the operator read the
 * Beta's dark panes as under-saturated beside the reference and chose
 * recipe "D" (docs/DECISIONS.md, that date, (1)): the mockup's base gradient
 * rgba(3,24,16,.92) → rgba(10,48,32,.84) at 125°, which the phone cannot
 * draw as a blur-saturated gradient, so the pane carries its mean here —
 * rgb(6,36,24) — under a mint-tinted sheen. Every other material keeps
 * GLASS_SCRIM. Consumed only through Surface, like GLASS_SCRIM.
 */
const PANE_SCRIM = '#062418';

/**
 * 2026-09-20 (sitting 2, item 13) — THE PANES' EDGES, per pane. The operator
 * read the shared pane rim (brand.mint, a pale sage) as whitish on the phone
 * and chose, from seven honest renders (a 1px rim in different greens under
 * a glow of thin fading rings — exactly what Surface draws below, no shadow,
 * no blur, so the dragged sheet keeps its frames): the search pill and the
 * Today chip wear the DARK EMERALD rim at .70 under a soft glow (option C);
 * the jobs sheet the BRIGHT GREEN at .60 under the same glow (option B);
 * the Filters sheet keeps the pane's own rim one physical pixel thin, no glow.
 * The rim is never thicker than 1pt ("don't change the thickness"). Dark
 * only — light panes are flat by ruling and ignore these.
 */
const PANE_RIM_BRIGHT = '#7DE7A4';
/** The search pill's and the Today chip's rim: today's Prestige emerald, pinned (2026-09-27). */
const PANE_RIM_SEARCH = '#5FAE81';
/** Each glow ring is this many points, outside the rim, fading outward. */
export const PANE_HALO_RING = 2;

export type PaneRim = { color: string; alpha: number; width?: number | 'hairline' };
export type PaneHalo = { color: string; alphas: readonly number[] };

export const paneEdges = {
  /** The search pill and the Today chip — option C. */
  // 2026-09-27 (the Lux remake, ruling 2): the map's panes are PINNED to
  // today's exact values — the Prestige emerald #5FAE81 the operator chose,
  // written as itself now that `dark.emerald` is the one mint.
  search: {
    rim: { color: PANE_RIM_SEARCH, alpha: 0.7 } as PaneRim,
    halo: { color: PANE_RIM_SEARCH, alphas: [0.12, 0.06, 0.03] } as PaneHalo,
  },
  /** The jobs sheet — option B. */
  sheet: {
    rim: { color: PANE_RIM_BRIGHT, alpha: 0.6 } as PaneRim,
    halo: { color: PANE_RIM_BRIGHT, alphas: [0.12, 0.06, 0.03] } as PaneHalo,
  },
  /** The Filters sheet — the pane's rim, a hairline, no glow. */
  filters: {
    rim: { color: brand.mint, alpha: 0.46, width: 'hairline' } as PaneRim,
  },
} as const;

/**
 * 2026-09-21 — A PANE'S OWN FILL: the tint drawn as the reference's gradient
 * itself, in place of the material's flat scrim and its sheen. The Filters
 * sheet wears the approved mockup's `linear-gradient(125deg, rgba(3,24,16,.95),
 * rgba(10,48,32,.91))` (docs/mockups/html/map-explore.build.mjs `fPane`). The
 * pane material's flat ink is that gradient's MEAN under a near-white mint
 * sheen, and the sheen is what lifted the sheet into the grey-olive the
 * operator sent beside the mockup ("warmer"): the reference's ground measures
 * rgb(5,27,19) at the sheet's top-left where the app's numbers drew
 * rgb(30,57,46). The phone can draw the gradient — `experimental_
 * backgroundImage`, the sheen's own mechanism — so it draws the gradient.
 * FILTERS SHEET ONLY (asked): the map's panes keep recipe D on `pane`. Dark
 * glass only; light stays flat by ruling. DECISIONS 2026-09-20 sitting 3, (1).
 */
const FILTERS_INK_TOP = '#031810';
const FILTERS_INK_BOTTOM = '#0A3020';
export type PaneFill = {
  /** The CSS angle, degrees. */
  angle: number;
  from: { color: string; alpha: number };
  to: { color: string; alpha: number };
  /** 2026-09-28 (#53) — the LIGHT recipe's own gradient, drawn only by a material
   *  that is glass in light (its `light` block). Absent: light stays flat. */
  light?: { angle: number; from: { color: string; alpha: number }; to: { color: string; alpha: number } };
};

/**
 * 2026-09-28 (LUX-LIST-64 #53) — THE INBOX ••• DROPDOWN's glass, from
 * docs/mockups/html/refs/inbox-clean-list.html: dark `linear-gradient(160deg,
 * rgba(26,74,62,.66), rgba(9,34,28,.80))`; light the frosted white
 * `rgba(255,255,255,.82) → rgba(236,244,239,.76)`.
 */
const DROPDOWN_INK_TOP = '#1A4A3E';
const DROPDOWN_INK_BOTTOM = '#09221C';
const DROPDOWN_FROST_BOTTOM = '#ECF4EF';
/** The gradient's mean — the fill where no blur can draw. */
const DROPDOWN_INK_MEAN = '#11362D';
/** The rims: the Lux mint (#7EE2B4) at .24 in dark, the light green (#0E6B52) at .16 in light. */
const DROPDOWN_RIM = '#7EE2B4';
const DROPDOWN_FROST_RIM = '#0E6B52';
export const paneFills = {
  // 2026-09-29 (LUX-LIST-2 #9): frosted, stronger and denser — the rows behind become smudges; solid (1) where blur cannot draw. Was .66 → .80 (light .82 → .76).
  dropdown: {
    angle: 160,
    from: { color: DROPDOWN_INK_TOP, alpha: 0.86 },
    to: { color: DROPDOWN_INK_BOTTOM, alpha: 0.92 },
    light: {
      angle: 160,
      from: { color: colors.surface, alpha: 0.86 },
      to: { color: DROPDOWN_FROST_BOTTOM, alpha: 0.92 },
    },
  } as PaneFill,
  filters: {
    angle: 125,
    from: { color: FILTERS_INK_TOP, alpha: 0.95 },
    to: { color: FILTERS_INK_BOTTOM, alpha: 0.91 },
  } as PaneFill,
} as const;

export type MaterialName = 'chrome' | 'sheet' | 'menu' | 'clear' | 'pane' | 'card' | 'dropdown';

/**
 * 2026-09-27 (the Lux remake, ruling 8) — THE CARD MATERIAL'S OWN NUMBERS,
 * from docs/mockups/html/lux/lux.build.mjs `.card`: the fill
 * rgba(12,44,38,.52), the rim rgba(200,255,230,.20), the specular top edge
 * rgba(255,255,255,.16), the shadow 0 10px 30px rgba(0,0,0,.35), radius 22.
 * Flat — no blur ("on a static ground a blur adds nothing but frames").
 * Light is a white card under lib/authTheme.ts's soft card shadow.
 */
const CARD_INK = '#0C2C26';
const CARD_RIM = '#C8FFE6';

/**
 * 2026-09-29 (LUX-LIST-2 #6) — THE LIT CARD: every card, tile and icon square, material or hand-styled.
 * The operator's pick from .shots/refresh/depth/ ("B lit but … a tiny bit lesser dial on the lit"):
 * DARK — the task card's lit wash at 70% of its lift, #0F2E27 falling to #0B211C; the Lux mint rim
 * (#C8FFE6 at .20); the Lux 1pt top edge (white at .16) drawn as an INSET shadow, so it follows the
 * corner arcs and reads ~2pt on top (the straight strip that crossed into the arcs is gone); today's
 * lift, 0 12px 34px black .42. LIGHT — white falling to #F9F8F3, the green rim (#0D6B52 at .14), the
 * Lux light card's shadow 0 10px 30px (#10261D at .105); tiles and icon squares a softer 0 6px 16px .08.
 */
export const litCard = {
  dark: {
    top: '#0F2E27',
    bottom: '#0B211C',
    rim: { color: CARD_RIM, alpha: 0.2 },
    edge: { color: '#FFFFFF', alpha: 0.16 } as { color: string; alpha: number } | null,
    shadow: { color: '#000000', alpha: 0.42, radius: 17, y: 12 },
    tileShadow: { color: '#000000', alpha: 0.42, radius: 17, y: 12 },
  },
  light: {
    top: '#FFFFFF',
    bottom: '#F9F8F3',
    rim: { color: '#0D6B52', alpha: 0.14 },
    edge: null as { color: string; alpha: number } | null,
    shadow: { color: '#10261D', alpha: 0.105, radius: 15, y: 10 },
    tileShadow: { color: '#10261D', alpha: 0.08, radius: 8, y: 6 },
  },
} as const;

/**
 * 2026-09-27 (the operator's review) — THE LUX FIELD WELL: the search field's
 * fill and rim in dark, the reference's `.field` — `rgba(3,20,16,.55)` under a
 * `rgba(200,255,230,.14)` rim — so the field sits INTO its card instead of
 * floating lighter than it. Read by ui/primitives/SearchBar.tsx and never
 * spelled at a call site; light keeps its flat surface, the map its ink pill.
 */
export const wells = {
  field: { ink: '#031410', inkAlpha: 0.55, rim: CARD_RIM, rimAlpha: 0.14 },
} as const;

/**
 * 2026-09-28 (LUX-LIST-64 #22, #30) — THE ROUND HEADER BUTTON in dark: the back
 * disc (and Post a Job's forward disc) wears the glass card's own ink at .58
 * inside the card rim at .24 — the approved pages' `.circ` — so the outline
 * reads as the card's edge. Light keeps its faint ink disc, as rendered today.
 */
export const discs = {
  header: { ink: CARD_INK, inkAlpha: 0.58, rim: CARD_RIM, rimAlpha: 0.24 },
} as const;
/** A material's drop shadow: `radius` is the native shadowRadius (half the CSS blur). */
export type MaterialShadow = { color: string; alpha: number; radius: number; y: number };

/**
 * 2026-09-18 — A LIGHT-THEME GLASS RECIPE. Surface's light path has always
 * rendered the flat theme surface; a material that carries this block wears
 * glass in light too, with these values in place of the dark ones. Only the
 * [+] create sheet's `clear` carries one (operator decision 2026-09-18, "L2
 * Frost", for that sheet alone) — every other material leaves it absent and
 * stays flat in light BY CONSTRUCTION, not by a flag.
 */
export type LightGlassSpec = {
  blur: number;
  /** The frost: `scrimColor` at `scrimAlpha` — white, in the mockup. */
  scrimColor: string;
  scrimAlpha: number;
  borderColor: string;
  borderAlpha: number;
  fallbackScrimAlpha: number;
  /** The 1pt bright inner top edge, `borderColor` at this alpha. */
  highlightAlpha: number;
  /** 2026-09-27: the light card's soft shadow; absent, none. */
  shadow?: MaterialShadow;
  /** 2026-09-27: the specular edge's own colour; absent, `borderColor`. */
  highlightColor?: string;
  /** 2026-09-29 (LUX-LIST-2 #6) — a lit wash, top to bottom, drawn over the scrim in this theme. */
  wash?: { top: string; bottom: string };
};

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
  /**
   * A 1pt bright inner edge along the top, `borderColor` at this alpha — the
   * specular line a lit pane of glass shows (the G1 mockup's
   * `inset 0 1px 0`). Absent or 0: no edge is drawn.
   */
  highlightAlpha?: number;
  /** See LightGlassSpec. Absent: flat theme surface in light, as always. */
  light?: LightGlassSpec;
  /**
   * 2026-09-20 — A DIAGONAL SHEEN over the scrim, dark only: `color` (white
   * when absent) at `fromAlpha` in the top-left corner fading out by a third
   * of the way, back in to `toAlpha` at the bottom-right — the approved Map
   * design's "liquid" read (docs/mockups/html/map-explore-dark.html, its
   * lqSheen / lqSheen2). Drawn by Surface as one gradient view between the
   * blur and the content; absent on every material that predates it.
   * Sitting 2 of that date: the pane's sheen is the brand mint, not white —
   * recipe "D"'s tinted light, which is where the richness the operator
   * asked for lives on a phone whose blur cannot saturate.
   */
  sheen?: { fromAlpha: number; toAlpha: number; color?: string };
  /**
   * 2026-09-27 — the specular edge's own colour, when it is not the rim's:
   * the Lux card's is white at .16 over a mint rim. Absent, `borderColor`.
   */
  highlightColor?: string;
  /** 2026-09-27 — the flat card's drop shadow; absent, no shadow. */
  shadow?: MaterialShadow;
  /** 2026-09-29 (LUX-LIST-2 #6) — a lit wash, top to bottom, drawn over the scrim (the card's). */
  wash?: { top: string; bottom: string };
};

/**
 * Five materials, as data. chrome is the nav bar's wear; sheet is the docked
 * and floating dialog surfaces; menu is the densest glass, for anchored
 * popovers; clear is the [+] create sheet's see-through pane (2026-09-18);
 * pane is the Map design's jobs and Filters sheets (2026-09-19).
 * Consumed ONLY through ui/primitives/Surface.tsx, and tunable live through
 * lib/designOverrides.ts (RUN G1 C2) — these are the launch defaults.
 */
export const materials: Record<MaterialName, MaterialSpec> = {
  // RUN S3 (D11) — SOLID NAV GROUND. The chrome material stops being glass:
  // the scrim is opaque at 1 and the blur is 0, so the bar is a solid emerald
  // ground rather than a translucent one. The ink, the hairline hue, the
  // border alpha and the radius contract are untouched — this is the same
  // material at a different mix, not a second material — and the studio's
  // chrome dials keep working, now launching at these values. Light is
  // unaffected by construction: ui/primitives/Surface.tsx's light path never
  // reads the material at all.
  chrome: {
    blur: 0,
    scrimColor: GLASS_SCRIM,
    scrimAlpha: 1,
    borderColor: brand.mint,
    borderAlpha: 0.2,
    fallbackScrimAlpha: 1,
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
    // 2026-09-29 (LUX-LIST-2 #9): frosted, stronger and denser — the rows behind become smudges; solid (1) where blur cannot draw.
    // Was blur 50 / .82 / fallback .95.
    blur: 80,
    scrimColor: GLASS_SCRIM,
    scrimAlpha: 0.9,
    borderColor: brand.mint,
    borderAlpha: 0.14,
    fallbackScrimAlpha: 1,
    radius: 16,
    radiusTopOnly: false,
  },
  // 2026-09-18 — CLEAR: the [+] create sheet's glass, G1 "Clear" of the nine
  // treatments in docs/mockups/html/glass-sheet.html (operator, 2026-09-18).
  // The most see-through material: the same scrim ink at 0.40 (sheet is
  // 0.72), so the page reads through, and a HEAVIER blur than sheet's because
  // more shows through and the rows must stay legible over it. The rim is
  // WHITE, not the mint — on glass this clear a mint hairline reads green
  // against the near-black; the mockup's rim is white at 0.14 — and the
  // pane carries the specular top edge (0.22). Radius 28, top corners: the
  // sheet is docked. Web and Reduce Transparency fall back to the sheet
  // material's own 0.92: without a blur the page would show through a
  // clearer pane UNBLURRED, which is noise behind the rows, not glass — the
  // harness render proved it at 0.80 (tests/themeTokens keeps the cream
  // ≥4.5:1 over the fallback on white).
  //
  // LIGHT — the one material that is glass in light: "L2 Frost" from
  // docs/mockups/html/create-sheet-decide.html — white at 0.72 over a blur,
  // a white rim at 0.85 and a bright top edge at 0.95, falling back to a
  // 0.96 white pane where blur cannot draw, for the same reason. The backdrop scrim behind it is
  // the sheet family's own (components/CreateSheet.tsx), not part of the
  // material.
  clear: {
    blur: 60,
    scrimColor: GLASS_SCRIM,
    scrimAlpha: 0.4,
    borderColor: colors.surface,
    borderAlpha: 0.14,
    fallbackScrimAlpha: 0.92,
    radius: 28,
    radiusTopOnly: true,
    highlightAlpha: 0.22,
    light: {
      blur: 50,
      scrimColor: colors.surface,
      scrimAlpha: 0.72,
      borderColor: colors.surface,
      borderAlpha: 0.85,
      fallbackScrimAlpha: 0.96,
      highlightAlpha: 0.95,
    },
  },
  // 2026-09-19 — PANE: the approved Map design's docked and floating panes
  // (the jobs sheet on the map, the Filters sheet, the search pill, the Today
  // chip, the picker popover), from the operator's reference sheet and the
  // liquid pass that followed it — deeper than `sheet` (0.72) and far deeper
  // than `clear` (0.40), so the page reads through only as a hint. No light
  // block: light panes are flat white with the line hairline, as ruled ("no
  // liquid glass in light"). Radius 28 on the top corners is the docked
  // default; the map's floating pane passes its own.
  //
  // 2026-09-20 (sitting 2), recipe "D" — RICHER, and RIM ONLY: the pane's own
  // ink (PANE_SCRIM, the mockup gradient's mean) at 0.88, the mint rim at
  // 0.46, the sheen the brand mint at 0.10 → 0.04 (was white 0.09 → 0.04),
  // and NO specular edge: the 1pt bright line just inside the top stacked on
  // the rim into a thick doubled band on the phone (the operator's red boxes
  // on the search pill, the Today chip and the jobs sheet), and was removed
  // from every pane at once — docs/DECISIONS.md 2026-09-20 (sitting 2), (1)
  // and (4). The mockup's inner emerald glow rides as the sheen's bottom
  // stop; nothing here draws a shadow (a rasterised shadow re-renders on
  // every frame of the sheet's drag).
  pane: {
    blur: 30,
    scrimColor: PANE_SCRIM,
    scrimAlpha: 0.88,
    borderColor: brand.mint,
    borderAlpha: 0.46,
    fallbackScrimAlpha: 0.94,
    radius: 28,
    radiusTopOnly: true,
    highlightAlpha: 0,
    sheen: { fromAlpha: 0.1, toAlpha: 0.04, color: brand.mint },
  },
  // 2026-09-27 — CARD: the Lux glass card, flat (ruling 8 of docs/dispatch/
  // LUX-REMAKE.md — "Cards are flat — no blur"). Every panel, row card, hub
  // tile and field group wears it through components/Card.tsx: a fill lighter
  // than the ground, the 1px mint-neutral rim, the white specular edge and
  // the drop shadow. The fallback (Reduce Transparency) draws the fill nearly
  // opaque so the card reads as a card without the ground through it. Light:
  // a white card with no visible rim under the auth surface's soft shadow.
  card: {
    blur: 0,
    // 2026-09-29 (LUX-LIST-2 #6): the lit card (`litCard` above) — an opaque wash from #0F2E27 to
    // #0B211C, the rim .20, the white edge .16 as an inset shadow, today's lift. Was: #0C2C26 at .58,
    // rim .24, a straight strip at .22 ("one notch past the Lux", 2026-09-27).
    scrimColor: litCard.dark.bottom,
    scrimAlpha: 1,
    wash: { top: litCard.dark.top, bottom: litCard.dark.bottom },
    borderColor: CARD_RIM,
    borderAlpha: litCard.dark.rim.alpha,
    fallbackScrimAlpha: 1,
    radius: 22,
    radiusTopOnly: false,
    highlightAlpha: 0.16,
    highlightColor: colors.surface,
    shadow: litCard.dark.shadow,
    light: {
      blur: 0,
      scrimColor: litCard.light.bottom,
      scrimAlpha: 1,
      wash: { top: litCard.light.top, bottom: litCard.light.bottom },
      borderColor: litCard.light.rim.color,
      borderAlpha: litCard.light.rim.alpha,
      fallbackScrimAlpha: 1,
      highlightAlpha: 0,
      shadow: litCard.light.shadow,
    },
  },
  // 2026-09-28 (LUX-LIST-64 #53) — DROPDOWN: the Inbox ••• menu's glass, the
  // approved page's own (docs/mockups/html/refs/inbox-clean-list.html `.menu`).
  // It wears `paneFills.dropdown` — the 160° gradient in dark, the frosted white
  // in light — over a blur of 22 (web draws intensity × 0.5), the mint rim at
  // .24, the white top edge at .14 and the page's `0 22px 48px rgba(0,0,0,.55)`.
  // The one material besides `clear` that is glass in LIGHT too: the reference
  // draws it frosted white under a green rim at .16 and a soft green shadow.
  // Where no blur can draw (Reduce Transparency), the fill falls back to the
  // gradient's mean nearly opaque, so the rows stay legible. Radius 18.
  dropdown: {
    // 2026-09-29 (LUX-LIST-2 #9): frosted, stronger and denser — the rows behind become smudges; solid (1) where blur cannot draw.
    // Was blur 44, the gradient .66 → .80 (mean .73), fallback .95.
    blur: 80,
    scrimColor: DROPDOWN_INK_MEAN,
    scrimAlpha: 0.89,
    borderColor: DROPDOWN_RIM,
    borderAlpha: 0.24,
    fallbackScrimAlpha: 1,
    radius: 18,
    radiusTopOnly: false,
    highlightAlpha: 0.14,
    highlightColor: colors.surface,
    shadow: { color: '#000000', alpha: 0.55, radius: 24, y: 22 },
    light: {
      blur: 80,
      scrimColor: colors.surface,
      scrimAlpha: 0.89,
      borderColor: DROPDOWN_FROST_RIM,
      borderAlpha: 0.16,
      fallbackScrimAlpha: 1,
      highlightAlpha: 0.9,
      highlightColor: colors.surface,
      shadow: { color: '#102A1D', alpha: 0.18, radius: 22, y: 18 },
    },
  },
};

// RUN S2 (C5) — G1's two studio colour cycles (STUDIO_GOLD_CYCLE and
// STUDIO_CARD_FILL_CYCLE) are GONE: the design studio edits every palette
// token directly now (HSL steppers + validated hex, both themes), so a
// fixed three-hex cycle would be a second, poorer way to say the same
// thing. The gold and cardFill DIALS survive unchanged in
// lib/designOverrides.ts — only the canned hex lists retired.

/**
 * RUN S2 (C6) — THE NAV BAR'S OWN DESIGN QUANTITIES, tokenised.
 *
 * TAB_ICON_SIZE and TAB_LABEL_FONT_SIZE lived as literals inside
 * ui/primitives/BottomNav.tsx (35/14 — emerald D3's 28/11 scaled by PJ1
 * C9's 25% bar rise); they are TOKENS now, read through the design studio's
 * override layer, and tests/layout.test.mjs fences the literals against
 * returning to the bar. The centre-button ratios and its glow strength move
 * here for the same reason: the [ + ] is fully dial-driven and its defaults
 * must be readable by the schema registry without importing a component.
 *
 * `labelFontSize` is the ONE font value any studio dial may touch — the
 * narrow typography exception, held by tests/designStudio.test.mjs.
 */
export const navBar = {
  // RUN N3 (2026-09-08): 30/12, dialled on the device. PJ1's 35/14 were its
  // 25% bar rise applied to emerald D3's 28/11; the rise is reversed, and
  // these land below 28/11 rather than back on them — see FLOATING_NAV_HEIGHT
  // above, and docs/DECISIONS.md, where the reversal is named as one.
  iconSize: 30,
  labelFontSize: 12,
  /** The 2pt breath between the glyph and its label (label marginTop). */
  iconLabelGap: 2,
  /**
   * home(18): the centre control's height as a share of the bar's.
   *
   * RUN N3 — STILL A SHARE, AND DELIBERATELY SO. The operator dialled the
   * control to 62 in the new 70pt bar; 62 is NOT written here, because a
   * fixed number would silently reverse home(18)'s finding that a control
   * which must sit inside the bar has to be measured against the bar. The
   * ratio is the same decision at the new value: 62 / 70 = 0.885714…, three
   * decimal places (as 0.857 was) = 0.886, and Math.round(70 × 0.886) =
   * Math.round(62.02) = 62. It rounds to 62 for any ratio in
   * [0.878571, 0.892857), so 0.886 sits essentially at that window's centre
   * and cannot tip to 61 or 63 on a rounding change.
   */
  createSizeRatio: 0.886,
  /**
   * The glyph inside it, as a share of the control. RUN N3: 40 on the new
   * 62 — 40 / 62 = 0.645161…, so 0.645, and Math.round(62 × 0.645) =
   * Math.round(39.99) = 40. The window that rounds to 40 is
   * [0.637097, 0.653226); 0.645 is its centre. Was 0.615 (32 on 52).
   */
  createGlyphRatio: 0.645,
  /** RUN H2's operator dial: the dark [ + ]'s glow strength. */
  createGlowAlpha: 0.25,
  /**
   * 2026-09-17 — THE DARK [ + ]'s LIT WASH, at the strength the dark
   * "Post a job" pill already carries.
   *
   * The operator's instruction for this control is that the two be IDENTICAL
   * BY CONSTRUCTION, so this is the same MEASUREMENT rather than a second
   * opinion: screens/HomeScreen.tsx's `CTA_LIFT_ALPHA` is lit(3)'s solved
   * alpha for master 44's pill (see the block above it, which shows the
   * arithmetic), and this is that number.
   *
   * IT IS WRITTEN TWICE, AND THAT IS RECORDED RATHER THAN HIDDEN. The value
   * could not be imported: it lives in a SCREEN, and a ui/ primitive reaching
   * into screens/ would invert the dependency this whole directory is arranged
   * around. So the two are one decision in two places — move either and the
   * other has to move with it. Naming it here is what gives the next reader
   * somewhere to find that out.
   */
  createLiftAlpha: 0.13,
  /**
   * RUN S3 (D14) — THE DARK [ + ]'s RING GOES CHAMPAGNE. It was
   * `greetingSlate`, the light greeting grey borrowed across the palettes;
   * a warm pale metal reads as a ring around the gold tile instead of as a
   * cold seam. Declared HERE rather than in a palette because it is the
   * control's own line-work, not a role either theme resolves — and because
   * ui/tokens.ts is the one file a new hex may be spelled in.
   *
   * Dark only: light keeps `goldDeep` (RUN H3), untouched.
   */
  ringColorDark: '#E6D19A',
  /**
   * RUN N3 (2026-09-08) — THREE DARK-ONLY HUES THE OPERATOR DIALLED ON THE
   * DEVICE, declared HERE for exactly the reason `ringColorDark` is: they
   * are the bar's and the centre control's own values, not roles either
   * theme resolves, and ui/tokens.ts is the one file a new hex may be
   * spelled in.
   *
   * NARROW BY CONSTRUCTION. Each of the three replaced a SHARED token at the
   * call site, and moving that token would have repainted the whole tree:
   *
   *   activeColorDark  was `dark.emerald` (#5FAE81) — the palette's
   *                    live-state green, which also draws prices, Open and
   *                    every "live" mark. Untouched: only the focused tab
   *                    reads this instead.
   *   gold             was `dark.gold` (#D4A24C) — the Prestige metal, which
   *                    is line-work everywhere else in the tree. Untouched.
   *   glyphColorDark   was `postPillGreen` (= brand.emerald, #0D6B52), which
   *                    is THEME-CONSTANT and also fills light's [ + ].
   *                    Untouched, so light's tile is the colour it was.
   *
   * LIGHT READS NONE OF THESE. Every call site keeps its light branch
   * exactly as it was, so light renders unchanged.
   *
   * WHY THE FILL IS NAMED `gold` AND NOT `fillColorDark`: tests/goldOnForest
   * sweeps the tree for `backgroundColor: <something>.gold` and holds the
   * dark [ + ] as one of two recorded exceptions to "gold is line-work,
   * never a fill". A property named anything else would slip out of that
   * sweep and the exception would go stale — the fence would stop seeing the
   * one gold fill it exists to watch. The name keeps it sighted.
   */
  activeColorDark: '#49C481',
  gold: '#D8A448',
  glyphColorDark: '#107257',
  /**
   * RUN N3 — the centre control's corner, dialled to 18. It read
   * `radius.lg` (17), a scale step a great deal of the tree draws; 18 is not
   * on that scale and the scale is not moving for one control, so the
   * control carries its own corner, like its own fill and its own ring.
   */
  createRadius: 18,
} as const;

/**
 * 2026-09-30 (the build run, `docs/dispatch/MELT-TAB-BAR.md`) — THE MELT-THROUGH TAB BAR: a
 * floating pill in the lit-card material with the chosen tab a flat bubble that melts from tab to
 * tab. Every number the bar draws or springs with lives here; `lib/meltBarGeometry.ts`
 * holds the pure arithmetic and takes these as arguments, so a test can execute it.
 *
 * The greys are the palettes' own `ink` at an alpha (dark #F1EDE1 at 60 %, light #13201B at 50 %),
 * the bubble is `emerald` and what sits inside it `onForest` — no new hue.
 */
export const meltBar = {
  /** The pill: 16pt in from each side, 64 tall, fully round. */
  sideInset: 16,
  height: 64,
  radius: 32,
  /** Its bottom edge sits max(inset − tuck, min) above the screen's (24 on a 34pt inset). */
  bottomTuck: 10,
  bottomMin: 12,
  /** Room a scroller keeps between its last row and the pill's top. */
  breathing: 8,
  /** The moving bubble's three circles, and the + bubble. */
  bubble: [54, 45, 36] as const,
  plus: 44,
  plusGlyph: 28,
  icon: 25,
  /** The flat Home glyph's height at a 25 width (the Ionicons em box, 512 × 525). */
  homeIconHeight: 25.63,
  labelSize: 11,
  labelWeight: '500' as const,
  /** 0.01 em at 11pt. */
  labelTracking: 0.11,
  labelGap: 2,
  /** A tab column is the pill's height square. */
  column: 64,
  restInkAlpha: { dark: 0.6, light: 0.5 },
  /** Springs as [stiffness, damping], mass 1. */
  springs: {
    circles: [
      [640, 40],
      [380, 30],
      [240, 23],
    ] as const,
    follow: [1400, 70] as const,
    swellIn: [520, 30] as const,
    swellOut: [380, 22] as const,
    plusPull: [300, 14] as const,
    plusScale: [420, 12] as const,
    plusPress: [900, 40] as const,
    chosen: [260, 24] as const,
  },
  /** The press swell on the lead circle. */
  swell: 0.1,
  /** Stretch while moving: s = min(|v| / stretchVelocity, stretchMax); height × (1 − squash·s). */
  stretchVelocity: 2600,
  stretchMax: 0.2,
  stretchSquash: 0.45,
  /** Fillet radii: inside the moving bubble, the + joint, and the + joint while they overlap. */
  fillet: { chain: 40, plus: 12, over: 26 },
  /** The + joint starts forming this far away, and eases from `over` while they overlap this much. */
  plusReach: 9,
  plusOverlap: 12,
  plusPull: 2.5,
  plusJoinKick: -1.2,
  plusSnapKick: 3.2,
  plusPressed: 0.86,
  /** The chosen tab: its icon drops, its name rises and fades. */
  iconDrop: 7.5,
  labelRise: 4,
  labelFade: 1.6,
  /** A finger has to travel this far sideways before a touch becomes a drag (a tap is a press). */
  dragSlop: 12,
  /** The integrator's substep, seconds. */
  substep: 0.004,
  /** The fallback's slide, and the reduced-motion timing. */
  fallbackSpring: [420, 34] as const,
  reducedMs: 180,
} as const;

/**
 * 2026-09-30 (the build run, idea 18) — A CONTROL INSIDE A TEXT FIELD (the dictation mic): a
 * `size` disc `inset` in from the field's right edge — centred on a one-line field, in the
 * bottom-right corner of a multi-line box — and the room the text leaves for it (`roomEnd` on the
 * right of a line, `roomBottom` under a box). While it listens a `halo`-wide ring pulses round it.
 */
export const fieldAccessory = {
  size: 26,
  glyph: 14,
  inset: 10,
  roomEnd: 48,
  roomBottom: 40,
  halo: 6,
  pulseMs: 1200,
} as const;

/**
 * 2026-09-30 (the build run, idea 23) — POST A JOB'S CATEGORY TILES: Home's Popular-services tile
 * (components/ServiceTileRow.tsx — the same measured square, corner, glyph and name) with a chosen
 * state. The chosen tile grows by `slot` to make room for a check box at its top-left, and a small
 * down-arrow sits half under its bottom edge, where the questions open (lib/postQuestions.ts).
 */
export const postTiles = {
  /** How much wider the chosen tile grows — the slot the check sits in. */
  slot: 25,
  /** The check box: its side, its corner, its inset from the tile's corner, its glyph. */
  check: 18,
  checkRadius: 5,
  checkInset: 7,
  checkGlyph: 13,
  /** The down-arrow's disc and glyph, and how far the disc hangs below the tile. */
  arrow: 18,
  arrowGlyph: 12,
  arrowDrop: 11,
  /** How long the slot takes to open, and how long the arrow waits before it drops in. */
  widenMs: 220,
  arrowDelayMs: 160,
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
export const CONTROL_DEFAULTS = {
  /** §I reference: 38. Raised for the 44pt touch floor. */
  buttonHeight: 48,
  /** §I reference: 28. Raised to exactly the 44pt floor. */
  buttonHeightSmall: 44,
  /** Text inputs match the primary button so a form reads as one rhythm. */
  fieldHeight: 48,
  /** Square icon-only controls. */
  iconButton: 44,
} as const;

export const controls = metricGroup('controls', CONTROL_DEFAULTS, {
  /** The minimum any tappable thing may be. CLAUDE.md, non-negotiable — so it
   *  is a plain value with no dial, and the four heights above are floored at
   *  it by their own schema ranges rather than by hoping nobody turns this. */
  minTouchTarget: 44,
} as const);

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
  /** The light greeting grey — the value light's `homeSlate` carries. It rang
   *  the dark [ + ] until RUN S3 (D14) gave that ring `navBar.ringColorDark`;
   *  it stays a palette token, editable in the studio's Colors category. */
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
   * 2026-09-20 (sitting 2) — THE LIGHT AMOUNT GOLD: the peek row's "$50" in
   * light, brighter than `goldDeep` because that one "doesn't pop" — option c
   * of six golds the operator saw on the real card with their contrast on the
   * cream (2.6:1 on #F6F3EA, under the 3:1 large-text line, chosen with that
   * shown; docs/DECISIONS.md that date, (5)). A constant like `goldDeep`, for
   * the same reason: light reaches it off the resolved palette; dark's amount
   * is `gold` and never draws this. Only the peek row's amount wears it.
   */
  amountGold: '#C08F2E',
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
