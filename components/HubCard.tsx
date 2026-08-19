import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { categoryAccent, formatBudget, type JobCategory } from '../lib/jobs';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type HubCardProps = {
  icon: IoniconName;
  /** Drives the icon chip's per-category accent color — see JOB_CATEGORY_COLORS. */
  category: JobCategory;
  title: string;
  /** Counterparty line, e.g. "Worker · Carlos Reyes". */
  subtitle: string;
  /**
   * The job's own thumbnail, from jobThumbnailUrl(). When absent (most jobs)
   * the category chip is shown instead — same rule and same fallback as the
   * browse feed's card, so one job never looks like two different jobs
   * depending on which screen it is on.
   */
  thumbnailUrl?: string | null;
  /** "Cleaning · Bushwick" — category and neighborhood, matching the feed card. */
  metaLine?: string;
  /** Posting age, e.g. "2h ago". */
  timeLabel?: string;
  priceCents: number | null;
  priceLabel?: string;
  status: string;
  /** Overrides the badge's text while keeping `status`'s colour — see
   *  StatusBadge. Used when the status key alone under-states the row
   *  ("Pending" on a counter that is actually waiting on the viewer). */
  statusLabel?: string;
  /**
   * The card's derived NEXT-ACTION line ("3 bids to review", "Approval
   * needed — releases in 41h") — the primary label of the card's action
   * area; "View details" demotes to a secondary line beneath it. Derived by
   * the caller through lib/jobLifecycle.ts, never invented here.
   */
  nextAction?: string;
  onPress: () => void;
};

export function HubCard({
  icon,
  category,
  title,
  subtitle,
  thumbnailUrl,
  metaLine,
  timeLabel,
  priceCents,
  priceLabel,
  status,
  statusLabel,
  nextAction,
  onPress,
}: HubCardProps) {
  const { palette: colors, isDark } = useThemeColors();
  // Forest is near-black on a dark surface under palette v2; masters
  // 35/36/37 draw these accents gold.
  const chrome = isDark ? colors.gold : colors.forest;
  const styles = stylesFor(colors);
  const accent = categoryAccent(category);
  // A stored URL can still be dead (deleted object, expired host); falling back
  // on error keeps a broken image from rendering as a grey hole in the list.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!thumbnailUrl && !imageFailed;

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.statusRow}>
        <StatusBadge status={status} label={statusLabel} />
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
      </View>

      <View style={styles.headerRow}>
        {showImage ? (
          <Image
            source={{ uri: thumbnailUrl! }}
            style={styles.thumb}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
            accessible
            accessibilityLabel={`Photo for ${title}`}
          />
        ) : (
          <View style={[styles.thumb, styles.iconCircle, { backgroundColor: accent.bg }]}>
            <Ionicons name={icon} size={24} color={accent.icon} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {metaLine ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {metaLine}
            </Text>
          ) : null}
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.priceWrap}>
          {priceLabel ? <Text style={styles.priceLabel}>{priceLabel}</Text> : null}
          <Text style={[styles.price, isDark && styles.priceDark]} numberOfLines={1}>
            {formatBudget(priceCents)}
          </Text>
        </View>
        {nextAction ? (
          <View style={styles.nextActionWrap}>
            <View style={styles.nextActionRow}>
              <Ionicons name="arrow-forward-circle" size={16} color={chrome} />
              <Text
                style={[styles.nextActionText, isDark && styles.chromeTextDark]}
                numberOfLines={2}
              >
                {nextAction}
              </Text>
            </View>
            <Text style={styles.detailsSecondary}>View details</Text>
          </View>
        ) : (
          <View style={[styles.detailsAffordance, isDark && styles.detailsAffordanceDark]}>
            <Text style={[styles.detailsText, isDark && styles.chromeTextDark]}>
              View details
            </Text>
            <Ionicons name="arrow-forward" size={16} color={chrome} />
          </View>
        )}
      </View>
    </Card>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  card: {
    gap: spacing.md,
    borderRadius: radius.xl,
    borderColor: colors.mint2,
    padding: spacing.lg,
  },
  statusRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.neutralBg,
  },
  iconCircle: {
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  // Masters 35/36/37 set the job title and its price in the display serif.
  title: {
    fontFamily: fonts.display,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.mint2,
    gap: spacing.md,
  },
  priceWrap: {
    flexShrink: 1,
    gap: 1,
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  price: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '800',
    color: colors.forest,
  },
  // Masters 35/36/37 set the OWNER's own figure cream, like masters 8/16/17.
  priceDark: { color: colors.ink },
  // Masters 35/36/37 draw "View details →" as a gold-outline chip.
  detailsAffordance: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
  },
  detailsAffordanceDark: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  chromeTextDark: { color: colors.ink },
  // The next-action is the card's primary action label; "View details" sits
  // under it as the demoted secondary line.
  nextActionWrap: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  nextActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nextActionText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: colors.forest,
    textAlign: 'right',
  },
  detailsSecondary: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  detailsText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.forest,
  },
  }),
);
