import { supabase } from '../supabase';
import { updateProfile } from '../profiles';
import { PHONE_AUTH_MESSAGES } from './errors';
import { createMockPhoneAuthProvider } from './mock';
import { resolvePhoneAuthMode } from './mode';
import { createSupabasePhoneAuthProvider } from './supabase';
import type { ChallengeSnapshot, PhoneAuthProvider, RequestOtpResult } from './types';

/**
 * The one phone-auth provider the app uses, chosen once at module load.
 *
 * This is the only file in the boundary that touches React Native or the
 * Supabase client; ./mock.ts, ./supabase.ts, ./mode.ts and ./errors.ts are
 * pure so the tests can execute them directly.
 *
 * Screens import `phoneAuth` and never branch on the mode themselves — the
 * only thing a screen is allowed to ask is `phoneAuth.getMode() === 'mock'`,
 * and only to decide whether to render the development code banner.
 */

const resolution = resolvePhoneAuthMode({
  configured: process.env.EXPO_PUBLIC_PHONE_AUTH_MODE,
  dev: __DEV__,
});

export const phoneAuthMode = resolution.mode;

/**
 * Set when EXPO_PUBLIC_PHONE_AUTH_MODE was rejected — most importantly, a
 * release build asking for the mock provider. Shown to the user in place of
 * the generic "not switched on yet" copy, so a misconfigured build is
 * diagnosable from the screen instead of looking like a dead button.
 */
export const phoneAuthConfigError = resolution.configError;

/**
 * The fail-closed provider. Every entry point answers the same way, so a
 * disabled build can't half-work: the phone screens still validate the number
 * for real and then point at the path that does authenticate.
 */
function createDisabledPhoneAuthProvider(message: string): PhoneAuthProvider {
  const refuse = async (): Promise<RequestOtpResult> => ({
    status: 'provider-disabled',
    message,
  });

  return {
    getMode: () => 'disabled',
    requestOtp: refuse,
    resendOtp: refuse,
    verifyOtp: async () => ({
      status: 'error',
      code: 'provider-disabled',
      message,
    }),
    inspectChallenge: (): ChallengeSnapshot | null => null,
    cancelChallenge: () => {},
  };
}

function createProvider(): PhoneAuthProvider {
  switch (resolution.mode) {
    case 'mock':
      return createMockPhoneAuthProvider();
    case 'supabase':
      return createSupabasePhoneAuthProvider(supabase.auth, {
        // Runs with the authenticated user's own id, after a real session
        // exists — the belt-and-suspenders half of the same pattern
        // AuthContext.signUp already uses for email signup.
        onAuthenticated: async ({ userId, phone, profileDraft }) => {
          const patch = {
            phone,
            ...(profileDraft?.fullName ? { full_name: profileDraft.fullName } : {}),
          };
          await updateProfile(userId, patch);
        },
      });
    default:
      return createDisabledPhoneAuthProvider(
        resolution.configError ?? PHONE_AUTH_MESSAGES['provider-disabled']
      );
  }
}

export const phoneAuth = createProvider();

export { PHONE_AUTH_MESSAGES } from './errors';
export {
  MAX_VERIFY_ATTEMPTS,
  OTP_LENGTH,
  RESEND_COOLDOWN_MS,
  isOtpToken,
} from './types';
export type {
  ChallengeSnapshot,
  PhoneAuthErrorCode,
  PhoneAuthIntent,
  PhoneAuthMode,
  PhoneAuthProvider,
  PhoneProfileDraft,
  RequestOtpResult,
  VerifyOtpResult,
} from './types';
