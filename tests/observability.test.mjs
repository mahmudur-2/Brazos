import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// OBSERVABILITY — invariants 11 and 12.
//
//   11. No PII leaves the device: message, breadcrumbs, exception values and
//       extra are all scrubbed, request data is deleted, and the Sentry user
//       is an id only.
//   12. Analytics events are a closed typed union with no free-text property;
//       money in integer cents.
//
// HOW THESE ARE PROVEN, STATED PLAINLY: by STATIC SCAN of the two sources, not
// by executing them. Neither module can be executed under `node --test`, and
// the reason is structural rather than a gap someone can close later — both
// import `config/env`, an extensionless relative specifier that bare Node ESM
// does not resolve, and that import is the whole point of those modules (the
// DSN and the key come from the validated environment and nowhere else). The
// pure-core split that makes lib/secureSessionStorageCore.ts executable would
// be the way to change that, and it is deliberately NOT done here: R2 creates
// these two modules and nothing else.
//
// So every assertion below is a claim about SOURCE TEXT. That is weaker than
// running the scrubber, and it is written to be as strong as source text can
// be: structures are extracted and compared as data rather than probed with a
// bare `assert.match`, every scan carries a non-vacuity guard, and the import
// list is pinned as an exact set rather than a list of forbidden names.
//
// COMMENTS ARE STRIPPED for the absence sweeps, the same way
// tests/appConfig.test.mjs and tests/themeTokens.test.mjs strip theirs: the
// docblocks in both modules NAME the vendor packages, at length, because the
// reason the load is a caught require rather than a static import is the kind
// of decision a later run undoes if nobody wrote it down. A raw-text sweep
// would go red on the prose explaining why it is green.
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const SENTRY = 'lib/observability/sentry.ts';
const ANALYTICS = 'lib/observability/analytics.ts';

const sentrySource = read(SENTRY);
const analyticsSource = read(ANALYTICS);

const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const sentryCode = strip(sentrySource);
const analyticsCode = strip(analyticsSource);

/**
 * The body of a top-level `function name() { ... }`, brace-matched. The name
 * may be followed by a generic parameter list — `wrapApp<T>(App: T)` is one —
 * so the match is on the declaration keyword and the name, not on the paren.
 */
function functionBody(code, name) {
  const start = code.search(new RegExp(`function ${name}\\s*[(<]`));
  assert.notEqual(start, -1, `${name} is gone — check the scan`);
  const open = code.indexOf('{', start);
  assert.notEqual(open, -1, `${name} has no body`);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  throw new Error(`${name}'s body never closes`);
}

// ---------------------------------------------------------------------------
// THE VENDOR SEAM — invariant 11's precondition and the harness's protection.
// ---------------------------------------------------------------------------

