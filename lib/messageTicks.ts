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
