import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { FilterSlider } from '../components/FilterSlider';
import { HotspotMap } from '../components/HotspotMap';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { SearchBar } from '../ui/primitives/SearchBar';
import { Sheet } from '../ui/primitives/Sheet';
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
} from '../lib/hotspots';
import { clusterPoints, type ClusterPin } from '../lib/mapClustering';
import {
  DISTANCE_FILTER_MAX,
  NEARBY_RADIUS_MILES,
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
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * RUN T2 (C11): `radius` is shadowed inside MapScreen by the distance-filter
 * state — `const [radius, setRadius] = useState<DistanceFilterMiles ...>` — so
 * the corner token cannot be named there at all, temporal dead zone or not.
 * The alias is the token under a name the component can still see; it is the
 * same binding, not a second definition.
 */
const themeRadius = radius;

/** Matches HotspotMap.native's DEFAULT_REGION span — the pre-interaction zoom. */
const INITIAL_LAT_DELTA = 0.08;

/**
 * The map's search field height.
 *
 * COPIED, not chosen: the customer Home draws the same SearchBar at
 * `DEFAULT_HOME_DESIGN_SETTINGS.searchHeight` (65, lib/homeDesignStudio.tsx),
 * and the map's is a step under it — the field here rides in a floating
 * capsule over live tiles rather than anchoring a hero, so it should read as
 * the smaller relative of the same control. Still well clear of
 * `controls.minTouchTarget`.
 */
const MAP_SEARCH_HEIGHT = 56;

/**
 * ONE open job, at rest in the bottom capsule.
 *
 * A CHILD COMPONENT so `useOpenJobs` is mounted only in worker mode — the hook
 * opens a realtime channel and fetches the whole open feed, and a customer
 * viewing the map has no use for either. Hooks cannot be called conditionally;
 * a component can be rendered conditionally.
 *
 * It reads the SAME feed and the SAME filter model the results list does, so
 * the card the map rests on is the card that list would put first. Nothing is
 * fetched twice under a second set of rules.
 */
function MapRestingJob({
  filters,
  onOpen,
}: {
  filters: JobFilterModel;
  onOpen: (job: OpenJob) => void;
}) {
  const { jobs, loading } = useOpenJobs();
  const job = useMemo(() => applyJobFilters(jobs, filters)[0] ?? null, [jobs, filters]);

  if (loading) return <WorkerJobCardSkeleton />;
  // Nothing matching is not an error and not an empty state worth a paragraph
  // inside floating chrome — the count above already says how many jobs the
  // map is showing, and "View list" is one tap away.
  if (!job) return null;
  return <WorkerJobCard job={job} variant="compact" onPress={() => onOpen(job)} />;
}

export function MapScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C11) — THE TWO FLOATING BARS AND THE CONTROLS ON THEM. Each dial
  // falls back to the value this file drew before it existed, spelled here and
  // nowhere else; the three token-backed ones take the `theme.*` scale, named
  // through `themeRadius` where the distance filter shadows `radius`.
  const headerRadius = useDialNumber('map.headerWrap.radius') ?? themeRadius.xl;
  const footerRadius = useDialNumber('map.footerBar.radius') ?? themeRadius.xl;
  const footerPaddingX = useDialNumber('map.footerBar.paddingX') ?? spacing.lg;
  const squircleSize = useDialNumber('map.squircle.size') ?? 40;
  // Master 33's chrome is gold line-work; light keeps the Heritage primary.
  const accent = isDark ? colors.gold : colors.primary;
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
  const [radius, setRadius] = useState<DistanceFilterMiles | null | undefined>(undefined);
  // The header filter sheet (2026-08-22): the budget and distance sliders.
  const [filterOpen, setFilterOpen] = useState(false);
  // The search pill's own text. It is a DISPATCH field, not a live filter:
  // the map draws hotspot cells, which carry counts and categories and no
  // text to match against, so a query resolves on the list surface that
  // actually holds jobs — the same one "View list" opens.
  const [query, setQuery] = useState('');
  // The chip row's state, expressed in the app's ONE job-filter vocabulary
  // (lib/jobFilters.ts) rather than a second one owned by this screen. Only
  // the chips the map offers are ever set here; the rest stay at their
  // defaults so the model means the same thing it means on the results list.
  const [jobFilters, setJobFilters] = useState<JobFilterModel>(DEFAULT_JOB_FILTERS);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isWorker || !userId) {
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
  }, [isWorker, userId]);

  function selectRadius(next: DistanceFilterMiles | null) {
    setRadius(next);
    if (userId) writeDistanceFilter(userId, next);
  }

  /**
   * The search pill's submit.
   *
   * It hands the query to WorkerResults — the surface "View list" already
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

  // The chips, as toggles over the two things the map can actually answer.
  const todayKey = localDateKey(new Date());
  const todayOn = jobFilters.scheduledOn != null;
  const nearbyOn = radius === NEARBY_RADIUS_MILES;

  function toggleToday() {
    setJobFilters((prev) => ({ ...prev, scheduledOn: prev.scheduledOn == null ? todayKey : null }));
  }

  // Nearby is not a filter of its own — it is the EXISTING radius set to the
  // app's standing "nearby" promise, written through the same storage path the
  // sheet and the results list use. One distance filter, one persistence
  // module; a second "nearby" boolean would be exactly the parallel vocabulary
  // the chip row is forbidden to create.
  function toggleNearby() {
    selectRadius(nearbyOn ? null : NEARBY_RADIUS_MILES);
  }

  // A chosen radius is only applicable with a real position to measure from.
  const radiusApplied = isWorker && radius != null && userLoc !== null;
  const radiusUnavailable = isWorker && radius != null && userLoc === null;

  const visibleCells = useMemo(() => {
    if (!radiusApplied || !userLoc || radius == null) return cells;
    return cellsWithinMiles(cells, userLoc.lat, userLoc.lng, radius);
  }, [cells, radiusApplied, userLoc, radius]);

  // Master 33's "N matching jobs" figure: the open-job counts of exactly the
  // cells the map is showing. Derived, never a stand-in.
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

  return (
    <View style={styles.root}>
      {/* 2026-08-23 — THE MAP IS THE GROUND, not a panel between two bands.
          It fills the whole screen absolutely: under the status bar, under
          the floating header capsule, under the floating bottom row. The
          chrome rides ON it, and the tiles are continuous behind both. */}
      <View style={styles.mapLayer}>
        <HotspotMap
          cells={cells}
          loading={loading}
          onSelectCell={setSelected}
          pins={pins}
          onSelectPin={setActivePin}
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
        {/* 4D-4: chrome and tiles resolve together — the MapView follows the
            in-app theme (HotspotMap.native userInterfaceStyle), so palette-
            driven chrome no longer exposes light-map-on-dark-chrome gaps. */}
        {/* 2026-08-24 — THE CAPSULE HOLDS A FIELD, not a title. The 26pt
            "Find Jobs Near You" display heading is gone: it named the screen
            the user had already chosen to be on, and it was the single largest
            thing the capsule had to keep legible over live tiles. The shared
            SearchBar takes its place, so the capsule's own ground stops being
            a type backing (see `headerWrap` for what that let the alpha do).
            The distance control keeps its place at the right, inside the same
            capsule, with its behaviour unchanged. */}
        <View style={[styles.headerWrap, { borderRadius: headerRadius }]}>
          <View style={styles.searchRow}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={isWorker ? submitSearch : undefined}
              placeholder="Find nearby jobs"
              autoCapitalize="sentences"
              autoCorrect
              style={styles.searchField}
              accessibilityLabel="Find nearby jobs"
            />
            {/* Worker-only, for the same §F reason the old "See all jobs"
                control was: the distance filter is worker discovery state, and
                customer mode has no radius to set. Perspective from
                ModeContext, never a passed prop.
                It opens the filter sheet below, and when a radius is applied
                it widens to carry its label so the active distance is readable
                without opening anything. */}
            {isWorker ? (
              <Pressable
                onPress={() => setFilterOpen(true)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.squircle,
                  { width: squircleSize, height: squircleSize },
                  radius != null && styles.squircleLabeled,
                  pressed && styles.squirclePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  radius != null
                    ? `Distance filter, within ${radius} miles`
                    : 'Distance filter, any distance'
                }
              >
                <Ionicons name="options-outline" size={20} color={accent} />
                {radius != null ? (
                  <Text style={styles.squircleLabel}>{`${radius} mi`}</Text>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* THE CHIP ROW, under the capsule and floating on the tiles like it.
            Each chip carries its own opaque pill and hairline (the Chip
            primitive), so nothing here depends on the capsule's ground.
            Two chips, not three. HOURLY IS ABSENT AND THAT IS DELIBERATE:
            `jobs` has no hourly-versus-fixed column. The only `price_unit`
            in the schema is on `worker_services` (phase53) — a worker's own
            service listing, not a posted job — so an Hourly chip here could
            only be inferred from a price shape, which would be inventing
            marketplace data about somebody's job. It ships when the column
            does. */}
        {isWorker ? (
          <View style={styles.chipRow}>
            <Chip
              label="Today"
              variant="filter"
              selected={todayOn}
              onPress={toggleToday}
              accessibilityLabel={
                todayOn ? 'Showing jobs scheduled for today' : 'Show only jobs scheduled for today'
              }
            />
            <Chip
              label="Nearby"
              variant="filter"
              selected={nearbyOn}
              onPress={toggleNearby}
              accessibilityLabel={
                nearbyOn
                  ? `Showing jobs within ${NEARBY_RADIUS_MILES} miles`
                  : `Show only jobs within ${NEARBY_RADIUS_MILES} miles`
              }
            />
          </View>
        ) : null}

        {/* 2026-08-22: the "MAP DISCOVERY / Open jobs on the map" header card
            is GONE on operator instruction — the map fills from directly under
            the title to directly above the bottom row. The distance controls
            it carried moved into the header filter sheet below; the customer
            tier legend rode in the card and went with it. */}

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

        {/* The map is BEHIND this layer, not inside it (see `mapLayer`): what
            sits here is the space it shows through — a flexing, inert gap that
            pushes the bottom row to the foot of the screen and takes no touch
            of its own, so a tap between the two capsules reaches the tiles. */}
        <View style={styles.mapSpacer} pointerEvents="none" />

        {/* The bottom row: reduced 2026-08-22 from the "NEAR YOU" footer card
            to a compact bar on the page ground, and 2026-08-23 from that bar
            to a FLOATING capsule — count left, "View list →" right, tiles
            running underneath. (The only map mockup on disk,
            Discover_Map_Dark.png, is a rejected word-named render and draws
            the solid slab both passes have now removed; with no numbered
            master for this screen, the dispatch's instruction governs.) The
            contrast question the 2026-08-22 note answered by NOT overlaying
            tiles is answered here by the capsule's own translucent ground —
            see `footerBar`. The count is still the sum of the cells actually
            in view — never a placeholder, absent while loading. */}
        {!loading && !error ? (
          <View
            style={[
              styles.footerBar,
              { borderRadius: footerRadius, paddingHorizontal: footerPaddingX },
            ]}
          >
            <View style={styles.footerTopRow}>
              <Text style={styles.footerCount} numberOfLines={1}>
                {visibleJobCount} open {visibleJobCount === 1 ? 'job' : 'jobs'}
              </Text>
              {isWorker ? (
                <Pressable
                  onPress={() => navigateAcrossTabs('Home', 'WorkerResults', { mode: 'all' })}
                  hitSlop={8}
                  style={({ pressed }) => [styles.listLink, pressed && styles.squirclePressed]}
                  accessibilityRole="button"
                  accessibilityLabel="View the list of open jobs"
                >
                  <Text style={styles.listLinkText}>View list</Text>
                  <Ionicons name="arrow-forward" size={16} color={accent} />
                </Pressable>
              ) : null}
            </View>
            {isWorker ? (
              <>
                {/* The subtitle states the radius the count was taken under,
                    so "N open jobs" is never read as "N in the world". It says
                    what is TRUE: with no radius the reach is the map's, not a
                    number nobody set. */}
                <Text style={styles.footerSubtitle} numberOfLines={1}>
                  {radius != null
                    ? `Near you · Within ${radius} ${radius === 1 ? 'mile' : 'miles'}`
                    : 'Near you · Any distance'}
                </Text>
                {/* ONE card, at rest. Not a list: "View list" already opens
                    the real one, and a second scrollable feed inside the map's
                    chrome would be a second results screen. */}
                <MapRestingJob
                  filters={jobFilters}
                  onOpen={(job) => navigation.navigate('JobDetail', { job })}
                />
              </>
            ) : null}
          </View>
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
            where the distance half was a chip row plus a stepper.

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
          {radius !== undefined ? (
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
                value={radius ?? 0}
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
  // tiles resolve, and behind the translucent capsules. It was `mapWrap`'s
  // before the map became the ground layer.
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // The chrome layer paints NOTHING. Every pixel of colour on this screen is
  // either the map or one of the two capsules below.
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // 2026-08-23 — THE HEADER FLOATS. It used to be an opaque `background`
  // slab with the map beginning underneath it; the map now runs full-bleed
  // and the title and filter control ride on it inside an inset, rounded,
  // TRANSLUCENT capsule. Tiles stay visible through it, which is the point —
  // an opaque band here is a second screen stacked on the first.
  //
  // THE ALPHA IS A LEGIBILITY FLOOR, not a taste value — and 2026-08-24
  // RE-DERIVED it rather than lowering it, because what the capsule has to
  // keep legible changed.
  //
  // It was 0.82 because a 26pt display title sat DIRECTLY on this ground, with
  // nothing but the ground between the type and whatever tile was underneath.
  // Arbitrary tiles have no guaranteed contrast against anything, so the
  // capsule had to be very nearly the page.
  //
  // That title is gone. Every child of this capsule now draws its OWN opaque
  // field: the SearchBar's pill is `colors.surface` with a hairline, and the
  // distance control is the same pair. No glyph, no character of text touches
  // this ground any more. Its remaining jobs are to group the two controls and
  // to keep its own hairline readable over a busy tile — neither of which is a
  // contrast problem — so it can be what the operator asked for and read as
  // glass. 0.55 still carries over half the page ground, which is what keeps
  // the group from dissolving into the map at a glance.
  //
  // THE BOTTOM ROW DID NOT GET THIS NUMBER, and the difference is the point:
  // it still sets type on its own ground. See `footerBar`.
  headerWrap: {
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.background, 0.55),
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  searchField: {
    flex: 1,
    minHeight: MAP_SEARCH_HEIGHT,
  },
  // The chips float on the tiles beside the capsule rather than inside it —
  // each is its own pill with its own fill and hairline, so the row needs no
  // ground of its own and adds none.
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  // Master 33's gold-outline squircle control, at the header's right.
  squircle: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  squirclePressed: { opacity: 0.8 },
  // With a radius applied the control widens into a labeled pill so the
  // header reads the active distance without opening the sheet.
  squircleLabeled: {
    width: undefined,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
  },
  squircleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gold,
  },
  // The compact bottom row: 2026-08-22 reduced it from a footer CARD to a
  // band on the page ground; 2026-08-23 takes the band away too. It is the
  // header's capsule at the other end of the screen — same inset, same
  // radius, same hairline, same translucency — floating clear of the nav
  // pill rather than sitting in a slab of its own.
  //
  // ITS ALPHA IS ITS OWN, and lower than 0.82 but higher than the header's.
  // The count and "View list" still sit directly on this ground, and the
  // subtitle joined them — bare type over live tiles, exactly the problem 0.82
  // was picked for. It is SMALLER type than the title that number was derived
  // for (17pt and 16pt against 26pt), which needs at least as much backing,
  // not less, so the floor could not simply follow the header's down.
  //
  // 0.72 is what it can afford: the ground is still the dominant contributor
  // to what sits behind the type, so the worst case a tile can produce is a
  // bounded shift toward its own luminance rather than a takeover — a bright
  // road label under light's near-black ink, or a bright POI under dark's
  // cream. The hairline is doing the rest, in both palettes.
  //
  // The resting card below is not part of that calculation: WorkerJobCard
  // brings its own opaque surface, like the header's controls do.
  footerBar: {
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.background, 0.72),
  },
  footerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
  footerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  footerCount: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  listLink: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  listLinkText: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
    color: colors.gold,
  },
  filterSheetBody: {
    gap: spacing.md,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  stepperLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepperValue: {
    minWidth: 96,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  // THE GROUND LAYER. Absolute rather than `flex: 1` so the tiles run behind
  // the header capsule, behind the bottom row and under the status bar —
  // the whole screen is the map, and the chrome is on top of it.
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  // The inert gap the map shows through, between the two capsules.
  mapSpacer: {
    flex: 1,
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
  // Inside the header card now (master 33), so it carries no gutter of its
  // own and no background of its own.
  chipsWrap: {
    gap: spacing.xs,
  },
  radiusNote: {
    fontSize: 13,
    color: colors.textMuted,
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
