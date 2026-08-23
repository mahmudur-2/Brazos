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
 *   archived  ALWAYS EMPTY, and honestly so: there is no per-participant
 *             archived flag in the schema, so nothing can be archived. The
 *             pill ships anyway because it is the one place a user would
 *             look to find out — and it says exactly that.
 *   support   ALWAYS EMPTY. There is no support conversation, agent, or
 *             routing in this product yet.
 */
export function filterRows<T extends FilterableRow>(rows: T[], filter: InboxFilter): T[] {
  switch (filter) {
    case 'unread':
      return rows.filter((row) => row.unread);
    case 'requests':
      return rows.filter((row) => row.awaitingRequest);
    case 'archived':
    case 'support':
      return [];
    case 'all':
    default:
      return rows;
  }
}

export type InboxEmptyState = { title: string; body: string };

/**
 * What an empty list says, per pill.
 *
 * Each one is true of the state it describes and claims nothing else. In
 * particular "Nothing archived yet" is not a lie about a feature that does not
 * exist — nothing IS archived — and "Support coming soon" is the only line
 * here that promises anything, which is why it is the only one that says so
 * plainly rather than implying a filter came up empty.
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
