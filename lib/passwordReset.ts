import { supabase } from './supabase';
import { PASSWORD_RESET_REDIRECT, type RecoveryTokens } from './passwordResetLink';

/**
 * 2026-09-26 (the refresh, audit M-21) — FORGOT PASSWORD.
 *
 * The only sign-in that works today is email and password, and until now a
 * forgotten password locked the account out for good. This is the whole of
 * the recovery: Supabase's own reset email, a link back into the app on the
 * app's scheme (lib/passwordResetLink.ts reads it), and one screen that sets
 * the new password. Nothing here is a new credential and nothing is stored on
 * the device beyond the session the link itself carries.
 */
export {
  isRecoveryPending,
  MIN_PASSWORD_LENGTH,
  parseRecoveryLink,
  PASSWORD_RESET_REDIRECT,
  setRecoveryPending,
  subscribeRecovery,
  type RecoveryTokens,
} from './passwordResetLink';

/** Ask Supabase to email a reset link. The answer is the same whether or not
 *  an account exists for the address — the server never says which. */
export async function requestPasswordReset(email: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: PASSWORD_RESET_REDIRECT,
  });
  return { error: error ? { message: error.message } : null };
}

/** Sign in with the link's own session, so the new password can be set. */
export async function beginRecovery(tokens: RecoveryTokens): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  return { error: error ? { message: error.message } : null };
}

/** The new password, for the account the recovery session belongs to. */
export async function completePasswordReset(password: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error ? { message: error.message } : null };
}
