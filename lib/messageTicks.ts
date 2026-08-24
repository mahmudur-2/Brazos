/**
 * WHAT THE TICKS ON YOUR OWN MESSAGE MEAN — the derivation, with nothing
 * impure in it, so the tests run it rather than reading it.
 *
 * THREE STATES, THREE DIFFERENT CLAIMS ABOUT THE WORLD, and the whole reason
 * this is a table rather than a boolean:
 *
 *   sent       ONE tick. "The server has this message." True the instant the
 *              insert returns a row, and it is the only one of the three that
 *              the current schema can prove.
 *   delivered  TWO ticks. "Their DEVICE has this message." Nothing in the
 *              schema distinguishes that from `sent` — see DELIVERED_TICKS in
 *              lib/featureFlags.ts — so this state is rendered and tested but
 *              never yet produced from live data.
 *   read       TWO GOLD ticks. "They have opened it." Partially readable
 *              today; see READ_TICKS for exactly which half.
 *
 * WHY THE DERIVATION IS SEPARATE FROM THE WIRING. The element has to be able
 * to draw all three long before two of them can be produced, or the day the
 * schema lands is the day the UI gets written under time pressure. Every state
 * is unit-tested here whatever the flags say.
 */

export type MessageTickState = 'sent' | 'delivered' | 'read';

export type MessageDelivery = {
  /** When the counterparty's device acknowledged the row, if that is known. */
  deliveredAt?: string | null;
  /** When the counterparty's read position passed this message, if known. */
  readAt?: string | null;
};

/**
 * The strongest state the evidence supports, and never stronger.
 *
 * READ IMPLIES DELIVERED, so a read timestamp alone is enough — a message
 * someone has opened reached their device by definition, and requiring both
 * would make a gap in delivery plumbing silently downgrade a fact we actually
 * know. The reverse is not true and is not assumed.
 */
export function tickStateFor(delivery: MessageDelivery): MessageTickState {
  if (delivery.readAt) return 'read';
  if (delivery.deliveredAt) return 'delivered';
  return 'sent';
}

/**
 * Whether a message that has been sent is covered by a read position.
 *
 * Read state is a WATERMARK, not a per-message flag: one timestamp per
 * participant per conversation covers everything at or before it. Comparison
 * is on ISO-8601 strings, which sort lexicographically when they are UTC and
 * same-precision — which is what Postgres timestamptz gives PostgREST. A
 * missing watermark reads as "not read", never as "read".
 */
export function coveredByReadWatermark(
  messageCreatedAt: string,
  watermark: string | null | undefined
): boolean {
  if (!watermark) return false;
  return messageCreatedAt <= watermark;
}

/**
 * THE COUNTERPARTY'S READ POSITION, per thread — the gold tick's whole source
 * (phase77, S-4).
 *
 * ONE conversation folds a pair's job threads AND their direct thread together
 * (see `targets` in screens/ChatScreen.tsx), so the assembly has to answer for
 * both kinds or the SAME conversation shows gold on some bubbles and never on
 * others — an absent tick meaning "not read yet" on one message and
 * "unknowable here" on the next. That was the exact reason READ_TICKS shipped
 * dark, and it is why this map has two halves rather than one.
 *
 *   job threads     the other party's `message_reads` row, readable since
 *                   phase77's `message_reads_select_party`.
 *   direct threads  the other party's read column on `direct_threads`, which
 *                   `direct_threads_select_party` has always handed over.
 */
export type CounterpartyReadPositions = {
  byJobId: Record<string, string | null | undefined>;
  byDirectThreadId: Record<string, string | null | undefined>;
};

/** Which watermark governs this message, whichever thread kind it is in. */
export function counterpartyReadAtFor(
  message: { job_id: string | null; direct_thread_id: string | null },
  positions: CounterpartyReadPositions
): string | null {
  const watermark = message.job_id
    ? positions.byJobId[message.job_id]
    : message.direct_thread_id
      ? positions.byDirectThreadId[message.direct_thread_id]
      : null;
  return watermark ?? null;
}

/**
 * What became of one of your own messages, from the evidence that exists.
 *
 * `readAt` is the counterparty's watermark ONLY when it actually covers this
 * message — a watermark is per-conversation, and returning it unconditionally
 * would gold-tick every message in a thread the moment the other person opened
 * any of it.
 *
 * `deliveredAt` IS DELIBERATELY NEVER SET. Nothing in the schema distinguishes
 * "the insert succeeded" from "their device has it" (DELIVERED_TICKS in
 * lib/featureFlags.ts), and a tick that means the first while looking like the
 * second is a lie. When a real per-recipient delivered_at exists, this is the
 * function that grows the field — not the insert path.
 */
export function deliveryFor(
  message: { job_id: string | null; direct_thread_id: string | null; created_at: string },
  positions: CounterpartyReadPositions
): MessageDelivery {
  const watermark = counterpartyReadAtFor(message, positions);
  return {
    readAt: coveredByReadWatermark(message.created_at, watermark) ? watermark : null,
  };
}
