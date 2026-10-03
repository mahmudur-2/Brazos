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
 *      sends a non-sandbox payee (20260910000000_settlement_schedules.sql,
 *      notify_on_payment_release — "Neither sentence carries a dollar amount,
 *      and the live one promises no timing").
 *
 * The provider test is an ALLOW-LIST on 'sandbox', mirroring that trigger: a
 * provider this module has never heard of gets the real-money sentence, which
 * is the fail-safe direction — claiming a sandbox ledger about real money is
 * the failure worth preventing.
 */

export type EarningsRowFacts = {
  status: string;
  provider?: string | null;
  release_requested_at?: string | null;
  release_reason?: string | null;
  released_at?: string | null;
  paid_out_at?: string | null;
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
    return row.provider === 'sandbox' ? base : `${base} — on its way to your bank`;
  }

  if (row.status === 'paid_out') {
    return `Transferred ${row.paid_out_at ? f.timeAgo(row.paid_out_at) : ''}`.trimEnd();
  }

  // The screen's own .in('status', […EARNING_STATUSES]) never returns another
  // status; the helper still refuses to invent a label.
  return '';
}
