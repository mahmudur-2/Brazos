import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Card } from './Card';
import { TextField } from './TextField';
import { alertAsync } from '../lib/dialog';
import {
  budgetRangeLabel,
  dollarsToCents,
  formatBudget,
  hasBudget,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import {
  counterOffer,
  createMarketplaceOffer,
  type Offer,
} from '../lib/offers';
import { colors, radius, spacing, type ColorPalette } from '../lib/theme';

/**
 * The one offer-terms form (BRAZOS_MASTER_PLAN.md §E: "OfferComposer — one
 * component, three entry routes"). Screens 52 (Submit Bid) and 30
 * (Counteroffer) render it whole; the third context — 26, a customer's direct
 * offer — keeps its device-verified entry point, the PostJob hire wizard,
 * which composes the same OfferAmountField/validateOfferAmount exported here
 * so all three paths share one validation and one term presentation rather
 * than three hand-rolled forms.
 *
 * Terms are price + message. The canonical job_offers row carries exactly
 * those (schedule and scope live on the JOB — phase49's window/date fields —
 * not per-revision), so the form does not invent columns the model refused.
 *
 * Submission safety, enforced here rather than per screen:
 *   - a ref-guard plus disabled CTA while the RPC is in flight, so a double
 *     tap cannot stack a second create/counter behind the first;
 *   - recoverable failures alert and RETURN — entered terms are never
 *     cleared; the user edits and retries;
 *   - the consequence of submitting is stated on the form, above the CTA.
 */

export type OfferComposerContext =
  | { kind: 'bid'; job: OpenJob }
  | {
      kind: 'counter';
      /** The offer being answered — the composer supersedes it. */
      offer: Offer;
      /** Whose terms are being countered, for the context card. */
      counterpartyName: string;
      jobTitle: string;
      /** Counters left for the current user on this chain (server enforces). */
      countersRemaining: number;
    };

type OfferComposerProps = {
  context: OfferComposerContext;
  /** Called only after the RPC succeeded. Receives the new offer's id. */
  onSubmitted: (offerId: string, amountCents: number) => void;
  palette?: ColorPalette;
};

/**
 * Shared amount validation — the single answer to "what is a valid offer
 * amount" for bids, counters AND the wizard's direct-offer step.
 */
export function validateOfferAmount(amountText: string): {
  amountCents: number | null;
  problem: string | null;
} {
  const cents = dollarsToCents(amountText);
  if (cents == null) {
    return { amountCents: null, problem: 'Enter an amount.' };
  }
  if (Number.isNaN(cents) || cents <= 0) {
    return { amountCents: null, problem: 'The amount must be a positive dollar amount.' };
  }
  return { amountCents: cents, problem: null };
}

/** The shared amount field — one presentation for every offer form. */
export function OfferAmountField({
  value,
  onChangeText,
  label = 'Your offer (USD)',
  editable = true,
  hint,
  palette,
}: {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  editable?: boolean;
  hint?: string;
  palette?: ColorPalette;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder="e.g. 45"
      keyboardType="numeric"
      editable={editable}
      hint={hint}
      palette={palette}
    />
  );
}

export function OfferComposer({ context, onSubmitted, palette = colors }: OfferComposerProps) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const isBid = context.kind === 'bid';

  async function handleSubmit() {
    if (submittingRef.current) return;

    const { amountCents, problem } = validateOfferAmount(amount);
    if (problem || amountCents == null) {
      await alertAsync('Check the amount', problem ?? 'Enter an amount.');
      return;
    }
    if (isBid && !message.trim()) {
      await alertAsync(
        'Add a pitch',
        'Add a short message telling the customer why to pick you.'
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (context.kind === 'bid') {
        const { data: offerId, error } = await createMarketplaceOffer({
          jobId: context.job.id,
          amountCents,
          message: message.trim(),
        });
        if (error || !offerId) {
          const msg =
            error?.code === '23505'
              ? 'You already have a live bid on this job.'
              : error?.message ?? 'Your bid could not be sent. Check your connection and try again.';
          // Entered terms stay in the fields — alert and return, never reset.
          await alertAsync('Could not send bid', msg);
          return;
        }
        onSubmitted(offerId, amountCents);
      } else {
        const { data: newOfferId, error } = await counterOffer(context.offer.id, amountCents);
        if (error || !newOfferId) {
          await alertAsync(
            'Could not send counter-offer',
            error?.message ??
              'Your counter-offer could not be sent. Check your connection and try again.'
          );
          return;
        }
        onSubmitted(newOfferId, amountCents);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {/* Context: what these terms answer. Original terms stay visible while
          new ones are typed, so a counter is a visible before/after. */}
      {context.kind === 'bid' ? (
        <Card palette={palette} style={styles.contextCard}>
          <Text style={styles.contextEyebrow}>YOU’RE BIDDING ON</Text>
          <Text style={styles.contextTitle} numberOfLines={2}>
            {context.job.title}
          </Text>
          <Text style={styles.contextMeta} numberOfLines={2}>
            {JOB_CATEGORY_LABELS[context.job.category] ?? context.job.category}
            {context.job.location ? ` · ${context.job.location}` : ''}
          </Text>
          <Text style={styles.contextBudget}>
            {hasBudget(context.job)
              ? `Customer’s budget: ${budgetRangeLabel(context.job)}`
              : 'Open budget — the customer wants your price'}
          </Text>
        </Card>
      ) : (
        <Card palette={palette} style={styles.contextCard}>
          <Text style={styles.contextEyebrow}>COUNTERING</Text>
          <Text style={styles.contextTitle} numberOfLines={2}>
            {context.jobTitle}
          </Text>
          <View style={styles.originalRow}>
            <Text style={styles.originalLabel}>
              {context.counterpartyName}’s current terms
            </Text>
            <Text style={styles.originalAmount}>
              {formatBudget(context.offer.amount_cents)}
            </Text>
          </View>
          <Text style={styles.contextMeta}>
            Your counter replaces those terms with your price below. Nothing is
            agreed until one side accepts.
          </Text>
        </Card>
      )}

      <OfferAmountField
        value={amount}
        onChangeText={setAmount}
        label={isBid ? 'Your bid (USD)' : 'Your counter-offer (USD)'}
        editable={!submitting}
      />

      {isBid ? (
        <TextField
          label="Pitch"
          value={message}
          onChangeText={setMessage}
          placeholder="Why should the customer pick you?"
          autoCapitalize="sentences"
          multiline
          numberOfLines={3}
          style={styles.multiline}
          editable={!submitting}
        />
      ) : null}

      {/* The exact consequence, stated before the tap. */}
      <View style={styles.consequenceRow}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        <Text style={styles.consequenceText}>
          {isBid
            ? 'Sends your bid to the customer. You can withdraw it any time before it’s accepted, and it expires on its own after 7 days.'
            : context.countersRemaining > 1
              ? `Replaces their offer with yours — it’s then their turn. You have ${context.countersRemaining} counter-offers left; each expires after 7 days.`
              : 'Replaces their offer with yours — it’s then their turn. This is your last counter-offer; after this you can only accept or decline.'}
        </Text>
      </View>

      <Button
        title={isBid ? 'Send bid' : 'Send counter-offer'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        palette={palette}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  contextCard: {
    gap: spacing.sm,
    borderRadius: radius.xl,
  },
  contextEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.emerald,
    letterSpacing: 0.9,
  },
  contextTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
  },
  contextMeta: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  contextBudget: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  originalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  originalLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  originalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  multiline: {
    height: 90,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  consequenceText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
});
