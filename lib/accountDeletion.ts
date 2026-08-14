import { supabase } from './supabase';
import {
  isAccountDeletionBlocked,
  type AccountDeletionBlocker,
} from './accountDeletionBlockers';

// ---------------------------------------------------------------------------
// Account deletion (App Store Guideline 5.1.1(v)).
//
// Both RPCs act on auth.uid() and take NO arguments. That is not an oversight
// to be "fixed" later by threading a user id through: a caller-supplied id
// would turn account_deletion_blockers() into an oracle for other people's
// open work and delete_my_account() into a weapon. phase67 declares them
// parameterless on purpose, and these wrappers keep that shape.
// ---------------------------------------------------------------------------

type RpcError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
} | null;

/**
 * Everything still tying this account to money or to another person's work.
 * An empty array means deletion is permitted — the database applies the same
 * rule again inside delete_my_account(), so this is a UI courtesy, never the
 * gate.
 */
export async function fetchAccountDeletionBlockers(): Promise<{
  data: AccountDeletionBlocker[];
  error: RpcError;
}> {
  const { data, error } = await supabase.rpc('account_deletion_blockers');
  return { data: (data ?? []) as AccountDeletionBlocker[], error };
}

export type DeleteAccountResult = {
  /** True when the server refused because blockers exist. The caller re-reads
   *  the blocker list and renders it, rather than showing a raw error. */
  blocked: boolean;
  error: RpcError;
};

/**
 * Delete the signed-in account. Success means the auth row is gone; the caller
 * still has to clear the local session (see DeleteAccountScreen — the JWT
 * outlives the row it authenticates, so only a LOCAL sign-out is safe).
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  const { error } = await supabase.rpc('delete_my_account');
  if (!error) return { blocked: false, error: null };
  return { blocked: isAccountDeletionBlocked(error), error };
}
