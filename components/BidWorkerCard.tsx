import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { Button } from './Button';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { VerificationBadge } from './VerificationBadge';
import { colors, radius, spacing, type ColorPalette } from '../lib/theme';
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
  palette?: ColorPalette;
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
  palette = colors,
}: BidWorkerCardProps) {
  const worker = bid.worker;
  const name = worker?.full_name ?? 'Worker';
  const ratingCount = worker?.rating_count ?? 0;
  const completion = completionPercent(worker?.completion_rate);
  const isAccepted = bid.status === 'accepted';
  const canAcceptThisBid = canAccept && bid.status === 'pending';

  return (
    <Card palette={palette} style={[styles.card, isBestValue && styles.bestValueCard]}>
      {isBestValue && (
        <View style={styles.bestValueTag}>
          <Ionicons name="sparkles" size={12} color={colors.emerald} />
          <Text style={styles.bestValueText}>Best value</Text>
        </View>
      )}

      <View style={styles.headerRow}>
        <Pressable
          style={({ pressed }) => [styles.profileHit, pressed && styles.profilePressed]}
          onPress={onViewProfile}
          disabled={!onViewProfile}
          accessibilityRole={onViewProfile ? 'button' : undefined}
          accessibilityLabel={onViewProfile ? `View ${name}'s profile` : undefined}
        >
          <AvatarPressable
            name={name}
            uri={worker?.avatar_url}
            size={52}
            onLongPress={onLongPressAvatar}
          />
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {onViewProfile && (
                <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
              )}
            </View>
            <View style={styles.proofRow}>
              <Ionicons name="star" size={14} color={colors.gold} />
              <Text style={styles.proofStrong}>
                {ratingCount > 0 ? (worker?.rating_avg ?? 0).toFixed(1) : 'New'}
              </Text>
              <Text style={styles.proofMuted}>
                {ratingCount > 0
                  ? `(${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'})`
                  : 'No reviews yet'}
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

        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>BID</Text>
          <Text style={styles.price}>{formatBudget(bid.amount_cents)}</Text>
        </View>
      </View>

      {(worker || canRehire) && (
        <View style={styles.trustRow}>
          {worker ? <VerificationBadge status={worker.verification_status} /> : null}
          {canRehire && (
            <View style={styles.rehireTag}>
              <Ionicons name="repeat" size={12} color={colors.emerald} />
              <Text style={styles.rehireText}>Worked for you before</Text>
            </View>
          )}
        </View>
      )}

      {bid.message ? (
        <Text style={styles.pitch} numberOfLines={3}>
          “{bid.message}”
        </Text>
      ) : null}

      {isAccepted ? (
        <View style={styles.acceptedRow}>
          <StatusBadge status="accepted" />
        </View>
      ) : canAcceptThisBid ? (
        <View style={styles.actionRow}>
          {onViewProfile ? (
            <Button
              title="View profile"
              variant="secondary"
              palette={palette}
              onPress={onViewProfile}
              disabled={disabled}
              style={styles.actionButton}
            />
          ) : null}
          <Button
            title="Accept bid"
            onPress={onAccept}
            palette={palette}
            loading={accepting}
            disabled={disabled}
            style={styles.actionButton}
          />
        </View>
      ) : null}

      {canRehire && onHireAgain && !isAccepted && (
        <Button
          title="Hire Again"
          variant="secondary"
          palette={palette}
          onPress={onHireAgain}
          disabled={disabled}
          style={styles.rehireBtn}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderColor: colors.mint2,
    padding: spacing.lg,
  },
  bestValueCard: {
    borderColor: colors.emerald,
    borderWidth: 2,
  },
  bestValueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  bestValueText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.emerald,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileHit: {
    minHeight: 52,
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
  },
  profilePressed: {
    opacity: 0.72,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
    marginHorizontal: 1,
  },
  priceBlock: {
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
    minWidth: 70,
  },
  pitch: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    fontStyle: 'italic',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  priceLabel: {
    fontSize: 10,
    color: colors.emerald,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  price: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
  },
  acceptedRow: {
    alignItems: 'flex-end',
    marginTop: spacing.lg,
  },
  rehireTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  rehireText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.emerald,
  },
  rehireBtn: {
    marginTop: spacing.md,
  },
});
