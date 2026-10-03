import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { HotspotMap } from '../components/HotspotMap';
import { JobFilterSheet } from '../components/JobFilterSheet';
import { PeekSheet, type PeekStop } from '../components/PeekSheet';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { SearchBar } from '../ui/primitives/SearchBar';
import { Sheet } from '../ui/primitives/Sheet';
import { Surface } from '../ui/primitives/Surface';
import { useAuth } from '../hooks/useAuth';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useHotspots } from '../hooks/useHotspots';
import { useMyJobsHub } from '../hooks/useMyJobsHub';
import { useOfferCounts } from '../hooks/useOfferCounts';
import { useWorkerSkills } from '../hooks/useWorkerSkills';
import { JOB_CATEGORY_LABELS, type OpenJob } from '../lib/jobs';
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
import { distanceChipLabel, type DistanceFilterMiles } from '../lib/discoveryFilter';
import {
  applyJobFilters,
  completedByCategory,
  localDateKey,
  type JobFilterModel,
  type JobSortContext,
} from '../lib/jobFilters';
import { useSessionJobFilters } from '../hooks/useSessionJobFilters';
import { readDistanceFilter, writeDistanceFilter } from '../lib/discoveryFilterStorage';
import { userMessage } from '../lib/errorMessage';
import { useMode } from '../modes';
import type { MapStackNavigation } from '../lib/navigation';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { useDialNumber } from '../lib/designOverrides';
import {
  fonts,
  paneEdges,
  radius,
  selectedInDark,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  textLine,
  touchSlop,
} from '../lib/theme';
import { PalettePinContext } from '../hooks/useThemeColors';
import { usePillReserve } from '../ui/primitives';

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
// 62 tall since 2026-09-20 (sitting 2, (6)): the operator's "slightly bigger",
// option a of six rendered beside the 56 it was — the corner follows as
// height / 2, the placeholder stays 18, the glyphs grow by 1 (SearchBar's
// ink emphasis), the distance pill by 2.
const MAP_SEARCH_HEIGHT = 62;
const MAP_SEARCH_RADIUS = 31; // MAP_SEARCH_HEIGHT / 2 — the capsule
const MAP_DISTANCE_PILL_HEIGHT = 34;
/** The Today chip: 42pt tall, a capsule. */
const MAP_CHIP_HEIGHT = 42;
const MAP_CHIP_RADIUS = 21;
/** The jobs sheet's corner. */
const MAP_SHEET_RADIUS = 30;
/* The jobs sheet RESTS ON the nav bar (2026-09-20, sitting 2, the operator's red line); since
 * 2026-09-30 the bar is the floating pill, so it rests on the pill's top edge — usePillReserve(),
 * read where the sheet is placed. The sides keep the `map.sheet.inset` dial. */
/** Air between the jobs pane's top and Apple's Legal link above it. */
const LEGAL_LINK_AIR = 8;

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
 *
 * THE SORT CONTEXT (2026-09-19) is assembled here and handed to
 * applyJobFilters: the worker's skills (the profile), their track record
 * (completed jobs per category, from the jobs assigned to them) and the
 * live offer counts — what Smart Match and Fewest bids rank by. The Filters
 * sheet is rendered from here as well, so "Show N jobs" can count against
 * the very list the pane shows.
 */
