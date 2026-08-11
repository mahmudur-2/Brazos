/**
 * Payments-mode resolution, pure — no React Native, no Supabase — so
 * tests/sandboxCheckout.test.mjs executes it directly instead of asserting
 * about it as text. The lib/phoneAuth/mode.ts pattern, applied to money.
 */

export type PaymentsMode = 'sandbox' | 'disabled';

export type PaymentsModeResolution = {
  mode: PaymentsMode;
  configError: string | null;
};

/**
 * Default: sandbox in dev, disabled in a release binary. A RELEASE build may
 * not request sandbox: fabricated payment state in a production app is
 * exactly the §H.3 mislabeling this boundary exists to prevent, so the
 * request is refused and surfaced as a config error instead of honored.
 */
export function resolvePaymentsMode({
  configured,
  dev,
}: {
  configured: string | undefined | null;
  dev: boolean;
}): PaymentsModeResolution {
  const fallback: PaymentsMode = dev ? 'sandbox' : 'disabled';
  if (configured == null || configured === '') {
    return { mode: fallback, configError: null };
  }
  if (configured === 'disabled') {
    return { mode: 'disabled', configError: null };
  }
  if (configured === 'sandbox') {
    if (!dev) {
      return {
        mode: 'disabled',
        configError:
          'This build requested sandbox payments in a release binary. Sandbox money is a development surface; payments stay off.',
      };
    }
    return { mode: 'sandbox', configError: null };
  }
  return {
    mode: fallback,
    configError: `Unknown EXPO_PUBLIC_PAYMENTS_MODE "${configured}".`,
  };
}
