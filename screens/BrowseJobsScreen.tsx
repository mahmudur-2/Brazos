import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { FadeIn } from '../components/FadeIn';
import { useModeTransition } from '../components/ModeTransitionOverlay';
import { PulseDot } from '../components/PulseDot';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { useWorkerAvailability } from '../hooks/useWorkerAvailability';
import { resolveCurrentPlace } from '../lib/geolocation';
import { cellsWithinMiles, fetchHotspots } from '../lib/hotspots';
import { formatBudget, jobMatchesSkills, type OpenJob } from '../lib/jobs';
import { greetingFor } from '../lib/time';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, fonts, radius, shadows, spacing } from '../lib/theme';
import { NEARBY_RADIUS_MILES } from './WorkerResultsScreen';

// Cropped directly out of design-reference/48_worker_home.png (the circular
// backdrop + toolbox + leaf, background keyed to transparent) rather than
// approximated with icons — no toolbox artwork exists anywhere else in the
// project's assets.
const WORKER_HOME_TOOLBOX = require('../assets/brand/worker-home-toolbox.png');
/** height / width of worker-home-toolbox.png (395x320), for aspectRatio. */
const TOOLBOX_ASPECT_RATIO = 320 / 395;
const TOOLBOX_WIDTH = 132;

// The same bright green Customer Home's "Live Nearby" indicator uses
// (HomeScreen.tsx's liveDot) — one shared "this is live" green.
const AVAILABILITY_ONLINE_COLOR = '#0DBC5A';
const PREVIEW_COUNT = 4;

type NearbyState = 'checking' | 'unavailable' | 'loading' | 'ready';

function startOfComparableJobs(jobs: OpenJob[], categories: Set<string>): OpenJob[] {
  const byNewest = (a: OpenJob, b: OpenJob) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  return [...jobs].sort((a, b) => {
    const aFits = jobMatchesSkills(a, categories) ? 1 : 0;
    const bFits = jobMatchesSkills(b, categories) ? 1 : 0;
    return bFits - aFits || byNewest(a, b);
  });
}

/**
 * Worker Home — the Emerald atlas's screen 48, "Find jobs".
 *
 * Header, hero, search, the availability/earnings card, and a compact
 * preview of the open-jobs feed, close to design-reference/48_worker_home.png.
 * "View all", both filter pills, and the search bar all hand off to
 * WorkerResultsScreen with a different `mode` rather than duplicating list/
 * filter logic four times — see that screen for the skill-match and
 * nearby-jobs implementation, which this screen's own pill counts reuse
 * exactly (lib/jobs.ts's jobMatchesSkills, lib/hotspots.ts's cell-radius
 * lookup) so a count here can never disagree with what tapping it shows.
 *
 * Reference elements NOT rendered, because nothing backs them:
 *   - "X fit your schedule" — no schedule/calendar data exists on a job or a
 *     profile.
 *   - A favorite/heart toggle on each card — there is no saved-jobs table.
 */
