import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from './Chip';
import { Skeleton } from './Skeleton';
import { useAuth } from '../hooks/useAuth';
import { colors, radius, shadows, spacing } from '../lib/theme';
import {
  categoryAccent,
  formatBidCount,
  formatBudget,
  formatPendingBidCount,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';

const THUMB_SIZE = 76;

/**
 * A job as a worker evaluating it sees it: what the work is, roughly where,
 * what it pays, and a single obvious way in.
 *
 * Deliberately a separate component from BrowseJobCard rather than a variant
 * of it. BrowseJobCard is also rendered by the map drill-down and the
 * "similar jobs" strip on job detail; giving it a second layout would put a
 * branch in a component three screens depend on, to serve one of them.
 *
 * Two things the reference card shows that are NOT rendered here, because
 * nothing in the schema backs them: a distance ("1.2 mi" — exact job
 * coordinates live in `job_locations`, readable only by the poster and the
 * assigned worker) and a fit percentage ("98% fit" — no job-to-worker fit
 * score exists; the semantic matcher ranks workers for a query, not jobs for
 * a worker). The tags that are shown are all real.
 */
export function WorkerJobCard({
  job,
  bidCount,
  onPress,
}: {
  job: OpenJob;
  /** Undefined means not known yet (or phase38's batched RPC isn't deployed).
   *  The tag is omitted rather than guessed at. */
  bidCount?: number;
  onPress: () => void;
}) {
  const { user } = useAuth();
  const isOwn = !!user && user.id === job.client_id;
  const accent = categoryAccent(job.category);
  const icon = JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal';

  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = jobThumbnailUrl(job);
  const showImage = !!thumbUrl && !imageFailed;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.head, pressed && styles.headPressed]}
        accessibilityRole="button"
        accessibilityLabel={job.title}
      >
        {showImage ? (
          <Image
            source={{ uri: thumbUrl }}
            style={styles.thumb}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
            accessible
            accessibilityLabel={`Photo for ${job.title}`}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: accent.bg }]}>
            <Ionicons name={icon} size={30} color={accent.icon} />
          </View>
        )}

        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={2}>
            {job.title}
          </Text>
          {job.location ? (
            <Text style={styles.place} numberOfLines={1}>
              {job.location}
            </Text>
          ) : null}
        </View>

        <Text style={styles.price} numberOfLines={1}>
          {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
        </Text>
      </Pressable>

      <View style={styles.tags}>
        {isOwn ? <Chip label="Your job" variant="soft" size="sm" /> : null}
        <Chip
          label={JOB_CATEGORY_LABELS[job.category] ?? job.category}
          variant="soft"
          size="sm"
        />
        {bidCount != null ? (
          <Chip
            label={isOwn ? formatPendingBidCount(bidCount) : formatBidCount(bidCount)}
            variant="soft"
            size="sm"
          />
        ) : null}
        <Chip label={formatTimeAgo(job.created_at)} variant="soft" size="sm" />
      </View>

      {/* A real nudge, not a fabricated stat — bidCount === 0 is exactly the
          case where being first genuinely is the opportunity. */}
      {!isOwn && bidCount === 0 ? (
        <View style={styles.breakIce}>
          <Ionicons name="sparkles" size={13} color={colors.gold} />
          <Text style={styles.breakIceText}>Break the ice</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
        accessibilityLabel={`View job: ${job.title}`}
      >
        <Text style={styles.ctaText}>View job</Text>
      </Pressable>
    </View>
  );
}

/** The same silhouette with nothing in it, so the feed does not jump when the
 *  data lands. */
export function WorkerJobCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Skeleton style={styles.thumb} />
        <View style={styles.headText}>
          <Skeleton style={styles.skeletonLine} />
          <Skeleton style={[styles.skeletonLine, styles.skeletonLineShort]} />
        </View>
      </View>
      <View style={styles.tags}>
        <Skeleton style={styles.skeletonTag} />
        <Skeleton style={styles.skeletonTag} />
      </View>
      <View style={styles.ctaSkeleton} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
  },
  headPressed: {
    opacity: 0.9,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 23,
  },
  place: {
    fontSize: 14,
    color: colors.textMuted,
  },
  price: {
    // Capped so a long title keeps most of the row rather than being squeezed
    // by "$1,250".
    maxWidth: 92,
    fontSize: 20,
    fontWeight: '800',
    color: colors.forest,
    textAlign: 'right',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  breakIce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -spacing.xs,
  },
  breakIceText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gold,
  },
  cta: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mint2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    backgroundColor: colors.mint2,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.forest,
  },
  skeletonLine: {
    height: 13,
    borderRadius: radius.sm,
  },
  skeletonLineShort: {
    width: '60%',
  },
  skeletonTag: {
    width: 78,
    height: 24,
    borderRadius: radius.pill,
  },
  ctaSkeleton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
  },
});
