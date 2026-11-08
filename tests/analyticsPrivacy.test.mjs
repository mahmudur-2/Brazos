import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// ANALYTICS PRIVACY — the fence that stands in FRONT of every emitted event.
//
// Four rules, and each failure message states the rule in full so a later run
// reads it off the failure without going looking for the dispatch that set it:
//
//   1. Every property in BOTH unions — FunnelEvent and IntentEvent — is a
//      number, a boolean, a union of string literals, or the ONE named
//      exception `category: string`, which exists in FunnelEvent alone.
//   2. No call site of EITHER emitter passes an identifier, member expression
//      or object property whose NAME is PII-shaped.
//   3. track() is called only from lib/ and modes/ — never from screens/ or
//      components/.
//   4. trackIntent() is called only from lib/, modes/, or a file written into
//      the allowlist below by hand.
//
// WHY RULE 3 EXISTS AS A TEST RATHER THAN A SENTENCE. Emitting from a screen
// double-counts the moment two screens can trigger the same mutation, and
// misses every path that does not go through a screen at all. That was written
// down in analytics.ts and nowhere else, which made it a rule someone has to
// remember. Here it is a rule the suite enforces.
//
// WHY RULE 4 IS A LIST AND NOT A DIRECTORY. An intent event is caused by a
// person and has no write behind it, so it can only be emitted where the
// person acted — which is exactly the screens and components rule 3 keeps
// track() out of. R7D did not answer that by weakening rule 3; it added a
// second emitter whose permitted surfaces are enumerated one file at a time.
// Adding a call site therefore REQUIRES editing this file, which is the
// point: someone has to decide, each time, whether that surface can count the
// event honestly — whether it mounts once per intent rather than once per
// keystroke, and whether the moment it fires is the moment it names.
//
// HOW THESE ARE PROVEN, STATED PLAINLY: by STATIC SCAN of source text, not by
// executing anything. lib/observability/analytics.ts cannot be executed under
// `node --test` (it imports config/env, an extensionless relative specifier
// bare Node ESM does not resolve), and neither can any of the modules that now
// call it — they all reach the Supabase client. So every assertion below is a
// claim about text. That is weaker than running the emitter, and it is written
// to be as strong as text can be: the extractor is exercised on known-good and
// known-bad fixtures inside each test, so a rule can never pass merely because
// the scan stopped finding anything.
//
// COMMENTS ARE STRIPPED before every sweep, the same way the sibling
// tests/observability.test.mjs strips them: prose legitimately says "track()",
// and two files legitimately say "the track" about a progress bar and a
// toggle. A raw-text sweep would go red on the prose explaining why it is
// green.
// ===========================================================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const ANALYTICS = 'lib/observability/analytics.ts';

/**
 * RULE 4's ALLOWLIST — every surface permitted to call trackIntent().
 *
 * An entry ending in `/` is a directory prefix and covers everything beneath
 * it; `lib/` and `modes/` are here because rule 3 already trusts them with the
 * funnel. Every other entry is one exact file, added by the run that added the
 * call, and removed by the run that removes it — the test below refuses an
 * entry naming a file that no longer calls trackIntent, so this list cannot
 * quietly become standing permission for a surface nobody instruments any more.
 */
const INTENT_ALLOWLIST = [
  'lib/',
  'modes/',
  // R7D · permission_result. Each of these shows a system permission dialog
  // and reads its answer, which is the one place that answer exists — there is
  // no write behind it and no row to reconcile it against. A dialog shown is a
  // real event EVERY time it is shown, so several surfaces asking for the same
  // permission all emit; unlike a funnel step, this cannot double-count a
  // conversion.
  'components/HotspotMap.tsx',
  'hooks/useLiveLocation.ts',
  'screens/ChatScreen.tsx',
  'screens/ProfileScreen.tsx',
  // R7D · the two abandonment pairs. Both mount once per session of the thing
  // they measure — a posting form opened, a composer opened — and neither is
  // keyed on form state, so typing re-renders them and never remounts them.
  // Both fire their abandonment from an unmount cleanup, which an app kill
  // never reaches: each number is a floor, and the comment at each site says
  // so.
  'components/OfferComposer.tsx',
  'screens/PostJobScreen.tsx',
];

