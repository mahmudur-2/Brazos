import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PressScale } from './PressScale';
import { RemoteImage } from './RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPressable } from './AvatarPressable';
import { Button } from './Button';
import { Card } from './Card';
import { OfferResponseActions } from './OfferResponseActions';
import { StatusBadge } from './StatusBadge';
import {
  radius,
  spacing,
  starColors,
  themedStyles,
  useThemeColors,
  wellStyle,
  type ColorPalette,
} from '../lib/theme';
import {
  acceptOfferActionLabel,
  acceptOfferConfirmText,
  COUNTER_OPENER_LABEL,
  DECLINE_OPENER_LABEL,
  firstNameOf,
  offerExpiryLabel,
  offerNoun,
  offerResponseNote,
} from '../lib/offerCopy';
import { formatBudget, JOB_CATEGORY_LABELS } from '../lib/jobs';
import { formatTimeAgo } from '../lib/time';
import { completionPercent } from '../lib/profiles';
import { onTimePercent, trustRowFor } from '../lib/compareBids';
import { DropdownBody, DropdownChevron } from './DropdownReveal';
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
import type { ProfileReviewSummaryRow } from '../lib/reviews';

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
  /** n7 — this worker's worker-role REVEALED summary, from the host's ONE
   *  profile_review_summaries() call over its offers' worker ids. Null or
   *  absent is UNKNOWN: the rating line renders nothing — never a zero, never
   *  a number from the profile's legacy mixed aggregate. */
  summary?: ProfileReviewSummaryRow | null;
  /** 2026-09-26 (the refresh, audit M-5): what the customer would pay all-in
   *  for this bid — quote_job_price()'s total, from the host. Null or absent
   *  while unanswered: the line is simply not drawn. */
  allInCents?: number | null;
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
  /** P3 (owner, 2026-11-16): the bid opens in place on the job page with its own Decline, Counter and Accept. */
  inPlace?: {
    open: boolean;
    onToggle: () => void;
    /** The bid is pending and it is the customer's turn (isOfferActionableBy). */
    canDecide: boolean;
    countersLeft: number;
    onDecline: () => void;
    onCounter: () => void;
    /** A2-M5 A9: the job's booked time has passed (jobWindowOver): nothing is accepted any more, so the
     *  card makes no "Open until …" promise. Absent is false. */
    windowOver?: boolean;
  };
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

/**
 * A2-M4 (P3, the owner's picture): how far the open bid's full-width Accept sits inside the
 * card's outer edge — the card's padding plus Surface's 1 pt rim. A full-width button placed
 * under the card at the same gutter (the job page's Cancel Job) takes it as its side margin, so
 * the two share one width; Button already gives them one height and one corner.
 */
export function offerActionInset(): number {
  return spacing.lg + 1;
}

/** F3: memoised — a card re-renders only when its own props change. */
export const OfferCard = memo(function OfferCard(props: OfferCardProps) {
  return props.variant === 'list' ? <OfferListCard {...props} /> : <OfferThreadCard {...props} />;
});

// ---------------------------------------------------------------------------
// List — the customer's compare-and-accept surface
// ---------------------------------------------------------------------------

