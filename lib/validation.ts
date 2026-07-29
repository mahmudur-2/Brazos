/**
 * Client-side input validation. Deliberately loose — these exist to catch
 * obviously-wrong input (typos, letters where a phone number goes) before it
 * reaches the server, not to be a fully correct email/phone spec. Supabase
 * (email) and the database (everything else) remain the actual source of
 * truth for what's ultimately accepted.
 */

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
