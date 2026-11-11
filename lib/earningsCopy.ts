/**
 * The Earnings ledger's meta line — one sentence per payment state, and the
 * ONE place that copy lives (a6, 2026-09-05). No runtime imports, the
 * lib/earningsMath.ts arrangement, so tests/earnings.test.mjs executes this
 * module directly under node; the two formatters are INJECTED rather than
 * imported, which keeps lib/jobLifecycle.ts and lib/time.ts out of this
 * module's import graph while the screen still passes the one implementation
 * of each — the same release clock the hub's card shows both parties.
 *
 * Every sentence follows the payment state machine and nothing else: held in
 * protection → approved → released → transferred. Two rules it keeps.
 *
 *   1. NOTHING IS CALLED PAID BEFORE IT IS RELEASED, AND NOTHING RELEASED
 *      BEFORE THE TRANSFER EXISTS. release_job_payment (and the auto-release
 *      clock) stamp release_requested_at on a card-path row and LEAVE ITS
 *      STATUS held until the provider's transfer lands — lib/paymentRules.ts
 *      isReleaseRequested (D23). Such a row is APPROVED, and describing it as
 *      still held in protection is the defect this module repairs; describing
 *      it as released would be the worse one, so the released sentence stays
 *      behind the status.
 *
 *   2. NO TIMING PROMISE beyond the app's own release clock. The client holds
 *      no payout-schedule data (payment_accounts carries none), so a
 *      bank-arrival estimate would be invented — SKIPPED by decision
 *      (docs/BACKLOG.md). The bank leg is stated as a direction and never as
 *      a date: the sentence the database's own release notification already
 *      sends a card-path payee (20260910000000_settlement_schedules.sql,
 *      notify_on_payment_release — "Neither sentence carries a dollar amount,
 *      and the live one promises no timing").
 */

export type EarningsRowFacts = {
  status: string;
  /** B21: 'tip' gets its own sentences; a job payment's is the default. */
  kind?: string;
  release_requested_at?: string | null;
  release_reason?: string | null;
  released_at?: string | null;
  paid_out_at?: string | null;
  /** B23: where the ledger sends the money on a cancelled or refunded job. */
  refund_cents?: number | null;
  transfer_cents?: number | null;
  job_status?: string | null;
  /** releaseDeadlineMs(job) computed by the caller from job_completed_at; null when no clock runs. */
  releaseDeadlineMs: number | null;
  /** 2026-09-28 (LUX-LIST-64 #63, M-14): payoutSetupNotice() (lib/payments.ts)
   *  answered for this row — the caller asks the ONE rule and hands the answer
   *  in, so this import-free module never restates it. */
  waitingOnPayoutSetup?: boolean;
};

export type EarningsFormatters = {
  countdown: (deadlineMs: number, nowMs: number) => string;
  timeAgo: (iso: string) => string;
};

export function earningsRowMeta(
  row: EarningsRowFacts,
  nowMs: number,
  f: EarningsFormatters
): string {
  // B23: a row the ledger has sent home (lib/earningsMath.ts workerReceivesCents) says where
  // the money goes — never the job-payment words. A fee whose transfer landed (released_at,
  // stamped by transfer.created) is sent; paid_out is never written today, so "sent" is final.
  const refunded = (row.refund_cents ?? 0) > 0;
  if (refunded || row.job_status === 'cancelled') {
    if (row.release_reason === 'cancellation_fee' && (row.transfer_cents ?? 0) > 0) {
      if (row.released_at) return 'Cancellation fee — sent to your payout account';
      return row.waitingOnPayoutSetup
        ? 'Cancellation fee — waiting on your payout setup'
        : 'Cancellation fee — on its way to you';
    }
    if (!refunded) return 'Held — waiting on a decision';
    if (row.status === 'held') return 'Refund on its way to the customer';
    return row.status === 'partially_refunded' ? 'Partly refunded to the customer' : '';
  }

  if (row.status === 'held' && row.kind === 'tip') {
    // B21: no one approves a tip and no release clock runs on it. A charged tip
    // is queued for transfer at once (release_requested_at, B1) and is on its
    // way until transfer.created releases it; one held without the queue waits.
    if (!row.release_requested_at) return 'Held — not sent yet';
    return row.waitingOnPayoutSetup ? 'Waiting on your payout setup' : 'On its way to you';
  }

  if (row.status === 'held') {
    // D23 first: a requested release is a decision the customer has already
    // made, so the protection sentence must never describe that row.
    // #63 (M-14): approved, but nothing can be sent until the worker's payout
    // setup is done — so the line names their step, never "on its way".
    if (row.release_requested_at) {
      return row.waitingOnPayoutSetup ? 'Approved — waiting on your payout setup' : 'Approved — payout on its way';
    }
    const deadline = row.releaseDeadlineMs;
    if (deadline == null) return 'Held in protection';
    if (deadline > nowMs) {
      return `Held in protection — releases ${f.countdown(deadline, nowMs)} unless approved first`;
    }
    // The clock has run. The server's timer releases when its own gate allows
    // — told by any channel, or the unconditional fallback — and this client
    // cannot know which, so it names no time.
    return 'Held in protection — automatic release is due';
  }

  if (row.status === 'released') {
    const when = row.released_at ? f.timeAgo(row.released_at) : '';
    const base = (
      row.release_reason === 'auto_approved' ? `Released (auto) ${when}` : `Released ${when}`
    ).trimEnd();
    return `${base} — on its way to your bank`;
  }

  if (row.status === 'paid_out') {
    return `Transferred ${row.paid_out_at ? f.timeAgo(row.paid_out_at) : ''}`.trimEnd();
  }

  // The screen's own .in('status', […EARNING_STATUSES]) never returns another
  // status; the helper still refuses to invent a label.
  return '';
}