function MapJobsSheet({
  visible,
  filters,
  onFiltersChange,
  filtersOpen,
  onFiltersClose,
  radiusMiles,
  onRadiusChange,
  userLoc,
  maxHeight,
  stop,
  onStopChange,
  onPeekHeight,
  onOpenJob,
  onSeeAll,
  sheetRadius,
  sheetPaddingX,
  sheetInset,
}: {
  /** False while the hotspots are loading or failed: the pane waits with
   *  them, but the Filters sheet stays reachable from the distance pill. */
  visible: boolean;
  filters: JobFilterModel;
  onFiltersChange: (model: JobFilterModel) => void;
  filtersOpen: boolean;
  onFiltersClose: () => void;
  radiusMiles: DistanceFilterMiles | null;
  onRadiusChange: (next: DistanceFilterMiles | null) => void;
  userLoc: { lat: number; lng: number } | null;
  /** The most room the sheet may open into — from under the search pill. */
  maxHeight: number;
  /** Tucked, peeking, or open — the screen's state, the pane's rest. */
  stop: PeekStop;
  onStopChange: (stop: PeekStop) => void;
  onPeekHeight: (height: number) => void;
  onOpenJob: (job: OpenJob) => void;
  onSeeAll: () => void;
  sheetRadius: number;
  sheetPaddingX: number;
  sheetInset: number;
}) {
  const sheetBottom = usePillReserve();
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const feed = useOpenJobs();
  // The worker's skills — profile categories AND listed services, one rule
  // (hooks/useWorkerSkills.ts, 2026-09-20 sitting 2), with the state the
  // Filters sheet's Categories note reads.
  const { skills, state: skillsState } = useWorkerSkills();
  const { working } = useMyJobsHub();
  const trackRecord = useMemo(() => completedByCategory(working), [working]);
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
  const offerCounts = useOfferCounts(useMemo(() => (source ?? []).map((job) => job.id), [source]));
  const sortContext = useMemo<JobSortContext>(
    () => ({ skills, completedByCategory: trackRecord, offerCounts }),
    [skills, trackRecord, offerCounts]
  );
  const jobs = useMemo(
    () => (source ? applyJobFilters(source, filters, sortContext) : []),
    [source, filters, sortContext]
  );

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
    <>
      {visible ? (
      <PeekSheet
        maxHeight={maxHeight}
        stop={stop}
        onStopChange={onStopChange}
        onPeekHeight={onPeekHeight}
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
        insetBottom={sheetBottom}
      />
      ) : null}
      {/* THE FILTERS SHEET — the approved design, over the one filter model.
          The distance rides through its own prop (its own storage path); the
          button's count is honest: the list under the draft when the radius
          is the applied one, and no number at all when a changed radius would
          need a read this sheet has not made. */}
      <JobFilterSheet
        visible={filtersOpen}
        onClose={onFiltersClose}
        value={filters}
        onApply={onFiltersChange}
        distance={{ value: radiusMiles, onChange: onRadiusChange, available: userLoc !== null }}
        distanceAvailable={withinRadius}
        skills={skills}
        skillsState={skillsState}
        countFor={(draft, draftDistance) =>
          source && draftDistance === radiusMiles
            ? applyJobFilters(source, draft, sortContext).length
            : null
        }
      />
    </>
  );
}

