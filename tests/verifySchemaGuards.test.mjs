import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// These imports ARE the side-effect contract's proof. Since F-003 the module
// promises: importing scripts/verify-schema.mjs reads no env, constructs no
// request, opens no network and never exits — everything effectful lives in
// main() behind an isMain guard. This suite runs offline under `npm test`;
// if the module ever regains a top-level side effect, this file is what
// fails first. (envParity.test.mjs predates the contract and still slices
// the source; that remains valid, but direct import is the stronger pin.)
import {
  EXIT,
  envParityProblems,
  productionRefusalProblems,
  classifyRevokedResponse,
  resolveExitCode,
} from '../scripts/verify-schema.mjs';
// The refs come from the one shared definition. Never retype either literal:
// supabase-ref.mjs owns them, and a second copy is how gates drift.
import { PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the production ref is refused wherever it resolves (F-003)', () => {
  // Via the app URL — the mis-pointed .env that F-003 is about.
  const viaUrl = productionRefusalProblems({
    appRef: PRODUCTION_REF,
    keyRef: null,
    toolingRef: null,
  });
  assert.equal(viaUrl.length, 1, 'a production SUPABASE_URL must be refused');
  assert.match(viaUrl[0], /PRODUCTION/);
  assert.match(viaUrl[0], /SUPABASE_URL/);

  // Via the key alone — parity would catch the mismatch too, but the refusal
  // must not depend on parity running.
  const viaKey = productionRefusalProblems({
    appRef: null,
    keyRef: PRODUCTION_REF,
    toolingRef: null,
  });
  assert.equal(viaKey.length, 1, 'a production-ref key must be refused');
  assert.match(viaKey[0], /SUPABASE_KEY/);

  // Via the tooling connection string.
  const viaTooling = productionRefusalProblems({
    appRef: null,
    keyRef: null,
    toolingRef: PRODUCTION_REF,
  });
  assert.equal(viaTooling.length, 1, 'a production tooling ref must be refused');
  assert.match(viaTooling[0], /SUPABASE_DB_URL_STAGING/);

  // All three at once — internally CONSISTENT, so envParityProblems sees no
  // problem at all. This is exactly the hole the refusal closes.
  const allProduction = {
    appRef: PRODUCTION_REF,
    keyRef: PRODUCTION_REF,
    toolingRef: PRODUCTION_REF,
  };
  assert.deepEqual(envParityProblems(allProduction), [], 'parity alone cannot catch this');
  assert.equal(productionRefusalProblems(allProduction).length, 3);
});

test('the staging ref is accepted by that same logic', () => {
  const allStaging = {
    appRef: STAGING_REF,
    keyRef: STAGING_REF,
    toolingRef: STAGING_REF,
  };
  assert.deepEqual(productionRefusalProblems(allStaging), []);
  // …and the full staging shape passes parity too, so the guard cannot be
  // "green" only because the run died earlier for an unrelated reason.
  assert.deepEqual(envParityProblems(allStaging), []);
  // An unresolved ref is parity's problem, never a refusal.
  assert.deepEqual(
    productionRefusalProblems({ appRef: null, keyRef: null, toolingRef: null }),
    []
  );
});

test('a PENDING sentinel fails the run, distinctly from MISSING (F-006)', () => {
  assert.equal(resolveExitCode({ missing: 0, pending: 0 }), EXIT.ok);
  assert.equal(EXIT.ok, 0);

  const pendingOnly = resolveExitCode({ missing: 0, pending: 3 });
  assert.notEqual(pendingOnly, 0, 'an unmigrated database must not exit 0');
  assert.equal(pendingOnly, EXIT.pending);

  const missingOnly = resolveExitCode({ missing: 2, pending: 0 });
  assert.equal(missingOnly, EXIT.missing);
  assert.notEqual(
    pendingOnly,
    missingOnly,
    '"not applied yet" and "applied wrong" must be distinguishable from the exit alone'
  );

  // Both red: missing wins the code (the stronger claim); pending still
  // failed the run, just not the code contest.
  assert.equal(resolveExitCode({ missing: 1, pending: 5 }), EXIT.missing);

  // No code collides with the pre-existing meanings: 2 = missing env /
  // control-probe failure, 3 = parity failure — plus 4 = production refused.
  assert.equal(EXIT.env, 2);
  assert.equal(EXIT.parity, 3);
  assert.equal(EXIT.production, 4);
  assert.equal(new Set(Object.values(EXIT)).size, 6, 'every exit code means one thing');
  assert.ok(Object.isFrozen(EXIT));
});

