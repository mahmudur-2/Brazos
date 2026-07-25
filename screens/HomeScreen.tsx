import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/Button';
import { BrowseJobCard } from '../components/BrowseJobCard';
import { useAuth } from '../hooks/useAuth';
import { useOpenJobs } from '../hooks/useOpenJobs';
import { useProfile } from '../hooks/useProfile';
import type { HomeStackNavigation } from '../lib/navigation';
import { colors, spacing } from '../lib/theme';

const PREVIEW_COUNT = 3;

export function HomeScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { jobs, loading } = useOpenJobs();
  const navigation = useNavigation<HomeStackNavigation>();

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const preview = jobs.slice(0, PREVIEW_COUNT);

  function goToFindWork() {
    navigation.navigate('BrowseJobs');
  }

  function openJob(job: (typeof jobs)[number]) {
    navigation.navigate('JobDetail', { job });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{firstName ? `Hi, ${firstName}` : 'Home'}</Text>
          <Text style={styles.subtitle}>
            {user?.email ?? 'Post a job or find work'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button title="Post a Job" onPress={() => navigation.navigate('PostJob')} />
          <Button title="Find Work" variant="secondary" onPress={goToFindWork} />
        </View>

        <View style={styles.previewSection}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>Nearby open jobs</Text>
            <Pressable onPress={goToFindWork} hitSlop={8}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.previewLoader} />
          ) : preview.length === 0 ? (
            <Text style={styles.previewEmpty}>
              No open jobs right now — check back soon.
            </Text>
          ) : (
            <View style={styles.previewList}>
              {preview.map((job) => (
                <BrowseJobCard key={job.id} job={job} onPress={() => openJob(job)} />
              ))}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.xxl,
  },
  header: {
    gap: spacing.xs + 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.md,
  },
  previewSection: {
    flex: 1,
    gap: spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  previewLoader: {
    marginTop: spacing.lg,
  },
  previewEmpty: {
    fontSize: 14,
    color: colors.textMuted,
  },
  previewList: {
    gap: spacing.md,
  },
});
