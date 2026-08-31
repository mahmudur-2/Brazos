/**
 * THE ONE PLACE PERMITTED TO LOAD @stripe/stripe-react-native (R6a, D2).
 *
 * WHY IT IS A BOUNDARY AND NOT AN IMPORT. The same arrangement, and the same
 * two reasons, as lib/haptics.ts — one lazy, caught `require`, resolved once
 * at module scope, null on web and null when the native module is absent,
 * every use site tolerating null. A static `import` anywhere in the app
 * source tree would run the vendor's module scope on every platform, and the
 * vendor resolves its native module with `TurboModuleRegistry.getEnforcing`
 * at that moment: a binary predating the module would crash at launch, and
 * the web export (the shots harness) would die on a native-only global. The
 * fence in tests/stripePayments.test.mjs keeps the package named in this file
 * and nowhere else; there is no <StripeProvider> in App.tsx or any component
 * for the same reason — it would be a static import.
 *
 * WEB IS SHORT-CIRCUITED BEFORE THE REQUIRE, NOT AFTER IT. `Platform.OS ===
 * 'web'` decides the handle is null without calling `load()` at all.
 *
 * A BINARY THAT PREDATES THE NATIVE MODULE. `getEnforcing` throws inside the
 * require, the catch returns null, and every export here refuses with D4's one
 * honest sentence — this build cannot take card payments yet; update the app.
 * The same refusal covers a build with no publishable key.
 *
 * INITIALISATION IS LAZY: `initStripe` runs once per process, before the first
 * sheet, with the publishable key from config/env.ts and the Apple Pay
 * merchant identifier. It is a no-op when the module is null or the key is
 * absent. The sheet is initialised WITHOUT an applePay parameter (D8): the
 * processing certificate does not exist yet, so only cards are offered.
 *
 * NOTHING HERE MOVES MONEY BY ITSELF. create-payment mints the ledger row and
 * the intent; the sheet takes the card; the row reads held only when the
 * provider's webhook says so. The screen polls for that (D7) and never
 * claims it off a successful sheet.
 */

import { Platform } from 'react-native';
import { env } from '../../config/env';
import { userMessage } from '../errorMessage';
import { track } from '../observability/analytics';
import {
  validatePayoutsOnboardingResponse,
  validatePayoutsStatusResponse,
  type PayoutsOnboarding,
  type PayoutsStatus,
} from '../payments';
import { supabase } from '../supabase';
import {
  classifySheetError,
  extractInvokeError,
  validateCheckoutResponse,
  type CheckoutSession,
  type CheckoutSessionResult,
  type InvokeErrorLike,
} from './stripeRules';

export type { CheckoutSession, CheckoutSessionResult } from './stripeRules';

type SheetError = { code: string; message: string; localizedMessage?: string };

/** Only what this boundary actually calls. */
type StripeModule = {
  initStripe: (params: { publishableKey: string; merchantIdentifier?: string }) => Promise<void>;
  initPaymentSheet: (params: {
    merchantDisplayName: string;
    customerId?: string;
    customerEphemeralKeySecret?: string;
    paymentIntentClientSecret?: string;
  }) => Promise<{ error?: SheetError }>;
  presentPaymentSheet: () => Promise<{ error?: SheetError }>;
};

