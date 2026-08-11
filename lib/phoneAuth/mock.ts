import { phoneAuthError } from './errors';
import {
  MAX_VERIFY_ATTEMPTS,
  MOCK_CODE_TTL_MS,
  OTP_LENGTH,
  RESEND_COOLDOWN_MS,
  isE164,
  isOtpToken,
  type ChallengeSnapshot,
  type PhoneAuthIntent,
  type PhoneAuthProvider,
  type RequestOtpInput,
  type RequestOtpResult,
  type VerifyOtpInput,
  type VerifyOtpResult,
} from './types';

/**
 * The development-only phone provider.
 *
 * It exists so the entire code experience — the request, the six-cell input,
 * the cooldown, the expiry, the attempt limit, the error copy, the routing —
 * can be built and driven now, while no SMS provider is paid for. It sends
 * nothing. It never claims a session exists. Its successful result is
 * `verified-mock`, which the verify screen renders as exactly what it is.
 *
 * Two properties keep it from becoming a backdoor. The code is generated
 * fresh from `Math.random()` on every request, so there is no fixed value that
 * always works and nothing to discover by reading this file. And the challenge
 * lives in a closure variable, never in AsyncStorage, so it cannot outlive the
 * process — a reload lands on "start again", not on a still-valid code.
 *
 * The mode resolver (./mode.ts) is what guarantees this is unreachable outside
 * development; this module is deliberately pure so it can be executed by the
 * tests rather than asserted about as text.
 */

type MockChallenge = {
  id: string;
  phone: string;
  intent: PhoneAuthIntent;
  code: string;
  expiresAt: number;
  resendAvailableAt: number;
  attemptsRemaining: number;
};

export type MockPhoneAuthOptions = {
  /** Injected so tests can move time without sleeping. */
  now?: () => number;
  /** Injected so tests are deterministic; production uses Math.random(). */
  generateCode?: () => string;
  generateId?: () => string;
};

const CODE_CEILING = 10 ** OTP_LENGTH;

let idSequence = 0;

function defaultGenerateCode(): string {
  // padStart, not a 100000..999999 range: a code is a six-character string,
  // and one beginning with a zero has to be exactly as likely as one beginning
  // with a nine, or the first digit is never the full 0-9 and the space to
  // guess from is a tenth smaller than it looks.
  return String(Math.floor(Math.random() * CODE_CEILING)).padStart(OTP_LENGTH, '0');
}

function defaultGenerateId(): string {
  idSequence += 1;
  const salt = Math.random().toString(36).slice(2, 8);
  return `mock-${Date.now().toString(36)}-${idSequence.toString(36)}-${salt}`;
}

export function createMockPhoneAuthProvider(
  options: MockPhoneAuthOptions = {}
): PhoneAuthProvider {
  const now = options.now ?? (() => Date.now());
  const generateCode = options.generateCode ?? defaultGenerateCode;
  const generateId = options.generateId ?? defaultGenerateId;

  // In memory on purpose — see the module comment.
  let active: MockChallenge | null = null;

  /** Points at the live challenge only when it is the one being asked about. */
  function match(phone: string, intent: PhoneAuthIntent, challengeId?: string) {
    if (!active) return null;
    if (challengeId !== undefined && active.id !== challengeId) return null;
    if (active.phone !== phone) return null;
    if (active.intent !== intent) return null;
    return active;
  }

  function issue(challenge: MockChallenge): RequestOtpResult {
    active = challenge;
    return {
      status: 'challenge-sent',
      challengeId: challenge.id,
      phone: challenge.phone,
      resendAvailableAt: challenge.resendAvailableAt,
      expiresAt: challenge.expiresAt,
      devCode: challenge.code,
    };
  }

  async function requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    if (!isE164(input.phone)) return phoneAuthError('invalid-phone');

    const issuedAt = now();
    // A fresh request replaces whatever was live: starting over from the phone
    // screen must not leave an older code still accepted.
    return issue({
      id: generateId(),
      phone: input.phone,
      intent: input.intent,
      code: generateCode(),
      expiresAt: issuedAt + MOCK_CODE_TTL_MS,
      resendAvailableAt: issuedAt + RESEND_COOLDOWN_MS,
      attemptsRemaining: MAX_VERIFY_ATTEMPTS,
    });
  }

  async function resendOtp(
    input: RequestOtpInput & { challengeId?: string }
  ): Promise<RequestOtpResult> {
    const challenge = match(input.phone, input.intent, input.challengeId);
    // Nothing to resend against — the screen sends the user back to the number
    // rather than silently starting a new challenge it never asked for.
    if (!challenge) return phoneAuthError('stale-challenge');

    const at = now();
    if (at < challenge.resendAvailableAt) {
      return phoneAuthError('rate-limited', { retryAvailableAt: challenge.resendAvailableAt });
    }

    // Same challenge, rotated code: the old one stops working here, and the
    // route params the verify screen is holding stay valid.
    challenge.code = generateCode();
    challenge.expiresAt = at + MOCK_CODE_TTL_MS;
    challenge.resendAvailableAt = at + RESEND_COOLDOWN_MS;
    challenge.attemptsRemaining = MAX_VERIFY_ATTEMPTS;
    return issue(challenge);
  }

  async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const challenge = match(input.phone, input.intent, input.challengeId);
    // Covers the burned, cancelled, mismatched-number, wrong-intent and
    // reloaded-process cases with one answer: this submission has no challenge.
    if (!challenge) return phoneAuthError('stale-challenge');

    const at = now();
    if (at >= challenge.expiresAt) {
      active = null;
      return phoneAuthError('expired-code');
    }

    // An incomplete or non-numeric entry is a typo, not a guess — it must not
    // burn one of the five attempts.
    if (!isOtpToken(input.token)) return phoneAuthError('invalid-code');

    if (input.token !== challenge.code) {
      challenge.attemptsRemaining -= 1;
      if (challenge.attemptsRemaining <= 0) {
        active = null;
        return phoneAuthError('too-many-attempts', { attemptsRemaining: 0 });
      }
      return phoneAuthError('invalid-code', {
        attemptsRemaining: challenge.attemptsRemaining,
      });
    }

    // Consumed, so a replayed submission can't succeed twice.
    active = null;
    return { status: 'verified-mock', sessionAvailable: false, intent: challenge.intent };
  }

  function inspectChallenge(challengeId: string): ChallengeSnapshot | null {
    if (!active || active.id !== challengeId) return null;
    return {
      challengeId: active.id,
      phone: active.phone,
      intent: active.intent,
      expiresAt: active.expiresAt,
      resendAvailableAt: active.resendAvailableAt,
      attemptsRemaining: active.attemptsRemaining,
      devCode: active.code,
    };
  }

  return {
    getMode: () => 'mock',
    requestOtp,
    verifyOtp,
    resendOtp,
    inspectChallenge,
    cancelChallenge: () => {
      active = null;
    },
  };
}
