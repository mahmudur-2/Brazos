import { env } from '../../config/env';

/**
 * PRODUCT ANALYTICS — a closed typed union and two no-op-safe functions.
 *
 * THE ONE NUMBER THAT DECIDES WHETHER THIS MARKETPLACE LIVES IS BIDS PER JOB,
 * and that is why the worker side of the funnel is here in as much detail as
 * the customer side. An event list that tracks only what a customer does can
 * tell you that jobs are being posted and nothing about whether anyone is
 * answering them. `offer_sent.secondsSincePosted` is the leading indicator of
 * the same quantity: time to first bid.
 *
 * WHY A UNION AND NOT A STRING. Every event name and every property is a
 * compile-time literal, so a typo is a build error rather than a silent second
 * funnel that looks empty. There is deliberately NO free-text property — a
 * free-text field is where a job title, an address or a message body ends up
 * on a third party's servers by accident. Money, where it appears at all, is
 * integer cents, the same as everywhere else in this codebase.
 *
 * EVENTS ARE EMITTED FROM THE MUTATION LAYER AND NOWHERE ELSE. R7C gave nine
 * of the fourteen their call sites — one per state change, inside the `lib/`
 * function that wraps the write that causes it, on that write's success branch
 * and never on a refusal. Emitting from screens produces double-counts the
 * moment two screens can trigger the same mutation, and misses every path that
 * does not go through a screen at all; `tests/analyticsPrivacy.test.mjs` holds
 * that rule mechanically — a `track(` outside `lib/` or `modes/` fails the
 * suite, as does a funnel property typed as free text.
 *
 * THE VENDOR IS A CAUGHT REQUIRE for the reason set out in
 * lib/observability/sentry.ts: the screenshot harness renders through
 * `expo export --platform web`, and a static import that throws at module
 * evaluation would take the harness down rather than degrade. Absent vendor or
 * absent key means `client` is null and both functions do nothing.
 */

export type FunnelEvent =
  // customer side
  | { name: 'job_posted'; category: string; hasBudget: boolean }
  | { name: 'offer_accepted' }
  | { name: 'checkout_started' }
  // Webhook-caused — DO NOT wire from the client. Stripe lands this while the
  // app may be backgrounded or killed, so a client caller under-counts silently.
  | { name: 'payment_held'; amountCents: number }
  // Webhook-caused — DO NOT wire from the client, for the same reason.
  | { name: 'payment_released'; reason: 'approved' | 'auto_approved' }
  | { name: 'review_left'; stars: number }
  // worker side — the numbers that say whether the marketplace has a supply side
  | { name: 'worker_onboarded' }
  | { name: 'job_viewed'; source: 'nearby' | 'map' | 'search' | 'push' }
  | { name: 'offer_sent'; kind: 'bid' | 'direct'; secondsSincePosted: number }
  | { name: 'bid_viewed' }
  | { name: 'job_completed'; hasEvidencePhoto: boolean }
  | { name: 'connect_onboarding_started' }
  | { name: 'connect_onboarding_completed' }
  // both
  | { name: 'mode_switched'; to: 'customer' | 'worker' };

/**
 * The US cloud ingest host. Written out rather than made configurable: a
 * misconfigured analytics host is a silent data loss, and there is one
 * project.
 */
const POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * The three methods this module uses, declared locally so the file resolves
 * with the package absent. Verified against the installed posthog-react-native
 * 4.66.0: `capture`, `identify` and `reset` are all SYNCHRONOUS and the
 * constructor is `new PostHog(apiKey, options)` — there is no async
 * initialisation step to await in this major.
 */
type PostHogLike = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
};

type PostHogConstructor = new (apiKey: string, options?: { host?: string }) => PostHogLike;

/**
 * The installed package exports the class BOTH as a named `PostHog` and as its
 * default. Both spellings are tried rather than one being assumed, because
 * which of the two a bundler hands back through `require` depends on interop
 * settings this module does not control.
 */
function loadPostHog(): PostHogConstructor | null {
  try {
    const vendor = require('posthog-react-native') as {
      PostHog?: PostHogConstructor;
      default?: PostHogConstructor;
    } | null;
    return vendor?.PostHog ?? vendor?.default ?? null;
  } catch {
    return null;
  }
}

/**
 * Null whenever the vendor is absent or no key is configured. An absent key
 * means product analytics is off, which config/env.ts documents as a valid
 * configuration. The construction itself is caught as well: a constructor that
 * throws on an unexpected runtime must degrade to "no analytics", never take
 * the app's first frame with it.
 */
function createClient(): PostHogLike | null {
  const PostHog = loadPostHog();
  const key = env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!PostHog || !key) return null;
  try {
    return new PostHog(key, { host: POSTHOG_HOST });
  } catch {
    return null;
  }
}

const client: PostHogLike | null = createClient();

/**
 * Emit one funnel event. A no-op when there is no client, and never throws:
 * analytics is the least important thing the app does and must never be able
 * to break the thing it is measuring.
 */
export function track(event: FunnelEvent): void {
  if (!client) return;
  const { name, ...props } = event;
  // "Never throws" was a claim about the sentence above and not about the code
  // until R7C, which put these calls on the money path — inside createJob,
  // createMarketplaceOffer, acceptOffer and createPaymentSession. A vendor
  // exception escaping here would fail the write that emitted it. Swallowed,
  // deliberately: a lost event is a lost event, a thrown one is a lost job.
  try {
    client.capture(name, props);
  } catch {
    // Nothing to report to: reporting an analytics failure through analytics is
    // the same call again, and Sentry is not told about a metric it cannot fix.
  }
}

/**
 * Bind or unbind the analytics identity. The id and nothing else — the same
 * rule as `setSentryUser`, for the same reason. A null id is a sign-out and
 * resets the distinct id so the next session is not attributed to the person
 * who just left.
 */
export function identify(userId: string | null): void {
  if (!client) return;
  // Same gap, same fix as track(): this one runs from AuthContext, so a vendor
  // exception here would break sign-in rather than a write.
  try {
    if (userId) client.identify(userId);
    else client.reset();
  } catch {
    // Deliberately silent — see track().
  }
}
