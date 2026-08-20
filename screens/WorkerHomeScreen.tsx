import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { HomeAtmosphere } from '../components/HomeAtmosphere';
import { PulseDot } from '../components/PulseDot';
import { Skeleton } from '../components/Skeleton';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useAuth } from '../hooks/useAuth';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { alertAsync } from '../lib/dialog';
import { openJobsPotential } from '../lib/earningsMath';
import { userMessage } from '../lib/errorMessage';
import { resolveCurrentPlace } from '../lib/geolocation';
import { fetchJobsWithinRadius } from '../lib/hotspots';
import { formatBudget, jobMatchesSkills, type OpenJob } from '../lib/jobs';
import type { WorkerHomeStackNavigation } from '../lib/navigation';
import { updateProfile } from '../lib/profiles';
import { greetingFor } from '../lib/time';
import { useMode } from '../modes';
import {
  fonts,
  layout,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { SearchBar, Toggle } from '../ui/primitives';
import { NEARBY_RADIUS_MILES } from './WorkerResultsScreen';

// Master 43's hero crop. Dark-only by standing decision: light keeps the
// approved full-width Heritage arrangement.
const PRESTIGE_TOOLBOX_ART = require('../assets/prestige/hero_toolbox_worker.png');

const PREVIEW_COUNT = 3;

type NearbyState = 'checking' | 'unavailable' | 'loading' | 'ready';

/**
 * Worker Home (Stage 4D) — the worker tree's initial route.
 *
 * Every job-list intent here lands on WorkerResultsScreen — "View all" is
 * mode 'all', the search field is mode 'search', the two pills are 'skills'
 * and 'nearby' — one list surface, not a chain of them. The search field
 * mirrors the locked screen 48's field and dispatch exactly.
 *
 * Everything here is derived from data sources that already exist:
 *   - greeting + the mandatory-confirm mode switch: useProfile / switchMode()
 *   - availability: the phase53 profiles.accepting_work field, read from the
 *     profile row and written through updateProfile() — the same path
 *     ServicesPricingScreen's toggle uses. The 4D-6 card renders it as the
 *     operator's status copy ("Online"/"Offline", a pulse dot with
 *     "Visible"/"Not Visible") — the WORDS are operator-authored; the FACT
 *     behind them is still the public availability field, never device
 *     presence: nothing here reads or writes useWorkerAvailability.
 *   - potential earnings: lib/earningsMath.ts's openJobsPotential() over the
 *     same open-jobs feed the browse screen renders.
 *   - the two counts: jobMatchesSkills() over the feed for skill matches, and
 *     phase41's jobs_within_radius lookup for the nearby count — the exact
 *     sources the locked screen's own pills use, so a count here can never
 *     disagree with what tapping it opens.
 */
export function WorkerHomeScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // Forest is a near-black deep green in the v2 dark palette, so a forest
  // glyph on a dark surface is invisible paint. Two resolved accents instead:
  // `accent` is the interactive green the masters draw, `glyph` the cream
  // they give the count-pill icons.
  const accent = isDark ? colors.emerald : colors.forest;
  const glyph = isDark ? colors.ink : colors.forest;
  const navigation = useNavigation<WorkerHomeStackNavigation>();
  const { user } = useAuth();
  const { profile, setProfile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const { switchMode, switching } = useMode();
  const [refreshing, setRefreshing] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [query, setQuery] = useState('');

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const accepting = profile?.accepting_work ?? true;

  const myCategories = useMemo(
    () => new Set(profile?.categories ?? []),
    [profile?.categories]
  );
  const hasSkills = myCategories.size > 0;
  const skillMatchCount = useMemo(
    () => jobs.filter((job) => jobMatchesSkills(job, myCategories)).length,
    [jobs, myCategories]
  );

  const potential = useMemo(() => openJobsPotential(jobs, profile?.id), [jobs, profile?.id]);

  // A taste of the feed: skill matches first, then newest — enough to make
  // "View all" worth tapping, not a second marketplace.
  const previewJobs = useMemo(() => {
    const byNewest = (a: OpenJob, b: OpenJob) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return [...jobs]
      .sort((a, b) => {
        const aFits = jobMatchesSkills(a, myCategories) ? 1 : 0;
        const bFits = jobMatchesSkills(b, myCategories) ? 1 : 0;
        return bFits - aFits || byNewest(a, b);
      })
      .slice(0, PREVIEW_COUNT);
  }, [jobs, myCategories]);

  const bidCounts = useBidCounts(useMemo(() => previewJobs.map((j) => j.id), [previewJobs]));

  // Same silent pattern as the locked browse screen: the permission state is
  // CHECKED on mount (never prompted for — getForegroundPermissionsAsync shows
  // no dialog), so opening Home never pops a permission request. Only tapping
  // into the nearby results screen, which calls resolveCurrentPlace(), may.
  const [nearbyState, setNearbyState] = useState<NearbyState>('checking');
  const [nearbyCount, setNearbyCount] = useState(0);
  const [nearbyCoords, setNearbyCoords] = useState<{
    lat: number;
    lng: number;
    label?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!active) return;
      if (status !== 'granted') {
        setNearbyState('unavailable');
        return;
      }
      setNearbyState('loading');
      const here = await resolveCurrentPlace();
      if (!active) return;
      if (!here.ok) {
        setNearbyState('unavailable');
        return;
      }
      const { data } = await fetchJobsWithinRadius(
        here.place.lat,
        here.place.lng,
        NEARBY_RADIUS_MILES
      );
      if (!active) return;
      setNearbyCoords({ lat: here.place.lat, lng: here.place.lng, label: here.place.label });
      setNearbyCount(data.length);
      setNearbyState('ready');
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function switchToCustomer() {
    // The one authoritative switch — its confirmation is mandatory and lives
    // inside switchMode() itself (modes/ModeProvider.tsx).
    void switchMode('customer');
  }

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigation.navigate('WorkerResults', { mode: 'search', query: trimmed });
  }

  async function saveAcceptingWork(next: boolean) {
    if (!user || savingAvailability) return;
    setSavingAvailability(true);
    const { data, error: saveError } = await updateProfile(user.id, { accepting_work: next });
    setSavingAvailability(false);
    if (saveError) {
      await alertAsync('Could not save availability', userMessage(saveError));
      return;
    }
    if (data) setProfile(data);
  }

  const matchLabel = hasSkills
    ? `${skillMatchCount} match your skills`
    : 'Add skills to see matches';
  const nearbyLabel =
    nearbyState === 'ready'
      ? `${nearbyCount} within ${NEARBY_RADIUS_MILES} miles`
      : nearbyState === 'unavailable'
        ? 'Enable location'
        : `Within ${NEARBY_RADIUS_MILES} miles`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* home(4): a fixed layer, OUTSIDE the scroller, so the page slides over
          it instead of carrying it. Dark only; renders nothing in light. The
          ScrollView below paints no ground of its own, so nothing covers it. */}
      <HomeAtmosphere />
      {/* Standard input mechanics (.claude/rules/native-ui.md) for the search
          field below — nothing visual, and the field sits at the top so the
          keyboard can never cover it or its submit affordance. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={accent}
              colors={[accent]}
            />
          }
        >
          {/* --- Greeting + the deliberate mode switch ---------------------- */}
          <View style={styles.greetingRow}>
            <View style={styles.greetingBlock}>
              {/* Master 43 stacks the greeting: the salutation muted, the name
                  on its own line carrying the gold. Light keeps one line in
                  the Heritage muted tone. */}
              <Text style={styles.greeting} numberOfLines={1}>
                {greetingFor(new Date())}
                {firstName ? ',' : ''}
              </Text>
              {firstName ? (
                <Text
                  style={[styles.greeting, isDark && styles.greetingName]}
                  numberOfLines={1}
                >
                  {firstName}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={switchToCustomer}
              disabled={switching}
              style={({ pressed }) => [styles.modeSwitch, pressed && styles.modeSwitchPressed]}
              accessibilityRole="button"
              accessibilityLabel="Switch to Customer"
              accessibilityHint="Returns to posting and managing your own jobs"
              accessibilityState={{ disabled: switching }}
            >
              <Ionicons name="person" size={19} color={accent} />
              <Text style={[styles.modeSwitchText, isDark && styles.modeSwitchTextDark]}>
                Switch to Customer
              </Text>
            </Pressable>
          </View>

          {/* --- The hero (master 43): serif headline with the second
              sentence on the palette's GREEN accent, subtitle beneath, and —
              under the dark palette only — the toolbox artwork beside it,
              mounted the same way master 44's armchair is. Light keeps the
              full-width Heritage block; the crop is a dark-only asset. --- */}
          <View style={styles.heroBlock}>
            {isDark ? (
              <Image
                source={PRESTIGE_TOOLBOX_ART}
                style={styles.heroArt}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            ) : null}
            <View style={[styles.heroCopy, isDark && styles.heroCopyDark]}>
              <Text style={styles.heroHeadline} maxFontSizeMultiplier={1.25}>
                Get hired.{'\n'}
                <Text style={styles.heroHeadlineAccent}>Get paid.</Text>
              </Text>
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                Grow your reputation.
              </Text>
            </View>
          </View>

          {/* --- Search (mirrors the locked 48's field — the one route to
              WorkerResults mode 'search'). The shared SearchBar carries the
              input (and the mic where the device supports it); the locked
              twin renders no clear control, so disableClear keeps the
              mirror, and its divider + arrow submit stays verbatim. ------- */}
          <SearchBar
            style={styles.searchField}
            value={query}
            onChangeText={setQuery}
            onSubmit={submitSearch}
            placeholder="Search for jobs or areas"
            autoCapitalize="sentences"
            autoCorrect
            disableClear
            trailing={
              <>
                <View style={styles.searchDivider} />
                <Pressable
                  onPress={submitSearch}
                  hitSlop={10}
                  style={({ pressed }) => [styles.searchGo, pressed && styles.searchGoPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Search"
                >
                  {/* Master 43's inset submit is a SOLID green disc — one of
                      the three conversion fills in the whole set (decision 3)
                      — with the background colour cut out of it as the
                      arrow. Light keeps the Heritage forest disc. */}
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={isDark ? colors.background : colors.onForest}
                  />
                </Pressable>
              </>
            }
          />

          {/* --- The summary card (4D-6, operator spec — the ONE card where
              the mockup is a pixel target): a surface container with a gold
              hairline border, never a forest fill (the e195012 ClientJobDetail
              construction: under Prestige forest IS the gold primary, so
              gold-family text on a forest fill goes invisible in dark). Two
              rows: eyebrowed availability | earnings columns split by a
              divider, then the two count pills. The status copy ("Online"/
              "Offline", "Visible"/"Not Visible") is operator-authored — it
              renders the same phase53 accepting_work fact through the same
              toggle; nothing here is device presence. -------------------- */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.availabilityHalf}>
                <Text style={styles.summaryEyebrow}>AVAILABLE NOW</Text>
                <View style={styles.statusRow}>
                  {/* 30pt is the spec; auto-fit lets the word fall as far as
                      the 26pt continue-path floor (0.87 × 30) before anything
                      could clip on the narrowest supported width. */}
                  <Text
                    style={styles.statusWord}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.87}
                    maxFontSizeMultiplier={1.2}
                  >
                    {accepting ? 'Online' : 'Offline'}
                  </Text>
                  <Toggle
                    value={accepting}
                    onValueChange={(value) => void saveAcceptingWork(value)}
                    disabled={savingAvailability || !profile}
                    accessibilityLabel="Taking new work"
                  />
                </View>
                <View style={styles.statusDotRow}>
                  <PulseDot color={accepting ? colors.emerald : colors.danger} />
                  {/* Master 43 spells the consequence out rather than
                      abbreviating it; the PNG is the authority over the
                      earlier two-word draft. Same accepting_work fact. */}
                  <Text style={styles.statusCaption} numberOfLines={1}>
                    {accepting ? 'Visible to customers' : 'Not visible to customers'}
                  </Text>
                </View>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.earningsHalf}>
                <Text style={styles.summaryEyebrow}>POTENTIAL EARNINGS</Text>
                {loading ? (
                  <>
                    {/* The figures wait for the feed, exactly as the old
                        card's loading gate did — a pulse, never a fake $0. */}
                    <Skeleton style={styles.earningsAmountLoading} />
                    <Skeleton style={styles.earningsCaptionLoading} />
                  </>
                ) : (
                  <>
                    <Text
                      style={styles.earningsAmount}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.87}
                      maxFontSizeMultiplier={1.2}
                    >
                      {potential.count === 0 ? '$0' : formatBudget(potential.cents)}
                    </Text>
                    <Text style={styles.earningsCaption}>
                      {`across ${potential.count} ${potential.count === 1 ? 'job' : 'jobs'}`}
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View style={styles.pillRow}>
              <Pressable
                onPress={() => navigation.navigate('WorkerResults', { mode: 'skills' })}
                // 40pt visual height is the spec; the slop keeps the 44pt
                // touch floor.
                hitSlop={{ top: 2, bottom: 2 }}
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                accessibilityRole="button"
                accessibilityLabel={matchLabel}
              >
                <Ionicons name="sparkles-outline" size={16} color={glyph} />
                <Text style={styles.pillText} numberOfLines={1}>
                  {hasSkills ? (
                    <>
                      <Text style={styles.pillCount}>{skillMatchCount}</Text>
                      {' match your skills'}
                    </>
                  ) : (
                    matchLabel
                  )}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  navigation.navigate('WorkerResults', {
                    mode: 'nearby',
                    lat: nearbyCoords?.lat,
                    lng: nearbyCoords?.lng,
                    label: nearbyCoords?.label,
                  })
                }
                hitSlop={{ top: 2, bottom: 2 }}
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                accessibilityRole="button"
                accessibilityLabel={nearbyLabel}
              >
                <Ionicons name="location-outline" size={16} color={glyph} />
                <Text style={styles.pillText} numberOfLines={1}>
                  {nearbyState === 'ready' ? (
                    <>
                      <Text style={styles.pillCount}>{nearbyCount}</Text>
                      {` within ${NEARBY_RADIUS_MILES} miles`}
                    </>
                  ) : (
                    nearbyLabel
                  )}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* --- A taste of the open-jobs feed ------------------------------ */}
          <View style={styles.feedHeader}>
            <View style={styles.feedTitleRow}>
              <View style={styles.feedDot} />
              <Text style={styles.sectionTitle}>Available Jobs</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('WorkerResults', { mode: 'all' })}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
              accessibilityRole="button"
              accessibilityLabel="View all open jobs"
            >
              <Text style={[styles.viewAllText, isDark && styles.viewAllTextDark]}>View all</Text>
              <Ionicons name="chevron-forward" size={18} color={accent} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.cardList}>
              <WorkerJobCardSkeleton />
              <WorkerJobCardSkeleton />
            </View>
          ) : error ? (
            <View style={styles.notice}>
              <Text style={styles.noticeError}>Couldn’t load open jobs.</Text>
              <Pressable onPress={() => void onRefresh()} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.retry, isDark && styles.retryDark]}>Try again</Text>
              </Pressable>
            </View>
          ) : previewJobs.length === 0 ? (
            <Text style={styles.empty}>
              No open jobs right now — new jobs appear here automatically as clients post them.
            </Text>
          ) : (
            <View style={styles.cardList}>
              {previewJobs.map((job) => (
                <WorkerJobCard
                  key={job.id}
                  job={job}
                  bidCount={bidCounts[job.id]}
                  onPress={() => navigation.navigate('JobDetail', { job })}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // MainTabs already reserves the safe tab-bar height. Adding another
    // bottom inset here creates a visible dead strip above that bar.
    paddingBottom: 0,
    gap: spacing.lg,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  greetingBlock: { flexShrink: 1, gap: 2 },
  greeting: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  greetingName: { color: colors.gold },
  // The customer Home headline treatment, mirrored token for token (serif
  // display face, 39/45, -0.3 tracking, ink). heroBlock is the positioning
  // context for the dark-only toolbox crop; heroCopy holds the rhythm.
  heroBlock: {},
  heroCopy: { gap: spacing.sm },
  heroHeadline: {
    fontFamily: fonts.display,
    fontSize: 39,
    lineHeight: 45,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  heroHeadlineAccent: { color: colors.emerald },
  heroSubtitle: { fontSize: 16, fontWeight: '500', color: colors.homeSlate },
  // Master 43 holds the headline in a narrow column beside the toolbox; the
  // Prestige crop is dark-only, so light keeps the full-width block.
  heroCopyDark: { maxWidth: '58%' },
  heroArt: { position: 'absolute', zIndex: 0, right: -10, top: 18, width: 162, height: 108 },
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
  modeSwitchPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  modeSwitchText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  modeSwitchTextDark: { color: colors.emerald },
  // The locked 48's searchField/searchDivider, value for value — laid over
  // the shared SearchBar's own field so the mirror's geometry wins; the
  // input styling inside now rides SearchBar itself.
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 63,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  searchDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.border,
  },
  // Master 43's inset submit disc: 32pt drawn, the 44pt floor met by the
  // Pressable's hitSlop rather than by growing the pill.
  searchGo: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.emerald,
  },
  searchGoPressed: { opacity: 0.85 },
  // ONE container, surface-filled with a GOLD hairline — never a forest
  // fill: under Prestige forest is the gold primary, and gold-family text on
  // it disappears (the defect e195012 repaired on ClientJobDetail's hero).
  // Geometry is the 4D-6 operator spec: §I card padding 14 (layout token),
  // row 2 sits 14pt below row 1, both columns share one 6pt vertical rhythm.
  summaryCard: {
    padding: layout.cardPadding,
    gap: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  summaryRow: { flexDirection: 'row' },
  availabilityHalf: { flex: 1, gap: 6 },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 14,
    backgroundColor: colors.border,
  },
  earningsHalf: { flex: 1, gap: 6 },
  // One eyebrow style for both columns — the shared rhythm is the point.
  summaryEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.gold,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusWord: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
  },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusCaption: { fontSize: 13, color: colors.textMuted },
  // The figure reads in the GREEN accent on surface in both palettes —
  // emerald, not forest (gold in dark) and not white (white-on-gold was the
  // live dark defect this card shipped with).
  earningsAmount: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '700',
    color: colors.emerald,
  },
  earningsCaption: { fontSize: 13, color: colors.textMuted },
  earningsAmountLoading: { height: 34, width: 96, borderRadius: radius.sm },
  earningsCaptionLoading: { height: 14, width: 80, borderRadius: radius.sm },
  pillRow: { flexDirection: 'row', gap: spacing.md },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  pillPressed: { opacity: 0.82 },
  pillText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.ink },
  pillCount: { color: colors.emerald },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  feedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  // The section heading's status dot (mockup 43) marks the live jobs FEED —
  // distinct from the summary card's availability dot above, which tracks
  // the worker's own accepting_work state.
  feedDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.emerald },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: '800', color: colors.ink },
  viewAll: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  viewAllPressed: { opacity: 0.78 },
  viewAllText: { fontSize: 15, fontWeight: '600', color: colors.forest },
  viewAllTextDark: { color: colors.emerald },
  cardList: { gap: spacing.md },
  notice: { gap: spacing.xs },
  noticeError: { fontSize: 14, color: colors.danger },
  retry: { fontSize: 14, fontWeight: '700', color: colors.forest },
  retryDark: { color: colors.emerald },
  empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  }),
);
