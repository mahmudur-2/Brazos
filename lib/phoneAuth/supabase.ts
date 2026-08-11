import type { SupabaseClient } from '@supabase/supabase-js';
import { mapSupabaseAuthError, phoneAuthError } from './errors';
import {
  RESEND_COOLDOWN_MS,
  isE164,
  isOtpToken,
  type ChallengeSnapshot,
  type PhoneAuthIntent,
  type PhoneAuthProvider,
  type PhoneProfileDraft,
  type RequestOtpInput,
  type RequestOtpResult,
  type VerifyOtpInput,
  type VerifyOtpResult,
} from './types';

/**
 * The real phone provider — written now, dormant until Supabase Phone Auth is
 * provisioned and EXPO_PUBLIC_PHONE_AUTH_MODE is set to `supabase`. See
 * docs/phone-auth-activation.md for what "provisioned" means.
 *
 * It is behind the same interface as the mock, so switching it on changes the
 * one line in ./index.ts that picks a provider and nothing in any screen.
 *
 * Everything security-relevant here happens on Supabase's side: the code is
 * generated, delivered and checked by GoTrue, and the session is minted by
 * GoTrue. This module holds no secret — only the publishable key the client
 * already uses — and calls no admin API. What it does own is the two things
 * the server cannot do for us: keeping the local resend cooldown honest, and
 * refusing to report `authenticated` unless a real session actually came back.
 *
 * Kept free of React Native imports so the tests can execute it against a
 * hand-rolled auth double. No SMS is sent by any test.
 */

/** Exactly the two calls this provider makes, taken from the installed client. */
export type SupabasePhoneAuthApi = Pick<SupabaseClient['auth'], 'signInWithOtp' | 'verifyOtp'>;

/**
 * Runs once a real session exists, with the authenticated user's own id, so
 * the create-account draft can be written under RLS. Wired to `updateProfile`
 * by the facade; injected rather than imported so this module stays pure.
 */
export type OnPhoneAuthenticated = (context: {
  userId: string;
  phone: string;
  profileDraft?: PhoneProfileDraft;
}) => Promise<void>;

export type SupabasePhoneAuthOptions = {
  now?: () => number;
  onAuthenticated?: OnPhoneAuthenticated;
};

type PendingChallenge = {
  id: string;
  phone: string;
  intent: PhoneAuthIntent;
  resendAvailableAt: number;
  profileDraft?: PhoneProfileDraft;
};

let idSequence = 0;

function nextId(): string {
  idSequence += 1;
  return `sms-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

export function createSupabasePhoneAuthProvider(
  auth: SupabasePhoneAuthApi,
  options: SupabasePhoneAuthOptions = {}
): PhoneAuthProvider {
  const now = options.now ?? (() => Date.now());

  // No code is ever held here — GoTrue owns it. This is only what the screen
  // needs to render: which request is live and when resend reopens.
  let pending: PendingChallenge | null = null;

  async function send(
    input: RequestOtpInput,
    challengeId: string
  ): Promise<RequestOtpResult> {
    const { error } = await auth.signInWithOtp({
      phone: input.phone,
      options: {
        // The whole account-creation policy, in one flag. A sign-in must not
        // bring an account into existence for a number nobody registered —
        // that would turn a typo into a new user, and make this screen a way
        // to enumerate which numbers are already taken.
        shouldCreateUser: input.intent === 'sign-up',
        // Read by the handle_new_user trigger (supabase/phase6, phase7), the
        // same route AuthContext.signUp already uses, so a phone signup lands
        // a profile row without any client write racing the trigger.
        ...(input.intent === 'sign-up'
          ? {
              data: {
                ...(input.profileDraft?.fullName
                  ? { full_name: input.profileDraft.fullName }
                  : {}),
                phone: input.phone,
              },
            }
          : {}),
      },
    });

    if (error) return mapSupabaseAuthError(error);

    const at = now();
    pending = {
      id: challengeId,
      phone: input.phone,
      intent: input.intent,
      resendAvailableAt: at + RESEND_COOLDOWN_MS,
      profileDraft: input.profileDraft,
    };

    return {
      status: 'challenge-sent',
      challengeId,
      phone: input.phone,
      resendAvailableAt: pending.resendAvailableAt,
      // GoTrue owns the expiry (a project setting). The screen treats
      // "expired" as something the server reports, not something it predicts,
      // so no invented deadline is shown.
      expiresAt: null,
    };
  }

  async function requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    if (!isE164(input.phone)) return phoneAuthError('invalid-phone');

    // Duplicate-request protection: a second tap for the same number inside
    // the cooldown is the user's finger, not a new intent, and Supabase would
    // bill and rate-limit it.
    if (pending && pending.phone === input.phone && now() < pending.resendAvailableAt) {
      return phoneAuthError('rate-limited', { retryAvailableAt: pending.resendAvailableAt });
    }

    return send(input, nextId());
  }

  async function resendOtp(
    input: RequestOtpInput & { challengeId?: string }
  ): Promise<RequestOtpResult> {
    if (
      !pending ||
      (input.challengeId !== undefined && pending.id !== input.challengeId) ||
      pending.phone !== input.phone ||
      pending.intent !== input.intent
    ) {
      return phoneAuthError('stale-challenge');
    }

    if (now() < pending.resendAvailableAt) {
      return phoneAuthError('rate-limited', { retryAvailableAt: pending.resendAvailableAt });
    }

    return send({ ...input, profileDraft: input.profileDraft ?? pending.profileDraft }, pending.id);
  }

  async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    if (!isE164(input.phone)) return phoneAuthError('invalid-phone');
    if (!isOtpToken(input.token)) return phoneAuthError('invalid-code');

    const { data, error } = await auth.verifyOtp({
      phone: input.phone,
      token: input.token,
      type: 'sms',
    });

    if (error) return mapSupabaseAuthError(error);

    // The load-bearing check. A 200 with no session is not an authentication,
    // and reporting one would put an unauthenticated user inside the app.
    if (!data?.session || !data.user) {
      return phoneAuthError('unknown');
    }

    const draft = pending?.profileDraft;
    pending = null;

    // Idempotent, RLS-scoped, and non-fatal: the trigger above is the primary
    // path, this only backfills a name if that didn't take. A failure here
    // must not undo a sign-in that already succeeded.
    if (options.onAuthenticated) {
      try {
        await options.onAuthenticated({
          userId: data.user.id,
          phone: input.phone,
          profileDraft: draft,
        });
      } catch {
        // Swallowed deliberately — see above.
      }
    }

    return {
      status: 'authenticated',
      sessionAvailable: true,
      // Derived from the intent the user expressed, not guessed from
      // timestamps on the returned user, which are not a reliable signal.
      isNewUser: input.intent === 'sign-up',
    };
  }

  function inspectChallenge(challengeId: string): ChallengeSnapshot | null {
    if (!pending || pending.id !== challengeId) return null;
    return {
      challengeId: pending.id,
      phone: pending.phone,
      intent: pending.intent,
      expiresAt: null,
      resendAvailableAt: pending.resendAvailableAt,
      // GoTrue enforces its own attempt limit; there is no local count to
      // report, and inventing one would show the user a wrong number.
      attemptsRemaining: null,
      // Structurally impossible to leak a real code here: this provider never
      // sees one.
      devCode: null,
    };
  }

  return {
    getMode: () => 'supabase',
    requestOtp,
    verifyOtp,
    resendOtp,
    inspectChallenge,
    cancelChallenge: () => {
      pending = null;
    },
  };
}
