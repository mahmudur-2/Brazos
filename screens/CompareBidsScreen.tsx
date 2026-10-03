import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useJobOffers } from '../hooks/useJobOffers';
import { goBackOrHome } from '../lib/navigationRef';
import {
  BID_ORDER_RULE,
  compareWorkerFromSummary,
  highestRatedBadgeId,
  knownRating,
  onTimePercent,
  sortBidsDeterministic,
  trustRowFor,
  type CompareWorker,
} from '../lib/compareBids';
import { effectiveOfferStatus, type OfferWithWorker } from '../lib/offers';
import { formatBudget } from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { useDialNumber } from '../lib/designOverrides';
import {
  EYEBROW_TYPE,
  litCardStyle, fonts,
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Master 46's three protection tiles. Each names a mechanic that exists. */
const PROTECTS_TILES: { icon: IoniconName; title: string; sub: string }[] = [
  { icon: 'document-text-outline', title: 'Scope', sub: 'Agreed work' },
  { icon: 'shield-outline', title: 'Payment', sub: 'Held safely' },
  { icon: 'camera-outline', title: 'Evidence', sub: 'Before release' },
];

/**
 * Screen 28 / golden master 46 — Compare Bids. One full-width card per bid,
 * stacked vertically — bid count is unbounded, so master 46's fixed
 * three-column grid cannot hold it. The order is deterministic and STATED on
 * screen (lib/compareBids.ts); there is no blended score and no ranking
 * language. The only badge is "HIGHEST RATED", and only when the top rating
 * is a defensible fact (3+ reviews, every rival's rating known and strictly
 * lower). The ribbon master 46 draws over its first column asserts a judgement
 * no stored figure supports, so it is not implemented — and the phrase itself
 * stays out of this file, which tests/conversion.test.mjs scans unstripped.
 *
 * Selecting a row opens Bid Detail (29), where accept/counter/decline live
 * behind their consequence copy — accept_offer() stays the only assignment
 * path and this screen performs no write of any kind.
 */
export function CompareBidsScreen() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C9) — the two this screen's own body owns. The bid rows have their
  // own three, read in CompareRow below.
  const listGap = useDialNumber('compareBids.list.gap') ?? spacing.md;
  const protectsGlyphSize = useDialNumber('compareBids.protectsGlyph.size') ?? 34;
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'CompareBids'>>();
  const job = params.job;

  // n7 — ONE profile_review_summaries() call for the offers' worker ids
  // (worker role, REVEALED reviews only), issued by the shared hook whenever
  // that id set changes. It replaces the per-worker worker_job_stats() loop:
  // the row's completed_jobs IS worker_job_stats' predicate summed (D3), so
  // the figure's definition is unchanged. `summaries` is null until the batch
  // answers — UNKNOWN — and every read below treats null as "render nothing".
  const { offers, loading, error, refresh, summaries } = useJobOffers(job.id, {
    summaries: true,
  });

  const pending = useMemo(
    () => offers.filter((offer) => effectiveOfferStatus(offer) === 'pending'),
    [offers]
  );
  // The rank rows: each pending bid with its worker's summary mapped to
  // CompareWorker (null while unanswered → unrated → sorts last as a block,
  // and no badge until the numbers are known).
  const ranked = useMemo(
    () =>
      pending.map((bid) => ({
        id: bid.id,
        amount_cents: bid.amount_cents,
        created_at: bid.created_at,
        worker: compareWorkerFromSummary(summaries?.get(bid.worker_id)),
        bid,
      })),
    [pending, summaries]
  );
  const sorted = useMemo(() => sortBidsDeterministic(ranked), [ranked]);
  const badgeId = useMemo(() => highestRatedBadgeId(ranked), [ranked]);

  const state: ScreenState =
    loading && offers.length === 0
      ? { kind: 'loading', variant: 'skeleton', rows: 3 }
      : error && offers.length === 0
        ? { kind: 'error', message: error, onRetry: () => void refresh() }
        : pending.length === 0
          ? {
              kind: 'empty',
              title: 'No active bids to compare',
              body: 'When workers bid on this job, they’ll appear here side by side.',
            }
          : { kind: 'ready' };

  return (
    <DetailScreen
      title="Compare Bids"
      onBack={goBackOrHome}
      state={state}
      sections={[
        {
          content: (
            <View style={styles.headerBlock}>
              {/* §5.2 — master 46's framing: count, title, and the line. The
                  protection copy it draws is the closing card below, and it
                  states only mechanics this build has. */}
              <View style={[styles.headerCard, litCardStyle(isDark)]}>
                {/* 2026-09-26 (the refresh): master 46's ghost B is gone —
                    the B mark belongs to the Launch screen only. */}
                <View style={styles.headerTopRow}>
                  <Text style={styles.headerEyebrow} numberOfLines={1}>
                    {pending.length} {pending.length === 1 ? 'bid' : 'bids'} · {job.title}
                  </Text>
                  {/* Configuration truth: every job on this build runs through
                      the sandbox protection flow, which is what the pill
                      names — no per-job claim is made. */}
                  <View style={styles.protectedPill}>
                    <Text style={styles.protectedPillText}>Protected job</Text>
                  </View>
                </View>
                <Text style={styles.headerTitle}>Compare each bid in full.</Text>
                <Text style={styles.headerFraming}>
                  Price matters, but fit, reliability and included work determine value.
                </Text>
              </View>
              {/* §5.4 — the order is deterministic and stated. */}
              <Text style={styles.orderRule}>{BID_ORDER_RULE}</Text>
            </View>
          ),
        },
        {
          content: (
            <View style={[styles.list, { gap: listGap }]}>
              {sorted.map((row) => (
                <CompareRow
                  key={row.id}
                  bid={row.bid}
                  worker={row.worker}
                  highestRated={row.id === badgeId}
                  // Absent row or null column = UNKNOWN, never zero.
                  completedJobs={summaries?.get(row.bid.worker_id)?.completedJobs ?? null}
                  onPress={() =>
                    navigation.navigate('BidDetail', { job, offerId: row.id })
                  }
                />
              ))}
            </View>
          ),
        },
        {
          // Master 46's closing card. Every line states a mechanic this build
          // actually has — the agreed scope, the held payment, the evidence
          // gate before release — so it is configuration truth, not a claim
          // about any particular bid.
          content: (
            <View style={[styles.protectsCard, litCardStyle(isDark)]}>
              <View style={styles.protectsShield} pointerEvents="none">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={26}
                  color={isDark ? colors.gold : colors.emerald}
                />
              </View>
              <Text style={styles.headerEyebrow}>BRAZOS PROTECTS</Text>
              <Text style={styles.headerTitle}>One job. One clear record.</Text>
              <View style={styles.protectsRow}>
                {PROTECTS_TILES.map((tile) => (
                  <View key={tile.title} style={styles.protectsTile}>
                    <View
                      style={[
                        styles.protectsGlyph,
                        { width: protectsGlyphSize, height: protectsGlyphSize },
                        isDark && styles.protectsGlyphDark,
                      ]}
                    >
                      <Ionicons
                        name={tile.icon}
                        size={18}
                        color={isDark ? colors.gold : colors.emerald}
                      />
                    </View>
                    <View style={styles.protectsCopy}>
                      <Text style={styles.protectsTitle}>{tile.title}</Text>
                      <Text style={styles.protectsSub}>{tile.sub}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ),
        },
      ]}
    />
  );
}

function CompareRow({
  bid,
  worker: reputation,
  highestRated,
  completedJobs,
  onPress,
}: {
  bid: OfferWithWorker;
  /** The bidder's worker-role REVEALED summary as the ranking read it (n7);
   *  null = UNKNOWN, which renders no rating and no trust facts. */
  worker: CompareWorker;
  highestRated: boolean;
  completedJobs: number | null;
  onPress: () => void;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  // RUN T2 (C9) — the bid row's own three, on the `theme.*` scale this file
  // imports spacing/radius from.
  const rowPadding = useDialNumber('compareBids.row.padding') ?? spacing.lg;
  const rowRadius = useDialNumber('compareBids.row.radius') ?? radius.xl;
  const highestBorderWidth = useDialNumber('compareBids.rowHighest.borderWidth') ?? 2;
  const worker = bid.worker;
  // Positive-only, as this row always was: the rating line needs at least one
  // REVEALED review. It prints "New" in the number's place while the
  // reputation is too young for one (is_new), the shrunk shown_average once
  // it is not, and nothing at all while the summary is unknown.
  const rating = knownRating(reputation);
  const ratingCount = reputation?.revealed_total ?? 0;
  const trust = trustRowFor(onTimePercent(reputation?.on_time_pct), completedJobs);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { padding: rowPadding, borderRadius: rowRadius },
        litCardStyle(isDark),
        highestRated && styles.rowHighest,
        highestRated && { borderWidth: highestBorderWidth },
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${worker?.full_name ?? 'worker'}’s bid of ${formatBudget(
        bid.amount_cents
      )}`}
    >
      {highestRated ? (
        <View style={styles.highestTag}>
          <Ionicons name="star" size={11} color={colors.emerald} />
          <Text style={styles.highestTagText}>Highest rated</Text>
        </View>
      ) : null}

      <View style={styles.rowHeader}>
        <Avatar name={worker?.full_name} uri={worker?.avatar_url} size={44} />
        <View style={styles.rowIdentity}>
          <Text style={styles.rowName} numberOfLines={1}>
            {worker?.full_name ?? 'Worker'}
          </Text>
          {rating != null ? (
            <View style={styles.rowRating}>
              <Ionicons name="star" size={13} color={starColors(colors, isDark).filled} />
              <Text style={styles.rowRatingStrong}>
                {reputation?.is_new ? 'New' : rating.toFixed(1)}
              </Text>
              <Text style={styles.rowRatingMuted}>({ratingCount})</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.rowAmount, isDark && styles.rowAmountDark]}>
          {formatBudget(bid.amount_cents)}
        </Text>
      </View>

      {/* D4 — facts render only when known; a worker whose record is a null
          on_time_pct and a KNOWN sub-3 job count reads "New worker" and
          nothing else. Unknown stays blank, never zero. */}
      {trust.kind === 'new' ? (
        <Text style={styles.trustNew}>New worker</Text>
      ) : (
        <>
          {trust.onTimePct != null || trust.completedJobs != null ? (
            <View style={styles.trustRow}>
              {trust.onTimePct != null ? (
                <Text style={styles.trustFact}>{trust.onTimePct}% on time</Text>
              ) : null}
              {trust.onTimePct != null && trust.completedJobs != null ? (
                <Text style={styles.trustDot}>·</Text>
              ) : null}
              {trust.completedJobs != null ? (
                <Text style={styles.trustFact}>
                  {trust.completedJobs} completed {trust.completedJobs === 1 ? 'job' : 'jobs'}
                </Text>
              ) : null}
            </View>
          ) : null}
          {bid.message ? (
            <Text style={styles.rowPitch} numberOfLines={1}>
              “{bid.message}”
            </Text>
          ) : null}
        </>
      )}

      <View style={styles.rowFooter}>
        <Text style={styles.rowMeta}>
          Bid {formatTimeAgo(bid.created_at)} · full terms{' '}
          <Ionicons name="chevron-forward" size={11} color={colors.emerald} />
        </Text>
      </View>
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  headerBlock: {
    gap: spacing.sm,
  },
  headerCard: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
    overflow: 'hidden',
  },
  // Master 46 draws every card here as a hairlined surface; light keeps the
  // approved Heritage sage wash.
  cardDark: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerEyebrow: {
    ...EYEBROW_TYPE,
    flexShrink: 1,
    color: colors.eyebrow,
  },
  // Master 46's gold-outline pill. Configuration truth, not a per-job claim.
  protectedPill: {
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  protectedPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.eyebrowGold,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.ink,
  },
  protectsCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.mint,
  },
  protectsShield: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
  },
  protectsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  protectsTile: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  protectsGlyph: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  protectsGlyphDark: {
    backgroundColor: 'transparent',
    borderColor: colors.gold,
  },
  protectsCopy: {
    gap: 1,
  },
  protectsTitle: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  protectsSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  headerFraming: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  orderRule: {
    fontSize: 12,
    color: colors.textMuted,
  },
  list: {},
  row: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  rowHighest: {
    borderColor: colors.emerald,
  },
  rowPressed: {
    opacity: 0.8,
  },
  highestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  highestTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.emerald,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontFamily: fonts.display,
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
  },
  rowRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowRatingStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  rowRatingMuted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  // Master 46 sets every bid price in the GREEN serif — a marketplace-facing
  // money value, exactly what decision 6 names. Light keeps the Heritage ink.
  rowAmount: {
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: '800',
    color: colors.money,
  },
  rowAmountDark: { color: colors.money },
  trustNew: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  trustFact: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  trustDot: {
    fontSize: 13,
    color: colors.textMuted,
  },
  rowPitch: {
    fontSize: 13,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.emerald,
  },
  }),
);
