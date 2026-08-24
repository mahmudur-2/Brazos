// `import type`, never a value import: this module is imported and EXECUTED by
// the tests, and lib/messages.ts pulls in the Supabase client, which Node's
// resolver cannot load from a test at all. A type-only import is erased.
import type { ChatTarget } from './messages';

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

export type InboxFilter = 'all' | 'unread' | 'archived' | 'requests' | 'support';

/** Only what the filter needs. The screen's row type is much wider. */
export type FilterableRow = {
  unread: boolean;
  awaitingRequest: boolean;
  /**
   * Archived out of the main inbox (phase77 ARCHIVE). True only when EVERY
   * thread of the conversation is archived — see foldConversationStates().
   */
  archived: boolean;
};

export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'archived', label: 'Archived' },
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
 *   archived  LIVE since phase77 gave conversation_states an archived flag.
 *             It was an honest empty state for as long as there was no column
 *             to read; there is one now, so the pill filters on it and the
 *             empty line below is true of the state rather than of the schema.
 *   support   ALWAYS EMPTY. There is no support conversation, agent, or
 *             routing in this product yet.
 *
 * ARCHIVED ROWS ARE OUT OF EVERY OTHER PILL, not merely out of `all`. The
 * point of archiving is that the conversation stops appearing in the list you
 * scroll; a row that vanished from All and then resurfaced under Unread would
 * have been filed nowhere.
 */
export function filterRows<T extends FilterableRow>(rows: T[], filter: InboxFilter): T[] {
  const live = rows.filter((row) => !row.archived);
  switch (filter) {
    case 'unread':
      return live.filter((row) => row.unread);
    case 'requests':
      return live.filter((row) => row.awaitingRequest);
    case 'archived':
      return rows.filter((row) => row.archived);
    case 'support':
      return [];
    case 'all':
    default:
      return live;
  }
}

export type InboxEmptyState = { title: string; body: string };

/**
 * What an empty list says, per pill.
 *
 * Each one is true of the state it describes and claims nothing else. Since
 * phase77 "Nothing archived yet" describes an empty FILTER rather than an
 * absent feature — the line did not have to change when the column arrived,
 * because it was written about the state and not about the schema. "Support
 * coming soon" is still the only line here that promises anything, which is
 * why it is the only one that says so plainly rather than implying a filter
 * came up empty.
 */
export function emptyStateFor(filter: InboxFilter): InboxEmptyState {
  switch (filter) {
    case 'unread':
      return { title: 'Nothing unread', body: 'You are caught up.' };
    case 'archived':
      return { title: 'Nothing archived yet', body: 'Archived conversations will show up here.' };
    case 'requests':
      return {
        title: 'No requests yet',
        body: 'Job requests and offers waiting on your answer appear here.',
      };
    case 'support':
      return { title: 'Support coming soon', body: 'You will be able to reach the Brazos team here.' };
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
  muted: boolean;
  /**
   * EVERY thread this one conversation is made of — their job threads and
   * their pair thread alike. The phase77 actions all apply to the whole
   * conversation, because the row IS the whole conversation; an action that
   * reached only the job threads would silently no-op on a pair who have never
   * shared a job, which is the half-feature this run exists to prevent.
   */
  targets: ChatTarget[];
  /** Folded from those threads — see foldConversationStates(). */
  archived: boolean;
  hidden: boolean;
};

export type ResolvedSheetTarget = {
  userId: string;
  name: string;
  jobId: string | null;
  blocking: boolean;
  muted: boolean;
  targets: ChatTarget[];
  archived: boolean;
  hidden: boolean;
};

/**
 * The row the open action sheet is acting on, read from the CURRENT rows.
 *
 * WHY THIS IS NOT A SNAPSHOT. The sheet used to be opened by copying
 * `{ muted, blocking }` out of the long-pressed row into state. Those two
 * values decide both what the sheet says and which call the tap makes —
 * `muted ? unmuteUser : muteUser`. A realtime refresh while the sheet is open
 * (another device muting, a block landing) updates the row underneath and
 * leaves the copy behind, so the sheet goes on offering "Mute" for somebody
 * already muted and the tap INVERTS the user's intent: they read "Mute", they
 * tap, and the person is unmuted.
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
    muted: row.muted,
    targets: row.targets,
    archived: row.archived,
    hidden: row.hidden,
  };
}

/**
 * Which call a tap on the sheet's first row should make, given the live target.
 * Stated once so the LABEL and the ACTION cannot disagree — the inversion F2
 * describes is exactly those two reading different values.
 */
export function muteActionFor(target: Pick<ResolvedSheetTarget, 'muted'>): 'mute' | 'unmute' {
  return target.muted ? 'unmute' : 'mute';
}

/** Same rule for the block row. */
export function blockActionFor(target: Pick<ResolvedSheetTarget, 'blocking'>): 'block' | 'unblock' {
  return target.blocking ? 'unblock' : 'block';
}