/**
 * Not app source: build output, the frozen web surface, the Deno edge
 * functions, the reference trees, and the suite itself — this file names
 * `track(` many times over and would report itself.
 */
const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'web-build',
  'android',
  'ios',
  'public',
  'hosting',
  'design-reference',
  'assets',
  'docs',
  'scripts',
  'supabase',
  'tests',
]);

function* walk(rel) {
  for (const entry of readdirSync(join(root, rel || '.'), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
      yield* walk(child);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield child;
    }
  }
}

const FILES = [...walk('')];

/**
 * The argument text of every CALL to `name` in one file's comment-stripped
 * source. Parenthesis-matched rather than regex-terminated, so a call spanning
 * lines or carrying a nested call is read whole.
 *
 * The name must be preceded by something that is not an identifier character
 * and not a dot, so `backtrack(` and `analytics.track(` are not `track(`; and
 * the declaration `export function track(...)` is skipped, since a signature
 * is not a call site. The same lookbehind is what keeps `trackIntent(` out of
 * rule 3's sweep and `track(` out of rule 4's — the two emitters are counted
 * separately because they mean different things.
 */
function callsTo(code, name) {
  const calls = [];
  const pattern = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'g');
  let match;
  while ((match = pattern.exec(code)) !== null) {
    if (/\bfunction\s*$/.test(code.slice(0, match.index))) continue;
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    assert.notEqual(close, -1, `a ${name}( call never closes — check the scan`);
    calls.push(code.slice(open + 1, close));
  }
  return calls;
}

const trackCalls = (code) => callsTo(code, 'track');
const trackIntentCalls = (code) => callsTo(code, 'trackIntent');

test('the sweep enumerates the app source tree', () => {
  assert.ok(FILES.length > 100, `the sweep must enumerate the tree (saw ${FILES.length})`);
  assert.ok(FILES.includes(ANALYTICS), 'the analytics module must be inside the swept tree');
  for (const dir of ['lib/', 'modes/', 'screens/', 'components/', 'hooks/', 'ui/']) {
    assert.ok(
      FILES.some((file) => file.startsWith(dir)),
      `${dir} is not being swept — rules 2, 3 and 4 are about exactly these trees`
    );
  }
  assert.ok(
    !FILES.some((file) => file.startsWith('tests/') || file.startsWith('node_modules/')),
    'the sweep has wandered outside app source'
  );
});

// ---------------------------------------------------------------------------
// RULE 1 — neither union carries free text.
// ---------------------------------------------------------------------------

const analyticsSource = read(ANALYTICS);

/**
 * One union's variants, read as text between two markers. Each variant is
 * `{ name: '...'; ...props }` with no nested braces, so the properties can be
 * split off directly. Comments are stripped first: both unions carry prose,
 * including the two "do not wire this" notes.
 */
function unionMembers(from, to) {
  const start = analyticsSource.indexOf(from);
  const end = analyticsSource.indexOf(to);
  assert.ok(start > -1, `"${from}" is gone from the analytics module — check the scan`);
  assert.ok(end > start, `"${to}" no longer follows "${from}" — check the scan`);
  return [...strip(analyticsSource.slice(start, end)).matchAll(/\{([^{}]*)\}/g)].map(
    (match) => match[1]
  );
}

const FUNNEL_MEMBERS = unionMembers('export type FunnelEvent =', 'export type IntentEvent =');
const INTENT_MEMBERS = unionMembers('export type IntentEvent =', 'const POSTHOG_HOST');

/** `'a'`, or `'a' | 'b' | 'c'` — a closed set the compiler can check. */
const STRING_LITERAL_UNION = /^'[^']*'(?:\s*\|\s*'[^']*')*$/;

