import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { FadeIn } from '../components/FadeIn';
import { useModeTransition } from '../components/ModeTransitionOverlay';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useWorkerAvailability } from '../hooks/useWorkerAvailability';
import { alertAsync } from '../lib/dialog';
import { formatBudget, type OpenJob } from '../lib/jobs';
import { greetingFor } from '../lib/time';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, fonts, radius, shadows, spacing } from '../lib/theme';

// Cropped directly out of design-reference/48_worker_home.png (the circular
// backdrop + toolbox + leaf, background keyed to transparent the same way
// ModeTransitionOverlay's brand mark was) rather than approximated with
// icons — no toolbox artwork exists anywhere else in the project's assets.
const WORKER_HOME_TOOLBOX = require('../assets/brand/worker-home-toolbox.png');
/** height / width of worker-home-toolbox.png (395x320), for aspectRatio. */
const TOOLBOX_ASPECT_RATIO = 320 / 395;
const TOOLBOX_WIDTH = 132;

// The same bright green Customer Home's "Live Nearby" indicator already uses
// (HomeScreen.tsx's liveDot) — one shared "this is live" green rather than a
// third shade next to `colors.success`'s more muted olive.
const AVAILABILITY_ONLINE_COLOR = '#0DBC5A';

type SortMode = 'fit' | 'newest' | 'pay';

const SORT_LABELS: Record<SortMode, string> = {
  fit: 'Best fit',
  newest: 'Newest first',
  pay: 'Highest paid',
};

function startOfToday(): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

/**
 * Worker Home — the Emerald atlas's screen 48, "Find jobs".
 *
 * Rebuilt to sit close to design-reference/48_worker_home.png: header,
 * hero + toolbox art, search, the two-column availability/earnings card, and
 * compact horizontal job cards all follow that reference directly. The same
 * `useOpenJobs` feed, batched bid counts, pull-to-refresh, sorting, and the
 * same `JobDetail` destination on tap are unchanged underneath.
 *
 * Reference elements NOT rendered, because nothing backs them:
 *   - A per-job distance / "Jobs within 5 miles" — exact job coordinates
 *     live in `job_locations`, readable only by the poster and the assigned
 *     worker. The matching chip says "Jobs near you" instead of a specific,
 *     invented mile radius.
 *   - "X fit your schedule" — no schedule/calendar data exists on a job or a
 *     profile. That chip shows the real count of jobs posted today instead
 *     (same calendar-flavored icon, honest number).
 *   - A favorite/heart toggle on each card — there is no saved-jobs table.
 *
 * "Today" / "$100+" / "Best fit" no longer clutter this screen as visible
 * chips — Best fit is still the default sort; all three are reachable via
 * "View all", which opens the same sort sheet rather than being a dead link
 * to a browse screen that doesn't exist separately from this one.
 */
