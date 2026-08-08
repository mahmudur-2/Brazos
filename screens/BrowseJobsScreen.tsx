import { useMemo, useState } from 'react';
import {
  FlatList,
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
import { Chip } from '../components/Chip';
import { FadeIn } from '../components/FadeIn';
import { useModeTransition } from '../components/ModeTransitionOverlay';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { alertAsync } from '../lib/dialog';
import { formatBudget, type OpenJob } from '../lib/jobs';
import { greetingFor } from '../lib/time';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, fonts, radius, shadows, spacing } from '../lib/theme';

/** The "$100+" filter's floor, in the integer cents the schema stores. */
const HIGH_PAY_CENTS = 10_000;

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
 * Rebuilt to sit close to design-reference/48_worker_home.png: the search
 * field, the two-column stats banner, the serif headline, and the "Available
 * Jobs" section header all follow that reference directly. Everything the
 * screen did before it still does — the same `useOpenJobs` feed, batched bid
 * counts, pull-to-refresh, sorting and filtering, and the same `JobDetail`
 * destination on tap.
 *
 * Three things the reference shows that are still NOT rendered, because
 * nothing backs them (unchanged from the previous version of this screen):
 *
 *   - An "Online" status. There is no availability or presence model anywhere
 *     in this project — `lib/workerSearch.ts` says so in as many words
 *     ("availability / calendars — not stored"). A status pill that always
 *     reads "Online" would be telling a worker they are visible and available
 *     when no such state exists. The banner's left column shows a real
 *     figure (skill matches, or the open-job count) in that slot instead.
 *   - A per-job distance / "Jobs within 5 miles". Exact job coordinates live
 *     in `job_locations`, readable only by the poster and the assigned
 *     worker, so an open job has no distance this client can compute.
 *   - A "Fit your schedule" badge — no schedule column exists.
 *   - A favorite/heart toggle on each card — there is no saved-jobs table.
 *
 * The reference's in-page List/Map segment is also not reproduced: Map is
 * already a sibling bottom tab one tap away, so an in-page control for the
 * same destination would be a second path to the same place, not a feature.
 * Sorting and the two real filters (Today / $100+) are kept — dropped from
 * the reference's exact layout but not from the screen, since they are
 * working functionality the reference simply doesn't happen to show open.
 */
