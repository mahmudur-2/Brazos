import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { JobFilterSheet } from '../components/JobFilterSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useOfferCounts } from '../hooks/useOfferCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { resolveCurrentPlace } from '../lib/geolocation';
import { fetchJobsWithinRadius } from '../lib/hotspots';
import {
  DEFAULT_JOB_FILTERS,
  activeJobFilterCount,
  applyJobFilters,
  type JobFilterModel,
} from '../lib/jobFilters';
import { jobMatchesSkills, type OpenJob } from '../lib/jobs';
import { geocodeQuery } from '../lib/reverseGeocode';
import type {
  WorkerHomeStackNavigation,
  WorkerHomeStackParamList,
} from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

/** Kept in sync with BrowseJobsScreen's own "within 5 miles" pill. */
export const NEARBY_RADIUS_MILES = 5;

const MODE_TITLES: Record<WorkerHomeStackParamList['WorkerResults']['mode'], string> = {
  all: 'Available Jobs',
  skills: 'Skill Matches',
  nearby: `Jobs Within ${NEARBY_RADIUS_MILES} Miles`,
  search: 'Search Results',
};

type GeoState = 'loading' | 'ready' | 'denied' | 'unavailable';

/**
 * The spacious Worker job list — "View all", both availability-card filter
 * pills, and Worker Home's search bar all land here with a different `mode`
 * rather than four near-duplicate screens. Skill matching reuses the exact
 * same predicate (lib/jobs.ts's jobMatchesSkills) Worker Home counts with,
 * so the two can never disagree.
 *
 * "nearby" and "search" resolve a center point (the worker's current
 * location, or the searched area geocoded via Nominatim — see
 * lib/reverseGeocode.ts) and call jobs_within_radius() (phase41), a
 * security-definer RPC that computes real Haversine distance against each
 * job's exact stored coordinates server-side and returns only public fields
 * + the computed distance — never a job's raw lat/lng. "nearby" always uses
 * exactly NEARBY_RADIUS_MILES; "search" only widens past it (5 -> 10 -> 15)
 * on zero results, and is never labeled "within N miles" when it does.
 */