export function BrowseJobsScreen() {
  const navigation = useNavigation<HomeStackNavigation>();
  const { profile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const { start: startModeSwitch, busy: switching } = useModeTransition();
  const { availability, setAvailability } = useWorkerAvailability();
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('fit');
  const [sortOpen, setSortOpen] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  // One batched read for the whole page — see phase38 for why a per-card count
  // is neither correct (RLS under-counts) nor affordable (N+1).
  const bidCounts = useBidCounts(useMemo(() => jobs.map((j) => j.id), [jobs]));

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  /** What this worker advertises. Drives both the "best fit" sort and the
   *  banner's skills count — one source, so the two cannot disagree. */
  const myCategories = useMemo(
    () => new Set(profile?.categories ?? []),
    [profile?.categories]
  );
  const hasSkills = myCategories.size > 0;

  // Banner figures are read from the WHOLE open feed, not the filtered view:
  // they describe the opportunity available, and having them jump every time
  // search narrows the list would make them read as a result count instead.
  const stats = useMemo(() => {
    const midnight = startOfToday();
    let cents = 0;
    let matching = 0;
    let today = 0;

    for (const job of jobs) {
      cents += job.budget_cents ?? 0;
      if (myCategories.has(job.category)) matching++;
      if (new Date(job.created_at).getTime() >= midnight) today++;
    }

    return { cents, matching, today, count: jobs.length };
  }, [jobs, myCategories]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();

    const filtered = text
      ? jobs.filter((job) =>
          `${job.title} ${job.location ?? ''}`.toLowerCase().includes(text)
        )
      : jobs;

    const byNewest = (a: OpenJob, b: OpenJob) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    // Sorted on a copy — `jobs` belongs to the hook, and sorting it in place
    // would mutate state other screens read from the same cache.
    return [...filtered].sort((a, b) => {
      if (sort === 'pay') {
        // A job with no budget is not "cheapest", it is unknown — it sorts to
        // the bottom rather than competing with real numbers.
        return (b.budget_cents ?? -1) - (a.budget_cents ?? -1) || byNewest(a, b);
      }
      if (sort === 'fit') {
        const aFits = myCategories.has(a.category) ? 1 : 0;
        const bFits = myCategories.has(b.category) ? 1 : 0;
        return bFits - aFits || byNewest(a, b);
      }
      return byNewest(a, b);
    });
  }, [jobs, query, sort, myCategories]);

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

  // Same honest "not yet" the customer-side search field uses, rather than a
  // mic icon that silently does nothing.
  async function explainVoice() {
    await alertAsync(
      'Voice search is coming',
      'Voice input is not switched on yet. Type what you need for now.'
    );
  }

  const sortItems: ActionSheetItem[] = (['fit', 'newest', 'pay'] as SortMode[]).map(
    (mode) => ({
      key: mode,
      label: SORT_LABELS[mode],
      icon:
        mode === 'fit'
          ? 'ribbon-outline'
          : mode === 'newest'
            ? 'time-outline'
            : 'cash-outline',
      onPress: () => {
        setSort(mode);
        setSortOpen(false);
      },
    })
  );

  const availabilityItems: ActionSheetItem[] = [
    {
      key: 'online',
      label: 'Online',
      icon: 'radio-button-on',
      onPress: () => {
        setAvailability('online');
        setAvailabilityOpen(false);
      },
    },
    {
      key: 'offline',
      label: 'Offline',
      icon: 'radio-button-off',
      onPress: () => {
        setAvailability('offline');
        setAvailabilityOpen(false);
      },
    },
  ];

  const isOffline = availability === 'offline';
  const statusColor = isOffline ? colors.danger : AVAILABILITY_ONLINE_COLOR;
  const matchLabel = hasSkills
    ? `${stats.matching} ${stats.matching === 1 ? 'job matches' : 'jobs match'} your skills`
    : 'Add skills to see matches';

  const header = (
    <View style={styles.header}>
      {/* --- Greeting + Switch pill ------------------------------------- */}
      <View style={styles.greetingRow}>
        <Text style={styles.greeting} numberOfLines={1}>
          {greetingFor(new Date())}
          {firstName ? `, ${firstName}` : ''}
        </Text>
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
            Get hired. Get paid.
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
          placeholder="Search for jobs or areas"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="sentences"
          returnKeyType="search"
        />
        <View style={styles.searchDivider} />
        <Pressable
          onPress={explainVoice}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voice search"
          accessibilityHint="Voice input is not available yet"
        >
          <Ionicons name="mic-outline" size={20} color={colors.emerald} />
        </Pressable>
      </View>

      {/* --- Availability + earnings ------------------------------------------- */}
      <View style={styles.banner}>
        <View style={styles.bannerColumns}>
          <View style={styles.bannerCol}>
            <Text style={styles.bannerEyebrow}>AVAILABLE NOW</Text>
            <Pressable
              onPress={() => setAvailabilityOpen(true)}
              style={({ pressed }) => [styles.availabilityRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Change availability"
              accessibilityHint={`Currently ${isOffline ? 'offline' : 'online'}. Opens Online/Offline options.`}
            >
              <Text style={styles.bannerBig} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {isOffline ? 'Offline' : 'Online'}
              </Text>
              <View style={styles.availabilityChevron}>
                <Ionicons name="chevron-down" size={16} color={colors.forest} />
              </View>
            </Pressable>
            <View style={styles.statusRow}>
              <PulsingStatusDot color={statusColor} />
              <Text style={styles.bannerColLabel} numberOfLines={1}>
                {isOffline ? 'Not visible to customers' : 'Visible to customers'}
              </Text>
            </View>
          </View>

          <View style={styles.bannerDivider} />

          <View style={styles.bannerCol}>
            <Text style={styles.bannerEyebrow}>POTENTIAL EARNINGS</Text>
            <Text style={styles.bannerBig} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {stats.count === 0 ? '—' : formatBudget(stats.cents)}
            </Text>
            <Text style={styles.bannerColLabel} numberOfLines={2}>
              {stats.count === 0
                ? 'No open jobs yet'
                : `across ${stats.count} ${stats.count === 1 ? 'job' : 'jobs'}`}
            </Text>
          </View>
        </View>

        <View style={styles.bannerPills}>
          <View style={styles.bannerPill}>
            <Ionicons name="sparkles" size={13} color={colors.white} />
            <Text style={styles.bannerPillText} numberOfLines={1}>
              {matchLabel}
            </Text>
          </View>
          <View style={styles.bannerPill}>
            <Ionicons name="location" size={13} color={colors.white} />
            <Text style={styles.bannerPillText} numberOfLines={1}>
              Jobs near you
            </Text>
          </View>
          <View style={styles.bannerPill}>
            <Ionicons name="calendar" size={13} color={colors.white} />
            <Text style={styles.bannerPillText} numberOfLines={1}>
              {stats.today} posted today
            </Text>
          </View>
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
          onPress={() => setSortOpen(true)}
          style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="View all and sort jobs"
          accessibilityHint={`Currently sorted by ${SORT_LABELS[sort].toLowerCase()}`}
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
            data={visible}
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
            initialNumToRender={6}
            windowSize={11}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="search" size={30} color={colors.forest} />
                </View>
                <Text style={styles.emptyTitle}>
                  {jobs.length === 0 ? 'No open jobs right now' : 'Nothing matches that search'}
                </Text>
                <Text style={styles.emptyText}>
                  {jobs.length === 0
                    ? 'New jobs appear here automatically as clients post them.'
                    : 'Try a different word, or clear search to see everything.'}
                </Text>
              </View>
            }
          />
        </FadeIn>
      )}

      <ActionSheet
        visible={sortOpen}
        title="Sort jobs"
        subtitle={SORT_LABELS[sort]}
        items={sortItems}
        onClose={() => setSortOpen(false)}
      />
      <ActionSheet
        visible={availabilityOpen}
        title="Availability"
        subtitle={isOffline ? 'Offline' : 'Online'}
        items={availabilityItems}
        onClose={() => setAvailabilityOpen(false)}
      />
    </SafeAreaView>
  );
}

/**
 * The availability dot beside "Visible/Not visible to customers" — a gentle
 * breathing pulse, not a blinking alert. Opacity + scale only, driven
 * natively (useNativeDriver), so this runs on the UI thread and causes no
 * React re-render anywhere else on screen — the job list below is never
 * touched by it.
 */
function PulsingStatusDot({ color }: { color: string }) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion === null) return;
    pulse.stopAnimation();
    if (reducedMotion) {
      pulse.setValue(0);
      return;
    }
    // 500ms up + 500ms down = one ~1000ms breathing cycle.
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.statusDot,
        {
          backgroundColor: color,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.65] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    // Matches Customer Home's exact background token, not the app-wide
    // default — one design system, same ivory across both Homes.
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
  greeting: {
    flexShrink: 1,
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
    gap: spacing.sm,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  availabilityChevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
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
    marginTop: 2,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  bannerColLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.78)',
  },
  bannerPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  bannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // A translucent white lift rather than a second flat green: it keeps the
    // pill readable on the banner without introducing another token.
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md,
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