test('neither module statically imports anything but the validated environment', () => {
  // THE STRONGEST FORM THIS CLAIM HAS: an exact import set, not a list of
  // forbidden names. A static import of @sentry/react-native or
  // posthog-react-native evaluates the package at module load, and whether
  // either survives `expo export --platform web` is not known — a throw there
  // takes down the screenshot harness, which is the UI gate every later run
  // depends on. Pinning the set means a THIRD vendor cannot arrive either.
  for (const [file, code] of [
    [SENTRY, sentryCode],
    [ANALYTICS, analyticsCode],
  ]) {
    const specifiers = [...code.matchAll(/^import\b[^;]*?from\s*'([^']+)'/gm)].map((m) => m[1]);
    assert.deepEqual(
      specifiers,
      ['../../config/env'],
      `${file} must import the validated environment and nothing else`
    );
    // A side-effect import has no `from` clause and would slip past the scan
    // above, so it is refused by name.
    assert.doesNotMatch(code, /^import\s*'/m, `${file} carries a side-effect import`);
  }
});

test('every vendor package is reached through a caught require that returns null', () => {
  // The idiom lib/secureSessionStorage.ts, lib/motion120/vendor.ts and
  // lib/designStudioGate.ts already use. What is asserted for each loader is
  // the whole shape — try, the require of that exact package, catch, and a
  // null return — because a require inside a try whose catch rethrows, or one
  // that returns something other than null, degrades to a crash rather than to
  // a no-op.
  const loaders = [
    [SENTRY, sentryCode, 'loadSentry', '@sentry/react-native'],
    [SENTRY, sentryCode, 'loadUpdates', 'expo-updates'],
    [ANALYTICS, analyticsCode, 'loadPostHog', 'posthog-react-native'],
  ];

  for (const [file, code, name, pkg] of loaders) {
    const body = functionBody(code, name);
    assert.match(body, /try\s*\{/, `${file}: ${name} does not guard its require`);
    assert.ok(
      body.includes(`require('${pkg}')`),
      `${file}: ${name} must require ${pkg} by literal`
    );
    assert.match(body, /catch\s*\{/, `${file}: ${name} has no catch`);
    assert.match(body, /catch\s*\{\s*return null;\s*\}/, `${file}: ${name} must fall back to null`);
  }

  // Non-vacuity, and a fence against a require appearing OUTSIDE a checked
  // loader: the only `require(` calls in either file are the ones above.
  assert.equal((sentryCode.match(/require\(/g) ?? []).length, 2);
  assert.equal((analyticsCode.match(/require\(/g) ?? []).length, 1);
});

test('the Sentry export is nullable, and consumers are given a null-safe wrapper', () => {
  // Exporting a value callers must assume exists is what the caught require
  // was for. The declared type carries the null.
  assert.match(sentryCode, /export const Sentry:\s*SentryLike \| null = loadSentry\(\);/);

  // App.tsx must never call Sentry.wrap itself; wrapApp owns the null case.
  const body = functionBody(sentryCode, 'wrapApp');
  assert.match(body, /if \(!Sentry \|\| typeof wrap !== 'function'\) return App;/);
  assert.match(body, /return wrap\.call\(Sentry, App\)/);
});

// ---------------------------------------------------------------------------
// INVARIANT 11 — no PII leaves the device.
// ---------------------------------------------------------------------------

test('INVARIANT 11 · beforeSend scrubs all five surfaces and deletes request data', () => {
  const body = functionBody(sentryCode, 'scrubEvent');

  // 1. the formatted message.
  assert.match(body, /if \(event\.message\) event\.message = scrub\(event\.message\);/);

  // 2 + 3. every breadcrumb's message AND its data. `data` is arbitrary
  // objects, so it takes the deep scrub rather than the string one.
  assert.match(body, /event\.breadcrumbs = event\.breadcrumbs\.map\(/);
  assert.match(body, /scrub\(crumb\.message\)/);
  assert.match(body, /scrubDeep\(crumb\.data\)/);

  // 4. exception values — where a PostgREST error actually puts row data, and
  // the surface an earlier revision of this design left untouched.
  assert.match(body, /event\.exception\.values = event\.exception\.values\.map\(/);
  assert.match(body, /scrub\(value\.value\)/);

  // 5. extra — the other place it puts row data.
  assert.match(body, /if \(event\.extra\) event\.extra = scrubDeep\(event\.extra\)/);

  // 6. the request BODY is DELETED, not scrubbed: its useful content is
  // exactly the part that must not leave the device.
  assert.match(body, /if \(event\.request\) delete event\.request\.data;/);

  // The hook is actually wired to it. A perfect scrubber nothing calls is the
  // failure this guards against.
  assert.match(sentryCode, /beforeSend:\s*\(event: SentryEvent\) => scrubEvent\(event\)/);
});

test('INVARIANT 11 · the deep scrub is bounded and cannot be out-run by depth', () => {
  const body = functionBody(sentryCode, 'scrubDeep');
  // Past the cap the value is REPLACED, not returned as it stands — otherwise
  // depth becomes a way to smuggle an unscrubbed string out.
  assert.match(body, /if \(depth > 6\) return '\[depth\]';/);
  assert.match(body, /if \(typeof value === 'string'\) return scrub\(value\);/);
  assert.match(body, /scrubDeep\(entry, depth \+ 1\)/);

  // The patterns the scrub actually removes. Both are asserted against the
  // raw source: an email and a phone number are the two shapes that turn a
  // stack trace into a privacy incident.
  const pii = sentrySource.match(/const PII = (\/.+\/g);/);
  assert.ok(pii, 'the PII pattern is gone');
  assert.ok(pii[1].includes('@'), 'the PII pattern no longer matches an email address');
  assert.ok(pii[1].includes('\\d'), 'the PII pattern no longer matches a phone number');
  assert.match(sentryCode, /replace\(PII, '\[redacted\]'\)/);
});

test('INVARIANT 11 · the Sentry user is an id and nothing else', () => {
  const body = functionBody(sentryCode, 'setSentryUser');
  assert.match(body, /Sentry\?\.setUser\(id \? \{ id \} : null\);/);

  // Sentry's user object also accepts email, username and ip_address. None of
  // those field names may appear anywhere in the module — including in a
  // helper that might build the object somewhere else.
  for (const field of ['email', 'username', 'ip_address', 'phone', 'full_name']) {
    assert.ok(
      !sentryCode.includes(field),
      `${SENTRY} names ${field}, which must never be attached to a Sentry user`
    );
  }

  // And the server-side switch that would attach all of them regardless.
  assert.match(sentryCode, /sendDefaultPii: false,/);
  assert.ok(!sentryCode.includes('sendDefaultPii: true'), 'sendDefaultPii must be false');
});

test('the init is inert without a vendor or a DSN, and tags only when the vendor loaded', () => {
  const body = functionBody(sentryCode, 'initSentry');
  // Both guards, in this order: the vendor first, so the DSN read cannot run
  // on a runtime where the module is absent.
  const vendorGuard = body.indexOf('if (!Sentry) return;');
  const dsnGuard = body.indexOf('if (!dsn) return;');
  assert.ok(vendorGuard > -1, 'initSentry does not check the vendor');
  assert.ok(dsnGuard > vendorGuard, 'the DSN guard must follow the vendor guard');

  // The three release tags sit after both guards, so they are set only when
  // the module actually loaded.
  for (const tag of ['updateId', 'channel', 'runtimeVersion']) {
    const at = body.indexOf(`Sentry.setTag('${tag}'`);
    assert.ok(at > dsnGuard, `the ${tag} tag is set outside the vendor guard`);
  }

  // Environment and sampling come from the variant, never from a literal.
  assert.match(body, /environment: env\.EXPO_PUBLIC_APP_VARIANT,/);
  assert.match(
    body,
    /tracesSampleRate: env\.EXPO_PUBLIC_APP_VARIANT === 'production' \? 0\.1 : 1,/
  );
});

// ---------------------------------------------------------------------------
// INVARIANT 12 — a closed typed union, no free text, money in integer cents.
// ---------------------------------------------------------------------------

/**
 * The union, extracted as data. Each variant is `{ name: '...'; ...props }`
 * with no nested braces, so the properties can be read off directly and
 * compared as a table rather than probed one regex at a time.
 */
const unionStart = analyticsSource.indexOf('export type FunnelEvent =');
// Stops at the SECOND union rather than at the first non-union declaration.
// R7D added IntentEvent between FunnelEvent and POSTHOG_HOST, and this
// invariant is about the funnel — the events with a write and therefore a row
// behind them. IntentEvent is fenced by tests/analyticsPrivacy.test.mjs.
const unionEnd = analyticsSource.indexOf('export type IntentEvent =');
assert.ok(unionStart > -1 && unionEnd > unionStart, 'the FunnelEvent union is gone');
const union = analyticsSource.slice(unionStart, unionEnd);

const variants = [...union.matchAll(/\{\s*name:\s*'([a-z_]+)'([^}]*)\}/g)].map((match) => [
  match[1],
  match[2].replace(/\s+/g, ' ').trim().replace(/^;\s*/, ''),
]);

test('INVARIANT 12 · the funnel is a closed union, pinned variant by variant', () => {
  // TWELVE. It was fourteen — copied from §3.2 of the target architecture,
  // which itself declared fourteen against a dispatch that said sixteen, and
  // the discrepancy was reported rather than papered over. R7D took the count
  // DOWN, which is the direction this list is meant to be able to move:
  // `worker_onboarded` overlapped `connect_onboarding_completed` and a server
  // column, and `job_viewed` / `bid_viewed` are reads that belong in an
  // exposure ledger in the database with a rank position, not in a funnel that
  // cannot say where the view happened. `checkout_result` replaced none of
  // them — it is the sibling `checkout_started` never had, and without it a
  // dismissed payment sheet and a failed one are the same missing number.
  assert.deepEqual(variants, [
    ['job_posted', 'category: string; hasBudget: boolean'],
    ['offer_accepted', ''],
    ['checkout_started', ''],
    ['checkout_result', "outcome: 'succeeded' | 'cancelled' | 'failed'"],
    ['payment_held', 'amountCents: number'],
    ['payment_released', "reason: 'approved' | 'auto_approved'"],
    ['review_left', 'stars: number'],
    ['offer_sent', "kind: 'bid' | 'direct'; secondsSincePosted: number"],
    ['job_completed', 'hasEvidencePhoto: boolean'],
    ['connect_onboarding_started', ''],
    ['connect_onboarding_completed', ''],
    ['mode_switched', "to: 'customer' | 'worker'"],
  ]);

  // The worker side is still here on purpose: the one number that says whether
  // this marketplace has a supply side is bids per job, and an event list that
  // tracks only the customer cannot compute it. `offer_sent` carries the
  // numerator and `secondsSincePosted` the leading indicator; the two Connect
  // events say whether a worker can be paid at all.
  const names = variants.map(([name]) => name);
  for (const required of [
    'offer_sent',
    'job_completed',
    'connect_onboarding_started',
    'connect_onboarding_completed',
  ]) {
    assert.ok(names.includes(required), `the worker-side event ${required} is gone`);
  }
});

test('INVARIANT 12 · no free-text property, and money is integer cents', () => {
  // EXACTLY ONE property in the whole union is typed `string`, and it is the
  // job category — a closed set in the app, not prose. Every other property is
  // a literal union, a boolean or a number. This is the assertion that stops a
  // job title, an address or a message body from reaching a third party by
  // being added as "just one more field".
  const stringProps = [...union.matchAll(/(\w+):\s*string\b/g)].map((match) => match[1]);
  assert.deepEqual(stringProps, ['category'], 'a free-text property has been added to the funnel');

  // Money is integer cents everywhere in this codebase, and an analytics
  // payload is not an exception — a float dollar amount here is a rounding
  // error in the one number the business is measured on.
  assert.ok(union.includes('amountCents: number'), 'the held amount is no longer in cents');
  assert.doesNotMatch(
    union,
    /\b(amount|price|total|budget|fee)\s*:/,
    'a money property that is not named in cents has been added'
  );
});

test('INVARIANT 12 · track and identify are no-ops when there is no client', () => {
  // Analytics is the least important thing the app does and must never be
  // able to break the thing it is measuring. Both functions return before
  // touching the client, and neither throws.
  const trackBody = functionBody(analyticsCode, 'track');
  assert.match(trackBody, /if \(!client\) return;/);
  assert.match(trackBody, /const \{ name, \.\.\.props \} = event;/);
  assert.match(trackBody, /client\.capture\(name, props\);/);

  const identifyBody = functionBody(analyticsCode, 'identify');
  assert.match(identifyBody, /if \(!client\) return;/);
  assert.match(identifyBody, /if \(userId\) client\.identify\(userId\);/);
  assert.match(identifyBody, /else client\.reset\(\);/);

  // The client is null on both roads to it: no vendor, or no key.
  const createBody = functionBody(analyticsCode, 'createClient');
  assert.match(createBody, /if \(!PostHog \|\| !key\) return null;/);
  assert.match(createBody, /catch\s*\{\s*return null;\s*\}/);
  assert.match(createBody, /new PostHog\(key, \{ host: POSTHOG_HOST \}\)/);

  // The client stays module-private: exporting it would hand call sites a way
  // round the typed union, which is the whole protection.
  assert.match(analyticsCode, /^const client: PostHogLike \| null = createClient\(\);$/m);
  assert.ok(!analyticsCode.includes('export const client'), 'the raw client must not be exported');
});

test('nothing emits an analytics event yet — the mutation layer owns that, in R8', () => {
  // §3.2 is explicit that events come from the mutation layer, one call site
  // per state change, next to the write that causes it. Emitting from screens
  // double-counts the moment two screens can trigger the same mutation. R2
  // creates the module and stops; this is the fence that keeps a later run
  // from quietly wiring a screen to it without re-deciding that.
  //
  // Scoped to the analytics module's own exports so it cannot go red on an
  // unrelated `track(` somewhere in the tree.
  const importers = [...analyticsSource.matchAll(/from '\.\/analytics'/g)];
  assert.equal(importers.length, 0, 'analytics.ts imports itself — check the scan');
  assert.equal(
    (analyticsCode.match(/\btrack\(/g) ?? []).length,
    1,
    'track is called inside its own module'
  );
});
