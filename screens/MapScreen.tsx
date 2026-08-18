import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  HOTSPOT_TIERS,
  cellsWithinMiles,
  fetchJobsWithinRadius,
  fetchOpenJobsInCells,
  milesBetween,
  summarizeCategories,
  tierForCount,
  type HotspotCell,
} from '../lib/hotspots';
import { clusterPoints, type ClusterPin } from '../lib/mapClustering';
import { type DistanceFilterMiles } from '../lib/discoveryFilter';
import { readDistanceFilter, writeDistanceFilter } from '../lib/discoveryFilterStorage';
import { userMessage } from '../lib/errorMessage';
import { useMode } from '../modes';
import type { MapStackNavigation } from '../lib/navigation';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { colors, radius, shadows, spacing } from '../lib/theme';

/** Matches HotspotMap.native's DEFAULT_REGION span — the pre-interaction zoom. */
const INITIAL_LAT_DELTA = 0.08;

export function MapScreen() {
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
  // B3: the persisted distance filter, shared with WorkerResults through
  // lib/discoveryFilterStorage. undefined = still reading.
  const [radius, setRadius] = useState<DistanceFilterMiles | null | undefined>(undefined);

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
      {/* The map screen intentionally uses the app's fixed cream palette so
          iOS dark mode cannot expose dark gaps around the light map. */}
      <View style={styles.headerWrap}>
        <ScreenHeader
          title="Find Jobs Near You"
          titleSize={26}
          // Same Ionicons family and outline weight as the tab bar's own Map
          // pin, so the two read as the same icon set rather than two styles.
          titleIcon={
            <Ionicons name="location-outline" size={22} color={colors.primary} />
          }
          // Worker-only. Map is a SHARED tab, so this screen renders in both
          // modes, but its destination — `WorkerResults`, the worker job
          // list — exists only in the worker tree's Home stack. Rendering the
          // control in customer mode offered a worker surface to a customer
          // (§F) and threw "The 'state' or 'screen' passed in the params
          // couldn't be applied to the navigator with the screens: HomeMain,
          // PostJob, WorkerSearch, WorkerProfile, ProfileReviews" when
          // tapped. Absent beats disabled beats a redirect somewhere else:
          // there is no customer equivalent of "all open jobs" to send them
          // to.
          //
          // Same mode-conditional shape SubmitBidScreen and JobDetailScreen
          // use — perspective read from ModeContext, never a passed prop.
          right={
            mode === 'worker' ? (
              <Pressable
                // Reuses the existing complete open-jobs list rather than
                // duplicating it inside MapStack.
                onPress={() => navigateAcrossTabs('Home', 'WorkerResults', { mode: 'all' })}
                hitSlop={10}
              >
                <Text style={styles.seeAll}>See All Jobs</Text>
              </Pressable>
            ) : null
          }
        />
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

      {/* B3: the persisted distance filter, over the map's pin set. Only
          meaningful with a real position — a chosen radius with no location
          is announced rather than silently ignored or faked. */}
      {isWorker && radius !== undefined && (
        <View style={styles.chipsWrap}>
          <DistanceChips value={radius ?? null} onChange={selectRadius} />
          {radiusUnavailable ? (
            <Text style={styles.radiusNote}>
              Location is off — showing all areas.
            </Text>
          ) : null}
        </View>
      )}

      {/* The tier legend explains the customer glow overlay's colors. Worker
          mode renders count-badged pins instead — the number IS the legend —
          so the row would only describe something no longer on screen. */}
      {!isWorker && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.legend, { borderBottomColor: colors.border }]}
          contentContainerStyle={styles.legendContent}
        >
          {HOTSPOT_TIERS.map((t) => (
            <View key={t.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: t.stroke }]} />
              <Text style={[styles.legendLabel, { color: colors.textMuted }]}>
                {t.label}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrap: {
    backgroundColor: colors.background,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  legend: {
    flexGrow: 0,
    borderBottomWidth: 1,
    // No explicit background before this — it inherited the SafeAreaView's
    // palette.background, which goes near-black in dark mode. That left a
    // black strip between the (already hardcoded-white) header above it and
    // the map below, since nothing here was opaque. Same fix as the header:
    // fixed light, not palette-driven, matching the rest of the app for now.
    backgroundColor: colors.background,
  },
  legendContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
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
  chipsWrap: {
    backgroundColor: colors.background,
  },
  radiusNote: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
});
