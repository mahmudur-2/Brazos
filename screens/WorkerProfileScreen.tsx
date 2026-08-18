import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { useAuth } from '../hooks/useAuth';
import {
  completionPercent,
  fetchProfileById,
  isProfileActive,
  type Profile,
} from '../lib/profiles';
import { canRehireWorker, JOB_CATEGORIES, JOB_CATEGORY_LABELS, type JobCategory } from '../lib/jobs';
import { fetchSavedWorkerIds, saveWorker, unsaveWorker } from '../lib/savedWorkers';
import {
  fetchWorkerServices,
  servicePriceLabel,
  type WorkerService,
} from '../lib/services';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import type {
  PostJobRouteParamList,
  ProfileReviewsRouteParamList,
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
  // (tests/crossTabNavigation.test.mjs executes that claim per stack — it was
  // false once, for the worker Home tab, and crashed on device 2026-08-10.)
  const navigation =
    useNavigation<
      NativeStackNavigationProp<PostJobRouteParamList & ProfileReviewsRouteParamList>
    >();
  const { params } = useRoute<RouteProp<WorkerProfileRouteParamList, 'WorkerProfile'>>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  /**
   * Whether these two have already completed a job together. This only
   * chooses the WORDING now — before phase36 it decided whether a direct
   * offer was possible at all, which is what made one worker's profile offer
   * "Send an offer" and another's a "Post a job" consolation. Any signed-in
   * user can offer any active worker work; the pair simply gets no shared
   * conversation to post into until they have one, and phase36 creates a
   * direct thread for exactly that case.
   */
  const [workedTogether, setWorkedTogether] = useState(false);
  // Phase 9: published services (RLS hides other people's drafts) and the
  // viewer's own saved state for this worker.
  const [services, setServices] = useState<WorkerService[]>([]);
  const [savedByMe, setSavedByMe] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  /**
   * Banned/suspended accounts can't be transacted with. `banned` is not
   * publicly readable (phase29), so this asks the narrow RPC instead. Starts
   * true so the action doesn't flicker out and back in for the normal case.
   */
  const [recipientActive, setRecipientActive] = useState(true);

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
    if (error) setError(userMessage(error));
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
      if (active) setWorkedTogether(data);
    });
    isProfileActive(params.workerId).then(({ data }) => {
      if (active) setRecipientActive(data);
    });
    fetchSavedWorkerIds(user.id).then(({ data }) => {
      if (active) setSavedByMe(data.has(params.workerId));
    });
    return () => {
      active = false;
    };
  }, [user, isSelf, params.workerId]);

  useEffect(() => {
    let active = true;
    setServices([]);
    fetchWorkerServices(params.workerId).then(({ data, error: servicesError }) => {
      if (active && !servicesError) setServices(data.filter((s) => s.published || isSelf));
    });
    return () => {
      active = false;
    };
  }, [params.workerId, isSelf]);

  async function toggleSaved() {
    if (!user || isSelf || savingBookmark) return;
    setSavingBookmark(true);
    const { error: saveError } = savedByMe
      ? await unsaveWorker(user.id, params.workerId)
      : await saveWorker(user.id, params.workerId);
    setSavingBookmark(false);
    if (!saveError) setSavedByMe((v) => !v);
  }

  const name = profile?.full_name ?? params.workerName ?? 'Worker';
  // Headings address the person, so they use the first name the way a message
  // to them would; the button stays the same in both cases.
  const firstName = name.trim().split(/\s+/)[0] || name;
  // Signed in, not looking at yourself, and the other account is in good
  // standing. No completed-job history required — that is the whole fix.
  const canOffer = !!user && !isSelf && recipientActive;
  const ratingCount = profile?.rating_count ?? 0;
  const completion = completionPercent(profile?.completion_rate);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Profile" onBack={goBackOrHome} />

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
                </View>
                {/* The rating row is the way into the full reviews list, so it
                    behaves as a button — with a chevron saying so and enough
                    vertical hit slop to clear 44pt without pushing the header
                    layout around. */}
                <Pressable
                  onPress={() =>
                    navigation.navigate('ProfileReviews', {
                      userId: params.workerId,
                      name,
                    })
                  }
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    ratingCount > 0
                      ? `See all ${ratingCount} reviews for ${name}`
                      : `See reviews for ${name}`
                  }
                  style={({ pressed }) => [styles.proofRow, pressed && styles.proofRowPressed]}
                >
                  <Ionicons name="star" size={14} color={colors.star} />
                  <Text style={styles.proofStrong}>
                    {ratingCount > 0 ? (profile?.rating_avg ?? 0).toFixed(1) : 'New'}
                  </Text>
                  <Text style={styles.proofMuted}>
                    {ratingCount > 0
                      ? `(${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'})`
                      : 'no reviews yet'}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.textSubtle} />
                </Pressable>
                {completion != null && (
                  <Text style={styles.proofMuted}>{completion}% completed</Text>
                )}
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

          {/* Phase 9 — availability truth + saved toggle + services. */}
          {profile && (profile.accepting_work === false || profile.availability_note) ? (
            <Card style={styles.availabilityCard}>
              <Ionicons
                name={profile.accepting_work === false ? 'moon-outline' : 'sunny-outline'}
                size={18}
                color={profile.accepting_work === false ? colors.textMuted : colors.emerald}
              />
              <Text style={styles.availabilityText}>
                {profile.accepting_work === false
                  ? `${firstName} isn’t taking new work right now.`
                  : `${firstName} is taking new work.`}
                {profile.availability_note ? ` ${profile.availability_note}` : ''}
              </Text>
            </Card>
          ) : null}

          {!isSelf && user ? (
            <Button
              title={savedByMe ? 'Saved — tap to remove' : `Save ${firstName} for later`}
              variant="secondary"
              icon={savedByMe ? 'bookmark' : 'bookmark-outline'}
              onPress={() => void toggleSaved()}
              loading={savingBookmark}
            />
          ) : null}

          {services.length > 0 ? (
            <Card style={styles.servicesCard}>
              <Text style={styles.servicesTitle}>Services & pricing</Text>
              {services.map((service) => (
                <Pressable
                  key={service.id}
                  style={styles.serviceRow}
                  onPress={
                    !isSelf && canOffer
                      ? () =>
                          navigation.navigate('PostJob', {
                            hireWorkerId: params.workerId,
                            hireWorkerName:
                              profile?.full_name ?? params.workerName ?? 'this worker',
                            initialTitle: service.title,
                            initialCategory: (JOB_CATEGORIES as readonly string[]).includes(
                              service.category
                            )
                              ? (service.category as JobCategory)
                              : undefined,
                          })
                      : undefined
                  }
                  accessibilityRole={!isSelf && canOffer ? 'button' : 'text'}
                  accessibilityLabel={`${service.title}, ${servicePriceLabel(service)}`}
                >
                  <View style={styles.serviceCopy}>
                    <Text style={styles.serviceName} numberOfLines={1}>
                      {service.title}
                      {service.published ? '' : '  ·  Draft'}
                    </Text>
                    {service.description ? (
                      <Text style={styles.serviceDescription} numberOfLines={2}>
                        {service.description}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.servicePrice}>{servicePriceLabel(service)}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {canOffer && (
            <Card style={styles.hireCard}>
              <Text style={styles.hireTitle}>
                {workedTogether
                  ? `Work with ${firstName} again`
                  : `Send ${firstName} a job offer`}
              </Text>
              <Text style={styles.hireText}>
                {workedTogether
                  ? `Send ${firstName} a job with a price. It arrives as an offer in your existing conversation — they can accept, decline, or suggest a different price before anything is booked.`
                  : `Send ${firstName} a job with a price. It goes to them privately — nobody else sees it, and it never appears in open jobs. They can accept, decline, or suggest a different price before anything is booked.`}
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
          )}

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
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  availabilityText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  servicesCard: {
    gap: spacing.sm,
  },
  servicesTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 48,
  },
  serviceCopy: {
    flex: 1,
    gap: 2,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  serviceDescription: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  servicePrice: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.emerald,
  },
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
    alignSelf: 'flex-start',
  },
  proofRowPressed: {
    opacity: 0.6,
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
