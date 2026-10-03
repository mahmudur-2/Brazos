import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReportContentLink } from '../components/ReportContentLink';
import { useHiddenUserIds } from '../hooks/useHiddenUserIds';
import { ScreenHeader } from '../components/ScreenHeader';
import { StarRating } from '../components/StarRating';
import { userMessage } from '../lib/errorMessage';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import { goBackOrHome } from '../lib/navigationRef';
import {
  fetchBothRoleSummaries,
  fetchProfileReviews,
  fetchProfileReviewSummary,
  type ProfileReview,
  type ReviewRole,
  type ReviewSummary,
} from '../lib/reviews';
import { formatTimeAgo } from '../lib/time';
import type { ProfileReviewsRouteParamList } from '../lib/navigation';
import {
  fonts,
  radius,
  selectedInDark,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { useScrollClearance } from '../ui/primitives';

const PAGE_SIZE = 20;
const STARS = [5, 4, 3, 2, 1] as const;

/**
 * Every review written about one person, reached by tapping the rating row on
 * their profile.
 *
 * The aggregate at the top and the list beneath it are counted from the same
 * review rows (profile_review_summary / profile_reviews, phase37), so the
 * header can never claim "2 reviews" above three of them.
 *
 * Which reputation it shows is the route's `role`. Another person's profile
 * pins one role; the own-account entries pass 'both', which adds the
 * Work / Hiring toggle — reputation is kept per role (R8a D4) and mixing the
 * two back into one page would blur what the split exists to keep apart.
 */
export function ProfileReviewsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useScrollClearance();
  const { params } =
    useRoute<RouteProp<ProfileReviewsRouteParamList, 'ProfileReviews'>>();
  const paramRole = params.role;

  const [activeRole, setActiveRole] = useState<ReviewRole>(
    paramRole === 'customer' ? 'customer' : 'worker'
  );
  const [summaries, setSummaries] = useState<{
    worker: ReviewSummary | null;
    customer: ReviewSummary | null;
  }>({ worker: null, customer: null });
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  // Bumped by every fresh load and by every role switch, so a response that
  // was in flight when the role changed lands nowhere instead of overwriting
  // the newer role's list.
  const loadTokenRef = useRef(0);

  const load = useCallback(
    async (roleOverride?: ReviewRole) => {
      const token = ++loadTokenRef.current;
      setError(null);

      if (paramRole === 'both') {
        const {
          worker,
          customer,
          error: summariesError,
        } = await fetchBothRoleSummaries(params.userId);
        if (token !== loadTokenRef.current) return;
        // Opens on the side with something to show: worker, unless only the
        // hiring side has revealed reviews. A refresh keeps the role the
        // reader chose rather than re-deciding it under them.
        const role =
          roleOverride ??
          ((worker?.total ?? 0) === 0 && (customer?.total ?? 0) > 0
            ? 'customer'
            : 'worker');
        const listRes = await fetchProfileReviews(params.userId, {
          limit: PAGE_SIZE,
          offset: 0,
          role,
        });
        if (token !== loadTokenRef.current) return;
        const firstError = summariesError || listRes.error;
        if (firstError) setError(userMessage(firstError));
        setSummaries({ worker, customer });
        setActiveRole(role);
        setReviews(listRes.data);
        setExhausted(listRes.data.length < PAGE_SIZE);
        setLoading(false);
        return;
      }

      const role = paramRole;
      const [summaryRes, listRes] = await Promise.all([
        fetchProfileReviewSummary(params.userId, role),
        fetchProfileReviews(params.userId, { limit: PAGE_SIZE, offset: 0, role }),
      ]);
      if (token !== loadTokenRef.current) return;
      const firstError = summaryRes.error || listRes.error;
      if (firstError) setError(userMessage(firstError));
      setSummaries((prev) => ({ ...prev, [role]: summaryRes.data }));
      setActiveRole(role);
      setReviews(listRes.data);
      setExhausted(listRes.data.length < PAGE_SIZE);
      setLoading(false);
    },
    [params.userId, paramRole]
  );

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(paramRole === 'both' ? activeRole : undefined);
    setRefreshing(false);
  }

  /** The toggle's switch: the list, offset and end-of-list state all belong
   *  to one role, so they reset together and refetch for the other. */
  async function switchRole(next: ReviewRole) {
    if (next === activeRole || paramRole !== 'both') return;
    const token = ++loadTokenRef.current;
    setActiveRole(next);
    setReviews([]);
    setExhausted(false);
    setError(null);
    setLoading(true);
    const { data, error: listError } = await fetchProfileReviews(params.userId, {
      limit: PAGE_SIZE,
      offset: 0,
      role: next,
    });
    if (token !== loadTokenRef.current) return;
    if (listError) setError(userMessage(listError));
    setReviews(data);
    setExhausted(data.length < PAGE_SIZE);
    setLoading(false);
  }

  /** Next page, appended. Guarded so a fast scroll can't stack requests or
   *  keep asking once the end has been reached. */
  async function loadMore() {
    if (loadingMore || exhausted || loading) return;
    const token = loadTokenRef.current;
    setLoadingMore(true);
    const { data, error } = await fetchProfileReviews(params.userId, {
      limit: PAGE_SIZE,
      offset: reviews.length,
      role: activeRole,
    });
    setLoadingMore(false);
    // A page requested before a switch or refresh belongs to that older
    // load — appending it would mix roles.
    if (token !== loadTokenRef.current) return;
    if (error) return;
    if (data.length < PAGE_SIZE) setExhausted(true);
    if (data.length > 0) {
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.filter((r) => !seen.has(r.id))];
      });
    }
  }

  // FIX-RUN B3 (Apple 1.2): a review by someone blocked either way leaves the
  // list. Paging still counts the server's rows (`reviews`), never this view.
  const hidden = useHiddenUserIds();
  const visibleReviews = useMemo(
    () => (hidden.size ? reviews.filter((review) => !hidden.has(review.reviewer_id)) : reviews),
    [reviews, hidden]
  );

  const firstName = params.name?.trim().split(/\s+/)[0];
  const summary = activeRole === 'customer' ? summaries.customer : summaries.worker;
  const total = summary?.total ?? 0;

  return (
    <SafeAreaView style={[styles.safe, screenGround(colors, isDark)]} edges={['top']}>
      <ScreenHeader
        title={firstName ? `${firstName}’s Reviews` : 'Reviews'}
        onBack={goBackOrHome}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && reviews.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button
            title="Try again"
            variant="secondary"
            onPress={load}
            style={styles.retry}
          />
        </View>
      ) : (
        <FlatList
          data={visibleReviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            visibleReviews.length === 0 ? styles.emptyContainer : styles.listContent,
            { paddingBottom: navClearance },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListHeaderComponent={
            <>
              {paramRole === 'both' ? (
                // The own-account entries land here with 'both': one page,
                // two reputations, never mixed (R8b-c D2). Same local
                // pressable-pair treatment as the review form's Yes/No.
                <View style={styles.roleRow}>
                  {(['worker', 'customer'] as const).map((role) => {
                    const selected = activeRole === role;
                    return (
                      <Pressable
                        key={role}
                        style={[
                          styles.rolePill,
                          selected &&
                            (isDark ? styles.rolePillActiveDark : styles.rolePillActive),
                        ]}
                        onPress={() => void switchRole(role)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text
                          style={[
                            styles.rolePillText,
                            selected &&
                              (isDark
                                ? styles.rolePillTextActiveDark
                                : styles.rolePillTextActive),
                          ]}
                        >
                          {role === 'worker' ? 'Work' : 'Hiring'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {total > 0 ? (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  {/* D1 (R8b-c): the one number any surface shows —
                      shown_average, or the word New while the reputation is
                      too young for a number. The raw mean never renders. */}
                  <Text style={styles.average}>
                    {summary?.isNew
                      ? 'New'
                      : summary?.shownAverage != null
                        ? summary.shownAverage.toFixed(1)
                        : '—'}
                  </Text>
                  <View style={styles.summaryTopText}>
                    <StarRating value={Math.round(summary?.shownAverage ?? 0)} size={18} />
                    <Text style={styles.summaryCount}>
                      {total} {total === 1 ? 'review' : 'reviews'}
                    </Text>
                  </View>
                </View>

                <View style={styles.distribution}>
                  {STARS.map((star) => {
                    const count = summary?.distribution[star] ?? 0;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <View key={star} style={styles.distRow}>
                        <Text style={styles.distStar}>{star}</Text>
                        <Ionicons
                          name="star"
                          size={11}
                          color={starColors(colors, isDark).filled}
                        />
                        <View style={styles.distTrack}>
                          <View style={[styles.distFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.distCount}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="star-outline" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No reviews yet</Text>
              <Text style={styles.emptyText}>
                Reviews appear here once {firstName ?? 'this person'} has finished a
                job with someone.
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={styles.footerSpinner} />
            ) : null
          }
          renderItem={({ item }) => (
            <Card style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Avatar name={item.reviewer_name} uri={item.reviewer_avatar_url} size={36} />
                <View style={styles.reviewHeaderText}>
                  <Text style={styles.reviewerName} numberOfLines={1}>
                    {item.reviewer_name ?? 'Someone'}
                  </Text>
                  <Text style={styles.reviewMeta} numberOfLines={1}>
                    {formatTimeAgo(item.created_at)}
                    {item.job_category
                      ? ` · ${
                          JOB_CATEGORY_LABELS[
                            item.job_category as keyof typeof JOB_CATEGORY_LABELS
                          ] ?? item.job_category
                        }`
                      : ''}
                  </Text>
                </View>
                <StarRating value={item.rating} size={15} />
              </View>

              {item.comment ? (
                <Text style={styles.comment}>{item.comment}</Text>
              ) : null}

              {item.photos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoRow}
                  style={styles.photoScroll}
                >
                  {item.photos.map((url) => (
                    <Pressable
                      key={url}
                      onPress={() => setViewerUri(url)}
                      accessibilityRole="button"
                      accessibilityLabel="View photo"
                    >
                      {/* Thumbnail size only — the full-resolution image is
                          loaded once, in the viewer, on demand. */}
                      <RemoteImage uri={url} style={styles.photo} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {/* FIX-RUN B3 (Apple 1.2): a review can be reported, and its
                  writer blocked, from the review. Never on your own. */}
              <ReportContentLink
                subject={{ kind: 'review', id: item.id }}
                reportedId={item.reviewer_id}
                reportedName={item.reviewer_name ?? 'this reviewer'}
                label="Report this review"
              />
            </Card>
          )}
        />
      )}

      <PhotoViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => setViewerUri(null)}
        allowShare={false}
      />
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
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
  },
  retry: {
    marginTop: spacing.lg,
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
  summaryCard: {
    marginBottom: spacing.xs,
  },
  // The Work / Hiring toggle copies ReviewAndTipScreen's tip preset row
  // locally (R8b-c D6: no new shared component) — the same selected
  // treatment the review form's Yes/No pair carries.
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rolePill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePillActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.mint,
  },
  // emerald D6: one selection treatment — gold line, gold label, no fill.
  rolePillActiveDark: {
    borderColor: selectedInDark(colors).line,
    backgroundColor: selectedInDark(colors).fill,
  },
  rolePillText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  rolePillTextActive: {
    color: colors.emerald,
  },
  rolePillTextActiveDark: {
    color: selectedInDark(colors).line,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  // Master 27 sets the aggregate as a large display serif.
  average: {
    fontFamily: fonts.display,
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
  },
  summaryTopText: {
    gap: spacing.xs,
  },
  summaryCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  distribution: {
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  distStar: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    width: 10,
  },
  // Master 27 runs the distribution on a deep track with a gold fill.
  distTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.mint,
    overflow: 'hidden',
    marginHorizontal: spacing.xs,
  },
  distFill: {
    height: '100%',
    backgroundColor: colors.gold,
  },
  distCount: {
    fontSize: 12,
    color: colors.textSubtle,
    minWidth: 18,
    textAlign: 'right',
  },
  reviewCard: {
    gap: 0,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reviewHeaderText: {
    flex: 1,
    gap: 2,
  },
  // Master 27 sets reviewer names in the serif and their meta line green.
  reviewerName: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
  },
  reviewMeta: {
    fontSize: 12,
    color: colors.emerald,
  },
  comment: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  photoScroll: {
    marginTop: spacing.md,
  },
  photoRow: {
    gap: spacing.sm,
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  footerSpinner: {
    marginVertical: spacing.lg,
  },
  }),
);