test('checkColumnRevoked verdict: only a denial passes (F-006)', () => {
  // 403 — the PostgREST shape for "permission denied" under an anon JWT —
  // and body code 42501 each prove the revoke, matching checkRpcDenied.
  assert.equal(
    classifyRevokedResponse({ status: 403, code: '42501', message: 'permission denied' }, 'payments', 'id').ok,
    true
  );
  assert.equal(classifyRevokedResponse({ status: 403 }, 'payments', 'id').ok, true);

  // 404 "table does not exist" is BROKEN, not secured. payments is one of
  // the 23 assertions that used to read this as a pass.
  const missingTable = classifyRevokedResponse(
    { status: 404, code: 'PGRST205', message: "Could not find the table 'public.payments'" },
    'payments',
    'id'
  );
  assert.equal(missingTable.ok, false, 'a missing table must fail the revoked check');
  assert.match(missingTable.detail, /table missing, not denied/);

  // A missing COLUMN is absence too, not a revoke.
  const missingColumn = classifyRevokedResponse(
    { status: 400, code: '42703', message: 'column payments.id does not exist' },
    'payments',
    'id'
  );
  assert.equal(missingColumn.ok, false);
  assert.match(missingColumn.detail, /column missing, not denied/);

  // Readable is the original failure the check exists for.
  const readable = classifyRevokedResponse({ status: 200 }, 'profiles', 'phone');
  assert.equal(readable.ok, false);
  assert.match(readable.detail, /still readable/);

  // Allow-list: any shape that is neither the denial nor a recognized
  // absence fails with the status and code named, never guessed at.
  const weird = classifyRevokedResponse({ status: 500, code: 'XX000', message: 'boom' }, 'payments', 'id');
  assert.equal(weird.ok, false);
  assert.match(weird.detail, /neither denied nor missing/);
});

test('the refusal provably precedes any request construction or probe', async () => {
  const src = await read('scripts/verify-schema.mjs');
  const mainStart = src.indexOf('async function main()');
  assert.ok(mainStart > 0, 'the runner must live in main()');
  const body = src.slice(mainStart);

  const gate = body.indexOf('productionRefusalProblems({');
  const refuse = body.indexOf('process.exit(EXIT.production)');
  const headersBuilt = body.indexOf('headers = {');
  const firstProbe = body.indexOf('await checkColumn(');
  for (const [name, index] of [
    ['refusal gate', gate],
    ['refusal exit', refuse],
    ['headers assignment', headersBuilt],
    ['control probe', firstProbe],
  ]) {
    assert.ok(index > 0, `${name} not found inside main()`);
  }
  assert.ok(gate < refuse, 'the gate must be evaluated before it can exit');
  assert.ok(
    refuse < headersBuilt,
    'the refusal must exit before the request headers are even constructed'
  );
  assert.ok(headersBuilt < firstProbe, 'no probe may run before headers exist');

  // Nothing outside main() may read .env or open the network: the module's
  // only readFileSync call and only fetch call-sites live in function bodies,
  // and the top level awaits nothing but the guarded main().
  const topLevelAwaits = [...src.matchAll(/^await .+$/gm)].map((m) => m[0]);
  assert.deepEqual(topLevelAwaits, [], 'no top-level await may remain');
  assert.match(src, /if \(isMain\) \{\s*await main\(\);\s*\}/);

  // The extractions are not decorative: the running probe consumes
  // classifyRevokedResponse, and the running exit goes through
  // resolveExitCode.
  assert.match(src, /async function checkColumnRevoked[\s\S]{0,500}?return classifyRevokedResponse\(/);
  assert.match(src, /process\.exit\(resolveExitCode\(\{ missing, pending \}\)\)/);
});