const RULE_1 =
  'THE RULE: an event property — in FunnelEvent or in IntentEvent — may only be a number, ' +
  "a boolean, a union of string literals, or the single named exception 'category: string' " +
  'in FunnelEvent alone. A closed app-side set, not prose. A bare string property is how a ' +
  'job title, an address or a message body reaches a third party as "just one more field". ' +
  'Carry an id, a count, a boolean or a literal union instead.';

/** Counts each property by how rule 1 classifies it, failing on anything else. */
function classify(members, union, allowCategoryString) {
  const seen = { number: 0, boolean: 0, literal: 0, exception: 0 };
  for (const member of members) {
    for (const raw of member.split(';')) {
      const property = raw.trim();
      if (property === '') continue;

      const colon = property.indexOf(':');
      assert.notEqual(colon, -1, `unreadable ${union} property "${property}" — check the scan`);
      const key = property.slice(0, colon).trim();
      const type = property.slice(colon + 1).trim();

      if (type === 'number') seen.number += 1;
      else if (type === 'boolean') seen.boolean += 1;
      else if (STRING_LITERAL_UNION.test(type)) seen.literal += 1;
      else if (allowCategoryString && key === 'category' && type === 'string') seen.exception += 1;
      else assert.fail(`${RULE_1} The offending ${union} property is "${key}", typed "${type}".`);
    }
  }
  return seen;
}

test('RULE 1 · every event property is a number, a boolean or a closed set', () => {
  // Each union's own floor, by name. NEVER a combined total: a run that
  // deleted three funnel variants and added five intent ones would sail
  // through a single number while halving the funnel.
  assert.ok(
    FUNNEL_MEMBERS.length >= 12,
    `FunnelEvent parsed to ${FUNNEL_MEMBERS.length} members — check the scan`
  );
  assert.ok(
    INTENT_MEMBERS.length >= 5,
    `IntentEvent parsed to ${INTENT_MEMBERS.length} members — check the scan`
  );

  const funnel = classify(FUNNEL_MEMBERS, 'FunnelEvent', true);
  const intent = classify(INTENT_MEMBERS, 'IntentEvent', false);

  // Non-vacuity: the classifier is exercised on the rule's own boundary rather
  // than trusted to have looked at anything.
  assert.ok(STRING_LITERAL_UNION.test("'customer' | 'worker'"), 'a literal union no longer classifies');
  assert.ok(!STRING_LITERAL_UNION.test('string'), 'a bare string classifies as a literal union');
  for (const [union, seen] of [
    ['FunnelEvent', funnel],
    ['IntentEvent', intent],
  ]) {
    assert.ok(
      seen.number > 0 && seen.boolean > 0 && seen.literal > 0,
      `the scan classified nothing in ${union} (${JSON.stringify(seen)}) — check it`
    );
  }
  assert.equal(
    funnel.exception,
    1,
    "'category: string' is the ONE permitted exception and must appear exactly once"
  );
  assert.equal(intent.exception, 0, 'the category exception is FunnelEvent-only');
});

// ---------------------------------------------------------------------------
// RULE 2 — nothing PII-shaped is passed to a call site of either emitter.
// ---------------------------------------------------------------------------

/**
 * Matched against the NAME of every identifier, member-expression segment and
 * object key inside an emitter's argument list. Names, not values: a value this
 * scan cannot see is exactly why the unions in rule 1 have no free-text type.
 */
const PII_SHAPED = /title|descript|address|location|message|body|email|phone|street|note/i;

/**
 * The ONE permitted name-shaped exception, and it is permitted because it is
 * the substitution rule 2's own message prescribes: `hadTitle` is a boolean
 * saying WHETHER a title was typed, never the title. The exception is exact —
 * `title`, `jobTitle` and `hadTitleText` are all still refused — and the test
 * below proves each name on this list really is declared `boolean` in one of
 * the two unions, so it can never come to cover a string.
 */
const PII_NAME_EXCEPTIONS = ['hadTitle'];

