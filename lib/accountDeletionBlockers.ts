/**
 * The pure half of account deletion: the row shape
 * `account_deletion_blockers()` returns, how it is presented, and how a
 * blocked delete is recognised.
 *
 * Kept separate from lib/accountDeletion.ts (which imports the Supabase
 * client) for the same reason lib/earningsMath.ts is separate from
 * lib/earnings.ts: nothing here touches the network, so tests/*.test.mjs can
 * import and EXECUTE it rather than asserting against its source text.
 */

/** One row of public.account_deletion_blockers(), verbatim. */
export type AccountDeletionBlocker = {
  /**
   * What `ref_id` points at. The database sets this so the client can decide
   * whether a route exists to open the record — see ROUTABLE_KINDS.
   *
   * Deliberately typed as `string`, not a union: there are no generated
   * database types in this app, so a value added server-side would be a
   * runtime surprise, not a compile error. Unknown kinds are handled below.
   */
  kind: string;
  ref_id: string | null;
  label: string;
  detail: string;
};

/**
 * Where the deletion screen may send the user for each blocker kind.
 *
 * The screen lives in ProfileStack, and that stack registers no job-detail
 * route — so a job or dispute blocker renders as a non-tappable row. A
 * payment the user is OWED does have a record here (Earnings), but a payment
 * they SENT does not: there is no customer-side payment screen in this stack,
 * and sending them to Earnings would open a wallet their money is not in.
 *
 * No route is ever created to satisfy a blocker. A kind with no entry here
 * shows its label and nothing more, which is honest.
 */
export const ROUTABLE_KINDS = {
  payment_incoming: 'Earnings',
} as const;

export type BlockerRoute = (typeof ROUTABLE_KINDS)[keyof typeof ROUTABLE_KINDS];

const GROUP_LABELS: Record<string, string> = {
  job: 'Job',
  dispute: 'Dispute',
  payment_incoming: 'Payment',
  payment_outgoing: 'Payment',
};

/** One rendered row. */
export type BlockerRow = {
  /** Stable React key. Includes the index so two rows on the same record
   *  cannot collide. */
  key: string;
  /** "Job", "Payment", "Dispute" — the category, shown as an eyebrow. */
  group: string;
  label: string;
  detail: string;
  refId: string | null;
  /** The route to open, or null when this stack has none for this kind. */
  route: BlockerRoute | null;
};

export type BlockerList = {
  total: number;
  /** Empty string when nothing blocks — the caller renders the confirm form
   *  instead of a headline. */
  headline: string;
  rows: BlockerRow[];
};

/** Title-cases an unknown kind ("refund_pending" -> "Refund pending") so a
 *  value added server-side still renders as something readable. */
function fallbackGroup(kind: string): string {
  const words = kind.replace(/_/g, ' ').trim();
  if (!words) return 'Item';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Turn the RPC's rows into what the screen renders.
 *
 * An empty result means deletion is permitted — the same thing it means in
 * the database — so it returns an empty headline rather than a cheerful
 * "nothing found" string the screen would have to special-case away.
 */
export function formatBlockerList(
  blockers: readonly AccountDeletionBlocker[] | null | undefined
): BlockerList {
  const source = blockers ?? [];
  const rows: BlockerRow[] = source.map((blocker, index) => {
    const kind = blocker.kind ?? '';
    return {
      key: `${kind}:${blocker.ref_id ?? 'none'}:${index}`,
      group: GROUP_LABELS[kind] ?? fallbackGroup(kind),
      label: blocker.label,
      detail: blocker.detail,
      refId: blocker.ref_id ?? null,
      route: ROUTABLE_KINDS[kind as keyof typeof ROUTABLE_KINDS] ?? null,
    };
  });

  return {
    total: rows.length,
    headline:
      rows.length === 0
        ? ''
        : rows.length === 1
        ? 'One thing has to be settled before this account can be deleted.'
        : `${rows.length} things have to be settled before this account can be deleted.`,
    rows,
  };
}

/**
 * The exact string delete_my_account() raises when the gate refuses. Matched
 * rather than parsed: PostgREST surfaces a P0001 in `message`, but has moved
 * detail between fields across versions, so all three are checked.
 */
export const ACCOUNT_DELETION_BLOCKED = 'ACCOUNT_DELETION_BLOCKED';

export function isAccountDeletionBlocked(
  error: { message?: string | null; details?: string | null; hint?: string | null } | null
): boolean {
  if (!error) return false;
  return [error.message, error.details, error.hint].some(
    (field) => typeof field === 'string' && field.includes(ACCOUNT_DELETION_BLOCKED)
  );
}
