import { useMemo, useState } from 'react';
import {
  FlatList,
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
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { Chip } from '../components/Chip';
import { FadeIn } from '../components/FadeIn';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { formatBudget, type OpenJob } from '../lib/jobs';
import { greetingFor } from '../lib/time';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, radius, shadows, spacing } from '../lib/theme';

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
 * Deliberately not a re-skin of Customer Home: bold sans-serif throughout (no
 * display serif), no decorative artwork, no gold, and a stats banner where the
 * customer side has a posting CTA.
 *
 * Everything the screen did before it does still: the same `useOpenJobs` feed,
 * the same batched bid counts, the same pull-to-refresh, and the same
 * `JobDetail` destination on tap. Sorting and filtering are new, and every one
 * of them runs on a field the schema actually has.
 *
 * Three things the reference shows that are NOT rendered, because nothing
 * backs them:
 *
 *   - An "Online" status. There is no availability or presence model anywhere
 *     in this project — `lib/workerSearch.ts` says so in as many words
 *     ("availability / calendars — not stored"). A status pill that always
 *     reads "Online" would be telling a worker they are visible and available
 *     when no such state exists.
 *   - An "Under 3 mi" filter and a per-job distance. Exact job coordinates
 *     live in `job_locations`, readable only by the poster and the assigned
 *     worker, so an open job has no distance this client can compute.
 *   - A "N fit your schedule" badge, for the same reason as the first.
 *
 * The banner's own label says "AVAILABLE NOW" rather than the reference's
 * "AVAILABLE NEAR YOU" for that same distance reason — the feed is every open
 * job, not a geographically scoped one, and claiming proximity would be
 * inventing it.
 */
export function BrowseJobsScreen() {
  const navigation = useNavigation<HomeStackNavigation>();
  const { profile } = useProfile();
  const { jobs, loading, error, refresh } = useOpenJobs();
  const [refreshing, setRefreshing] = useState(false);

  const [sort, setSort] = useState<SortMode>('fit');
  const [sortOpen, setSortOpen] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [highPayOnly, setHighPayOnly] = useState(false);

  // One batched read for the whole page — see phase38 for why a per-card count
  // is neither correct (RLS under-counts) nor affordable (N+1).
  const bidCounts = useBidCounts(useMemo(() => jobs.map((j) => j.id), [jobs]));

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const initial = (profile?.full_name?.trim()[0] ?? '?').toUpperCase();

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

  const visible = useMemo(() => {
    const midnight = startOfToday();

    const filtered = jobs.filter((job) => {
      if (todayOnly && new Date(job.created_at).getTime() < midnight) return false;
      if (highPayOnly && (job.budget_cents ?? 0) < HIGH_PAY_CENTS) return false;
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
  }, [jobs, todayOnly, highPayOnly, sort, myCategories]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function openMap() {
    // The map is a sibling tab, not a route in this stack.
    navigation.getParent()?.navigate('Map');
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
      {/* --- Top bar ------------------------------------------------------ */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.getParent()?.navigate('Profile')}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>

        <Text style={styles.topTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          Find jobs
        </Text>

        <Pressable
          onPress={() => setSortOpen(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Sort jobs"
          accessibilityHint={`Currently ${SORT_LABELS[sort].toLowerCase()}`}
        >
          <Ionicons name="options-outline" size={21} color={colors.ink} />
        </Pressable>
      </View>

      {/* --- Greeting + headline ------------------------------------------ */}
      <Text style={styles.greeting} numberOfLines={1}>
        {greetingFor(new Date())}
        {firstName ? `, ${firstName}` : ''}
      </Text>
      <Text style={styles.headline} maxFontSizeMultiplier={1.4}>
        Find the right work.
      </Text>

      {/* --- Stats banner -------------------------------------------------- */}
      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>AVAILABLE NOW</Text>
        <Text style={styles.bannerHeadline} maxFontSizeMultiplier={1.3}>
          {stats.count === 0
            ? 'No open jobs yet'
            : `${formatBudget(stats.cents)} across ${stats.count} ${
                stats.count === 1 ? 'job' : 'jobs'
              }`}
        </Text>

        {stats.count > 0 ? (
          <View style={styles.bannerPills}>
            {/* Only shown once the worker has actually advertised skills —
                "0 match your skills" on an empty profile reads as a market
                problem when it is a profile that has not been filled in. */}
            {myCategories.size > 0 ? (
              <View style={styles.bannerPill}>
                <Text style={styles.bannerPillText}>
                  {stats.matching} match your skills
                </Text>
              </View>
            ) : null}
            {stats.today > 0 ? (
              <View style={styles.bannerPill}>
                <Text style={styles.bannerPillText}>{stats.today} posted today</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* --- List / Map ---------------------------------------------------- */}
      <View style={styles.segment}>
        <View style={[styles.segmentItem, styles.segmentItemActive]}>
          <Text style={styles.segmentTextActive}>List</Text>
        </View>
        <Pressable
          onPress={openMap}
          style={({ pressed }) => [styles.segmentItem, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Map"
          accessibilityHint="Opens nearby work on the map"
        >
          <Text style={styles.segmentText}>Map</Text>
        </Pressable>
      </View>

      {/* --- Filters ------------------------------------------------------- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Chip
          label="Best fit"
          variant="filter"
          selected={sort === 'fit'}
          onPress={() => setSort(sort === 'fit' ? 'newest' : 'fit')}
          accessibilityHint="Ranks jobs in the categories you list on your profile first"
        />
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
                    : 'Try turning a filter off to see more work.'}
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
    paddingTop: spacing.xs,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
  },
  topTitle: {
    // flex:1 + centred text keeps the title optically centred between two
    // equal-width controls without absolute positioning.
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  pressed: {
    opacity: 0.85,
  },

  greeting: {
    fontSize: 17,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  headline: {
    // Sans-serif on purpose: the worker side is deliberately not the customer
    // side's serif display treatment.
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: colors.ink,
    marginTop: -spacing.xs,
  },

  banner: {
    borderRadius: radius.xl,
    backgroundColor: colors.forest,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bannerLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.mint2,
  },
  bannerHeadline: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.white,
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

  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.mint,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  segmentItemActive: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  segmentText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.forest,
  },

  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
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
