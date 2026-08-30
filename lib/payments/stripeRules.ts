/**
 * The pure half of the card-payment path (R6a, D24): the checkout poll's
 * terminal-state classifier, the create-payment response validator, the
 * edge-function error extractor and the sheet-outcome rule — in a module
 * with NO runtime imports, the lib/earningsMath.ts arrangement, so
 * tests/stripePayments.test.mjs EXECUTES every rule under node instead of
 * pattern-matching it as text. lib/payments/stripe.ts owns the SDK and the
 * network; this file owns the rules it applies.
 */

// ---------------------------------------------------------------------------
// D7 — the poll
// ---------------------------------------------------------------------------

/** Every 2 seconds, up to 30 seconds. */
export const CHECKOUT_POLL_INTERVAL_MS = 2_000;
export const CHECKOUT_POLL_TIMEOUT_MS = 30_000;

export type CheckoutPollState = 'held' | 'gone' | 'pending';

/**
 * D7's three terminal branches, decided from one read of the ledger row:
 *   'held'    — the provider's webhook landed; the row reads held. Success.
 *   'gone'    — fetchJobPayment filters failed and voided, so a row that was
 *               seen and is now null IS the failed/voided signal; a row that
 *               reads failed or voided outright says the same thing.
 *   'pending' — anything else. Keep polling until the deadline; the deadline
 *               itself is the screen's third branch, not a classifier state.
 *
 * `seen` is initialised true from the paymentId create-payment returned — a
 * row that never existed is not "gone", it is not yet there.
 */
export function classifyCheckoutPoll({
  status,
  seen,
}: {
  status: string | null | undefined;
  seen: boolean;
}): CheckoutPollState {
  if (status === 'held') return 'held';
  if (status === 'failed' || status === 'voided') return 'gone';
  if (status == null) return seen ? 'gone' : 'pending';
  return 'pending';
}

// ---------------------------------------------------------------------------
// D4 / D5 — the create-payment response
// ---------------------------------------------------------------------------

export type CheckoutSession = {
  paymentId: string;
  clientSecret: string;
  customerId: string;
  ephemeralKeySecret: string;
};

export const CHECKOUT_SESSION_KEYS = [
  'paymentId',
  'clientSecret',
  'customerId',
  'ephemeralKeySecret',
] as const;

export const CHECKOUT_RESPONSE_MALFORMED =
  'The payment could not be started — the server’s reply was incomplete. Nothing was charged.';

export type CheckoutSessionResult =
  | { data: CheckoutSession; error: null }
  | { data: null; error: { message: string } };

/**
 * The edge function's JSON → four non-empty strings, or an error. Nothing is
 * defaulted: a sheet initialised with a missing secret fails inside the SDK
 * with a sentence nobody wrote for a user, so the shape is refused here.
 */
export function validateCheckoutResponse(payload: unknown): CheckoutSessionResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { data: null, error: { message: CHECKOUT_RESPONSE_MALFORMED } };
  }
  const record = payload as Record<string, unknown>;
  const session: Partial<CheckoutSession> = {};
  for (const key of CHECKOUT_SESSION_KEYS) {
    const value = record[key];
    if (typeof value !== 'string' || value.trim() === '') {
      return { data: null, error: { message: CHECKOUT_RESPONSE_MALFORMED } };
    }
    session[key] = value;
  }
  return { data: session as CheckoutSession, error: null };
}

// ---------------------------------------------------------------------------
// D6 — the edge function's error, as the user should read it
// ---------------------------------------------------------------------------

/** The shape supabase.functions.invoke hands back on failure. */
export type InvokeErrorLike =
  | { name?: unknown; message?: unknown; context?: unknown }
  | null
  | undefined;

/** The raw sentence a FunctionsHttpError carries. It never reaches a user. */
export const INVOKE_ERROR_RAW = 'Edge Function returned a non-2xx status code';

export const INVOKE_UNREACHABLE =
  'Could not reach the payment service. Check your connection and try again.';
export const INVOKE_RELAY_DOWN =
  'The payment service is unavailable right now. Try again shortly.';

/** The HTTP status off `error.context` (a Response), or null when absent. */
export function invokeErrorStatus(error: InvokeErrorLike): number | null {
  const context = error && typeof error === 'object' ? error.context : null;
  const status =
    context && typeof context === 'object' ? (context as { status?: unknown }).status : null;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

/**
 * The server's own sentence from a `{"error":"<text>"}` body — the body as
 * text, or already parsed — or null when the body is anything else.
 */
export function serverErrorSentence(body: unknown): string | null {
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const text = (parsed as { error?: unknown }).error;
  return typeof text === 'string' && text.trim() !== '' ? text.trim() : null;
}

/**
 * When the body carried no sentence, one per status class — the codes
 * create-payment actually returns (400 the RPC's refusals, 401 no session,
 * 409 no usable amount yet, 502 provider unavailable, 500 unhandled).
 */
export function fallbackSentenceForStatus(status: number | null): string {
  switch (status) {
    case 400:
      return 'The payment request was refused. Nothing was charged.';
    case 401:
      return 'Sign in to protect a payment.';
    case 409:
      return 'This payment has no amount to charge yet.';
    case 502:
      return 'The payment provider is unavailable right now.';
    default:
      return 'Could not start this payment. Nothing was charged.';
  }
}

/**
 * The one sentence for an invoke failure. A FunctionsHttpError's body is
 * reachable only through `error.context` and only asynchronously, so the
 * caller reads it first and passes it here; this function stays pure.
 */
export function extractInvokeError(
  error: InvokeErrorLike,
  body: unknown
): { status: number | null; message: string } {
  const name = error && typeof error === 'object' ? String(error.name ?? '') : '';
  if (name === 'FunctionsFetchError') return { status: null, message: INVOKE_UNREACHABLE };
  if (name === 'FunctionsRelayError') return { status: null, message: INVOKE_RELAY_DOWN };
  const status = invokeErrorStatus(error);
  return { status, message: serverErrorSentence(body) ?? fallbackSentenceForStatus(status) };
}

// ---------------------------------------------------------------------------
// D5 — the sheet's outcome
// ---------------------------------------------------------------------------

/** The SDK's PaymentSheetError.Canceled — the customer closed the sheet. */
export const SHEET_CANCELED_CODE = 'Canceled';

export const SHEET_FAILED_FALLBACK =
  'The card could not be charged. Nothing was taken — you can try again.';

export type SheetErrorLike = {
  code?: unknown;
  message?: unknown;
  localizedMessage?: unknown;
} | null | undefined;

/**
 * A dismissed sheet is not an error and must never render as one (D5): the
 * row stays unfunded and the screen returns to its CTA. Anything else is a
 * failure carrying the provider's own sentence when it has one.
 */
export function classifySheetError(
  error: SheetErrorLike
): { outcome: 'dismissed' } | { outcome: 'failed'; message: string } {
  if (error && typeof error === 'object' && error.code === SHEET_CANCELED_CODE) {
    return { outcome: 'dismissed' };
  }
  const localized =
    error && typeof error === 'object' && typeof error.localizedMessage === 'string'
      ? error.localizedMessage.trim()
      : '';
  const plain =
    error && typeof error === 'object' && typeof error.message === 'string'
      ? error.message.trim()
      : '';
  return { outcome: 'failed', message: localized || plain || SHEET_FAILED_FALLBACK };
}
