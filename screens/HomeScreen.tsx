import { useEffect, useMemo, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '../components/Chip';
import { HomeAtmosphere } from '../components/HomeAtmosphere';
import { ServicePickerSheet } from '../components/ServicePickerSheet';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  categoryAccent,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { HOME_QUICK_SERVICES, MORE_SERVICES } from '../lib/skillCategories';
import { greetingFor } from '../lib/time';
import type { CustomerHomeStackNavigation } from '../lib/navigation';
import { useMode } from '../modes';
import { useHomeDesignSettings } from '../lib/homeDesignStudio';
import {
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { SearchBar } from '../ui/primitives';
import { USE_NATIVE_DRIVER } from '../lib/motion';

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
const HOME_HERO_ART = require('../assets/brand/customer-home-chair.png');
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
const PRESTIGE_HERO_ART = require('../assets/prestige/hero_armchair_customer.png');
const PRESTIGE_B_DRAPE = require('../assets/prestige/brazos_b_drape.png');
const PREVIEW_COUNT = 4;
const HOME_SERVICE_ROWS = [HOME_QUICK_SERVICES.slice(0, 2), HOME_QUICK_SERVICES.slice(2, 4)];

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
            { paddingHorizontal: design.screenPadding, gap: design.sectionGap },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.intro}>
            <Image
              source={isDark ? PRESTIGE_HERO_ART : HOME_HERO_ART}
              style={[styles.homeHeroArt, isDark && styles.homeHeroArtDark]}
              // home(14): dark's hero is a SLOT, and a slot fills. `cover`
              // scales whatever is dropped in until both dimensions are
              // covered and crops the remainder, so a room-baked scene reaches
              // the screen edge instead of sitting inside its own margins.
              // Light keeps `contain` and the Heritage crop, untouched.
              resizeMode={isDark ? 'cover' : 'contain'}
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
                    // Master 44: the name line carries the gold; light keeps
                    // the Heritage slate.
                    <Text
                      style={[styles.greeting, isDark && styles.greetingName]}
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
                  isDark && styles.headlineDark,
                  // home(16b): the studio's live size is a DARK instrument. It
                  // used to apply to both themes, which meant home(16)'s ladder
                  // — measured off a dark master — silently retyped the frozen
                  // Heritage composition as well. `styles.headline` keeps
                  // light's 39/45.
                  isDark && {
                    maxWidth: headlineColumn,
                    fontSize: design.heroFontSize,
                    lineHeight: Math.round(design.heroFontSize * HEADLINE_LEADING),
                  },
                ]}
                maxFontSizeMultiplier={1.25}
              >
                Take a task{'\n'}off your plate.
              </Text>
              <Text
                style={[styles.heroSubtitle, isDark && styles.heroSubtitleDark]}
                maxFontSizeMultiplier={1.3}
              >
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
              isDark && styles.searchFieldDark,
              { minHeight: design.searchHeight, borderRadius: design.searchRadius },
            ]}
            trailing={
              <>
                <View style={styles.searchDivider} />
                <Ionicons
                  name="arrow-forward"
                  size={23}
                  color={colors.gold}
                  accessibilityLabel="Search"
                />
              </>
            }
          />

          <View style={[styles.serviceRows, isDark && styles.serviceRowsDark]}>
            {HOME_SERVICE_ROWS.map((row, rowIndex) => (
              <View
                key={`service-row-${rowIndex}`}
                style={[styles.serviceRow, isDark && styles.serviceRowDark]}
              >
                {row.map((service) => (
                  <Chip
                    key={service.label}
                    label={service.label}
                    icon={service.icon}
                    variant="service"
                    style={[
                      // Dark wears the Chip's own sage treatment (master 44);
                      // light keeps the Heritage gold outline.
                      !isDark && styles.goldOutlineChip,
                      rowIndex === 1 && styles.compactServiceChip,
                      isDark && (rowIndex === 1 ? styles.compactChipDark : styles.serviceChipDark),
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
                      isDark && styles.compactChipDark,
                      styles.otherChip,
                    ]}
                    onPress={() => setMoreOpen(true)}
                    accessibilityLabel="Other services"
                    accessibilityHint="Opens the full list of services"
                  />
                ) : null}
              </View>
            ))}
          </View>

          {/* Master 44's promo card: dark is a hairlined surface card with the
              gold B drape and the screen's ONE solid-forest conversion pill
              (decision 3); light keeps the Heritage forest card with its white
              button and brand mark. */}
          <View style={[styles.heroCard, isDark && styles.heroCardDark]}>
            <View style={[styles.heroBody, isDark && styles.heroBodyDark]}>
              <View
                style={[
                  styles.heroCopy,
                  isDark && { paddingRight: bDrape.copyPaddingRight, gap: 8 },
                ]}
              >
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
                  pressed && styles.heroButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Post a job"
              >
                <Text style={[styles.heroButtonText, isDark && styles.heroButtonTextDark]}>
                  {isDark ? 'Post a job ›' : 'Post a job'}
                </Text>
              </Pressable>
            </View>
            <Image
              source={isDark ? PRESTIGE_B_DRAPE : POST_MARK}
              style={[styles.heroMark, isDark && styles.heroMarkDark, isDark && bDrape.art]}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>

          <View style={[styles.section, isDark && styles.sectionDark]}>
            <View style={styles.liveNearbyHeader}>
              <View style={styles.liveNearbyTitle}>
                <View style={styles.liveIndicator} accessibilityLabel="Live nearby jobs">
                  <Animated.View style={[styles.liveDotHalo, livePulseStyle]} />
                  <View style={styles.liveDot} />
                </View>
                <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                  Live Nearby
                </Text>
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
                <View style={styles.skeletonCard}>
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
                {preview.map((job) => (
                  <OpenJobCard
                    key={job.id}
                    job={job}
                    isOwn={!!user && user.id === job.client_id}
                    bidCount={bidCounts[job.id]}
                    similarToday={similarPostedToday(jobs, job)}
                    onPress={browseOpenJobs}
                  />
                ))}
              </View>
            )}
          </View>
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
        { borderRadius: design.jobCardRadius },
        pressed && styles.jobCardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={job.title}
    >
      <View style={styles.jobBody}>
        {showThumb ? (
          <Image
            source={{ uri: thumbUrl }}
            style={styles.jobThumb}
            resizeMode="cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          // Masters (12/44): the no-photo tile is the deep-green tile with the
          // gold category glyph in dark; light keeps the category accents.
          <View
            style={[
              styles.jobThumb,
              styles.jobThumbFallback,
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
        <View style={styles.jobMeta}>
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
  modeSwitch: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1.25,
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
  modeSwitchDark: { borderWidth: 1, borderColor: colors.homeModeRing },
  // Phase 1's tactile answer to the tap — the press state itself, so the
  // feedback lands on touch-down rather than after an animation starts.
  modeSwitchPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  modeSwitchText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  // home(26), DARK ONLY: 15 -> 13, off the sans ladder. That 2pt is the whole
  // of the pill's width problem — the label is the only elastic term in it, and
  // it took the box from 171pt to 155.5 against the master's measured 156.2.
  modeSwitchTextDark: {
    color: colors.emerald,
    fontSize: sansSize(MASTER_SANS_CAPS.switchLabel),
  },
  headline: {
    maxWidth: '73%',
    fontFamily: fonts.display,
    fontSize: 39,
    lineHeight: 45,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  // home(23) — THE GAP ABOVE THE HEADLINE IS REAL SPACING.
  //
  // marginTop 30, not 15. Master 44 puts the headline's cap top at 95.0pt below
  // the content box's top; the flow above it (the greeting/switch row at 50pt,
  // then introCopy's 8pt gap) plus this face's own line box put the cap 8.4pt
  // into the block, so 58 + 30 + 8.4 = 96.4 against the master's 95.0. No
  // transform: the subtitle and everything under it move WITH it rather than
  // having the headline slide over them.
  //
  // No `maxWidth` here on purpose — the operator's 74% was 261pt of column,
  // which is 17pt past where the hero's ink starts. The dark column is computed
  // from the artwork at the call site (`headlineColumn`), because a share of
  // the screen and a share of the artwork are two different fractions and only
  // one of them ends where the picture does.
  headlineDark: { marginTop: 30 },
  heroSubtitle: {
    maxWidth: '73%',
    marginTop: spacing.sm,
    fontSize: 16,
    fontWeight: '500',
    color: colors.homeSlate,
  },
  // home(23), DARK ONLY — 16 -> 14, and that is what puts it on ONE line.
  //
  // Master 44 sets "Describe it. Hire help. Get it handled." on one line, 208pt
  // wide, on a 21px = 9.70pt cap. This app was setting it on TWO, because the
  // platform sans needs 265pt at 16pt against a 73% (258pt) column. 14pt is the
  // master's own cap to within 0.7% (9.63 against 9.70) AND sets 232pt, which
  // clears the column by 26pt. The 2pt of extra marginTop is the master's Y:
  // its cap top is 187.8pt below the content top and 8 would land at 185.3.
  // Light keeps 16/8 — the Heritage composition is frozen.
  heroSubtitleDark: { fontSize: 14, marginTop: 10 },
  homeHeroArt: { position: 'absolute', zIndex: 0, width: 112, height: 124, right: -6, top: 47 },
  // home(23) — THE HERO IS A SLOT, AND THESE ARE THE NEW MASTER'S OWN NUMBERS.
  //
  // Re-measured on the REPLACED docs/mockups/44_customer_home_dark.png
  // (853x1844). home(14)'s 151 x 135 at right: 0 came off the old 941x1672 file
  // and is void.
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
  homeHeroArtDark: {
    width: HERO_ART_DARK.width,
    height: HERO_ART_DARK.height,
    right: HERO_ART_DARK.right,
    top: HERO_ART_DARK.top,
  },
  // Laid over the shared SearchBar so the reference geometry wins; the input,
  // clear control and (when available) the voice mic ride SearchBar itself.
  searchField: {
    gap: spacing.md,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.homeHairline,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  // home(24), DARK ONLY: the search control's Y, and nothing else about it.
  //
  // Master 44 puts its top 237.0pt below the content box's top; the hero block
  // above it leaves the field at 229. The 8pt is a REAL gap on this one
  // section, not a change to `sectionGap`: a global gap moves five sections to
  // fix one, and the master's own gaps are five different numbers.
  //
  // RECORDED, NOT MET: the master's field is 67.0pt tall and this one is 70.
  // `design.searchHeight` is the studio's live control and LIGHT reads the same
  // value, and light geometry is frozen — so the 3pt (4.5%) stays a difference
  // rather than becoming a dark-only second source for one control's height.
  searchFieldDark: { marginTop: 8 },
  searchDivider: { width: 1, height: 32, backgroundColor: colors.border },
  serviceRows: { gap: spacing.sm },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  // home(24) — WHAT PUTS THE CHIPS ON TWO ROWS, which is the whole point.
  //
  // Master 44 draws five pills on two rows; this app drew six-across-three,
  // with "Other" alone on a row of its own. Row 2 needed 360pt of a 353pt
  // content width — over by 7 — so nothing about the wrap was subtle.
  //
  // The lever is the PILL's horizontal padding, and only in dark. The master's
  // own padding is LARGER than this app's (17.5pt on row 1, ~14 on row 2), and
  // its pills are still narrower, because its label face is narrower than the
  // platform sans at 14pt. That label lives in components/Chip.tsx and is
  // shared by every chip in the app, so it is not Home's to move; the padding
  // is. What the numbers below buy, measured:
  //
  //   row 1   Furniture Assembly 172 -> 168  (master 167.7)
  //           Moving Help        133 -> 129  (master 126.7)
  //   row 2   House Cleaning     142 -> 138  (master 137.3)
  //           TV Mounting        126 -> 122  (master 120.7)
  //           Other               76 ->  81  (master  84.8, grown by flexGrow
  //                                           into what the row has left)
  //
  // and the row gap goes to the master's own 6.4pt rather than spacing.sm's 8.
  // Row 2 then totals 347 of 353. Light keeps 14/10 and the 8pt gaps.
  serviceRowsDark: { gap: 10 },
  serviceRowDark: { gap: 6 },
  serviceChipDark: { paddingHorizontal: 12 },
  compactChipDark: { paddingHorizontal: 8 },
  // Same gold hairline as the "Switch to Worker" pill above, so the quick-
  // service row reads as part of the same control family (light only — dark
  // wears the Chip's sage treatment).
  goldOutlineChip: { borderWidth: 1.25, borderColor: colors.gold },
  compactServiceChip: { paddingHorizontal: 10 },
  // Fills whatever room is left in row 2 next to House Cleaning/TV Mounting —
  // flexShrink keeps it from forcing a wrap to a 3rd row if space is tight,
  // flexGrow claims any leftover space when there's room to spare, so it's
  // always as wide as it can be without ever leaving this row.
  otherChip: { flexGrow: 1, flexShrink: 1, justifyContent: 'center' },
  heroCard: {
    borderRadius: 22,
    backgroundColor: colors.forest,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroCardDark: {
    // home(24): master 44 leaves 22.6pt between the chip rows and this card,
    // against the 20 `sectionGap` gives every section. Per-section, dark-only,
    // for the reason on `searchFieldDark`.
    marginTop: 3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBody: { padding: 16, gap: 12 },
  // home(25), DARK ONLY. Master 44 leaves 40.9pt between the heading's second
  // cap top and the "Post a job" pill's top edge; 12 leaves 34.6. The 8pt goes
  // here rather than into the heading's leading, because the leading is the
  // master's own measured line pitch and this gap is not.
  heroBodyDark: { gap: 20 },
  // Light keeps its fixed reserve for the fixed Heritage mark; dark's is
  // computed from the drape's own width (home(2)) and applied at the call
  // site, so the two numbers cannot drift apart.
  heroCopy: { gap: 4, paddingRight: 68 },
  heroEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, color: colors.gold },
  heroHeadline: {
    fontFamily: fonts.display,
    fontSize: 25,
    lineHeight: 29,
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
  heroHeadlineDark: { color: colors.ink, fontSize: 19, lineHeight: 30 },
  heroMark: { position: 'absolute', top: 12, right: 10, width: 79, height: 101 },
  // No width/height here on purpose: dark's box is B_DRAPE_WIDTH_RATIO of the
  // screen, measured at render (home(2)). `right` must stay in step with
  // B_DRAPE_RIGHT_INSET, which is what the headline column is reserved from.
  //
  // home(25): 25 -> 21, re-measured on the replaced master. The B's ink starts
  // 48px = 22.2pt below the card's OUTER top edge; `top` is measured from the
  // padding box, inside the 1pt border, and the asset has no empty margin above
  // its ink, so 21 puts the ink at 22.
  //
  // RECORDED, not moved: B_DRAPE_WIDTH_RATIO stays 0.277. The new master's mark
  // measures 61.7pt of ink against the 63 this draws — 0.272 by the same
  // arithmetic home(15) used — and the difference is smaller than the
  // measurement's own threshold sensitivity on a downscaled screenshot.
  heroMarkDark: { top: 21, right: 0 },
  heroButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroButtonDark: { backgroundColor: colors.forest, borderWidth: 1, borderColor: colors.mint2 },
  heroButtonPressed: { opacity: 0.9 },
  heroButtonText: { fontFamily: fonts.display, fontSize: 24, fontWeight: '700', color: colors.forest },
  heroButtonTextDark: { color: colors.onForest },
  section: { gap: 12 },
  // home(26), DARK ONLY — a NEGATIVE margin, and it is honest.
  //
  // Master 44 leaves 28.4pt between the promo card's bottom edge and the "L" of
  // Live Nearby. This app leaves 34: `sectionGap` gives 20, and the header row
  // adds 14 more before the cap, because `viewAll` holds it 44pt tall for the
  // touch floor and the title is centred in that. The gap the eye reads is the
  // one to the INK, so the layout gap has to be 14.2 for the ink gap to be
  // 28.4. -6 is that difference; there is no smaller lever, because the 44 is
  // CLAUDE.md's and the 20 is the studio's one global number.
  sectionDark: { marginTop: -6 },
  liveNearbyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  liveNearbyTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: '700', color: colors.ink },
  // home(16), D10, DARK ONLY: 22 -> serifSize(26) = 16. Master 44's "Live
  // Nearby" measures a 26px cap, which is 15.7pt of Georgia; 22 was the one
  // rung out by more than a rounding. Light keeps 22 — 44 is a DARK master and
  // the Heritage composition is frozen (home(16b)).
  sectionTitleDark: { fontSize: serifSize(MASTER_SERIF_CAPS.sectionTitle) },
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
  viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  // home(26), DARK ONLY: 15 -> 14, off the same sans ladder as the mode switch.
  // Master 44's V measures a 21px stem = 9.70pt of cap; 15pt draws 11.
  viewAllTextDark: {
    color: colors.emerald,
    fontSize: sansSize(MASTER_SANS_CAPS.viewAll),
  },
  cardList: { gap: spacing.md },
  jobCard: { borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', ...shadows.card },
  jobCardDark: { borderWidth: 1, borderColor: colors.border },
  jobCardPressed: { opacity: 0.9 },
  jobBody: { flexDirection: 'row', gap: spacing.md, padding: 14 },
  jobThumb: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.neutralBg },
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
    paddingVertical: 10,
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
