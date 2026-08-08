import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { BrowseJobCard, BrowseJobCardSkeleton } from '../components/BrowseJobCard';
import { FadeIn } from '../components/FadeIn';
import { ScreenHeader } from '../components/ScreenHeader';
import { useBidCounts } from '../hooks/useBidCounts';
import { useOpenJobs } from '../hooks/useOpenJobs';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

export function BrowseJobsScreen() {
  const navigation = useNavigation<HomeStackNavigation>();
  const { jobs, loading, error, refresh } = useOpenJobs();
  // One batched read for the whole page — see phase38 for why a per-card
  // count is neither correct (RLS under-counts) nor affordable (N+1).
  const bidCounts = useBidCounts(jobs.map((j) => j.id));
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="All Open Jobs"
        subtitle={
          jobs.length > 0
            ? `${jobs.length} open ${jobs.length === 1 ? 'job' : 'jobs'}`
            : undefined
        }
        onBack={() => navigation.goBack()}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        // Card-shaped placeholders rather than a centred spinner: the feed
        // arrives into the same silhouette it was loading, so nothing shifts
        // under the reader at the moment the data lands.
        <View style={styles.listContent}>
          {[0, 1, 2, 3].map((i) => (
            <BrowseJobCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FadeIn style={styles.flex}>
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
          contentContainerStyle={
            jobs.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          // The cards are taller now, so fewer fit a screen — render a batch
          // that covers the first couple of screenfuls and keep a modest
          // window either side, rather than the default sized for short rows.
          initialNumToRender={8}
          windowSize={11}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search" size={32} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No open jobs right now</Text>
              <Text style={styles.emptyText}>
                New jobs appear here automatically as clients post them.
              </Text>
            </View>
          }
        />
        </FadeIn>
      )}
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
    maxWidth: 320,
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
