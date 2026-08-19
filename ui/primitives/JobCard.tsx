import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useModePerspective } from '../../modes';
import {
  categoryAccent,
  formatBidCount,
  formatBudget,
  formatPendingBidCount,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  jobThumbnailUrl,
  type OpenJob,
} from '../../lib/jobs';
import { formatTimeAgo } from '../../lib/time';
import {
  fonts,
  layout,
  radius,
  shadows,
  spacing,
  type EmeraldPalette,
  type as typeScale,
} from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';

/**
 * §I's mode-aware `JobCard` — deferred from Phase 1 because it requires
 * ModeContext, which Phase 2 is what creates.
 *
 * THE RULE IT ENFORCES
 * CLAUDE.md: "JobCard perspective comes from ModeContext, never a hand-passed
 * prop." There is no `mode` / `perspective` / `isWorker` prop below and there
 * must never be one: the perspective is read from useModePerspective(), so a
 * customer surface *cannot* be made to render EST. PAY or a bid affordance by
 * passing the wrong value — there is no value to pass. §P.5.
 *
 * WHAT IS DELIBERATELY NOT HERE YET
 * This is the foundation, not the finished Browse Jobs redesign (that is Phase
 * 8). The worker affordances below are structural seams sized for what later
 * phases will put in them — `onBid` for Phase 5's OfferComposer entry, the
 * "Break the ice" state for the first-bid nudge, `distanceMiles` for the exact
 * radius already returned by jobs_within_radius(). None of them invent business
 * logic, and every one of them is inert in customer perspective.
 *
 * No existing screen has been migrated onto this card in Phase 2 — the screens
 * it replaces (components/BrowseJobCard.tsx, components/WorkerJobCard.tsx and
 * Home's OpenJobCard) are still in place and untouched, because migrating them
 * is a visual change to screens Phase 2 is not allowed to redesign, one of
 * which is LOCKED. Later phases adopt it per screen.
 */

const THUMB_SIZE = 92;

export type JobCardProps = {
  job: OpenJob;
  onPress: () => void;
  /**
   * The viewer posted this job. Shown in both perspectives — a worker seeing
   * their own job in the feed needs to know, and so does a customer.
   */
  isOwn?: boolean;
  /**
   * From useBidCounts(). Undefined means "not known yet", in which case the
   * line is omitted rather than guessed at — "No bids yet" on a job that has
   * bids would be worse than silence.
   */
  bidCount?: number;
  /**
   * WORKER PERSPECTIVE ONLY — ignored entirely in customer perspective, not
   * merely hidden. Wired by Phase 5 to the OfferComposer.
   */
  onBid?: () => void;
  /**
   * WORKER PERSPECTIVE ONLY. Exact distance from jobs_within_radius(). A
   * customer must not see how far a job is from a worker's position, and never
   * receives a job's precise coordinates in the first place (RLS on
   * job_locations) — this is the display half of that boundary.
   */
  distanceMiles?: number | null;
};

