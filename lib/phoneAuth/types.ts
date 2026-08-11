/**
 * The phone one-time-code boundary the auth screens talk to.
 *
 * Every screen in the flow calls this interface and nothing else — never
 * `supabase.auth` directly. That is what lets the whole experience be built,
 * driven and tested today against a development-only mock while no SMS
 * provider is paid for, and turned on later by changing which implementation
 * the facade in ./index.ts hands back rather than by rewriting any UI.
 *
 * Results are discriminated unions rather than booleans plus a thrown error:
 * "the code was wrong and you have two tries left" and "there is no SMS
 * provider configured" are different states the screen has to render
 * differently, and a `success: false` would collapse them.
 */

export type PhoneAuthMode = 'disabled' | 'mock' | 'supabase';

/**
 * Which half of the flow the challenge belongs to. Kept distinct all the way
 * through: a sign-in challenge must never be usable to finish a sign-up, and
 * (once Supabase mode is live) a sign-in request must not create an account
 * for a number nobody has registered.
 */
export type PhoneAuthIntent = 'sign-in' | 'sign-up';

/**
 * What the create-account screen has collected before anyone is
 * authenticated. Deliberately tiny — it is carried through navigation, so it
 * holds no credential and no code.
 */
export type PhoneProfileDraft = {
  fullName?: string;
};

export type RequestOtpInput = {
  /** E.164, already normalised by lib/phoneNumber.ts. */
  phone: string;
  intent: PhoneAuthIntent;
  profileDraft?: PhoneProfileDraft;
};

export type VerifyOtpInput = {
  phone: string;
  /** The six digits the user typed. */
  token: string;
  intent: PhoneAuthIntent;
  /** Ties the submission to the challenge it was issued for. */
  challengeId?: string;
};

export type PhoneAuthErrorCode =
  | 'invalid-phone'
  | 'provider-disabled'
  | 'sms-not-configured'
  | 'rate-limited'
  | 'too-many-attempts'
  | 'invalid-code'
  | 'expired-code'
  | 'network'
  | 'unknown-account'
  | 'identity-conflict'
  | 'stale-challenge'
  | 'unknown';

export type PhoneAuthFailure = {
  status: 'error';
  code: PhoneAuthErrorCode;
  /** Already user-safe — see lib/phoneAuth/errors.ts. */
  message: string;
  /** Present on a wrong-code result, so the screen can warn before the lock. */
  attemptsRemaining?: number;
  /** Present on a cooldown result, so the screen can show the countdown. */
  retryAvailableAt?: number;
};

export type ChallengeSent = {
  status: 'challenge-sent';
  challengeId: string;
  phone: string;
  /** Epoch ms; the resend control stays disabled until then. */
  resendAvailableAt: number;
  /**
   * Epoch ms after which the code stops being accepted, or null when only the
   * server knows — GoTrue owns the real expiry, and a client-invented deadline
   * would either expire a working code or promise time it doesn't have.
   */
  expiresAt: number | null;
  /**
   * The generated code, in mock mode only, so the development banner can show
   * what to type. Never set by the Supabase provider, and never routed —
   * see ChallengeSnapshot for how the verify screen reads it.
   */
  devCode?: string;
};

export type RequestOtpResult =
  | ChallengeSent
  | { status: 'provider-disabled'; message: string }
  | PhoneAuthFailure;

export type VerifyOtpResult =
  /** A real Supabase session now exists; AuthContext's listener owns it. */
  | { status: 'authenticated'; sessionAvailable: true; isNewUser: boolean }
  /**
   * The mock flow completed. There is no session and no hosted user — the
   * screen must say so rather than routing anyone into the app.
   */
  | { status: 'verified-mock'; sessionAvailable: false; intent: PhoneAuthIntent }
  | PhoneAuthFailure;

/**
 * A read of the live challenge, for a verify screen that has just mounted (or
 * remounted after a reload) and needs to know whether the challenge its route
 * params describe still exists.
 */
export type ChallengeSnapshot = {
  challengeId: string;
  phone: string;
  intent: PhoneAuthIntent;
  /** Null when the server owns the expiry — see ChallengeSent. */
  expiresAt: number | null;
  resendAvailableAt: number;
  /** Null when the attempt limit is enforced server-side rather than here. */
  attemptsRemaining: number | null;
  /** Mock mode only; null in every other mode. */
  devCode: string | null;
};

export type PhoneAuthProvider = {
  getMode(): PhoneAuthMode;
  requestOtp(input: RequestOtpInput): Promise<RequestOtpResult>;
  verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult>;
  resendOtp(input: RequestOtpInput & { challengeId?: string }): Promise<RequestOtpResult>;
  /** Null when no live challenge matches — the screen treats that as stale. */
  inspectChallenge(challengeId: string): ChallengeSnapshot | null;
  /** Drops the live challenge: backing out, or changing the number. */
  cancelChallenge(): void;
};

/** Digits in a code. Six, per the reference screen and Supabase's default. */
export const OTP_LENGTH = 6;

/** How long the resend control stays disabled after a code is issued. */
export const RESEND_COOLDOWN_MS = 60_000;

/** How long a mock code stays valid. */
export const MOCK_CODE_TTL_MS = 10 * 60_000;

/** Wrong-code submissions allowed before the challenge is burned. */
export const MAX_VERIFY_ATTEMPTS = 5;

/**
 * E.164: a leading '+', a non-zero country digit, then up to 14 more. The
 * lower bound is deliberately loose (7 digits total) — the per-country rules
 * live in lib/phoneNumber.ts and have already run by the time a value reaches
 * a provider. This is the structural last line of defence, not the validator.
 */
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function isOtpToken(value: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(value);
}
