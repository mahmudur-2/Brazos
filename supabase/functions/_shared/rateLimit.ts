// B10, the payment functions (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md):
// one account cannot drive Stripe calls without bound. Each of the four functions the app calls with a
// user's token (create-payment, payment-methods, connect-onboarding, connect-status) takes one hit on
// the caller's hourly counter, after it knows the caller and before its first Stripe call, through the
// database's own counter (public.rate_limit_take, service role only; 20261112032500_rate_limits.sql).
//
// The limits are at least five times what one person does in an hour of real use (the call sites are
// counted in the B10 report), so only a loop reaches them.
//
// active_account_rule (production-36h S1, M2): the same single question now also asks whether the
// account is still active (public.admit_user_call, service role only). It is asked right after the
// auth server named the caller and before any other database call or provider call. A banned account
// is refused with the database guard's own sentence (except where a handler lets a suspended account
// list or remove its own cards), a deleted one with "This account is no longer active.", and an
// account over its limit as before. When the check itself cannot be answered, the call is refused
// (503): an unknown account state is never treated as allowed. The log names no one.

/** What a refused call answers with (HTTP 429), in the words the app shows as written. */
export const RATE_LIMITED = 'Too many tries in the last hour. Try again later.';

/** A banned account (HTTP 401): the database guard's sentence, word for word (require_active_caller). */
export const ACCOUNT_SUSPENDED =
  'This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake.';

/** A deleted account, or one with no profile (HTTP 401): the database guard's sentence. */
export const ACCOUNT_INACTIVE = 'This account is no longer active.';

/** The check could not be answered (HTTP 503): the call is refused, never let through. */
export const ACCOUNT_UNCHECKED = 'Brazos can’t check this account right now. Try again in a minute.';

/** Calls per account per hour. */
export const HOURLY_LIMITS = {
  'create-payment': 150,
  'payment-methods': 600,
  'connect-onboarding': 100,
  'connect-status': 300,
} as const;

export type LimitedFunction = keyof typeof HOURLY_LIMITS;

/** The database's answer, or 'unknown' when there was none to read. */
export type Admission = 'ok' | 'suspended' | 'inactive' | 'limited' | 'unknown';

type ServiceRpc = (fn: string, args: Record<string, unknown>) => Promise<Response>;

const ANSWERS: readonly Admission[] = ['ok', 'suspended', 'inactive', 'limited'];

/**
 * One call to admit_user_call: is the caller active, and within the hourly limit (one hit, taken only
 * for an active account)? Any fault in the check (a refused or failed RPC, an unreadable or unexpected
 * answer) is 'unknown', which the handler refuses.
 */
export async function admitCaller(
  serviceRpc: ServiceRpc,
  fn: LimitedFunction,
  userId: string,
  options: { allowSuspended?: boolean } = {},
): Promise<Admission> {
  try {
    const res = await serviceRpc('admit_user_call', {
      p_user: userId,
      p_action: `fn:${fn}`,
      p_max: HOURLY_LIMITS[fn],
      p_window: '1 hour',
      p_allow_suspended: options.allowSuspended === true,
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      console.error(`${fn}: account check failed (status ${res.status}); the call is refused`);
      return 'unknown';
    }
    const answer = await res.json();
    if (typeof answer === 'string' && (ANSWERS as readonly string[]).includes(answer)) {
      return answer as Admission;
    }
    console.error(`${fn}: account check failed (unexpected answer); the call is refused`);
    return 'unknown';
  } catch (err) {
    console.error(`${fn}: account check failed (${err instanceof Error ? err.name : 'error'}); the call is refused`);
    return 'unknown';
  }
}

/** The answer for a refused admission, or null when the call may go on. */
export function admissionRefusal(admission: Admission): { status: number; error: string } | null {
  switch (admission) {
    case 'ok':
      return null;
    case 'limited':
      return { status: 429, error: RATE_LIMITED };
    case 'suspended':
      return { status: 401, error: ACCOUNT_SUSPENDED };
    case 'inactive':
      return { status: 401, error: ACCOUNT_INACTIVE };
    default:
      return { status: 503, error: ACCOUNT_UNCHECKED };
  }
}

/** admitCaller and admissionRefusal in one step: the refusal to answer with, or null to go on. */
export async function refuseUnadmitted(
  serviceRpc: ServiceRpc,
  fn: LimitedFunction,
  userId: string,
  options: { allowSuspended?: boolean } = {},
): Promise<{ status: number; error: string } | null> {
  return admissionRefusal(await admitCaller(serviceRpc, fn, userId, options));
}
