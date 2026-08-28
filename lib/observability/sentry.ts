import { env } from '../../config/env';

/**
 * CRASH REPORTING, AND THE SCRUBBER THAT IS THE POINT OF THE MODULE.
 *
 * Nothing here is interesting except `beforeSend`. A Supabase/PostgREST
 * failure does not carry the row it failed on in the event MESSAGE — it
 * carries it in the exception VALUE and in `extra`, which is why an earlier
 * revision of this design that scrubbed only the message and the breadcrumbs
 * would have shipped every leak it was written to stop. Five surfaces are
 * scrubbed and a sixth is deleted outright; see `scrubEvent`.
 *
 * THE VENDOR IS A CAUGHT REQUIRE, NEVER A STATIC IMPORT, and that is
 * load-bearing rather than stylistic. The screenshot harness renders the app
 * through `expo export --platform web`, and whether @sentry/react-native
 * survives that export is not known. A static import that throws at module
 * evaluation would take down the harness — the UI gate every later run depends
 * on — instead of degrading. A caught require resolves to null and every use
 * site here does nothing. It is also the established shape in this tree:
 * lib/secureSessionStorage.ts, lib/motion120/vendor.ts and
 * lib/designStudioGate.ts all load their native packages exactly this way.
 *
 * CONSEQUENCE FOR CONSUMERS: `Sentry` below is `SentryLike | null` and callers
 * must treat it as such. App.tsx never calls `Sentry.wrap` directly — it calls
 * `wrapApp`, which returns the component untouched when the vendor is absent.
 *
 * NOT WIRED HERE: lib/errorMessage.ts deliberately adds no breadcrumb. That
 * file has NO imports so tests/errorMessage.test.mjs can execute it directly
 * under bare node, and importing this module would take the whole test file
 * down at load. If a future run wants the PostgREST code on the breadcrumb
 * trail, it must arrive by dependency injection — an exported observer setter
 * that errorMessage.ts calls — never by an import.
 */

/**
 * The shape this module actually uses, declared locally rather than imported
 * from the package. Importing the vendor's types would be a value import in
 * every build that has no `import type` to hide behind, and the point of the
 * seam is that this file resolves with the package absent.
 */
type SentryLike = {
  init: (options: Record<string, unknown>) => void;
  setTag: (key: string, value: string) => void;
  setUser: (user: { id: string } | null) => void;
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void;
  wrap?: <T>(component: T) => T;
};

/** Only the fields `scrubEvent` touches. Everything else passes through. */
export type SentryEvent = {
  message?: string;
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
  exception?: { values?: Array<{ value?: string }> };
  extra?: Record<string, unknown>;
  request?: { data?: unknown };
};

type UpdatesModule = {
  updateId?: string | null;
  channel?: string | null;
  runtimeVersion?: string | null;
};

function loadSentry(): SentryLike | null {
  try {
    return require('@sentry/react-native') as SentryLike;
  } catch {
    return null;
  }
}

function loadUpdates(): UpdatesModule | null {
  try {
    return require('expo-updates') as UpdatesModule;
  } catch {
    return null;
  }
}

/**
 * The loaded module, or null on any runtime that cannot load it — a web
 * export, a binary without the native side, a bare-node import. Exported as
 * the nullable value it is, so no consumer can assume it exists.
 */
export const Sentry: SentryLike | null = loadSentry();

/**
 * Email addresses and phone numbers. Deliberately greedy on the phone side:
 * a false positive redacts a number out of a stack trace, a false negative
 * ships a customer's phone number to a third party.
 */
const PII = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{8,}\d/g;

const scrub = (value: string): string => value.replace(PII, '[redacted]');

/**
 * Recursive scrub with a depth cap. The cap is not an optimisation: `extra`
 * and breadcrumb `data` are arbitrary attacker- and ORM-shaped objects, and a
 * cyclic or pathologically deep one would otherwise recurse until the stack
 * goes. Past the cap the value is replaced rather than kept, so depth can
 * never become a way to smuggle an unscrubbed string out.
 */
