/**
 * 2026-09-26 (the refresh, audit M-21) — the pure half of Forgot password: the
 * redirect the reset email sends people to, reading the tokens off that link,
 * and the one flag that says a recovery is waiting for its new password. No
 * imports, so tests/passwordReset.test.mjs executes it directly. The calls to
 * Supabase live beside it in lib/passwordReset.ts.
 *
 * THE REDIRECT IS AN ALLOW-LISTED URL. Supabase refuses to send a user to a
 * redirect that is not on the project's Auth → URL Configuration list, so
 * `brazos://reset-password` must be added there (staging and production, by
 * the operator) — the local stack lists it in supabase/config.toml.
 */
export const PASSWORD_RESET_REDIRECT = 'brazos://reset-password';

export type RecoveryTokens = { accessToken: string; refreshToken: string };

/**
 * The tokens a reset link carries, or null when the URL is not a reset link.
 * Supabase's implicit flow puts them in the fragment —
 * `brazos://reset-password#access_token=…&refresh_token=…&type=recovery` — and
 * a link without `type=recovery` is not a recovery, whatever else it carries.
 */
export function parseRecoveryLink(url: string): RecoveryTokens | null {
  if (!url.toLowerCase().startsWith(PASSWORD_RESET_REDIRECT)) return null;
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  const raw = hash >= 0 ? url.slice(hash + 1) : query >= 0 ? url.slice(query + 1) : '';
  const params = new URLSearchParams(raw);
  if (params.get('type') !== 'recovery') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

/** The shortest password the form accepts — Supabase's own default minimum. */
export const MIN_PASSWORD_LENGTH = 6;

// ---- the one piece of state: a recovery is waiting for its new password ----
type Listener = (pending: boolean) => void;
let pending = false;
const listeners = new Set<Listener>();

export function isRecoveryPending(): boolean {
  return pending;
}

export function setRecoveryPending(next: boolean): void {
  if (pending === next) return;
  pending = next;
  listeners.forEach((listener) => listener(next));
}

export function subscribeRecovery(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