export function JobCard({
  job,
  onPress,
  isOwn = false,
  bidCount,
  onBid,
  distanceMiles,
}: JobCardProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // The whole mode split, in one line. Nothing above can override it.
  const perspective = useModePerspective();
  const isWorker = perspective === 'worker';

  const accent = categoryAccent(job.category);
  const icon = JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal';
  const categoryLabel = JOB_CATEGORY_LABELS[job.category] ?? job.category;

  // A URL can be present but dead — a deleted storage object, an expired host.
  // Falling back on error means a broken image never renders as a grey hole in
  // the middle of the feed.
  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = jobThumbnailUrl(job);
  const showImage = !!thumbUrl && !imageFailed;

  // §I / CLAUDE.md: "Customer surfaces: EST. PRICE ... Worker surfaces: EST.
  // PAY". Two labels for the same number because they are not the same fact —
  // one is what it costs, the other is what it earns.
  const moneyLabel = isWorker ? 'EST. PAY' : 'EST. PRICE';

  // Worker-only nudge for a job nobody has bid on yet. Only meaningful to
  // someone who could place that first bid, so it does not exist for customers
  // — for whom "no bids yet" is a status, not an invitation.
  const showBreakTheIce = isWorker && bidCount === 0 && !isOwn;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={job.title}
    >
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
          <View
            style={[
              styles.thumb,
              styles.thumbFallback,
              isDark ? styles.thumbFallbackDark : { backgroundColor: accent.bg },
            ]}
          >
            <Ionicons name={icon} size={30} color={isDark ? colors.gold : accent.icon} />
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
              {/* Worker-only. See distanceMiles above. */}
              {isWorker && distanceMiles != null ? ` · ${distanceMiles.toFixed(1)} mi` : ''}
            </Text>

            <View style={styles.badgeRow}>
              {isOwn ? (
                <View style={styles.ownBadge}>
                  <Ionicons name="person-outline" size={11} color={colors.forest} />
                  <Text style={styles.ownBadgeText}>Your job</Text>
                </View>
              ) : null}
              {showBreakTheIce ? (
                <View style={styles.iceBadge}>
                  <Ionicons name="sparkles" size={11} color={colors.gold} />
                  <Text style={styles.iceBadgeText}>Break the ice</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.footerRow}>
            <View style={styles.moneyBlock}>
              {/* Eyebrow law (decision 6): the label is STRUCTURE — gold in
                  dark — and the value is MONEY — emerald in dark. Light keeps
                  the Heritage pairing. Resolves conflict B-4 (12/43 green vs
                  13/10 gold values) toward the law. */}
              <Text style={[styles.moneyLabel, isDark && { color: colors.gold }]}>
                {moneyLabel}
              </Text>
              <Text
                style={[styles.money, isDark && { color: colors.emerald }]}
                numberOfLines={1}
              >
                {/* Masters 12 and 43 write an unset budget as "Open" in the
                    VALUE slot under the money eyebrow — the eyebrow already
                    says what the value is about. "Open budget" is the one form
                    no master draws. */}
                {job.budget_cents != null ? formatBudget(job.budget_cents) : 'Open'}
              </Text>
            </View>

            {bidCount != null ? (
              <Text style={styles.bids} numberOfLines={1}>
                {isOwn ? formatPendingBidCount(bidCount) : formatBidCount(bidCount)}
              </Text>
            ) : null}

            <Text style={styles.time} numberOfLines={1}>
              {formatTimeAgo(job.created_at)}
            </Text>
          </View>
        </View>
      </View>

      {/* Worker-only bidding affordance. Rendered from the perspective, not
          from a prop the caller chose — a customer surface passing onBid still
          gets nothing. */}
      {isWorker && onBid && !isOwn ? (
        <Pressable
          onPress={onBid}
          style={({ pressed }) => [styles.bidButton, pressed && styles.bidButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Place a bid on ${job.title}`}
        >
          <Text style={styles.bidButtonText}>Place a bid</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: layout.cardPadding,
    gap: spacing.md,
    ...shadows.card,
  },
  cardPressed: {
    opacity: 0.9,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // D2: one category tile everywhere — the deep-green surface under a gold
  // hairline, carrying a gold glyph. The saturated per-category fills are
  // unconverted Heritage colour and are retired in dark; light keeps them.
  thumbFallbackDark: {
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.line,
  },
  body: {
    flex: 1,
    minHeight: THUMB_SIZE,
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  bodyTop: {
    gap: 3,
  },
  title: {
    ...typeScale.title,
    fontSize: 16,
    lineHeight: 21,
    color: colors.ink,
  },
  meta: {
    ...typeScale.body,
    fontSize: 13,
    color: colors.muted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
  },
  ownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  ownBadgeText: {
    ...typeScale.caption,
    fontWeight: '700',
    color: colors.forest,
  },
  iceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  iceBadgeText: {
    ...typeScale.caption,
    fontWeight: '700',
    color: colors.ink,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  moneyBlock: {
    flexShrink: 1,
  },
  moneyLabel: {
    ...typeScale.eyebrow,
    color: colors.emerald,
  },
  money: {
    // Decision 9: prices speak the serif in both themes.
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  bids: {
    ...typeScale.sub,
    fontWeight: '600',
    color: colors.muted,
  },
  time: {
    ...typeScale.caption,
    color: colors.muted,
  },
  bidButton: {
    // CLAUDE.md's >= 44pt touch-target floor, which overrides §I's 38.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
  },
  bidButtonPressed: {
    backgroundColor: colors.mint2,
  },
  bidButtonText: {
    ...typeScale.title,
    color: colors.forest,
  },
  }),
);
