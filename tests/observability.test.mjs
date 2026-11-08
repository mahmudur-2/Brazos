import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// OBSERVABILITY — invariants 11 and 12.
//
//   11. No PII leaves the device: message, breadcrumbs, exception values and
//       extra are all scrubbed, request data is deleted, and the Sentry user
//       is an id only.
//   12. (Retired in lean D4 with PostHog: no analytics module remains.)
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

const sentrySource = read(SENTRY);

const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const sentryCode = strip(sentrySource);

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

test('the Sentry module statically imports nothing but the validated environment', () => {
  // THE STRONGEST FORM THIS CLAIM HAS: an exact import set, not a list of
  // forbidden names. A static import of @sentry/react-native or
  // posthog-react-native evaluates the package at module load, and whether
  // either survives `expo export --platform web` is not known — a throw there
  // takes down the screenshot harness, which is the UI gate every later run
  // depends on. Pinning the set means a THIRD vendor cannot arrive either.
  for (const [file, code] of [
    [SENTRY, sentryCode],
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
// THE CAPTURE CENSUS — every handled failure reaches Sentry beside its
// console.error (n9, 2026-09-05).
//
// A console.error is visible only to someone attached to a Metro session, so
// a handled failure whose whole record is that line is a failure nobody hears
// about once it happens on a tester's phone. The rule: a file under lib/,
// hooks/, screens/ or components/ that calls console.error imports `Sentry`
// from this module and captures AT LEAST AS MANY TIMES as it logs — counted
// per file, so a new console.error added without a capture beside it goes red
// here, offline, even in a file that already captures somewhere else. The
// web-specific modules are the frozen surface and are never counted.
//
// What the capture carries is governed by INVARIANT 11 above, not here: every
// `extra` is deep-scrubbed by `scrubEvent` before it leaves the device, and the
// sites pass identifiers, codes and kind labels only — never a name, address,
// coordinate pair, message body, draft text or file URI. That is a review rule
// at the call site; this test proves presence, not content.
// ---------------------------------------------------------------------------

const APP_DIRS = ['lib', 'hooks', 'screens', 'components'];

function* appFiles(rel) {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) yield* appFiles(child);
    else if (/\.tsx?$/.test(entry.name) && !/\.web\.tsx?$/.test(entry.name)) yield child;
  }
}

/** The import specifier `file` must use to reach this module. */
function sentrySpecifier(file) {
  const spec = relative(dirname(file), SENTRY.replace(/\.ts$/, '')).split('\\').join('/');
  return spec.startsWith('.') ? spec : `./${spec}`;
}

/**
 * The census rule on one file's comment-stripped source: the reason it fails,
 * or null when it holds (including for a file with no console.error at all).
 */
function captureGap(file, code) {
  const logs = (code.match(/console\.error\(/g) ?? []).length;
  if (logs === 0) return null;
  const spec = sentrySpecifier(file);
  const imported = new RegExp(
    `^import \\{[^}]*\\bSentry\\b[^}]*\\} from '${spec.replace(/\./g, '\\.')}';`,
    'm'
  ).test(code);
  if (!imported) return `${file}: calls console.error but does not import Sentry from '${spec}'`;
  const captures = (code.match(/Sentry\?\.captureException\(/g) ?? []).length;
  if (captures < logs) {
    return `${file}: ${logs} console.error site(s) but only ${captures} Sentry?.captureException call(s)`;
  }
  return null;
}

test('the census · every console.error in app code has a Sentry capture beside it', () => {
  const files = APP_DIRS.flatMap((dir) => [...appFiles(dir)]);
  assert.ok(files.length > 100, `the walk must enumerate the app tree (saw ${files.length})`);

  const sites = [];
  const gaps = [];
  for (const file of files) {
    const code = strip(read(file));
    if (!/console\.error\(/.test(code)) continue;
    sites.push(file);
    const gap = captureGap(file, code);
    if (gap) gaps.push(gap);
  }
  assert.deepEqual(gaps, [], 'a handled failure must reach Sentry, not only the console');

  // Non-vacuity: the census is not empty and still holds the files n9
  // instrumented — a walk that finds nothing proves nothing.
  assert.ok(sites.length >= 10, `the census found only ${sites.length} files`);
  for (const known of [
    'lib/sharing.ts',
    'hooks/useLegalGate.ts',
    'screens/PostJobScreen.tsx',
    'components/AppErrorBoundary.tsx',
  ]) {
    assert.ok(sites.includes(known), `${known} has left the census — check the walk`);
  }

  // The rule is exercised on fixtures it MUST refuse and ones it must not, so
  // it cannot pass merely because the scan stopped reading.
  assert.equal(sentrySpecifier('lib/sharing.ts'), './observability/sentry');
  assert.equal(sentrySpecifier('hooks/useLegalGate.ts'), '../lib/observability/sentry');
  assert.equal(sentrySpecifier('components/AppErrorBoundary.tsx'), '../lib/observability/sentry');
  assert.equal(
    captureGap('lib/x.ts', "console.error('a');"),
    "lib/x.ts: calls console.error but does not import Sentry from './observability/sentry'"
  );
  assert.match(
    captureGap(
      'lib/x.ts',
      "import { Sentry } from './observability/sentry';\nconsole.error('a');\nconsole.error('b');\nSentry?.captureException(e);"
    ),
    /2 console\.error site\(s\) but only 1 Sentry/
  );
  assert.equal(
    captureGap(
      'hooks/x.ts',
      "import { Sentry } from '../lib/observability/sentry';\nconsole.error('a');\nSentry?.captureException(e);"
    ),
    null
  );
  assert.equal(captureGap('lib/x.ts', 'nothing here'), null);
});
