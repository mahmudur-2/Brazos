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
import { EntranceView } from '../components/EntranceView';
import { entranceSlot, useEntered } from '../hooks/useEntrance';
import { RemoteImage } from '../components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { PhotoViewer } from '../components/PhotoViewer';
import { ReportContentLink } from '../components/ReportContentLink';
import { useHiddenUserIds } from '../hooks/useHiddenUserIds';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
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
  radius,
  spacing,
  starColors,
  textScale,
  themedStyles,
  useThemeColors,
  type ColorPalette,
  screenGround,
} from '../lib/theme';
import { EmptyState, useScrollClearance } from '../ui/primitives';
import { SPINNER_STATE, ScreenStateView, loadErrorTitle } from '../ui/templates/ScreenStates';

const PAGE_SIZE = 20;
const STARS = [5, 4, 3, 2, 1] as const;
const ROLE_OPTIONS: { label: string; value: ReviewRole }[] = [
  { label: 'Work', value: 'worker' },
  { label: 'Hiring', value: 'customer' },
];

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
  // FIX-RUN F12: the first batch of rows cascades in, once (hooks/useEntrance.ts useEntered).
  const reviewsEntered = useEntered(visibleReviews.length > 0);

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
        <ScreenStateView state={SPINNER_STATE} />
      ) : error && reviews.length === 0 ? (
        <ScreenStateView state={{ kind: 'error', title: loadErrorTitle('reviews'), message: error, onRetry: load }} />
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
                // two reputations, never mixed (R8b-c D2).
                <View style={styles.roleRow}>
                  <SegmentedControl
                    options={ROLE_OPTIONS}
                    value={activeRole}
                    onChange={(role) => void switchRole(role)}
                  />
                </View>
              ) : null}
              {total > 0 ? (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  {/* D1 (R8b-c): the one number any surface shows is
                      shown_average. While the reputation is too young for one,
                      the count stands alone (F11: no big "New", no stars).
                      The raw mean never renders. */}
                  <Text style={styles.average}>
                    {summary?.isNew
                      ? total
                      : summary?.shownAverage != null
                        ? summary.shownAverage.toFixed(1)
                        : '—'}
                  </Text>
                  <View style={styles.summaryTopText}>
                    {summary?.isNew ? null : <StarRating value={Math.round(summary?.shownAverage ?? 0)} size={16} />}
                    <Text style={styles.summaryCount}>
                      {summary?.isNew
                        ? total === 1 ? 'review' : 'reviews'
                        : `${total} ${total === 1 ? 'review' : 'reviews'}`}
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
            <EmptyState
              icon="star-outline"
              title="No Reviews Yet"
              body={`Reviews appear here once ${firstName ?? 'this person'} has finished a job with someone.`}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={styles.footerSpinner} />
            ) : null
          }
          renderItem={({ item, index }) => (
            <EntranceView index={entranceSlot(index)} skip={reviewsEntered}>
            <Card style={styles.reviewCard}>
              {/* The words lead; who wrote it, when, and the stars stay quiet under them. */}
              {item.comment ? (
                <Text style={styles.comment}>{item.comment}</Text>
              ) : null}

              {item.photos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoRow}
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

              <View style={styles.reviewFooter}>
                <Avatar name={item.reviewer_name} uri={item.reviewer_avatar_url} size={32} />
                <View style={styles.reviewFooterText}>
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
                <StarRating value={item.rating} size={12} />
              </View>

              {/* FIX-RUN B3 (Apple 1.2): a review can be reported, and its
                  writer blocked, from the review. Never on your own. */}
              <ReportContentLink
                subject={{ kind: 'review', id: item.id }}
                reportedId={item.reviewer_id}
                reportedName={item.reviewer_name ?? 'this reviewer'}
                label="Report this review"
              />
            </Card>
            </EntranceView>
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
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  summaryCard: {
    marginBottom: spacing.xs,
  },
  roleRow: {
    marginBottom: spacing.md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  average: {
    ...textScale.hero,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  summaryTopText: {
    gap: spacing.xs,
  },
  summaryCount: {
    ...textScale.label,
    color: colors.textMuted,
  },
  distribution: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  distStar: {
    ...textScale.footnote,
    fontWeight: '700',
    color: colors.textMuted,
    width: 10,
  },
  // Master 27 runs the distribution on a deep track with a gold fill.
  distTrack: {
    flex: 1,
    height: spacing.sm,
    borderRadius: radius.xs,
    backgroundColor: colors.mint,
    overflow: 'hidden',
    marginHorizontal: spacing.xs,
  },
  distFill: {
    height: '100%',
    backgroundColor: colors.gold,
  },
  distCount: {
    ...textScale.footnote,
    color: colors.textSubtle,
    minWidth: 18,
    textAlign: 'right',
  },
  reviewCard: {
    gap: spacing.md,
  },
  comment: {
    ...textScale.headline,
    fontWeight: '500',
    color: colors.ink,
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
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reviewFooterText: {
    flex: 1,
  },
  reviewerName: {
    ...textScale.label,
    color: colors.ink,
  },
  reviewMeta: {
    ...textScale.footnote,
    color: colors.textMuted,
  },
  footerSpinner: {
    marginVertical: spacing.lg,
  },
  }),
);
