import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BrowseJobCard } from '../components/BrowseJobCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useOfferCounts } from '../hooks/useOfferCounts';
import { userMessage } from '../lib/errorMessage';
import { fetchJobsInCell } from '../lib/hotspots';
import { goBackOrHome } from '../lib/navigationRef';
import type { OpenJob } from '../lib/jobs';
import type { MapStackNavigation, MapStackParamList } from '../lib/navigation';
import { supabase } from '../lib/supabase';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';

const REFRESH_DEBOUNCE_MS = 1500;

export function CellJobsScreen() {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useScrollClearance();
  const navigation = useNavigation<MapStackNavigation>();
  const { params } = useRoute<RouteProp<MapStackParamList, 'CellJobs'>>();
  const [jobs, setJobs] = useState<OpenJob[]>([]);
  // Same batched source the full list uses, so a job shows the same count
  // whichever surface it was opened from.
  const bidCounts = useOfferCounts(jobs.map((j) => j.id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const instanceId = useId();
  const runRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await fetchJobsInCell(params.ilat, params.ilng);
    if (error) setError(userMessage(error));
    else setJobs(data);
    setLoading(false);
  }, [params.ilat, params.ilng]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // A job's title/category/photos/etc. can change (edit) or a job can leave
  // this zone (deleted, or its status/location changed) while this list is
  // open — without this, the drill-down would keep showing stale data until
  // a manual pull-to-refresh. Debounced the same way useHotspots() is, since
  // a burst of changes (e.g. several edits in a row) should only reload once.
  useEffect(() => {
    const scheduleReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(load, REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`cell-jobs:${instanceId}:${runRef.current++}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        scheduleReload
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [instanceId, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // params.count is a snapshot from the moment the hotspot was tapped on the
  // map — it's only used before the real list has ever loaded, as a
  // reasonable placeholder instead of flashing "0". Once load() resolves
  // (initial fetch, pull-to-refresh, or the realtime-triggered reload above),
  // the subtitle always reflects jobs.length instead, so it can't drift out
  // of sync with the list actually on screen.
  const displayCount = loading ? params.count : jobs.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Jobs in this zone"
        subtitle={`${displayCount} open ${displayCount === 1 ? 'job' : 'jobs'} nearby`}
        onBack={goBackOrHome}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BrowseJobCard
              job={item}
              bidCount={bidCounts[item.id]}
              onPress={() => navigation.navigate('JobDetail', { job: item })}
            />
          )}
          contentContainerStyle={[
            jobs.length === 0 ? styles.emptyContainer : styles.listContent,
            { paddingBottom: navClearance },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="briefcase-outline" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No jobs here anymore</Text>
              <Text style={styles.emptyText}>
                These jobs may have just been filled. Pull to refresh.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 300,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
  },
  }),
);
