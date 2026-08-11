import type { PhoneAuthMode } from './types';

/**
 * Which phone-auth implementation this build is allowed to use.
 *
 * One resolver, one variable: EXPO_PUBLIC_PHONE_AUTH_MODE. It is read through
 * `process.env` (inlined by babel-preset-expo at bundle time) rather than
 * through the `@env` module, because a value that decides whether a *mock*
 * credential path is reachable should be pinned to the build, not to whatever
 * .env happens to be on the machine that ran the bundler.
 *
 * The rule that matters: mock mode is impossible outside development. A
 * release build configured as mock does not quietly fall back to a working
 * flow — it resolves to `disabled` and reports the misconfiguration, so the
 * failure is visible and no one can be verified by a code the client made up.
 */

export type PhoneAuthEnvironment = {
  /** Raw EXPO_PUBLIC_PHONE_AUTH_MODE. Undefined when it isn't set. */
  configured?: string;
  /** React Native's `__DEV__`. Passed in so this stays a pure function. */
  dev: boolean;
};

export type PhoneAuthModeResolution = {
  mode: PhoneAuthMode;
  /**
   * Set when the configured value was rejected. Surfaced to the user as the
   * provider-disabled message, so a broken release says why instead of
   * looking like a dead button.
   */
  configError: string | null;
};

export function resolvePhoneAuthMode(env: PhoneAuthEnvironment): PhoneAuthModeResolution {
  const raw = (env.configured ?? '').trim().toLowerCase();

  // Unset: on in development so the flow is always testable, off everywhere
  // else so shipping without deciding can never expose a mock code path.
  if (!raw) {
    return { mode: env.dev ? 'mock' : 'disabled', configError: null };
  }

  if (raw === 'mock') {
    if (!env.dev) {
      return {
        mode: 'disabled',
        configError:
          'Phone sign-in is switched off: this build is configured for the ' +
          'development-only mock provider, which cannot run in a release.',
      };
    }
    return { mode: 'mock', configError: null };
  }

  // Never inferred from the presence of a Supabase URL/key — the project has
  // those already and Phone Auth still isn't provisioned. Only an explicit
  // opt-in turns the real provider on.
  if (raw === 'supabase') {
    return { mode: 'supabase', configError: null };
  }

  if (raw === 'disabled') {
    return { mode: 'disabled', configError: null };
  }

  return {
    mode: 'disabled',
    configError:
      `Phone sign-in is switched off: "${env.configured}" is not a recognised ` +
      'value for EXPO_PUBLIC_PHONE_AUTH_MODE (expected mock, supabase or disabled).',
  };
}
