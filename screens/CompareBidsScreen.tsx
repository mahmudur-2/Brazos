import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { SegmentedControl } from '../components/SegmentedControl';
import { DetailScreen } from '../ui/templates/DetailScreen';
import type { ScreenState } from '../ui/templates/ScreenStates';
import { useJobOffers } from '../hooks/useJobOffers';
import { goBackOrHome } from '../lib/navigationRef';
import { completionPercent } from '../lib/profiles';
import {
  bestValueOfferId,
  effectiveOfferStatus,
  OFFER_SORT_OPTIONS,
  sortOffers,
  type OfferSort,
  type OfferWithWorker,
} from '../lib/offers';
import { formatBudget } from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';
import type { MyJobsStackNavigation, MyJobsStackParamList } from '../lib/navigation';
import { colors, emeraldColors, radius, spacing } from '../lib/theme';

/**
 * Screen 28 — Compare Bids. A comparison surface, deliberately not an auction
 * board: rows show the fields that materially affect value and trust — the
 * worker's real record, the full terms, when it arrived — with sorting where
 * "best value" (rating + completion + price blended, lib/offers) is the
 * default and lowest-price is one option among three, never the layout.
 *
 * Selecting a row opens Bid Detail (29), where accept/counter/decline live
 * behind their consequence copy — the irreversible act stays one deliberate
 * step away from the ranking view.
 */
export function CompareBidsScreen() {
  const navigation = useNavigation<MyJobsStackNavigation>();
  const { params } = useRoute<RouteProp<MyJobsStackParamList, 'CompareBids'>>();
  const job = params.job;

  const { offers, loading, error, refresh } = useJobOffers(job.id);
  const [sort, setSort] = useState<OfferSort>('value');

  const pending = useMemo(
    () => offers.filter((offer) => effectiveOfferStatus(offer) === 'pending'),
    [offers]
  );
  const sorted = useMemo(() => sortOffers(pending, sort), [pending, sort]);
  const bestId = useMemo(() => bestValueOfferId(pending), [pending]);

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
      title="Compare bids"
      subtitle={job.title}
      onBack={goBackOrHome}
      state={state}
      sections={[
        {
          content: (
            <View style={styles.sortWrap}>
              <SegmentedControl
                options={OFFER_SORT_OPTIONS}
                value={sort}
                onChange={setSort}
                palette={emeraldColors}
              />
            </View>
          ),
        },
        {
          content: (
            <View style={styles.list}>
              {sorted.map((bid) => (
                <CompareRow
                  key={bid.id}
                  bid={bid}
                  isBestValue={bid.id === bestId && pending.length > 1}
                  onPress={() =>
                    navigation.navigate('BidDetail', { job, offerId: bid.id })
                  }
                />
              ))}
            </View>
          ),
        },
      ]}
    />
  );
}

function CompareRow({
  bid,
  isBestValue,
  onPress,
}: {
  bid: OfferWithWorker;
  isBestValue: boolean;
  onPress: () => void;
}) {
  const worker = bid.worker;
  const ratingCount = worker?.rating_count ?? 0;
  const completion = completionPercent(worker?.completion_rate);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isBestValue && styles.rowBest,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${worker?.full_name ?? 'worker'}’s bid of ${formatBudget(
        bid.amount_cents
      )}`}
    >
      {isBestValue ? (
        <View style={styles.bestTag}>
          <Ionicons name="sparkles" size={11} color={colors.emerald} />
          <Text style={styles.bestTagText}>Best value</Text>
        </View>
      ) : null}

      <View style={styles.rowHeader}>
        <Avatar name={worker?.full_name} uri={worker?.avatar_url} size={44} />
        <View style={styles.rowIdentity}>
          <Text style={styles.rowName} numberOfLines={1}>
            {worker?.full_name ?? 'Worker'}
          </Text>
          <View style={styles.rowProof}>
            <Ionicons name="star" size={13} color={colors.gold} />
            <Text style={styles.rowProofStrong}>
              {ratingCount > 0 ? (worker?.rating_avg ?? 0).toFixed(1) : 'New'}
            </Text>
            <Text style={styles.rowProofMuted}>
              {ratingCount > 0
                ? `(${ratingCount})`
                : 'no reviews yet'}
            </Text>
            {completion != null ? (
              <Text style={styles.rowProofMuted}>· {completion}% completed</Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.rowAmount}>{formatBudget(bid.amount_cents)}</Text>
      </View>

      {bid.message ? (
        <Text style={styles.rowPitch} numberOfLines={2}>
          “{bid.message}”
        </Text>
      ) : null}

      <View style={styles.rowFooter}>
        <Text style={styles.rowMeta}>
          Bid {formatTimeAgo(bid.created_at)} · full terms{' '}
          <Ionicons name="chevron-forward" size={11} color={colors.emerald} />
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sortWrap: {
    marginBottom: -spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mint2,
    backgroundColor: colors.surface,
  },
  rowBest: {
    borderColor: colors.emerald,
    borderWidth: 2,
  },
  rowPressed: {
    opacity: 0.8,
  },
  bestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  bestTagText: {
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
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  rowProof: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  rowProofStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  rowProofMuted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  rowAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
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
    // The badge that used to hold the left slot is gone; the meta line keeps
    // its right-aligned position.
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.emerald,
  },
});
