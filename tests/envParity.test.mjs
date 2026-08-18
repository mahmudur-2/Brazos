import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// The parity decision EXECUTED, not just pattern-matched. verify-schema.mjs
// cannot be imported whole — its top level reads .env and probes the live
// database, which a test must never do — so the pure exported function is
// sliced out of the source verbatim and executed on its own. A replacer
// function is unnecessary here (no string replacement at all).
const parityModule = (async () => {
  const src = await read('scripts/verify-schema.mjs');
  const start = src.indexOf('export function envParityProblems');
  assert.ok(start > 0, 'envParityProblems must be exported from verify-schema.mjs');
  const end = src.indexOf('\n}', start);
  assert.ok(end > start, 'envParityProblems must close');
  return import(toDataUrl(src.slice(start, end + 2)));
})();

test('matching refs pass, with and without a tooling ref', async () => {
  const { envParityProblems } = await parityModule;

  assert.deepEqual(
    envParityProblems({ appRef: 'stagingref', keyRef: 'stagingref', toolingRef: 'stagingref' }),
    []
  );
});

test('mismatched refs fail, naming both sides', async () => {
  const { envParityProblems } = await parityModule;

  const keyMismatch = envParityProblems({
    appRef: 'stagingref',
    keyRef: 'otherref',
    toolingRef: 'stagingref',
  });
  assert.equal(keyMismatch.length, 1);
  assert.match(keyMismatch[0], /otherref/);
  assert.match(keyMismatch[0], /stagingref/);

  const toolingMismatch = envParityProblems({
    appRef: 'stagingref',
    keyRef: 'stagingref',
    toolingRef: 'otherref',
  });
  assert.equal(toolingMismatch.length, 1);
  assert.match(toolingMismatch[0], /SQL proofs\/migrations target otherref/);
});

test('an unresolvable key ref is a PROBLEM, not a skip', async () => {
  const { envParityProblems } = await parityModule;

  const problems = envParityProblems({
    appRef: 'stagingref',
    keyRef: null,
    toolingRef: 'stagingref',
  });
  assert.equal(problems.length, 1);
  // The message must name the likely cause and the remedy, so the operator
  // reading "ENV PARITY FAILED" knows what to change without archaeology.
  assert.match(problems[0], /sb_/);
  assert.match(problems[0], /eyJ/);
  assert.match(problems[0], /cannot be proven/);
});

test('a recognized publishable key continues — the URL ref is authoritative', async () => {
  const { envParityProblems } = await parityModule;

  // No ref to compare is BY DESIGN for this format: not a parity failure.
  assert.deepEqual(
    envParityProblems({
      appRef: 'stagingref',
      keyRef: null,
      keyIsPublishable: true,
      toolingRef: 'stagingref',
    }),
    []
  );

  // …and the running script prints the exact URL-authoritative note.
  const src = await read('scripts/verify-schema.mjs');
  assert.match(src, /key format carries no ref; URL ref is authoritative/);

  // A publishable key does not excuse a broken URL.
  const broken = envParityProblems({
    appRef: null,
    keyRef: null,
    keyIsPublishable: true,
    toolingRef: null,
  });
  assert.equal(broken.length, 1);
  assert.match(broken[0], /SUPABASE_URL/);
});

test('a missing tooling ref still warns rather than fails', async () => {
  const { envParityProblems } = await parityModule;

  // No problem from the function — the app-side comparison stands on its own…
  assert.deepEqual(
    envParityProblems({ appRef: 'stagingref', keyRef: 'stagingref', toolingRef: null })
  , []);

  // …and the script still prints the warning on its own path, outside the
  // refusal list.
  const src = await read('scripts/verify-schema.mjs');
  assert.match(src, /WARNING: SUPABASE_DB_URL_STAGING is not set/);
});

test('the inline gate actually consumes the extracted decision', async () => {
  const src = await read('scripts/verify-schema.mjs');

  // The extraction must not be decorative: the running gate builds its
  // problem list from the exported function, and no inline skip-shaped key
  // comparison survives.
  assert.match(src, /const problems = envParityProblems\(\{\s*appRef,\s*keyRef,\s*keyIsPublishable: kind === 'publishable',\s*toolingRef,\s*\}\);/);
  assert.doesNotMatch(src, /if \(keyRef && appRef && keyRef !== appRef\)/);

  // The parsers stay the shared implementation — refFromJwt and the keyKind
  // classifier both come from supabase-ref.mjs (the EAS pre-install gate
  // shares them, so the two gates cannot disagree on what a key format is).
  assert.match(
    src,
    /import \{ keyKind, refFromRestUrl, refFromPgUrl, refFromJwt \} from '\.\/supabase-ref\.mjs';/
  );
  const refs = await read('scripts/supabase-ref.mjs');
  assert.match(refs, /export function refFromJwt\(k\) \{/);
  assert.match(refs, /export function keyKind\(k\) \{/);
});
