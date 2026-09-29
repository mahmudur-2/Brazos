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
  fetchProfileById,
  isProfileActive,
  type Profile,
} from '../lib/profiles';
import { canRehireWorker, JOB_CATEGORIES, JOB_CATEGORY_LABELS, type JobCategory } from '../lib/jobs';
import { fetchWorkerJobStats } from '../lib/portfolio';
import { canHire } from '../lib/rebook';
import { fetchProfileReviewSummary, type ReviewSummary } from '../lib/reviews';
import { deriveWorkerHeroTrust } from '../lib/workerHeroCard';
import { fetchSavedWorkerIds, saveWorker, unsaveWorker } from '../lib/savedWorkers';
import {
  fetchWorkerServices,
  servicePriceLabel,
  type WorkerService,
} from '../lib/services';
import { alertAsync } from '../lib/dialog';
import { moneyCeilingError } from '../lib/validation';
import { userMessage } from '../lib/errorMessage';
import { goBackOrHome } from '../lib/navigationRef';
import type {
  PostJobRouteParamList,
  ProfileReviewsRouteParamList,
  WorkerProfileRouteParamList,
} from '../lib/navigation';
import {
  fonts,
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';

/**
 * Read-only view of another user's profile — the public face of a worker's
 * reputation: the 4E hero trust content (rating · jobs completed ·
 * responds-in, positive-only and non-null only — lib/workerHeroCard.ts),
 * the categories they work in, and their curated Past Work gallery.
 *
 * Everything here is readable by any signed-in user: `profiles` is already
 * public-readable, portfolio_items has a permissive SELECT policy, and the
 * completed-job stats come from the worker_job_stats() RPC (phase17).
 */
export function WorkerProfileScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useScrollClearance();
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
  // 4E — worker_job_stats rows for the hero trust content. Null until the
  // RPC answers (and null again on failure): UNKNOWN renders nothing, and
  // can never produce the "New worker" verdict (lib/workerHeroCard.ts).
  const [jobStats, setJobStats] = useState<ReadonlyArray<{ count: number }> | null>(null);
  // R8b-c — the worker-role revealed summary behind the hero rating row.
  // Null while unanswered or failed: UNKNOWN renders no rating, never zero.
  const [ratingSummary, setRatingSummary] = useState<ReviewSummary | null>(null);
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

  useEffect(() => {
    let active = true;
    setJobStats(null);
    fetchWorkerJobStats(params.workerId).then(({ data, error: statsError }) => {
      if (active && !statsError) setJobStats(data);
    });
    return () => {
      active = false;
    };
  }, [params.workerId]);

  useEffect(() => {
    let active = true;
    setRatingSummary(null);
    fetchProfileReviewSummary(params.workerId, 'worker').then(({ data, error: summaryError }) => {
      if (active && !summaryError) setRatingSummary(data);
    });
    return () => {
      active = false;
    };
  }, [params.workerId]);

  /**
   * §6.2 — "Book at listed price": the direct-offer composer prefilled with
   * the service's own terms, NEVER a one-tap send (the composer still needs
   * a location and confirms the amount). A null price is the "Ask me" case
   * and prefills no amount; a stored over-ceiling price is refused here with
   * the written ceiling sentence before any RPC could see it — and
   * createDirectOffer() mirrors the same ceiling again at send time.
   */
  function bookService(service: WorkerService) {
    if (service.price_cents != null) {
      const ceilingProblem = moneyCeilingError(service.price_cents);
      if (ceilingProblem) {
        void alertAsync('Check this price', ceilingProblem);
        return;
      }
    }
    navigation.navigate('PostJob', {
      hireWorkerId: params.workerId,
      hireWorkerName: profile?.full_name ?? params.workerName ?? 'this worker',
      initialTitle: service.title,
      initialDescription: service.description ?? undefined,
      initialCategory: (JOB_CATEGORIES as readonly string[]).includes(service.category)
        ? (service.category as JobCategory)
        : undefined,
      ...(service.price_cents != null ? { initialAmountCents: service.price_cents } : null),
    });
  }

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
  // 4E: a tombstoned account cannot be hired or saved — the mockup's
  // Hire-on-a-deleted-user is a recorded defect, and lib/rebook.ts's canHire
  // is the ONE predicate for it (create_offer's own gate refuses it
  // server-side regardless). The profile itself still renders: the history
  // and any reviews are real.
  const hireable = canHire(profile?.full_name);
  // Signed in, not looking at yourself, and the other account is in good
  // standing. No completed-job history required — that is the whole fix.
  const canOffer = !!user && !isSelf && recipientActive && hireable;
  const heroTrust = deriveWorkerHeroTrust({ profile, ratingSummary, stats: jobStats });

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
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
          contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}
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
                {/* 4E hero trust content — positive-only, real reads,
                    non-null only (lib/workerHeroCard.ts). A rating with zero
                    REVEALED worker-role reviews is not a fact, so with none
                    there is no rating row at all — no stand-in, no "no
                    reviews yet" placeholder — and nothing to open
                    ProfileReviews on either, so the reviews entry exists
                    only with reviews. With revealed reviews the number is
                    D1's shown_average, or the word "New" while the
                    reputation is too young for one. */}
                {heroTrust.rating ? (
                  <Pressable
                    onPress={() =>
                      navigation.navigate('ProfileReviews', {
                        userId: params.workerId,
                        name,
                        role: 'worker',
                      })
                    }
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`See all ${heroTrust.rating.count} reviews for ${name}`}
                    style={({ pressed }) => [styles.proofRow, pressed && styles.proofRowPressed]}
                  >
                    <Ionicons name="star" size={14} color={starColors(colors, isDark).filled} />
                    <Text style={styles.proofStrong}>
                      {heroTrust.rating.isNew ? 'New' : heroTrust.rating.shownAverage.toFixed(1)}
                    </Text>
                    <Text style={styles.proofMuted}>
                      {`(${heroTrust.rating.count} ${
                        heroTrust.rating.count === 1 ? 'review' : 'reviews'
                      })`}
                    </Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.textSubtle} />
                  </Pressable>
                ) : null}
                {heroTrust.newWorker ? (
                  <View style={styles.proofRow}>
                    <Ionicons name="leaf-outline" size={13} color={colors.emerald} />
                    <Text style={styles.proofMuted}>New worker</Text>
                  </View>
                ) : (
                  <>
                    {heroTrust.completedJobs != null ? (
                      <View style={styles.proofRow}>
                        <Ionicons name="briefcase-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.proofMuted}>
                          {`${heroTrust.completedJobs} ${
                            heroTrust.completedJobs === 1 ? 'job' : 'jobs'
                          } completed`}
                        </Text>
                      </View>
                    ) : null}
                    {heroTrust.respondsIn ? (
                      <View style={styles.proofRow}>
                        <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.proofMuted}>{`Responds in ${heroTrust.respondsIn}`}</Text>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </View>

            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            {profile?.categories && profile.categories.length > 0 && (
              <View style={styles.chips}>
                {profile.categories.map((c) => (
                  <View key={c} style={[styles.chip, isDark && styles.chipDark]}>
                    <Text style={[styles.chipText, isDark && styles.chipTextDark]}>
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

          {/* Saving a tombstoned account would be a dead-end bookmark — the
              same §4.3 reasoning that suppresses Hire suppresses Save. */}
          {/* Masters 5 and 18 draw the saved state as a full-width card, and
              they disagree on its colour (5: green text + green bookmark;
              18: cream serif + gold bookmark). Decision 8 settles it — a
              saved-state control is emerald text and an emerald bookmark —
              so B-7 resolves to master 5's form. */}
          {!isSelf && user && hireable ? (
            <Pressable
              onPress={() => void toggleSaved()}
              disabled={savingBookmark}
              accessibilityRole="button"
              accessibilityState={{ selected: savedByMe, disabled: savingBookmark }}
              style={({ pressed }) => [
                styles.savedCard,
                pressed && styles.savedCardPressed,
              ]}
            >
              <Text style={[styles.savedLabel, savedByMe && styles.savedLabelActive]}>
                {savedByMe ? 'Saved — tap to remove' : `Save ${firstName} for later`}
              </Text>
              <Ionicons
                name={savedByMe ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={savedByMe ? colors.emerald : colors.textMuted}
              />
            </Pressable>
          ) : null}

          {services.length > 0 ? (
            <Card style={styles.servicesCard}>
              <Text style={styles.servicesTitle}>Services & pricing</Text>
              {services.map((service) => (
                <View key={service.id} style={styles.serviceRow}>
                  <View style={styles.serviceMain}>
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
                  </View>
                  {/* §6.2 — published rows carry the booking entry for a
                      viewer who can offer; a null price is the "Ask me" case
                      and opens the same composer with no amount. */}
                  {!isSelf && canOffer && service.published ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.serviceBook,
                        pressed && styles.serviceBookPressed,
                      ]}
                      onPress={() => bookService(service)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        service.price_cents != null
                          ? `Book ${service.title} at ${servicePriceLabel(service)}`
                          : `Ask about ${service.title}`
                      }
                    >
                      <Text style={styles.serviceBookText}>
                        {service.price_cents != null ? 'Request at listed price' : 'Ask about this'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  serviceRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 48,
  },
  serviceMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  serviceCopy: {
    flex: 1,
    gap: 2,
  },
  serviceBook: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.emerald,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceBookPressed: {
    opacity: 0.8,
  },
  serviceBookText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
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
    color: colors.money,
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
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Decision 9: identity and card headings are display type.
  name: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Master 18 draws the identity card's category chips as gold OUTLINES with
  // cream labels; light keeps the Heritage sage-filled pair.
  chipDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  chipTextDark: { color: colors.ink },
  // Masters 5/18's saved control: one full-width hairlined card, its label
  // centred, with the bookmark at the trailing edge.
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  savedCardPressed: { opacity: 0.82 },
  savedLabel: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.ink,
  },
  savedLabelActive: { color: colors.emerald },
  hireCard: {
    gap: spacing.xs,
  },
  hireTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  hireText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  hireAction: {
    marginTop: spacing.md,
  },
  }),
);
