import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { Button } from './Button';
import { Card } from './Card';
import { OfferResponseActions } from './OfferResponseActions';
import { StatusBadge } from './StatusBadge';
import { colors, radius, spacing, type ColorPalette } from '../lib/theme';
import {
  firstNameOf,
  offerExpiryLabel,
  offerResponseNote,
} from '../lib/offerCopy';
import { formatBudget, JOB_CATEGORY_LABELS } from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';
import { completionPercent } from '../lib/profiles';
import {
  countersRemaining,
  effectiveOfferStatus,
  isOfferActionableBy,
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
  canAccept: boolean;
  accepting?: boolean;
  disabled?: boolean;
  onAccept: () => void;
  /** True when this client has already had a job completed by this worker. */
  canRehire?: boolean;
  onHireAgain?: () => void;
  /** Opens the worker's public profile (rating, bio, Past Work gallery). */
  onViewProfile?: () => void;
  /** Phase 5: opens Bid Detail (29) — full terms plus counter/decline, which
   *  deliberately do not crowd this compare card. */
  onOpenDetail?: () => void;
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
  /** The other party's name, for the actionable card's heading. */
  counterpartyName?: string | null;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
  /** Phase 5: the AUTHOR retracting their own pending revision while the
   *  other side owes the reply — rendered only in exactly that state. */
  onWithdraw?: () => void;
  /**
   * Present whenever this card leads into the job it is about — which is
   * every LIVE offer and every accepted one, since job_offers.job_id is NOT
   * NULL and pinned constant down a chain. The caller decides with
   * offerJobTarget() (lib/offerNavigation.ts); this component only renders
   * the affordance. Rendered as a tappable card rather than a button so it
   * reads as "this points somewhere".
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
  canAccept,
  accepting = false,
  disabled = false,
  onAccept,
  canRehire = false,
  onHireAgain,
  onViewProfile,
  onOpenDetail,
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
    <Card palette={palette} style={styles.card}>
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

      {canRehire && (
        <View style={styles.trustRow}>
          <View style={styles.rehireTag}>
            <Ionicons name="repeat" size={12} color={colors.emerald} />
            <Text style={styles.rehireText}>Worked for you before</Text>
          </View>
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

      {onOpenDetail && !isAccepted ? (
        <Pressable
          onPress={onOpenDetail}
          disabled={disabled}
          style={({ pressed }) => [styles.detailLink, pressed && styles.profilePressed]}
          accessibilityRole="button"
          accessibilityLabel="Open full bid detail with counter and decline options"
        >
          <Text style={styles.detailLinkText}>Full bid · counter or decline</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.emerald} />
        </Pressable>
      ) : null}
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
  counterpartyName,
  busy = false,
  onAccept,
  onDecline,
  onCounter,
  onWithdraw,
  onOpenJob,
}: ThreadProps) {
  const event = message.request_event ?? 'created';
  const amount = message.request_amount_cents;
  // Any card the caller gave a destination is tappable — a live offer is not a
  // dead end just because nobody has accepted it yet (Fix A). The caller owns
  // the decision; offerJobTarget() is where it is made, once, for every
  // surface.
  const openable = !!onOpenJob;

  // Whose move it is comes from the ONE rule both actionable surfaces use, so
  // a superseded, declined, withdrawn, expired or already-answered revision
  // cannot render actions here that the job detail would refuse.
  const isMyTurn = isOfferActionableBy(offer, currentUserId);
  const showActions = isLatest && isMyTurn && !!offer;
  const canCounter = chain.length > 0 && countersRemaining(chain, currentUserId) > 0;
  // Lapsed-pending is expired everywhere on this card, so a deadline that has
  // passed reads as expired rather than as a live offer nobody answered — the
  // same reading the RPCs enforce and the job detail already rendered.
  const liveStatus = offer ? effectiveOfferStatus(offer) : null;
  const isStillOpen = !!liveStatus && isOpenOffer(liveStatus);

  // The sender's exit while the ball is in the other court (§H.2 withdrawn):
  // only the current revision, only its author, only while still pending.
  const canWithdraw =
    isLatest &&
    !!offer &&
    isStillOpen &&
    offer.author_id === currentUserId &&
    offer.awaiting_id !== currentUserId &&
    !!onWithdraw;

  // A settled offer explains itself on its newest card, so the thread never
  // ends on an offer that silently stopped mattering.
  const settledNote =
    isLatest && liveStatus && !isStillOpen ? SETTLED_NOTE[liveStatus] : null;

  const waitingNote =
    isLatest && offer && isStillOpen && !isMyTurn ? 'Waiting for their response…' : null;

  const photos = job?.photos ?? [];
  const videos = job?.videos ?? [];

  return (
    <View
      style={[
        styles.threadCard,
        // An actionable card carries three full-width controls, so it takes
        // the row's available width instead of the narrow event-card cap.
        showActions && styles.threadCardActionable,
        !isLatest && styles.threadCardHistoric,
      ]}
    >
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

        {/* The amount moves INTO the response block when this card is
            actionable — it is the headline there, beside "Your move", and
            printing it twice is what made the old card read as a bare
            "$X proposed" stub with the real decision hidden below. */}
        {amount != null && !showActions && (
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

      {canWithdraw && (
        <Button
          title="Withdraw offer"
          variant="secondary"
          onPress={onWithdraw}
          disabled={busy}
          style={styles.counterBtn}
        />
      )}

      {/* The one actionable presentation, shared with the job-detail respond
          card. Order, wording, icons and destructive treatment come from that
          component so Chat and Job Detail cannot drift apart again. */}
      {showActions && offer && (
        <View style={styles.threadActions}>
          <OfferResponseActions
            compact
            senderFirstName={firstNameOf(counterpartyName, 'They')}
            isCounter={offer.parent_offer_id !== null}
            amountLabel={formatBudget(offer.amount_cents)}
            note={offerResponseNote({
              viewerIsWorker: currentUserId === offer.worker_id,
              expiresLabel: offerExpiryLabel(offer.expires_at),
            })}
            canCounter={canCounter}
            busy={busy}
            onAccept={onAccept}
            onCounter={onCounter}
            onDecline={onDecline}
          />
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
  detailLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  detailLinkText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.emerald,
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
  threadCardActionable: {
    // Grows into the row's remaining width rather than staying at the narrow
    // event-card cap, so three stacked controls are comfortable and their
    // labels never truncate. Still bounded, so it cannot span a tablet.
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 380,
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
  },
  counterBtn: {
    width: '100%',
  },
});
