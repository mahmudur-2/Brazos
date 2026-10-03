import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Card } from './Card';
import { CategoryGlyph } from './CategoryGlyph';
import { StageRail } from './StageRail';
import { StatusBadge } from './StatusBadge';
import type { LiveJobStatus } from '../lib/liveJobStatus';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  litCardStyle,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
// `radius` still shapes the thumb and the details chip below.
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
   * needed — releases Sat at 3 PM") — the primary label of the card's action
   * area; "View details" demotes to a secondary line beneath it. Derived by
   * the caller through lib/jobLifecycle.ts, never invented here.
   */
  nextAction?: string;
  onPress: () => void;
  /**
   * 2026-09-28 (LUX-LIST-64 #45) — an ASSIGNED job's live status: the stage
   * rail, one status line and a chat button (components/StageRail.tsx), in
   * place of the next-action line. From lib/liveJobStatus.ts; absent, the card
   * is as it was.
   */
  live?: LiveJobStatus | null;
  /** The rail's message button, and what it says to a screen reader. */
  onChat?: () => void;
  chatLabel?: string;
  /** A word after the price — "held" while the payment sits in protection. */
  moneyNote?: string;
};

/**
 * 2026-09-27 (the operator's review): a next-action label that carries a
 * detail after an em dash — "Approval needed — releases Sat at 3 PM", "Worker on
 * the way — track progress" — breaks THERE, the action on the first line and
 * the detail under it, instead of wherever the column happens to run out
 * ("66h" alone on a second line). A label without a dash is untouched.
 */
export function splitNextAction(label: string): [string, string | null] {
  const at = label.indexOf(' — ');
  if (at < 0) return [label, null];
  return [label.slice(0, at), label.slice(at + 3)];
}

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
  live,
  onChat,
  chatLabel,
  moneyNote,
}: HubCardProps) {
  const { palette: colors, isDark } = useThemeColors();
  // 2026-09-27 (the Lux remake): the next-action link is the one mint action
  // colour in dark (the Lux hub card's `.act`); light keeps the forest.
  const chrome = isDark ? colors.emerald : colors.forest;
  const styles = stylesFor(colors);
  const accent = categoryAccent(category);
  // A stored URL can still be dead (deleted object, expired host); falling back
  // on error keeps a broken image from rendering as a grey hole in the list.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!thumbnailUrl && !imageFailed;
  const [actionHead, actionTail] = splitNextAction(nextAction ?? '');

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.statusRow}>
        <StatusBadge status={status} label={statusLabel} />
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
      </View>

      <View style={styles.headerRow}>
        {showImage ? (
          <RemoteImage
            uri={thumbnailUrl!}
            style={styles.thumb}
            contentFit="cover"
            onError={() => setImageFailed(true)}
            accessible
            accessibilityLabel={`Photo for ${title}`}
          />
        ) : (
          <View
            style={[
              styles.thumb,
              styles.iconCircle,
              // LUX-LIST-2 #6: the lit tile in dark; light keeps the category colour.
              isDark ? [styles.iconCircleDark, litCardStyle(true, 'tile')] : { backgroundColor: accent.bg },
            ]}
          >
            {/* 2026-09-27 (the Lux remake, rulings 5 and 12): the Lux line icon, mint in dark. */}
            <CategoryGlyph name={icon} size={24} color={isDark ? colors.emerald : accent.icon} />
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

      {/* 2026-09-28 (LUX-LIST-64 #45): an assigned job shows where it stands. */}
      {live ? <StageRail status={live} onChat={onChat} chatLabel={chatLabel} /> : null}

      <View style={styles.footerRow}>
        <View style={styles.priceWrap}>
          {priceLabel ? <Text style={styles.priceLabel}>{priceLabel}</Text> : null}
          <View style={styles.priceLine}>
            <Text style={styles.price} numberOfLines={1}>
              {formatBudget(priceCents)}
            </Text>
            {moneyNote ? <Text style={styles.moneyNote}>{moneyNote}</Text> : null}
          </View>
        </View>
        {/* 2026-09-28 (LUX-LIST-64 #18, #21, #43): "View details" and a PLAIN mint
            arrow after it — no circle, no outlined pill. An action line above it
            carries no arrow of its own, and under one "View details" is the
            quiet grey; alone it is the mint link. The target stays 44 tall. */}
        {nextAction && !live ? (
          <View style={styles.nextActionWrap}>
            <View style={styles.nextActionLines}>
              <Text
                style={[styles.nextActionText, isDark && styles.chromeTextDark]}
                numberOfLines={actionTail ? 1 : 2}
              >
                {actionHead}
              </Text>
              {actionTail ? (
                <Text
                  style={[styles.nextActionTail, isDark && styles.chromeTextDark]}
                  numberOfLines={1}
                >
                  {actionTail}
                </Text>
              ) : null}
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsSecondary}>View details</Text>
              <Ionicons name="arrow-forward" size={15} color={chrome} />
            </View>
          </View>
        ) : (
          <View style={styles.detailsAffordance}>
            <Text style={[styles.detailsText, live ? styles.detailsQuiet : isDark && styles.chromeTextDark]}>
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
  // 2026-09-27 (the Lux remake): the card's shape and rim are the material's
  // (components/Card.tsx); this only spaces the rows.
  card: {
    gap: spacing.md,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  // D2: one category tile everywhere — deep-green surface, gold hairline,
  // gold glyph. The saturated per-category fills are retired in dark; light
  // keeps them.
  iconCircleDark: {
    backgroundColor: colors.mint,
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
    color: colors.money,
  },
  // The "View details →" chip: a mint outline in dark (the Lux link colour).
  detailsAffordance: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs + 2,
  },
  chromeTextDark: { color: colors.emerald },
  // The next-action is the card's primary action label; "View details" sits
  // under it as the demoted secondary line.
  nextActionWrap: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  // #43: "View details" and its plain mint arrow, under the action line.
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // A live card's link is the quiet grey (refs/live-job-cards.html `.vd`).
  detailsQuiet: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  // #45: "$110 held" — the word after the price, 13/600 muted.
  moneyNote: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  nextActionLines: {
    flexShrink: 1,
    alignItems: 'flex-end',
    gap: 1,
  },
  nextActionText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: colors.forest,
    textAlign: 'right',
  },
  // The detail after the dash: one weight lighter, one point smaller, under
  // the action it belongs to.
  nextActionTail: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.forest,
    textAlign: 'right',
  },
  detailsSecondary: {
    fontSize: 13,
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
