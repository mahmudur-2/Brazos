import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { CategoryGlyph } from './CategoryGlyph';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from './Chip';
import { Skeleton } from './Skeleton';
import { useAuth } from '../hooks/useAuth';
import {
  litCardStyle, fonts,
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
  formatBidCountShort,
  formatBudget,
  JOB_CATEGORY_CHIP_LABELS,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../lib/jobs';
import { formatDistanceMiles } from '../lib/discoveryFilter';
import { scheduledDayLabel } from '../lib/jobFilters';
import { neighbourhoodLabel } from '../lib/locationPrivacy';
import { formatTimeAgoShort } from '../lib/time';

/**
 * 2026-09-20 (sitting 2) — layout "a1" (docs/mockups/html/worker-results-card.html,
 * the operator's pick from six layouts and three picture sizes): the picture
 * is a SQUARE beside the text block, the pay block sits over the card's
 * top-right, the title and the chip row keep clear of it, and the lines
 * below run the full width beneath it.
 *
 * 2026-09-21 — ONE CARD SIZE (docs/mockups/html/worker-results-screen.html,
 * the operator's approved FIXED phones; DECISIONS 2026-09-20 sitting 2, (10)):
 * the picture is a CONSTANT square — 120 here, which is the reference's 118
 * fill inside its 1pt rim (React Native sizes the border in; the page does
 * not) — and the text block is at least as tall, so a four-line card (a job
 * with bids has no Break the ice) is the same height as a five-line one, 146
 * with the card's padding and rim, and every picture is the same size —
 * "the entire section one size". It was a measured square as tall as the
 * text, which made the cards two heights.
 *
 * THE PAY BLOCK'S CLEARANCE IS MEASURED. The title and the chip row keep
 * clear of the pay block by its own laid-out width plus PAY_AIR, not a fixed
 * 96 — "$50" is half the width "$1,250" is, and the title had been losing
 * that room to a guess. PAY_CLEAR is only the first frame's fallback, before
 * the block reports its width. And THE CHIP KEEPS ITS FULL LABEL when it
 * fits beside that clearance — "Packing/Unpacking" whole — falling back to
 * the short name (JOB_CATEGORY_CHIP_LABELS, the map row's) only when the full
 * one would not; decided from the chip's own layout at the full label, the
 * PeekRow `dayFits` pattern below, unseen until decided. Never a character
 * estimate.
 */
const THUMB_SIZE = 120;
const PAY_CLEAR = 96;
const PAY_AIR = 8;
const META_GLYPH = 16;
/** The peek card's round photo (the approved Map design: 52pt, gold ring). */
const PEEK_PHOTO_SIZE = 52;
/** The pay column over the row's top two lines: 56 wide, 6 of air before it. */
const PEEK_PAY_WIDTH = 56;
const PEEK_PAY_AIR = 6;
const PEEK_PAY_CLEAR = PEEK_PAY_WIDTH + PEEK_PAY_AIR;

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
/** The space between the category chip and "Your job" — the row's gap and the fit's arithmetic (read at
 *  render time: `spacing` is a live, dialable metric). */
const chipGap = () => spacing.xs + 2;

export function WorkerJobCard({
  job,
  bidCount,
  onPress,
  variant = 'compact',
  distanceMiles,
}: {
  job: OpenJob;
  /** Undefined means not known yet (or phase38's batched RPC isn't deployed).
   *  Both the bid count in the facts line and Break the ice are omitted
   *  rather than guessed at when this is undefined — see `facts` below. */
  bidCount?: number;
  onPress: () => void;
  /** 'compact' and 'full' draw the SAME card since 2026-09-20 (sitting 2,
   *  layout "a1" — the operator's "one card, one layout": Worker Home's
   *  cards match Available Jobs): the title, the category chip, the location
   *  on its own line, one line of facts (distance when real, the arrival
   *  date, the bid count, the age), Break the ice, and a square picture as
   *  tall as that text. The two names stay so callers need not change; only
   *  `distanceMiles` (passed by the results list alone) tells them apart.
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

  // The pay block's clearance: its measured width plus PAY_AIR, PAY_CLEAR
  // until it has laid out.
  const [payWidth, setPayWidth] = useState<number | null>(null);
  const payClear = payWidth === null ? PAY_CLEAR : Math.round(payWidth) + PAY_AIR;
  // Does the full category label fit beside that clearance? Unknown until
  // the chip has laid out at the full label with the pay block measured;
  // re-asked when the job's category or the clearance changes.
  const fullLabel = JOB_CATEGORY_LABELS[job.category] ?? job.category;
  const shortLabel = JOB_CATEGORY_CHIP_LABELS[job.category] ?? job.category;
  const [fullFits, setFullFits] = useState<boolean | null>(null);
  const [chipRowWidth, setChipRowWidth] = useState<number | null>(null);
  const [chipWidth, setChipWidth] = useState<number | null>(null);
  // 2026-09-29 (LUX-LIST-2 run): the poster's own "Your job" chip shares the row, so the fit counts it
  // and its gap too — it used to be left out, and ran under the pay block on a long category.
  const [ownWidth, setOwnWidth] = useState<number | null>(null);
  useEffect(() => {
    setFullFits(null);
    setChipWidth(null);
  }, [fullLabel, payClear]);
  useEffect(() => {
    if (fullFits !== null || payWidth === null || chipRowWidth === null || chipWidth === null) return;
    if (isOwn && ownWidth === null) return;
    const own = isOwn && ownWidth !== null ? chipGap() + ownWidth : 0;
    setFullFits(chipWidth + own <= chipRowWidth - payClear);
  }, [fullFits, payWidth, chipRowWidth, chipWidth, payClear, isOwn, ownWidth]);
  const onChipRowLayout = (event: LayoutChangeEvent) => setChipRowWidth(event.nativeEvent.layout.width);
  const onChipLayout = (event: LayoutChangeEvent) => {
    if (fullFits === null) setChipWidth(event.nativeEvent.layout.width);
  };

  // The one line of facts under the location: the distance when it is real
  // (server-computed, never a guess), the arrival date from the ONE shared
  // formatter, the bid count and the age in their short spellings — joined
  // by muted dots, never wrapping. The bid count is omitted, not guessed,
  // when it is not known yet.
  const facts = [
    typeof distanceMiles === 'number' ? formatDistanceMiles(distanceMiles) : null,
    arrivalWindowLabel(job),
    bidCount == null ? null : formatBidCountShort(bidCount),
    formatTimeAgoShort(job.created_at),
  ].filter((part): part is string => !!part);
  // The actual zero-bid condition, not inferred from the label text — never
  // shown for a job's own poster, and never shown when the count isn't known.
  const showBreakIce = !isOwn && bidCount === 0;

  // 2026-09-19 — THE PEEK ROW (docs/mockups/html/map-explore-*.html, redrawn
  // on the 2026-09-20 phone walk as docs/mockups/html/peek-card-*.html). Its
  // own drawing rather than a re-dressing of the compact card: the photo is a
  // ring, the title is one line, the category is the SHORT chip name with the
  // day beside it as a word, the location is the neighbourhood alone, and the
  // pay reads gold. Only colours differ between the themes; every number is
  // shared. The day word comes from lib/jobFilters (Today / Tmrw / "Sep 2"),
  // so the card and the When filter agree on what "today" means.
  //
  // THE ROW NEVER GROWS A LINE AND NOTHING OVERLAPS THE PAY (operator,
  // 2026-09-20). The pay column sits over the top two lines only — the title
  // and the category line keep its measured width + air clear (PEEK_PAY_CLEAR
  // until it has laid out), the location line runs
  // the full width beneath — and the day word sits beside the chip only when
  // the two fit that width, measured, otherwise at the end of the location
  // line ("Park Slope · Tmrw"). Until measured it renders unseen.
  if (variant === 'peek') {
    return <PeekRow job={job} onPress={onPress} />;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isDark && styles.cardDark,
        litCardStyle(isDark),
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
        // accent pair. The glyph scales with the tile (the mockup's 38%).
        <View
          style={[
            styles.thumb,
            styles.thumbFallback,
            // 2026-09-29 (LUX-LIST-2 #6): the lit tile in dark; light keeps the category colour.
            isDark ? [styles.thumbFallbackDark, litCardStyle(true, 'tile')] : { backgroundColor: accent.bg },
          ]}
        >
          <CategoryGlyph
            name={icon}
            size={Math.round(THUMB_SIZE * 0.38)}
            color={isDark ? colors.emerald : accent.icon}
            bare
          />
        </View>
      )}

      <View style={styles.info}>
        <Text style={[styles.title, { paddingRight: payClear }]} numberOfLines={1}>
          {job.title}
        </Text>
        <View style={[styles.chipRow, { paddingRight: payClear }]} onLayout={onChipRowLayout}>
          <Chip
            label={fullFits === false ? shortLabel : fullLabel}
            variant="soft"
            size="sm"
            style={[styles.categoryChip, fullFits === null && styles.chipUnmeasured]}
            onLayout={onChipLayout}
          />
          {isOwn ? (
            <Chip
              label="Your job"
              variant="soft"
              size="sm"
              onLayout={(event) => setOwnWidth(event.nativeEvent.layout.width)}
            />
          ) : null}
        </View>

        {/* Master 12: the meta rows read gold glyph + cream text; light keeps
            the Heritage muted pair. The location is its own line, full width
            under the pay block. */}
        {job.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={META_GLYPH} color={metaGlyph} />
            <Text style={[styles.metaText, isDark && styles.metaTextDark]} numberOfLines={1}>
              {job.location}
            </Text>
          </View>
        ) : null}

        {facts.length > 0 ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={META_GLYPH} color={metaGlyph} />
            <Text style={[styles.metaText, isDark && styles.metaTextDark]} numberOfLines={1}>
              {facts.map((part, index) => (
                <Text key={part}>
                  {index > 0 ? <Text style={styles.factsDot}> · </Text> : null}
                  {part}
                </Text>
              ))}
            </Text>
          </View>
        ) : null}

        {showBreakIce ? (
          <View style={styles.breakIce}>
            <Ionicons name="sparkles" size={12} color={colors.mark} />
            <Text style={styles.breakIceText}>Break the ice</Text>
          </View>
        ) : null}
      </View>

      {/* Eyebrow law: EST. PAY is a structural label (gold), the figure is a
          money value (emerald) — the B-4 split between masters 12/43 green
          and 13 gold resolves to green everywhere. */}
      <View style={styles.payBlock} onLayout={(event) => setPayWidth(event.nativeEvent.layout.width)}>
        <Text style={[styles.payCaption, isDark && styles.payCaptionDark]}>EST. PAY</Text>
        <Text style={[styles.payValue, isDark && styles.payValueDark]} numberOfLines={1}>
          {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
        </Text>
      </View>
    </Pressable>
  );
}

