// B10, the payment functions (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md):
// one account cannot drive Stripe calls without bound. Each of the four functions the app calls with a
// user's token (create-payment, payment-methods, connect-onboarding, connect-status) takes one hit on
// the caller's hourly counter, after it knows the caller and before its first Stripe call, through the
// database's own counter (public.rate_limit_take, service role only; 20261112032500_rate_limits.sql).
//
// The limits are at least five times what one person does in an hour of real use (the call sites are
// counted in the B10 report), so only a loop reaches them. A fault in the check itself never stops a
// payment: it is logged without the caller's id and the call goes on.

/** What a refused call answers with (HTTP 429), in the words the app shows as written. */
export const RATE_LIMITED = 'Too many tries in the last hour. Try again later.';

/** Calls per account per hour. */
export const HOURLY_LIMITS = {
  'create-payment': 150,
  'payment-methods': 600,
  'connect-onboarding': 100,
  'connect-status': 300,
} as const;

export type LimitedFunction = keyof typeof HOURLY_LIMITS;

type ServiceRpc = (fn: string, args: Record<string, unknown>) => Promise<Response>;

/**
 * true only when the database answered that this call is over the caller's hourly limit. Any other
 * outcome (a refused or failed RPC, an unreadable answer) is false: the limiter fails open.
 */
export async function overHourlyLimit(serviceRpc: ServiceRpc, fn: LimitedFunction, userId: string): Promise<boolean> {
  try {
    const res = await serviceRpc('rate_limit_take', {
      p_user: userId,
      p_action: `fn:${fn}`,
      p_max: HOURLY_LIMITS[fn],
      p_window: '1 hour',
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      console.error(`${fn}: rate limit check failed (status ${res.status}); the call goes on`);
      return false;
    }
    const within = await res.json();
    if (typeof within !== 'boolean') {
      console.error(`${fn}: rate limit check failed (unexpected answer); the call goes on`);
      return false;
    }
    return within === false;
  } catch (err) {
    console.error(`${fn}: rate limit check failed (${err instanceof Error ? err.name : 'error'}); the call goes on`);
    return false;
  }
}