function load(): StripeModule | null {
  try {
    const vendor = require('@stripe/stripe-react-native') as Partial<StripeModule> | null;
    return typeof vendor?.initStripe === 'function' &&
      typeof vendor?.initPaymentSheet === 'function' &&
      typeof vendor?.presentPaymentSheet === 'function'
      ? (vendor as StripeModule)
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolved ONCE per process, and never at all on web. A native module cannot
 * appear or disappear while the app is running.
 */
const stripe: StripeModule | null = Platform.OS === 'web' ? null : load();

/** The Apple Pay merchant identifier app.config.ts declares (D8). */
export const STRIPE_MERCHANT_IDENTIFIER = 'merchant.app.brazos.mobile';
/** What the payment sheet calls the business (D17 casing). */
export const STRIPE_MERCHANT_DISPLAY_NAME = 'Brazos';
/** D4's one honest sentence for a binary without the module or a build without the key. */
export const STRIPE_UNAVAILABLE_MESSAGE =
  'This build can’t take card payments yet. Update the app to protect a payment.';
export const SHEET_UNSHOWN_MESSAGE =
  'The payment sheet could not be shown. Nothing was charged — you can try again.';

/** True when the native module loaded — false on web and on a binary predating it. */
export function stripeSdkAvailable(): boolean {
  return stripe !== null;
}

/** The publishable key from config/env.ts, or null when the build carries none. */
export function stripePublishableKey(): string | null {
  return env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}

/** Both preconditions for a card sheet on this build. */
export function stripeReady(): boolean {
  return stripeSdkAvailable() && stripePublishableKey() !== null;
}

let initialised = false;
let initialising: Promise<boolean> | null = null;

/** `initStripe` once per process, lazily, before the first sheet. */
async function ensureInitialised(): Promise<boolean> {
  if (initialised) return true;
  if (!stripe) return false;
  const key = stripePublishableKey();
  if (!key) return false;
  if (!initialising) {
    initialising = stripe
      .initStripe({ publishableKey: key, merchantIdentifier: STRIPE_MERCHANT_IDENTIFIER })
      .then(() => {
        initialised = true;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        initialising = null;
      });
  }
  return initialising;
}

/**
 * A FunctionsHttpError's body is reachable only through `error.context`, a
 * Response; read it once, as text, tolerating anything that is not one.
 */
async function readInvokeErrorBody(error: unknown): Promise<string | null> {
  const context = error && typeof error === 'object' ? (error as { context?: unknown }).context : null;
  if (!context || typeof context !== 'object') return null;
  const text = (context as { text?: unknown }).text;
  if (typeof text !== 'function') return null;
  try {
    return await (text as () => Promise<string>).call(context);
  } catch {
    return null;
  }
}

/**
 * D5 step one: invoke `create-payment` with the user's access token (the
 * client attaches it to every functions call) and body `{"jobId":"<uuid>"}`.
 * The row it mints is `unfunded` until the webhook lands. A non-2xx arrives as
 * a FunctionsHttpError whose sentence lives in the body (D6); it is read,
 * extracted and routed through userMessage(), which passes plain sentences
 * through.
 *
 * R6c (D3/D4): with `tipAmountCents` the same function mints the job's TIP
 * row instead (begin_tip_payment, as the caller) and the body carries the
 * amount — integer cents — as `tipAmountCents`. Nothing else differs: the
 * same four strings come back, and the amount the sheet charges is the tip
 * row's own charge_amount_cents, which the screen reads off the row.
 */
export async function createPaymentSession(
  jobId: string,
  options?: { tipAmountCents?: number }
): Promise<CheckoutSessionResult> {
  const tipAmountCents = options?.tipAmountCents;
  let invoked: { data: unknown; error: unknown };
  try {
    invoked = await supabase.functions.invoke('create-payment', {
      body: tipAmountCents != null ? { jobId, tipAmountCents } : { jobId },
    });
  } catch (error) {
    invoked = { data: null, error };
  }
  if (invoked.error) {
    const body = await readInvokeErrorBody(invoked.error);
    const { message } = extractInvokeError(invoked.error as InvokeErrorLike, body);
    return { data: null, error: { message: userMessage(message) } };
  }

  const session = validateCheckoutResponse(invoked.data);

  // "The customer began", not "the customer paid": this fires once the payment
  // intent exists and BEFORE the sheet is presented, so a dismissed sheet still
  // counts as a checkout started — which is the whole point of measuring it.
  // The funded/held half of the story is payment_held, and that one is the
  // webhook's to tell (lib/observability/analytics.ts).
  //
  // Job checkout only. A tip runs through this same function (R6c) but is not
  // a step in post -> bid -> accept -> fund; counting it here would inflate the
  // funding step with money that was never funding, and the event carries no
  // property that could tell the two apart.
  if (tipAmountCents == null && !session.error && session.data) {
    track({ name: 'checkout_started' });
    // ...and the id is remembered so its RESULT can be counted from the same
    // population. See jobCheckoutPaymentIds below: without this, the sibling
    // event would count tip sheets that this one deliberately does not, and
    // the pair would not divide.
    jobCheckoutPaymentIds.add(session.data.paymentId);
  }

  return session;
}

// ---------------------------------------------------------------------------
// R6c (D1) — the two Connect calls the payouts screen makes. Same shape as
// createPaymentSession: the user's token rides every functions call, a
// non-2xx arrives as a FunctionsHttpError whose sentence lives in the body,
// and the 200 body is validated field by field (lib/payments.ts). Neither
// touches the card SDK; they live here because this is the provider boundary
// and the one place that reads an invoke error's body.
// ---------------------------------------------------------------------------

/**
 * The cheap read: my_payouts_status() — the caller's own STORED state, 'none'
 * when no payout account exists. Validated through the same rule the
 * connect-status body is: a value outside the four strings is an error,
 * never a state this client makes up.
 */
export async function fetchMyPayoutsStatus(): Promise<{
  data: PayoutsStatus | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('my_payouts_status');
  if (error) return { data: null, error: { message: error.message } };
  return validatePayoutsStatusResponse({ status: data });
}

/**
 * connect-onboarding: mint (or resume) the caller's payout account and a
 * single-use hosted onboarding link. Returns the STORED status at the time of
 * the call and the url the screen opens in a system browser session. The
 * status it returns is never "enabled" by this call's doing — only
 * connect-status moves it.
 */
export async function beginPayoutsOnboarding(): Promise<{
  data: PayoutsOnboarding | null;
  error: { message: string } | null;
}> {
  let invoked: { data: unknown; error: unknown };
  try {
    invoked = await supabase.functions.invoke('connect-onboarding', { body: {} });
  } catch (error) {
    invoked = { data: null, error };
  }
  if (invoked.error) {
    const body = await readInvokeErrorBody(invoked.error);
    const { message } = extractInvokeError(invoked.error as InvokeErrorLike, body);
    return { data: null, error: { message: userMessage(message) } };
  }
  const onboarding = validatePayoutsOnboardingResponse(invoked.data);

  // Started = the client asked for the link and got one back. It says nothing
  // about whether the worker went on to finish the hosted flow; that is
  // connect_onboarding_completed, and only connect-status can answer it.
  if (!onboarding.error && onboarding.data) track({ name: 'connect_onboarding_started' });

  return onboarding;
}

/**
 * connect-status: ask the provider for the caller's payout state and record
 * it — the ONLY way payouts_status moves after onboarding (R5b D3). The
 * screen re-reads my_payouts_status() afterwards rather than trusting this
 * body alone; the returned status is the same stored value.
 */
export async function refreshPayoutsStatus(): Promise<{
  data: PayoutsStatus | null;
  error: { message: string } | null;
}> {
  let invoked: { data: unknown; error: unknown };
  try {
    invoked = await supabase.functions.invoke('connect-status', { body: {} });
  } catch (error) {
    invoked = { data: null, error };
  }
  if (invoked.error) {
    const body = await readInvokeErrorBody(invoked.error);
    const { message } = extractInvokeError(invoked.error as InvokeErrorLike, body);
    return { data: null, error: { message: userMessage(message) } };
  }
  const refreshed = validatePayoutsStatusResponse(invoked.data);

  // Completed = the on-demand refresh came back 'enabled'. Read off THIS call
  // and not off a stored payouts_enabled flag: connect-status is the only thing
  // that moves the stored state (R5b D3), so anywhere else would be reporting
  // a state someone else had already recorded.
  //
  // KNOWN, and left as it is: a worker who taps refresh twice on an already
  // enabled account emits this twice. Deduplicating would mean inventing
  // client-side state that a fresh launch would forget anyway, so the count is
  // "times a completed status was observed", not "workers onboarded".
  if (!refreshed.error && refreshed.data === 'enabled') {
    track({ name: 'connect_onboarding_completed' });
  }

  return refreshed;
}

export type SheetOutcome =
  | { outcome: 'completed' | 'dismissed'; error: null }
  | { outcome: 'failed'; error: { message: string } };

/**
 * THE PAYMENT IDS THAT BELONG TO A JOB CHECKOUT RATHER THAN A TIP.
 *
 * `CheckoutSession` carries four strings from the server and none of them says
 * which kind of payment it is, so by the time the sheet resolves this module
 * can no longer tell a funding charge from a tip. `checkout_started` already
 * excludes tips (R7C: a tip is not a step in post -> bid -> accept -> fund),
 * and `checkout_result` has to exclude exactly the same ones or the two events
 * count different populations and their ratio is meaningless — the second
 * would report a success rate above 100% on a busy tipping day.
 *
 * An id is added when `checkout_started` fires and removed when its result is
 * read, so this holds at most the sessions whose sheets have not resolved yet.
 * Both callers create a fresh session per attempt and present it once, so a
 * retry gets a new id and its own started/result pair rather than being lost.
 */
const jobCheckoutPaymentIds = new Set<string>();

/**
 * D5 steps two and three: initialise the payment sheet with the session
 * create-payment returned, then present it. `completed` means the customer
 * confirmed a card — NOT that the row is held; the screen polls for that.
 * `dismissed` is the SDK's Canceled code and is never shown as an error.
 */
export async function presentCheckoutSheet(session: CheckoutSession): Promise<SheetOutcome> {
  // THE OTHER HALF OF checkout_started, and the only place the app learns why
  // a funding attempt ended. `dismissed` is the customer closing the sheet and
  // `failed` is everything else — a card refused, the SDK unavailable, the
  // sheet never shown. Without this event those two are the same absence: a
  // checkout_started with no payment_held after it, and no way to tell someone
  // who changed their mind from someone whose card would not go through.
  //
  // Emitted through `track()` and NOT through `trackIntent()`. A money outcome
  // has a payments row behind it and can be reconciled against the database,
  // which is the one distinction the two emitters exist to preserve.
  const isJobCheckout = jobCheckoutPaymentIds.delete(session.paymentId);
  const report = (result: SheetOutcome): SheetOutcome => {
    if (isJobCheckout) {
      track({
        name: 'checkout_result',
        outcome:
          result.outcome === 'completed'
            ? 'succeeded'
            : result.outcome === 'dismissed'
              ? 'cancelled'
              : 'failed',
      });
    }
    return result;
  };

  if (!stripe || !(await ensureInitialised())) {
    return report({ outcome: 'failed', error: { message: STRIPE_UNAVAILABLE_MESSAGE } });
  }
  try {
    const initialisedSheet = await stripe.initPaymentSheet({
      merchantDisplayName: STRIPE_MERCHANT_DISPLAY_NAME,
      customerId: session.customerId,
      customerEphemeralKeySecret: session.ephemeralKeySecret,
      paymentIntentClientSecret: session.clientSecret,
    });
    if (initialisedSheet.error) {
      const classified = classifySheetError(initialisedSheet.error);
      return report(
        classified.outcome === 'dismissed'
          ? { outcome: 'dismissed', error: null }
          : { outcome: 'failed', error: { message: userMessage(classified.message) } }
      );
    }
    const presented = await stripe.presentPaymentSheet();
    if (presented.error) {
      const classified = classifySheetError(presented.error);
      return report(
        classified.outcome === 'dismissed'
          ? { outcome: 'dismissed', error: null }
          : { outcome: 'failed', error: { message: userMessage(classified.message) } }
      );
    }
    return report({ outcome: 'completed', error: null });
  } catch {
    return report({ outcome: 'failed', error: { message: SHEET_UNSHOWN_MESSAGE } });
  }
}
