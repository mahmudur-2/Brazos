import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '../components/Chip';
import { HomeAtmosphere } from '../components/HomeAtmosphere';
import { HubCard } from '../components/HubCard';
import { ServicePickerSheet } from '../components/ServicePickerSheet';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBidCounts } from '../hooks/useBidCounts';
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  categoryAccent,
  fetchJobById,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { alertAsync } from '../lib/dialog';
import { ATTENTION_CAP, attentionItems } from '../lib/homeAttention';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { openOwnJob } from '../lib/ownJobCard';
import { HOME_SERVICE_ROWS, MORE_SERVICES } from '../lib/skillCategories';
import { formatTimeAgo, greetingFor } from '../lib/time';
import type { CustomerHomeStackNavigation } from '../lib/navigation';
import { useMode } from '../modes';
import { useHomeDesignSettings } from '../lib/homeDesignStudio';
import { useDialNumber } from '../lib/designOverrides';
import { useShellGround } from '../lib/shellGround';
import { useEntrance } from '../hooks/useEntrance';
import {
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { litFill, LitSurface, SearchBar, useFloatingNavClearance } from '../ui/primitives';
import { USE_NATIVE_DRIVER } from '../lib/motion';

// lit(3) — THE TWO ALPHAS ARE MEASUREMENTS, NOT PREFERENCES.
//
// Master 44 lights the promo card and the Post-a-job pill along a 135° axis;
// the app drew both flat. `node scripts/master-diff.mjs` reports each control's
// DIAGONAL LUMINANCE DELTA — the median luminance of a clean 7x7 patch at 10%
// along its top-left→bottom-right diagonal, minus the one at 90% — and on the
// control render both read exactly 0.00 against the master's +2.29 (card) and
// +6.72 (pill).
//
// Each number below is the alpha that reproduces its master's delta, solved
// rather than guessed. `LitSurface`'s wash composites to an effective overlay
// opacity of alpha x (1 - g) at gradient fraction g, and luminance is linear in
// RGB, so delta = alpha x (g90 - g10) x (Y_lift - Y_surface) — and the tool
// then confirms the prediction on a fresh render.
//
//   card  (g90-g10 = 0.433, emerald 153.95 over surface 20.66)  2.29 / 57.7
//   pill  (g90-g10 = 0.752, emerald 153.95 over pill    85.21)  6.72 / 51.7
//
// `emerald` is the lift in both because the master's own lift is green-weighted
// — its pill rises +3/+8/+5 in R/G/B, which a cream lift cannot do and emerald
// at ~0.05 does.
const CARD_LIFT_ALPHA = 0.04;
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
// home(1): the light mark used to be assets/brand/customer-home-post-mark-hd.png.
// That file was deleted from disk while the transparent cut-outs were being
// installed, and this line still named it. Metro resolves an asset `require`
// at BUNDLE time, so that was not a light-mode blemish — it failed the whole
// build, in both themes. It is repointed at the brand-folder drape installed
// in the same batch (byte-identical to the prestige one; kept under
// assets/brand so light never mounts an assets/prestige file).
const POST_MARK = require('../assets/brand/brazos_b_drape.png');
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
const PRESTIGE_HERO_ART = require('../assets/prestige/hero_armchair_customer.png');
// The LIGHT half of that pair, measured rather than assumed to mirror the dark
// one (RUN H2): 400x351 RGBA like its counterpart, but a different BAKE. The
// dark file is 97.93% fully opaque with a hard 2.05% strip trimmed off its
// bottom edge and 35 partial samples in the whole frame; this one ramps —
// every alpha bucket populated, 22.43% of it partially transparent, 1.43% cut
// to zero, all four corners empty — while its interior stays 98.73% solid
// inside a 42px inset. That is a FEATHERED EDGE on a solid scene, which is
// neither of the two bakes the roster knew, so it carries its own word there
// ('baked-feathered') rather than being rounded to the nearer one.
const PRESTIGE_HERO_ART_LIGHT = require('../assets/prestige/hero_armchair_customer_light.png');
const PRESTIGE_B_DRAPE = require('../assets/prestige/brazos_b_drape.png');
const PREVIEW_COUNT = 4;

// ---------------------------------------------------------------------------
// home(2) — THE B DRAPE'S GEOMETRY.
//
// The drape was a FIXED 92x75 box, and the headline column was a fixed 96pt of
// paddingRight cut out to clear it. Between them they left the promo card's
// heading about 222pt on a 390pt phone, which is what wrapped "Describe the
// job. BRAZOS handles the rest." onto three lines. The heading's font size is
// not the problem and is not touched.
//
// WHY A RATIO AND NOT A SMALLER FIXED NUMBER. The target is a share of the
// SCREEN — and a fixed pt width cannot hold one. Across the supported range
// (320pt to 440pt) any single number swings by nearly a third: 71pt is 22.2%
// of a 320 and 16.1% of a 440. Only a proportion is the same everywhere, so
// the mechanism itself changes from a constant to a fraction.
//
// The height is derived from the artwork's own pixel aspect rather than
// declared, so the box can never be given a shape the image does not have.
// (`resizeMode="contain"` would letterbox rather than distort, but then the
// reserved box and the drawn ink stop agreeing, and the headline's column is
// measured off the box.)
// home(15) — 0.183 WAS THE BOX AND THE EYE MEASURES THE INK.
//
// assets/prestige/brazos_b_drape.png IS the file master 44 draws this mark
// from — a transparent-backed gold B with its leaf, and nothing else. (The
// name is a leftover: there is no drape in it. The dark green fabric behind the
// B on the master is a separate thing that exists in no asset here; see the run
// report, where it is recorded as artwork still owed.) The file was never
// wrong. Only its size was, and only because this number described the box.
//
// Its ink covers 60.7% of its canvas's width, so a box at 18.3% of the screen
// drew a mark 11.1% of the screen wide — 12.4% of the card against master 44's
// measured 18.7%. The ratio below is the box that DRAWS the master's ink:
//   0.187 of the card / 0.6067 of the canvas, over 353/393 of the screen
// which lands at 0.277 and resolves to a 109pt box drawing 66pt of mark.
const B_DRAPE_WIDTH_RATIO = 0.277;
/** Both copies of brazos_b_drape.png (brand and prestige) are 918 x 753. */
const B_DRAPE_ASPECT = 918 / 753;
/**
 * How far the headline column is allowed to run PAST the drape's left edge.
 *
 * home(15): this is no longer "a few points". The box's left 19.2% is empty —
 * that is where the asset's own margin lives — so the copy may run that far in
 * and still stop clear of the ink. Master 44 does exactly that: its heading
 * column ends 171px = 71.4pt from the card's content right edge, which is the
 * B's ink edge and not the box's. 109 - 38 = 71 is that number, and holding the
 * column there is what keeps the heading on the master's three lines while the
 * mark grows by half.
 */
const B_DRAPE_COPY_OVERLAP = 38;
/**
 * The drape's inset from the card's right edge — see `heroMarkDark`.
 *
 * home(15): zero, because the ink's own right margin IS the inset now. Master
 * 44 puts the B's ink 52px = 21.7pt from the card's inner right edge; the box's
 * empty right margin is 20.2% of 109 = 22pt. Insetting the box on top of that
 * would double it.
 */
const B_DRAPE_RIGHT_INSET = 0;

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
// which lands on the same 22 by coincidence of two different pixel grids.
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
const MASTER_SERIF_CAPS = {
  /** "Take a task", the T's stem: y 351..402 = 52px. */
  heroHeadline: 52,
  /** "Describe the job.", the D's stem: y 1217..1249 = 33px. */
  promoHeading: 33,
  /** "Live Nearby", the L's stem: y 1571..1600 = 30px. */
  sectionTitle: 30,
  /** "Post a job", the P's stem: y 1406..1434 = 29px. Frozen at 24 — see below. */
  ctaLabel: 29,
} as const;
const serifSize = (capPx: number) =>
  Math.round((capPx * MASTER_TO_DEVICE) / GEORGIA_CAP_RATIO);

// home(26) — THE SAME LADDER, FOR THE TWO LABELS THAT ARE NOT SERIF.
//
// "View all" and "Switch to Worker" are drawn SANS on master 44 — checked at
// 1:1, they carry no serifs and no stroke contrast — so putting their caps
// through the serif conversion would size them against the wrong face. Same
// measurement, same arithmetic, one different divisor. What they must NOT be
// is two literals chosen by eye, which is what they were.
/** The platform sans's cap height as a fraction of its em. */
const SYSTEM_CAP_RATIO = 0.6875;
const MASTER_SANS_CAPS = {
  /** "View all", the V's stem: y 1577..1597 = 21px. */
  viewAll: 21,
  /** "Switch to Worker", the S: y 181..200 = 20px. */
  switchLabel: 20,
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
//   promo heading   22 by cap  ->  25 UNCHANGED. The rung is unmoved by the
//     master replacement (37px of 1672 and 33px of 1844 both convert to 22pt
//     of Georgia), so the 3pt this pin owes the ladder is the same 3pt.
//     What the new master DOES change is the line count — see home(25).
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
const HERO_ART_INK_LEFT = 0.1775;
/**
 * The dark hero's box in points — master 44's own 400x351 of its 853x1844
 * pixels, at (470, 221). See `homeHeroArtDark` for how it was found and why
 * `right` is negative. They are constants rather than literals in the
 * stylesheet because the headline's column is COMPUTED from them: the copy has
 * to stop where the artwork's ink starts, and a number typed twice is a number
 * that drifts.
 */
const HERO_ART_DARK = { width: 184, height: 162, right: -33, top: 70 } as const;
/**
 * The dark headline's leading, as a multiple of whatever size the studio is
 * showing. Master 44 runs 82px of line pitch = 37.9pt, and this is that pitch
 * over the 31pt the column allows — an ABSOLUTE measurement expressed as a
 * ratio so the studio slider still moves both together.
 */
const HEADLINE_LEADING = 38 / 31;

function similarPostedToday(jobs: OpenJob[], job: OpenJob): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  return jobs.filter(
    (other) =>
      other.id !== job.id &&
      other.category === job.category &&
      new Date(other.created_at) >= midnight
  ).length;
}

/** Home cards intentionally show only the neighborhood; job details retain the full location. */
function previewNeighborhood(location: string): string {
  return location.split(',')[0]?.trim() || location;
}

/** Customer Home to golden master 44 (Prestige 1a), retaining the existing
 *  data and routes; light keeps the approved Heritage composition. */
export function HomeScreen() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const navigation = useNavigation<CustomerHomeStackNavigation>();
  const reducedMotion = useReducedMotion();
  const design = useHomeDesignSettings();
  const { switchMode, switching } = useMode();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { width: screenWidth } = useWindowDimensions();
  // RUN T2 (C1) — HOME'S OWN DIALS. Each falls back to the number this file
  // drew before the dial existed, which is why it is spelled here and not in
  // the stylesheet: one place per value, so the studio's default and the
  // shipped pixel cannot drift apart.
  const promoCardRadius = useDialNumber('home.promoCard.radius') ?? 22;
  // THE MODE PILL'S DIAL, AND THE TWENTY-SIX PIXELS IT WAS WRONGLY BLAMED FOR.
  //
  // T2's render gate found one capture that would not go byte-identical:
  // `customer-services-sheet-dark`, 26 pixels, every build and every capture,
  // each differing by one unit on one channel. All 26 sit on THIS pill's ring
  // — right edge x372, bottom y54, both bottom corner arcs — so this dial was
  // the obvious suspect and was tried in three forms: applied unconditionally,
  // applied only when set (so an untouched screen adds no style member at
  // all), and removed outright with the pill restored byte-for-byte to
  // 9d889bb. All three produced the SAME 26 pixels. The dial is not the cause,
  // so it stands, in the same shape as every other dial in the run.
  //
  // WHAT IS ACTUALLY KNOWN, recorded because the next run should not re-chase
  // it: `customer-home-dark` and `customer-home-light` — the same pill, same
  // screen, no scrim over it — are byte-identical against the pre-run baseline
  // through every build, so no value on this screen moved. The rest of the
  // dimmed area in the sheet capture is identical too, which rules out the
  // scrim's own alpha. What is left is how the browser rasterises this one
  // high-contrast ring beneath an overlay, and 26 pixels of 1/255 is the whole
  // of it.
  const modeSwitchPaddingX = useDialNumber('home.modeSwitch.paddingX') ?? 10;

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
  const navClearance = useFloatingNavClearance();

  // MOTION1 (C2): the three sections below the greeting arrive in reading
  // order. The hook returns a STYLE, so each of these rides the node the
  // screen already renders — no wrapper, no layout change, and nothing at all
  // under reduced motion. Index 0 is the search field the chips sit under.
  const chipsEntrance = useEntrance(1);
  const cardEntrance = useEntrance(2);
  const sectionEntrance = useEntrance(3);

  // home(2): the drape's box and the headline column it clears, both derived
  // from one fraction of the screen so they can never drift apart.
  const bDrape = useMemo(() => {
    const width = Math.round(screenWidth * B_DRAPE_WIDTH_RATIO);
    return {
      art: { width, height: Math.round(width / B_DRAPE_ASPECT) },
      copyPaddingRight: width + B_DRAPE_RIGHT_INSET - B_DRAPE_COPY_OVERLAP,
    };
  }, [screenWidth]);

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
  const livePulse = useRef(new Animated.Value(0)).current;

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const preview = useMemo(() => jobs.slice(0, PREVIEW_COUNT), [jobs]);
  const bidCounts = useBidCounts(useMemo(() => preview.map((job) => job.id), [preview]));

  // a2 (2026-09-05) — "Needs your attention" reads the My Jobs hub's OWN
  // aggregation (docs/DECISIONS.md 2026-09-05 entry (4)): no new RPC, and no
  // second copy of the lifecycle derivation on this screen. The hook's
  // worker-side reads run too — that is the price of one aggregation (P3-31),
  // and it is a page the signed-in user is entitled to either way. The three
  // names that collide with the open-jobs feed above are aliased; nothing
  // else about the call differs from screens/MyJobsHubScreen.tsx.
  const {
    posted,
    payments,
    openDisputeJobIds,
    reviewedJobIds,
    names,
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

  useEffect(() => {
    if (reducedMotion === null) return;

    livePulse.stopAnimation();
    if (reducedMotion) {
      livePulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 900, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(livePulse, { toValue: 0, duration: 900, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [livePulse, reducedMotion]);

  const livePulseStyle = {
    opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.72] }),
    transform: [
      { scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.3] }) },
    ],
  };

  // PHASE 2 WIRING (unchanged by the Prestige restyle).
  //
  // "View all" and the Live Nearby cards both used to push worker surfaces
  // (Worker Home / the worker bid screen) onto the customer's own Home stack —
  // the "customer View All crosses into worker behaviour" leak. Those routes no
  // longer exist in CustomerHomeStackParamList, so this is now a compile-time
  // guarantee, not a convention.
  //
  // Until Phase 8 builds the customer-safe MarketJobPreview route (§E/§F), the
  // honest behaviour for a customer asking to see the open-job marketplace is
  // §F's cross-mode rule: never switch silently, always confirm. switchMode()
  // is the only path, so the panel plays, the mode persists, and the stacks
  // reset — none of which the old plain push did.
  function browseOpenJobs() {
    void switchMode('worker', {
      confirm: {
        title: 'Switch to Worker Mode?',
        message:
          'Browsing every open job happens in Worker Mode, where you can bid on them. Your posted jobs stay exactly where they are.',
        confirmText: 'Switch',
      },
    });
  }

  // The mode-switch pill. Same deliberate switch as before — now through the
  // one authoritative switchMode() rather than a navigate() dressed up as one.
  function switchToWorker() {
    void switchMode('worker');
  }


  // The "Post a job" CTA's own entry point — carries over whatever the
  // customer already typed in the search field so a fresh post doesn't start
  // blank. Category chips are a separate action (searchCategory below): they
  // find matching workers, not start a job draft.
  function startJobDraft() {
    navigation.navigate('PostJob', {
      initialDescription: query.trim() || undefined,
    });
  }

  function searchCategory(categoryKey: string) {
    navigation.navigate('WorkerSearch', { category: categoryKey });
  }

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    navigation.navigate('WorkerSearch', { query: trimmed });
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
    <SafeAreaView style={styles.safe} edges={['top']}>
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
                <Pressable
                  onPress={switchToWorker}
                  disabled={switching}
                  style={({ pressed }) => [
                    styles.modeSwitch,
                    isDark && styles.modeSwitchDark,
                    { paddingHorizontal: modeSwitchPaddingX },
                    pressed && styles.modeSwitchPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Switch to Worker"
                  accessibilityHint="Opens the jobs you can bid on"
                  accessibilityState={{ disabled: switching }}
                >
                  <Ionicons name="build" size={23} color={isDark ? colors.emerald : colors.forest} />
                  <Text style={[styles.modeSwitchText, isDark && styles.modeSwitchTextDark]}>
                    Switch to Worker
                  </Text>
                </Pressable>
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
                Take a task{'\n'}off your plate.
              </Text>
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                Describe it. Hire help. Get it handled.
              </Text>
            </View>
          </View>

          {/* The shared SearchBar (Prestige 1a): the mic is the REAL voice
              search, rendered only when the on-device boundary is available —
              master 44's contract — replacing the old always-on stub that
              apologised when tapped. The trailing slot holds the gold submit
              arrow. */}
          <SearchBar
            value={query}
            onChangeText={setQuery}
            onSubmit={submitSearch}
            placeholder="Describe a service or project"
            autoCapitalize="sentences"
            autoCorrect
            style={[
              styles.searchField,
              { minHeight: design.searchHeight, borderRadius: design.searchRadius },
            ]}
            trailing={
              <>
                <View style={styles.searchDivider} />
                {/* The submit affordance, not decoration: same submitSearch()
                    the keyboard return fires, and an empty query is a no-op
                    inside it. The worker Home arrow carries the same
                    contract (tests/voiceSearch.test.mjs pins both). */}
                <Pressable
                  onPress={submitSearch}
                  hitSlop={10}
                  style={({ pressed }) => pressed && styles.searchGoPressed}
                  accessibilityRole="button"
                  accessibilityLabel="Search"
                >
                  <Ionicons name="arrow-forward" size={23} color={colors.gold} />
                </Pressable>
              </>
            }
          />

          <Animated.View style={[styles.serviceRows, chipsEntrance]}>
            {HOME_SERVICE_ROWS.map((row, rowIndex) => (
              <View key={`service-row-${rowIndex}`} style={styles.serviceRow}>
                {row.map((service) => (
                  <Chip
                    key={service.label}
                    label={service.label}
                    icon={service.icon}
                    variant="service"
                    style={[
                      // Parity 2026-08-22: one pill geometry (home(24)'s
                      // paddings) in both themes; light keeps only the gold
                      // outline COLOUR over the Chip's shared 1pt border.
                      !isDark && styles.goldOutlineChip,
                      rowIndex === 1 ? styles.compactServiceChip : styles.serviceChip,
                      // C4: these carried no depth at all. On the near-black
                      // ground a chip's hairline was the only thing holding it
                      // off the page; the dark card shadow gives the row the
                      // same lift the cards below it have. Light is untouched.
                      isDark && shadows.cardDark,
                    ]}
                    onPress={() => searchCategory(service.key)}
                    accessibilityHint={`Find ${service.label.toLowerCase()} help`}
                  />
                ))}
                {rowIndex === HOME_SERVICE_ROWS.length - 1 ? (
                  <Chip
                    label="Other"
                    icon="chevron-down"
                    variant="service"
                    style={[
                      !isDark && styles.goldOutlineChip,
                      styles.compactServiceChip,
                      styles.otherChip,
                      isDark && shadows.cardDark,
                    ]}
                    onPress={() => setMoreOpen(true)}
                    accessibilityLabel="Other services"
                    accessibilityHint="Opens the full list of services"
                  />
                ) : null}
              </View>
            ))}
          </Animated.View>

          {/* Master 44's promo card: dark is a hairlined surface card with the
              gold B drape and the screen's ONE conversion pill (decision 3).
              2026-08-23: light is the SAME design in the light palette, not a
              second design — its pill was a solid white fill with an invisible
              ring, and is now the outlined treatment dark draws. */}
          <LitSurface
            // C4: the card shadow in the stylesheet is a light-palette shadow
            // and casts nothing on this ground. The dark token is ADDED rather
            // than swapped in, so light keeps exactly what it had.
            style={[
              styles.heroCard,
              isDark && styles.heroCardDark,
              isDark && shadows.cardDark,
              { borderRadius: promoCardRadius },
              cardEntrance,
            ]}
            surface={colors.surface}
            lift={colors.emerald}
            liftAlpha={CARD_LIFT_ALPHA}
            flat={!isDark}
          >
            <View style={styles.heroBody}>
              {/* Parity 2026-08-22: one copy column, reserved from the B
                  drape's own computed width in both themes (home(2)). */}
              <View style={[styles.heroCopy, { paddingRight: bDrape.copyPaddingRight }]}>
                <Text style={styles.heroEyebrow}>FASTEST WAY TO START</Text>
                <Text
                  style={[styles.heroHeadline, isDark && styles.heroHeadlineDark]}
                  maxFontSizeMultiplier={1.3}
                >
                  Describe the job.{'\n'}BRAZOS handles the rest.
                </Text>
              </View>
              <Pressable
                onPress={() => startJobDraft()}
                style={({ pressed }) => [
                  styles.heroButton,
                  isDark && styles.heroButtonDark,
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
                  litFill({
                    surface: colors.postPillGreen,
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
            </View>
            <Image
              source={isDark ? PRESTIGE_B_DRAPE : POST_MARK}
              style={[styles.heroMark, bDrape.art]}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </LitSurface>

          {/* a2 — WHAT NEEDS THE CUSTOMER'S MOVE, directly below the promo
              card and above Nearby (docs/DECISIONS.md 2026-09-05 entry (4)).
              THE POSITION IS NOT A TASTE CHOICE: the E2E money walk finds
              "Post a job" on Home WITHOUT scrolling (.maestro/sign-in.yml's
              HOME_MARK, then money-walk.yml's tap), Maestro taps nothing laid
              out below the 852pt fold, and the E2E customer fixture owns
              staging jobs that need attention — so a block ABOVE the card
              would push the pill off-screen and break the walk without a flow
              change, which the chain forbids. The ruling's "leads with" is met
              as the FIRST job section; the Figma pass decides the final order.

              No entrance animation: MOTION1's three indices are the search
              field, the chips and Nearby, and this section does not take a
              fourth. Every style here already existed, and every card is the
              hub's own HubCard with the hub's own props — the line included,
              which myJobsNextAction() derives once for both surfaces. */}
          {myJobsError || items.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.liveNearbyHeader}>
                <Text style={styles.sectionTitle}>Needs your attention</Text>
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
              ) : (
                <View style={styles.cardList}>
                  {items.slice(0, ATTENTION_CAP).map(({ job, line }) => (
                    <HubCard
                      key={`attention-${job.id}`}
                      icon={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                      category={job.category}
                      title={job.title}
                      subtitle={
                        job.assigned_worker_id
                          ? `Worker · ${names[job.assigned_worker_id] ?? 'Worker'}`
                          : job.bid_count > 0
                            ? `${job.bid_count} ${job.bid_count === 1 ? 'bid' : 'bids'} received`
                            : 'Awaiting bids'
                      }
                      thumbnailUrl={jobThumbnailUrl(job)}
                      timeLabel={formatTimeAgo(job.created_at)}
                      priceCents={job.final_amount_cents ?? job.budget_cents}
                      status={job.status}
                      nextAction={line}
                      // The hub's read returns the FULL row, so the detail
                      // screen opens on it — no re-fetch (n5's own-card path
                      // re-fetches because that card holds an OpenJob).
                      onPress={() => navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job })}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null}

          <Animated.View style={[styles.section, sectionEntrance]}>
            <View style={styles.liveNearbyHeader}>
              <View style={styles.liveNearbyTitle}>
                <View style={styles.liveIndicator} accessibilityLabel="Live nearby jobs">
                  <Animated.View style={[styles.liveDotHalo, livePulseStyle]} />
                  <View style={styles.liveDot} />
                </View>
                {/* RUN H2: "Live Nearby" -> "Nearby". The live INDICATOR beside
                    it is untouched — the pulse still says "live", so the word
                    was saying it twice. */}
                <Text style={styles.sectionTitle}>Nearby</Text>
              </View>
              <Pressable
                onPress={browseOpenJobs}
                style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
                accessibilityRole="button"
                accessibilityLabel="View all open jobs"
              >
                <Text style={[styles.viewAllText, isDark && styles.viewAllTextDark]}>View all</Text>
                <Ionicons
                  name="arrow-forward"
                  size={19}
                  color={isDark ? colors.emerald : colors.forest}
                />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.cardList}>
                <View style={[styles.skeletonCard, isDark && shadows.cardDark]}>
                  <Skeleton style={styles.skeletonThumb} />
                  <View style={styles.skeletonText}>
                    <Skeleton style={styles.skeletonLine} />
                    <Skeleton style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  </View>
                </View>
              </View>
            ) : error ? (
              <View style={styles.notice}>
                <Text style={styles.noticeError}>Couldn’t load open jobs.</Text>
                <Pressable onPress={refresh} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.retry}>Try again</Text>
                </Pressable>
              </View>
            ) : preview.length === 0 ? (
              <Text style={styles.empty}>
                No open jobs right now — new jobs appear here automatically as clients post them.
              </Text>
            ) : (
              <View style={styles.cardList}>
                {preview.map((job) => {
                  const isOwn = !!user && user.id === job.client_id;
                  // n5 (2026-09-04): the poster's own card opens its client
                  // job detail (lib/ownJobCard.ts — the full row is fetched
                  // first, since ClientJobDetail takes a Job, not the card's
                  // OpenJob); every other card keeps the confirmed switch
                  // into Worker Mode.
                  return (
                    <OpenJobCard
                      key={job.id}
                      job={job}
                      isOwn={isOwn}
                      bidCount={bidCounts[job.id]}
                      similarToday={similarPostedToday(jobs, job)}
                      onPress={
                        isOwn
                          ? () =>
                              void openOwnJob(
                                { fetchJob: fetchJobById, navigate: navigateAcrossTabs, alert: alertAsync },
                                job.id
                              )
                          : browseOpenJobs
                      }
                    />
                  );
                })}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ServicePickerSheet
        visible={moreOpen}
        title="All services"
        subtitle="Pick what you need help with"
        services={MORE_SERVICES}
        onSelect={(categoryKey) => {
          setMoreOpen(false);
          searchCategory(categoryKey);
        }}
        onClose={() => setMoreOpen(false)}
      />
    </SafeAreaView>
  );
}

function OpenJobCard({
  job,
  isOwn,
  bidCount,
  similarToday,
  onPress,
}: {
  job: OpenJob;
  isOwn: boolean;
  bidCount: number | undefined;
  similarToday: number;
  onPress: () => void;
}) {
  const design = useHomeDesignSettings();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C1) — the Nearby card's four dials. `gap` inherits
  // `theme.spacing.md` because this file imports `spacing` from lib/theme;
  // the other three answer to no token and carry their own literal.
  const jobCardPadding = useDialNumber('home.jobCard.padding') ?? 14;
  const jobCardGap = useDialNumber('home.jobCard.gap') ?? spacing.md;
  const jobThumbSize = useDialNumber('home.jobCard.thumbSize') ?? 104;
  const jobMetaPaddingY = useDialNumber('home.jobCard.metaPaddingY') ?? 10;
  const accent = categoryAccent(job.category);
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl = jobThumbnailUrl(job);
  const showThumb = !!thumbUrl && !thumbFailed;
  const interest =
    bidCount === undefined
      ? null
      : bidCount === 0
        ? isOwn
          ? 'No bids yet'
          : 'Be the first to bid'
        : `${bidCount} ${bidCount === 1 ? 'pro' : 'pros'} interested`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.jobCard,
        isDark && styles.jobCardDark,
        isDark && shadows.cardDark,
        { borderRadius: design.jobCardRadius },
        pressed && styles.jobCardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={job.title}
    >
      <View style={[styles.jobBody, { gap: jobCardGap, padding: jobCardPadding }]}>
        {showThumb ? (
          <RemoteImage
            uri={thumbUrl}
            style={[styles.jobThumb, { width: jobThumbSize, height: jobThumbSize }]}
            contentFit="cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          // Masters (12/44): the no-photo tile is the deep-green tile with the
          // gold category glyph in dark; light keeps the category accents.
          <View
            style={[
              styles.jobThumb,
              styles.jobThumbFallback,
              { width: jobThumbSize, height: jobThumbSize },
              isDark ? styles.jobThumbFallbackDark : { backgroundColor: accent.bg },
            ]}
          >
            <Ionicons
              name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
              size={28}
              color={isDark ? colors.gold : accent.icon}
            />
          </View>
        )}
        <View style={styles.jobMain}>
          <View style={styles.jobHeadRow}>
            <Text style={styles.jobTitle} numberOfLines={2}>
              {job.title}
            </Text>
            <View style={styles.jobPriceBlock}>
              {/* Eyebrow law (decision 6): structural label gold in dark,
                  money value emerald serif; light keeps the Heritage pair. */}
              <Text style={[styles.jobPriceCaption, isDark && styles.jobPriceCaptionDark]}>
                EST. PRICE
              </Text>
              <Text style={[styles.jobPrice, isDark && styles.jobPriceDark]} numberOfLines={1}>
                {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
              </Text>
            </View>
          </View>
          {job.location ? (
            <View style={styles.jobPlaceRow}>
              <Ionicons name="location-outline" size={16} color={colors.homeSlate} />
              <Text style={styles.jobPlace} numberOfLines={1}>
                {previewNeighborhood(job.location)}
              </Text>
            </View>
          ) : null}
          {/* a2 (2026-09-05) — docs/BACKLOG.md's parked card-facts item: this
              was the ONE card in the app carrying the bid count and no
              posted-ago line, and how long a job has sat unanswered is what
              tells a browsing worker whether it is worth a bid. Always drawn —
              jobs.created_at is NOT NULL — in the neighbourhood row's own two
              styles, with the clock glyph WorkerJobCard's "Posted" row uses. */}
          <View style={styles.jobPlaceRow}>
            <Ionicons name="time-outline" size={16} color={colors.homeSlate} />
            <Text style={styles.jobPlace} numberOfLines={1}>
              Posted {formatTimeAgo(job.created_at)}
            </Text>
          </View>
          <View style={styles.jobFootRow}>
            <View style={styles.jobTags}>
              {isOwn ? <Chip label="Your job" variant="soft" size="sm" /> : null}
              <Chip label={JOB_CATEGORY_LABELS[job.category] ?? job.category} variant="soft" size="sm" />
            </View>
            {interest ? (
              <View style={styles.jobInterest}>
                <Ionicons name="people-outline" size={17} color={colors.homeSlate} />
                <Text style={styles.jobInterestText} numberOfLines={1}>
                  {interest}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {similarToday > 0 ? (
        <View style={[styles.jobMeta, { paddingVertical: jobMetaPaddingY }]}>
          <View style={styles.demandRow}>
            <Ionicons
              name="trending-up"
              size={16}
              color={isDark ? colors.emerald : colors.forest}
            />
            {/* States exactly what similarPostedToday() measures — same
                category, posted since midnight. No distance term is computed,
                so no geographic claim is made (F-024). */}
            <Text style={[styles.demandText, isDark && styles.demandTextDark]} numberOfLines={1}>
              {similarToday} similar {similarToday === 1 ? 'job' : 'jobs'} posted today
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

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
  intro: { position: 'relative', minHeight: 160, paddingBottom: spacing.sm },
  introCopy: { position: 'relative', zIndex: 1, gap: spacing.sm },
  introTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  greetingBlock: { flexShrink: 1, gap: 2 },
  greeting: { fontSize: 18, fontWeight: '500', color: colors.homeSlate },
  greetingName: { color: colors.gold },
  // RUN H2 — LIGHT's accent for the same line. It is the light Post-a-job
  // pill's own green, so the greeting and the screen's one conversion control
  // agree on a single accent hue instead of the name simply going unaccented.
  // Colour only: `greeting` above still carries every number.
  greetingNameLight: { color: colors.postPillGreen },
  // Parity 2026-08-22: the ring is ONE point in both themes (home(17)'s
  // weight, which light now inherits); only the ring's colour is per-theme.
  modeSwitch: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  // home(17) — DARK ONLY: the ring is the HAIRLINE token, at one point.
  //
  // It resolved `colors.gold` (#DCAB60) at 1.25pt, which is the brightest
  // colour in the palette drawn heavier than any other line on the screen.
  // Master 44 rings this control at an effective 1.66px of its 941 — 0.69pt —
  // so the weight goes to 1, the nearest real weight below what shipped.
  //
  // The colour goes to `border`, which lib/theme.ts documents as "the flat
  // equivalent of gold at hairline alpha". RECORDED DIFFERENCE: the master's
  // own ring peaks at #A9814B, brighter than #55482E and brighter than the
  // hairline it draws that card with (#6C5941 peak) — so master 44 does
  // distinguish the two and this does not. Reaching #A9814B means either a new
  // hex or an alpha blend of gold, and the palette is frozen; the token is the
  // instruction and the gap is written down instead.
  //
  // THE HEIGHT DOES NOT MOVE. Master 44 draws this pill 79px = 33pt tall and
  // CLAUDE.md's touch floor is 44 — the master is under the floor, so the floor
  // wins and `minHeight: 44` stays. That is the whole of the "~21% taller"
  // difference; nothing about it is a styling choice.
  //
  // home(26) — A REVERSAL OF THE COLOUR HALF, AND ONLY THE COLOUR HALF.
  //
  // The WEIGHT above survives: the replaced master rings this control at 2px of
  // its 1844 = 0.92pt, so 1 is still the nearest real weight and 1.25 is still
  // too heavy. What does not survive is `border`. That choice was made against
  // a ring the old file "peaks at #A9814B" — a warm olive. The replaced
  // master's ring peaks at #AFACA4 and integrates to #A4A29B..#989790 across
  // the plausible line widths: a near-neutral light grey at luminance 151..168,
  // against `border`'s 73. It is not a dim gold hairline at all.
  //
  // `homeSlate` (#93A096) is the closest token in the dark palette by a wide
  // margin — 9/255 on its worst channel against the mid estimate, where the
  // next nearest (`neutral`) is 11 and `border` is 62. The prompt's tolerance
  // is 8, and 9 is one over it; a new token would be inventing precision the
  // measurement does not have, because the estimate's own spread — 151 to 168
  // depending on whether the ring is 0.92pt or 1.00pt — is twice that gap.
  // RECORDED: the difference, and the fact that no token is inside 8.
  modeSwitchDark: { borderColor: colors.homeModeRing },
  // Phase 1's tactile answer to the tap — the press state itself, so the
  // feedback lands on touch-down rather than after an animation starts.
  modeSwitchPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  // home(26)'s sans-ladder 13, now in BOTH themes (parity 2026-08-22): the
  // label is the pill's only elastic term, and one size keeps one pill width.
  modeSwitchText: {
    fontSize: sansSize(MASTER_SANS_CAPS.switchLabel),
    fontWeight: '600',
    color: colors.forest,
  },
  modeSwitchTextDark: { color: colors.emerald },
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
  headline: {
    marginTop: 30,
    fontFamily: fonts.displayHero,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  // home(23)'s 14/10 (one line, master 44's own cap), both themes since the
  // parity pass — light's 16/8 two-line setting is retired.
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
  // its ink starts 7.9pt into the box, at 42.8. This app's "Switch to Worker"
  // pill is 44pt tall against the master's 40.2 — CLAUDE.md's touch floor, and
  // the master is under it — so its bottom sits at 47 and covers the art's
  // first 4.2pt. RECORDED: the master's number is kept and the taller pill hides
  // a sliver of scene behind an opaque fill, which is the smaller difference.
  homeHeroArt: {
    position: 'absolute',
    zIndex: 0,
    width: HERO_ART_DARK.width,
    height: HERO_ART_DARK.height,
    right: HERO_ART_DARK.right,
    top: HERO_ART_DARK.top,
  },
  // Laid over the shared SearchBar so the reference geometry wins; the input,
  // clear control and (when available) the voice mic ride SearchBar itself.
  // home(24): the 8pt marginTop is the control's Y against master 44 — a REAL
  // gap on this one section, not a change to `sectionGap` — and it applies in
  // both themes since the parity pass (2026-08-22).
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
  searchField: {
    marginTop: 8,
    gap: spacing.md,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  searchDivider: { width: 1, height: 32, backgroundColor: colors.border },
  searchGoPressed: { opacity: 0.7 },
  // home(24)'s row rhythm — gap 10 between rows, 6.4 -> 6 inside them — in
  // BOTH themes since the parity pass (light's spacing.sm pair is retired).
  serviceRows: { gap: 10 },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  // home(24) — WHAT PUTS THE CHIPS ON TWO ROWS, which is the whole point.
  //
  // Master 44 draws five pills on two rows; this app drew six-across-three,
  // with "Other" alone on a row of its own. Row 2 needed 360pt of a 353pt
  // content width — over by 7 — so nothing about the wrap was subtle.
  //
  // The lever is the PILL's horizontal padding. The master's own padding is
  // LARGER than this app's (17.5pt on row 1, ~14 on row 2), and its pills are
  // still narrower, because its label face is narrower than the platform sans
  // at 14pt. That label lives in components/Chip.tsx and is shared by every
  // chip in the app, so it is not Home's to move; the padding is. What the
  // numbers buy, measured:
  //
  //   row 1   Furniture Assembly 172 -> 168  (master 167.7)
  //           Moving Help        133 -> 129  (master 126.7)
  //   row 2   House Cleaning     142 -> 138  (master 137.3)
  //           TV Mounting        126 -> 122  (master 120.7)
  //           Other               76 ->  81  (master  84.8, grown by flexGrow
  //                                           into what the row has left)
  //
  // Parity 2026-08-22: the paddings apply in both themes (light's 14/10 pair
  // is retired with its 8pt gaps).
  serviceChip: { paddingHorizontal: 12 },
  compactServiceChip: { paddingHorizontal: 8 },
  // Same gold hairline COLOUR as the "Switch to Worker" pill above, so the
  // quick-service row reads as part of the same control family (light only —
  // dark wears the Chip's sage treatment). The WIDTH is the Chip's own 1pt in
  // both themes since the parity pass.
  goldOutlineChip: { borderColor: colors.gold },
  // Fills whatever room is left in row 2 next to House Cleaning/TV Mounting —
  // flexShrink keeps it from forcing a wrap to a 3rd row if space is tight,
  // flexGrow claims any leftover space when there's room to spare, so it's
  // always as wide as it can be without ever leaving this row.
  otherChip: { flexGrow: 1, flexShrink: 1, justifyContent: 'center' },
  // home(24): master 44 leaves 22.6pt between the chip rows and this card,
  // against the 20 `sectionGap` gives every section — the 3pt marginTop is
  // that per-section correction, both themes since the parity pass. The 1pt
  // border is part of the box in both; light draws it transparent so only the
  // colours differ.
  heroCard: {
    marginTop: 3,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.forest,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroCardDark: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  // home(25): master 44 leaves 40.9pt between the heading's second cap top
  // and the "Post a job" pill's top edge; gap 12 left 34.6, so 20. Both
  // themes since the parity pass.
  heroBody: { padding: 16, gap: 20 },
  // The copy column's reserve is computed from the drape's own width (home(2))
  // and applied at the call site — one number, both themes.
  heroCopy: { gap: 8 },
  heroEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, color: colors.gold },
  // home(25)'s 19/30 (the master's two-line setting with its own leading), in
  // BOTH themes since the parity pass — light's 25/29 three-line setting is
  // retired, and with it the size gap that grew the wrap. Colour stays
  // per-theme: white on light's forest card, ink on dark's surface card.
  heroHeadline: {
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 30,
    letterSpacing: -0.25,
    fontWeight: '700',
    color: colors.white,
  },
  // home(25), DARK ONLY — 25/27 -> 18/28, and 18 is what puts it on TWO lines.
  //
  // The replaced master sets this heading on TWO lines, not the three the old
  // file drew and this app copied: "Describe the job." / "BRAZOS handles the
  // rest.", the second measuring 232.7pt of ink and ending 251.1pt from the
  // card's left edge, 18pt clear of the B mark's own ink.
  //
  // THE COLUMN WAS TRIED FIRST, as instructed, and it cannot do it. The copy
  // column is 248pt — 319pt of card content less the 71pt reserved from the B
  // drape's own width (home(2)) — and the mark's ink starts 2pt past its right
  // edge, so there is nothing to widen into.
  //
  // WHICH SIZE, then. Georgia sets "BRAZOS handles the rest." at 12.92pt of ink
  // per point of size (323pt at 25, measured in a real 393pt viewport). 19 is
  // the largest that FITS — 245.5pt of 248 — but it ends 4.5pt from the mark,
  // and master 44 leaves 18. 18pt sets 232.6pt against the master's own 232.7:
  // the same line, the same length, ending within 1.5pt of where the master
  // ends it. The line, not the leftover space, is the thing being matched.
  //
  // AND THE MASTER'S CAP AGREES ON THE DIRECTION: its 33px stem is 15.25pt,
  // which is 22pt of Georgia — three points BELOW the 25 this shipped. 18 is
  // four points below that again, and those 4pt are the face: RECORDED, not
  // met, at 2.8pt of cap height. Light keeps 25/29 and is fenced.
  //
  // The leading is the master's own: 60px of line pitch = 27.7pt, so 28.
  //
  // home(25b) — AND THE BREAK IS EXPLICIT, because at 18 the column stopped
  // making it. Two lines is not the same statement as the master's two lines:
  // at 19pt "Describe the job. BRAZOS" measured 248pt and the column forced
  // the break after "job." by accident; at 18 it measures 235 and fits, so the
  // wrap slid one word right and set "Describe the job. BRAZOS" / "handles the
  // rest." A break that depends on a line being exactly too long is not a
  // break, so the copy now carries the master's own, the way the hero headline
  // already does. LIGHT is unmoved by it: at 25pt in the same column the
  // natural wrap already fell after "job." and again after "handles", which is
  // exactly what the explicit break plus one natural wrap produces.
  heroHeadlineDark: { color: colors.ink },
  // No width/height here on purpose: the box is B_DRAPE_WIDTH_RATIO of the
  // screen, measured at render (home(2)) and applied in BOTH themes since the
  // parity pass — light's fixed 79x101 at (12, 10) is retired, which is what
  // makes the B render the same size in both modes. `right` must stay in step
  // with B_DRAPE_RIGHT_INSET, which is what the headline column is reserved
  // from.
  //
  // home(25): top 21, re-measured on the replaced master. The B's ink starts
  // 48px = 22.2pt below the card's OUTER top edge; `top` is measured from the
  // padding box, inside the 1pt border, and the asset has no empty margin above
  // its ink, so 21 puts the ink at 22.
  //
  // RECORDED, not moved: B_DRAPE_WIDTH_RATIO stays 0.277. The new master's mark
  // measures 61.7pt of ink against the 63 this draws — 0.272 by the same
  // arithmetic home(15) used — and the difference is smaller than the
  // measurement's own threshold sensitivity on a downscaled screenshot.
  heroMark: { position: 'absolute', top: 21, right: 0 },
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
  heroButtonDark: { backgroundColor: colors.postPillGreen, borderColor: 'transparent' },
  heroButtonPressed: { opacity: 0.9 },
  heroButtonText: { fontFamily: fonts.display, fontSize: 24, fontWeight: '700', color: colors.onForest },
  heroButtonTextDark: { color: colors.onForest },
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
  section: { gap: 12, marginTop: -6 },
  liveNearbyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  liveNearbyTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  // home(16)/home(26)'s ladder rung (serifSize(30) = 20), in BOTH themes since
  // the parity pass — light's 22 is retired.
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: serifSize(MASTER_SERIF_CAPS.sectionTitle),
    fontWeight: '700',
    color: colors.ink,
  },
  liveIndicator: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveDotHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.homeLiveHalo,
  },
  liveDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.homeLive },
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
  // The 1pt hairline is part of the card box in both themes (parity
  // 2026-08-22); light draws it transparent over its shadow treatment.
  jobCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.card,
  },
  jobCardDark: { borderColor: colors.border },
  jobCardPressed: { opacity: 0.9 },
  jobBody: { flexDirection: 'row' },
  jobThumb: { borderRadius: radius.md, backgroundColor: colors.neutralBg },
  jobThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  jobThumbFallbackDark: { backgroundColor: colors.mint },
  jobMain: { flex: 1, gap: spacing.xs + 2 },
  jobHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  jobTitle: { flex: 1, fontSize: 18, lineHeight: 22, fontWeight: '700', color: colors.ink },
  jobPriceBlock: { alignItems: 'flex-end', maxWidth: 102 },
  jobPriceCaption: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.homeSlate },
  jobPriceCaptionDark: { color: colors.gold },
  jobPrice: { fontFamily: fonts.display, fontSize: 24, fontWeight: '800', color: colors.forest },
  jobPriceDark: { color: colors.emerald },
  jobPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  jobPlace: { flex: 1, fontSize: 14, color: colors.homeSlate },
  jobFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  jobTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  jobInterest: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  jobInterestText: { fontSize: 12, color: colors.homeSlate },
  jobMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  demandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, flexShrink: 1 },
  demandText: { fontSize: 13, fontWeight: '600', color: colors.forest },
  demandTextDark: { color: colors.emerald },
  notice: { gap: spacing.xs },
  noticeError: { fontSize: 14, color: colors.danger },
  retry: { fontSize: 14, fontWeight: '700', color: colors.forest },
  empty: { fontSize: 14, color: colors.homeSlate, lineHeight: 20 },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  skeletonThumb: { width: 104, height: 104, borderRadius: radius.md },
  skeletonText: { flex: 1, gap: spacing.sm },
  skeletonLine: { height: 12 },
  skeletonLineShort: { width: '55%' },
  }),
);
