import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type EmeraldPalette, type as typeScale } from '../tokens';
import { metricStyles, useThemeColors, withAlpha } from '../../lib/theme';
import { useOverrideNumber } from '../../lib/designOverrides';
import { JOB_LIFECYCLE_LABELS } from '../../lib/jobLifecycle';
import { PAYMENT_STATE_WORDS } from '../../lib/moneyCopy';

/**
 * The enum-driven status pill (§I).
 *
 * WHY THE UNIONS ARE LOCAL TYPES RIGHT NOW
 * §I specifies this as "job/offer/payment enum-driven", and §L forbids status
 * string literals in favour of generated database enums. Those generated
 * types do not exist — no database.types.ts anywhere in the repo, which
 * CLAUDE.md records as the standing state. The unions below are
 * transcribed from BRAZOS_MASTER_PLAN.md §H's canonical state machines, so
 * they are the plan's values rather than invented ones, and a caller passing
 * anything outside them is already a compile error today.
 *
 * The app's LIVE job lifecycle renders through lib/jobLifecycle.ts and its
 * JOB_LIFECYCLE_LABELS; this pill's job arm speaks §H's plan vocabulary and
 * currently has no kind="job" caller. Every label here is frozen by
 * tests/statusVocabulary.test.mjs — changing one is an operator decision.
 * C1 (2026-10-03, pick C1b): the states both vocabularies share read THE
 * lifecycle labels, so a job's stage has one set of words wherever it shows.
 */

/** §H.1 job lifecycle, including its branches. */
export type JobStatus =
  | 'draft'
  | 'published'
  | 'pending_payment'
  | 'confirmed'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completion_submitted'
  | 'approved'
  | 'completed'
  | 'expired'
  | 'cancelled_by_customer'
  | 'cancelled_by_worker'
  | 'disputed';

/** §H.2 offer/bid lifecycle. */
export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'superseded';

/**
 * §H.3 payment lifecycle. Phase 5 made this real: the union now lives in
 * lib/payments.ts, the module that mirrors the database enum, and is
 * re-exported here so MoneyText and existing callers keep their import path.
 * (Job/offer unions above stay local until generated DB types exist.)
 */
export type { PaymentStatus } from '../../lib/payments';
import type { PaymentStatus } from '../../lib/payments';

type Tone = 'neutral' | 'progress' | 'positive' | 'attention';

const tonesFor = (colors: EmeraldPalette): Record<Tone, { bg: string; border: string; fg: string }> => ({
  neutral: { bg: colors.bg, border: colors.line, fg: colors.muted },
  progress: { bg: colors.mint, border: colors.secondaryBorder, fg: colors.emerald },
  positive: { bg: colors.mint, border: colors.secondaryBorder, fg: colors.forest },
  attention: { bg: colors.dangerSurface, border: colors.dangerBorder, fg: colors.danger },
});

const JOB_TONES: Record<JobStatus, Tone> = {
  draft: 'neutral',
  published: 'progress',
  pending_payment: 'progress',
  confirmed: 'progress',
  en_route: 'progress',
  arrived: 'progress',
  in_progress: 'progress',
  completion_submitted: 'progress',
  approved: 'positive',
  completed: 'positive',
  expired: 'neutral',
  cancelled_by_customer: 'attention',
  cancelled_by_worker: 'attention',
  disputed: 'attention',
};

const JOB_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  pending_payment: 'Awaiting payment',
  confirmed: JOB_LIFECYCLE_LABELS.confirmed,
  en_route: JOB_LIFECYCLE_LABELS.en_route,
  arrived: JOB_LIFECYCLE_LABELS.arrived,
  in_progress: JOB_LIFECYCLE_LABELS.in_progress,
  completion_submitted: 'Completion submitted',
  approved: 'Approved',
  completed: JOB_LIFECYCLE_LABELS.completed,
  expired: 'Expired',
  cancelled_by_customer: 'Cancelled by customer',
  cancelled_by_worker: 'Cancelled by worker',
  disputed: 'Issue reported',
};

const OFFER_TONES: Record<OfferStatus, Tone> = {
  pending: 'progress',
  accepted: 'positive',
  declined: 'attention',
  withdrawn: 'neutral',
  expired: 'neutral',
  superseded: 'neutral',
};

const OFFER_LABELS: Record<OfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  superseded: 'Superseded',
};

const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  unfunded: 'neutral',
  authorized: 'progress',
  held: 'progress',
  released: 'positive',
  paid_out: 'positive',
  failed: 'attention',
  voided: 'neutral',
  refunded: 'neutral',
  partially_refunded: 'attention',
};

/**
 * §H.3's mandatory wording. "Paid" must never appear before `released` — that
 * is a hard product rule, not a copy preference, so these strings are a fixed
 * map rather than being passed in by each caller. C4 (2026-10-03): the map is
 * the money glossary's viewer-neutral state words (lib/moneyCopy.ts), so the
 * pill and every caption speak one vocabulary.
 */
export const PAYMENT_LABELS: Record<PaymentStatus, string> = PAYMENT_STATE_WORDS;

type StatusPillProps =
  | { kind: 'job'; status: JobStatus }
  | { kind: 'offer'; status: OfferStatus }
  | { kind: 'payment'; status: PaymentStatus };

export function StatusPill(props: StatusPillProps) {
  const styles = stylesFor();
  const { emerald: colors, isDark } = useThemeColors();
  const { label, tone } =
    props.kind === 'job'
      ? { label: JOB_LABELS[props.status], tone: JOB_TONES[props.status] }
      : props.kind === 'offer'
        ? { label: OFFER_LABELS[props.status], tone: OFFER_TONES[props.status] }
        : { label: PAYMENT_LABELS[props.status], tone: PAYMENT_TONES[props.status] };

  const palette = tonesFor(colors)[tone];

  // RUN S2 (C8) — the status pill's geometry dials; tones stay enum-driven.
  const padXDial = useOverrideNumber('pill.paddingX');
  const padYDial = useOverrideNumber('pill.paddingY');
  const radiusDial = useOverrideNumber('pill.radius');
  const borderWidthDial = useOverrideNumber('pill.borderWidth');
  const pillDial = {
    ...(padXDial != null ? { paddingHorizontal: padXDial } : null),
    ...(padYDial != null ? { paddingVertical: padYDial } : null),
    ...(radiusDial != null ? { borderRadius: radiusDial } : null),
    ...(borderWidthDial != null ? { borderWidth: borderWidthDial } : null),
  };

  return (
    <View
      // 2026-09-29 (LUX-LIST-2 #6): a status pill has no outline — dark fills with its own ink at .14
      // (the Lux `.chip`), light keeps its filled tint; the rim stays transparent so the size holds.
      style={[styles.pill, { backgroundColor: isDark ? withAlpha(palette.fg, 0.14) : palette.bg, borderColor: 'transparent' }, pillDial]}
      // The pill is the status, so it announces itself as text rather than
      // leaving a screen reader to infer meaning from a coloured shape.
      accessibilityRole="text"
    >
      {/* Some payment labels are a full sentence; wrapping keeps them readable
          on a narrow phone instead of truncating the part that matters. */}
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const stylesFor = metricStyles(() => StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    // Never wider than its parent, so a long payment label wraps rather than
    // pushing a card's other content off-screen.
    maxWidth: '100%',
  },
  label: {
    ...typeScale.sub,
    fontWeight: '700',
  },
}));
