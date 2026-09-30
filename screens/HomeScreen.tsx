import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { HomeAtmosphere } from '../components/HomeAtmosphere';
import { HubCard } from '../components/HubCard';
import { DraftCard } from '../components/DraftCard';
import { HireAgainRow } from '../components/HireAgainRow';
import { HomeAvatarButton } from '../components/HomeAvatarButton';
import { HomeLiveBar } from '../components/HomeLiveBar';
import { HowBrazosWorks } from '../components/HowBrazosWorks';
import { LiveDot } from '../components/LiveDot';
import { ServicePickerSheet } from '../components/ServicePickerSheet';
import { ServiceTileRow } from '../components/ServiceTileRow';
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../hooks/useAuth';
import { usePostJobDraft } from '../hooks/usePostJobDraft';
import { useRebookWorkers } from '../hooks/useRebookWorkers';
import {
  fetchJobById,
  JOB_CATEGORIES,
  JOB_CATEGORY_ICONS,
  jobThumbnailUrl,
  type Job,
  type JobCategory,
} from '../lib/jobs';
import { NotificationBell } from '../components/NotificationBell';
import { alertAsync } from '../lib/dialog';
import { ATTENTION_CAP, attentionItems } from '../lib/homeAttention';
import { deriveJobLifecycle, releaseDeadlineMs } from '../lib/jobLifecycle';
import { firstNameOf, liveJobStatus, pickLiveBarItem, postedCardLive } from '../lib/liveJobStatus';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { openOwnJob } from '../lib/ownJobCard';
import { ALL_SERVICES } from '../lib/skillCategories';
import { formatTimeAgo, greetingFor } from '../lib/time';
import type { CustomerHomeStackNavigation } from '../lib/navigation';
import { useHomeDesignSettings } from '../lib/homeDesignStudio';
import { useDialNumber } from '../lib/designOverrides';
import { useShellGround } from '../lib/shellGround';
import { EntranceView } from '../components/EntranceView';
import {
  litCardStyle, EYEBROW_TYPE,
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { litFill, SearchBar, useScrollClearance } from '../ui/primitives';
import { litBetween } from '../ui/primitives/LitSurface';

// lit(3) — THE PILL'S ALPHA IS A MEASUREMENT, NOT A PREFERENCE.
//
// Master 44 lights the Post-a-job pill along a 135° axis; the app drew it
// flat. `node scripts/master-diff.mjs` reports each control's DIAGONAL
// LUMINANCE DELTA — the median luminance of a clean 7x7 patch at 10% along its
// top-left→bottom-right diagonal, minus the one at 90% — and on the control
// render the pill read exactly 0.00 against the master's +6.72.
//
// The number below is the alpha that reproduces that delta, solved rather
// than guessed. `litFill`'s wash composites to an effective overlay opacity of
// alpha x (1 - g) at gradient fraction g, and luminance is linear in RGB, so
// delta = alpha x (g90 - g10) x (Y_lift - Y_surface) — and the tool then
// confirms the prediction on a fresh render.
//
//   pill  (g90-g10 = 0.752, emerald 153.95 over pill 85.21)  6.72 / 51.7
//
// `emerald` is the lift because the master's own lift is green-weighted — its
// pill rises +3/+8/+5 in R/G/B, which a cream lift cannot do and emerald at
// ~0.05 does.
//
// 2026-09-18: the promo card's own wash (CARD_LIFT_ALPHA 0.04, solved the same
// way against the master's +2.29) left with the promo card. The task card that
// replaced it is not a lifted surface at all — it is lit BETWEEN two named
// stops, the reference's own (`litBetween`, tokens `taskCardLitTop` /
// `taskCardLitBottom`), so there is no alpha to calibrate.
const CTA_LIFT_ALPHA = 0.13;
// The pill's 1pt top edge. Anchored on the master's own edge row, which peaks
// at luminance 117.2 over a 46.5 fill: 0.38 of emerald over the pill's lit top
// lands at 116.7. Only the ABSOLUTE value transfers — the app's pill is light's
// green by operator decision (RUN H2) and therefore much brighter than the
// master's, so the edge-to-fill CONTRAST cannot match without over-fitting a
// colour the operator chose. Not covered by the delta criterion above.
const CTA_EDGE_ALPHA = 0.38;

// Light keeps the approved Heritage brand crops; dark renders the Prestige
// master-44 artwork (assets/prestige is dark-only by standing decision).
//
// 2026-09-18: the gold B mark is GONE FROM THIS SCREEN. Both of its files —
// assets/brand/brazos_b_drape.png (light, home(1)) and
// assets/prestige/brazos_b_drape.png (dark) — stay on disk, required by
// nothing, and left tests/themeResolution's BAKED_ART roster with their
// mounts, which is what that roster's added-or-removed assertion demands of a
// raster the app stops drawing. They drew the promo card's mark, and the
// promo card is the task card now (see the card below).
// 2026-08-23: the light hero's own file is GONE FROM THE SOURCE. It was
// assets/brand/customer-home-chair.png and it is still on disk, required by
// nothing — see the <Image> below for why, and note that it left the
// BAKED_ART roster with its `require`, which is what that roster's
// added-or-removed assertion demands.
// home(14): the ROOM-BAKED hero, restored from prestige(0a) (715ddf8) by
// redirect — its bytes are untouched. It and the cut-out that had replaced it
// are two different pictures, not one picture at two sizes: the baked scene has
// a plant on long visible stems in a wide round pot, wall panelling, a floor
// and a vignette, and the chair runs off the right edge, which is master 44's
// composition exactly. The cut-out is a stem-less leaf rosette in a
// narrow-footed urn with a whole four-legged chair on nothing. A cut-out also
// cannot do what this slot needs: its edges are empty by definition, so it can
// never bleed off a screen edge however it is sized.
//
// COST, recorded rather than hidden: the baked file is 400x351 where the
// cut-out was 1200x1053, so at 151pt wide it upscales about 1.3x at @3x and
// reads a little soft. The composition is the thing master 44 is drawn from;
// the resolution is fixed by exporting the scene again at the size in the
// run report, into this same path.
//
// 2026-08-23: this is now the hero in BOTH themes, so that softness is a
// LIGHT-mode cost as well. Nothing about the file changed — the operator
// chose the composition over the resolution a second time, for the second
// palette — and the fix is the same one: re-export the scene larger into
// this same path.
//
// RUN H2 REVERSES THE "BOTH THEMES" HALF, and only that half. The scene above
// is a DARK room: with the isDark gate gone it was painting a black rectangle
// onto the ivory ground on a light device. The operator supplied a light
// composition of the same scene, so the slot is per-theme again and both files
// are `gate: true` on the BAKED_ART roster once more. The gate moved back with
// the fact, exactly as it moved off with it.
// 2026-09-21 — WebP (q90, alpha kept), encoded from the PNG master beside it;
// the roster in tests/themeResolution.test.mjs measures the master's bake and
// checks the WebP is that master's size. 165 KB → 21 KB.
// 2026-09-27 (the Lux remake, the operator's Home picture): the chair, the
// lamp and the plant BLENDED IN — the scene with the Lux radial mask baked
// into its alpha, reaching zero inside its own box, so its night never meets
// the gradient ground with an edge (.shots/refresh/hero-lux-bake.mjs from the
// feathered master beside it; the roster measures the bake). Its LIGHT half was
// a feathered room (RUN H2's 'baked-feathered'). Both files stay on disk,
// required by nothing, since:
//
// 2026-09-29 (LUX-LIST-2 #5, the operator's pick "Lamp-lit", option c) — THE
// OPERATOR'S OWN CUT-OUTS, standing on the Home's ground with no room at all:
// a deep-emerald armchair, a brass lamp and a plant in a black pot for dark; a
// sage armchair and a brass pot for light. Each file is the ink alone at 3x of
// the one 150 x 156 pt box both schemes share, right- and bottom-aligned, the
// solid interior made fully opaque (the cut-outs stopped at alpha 240-253),
// WebP q92 from the PNG master beside it (.shots/refresh/blend/build-assets.mjs).
// The floor shadow and the lamp's warm pool are their own two small layers
// below — soft, so the phone stretches them — measured the same look as one
// baked picture at about half the bytes.
const PRESTIGE_HERO_ART = require('../assets/prestige/hero_armchair_customer_lamp_dark.webp');
const PRESTIGE_HERO_ART_LIGHT = require('../assets/prestige/hero_armchair_customer_lamp_light.webp');
const HERO_GLOW_DARK = require('../assets/prestige/hero_armchair_customer_glow_dark.png');
const HERO_GLOW_LIGHT = require('../assets/prestige/hero_armchair_customer_glow_light.png');
const HERO_SHADOW_DARK = require('../assets/prestige/hero_armchair_customer_shadow_dark.png');
const HERO_SHADOW_LIGHT = require('../assets/prestige/hero_armchair_customer_shadow_light.png');
/**
 * 2026-09-17 — how many of the customer's own postings "Your jobs" draws.
 *
 * Three, newest first, ANY status — open, hired, in progress, finished,
 * cancelled. Drafts never reach it, and not by a filter written here:
 * lib/jobs.ts's `fetchJobsByClient` already excludes them at the read, because
 * a draft row is an outgoing direct offer rather than a job anybody posted.
 * The rest are behind "View all".
 */
const YOUR_JOBS_COUNT = 3;

// ---------------------------------------------------------------------------
// 2026-09-18 — home(2)'s B-drape geometry (B_DRAPE_WIDTH_RATIO 0.277, the
// artwork aspect, the 38pt copy overlap, the zero inset) and the promo
// heading's copy column that was reserved from it are GONE with the promo
// card. The task card carries no mark and reserves no column: its title, its
// field and its pill each take the card's full inner width.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// home(16) — THE SERIF LADDER, MEASURED OFF MASTER 44 RATHER THAN CHOSEN.
//
// Three sizes were each wrong by a different amount, so this is one conversion
// applied three times instead of three opinions. What is measured is CAP
// HEIGHT, in the master's own pixels, because cap height is what the eye reads
// as "how big is that" and it is the only quantity that survives comparing two
// different typefaces.
//
// AND THEY ARE TWO DIFFERENT TYPEFACES. Master 44 is set in a high-contrast
// Didone; when these rungs were computed `fonts.display` resolved to Georgia
// on iOS, a low-contrast transitional serif, and no font file was bundled
// anywhere in this app by standing decision. Georgia was the closest platform
// face and it is materially WIDER: "off your plate." set 210pt at 30pt here —
// measured in a real 393pt viewport by scripts/home-shots.mjs — against the
// master's 198.6pt at an effective 34pt. That is 22% more ink per point of
// size, and it is why the hero's size is governed by its column rather than by
// its cap height.
//
// 2026-08-22 — THE FACE UNDER THIS LADDER CHANGED; THE LADDER DID NOT. The
// operator retired the serif app-wide: `fonts.display` now resolves to the
// system sans (see the docblock on `fonts` in lib/theme.ts), which sets
// NARROWER than Georgia, not wider. Every number below is deliberately frozen
// at what Georgia measured — re-deriving them would be this file guessing at a
// re-measurement it cannot perform, and sizes are the operator's to tune on a
// device. So read `GEORGIA_CAP_RATIO`, `MASTER_SERIF_CAPS` and `serifSize`
// below as the NAMES OF FROZEN ARITHMETIC, not as claims about the face in
// use, and expect some strings to wrap differently than the captures show.
//
// home(20) — EVERY NUMBER BELOW WAS RE-MEASURED. The master file on disk was
// REPLACED: it is 853x1844 where the file these caps were first read off was
// 941x1672. Nothing here survived unchanged except the promo heading's rung,
// which landed on the same 22 by coincidence of two different pixel grids.
// (2026-09-18: that rung — `promoHeading`, the D's 33px stem — left this
// table with the promo heading it sized; nothing on the screen reads it.)
//
// The conversion is now the VERTICAL one. A cap height is a vertical measure,
// and the old master's 0.5628 aspect meant only its width transferred to a
// 393x852 device, so 393/941 was used for everything. 853x1844 is 0.46258
// against the device's 0.46127 — 0.28% apart — so heights transfer too, and
// 852/1844 is the honest conversion for a stem height. (The horizontal one,
// 393/853, is what every x and width in this file is converted at.)
const MASTER_TO_DEVICE = 852 / 1844;
/** Georgia's cap height as a fraction of its em. */
const GEORGIA_CAP_RATIO = 0.692;
// 2026-09-27 (the Lux remake): the section title became the Lux eyebrow, so no
// style on this screen reads the ladder any more. The measurement stays ON
// RECORD — exported, so it is a read rather than a dead local — because
// tests/emeraldFences.test.mjs home(16) still re-derives every rung from it.
export const MASTER_SERIF_CAPS = {
  /** "Take a task", the T's stem: y 351..402 = 52px. */
  heroHeadline: 52,
  /** "Live Nearby", the L's stem: y 1571..1600 = 30px. */
  sectionTitle: 30,
  /** "Post a job", the P's stem: y 1406..1434 = 29px. Frozen at 24 — see below. */
  ctaLabel: 29,
} as const;
export const serifSize = (capPx: number) =>
  Math.round((capPx * MASTER_TO_DEVICE) / GEORGIA_CAP_RATIO);

// home(26) — THE SAME LADDER, FOR THE LABEL THAT IS NOT SERIF.
//
// "View all" is drawn SANS on master 44 — checked at 1:1, it carries no
// serifs and no stroke contrast — so putting its cap through the serif
// conversion would size it against the wrong face. Same measurement, same
// arithmetic, one different divisor. What it must NOT be is a literal chosen
// by eye, which is what it was. ("Switch to Worker" sat on this ladder too
// until 2026-09-18, when the pill left this screen for the [+] sheet.)
/** The platform sans's cap height as a fraction of its em. */
const SYSTEM_CAP_RATIO = 0.6875;
const MASTER_SANS_CAPS = {
  /** "View all", the V's stem: y 1577..1597 = 21px. */
  viewAll: 21,
} as const;
const sansSize = (capPx: number) =>
  Math.round((capPx * MASTER_TO_DEVICE) / SYSTEM_CAP_RATIO);

// WHERE EACH RUNG LANDS, and which of them moved:
//
//   hero headline   35 by cap  ->  31 SHIPPED, capped by the column.
//     The new master's T measures a 24.03pt cap, which is 35pt of Georgia —
//     two points MORE than the old master said. It cannot be taken. Georgia
//     sets "off your plate." at 7.00pt of ink per point of size, so 35 would
//     be 245pt of ink starting at the 20pt gutter and ending at 265pt, and the
//     hero artwork's own ink begins at 244.6pt on those very rows (measured on
//     the master at y 430..498). 31 sets 217pt, ending at 238pt, and stops
//     6.6pt clear. Master 44 never runs that type over that artwork.
//     RECORDED, not taken: 4pt of size, 2.6pt of cap height.
//
//   promo heading   RETIRED 2026-09-18 with the promo card. It sat at 19/30
//     against a 22 ladder rung; the task card's title is 20/24 sans and takes
//     no rung — see the card below.
//
//   section title   20 by cap  ->  20 SHIPPED. A REVERSAL of home(16), which
//     shrank it from 22 to 16 against the old master's 26px cap. The new
//     master's "Live Nearby" measures a 30px cap = 13.86pt, which is 20pt of
//     Georgia. See home(26).
//
//   CTA label       19 by cap  ->  24 UNCHANGED and FROZEN by operator
//     instruction. The new master moves the rung from 15 to 19, so the frozen
//     value is 5pt off the ladder rather than 9. Still not this run's to move.

// home(23) — WHERE THE HERO ARTWORK'S INK STARTS INSIDE ITS OWN BOX.
//
// assets/prestige/hero_armchair_customer.png is a room-baked scene with a
// vignette, so its left and right edges carry no detail at all: its leftmost
// and rightmost tenths hold zero adjacent-column structure. The BOX therefore
// begins well left of anything the eye can see, and the headline's column has
// to stop at the INK, not at the box, or it gives up 22pt of line for nothing.
//
// 0.153 is that fraction measured on master 44 at the headline's own rows
// (y 430..498, where the art's ink starts at x=531px = 244.6pt inside a box
// running 470..870px), and tests/emeraldFences.test.mjs re-derives it from the
// asset file so it cannot drift from the artwork.
//
// 2026-09-29 (LUX-LIST-2 #5): the cut-outs' own number — structure starts at
// 0.073 of the box on the dark master's headline rows and 0.087 on the light
// one's (the plant's leaves), so one shared 0.08 stays inside both.
const HERO_ART_INK_LEFT = 0.08;
/**
 * The dark hero's box in points — master 44's own 400x351 of its 853x1844
 * pixels, at (470, 221). See `homeHeroArtDark` for how it was found and why
 * `right` is negative. They are constants rather than literals in the
 * stylesheet because the headline's column is COMPUTED from them: the copy has
 * to stop where the artwork's ink starts, and a number typed twice is a number
 * that drifts.
 *
 * 2026-09-29 (LUX-LIST-2 #5): the cut-outs' box IS their ink — 240..390 x
 * 136..292 on the 393-pt screen, option c as rendered: the ink 156 tall, its
 * right edge 3pt short of the screen's (a cut-out has nothing to bleed), its
 * foot 11pt above the live bar. `right` and `top` stay measured from `intro`.
 */
const HERO_ART_DARK = { width: 150, height: 156, right: -17, top: 74 } as const;
/**
 * 2026-09-29 (LUX-LIST-2 #5): the two soft layers under the cut-out, each in
 * the one box both schemes share (the FILE is the only thing that forks):
 * the lamp's warm pool, 263..393 x 78..276, and the floor shadow, 256..393 x
 * 264..300 — a tight contact under each leg tip, the pot and the lamp's disc,
 * and the seat's soft pool (one flattened band floated the front leg). Both
 * end at the screen's right edge, where the art is pinned.
 */
const HERO_GLOW = { width: 130, height: 198, right: -20, top: 16 } as const;
const HERO_SHADOW = { width: 137, height: 36, right: -20, top: 202 } as const;
/**
 * The dark headline's leading, as a multiple of whatever size the studio is
 * showing. Master 44 runs 82px of line pitch = 37.9pt, and this is that pitch
 * over the 31pt the column allows — an ABSOLUTE measurement expressed as a
 * ratio so the studio slider still moves both together.
 */
const HEADLINE_LEADING = 38 / 31;

/**
 * The counterparty line both job sections put on a HubCard — ONE
 * implementation, called twice (P3-31). "Needs your attention" and "Your jobs"
 * draw the same card about the same rows, so a second copy of this rule is
 * how the two would start describing one job differently.
 *
 * It states only what the hub's own read already holds: the hired worker's
 * name once there is one, and otherwise how many bids have come in.
 */
function counterpartyLine(job: Job, names: Record<string, string | null>): string {
  // 2026-09-28 (LUX-LIST-64 #19): the person's name alone, no "Worker ·".
  if (job.assigned_worker_id) return names[job.assigned_worker_id] ?? 'Worker';
  if (job.bid_count > 0) return `${job.bid_count} ${job.bid_count === 1 ? 'bid' : 'bids'} received`;
  return 'Awaiting bids';
}

/** Customer Home to golden master 44 (Prestige 1a), retaining the existing
 *  data and routes; light keeps the approved Heritage composition. */
export function HomeScreen() {
  const { profile } = useProfile();
  const navigation = useNavigation<CustomerHomeStackNavigation>();
  const design = useHomeDesignSettings();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { width: screenWidth } = useWindowDimensions();
  // RUN T2 (C1) — HOME'S OWN DIALS. Each falls back to the number this file
  // drew before the dial existed, which is why it is spelled here and not in
  // the stylesheet: one place per value, so the studio's default and the
  // shipped pixel cannot drift apart.
  //
  // 2026-09-18: the dial is the TASK CARD's corner now — the card that took
  // the promo card's place under the hero. Its KEY keeps the old name on
  // purpose: a stored studio override is keyed on it, and
  // tests/screenDials.test.mjs pins this exact read. The mockup's card is 22
  // (radius.xxl), the same corner the promo card had.
  const taskCardRadius = useDialNumber('home.promoCard.radius') ?? 22;
  // 2026-09-18: the "Switch to Worker" pill and its `home.modeSwitch.paddingX`
  // dial left this screen — the customer's mode switch is the [+] create
  // sheet's bottom row now (components/CreateSheet.tsx, mounted by
  // navigation/CustomerRoot.tsx), through the same switchMode(). Worker Home
  // keeps its own pill. The twenty-six-pixel investigation that lived here
  // (customer-services-sheet-dark's ring pixels under a scrim) is closed with
  // the ring: it was a rasterisation artefact, never a value on this screen.

  // RUN H3 (C3): this screen's page ground is `homeBackground`, not the
  // palette's `background`, and the floating nav pill's margins are painted by
  // the mode shell rather than by anything here. Declaring the ground is how
  // the region outside the pill stops being a band of a different ivory. It is
  // the SAME key `safe`/`scroll`/`content` paint with below — one ground per
  // page, named once for the shell and once for the styles that use it.
  useShellGround('homeBackground');

  // RUN GROUND1 (C3): the pill is out of layout flow on this route, so this
  // scene is the whole screen and the atmosphere behind it reaches the bottom
  // edge with no band at the bar row. Nothing reserves the pill's footprint
  // any more except this, and the reservation is DERIVED — the pill's own
  // height plus the margin that floats it, which grows to the home-indicator
  // inset. `layout.floatingNavClearance` was a flat 68 that could not see the
  // inset; it was deleted and must not come back.
  const navClearance = useScrollClearance();

  // MOTION1 (C2): the three sections below the greeting arrive in reading
  // order. The hook returns a STYLE, so each of these rides the node the
  // screen already renders — no wrapper, no layout change, and nothing at all
  // under reduced motion. 2026-09-18: the task card sits directly under the
  // hero and the tile row under it, so the indices follow the new order —
  // the card first (1), the row second (2), the job section last (3). Three
  // entrances, as before; only their order moved, with the sections.

  // home(23): the dark headline's column ends where the hero artwork's INK
  // starts, not where its box does and not at a share of the screen. Derived
  // here so it follows the device: the art is a fixed-point box pinned to the
  // right edge, so on a wider phone the copy gets the extra width rather than
  // the picture.
  const headlineColumn = useMemo(() => {
    const artRight = screenWidth - design.screenPadding - HERO_ART_DARK.right;
    const artInkLeft = artRight - HERO_ART_DARK.width * (1 - HERO_ART_INK_LEFT);
    return Math.round(artInkLeft - design.screenPadding);
  }, [screenWidth, design.screenPadding]);

  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useAuth();
  // 2026-09-28 (LUX-LIST-64 #17): the unpublished draft, the SAME read My Jobs'
  // Draft section makes (hooks/usePostJobDraft.ts) — NEEDS YOUR ATTENTION's
  // first card.
  const { draft } = usePostJobDraft();
  // #62: the people the customer can hire again — Discover's list, one read.
  const rebook = useRebookWorkers('HomeScreen');

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  // a2 (2026-09-05) — "Needs your attention" reads the My Jobs hub's OWN
  // aggregation (docs/DECISIONS.md 2026-09-05 entry (4)): no new RPC, and no
  // second copy of the lifecycle derivation on this screen. The hook's
  // worker-side reads run too — that is the price of one aggregation (P3-31),
  // and it is a page the signed-in user is entitled to either way. The three
  // names that collided with the open-jobs feed are still aliased; nothing
  // else about the call differs from screens/MyJobsHubScreen.tsx.
  //
  // 2026-09-17: this is Home's ONLY job read now. Nearby left the screen, and
  // `useOpenJobs()` — the open-market feed it drew — went with it, because
  // nothing else here consumed it. The hook itself is untouched: Discover and
  // worker mode still use it.
  const {
    posted,
    payments,
    openDisputeJobIds,
    reviewedJobIds,
    names,
    loading: myJobsLoading,
    error: myJobsError,
    refresh: refreshMyJobs,
  } = useMyJobsHub();

  // Same refresh-on-focus the hub does: coming back from approving, paying or
  // reviewing has to change what this section says.
  useFocusEffect(
    useCallback(() => {
      void refreshMyJobs();
    }, [refreshMyJobs])
  );

  // One clock reading per data load — the hub's rule, so a card's countdown
  // and its rank cannot be read at two different instants.
  const nowMs = useMemo(() => Date.now(), [posted, payments]);
  const items = useMemo(
    () => attentionItems({ posted, payments, openDisputeJobIds, reviewedJobIds, nowMs }),
    [posted, payments, openDisputeJobIds, reviewedJobIds, nowMs]
  );

  // 2026-09-17 — "YOUR JOBS": the three most recent postings, whatever state
  // they are in. No selection rule and no derivation, which is the difference
  // between this and the attention block above it: `fetchJobsByClient` already
  // returns the customer's own rows newest first and already leaves drafts
  // out, so this is a slice of the read and nothing more. A job that needs the
  // customer's move appears in BOTH sections; the operator chose that, because
  // "what is waiting on me" and "what have I posted" are two questions and the
  // same job is a true answer to each.
  const yourJobs = useMemo(() => posted.slice(0, YOUR_JOBS_COUNT), [posted]);

  // 2026-09-28 (LUX-LIST-64 #45, #62) — WHERE EACH HIRED JOB STANDS. The one
  // lifecycle derivation (lib/jobLifecycle.ts), read with the hub's own facts
  // exactly as My Jobs reads it, so a card here and its twin there cannot
  // disagree; the rail, the chat words and the held note come from the one
  // rule both screens call (lib/liveJobStatus.ts postedCardLive).
  const lifecycleOf = useCallback(
    (job: Job) =>
      deriveJobLifecycle(
        { job, payment: payments[job.id] ?? null, hasOpenDispute: openDisputeJobIds.has(job.id) },
        nowMs
      ),
    [payments, openDisputeJobIds, nowMs]
  );
  const cardLive = (job: Job, state: ReturnType<typeof lifecycleOf>) =>
    postedCardLive({
      job,
      state,
      paymentStatus: payments[job.id]?.status,
      workerName: job.assigned_worker_id ? names[job.assigned_worker_id] : null,
      nowMs,
    });
  const openChat = (job: Job) => navigateAcrossTabs('MyJobs', 'Chat', { jobId: job.id });

  // #62 — THE LIVE BAR speaks for the first job underway (on the way, arrived,
  // working, or done and waiting for review), and only while there is one.
  const liveBar = useMemo(() => {
    const pick = pickLiveBarItem(posted.map((job) => ({ job, state: lifecycleOf(job) })));
    if (!pick) return null;
    const status = liveJobStatus({
      state: pick.state,
      job: pick.job,
      releaseDeadline: releaseDeadlineMs(pick.job),
      surface: 'bar',
      nowMs,
    });
    if (!status) return null;
    const workerId = pick.job.assigned_worker_id;
    return { job: pick.job, status, workerFirstName: firstNameOf(workerId ? names[workerId] : null) };
  }, [posted, lifecycleOf, names, nowMs]);

  // 2026-09-17: the live-nearby pulse left with the section it marked, and
  // `browseOpenJobs()` — the confirmed Worker Mode switch every Nearby card
  // and its "View all" ran — left with it too. Neither had another caller on
  // this screen. The customer reaches the open market through the [+] sheet's
  // "Switch to Worker" row (2026-09-18), through the one authoritative
  // switchMode(); this screen no longer carries a switch of its own.


  // 2026-09-26 (the refresh, audit M-12) — HOME IS POSTING. The field said
  // "Describe your task..." but its return key searched for workers, and the
  // tiles did too, while the pill under them started a post: two products
  // behind one card. Now the field's return, the pill and every tile start
  // the same thing — a job draft, carrying the typed text as its description
  // and a tile's category pre-selected. Finding a specific person is still
  // one tap away, and says so: "Browse workers" below the card carries the
  // typed text into worker search (Discover keeps its own search whole).
  function startJobDraft() {
    Keyboard.dismiss();
    navigation.navigate('PostJob', {
      initialDescription: query.trim() || undefined,
    });
  }

  function startCategoryDraft(categoryKey: string) {
    // A tile's key is a job category wherever the two lists overlap (every
    // Home tile does, lib/skillCategories.ts); anything else opens the wizard
    // with no category rather than a guessed one.
    const category = (JOB_CATEGORIES as readonly string[]).includes(categoryKey)
      ? (categoryKey as JobCategory)
      : undefined;
    navigation.navigate('PostJob', {
      initialCategory: category,
      initialDescription: query.trim() || undefined,
    });
  }

  // home(9): the "View map" pill and its openMap() dispatch are gone from
  // customer Home. The map is a WORKER surface — finding work near you — and
  // the customer's Live Nearby row now offers only "View all". The Map ROUTE
  // is untouched and still registered (hidden) on the customer tab navigator:
  // see navigation/CustomerRoot.tsx. Removing the affordance is not removing
  // the destination, and the route has to stay for the same reason MyJobs
  // does — React Navigation 7 resolves an untargeted NAVIGATE against the tab
  // navigator only.

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      {/* home(4): a fixed layer, OUTSIDE the scroller, so the page slides over
          it instead of carrying it. Dark only; renders nothing in light. */}
      <HomeAtmosphere />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={[styles.scroll, isDark && styles.scrollOverAtmosphere]}
          contentContainerStyle={[
            styles.content,
            isDark && styles.contentOverAtmosphere,
            {
              paddingHorizontal: design.screenPadding,
              gap: design.sectionGap,
              // C3: the pill floats over this scene now, so the last row has to
              // clear it here. One value for both themes — light gets the same
              // reservation it always had, just from this side of the bar.
              paddingBottom: navClearance,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.intro}>
            {/* 2026-09-29 (LUX-LIST-2 #5): under the cut-out, the lamp's warm
                pool of light and the floor shadow it stands in — soft layers
                stretched to their boxes, each file picked by the palette. */}
            <Image
              source={isDark ? HERO_GLOW_DARK : HERO_GLOW_LIGHT}
              style={styles.homeHeroGlow}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
            />
            <Image
              source={isDark ? HERO_SHADOW_DARK : HERO_SHADOW_LIGHT}
              style={styles.homeHeroShadow}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
            />
            <Image
              // 2026-08-23 unified this slot onto ONE file for both themes.
              // RUN H2 SPLITS IT AGAIN, because the file it unified onto is a
              // dark room: with no palette test in front of it, a light device
              // got a black rectangle where the hero belongs. That is not a
              // taste disagreement with the unification — it is the specific
              // failure the BAKED_ART gate exists to catch, and the gate had
              // been taken off this entry when the mount lost its isDark.
              //
              // BOTH HALVES ARE GATED AGAIN, and the ternary below is what
              // satisfies the roster's gate scan for both names at once: it
              // requires a palette test within 240 characters before every use
              // of a gated asset, and `isDark` is right here. The geometry, the
              // box and the fill rule are untouched and stay shared — the fork
              // that reopens is the FILE, which is the one thing that really is
              // per-palette.
              source={isDark ? PRESTIGE_HERO_ART : PRESTIGE_HERO_ART_LIGHT}
              style={styles.homeHeroArt}
              // home(14): the hero is a SLOT, and a slot fills. `cover`
              // scales whatever is dropped in until both dimensions are
              // covered and crops the remainder, so a room-baked scene reaches
              // the screen edge instead of sitting inside its own margins.
              // Parity 2026-08-22 made the box and the fill rule one for both
              // themes; the FILE is one now too, so `cover` crops the same
              // aspect against the same box in both.
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.introCopy}>
              <View style={styles.introTopLine}>
                <View style={styles.greetingBlock}>
                  <Text style={styles.greeting} numberOfLines={1}>
                    {greetingFor(new Date())}
                    {firstName ? ',' : ''}
                  </Text>
                  {firstName ? (
                    // Master 44: the name line carries the gold in dark. RUN H2
                    // gives LIGHT its own accent rather than leaving the name at
                    // the slate the greeting itself uses — a light branch, not a
                    // removed gate: dark's gold is untouched, and the name is
                    // now accented in both themes instead of only one.
                    <Text
                      style={[
                        styles.greeting,
                        isDark ? styles.greetingName : styles.greetingNameLight,
                      ]}
                      numberOfLines={1}
                    >
                      {firstName}
                    </Text>
                  ) : null}
                </View>
                {/* M-24 — the feed, one tap from Home, with its unread count.
                    2026-09-28 (LUX-LIST-64 #59): your photo right of the bell,
                    36 round; a tap opens your profile to edit. */}
                <View style={styles.headerActions}>
                  <NotificationBell onPress={() => navigation.navigate('Notifications')} />
                  <HomeAvatarButton name={profile?.full_name} uri={profile?.avatar_url} />
                </View>
              </View>

              <Text
                style={[
                  styles.headline,
                  // Parity 2026-08-22 (supersedes home(16b)'s dark-only gate):
                  // one hero composition. The column ends where the artwork's
                  // ink starts, and the studio's live size drives both themes
                  // — light inherits dark's implemented numbers exactly.
                  {
                    maxWidth: headlineColumn,
                    fontSize: design.heroFontSize,
                    lineHeight: Math.round(design.heroFontSize * HEADLINE_LEADING),
                  },
                ]}
                maxFontSizeMultiplier={1.25}
              >
                Take a task{'\n'}off your plate
              </Text>
              {/* 2026-09-17: the breaks are EXPLICIT, the way the headline's is —
                  operator decision, not a wrap the 73% column happens to
                  produce. 2026-09-21: THREE lines, one sentence each, and the
                  headline lost its period (DECISIONS 2026-09-20 sitting 3, (8)).
                  One string, so both themes. */}
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                Describe it.{'\n'}Hire help.{'\n'}Get it handled.
              </Text>
            </View>
          </View>

          {/* 2026-09-28 (LUX-LIST-64 #62, option B "Tucked in") — THE LIVE BAR,
              between the hero and the task card, only while a job is underway:
              the Sonar dot in the stage's colour, where the job stands, and
              "Message Sam ›". It adds 78pt above the card and the pill still
              sits well above the fold the E2E walk needs (see the attention
              block's note). */}
          {liveBar ? (
            <HomeLiveBar
              status={liveBar.status}
              workerFirstName={liveBar.workerFirstName}
              onOpen={() => navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job: liveBar.job })}
              onMessage={() => openChat(liveBar.job)}
            />
          ) : null}

          {/* 2026-09-18 — THE TASK CARD, directly under the hero: the
              standalone search bar and the "FASTEST WAY TO START" promo card
              (its eyebrow, its two-line heading, the gold B mark and the copy
              column reserved from it) are gone, and ONE card holds what a
              customer does here — a title, the search field, and the live
              "Post a job" pill moved inside it, unchanged.
              docs/mockups/html/home-redesign.html `.card`: padding 17, gap 14,
              radius 22 (the same dial the promo card wore). Light is the flat
              card the mockup draws — `taskCardLitTop`/`Bottom` resolve to the
              surface and `taskCardEdge` to the line hairline, under
              shadows.card. Dark is LIT between the mockup's two stops through
              `litBetween`, the same platform branch the pill's `litFill`
              uses; `flat: !isDark` returns undefined in light, which React
              Native drops from the array — no key, no pixel. The node is the
              plain Animated.View a LitSurface is underneath, so the entrance
              style rides it exactly as it rode the promo card. */}
          <EntranceView
            index={1}
            style={[
              styles.taskCard,
              { borderRadius: taskCardRadius },
              litBetween({
                top: colors.taskCardLitTop,
                bottom: colors.taskCardLitBottom,
                flat: !isDark,
              }),
              // 2026-09-27 (the Lux remake, ruling 8): the pop-out — the card
              // shadow in dark, added under the light shadow the style carries.
              // 2026-09-29 (LUX-LIST-2 #6): the lit card — the wash, rim, top edge and lift, both themes.
              litCardStyle(isDark),
            ]}
          >
            <Text style={styles.taskCardTitle} maxFontSizeMultiplier={1.3}>
              What do you need done?
            </Text>

            {/* The shared SearchBar (Prestige 1a), the SAME instance this
                screen has always had — value, onChangeText, submitSearch, the
                sentence posture — now inside the card at the card's own
                56/20 (lib/homeDesignStudio.tsx). The mic is the REAL voice
                search, rendered by SearchBar itself only when the on-device
                boundary is available; nothing about voice changes. 2026-09-21:
                ONE trailing control — the mic while the field is empty, the
                magnifier once it has text (`micBecomesSearch`, whose tap is
                the same submitSearch the keyboard return fires); the divider
                and the second button are gone (DECISIONS 2026-09-20 sitting
                3, (8)). The leading glyph is omitted here and only here, so
                the field never draws two magnifiers. */}
            {/* M-12 — the return key starts the draft, exactly as the pill
                does; the trailing control stays the mic, since a magnifier
                would promise a search this field no longer runs. */}
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={startJobDraft}
              placeholder="Describe your task..."
              autoCapitalize="sentences"
              autoCorrect
              // 2026-09-27 (the Lux remake, the operator's Home picture): the
              // magnifier leads the field again, the mic trails it as today.
              // 2026-09-27 (the operator's review): the field's dark fill is
              // SearchBar's own Lux well now, so nothing here overrides it.
              style={[
                styles.searchField,
                { minHeight: design.searchHeight, borderRadius: design.searchRadius },
              ]}
            />

            {/* THE LIVE PILL, MOVED, NOT REDESIGNED: the same styles.heroButton,
                the same litFill recipe, the same label, the same startJobDraft.
                Full width inside the card under the field, at the card's gap.
                It is the screen's ONE conversion control (decision 3), and the
                E2E money walk taps it on Home without scrolling (.maestro/
                sign-in.yml HOME_MARK, money-walk.yml Act 1) — it sits higher on
                the screen than it did in the promo card. */}
            <Pressable
              onPress={() => startJobDraft()}
              style={({ pressed }) => [
                styles.heroButton,
                isDark && styles.heroButtonDark,
                // 2026-09-27 (the operator's review): the Lux `.cta` glow.
                isDark && shadows.ctaDark,
                {
                  minHeight: design.ctaHeight,
                  borderRadius: design.ctaRadius,
                },
                // The pill is a Pressable, so it cannot BECOME a LitSurface
                // without losing its press target — it takes the same lit
                // fill through the same one implementation instead. In light
                // `flat` returns undefined, which React Native drops from a
                // style array: no key, no node, no pixel, which is what keeps
                // the light render byte-identical.
                // 2026-09-27 (the Lux remake, the operator's Home picture):
                // the pill at today's size and font, COLOURED AS THE SYSTEM
                // CTA — the one mint in dark (`primary`, what every Button's
                // hero fill is); light keeps its own green. Colour only.
                litFill({
                  surface: isDark ? colors.primary : colors.postPillGreen,
                  lift: colors.emerald,
                  liftAlpha: CTA_LIFT_ALPHA,
                  highlight: true,
                  highlightAlpha: CTA_EDGE_ALPHA,
                  flat: !isDark,
                }),
                pressed && styles.heroButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Post a job"
            >
              <Text style={[styles.heroButtonText, isDark && styles.heroButtonTextDark]}>
                Post a job ›
              </Text>
            </Pressable>

            {/* 2026-09-27 (the Lux remake, ruling 13): the refresh's "Looking
                for a specific pro? Browse workers ›" line is GONE — the Discover
                tab is the way to a person, and the card keeps to its one job. */}

            {/* 2026-09-28 (LUX-LIST-64 #62): HIRE AGAIN, under the pill — the
                faces of the people who can be hired again, each ringed in the
                card's own colour; picking one starts the direct offer. */}
            <HireAgainRow
              items={rebook}
              ringColor={colors.taskCardLitBottom}
              onHire={(item) =>
                navigation.navigate('PostJob', {
                  hireWorkerId: item.id,
                  hireWorkerName: item.name?.trim() || 'Worker',
                })
              }
            />
          </EntranceView>

          {/* 2026-09-17 — THE SERVICE ROW: one sliding row of every service,
              shared with worker Home (components/ServiceTileRow.tsx). The row
              owns its tiles; this screen owns what a tap does — the same
              category search a chip ran, and the same "Other" sheet below.
              The heading is this screen's alone: worker Home passes none.
              The inset is the column's own padding, so the row runs edge to
              edge and its first tile sits on the column. 2026-09-18: the row
              sits directly under the task card — it moved up with the card's
              arrival and nothing about the row itself changed. */}
          <EntranceView index={2}>
            <ServiceTileRow
              heading="Popular services"
              inset={design.screenPadding}
              onSelect={startCategoryDraft}
              onOther={() => setMoreOpen(true)}
              onViewAll={() => setMoreOpen(true)}
            />
          </EntranceView>

          {/* 2026-09-28 (LUX-LIST-64 #16) — HOW BRAZOS WORKS, for a new customer:
              from setup until they close it or post a first job. Drawn only
              once the customer's own read has answered — an unfinished or
              failed read is not "has never posted". */}
          {!myJobsLoading && !myJobsError ? (
            <HowBrazosWorks userId={user?.id} hasPosted={posted.length > 0} />
          ) : null}

          {/* a2 — WHAT NEEDS THE CUSTOMER'S MOVE, the first job section
              (docs/DECISIONS.md 2026-09-05 entry (4), and the 2026-09-18
              entry that puts the tile row between it and the card).
              THE POSITION IS NOT A TASTE CHOICE: the E2E money walk finds
              "Post a job" on Home WITHOUT scrolling (.maestro/sign-in.yml's
              HOME_MARK, then money-walk.yml's tap), Maestro taps nothing laid
              out below the 852pt fold, and the E2E customer fixture owns
              staging jobs that need attention — so a block ABOVE the card
              would push the pill off-screen and break the walk without a flow
              change, which the chain forbids. The ruling's "leads with" is met
              as the FIRST job section; the ruling's REASON — the pill reachable
              without scrolling — is more than intact now that the pill sits in
              the task card directly under the hero.

              No entrance animation: MOTION1's three indices are the task
              card, the tile row and "Your jobs", and this section does not
              take a fourth. Every style here already existed, and every card
              is the hub's own HubCard with the hub's own props — the line
              included, which myJobsNextAction() derives once for both
              surfaces. */}
          {myJobsError || items.length > 0 || draft ? (
            <View style={styles.section}>
              <View style={styles.liveNearbyHeader}>
                {/* 2026-09-28 (LUX-LIST-64 #49): the label stays gold, with the
                    red Sonar dot before it — still, a ring travelling out. */}
                <View style={styles.alarmLabel}>
                  <LiveDot color={colors.danger} size={9} motion="sonar" />
                  <Text style={styles.sectionTitle}>Needs your attention</Text>
                </View>
                {items.length > ATTENTION_CAP ? (
                  <Pressable
                    style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="See all in My jobs"
                    onPress={() => navigateAcrossTabs('MyJobs')}
                  >
                    <Text style={[styles.viewAllText, isDark && styles.viewAllTextDark]}>
                      See all
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color={isDark ? colors.emerald : colors.forest}
                    />
                  </Pressable>
                ) : null}
              </View>

              {/* #17 — the unpublished draft is the FIRST card; a tap resumes it. */}
              {draft ? <DraftCard draft={draft} onPress={() => navigation.navigate('PostJob')} /> : null}

              {myJobsError ? (
                // A failed read must never render as "nothing needs your
                // attention". Nearby's own error pattern, one notice for the
                // whole section.
                <View style={styles.notice}>
                  <Text style={styles.noticeError}>Couldn’t load your jobs.</Text>
                  <Pressable onPress={refreshMyJobs} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.retry}>Try again</Text>
                  </Pressable>
                </View>
              ) : items.length > 0 ? (
                <View style={styles.cardList}>
                  {items.slice(0, ATTENTION_CAP).map(({ job, state, line }) => {
                    const { live, chatLabel, moneyNote } = cardLive(job, state);
                    return (
                    <HubCard
                      key={`attention-${job.id}`}
                      icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                      category={job.category}
                      title={job.title}
                      subtitle={counterpartyLine(job, names)}
                      thumbnailUrl={jobThumbnailUrl(job)}
                      timeLabel={formatTimeAgo(job.created_at)}
                      priceCents={job.final_amount_cents ?? job.budget_cents}
                      status={job.status}
                      nextAction={line}
                      live={live}
                      onChat={live ? () => openChat(job) : undefined}
                      chatLabel={chatLabel}
                      moneyNote={moneyNote}
                      // The hub's read returns the FULL row, so the detail
                      // screen opens on it — no re-fetch (n5's own-card path
                      // re-fetches because that card holds an OpenJob).
                      onPress={() => navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job })}
                    />
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 2026-09-17 — "YOUR JOBS" TAKES NEARBY'S SLOT, and takes it whole:
              the same position, the same section style, the same entrance
              index (MOTION1's third and last). Nearby itself is not deleted
              from the app — it is the DISCOVER surface's and worker mode's,
              where a feed of other people's open jobs is what the screen is
              for. What it stopped being is the customer's own Home, where a
              card offering to switch you into Worker Mode was the last thing
              between a customer and their own postings.

              ALWAYS PRESENT, populated or empty — a customer who has posted
              nothing still learns that this is where their jobs will be. */}
          <EntranceView index={3} style={styles.section}>
            <View style={styles.liveNearbyHeader}>
              <Text style={styles.sectionTitle}>Your jobs</Text>
              <Pressable
                onPress={() => navigateAcrossTabs('MyJobs')}
                style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
                accessibilityRole="button"
                accessibilityLabel="View all your jobs"
              >
                <Text style={[styles.viewAllText, isDark && styles.viewAllTextDark]}>View all</Text>
                <Ionicons
                  name="arrow-forward"
                  size={19}
                  color={isDark ? colors.emerald : colors.forest}
                />
              </Pressable>
            </View>

            {yourJobs.length > 0 ? (
              <View style={styles.cardList}>
                {yourJobs.map((job) => {
                  const { live, chatLabel, moneyNote } = cardLive(job, lifecycleOf(job));
                  return (
                  <HubCard
                    key={`posted-${job.id}`}
                    icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                    category={job.category}
                    title={job.title}
                    subtitle={counterpartyLine(job, names)}
                    thumbnailUrl={jobThumbnailUrl(job)}
                    timeLabel={formatTimeAgo(job.created_at)}
                    priceCents={job.final_amount_cents ?? job.budget_cents}
                    status={job.status}
                    // NO nextAction, and that is the difference between this
                    // list and the attention block: a recency list makes no
                    // claim about what is owed, so the card falls back to its
                    // own "View details" affordance rather than a line this
                    // screen would have to derive (P3-31). A hired job's
                    // card carries its live rail (#45) — the shared rule.
                    live={live}
                    onChat={live ? () => openChat(job) : undefined}
                    chatLabel={chatLabel}
                    moneyNote={moneyNote}
                    onPress={() =>
                      void openOwnJob(
                        { fetchJob: fetchJobById, navigate: navigateAcrossTabs, alert: alertAsync },
                        job.id
                      )
                    }
                  />
                  );
                })}
              </View>
            ) : myJobsLoading || myJobsError ? (
              // NOTHING, on purpose. A failed or unfinished read is not "no job
              // has ever been posted", and saying so would be the screen
              // inventing a fact it does not have. The attention block above
              // already carries the ONE notice for this read — a second copy of
              // "Couldn’t load your jobs" under the next heading says nothing
              // new and offers the same Try again twice.
              null
            ) : (
              <View style={styles.emptyRow}>
                <View style={styles.emptyMark}>
                  <Ionicons name="briefcase-outline" size={24} color={colors.emerald} />
                </View>
                {/* ONE line, and it is only ever drawn when the customer's own
                    read came back with nothing at all — so it is true whenever
                    it is on screen (tests/copyTruth, tests/copyHonesty). */}
                <Text style={styles.emptyTitle}>You haven't posted any jobs yet</Text>
              </View>
            )}
          </EntranceView>
        </ScrollView>
      </KeyboardAvoidingView>

      <ServicePickerSheet
        visible={moreOpen}
        title="All services"
        subtitle="Pick what you need help with"
        services={ALL_SERVICES}
        onSelect={(categoryKey) => {
          setMoreOpen(false);
          startCategoryDraft(categoryKey);
        }}
        onClose={() => setMoreOpen(false)}
      />
    </SafeAreaView>
  );
}

// 2026-09-17: `OpenJobCard` lived here — the open-market card Nearby drew, with
// its own four studio dials, its thumbnail, its EST. PRICE block, its bid-count
// interest line and its "N similar jobs posted today" footer. It went with the
// section that was its only caller. The card the customer's own postings draw
// is components/HubCard.tsx, which My Jobs already draws them with.

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.homeBackground },
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.homeBackground },
  // home(4): the scroller's own ground would paint straight over the
  // atmosphere layer beneath it. SafeAreaView still carries the palette ground
  // one level up, so nothing falls through to the platform root.
  scrollOverAtmosphere: { backgroundColor: 'transparent' },
  content: {
    flexGrow: 1,
    backgroundColor: colors.homeBackground,
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: 0,
    gap: 20,
  },
  // home(12) — THE SECOND GROUND, and the one home(4) missed.
  //
  // A ScrollView paints TWO surfaces: `style` on the scroller itself, which
  // home(4) stood down, and `contentContainerStyle` on the content box inside
  // it, which it did not. The content box is `flexGrow: 1`, so it is at least
  // viewport-tall and it was painting an opaque ground over the whole
  // atmosphere from the safe-area inset downwards. That left the layer visible
  // in exactly one place — the status-bar strip above the inset, where no
  // content box reaches — and the raster is darker there than the flat token
  // is, which is the hard horizontal seam at ~6% of screen height the operator
  // photographed. It is not two ground COLOURS: `homeBackground` and
  // `background` are both #03110E at HEAD and agree. It is one ground and one
  // raster, meeting at the inset.
  //
  // Standing the content box down leaves the atmosphere as the page's single
  // ground, top to bottom, with SafeAreaView's palette ground still underneath
  // it so nothing can fall through to the platform root. Master 44's own
  // gutters are darker than #03110E (measured: mean luminance 1.6 against the
  // token's 13.8) and no hex here moves to meet that — the palette is frozen,
  // and the seam was never a colour problem.
  //
  // Worker Home needs no equivalent: its content container declares no ground.
  contentOverAtmosphere: { backgroundColor: 'transparent' },
  // 2026-09-21: no paddingBottom — the rhythm is `sectionGap` (24) alone, so
  // the sub-copy to the card is the same 24 as every other block gap.
  intro: { position: 'relative', minHeight: 160 },
  introCopy: { position: 'relative', zIndex: 1, gap: spacing.sm },
  introTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  greetingBlock: { flexShrink: 1, gap: 2 },
  // #59 — the bell and the photo. The reference sets them 14 apart as a 30pt
  // bell box and a 36 photo (refs/home-tucked-in.html `.hdr`); here each sits
  // in a 44pt target, so 3 between the targets keeps the ink ~16 apart, and the
  // photo's own 4pt of target slack is taken back at the column's edge.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: -4 },
  greeting: { fontSize: 18, fontWeight: '500', color: colors.homeSlate },
  greetingName: { color: colors.gold },
  // RUN H2 — LIGHT's accent for the same line. It is the light Post-a-job
  // pill's own green, so the greeting and the screen's one conversion control
  // agree on a single accent hue instead of the name simply going unaccented.
  // Colour only: `greeting` above still carries every number.
  greetingNameLight: { color: colors.postPillGreen },
  // 2026-09-18: the five modeSwitch* styles are gone with the pill (the
  // switch is the [+] sheet's). `homeModeRing` stays in the palette for now,
  // read by nothing on this screen.
  // home(23) — THE GAP ABOVE THE HEADLINE IS REAL SPACING.
  //
  // marginTop 30, not 15. Master 44 puts the headline's cap top at 95.0pt below
  // the content box's top; the flow above it (the greeting/switch row at 50pt,
  // then introCopy's 8pt gap) plus this face's own line box put the cap 8.4pt
  // into the block, so 58 + 30 + 8.4 = 96.4 against the master's 95.0. No
  // transform: the subtitle and everything under it move WITH it rather than
  // having the headline slide over them.
  //
  // No `maxWidth`, `fontSize` or `lineHeight` here on purpose — the column is
  // computed from the artwork at the call site (`headlineColumn`) and the size
  // is the studio's live value, both applied to BOTH themes since the parity
  // pass (2026-08-22) retired light's 39/45/'73%' Heritage composition.
  //
  // THE ONE SERIF ROLE — and since 2026-08-23 it is the PLATFORM's serif.
  // `fonts.displayHero` resolved to a bundled PlayfairDisplay-Bold static for
  // one day; it now resolves to 'Georgia', which ships with iOS. Nothing else
  // on this screen is a serif, and nothing else in the app names this token.
  //
  // fontWeight IS BACK, AND IT IS LOAD-BEARING. A bundled static made the
  // family name the weight and any `fontWeight` inert; a platform face is the
  // opposite — iOS picks the cut from the weight, so without one this renders
  // at Georgia regular. '700' is what the Bold static was.
  //
  // SIZE AND SPACING ARE UNTOUCHED, and did not need to move: the column
  // fence in tests/emeraldFences.test.mjs has always priced this headline in
  // GEORGIA's metrics (7.00pt of ink per point of size — see the ladder at
  // the top of this file), so the studio's 33pt already fits the column the
  // hero artwork leaves. The face changing is that fence becoming accurate,
  // not that fence coming under strain.
  // 2026-09-21: 30 -> 16, so the greeting to the headline is introCopy's 8
  // plus this = the one rhythm of 24 (was 38 against 28 under the sub-copy —
  // the operator's finding; DECISIONS 2026-09-20 sitting 3, (8)). The master-
  // 44 derivation above is history: the rhythm is the reference's now.
  headline: {
    marginTop: 16,
    fontFamily: fonts.displayHero,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  // home(23)'s 14/10 (master 44's own cap), both themes since the parity pass
  // — light's 16/8 setting is retired. 2026-09-17: the copy breaks onto two
  // lines by an explicit newline in the string; nothing here moved for it.
  heroSubtitle: {
    maxWidth: '73%',
    marginTop: 10,
    fontSize: 14,
    fontWeight: '500',
    color: colors.homeSlate,
  },
  // home(23) — THE HERO IS A SLOT, AND THESE ARE THE NEW MASTER'S OWN NUMBERS.
  //
  // Re-measured on the REPLACED docs/mockups/44_customer_home_dark.png
  // (853x1844). home(14)'s 151 x 135 at right: 0 came off the old 941x1672 file
  // and is void. Parity 2026-08-22: ONE box in both themes — light's Heritage
  // 112x124 at (-6, 47) is retired. 2026-08-23 retires the per-theme FILE too,
  // so nothing about this slot is per-theme any more.
  //
  // HOW THE BOX WAS FOUND, since a room-baked scene has no alpha to bound it.
  // The asset's own structured columns run 0.1225..0.8750 of its canvas — its
  // outer tenths are flat vignette. On the master, structure runs x 519..820.
  // Two anchors, one scale: the box is 400 x 351 master pixels at (470, 221),
  // which is EXACTLY the asset's own pixel dimensions, and converts at
  // 393/853 and 852/1844 to 184.3 x 162.2 pt at (216.5, 102.1).
  //
  // `right: -28`. The box's right edge lands at 400.8pt on a 393pt screen — it
  // OVERHANGS by 7.8. This style's `right` is measured from `intro`, which is
  // inside the content box's 20pt padding, so reaching 401 means -(20 + 8).
  // The overhang is not decorative: the asset's rightmost eighth is flat
  // vignette, so stopping the BOX at the screen edge would stop the visible
  // scene 23pt short of it.
  //
  // `top: 35`. The master's box top is 34.9pt below the content box's top and
  // its ink starts 7.9pt into the box, at 42.8. (Until 2026-09-18 the
  // "Switch to Worker" pill, 44pt tall against the master's 40.2, covered the
  // art's first 4.2pt; the pill is gone and the sliver shows — the master's
  // number was kept throughout.)
  //
  // 2026-09-29 (LUX-LIST-2 #5): the operator's cut-outs replace the room, and
  // a cut-out's box is its ink — see HERO_ART_DARK. The file's aspect is the
  // box's, so `cover` crops nothing.
  homeHeroArt: {
    position: 'absolute',
    zIndex: 0,
    width: HERO_ART_DARK.width,
    height: HERO_ART_DARK.height,
    right: HERO_ART_DARK.right,
    top: HERO_ART_DARK.top,
  },
  homeHeroGlow: {
    position: 'absolute',
    zIndex: 0,
    width: HERO_GLOW.width,
    height: HERO_GLOW.height,
    right: HERO_GLOW.right,
    top: HERO_GLOW.top,
  },
  homeHeroShadow: {
    position: 'absolute',
    zIndex: 0,
    width: HERO_SHADOW.width,
    height: HERO_SHADOW.height,
    right: HERO_SHADOW.right,
    top: HERO_SHADOW.top,
  },
  // Laid over the shared SearchBar so the reference geometry wins; the input,
  // clear control and (when available) the voice mic ride SearchBar itself.
  // home(24): the 8pt marginTop was the control's Y against master 44 — a REAL
  // gap on that one section, not a change to `sectionGap`. 2026-09-18: GONE
  // with the standalone field. The field sits inside the task card now, under
  // the title at the card's own 14pt gap, and a margin on top of that gap
  // would have been 22 where the mockup draws 14.
  // 2026-08-23: THE FIELD IS A HAIRLINE, NOT A CARD, in both themes. Dark drew
  // it as a near-transparent pill under a dim-gold hairline; light drew the
  // same box as an elevated WHITE card, because `surface` is #FFFFFF there and
  // shadows.card is theme-blind. Two designs again. The recolour:
  //
  //   fill    `colors.surface` -> transparent. Dark loses a #0A1813-over-
  //           #02110D lift that is under 5% luminance and reads as flat
  //           already; light loses the white card the operator flagged.
  //   ring    `homeHairline` -> `border`. DARK IS PIXEL-IDENTICAL: both
  //           tokens are #55482E in the dark palette. Light goes from the
  //           #F1EAE2 whisper (invisible on #FAF5F1 once the fill is gone)
  //           to the #DDD6C4 warm hairline, which is what dark's gold
  //           hairline reads as against its own ground.
  //   depth   shadows.card removed. An outlined field does not float.
  // 2026-09-18 (operator, against docs/mockups/html/home-redesign.html's
  // .field rule): the ring is secondaryBorder, not border — dark's `border`
  // is the warm #55482E hairline and read as gold inside the green card. The
  // fill is surface (white in light) with mint in dark, as the mockup draws
  // it. The trailing cluster — mic, divider, magnifier — hugs the right edge:
  // sm gap between them, a shorter right pad, a 20pt divider in the same ring
  // colour. No margin: home(25) places the field by the card's own gap.
  searchField: {
    gap: spacing.md,
    paddingLeft: 18,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
    backgroundColor: colors.surface,
  },
  // 2026-09-17: serviceRows / serviceRow / serviceChip / compactServiceChip /
  // goldOutlineChip / otherChip — home(24)'s two-row chip geometry, held
  // byte-identical to worker Home's — were removed with the chips they laid
  // out. The service row is components/ServiceTileRow.tsx now, which carries
  // its own geometry for both screens; a stylesheet entry that draws nothing
  // is a lie.
  //
  // 2026-09-18 — THE TASK CARD, in the promo card's place and the promo card's
  // styles' place: heroCard / heroCardDark / heroBody / heroCopy / heroEyebrow
  // / heroHeadline / heroHeadlineDark / heroMark (home(25)'s term-by-term
  // height, the 3pt marginTop, the 16/20 body, the 19/30 heading, the B mark
  // at top 21) are gone with the card they drew. What is here is the mockup's
  // card (docs/mockups/html/home-redesign.html `.card`): padding 17 and a
  // 14pt gap between its three rows, a 1pt edge, the flat fill under the
  // gradient, and the light card shadow. Every colour is a palette role read
  // in BOTH themes — `taskCardLitBottom` is the surface in light and the
  // gradient's bottom stop in dark, `taskCardEdge` the line hairline in light
  // and the mockup's edge in dark — so there is no *Dark fork here at all;
  // the theme decides only whether the gradient is drawn (see the call site).
  //
  // NO marginTop: the mockup puts the card 28 under the sub-copy, and that is
  // what `sectionGap` (20) plus `intro`'s paddingBottom (8) already give.
  // shadows.card is the light-palette shadow it always was — theme-blind on
  // the shared style, casting nothing on the dark ground (see ui/tokens.ts's
  // cardDark docblock); the mockup's dark card carries no shadow and none is
  // added.
  taskCard: {
    padding: 17,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.taskCardEdge,
    backgroundColor: colors.taskCardLitBottom,
    ...shadows.card,
  },
  // The mockup's `.card-title`: 20/24, 700, the ink — the system sans like
  // every heading role here, not the hero's serif (tests/themeTokens' one-serif
  // fence), and no ladder rung: this is the reference's own number, not a cap
  // measured off master 44.
  taskCardTitle: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors.ink },
  // M-12 — the quiet line under the pill: search is a choice, not the default.
  // The 1pt ring is part of the box in both themes (parity 2026-08-22), and
  // since 2026-08-23 it is DRAWN in both.
  //
  // WHAT DARK ACTUALLY DOES, which is what light was not doing. Dark fills the
  // pill one step off its own card (forest #1B3527 over surface #0A1813) and
  // lets the mint2 ring carry the edge — an OUTLINED pill with a faint lift.
  // Light was the opposite: pure white over the forest card, ring transparent,
  // forest text. Same geometry, a different design.
  //
  // The fix is a recolour, not a restructure: the same token ROLES resolved
  // through the light palette. `emerald` is light's one-step-off-the-card fill
  // exactly as `forest` is dark's, `mint2` is the ring in both, and `onForest`
  // is the content on a green fill in both (its docblock in lib/theme.ts says
  // so). Nothing here moved, grew or gained a shadow.
  //
  // RUN H2 SEPARATES THE TWO RINGS, and only the rings. LIGHT's mint2 hairline
  // did almost nothing against its own green fill, so it becomes GOLD — the
  // pill is the screen's one conversion control and now reads as one. DARK
  // loses its ring altogether and takes light's green as its fill, which makes
  // the two themes one pill in two grounds rather than two designs.
  //
  // THE RING IS DROPPED BY COLOUR, NOT BY WIDTH. `borderWidth` stays 1 on the
  // shared style: RN lays a border inside the box, so zeroing it in one theme
  // would move the content box by a point in that theme only — a GEOMETRY fork,
  // which tests/themeTokens.test.mjs forbids and which is exactly the class of
  // drift that rule exists for. 'transparent' removes the ring and moves
  // nothing; the screen already uses it the same way on `scrollOverAtmosphere`.
  // RUN H3 — THE LIGHT PILL'S OUTLINE IS CREAM, AND THIS REVERSES H2's GOLD ON
  // OPERATOR INSTRUCTION rather than correcting a mistake in it. The ring was
  // `colors.gold` (#C8A15B in light); it is now `creamInk` (#F1EDE1).
  //
  // IT IS A CROSS-THEME REACH AND THEREFORE A NAMED CONSTANT. Light has no
  // cream: its `onForest`/`onPrimary` is #F4F1E8, which is the light GROUND —
  // an outline in the page's own colour is not an outline. The cream the
  // operator asked for is the one the DARK palette carries as its ink, so it
  // arrives as the theme-constant `creamInk` (ui/tokens.ts `constantAccents`),
  // the same shape H2 used for the two it introduced, and not as a hex here.
  //
  // DARK DOES NOT MOVE. `heroButtonDark` below already sets this ring to
  // 'transparent', and it is merged after this style, so the dark pill has no
  // ring to change — the whole of this correction lands on light.
  heroButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.creamInk,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroButtonDark: { backgroundColor: colors.primary, borderColor: 'transparent' },
  heroButtonPressed: { opacity: 0.9 },
  heroButtonText: { fontFamily: fonts.display, fontSize: 24, fontWeight: '700', color: colors.onForest },
  // The system CTA's ink on the mint (lib/theme.ts `onPrimary`, the Lux dark ink).
  heroButtonTextDark: { color: colors.onPrimary },
  // home(26) — the NEGATIVE margin is honest, and both themes carry it since
  // the parity pass.
  //
  // Master 44 leaves 28.4pt between the promo card's bottom edge and the "L" of
  // Live Nearby. This app leaves 34: `sectionGap` gives 20, and the header row
  // adds 14 more before the cap, because `viewAll` holds it 44pt tall for the
  // touch floor and the title is centred in that. The gap the eye reads is the
  // one to the INK, so the layout gap has to be 14.2 for the ink gap to be
  // 28.4. -6 is that difference; there is no smaller lever, because the 44 is
  // CLAUDE.md's and the 20 is the studio's one global number.
  // 2026-09-17: the measurement above is unchanged and still governs, because
  // the section in this slot is unchanged in SHAPE — a 44pt header row with a
  // 20pt serif title centred in it, over the same 20pt sectionGap. Only the
  // word in the title moved, from "Nearby" to "Your jobs".
  // 2026-09-18: what sits ABOVE the first job section is the tile row now, not
  // the card — the card moved up under the hero and the row came with it. The
  // -6 is deliberately NOT re-tuned against the row's label baseline; it is
  // the same corrective margin, on the same header row, and moving it would
  // be a spacing decision this change did not make.
  // 2026-09-21: -9, re-tuned to the reference's rhythm — 24 from the tile
  // labels to the "Your jobs" heading's line box, which the 44pt header row
  // centres the 20pt title in (14 from the row's top to the cap, the cap 5
  // into the reference's 26 line box): 24 + (-9) + 14 = 29 to the ink.
  section: { gap: 12, marginTop: -9 },
  // The name is a leftover and is kept deliberately: BOTH job sections wear
  // this row — "Needs your attention" (untouched by the 2026-09-17 change) and
  // "Your jobs" — so renaming it would edit the attention block for no pixel.
  liveNearbyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  // #49 — the alarm label: the Sonar dot, 9 before the eyebrow (`.lb`).
  alarmLabel: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // home(16)/home(26)'s ladder rung (serifSize(30) = 20), in BOTH themes since
  // the parity pass — light's 22 is retired.
  // 2026-09-27 (the Lux remake, ruling 4): "NEEDS YOUR ATTENTION" and "YOUR
  // JOBS" are the Lux EYEBROW — gold in dark, emerald in light through the
  // `eyebrow` role; one measure (lib/theme.ts EYEBROW_TYPE) for both themes.
  // The serif ladder's `sectionTitle` cap stays measured for the record.
  sectionTitle: {
    ...EYEBROW_TYPE,
    // 2026-09-29 (LUX-LIST-2 #4): one of the 25 labels kept antique gold in light.
    color: colors.eyebrowGold,
  },
  // 2026-09-17: liveNearbyTitle / liveIndicator / liveDotHalo / liveDot were
  // removed with the pulsing mark they drew. "Your jobs" is the customer's own
  // postings and nothing about it is live, so there is nothing for a live
  // indicator to say. `homeLive` and `homeLiveHalo` stay in the palette —
  // worker mode still draws a feed dot with them.
  // home(9): mapPill / mapPillPressed / mapPillText / mapPillTextDark were
  // removed with the control they painted. The Map ROUTE is untouched.
  viewAll: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  viewAllPressed: { opacity: 0.78 },
  // home(26)'s sans-ladder 14 (master 44's own cap), both themes since the
  // parity pass — light's 15 is retired; the colour stays per-theme.
  viewAllText: {
    fontSize: sansSize(MASTER_SANS_CAPS.viewAll),
    fontWeight: '600',
    color: colors.forest,
  },
  viewAllTextDark: { color: colors.emerald },
  cardList: { gap: spacing.md },
  // The attention block's own notice, and the only one on this screen: one
  // failed read, one place that says so.
  notice: { gap: spacing.xs },
  noticeError: { fontSize: 14, color: colors.danger },
  retry: { fontSize: 14, fontWeight: '700', color: colors.forest },
  // 2026-09-17 — "YOUR JOBS" WITH NOTHING IN IT YET.
  //
  // A row, not a centred panel: ui/primitives/EmptyState.tsx is the shared
  // "nothing here" surface and is the right answer for a whole SCREEN — it is
  // `flex: 1`, centred, with a body sentence and an optional action — and this
  // is a section on a scrolling page with four things above it. What is taken
  // from it is the part that is a decision rather than a layout: the mark is a
  // mint disc with the glyph in `emerald`, exactly as that primitive resolves
  // them, so the two read as one family.
  //
  // 54 and the 17pt title are docs/mockups/html/home-redesign.html's own
  // numbers for this state. ONE line: the mockup's second line ("Your requests
  // will appear here.") is not drawn, on operator instruction.
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  emptyMark: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  emptyTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.ink },
  }),
);
