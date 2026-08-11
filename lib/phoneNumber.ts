import { COUNTRIES, DEFAULT_COUNTRY, findCountry, type Country } from './countries';

/**
 * E.164 normalisation for the auth flow's phone field.
 *
 * Scope is deliberately narrow: turn (selected country, national digits) into
 * one canonical `+<digits>` string for Supabase, and make it impossible to
 * produce `+1+1...` or `+11347...` no matter how the number arrives (typed,
 * pasted with a `+`, pasted with a trunk `0`, or pasted with the calling code
 * already in it).
 *
 * The North American Numbering Plan gets the only country-specific rule here,
 * because it is the only one the product defaults to and the only one where a
 * "leading 1" is genuinely ambiguous between a trunk prefix and a real digit.
 * Everything else is handled structurally by `splitInternational`, which the
 * input calls the moment a value starts with '+', so a calling code can never
 * reach `toE164` inside the national part.
 */

/** E.164 allows at most 15 digits including the country calling code. */
const E164_MAX_DIGITS = 15;

/** NANP national numbers are always exactly 10 digits (NPA + NXX + line). */
const NANP_NATIONAL_DIGITS = 10;

export function digitsOf(text: string): string {
  return text.replace(/\D/g, '');
}

export function isNanp(country: Country): boolean {
  return country.dial.startsWith('1');
}

// Longest-first so '+1868' resolves to Trinidad and Tobago rather than the US,
// while a plain '+1347…' still falls through to the US entry.
const DIALS_BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Parse a value the user typed or pasted that begins with '+'. Returns the
 * country the calling code belongs to plus the remaining national digits, or
 * null when no calling code matches yet (e.g. the user has typed only '+4').
 */
export function splitInternational(
  raw: string
): { country: Country; national: string } | null {
  if (!raw.trim().startsWith('+')) return null;
  const digits = digitsOf(raw);
  if (!digits) return null;

  const match = DIALS_BY_LENGTH.find((c) => digits.startsWith(c.dial));
  if (!match) return null;

  // '+1' is shared by the whole NANP; prefer the default (US) over whichever
  // NANP entry happens to sort first, so a pasted US number keeps the US flag.
  const country =
    match.dial === DEFAULT_COUNTRY.dial ? DEFAULT_COUNTRY : match;

  return { country, national: digits.slice(country.dial.length) };
}

/**
 * The national digits, with anything that isn't part of them removed:
 * a trunk '0' (used by most of Europe, Africa and Oceania), and — for NANP
 * only — a leading '1' when the result is a full 10-digit number. NANP area
 * codes never begin with 0 or 1, so this can't eat a real leading digit.
 */
export function nationalDigits(country: Country, input: string): string {
  let d = digitsOf(input).replace(/^0+/, '');
  if (
    isNanp(country) &&
    d.length === NANP_NATIONAL_DIGITS + 1 &&
    d.startsWith('1')
  ) {
    d = d.slice(1);
  }
  return d;
}

/**
 * The canonical value handed to the backend: '+' followed by calling code and
 * national digits, with no spaces, parentheses or hyphens. Returns null when
 * the number isn't complete enough to be one — callers surface
 * `phoneValidationError` instead of sending a half-number.
 */
export function toE164(country: Country, input: string): string | null {
  const national = nationalDigits(country, input);
  if (!national) return null;
  const full = country.dial + national;
  if (full.length > E164_MAX_DIGITS) return null;
  return `+${full}`;
}

/**
 * Inline validation message, or null when the number is acceptable. Kept
 * deliberately specific for NANP (where "10 digits" is a rule users know) and
 * loose elsewhere, matching how lib/validation.ts already treats phone input.
 */
export function phoneValidationError(country: Country, input: string): string | null {
  const national = nationalDigits(country, input);
  if (!national) return 'Enter your phone number.';

  if (isNanp(country)) {
    return national.length === NANP_NATIONAL_DIGITS
      ? null
      : 'Enter a 10-digit phone number.';
  }

  if (national.length < 4) return 'Enter a valid phone number.';
  if (country.dial.length + national.length > E164_MAX_DIGITS) {
    return 'That number is too long.';
  }
  return null;
}

/**
 * How the national part is shown while typing. NANP gets the reference's
 * '347 320 0610' grouping; everywhere else the digits are left alone rather
 * than forced into a grouping that would be wrong for that country.
 */
export function formatNational(country: Country, digits: string): string {
  if (!isNanp(country)) return digits;
  const d = digits.slice(0, NANP_NATIONAL_DIGITS);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/** Digits the national field should hold, capped at what the country can use. */
export function clampNational(country: Country, digits: string): string {
  const max = isNanp(country)
    ? NANP_NATIONAL_DIGITS
    : E164_MAX_DIGITS - country.dial.length;
  return digits.slice(0, max);
}

/**
 * The number as the verify screen names it back: calling code, the last four
 * digits, and bullets for everything between — '+1 ••• ••• 0610'.
 *
 * Enough for the user to recognise their own number and catch a typo, not
 * enough to be worth reading off a shoulder. The masked part reuses
 * `formatNational` so it carries the same grouping rhythm as the field they
 * typed it into.
 */
export function maskE164(value: string): string {
  const split = splitInternational(value);
  if (!split) return value;

  const { country, national } = split;
  const visible = national.length > 4 ? national.slice(-4) : '';
  const hidden = '•'.repeat(national.length - visible.length);

  return `+${country.dial} ${formatNational(country, hidden + visible)}`.trimEnd();
}

/**
 * Split a stored E.164 value back into a country + national pair, for
 * pre-filling the field from an existing profile. Falls back to the default
 * country when the value isn't in E.164 form.
 */
export function fromE164(value: string): { country: Country; national: string } {
  const split = splitInternational(value);
  if (split) return split;
  return { country: DEFAULT_COUNTRY, national: digitsOf(value) };
}

export { DEFAULT_COUNTRY, findCountry };
export type { Country };