export function WorkerResultsScreen() {
  const navigation = useNavigation<WorkerHomeStackNavigation>();
  const { params } = useRoute<RouteProp<WorkerHomeStackParamList, 'WorkerResults'>>();
  const { profile } = useProfile();
  const { jobs, loading: jobsLoading, error: jobsError, refresh } = useOpenJobs();
  // Pull-to-refresh is the recovery path for a failed load — before it, the
  // "Couldn't load jobs" empty state was a dead end with no retry affordance
  // (state-coverage audit, 2026-08-10).
  const [refreshing, setRefreshing] = useState(false);
  const bidCounts = useOfferCounts(useMemo(() => jobs.map((j) => j.id), [jobs]));

  const myCategories = useMemo(
    () => new Set(profile?.categories ?? []),
    [profile?.categories]
  );

  const needsGeo = params.mode === 'nearby' || params.mode === 'search';
  const [geoState, setGeoState] = useState<GeoState>(needsGeo ? 'loading' : 'ready');
  const [geoJobs, setGeoJobs] = useState<OpenJob[]>([]);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  // Screen 50 (Phase 8): one filter model over whichever feed this mode
  // shows. Applied AFTER the mode picks its base set, so a filtered nearby
  // list is still genuinely "within N miles".
  const [filters, setFilters] = useState<JobFilterModel>(DEFAULT_JOB_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Distance sort only means something when rows carry distance_miles.
  const distanceAvailable = params.mode === 'nearby' || params.mode === 'search';

  useEffect(() => {
    if (!needsGeo) return;
    let active = true;

    (async () => {
      setGeoState('loading');

      let center: { lat: number; lng: number; label?: string } | null = null;

      if (params.mode === 'search') {
        if (params.query) center = await geocodeQuery(params.query);
        // A query that isn't a real place (e.g. "Cleaning") just yields no
        // geo results — the text match below still covers it.
      } else if (params.lat != null && params.lng != null) {
        // Already resolved by Worker Home's own pill — reuse it rather than
        // asking the GPS again, so this screen's result set can never drift
        // from the count that was tapped to get here.
        center = { lat: params.lat, lng: params.lng, label: params.label };
      } else {
        const here = await resolveCurrentPlace();
        if (!here.ok) {
          if (active) {
            setGeoState(here.reason === 'denied' ? 'denied' : 'unavailable');
            setGeoMessage(here.message);
          }
          return;
        }
        center = here.place;
      }

      if (!center) {
        if (active) {
          setGeoJobs([]);
          setGeoState('ready');
        }
        return;
      }

      // "nearby" is always exactly the stated radius. "search" alone may
      // widen on zero results — never mislabeled as "within 5 miles" when it
      // does, since only the nearby mode's title says that.
      const radii = params.mode === 'search' ? [5, 10, 15] : [NEARBY_RADIUS_MILES];
      let data: OpenJob[] = [];
      for (const radius of radii) {
        const result = await fetchJobsWithinRadius(center.lat, center.lng, radius);
        if (!active) return;
        data = result.data;
        if (data.length > 0) break;
      }
      setGeoJobs(data);
      setResolvedLabel(center.label ?? null);
      setGeoState('ready');
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsGeo, params.mode, params.query]);

  const results = useMemo(() => {
    let base: OpenJob[];
    if (params.mode === 'skills') {
      base = jobs.filter((job) => jobMatchesSkills(job, myCategories));
    } else if (params.mode === 'nearby') {
      base = geoJobs;
    } else if (params.mode === 'search') {
      const text = (params.query ?? '').trim().toLowerCase();
      const textMatches = text
        ? jobs.filter((job) =>
            `${job.title} ${job.location ?? ''}`.toLowerCase().includes(text)
          )
        : [];
      // Merge text matches (real category/title/location hits) with jobs
      // found near the geocoded area, deduped — never two copies of the
      // same real job.
      const merged = new Map<string, OpenJob>();
      for (const job of textMatches) merged.set(job.id, job);
      for (const job of geoJobs) merged.set(job.id, job);
      base = Array.from(merged.values());
    } else {
      base = jobs;
    }
    return applyJobFilters(base, filters);
  }, [params.mode, params.query, jobs, myCategories, geoJobs, filters]);

  const filterCount = activeJobFilterCount(filters);

  const loading = jobsLoading || geoState === 'loading';

  const subtitle =
    params.mode === 'search' && params.query
      ? resolvedLabel
        ? `"${params.query}" near ${resolvedLabel}`
        : `"${params.query}"`
      : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={MODE_TITLES[params.mode]}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={() => setFiltersOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'
            }
            style={styles.filterButton}
          >
            <Ionicons name="options-outline" size={20} color={colors.ink} />
            {filterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{filterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.listContent}>
          {[0, 1, 2, 3].map((i) => (
            <WorkerJobCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WorkerJobCard
              job={item}
              bidCount={bidCounts[item.id]}
              variant="full"
              onPress={() => navigation.navigate('JobDetail', { job: item })}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={11}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh();
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            filterCount > 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="options-outline" size={30} color={colors.forest} />
                </View>
                <Text style={styles.emptyTitle}>No jobs match your filters</Text>
                <Text style={styles.emptyText}>
                  Loosen a filter, or clear them to see everything again.
                </Text>
                <Pressable
                  onPress={() => setFilters(DEFAULT_JOB_FILTERS)}
                  accessibilityRole="button"
                  style={styles.clearFilters}
                >
                  <Text style={styles.clearFiltersText}>Clear filters</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name={
                      geoState === 'denied' || geoState === 'unavailable'
                        ? 'location-outline'
                        : 'search'
                    }
                    size={30}
                    color={colors.forest}
                  />
                </View>
                <Text style={styles.emptyTitle}>{emptyTitle(params.mode, geoState, jobsError)}</Text>
                <Text style={styles.emptyText}>
                  {emptyBody(params.mode, geoMessage, params.query)}
                </Text>
              </View>
            )
          }
        />
      )}

      <JobFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onApply={setFilters}
        distanceAvailable={distanceAvailable}
      />
    </SafeAreaView>
  );
}

function emptyTitle(
  mode: WorkerHomeStackParamList['WorkerResults']['mode'],
  geoState: GeoState,
  jobsError: string | null
): string {
  if (jobsError) return "Couldn't load jobs";
  if (geoState === 'denied') return 'Location is off';
  if (geoState === 'unavailable') return "Couldn't get your location";
  if (mode === 'skills') return 'No matching jobs right now';
  if (mode === 'nearby') return `No jobs within ${NEARBY_RADIUS_MILES} miles`;
  if (mode === 'search') return 'No jobs found';
  return 'No open jobs right now';
}

function emptyBody(
  mode: WorkerHomeStackParamList['WorkerResults']['mode'],
  geoMessage: string | null,
  query?: string
): string {
  if (geoMessage) return geoMessage;
  if (mode === 'skills') {
    return 'Add categories to your profile so jobs you can do surface here.';
  }
  if (mode === 'nearby') {
    return 'Nothing open nearby right now — new jobs appear automatically as clients post them.';
  }
  if (mode === 'search') {
    return query
      ? `Nothing matched "${query}". Try a different word or area.`
      : 'Type a service or an area to search.';
  }
  return 'New jobs appear here automatically as clients post them.';
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.homeBackground,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
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
  filterButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  clearFilters: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  clearFiltersText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.emerald,
  },
});
