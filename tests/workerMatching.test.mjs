import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const workerSearch = read('lib/workerSearch.ts');
const screen = read('screens/WorkerSearchScreen.tsx');

const RESULT_LIMIT = Number(workerSearch.match(/WORKER_RESULT_LIMIT = (\d+);/)[1]);

// Lean v1 (ruling 50) removed semantic worker search: D5 took it out of the
// client, and D6 dropped the worker-search Edge Function, match_workers_semantic()
// and the rest of the worker_semantic_* SQL. The ranking-model, phase39/phase40
// and Edge Function tests that guarded it went with them; the deterministic
// matcher below is the one ranking left.

// ===========================================================================
// 9, 11, 12 · One ranking, an honest empty state, no service key
// ===========================================================================

test('9 · the client ranks one way only, and the Edge Function is gone', () => {
  assert.doesNotMatch(workerSearch, /functions\.invoke|rankWorkersOnServer|withTimeout/);
  assert.equal(
    (workerSearch.match(/export async function findWorkers/g) ?? []).length,
    1,
    'there must be exactly one deterministic matcher'
  );
  assert.ok(
    !existsSync(join(root, 'supabase/functions/worker-search')),
    'lean D6 deleted the worker-search Edge Function'
  );
});

test('11 · a true no-match still shows', () => {
  // "No workers matched" is the deterministic matcher's own empty answer, and
  // the screen still has to show it. The wording lives in the lib so it can
  // name the applied category; the unfiltered wording is still exactly what it was.
  assert.match(screen, /title=\{emptyResultTitle\(appliedCategoryLabel\)\}/);
  assert.match(workerSearch, /: 'No workers matched';/);
});

test('12 · the client search path holds no service-role credential', () => {
  for (const file of ['lib/workerSearch.ts', 'screens/WorkerSearchScreen.tsx', 'lib/supabase.ts']) {
    assert.doesNotMatch(
      read(file),
      /SERVICE_ROLE|service_role/,
      `${file} must not reference a service-role credential`
    );
  }
});

// ===========================================================================
// 13 · Wording
// ===========================================================================

