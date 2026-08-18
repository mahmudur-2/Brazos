import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { alertAsync } from '../lib/dialog';
import { userMessage } from '../lib/errorMessage';
import {
  availabilityLine,
  chipsAvailable,
  composeOfferMessage,
  DURATION_OPTIONS,
  longestAvailabilityLineLength,
  OFFER_MESSAGE_MAX,
  upcomingStartDays,
  type DurationChoice,
  type StartChoice,
} from '../lib/offerMessage';
import {
  budgetRangeLabel,
  dollarsToCents,
  formatBudget,
  hasBudget,
  JOB_CATEGORY_LABELS,
  type OpenJob,
} from '../lib/jobs';
import {
  COUNTER_LIMIT_MESSAGE,
  counterOffer,
  createMarketplaceOffer,
  isCounterLimitError,
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

  // §6.1 — the two optional availability chip groups, bid entry only (a
  // counter carries no message). Nothing is selected by default; zero
  // selections leave the sent message byte-identical to the plain pitch.
  const [startMode, setStartMode] = useState<'today' | 'tomorrow' | 'pick' | null>(null);
  const [pickedDay, setPickedDay] = useState<{ iso: string; label: string } | null>(null);
  const [duration, setDuration] = useState<DurationChoice | null>(null);

  const isBid = context.kind === 'bid';

  const dayChoices = useMemo(() => upcomingStartDays(12), []);
  const longestLine = useMemo(
    () => longestAvailabilityLineLength(dayChoices.map((d) => d.label)),
    [dayChoices]
  );
  // The server caps p_message at 500; the chips stand down — disabled, with
  // the written reason below — while even the worst-case line wouldn't fit.
  // Never a truncated send, never a raw database error.
  const chipsOk = chipsAvailable(message, longestLine);

  useEffect(() => {
    if (!chipsOk && (startMode !== null || pickedDay !== null || duration !== null)) {
      setStartMode(null);
      setPickedDay(null);
      setDuration(null);
    }
  }, [chipsOk, startMode, pickedDay, duration]);

  const startChoice: StartChoice | null =
    startMode === 'today'
      ? { kind: 'today' }
      : startMode === 'tomorrow'
        ? { kind: 'tomorrow' }
        : startMode === 'pick' && pickedDay
          ? { kind: 'day', label: pickedDay.label }
          : null;

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
          // The pitch plus at most ONE trailing availability line. With no
          // chips selected this is exactly message.trim(), as it always was.
          message: composeOfferMessage(message, availabilityLine(startChoice, duration)),
        });
        if (error || !offerId) {
          const msg =
            error?.code === '23505'
              ? 'You already have a live bid on this job.'
              : userMessage(
                  error,
                  'Your bid could not be sent. Check your connection and try again.'
                );
          // Entered terms stay in the fields — alert and return, never reset.
          await alertAsync('Could not send bid', msg);
          return;
        }
        onSubmitted(offerId, amountCents);
      } else {
        const { data: newOfferId, error } = await counterOffer(context.offer.id, amountCents);
        if (error || !newOfferId) {
          // The cap is enforced server-side, so a client whose count was stale
          // (a counter sent from another device, a chain loaded a revision ago)
          // can still get here with the Counter button enabled. Say what
          // happened and what they can do instead, not "try again".
          if (isCounterLimitError(error)) {
            await alertAsync('No counter-offers left', COUNTER_LIMIT_MESSAGE);
            return;
          }
          await alertAsync(
            'Could not send counter-offer',
            userMessage(
              error,
              'Your counter-offer could not be sent. Check your connection and try again.'
            )
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
          // Mirror of create_offer()'s own 500-character cap, so the limit
          // reads as a full field instead of a database error.
          maxLength={OFFER_MESSAGE_MAX}
        />
      ) : null}

      {isBid ? (
        <View style={styles.chipSection}>
          <View
            style={[styles.chipGroups, !chipsOk && styles.chipGroupsDisabled]}
            pointerEvents={chipsOk ? 'auto' : 'none'}
          >
            <View style={styles.chipGroup}>
              <Text style={styles.chipLabel}>When can you start</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="Today"
                  variant="filter"
                  selected={startMode === 'today'}
                  onPress={() => {
                    setPickedDay(null);
                    setStartMode((m) => (m === 'today' ? null : 'today'));
                  }}
                />
                <Chip
                  label="Tomorrow"
                  variant="filter"
                  selected={startMode === 'tomorrow'}
                  onPress={() => {
                    setPickedDay(null);
                    setStartMode((m) => (m === 'tomorrow' ? null : 'tomorrow'));
                  }}
                />
                <Chip
                  label="Pick a day"
                  variant="filter"
                  selected={startMode === 'pick'}
                  onPress={() => {
                    setPickedDay(null);
                    setStartMode((m) => (m === 'pick' ? null : 'pick'));
                  }}
                />
              </View>
              {startMode === 'pick' ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {dayChoices.map((d) => (
                    <Chip
                      key={d.iso}
                      label={d.label}
                      variant="filter"
                      selected={pickedDay?.iso === d.iso}
                      onPress={() =>
                        setPickedDay((prev) => (prev?.iso === d.iso ? null : d))
                      }
                    />
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <View style={styles.chipGroup}>
              <Text style={styles.chipLabel}>How long</Text>
              <View style={styles.chipRow}>
                {DURATION_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    variant="filter"
                    selected={duration === option.value}
                    onPress={() =>
                      setDuration((d) => (d === option.value ? null : option.value))
                    }
                  />
                ))}
              </View>
            </View>
          </View>
          {!chipsOk ? (
            <Text style={styles.chipReason}>
              Your pitch is close to the {OFFER_MESSAGE_MAX}-character limit, so
              there’s no room left for an availability line. Shorten the pitch to
              use these.
            </Text>
          ) : null}
        </View>
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
  chipSection: {
    gap: spacing.sm,
  },
  chipGroups: {
    gap: spacing.md,
  },
  chipGroupsDisabled: {
    opacity: 0.45,
  },
  chipGroup: {
    gap: spacing.sm,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipReason: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
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