export function BrowseJobsScreen() {
  const navigation = useNavigation<HomeStackNavigation>();
  const { profile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const { start: startModeSwitch, busy: switching } = useModeTransition();
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('fit');
  const [sortOpen, setSortOpen] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [highPayOnly, setHighPayOnly] = useState(false);

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

  // Banner figures are read from the WHOLE open feed, not the filtered view:
  // they describe the opportunity available, and having them jump every time a
  // filter toggles would make them read as a result count instead.
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

  // The banner's left column: a real per-worker figure rather than a fake
  // "Online" status. Skill matches when the profile actually advertises any
  // (0 on an unfilled profile would read as a market problem, not an empty
  // profile) — the plain open-job count otherwise.
  const hasSkills = myCategories.size > 0;
  const heroValue = hasSkills ? stats.matching : stats.count;
  const heroLabel = hasSkills
    ? `${heroValue === 1 ? 'job matches' : 'jobs match'} your skills`
    : `open ${heroValue === 1 ? 'job' : 'jobs'} right now`;

  const visible = useMemo(() => {
    const midnight = startOfToday();
    const text = query.trim().toLowerCase();

    const filtered = jobs.filter((job) => {
      if (todayOnly && new Date(job.created_at).getTime() < midnight) return false;
      if (highPayOnly && (job.budget_cents ?? 0) < HIGH_PAY_CENTS) return false;
      if (text) {
        const haystack = `${job.title} ${job.location ?? ''}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    });

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
  }, [jobs, query, todayOnly, highPayOnly, sort, myCategories]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // Worker Home is pushed above Customer Home in this same stack, so the
  // return trip is a pop — Customer Home is already mounted underneath and
  // keeps its scroll position and loaded feed. Runs under the emerald panel.
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

  const header = (
    <View style={styles.header}>
      {/* --- Greeting + headline -------------------------------------------- */}
      <View style={styles.intro}>
        <View style={styles.heroArt} pointerEvents="none">
          <Ionicons name="construct" size={40} color={colors.forest} />
        </View>

        {/* Full width, NOT narrowed for the art — the art sits below this
            row's baseline in the reference, so only the headline needs to
            clear it. Squeezing the switch pill into the same narrow column
            as the headline risked wrapping it onto its own line. */}
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

        <View style={styles.introCopy}>
          <Text style={styles.headline} maxFontSizeMultiplier={1.3}>
            Get hired. Get paid.
          </Text>
          <Text style={styles.subtitle}>Grow your reputation.</Text>
        </View>
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

      {/* --- Stats banner ------------------------------------------------------ */}
      <View style={styles.banner}>
        <View style={styles.bannerColumns}>
          <View style={styles.bannerCol}>
            <Text style={styles.bannerEyebrow}>AVAILABLE NOW</Text>
            <Text style={styles.bannerBig} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {heroValue}
            </Text>
            <Text style={styles.bannerColLabel} numberOfLines={2}>
              {heroLabel}
            </Text>
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

        {stats.today > 0 ? (
          <View style={styles.bannerPills}>
            <View style={styles.bannerPill}>
              <Text style={styles.bannerPillText}>{stats.today} posted today</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* --- Filters ----------------------------------------------------------- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Chip
          label="Today"
          variant="filter"
          selected={todayOnly}
          onPress={() => setTodayOnly((v) => !v)}
          accessibilityHint="Only jobs posted today"
        />
        <Chip
          label="$100+"
          variant="filter"
          selected={highPayOnly}
          onPress={() => setHighPayOnly((v) => !v)}
          accessibilityHint="Only jobs budgeted at $100 or more"
        />
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* --- Available Jobs ------------------------------------------------- */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>Available Jobs</Text>
        </View>
        <Pressable
          onPress={() => setSortOpen(true)}
          style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Sort jobs"
          accessibilityHint={`Currently ${SORT_LABELS[sort].toLowerCase()}`}
        >
          <Ionicons name="options-outline" size={16} color={colors.forest} />
          <Text style={styles.sortButtonText} numberOfLines={1}>
            {SORT_LABELS[sort]}
          </Text>
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
            // The cards are taller now, so fewer fit a screen — render a batch
            // that covers the first couple of screenfuls and keep a modest
            // window either side, rather than the default sized for short rows.
            initialNumToRender={6}
            windowSize={11}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="search" size={30} color={colors.forest} />
                </View>
                <Text style={styles.emptyTitle}>
                  {jobs.length === 0 ? 'No open jobs right now' : 'Nothing matches those filters'}
                </Text>
                <Text style={styles.emptyText}>
                  {jobs.length === 0
                    ? 'New jobs appear here automatically as clients post them.'
                    : 'Try turning a filter off, or clearing search, to see more work.'}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
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

  intro: {
    position: 'relative',
    minHeight: 156,
  },
  heroArt: {
    position: 'absolute',
    // Starts below the greeting row (~44 tall), not at the very top — the
    // "Switch to Customer" pill already owns that top-right corner, and
    // matching the reference means the art sits beside the headline instead.
    top: 44,
    right: 0,
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldSoft,
  },
  introCopy: {
    position: 'relative',
    zIndex: 1,
    gap: 2,
    // Room for heroArt on the right, same technique as Customer Home's
    // headline maxWidth — the copy column never runs under the art.
    maxWidth: '72%',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The switch pill sits outside introCopy's maxWidth (its own row, full
    // width) so it isn't squeezed into the 72% reserved for the art.
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  headline: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '700',
    color: colors.ink,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 15,
    color: colors.textMuted,
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
  bannerBig: {
    marginTop: 2,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    color: colors.white,
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
    // A translucent white lift rather than a second flat green: it keeps the
    // pill readable on the banner without introducing another token.
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.pill,
  },
  bannerPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },

  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
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
    backgroundColor: colors.success,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
  },
  sortButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
  },
  sortButtonText: {
    fontSize: 13,
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
