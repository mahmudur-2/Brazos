/**
 * Client-side input validation. Deliberately loose — these exist to catch
 * obviously-wrong input (typos, letters where a phone number goes) before it
 * reaches the server, not to be a fully correct email/phone spec. Supabase
 * (email) and the database (everything else) remain the actual source of
 * truth for what's ultimately accepted.
 */

import { formatBudget } from './jobs';

/**
 * phase75's money ceiling, mirrored EXACTLY — the database CHECK constraints
 * on jobs, job_offers and payments all read `<= 10000000`, so exactly at the
 * ceiling is accepted and one cent above is not. Tips carry the tighter
 * sandbox_tip_worker() cap (phase51), which rejects `> 100000` — the same
 * inclusive shape. The constraints remain the enforcement; this mirror exists
 * so an over-ceiling amount is refused with a written sentence before the RPC
 * instead of surfacing as a raw CHECK violation. It lives here and not in
 * lib/offers.ts because the ceiling binds job budgets, offer amounts and
 * payments alike — it is not an offers concern.
 */
export const MONEY_CEILING_CENTS = 10_000_000;
export const TIP_CEILING_CENTS = 100_000;

/**
 * Null when the amount is at or under the ceiling (or absent — an empty
 * budget is legal and checked elsewhere); otherwise the user-facing refusal.
 * Integer cents in, always — dollars never reach this.
 */
export function moneyCeilingError(
  amountCents: number | null | undefined,
  ceilingCents: number = MONEY_CEILING_CENTS
): string | null {
  if (amountCents == null || amountCents <= ceilingCents) return null;
  const limit = formatBudget(ceilingCents);
  return `That amount is over the ${limit} limit. Enter ${limit} or less.`;
}

/**
 * The posting flow's description floor (4D-3 §3.3): 20 characters after
 * trimming. Client-only — no database CHECK backs it, so pre-existing shorter
 * descriptions stay legal; the floor is a conversion aid on new input, not an
 * integrity rule. Enforced by disabling the advance control with a written
 * remaining count, never a raw error.
 */
export const JOB_DESCRIPTION_MIN_CHARS = 20;

/** Characters still needed before the description clears the floor. 0 = clear. */
export function descriptionCharsNeeded(text: string): number {
  return Math.max(0, JOB_DESCRIPTION_MIN_CHARS - text.trim().length);
}

/** Loose "looks like an email" check — not RFC 5322-exact, just enough to
 *  catch obviously malformed input like "asdf" or "foo@bar" before it
 *  reaches Supabase as a raw, unfriendly error. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Loose phone check: strips common formatting characters (spaces, dashes,
 * dots, parens, a leading +) and requires what's left to be 7-15 digits —
 * 15 is E.164's own maximum length, 7 is short enough not to reject real
 * local numbers. Rejects letters-only input and other obvious non-numbers
 * without being strict about which real-world formats are "correct".
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.trim().replace(/[\s().-]/g, '').replace(/^\+/, '');
  return /^\d{7,15}$/.test(digits);
}
