/**
 * Payments-mode resolution, pure - no React Native, no Supabase - so
 * tests/paymentsMode.test.mjs, tests/sandboxCheckout.test.mjs and
 * tests/stripePayments.test.mjs execute it directly instead of asserting
 * about it as text. The lib/phoneAuth/mode.ts pattern, applied to money.
 */

export type PaymentsMode = 'sandbox' | 'stripe' | 'disabled';

export type PaymentsModeResolution = {
  mode: PaymentsMode;
  configError: string | null;
};

/**
 * Availability is DECLARED by EXPO_PUBLIC_PAYMENTS_MODE. It is not inferred
 * from the build type.
 *
 * WHY THIS CHANGED (Stage 4A). The previous rule refused 'sandbox' whenever
 * __DEV__ was false, so a release binary had no payments at all: checkout,
 * release, tip and cash-out were dead on exactly the TestFlight build the
 * beta has to be exercised on. The beta runs on clearly-labelled simulated
 * money, so the build type was the wrong thing to gate on.
 *
 * THE TABLE - and it is an ALLOW-LIST:
 *
 *   'sandbox'                   -> sandbox
 *   'stripe'                    -> stripe   (R6a, D1)
 *   'disabled'                  -> disabled
 *   unset / empty / whitespace  -> dev ? sandbox : disabled
 *   anything else               -> disabled, with the reason surfaced
 *
 * The last row is the whole point of an allow-list: a typo, a stale value, or
 * a mode from some future build this one does not understand all fail CLOSED.
 * Matching a block-list of known-bad values instead would fail OPEN on the
 * one value nobody thought to list.
 *
 * THREE MODES COEXIST (R6a). 'sandbox' is the TestFlight beta's simulated
 * ledger and stays exactly as it was. 'stripe' is the card path: the ledger
 * row is minted by the create-payment edge function, the card is taken by the
 * provider's payment sheet through lib/payments/stripe.ts, and the row reads
 * held only when the provider's webhook says so. There is still deliberately
 * no 'live', 'real' or 'production' value: which provider account a build
 * talks to is the publishable key's business, never a mode word.
 *
 * The unset row reproduces the previous default exactly, so a build that
 * declares nothing behaves as it did before this change.
 */
export function resolvePaymentsMode({
  configured,
  dev,
}: {
  configured: string | undefined | null;
  dev: boolean;
}): PaymentsModeResolution {
  const raw = (configured ?? '').trim().toLowerCase();

  if (raw === '') {
    return { mode: dev ? 'sandbox' : 'disabled', configError: null };
  }
  if (raw === 'sandbox') {
    return { mode: 'sandbox', configError: null };
  }
  if (raw === 'stripe') {
    return { mode: 'stripe', configError: null };
  }
  if (raw === 'disabled') {
    return { mode: 'disabled', configError: null };
  }
  return {
    mode: 'disabled',
    configError: `Unrecognized EXPO_PUBLIC_PAYMENTS_MODE "${configured}". Payments stay off.`,
  };
}