export function MapScreen() {
  const sheetBottom = usePillReserve();
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
  // The jobs sheet: tucked, peeking, or pulled up to the list. ALWAYS the
  // peek when the map comes into view (the operator, 2026-09-20 sitting 2:
  // "on default it shouldn't be on mini") — the tuck is the user's own pull
  // and lasts only until they pull it back or leave the tab.
  const [sheetStop, setSheetStop] = useState<PeekStop>('peek');
  useFocusEffect(
    useCallback(() => {
      setSheetStop('peek');
    }, [])
  );
  // The pane's measured peek height: Apple's Legal link rides that far above
  // the map's bottom edge, since the pane rests on the bar and would cover it.
  const [peekHeight, setPeekHeight] = useState(0);
  // The two measurements the sheet's room is derived from: the screen's own
  // height and the search pill's. Zero until the first layout pass.
  const [rootHeight, setRootHeight] = useState(0);
  const [pillHeight, setPillHeight] = useState(0);
  // The search pill's own text. It is a DISPATCH field, not a live filter:
  // the map draws hotspot cells, which carry counts and categories and no
  // text to match against, so a query resolves on the list surface that
  // actually holds jobs — the same one the sheet's foot opens.
  const [query, setQuery] = useState('');
  // The chip row's state, expressed in the app's ONE job-filter vocabulary
  // (lib/jobFilters.ts) rather than a second one owned by this screen. Only
  // the chips the map offers are ever set here; the rest stay at their
  // defaults so the model means the same thing it means on the results list.
  // 2026-09-28 (LUX-LIST-64 #64, audit M-25): the worker's ONE filter memory —
  // the job list reads and writes the same model, so "Open the full list" and
  // the search capsule arrive with the map's choices, and back again.
  const [jobFilters, setJobFilters] = useSessionJobFilters();

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

  // The MOST room the jobs sheet may open into: from a gap under the search
  // pill (the operator's line, 2026-09-20 — it may cover the Today chip) to
  // its own inset above the screen's foot. The sheet takes what its rows
  // need up to this. Both heights are measured, so the open sheet never
  // covers the search capsule on any device. The gap is read here, at use
  // time, so a studio turn of the scale reaches it.
  const sheetGap = spacing.md;
  const sheetMaxHeight =
    rootHeight > 0 && pillHeight > 0
      ? Math.max(0, rootHeight - insets.top - pillHeight - sheetGap - sheetBottom)
      : 0;
  const onRootLayout = (event: LayoutChangeEvent) => setRootHeight(event.nativeEvent.layout.height);
  const onPillLayout = (event: LayoutChangeEvent) => setPillHeight(event.nativeEvent.layout.height);

  const chosen = selectedInDark(colors);

  return (
    // 2026-09-27 (the Lux remake, ruling 2): the map — worker and customer —
    // keeps today's colours: the whole subtree resolves the pinned palette
    // (hooks/useThemeColors.ts PalettePinContext, lib/theme.ts mapPalette).
    <PalettePinContext.Provider value="map">
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
          // The Fable review: above the floating tab bar always, and above the job card when one shows.
          legalLabelInsetBottom={isWorker ? sheetBottom + peekHeight + LEGAL_LINK_AIR : undefined}
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
        <View style={styles.headerBlock} pointerEvents="box-none">
          {/* 2026-09-19 — ONE GLASS PILL, not a capsule around a field. The
              shared SearchBar keeps its behaviour — the mic, the clear, the
              dispatch — and hands its own ground to the `pane` Surface, so the
              tiles read through the pill in dark and the pill is flat white in
              light, as ruled. The distance pill rides inside it, at the right,
              where the design's "5 mi" sits. */}
          {/* Measured as a whole (the sheet's room starts under it). */}
          {/* The pill's own edge (2026-09-20 sitting 2, item 13): the dark emerald
              rim under a soft glow of rings — option C, from ui/tokens.ts paneEdges. */}
          <View onLayout={onPillLayout}>
          <Surface
            material="pane"
            radius={searchRadius}
            corners="all"
            rim={paneEdges.search.rim}
            halo={paneEdges.search.halo}
            style={styles.searchPill}
          >
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={isWorker ? submitSearch : undefined}
              placeholder="Explore nearby jobs"
              autoCapitalize="sentences"
              autoCorrect
              style={styles.searchField}
              accessibilityLabel="Explore nearby jobs"
              // The design's bright field: ink placeholder, ink mic, a 24pt
              // magnifier — the phone walk found the muted default too dim
              // over the map.
              emphasis="ink"
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
                    style={({ pressed }) => [
                      styles.distancePill,
                      !isDark && styles.distancePillLight,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      radiusMiles != null
                        ? `Distance filter, within ${radiusMiles} miles`
                        : 'Distance filter, any distance'
                    }
                  >
                    <Ionicons name="options-outline" size={18} color={isDark ? colors.gold : colors.ink} />
                    <Text style={[styles.distanceText, !isDark && styles.distanceTextLight]} numberOfLines={1}>
                      {radiusMiles != null ? distanceChipLabel(radiusMiles) : 'Any'}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            />
          </Surface>
          </View>

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
                rim={paneEdges.search.rim}
                halo={paneEdges.search.halo}
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
                  hitSlop={touchSlop(MAP_CHIP_HEIGHT - 2)}
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
            <Pressable onPress={refresh} hitSlop={touchSlop(textLine(styles.errorRetry))} accessibilityRole="button">
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
        {isWorker && sheetMaxHeight > 0 ? (
          <MapJobsSheet
            visible={!loading && !error}
            onSeeAll={() => navigateAcrossTabs('Home', 'WorkerResults', { mode: 'all' })}
            filters={jobFilters}
            onFiltersChange={setJobFilters}
            filtersOpen={filterOpen}
            onFiltersClose={() => setFilterOpen(false)}
            radiusMiles={radiusMiles ?? null}
            onRadiusChange={selectRadius}
            userLoc={userLoc}
            maxHeight={sheetMaxHeight}
            stop={sheetStop}
            onStopChange={setSheetStop}
            onPeekHeight={setPeekHeight}
            onOpenJob={(job) => navigation.navigate('JobDetail', { job })}
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
            style={[styles.countCapsule, { left: sheetInset, right: sheetInset, bottom: sheetInset + sheetBottom }]}
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
                <Pressable onPress={() => setSelected(null)} hitSlop={touchSlop(20, 20)}>
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

        {/* The Filters sheet is rendered by MapJobsSheet above (2026-09-19),
            beside the list it counts against. The distance pill on the
            search capsule opens it; components/DistanceChips.tsx stays
            byte-untouched for WorkerResults, and both surfaces still write
            the radius through readDistanceFilter / writeDistanceFilter — one
            filter vocabulary, one persistence module. */}

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
    </PalettePinContext.Provider>
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
  // narrow enough to leave the mic its room. 34 tall since the pill grew to
  // 62 (2026-09-20, sitting 2, (6)). LIGHT (that sitting's item 1, the
  // operator's "light cream same as the job info on bottom… the text to be
  // black"): the peek row's cream, no rim, ink text and glyph — the rim is
  // kept at 1pt and painted transparent so the pill's box is identical in
  // both themes and only colours fork.
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    height: MAP_DISTANCE_PILL_HEIGHT,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.sm + 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: withAlpha(colors.textMuted, 0.39),
    backgroundColor: withAlpha(colors.black, 0.12),
  },
  distancePillLight: {
    borderColor: 'transparent',
    backgroundColor: colors.background,
  },
  distanceText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gold,
  },
  distanceTextLight: {
    color: colors.ink,
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
