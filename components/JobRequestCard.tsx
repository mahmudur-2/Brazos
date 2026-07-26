import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { formatBudget, JOB_CATEGORY_LABELS } from '../lib/jobs';
import {
  countersRemaining,
  isOpenRequest,
  type JobRequest,
} from '../lib/jobRequests';
import { colors, radius, spacing } from '../lib/theme';
import type { Message } from '../lib/messages';

type JobRequestCardProps = {
  /** The message carrying this event — its snapshot is what gets rendered. */
  message: Message;
  /** Live request state. Undefined while still loading. */
  request?: JobRequest;
  /** True only for the most recent event of this request in the thread; only
   *  that card is interactive. */
  isLatest: boolean;
  currentUserId: string;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCounter: () => void;
};

const EVENT_LABEL: Record<string, string> = {
  created: 'Job request',
  countered: 'Counter-offer',
  accepted: 'Request accepted',
  declined: 'Request declined',
  closed: 'Request closed',
};

const SETTLED_NOTE: Record<string, string> = {
  accepted: 'This job is now assigned and has moved into your job timeline.',
  declined: 'No job was created.',
  closed: 'This request was closed because someone was blocked.',
};

/**
 * A hire request rendered inside the existing conversation — the whole
 * negotiation happens here rather than on a separate screen.
 *
 * Each message is a snapshot of one event, so scrolling back shows the real
 * history of offers. Only the newest event for a request carries the live
 * status and the action buttons, and those appear solely when it's this
 * user's turn (`awaiting_id`), which the RPC re-checks server-side anyway.
 */
export function JobRequestCard({
  message,
  request,
  isLatest,
  currentUserId,
  busy = false,
  onAccept,
  onDecline,
  onCounter,
}: JobRequestCardProps) {
  const event = message.request_event ?? 'created';
  const amount = message.request_amount_cents;

  const isMyTurn =
    !!request && isOpenRequest(request.status) && request.awaiting_id === currentUserId;
  const showActions = isLatest && isMyTurn && !!request;
  const canCounter = !!request && countersRemaining(request, currentUserId) > 0;

  // A settled request explains itself on its newest card, so the thread never
  // ends on an offer that silently stopped mattering.
  const settledNote =
    isLatest && request && !isOpenRequest(request.status)
      ? SETTLED_NOTE[request.status]
      : null;

  const waitingNote =
    isLatest && request && isOpenRequest(request.status) && !isMyTurn
      ? 'Waiting for their response…'
      : null;

  return (
    <View style={[styles.card, !isLatest && styles.cardHistoric]}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={
              event === 'accepted'
                ? 'checkmark-circle'
                : event === 'declined' || event === 'closed'
                ? 'close-circle'
                : 'briefcase'
            }
            size={16}
            color={colors.primary}
          />
        </View>
        <Text style={styles.eventLabel}>{EVENT_LABEL[event] ?? 'Job request'}</Text>
      </View>

      {/* Terms come from the live request: they don't change during a
          negotiation — only the price does, and that's snapshotted below. */}
      {request && (
        <>
          <Text style={styles.title}>{request.title}</Text>
          <Text style={styles.meta}>
            {JOB_CATEGORY_LABELS[request.category] ?? request.category}
            {request.location ? ` · ${request.location}` : ''}
          </Text>
        </>
      )}

      {amount != null && (
        <Text style={styles.amount}>
          {formatBudget(amount)}
          {event === 'countered' && <Text style={styles.amountNote}> proposed</Text>}
        </Text>
      )}

      {request?.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {request.description}
        </Text>
      ) : null}

      {settledNote && <Text style={styles.settledNote}>{settledNote}</Text>}
      {waitingNote && <Text style={styles.waitingNote}>{waitingNote}</Text>}

      {showActions && (
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <Button
              title="Accept"
              onPress={onAccept}
              disabled={busy}
              style={styles.actionBtn}
            />
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
    minWidth: 240,
    maxWidth: 300,
  },
  cardHistoric: {
    borderColor: colors.border,
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  amount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.xs,
  },
  amountNote: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  description: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  settledNote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  waitingNote: {
    fontSize: 12,
    color: colors.textSubtle,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    height: 42,
  },
  counterBtn: {
    height: 42,
  },
  capNote: {
    fontSize: 11,
    color: colors.textSubtle,
    textAlign: 'center',
    lineHeight: 15,
  },
});
