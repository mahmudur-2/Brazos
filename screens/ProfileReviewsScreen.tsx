import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PhotoViewer } from '../components/PhotoViewer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StarRating } from '../components/StarRating';
import { JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  fetchProfileReviews,
  fetchProfileReviewSummary,
  type ProfileReview,
  type ReviewSummary,
} from '../lib/reviews';
import { formatTimeAgo } from '../lib/time';
import type { ProfileReviewsRouteParamList } from '../lib/navigation';
import { colors, radius, spacing } from '../lib/theme';

const PAGE_SIZE = 20;
const STARS = [5, 4, 3, 2, 1] as const;

/**
 * Every review written about one person, reached by tapping the rating row on
 * their profile.
 *
 * The aggregate at the top and the list beneath it are counted from the same
 * review rows (profile_review_summary / profile_reviews, phase37), so the
 * header can never claim "2 reviews" above three of them.
 */
export function ProfileReviewsScreen() {
  const navigation = useNavigation();
  const { params } =
    useRoute<RouteProp<ProfileReviewsRouteParamList, 'ProfileReviews'>>();

  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [summaryRes, listRes] = await Promise.all([
      fetchProfileReviewSummary(params.userId),
      fetchProfileReviews(params.userId, { limit: PAGE_SIZE, offset: 0 }),
    ]);

    const firstError = summaryRes.error || listRes.error;
    if (firstError) setError(firstError.message);

    setSummary(summaryRes.data);
    setReviews(listRes.data);
    setExhausted(listRes.data.length < PAGE_SIZE);
    setLoading(false);
  }, [params.userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  /** Next page, appended. Guarded so a fast scroll can't stack requests or
   *  keep asking once the end has been reached. */
  async function loadMore() {
    if (loadingMore || exhausted || loading) return;
    setLoadingMore(true);
    const { data, error } = await fetchProfileReviews(params.userId, {
      limit: PAGE_SIZE,
      offset: reviews.length,
    });
    setLoadingMore(false);
    if (error) return;
    if (data.length < PAGE_SIZE) setExhausted(true);
    if (data.length > 0) {
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.filter((r) => !seen.has(r.id))];
      });
    }
  }

  const firstName = params.name?.trim().split(/\s+/)[0];
  const total = summary?.total ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={firstName ? `${firstName}’s reviews` : 'Reviews'}
        onBack={() => navigation.goBack()}
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
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            reviews.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListHeaderComponent={
            total > 0 ? (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <Text style={styles.average}>
                    {summary?.average != null ? summary.average.toFixed(1) : '—'}
                  </Text>
                  <View style={styles.summaryTopText}>
                    <StarRating value={Math.round(summary?.average ?? 0)} size={18} />
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
                        <Ionicons name="star" size={11} color={colors.star} />
                        <View style={styles.distTrack}>
                          <View style={[styles.distFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.distCount}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ) : null
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
                      <Image source={{ uri: url }} style={styles.photo} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
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
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  average: {
    fontSize: 40,
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
  distTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutralBg,
    overflow: 'hidden',
    marginHorizontal: spacing.xs,
  },
  distFill: {
    height: '100%',
    backgroundColor: colors.star,
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
  reviewerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  reviewMeta: {
    fontSize: 12,
    color: colors.textMuted,
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
});
