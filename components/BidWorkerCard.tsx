import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { Button } from './Button';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { VerificationBadge } from './VerificationBadge';
import { colors, radius, spacing } from '../lib/theme';
import { formatBudget } from '../lib/jobs';
import { completionPercent } from '../lib/profiles';
import type { BidWithWorker } from '../lib/bids';

type BidWorkerCardProps = {
  bid: BidWithWorker;
  isBestValue?: boolean;
  canAccept: boolean;
  accepting?: boolean;
  disabled?: boolean;
  onAccept: () => void;
  /** True when this client has already had a job completed by this worker. */
  canRehire?: boolean;
  onHireAgain?: () => void;
  /** Opens the worker's public profile (rating, bio, Past Work gallery). */
  onViewProfile?: () => void;
  /** Long-press on the avatar specifically — opens it full-screen, a faster
   *  look than navigating to the full profile. */
  onLongPressAvatar?: () => void;
};

export function BidWorkerCard({
  bid,
  isBestValue = false,
  canAccept,
  accepting = false,
  disabled = false,
  onAccept,
  canRehire = false,
  onHireAgain,
  onViewProfile,
  onLongPressAvatar,
}: BidWorkerCardProps) {
  const worker = bid.worker;
  const name = worker?.full_name ?? 'Worker';
  const ratingCount = worker?.rating_count ?? 0;
  const completion = completionPercent(worker?.completion_rate);
  const isAccepted = bid.status === 'accepted';

  return (
    <Card style={isBestValue ? styles.bestValueCard : undefined}>
      {isBestValue && (
        <View style={styles.bestValueTag}>
          <Ionicons name="sparkles" size={12} color={colors.primary} />
          <Text style={styles.bestValueText}>Best value</Text>
        </View>
      )}

      <Pressable
        style={styles.headerRow}
        onPress={onViewProfile}
        disabled={!onViewProfile}
      >
        <AvatarPressable
          name={name}
          uri={worker?.avatar_url}
          size={48}
          onLongPress={onLongPressAvatar}
        />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <VerificationBadge status={worker?.verification_status} />
            {onViewProfile && (
              <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
            )}
          </View>
          <View style={styles.proofRow}>
            <Ionicons name="star" size={14} color={colors.star} />
            <Text style={styles.proofStrong}>
              {ratingCount > 0 ? (worker?.rating_avg ?? 0).toFixed(1) : 'New'}
            </Text>
            <Text style={styles.proofMuted}>
              {ratingCount > 0
                ? `(${ratingCount} ${ratingCount === 1 ? 'job' : 'jobs'})`
                : 'no ratings yet'}
            </Text>
            {completion != null && (
              <>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.proofMuted}>{completion}% completed</Text>
              </>
            )}
          </View>
        </View>
      </Pressable>

      {canRehire && (
        <View style={styles.rehireTag}>
          <Ionicons name="repeat" size={12} color={colors.success} />
          <Text style={styles.rehireText}>Worked for you before</Text>
        </View>
      )}

      {bid.message ? (
        <Text style={styles.pitch} numberOfLines={3}>
          “{bid.message}”
        </Text>
      ) : null}

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.priceLabel}>Bid</Text>
          <Text style={styles.price}>{formatBudget(bid.amount_cents)}</Text>
        </View>

        {isAccepted ? (
          <StatusBadge status="accepted" />
        ) : canAccept ? (
          <Button
            title="Accept"
            onPress={onAccept}
            loading={accepting}
            disabled={disabled}
            style={styles.acceptBtn}
          />
        ) : null}
      </View>

      {canRehire && onHireAgain && !isAccepted && (
        <Button
          title="Hire Again"
          variant="secondary"
          onPress={onHireAgain}
          disabled={disabled}
          style={styles.rehireBtn}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bestValueCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  bestValueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  bestValueText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proofStrong: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  proofMuted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  dot: {
    fontSize: 13,
    color: colors.textSubtle,
    marginHorizontal: 2,
  },
  pitch: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    fontStyle: 'italic',
    marginTop: spacing.md,
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
  priceLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  price: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  acceptBtn: {
    paddingHorizontal: spacing.xl,
    minWidth: 120,
  },
  rehireTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.successBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  rehireText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  rehireBtn: {
    marginTop: spacing.md,
  },
});
