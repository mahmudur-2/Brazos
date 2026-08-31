import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// ANALYTICS PRIVACY — the fence that stands in FRONT of every track() call.
//
// Three rules, and each failure message states the rule in full so a later run
// reads it off the failure without going looking for the dispatch that set it:
//
//   1. Every property in the FunnelEvent union is a number, a boolean, a union
//      of string literals, or the ONE named exception `category: string`.
//   2. No track() call site anywhere passes an identifier, member expression or
//      object property whose NAME is PII-shaped.
//   3. track() is called only from lib/ and modes/ — never from screens/ or
//      components/.
//
// WHY RULE 3 EXISTS AS A TEST RATHER THAN A SENTENCE. Emitting from a screen
// double-counts the moment two screens can trigger the same mutation, and
// misses every path that does not go through a screen at all. That was written
// down in analytics.ts and nowhere else, which made it a rule someone has to
// remember. Here it is a rule the suite enforces.
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
 * The argument text of every track() CALL in one file's comment-stripped
 * source. Parenthesis-matched rather than regex-terminated, so a call spanning
 * lines or carrying a nested call is read whole.
 *
 * `track` must be preceded by something that is not an identifier character
 * and not a dot, so `backtrack(` and `analytics.track(` are not this function;
 * and the declaration `export function track(...)` is skipped, since a
 * signature is not a call site.
 */
function trackCalls(code) {
  const calls = [];
  const pattern = /(?<![\w$.])track\s*\(/g;
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
    assert.notEqual(close, -1, 'a track( call never closes — check the scan');
    calls.push(code.slice(open + 1, close));
  }
  return calls;
}

test('the sweep enumerates the app source tree', () => {
  assert.ok(FILES.length > 100, `the sweep must enumerate the tree (saw ${FILES.length})`);
  assert.ok(FILES.includes(ANALYTICS), 'the analytics module must be inside the swept tree');
  for (const dir of ['lib/', 'modes/', 'screens/', 'components/', 'hooks/', 'ui/']) {
    assert.ok(
      FILES.some((file) => file.startsWith(dir)),
      `${dir} is not being swept — rules 2 and 3 are about exactly these trees`
    );
  }
  assert.ok(
    !FILES.some((file) => file.startsWith('tests/') || file.startsWith('node_modules/')),
    'the sweep has wandered outside app source'
  );
});

// ---------------------------------------------------------------------------
// RULE 1 — the union carries no free text.
// ---------------------------------------------------------------------------

const analyticsSource = read(ANALYTICS);
const unionStart = analyticsSource.indexOf('export type FunnelEvent =');
const unionEnd = analyticsSource.indexOf('const POSTHOG_HOST');
assert.ok(unionStart > -1 && unionEnd > unionStart, 'the FunnelEvent union is gone — check the scan');

/** Comments stripped: the union carries the two "do not wire this" notes. */
const UNION = strip(analyticsSource.slice(unionStart, unionEnd));

/** Each variant is `{ name: '...'; ...props }` with no nested braces. */
const MEMBERS = [...UNION.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]);

/** `'a'`, or `'a' | 'b' | 'c'` — a closed set the compiler can check. */
const STRING_LITERAL_UNION = /^'[^']*'(?:\s*\|\s*'[^']*')*$/;

const RULE_1 =
  'THE RULE: a FunnelEvent property may only be a number, a boolean, a union of string ' +
  "literals, or the single named exception 'category: string' — a closed app-side set, " +
  'not prose. A bare string property is how a job title, an address or a message body ' +
  'reaches a third party as "just one more field". Carry an id, a count, a boolean or a ' +
  'literal union instead.';