function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map((entry) => scrubDeep(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        scrubDeep(entry, depth + 1),
      ])
    );
  }
  return value;
}

/**
 * EVERY SURFACE AN EVENT CAN CARRY PII ON. Five are scrubbed and the sixth is
 * deleted:
 *
 *   1. `message`              — the formatted error string.
 *   2. breadcrumb `message`   — the trail of what happened before the crash.
 *   3. breadcrumb `data`      — arbitrary objects, so deep-scrubbed.
 *   4. `exception.values[].value` — where a PostgREST error puts row data.
 *   5. `extra`                — the other place it puts row data.
 *   6. `request.data`         — the request BODY. Not scrubbed but DELETED:
 *                               it is a serialised payload whose useful
 *                               content is exactly the part that must not
 *                               leave the device, so there is nothing worth
 *                               keeping a redacted skeleton of.
 *
 * Exported so the fence can name it; it is not called from anywhere but the
 * `beforeSend` hook below.
 */
export function scrubEvent(event: SentryEvent): SentryEvent {
  if (event.message) event.message = scrub(event.message);

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: crumb.message === undefined ? undefined : scrub(crumb.message),
      data: crumb.data ? (scrubDeep(crumb.data) as Record<string, unknown>) : crumb.data,
    }));
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((value) => ({
      ...value,
      value: value.value === undefined ? undefined : scrub(value.value),
    }));
  }

  if (event.extra) event.extra = scrubDeep(event.extra) as Record<string, unknown>;

  if (event.request) delete event.request.data;

  return event;
}

/**
 * Called once, at App.tsx module scope, before any component is defined.
 *
 * Returns without doing anything when the vendor is absent OR when no DSN is
 * configured — an absent DSN means crash reporting is off, which config/env.ts
 * documents as a valid configuration rather than a misconfiguration.
 */
export function initSentry(): void {
  if (!Sentry) return;

  const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: env.EXPO_PUBLIC_APP_VARIANT,
    // Never. This is the switch that would attach IP address, username and
    // email to every event server-side, which is precisely what `scrubEvent`
    // spends its whole body removing client-side.
    sendDefaultPii: false,
    enableAutoSessionTracking: true,
    // Full tracing everywhere except the build that has real users on it.
    tracesSampleRate: env.EXPO_PUBLIC_APP_VARIANT === 'production' ? 0.1 : 1,
    beforeSend: (event: SentryEvent) => scrubEvent(event),
  });

  // WHICH BINARY AND WHICH UPDATE. Without these, a stack trace names a
  // release but not the OTA update actually running inside it, and an update
  // that only breaks on one channel is unattributable. expo-updates is loaded
  // the same caught way — on a web export it is absent and all three fall
  // back to their literals rather than throwing.
  const updates = loadUpdates();
  Sentry.setTag('updateId', updates?.updateId ?? 'embedded');
  Sentry.setTag('channel', updates?.channel ?? 'none');
  Sentry.setTag('runtimeVersion', updates?.runtimeVersion ?? 'unknown');
}

/**
 * THE ID AND NOTHING ELSE. Sentry's user object also accepts email, username
 * and ip_address; passing any of them would undo the scrubber one field at a
 * time. A user id is already a random UUID that means nothing outside the
 * database, which is the whole reason it is the safe thing to send.
 */
export function setSentryUser(id: string | null): void {
  Sentry?.setUser(id ? { id } : null);
}

/**
 * `Sentry.wrap(App)` when the vendor and its `wrap` both exist, and the
 * component untouched otherwise.
 *
 * App.tsx calls this instead of `Sentry.wrap` so that the null case lives in
 * exactly one place. `wrap` is invoked through `.call` because it is read off
 * the module object and would otherwise lose its receiver.
 */
export function wrapApp<T>(App: T): T {
  const wrap = Sentry?.wrap;
  if (!Sentry || typeof wrap !== 'function') return App;
  return wrap.call(Sentry, App) as T;
}