/** The same silhouette with nothing in it, so the feed does not jump when the
 *  data lands. */
function PeekRow({ job, onPress }: { job: OpenJob; onPress: () => void }) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const accent = categoryAccent(job.category);
  const icon = JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal';
  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = jobThumbnailUrl(job);
  const showImage = !!thumbUrl && !imageFailed;
  const day = scheduledDayLabel(job.scheduled_date, new Date());
  const hood = neighbourhoodLabel(job.location);
  const category = JOB_CATEGORY_CHIP_LABELS[job.category] ?? job.category;

  // Does the day fit beside the chip? Unknown until both have laid out;
  // re-asked whenever the words change.
  // 2026-09-29 (LUX-LIST-2 run): the pay column's MEASURED width (never under PEEK_PAY_WIDTH) + air is what
  // the title and the category line keep clear — a fixed 56 cut "$140" to "$1…".
  const [payWidth, setPayWidth] = useState<number | null>(null);
  const payClear = payWidth === null ? PEEK_PAY_CLEAR : Math.max(PEEK_PAY_WIDTH, Math.ceil(payWidth)) + PEEK_PAY_AIR;
  const [dayFits, setDayFits] = useState<boolean | null>(null);
  const [metaWidth, setMetaWidth] = useState<number | null>(null);
  const [dayRight, setDayRight] = useState<number | null>(null);
  useEffect(() => {
    setDayFits(null);
    setDayRight(null);
  }, [day, category, payClear]);
  useEffect(() => {
    if (dayFits !== null || metaWidth === null || dayRight === null) return;
    setDayFits(dayRight <= metaWidth - payClear);
  }, [dayFits, metaWidth, dayRight, payClear]);
  const onMetaLayout = (event: LayoutChangeEvent) => setMetaWidth(event.nativeEvent.layout.width);
  const onDayLayout = (event: LayoutChangeEvent) =>
    setDayRight(event.nativeEvent.layout.x + event.nativeEvent.layout.width);
  const dayBeside = day !== null && dayFits !== false;

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
          <CategoryGlyph name={icon} size={22} color={isDark ? colors.emerald : accent.icon} bare />
        </View>
      )}
      <View style={styles.peekBody}>
        <Text style={[styles.peekTitle, { paddingRight: payClear }]} numberOfLines={1}>
          {job.title}
        </Text>
        <View style={[styles.peekMeta, { paddingRight: payClear }]} onLayout={onMetaLayout}>
          <View style={[styles.peekCategory, isDark && styles.peekCategoryDark]}>
            <Text style={styles.peekCategoryText} numberOfLines={1}>
              {category}
            </Text>
          </View>
          {dayBeside ? (
            <Text
              style={[styles.peekDay, dayFits === null && styles.peekUnmeasured]}
              numberOfLines={1}
              onLayout={onDayLayout}
            >
              {day}
            </Text>
          ) : null}
        </View>
        {hood || (day && !dayBeside) ? (
          <View style={styles.peekLocation}>
            {hood ? <Ionicons name="location-outline" size={16} color={colors.emerald} /> : null}
            {hood ? (
              <Text style={styles.peekLocationText} numberOfLines={1}>
                {hood}
              </Text>
            ) : null}
            {day && !dayBeside ? (
              <Text style={styles.peekDay} numberOfLines={1}>
                {hood ? `· ${day}` : day}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View
          style={styles.peekPay}
          pointerEvents="none"
          onLayout={(event) => setPayWidth(event.nativeEvent.layout.width)}
        >
          <Text style={styles.peekPayCaption}>EST. PAY</Text>
          <Text style={[styles.peekPayValue, isDark && styles.peekPayValueDark]} numberOfLines={1}>
            {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.navInactive} />
    </Pressable>
  );
}

export function WorkerJobCardSkeleton() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View style={[styles.card, litCardStyle(isDark)]}>
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
  // The pay block rides over the card's top-right corner (a1); the title and
  // the chip row keep its MEASURED width + PAY_AIR of it (applied at the call
  // site), the lines beneath run full width.
  // Wraps only as the last resort: the short label and "Your job" together too wide for the room.
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: chipGap(),
  },
  // The chip at the full label, before the fit is decided: laid out, unseen.
  chipUnmeasured: {
    opacity: 0,
  },
  factsDot: {
    color: colors.textMuted,
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
    // One card size: never shorter than the picture beside it.
    minHeight: THUMB_SIZE,
  },
  // Decision 9: a card title is display type. Master 12 draws these serif.
  title: {
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
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
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
    color: colors.money,
  },
  payValueDark: { color: colors.money },
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
  // The body holds the pay column too (absolute, over its top two lines), so
  // the location line can run the full width beneath it. Clipped, as the
  // last guarantee that nothing draws over the pay.
  peekBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs + 1,
    overflow: 'hidden',
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
  peekUnmeasured: {
    opacity: 0,
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
  // The pay column: pinned to the body's right over its top two lines, the
  // label at the top, the amount centred on the body.
  peekPay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    // Sized by its figure, never under PEEK_PAY_WIDTH (LUX-LIST-2 run: a fixed width cut "$140").
    minWidth: PEEK_PAY_WIDTH,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  peekPayCaption: {
    position: 'absolute',
    top: 1,
    right: 0,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    color: colors.textMuted,
  },
  // The amount: `amountGold` in light (2026-09-20 sitting 2, the operator's
  // brighter pick), `gold` in dark.
  peekPayValue: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.amountGold,
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