/**
 * Quoted string literals are blanked before words are read out. A literal in
 * source is written by a developer at build time and cannot carry a user's
 * address at run time; it is also neither an identifier, a member-expression
 * segment nor an object key, which is what this rule says it inspects. Without
 * this, `kind: 'location'` — a member of a closed union rule 1 has already
 * checked — would read as a leak. TEMPLATE literals are deliberately NOT
 * blanked: `${job.title}` interpolates a real value and must still be caught.
 */
const blankStringLiterals = (argument) =>
  argument.replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');

function piiWords(argument) {
  return (blankStringLiterals(argument).match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []).filter(
    (word) => PII_SHAPED.test(word) && !PII_NAME_EXCEPTIONS.includes(word)
  );
}

const RULE_2 =
  'THE RULE: nothing PII-shaped may be passed to track() or trackIntent(). A name matching ' +
  'title / descript / address / location / message / body / email / phone / street / note ' +
  'is refused at the call site even when the union would accept its type, because the ' +
  'union checks the SHAPE of a property and this checks what is being poured into it. ' +
  'If an event needs to know something about one of these, send a boolean or a count ' +
  'derived from it, never the value.';

test('RULE 2 · no emitted event passes anything PII-shaped', () => {
  const offenders = [];
  for (const file of FILES) {
    const code = strip(read(file));
    for (const [emitter, calls] of [
      ['track', trackCalls(code)],
      ['trackIntent', trackIntentCalls(code)],
    ]) {
      for (const argument of calls) {
        for (const word of piiWords(argument)) {
          offenders.push(`${file}: ${emitter}(...) carries "${word}"`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], RULE_2);

  // The exception list can only ever hold booleans, and that is proven against
  // the unions themselves rather than asserted in prose.
  for (const name of PII_NAME_EXCEPTIONS) {
    assert.ok(
      [...FUNNEL_MEMBERS, ...INTENT_MEMBERS].some((member) =>
        new RegExp(`\\b${name}\\s*:\\s*boolean\\b`).test(member)
      ),
      `"${name}" is exempt from the PII name check but is not declared boolean in either union`
    );
  }

  // Non-vacuity: the detector is exercised on calls it MUST refuse and calls it
  // must not, so this rule cannot pass because the scan found nothing to read.
  assert.deepEqual(piiWords("{ name: 'job_posted', title: input.title }"), ['title', 'title']);
  assert.deepEqual(piiWords("{ name: 'job_posted', category: input.category }"), []);
  assert.deepEqual(piiWords("{ name: 'permission_result', kind: 'location' }"), []);
  assert.deepEqual(piiWords('{ lat: location.lat }'), ['location']);
  assert.deepEqual(piiWords('{ hadTitle: shape.hadTitle }'), []);
  assert.deepEqual(piiWords('{ hadTitleText: shape.hadTitleText }'), [
    'hadTitleText',
    'hadTitleText',
  ]);
  assert.deepEqual(piiWords('{ category: `${job.title}` }'), ['title']);
});

// ---------------------------------------------------------------------------
// RULE 3 — the mutation layer owns funnel emission.
// ---------------------------------------------------------------------------

const RULE_3 =
  'THE RULE: track() is called from lib/ and modes/ ONLY — from the function that wraps ' +
  'the write, on its success branch, one call site per state change. Never from a screen ' +
  'or a component. A screen double-counts the moment two screens can trigger the same ' +
  'mutation, and misses every path that does not go through a screen at all. If a surface ' +
  'needs to emit something no lib/ function owns, give the write a home in lib/ first — ' +
  'do not add the call where the tap is. An event with NO write behind it is not an ' +
  'exception to this rule: it is an IntentEvent, and it goes through trackIntent().';

test('RULE 3 · track() is called only from lib/ and modes/', () => {
  const strays = [];
  for (const file of FILES) {
    if (file.startsWith('lib/') || file.startsWith('modes/')) continue;
    if (trackCalls(strip(read(file))).length > 0) strays.push(file);
  }
  assert.deepEqual(strays, [], RULE_3);

  // Non-vacuity: the extractor finds a real call, ignores the declaration, is
  // not fooled by a name that merely ends in "track", and does not mistake the
  // other emitter for this one.
  assert.deepEqual(trackCalls("track({ name: 'offer_accepted' });"), ["{ name: 'offer_accepted' }"]);
  assert.deepEqual(trackCalls('export function track(event: FunnelEvent): void {'), []);
  assert.deepEqual(trackCalls('backtrack(x); analytics.track(y);'), []);
  assert.deepEqual(trackCalls("trackIntent({ name: 'job_post_started' });"), []);
  assert.deepEqual(
    trackCalls("track({\n  name: 'job_completed',\n  hasEvidencePhoto: (a ?? 0) > 0,\n});"),
    ["{\n  name: 'job_completed',\n  hasEvidencePhoto: (a ?? 0) > 0,\n}"]
  );
});

// ---------------------------------------------------------------------------
// RULE 4 — intent emission is permitted file by written file.
// ---------------------------------------------------------------------------

const RULE_4 =
  'THE RULE: trackIntent() is called from lib/, from modes/, or from a file written by ' +
  'hand into INTENT_ALLOWLIST at the top of tests/analyticsPrivacy.test.mjs — and from ' +
  'nowhere else. The list is the mechanism, not a formality: an intent event has no write ' +
  'behind it and can never be reconciled against the database, so the only thing standing ' +
  'between it and a number nobody can audit is a person deciding, at the moment the call ' +
  'is added, whether THAT surface can count THAT event honestly — whether it mounts once ' +
  'per intent rather than once per keystroke or tab change, and whether the instant it ' +
  'fires is the instant it claims. Adding a call site is meant to cost you this edit. If ' +
  'the surface cannot answer those questions, the right move is to emit nothing.';

test('RULE 4 · trackIntent() is called only from lib/, modes/ and the written allowlist', () => {
  const strays = [];
  for (const file of FILES) {
    if (INTENT_ALLOWLIST.some((entry) => file.startsWith(entry))) continue;
    if (trackIntentCalls(strip(read(file))).length > 0) strays.push(file);
  }
  assert.deepEqual(strays, [], RULE_4);

  // The list may not rot. An entry naming an exact file must name a file that
  // exists and that still emits, or it is standing permission for a surface
  // nobody instruments — the thing this rule exists to prevent.
  for (const entry of INTENT_ALLOWLIST) {
    if (entry.endsWith('/')) continue;
    assert.ok(FILES.includes(entry), `INTENT_ALLOWLIST names "${entry}", which is not app source`);
    assert.ok(
      trackIntentCalls(strip(read(entry))).length > 0,
      `INTENT_ALLOWLIST names "${entry}", which no longer calls trackIntent — remove the entry`
    );
  }

  // Non-vacuity: the extractor finds a real call, ignores the declaration, and
  // does not mistake track() for it.
  assert.deepEqual(trackIntentCalls("trackIntent({ name: 'job_post_started' });"), [
    "{ name: 'job_post_started' }",
  ]);
  assert.deepEqual(trackIntentCalls('export function trackIntent(event: IntentEvent): void {'), []);
  assert.deepEqual(trackIntentCalls("track({ name: 'offer_accepted' });"), []);
  assert.deepEqual(trackIntentCalls('analytics.trackIntent(x);'), []);

  // And the guard itself: a file that is not on the list and does emit is
  // reported by name, so the failure tells you which surface to decide about.
  const decide = (file, code) =>
    INTENT_ALLOWLIST.some((entry) => file.startsWith(entry)) ||
    trackIntentCalls(code).length === 0;
  assert.equal(decide('screens/SomeScreen.tsx', "trackIntent({ name: 'job_post_started' });"), false);
  assert.equal(decide('lib/somewhere.ts', "trackIntent({ name: 'job_post_started' });"), true);
});