function OfferListCard({
  offer,
  summary = null,
  allInCents = null,
  canAccept,
  accepting = false,
  disabled = false,
  onAccept,
  canRehire = false,
  onHireAgain,
  onViewProfile,
  onOpenDetail,
  onLongPressAvatar,
  palette: paletteProp,
  inPlace,
}: ListProps) {
  const { palette: colors, isDark } = useThemeColors();
  const palette = paletteProp ?? colors;
  const styles = stylesFor(colors);
  const worker = offer.worker;
  const name = worker?.full_name ?? 'Worker';
  // The rating line reads the summary and nothing else (R8b-c D1): the word
  // "New" while the reputation is under three revealed reviews, the shrunk
  // shown_average to one decimal once it is not, and nothing while the row is
  // unknown. The count beside it is REVEALED reviews only.
  const ratingCount = summary?.total ?? null;
  const ratingText =
    summary == null
      ? ''
      : summary.isNew
        ? 'New'
        : summary.shownAverage != null && summary.total > 0
          ? summary.shownAverage.toFixed(1)
          : '';
  const completion = completionPercent(worker?.completion_rate);
  const isAccepted = offer.status === 'accepted';
  // Who may accept is ownership, not mode: the screen resolves it and passes
  // it in. Gating this on the app's current mode instead is what hid the
  // button on the shared My Jobs stack — see the note at the top of the file.
  const canAcceptThisOffer = canAccept && offer.status === 'pending';

  // P3: closed = who and what price; open (in place, downward) = the whole bid and its three
  // actions. Accept is the host's onAccept: the same "Accept this bid?" pop-up, then Checkout.
  if (inPlace) {
    const pendingNow = effectiveOfferStatus(offer) === 'pending';
    // A2-M5 A9: no "Open until" once the booked time has passed (the job page's notice says why).
    const expiry = pendingNow && !inPlace.windowOver ? offerExpiryLabel(offer.expires_at) : null;
    // A2-M4b (the coordinator's rule on F11): the "New" tag only for a worker with no reviews and
    // no completed jobs; under the star threshold the review count stands alone; a star only beside
    // a rating.
    const jobs = summary?.completedJobs ?? null;
    const showNewTag = summary?.isNew === true && summary.total === 0 && jobs === 0;
    const rated = summary?.isNew === false && ratingText !== '';
    const reviewCount = `${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'}`;
    const reviewsText =
      ratingCount == null || showNewTag ? '' : ratingCount === 0 ? 'No reviews yet' : rated ? `(${reviewCount})` : reviewCount;
    // Compare Bids' trust line moves onto every card: the known facts; unknown stays blank.
    const trust = trustRowFor(onTimePercent(summary?.onTimePct), jobs);
    const trustLine =
      trust.kind === 'new'
        ? // A2-M4b: the jobs line, never "New worker" ("New" is the tag's, for no reviews and no jobs).
          jobs != null && jobs > 0
          ? `${jobs} completed ${jobs === 1 ? 'job' : 'jobs'}`
          : ''
        : [
            trust.onTimePct != null ? `${trust.onTimePct}% on time` : null,
            trust.completedJobs != null
              ? `${trust.completedJobs} completed ${trust.completedJobs === 1 ? 'job' : 'jobs'}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
    return (
      <Card palette={palette} style={styles.card}>
        <PressScale
          haptic={false}
          style={({ pressed }) => [styles.headerRow, pressed && styles.profilePressed]}
          onPress={inPlace.onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: inPlace.open }}
          accessibilityLabel={`${name}, ${formatBudget(offer.amount_cents)}`}
        >
          <AvatarPressable name={name} uri={worker?.avatar_url} size={52} onLongPress={onLongPressAvatar} />
          <View style={styles.headerText}>
            {/* A2-M4 (direction §7): the open bid's name is the way to the profile (no "View
                Profile" row); closed, the whole header opens the bid. */}
            {inPlace.open && onViewProfile ? (
              <PressScale
                haptic={false}
                onPress={onViewProfile}
                disabled={disabled}
                hitSlop={spacing.sm}
                style={({ pressed }) => [styles.nameLinkHit, pressed && styles.profilePressed]}
                accessibilityRole="button"
                accessibilityLabel={`View ${name}'s profile`}
              >
                <Text style={[styles.name, { color: colors.emerald }]} numberOfLines={2}>
                  {name}
                </Text>
              </PressScale>
            ) : (
              <Text style={styles.name} numberOfLines={2}>
                {name}
              </Text>
            )}
            <View style={styles.proofRow}>
              {/* A2-M4 (F11): "New" is a small tag, never big type, never beside a star. */}
              {showNewTag ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{ratingText}</Text>
                </View>
              ) : rated ? (
                <>
                  <Ionicons name="star" size={14} color={starColors(colors, isDark).filled} />
                  <Text style={styles.proofStrong}>{ratingText}</Text>
                </>
              ) : null}
              {reviewsText ? <Text style={styles.proofMuted}>{reviewsText}</Text> : null}
              {completion != null && (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.proofMuted}>{completion}% completed</Text>
                </>
              )}
            </View>
            {/* A2-M4: the facts wrap beside the price instead of ending in "14 co…". */}
            {trustLine ? <Text style={styles.proofMuted}>{trustLine}</Text> : null}
          </View>
          <View style={styles.priceBlock}>
            {/* A2-M4: the chevron takes the eyebrow's place, so the name keeps the row's width
                (the section above already says these are bids). */}
            <DropdownChevron open={inPlace.open}>
              <Ionicons name="chevron-down" size={15} color={colors.textSubtle} />
            </DropdownChevron>
            <Text style={styles.price}>{formatBudget(offer.amount_cents)}</Text>
            {allInCents != null ? (
              <Text style={styles.allIn}>You’d pay {formatBudget(allInCents)} all-in</Text>
            ) : null}
          </View>
        </PressScale>

        <DropdownBody open={inPlace.open}>
          {canRehire && (
            <View style={styles.trustRow}>
              <View style={styles.tag}>
                <Ionicons name="repeat" size={12} color={colors.emerald} />
                <Text style={styles.tagText}>Worked for You Before</Text>
              </View>
            </View>
          )}
          {offer.message ? (
            <Text style={[styles.pitch, wellStyle(palette, isDark)]} selectable>
              “{offer.message}”
            </Text>
          ) : null}
          {expiry ? <Text style={styles.inPlaceNote}>Open until {expiry} — then it expires on its own.</Text> : null}
          {/* A2-M4 (direction §7): no "Hire Again" on a live bid — "Worked for You Before" says
              it, and Accept is the hire. It stays on the profile and on a finished job. */}
          {isAccepted ? (
            <View style={styles.acceptedRow}>
              <StatusBadge status="accepted" />
            </View>
          ) : canAcceptThisOffer && inPlace.canDecide ? (
            <View style={styles.inPlaceActions}>
              {/* A2-M4 (P3, the owner's picture): two filled quiet buttons of one width and one
                  height, the glowing main Accept under them. */}
              <View style={styles.inPlaceActionRow}>
                <Button
                  title={DECLINE_OPENER_LABEL}
                  variant="quiet"
                  palette={palette}
                  onPress={inPlace.onDecline}
                  disabled={disabled || accepting}
                  style={styles.actionButton}
                />
                <Button
                  title={COUNTER_OPENER_LABEL}
                  variant="quiet"
                  palette={palette}
                  onPress={inPlace.onCounter}
                  disabled={disabled || accepting || inPlace.countersLeft === 0}
                  style={styles.actionButton}
                />
              </View>
              <Button
                title={acceptOfferActionLabel(formatBudget(offer.amount_cents), false)}
                onPress={onAccept}
                palette={palette}
                loading={accepting}
                disabled={disabled}
              />
            </View>
          ) : pendingNow && !inPlace.canDecide ? (
            // A2-M5 F2: only while the bid waits on the worker (the customer's own counter is the
            // newest offer). A bid that waits on the customer but cannot be decided here (the booked
            // time has passed) shows its facts and no waiting line; the job page's notice says why.
            <View style={styles.inPlaceWaiting}>
              <Ionicons name="hourglass-outline" size={18} color={colors.textMuted} />
              <Text style={styles.inPlaceWaitingText}>You countered — waiting for {name} to respond.</Text>
            </View>
          ) : null}
        </DropdownBody>
      </Card>
    );
  }

  return (
    <Card palette={palette} style={styles.card}>
      <View style={styles.headerRow}>
        <PressScale
          haptic={false}
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
              {/* 2026-09-29 (LUX-LIST-2 run): two lines, never "Priya Na…" — the name is who you'd hire. */}
              <Text style={styles.name} numberOfLines={2}>
                {name}
              </Text>
              {onViewProfile && (
                <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
              )}
            </View>
            <View style={styles.proofRow}>
              {/* F11 (owner, 2026-11-16): no star beside "New". */}
              {summary?.isNew ? null : <Ionicons name="star" size={14} color={starColors(colors, isDark).filled} />}
              <Text style={styles.proofStrong}>{ratingText}</Text>
              <Text style={styles.proofMuted}>
                {ratingCount == null
                  ? ''
                  : ratingCount > 0
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
        </PressScale>

        <View style={styles.priceBlock}>
          {/* This card only ever renders on the job owner's own screen, so the
              label is the price they would pay — never worker payout wording. */}
          <Text style={styles.priceLabel}>{offerNoun(false).toUpperCase()}</Text>
          <Text style={styles.price}>
            {formatBudget(offer.amount_cents)}
          </Text>
          {allInCents != null ? (
            <Text style={styles.allIn}>You’d pay {formatBudget(allInCents)} all-in</Text>
          ) : null}
        </View>
      </View>

      {canRehire && (
        <View style={styles.trustRow}>
          <View style={styles.tag}>
            <Ionicons name="repeat" size={12} color={colors.emerald} />
            <Text style={styles.tagText}>Worked for You Before</Text>
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
              title="View Profile"
              variant="secondary"
              palette={palette}
              onPress={onViewProfile}
              disabled={disabled}
              style={styles.actionButton}
            />
          ) : null}
          <Button
            title={acceptOfferConfirmText(false)}
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
        <PressScale
          haptic={false}
          onPress={onOpenDetail}
          disabled={disabled}
          style={({ pressed }) => [styles.detailLink, pressed && styles.profilePressed]}
          accessibilityRole="button"
          accessibilityLabel="Open full bid detail with counter and decline options"
        >
          <Text style={styles.detailLinkText}>Full Bid · Counter or Decline</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.emerald} />
        </PressScale>
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
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
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
      <PressScale
        haptic={false}
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
              <RemoteImage key={url} uri={url} style={styles.mediaThumb} />
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
      </PressScale>

      {canWithdraw && (
        <Button
          // F10: the worker's price is a bid, the customer's reply a counter-offer.
          title={currentUserId === offer.worker_id ? 'Withdraw Bid' : 'Withdraw Counter-Offer'}
          variant="destructive"
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
            viewerIsWorker={currentUserId === offer.worker_id}
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

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
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
  // A2-M4: the open bid's name as the profile link — the hit hugs the name.
  nameLinkHit: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    borderRadius: radius.sm,
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
    color: colors.eyebrow,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  price: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.money,
  },
  allIn: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
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
  // A2-M4: one small tag look — "Worked for You Before" and the new worker's "New".
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  tagText: {
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
    color: colors.eyebrow,
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
    color: colors.money,
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
  // P3: the open bid's own lines.
  inPlaceNote: {
    marginTop: spacing.md,
    fontSize: 13,
    color: colors.textMuted,
  },
  inPlaceActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  inPlaceActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inPlaceWaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  inPlaceWaitingText: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
  },
  }),
);
