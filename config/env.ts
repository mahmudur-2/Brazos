import { z } from 'zod';

/**
 * THE ONE PLACE THE APP READS ITS ENVIRONMENT.
 *
 * Every runtime setting the binary needs arrives as an `EXPO_PUBLIC_*`
 * variable, is read here exactly once, and is validated before anything else
 * imports it. Nothing downstream calls `process.env` for app configuration;
 * it imports `env` and gets a value whose shape TypeScript already knows.
 *
 * WHY THE READS ARE WRITTEN OUT ONE BY ONE, and it is not a style choice.
 * Metro substitutes `process.env.EXPO_PUBLIC_X` textually at bundle time. It
 * matches a STATIC member expression and nothing else, so `process.env[name]`,
 * a destructure, or a loop over a list of names all survive the transform as
 * a lookup against an object that does not exist on a device. Each variable
 * therefore gets its own literal line below. Adding one means adding a line,
 * never a shorter expression.
 *
 * WHAT "PUBLIC" MEANS HERE. Inlining puts every one of these strings in the
 * shipped bundle in plain text. That is fine for a publishable key and a
 * project URL, which are meant to be handed to clients and are protected by
 * RLS at the other end; it is never acceptable for a service-role key or any
 * other secret. A secret belongs in an EAS build-time variable that never
 * carries the EXPO_PUBLIC_ prefix.
 *
 * WHY THIS FILE THROWS. A malformed environment used to surface as whatever
 * the first broken call happened to be — a client constructed against
 * `undefined`, a fetch to "undefined/rest/v1", a 400 nobody could place. The
 * parse below turns all of that into one error at startup that NAMES THE
 * FIELD. That is also exactly why app.config.ts must never import this
 * module: the app config is evaluated by `expo start`, `expo export` and every
 * EAS build, and a throw there breaks all three rather than one screen.
 *
 * NOT A FEATURE-FLAG TABLE. lib/featureFlags.ts is the compile-time flag
 * surface and lib/remoteConfig.ts is the server-driven one. This file is
 * deployment configuration only: which project, which mode, which keys.
 */

/**
 * An unset EXPO_PUBLIC_ variable inlines as `undefined`, but an EAS
 * environment variable that exists with no value inlines as the empty string,
 * and `''` is not a missing value to zod — it is a string that fails every
 * format check. Both spellings of "not configured" are normalised to one
 * before the schema sees them, so a blank row in the EAS UI reads as absent
 * rather than as invalid.
 */
const unset = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value;

const EnvSchema = z.object({
  /** Which build this is. Decides `isProduction` and nothing else here. */
  EXPO_PUBLIC_APP_VARIANT: z
    .enum(['development', 'preview', 'production'])
    .default('development'),

  /** The project the client talks to. Required: there is no useful default. */
  EXPO_PUBLIC_SUPABASE_URL: z.url(),

  /**
   * The publishable anon key. Length is the only cheap check that
   * distinguishes a real key from a placeholder someone left in a profile.
   */
  EXPO_PUBLIC_SUPABASE_KEY: z.string().min(20),

  /**
   * Declared, never inferred from the build type. Note that the SHAPE
   * accepted here is deliberately wider than the BEHAVIOUR
   * lib/adapters/paymentsMode.ts implements: 'stripe' parses as a legal value
   * and the resolver still fails closed on it, because a real provider is not
   * wired. The schema says what may be written; the resolver says what runs.
   */
  EXPO_PUBLIC_PAYMENTS_MODE: z.enum(['sandbox', 'stripe', 'disabled']).default('disabled'),

  /** Publishable only. A secret key here would ship in the bundle. */
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),

  /** Absent means crash reporting is off, which is a valid configuration. */
  EXPO_PUBLIC_SENTRY_DSN: z.url().optional(),

  /** Absent means product analytics is off, which is a valid configuration. */
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),

  /** Which phone-auth backend the OTP flow uses. Mock until the real one is on. */
  EXPO_PUBLIC_PHONE_AUTH_MODE: z.enum(['mock', 'supabase']).default('mock'),
});

const parsed = EnvSchema.safeParse({
  EXPO_PUBLIC_APP_VARIANT: unset(process.env.EXPO_PUBLIC_APP_VARIANT),
  EXPO_PUBLIC_SUPABASE_URL: unset(process.env.EXPO_PUBLIC_SUPABASE_URL),
  EXPO_PUBLIC_SUPABASE_KEY: unset(process.env.EXPO_PUBLIC_SUPABASE_KEY),
  EXPO_PUBLIC_PAYMENTS_MODE: unset(process.env.EXPO_PUBLIC_PAYMENTS_MODE),
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: unset(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  EXPO_PUBLIC_SENTRY_DSN: unset(process.env.EXPO_PUBLIC_SENTRY_DSN),
  EXPO_PUBLIC_POSTHOG_KEY: unset(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  EXPO_PUBLIC_PHONE_AUTH_MODE: unset(process.env.EXPO_PUBLIC_PHONE_AUTH_MODE),
});

if (!parsed.success) {
  // Name every failing field, because the point of failing here rather than
  // at the first broken call is that the message says what to go and set.
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(config)'}: ${issue.message}`)
    .join('; ');
  throw new Error(
    `Invalid app configuration — ${detail}. These are EXPO_PUBLIC_ variables ` +
      'inlined at bundle time: set them in the EAS build profile or a local ' +
      '.env and rebuild, because changing one never takes effect without a new bundle.'
  );
}

/** The validated environment. Import this; never read process.env elsewhere. */
export const env = parsed.data;

/** True only on a production build, and only because the variant says so. */
export const isProduction = env.EXPO_PUBLIC_APP_VARIANT === 'production';
