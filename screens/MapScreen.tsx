import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { HotspotMap } from '../components/HotspotMap';
import { ScreenHeader } from '../components/ScreenHeader';
import { DistanceChips } from '../components/DistanceChips';
import { WorkerJobCard, WorkerJobCardSkeleton } from '../components/WorkerJobCard';
import { Sheet } from '../ui/primitives/Sheet';
import { useAuth } from '../hooks/useAuth';
import { useHotspots } from '../hooks/useHotspots';
import { useOfferCounts } from '../hooks/useOfferCounts';
import { JOB_CATEGORY_LABELS, type OpenJob } from '../lib/jobs';
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
  clampDistanceFilterMiles,
  distanceChipLabel,
  type DistanceFilterMiles,
} from '../lib/discoveryFilter';
import { readDistanceFilter, writeDistanceFilter } from '../lib/discoveryFilterStorage';
import { userMessage } from '../lib/errorMessage';
import { useMode } from '../modes';
import type { MapStackNavigation } from '../lib/navigation';
import { navigateAcrossTabs } from '../lib/navigationRef';
import {
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

/** Matches HotspotMap.native's DEFAULT_REGION span — the pre-interaction zoom. */
const INITIAL_LAT_DELTA = 0.08;

export function MapScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
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
  // The header filter sheet (2026-08-22): presets + the custom stepper.
  const [filterOpen, setFilterOpen] = useState(false);

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

  const sheetBidCounts = useOfferCounts(
    useMemo(() => (pinJobs ?? []).map((job) => job.id), [pinJobs])
  );

  function openJobFromSheet(job: OpenJob) {
    setActivePin(null);
    navigation.navigate('JobDetail', { job });
  }

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top']}
    >
      {/* 4D-4: chrome and tiles resolve together — the MapView follows the
          in-app theme (HotspotMap.native userInterfaceStyle), so palette-
          driven chrome no longer exposes light-map-on-dark-chrome gaps. */}
      <View style={styles.headerWrap}>
        <ScreenHeader
          title="Find Jobs Near You"
          titleSize={26}
          // Same Ionicons family and outline weight as the tab bar's own Map
          // pin, so the two read as the same icon set rather than two styles.
          titleIcon={
            <Ionicons name="location-outline" size={22} color={colors.primary} />
          }
          // Worker-only, for the same §F reason the old "See all jobs"
          // control was: the distance filter is worker discovery state, and
          // customer mode has no radius to set. Perspective from ModeContext,
          // never a passed prop.
          //
          // 2026-08-22: this slot is the FILTER now — it opens the distance
          // sheet below, and when a radius is applied the control widens to
          // carry its label so the active distance is readable from the
          // header. The list intent it used to duplicate lives on in the
          // bottom row's "View list".
          right={
            mode === 'worker' ? (
              <Pressable
                onPress={() => setFilterOpen(true)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.squircle,
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
            ) : null
          }
        />
      </View>

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

      <View style={styles.mapWrap}>
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

      {/* The bottom row, reduced 2026-08-22 from the "NEAR YOU" footer card
          to ONE compact bar on the page ground — count left, "View list →"
          right, no solid slab behind it. (The only map mockup on disk,
          Discover_Map_Dark.png, is a rejected word-named render and draws
          the very slab this removes; with no numbered master for this
          screen, the dispatch's instruction governs, and the row sits in a
          minimal bar rather than overlaying tiles so its text never fights
          the map for contrast.) The count is still the sum of the cells
          actually in view — never a placeholder, absent while loading. */}
      {!loading && !error ? (
        <View style={styles.footerBar}>
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

      {/* The distance filter sheet (2026-08-22) — the presets as the SAME
          DistanceChips row the results list draws, plus the custom stepper:
          1–50 whole miles, each tap applied immediately. From Any, the first
          tap in either direction turns the dial on at 10 mi; the value then
          steps by one. Session-only state — see lib/discoveryFilterStorage. */}
      <Sheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Distance"
      >
        {radius !== undefined ? (
          <View style={styles.filterSheetBody}>
            <DistanceChips value={radius ?? null} onChange={selectRadius} />
            <View style={styles.stepperRow}>
              <Text style={styles.stepperLabel}>Custom</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() =>
                    selectRadius(
                      radius == null ? 10 : clampDistanceFilterMiles(radius - 1)
                    )
                  }
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.stepperButton,
                    pressed && styles.squirclePressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="One mile closer"
                >
                  <Ionicons name="remove" size={20} color={accent} />
                </Pressable>
                <Text style={styles.stepperValue} numberOfLines={1}>
                  {distanceChipLabel(radius ?? null)}
                </Text>
                <Pressable
                  onPress={() =>
                    selectRadius(
                      radius == null ? 10 : clampDistanceFilterMiles(radius + 1)
                    )
                  }
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.stepperButton,
                    pressed && styles.squirclePressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="One mile farther"
                >
                  <Ionicons name="add" size={20} color={accent} />
                </Pressable>
              </View>
            </View>
            {radiusUnavailable ? (
              <Text style={styles.radiusNote}>
                Location is off — showing all areas.
              </Text>
            ) : null}
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
        ) : pinJobs === null ? (
          <View style={styles.pinSheetList}>
            {[0, 1, 2].map((i) => (
              <WorkerJobCardSkeleton key={i} />
            ))}
          </View>
        ) : pinJobs.length === 0 ? (
          <View style={styles.pinSheetState}>
            <Text style={styles.pinSheetEmpty}>
              These jobs just closed or were taken down — pull the map's data
              again in a moment.
            </Text>
          </View>
        ) : (
          <View style={styles.pinSheetList}>
            {pinJobs.map((job) => (
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
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrap: {
    backgroundColor: colors.background,
  },
  // Master 33's gold-outline squircle control, at the header's right.
  squircle: {
    width: 40,
    height: 40,
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
  // The compact bottom row (2026-08-22): the page ground, no card slab.
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
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
  mapWrap: {
    flex: 1,
    backgroundColor: colors.background,
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
