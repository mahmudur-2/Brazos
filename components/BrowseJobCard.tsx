import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { CategoryGlyph } from './CategoryGlyph';
import { useAuth } from '../hooks/useAuth';
import {
  fonts,
  radius,
  spacing,
  textScale,
  themedStyles,
  useThemeColors,
  wellStyle,
  type ColorPalette,
} from '../lib/theme';
import {
  categoryAccent,
  formatBidCountShort,
  formatBudget,
  formatPendingBidCount,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { formatTimeAgoShort } from '../lib/time';
import { showsTodayPill } from '../lib/neededToday';
import { TodayPill } from './TodayPill';

/**
 * Fixed, so every row in the list is the same height whether it has a photo or not. A ragged list
 * of different-height cards is the thing that makes a feed feel unfinished. G2, the job row rule:
 * the picture on the left, the title on one line with the price on the right, one hint line.
 */
const THUMB_SIZE = 64;

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
export function BrowseJobCard({
  job,
  bidCount,
  onPress,
}: {
  job: OpenJob;
  /** From useBidCounts(). Undefined means not known yet (or the batched RPC
   *  isn't deployed), in which case the line is omitted rather than guessed
   *  at — "No bids yet" on a job with bids would be worse than silence. */
  bidCount?: number;
  onPress: () => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { user } = useAuth();
  const isOwn = !!user && user.id === job.client_id;
  const accent = categoryAccent(job.category);
  const icon = JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal';
  const categoryLabel = JOB_CATEGORY_LABELS[job.category] ?? job.category;

  // A URL can be present but dead — a deleted storage object, an expired
  // host. Falling back on error means a broken image never renders as a grey
  // hole in the middle of the feed.
  const [imageFailed, setImageFailed] = useState(false);
  // One shared rule for which image represents a job, so the same job shows the
  // same tile in the home preview, this feed, the map drill-down and the
  // poster's hub — see jobThumbnailUrl().
  const thumbUrl = jobThumbnailUrl(job);
  const showImage = !!thumbUrl && !imageFailed;

  return (
    <Card level="row" onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View>
        {showImage ? (
          <RemoteImage
            uri={thumbUrl}
            style={styles.thumb}
            contentFit="cover"
            onError={() => setImageFailed(true)}
            accessible
            accessibilityLabel={`Photo for ${job.title}`}
          />
        ) : (
          <View
            style={[
              styles.thumb,
              styles.thumbFallback,
              // G2: a well in dark (never a lit tile on the lit row); light keeps the category colour.
              isDark ? wellStyle(colors, isDark) : { backgroundColor: accent.bg },
            ]}
          >
            <CategoryGlyph name={icon} size={26} color={isDark ? colors.emerald : accent.icon} bare />
          </View>
        )}
        {/* Idea 12: needed today, on the day it was posted — on the picture's corner, so the fixed-height
            body keeps its lines. */}
        {showsTodayPill(job) ? <TodayPill size="xs" solid style={styles.todayOnThumb} /> : null}
        </View>

        <View style={styles.body}>
          <View style={styles.lineRow}>
            <Text style={styles.title} numberOfLines={1}>
              {job.title}
            </Text>
            {/* Masters 12/43's money slot: an unset budget reads "Open". */}
            <Text style={[styles.budget, isDark && styles.budgetDark]} numberOfLines={1}>
              {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
            </Text>
          </View>

          {/* The one hint line: what and roughly where, then the bids and the age on the right. */}
          <View style={styles.lineRow}>
            {isOwn && (
              <View style={[styles.ownBadge, isDark && styles.ownBadgeDark]}>
                <Ionicons
                  name="person-outline"
                  size={11}
                  color={isDark ? colors.emerald : colors.info}
                />
                <Text style={[styles.ownBadgeText, isDark && styles.ownBadgeTextDark]}>
                  Your job
                </Text>
              </View>
            )}
            <Text style={styles.meta} numberOfLines={1}>
              {categoryLabel}
              {job.location ? ` · ${job.location}` : ''}
            </Text>
            <Text style={styles.facts} numberOfLines={1}>
              {bidCount != null
                ? `${isOwn ? formatPendingBidCount(bidCount) : formatBidCountShort(bidCount)} · `
                : ''}
              {formatTimeAgoShort(job.created_at)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  card: {
    // Tighter than the default card padding: the thumbnail needs the width
    // more than the card needs the margin.
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  todayOnThumb: {
    position: 'absolute',
    top: spacing.xs + 2,
    left: spacing.xs + 2,
  },
  thumbFallback: {
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: {
    flex: 1,
    gap: spacing.sm,
  },
  // One line each: the title beside the price, the hint beside the bids and the age.
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Decision 9: a card title is display type. Master 10 draws it serif.
  title: {
    ...textScale.headline,
    fontFamily: fonts.display,
    flex: 1,
    color: colors.ink,
  },
  meta: {
    ...textScale.label,
    fontWeight: '400',
    flex: 1,
    color: colors.textMuted,
  },
  ownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: colors.infoBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  // Masters 10 and 12 draw "Your job" as the sage chip with green content,
  // not the teal info pair; light keeps the Heritage info tones.
  ownBadgeDark: { backgroundColor: colors.mint },
  ownBadgeText: {
    ...textScale.caption,
    fontWeight: '700',
    color: colors.info,
  },
  ownBadgeTextDark: { color: colors.emerald },
  // Eyebrow law: a money value is emerald, and the serif carries prices.
  // Master 10 draws this one gold — the same B-4 split masters 12/13 carry —
  // and decision 6 settles it green everywhere.
  budget: {
    ...textScale.headline,
    fontFamily: fonts.display,
    fontWeight: '800',
    color: colors.money,
    fontVariant: ['tabular-nums'],
  },
  budgetDark: { color: colors.money },
  facts: {
    ...textScale.footnote,
    color: colors.textMuted,
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
  }),
);
