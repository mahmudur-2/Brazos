import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from './Chip';
import { Skeleton } from './Skeleton';
import { useAuth } from '../hooks/useAuth';
import {
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import {
  arrivalWindowLabel,
  categoryAccent,
  formatBudget,
  JOB_CATEGORY_CHIP_LABELS,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { formatDistanceMiles } from '../lib/discoveryFilter';
import { scheduledDayLabel } from '../lib/jobFilters';
import { formatTimeAgo } from '../lib/time';

const THUMB_SIZE = 84;
/** The peek card's round photo (the approved Map design: 52pt, gold ring). */
const PEEK_PHOTO_SIZE = 52;

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
  distanceMiles,
}: {
  job: OpenJob;
  /** Undefined means not known yet (or phase38's batched RPC isn't deployed).
   *  Both the bid-status line and Break the ice are omitted rather than
   *  guessed at when this is undefined — see bidLabel below. */
  bidCount?: number;
  onPress: () => void;
  /** 'full' adds the "posted X ago" line — plus, since 4D-2, the distance
   *  and arrival-window lines — for the spacious discovery surfaces (Worker
   *  Results, the map's pin sheet). Home stays 'compact' (its own default)
   *  to match the reference's exact field list there.
   *  'peek' (2026-09-19) is the approved Map design's row inside the jobs
   *  sheet: a round photo, one-line title, the short category chip beside
   *  the day word, the approximate location, EST. PAY and a chevron — the
   *  operator's own field list for that surface. */
  variant?: 'compact' | 'full' | 'peek';
  /** Server-computed distance (jobs_within_radius' half-mile-snapped
   *  `distance_miles`) — never a client guess at a job's coordinates, which
   *  stay unreadable in `job_locations`. Null/undefined means unknown and
   *  renders NOTHING: distance is real data or absent, never estimated. */
  distanceMiles?: number | null;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const metaGlyph = isDark ? colors.gold : colors.textMuted;
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

  // 2026-09-19 — THE PEEK ROW (docs/mockups/html/map-explore-*.html). Its own
  // drawing rather than a re-dressing of the compact card: the photo is a
  // ring, the title is one line, the category is the SHORT chip name and the
  // day sits beside it as a word, and the pay reads gold. Only colours differ
  // between the themes; every number is shared. The day word comes from
  // lib/jobFilters (Today / Tomorrow / the short date), so the card and the
  // When filter agree on what "today" means.
  if (variant === 'peek') {
    const day = scheduledDayLabel(job.scheduled_date, new Date());
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.peek, isDark && styles.peekDark, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={job.title}
      >
        {showImage ? (
          <RemoteImage
            uri={thumbUrl}
            style={styles.peekPhoto}
            contentFit="cover"
            onError={() => setImageFailed(true)}
            accessible
            accessibilityLabel={`Photo for ${job.title}`}
          />
        ) : (
          <View style={[styles.peekPhoto, styles.thumbFallback]}>
            <Ionicons name={icon} size={22} color={isDark ? colors.gold : accent.icon} />
          </View>
        )}
        <View style={styles.peekBody}>
          <Text style={styles.peekTitle} numberOfLines={1}>
            {job.title}
          </Text>
          <View style={styles.peekMeta}>
            <View style={[styles.peekCategory, isDark && styles.peekCategoryDark]}>
              <Text style={styles.peekCategoryText} numberOfLines={1}>
                {JOB_CATEGORY_CHIP_LABELS[job.category] ?? job.category}
              </Text>
            </View>
            {day ? (
              <Text style={styles.peekDay} numberOfLines={1}>
                {day}
              </Text>
            ) : null}
          </View>
          {job.location ? (
            <View style={styles.peekLocation}>
              <Ionicons name="location-outline" size={16} color={colors.emerald} />
              <Text style={styles.peekLocationText} numberOfLines={1}>
                {job.location}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.peekPay}>
          <Text style={styles.peekPayCaption}>EST. PAY</Text>
          <Text style={[styles.peekPayValue, isDark && styles.peekPayValueDark]} numberOfLines={1}>
            {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.navInactive} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isDark && styles.cardDark,
        isDark && shadows.cardDark,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={job.title}
    >
      {showImage ? (
        <RemoteImage
          uri={thumbUrl}
          style={[styles.thumb, isDark && styles.thumbDark]}
          contentFit="cover"
          onError={() => setImageFailed(true)}
          accessible
          accessibilityLabel={`Photo for ${job.title}`}
        />
      ) : (
        // Masters 12/13/43: with no uploaded photo the tile is the deep sage
        // square with a gold category glyph; light keeps the per-category
        // accent pair.
        <View
          style={[
            styles.thumb,
            styles.thumbFallback,
            isDark ? styles.thumbFallbackDark : { backgroundColor: accent.bg },
          ]}
        >
          <Ionicons name={icon} size={26} color={isDark ? colors.gold : accent.icon} />
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

        {/* Master 12: the meta rows read gold glyph + cream text; light keeps
            the Heritage muted pair. */}
        {job.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={metaGlyph} />
            <Text style={[styles.metaText, isDark && styles.metaTextDark]} numberOfLines={1}>
              {job.location}
            </Text>
          </View>
        ) : null}

        {variant === 'full' && typeof distanceMiles === 'number' ? (
          <View style={styles.metaRow}>
            <Ionicons name="navigate-outline" size={13} color={metaGlyph} />
            <Text style={[styles.metaText, isDark && styles.metaTextDark]} numberOfLines={1}>
              {formatDistanceMiles(distanceMiles)}
            </Text>
          </View>
        ) : null}

        {variant === 'full' && arrivalWindowLabel(job) ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={metaGlyph} />
            <Text style={[styles.metaText, isDark && styles.metaTextDark]} numberOfLines={1}>
              Arrive {arrivalWindowLabel(job)}
            </Text>
          </View>
        ) : null}

        {bidLabel ? (
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={13} color={metaGlyph} />
            <Text style={[styles.metaText, isDark && styles.metaTextDark]} numberOfLines={1}>
              {bidLabel}
            </Text>
          </View>
        ) : null}

        {variant === 'full' ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={metaGlyph} />
            <Text style={[styles.metaText, isDark && styles.metaTextDark]} numberOfLines={1}>
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

      {/* Eyebrow law: EST. PAY is a structural label (gold), the figure is a
          money value (emerald) — the B-4 split between masters 12/43 green
          and 13 gold resolves to green everywhere. */}
      <View style={styles.payBlock}>
        <Text style={[styles.payCaption, isDark && styles.payCaptionDark]}>EST. PAY</Text>
        <Text style={[styles.payValue, isDark && styles.payValueDark]} numberOfLines={1}>
          {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
        </Text>
      </View>
      {/* Master 43's compact feed card ends in a chevron; master 12's full
          list card does not. One card, both drawings — the variant decides. */}
      {variant === 'compact' ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.navInactive}
          style={styles.chevron}
        />
      ) : null}
    </Pressable>
  );
}

/** The same silhouette with nothing in it, so the feed does not jump when the
 *  data lands. */
export function WorkerJobCardSkeleton() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={[styles.card, isDark && shadows.cardDark]}>
      <Skeleton style={styles.thumb} />
      <View style={styles.info}>
        <Skeleton style={styles.skeletonLine} />
        <Skeleton style={[styles.skeletonLine, styles.skeletonLineShort]} />
      </View>
      <Skeleton style={styles.skeletonPay} />
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // Every dark master draws this card as surface + gold hairline; light keeps
  // its shadow treatment. Home parity 2026-08-22: the 1pt hairline is part of
  // the card's BOX in both themes — light draws it transparent, so only the
  // colours differ between modes.
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadows.card,
  },
  cardDark: {
    borderColor: colors.border,
  },
  cardPressed: {
    opacity: 0.92,
  },
  // Master 12 rings the tile — photo or glyph — in the same gold hairline;
  // same box-parity arrangement as the card above.
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.neutralBg,
  },
  thumbDark: {
    borderColor: colors.border,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallbackDark: {
    backgroundColor: colors.mint,
    borderColor: colors.border,
  },
  info: {
    flex: 1,
    gap: spacing.xs,
    // Keeps content clear of the pay block regardless of title/chip length.
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  // Decision 9: a card title is display type. Master 12 draws these serif.
  title: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 18,
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
  metaTextDark: { color: colors.ink },
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
  payCaptionDark: { color: colors.gold },
  payValue: {
    marginTop: 3,
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    color: colors.forest,
  },
  payValueDark: { color: colors.emerald },
  chevron: { alignSelf: 'center' },
  // The peek row. Light: the page's cream ground under a gold hairline at a
  // quarter strength — the operator's "subtle, not too cream"; dark: the page
  // ink at half, ringed in the sage line. The category pill takes the same
  // rim, so the row and its chip read as one material.
  peek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 1,
    paddingLeft: spacing.md - 1,
    paddingRight: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.26),
    backgroundColor: colors.background,
  },
  peekDark: {
    borderColor: colors.mint2,
    backgroundColor: withAlpha(colors.background, 0.5),
  },
  peekPhoto: {
    width: PEEK_PHOTO_SIZE,
    height: PEEK_PHOTO_SIZE,
    borderRadius: PEEK_PHOTO_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.mint,
    overflow: 'hidden',
  },
  peekBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs + 1,
  },
  peekTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.ink,
  },
  peekMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 1,
  },
  peekCategory: {
    height: 23,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.26),
    backgroundColor: withAlpha(colors.emerald, 0.1),
    justifyContent: 'center',
  },
  peekCategoryDark: {
    borderColor: colors.mint2,
  },
  peekCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.emerald,
  },
  peekDay: {
    fontSize: 14,
    color: colors.emerald,
  },
  peekLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
  },
  peekLocationText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  peekPay: {
    alignItems: 'flex-end',
  },
  peekPayCaption: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    color: colors.textMuted,
  },
  peekPayValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.goldDeep,
  },
  peekPayValueDark: { color: colors.gold },
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
  }),
);
