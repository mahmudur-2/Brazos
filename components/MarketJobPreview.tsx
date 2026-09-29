import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from './RemoteImage';
import { CategoryGlyph } from './CategoryGlyph';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { JobVideo } from './JobVideo';
import { DetailScreen } from '../ui/templates/DetailScreen';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { useModeSwitch } from '../modes';
import {
  arrivalWindowLabel,
  budgetRangeLabel,
  categoryAccent,
  formatBudget,
  hasBudget,
  JOB_CATEGORY_ICONS,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import type { Profile } from '../lib/profiles';
import { formatTimeAgo } from '../lib/time';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

type MarketJobPreviewProps = {
  job: OpenJob;
  poster: Profile | null;
  onBack: () => void;
};

/**
 * MarketJobPreview (Phase 8, §10) — the CUSTOMER-safe rendering of an open
 * marketplace job. JobDetailScreen delegates to this whenever it is reached
 * in customer mode on someone else's job (a map drill-down, a My Jobs path),
 * which closes the documented reachability leak at the SCREEN, not at the
 * call sites — there is no route a customer can take that renders worker
 * surfaces, because the surface itself checks the mode.
 *
 * What a customer may see: title, description, category, EST. PRICE (the
 * poster's budget — customer vocabulary), APPROXIMATE location (the public
 * `location` string; exact coordinates live in job_locations behind RLS),
 * posting media, and the poster's public identity.
 *
 * What is structurally absent: EST. PAY / payout-after-fee figures, bid
 * CTAs, the own-bid card, bid counts — every worker-perspective element.
 * Bidding requires actually being in Worker Mode: the one action offered is
 * switchMode()'s confirmed switch (§F — a cross-mode surface never switches
 * silently).
 */
export function MarketJobPreview({ job, poster, onBack }: MarketJobPreviewProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { switching, switchToOtherMode } = useModeSwitch();

  // 2026-09-26 (the refresh, audit M-23) — the switch keeps its promise. A
  // confirmed switch used to drop the person on Worker Home with the job
  // gone; now, like a tapped push (lib/notificationRoutes.ts), it routes only
  // after the worker tree is mounted, to this job's detail in My Jobs, where
  // bidding is. Declining leaves them exactly here.
  async function switchAndOpen() {
    const switched = await switchToOtherMode();
    if (switched) navigateAcrossTabs('MyJobs', 'JobDetail', { job });
  }
  const accent = categoryAccent(job.category);

  return (
    <DetailScreen
      title="Job on the Market"
      subtitle={JOB_CATEGORY_LABELS[job.category] ?? job.category}
      onBack={onBack}
      state={{ kind: 'ready' }}
      sections={[
        {
          content: (
            <View style={styles.headerCard}>
              <View style={styles.headerTopRow}>
                <View
                  style={[
                    styles.iconCircle,
                    isDark ? styles.iconCircleDark : { backgroundColor: accent.bg },
                  ]}
                >
                  <CategoryGlyph
                    name={JOB_CATEGORY_ICONS[job.category] ?? 'ellipsis-horizontal'}
                    size={20}
                    color={isDark ? colors.emerald : accent.icon}
                    bare
                  />
                </View>
                <Text style={styles.postedAt}>Posted {formatTimeAgo(job.created_at)}</Text>
              </View>
              <Text style={styles.title}>{job.title}</Text>
              <View style={styles.priceBlock}>
                <Text style={styles.priceEyebrow}>EST. PRICE</Text>
                <Text style={styles.price}>
                  {hasBudget(job) ? budgetRangeLabel(job) : formatBudget(null)}
                </Text>
              </View>
              {job.location ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.metaText}>
                    {job.location} · approximate area
                  </Text>
                </View>
              ) : null}
              {arrivalWindowLabel(job) ? (
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.metaText}>{arrivalWindowLabel(job)}</Text>
                </View>
              ) : null}
            </View>
          ),
        },
        ...(job.description
          ? [
              {
                title: 'What they need',
                content: (
                  <Text style={styles.description} selectable>
                    {job.description}
                  </Text>
                ),
              },
            ]
          : []),
        ...(job.photos.length > 0 || job.videos.length > 0
          ? [
              {
                title: 'Posting media',
                content: (
                  <View style={styles.mediaBlock}>
                    {job.photos.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.mediaRow}
                      >
                        {job.photos.map((url) => (
                          <RemoteImage key={url} uri={url} style={styles.mediaPhoto} />
                        ))}
                      </ScrollView>
                    ) : null}
                    {job.videos.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.mediaRow}
                      >
                        {job.videos.map((url) => (
                          <JobVideo key={url} uri={url} label="Job video" />
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                ),
              },
            ]
          : []),
        ...(poster
          ? [
              {
                title: 'Posted by',
                content: (
                  <View style={styles.posterRow}>
                    <Avatar name={poster.full_name} uri={poster.avatar_url} size={44} />
                    <Text style={styles.posterName} numberOfLines={1}>
                      {poster.full_name ?? 'Customer'}
                    </Text>
                  </View>
                ),
              },
            ]
          : []),
        {
          content: (
            <View style={styles.noticeCard}>
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.emerald} />
              <Text style={styles.noticeText}>
                You’re viewing this as a customer. Bidding and the other worker
                tools live in Worker Mode.
              </Text>
            </View>
          ),
        },
      ]}
      actionBar={
        <Button
          title="Switch to Worker Mode and open this job"
          variant="secondary"
          onPress={() => void switchAndOpen()}
          loading={switching}
          disabled={switching}
        />
      }
    />
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  headerCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mint2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
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
  postedAt: {
    fontSize: 12,
    color: colors.textMuted,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 29,
  },
  priceBlock: {
    gap: 2,
  },
  priceEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.eyebrow,
    letterSpacing: 0.8,
  },
  price: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  description: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  mediaBlock: {
    gap: spacing.sm,
  },
  mediaRow: {
    gap: spacing.sm,
  },
  mediaPhoto: {
    width: 220,
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  posterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  posterName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  }),
);
