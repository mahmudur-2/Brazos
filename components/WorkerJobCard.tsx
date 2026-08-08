import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from './Chip';
import { Skeleton } from './Skeleton';
import { useAuth } from '../hooks/useAuth';
import { colors, radius, shadows, spacing } from '../lib/theme';
import {
  categoryAccent,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';

const THUMB_SIZE = 84;

/**
 * A job as a worker evaluating it sees it: what the work is, roughly where,
 * what it pays, and its bid status — matched to design-reference/
 * 48_worker_home.png's compact horizontal card. No "View job" button: the
 * whole card is the tap target, so a screen full of these doesn't burn
 * height on a repeated CTA.
 *
 * Deliberately a separate component from BrowseJobCard rather than a variant
 * of it. BrowseJobCard is also rendered by the map drill-down and the
 * "similar jobs" strip on job detail; giving it a second layout would put a
 * branch in a component three screens depend on, to serve one of them.
 *
 * Reference elements NOT rendered here, because nothing backs them:
 *   - A distance ("1.2 mi") — exact job coordinates live in `job_locations`,
 *     readable only by the poster and the assigned worker.
 *   - A fit percentage ("98% fit") — no job-to-worker fit score exists.
 *   - A favorite/heart toggle — there is no saved-jobs table.
 *   - "posted X ago" — present on the old vertical card, dropped here to
 *     match the reference's exact field list (title, category, location,
 *     bid status, optional Break the ice); still on JobDetail if needed.
 */
export function WorkerJobCard({
  job,
  bidCount,
  onPress,
  variant = 'compact',
}: {
  job: OpenJob;
  /** Undefined means not known yet (or phase38's batched RPC isn't deployed).
   *  Both the bid-status line and Break the ice are omitted rather than
   *  guessed at when this is undefined — see bidLabel below. */
  bidCount?: number;
  onPress: () => void;
  /** 'full' adds the "posted X ago" line, for the more spacious Worker
   *  Results screen — Home stays 'compact' (its own default) to match the
   *  reference's exact field list there. */
  variant?: 'compact' | 'full';
}) {
  const { user } = useAuth();
  const isOwn = !!user && user.id === job.client_id;
  const accent = categoryAccent(job.category);
  const icon = JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal';

  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = jobThumbnailUrl(job);
  const showImage = !!thumbUrl && !imageFailed;

  // "So far" matches the reference's exact wording ("2 bids so far") without
  // changing lib/jobs.ts's shared formatBidCount() — that string is also used
  // on the poster's own views, which this card has no reason to touch.
  const bidLabel =
    bidCount == null ? null : bidCount === 0 ? 'No bids yet' : `${bidCount} ${bidCount === 1 ? 'bid' : 'bids'} so far`;
  // The actual zero-bid condition, not inferred from the label text — never
  // shown for a job's own poster, and never shown when the count isn't known.
  const showBreakIce = !isOwn && bidCount === 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
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
          <Ionicons name={icon} size={26} color={accent.icon} />
        </View>
      )}

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {job.title}
          </Text>
          <Chip
            label={JOB_CATEGORY_LABELS[job.category] ?? job.category}
            variant="soft"
            size="sm"
            style={styles.categoryChip}
          />
          {isOwn ? <Chip label="Your job" variant="soft" size="sm" /> : null}
        </View>

        {job.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {job.location}
            </Text>
          </View>
        ) : null}

        {bidLabel ? (
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {bidLabel}
            </Text>
          </View>
        ) : null}

        {variant === 'full' ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              Posted {formatTimeAgo(job.created_at)}
            </Text>
          </View>
        ) : null}

        {showBreakIce ? (
          <View style={styles.breakIce}>
            <Ionicons name="sparkles" size={12} color={colors.gold} />
            <Text style={styles.breakIceText}>Break the ice</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.payBlock}>
        <Text style={styles.payCaption}>EST. PAY</Text>
        <Text style={styles.payValue} numberOfLines={1}>
          {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
        </Text>
      </View>
    </Pressable>
  );
}

/** The same silhouette with nothing in it, so the feed does not jump when the
 *  data lands. */
export function WorkerJobCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={styles.thumb} />
      <View style={styles.info}>
        <Skeleton style={styles.skeletonLine} />
        <Skeleton style={[styles.skeletonLine, styles.skeletonLineShort]} />
      </View>
      <Skeleton style={styles.skeletonPay} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.92,
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
  info: {
    flex: 1,
    gap: 4,
    // Keeps content clear of the pay block regardless of title/chip length.
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  title: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  categoryChip: {
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  breakIce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  breakIceText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gold,
  },
  payBlock: {
    alignItems: 'flex-end',
    // Capped so a long title keeps most of the row rather than being
    // squeezed by "$1,250" at the bumped 26px size.
    maxWidth: 104,
  },
  payCaption: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  payValue: {
    marginTop: 3,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    color: colors.forest,
  },
  skeletonLine: {
    height: 13,
    borderRadius: radius.sm,
  },
  skeletonLineShort: {
    width: '60%',
    marginTop: spacing.xs,
  },
  skeletonPay: {
    width: 48,
    height: 32,
    borderRadius: radius.sm,
  },
});
