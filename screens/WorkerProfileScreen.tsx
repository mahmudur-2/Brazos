import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from '../components/AvatarPressable';
import { Card } from '../components/Card';
import { PastWork } from '../components/PastWork';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { VerificationBadge } from '../components/VerificationBadge';
import {
  completionPercent,
  fetchProfileById,
  type Profile,
} from '../lib/profiles';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import type { WorkerProfileRouteParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Read-only view of another user's profile — the public face of a worker's
 * reputation: rating, verification, the categories they work in, and their
 * curated Past Work gallery.
 *
 * Everything here is readable by any signed-in user: `profiles` is already
 * public-readable, portfolio_items has a permissive SELECT policy, and the
 * completed-job stats come from the worker_job_stats() RPC (phase17).
 */
export function WorkerProfileScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<WorkerProfileRouteParamList, 'WorkerProfile'>>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchProfileById(params.workerId).then(({ data }) => {
      if (!active) return;
      setProfile(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [params.workerId]);

  const name = profile?.full_name ?? params.workerName ?? 'Worker';
  const ratingCount = profile?.rating_count ?? 0;
  const completion = completionPercent(profile?.completion_rate);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Card>
            <View style={styles.headerRow}>
              <AvatarPressable
                name={name}
                uri={profile?.avatar_url}
                size={64}
                onLongPress={
                  profile?.avatar_url ? () => setAvatarUri(profile.avatar_url) : undefined
                }
              />
              <View style={styles.headerText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  <VerificationBadge status={profile?.verification_status} />
                </View>
                <View style={styles.proofRow}>
                  <Ionicons name="star" size={14} color={colors.star} />
                  <Text style={styles.proofStrong}>
                    {ratingCount > 0 ? (profile?.rating_avg ?? 0).toFixed(1) : 'New'}
                  </Text>
                  <Text style={styles.proofMuted}>
                    {ratingCount > 0
                      ? `(${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'})`
                      : 'no reviews yet'}
                  </Text>
                  {completion != null && (
                    <>
                      <Text style={styles.dot}>·</Text>
                      <Text style={styles.proofMuted}>{completion}% completed</Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            {profile?.categories && profile.categories.length > 0 && (
              <View style={styles.chips}>
                {profile.categories.map((c) => (
                  <View key={c} style={styles.chip}>
                    <Text style={styles.chipText}>
                      {JOB_CATEGORY_LABELS[c as keyof typeof JOB_CATEGORY_LABELS] ?? c}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <PastWork workerId={params.workerId} />
        </ScrollView>
      )}

      <PhotoViewer
        visible={!!avatarUri}
        uri={avatarUri}
        onClose={() => setAvatarUri(null)}
        allowShare={false}
      />
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proofStrong: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  proofMuted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  dot: {
    fontSize: 13,
    color: colors.textSubtle,
    marginHorizontal: 2,
  },
  bio: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
    marginTop: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});
