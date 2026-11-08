/**
 * The inbox's filter pills — which rows each one shows, and what it says when
 * it shows none.
 *
 * Pure, so the tests run the filtering rather than reading the JSX around it.
 * It also keeps the ONE fact that matters about this row honest in a single
 * place: WHICH PILLS CAN ACTUALLY FILTER ANYTHING TODAY, and which are honest
 * placeholders for state the schema does not carry yet.
 *
 * THIS ROW SUPERSEDES the never-built master-34 All/Jobs/Offers/Support tabs.
 * Those were a different cut of the same surface and are not being built.
 */

export type InboxFilter = 'all' | 'unread' | 'requests' | 'support';

/** Only what the filter needs. The screen's row type is much wider. */
export type FilterableRow = {
  unread: boolean;
  awaitingRequest: boolean;
};

export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'requests', label: 'Requests' },
  { key: 'support', label: 'Support' },
];

/**
 * Apply a pill.
 *
 *   all       everything, in the order the inbox already built.
 *   unread    live, from the read state the rows already carry.
 *   requests  live, from `awaitingRequest` — a thread with a job request or
 *             offer waiting on an answer. RECORDED DEVIATION: the dispatch
 *             expected this pill to be an empty placeholder, on the
 *             assumption that its state was future work. It is not — the
 *             inbox has computed `awaitingRequest` per row all along, so
 *             filtering by it is live behaviour rather than invented data,
 *             and the empty state below still covers the case where nobody
 *             is waiting on you.
 *   support   ALWAYS EMPTY. There is no support conversation, agent, or
 *             routing in this product yet.
 */
export function filterRows<T extends FilterableRow>(rows: T[], filter: InboxFilter): T[] {
  switch (filter) {
    case 'unread':
      return rows.filter((row) => row.unread);
    case 'requests':
      return rows.filter((row) => row.awaitingRequest);
    case 'support':
      return [];
    case 'all':
    default:
      return rows;
  }
}

/** `action` names a button the empty state offers (FIX-RUN B3: Support's
 *  "Contact support", which opens the support email). */
export type InboxEmptyState = { title: string; body: string; action?: string };

/**
 * What an empty list says, per pill.
 *
 * Each one is true of the state it describes and claims nothing else.
 */
export function emptyStateFor(filter: InboxFilter): InboxEmptyState {
  switch (filter) {
    case 'unread':
      return { title: 'Nothing unread', body: 'You are caught up.' };
    case 'requests':
      return {
        title: 'No requests yet',
        body: 'Job requests and offers waiting on your answer appear here.',
      };
    case 'support':
      // FIX-RUN B3 (Apple 1.2): a real way to reach the team, not a promise.
      return {
        title: 'Talk to the Brazos team',
        body: 'Email us and Brazos will reply within 2 business days.',
        action: 'Contact support',
      };
    case 'all':
    default:
      return { title: 'No messages yet', body: 'Conversations start once a bid is accepted.' };
  }
}

// ---------------------------------------------------------------------------
// THE ACTION SHEET'S TARGET — an identity, resolved live, never a snapshot.
// ---------------------------------------------------------------------------

/** The fields the sheet needs off whichever inbox row it is acting on. */
export type SheetTargetRow = {
  otherId: string;
  rawName: string;
  jobId: string | null;
  blocking: boolean;
};

export type ResolvedSheetTarget = {
  userId: string;
  name: string;
  jobId: string | null;
  blocking: boolean;
};

/**
 * The row the open action sheet is acting on, read from the CURRENT rows.
 *
 * WHY THIS IS NOT A SNAPSHOT. The sheet used to be opened by copying
 * `{ blocking }` out of the long-pressed row into state. That value decides
 * both what the sheet says and which call the tap makes —
 * `blocking ? unblockUser : blockUser`. A realtime refresh while the sheet is
 * open (a block landing from another device) updates the row underneath and
 * leaves the copy behind, so the sheet goes on offering "Block" for somebody
 * already blocked and the tap INVERTS the user's intent.
 *
 * Holding the id and resolving through here means the sheet has no second copy
 * to go stale. Every render re-reads the live row, so the label and the call it
 * makes are the same fact.
 *
 * A row that has GONE resolves to null, which closes the sheet — acting on a
 * conversation that is no longer there is the same mistake in a different
 * shape.
 */
export function resolveSheetTarget<T extends SheetTargetRow>(
  rows: T[],
  userId: string | null,
): ResolvedSheetTarget | null {
  if (!userId) return null;
  const row = rows.find((candidate) => candidate.otherId === userId);
  if (!row) return null;
  return {
    userId: row.otherId,
    name: row.rawName,
    jobId: row.jobId,
    blocking: row.blocking,
  };
}

/**
 * Which call a tap on the block row should make, given the live target.
 * Stated once so the LABEL and the ACTION cannot disagree — the inversion F2
 * describes is exactly those two reading different values.
 */
export function blockActionFor(target: Pick<ResolvedSheetTarget, 'blocking'>): 'block' | 'unblock' {
  return target.blocking ? 'unblock' : 'block';
}
