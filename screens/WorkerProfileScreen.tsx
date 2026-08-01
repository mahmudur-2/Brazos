import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from '../components/AvatarPressable';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PastWork } from '../components/PastWork';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { VerificationBadge } from '../components/VerificationBadge';
import { useAuth } from '../hooks/useAuth';
import {
  completionPercent,
  fetchProfileById,
  type Profile,
} from '../lib/profiles';
import { canRehireWorker, JOB_CATEGORY_LABELS } from '../lib/jobs';
import type {
  PostJobRouteParamList,
  WorkerProfileRouteParamList,
} from '../lib/navigation';
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
  // PostJob is registered alongside WorkerProfile in every stack that can
  // reach this screen, so the offer button below can push it from any of them.
  const navigation = useNavigation<NativeStackNavigationProp<PostJobRouteParamList>>();
  const { params } = useRoute<RouteProp<WorkerProfileRouteParamList, 'WorkerProfile'>>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  // Whether this viewer may send this worker a direct offer. The rule is the
  // database's, not the UI's: create_job_request() only accepts a request to
  // a worker who has already completed a job for the caller, because the
  // negotiation has to live in a conversation thread the two already share.
  const [canOffer, setCanOffer] = useState(false);

  // Guards against both unmount and params.workerId changing again before a
  // request resolves — set true at the start of each effect run, false on
  // its cleanup, checked after the await so a stale response can't land.
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await fetchProfileById(params.workerId);
    if (!activeRef.current) return;
    setProfile(data);
    // A failed fetch (network blip, RLS denial) used to be indistinguishable
    // from a genuinely sparse profile — data would just come back null and
    // every field would render its empty fallback with no explanation. This
    // surfaces it as a distinct, retryable error state instead.
    if (error) setError(error.message);
    setLoading(false);
  }, [params.workerId]);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const isSelf = !!user && user.id === params.workerId;

  useEffect(() => {
    if (!user || isSelf) return;
    let active = true;
    canRehireWorker(user.id, params.workerId).then(({ data }) => {
      if (active) setCanOffer(data);
    });
    return () => {
      active = false;
    };
  }, [user, isSelf, params.workerId]);

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
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Try again" variant="secondary" onPress={load} style={styles.retryBtn} />
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

          {!isSelf &&
            (canOffer ? (
              <Card style={styles.hireCard}>
                <Text style={styles.hireTitle}>Work with {name} again</Text>
                <Text style={styles.hireText}>
                  Send {name} a job with a price. It arrives as a request in
                  your existing conversation — they can accept, decline, or
                  suggest a different price before anything is booked.
                </Text>
                <Button
                  title="Send an offer"
                  icon="paper-plane-outline"
                  onPress={() =>
                    navigation.navigate('PostJob', {
                      hireWorkerId: params.workerId,
                      hireWorkerName: profile?.full_name ?? params.workerName ?? 'this worker',
                    })
                  }
                  style={styles.hireAction}
                />
              </Card>
            ) : (
              <Card style={styles.hireCard}>
                <Text style={styles.hireTitle}>Want {name} on a job?</Text>
                <Text style={styles.hireText}>
                  Direct offers open up once you’ve completed a job together.
                  For now, post the job — {name} can bid on it like any other
                  worker, and you pick who gets it.
                </Text>
                <Button
                  title="Post a job"
                  variant="secondary"
                  icon="briefcase-outline"
                  onPress={() => navigation.navigate('PostJob')}
                  style={styles.hireAction}
                />
              </Card>
            ))}

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
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: spacing.lg,
    minWidth: 140,
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
  hireCard: {
    gap: spacing.xs,
  },
  hireTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  hireText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  hireAction: {
    marginTop: spacing.md,
  },
});
