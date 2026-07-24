import { useCallback, useEffect, useState } from 'react';
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
import { fetchJobsInCell } from '../lib/hotspots';
import type { OpenJob } from '../lib/jobs';
import type { MapStackNavigation, MapStackParamList } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

export function CellJobsScreen() {
  const navigation = useNavigation<MapStackNavigation>();
  const { params } = useRoute<RouteProp<MapStackParamList, 'CellJobs'>>();
  const [jobs, setJobs] = useState<OpenJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await fetchJobsInCell(params.ilat, params.ilng);
    if (error) setError(error.message);
    else setJobs(data);
    setLoading(false);
  }, [params.ilat, params.ilng]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Jobs in this zone"
        subtitle={`${params.count} open ${params.count === 1 ? 'job' : 'jobs'} nearby`}
        onBack={() => navigation.goBack()}
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
              onPress={() => navigation.navigate('JobDetail', { job: item })}
            />
          )}
          contentContainerStyle={
            jobs.length === 0 ? styles.emptyContainer : styles.listContent
          }
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

const styles = StyleSheet.create({
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
});
