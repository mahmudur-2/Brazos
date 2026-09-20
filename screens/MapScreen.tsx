import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FilterSlider } from '../components/FilterSlider';
import { HotspotMap } from '../components/HotspotMap';
import { PeekSheet } from '../components/PeekSheet';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { SearchBar } from '../ui/primitives/SearchBar';
import { Sheet } from '../ui/primitives/Sheet';
import { Surface } from '../ui/primitives/Surface';
import { useAuth } from '../hooks/useAuth';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useHotspots } from '../hooks/useHotspots';
import { useOfferCounts } from '../hooks/useOfferCounts';
import { JOB_CATEGORY_LABELS, formatBudget, type OpenJob } from '../lib/jobs';
import {
  cellsWithinMiles,
  fetchJobsWithinRadius,
  fetchOpenJobsInCells,
  milesBetween,
  summarizeCategories,
  tierForCount,
  type HotspotCell,
  type NearbyJob,
} from '../lib/hotspots';
import { clusterPoints, type ClusterPin } from '../lib/mapClustering';
import {
  DISTANCE_FILTER_MAX,
  distanceChipLabel,
  type DistanceFilterMiles,
} from '../lib/discoveryFilter';
import {
  BUDGET_FILTER_MAX_CENTS,
  BUDGET_FILTER_STEP_CENTS,
  DEFAULT_JOB_FILTERS,
  applyJobFilters,
  localDateKey,
  type JobFilterModel,
} from '../lib/jobFilters';
import { readDistanceFilter, writeDistanceFilter } from '../lib/discoveryFilterStorage';
import { userMessage } from '../lib/errorMessage';
import { useMode } from '../modes';
import type { MapStackNavigation } from '../lib/navigation';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { useDialNumber } from '../lib/designOverrides';
import {
  fonts,
  radius,
  selectedInDark,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/** Matches HotspotMap.native's DEFAULT_REGION span — the pre-interaction zoom. */
const INITIAL_LAT_DELTA = 0.08;

/**
 * 2026-09-19 — THE APPROVED MAP DESIGN (docs/mockups/html/map-explore-dark.html
 * and -light.html; the operator's "Dark mode is flawless perfect" and the
 * light rulings that followed). The search capsule is ONE glass pill, 56pt
 * tall with a 28pt corner, carrying the field, the mic and the distance pill;
 * under it, one Today chip; over the map, a floating jobs sheet the thumb
 * pulls up. Every pane wears the `pane` material — liquid glass in dark, flat
 * white in light, as ruled. The numbers below are that design's, spelled
 * once each and dialled from the studio.
 */
const MAP_SEARCH_HEIGHT = 56;
const MAP_SEARCH_RADIUS = 28;
/** The Today chip: 42pt tall, a capsule. */
const MAP_CHIP_HEIGHT = 42;
const MAP_CHIP_RADIUS = 21;
/** The jobs sheet's corner. */
const MAP_SHEET_RADIUS = 30;

/**
 * THE JOBS SHEET'S DATA, and the sheet.
 *
 * A CHILD COMPONENT so `useOpenJobs` is mounted only in worker mode — the hook
 * opens a realtime channel and fetches the whole open feed, and a customer
 * viewing the map has no use for either. Hooks cannot be called conditionally;
 * a component can be rendered conditionally.
 *
 * WHAT IT LISTS. With a radius applied and a real position to measure from,
 * the jobs INSIDE that radius — `jobs_within_radius`, the same server read
 * the pin sheet joins its distances from — so a pane headed "Within 5 miles"
 * lists what it says. Otherwise the open feed, under "Any distance". Either
 * way the list is then narrowed by the SAME filter model the chip row sets,
 * and the count in the head is that list's length: derived, never a
 * stand-in, and absent while the list is on its way.
 */
function MapJobsSheet({
  filters,
  radiusMiles,
  userLoc,
  expandedHeight,
  open,
  onOpenChange,
  onOpenJob,
  onSeeAll,
  sheetRadius,
  sheetPaddingX,
  sheetInset,
}: {
  filters: JobFilterModel;
  radiusMiles: DistanceFilterMiles | null;
  userLoc: { lat: number; lng: number } | null;
  expandedHeight: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenJob: (job: OpenJob) => void;
  onSeeAll: () => void;
  sheetRadius: number;
  sheetPaddingX: number;
  sheetInset: number;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const feed = useOpenJobs();
  const withinRadius = radiusMiles != null && userLoc !== null;
  const nearbyKey = withinRadius ? `${radiusMiles}:${userLoc.lat}:${userLoc.lng}` : null;
  const [nearby, setNearby] = useState<{ key: string; rows: NearbyJob[] } | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  useEffect(() => {
    if (nearbyKey === null || userLoc === null || radiusMiles == null) return;
    let active = true;
    setNearbyError(null);
    fetchJobsWithinRadius(userLoc.lat, userLoc.lng, radiusMiles).then(({ data, error }) => {
      if (!active) return;
      if (error) setNearbyError(userMessage(error));
      else setNearby({ key: nearbyKey, rows: data });
    });
    return () => {
      active = false;
    };
  }, [nearbyKey, userLoc, radiusMiles]);

  // null while the source the head names has not answered yet.
  const source: readonly OpenJob[] | null = withinRadius
    ? nearby?.key === nearbyKey
      ? nearby.rows
      : null
    : feed.loading
      ? null
      : feed.jobs;
  const errorText = withinRadius ? nearbyError : feed.error;
  const loading = source === null && errorText === null;
  const jobs = useMemo(() => (source ? applyJobFilters(source, filters) : []), [source, filters]);

  const title = loading || errorText ? 'Open jobs' : `${jobs.length} open ${jobs.length === 1 ? 'job' : 'jobs'}`;
  // The reach the count was taken under, so "N open jobs" is never read as
  // "N in the world". It says what is TRUE: a radius with no position to
  // measure from is not applied, and the head says so.
  const subtitle =
    radiusMiles != null
      ? userLoc
        ? `Within ${radiusMiles} ${radiusMiles === 1 ? 'mile' : 'miles'}`
        : 'Location off'
      : 'Any distance';

  return (
    <PeekSheet
      expandedHeight={expandedHeight}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitleLead="Near you"
      subtitle={subtitle}
      data={jobs}
      keyExtractor={(job) => job.id}
      renderItem={(job) => <WorkerJobCard job={job} variant="peek" onPress={() => onOpenJob(job)} />}
      loading={loading}
      renderLoading={() => <WorkerJobCardSkeleton />}
      empty={
        <Text style={styles.sheetEmpty}>
          {errorText ?? 'Nothing matches here yet — widen the distance or clear a filter.'}
        </Text>
      }
      footer={
        <Pressable
          onPress={onSeeAll}
          hitSlop={8}
          style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open the full list of jobs"
        >
          <Text style={[styles.seeAllText, isDark && styles.seeAllTextDark]}>Open the full list</Text>
          <Ionicons name="chevron-forward" size={18} color={isDark ? colors.gold : colors.ink} />
        </Pressable>
      }
      radius={sheetRadius}
      paddingX={sheetPaddingX}
      inset={sheetInset}
    />
  );
}

export function MapScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();
  // The design's numbers, each dialled: the search pill's corner, and the
  // jobs sheet's corner, side padding and inset. Fallbacks are what this file
  // draws, spelled once above or on the theme scale.
  const searchRadius = useDialNumber('map.searchPill.radius') ?? MAP_SEARCH_RADIUS;
  const sheetRadius = useDialNumber('map.sheet.radius') ?? MAP_SHEET_RADIUS;
  const sheetPaddingX = useDialNumber('map.sheet.paddingX') ?? spacing.xl;
  const sheetInset = useDialNumber('map.sheet.inset') ?? spacing.lg;
  const navigation = useNavigation<MapStackNavigation>();
  const { cells, loading, error, refresh } = useHotspots();
  const { mode } = useMode();
  const [selected, setSelected] = useState<HotspotCell | null>(null);

  // --- 4D-2 worker discovery: clustered pins → bottom-sheet cards → detail.
  // Customer mode keeps the pre-4D-2 glow-cell experience below, untouched —
  // the dispatch scopes the rebuild to the worker tree, and this shared
  // screen is mode-aware the same way its "See All Jobs" control already is.
  const isWorker = mode === 'worker';
  const { user } = useAuth();
  const [latDelta, setLatDelta] = useState(INITIAL_LAT_DELTA);
  const [activePin, setActivePin] = useState<ClusterPin | null>(null);
  const [pinJobs, setPinJobs] = useState<
    (OpenJob & { distance_miles?: number })[] | null
  >(null);
  const [pinError, setPinError] = useState<string | null>(null);
  // The device's own position, reported once by the native map after a
  // granted fix. Stays null otherwise — never guessed.
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  // B3, session-only since 2026-08-22: the distance filter, shared with
  // WorkerResults through lib/discoveryFilterStorage's in-memory session
  // store. undefined = still reading.
  const [radiusMiles, setRadiusMiles] = useState<DistanceFilterMiles | null | undefined>(undefined);
  // The header filter sheet (2026-08-22): the budget and distance sliders.
  const [filterOpen, setFilterOpen] = useState(false);
  // The jobs sheet: peeking, or pulled up to the list.
  const [sheetOpen, setSheetOpen] = useState(false);
  // The two measurements the sheet's room is derived from: the screen's own
  // height and the header block's. Zero until the first layout pass.
  const [rootHeight, setRootHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  // The search pill's own text. It is a DISPATCH field, not a live filter:
  // the map draws hotspot cells, which carry counts and categories and no
  // text to match against, so a query resolves on the list surface that
  // actually holds jobs — the same one the sheet's foot opens.
  const [query, setQuery] = useState('');
  // The chip row's state, expressed in the app's ONE job-filter vocabulary
  // (lib/jobFilters.ts) rather than a second one owned by this screen. Only
  // the chips the map offers are ever set here; the rest stay at their
  // defaults so the model means the same thing it means on the results list.
  const [jobFilters, setJobFilters] = useState<JobFilterModel>(DEFAULT_JOB_FILTERS);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isWorker || !userId) {
      setRadiusMiles(null);
      return;
    }
    let active = true;
    readDistanceFilter(userId).then((stored) => {
      if (active) setRadiusMiles(stored);
    });
    return () => {
      active = false;
    };
    // userId, not the user object — the object reference rotates on every
    // hourly token refresh (see docs/LOCKED_FILE_PATCHES.md §2); the id
    // does not, and re-reading storage on a refresh would be pure churn.
  }, [isWorker, userId]);

  function selectRadius(next: DistanceFilterMiles | null) {
    setRadiusMiles(next);
    if (userId) writeDistanceFilter(userId, next);
  }

  /**
   * The search pill's submit.
   *
   * It hands the query to WorkerResults — the surface the sheet's foot already
   * opens — rather than growing a second results view inside the map. Worker
   * only, for the same §F reason the distance control beside it is: the map is
   * a worker surface (home(9) removed every customer affordance into it), and
   * customer mode has no jobs feed for a query to land on. SearchBar treats an
   * absent onSubmit as "search-as-you-type", so the field simply does not
   * dispatch there rather than dispatching somewhere wrong.
   */
  function submitSearch() {
    // Gated HERE as well as at the call site. WorkerResults is not registered
    // on the customer Home stack, so dispatching it from customer mode is a
    // runtime throw, and a guard that lives only in the JSX is a guard one
    // refactor away from being dropped.
    if (!isWorker) return;
    const trimmed = query.trim();
    if (!trimmed) return;
    navigateAcrossTabs('Home', 'WorkerResults', { mode: 'search', query: trimmed });
  }

  // The one chip, as a toggle over the thing the map can answer: Today.
  // (Nearby went with the approved design — the distance pill on the search
  // capsule is the radius, readable without a second control.)
  const todayKey = localDateKey(new Date());
  const todayOn = jobFilters.scheduledOn != null;

  function toggleToday() {
    setJobFilters((prev) => ({ ...prev, scheduledOn: prev.scheduledOn == null ? todayKey : null }));
  }

  // A chosen radius is only applicable with a real position to measure from.
  const radiusApplied = isWorker && radiusMiles != null && userLoc !== null;
  const radiusUnavailable = isWorker && radiusMiles != null && userLoc === null;

  const visibleCells = useMemo(() => {
    if (!radiusApplied || !userLoc || radiusMiles == null) return cells;
    return cellsWithinMiles(cells, userLoc.lat, userLoc.lng, radiusMiles);
  }, [cells, radiusApplied, userLoc, radiusMiles]);

  // The customer capsule's figure: the open-job counts of exactly the cells
  // the map is showing. Derived, never a stand-in.
  const visibleJobCount = useMemo(
    () => visibleCells.reduce((total, cell) => total + cell.job_count, 0),
    [visibleCells]
  );

  const cellById = useMemo(() => {
    const map = new Map<string, HotspotCell>();
    for (const cell of cells) map.set(`${cell.ilat}:${cell.ilng}`, cell);
    return map;
  }, [cells]);

  const pins = useMemo(() => {
    if (!isWorker) return undefined;
    return clusterPoints(
      visibleCells.map((cell) => ({
        id: `${cell.ilat}:${cell.ilng}`,
        lat: cell.cell_lat,
        lng: cell.cell_lng,
        count: cell.job_count,
      })),
      { latDelta }
    );
  }, [isWorker, visibleCells, latDelta]);

  // The tapped pin's real jobs — fetched per member cell through the same
  // hydrating reads the customer drill-down uses, newest first.
  useEffect(() => {
    if (!activePin) return;
    let active = true;
    setPinJobs(null);
    setPinError(null);
    (async () => {
      const memberCells = activePin.members
        .map((member) => cellById.get(member.id))
        .filter((cell): cell is HotspotCell => cell !== undefined);
      const { data, error: jobsError } = await fetchOpenJobsInCells(memberCells);
      if (!active) return;
      if (jobsError) {
        setPinError(userMessage(jobsError));
        return;
      }
      let rows: (OpenJob & { distance_miles?: number })[] = [...data].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // With a real position, join the server-computed per-job distance so
      // the sheet's cards can carry it (B2). One jobs_within_radius call
      // sized to just cover this pin's member cells; jobs it does not return
      // simply keep no distance — unknown renders nothing, and a failed
      // enhancement read never blocks the cards themselves.
      if (userLoc) {
        const reach =
          Math.max(
            0,
            ...memberCells.map((cell) =>
              milesBetween(userLoc.lat, userLoc.lng, cell.cell_lat, cell.cell_lng)
            )
          ) + 1;
        const { data: withDistance, error: distanceError } = await fetchJobsWithinRadius(
          userLoc.lat,
          userLoc.lng,
          reach
        );
        if (!active) return;
        if (!distanceError) {
          const distanceById = new Map(
            withDistance.map((row) => [row.id, row.distance_miles])
          );
          rows = rows.map((row) => {
            const distance = distanceById.get(row.id);
            return distance === undefined ? row : { ...row, distance_miles: distance };
          });
        }
      }
      setPinJobs(rows);
    })();
    return () => {
      active = false;
    };
  }, [activePin, cellById, userLoc]);

  // The chip row narrows the pin sheet too, through the same model — a filter
  // the user set on the chrome that then did not apply to the jobs the chrome
  // opened would be two answers to one question.
  const visiblePinJobs = useMemo(
    () => (pinJobs === null ? null : applyJobFilters(pinJobs, jobFilters)),
    [pinJobs, jobFilters]
  );

  const sheetBidCounts = useOfferCounts(
    useMemo(() => (visiblePinJobs ?? []).map((job) => job.id), [visiblePinJobs])
  );

  function openJobFromSheet(job: OpenJob) {
    setActivePin(null);
    navigation.navigate('JobDetail', { job });
  }

  // The jobs sheet's room when open: from a gap under the chip row to its
  // own inset above the screen's foot. Both heights are measured, so the
  // open sheet never covers the search capsule on any device. The gap is
  // read here, at use time, so a studio turn of the scale reaches it.
  const sheetGap = spacing.md;
  const sheetExpandedHeight =
    rootHeight > 0 && headerHeight > 0
      ? Math.max(0, rootHeight - insets.top - headerHeight - sheetGap - sheetInset)
      : 0;
  const onRootLayout = (event: LayoutChangeEvent) => setRootHeight(event.nativeEvent.layout.height);
  const onHeaderLayout = (event: LayoutChangeEvent) =>
    setHeaderHeight(event.nativeEvent.layout.height);

  const chosen = selectedInDark(colors);

  return (
    <View style={styles.root} onLayout={onRootLayout}>
      {/* 2026-08-23 — THE MAP IS THE GROUND, not a panel between two bands.
          It fills the whole screen absolutely: under the status bar, under
          the floating search capsule, under the floating sheet. The chrome
          rides ON it, and the tiles are continuous behind both. */}
      <View style={styles.mapLayer}>
        <HotspotMap
          cells={cells}
          loading={loading}
          onSelectCell={setSelected}
          pins={pins}
          onSelectPin={setActivePin}
          selectedPinKey={activePin?.key ?? null}
          // The approved design carries no locate button over the worker
          // map; the customer map keeps it, untouched.
          hideLocateButton={isWorker}
          onRegionChangeComplete={
            isWorker ? (region) => setLatDelta(region.latitudeDelta) : undefined
          }
          onUserLocation={isWorker ? setUserLoc : undefined}
        />
      </View>

      {/* `box-none`: this layer LAYS OUT the chrome over the map and never
          takes a touch of its own — only the capsules and the sheets inside
          it do. Without it the whole screen would be a transparent lid and
          the map would stop panning. */}
      <SafeAreaView style={styles.safe} edges={['top']} pointerEvents="box-none">
        {/* THE HEADER BLOCK — the search capsule and the chip row, measured
            together because the open sheet stops a gap under whatever is
            here. 4D-4: chrome and tiles resolve together — the MapView follows
            the in-app theme (HotspotMap.native userInterfaceStyle). */}
        <View style={styles.headerBlock} onLayout={onHeaderLayout} pointerEvents="box-none">
          {/* 2026-09-19 — ONE GLASS PILL, not a capsule around a field. The
              shared SearchBar keeps its behaviour — the mic, the clear, the
              dispatch — and hands its own ground to the `pane` Surface, so the
              tiles read through the pill in dark and the pill is flat white in
              light, as ruled. The distance pill rides inside it, at the right,
              where the design's "5 mi" sits. */}
          <Surface material="pane" radius={searchRadius} corners="all" style={styles.searchPill}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={isWorker ? submitSearch : undefined}
              placeholder="Explore nearby jobs"
              autoCapitalize="sentences"
              autoCorrect
              style={styles.searchField}
              accessibilityLabel="Explore nearby jobs"
              trailing={
                // Worker-only, for the same §F reason the old "See all jobs"
                // control was: the distance filter is worker discovery state,
                // and customer mode has no radius to set. Perspective from
                // ModeContext, never a passed prop. It opens the filter sheet
                // and always carries the active distance, so the reach is
                // readable without opening anything.
                isWorker ? (
                  <Pressable
                    onPress={() => setFilterOpen(true)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.distancePill, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      radiusMiles != null
                        ? `Distance filter, within ${radiusMiles} miles`
                        : 'Distance filter, any distance'
                    }
                  >
                    <Ionicons name="options-outline" size={18} color={colors.gold} />
                    <Text style={styles.distanceText} numberOfLines={1}>
                      {radiusMiles != null ? distanceChipLabel(radiusMiles) : 'Any'}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            />
          </Surface>

          {/* THE CHIP ROW, under the capsule and floating on the tiles like
              it. ONE chip. HOURLY IS ABSENT AND THAT IS DELIBERATE: `jobs`
              has no hourly-versus-fixed column. The only `price_unit` in the
              schema is on `worker_services` (phase53) — a worker's own
              service listing, not a posted job — so an Hourly chip here could
              only be inferred from a price shape, which would be inventing
              marketplace data about somebody's job. It ships when the column
              does. The chip wears the same pane as the pill; chosen, it takes
              the app's one selected treatment — the gold line in dark
              (selectedInDark), the forest fill in light. */}
          {isWorker ? (
            <View style={styles.chipRow}>
              <Surface
                material="pane"
                radius={MAP_CHIP_RADIUS}
                corners="all"
                style={[
                  styles.chipShell,
                  todayOn &&
                    (isDark
                      ? { backgroundColor: chosen.fill, borderColor: chosen.line }
                      : styles.chipShellSelected),
                ]}
              >
                <Pressable
                  onPress={toggleToday}
                  style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: todayOn }}
                  accessibilityLabel={
                    todayOn ? 'Showing jobs scheduled for today' : 'Show only jobs scheduled for today'
                  }
                >
                  <Ionicons
                    name="calendar-outline"
                    size={19}
                    color={todayOn ? (isDark ? chosen.line : colors.onForest) : colors.emerald}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      todayOn && (isDark ? { color: chosen.line } : styles.chipTextSelected),
                    ]}
                  >
                    Today
                  </Text>
                </Pressable>
              </Surface>
            </View>
          ) : null}
        </View>

        {error ? (
          // Retryable, not just announced — the map without hotspot data is a
          // dead end otherwise (state-coverage audit, 2026-08-10).
          <View style={[styles.errorRow, { backgroundColor: colors.dangerBg }]}>
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
            <Pressable onPress={refresh} hitSlop={8} accessibilityRole="button">
              <Text style={styles.errorRetry}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* THE JOBS SHEET — the design's floating pane, worker only. It peeks
            with the count, the reach and one row, and pulls up to the list
            (components/PeekSheet). Mounted once the screen and the header
            have been measured, so its open height is derived and never
            guessed; absent while the hotspots are loading or failed, like
            the count it carries. Its foot opens the real results list —
            the sheet is a window on that list, not a second one. */}
        {isWorker && !loading && !error && sheetExpandedHeight > 0 ? (
          <MapJobsSheet
            filters={jobFilters}
            radiusMiles={radiusMiles ?? null}
            userLoc={userLoc}
            expandedHeight={sheetExpandedHeight}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onOpenJob={(job) => navigation.navigate('JobDetail', { job })}
            onSeeAll={() => navigateAcrossTabs('Home', 'WorkerResults', { mode: 'all' })}
            sheetRadius={sheetRadius}
            sheetPaddingX={sheetPaddingX}
            sheetInset={sheetInset}
          />
        ) : null}

        {/* The customer's capsule: the count of open jobs in the cells the
            map is showing — a figure, not a feed, because customer mode has
            no list to open. Floating like the worker's sheet, on the same
            pane, absent while loading. */}
        {!isWorker && !loading && !error ? (
          <Surface
            material="pane"
            radius={sheetRadius}
            corners="all"
            style={[styles.countCapsule, { left: sheetInset, right: sheetInset, bottom: sheetInset }]}
          >
            <Text style={styles.countText} numberOfLines={1}>
              {visibleJobCount} open {visibleJobCount === 1 ? 'job' : 'jobs'}
            </Text>
          </Surface>
        ) : null}

        {selected && (
          <View style={styles.sheet}>
            {/* Keep the hotspot detail card consistent with the light map UI. */}
            <Card>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleWrap}>
                  <View
                    style={[
                      styles.sheetDot,
                      {
                        backgroundColor:
                          tierForCount(selected.job_count)?.stroke ?? colors.border,
                      },
                    ]}
                  />
                  <Text style={[styles.sheetTitle, { color: colors.text }]}>
                    {selected.job_count} open {selected.job_count === 1 ? 'job' : 'jobs'}
                  </Text>
                </View>
                <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <Text style={[styles.sheetCategories, { color: colors.textMuted }]}>
                {summarizeCategories(selected.categories, JOB_CATEGORY_LABELS)}
              </Text>

              <Button
                title={`View ${selected.job_count} ${
                  selected.job_count === 1 ? 'job' : 'jobs'
                }`}
                onPress={() => {
                  navigation.navigate('CellJobs', {
                    ilat: selected.ilat,
                    ilng: selected.ilng,
                    count: selected.job_count,
                  });
                  setSelected(null);
                }}
                style={styles.sheetBtn}
              />
            </Card>
          </View>
        )}

        {/* THE FILTER SHEET — budget and distance as sliders since 2026-08-24,
            where the distance half was a chip row plus a stepper. The chip
            sheet that replaces it is the third commit of the 2026-09-19
            sequence; until then the distance pill opens this.

            NOTE WHAT DID NOT CHANGE. components/DistanceChips.tsx is
            byte-untouched: it is shared with WorkerResults, whose contract is
            fenced, and the map getting a slider is not a reason for that list
            to lose its chips. Both controls still write through
            readDistanceFilter / writeDistanceFilter — one filter vocabulary,
            one persistence module — so a radius set by dragging here is the
            same radius the chips there show.

            ZERO IS "ANY" ON BOTH SLIDERS, and it is a control sentinel rather
            than a value: DISTANCE_FILTER_MIN is 1 mile and a budget floor of
            nothing is null, so both are converted at this boundary and neither
            lib ever sees a zero it does not define. */}
        <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filters">
          {radiusMiles !== undefined ? (
            <View style={styles.filterSheetBody}>
              <FilterSlider
                label="Minimum budget"
                min={0}
                max={BUDGET_FILTER_MAX_CENTS}
                step={BUDGET_FILTER_STEP_CENTS}
                value={jobFilters.minBudgetCents ?? 0}
                onChange={(cents) =>
                  setJobFilters((prev) => ({
                    ...prev,
                    minBudgetCents: cents === 0 ? null : cents,
                  }))
                }
                // formatBudget, not a local money format — money is integer
                // cents and it is formatted in exactly one place.
                formatValue={(cents) => (cents === 0 ? 'Any budget' : `${formatBudget(cents)}+`)}
                accessibilityLabel="Minimum budget"
                footnote="Jobs with no budget set are always shown."
              />
              <FilterSlider
                label="Distance"
                min={0}
                max={DISTANCE_FILTER_MAX}
                step={1}
                value={radiusMiles ?? 0}
                onChange={(miles) => selectRadius(miles === 0 ? null : miles)}
                formatValue={(miles) => distanceChipLabel(miles === 0 ? null : miles)}
                accessibilityLabel="Distance"
                footnote={
                  radiusUnavailable ? 'Location is off — showing all areas.' : undefined
                }
              />
            </View>
          ) : null}
        </Sheet>

        {/* Worker discovery: the tapped pin's jobs as photo-first cards. Cards
            open the market job detail inside this same Map stack. */}
        <Sheet
          visible={activePin !== null}
          onClose={() => setActivePin(null)}
          title={
            activePin
              ? `${activePin.count} open ${activePin.count === 1 ? 'job' : 'jobs'} here`
              : undefined
          }
        >
          {pinError ? (
            <View style={styles.pinSheetState}>
              <Text style={styles.pinSheetError}>{pinError}</Text>
              <Button
                title="Close"
                variant="secondary"
                onPress={() => setActivePin(null)}
              />
            </View>
          ) : visiblePinJobs === null ? (
            <View style={styles.pinSheetList}>
              {[0, 1, 2].map((i) => (
                <WorkerJobCardSkeleton key={i} />
              ))}
            </View>
          ) : visiblePinJobs.length === 0 ? (
            <View style={styles.pinSheetState}>
              <Text style={styles.pinSheetEmpty}>
                These jobs just closed or were taken down — pull the map's data
                again in a moment.
              </Text>
            </View>
          ) : (
            <View style={styles.pinSheetList}>
              {visiblePinJobs.map((job) => (
                <WorkerJobCard
                  key={job.id}
                  job={job}
                  bidCount={sheetBidCounts[job.id]}
                  variant="full"
                  distanceMiles={job.distance_miles ?? null}
                  onPress={() => openJobFromSheet(job)}
                />
              ))}
            </View>
          )}
        </Sheet>
      </SafeAreaView>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // The ground under the map itself: what shows for the frames before the
  // tiles resolve, and behind the translucent panes. It was `mapWrap`'s
  // before the map became the ground layer.
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // The chrome layer paints NOTHING. Every pixel of colour on this screen is
  // either the map or one of the panes below.
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // The search pill and the chip row, inset like the sheet under them.
  headerBlock: {
    marginHorizontal: spacing.lg,
    gap: spacing.md,
  },
  // 2026-09-19 — THE PILL IS THE GROUND. It used to be a translucent capsule
  // (page ground at 0.55) around an opaque field; now the `pane` Surface IS
  // the field's ground and the field paints nothing of its own. Nothing here
  // names a fill: the material does, once, in ui/tokens.ts.
  searchPill: {
    minHeight: MAP_SEARCH_HEIGHT,
    justifyContent: 'center',
  },
  // Two under the pill's height: the pill's own hairline is the other two.
  searchField: {
    minHeight: MAP_SEARCH_HEIGHT - 2,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingLeft: spacing.xl - spacing.xs,
    paddingRight: spacing.sm,
  },
  // The design's "5 mi": gold, on a faint ink wash under a sage hairline,
  // narrow enough to leave the mic its room.
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    height: 32,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.sm + 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: withAlpha(colors.textMuted, 0.39),
    backgroundColor: withAlpha(colors.black, 0.12),
  },
  distanceText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gold,
  },
  pressed: { opacity: 0.8 },
  // The chip floats on the tiles beside the pill rather than inside it.
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  chipShell: {
    height: MAP_CHIP_HEIGHT,
    justifyContent: 'center',
  },
  chipShellSelected: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 1,
    height: MAP_CHIP_HEIGHT - 2,
    paddingLeft: spacing.md + 2,
    paddingRight: spacing.lg + 1,
  },
  chipText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.ink,
  },
  chipTextSelected: {
    color: colors.onForest,
  },
  // The customer's count capsule, floating where the worker's sheet peeks.
  countCapsule: {
    position: 'absolute',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  countText: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  // Inside the jobs sheet: the empty slot and the foot.
  sheetEmpty: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  seeAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  seeAllTextDark: {
    color: colors.gold,
  },
  filterSheetBody: {
    gap: spacing.md,
  },
  // THE GROUND LAYER. Absolute rather than `flex: 1` so the tiles run behind
  // the search pill, behind the sheet and under the status bar — the whole
  // screen is the map, and the chrome is on top of it.
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    ...shadows.raised,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetDot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  sheetCategories: {
    fontSize: 14,
    marginTop: spacing.sm,
  },
  sheetBtn: {
    marginTop: spacing.lg,
  },
  error: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.lg,
  },
  errorRetry: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  // The Sheet's own scrollContent already pads by the screen gutter — these
  // only space the rows within it.
  pinSheetList: {
    gap: spacing.md,
  },
  pinSheetState: {
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  pinSheetError: {
    fontSize: 14,
    color: colors.danger,
    lineHeight: 20,
  },
  pinSheetEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  }),
);