test('13 · the heading counts what is shown, never claims "best", and names its filter', () => {
  // Mirrors resultHeading(); the literals it depends on are asserted below.
  // Lean D5: one deterministic ranking, so the "best" qualifier (claimed only
  // when server ranking ran) left with the server ranking.
  const heading = (count, categoryLabel) => {
    const base =
      count >= RESULT_LIMIT
        ? `Top ${RESULT_LIMIT} matches`
        : `${count} ${count === 1 ? 'match' : 'matches'}`;
    return categoryLabel ? `${base} · ${categoryLabel}` : base;
  };

  assert.equal(heading(5), '5 matches');
  assert.equal(heading(1), '1 match');
  assert.equal(heading(RESULT_LIMIT), `Top ${RESULT_LIMIT} matches`);

  // A filtered search names its filter, in every shape the heading has.
  const LABEL = 'Dog Walking/Pet Care';
  assert.equal(heading(3, LABEL), `3 matches · ${LABEL}`);
  assert.equal(heading(1, LABEL), `1 match · ${LABEL}`);
  assert.equal(heading(RESULT_LIMIT, LABEL), `Top ${RESULT_LIMIT} matches · ${LABEL}`);

  // ...and an unlabelled call still returns exactly what it always returned,
  // so the unfiltered wording cannot drift in behind the label.
  for (const count of [5, 1, RESULT_LIMIT]) {
    assert.equal(heading(count, undefined), heading(count));
  }

  assert.match(
    workerSearch,
    /export function resultHeading\(count: number, categoryLabel\?: string\): string/
  );
  const headingFn = workerSearch.slice(
    workerSearch.indexOf('export function resultHeading'),
    workerSearch.indexOf('export function emptyResultTitle')
  );
  assert.match(headingFn, /\? `Top \$\{WORKER_RESULT_LIMIT\} matches`/);
  assert.match(headingFn, /: `\$\{count\} \$\{count === 1 \? 'match' : 'matches'\}`;/);
  assert.match(headingFn, /return categoryLabel \? `\$\{base\} · \$\{categoryLabel\}` : base;/);
  assert.doesNotMatch(headingFn, /'best '|best match/);

  // The empty state is worded in the same place, for the same reason: an
  // empty result that does not name its filter is the one most likely to be
  // read as a fault rather than an answer.
  const emptyTitle = (categoryLabel) =>
    categoryLabel ? `No ${categoryLabel} workers matched` : 'No workers matched';
  assert.equal(emptyTitle(), 'No workers matched');
  assert.equal(emptyTitle(LABEL), `No ${LABEL} workers matched`);
  assert.match(
    workerSearch,
    /export function emptyResultTitle\(categoryLabel\?: string\): string/
  );
  assert.match(
    workerSearch,
    /return categoryLabel \? `No \$\{categoryLabel\} workers matched` : 'No workers matched';/
  );

  // The screen must not be able to word either of these itself.
  assert.match(screen, /resultHeading\(state\.matches\.length, appliedCategoryLabel\)/);
  assert.match(screen, /title=\{emptyResultTitle\(appliedCategoryLabel\)\}/);
  // And the label it hands over is only ever the pinned chip's: a category the
  // typed text merely implied is never announced as one the customer chose.
  assert.match(
    screen,
    /const appliedCategoryLabel = pinnedCategory\s*\?\s*skillCategoryLabel\(pinnedCategory\)\s*:\s*undefined;/
  );
  assert.doesNotMatch(screen, /Top \$\{?WORKER_RESULT_LIMIT/);
  assert.doesNotMatch(screen, /\bAI\b|semantic|machine learning/i);
});

test('result explanations only ever restate stored evidence', () => {
  const reasonBlock = workerSearch.slice(workerSearch.indexOf('export function matchReasonText'));

  // Every claim in the PDF's "do not say" list.
  assert.doesNotMatch(reasonBlock, /\bexpert\b|available now|best in\b|top rated|highly rated/i);

  // Lean D5: the server-derived "related" and "similar work" wordings left
  // with server ranking; the one sentence left is a count worker_job_stats()
  // actually returned, so it cannot quote a client's job title.
  assert.match(reasonBlock, /const count = match\.completedInCategory;/);
  assert.match(reasonBlock, /return `\$\{count\} similar \$\{count === 1 \? 'job' : 'jobs'\} completed`;/);
  assert.doesNotMatch(reasonBlock, /Completed \$\{count\} related|Matched similar/);
});

test('the deterministic matcher is unchanged and is the only ranking', () => {
  // Same two candidate reads, same aggregate RPC, same exclusion.
  assert.match(workerSearch, /rpc\('worker_job_stats'/);
  assert.match(workerSearch, /\.overlaps\('categories', searchedCategories\)/);
  assert.match(workerSearch, /profile\.id === excludeUserId/);

  // No fabricated relevance in the score.
  const score = workerSearch.slice(
    workerSearch.indexOf('function scoreMatch'),
    workerSearch.indexOf('function sanitizeForFilter')
  );
  assert.doesNotMatch(score, /relevance/);
  // (Lean D5: the chip-without-text embedding guard left with server ranking.)
});

// ===========================================================================
// Free-text interpretation (interpretQuery)
// ===========================================================================
// interpretQuery turns what the customer typed on Home into service
// categories. It is pure, but it lives in a module that constructs the
// Supabase client at import time, and this suite has no build step to import
// TypeScript through — so these guard the properties of the matcher at the
// source level, the same way every other assertion in this file does.
//
// The behaviour they stand in for was verified directly against the compiled
// module: single intent, multi-intent ("sink leaking AND yard mowed" ->
// handyman + yard_work), transposition typos ("leakign", "cleanning"), and
// that pure noise returns nothing.

test('free-text interpretation scores each typed word once per category', () => {
  // Per-KEYWORD counting let one typed word score twice for the same category
  // ("cleaning" hitting both 'clean' and 'cleaning') and handed every category
  // with a long keyword list an advantage unrelated to the request. The fix is
  // a best-match-per-token inner loop, so the shape has to stay this way.
  assert.match(workerSearch, /for \(const token of tokens\) \{\s*\n\s*let best = 0;/);
  assert.match(workerSearch, /if \(weight > best\) best = weight;/);
  assert.match(workerSearch, /score \+= best;/);
});

test('ambiguous keywords are priced down by how many categories share them', () => {
  // A word filed under three categories must not carry the weight of one filed
  // under exactly one. Derived from the map rather than a hand-kept table, so
  // adding a keyword automatically re-prices everything that shares it.
  assert.match(workerSearch, /KEYWORD_BREADTH/);
  assert.match(workerSearch, /quality \/ \(KEYWORD_BREADTH\.get\(keyword\) \?\? 1\)/);
});

test('typo tolerance counts a transposition as one edit and stays bounded', () => {
  // Damerau, not plain Levenshtein: transposition is the most common real
  // typing error and plain Levenshtein prices it the same as two unrelated
  // substitutions.
  assert.match(workerSearch, /a\[i - 1\] === b\[j - 2\] && a\[i - 2\] === b\[j - 1\]/);

  // The budget is what keeps genuinely different words apart. "leaking" and
  // "cleaning" are two edits apart, as are "washing" and "walking" — allowing
  // two edits below nine characters matched all of them to each other.
  assert.match(
    workerSearch,
    /token\.length >= 9 \? 2 : token\.length >= 5 \? 1 : 0/
  );
});

test('free-text interpretation ignores filler and needs a real signal', () => {
  // Without a stopword list, "the"/"and"/"need" become fuzzy-match fodder.
  assert.match(workerSearch, /const STOPWORDS = new Set\(\[/);
  assert.match(workerSearch, /!STOPWORDS\.has\(token\)/);

  // And a lone weak fuzzy hit must not be enough to surface a category.
  assert.match(workerSearch, /MIN_CATEGORY_SCORE/);
  assert.match(workerSearch, /if \(score >= MIN_CATEGORY_SCORE\)/);
});

test('multi-word service phrases outrank their individual words', () => {
  // "pressure"/"washing" each drift; "pressure washing" does not. The phrase
  // pass is what stops "wall" (painting) beating "wall mount" (tv_mounting).
  assert.match(workerSearch, /const CATEGORY_PHRASES: Record<string, string\[\]>/);
  assert.match(workerSearch, /if \(normalized\.includes\(phrase\)\) score \+= PHRASE_SCORE;/);
  assert.ok(
    workerSearch.includes("'pressure washing'") && workerSearch.includes("'junk removal'"),
    'expected the phrase table to cover the services the Other sheet offers'
  );
});

test('free-text interpretation still returns at most three categories', () => {
  // The contract callers rely on: best first, capped, and an empty list when
  // nothing matched (which means "search by name", not "no results").
  assert.match(workerSearch, /\.slice\(0, 3\)\s*\n\s*\.map\(\(s\) => s\.key\);/);
});
