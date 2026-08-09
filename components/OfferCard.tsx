import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { Button } from './Button';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { VerificationBadge } from './VerificationBadge';
import { colors, radius, spacing, type ColorPalette } from '../lib/theme';
import { formatBudget, JOB_CATEGORY_LABELS } from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';
import { completionPercent } from '../lib/profiles';
import {
  countersRemaining,
  isOpenOffer,
  type Offer,
  type OfferWithJob,
  type OfferWithWorker,
} from '../lib/offers';
import type { Message } from '../lib/messages';

/**
 * The one offer card. Replaces BidWorkerCard (a bid in the customer's compare
 * list) and JobRequestCard (a negotiation event inside a conversation), which
 * were two components for one concept because bids and hire requests used to
 * be two tables.
 *
 * `variant` is placement: `list` is the stacked card the customer compares
 * offers in, `thread` is the inline card a conversation renders per event.
 * Both read the same Offer.
 *
 * THIS COMPONENT IS DELIBERATELY PERSPECTIVE-FREE, and that is a correction.
 * An earlier version read useModePerspective() and hid the accept affordance
 * whenever the app was in worker mode. That was wrong, and it broke a real
 * flow: `ClientJobDetail` lives in navigation/sharedStacks.tsx and is mounted
 * in BOTH trees, so an account looking at a job THEY posted from the shared My
 * Jobs tab while in worker mode lost the Accept button entirely.
 *
 * The rule CLAUDE.md states is that when a component varies by perspective it
 * must read ModeContext rather than take a prop — not that every component has
 * to vary. Nothing here does. Who may accept is ownership, which the screen
 * already resolves and passes as `canAccept`; whose turn it is is `awaiting_id`
 * on the offer. Mode is a third, unrelated axis, and conflating it with the
 * first two is what caused the bug.
 */

