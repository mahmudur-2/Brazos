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
const B_DRAPE_WIDTH_RATIO = 0.183;
/** Both copies of brazos_b_drape.png (brand and prestige) are 918 x 753. */
const B_DRAPE_ASPECT = 918 / 753;
/**
 * How far the headline column is allowed to run PAST the drape's left edge.
 * The drape is a cut-out whose left side is empty, so a few points of overlap
 * costs nothing and is what the previous fixed pair already did (a 92 box at
 * right: 8 reaches 100 in from the edge; the copy reserved 96).
 */
const B_DRAPE_COPY_OVERLAP = 4;
/** The drape's inset from the card's right edge — see `heroMarkDark`. */
const B_DRAPE_RIGHT_INSET = 8;

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
        Animated.timing(livePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0, duration: 900, useNativeDriver: true }),
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

  function openMap() {
    navigation.getParent()?.navigate('Map');
  }

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
              resizeMode="contain"
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
                  style={({ pressed }) => [styles.modeSwitch, pressed && styles.modeSwitchPressed]}
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
                  {
                    fontSize: design.heroFontSize,
                    lineHeight: Math.round(design.heroFontSize * (45 / 39)),
                  },
                ]}
                maxFontSizeMultiplier={1.25}
              >
                Take a task off your plate.
              </Text>
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                Describe it. Hire help. Get it handled.
              </Text>
            </View>
          </View>

          {/* The shared SearchBar (Prestige 1a): the mic is the REAL voice
              search, rendered only when the on-device boundary is available —
              master 44's contract — replacing the old always-on stub that
              apologised when tapped. The gold sparkle keeps the smart-matching
              mark in the trailing slot. */}
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
                <Ionicons
                  name="sparkles"
                  size={23}
                  color={colors.gold}
                  accessibilityLabel="Smart matching is on"
                />
              </>
            }
          />

          <View style={styles.serviceRows}>
            {HOME_SERVICE_ROWS.map((row, rowIndex) => (
              <View key={`service-row-${rowIndex}`} style={styles.serviceRow}>
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
            <View style={styles.heroBody}>
              <View
                style={[
                  styles.heroCopy,
                  isDark && { paddingRight: bDrape.copyPaddingRight },
                ]}
              >
                <Text style={styles.heroEyebrow}>FASTEST WAY TO START</Text>
                <Text
                  style={[styles.heroHeadline, isDark && styles.heroHeadlineDark]}
                  maxFontSizeMultiplier={1.3}
                >
                  Describe the job. BRAZOS handles the rest.
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

          <View style={styles.section}>
            <View style={styles.liveNearbyHeader}>
              <View style={styles.liveNearbyTitle}>
                <View style={styles.liveIndicator} accessibilityLabel="Live nearby jobs">
                  <Animated.View style={[styles.liveDotHalo, livePulseStyle]} />
                  <View style={styles.liveDot} />
                </View>
                <Text style={styles.sectionTitle}>Live Nearby</Text>
              </View>
              <Pressable
                onPress={openMap}
                style={({ pressed }) => [styles.mapPill, pressed && styles.mapPillPressed]}
                accessibilityRole="button"
                accessibilityLabel="View map"
                accessibilityHint="Opens the map of nearby work"
              >
                <Ionicons name="location" size={17} color={isDark ? colors.emerald : colors.forest} />
                <Text style={[styles.mapPillText, isDark && styles.mapPillTextDark]}>View map</Text>
              </Pressable>
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
            <Text style={[styles.demandText, isDark && styles.demandTextDark]}>
              High demand in your area
            </Text>
          </View>
          <Text style={styles.jobMetaText} numberOfLines={1}>
            {similarToday} similar {similarToday === 1 ? 'job' : 'jobs'} posted today
          </Text>
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
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1.25,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  // Phase 1's tactile answer to the tap — the press state itself, so the
  // feedback lands on touch-down rather than after an animation starts.
  modeSwitchPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  modeSwitchText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  modeSwitchTextDark: { color: colors.emerald },
  headline: {
    maxWidth: '73%',
    fontFamily: fonts.display,
    fontSize: 39,
    lineHeight: 45,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  // The wider Prestige crop takes more of the band, so the headline holds a
  // narrower column in dark — master 44 breaks it after 'off'.
  headlineDark: { maxWidth: '62%' },
  heroSubtitle: {
    maxWidth: '73%',
    marginTop: spacing.sm,
    fontSize: 16,
    fontWeight: '500',
    color: colors.homeSlate,
  },
  homeHeroArt: { position: 'absolute', zIndex: 0, width: 112, height: 124, right: -6, top: 47 },
  // Master 44 gives the Prestige crop more of the headline band than the
  // Heritage brand mark takes; same absolute box the approved composition
  // already uses, dark-specific dimensions.
  homeHeroArtDark: { width: 150, height: 132, right: -10, top: 34 },
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
  searchDivider: { width: 1, height: 32, backgroundColor: colors.border },
  serviceRows: { gap: spacing.sm },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBody: { padding: 16, gap: 12 },
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
  heroHeadlineDark: { color: colors.ink },
  heroMark: { position: 'absolute', top: 12, right: 10, width: 79, height: 101 },
  // No width/height here on purpose: dark's box is B_DRAPE_WIDTH_RATIO of the
  // screen, measured at render (home(2)). `right` must stay in step with
  // B_DRAPE_RIGHT_INSET, which is what the headline column is reserved from.
  heroMarkDark: { top: 16, right: 8 },
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
  liveNearbyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  liveNearbyTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: '700', color: colors.ink },
  liveIndicator: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveDotHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.homeLiveHalo,
  },
  liveDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.homeLive },
  mapPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.homeHairline,
    backgroundColor: colors.surface,
  },
  mapPillPressed: { opacity: 0.82 },
  mapPillText: { fontSize: 14, fontWeight: '600', color: colors.forest },
  mapPillTextDark: { color: colors.emerald },
  viewAll: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  viewAllPressed: { opacity: 0.78 },
  viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  viewAllTextDark: { color: colors.emerald },
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
  jobMetaText: { flexShrink: 1, fontSize: 13, color: colors.homeSlate },
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