export function BrowseJobsScreen() {
  const navigation = useNavigation<HomeStackNavigation>();
  const { profile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const { start: startModeSwitch, busy: switching } = useModeTransition();
  const { availability, setAvailability } = useWorkerAvailability();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  // One batched read for the whole page — see phase38 for why a per-card count
  // is neither correct (RLS under-counts) nor affordable (N+1).
  const bidCounts = useBidCounts(useMemo(() => jobs.map((j) => j.id), [jobs]));

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  /** What this worker advertises. Drives the skill-match pill and preview
   *  ordering — the same predicate WorkerResultsScreen's "skills" mode uses,
   *  so the count here can never disagree with what tapping it shows. */
  const myCategories = useMemo(
    () => new Set(profile?.categories ?? []),
    [profile?.categories]
  );
  const hasSkills = myCategories.size > 0;
  const skillMatchCount = useMemo(
    () => jobs.filter((job) => jobMatchesSkills(job, myCategories)).length,
    [jobs, myCategories]
  );

  const stats = useMemo(() => {
    let cents = 0;
    for (const job of jobs) cents += job.budget_cents ?? 0;
    return { cents, count: jobs.length };
  }, [jobs]);

  // Home shows a taste of the feed, not the whole marketplace — "View all"
  // is the real full list (WorkerResultsScreen, mode "all").
  const previewJobs = useMemo(
    () => startOfComparableJobs(jobs, myCategories).slice(0, PREVIEW_COUNT),
    [jobs, myCategories]
  );

  // "Within 5 miles" needs the worker's real position. Checked silently on
  // mount (getForegroundPermissionsAsync never prompts) so Home never pops a
  // permission dialog just for being opened — only an explicit tap into the
  // nearby results screen (which calls resolveCurrentPlace and may prompt)
  // does that. Coordinates are carried into that navigation so the results
  // screen filters the exact same center point rather than re-resolving GPS
  // and risking a different cell set.
  const [nearbyState, setNearbyState] = useState<NearbyState>('checking');
  const [nearbyCount, setNearbyCount] = useState(0);
  const [nearbyCoords, setNearbyCoords] = useState<{ lat: number; lng: number; label?: string } | null>(
    null
  );

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
      const { data: cells } = await fetchHotspots();
      if (!active) return;
      const near = cellsWithinMiles(cells, here.place.lat, here.place.lng, NEARBY_RADIUS_MILES);
      setNearbyCoords({ lat: here.place.lat, lng: here.place.lng, label: here.place.label });
      setNearbyCount(near.reduce((sum, cell) => sum + cell.job_count, 0));
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

  // Worker Home is pushed above Customer Home in this same stack, so the
  // return trip is a pop — Customer Home is already mounted underneath and
  // keeps its scroll position and loaded feed. Runs under the emerald panel.
  // Availability is untouched by this — it is a separate, local preference.
  function switchToCustomer() {
    startModeSwitch({
      destination: 'customer',
      onSwitch: () => navigation.popToTop(),
    });
  }

  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigation.navigate('WorkerResults', { mode: 'search', query: trimmed });
  }

  function openNearby() {
    navigation.navigate('WorkerResults', {
      mode: 'nearby',
      lat: nearbyCoords?.lat,
      lng: nearbyCoords?.lng,
      label: nearbyCoords?.label,
    });
  }

  const isOffline = availability === 'offline';
  const statusColor = isOffline ? colors.danger : AVAILABILITY_ONLINE_COLOR;
  const matchLabel = hasSkills
    ? `${skillMatchCount} match your skills`
    : 'Add skills to see matches';
  const nearbyLabel =
    nearbyState === 'ready'
      ? `${nearbyCount} within ${NEARBY_RADIUS_MILES} miles`
      : nearbyState === 'unavailable'
        ? 'Enable location'
        : `Within ${NEARBY_RADIUS_MILES} miles`;

  const header = (
    <View style={styles.header}>
      {/* --- Greeting + Switch pill ------------------------------------- */}
      <View style={styles.greetingRow}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting} numberOfLines={1}>
            {greetingFor(new Date())}
            {firstName ? ',' : ''}
          </Text>
          {firstName ? (
            <Text style={styles.greeting} numberOfLines={1}>
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
          <Ionicons name="person" size={19} color={colors.forest} />
          <Text style={styles.modeSwitchText}>Switch to Customer</Text>
        </Pressable>
      </View>

      {/* --- Hero + toolbox art ------------------------------------------- */}
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.headline} maxFontSizeMultiplier={1.3}>
            {'Get hired.\nGet paid.'}
          </Text>
          <Text style={styles.subtitle}>Grow your reputation.</Text>
        </View>
        <Image
          source={WORKER_HOME_TOOLBOX}
          style={styles.heroArt}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>

      {/* --- Search ---------------------------------------------------------- */}
      <View style={styles.searchField}>
        <Ionicons name="search" size={19} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submitSearch}
          placeholder="Search for jobs or areas"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="sentences"
          returnKeyType="search"
        />
        <View style={styles.searchDivider} />
        <Pressable
          onPress={submitSearch}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Ionicons name="arrow-forward-circle" size={22} color={colors.emerald} />
        </Pressable>
      </View>

      {/* --- Availability + earnings ------------------------------------------- */}
      <View style={styles.banner}>
        <View style={styles.bannerColumns}>
          <View style={styles.bannerCol}>
            <Text style={styles.bannerEyebrow}>AVAILABLE NOW</Text>
            <View style={styles.availabilityRow}>
              <Text style={styles.bannerBig} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {isOffline ? 'Offline' : 'Online'}
              </Text>
              <Switch
                value={!isOffline}
                onValueChange={(next) => setAvailability(next ? 'online' : 'offline')}
                trackColor={{ true: AVAILABILITY_ONLINE_COLOR, false: 'rgba(255,255,255,0.28)' }}
                thumbColor={colors.white}
                ios_backgroundColor="rgba(255,255,255,0.28)"
                accessibilityLabel="Availability"
                accessibilityHint={isOffline ? 'Currently offline. Turns availability on.' : 'Currently online. Turns availability off.'}
              />
            </View>
            <View style={styles.statusRow}>
              <PulseDot color={statusColor} size={9} />
              <Text style={styles.bannerColLabel} numberOfLines={1}>
                {isOffline ? 'Not visible to customers' : 'Visible to customers'}
              </Text>
            </View>
          </View>

          <View style={styles.bannerDivider} />

          <View style={styles.bannerCol}>
            <Text style={styles.bannerEyebrow}>POTENTIAL EARNINGS</Text>
            <Text style={styles.bannerBig} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {stats.count === 0 ? '$0' : formatBudget(stats.cents)}
            </Text>
            <Text style={styles.bannerColLabel} numberOfLines={2}>
              {`across ${stats.count} ${stats.count === 1 ? 'job' : 'jobs'}`}
            </Text>
          </View>
        </View>

        <View style={styles.bannerPills}>
          <Pressable
            onPress={() => navigation.navigate('WorkerResults', { mode: 'skills' })}
            style={({ pressed }) => [styles.bannerPill, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={matchLabel}
          >
            <Ionicons name="sparkles" size={13} color={colors.white} />
            <Text style={styles.bannerPillText} numberOfLines={1}>
              {matchLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={openNearby}
            style={({ pressed }) => [styles.bannerPill, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={nearbyLabel}
          >
            <Ionicons name="location" size={13} color={colors.white} />
            <Text style={styles.bannerPillText} numberOfLines={1}>
              {nearbyLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* --- Available Jobs ------------------------------------------------- */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>Available Jobs</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('WorkerResults', { mode: 'all' })}
          style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="View all available jobs"
        >
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.forest} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {loading ? (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {[0, 1, 2].map((i) => (
            <WorkerJobCardSkeleton key={i} />
          ))}
        </ScrollView>
      ) : (
        <FadeIn style={styles.flex}>
          <FlatList
            data={previewJobs}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <WorkerJobCard
                job={item}
                bidCount={bidCounts[item.id]}
                onPress={() => navigation.navigate('JobDetail', { job: item })}
              />
            )}
            ListHeaderComponent={header}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="search" size={30} color={colors.forest} />
                </View>
                <Text style={styles.emptyTitle}>No open jobs right now</Text>
                <Text style={styles.emptyText}>
                  New jobs appear here automatically as clients post them.
                </Text>
              </View>
            }
          />
        </FadeIn>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    // Matches Customer Home's exact background token — one design system.
    backgroundColor: colors.homeBackground,
  },
  // The FadeIn wrapper has to pass the SafeAreaView's height down to the
  // FlatList, or the list sizes to its content and stops scrolling.
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    // MainTabs owns the bottom safe-area inset below this scene.
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },

  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  greetingBlock: {
    flexShrink: 1,
    gap: 2,
  },
  greeting: {
    fontSize: 17,
    color: colors.textMuted,
  },
  modeSwitch: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1.25,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  modeSwitchPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  modeSwitchText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.forest,
  },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
  },
  heroArt: {
    width: TOOLBOX_WIDTH,
    aspectRatio: 1 / TOOLBOX_ASPECT_RATIO,
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '700',
    color: colors.ink,
  },
  subtitle: {
    // Same values as Customer Home's heroSubtitle (HomeScreen.tsx) — one
    // typography system, not a screen-specific variant.
    fontSize: 16,
    fontWeight: '500',
    color: colors.homeSlate,
  },

  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  searchDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
  },

  banner: {
    borderRadius: radius.xl,
    backgroundColor: colors.forest,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bannerColumns: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  bannerCol: {
    flex: 1,
    gap: 2,
  },
  bannerDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginHorizontal: spacing.lg,
  },
  bannerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.gold,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    // Room enough for the switch without pushing the column's own width.
    maxWidth: 150,
  },
  bannerBig: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    color: colors.white,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  bannerColLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.78)',
  },
  bannerPills: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  bannerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    // A translucent white lift rather than a second flat green: it keeps the
    // pill readable on the banner without introducing another token.
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.pill,
  },
  bannerPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  sectionDot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: AVAILABILITY_ONLINE_COLOR,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
  },
  viewAll: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.forest,
  },
  pressed: {
    opacity: 0.85,
  },

  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 320,
    alignSelf: 'center',
    paddingTop: spacing.xxl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    fontSize: 14,
  },
});