type ListProps = {
  variant: 'list';
  offer: OfferWithWorker;
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

type ThreadProps = {
  variant: 'thread';
  /** The message carrying this event — its snapshot is what gets rendered. */
  message: Message;
  /** Live offer state. Undefined while still loading. */
  offer?: Offer;
  /** Every offer sharing this one's root, for the counter cap. */
  chain?: Offer[];
  /** The job the offer is about. Its title/category/media used to live on
   *  job_requests; under the unified model they live on the job row. */
  job?: OfferWithJob['job'];
  /** True only for the most recent event of this chain in the thread; only
   *  that card is interactive. */
  isLatest: boolean;
  currentUserId: string;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
  /**
   * Present only when this card can lead into the job it created — i.e. its
   * own event is 'accepted' and a job actually exists. Rendered as a tappable
   * card rather than a button so it reads as "this now points somewhere".
   */
  onOpenJob?: () => void;
};

export type OfferCardProps = ListProps | ThreadProps;

export function OfferCard(props: OfferCardProps) {
  return props.variant === 'list' ? <OfferListCard {...props} /> : <OfferThreadCard {...props} />;
}

// ---------------------------------------------------------------------------
// List — the customer's compare-and-accept surface
// ---------------------------------------------------------------------------

function OfferListCard({
  offer,
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
}: ListProps) {
  const worker = offer.worker;
  const name = worker?.full_name ?? 'Worker';
  const ratingCount = worker?.rating_count ?? 0;
  const completion = completionPercent(worker?.completion_rate);
  const isAccepted = offer.status === 'accepted';
  // Who may accept is ownership, not mode: the screen resolves it and passes
  // it in. Gating this on the app's current mode instead is what hid the
  // button on the shared My Jobs stack — see the note at the top of the file.
  const canAcceptThisOffer = canAccept && offer.status === 'pending';

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
          {/* This card only ever renders on the job owner's own screen, so the
              label is the price they would pay — never worker payout wording. */}
          <Text style={styles.priceLabel}>OFFER</Text>
          <Text style={styles.price}>{formatBudget(offer.amount_cents)}</Text>
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

      {offer.message ? (
        <Text style={styles.pitch} numberOfLines={3}>
          “{offer.message}”
        </Text>
      ) : null}

      {isAccepted ? (
        <View style={styles.acceptedRow}>
          <StatusBadge status="accepted" />
        </View>
      ) : canAcceptThisOffer ? (
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
            title="Accept offer"
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

// ---------------------------------------------------------------------------
// Thread — one negotiation event inside a conversation
// ---------------------------------------------------------------------------

const EVENT_LABEL: Record<string, string> = {
  created: 'Job offer',
  countered: 'Counter-offer',
  accepted: 'Offer accepted',
  declined: 'Offer declined',
  closed: 'Offer closed',
  withdrawn: 'Offer withdrawn',
  expired: 'Offer expired',
  superseded: 'Offer replaced',
};

const SETTLED_NOTE: Record<string, string> = {
  accepted: 'This job is now assigned and has moved into your job timeline.',
  declined: 'No job was created.',
  withdrawn: 'This offer was withdrawn.',
  expired: 'This offer expired before anyone responded.',
  superseded: 'This offer was replaced by a newer one.',
};

function OfferThreadCard({
  message,
  offer,
  chain = [],
  job,
  isLatest,
  currentUserId,
  busy = false,
  onAccept,
  onDecline,
  onCounter,
  onOpenJob,
}: ThreadProps) {
  const event = message.request_event ?? 'created';
  const amount = message.request_amount_cents;
  const openable = event === 'accepted' && !!onOpenJob;

  const isMyTurn = !!offer && isOpenOffer(offer.status) && offer.awaiting_id === currentUserId;
  const showActions = isLatest && isMyTurn && !!offer;
  const canCounter = chain.length > 0 && countersRemaining(chain, currentUserId) > 0;

  // A settled offer explains itself on its newest card, so the thread never
  // ends on an offer that silently stopped mattering.
  const settledNote =
    isLatest && offer && !isOpenOffer(offer.status) ? SETTLED_NOTE[offer.status] : null;

  const waitingNote =
    isLatest && offer && isOpenOffer(offer.status) && !isMyTurn
      ? 'Waiting for their response…'
      : null;

  const photos = job?.photos ?? [];
  const videos = job?.videos ?? [];

  return (
    <View style={[styles.threadCard, !isLatest && styles.threadCardHistoric]}>
      <Pressable
        onPress={openable ? onOpenJob : undefined}
        disabled={!openable}
        accessibilityRole={openable ? 'button' : undefined}
      >
        <View style={styles.threadHeader}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={
                event === 'accepted'
                  ? 'checkmark-circle'
                  : event === 'declined' || event === 'closed' || event === 'withdrawn'
                  ? 'close-circle'
                  : 'briefcase'
              }
              size={16}
              color={colors.primary}
            />
          </View>
          <Text style={styles.eventLabel}>{EVENT_LABEL[event] ?? 'Job offer'}</Text>
          {openable && (
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textSubtle}
              style={styles.openChevron}
            />
          )}
        </View>

        {/* Terms come from the JOB the offer is about — under the unified model
            the offer carries only the price, so the work's description lives
            in exactly one place instead of being copied per negotiation. */}
        {job && (
          <>
            <Text style={styles.title}>{job.title}</Text>
            <Text style={styles.meta}>
              {JOB_CATEGORY_LABELS[job.category] ?? job.category}
              {job.location ? ` · ${job.location}` : ''}
            </Text>
          </>
        )}

        {amount != null && (
          <Text style={styles.amount}>
            {formatBudget(amount)}
            {event === 'countered' && <Text style={styles.amountNote}> proposed</Text>}
          </Text>
        )}

        {job?.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {job.description}
          </Text>
        ) : null}

        {/* What the work actually is, when the sender attached anything. Kept
            to thumbnails: this is a card in a chat, not a gallery. A video
            shows its count rather than a frame, since nothing here mounts a
            player. */}
        {photos.length > 0 || videos.length > 0 ? (
          <View style={styles.mediaRow}>
            {photos.slice(0, 3).map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.mediaThumb} />
            ))}
            {videos.length > 0 && (
              <View style={[styles.mediaThumb, styles.videoThumb]}>
                <Ionicons name="videocam" size={16} color={colors.primary} />
                {videos.length > 1 && <Text style={styles.videoCount}>{videos.length}</Text>}
              </View>
            )}
            {photos.length > 3 && (
              <Text style={styles.mediaMore}>+{photos.length - 3}</Text>
            )}
          </View>
        ) : null}

        <Text style={styles.sentAt}>{formatTimeAgo(message.created_at)}</Text>

        {settledNote && <Text style={styles.settledNote}>{settledNote}</Text>}
        {waitingNote && <Text style={styles.waitingNote}>{waitingNote}</Text>}
        {openable && <Text style={styles.openHint}>Tap to view the job</Text>}
      </Pressable>

      {showActions && (
        <View style={styles.threadActions}>
          <View style={styles.threadActionRow}>
            <Button title="Accept" onPress={onAccept} disabled={busy} style={styles.actionBtn} />
            <Button
              title="Decline"
              variant="secondary"
              onPress={onDecline}
              disabled={busy}
              palette={{ ...colors, primary: colors.danger, border: colors.danger }}
              style={styles.actionBtn}
            />
          </View>

          {canCounter ? (
            <Button
              title="Counter offer"
              variant="secondary"
              onPress={onCounter}
              disabled={busy}
              style={styles.counterBtn}
            />
          ) : (
            <Text style={styles.capNote}>
              No counter-offers left — accept or decline to continue.
            </Text>
          )}
        </View>
      )}
    </View>
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

  // Thread variant
  threadCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
    minWidth: 240,
    maxWidth: 300,
  },
  threadCardHistoric: {
    borderColor: colors.border,
    opacity: 0.85,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  eventLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  openChevron: {
    marginLeft: 'auto',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  amount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.xs,
  },
  amountNote: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  description: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  mediaThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  videoThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  videoCount: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  mediaMore: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  sentAt: {
    fontSize: 11,
    color: colors.textSubtle,
    marginTop: spacing.xs,
  },
  settledNote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  waitingNote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  openHint: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  threadActions: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  threadActionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
  },
  counterBtn: {
    width: '100%',
  },
  capNote: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
