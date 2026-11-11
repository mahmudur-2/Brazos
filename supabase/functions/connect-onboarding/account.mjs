// ============================================================================
// Brazos · connect-onboarding / account.mjs
//
// The payout account's create body and the decisions around its contact
// email. Pure: no imports, no I/O — so tests/connect.test.mjs can execute it
// under node while the Deno function imports it unchanged.
//
// Stripe refuses a recipient account without a contact email, and a phone
// sign-in has no auth email, so the worker types one on Payouts (body
// {"email"}). It is passed to Stripe once, when the account is created: never
// stored, never logged.
// ============================================================================

/** No address at all: an app from before the field, used by a phone sign-in. */
export const EMAIL_MISSING = 'Payout setup needs an email address — update Brazos, then try again.';
/** An address the rule below, or Stripe itself, refuses. */
export const EMAIL_INVALID = 'That email address doesn’t look right — check it and try again.';
/** Every other refused create: today's sentence. */
export const PROVIDER_UNAVAILABLE = 'The payment provider is unavailable right now.';

// lib/validation.ts isValidEmail, mirrored (tests/payouts.test.mjs holds the
// two to one answer), and the longest address SMTP allows.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

/**
 * The contact email for a new payout account: the address the worker typed,
 * trimmed, else the verified sign-in email. A typed address that fails the
 * rule is refused, never swapped for the sign-in one.
 * @param {unknown} body  the request body, parsed (null when it was not JSON)
 * @param {string | null | undefined} authEmail  the auth server's email for the caller
 * @returns {{ email: string } | { error: string }}  an error is the 400 sentence
 */
export function contactEmail(body, authEmail) {
  const typed = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!typed) return authEmail ? { email: authEmail } : { error: EMAIL_MISSING };
  return typed.length <= EMAIL_MAX && EMAIL_SHAPE.test(typed) ? { email: typed } : { error: EMAIL_INVALID };
}

/**
 * Express dashboard, recipient configuration, stripe_transfers only: the
 * platform charges and transfers, the worker only receives (D1). Fees and
 * losses fall on us; display name and entity type are the hosted flow's to
 * collect (D2). Nothing monetary.
 * @param {string} email  from contactEmail
 */
export function newAccount(email) {
  return {
    dashboard: 'express',
    defaults: {
      responsibilities: { fees_collector: 'application', losses_collector: 'application' },
    },
    identity: { country: 'us' },
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
      },
    },
    contact_email: email,
  };
}

/**
 * A refused create, as the worker should read it. Stripe's `email_invalid`
 * (seen in the sandbox for an address the rule above passes) is the worker's
 * address: a 400 that says to check it. Anything else is ours: the 502.
 * @param {unknown} body  the provider's error response
 * @returns {{ status: number, error: string }}
 */
export function createRefusal(body) {
  return body?.error?.code === 'email_invalid'
    ? { status: 400, error: EMAIL_INVALID }
    : { status: 502, error: PROVIDER_UNAVAILABLE };
}

/** Any address in a provider message, replaced before the line is logged. */
export function withoutEmails(text) {
  return text.replace(/[^\s@]+@[^\s@]+/g, '[email]');
}
