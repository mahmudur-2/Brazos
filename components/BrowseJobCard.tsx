import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { colors, radius, spacing } from '../lib/theme';
import {
  categoryAccent,
  formatBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';

/**
 * Fixed, so every card in the list is the same height whether its title runs
 * to one line or two and whether it has a photo or not. A ragged list of
 * different-height cards is the thing that makes a feed feel unfinished.
 */
const THUMB_SIZE = 92;

/**
 * A job in the browse feed: the poster's first photo, then everything needed
 * to judge the work without opening it — title, category, location, pay, age.
 *
 * Jobs with no photo (most of them) get a category-tinted block with that
 * category's glyph, using the accent palette the rest of the app already uses
 * for the same category. There is deliberately no stock imagery: a downloaded
 * photo of someone else's kitchen would be describing a job that does not
 * exist.
 */
export function BrowseJobCard({ job, onPress }: { job: OpenJob; onPress: () => void }) {
  const accent = categoryAccent(job.category);
  const icon = JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal';
  const categoryLabel = JOB_CATEGORY_LABELS[job.category] ?? job.category;

  // A URL can be present but dead — a deleted storage object, an expired
  // host. Falling back on error means a broken image never renders as a grey
  // hole in the middle of the feed.
  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = job.photos?.[0];
  const showImage = !!thumbUrl && !imageFailed;

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
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

        <View style={styles.body}>
          <View style={styles.bodyTop}>
            <Text style={styles.title} numberOfLines={2}>
              {job.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {categoryLabel}
              {job.location ? ` · ${job.location}` : ''}
            </Text>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.budget} numberOfLines={1}>
              {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open budget'}
            </Text>
            <Text style={styles.time} numberOfLines={1}>
              {formatTimeAgo(job.created_at)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * The same card's silhouette with nothing in it, for while the feed loads.
 * Matching the real card's height means the list does not jump when the data
 * lands.
 */
export function BrowseJobCardSkeleton() {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Skeleton style={styles.thumb} />
        <View style={styles.body}>
          <View style={styles.bodyTop}>
            <Skeleton style={styles.skeletonLine} />
            <Skeleton style={[styles.skeletonLine, styles.skeletonLineShort]} />
          </View>
          <View style={styles.footerRow}>
            <Skeleton style={[styles.skeletonLine, styles.skeletonLineTiny]} />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    // Tighter than the default card padding: the thumbnail needs the width
    // more than the card needs the margin.
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  thumbFallback: {
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    // Pins the pay/age line to the bottom of the thumbnail's height, so it
    // sits on the same baseline on every card regardless of title length.
    height: THUMB_SIZE,
    justifyContent: 'space-between',
  },
  bodyTop: {
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 21,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  budget: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  time: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  skeletonLine: {
    height: 12,
    borderRadius: radius.sm,
  },
  skeletonLineShort: {
    width: '60%',
  },
  skeletonLineTiny: {
    width: '35%',
    height: 14,
  },
});
