import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import {
  COUNTER_OFFER_ACTION_LABEL,
  COUNTERS_SPENT_NOTE,
  DECLINE_OFFER_ACTION_LABEL,
  YOUR_MOVE_BADGE_LABEL,
  acceptOfferActionLabel,
  offerResponseHeading,
} from '../lib/offerCopy';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * THE actionable offer/counteroffer block — one component, both surfaces.
 *
 * Chat and Job Detail were rendering the same negotiation moment from two
 * hand-written copies: Job Detail said "Accept for $110 / Counter / Decline
 * counter-offer / Message <name>" in a column, Chat said "Accept / Decline"
 * side by side with "Counter offer" underneath. Same offer, same RPCs, two
 * layouts and two vocabularies. This is the single presentation; the wording
 * lives in lib/offerCopy.ts so neither surface can drift from it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * — no business logic. Whose turn it is, how many counters are left and
 *   whether the offer is still open are decided by the caller from the offer
 *   row (`awaiting_id`, `status`, the chain), exactly as before, and the RPCs
 *   re-check every one of them server-side.
 * — no Message control. Free-form messaging is not available before the job
 *   is confirmed, so an actionable card is by definition a place where that
 *   button must not exist.
 *
 * LAYOUT (Fix E) — the explanatory paragraph used to sit flush against the
 * Accept button, which has a fixed 52pt height, so its last line's descenders
 * collided with the button's top edge on a real device. Spacing here is a
 * `gap` on the flex column plus an explicit `lineHeight` on the note, so the
 * paragraph always reserves its true height and the separation holds at any
 * text size, on any screen width, on phone and web alike. Nothing is
 * absolutely positioned and no screen dimension is referenced.
 */

type OfferResponseActionsProps = {
  /** Counterparty's first name — lib/offerCopy.ts firstNameOf(). */
  senderFirstName: string;
  /** A counter is identified by HAVING a parent offer, never by a type. */
  isCounter: boolean;
  /** Already formatted by formatBudget() — money formatting has one rule. */
  amountLabel: string;
  /** The explanatory sentence — lib/offerCopy.ts offerResponseNote(). */
  note: string;
  /** False once this side's counter allowance is spent (phase63 cap). */
  canCounter: boolean;
  /** An RPC is in flight; every control locks rather than double-firing. */
  busy?: boolean;
  onAccept: () => void;
  onCounter: () => void;
  onDecline: () => void;
  /**
   * The narrow placement — an inline card inside a chat thread, which is
   * bounded well under a screen width. Only sizes change; structure, order
   * and wording are identical, which is the point of the component.
   */
  compact?: boolean;
};

export function OfferResponseActions({
  senderFirstName,
  isCounter,
  amountLabel,
  note,
  canCounter,
  busy = false,
  onAccept,
  onCounter,
  onDecline,
  compact = false,
}: OfferResponseActionsProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const buttonSize = compact ? 'sm' : 'md';

  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <Text style={[styles.heading, compact && styles.headingCompact]}>
          {offerResponseHeading(senderFirstName, isCounter)}
        </Text>
        <StatusBadge status="pending" label={YOUR_MOVE_BADGE_LABEL} />
      </View>

      <Text style={[styles.amount, compact && styles.amountCompact]}>
        {amountLabel}
      </Text>

      <Text style={[styles.note, compact && styles.noteCompact]}>{note}</Text>

      <View style={styles.actions}>
        <Button
          title={acceptOfferActionLabel(amountLabel)}
          icon="checkmark"
          iconPosition="leading"
          size={buttonSize}
          onPress={onAccept}
          disabled={busy}
        />
        {canCounter ? (
          <Button
            title={COUNTER_OFFER_ACTION_LABEL}
            icon="swap-horizontal"
            iconPosition="leading"
            variant="secondary"
            size={buttonSize}
            onPress={onCounter}
            disabled={busy}
          />
        ) : (
          <Text style={styles.capNote}>{COUNTERS_SPENT_NOTE}</Text>
        )}
        <Button
          title={DECLINE_OFFER_ACTION_LABEL}
          icon="close"
          iconPosition="leading"
          variant="destructive"
          size={buttonSize}
          onPress={onDecline}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  root: {
    // The gap IS the fix: every child keeps its measured height and the
    // separation cannot be swallowed by a sibling's fixed height.
    gap: spacing.sm,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heading: {
    // flexShrink so a long name wraps inside the row instead of pushing the
    // badge off the card.
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  headingCompact: {
    fontSize: 14,
    lineHeight: 19,
  },
  amount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 34,
  },
  amountCompact: {
    fontSize: 22,
    lineHeight: 27,
  },
  note: {
    fontSize: 13,
    color: colors.textSubtle,
    // Explicit, so the paragraph's layout height matches what it draws.
    lineHeight: 19,
  },
  noteCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  capNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  }),
);
