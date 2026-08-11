import type { PhoneAuthErrorCode, PhoneAuthFailure } from './types';

/**
 * One place where a phone-auth failure becomes something a person can read.
 *
 * Two rules shape the copy. It never leaks provider internals — a raw GoTrue
 * string ("Signups not allowed for otp") is a support ticket, not a message.
 * And it never confirms whether a number has an account: a wrong code and an
 * unregistered number have to leave the same impression, or the screen becomes
 * a way to test which phone numbers are registered with BRAZOS. Development
 * still gets the real error, through `debug` on the failure's console line.
 */

export const PHONE_AUTH_MESSAGES: Record<PhoneAuthErrorCode, string> = {
  'invalid-phone': 'Enter a valid phone number.',
  'provider-disabled': 'Sign-in by text message is not switched on yet.',
  'sms-not-configured':
    "We couldn't send a text message right now. Use your email and password instead.",
  'rate-limited': 'Too many requests. Wait a moment before trying again.',
  'too-many-attempts':
    'Too many incorrect codes. Request a new one to try again.',
  'invalid-code': "That code isn't right. Check it and try again.",
  'expired-code': 'That code has expired. Request a new one.',
  network: "We couldn't reach the network. Check your connection and try again.",
  'unknown-account':
    "We couldn't send a code to that number. Create an account, or sign in with your email.",
  'identity-conflict':
    'That number is already connected to an account. Sign in with your email instead.',
  'stale-challenge':
    'That code request is no longer valid. Start again with your phone number.',
  unknown: "Something went wrong. Try again, or use your email and password.",
};

export function phoneAuthError(
  code: PhoneAuthErrorCode,
  extra?: Partial<Omit<PhoneAuthFailure, 'status' | 'code'>>
): PhoneAuthFailure {
  return {
    status: 'error',
    code,
    message: extra?.message ?? PHONE_AUTH_MESSAGES[code],
    ...(extra?.attemptsRemaining === undefined
      ? {}
      : { attemptsRemaining: extra.attemptsRemaining }),
    ...(extra?.retryAvailableAt === undefined
      ? {}
      : { retryAvailableAt: extra.retryAvailableAt }),
  };
}

/** The shape of a Supabase AuthError, narrowed to what the mapping reads. */
export type RawAuthError = {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
};

/**
 * GoTrue's error codes, translated. Codes are checked before message text:
 * `code` is a stable contract, the message string is not.
 */
export function mapSupabaseAuthError(error: RawAuthError | null | undefined): PhoneAuthFailure {
  if (!error) return phoneAuthError('unknown');

  const code = (error.code ?? '').toLowerCase();
  const message = (error.message ?? '').toLowerCase();

  // A transport failure never reaches GoTrue, so it carries no code.
  if (
    error.name === 'AuthRetryableFetchError' ||
    /network|failed to fetch|timeout|timed out/.test(message)
  ) {
    return phoneAuthError('network');
  }

  if (error.status === 429 || code.startsWith('over_') || code === 'too_many_requests') {
    return phoneAuthError('rate-limited');
  }

  switch (code) {
    case 'otp_expired':
      return phoneAuthError('expired-code');
    case 'invalid_credentials':
    case 'otp_invalid':
      return phoneAuthError('invalid-code');
    // Returned when shouldCreateUser is false and nobody owns that number.
    case 'otp_disabled':
    case 'signup_disabled':
    case 'user_not_found':
      return phoneAuthError('unknown-account');
    case 'sms_send_failed':
    case 'phone_provider_disabled':
    case 'provider_disabled':
      return phoneAuthError('sms-not-configured');
    case 'phone_exists':
    case 'user_already_exists':
      return phoneAuthError('identity-conflict');
    case 'validation_failed':
      return phoneAuthError('invalid-phone');
    default:
      break;
  }

  // Fallbacks for a project whose GoTrue predates the code field.
  if (message.includes('expired')) return phoneAuthError('expired-code');
  if (message.includes('signups not allowed')) return phoneAuthError('unknown-account');
  if (message.includes('token has expired or is invalid')) {
    return phoneAuthError('invalid-code');
  }
  if (message.includes('sms') || message.includes('provider')) {
    return phoneAuthError('sms-not-configured');
  }

  return phoneAuthError('unknown');
}

/**
 * Development-only diagnostics. Full numbers never reach a log — the last four
 * digits are enough to tell two test devices apart and are what the verify
 * screen already shows the user anyway.
 */
export function maskPhoneForLog(phone: string): string {
  const tail = phone.slice(-4);
  return tail.length < 4 ? '•••' : `•••${tail}`;
}
