import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { colors, radius, spacing } from '../lib/theme';
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
  onPress,
}: HubCardProps) {
  const accent = categoryAccent(category);
  // A stored URL can still be dead (deleted object, expired host); falling back
  // on error keeps a broken image from rendering as a grey hole in the list.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!thumbnailUrl && !imageFailed;

  return (
    <Card onPress={onPress}>
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
            <Ionicons name={icon} size={20} color={accent.icon} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
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
        <StatusBadge status={status} />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.price} numberOfLines={1}>
          {priceLabel ? `${priceLabel} ` : ''}
          {formatBudget(priceCents)}
        </Text>
        <View style={styles.footerRight}>
          {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.neutralBg,
  },
  iconCircle: {
    // backgroundColor set per-category inline — see JOB_CATEGORY_COLORS.
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  price: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  time: {
    fontSize: 12,
    color: colors.textSubtle,
  },
});