test('RULE 1 · every funnel property is a number, a boolean or a closed set', () => {
  assert.ok(MEMBERS.length >= 14, `the union parsed to ${MEMBERS.length} members — check the scan`);

  const seen = { number: 0, boolean: 0, literal: 0, exception: 0 };

  for (const member of MEMBERS) {
    for (const raw of member.split(';')) {
      const property = raw.trim();
      if (property === '') continue;

      const colon = property.indexOf(':');
      assert.notEqual(colon, -1, `unreadable funnel property "${property}" — check the scan`);
      const key = property.slice(0, colon).trim();
      const type = property.slice(colon + 1).trim();

      if (type === 'number') seen.number += 1;
      else if (type === 'boolean') seen.boolean += 1;
      else if (STRING_LITERAL_UNION.test(type)) seen.literal += 1;
      else if (key === 'category' && type === 'string') seen.exception += 1;
      else assert.fail(`${RULE_1} The offending property is "${key}", typed "${type}".`);
    }
  }

  // Non-vacuity: the classifier is exercised on the rule's own boundary rather
  // than trusted to have looked at anything.
  assert.ok(STRING_LITERAL_UNION.test("'customer' | 'worker'"), 'a literal union no longer classifies');
  assert.ok(!STRING_LITERAL_UNION.test('string'), 'a bare string classifies as a literal union');
  assert.ok(
    seen.number > 0 && seen.boolean > 0 && seen.literal > 0,
    `the scan classified nothing (${JSON.stringify(seen)}) — check it`
  );
  assert.equal(
    seen.exception,
    1,
    "'category: string' is the ONE permitted exception and must appear exactly once"
  );
});

// ---------------------------------------------------------------------------
// RULE 2 — nothing PII-shaped is passed to a call site.
// ---------------------------------------------------------------------------

/**
 * Matched against the NAME of every identifier, member-expression segment and
 * object key inside a track() argument list. Names, not values: a value this
 * scan cannot see is exactly why the union in rule 1 has no free-text type.
 */
const PII_SHAPED = /title|descript|address|location|message|body|email|phone|street|note/i;

function piiWords(argument) {
  return (argument.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []).filter((word) =>
    PII_SHAPED.test(word)
  );
}

const RULE_2 =
  'THE RULE: nothing PII-shaped may be passed to track(). A name matching ' +
  'title / descript / address / location / message / body / email / phone / street / note ' +
  'is refused at the call site even when the union would accept its type, because the ' +
  'union checks the SHAPE of a property and this checks what is being poured into it. ' +
  'If the funnel needs to know something about one of these, send a boolean or a count ' +
  'derived from it, never the value.';

test('RULE 2 · no track() call passes anything PII-shaped', () => {
  const offenders = [];
  for (const file of FILES) {
    for (const argument of trackCalls(strip(read(file)))) {
      for (const word of piiWords(argument)) {
        offenders.push(`${file}: track(...) carries "${word}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], RULE_2);

  // Non-vacuity: the detector is exercised on a call it MUST refuse and one it
  // must not, so this rule cannot pass because the scan found nothing to read.
  assert.deepEqual(piiWords("{ name: 'job_posted', title: input.title }"), ['title', 'title']);
  assert.deepEqual(piiWords("{ name: 'job_posted', category: input.category }"), []);
});

// ---------------------------------------------------------------------------
// RULE 3 — the mutation layer owns emission.
// ---------------------------------------------------------------------------

const RULE_3 =
  'THE RULE: track() is called from lib/ and modes/ ONLY — from the function that wraps ' +
  'the write, on its success branch, one call site per state change. Never from a screen ' +
  'or a component. A screen double-counts the moment two screens can trigger the same ' +
  'mutation, and misses every path that does not go through a screen at all. If a surface ' +
  'needs to emit something no lib/ function owns, give the write a home in lib/ first — ' +
  'do not add the call where the tap is.';

test('RULE 3 · track() is called only from lib/ and modes/', () => {
  const strays = [];
  for (const file of FILES) {
    if (file.startsWith('lib/') || file.startsWith('modes/')) continue;
    if (trackCalls(strip(read(file))).length > 0) strays.push(file);
  }
  assert.deepEqual(strays, [], RULE_3);

  // Non-vacuity: the extractor finds a real call, ignores the declaration, and
  // is not fooled by a name that merely ends in "track".
  assert.deepEqual(trackCalls("track({ name: 'offer_accepted' });"), ["{ name: 'offer_accepted' }"]);
  assert.deepEqual(trackCalls('export function track(event: FunnelEvent): void {'), []);
  assert.deepEqual(trackCalls('backtrack(x); analytics.track(y);'), []);
  assert.deepEqual(
    trackCalls("track({\n  name: 'job_completed',\n  hasEvidencePhoto: (a ?? 0) > 0,\n});"),
    ["{\n  name: 'job_completed',\n  hasEvidencePhoto: (a ?? 0) > 0,\n}"]
  );
});
