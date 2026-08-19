import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DistanceChips } from '../components/DistanceChips';
import { JobFilterSheet } from '../components/JobFilterSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { useAuth } from '../hooks/useAuth';
import { useOfferCounts } from '../hooks/useOfferCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import { resolveCurrentPlace } from '../lib/geolocation';
import { goBackOrHome } from '../lib/navigationRef';
import { fetchJobsWithinRadius } from '../lib/hotspots';
import { NEARBY_RADIUS_MILES, type DistanceFilterMiles } from '../lib/discoveryFilter';
import { readDistanceFilter, writeDistanceFilter } from '../lib/discoveryFilterStorage';
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
import {
  fonts,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

// The value now lives in lib/discoveryFilter.ts (4D-2) so lib modules can
// read it without importing a screen; re-exported here because the LOCKED
// BrowseJobsScreen imports it from this path.
export { NEARBY_RADIUS_MILES };

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
  const { palette: colors, isDark } = useThemeColors();
  // Forest glyphs vanish on a dark surface under palette v2; masters 12/13
  // draw these accents gold.
  const accent = isDark ? colors.gold : colors.forest;
  const styles = stylesFor(colors);
  const navigation = useNavigation<WorkerHomeStackNavigation>();
  const { params } = useRoute<RouteProp<WorkerHomeStackParamList, 'WorkerResults'>>();
  const { user } = useAuth();
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

  // 4D-2 B3 — the distance filter. `undefined` = still reading the persisted
  // selection; `null` = Any distance. The "nearby" mode is a stated-radius
  // surface: Worker Home's pill promised "within 5 miles", so it ALWAYS
  // arrives at that promise rather than at the persisted value — changing the
  // chip afterwards updates the title with it, so the header never claims a
  // radius the list is not actually applying.
  const [radius, setRadius] = useState<DistanceFilterMiles | null | undefined>(
    params.mode === 'nearby' ? NEARBY_RADIUS_MILES : undefined
  );
  const userId = user?.id ?? null;
  useEffect(() => {
    if (params.mode === 'nearby') return;
    if (!userId) {
      setRadius(null);
      return;
    }
    let active = true;
    readDistanceFilter(userId).then((stored) => {
      if (active) setRadius(stored);
    });
    return () => {
      active = false;
    };
    // userId, not the user object — the object reference rotates on every
    // hourly token refresh (see docs/LOCKED_FILE_PATCHES.md §2); the id
    // does not, and re-reading storage on a refresh would be pure churn.
  }, [params.mode, userId]);

  function selectRadius(next: DistanceFilterMiles | null) {
    setRadius(next);
    if (userId) writeDistanceFilter(userId, next);
  }

  const radiusResolved = radius !== undefined;
  const radiusActive = radius != null;
  const needsGeo =
    params.mode === 'nearby' ||
    params.mode === 'search' ||
    ((params.mode === 'all' || params.mode === 'skills') && radiusActive);
  const [geoState, setGeoState] = useState<GeoState>(
    params.mode === 'nearby' || params.mode === 'search' ? 'loading' : 'ready'
  );
  const [geoJobs, setGeoJobs] = useState<OpenJob[]>([]);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  // Screen 50 (Phase 8): one filter model over whichever feed this mode
  // shows. Applied AFTER the mode picks its base set, so a filtered nearby
  // list is still genuinely "within N miles".
  const [filters, setFilters] = useState<JobFilterModel>(DEFAULT_JOB_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Distance sort only means something when rows carry distance_miles.
  const distanceAvailable =
    params.mode === 'nearby' || params.mode === 'search' || radiusActive;

  useEffect(() => {
    if (!radiusResolved) return;
    if (!needsGeo) {
      setGeoState('ready');
      setGeoJobs([]);
      return;
    }
    let active = true;

    (async () => {
      setGeoState('loading');

      let center: { lat: number; lng: number; label?: string } | null = null;

      if (params.mode === 'search') {
        if (params.query) center = await geocodeQuery(params.query);
        // A query that isn't a real place (e.g. "Cleaning") just yields no
        // geo results — the text match below still covers it.
      } else if (params.mode === 'nearby' && params.lat != null && params.lng != null) {
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

      // "nearby" is always exactly the stated radius (the chip's, defaulting
      // to the pill's 5). "search" alone may widen on zero results — but a
      // user-chosen radius pins it, because a stated selection must never be
      // silently exceeded. "all"/"skills" only reach here with a chosen
      // radius, which is applied as-is.
      const radii =
        params.mode === 'search'
          ? radiusActive
            ? [radius as number]
            : [5, 10, 15]
          : params.mode === 'nearby'
            ? [radius ?? NEARBY_RADIUS_MILES]
            : [radius as number];
      let data: OpenJob[] = [];
      for (const r of radii) {
        const result = await fetchJobsWithinRadius(center.lat, center.lng, r);
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
  }, [needsGeo, radiusResolved, params.mode, params.query, radius]);

  // A chosen radius with no usable location must not silently pretend to
  // filter: the base set stays the full feed and a written note says so.
  const radiusUnavailable =
    (params.mode === 'all' || params.mode === 'skills') &&
    radiusActive &&
    (geoState === 'denied' || geoState === 'unavailable');

  const results = useMemo(() => {
    const radiusBase =
      radiusActive && !radiusUnavailable && geoState === 'ready' ? geoJobs : jobs;
    let base: OpenJob[];
    if (params.mode === 'skills') {
      base = radiusBase.filter((job) => jobMatchesSkills(job, myCategories));
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
      base = radiusBase;
    }
    return applyJobFilters(base, filters);
  }, [
    params.mode,
    params.query,
    jobs,
    myCategories,
    geoJobs,
    filters,
    radiusActive,
    radiusUnavailable,
    geoState,
  ]);

  const filterCount = activeJobFilterCount(filters);

  const loading = jobsLoading || geoState === 'loading' || !radiusResolved;

  const subtitle =
    params.mode === 'search' && params.query
      ? resolvedLabel
        ? `"${params.query}" near ${resolvedLabel}`
        : `"${params.query}"`
      : undefined;

  // The nearby header states its radius, so it tracks the chip: the title
  // must never claim a radius the list is not applying.
  const title =
    params.mode === 'nearby'
      ? `Jobs Within ${radius ?? NEARBY_RADIUS_MILES} Miles`
      : MODE_TITLES[params.mode];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        onBack={goBackOrHome}
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
            {/* Master 12 draws this glyph in gold; light keeps the ink. */}
            <Ionicons
              name="options-outline"
              size={20}
              color={isDark ? colors.gold : colors.ink}
            />
            {filterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{filterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        }
      />

      {radiusResolved ? (
        <DistanceChips
          value={radius ?? null}
          onChange={selectRadius}
          includeAny={params.mode !== 'nearby'}
        />
      ) : null}
      {radiusUnavailable ? (
        <Text style={styles.radiusNote}>
          Location is off — showing jobs at any distance.
        </Text>
      ) : null}

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
          renderItem={({ item }) => {
            // Radius results are jobs_within_radius rows carrying the
            // server-computed distance; the plain feed carries none. Unknown
            // renders nothing on the card — never a client-side guess.
            const distance = (item as { distance_miles?: unknown }).distance_miles;
            return (
              <WorkerJobCard
                job={item}
                bidCount={bidCounts[item.id]}
                variant="full"
                distanceMiles={typeof distance === 'number' ? distance : null}
                onPress={() => navigation.navigate('JobDetail', { job: item })}
              />
            );
          }}
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
              tintColor={accent}
            />
          }
          ListEmptyComponent={
            filterCount > 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="options-outline" size={30} color={accent} />
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
                    color={accent}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {emptyTitle(
                    params.mode,
                    geoState,
                    jobsError,
                    radiusActive && !radiusUnavailable ? (radius as number) : null
                  )}
                </Text>
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
  jobsError: string | null,
  radiusMiles: number | null
): string {
  if (jobsError) return "Couldn't load jobs";
  if (geoState === 'denied') return 'Location is off';
  if (geoState === 'unavailable') return "Couldn't get your location";
  if (mode === 'skills') {
    return radiusMiles != null
      ? `No skill matches within ${radiusMiles} miles`
      : 'No matching jobs right now';
  }
  if (mode === 'nearby') return `No jobs within ${radiusMiles ?? NEARBY_RADIUS_MILES} miles`;
  if (mode === 'search') return 'No jobs found';
  return radiusMiles != null
    ? `No jobs within ${radiusMiles} miles`
    : 'No open jobs right now';
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  // The masters' icon squircle: sage fill inside a gold hairline.
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
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
  radiusNote: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
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
  }),
);
